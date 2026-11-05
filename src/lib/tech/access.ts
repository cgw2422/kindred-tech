import "server-only";
import type { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getSettings } from "../settings";
import { addDaysToKey, startOfDayUtc } from "../time";

/**
 * Technician data access. EVERY query here is scoped by technicianId so a
 * technician can only ever read or change their own assigned appointments.
 * Server actions must resolve technicianId from the session, never the form.
 */

export class TechError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT" = "INVALID",
  ) {
    super(message);
    this.name = "TechError";
  }
}

export async function getTechnicianForUser(userId: string) {
  return prisma.technician.findUnique({ where: { userId }, select: { id: true, displayName: true, isActive: true, userId: true } });
}

export async function businessTimeZone() {
  return (await getSettings("business")).timeZone;
}

/** Fields shown on the list views. No billing, no internal notes. */
const listSelect = {
  id: true,
  reference: true,
  status: true,
  startsAt: true,
  endsAt: true,
  isRemote: true,
  service: { select: { name: true } },
  customer: { select: { firstName: true, lastName: true, preferredName: true, phone: true } },
  address: { select: { line1: true, line2: true, city: true, state: true, postalCode: true } },
} satisfies Prisma.AppointmentSelect;

export type TechListAppointment = Prisma.AppointmentGetPayload<{ select: typeof listSelect }>;

const HIDDEN_FROM_LISTS: AppointmentStatus[] = ["CANCELED"];

export async function listTechAppointments(technicianId: string, fromKey: string, days: number, tz: string): Promise<TechListAppointment[]> {
  if (!technicianId) return [];
  return prisma.appointment.findMany({
    where: {
      technicianId,
      status: { notIn: HIDDEN_FROM_LISTS },
      startsAt: { gte: startOfDayUtc(fromKey, tz), lt: startOfDayUtc(addDaysToKey(fromKey, days), tz) },
    },
    orderBy: { startsAt: "asc" },
    select: listSelect,
  });
}

/** "Mary S." — preferred/first name plus last initial for privacy on list screens. */
export function shortCustomerName(c: { firstName: string; lastName: string; preferredName: string | null }) {
  const first = c.preferredName?.trim() || c.firstName;
  const initial = c.lastName.trim().charAt(0);
  return initial ? `${first} ${initial}.` : first;
}

export function addressLine(a: { line1: string; line2: string | null; city: string; state: string; postalCode: string } | null) {
  if (!a) return "";
  return [a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).join(", ");
}

export function mapsUrl(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function telHref(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/** Throws unless the appointment exists AND is assigned to this technician. */
export async function assertOwnedAppointment(technicianId: string, appointmentId: string) {
  if (!technicianId || !appointmentId) throw new TechError("Appointment not found.", "NOT_FOUND");
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, technicianId },
    select: { id: true, status: true, customerId: true, technicianId: true },
  });
  if (!appt) throw new TechError("Appointment not found.", "NOT_FOUND");
  return appt;
}

/** Job detail with only what the technician needs in the field. */
export async function getTechJob(technicianId: string, appointmentId: string) {
  if (!technicianId || !appointmentId) return null;
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, technicianId },
    select: {
      id: true,
      reference: true,
      status: true,
      startsAt: true,
      endsAt: true,
      isRemote: true,
      problemDescription: true,
      service: { select: { name: true, durationMinutes: true, shortDescription: true } },
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          phone: true,
          devices: { select: { id: true, type: true, make: true, model: true, os: true, nickname: true, notes: true }, orderBy: { createdAt: "asc" } },
          familyContacts: {
            where: { OR: [{ canReceiveUpdates: true }, { canSchedule: true }] },
            select: { id: true, name: true, relationship: true, phone: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      address: { select: { line1: true, line2: true, city: true, state: true, postalCode: true, accessNotes: true } },
      workOrder: {
        select: {
          id: true,
          status: true,
          troubleshootingNotes: true,
          resolutionSummary: true,
          checklist: true,
          signatureDataUrl: true,
          signedByName: true,
          signedAt: true,
          invoiceRequestedAt: true,
          completedAt: true,
          timeEntries: { select: { id: true, startedAt: true, endedAt: true }, orderBy: { startedAt: "asc" } },
          // Technicians see only the additional work they recorded, never invoices.
          additionalWork: { select: { id: true, description: true, minutes: true, priceCents: true, approvedByName: true, approvalMethod: true, approvedAt: true }, orderBy: { approvedAt: "asc" } },
          subscriptionReview: { select: { id: true, authorizationConfirmed: true, _count: { select: { items: true } } } },
        },
      },
    },
  });
  return appt;
}

export type TechJob = NonNullable<Awaited<ReturnType<typeof getTechJob>>>;

/** Total elapsed ms across entries; open entries count up to `now`. */
export function totalElapsedMs(entries: { startedAt: Date; endedAt: Date | null }[], now = new Date()) {
  return entries.reduce((sum, e) => sum + Math.max(0, (e.endedAt ?? now).getTime() - e.startedAt.getTime()), 0);
}

export function formatDuration(ms: number) {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}
