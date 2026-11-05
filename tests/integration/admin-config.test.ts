import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getSettings, settingsDefaults } from "@/lib/settings";
import { AdminError, toActionState, type Actor } from "@/lib/admin/common";
import { removeService, saveDiscount, saveService, saveServiceArea, type ServiceInput } from "@/lib/admin/services";
import { changeUserRole, createStaffUser, forceSignOut, setUserActive } from "@/lib/admin/users";
import { createBlackout, createTechnicianWithUser, parseScheduleForm, saveWeeklySchedule, scheduleWindowProblems } from "@/lib/admin/technicians";
import { saveSettingsSection, settingsFromForm } from "@/lib/admin/settings";
import { resetTemplate, sendTestEmail, updateTemplate } from "@/lib/admin/templates";
import { logCommunication, retryJob } from "@/lib/admin/communications";
import { localMinuteToUtc } from "@/lib/time";
import { createCustomer, createTechnician, createUser, resetDb, seedBasics } from "../helpers/db";

let owner: Actor;
let serviceId: string;

beforeEach(async () => {
  await resetDb();
  const { service } = await seedBasics();
  serviceId = service.id;
  const u = await createUser("OWNER");
  owner = { id: u.id, role: u.role };
});

afterAll(async () => {
  await prisma.$disconnect();
});

function serviceInput(overrides: Partial<Record<keyof ServiceInput, unknown>> = {}): Record<string, unknown> {
  return {
    slug: "standard",
    name: "Standard In-Home Support",
    categoryId: "",
    shortDescription: "Help at home",
    description: "x",
    pricingType: "FIXED",
    price: "109.50",
    durationMinutes: "60",
    extensionMinutes: "30",
    extensionPrice: "40",
    isRemote: "",
    isActive: "on",
    isBookableOnline: "on",
    requiresApproval: "on",
    memberDiscountEligible: "on",
    sortOrder: "0",
    ...overrides,
  };
}

describe("services", () => {
  it("persists a price edit in cents and writes an audit entry", async () => {
    await saveService(owner, serviceInput({ price: "$109.50" }), serviceId);
    const s = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    expect(s.basePriceCents).toBe(10950);
    expect(s.extensionPriceCents).toBe(4000);
    expect(s.isRemote).toBe(false);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "service.update", entityId: serviceId } });
    expect(log.actorUserId).toBe(owner.id);
  });

  it("rejects negative or invalid prices and bad slugs without changing the service", async () => {
    await expect(saveService(owner, serviceInput({ price: "-5" }), serviceId)).rejects.toThrow(/Price/);
    await expect(saveService(owner, serviceInput({ price: "abc" }), serviceId)).rejects.toBeInstanceOf(AdminError);
    await expect(saveService(owner, serviceInput({ price: "1.999" }), serviceId)).rejects.toBeInstanceOf(AdminError);
    await expect(saveService(owner, serviceInput({ slug: "Bad Slug!" }), serviceId)).rejects.toThrow(/Slug/);
    await expect(saveService(owner, serviceInput({ durationMinutes: "0" }), serviceId)).rejects.toThrow(/Duration/);
    await expect(saveService(owner, serviceInput({ extensionPrice: "" }), serviceId)).rejects.toThrow(/extension/i);
    const s = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    expect(s.basePriceCents).toBe(9900);
  });

  it("returns field errors through toActionState", async () => {
    const r = await toActionState(async () => {
      await saveService(owner, serviceInput({ price: "-1" }), serviceId);
      return "ok";
    });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.price).toMatch(/\$0 or more/);
  });

  it("deactivates instead of deleting a service referenced by appointments", async () => {
    const customer = await createCustomer();
    const start = localMinuteToUtc("2026-12-01", 600);
    const end = localMinuteToUtc("2026-12-01", 660);
    await prisma.appointment.create({
      data: { reference: "TEST01", customerId: customer.id, serviceId, startsAt: start, endsAt: end, blockStartsAt: start, blockEndsAt: end, status: "CANCELED" },
    });
    expect(await removeService(owner, serviceId)).toBe("deactivated");
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).isActive).toBe(false);
    const fresh = await saveService(owner, serviceInput({ slug: "fresh-one" }));
    expect(await removeService(owner, fresh.id)).toBe("deleted");
  });

  it("denies non-managers even when called directly", async () => {
    const d = await createUser("DISPATCHER");
    await expect(saveService({ id: d.id, role: d.role }, serviceInput(), serviceId)).rejects.toThrow(/permission/);
  });

  it("validates service area ZIP codes", async () => {
    const base = { name: "Holmes", county: "Holmes", state: "oh", communities: "Millersburg, Berlin", travelFee: "15", isActive: "on" };
    await expect(saveServiceArea(owner, { ...base, postalCodes: "44654 4465 abcde" })).rejects.toThrow(/not 5 digits/);
    const area = await saveServiceArea(owner, { ...base, postalCodes: "44654, 44610 44654" });
    expect(area.postalCodes).toEqual(["44654", "44610"]);
    expect(area.state).toBe("OH");
    expect(area.travelFeeCents).toBe(1500);
  });
});

describe("discounts", () => {
  const base = { name: "Veterans", code: "vets-10", type: "PERCENT", value: "10", serviceId: "", startDate: "", endDate: "", maxUses: "", isActive: "on" };

  it("accepts valid percent and fixed discounts", async () => {
    const pct = await saveDiscount(owner, base);
    expect(pct.code).toBe("VETS-10");
    expect(pct.value).toBe(10);
    const fixed = await saveDiscount(owner, { ...base, code: "", type: "FIXED", value: "$15.50", serviceId, startDate: "2026-12-01", endDate: "2026-12-31", maxUses: "20" });
    expect(fixed.value).toBe(1550);
    expect(fixed.code).toBeNull();
    expect(fixed.maxUses).toBe(20);
    expect(fixed.endsAt!.getTime()).toBeGreaterThan(fixed.startsAt!.getTime());
  });

  it("rejects out-of-range percents, non-positive fixed amounts, bad codes and reversed dates", async () => {
    await expect(saveDiscount(owner, { ...base, value: "0" })).rejects.toThrow(/1 to 100/);
    await expect(saveDiscount(owner, { ...base, value: "101" })).rejects.toThrow(/1 to 100/);
    await expect(saveDiscount(owner, { ...base, value: "12.5" })).rejects.toThrow(/1 to 100/);
    await expect(saveDiscount(owner, { ...base, type: "FIXED", value: "0" })).rejects.toThrow(/greater than \$0/);
    await expect(saveDiscount(owner, { ...base, type: "FIXED", value: "-3" })).rejects.toThrow(/greater than \$0/);
    await expect(saveDiscount(owner, { ...base, code: "has space" })).rejects.toThrow(/Code/);
    await expect(saveDiscount(owner, { ...base, startDate: "2026-12-10", endDate: "2026-12-01" })).rejects.toThrow(/End date/);
    await expect(saveDiscount(owner, { ...base, maxUses: "0" })).rejects.toThrow(/Maximum uses/);
    await saveDiscount(owner, base);
    await expect(saveDiscount(owner, { ...base, name: "Dup" })).rejects.toThrow(/already uses that code/);
    expect(await prisma.discount.count()).toBe(1);
  });
});

describe("users and roles", () => {
  it("cannot demote or deactivate the last active owner", async () => {
    const other = await createUser("OWNER");
    // Two owners: demoting one is allowed.
    await changeUserRole(owner, other.id, "ADMIN");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).role).toBe("ADMIN");
    // Promote back, then make `owner` the only active owner by deactivating the other.
    await changeUserRole(owner, other.id, "OWNER");
    await setUserActive(owner, other.id, false);
    // Acting as the deactivated owner (simulating a stale request) cannot remove the last active owner.
    const stale: Actor = { id: other.id, role: "OWNER" };
    await expect(changeUserRole(stale, owner.id, "ADMIN")).rejects.toThrow(/last active owner/);
    await expect(setUserActive(stale, owner.id, false)).rejects.toThrow(/last active owner/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).role).toBe("OWNER");
  });

  it("cannot change own role or deactivate self", async () => {
    await expect(changeUserRole(owner, owner.id, "ADMIN")).rejects.toThrow(/own role/);
    await expect(setUserActive(owner, owner.id, false)).rejects.toThrow(/own account/);
  });

  it("admins cannot manage users", async () => {
    const admin = await createUser("ADMIN");
    await expect(createStaffUser({ id: admin.id, role: "ADMIN" }, { name: "X", email: "x@example.com", role: "ADMIN" })).rejects.toThrow(/permission/);
  });

  it("creates a passwordless staff user; technicians get a Technician row", async () => {
    const u = await createStaffUser(owner, { name: "Terry Tech", email: "Terry@Example.com", phone: "", role: "TECHNICIAN" });
    expect(u.email).toBe("terry@example.com");
    expect(u.passwordHash).toBeNull();
    expect(await prisma.technician.count({ where: { userId: u.id } })).toBe(1);
    await expect(createStaffUser(owner, { name: "Dup", email: "terry@example.com", role: "ADMIN" })).rejects.toThrow(/already exists/);
    await expect(createStaffUser(owner, { name: "Cust", email: "c@example.com", role: "CUSTOMER" })).rejects.toThrow(/role/);
  });

  it("deactivating and force sign-out delete sessions", async () => {
    const d = await createUser("DISPATCHER");
    await prisma.session.createMany({ data: [1, 2].map((i) => ({ tokenHash: `h${i}-${d.id}`, userId: d.id, expiresAt: new Date(Date.now() + 3600_000) })) });
    expect(await forceSignOut(owner, d.id)).toBe(2);
    await prisma.session.create({ data: { tokenHash: `h3-${d.id}`, userId: d.id, expiresAt: new Date(Date.now() + 3600_000) } });
    await setUserActive(owner, d.id, false);
    expect(await prisma.session.count({ where: { userId: d.id } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.deactivate", entityId: d.id } });
    expect(log.metadata).toBeNull();
  });
});

describe("technician schedules and blackouts", () => {
  it("rejects overlapping, reversed and off-grid windows", () => {
    expect(scheduleWindowProblems([{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }, { dayOfWeek: 1, startMinute: 780, endMinute: 1020 }])).toEqual([]);
    expect(scheduleWindowProblems([{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }, { dayOfWeek: 1, startMinute: 720, endMinute: 900 }])).toEqual([]); // touching is fine
    expect(scheduleWindowProblems([{ dayOfWeek: 1, startMinute: 540, endMinute: 780 }, { dayOfWeek: 1, startMinute: 720, endMinute: 900 }]).join()).toMatch(/overlap/);
    expect(scheduleWindowProblems([{ dayOfWeek: 2, startMinute: 600, endMinute: 540 }]).join()).toMatch(/before the end/);
    expect(scheduleWindowProblems([{ dayOfWeek: 2, startMinute: 545, endMinute: 600 }]).join()).toMatch(/15-minute/);
  });

  it("saves valid windows and refuses overlaps without changing the schedule", async () => {
    const tech = await createTechnician();
    await expect(
      saveWeeklySchedule(owner, tech.id, parseScheduleForm({ w_1_0_start: "09:00", w_1_0_end: "13:00", w_1_1_start: "12:00", w_1_1_end: "17:00" })),
    ).rejects.toThrow(/overlap/);
    expect(await prisma.technicianSchedule.count({ where: { technicianId: tech.id } })).toBe(6);
    await saveWeeklySchedule(owner, tech.id, parseScheduleForm({ w_1_0_start: "09:00", w_1_0_end: "12:00", w_1_1_start: "13:00", w_1_1_end: "17:00", w_2_0_start: "", w_2_0_end: "" }));
    const rows = await prisma.technicianSchedule.findMany({ where: { technicianId: tech.id }, orderBy: { startMinute: "asc" } });
    expect(rows.map((r) => [r.dayOfWeek, r.startMinute, r.endMinute])).toEqual([
      [1, 540, 720],
      [1, 780, 1020],
    ]);
    expect(() => parseScheduleForm({ w_3_0_start: "09:00", w_3_0_end: "" })).toThrow(/both/);
  });

  it("creates a technician user without a password", async () => {
    const t = await createTechnicianWithUser(owner, { name: "Sam Rivers", email: "sam@example.com", displayName: "Sam R.", color: "#336699", homeBaseLine: "", isActive: "on" });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: t.userId } });
    expect(u.role).toBe("TECHNICIAN");
    expect(u.passwordHash).toBeNull();
    await expect(createTechnicianWithUser(owner, { name: "X", email: "sam@example.com", displayName: "X", color: "#000000" })).rejects.toThrow(/already exists/);
  });

  it("warns about (but does not move) appointments overlapping a new closure", async () => {
    const tech = await createTechnician();
    const customer = await createCustomer();
    const start = localMinuteToUtc("2026-12-02", 600);
    const end = localMinuteToUtc("2026-12-02", 660);
    const appt = await prisma.appointment.create({
      data: { reference: "OVER01", customerId: customer.id, serviceId, technicianId: tech.id, startsAt: start, endsAt: end, blockStartsAt: start, blockEndsAt: end, status: "CONFIRMED" },
    });
    const { blackout, conflicts } = await createBlackout(owner, { technicianId: null, type: "HOLIDAY", allDay: "on", startDate: "2026-12-02", endDate: "", reason: "Closed" });
    expect(conflicts.map((c) => c.id)).toEqual([appt.id]);
    expect(blackout.startsAt.toISOString()).toBe("2026-12-02T05:00:00.000Z");
    expect(blackout.endsAt.toISOString()).toBe("2026-12-03T05:00:00.000Z");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).startsAt.getTime()).toBe(start.getTime());
    await expect(createBlackout(owner, { technicianId: null, type: "TIME_OFF", allDay: "on", startDate: "2026-12-05" })).rejects.toThrow(/Business-wide/);
    await expect(createBlackout(owner, { technicianId: tech.id, type: "TIME_OFF", allDay: "", startDate: "2026-12-05", startTime: "13:00", endTime: "09:00" })).rejects.toThrow(/after the start/);
  });
});

describe("settings", () => {
  it("saves valid values and rejects invalid ones", async () => {
    const form = { minNoticeHours: "48", maxDaysAhead: "90", slotIntervalMinutes: "15", travelBufferMinutes: "20", remoteBufferMinutes: "5", requireApprovalByDefault: "on" };
    await saveSettingsSection(owner, "booking", settingsFromForm("booking", form));
    const saved = await getSettings("booking");
    expect(saved).toMatchObject({ minNoticeHours: 48, maxDaysAhead: 90, slotIntervalMinutes: 15, requireApprovalByDefault: true, allowOutOfAreaRequests: false });

    await expect(saveSettingsSection(owner, "booking", settingsFromForm("booking", { ...form, maxDaysAhead: "0" }))).rejects.toThrow(/Maximum days ahead must be at least 1/);
    await expect(saveSettingsSection(owner, "booking", settingsFromForm("booking", { ...form, minNoticeHours: "abc" }))).rejects.toThrow(/Minimum notice/);
    await expect(saveSettingsSection(owner, "booking", settingsFromForm("booking", { ...form, travelBufferMinutes: "" }))).rejects.toThrow(/Travel buffer/);
    await expect(saveSettingsSection(owner, "billing", settingsFromForm("billing", { invoiceDueDays: "14", taxRatePercent: "30", defaultTravelFeeCents: "0", depositPercent: "0" }))).rejects.toThrow(/Tax rate/);
    await expect(saveSettingsSection(owner, "privacy", { communicationRetentionDays: 5, auditRetentionDays: 365, jobRetentionDays: 30 })).rejects.toThrow(/Communication retention/);
    expect((await getSettings("booking")).maxDaysAhead).toBe(90);
  });

  it("converts dollars to cents and validates business fields and hours", async () => {
    await saveSettingsSection(owner, "cancellation", settingsFromForm("cancellation", { freeCancellationHours: "24", lateCancellationFeeCents: "25.00", allowOnlineReschedule: "on", policyText: "P" }));
    expect((await getSettings("cancellation")).lateCancellationFeeCents).toBe(2500);
    const biz = { ...settingsDefaults.business, showAddressPublicly: "", name: "Kindred" } as Record<string, unknown>;
    await expect(saveSettingsSection(owner, "business", settingsFromForm("business", { ...biz, timeZone: "Mars/Olympus" } as Record<string, string>))).rejects.toThrow(/Time zone/);
    await expect(saveSettingsSection(owner, "business", settingsFromForm("business", { ...biz, email: "nope" } as Record<string, string>))).rejects.toThrow(/Email/);
    await expect(saveSettingsSection(owner, "business", settingsFromForm("business", { ...biz, name: "" } as Record<string, string>))).rejects.toThrow(/Business name/);
    await expect(saveSettingsSection(owner, "hours", settingsFromForm("hours", { d1_open: "on", d1_start: "17:00", d1_end: "09:00" }))).rejects.toThrow(/Business hours|Monday/);
    await saveSettingsSection(owner, "hours", settingsFromForm("hours", { d1_open: "on", d1_start: "08:30", d1_end: "16:00" }));
    const hours = await getSettings("hours");
    expect(hours.days[1]).toEqual({ open: true, startMinute: 510, endMinute: 960 });
    expect(hours.days[0].open).toBe(false);
  });

  it("dispatchers cannot save settings", async () => {
    const d = await createUser("DISPATCHER");
    await expect(saveSettingsSection({ id: d.id, role: d.role }, "billing", settingsDefaults.billing)).rejects.toThrow(/permission/);
  });
});

describe("email templates and communications", () => {
  it("test send records a SKIPPED communication with the reason when email is not configured", async () => {
    const r = await sendTestEmail(owner, "booking_received", "Admin@Example.com");
    expect(r.queued).toBe(true);
    expect(r.decision.allowed).toBe(false);
    expect(r.decision.reason).toMatch(/not configured/);
    expect(r.status).toBe("SKIPPED");
    const comm = await prisma.communication.findUniqueOrThrow({ where: { id: r.communicationId! } });
    expect(comm.status).toBe("SKIPPED");
    expect(comm.statusReason).toMatch(/RESEND_API_KEY/);
    expect(comm.toAddress).toBe("admin@example.com");
    expect(comm.subject).toContain("KT7Q4M");
    expect(comm.idempotencyKey).toMatch(/^template-test:booking_received:admin@example.com:\d+$/);
    const job = await prisma.job.findFirstOrThrow({ where: { type: "email.send" } });
    expect(job.status).toBe("SUCCEEDED");
    await expect(sendTestEmail(owner, "booking_received", "not-an-email")).rejects.toBeInstanceOf(AdminError);
  });

  it("edits validate and reset restores the default", async () => {
    const t = await prisma.emailTemplate.findUniqueOrThrow({ where: { key: "booking_received" } });
    await expect(updateTemplate(owner, t.id, { subject: "", body: "x", isActive: "on" })).rejects.toThrow(/Subject/);
    await expect(updateTemplate(owner, t.id, { subject: "a\nb", body: "x", isActive: "on" })).rejects.toThrow(/single line/);
    await updateTemplate(owner, t.id, { subject: "Changed", body: "Hi {{customerName}}", isActive: "" });
    expect((await prisma.emailTemplate.findUniqueOrThrow({ where: { id: t.id } })).isActive).toBe(false);
    const reset = await resetTemplate(owner, t.id);
    expect(reset.subject).toBe(t.subject);
    expect(reset.body).toBe(t.body);
  });

  it("logs a phone call and retries a dead job", async () => {
    const customer = await createCustomer();
    const c = await logCommunication(owner, { customerId: customer.id, channel: "PHONE", direction: "INBOUND", subject: "Called to reschedule", body: "Wants Thursday" });
    expect(c.status).toBe("LOGGED");
    await expect(logCommunication(owner, { customerId: "", channel: "PHONE", subject: "x" })).rejects.toThrow(/customer/);
    await expect(logCommunication(owner, { customerId: customer.id, channel: "EMAIL", subject: "x" })).rejects.toThrow(/phone call or note/);
    const job = await prisma.job.create({ data: { type: "email.send", payload: {}, status: "DEAD", attempts: 5, lastError: "boom", runAt: new Date(Date.now() + 3600_000) } });
    await retryJob(owner, job.id);
    const j = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(j).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(j.runAt.getTime()).toBeLessThanOrEqual(Date.now());
    await expect(retryJob(owner, job.id)).rejects.toThrow(/Only failed or dead/);
  });
});
