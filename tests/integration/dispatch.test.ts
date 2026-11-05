import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking/service";
import { setTestMapsProvider, type MapsProvider } from "@/lib/maps/provider";
import { geocodeMissing, loadDispatchDay, planTechnicianRoute, saveManualOrder } from "@/lib/routing/dispatch";
import { localMinuteToUtc } from "@/lib/time";
import { createTechnician, resetDb, seedBasics } from "../helpers/db";

const DAY = "2026-11-16";
const NOW = new Date("2026-11-10T12:00:00Z");
const at = (m: number) => localMinuteToUtc(DAY, m);

const fake: MapsProvider = {
  name: "google",
  async geocode(address) {
    return address.includes("Far") ? { lat: 40.9, lng: -81.9 } : { lat: 40.5, lng: -81.45 };
  },
  async matrix(points) {
    // 10 minutes and 8 km between any two different points; 90 minutes to/from the "far" point
    return {
      durationsSec: points.map((a) => points.map((b) => (a === b ? 0 : a.lat === 40.9 || b.lat === 40.9 ? 5400 : 600))),
      distancesMeters: points.map((a) => points.map((b) => (a === b ? 0 : 8000))),
    };
  },
};

let serviceId: string;
beforeEach(async () => {
  await resetDb();
  serviceId = (await seedBasics()).service.id;
});
afterEach(() => setTestMapsProvider(undefined));

async function book(line1: string, startMin: number) {
  return createBooking({
    serviceId,
    startsAt: at(startMin),
    customer: { firstName: "R", lastName: line1, email: `${line1.replace(/\W/g, "")}@example.com` },
    address: { line1, city: "Dover", state: "OH", postalCode: "44622" },
    bookedForSelf: true,
    acceptedTerms: true,
    statusOverride: "CONFIRMED",
    now: NOW,
  });
}

describe("dispatch", () => {
  it("manual mode produces no travel estimates and keeps appointment times", async () => {
    setTestMapsProvider(null);
    const tech = await createTechnician();
    await book("1 Near St", 660);
    await book("2 Near St", 540);
    const day = await loadDispatchDay(DAY);
    const r = await planTechnicianRoute({ technicianId: tech.id, dateKey: DAY, appointments: day.appointments, useProvider: true, save: true });
    expect(r.provider).toBeNull();
    expect(r.result.totalDriveSec).toBeNull();
    const plan = await prisma.routePlan.findFirstOrThrow();
    expect(plan.provider).toBe("manual");
    expect(plan.totalDistanceMeters).toBeNull();
    const appts = await prisma.appointment.findMany({ orderBy: { startsAt: "asc" } });
    expect(r.result.order).toEqual(appts.map((a) => a.id));
    expect(appts[0].startsAt.toISOString()).toBe(at(540).toISOString());
  });

  it("with a provider, geocodes, calculates mileage, flags unreachable connections, and never moves confirmed times", async () => {
    setTestMapsProvider(fake);
    const tech = await createTechnician();
    const a = await book("1 Near St", 540); // 9:00-10:00, blocks until 10:30
    const b = await book("99 Far Rd", 630); // 10:30 start, 90 min drive away -> late
    const day = await loadDispatchDay(DAY);
    const g = await geocodeMissing(day.appointments.map((x) => x.addressId!));
    expect(g.geocoded).toBe(2);
    const day2 = await loadDispatchDay(DAY);
    const r = await planTechnicianRoute({ technicianId: tech.id, dateKey: DAY, appointments: day2.appointments, useProvider: true, save: true });
    expect(r.provider).toBe("google");
    expect(r.result.totalDistanceMeters).toBe(8000);
    expect(r.result.feasible).toBe(false);
    expect(r.result.stops[1].lateMin).toBe(60);
    const moved = await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } });
    expect(moved.startsAt.toISOString()).toBe(at(630).toISOString());
    expect(r.result.order).toEqual([a.appointmentId, b.appointmentId]);
  });

  it("manual override order is respected on recalculation", async () => {
    setTestMapsProvider(null);
    const tech = await createTechnician();
    const a = await book("1 Near St", 540);
    const b = await book("2 Near St", 660);
    await saveManualOrder(tech.id, DAY, [b.appointmentId, a.appointmentId]);
    const day = await loadDispatchDay(DAY);
    const r = await planTechnicianRoute({ technicianId: tech.id, dateKey: DAY, appointments: day.appointments, useProvider: true, save: false });
    expect(r.isManualOverride).toBe(true);
    expect(r.result.order).toEqual([b.appointmentId, a.appointmentId]);
  });
});
