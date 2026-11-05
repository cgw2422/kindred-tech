import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { BookingError, changeAppointmentStatus, createBooking, getAvailability, rescheduleAppointment, type BookingRequest } from "@/lib/booking/service";
import { localMinuteToUtc } from "@/lib/time";
import { createTechnician, resetDb, seedBasics } from "../helpers/db";

// Monday 2026-11-16, far enough ahead of "now" used below
const DAY = "2026-11-16";
const NOW = new Date("2026-11-10T12:00:00Z");
const at = (min: number) => localMinuteToUtc(DAY, min);

let serviceId: string;
let remoteId: string;

function req(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    serviceId,
    startsAt: at(600),
    customer: { firstName: "Ann", lastName: "Test", email: `ann-${Math.random()}@example.com`, phone: "330-555-0199" },
    address: { line1: "1 Main St", city: "Dover", state: "OH", postalCode: "44622" },
    bookedForSelf: true,
    acceptedTerms: true,
    now: NOW,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
  const { service, remote } = await seedBasics();
  serviceId = service.id;
  remoteId = remote.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("booking", () => {
  it("creates a requested appointment with a reserved technician, consent record and queued email", async () => {
    const tech = await createTechnician();
    const r = await createBooking(req());
    expect(r.status).toBe("REQUESTED");
    expect(r.inServiceArea).toBe(true);
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: r.appointmentId } });
    expect(appt.technicianId).toBe(tech.id);
    expect(appt.blockEndsAt.getTime() - appt.endsAt.getTime()).toBe(30 * 60_000);
    expect(appt.estimatedTotalCents).toBe(9900);
    expect(await prisma.consentRecord.count({ where: { customerId: r.customerId, type: "TERMS_ACCEPTED" } })).toBe(1);
    const comm = await prisma.communication.findFirst({ where: { relatedId: r.appointmentId } });
    expect(comm?.status).toBe("QUEUED");
    expect(await prisma.job.count({ where: { type: "email.send" } })).toBeGreaterThan(0);
  });

  it("prevents double booking the same technician (sequential)", async () => {
    await createTechnician();
    await createBooking(req());
    await expect(createBooking(req())).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    // Overlap within the travel buffer is also rejected (10:00-11:00 + 30m buffer -> 11:00 start not allowed)
    await expect(createBooking(req({ startsAt: at(660) }))).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    // After the buffer is fine
    await expect(createBooking(req({ startsAt: at(690) }))).resolves.toBeTruthy();
  });

  it("prevents double booking under concurrency", async () => {
    await createTechnician();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => createBooking(req())));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect((r.reason as BookingError).code).toBe("SLOT_TAKEN");
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("assigns a second technician when the first is busy", async () => {
    const t1 = await createTechnician("One");
    const t2 = await createTechnician("Two");
    const a = await createBooking(req());
    const b = await createBooking(req());
    const techs = (await prisma.appointment.findMany({ where: { id: { in: [a.appointmentId, b.appointmentId] } } })).map((x) => x.technicianId).sort();
    expect(techs).toEqual([t1.id, t2.id].sort());
    await expect(createBooking(req())).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("the database constraint rejects overlapping writes even if application checks are bypassed", async () => {
    const tech = await createTechnician();
    const r = await createBooking(req());
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: r.appointmentId } });
    await expect(
      prisma.appointment.create({
        data: {
          reference: "RAWX01",
          customerId: appt.customerId,
          serviceId,
          technicianId: tech.id,
          startsAt: appt.startsAt,
          endsAt: appt.endsAt,
          blockStartsAt: appt.blockStartsAt,
          blockEndsAt: appt.blockEndsAt,
        },
      }),
    ).rejects.toThrow();
  });

  it("frees the slot after cancellation", async () => {
    await createTechnician();
    const r = await createBooking(req());
    await changeAppointmentStatus({ appointmentId: r.appointmentId, to: "CANCELED", actor: { id: null, role: "ADMIN" }, cancelReason: "test" });
    await expect(createBooking(req())).resolves.toBeTruthy();
  });

  it("rejects bookings outside business hours, with too little notice, or on blackout dates", async () => {
    await createTechnician();
    await expect(createBooking(req({ startsAt: at(17 * 60) }))).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    await expect(createBooking(req({ startsAt: at(600), now: new Date(at(600).getTime() - 3600_000) }))).rejects.toMatchObject({ code: "NOTICE" });
    await prisma.blackout.create({ data: { type: "HOLIDAY", startsAt: at(0), endsAt: at(1440), reason: "Holiday" } });
    await expect(createBooking(req())).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("flags out-of-area addresses for review instead of confirming", async () => {
    await createTechnician();
    const r = await createBooking(req({ address: { line1: "9 Far Rd", city: "Columbus", state: "OH", postalCode: "43215" } }));
    expect(r.inServiceArea).toBe(false);
    expect(r.status).toBe("REQUESTED");
  });

  it("records a family member as a limited authorized contact", async () => {
    await createTechnician();
    const r = await createBooking(
      req({ bookedForSelf: false, requester: { name: "Dana Daughter", email: "dana@example.com", relationship: "Daughter", canPay: true, receiveUpdates: true } }),
    );
    const fc = await prisma.familyContact.findFirstOrThrow({ where: { customerId: r.customerId } });
    expect(fc.canPay).toBe(true);
    expect(fc.canSchedule).toBe(true);
    expect(fc.canViewServiceDetails).toBe(false);
  });

  it("does not require an address for remote services and uses the shorter buffer", async () => {
    await createTechnician();
    const r = await createBooking(req({ serviceId: remoteId, address: null }));
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: r.appointmentId } });
    expect(appt.blockEndsAt.getTime() - appt.endsAt.getTime()).toBe(10 * 60_000);
  });

  it("availability excludes booked slots and Tech Help Days", async () => {
    const tech = await createTechnician();
    await createBooking(req());
    const facility = await prisma.facility.create({ data: { name: "F" } });
    await prisma.techHelpDay.create({ data: { facilityId: facility.id, technicianId: tech.id, startsAt: at(13 * 60), endsAt: at(15 * 60) } });
    const [day] = await getAvailability({ serviceId, fromDateKey: DAY, days: 1, now: NOW });
    const starts = day.slots.map((s) => s.startsAt.getTime());
    expect(starts).not.toContain(at(600).getTime());
    expect(starts).not.toContain(at(13 * 60).getTime());
    expect(starts).not.toContain(at(15 * 60).getTime()); // travel buffer after help day
    expect(starts).toContain(at(15 * 60 + 30).getTime());
  });

  it("reschedules into a free slot and rejects a taken one", async () => {
    await createTechnician();
    const a = await createBooking(req());
    await createBooking(req({ startsAt: at(14 * 60) }));
    await expect(rescheduleAppointment({ appointmentId: a.appointmentId, startsAt: at(14 * 60), actor: { id: null, role: "ADMIN" } })).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    await rescheduleAppointment({ appointmentId: a.appointmentId, startsAt: at(11 * 60 + 30), actor: { id: null, role: "ADMIN" } });
    const moved = await prisma.appointment.findUniqueOrThrow({ where: { id: a.appointmentId } });
    expect(moved.startsAt.toISOString()).toBe(at(11 * 60 + 30).toISOString());
  });

  it("enforces status transitions and technician ownership", async () => {
    const tech = await createTechnician();
    const other = await createTechnician("Other");
    const r = await createBooking(req());
    await expect(changeAppointmentStatus({ appointmentId: r.appointmentId, to: "COMPLETED", actor: { id: null, role: "ADMIN" } })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await changeAppointmentStatus({ appointmentId: r.appointmentId, to: "CONFIRMED", actor: { id: null, role: "ADMIN" } });
    await expect(
      changeAppointmentStatus({ appointmentId: r.appointmentId, to: "EN_ROUTE", actor: { id: null, role: "TECHNICIAN" }, technicianId: other.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: r.appointmentId } });
    await changeAppointmentStatus({ appointmentId: r.appointmentId, to: "EN_ROUTE", actor: { id: null, role: "TECHNICIAN" }, technicianId: appt.technicianId! });
    expect(appt.technicianId).toBe(tech.id);
    const history = await prisma.appointmentStatusChange.findMany({ where: { appointmentId: r.appointmentId } });
    expect(history.map((h) => h.toStatus)).toEqual(["REQUESTED", "CONFIRMED", "EN_ROUTE"]);
  });
});
