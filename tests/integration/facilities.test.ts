import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { localMinuteToUtc, zonedParts } from "@/lib/time";
import {
  bookHelpDaySlot,
  cancelHelpDay,
  createHelpDay,
  createHelpDaySeries,
  getPublicHelpDay,
  type BookHelpDaySlotInput,
} from "@/lib/facilities/help-days";
import { createMonthlyContractInvoice, createSponsoredHelpDayInvoice } from "@/lib/facilities/billing";
import { convertInquiryToFacility, inviteContactToPortal } from "@/lib/facilities/facilities";
import { queueRenewalReminders } from "@/lib/facilities/renewals";
import {
  createPortalSessionRequest,
  getPortalContext,
  getPortalDashboard,
  getPortalMaterials,
  getPortalUsage,
  listPortalAgreements,
  listPortalHelpDays,
  listPortalInvoices,
  listPortalSessionRequests,
  requestPortalPayLink,
} from "@/lib/facilities/portal";
import { issueInvoice } from "@/lib/billing/invoices";
import { createTechnician, createUser, resetDb, seedBasics } from "../helpers/db";

const TZ = "America/New_York";
const NOW = new Date("2026-11-05T15:00:00Z");
// Tuesday 2026-11-17, 1:00-3:00 PM local
const DAY = "2026-11-17";
const at = (min: number, day = DAY) => localMinuteToUtc(day, min, TZ);

async function createFacility(name = "Maple Grove", extra: { residentRateCents?: number } = {}) {
  return prisma.facility.create({
    data: { name, line1: "10 Maple Way", city: "Dover", state: "OH", postalCode: "44622", partnershipStatus: "ACTIVE", residentRateCents: extra.residentRateCents ?? null },
  });
}

async function insertAppointment(params: { technicianId: string; startsAt: Date; minutes: number; serviceId: string }) {
  const cust = await prisma.customer.create({ data: { firstName: "Other", lastName: "Client" } });
  return prisma.appointment.create({
    data: {
      reference: `R${Math.random().toString(36).slice(2, 8)}`,
      status: "CONFIRMED",
      customerId: cust.id,
      serviceId: params.serviceId,
      technicianId: params.technicianId,
      startsAt: params.startsAt,
      endsAt: new Date(params.startsAt.getTime() + params.minutes * 60_000),
      blockStartsAt: params.startsAt,
      blockEndsAt: new Date(params.startsAt.getTime() + (params.minutes + 30) * 60_000),
    },
  });
}

function slotReq(helpDayId: string, startsAt: Date, overrides: Partial<BookHelpDaySlotInput> = {}): BookHelpDaySlotInput {
  return {
    helpDayId,
    startsAt,
    resident: { firstName: "Ruth", lastName: `Resident${Math.random().toString(36).slice(2, 6)}`, unit: "12B", phone: "330-555-0100" },
    problemDescription: "Help with my tablet",
    acceptedTerms: true,
    channel: "PUBLIC",
    now: NOW,
    ...overrides,
  };
}

let serviceId: string;

beforeEach(async () => {
  await resetDb();
  const { service } = await seedBasics();
  serviceId = service.id;
  await prisma.service.create({
    data: { slug: "tech-help-day-resident-session", name: "Tech Help Day Resident Session", shortDescription: "x", description: "x", basePriceCents: 4900, durationMinutes: 30, isBookableOnline: false },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("help day series", () => {
  it("generates weekly occurrences at the same local time across the DST change", async () => {
    const tech = await createTechnician();
    const fac = await createFacility();
    const r = await createHelpDaySeries({
      facilityId: fac.id,
      technicianId: tech.id,
      frequency: "WEEKLY",
      dayOfWeek: 2,
      startDateKey: "2026-10-20",
      count: 4,
      startMinute: 600,
      durationMinutes: 120,
      now: new Date("2026-10-01T12:00:00Z"),
    });
    expect(r.skipped).toEqual([]);
    expect(r.created.map((c) => c.dateKey)).toEqual(["2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10"]);
    const days = await prisma.techHelpDay.findMany({ where: { seriesId: r.series.id }, orderBy: { startsAt: "asc" } });
    expect(days).toHaveLength(4);
    for (const d of days) expect(zonedParts(d.startsAt, TZ).hour).toBe(10);
    expect(days[1].startsAt.toISOString()).toBe("2026-10-27T14:00:00.000Z"); // EDT
    expect(days[2].startsAt.toISOString()).toBe("2026-11-03T15:00:00.000Z"); // EST
  });

  it("generates monthly nth-weekday occurrences and reports (not moves) conflicting dates", async () => {
    const tech = await createTechnician();
    const fac = await createFacility();
    // Conflict on the 2nd Tuesday of December, and a technician blackout in January.
    await insertAppointment({ technicianId: tech.id, startsAt: at(660, "2026-12-08"), minutes: 60, serviceId });
    await prisma.blackout.create({ data: { technicianId: tech.id, type: "TIME_OFF", startsAt: at(0, "2027-01-12"), endsAt: at(1439, "2027-01-12") } });
    const r = await createHelpDaySeries({
      facilityId: fac.id,
      technicianId: tech.id,
      frequency: "MONTHLY_NTH_WEEKDAY",
      dayOfWeek: 2,
      weekOfMonth: 2,
      startDateKey: "2026-11-01",
      untilDateKey: "2027-03-31",
      startMinute: 600,
      durationMinutes: 180,
      now: NOW,
    });
    expect(r.created.map((c) => c.dateKey)).toEqual(["2026-11-10", "2027-02-09", "2027-03-09"]);
    expect(r.skipped.map((s) => s.dateKey)).toEqual(["2026-12-08", "2027-01-12"]);
    expect(r.skipped[0].reason).toMatch(/Appointment/);
    // All occurrences keep 10:00 local time.
    for (const c of r.created) expect(zonedParts(c.startsAt, TZ).hour).toBe(10);
  });

  it("skips dates outside the technician's working schedule", async () => {
    const tech = await createTechnician(); // Mon-Sat 9-17
    const fac = await createFacility();
    const r = await createHelpDaySeries({
      facilityId: fac.id,
      technicianId: tech.id,
      frequency: "WEEKLY",
      dayOfWeek: 0, // Sunday
      startDateKey: "2026-11-08",
      count: 2,
      startMinute: 600,
      durationMinutes: 60,
      now: NOW,
    });
    expect(r.created).toHaveLength(0);
    expect(r.skipped).toHaveLength(2);
  });
});

describe("help day creation", () => {
  it("rejects technician conflicts with appointments and other help days", async () => {
    const tech = await createTechnician();
    const other = await createTechnician("Other");
    const fac = await createFacility();
    await insertAppointment({ technicianId: tech.id, startsAt: at(780), minutes: 60, serviceId });
    const base = { facilityId: fac.id, dateKey: DAY, startMinute: 720, durationMinutes: 180, now: NOW };
    await expect(createHelpDay({ ...base, technicianId: tech.id })).rejects.toMatchObject({ code: "TECH_CONFLICT" });
    // Appointment ending (with buffer) before the help day is fine: 9:00-10:00 +30 buffer, help day 10:30
    await expect(createHelpDay({ ...base, dateKey: "2026-11-18", technicianId: tech.id, startMinute: 600 })).resolves.toBeTruthy();

    const ok = await createHelpDay({ ...base, technicianId: other.id });
    expect(ok.technicianId).toBe(other.id);
    // Overlapping help day for the same technician
    await expect(createHelpDay({ ...base, technicianId: other.id, startMinute: 840 })).rejects.toMatchObject({ code: "TECH_CONFLICT" });
    // Outside working hours unless explicitly allowed
    await expect(createHelpDay({ ...base, dateKey: "2026-11-19", technicianId: other.id, startMinute: 960 })).rejects.toMatchObject({ code: "TECH_CONFLICT" });
    await expect(
      createHelpDay({ ...base, dateKey: "2026-11-19", technicianId: other.id, startMinute: 960, allowOutsideSchedule: true }),
    ).resolves.toBeTruthy();
  });
});

describe("resident slot booking", () => {
  async function setup(extra: Partial<Parameters<typeof createHelpDay>[0]> = {}) {
    const tech = await createTechnician();
    const fac = await createFacility("Maple Grove", { residentRateCents: 4500 });
    const day = await createHelpDay({ facilityId: fac.id, technicianId: tech.id, dateKey: DAY, startMinute: 780, durationMinutes: 120, slotMinutes: 30, now: NOW, ...extra });
    return { tech, fac, day };
  }

  it("books a slot as a FACILITY_DAY appointment and prevents double booking", async () => {
    const { tech, fac, day } = await setup();
    const r = await bookHelpDaySlot(slotReq(day.id, at(780)));
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: r.appointmentId }, include: { customer: true } });
    expect(appt).toMatchObject({ source: "FACILITY_DAY", techHelpDayId: day.id, facilityId: fac.id, technicianId: tech.id, status: "CONFIRMED" });
    expect(appt.customer.facilityId).toBe(fac.id);
    expect(appt.customer.facilityUnit).toBe("12B");
    expect(r.priceCents).toBe(4500); // facility resident rate
    await expect(bookHelpDaySlot(slotReq(day.id, at(780)))).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    const pub = await getPublicHelpDay(day.id, NOW);
    expect(pub!.slots.map((s) => s.available)).toEqual([false, true, true, true]);
    expect(JSON.stringify(pub)).not.toContain(appt.customer.lastName);
  });

  it("allows only one of several concurrent attempts for the same slot", async () => {
    const { day } = await setup();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => bookHelpDaySlot(slotReq(day.id, at(810)))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "SLOT_TAKEN" });
    expect(await prisma.appointment.count({ where: { techHelpDayId: day.id, status: { not: "CANCELED" } } })).toBe(1);
  });

  it("rejects slots outside the grid, past slots and canceled days", async () => {
    const { day } = await setup({ slotBufferMinutes: 10 });
    // Grid with 30 min slots + 10 min buffer: 13:00, 13:40, 14:20 (15:00 end)
    await expect(bookHelpDaySlot(slotReq(day.id, at(795)))).rejects.toMatchObject({ code: "SLOT_INVALID" });
    await expect(bookHelpDaySlot(slotReq(day.id, at(810)))).rejects.toMatchObject({ code: "SLOT_INVALID" });
    await expect(bookHelpDaySlot(slotReq(day.id, at(750)))).rejects.toMatchObject({ code: "SLOT_INVALID" });
    await expect(bookHelpDaySlot(slotReq(day.id, at(860)))).resolves.toBeTruthy();
    await expect(bookHelpDaySlot(slotReq(day.id, at(820), { now: new Date("2026-11-17T20:00:00Z") }))).rejects.toMatchObject({ code: "SLOT_INVALID" });
    await expect(bookHelpDaySlot(slotReq(day.id, at(820), { acceptedTerms: false }))).rejects.toMatchObject({ code: "TERMS" });
    await cancelHelpDay(day.id, { cancelResidentAppointments: true });
    await expect(bookHelpDaySlot(slotReq(day.id, at(780)))).rejects.toMatchObject({ code: "NOT_BOOKABLE" });
  });

  it("sponsored help days cost residents nothing and invoice the facility once", async () => {
    const { day } = await setup({ paymentModel: "FACILITY_SPONSORED", sponsoredPriceCents: 60000 });
    const r = await bookHelpDaySlot(slotReq(day.id, at(780)));
    expect(r.priceCents).toBe(0);
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: r.appointmentId } });
    expect(appt.estimatedTotalCents).toBe(0);
    const pub = await getPublicHelpDay(day.id, NOW);
    expect(pub!.priceCents).toBe(0);

    const inv1 = await createSponsoredHelpDayInvoice(day.id);
    expect(inv1.created).toBe(true);
    expect(inv1.invoice.totalCents).toBe(60000);
    expect(inv1.invoice.facilityId).toBe(day.facilityId);
    expect(inv1.invoice.customerId).toBeNull();
    const inv2 = await createSponsoredHelpDayInvoice(day.id);
    expect(inv2.created).toBe(false);
    expect(inv2.invoice.id).toBe(inv1.invoice.id);
  });

  it("uses the help day's resident price when set", async () => {
    const { day } = await setup({ residentPriceCents: 3000 });
    const r = await bookHelpDaySlot(slotReq(day.id, at(780)));
    expect(r.priceCents).toBe(3000);
  });

  it("canceling a day with bookings requires confirmation and cancels residents with history", async () => {
    const { day } = await setup();
    const r = await bookHelpDaySlot(slotReq(day.id, at(780), { resident: { firstName: "Ann", lastName: "Email", email: "ann.res@example.com" } }));
    await expect(cancelHelpDay(day.id, { cancelResidentAppointments: false })).rejects.toMatchObject({ code: "NEEDS_CONFIRMATION" });
    const res = await cancelHelpDay(day.id, { cancelResidentAppointments: true, reason: "Weather" });
    expect(res.canceledAppointments).toBe(1);
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: r.appointmentId }, include: { statusChanges: true } });
    expect(appt.status).toBe("CANCELED");
    expect(appt.statusChanges.some((s) => s.toStatus === "CANCELED")).toBe(true);
    expect(await prisma.communication.count({ where: { relatedId: r.appointmentId, templateKey: "appointment_canceled" } })).toBe(1);
  });
});

describe("facility portal privacy", () => {
  it("returns only the contact's own facility and never resident details", async () => {
    const tech = await createTechnician();
    const facA = await createFacility("Facility A");
    const facB = await createFacility("Facility B");
    const userA = await createUser("FACILITY_CONTACT");
    const userB = await createUser("FACILITY_CONTACT");
    const userNoAccess = await createUser("FACILITY_CONTACT");
    await prisma.facilityContact.create({ data: { facilityId: facA.id, name: "Contact A", role: "ACTIVITIES_DIRECTOR", userId: userA.id, portalAccess: true } });
    await prisma.facilityContact.create({ data: { facilityId: facB.id, name: "Contact B", role: "PRIMARY", userId: userB.id, portalAccess: true, canViewInvoices: false } });
    await prisma.facilityContact.create({ data: { facilityId: facA.id, name: "No Access", userId: userNoAccess.id, portalAccess: false } });

    const dayA = await createHelpDay({ facilityId: facA.id, technicianId: tech.id, dateKey: DAY, startMinute: 780, durationMinutes: 120, now: NOW });
    const dayB = await createHelpDay({ facilityId: facB.id, technicianId: tech.id, dateKey: "2026-11-18", startMinute: 780, durationMinutes: 120, now: NOW });
    await bookHelpDaySlot(
      slotReq(dayA.id, at(780), {
        resident: { firstName: "Zelda", lastName: "Privateperson", unit: "77Q", phone: "330-555-0177", email: "zelda.private@example.com" },
        problemDescription: "SECRET-PROBLEM-TEXT",
        requester: { name: "Family Memberson", email: "family.memberson@example.com", relationship: "Son" },
      }),
    );
    // A completed session so usage has data
    const done = await bookHelpDaySlot(slotReq(dayA.id, at(810), { resident: { firstName: "Otto", lastName: "Hiddenname", unit: "1", phone: "330-555-0111" } }));
    await prisma.appointment.update({ where: { id: done.appointmentId }, data: { status: "COMPLETED" } });

    const invA = await prisma.invoice.create({ data: { number: "T-A-1", status: "OPEN", facilityId: facA.id, totalCents: 1000, issuedAt: NOW } });
    const invB = await prisma.invoice.create({ data: { number: "T-B-1", status: "OPEN", facilityId: facB.id, totalCents: 2000, issuedAt: NOW } });
    await prisma.facilityAgreement.create({ data: { facilityId: facA.id, model: "RESIDENT_PAID_DAY", status: "ACTIVE", terms: "A terms" } });
    await prisma.facilityAgreement.create({ data: { facilityId: facB.id, model: "RECURRING_CONTRACT", status: "ACTIVE", terms: "B terms" } });
    await createPortalSessionRequest(userB.id, { preferredDates: "B wants Mondays" });

    const ctxA = await getPortalContext(userA.id);
    expect(ctxA?.facility.id).toBe(facA.id);
    expect(await getPortalContext(userNoAccess.id)).toBeNull();
    await expect(getPortalDashboard(userNoAccess.id, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const results = [
      await getPortalDashboard(userA.id, NOW),
      await listPortalHelpDays(userA.id, NOW),
      await getPortalUsage(userA.id, new Date("2026-11-30T12:00:00Z")),
      await listPortalInvoices(userA.id),
      await listPortalAgreements(userA.id),
      await listPortalSessionRequests(userA.id),
      await getPortalMaterials(userA.id, NOW),
    ];
    const json = JSON.stringify(results);
    for (const secret of ["Zelda", "Privateperson", "77Q", "0177", "zelda.private", "SECRET-PROBLEM", "Memberson", "Otto", "Hiddenname", "0111", "Help with my tablet"]) {
      expect(json).not.toContain(secret);
    }
    // No other facility's data
    for (const other of [facB.id, dayB.id, invB.id, "T-B-1", "B terms", "B wants Mondays"]) expect(json).not.toContain(other);
    expect(json).toContain(dayA.id);
    expect(json).toContain("T-A-1");

    const hd = await listPortalHelpDays(userA.id, NOW);
    expect(hd.upcoming).toHaveLength(1);
    expect(hd.upcoming[0]).toMatchObject({ id: dayA.id, bookedSlots: 2, totalSlots: 4, openSlots: 2 });
    const usage = await getPortalUsage(userA.id, new Date("2026-11-30T12:00:00Z"));
    expect(usage.usage.totals).toMatchObject({ sessionsCompleted: 1, residentsServed: 1, serviceHours: 0.5 });
    expect(usage.usage.byMonth.find((m) => m.monthKey === "2026-11")).toMatchObject({ sessionsCompleted: 1, residentsServed: 1, helpDaysHeld: 1 });

    // Cross-facility access is denied
    await expect(requestPortalPayLink(userA.id, invB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listPortalInvoices(userB.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requestPortalPayLink(userB.id, invA.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const sessionsB = await listPortalSessionRequests(userB.id);
    expect(sessionsB.requests).toHaveLength(1);
    expect((await listPortalSessionRequests(userA.id)).requests).toHaveLength(0);
  });

  it("emails a pay link for the contact's own open invoice", async () => {
    const fac = await createFacility("Pay Facility");
    const user = await createUser("FACILITY_CONTACT");
    await prisma.facilityContact.create({ data: { facilityId: fac.id, name: "Bill Payer", role: "BILLING", email: "billing@example.com", userId: user.id, portalAccess: true } });
    const agreement = await prisma.facilityAgreement.create({ data: { facilityId: fac.id, model: "RECURRING_CONTRACT", status: "ACTIVE", monthlyFeeCents: 50000 } });
    const { invoice } = await createMonthlyContractInvoice(agreement.id, "2026-11");
    await issueInvoice(invoice.id, { sendEmail: false });
    const r = await requestPortalPayLink(user.id, invoice.id);
    expect(r.sentTo).toBe("billing@example.com");
    expect(await prisma.communication.count({ where: { relatedId: invoice.id, templateKey: "invoice_issued" } })).toBe(1);
  });
});

describe("facility billing and CRM", () => {
  it("monthly contract invoices are idempotent per month", async () => {
    const fac = await createFacility();
    const agreement = await prisma.facilityAgreement.create({
      data: { facilityId: fac.id, model: "RECURRING_CONTRACT", status: "ACTIVE", monthlyFeeCents: 75000, hoursPerMonth: 8 },
    });
    const results = await Promise.all([createMonthlyContractInvoice(agreement.id, "2026-11"), createMonthlyContractInvoice(agreement.id, "2026-11")]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results[0].invoice.id).toBe(results[1].invoice.id);
    const again = await createMonthlyContractInvoice(agreement.id, "2026-11");
    expect(again.created).toBe(false);
    expect(await prisma.invoice.count({ where: { facilityId: fac.id } })).toBe(1);
    expect(again.invoice.totalCents).toBe(75000);
    const dec = await createMonthlyContractInvoice(agreement.id, "2026-12");
    expect(dec.created).toBe(true);
    // A voided invoice can be re-created
    await prisma.invoice.update({ where: { id: dec.invoice.id }, data: { status: "VOID" } });
    expect((await createMonthlyContractInvoice(agreement.id, "2026-12")).created).toBe(true);
    await expect(createMonthlyContractInvoice(agreement.id, "2026-13")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("queues renewal reminders once per agreement and renewal date", async () => {
    const fac = await createFacility();
    await prisma.facilityContact.create({ data: { facilityId: fac.id, name: "Pat Primary", role: "PRIMARY", email: "pat@example.com" } });
    await prisma.facilityAgreement.create({ data: { facilityId: fac.id, model: "RECURRING_CONTRACT", status: "ACTIVE", renewalDate: new Date("2026-11-20T05:00:00Z") } });
    await prisma.facilityAgreement.create({ data: { facilityId: fac.id, model: "RECURRING_CONTRACT", status: "ACTIVE", renewalDate: new Date("2027-03-01T05:00:00Z") } });
    await prisma.facilityAgreement.create({ data: { facilityId: fac.id, model: "RECURRING_CONTRACT", status: "DRAFT", renewalDate: new Date("2026-11-20T05:00:00Z") } });
    expect(await queueRenewalReminders(NOW)).toMatchObject({ agreements: 1, queued: 1 });
    expect(await queueRenewalReminders(NOW)).toMatchObject({ agreements: 1, queued: 0 });
    expect(await prisma.communication.count({ where: { templateKey: "facility_contract_renewal" } })).toBe(1);
  });

  it("converts an inquiry into a facility with a primary contact, idempotently", async () => {
    const inq = await prisma.facilityInquiry.create({
      data: { facilityName: "Oak Commons", contactName: "Jamie Lee", contactTitle: "Director", email: "Jamie@Example.com", city: "Dover", residentCount: 80, interest: "Tech Help Day" },
    });
    const a = await convertInquiryToFacility(inq.id);
    const b = await convertInquiryToFacility(inq.id);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.facility.id).toBe(a.facility.id);
    const contacts = await prisma.facilityContact.findMany({ where: { facilityId: a.facility.id } });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ role: "PRIMARY", email: "jamie@example.com" });
    expect((await prisma.facilityInquiry.findUniqueOrThrow({ where: { id: inq.id } })).status).toBe("CONVERTED");
  });

  it("carries community type, state and preferred frequency from a proposal request into the facility", async () => {
    const inq = await prisma.facilityInquiry.create({
      data: { facilityName: "Maple Ridge", contactName: "Sam Ortiz", email: "sam@example.com", city: "Canton", state: "OH", communityType: "CCRC", visitFrequency: "MONTHLY" },
    });
    const { facility } = await convertInquiryToFacility(inq.id);
    expect(facility).toMatchObject({ type: "CONTINUING_CARE", state: "OH", city: "Canton" });
    expect(facility.internalNotes).toContain("Preferred visits: Monthly");
  });

  it("invites a contact to the portal by creating a FACILITY_CONTACT user", async () => {
    const fac = await createFacility();
    const c = await prisma.facilityContact.create({ data: { facilityId: fac.id, name: "Invitee", email: "invitee@example.com" } });
    const r = await inviteContactToPortal(c.id);
    expect(r.created).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "invitee@example.com" } });
    expect(user.role).toBe("FACILITY_CONTACT");
    const updated = await prisma.facilityContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(updated).toMatchObject({ userId: user.id, portalAccess: true });
    expect((await getPortalContext(user.id))?.facility.id).toBe(fac.id);
    expect((await inviteContactToPortal(c.id)).created).toBe(false);
  });
});
