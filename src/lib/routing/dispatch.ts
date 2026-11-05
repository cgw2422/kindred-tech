import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getSettings } from "../settings";
import { addDaysToKey, startOfDayUtc } from "../time";
import { formatAddressForMaps, getMapsProvider, type LatLng } from "../maps/provider";
import { suggestOrder, simulate, type RoutePlanResult, type RouteStop } from "./optimize";

const LOCKED_STATUSES = ["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"];

export async function loadDispatchDay(dateKey: string) {
  const biz = await getSettings("business");
  const start = startOfDayUtc(dateKey, biz.timeZone);
  const end = startOfDayUtc(addDaysToKey(dateKey, 1), biz.timeZone);
  const [appointments, technicians, plans, helpDays] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: start, lt: end }, status: { notIn: ["CANCELED", "NO_SHOW"] }, techHelpDayId: null },
      include: { customer: true, service: true, address: true, technician: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.technician.findMany({ where: { isActive: true }, orderBy: { displayName: "asc" } }),
    prisma.routePlan.findMany({ where: { date: dateKey } }),
    prisma.techHelpDay.findMany({ where: { startsAt: { gte: start, lt: end }, status: { not: "CANCELED" } }, include: { facility: true } }),
  ]);
  return { appointments, technicians, plans, helpDays, timeZone: biz.timeZone };
}

export type DispatchAppointment = Awaited<ReturnType<typeof loadDispatchDay>>["appointments"][number];

/** Geocodes addresses lacking coordinates. Returns counts. Requires a maps provider. */
export async function geocodeMissing(addressIds: string[]): Promise<{ geocoded: number; failed: number; provider: string | null }> {
  const provider = getMapsProvider();
  if (!provider) return { geocoded: 0, failed: 0, provider: null };
  const addresses = await prisma.address.findMany({ where: { id: { in: addressIds }, OR: [{ lat: null }, { lng: null }] } });
  let geocoded = 0;
  let failed = 0;
  for (const a of addresses) {
    try {
      const r = await provider.geocode(formatAddressForMaps(a));
      if (r) {
        await prisma.address.update({ where: { id: a.id }, data: { lat: r.lat, lng: r.lng, geocodedBy: provider.name } });
        geocoded++;
      } else failed++;
    } catch {
      failed++;
    }
  }
  return { geocoded, failed, provider: provider.name };
}

function stopFor(a: DispatchAppointment): RouteStop {
  const locked = LOCKED_STATUSES.includes(a.status);
  const dur = Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60000);
  return {
    id: a.id,
    earliest: a.startsAt.getTime(),
    // Unconfirmed requests are still shown at their requested time; we never move them automatically.
    latest: locked ? a.startsAt.getTime() : a.startsAt.getTime(),
    durationMin: dur,
    locked: true,
  };
}

export type TechRoute = {
  technicianId: string;
  result: RoutePlanResult;
  provider: string | null;
  missingCoordinates: number;
  savedOrder: string[] | null;
  isManualOverride: boolean;
};

/**
 * Builds the route for one technician on one day. Appointment times are fixed:
 * the planner orders stops by time and, with a provider, calculates drive time
 * between them and flags any tight connections. It never changes appointment times.
 */
export async function planTechnicianRoute(params: { technicianId: string; dateKey: string; appointments: DispatchAppointment[]; useProvider: boolean; save: boolean }): Promise<TechRoute> {
  const tech = await prisma.technician.findUniqueOrThrow({ where: { id: params.technicianId } });
  const booking = await getSettings("booking");
  const stopsAppts = params.appointments.filter((a) => a.technicianId === tech.id && !a.isRemote);
  const existing = await prisma.routePlan.findUnique({ where: { technicianId_date: { technicianId: tech.id, date: params.dateKey } } });
  const stops = stopsAppts.map(stopFor);
  const coords: (LatLng | null)[] = stopsAppts.map((a) => (a.address?.lat != null && a.address?.lng != null ? { lat: a.address.lat, lng: a.address.lng } : null));
  const start: LatLng | null = tech.homeBaseLat != null && tech.homeBaseLng != null ? { lat: tech.homeBaseLat, lng: tech.homeBaseLng } : null;
  const missing = coords.filter((c) => !c).length;
  const provider = params.useProvider ? getMapsProvider() : null;

  let matrix = null;
  if (provider && missing === 0 && stops.length > 0) {
    const points = [...(start ? [start] : []), ...(coords as LatLng[])];
    if (points.length >= 2) matrix = await provider.matrix(points);
  }
  const opts = { hasStart: Boolean(start) && Boolean(matrix), bufferMin: 0 };

  let result: RoutePlanResult;
  if (existing?.isManualOverride && existing.appointmentIds.every((id) => stops.some((s) => s.id === id)) && existing.appointmentIds.length === stops.length) {
    const order = existing.appointmentIds.map((id) => stops.findIndex((s) => s.id === id));
    result = simulate(stops, order, matrix, opts);
  } else {
    result = suggestOrder(stops, matrix, opts);
  }
  void booking;

  if (params.save && stops.length > 0) {
    const legs: Prisma.InputJsonValue = result.stops.map((s) => ({ id: s.id, arrival: s.arrival, lateMin: s.lateMin }));
    await prisma.routePlan.upsert({
      where: { technicianId_date: { technicianId: tech.id, date: params.dateKey } },
      create: {
        technicianId: tech.id,
        date: params.dateKey,
        appointmentIds: result.order,
        provider: matrix ? provider!.name : "manual",
        totalDistanceMeters: result.totalDistanceMeters,
        totalDurationSeconds: result.totalDriveSec,
        legs,
      },
      update: {
        appointmentIds: result.order,
        provider: matrix ? provider!.name : (existing?.provider ?? "manual"),
        totalDistanceMeters: result.totalDistanceMeters ?? (matrix ? null : existing?.totalDistanceMeters),
        totalDurationSeconds: result.totalDriveSec ?? (matrix ? null : existing?.totalDurationSeconds),
        legs,
      },
    });
    await Promise.all(result.order.map((id, i) => prisma.appointment.update({ where: { id }, data: { routeOrder: i + 1 } })));
  }
  return { technicianId: tech.id, result, provider: matrix ? provider!.name : null, missingCoordinates: missing, savedOrder: existing?.appointmentIds ?? null, isManualOverride: existing?.isManualOverride ?? false };
}

/** Staff override of the visiting order (does not change appointment times). */
export async function saveManualOrder(technicianId: string, dateKey: string, appointmentIds: string[]) {
  await prisma.routePlan.upsert({
    where: { technicianId_date: { technicianId, date: dateKey } },
    create: { technicianId, date: dateKey, appointmentIds, provider: "manual", isManualOverride: true },
    update: { appointmentIds, isManualOverride: true },
  });
  await Promise.all(appointmentIds.map((id, i) => prisma.appointment.update({ where: { id, technicianId }, data: { routeOrder: i + 1 } })));
}

export async function clearManualOrder(technicianId: string, dateKey: string) {
  await prisma.routePlan.updateMany({ where: { technicianId, date: dateKey }, data: { isManualOverride: false } });
}
