import { queueTemplatedEmail } from "../email/send";
import { env } from "../env";
import type { AppointmentStatus, Prisma, Role } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { randomCode, randomToken, sha256 } from "../codes";
import { getSettings } from "../settings";
import { addDaysToKey, formatDate, formatTime, toDateKey, startOfDayUtc, zonedParts } from "../time";
import { estimatePrice } from "../pricing";
import {
  computeAvailability,
  isTechnicianFree,
  pickTechnician,
  type Interval,
  type TechnicianAvailabilityInput,
} from "./availability";
import { ACTIVE_STATUSES, canTransition } from "./status";

export class BookingError extends Error {
  constructor(message: string, public code: string = "BOOKING_ERROR") {
    super(message);
    this.name = "BookingError";
  }
}

const ACTIVE_FILTER = { notIn: ["CANCELED", "NO_SHOW"] as AppointmentStatus[] };

// ---------------------------------------------------------------------------
// Service area
// ---------------------------------------------------------------------------

export async function lookupServiceArea(postalCode: string | null | undefined) {
  const zip = (postalCode ?? "").trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) return null;
  return prisma.serviceArea.findFirst({ where: { isActive: true, postalCodes: { has: zip } } });
}

// ---------------------------------------------------------------------------
// Availability loading
// ---------------------------------------------------------------------------

async function loadTechnicianInputs(
  client: Tx | typeof prisma,
  rangeStart: Date,
  rangeEnd: Date,
  opts: { technicianIds?: string[]; excludeAppointmentId?: string; travelBufferMinutes: number },
): Promise<TechnicianAvailabilityInput[]> {
  const techs = await client.technician.findMany({
    where: { isActive: true, ...(opts.technicianIds ? { id: { in: opts.technicianIds } } : {}) },
    include: {
      schedules: true,
      blackouts: { where: { startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } } },
      appointments: {
        where: {
          status: ACTIVE_FILTER,
          blockStartsAt: { lt: rangeEnd },
          blockEndsAt: { gt: rangeStart },
          ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
        },
        select: { blockStartsAt: true, blockEndsAt: true },
      },
      techHelpDays: {
        where: { status: { not: "CANCELED" }, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
        select: { startsAt: true, endsAt: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return techs.map((t) => ({
    id: t.id,
    schedules: t.schedules.map((s) => ({ dayOfWeek: s.dayOfWeek, startMinute: s.startMinute, endMinute: s.endMinute })),
    busy: [
      ...t.blackouts.map((b) => ({ start: b.startsAt, end: b.endsAt })),
      ...t.appointments.map((a) => ({ start: a.blockStartsAt, end: a.blockEndsAt })),
      // A Tech Help Day occupies the technician plus travel time afterwards.
      ...t.techHelpDays.map((h) => ({ start: h.startsAt, end: new Date(h.endsAt.getTime() + opts.travelBufferMinutes * 60_000) })),
    ],
  }));
}

export async function getAvailability(params: {
  serviceId: string;
  fromDateKey?: string;
  days?: number;
  extensionBlocks?: number;
  excludeAppointmentId?: string;
  technicianIds?: string[];
  now?: Date;
  ignoreNotice?: boolean;
}) {
  const [service, booking, hours, biz] = await Promise.all([
    prisma.service.findUnique({ where: { id: params.serviceId }, include: { addons: true } }),
    getSettings("booking"),
    getSettings("hours"),
    getSettings("business"),
  ]);
  if (!service || !service.isActive) throw new BookingError("That service is not available.", "SERVICE_UNAVAILABLE");
  const now = params.now ?? new Date();
  const tz = biz.timeZone;
  const fromDateKey = params.fromDateKey ?? toDateKey(now, tz);
  const days = Math.min(params.days ?? 14, 62);
  const rangeStart = startOfDayUtc(fromDateKey, tz);
  const rangeEnd = startOfDayUtc(addDaysToKey(fromDateKey, days + 1), tz);
  const duration = service.durationMinutes + (params.extensionBlocks ?? 0) * (service.extensionMinutes ?? 0);
  const buffer = service.isRemote ? booking.remoteBufferMinutes : booking.travelBufferMinutes;

  const [technicians, businessBlackouts] = await Promise.all([
    loadTechnicianInputs(prisma, rangeStart, rangeEnd, {
      technicianIds: params.technicianIds,
      excludeAppointmentId: params.excludeAppointmentId,
      travelBufferMinutes: booking.travelBufferMinutes,
    }),
    prisma.blackout.findMany({ where: { technicianId: null, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } } }),
  ]);

  return computeAvailability({
    timeZone: tz,
    now,
    fromDateKey,
    days,
    businessHours: hours.days,
    businessBlackouts: businessBlackouts.map((b) => ({ start: b.startsAt, end: b.endsAt })),
    technicians,
    durationMinutes: duration,
    bufferMinutes: buffer,
    slotIntervalMinutes: booking.slotIntervalMinutes,
    minNoticeHours: params.ignoreNotice ? 0 : booking.minNoticeHours,
    maxDaysAhead: params.ignoreNotice ? 3650 : booking.maxDaysAhead,
  });
}

// ---------------------------------------------------------------------------
// Slot reservation inside a transaction
// ---------------------------------------------------------------------------

/** Serialize bookings per technician with a transaction-scoped advisory lock. */
async function lockTechnicians(tx: Tx, ids: string[]) {
  for (const id of [...ids].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"tech:" + id}))`;
  }
}

function isOverlapViolation(err: unknown): boolean {
  const e = err as { code?: string; meta?: { code?: string }; message?: string };
  const msg = e.message ?? "";
  return msg.includes("appointment_no_technician_overlap") || msg.includes("23P01") || e.meta?.code === "23P01";
}

/**
 * Within a transaction, choose a technician who is free for [startsAt, +duration)
 * and lock them. If `technicianId` is given, only that technician is considered.
 */
export async function reserveTechnician(
  tx: Tx,
  params: {
    startsAt: Date;
    durationMinutes: number;
    bufferMinutes: number;
    technicianId?: string | null;
    excludeAppointmentId?: string;
    enforceHours: boolean;
  },
): Promise<string> {
  const [hours, biz, booking] = await Promise.all([getSettings("hours"), getSettings("business"), getSettings("booking")]);
  const tz = biz.timeZone;
  const dateKey = toDateKey(params.startsAt, tz);
  const p = zonedParts(params.startsAt, tz);
  const startMinute = p.hour * 60 + p.minute;

  const candidateIds = params.technicianId
    ? [params.technicianId]
    : (await tx.technician.findMany({ where: { isActive: true }, select: { id: true } })).map((t) => t.id);
  if (candidateIds.length === 0) throw new BookingError("No technicians are available.", "NO_TECHNICIAN");
  await lockTechnicians(tx, candidateIds);

  const rangeStart = startOfDayUtc(dateKey, tz);
  const rangeEnd = startOfDayUtc(addDaysToKey(dateKey, 1), tz);
  const techs = await loadTechnicianInputs(tx, rangeStart, rangeEnd, {
    technicianIds: candidateIds,
    excludeAppointmentId: params.excludeAppointmentId,
    travelBufferMinutes: booking.travelBufferMinutes,
  });
  const businessBlackouts = await tx.blackout.findMany({ where: { technicianId: null, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } } });
  const ctx = {
    timeZone: tz,
    businessHours: params.enforceHours ? hours.days : hours.days.map(() => ({ open: true, startMinute: 0, endMinute: 1440 })),
    businessBlackouts: businessBlackouts.map((b) => ({ start: b.startsAt, end: b.endsAt })),
    durationMinutes: params.durationMinutes,
    bufferMinutes: params.bufferMinutes,
  };
  const free = techs.filter((t) => {
    if (params.enforceHours) return isTechnicianFree(ctx, t, dateKey, startMinute);
    // Staff override of hours: still never allow overlapping busy blocks.
    const block: Interval = { start: params.startsAt, end: new Date(params.startsAt.getTime() + (params.durationMinutes + params.bufferMinutes) * 60_000) };
    return !t.busy.some((b) => b.start < block.end && block.start < b.end);
  });
  const busyCount = Object.fromEntries(techs.map((t) => [t.id, t.busy.length]));
  const chosen = pickTechnician(
    free.map((t) => t.id),
    busyCount,
  );
  if (!chosen) {
    throw new BookingError("Sorry, that time was just taken. Please choose another time.", "SLOT_TAKEN");
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Create booking (public, portal, or staff)
// ---------------------------------------------------------------------------

export type BookingRequest = {
  serviceId: string;
  startsAt: Date;
  extensionBlocks?: number;
  addonIds?: string[];
  discountCode?: string | null;
  customer: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    contactPreference?: "EMAIL" | "PHONE" | "TEXT" | "MAIL";
  };
  address: { line1: string; line2?: string | null; city: string; state: string; postalCode: string; accessNotes?: string | null } | null;
  bookedForSelf: boolean;
  requester?: { name: string; email?: string | null; phone?: string | null; relationship?: string | null; canPay?: boolean; receiveUpdates?: boolean } | null;
  problemDescription?: string | null;
  leadSource?: string | null;
  marketingOptIn?: boolean;
  acceptedTerms: boolean;
  source?: "ONLINE" | "PHONE" | "ADMIN" | "PORTAL" | "FACILITY_DAY";
  existingCustomerId?: string | null;
  technicianId?: string | null;
  staffOverrideHours?: boolean;
  statusOverride?: AppointmentStatus;
  actorUserId?: string | null;
  now?: Date;
};

export type BookingResult = {
  appointmentId: string;
  reference: string;
  manageToken: string;
  status: AppointmentStatus;
  inServiceArea: boolean;
  customerId: string;
};

export async function createBooking(req: BookingRequest): Promise<BookingResult> {
  if (!req.acceptedTerms) throw new BookingError("Please review and accept the terms to continue.", "TERMS");
  const now = req.now ?? new Date();
  const [service, booking, billing, biz] = await Promise.all([
    prisma.service.findUnique({ where: { id: req.serviceId }, include: { addons: true } }),
    getSettings("booking"),
    getSettings("billing"),
    getSettings("business"),
  ]);
  if (!service || !service.isActive) throw new BookingError("That service is not available.", "SERVICE_UNAVAILABLE");
  const isStaff = req.source === "ADMIN" || req.source === "PHONE";
  if (!isStaff && !service.isBookableOnline) throw new BookingError("That service must be arranged by phone or our contact form.", "NOT_ONLINE");
  if (!service.isRemote && !req.address) throw new BookingError("Please enter the address where we will visit.", "ADDRESS");

  if (!isStaff) {
    const minStart = now.getTime() + booking.minNoticeHours * 3600_000;
    if (req.startsAt.getTime() < minStart) throw new BookingError(`Appointments need at least ${booking.minNoticeHours} hours of notice.`, "NOTICE");
    if (req.startsAt.getTime() > now.getTime() + booking.maxDaysAhead * 86400_000) throw new BookingError("That date is too far ahead to book online.", "TOO_FAR");
  }

  const area = req.address ? await lookupServiceArea(req.address.postalCode) : null;
  const inServiceArea = service.isRemote || Boolean(area);
  if (!inServiceArea && !booking.allowOutOfAreaRequests && !isStaff) {
    throw new BookingError("Sorry, that address is outside our current service area.", "OUT_OF_AREA");
  }

  const extensionBlocks = Math.max(0, Math.min(8, req.extensionBlocks ?? 0));
  const durationMinutes = service.durationMinutes + extensionBlocks * (service.extensionMinutes ?? 0);
  const bufferMinutes = service.isRemote ? booking.remoteBufferMinutes : booking.travelBufferMinutes;
  const addons = service.addons.filter((a) => a.isActive && (req.addonIds ?? []).includes(a.id));

  let discount: { id: string; name: string; type: "PERCENT" | "FIXED"; value: number } | null = null;
  if (req.discountCode) {
    const d = await prisma.discount.findFirst({ where: { code: { equals: req.discountCode.trim(), mode: "insensitive" }, isActive: true } });
    const valid =
      d &&
      (!d.startsAt || d.startsAt <= now) &&
      (!d.endsAt || d.endsAt >= now) &&
      (d.maxUses == null || d.usedCount < d.maxUses) &&
      (!d.serviceId || d.serviceId === service.id);
    if (!valid) throw new BookingError("That discount code is not valid.", "DISCOUNT");
    discount = { id: d.id, name: d.name, type: d.type, value: d.value };
  }

  const travelFeeCents = service.isRemote ? 0 : (area?.travelFeeCents ?? billing.defaultTravelFeeCents);
  const estimate = estimatePrice({
    service,
    addons,
    extensionBlocks,
    travelFeeCents,
    discount,
    taxRatePercent: billing.taxRatePercent,
  });

  const needsApproval = service.requiresApproval || booking.requireApprovalByDefault || !inServiceArea;
  const status: AppointmentStatus = req.statusOverride ?? (needsApproval ? "REQUESTED" : "CONFIRMED");
  const manageToken = randomToken(24);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const technicianId = await reserveTechnician(tx, {
          startsAt: req.startsAt,
          durationMinutes,
          bufferMinutes,
          technicianId: req.technicianId,
          enforceHours: !(isStaff && req.staffOverrideHours),
        });

        // Customer: reuse explicit existing customer, else match by email, else create.
        let customerId = req.existingCustomerId ?? null;
        if (!customerId && req.customer.email) {
          const match = await tx.customer.findFirst({
            where: { email: { equals: req.customer.email.trim(), mode: "insensitive" } },
            orderBy: { createdAt: "asc" },
          });
          customerId = match?.id ?? null;
        }
        if (!customerId) {
          const created = await tx.customer.create({
            data: {
              firstName: req.customer.firstName.trim(),
              lastName: req.customer.lastName.trim(),
              email: req.customer.email?.trim().toLowerCase() || null,
              phone: req.customer.phone?.trim() || null,
              contactPreference: req.customer.contactPreference ?? "PHONE",
              status: "ACTIVE",
              leadSource: req.leadSource ?? null,
              marketingOptIn: Boolean(req.marketingOptIn),
              marketingOptInAt: req.marketingOptIn ? now : null,
            },
          });
          customerId = created.id;
        } else if (req.marketingOptIn) {
          await tx.customer.update({ where: { id: customerId }, data: { marketingOptIn: true, marketingOptInAt: now } });
        }

        let addressId: string | null = null;
        if (req.address) {
          const existingAddr = await tx.address.findFirst({
            where: {
              customerId,
              line1: { equals: req.address.line1.trim(), mode: "insensitive" },
              postalCode: req.address.postalCode.trim(),
            },
          });
          if (existingAddr) addressId = existingAddr.id;
          else {
            const hasPrimary = await tx.address.count({ where: { customerId, isPrimary: true } });
            const addr = await tx.address.create({
              data: {
                customerId,
                line1: req.address.line1.trim(),
                line2: req.address.line2?.trim() || null,
                city: req.address.city.trim(),
                state: req.address.state.trim().toUpperCase() || "OH",
                postalCode: req.address.postalCode.trim(),
                county: area?.county ?? null,
                accessNotes: req.address.accessNotes?.trim() || null,
                isPrimary: hasPrimary === 0,
              },
            });
            addressId = addr.id;
          }
        }

        // Family member booking on someone's behalf -> authorized contact with limited permissions.
        if (!req.bookedForSelf && req.requester?.name) {
          const exists = await tx.familyContact.findFirst({
            where: {
              customerId,
              OR: [
                ...(req.requester.email ? [{ email: { equals: req.requester.email, mode: "insensitive" as const } }] : []),
                { name: { equals: req.requester.name, mode: "insensitive" as const } },
              ],
            },
          });
          if (!exists) {
            await tx.familyContact.create({
              data: {
                customerId,
                name: req.requester.name.trim(),
                relationship: req.requester.relationship?.trim() || null,
                email: req.requester.email?.trim().toLowerCase() || null,
                phone: req.requester.phone?.trim() || null,
                canSchedule: true,
                canPay: Boolean(req.requester.canPay),
                isBillingContact: Boolean(req.requester.canPay),
                canReceiveUpdates: Boolean(req.requester.receiveUpdates),
                // Paying or scheduling does not grant access to private service details.
                canViewServiceDetails: false,
                notes: "Added from online booking. Confirm permissions with the customer.",
              },
            });
          }
        }

        const reference = randomCode(6);
        const appt = await tx.appointment.create({
          data: {
            reference,
            status,
            source: req.source ?? "ONLINE",
            customerId,
            addressId,
            serviceId: service.id,
            technicianId,
            startsAt: req.startsAt,
            endsAt: new Date(req.startsAt.getTime() + durationMinutes * 60_000),
            blockStartsAt: req.startsAt,
            blockEndsAt: new Date(req.startsAt.getTime() + (durationMinutes + bufferMinutes) * 60_000),
            isRemote: service.isRemote,
            bookedForSelf: req.bookedForSelf,
            requesterName: req.bookedForSelf ? null : (req.requester?.name ?? null),
            requesterEmail: req.bookedForSelf ? null : (req.requester?.email?.toLowerCase() ?? null),
            requesterPhone: req.bookedForSelf ? null : (req.requester?.phone ?? null),
            requesterRelation: req.bookedForSelf ? null : (req.requester?.relationship ?? null),
            problemDescription: req.problemDescription?.slice(0, 4000) ?? null,
            addonIds: addons.map((a) => a.id),
            extensionBlocks,
            discountId: discount?.id ?? null,
            estimatedTotalCents: estimate.isCustomQuote ? null : estimate.totalCents,
            estimateBreakdown: estimate as unknown as Prisma.InputJsonValue,
            leadSource: req.leadSource ?? null,
            manageTokenHash: sha256(manageToken),
            confirmedAt: status === "CONFIRMED" ? now : null,
            internalNotes: inServiceArea ? null : "Address appears to be outside the configured service area. Review before confirming.",
          },
        });
        await tx.appointmentStatusChange.create({
          data: { appointmentId: appt.id, fromStatus: null, toStatus: status, changedById: req.actorUserId ?? null, note: `Booked via ${req.source ?? "ONLINE"}` },
        });
        if (discount) await tx.discount.update({ where: { id: discount.id }, data: { usedCount: { increment: 1 } } });

        await tx.consentRecord.create({
          data: {
            customerId,
            type: "TERMS_ACCEPTED",
            granted: true,
            method: isStaff ? "VERBAL" : "WEB_FORM",
            grantedByName: req.bookedForSelf ? `${req.customer.firstName} ${req.customer.lastName}` : (req.requester?.name ?? null),
            appointmentId: appt.id,
            recordedById: req.actorUserId ?? null,
          },
        });
        if (req.marketingOptIn) {
          await tx.consentRecord.create({
            data: { customerId, type: "MARKETING_EMAIL", granted: true, method: isStaff ? "VERBAL" : "WEB_FORM", appointmentId: appt.id, recordedById: req.actorUserId ?? null },
          });
        }

        await enqueueBookingEmails(tx, appt.id, manageToken, inServiceArea, biz.timeZone);

        return { appointmentId: appt.id, reference, manageToken, status, inServiceArea, customerId };
      },
      { isolationLevel: "ReadCommitted", timeout: 20_000 },
    );
  } catch (err) {
    if (isOverlapViolation(err)) throw new BookingError("Sorry, that time was just taken. Please choose another time.", "SLOT_TAKEN");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------


export function manageUrl(token: string) {
  return `${env.appUrl}/appointments/manage?token=${encodeURIComponent(token)}`;
}

async function appointmentVars(client: Tx | typeof prisma, appointmentId: string, tz: string, manageToken?: string) {
  const a = await client.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { customer: true, service: true, address: true, technician: true },
  });
  return {
    appt: a,
    vars: {
      customerName: a.customer.preferredName || a.customer.firstName,
      serviceName: a.service.name,
      appointmentDate: formatDate(a.startsAt, tz),
      appointmentTime: formatTime(a.startsAt, tz),
      appointmentReference: a.reference,
      appointmentLocation: a.isRemote ? "Remote session (we will call you)" : a.address ? `${a.address.line1}, ${a.address.city}` : "",
      technicianName: a.technician?.displayName ?? "Your technician",
      manageUrl: manageToken ? manageUrl(manageToken) : `${env.appUrl}/portal`,
    },
  };
}

/** Recipients for appointment notices: the customer plus a family requester who opted into updates. */
async function appointmentRecipients(client: Tx | typeof prisma, appointmentId: string) {
  const a = await client.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: { customer: { include: { familyContacts: true } } } });
  const list: string[] = [];
  if (a.customer.email) list.push(a.customer.email.toLowerCase());
  if (!a.bookedForSelf && a.requesterEmail) list.push(a.requesterEmail.toLowerCase());
  for (const fc of a.customer.familyContacts) if (fc.canReceiveUpdates && fc.email) list.push(fc.email.toLowerCase());
  return [...new Set(list)];
}

async function enqueueBookingEmails(tx: Tx, appointmentId: string, manageToken: string, inServiceArea: boolean, tz: string) {
  const notifications = await getSettings("notifications");
  const { appt, vars } = await appointmentVars(tx, appointmentId, tz, manageToken);
  const biz = await getSettings("business");
  const approvalNote =
    appt.status === "CONFIRMED"
      ? "Your appointment is confirmed. We look forward to seeing you."
      : "We will review your request and contact you to confirm your appointment.";
  if (notifications.sendBookingReceived) {
    for (const to of await appointmentRecipients(tx, appointmentId)) {
      await queueTemplatedEmail({
        tx,
        templateKey: appt.status === "CONFIRMED" ? "appointment_confirmed" : "booking_received",
        to,
        customerId: appt.customerId,
        vars: { ...vars, approvalNote, phoneSentence: biz.phone ? ` or call us at ${biz.phone}` : "" },
        idempotencyKey: `booking:${appointmentId}:${appt.status}:${to}`,
        relatedType: "Appointment",
        relatedId: appointmentId,
      });
    }
  }
  if (notifications.adminNotificationEmail) {
    await queueTemplatedEmail({
      tx,
      templateKey: "admin_new_booking",
      to: notifications.adminNotificationEmail,
      vars: { ...vars, customerName: `${appt.customer.firstName} ${appt.customer.lastName}`, areaNote: inServiceArea ? "Inside service area" : "Outside configured service area: review needed", adminUrl: `${env.appUrl}/admin/appointments/${appointmentId}` },
      idempotencyKey: `admin-booking:${appointmentId}`,
      relatedType: "Appointment",
      relatedId: appointmentId,
    });
  }
}

export async function notifyAppointment(appointmentId: string, templateKey: string, extraVars: Record<string, string> = {}, keySuffix = "") {
  const biz = await getSettings("business");
  const { appt, vars } = await appointmentVars(prisma, appointmentId, biz.timeZone);
  for (const to of await appointmentRecipients(prisma, appointmentId)) {
    await queueTemplatedEmail({
      templateKey,
      to,
      customerId: appt.customerId,
      vars: { ...vars, ...extraVars },
      idempotencyKey: `${templateKey}:${appointmentId}:${keySuffix || appt.startsAt.toISOString()}:${to}`,
      relatedType: "Appointment",
      relatedId: appointmentId,
    });
  }
}

// ---------------------------------------------------------------------------
// Status changes, assignment, rescheduling, cancellation
// ---------------------------------------------------------------------------

export async function changeAppointmentStatus(params: {
  appointmentId: string;
  to: AppointmentStatus;
  actor: { id: string | null; role: Role };
  note?: string;
  cancelReason?: string;
  /** For technicians: must be their own appointment */
  technicianId?: string;
}) {
  const appt = await prisma.appointment.findUnique({ where: { id: params.appointmentId } });
  if (!appt) throw new BookingError("Appointment not found.", "NOT_FOUND");
  if (params.actor.role === "TECHNICIAN" && appt.technicianId !== params.technicianId) {
    throw new BookingError("You can only update your own appointments.", "FORBIDDEN");
  }
  if (!canTransition(appt.status, params.to, params.actor.role)) {
    throw new BookingError(`Cannot change status from ${appt.status} to ${params.to}.`, "INVALID_TRANSITION");
  }
  // Re-activating a canceled appointment must not create a conflict.
  if ((appt.status === "CANCELED" || appt.status === "NO_SHOW") && ACTIVE_STATUSES.includes(params.to)) {
    // The DB exclusion constraint will reject overlaps; surface a friendly message.
  }
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      // Optimistic concurrency: only update if status is unchanged.
      const res = await tx.appointment.updateMany({
        where: { id: appt.id, status: appt.status },
        data: {
          status: params.to,
          confirmedAt: params.to === "CONFIRMED" && !appt.confirmedAt ? now : undefined,
          canceledAt: params.to === "CANCELED" ? now : params.to === "REQUESTED" ? null : undefined,
          cancelReason: params.to === "CANCELED" ? (params.cancelReason ?? null) : undefined,
        },
      });
      if (res.count === 0) throw new BookingError("This appointment was changed by someone else. Please refresh.", "CONFLICT");
      await tx.appointmentStatusChange.create({
        data: { appointmentId: appt.id, fromStatus: appt.status, toStatus: params.to, changedById: params.actor.id, note: params.note ?? params.cancelReason ?? null },
      });
      if (params.to === "IN_PROGRESS" || params.to === "EN_ROUTE") {
        await tx.workOrder.upsert({
          where: { appointmentId: appt.id },
          create: { appointmentId: appt.id, technicianId: appt.technicianId, status: params.to === "IN_PROGRESS" ? "IN_PROGRESS" : "OPEN" },
          update: params.to === "IN_PROGRESS" ? { status: "IN_PROGRESS" } : {},
        });
      }
    });
  } catch (err) {
    if (isOverlapViolation(err)) throw new BookingError("That time now overlaps another appointment for this technician.", "SLOT_TAKEN");
    throw err;
  }

  const templateFor: Partial<Record<AppointmentStatus, string>> = {
    CONFIRMED: "appointment_confirmed",
    CANCELED: "appointment_canceled",
    EN_ROUTE: "technician_en_route",
  };
  const t = templateFor[params.to];
  if (t) await notifyAppointment(appt.id, t, t === "technician_en_route" ? { etaSentence: "" } : {}, `${params.to}:${now.toISOString().slice(0, 16)}`);
}

export async function assignTechnician(params: { appointmentId: string; technicianId: string | null; actorUserId: string; allowOutsideHours?: boolean }) {
  const appt = await prisma.appointment.findUnique({ where: { id: params.appointmentId }, include: { service: true } });
  if (!appt) throw new BookingError("Appointment not found.", "NOT_FOUND");
  if (!ACTIVE_STATUSES.includes(appt.status)) throw new BookingError("Only active appointments can be assigned.", "INVALID");
  try {
    await prisma.$transaction(async (tx) => {
      if (params.technicianId) {
        const duration = Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000);
        const buffer = Math.round((appt.blockEndsAt.getTime() - appt.endsAt.getTime()) / 60_000);
        await reserveTechnician(tx, {
          startsAt: appt.startsAt,
          durationMinutes: duration,
          bufferMinutes: buffer,
          technicianId: params.technicianId,
          excludeAppointmentId: appt.id,
          enforceHours: !params.allowOutsideHours,
        });
      }
      await tx.appointment.update({
        where: { id: appt.id },
        data: {
          technicianId: params.technicianId,
          status: params.technicianId && appt.status === "CONFIRMED" ? "ASSIGNED" : appt.status,
        },
      });
      if (params.technicianId && appt.status === "CONFIRMED") {
        await tx.appointmentStatusChange.create({ data: { appointmentId: appt.id, fromStatus: "CONFIRMED", toStatus: "ASSIGNED", changedById: params.actorUserId } });
      }
    });
  } catch (err) {
    if (isOverlapViolation(err)) throw new BookingError("That technician already has an overlapping appointment.", "SLOT_TAKEN");
    throw err;
  }
}

export async function rescheduleAppointment(params: {
  appointmentId: string;
  startsAt: Date;
  actor: { id: string | null; role: Role | "PUBLIC" };
  technicianId?: string | null;
  allowOutsideHours?: boolean;
}) {
  const appt = await prisma.appointment.findUnique({ where: { id: params.appointmentId }, include: { service: true } });
  if (!appt) throw new BookingError("Appointment not found.", "NOT_FOUND");
  if (!["REQUESTED", "CONFIRMED", "ASSIGNED"].includes(appt.status)) throw new BookingError("This appointment can no longer be rescheduled.", "INVALID");
  const booking = await getSettings("booking");
  const isStaffActor = params.actor.role === "OWNER" || params.actor.role === "ADMIN" || params.actor.role === "DISPATCHER";
  if (!isStaffActor && params.startsAt.getTime() < Date.now() + booking.minNoticeHours * 3600_000) {
    throw new BookingError(`Appointments need at least ${booking.minNoticeHours} hours of notice.`, "NOTICE");
  }
  const duration = Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000);
  const buffer = Math.round((appt.blockEndsAt.getTime() - appt.endsAt.getTime()) / 60_000);
  try {
    await prisma.$transaction(async (tx) => {
      const technicianId = await reserveTechnician(tx, {
        startsAt: params.startsAt,
        durationMinutes: duration,
        bufferMinutes: buffer,
        technicianId: params.technicianId === undefined ? undefined : params.technicianId,
        excludeAppointmentId: appt.id,
        enforceHours: !(isStaffActor && params.allowOutsideHours),
      });
      await tx.appointment.update({
        where: { id: appt.id },
        data: {
          startsAt: params.startsAt,
          endsAt: new Date(params.startsAt.getTime() + duration * 60_000),
          blockStartsAt: params.startsAt,
          blockEndsAt: new Date(params.startsAt.getTime() + (duration + buffer) * 60_000),
          technicianId,
          routeOrder: null,
          // A customer-initiated reschedule goes back to review when approval is required.
          status: !isStaffActor && appt.service.requiresApproval ? "REQUESTED" : appt.status,
        },
      });
      await tx.appointmentStatusChange.create({
        data: {
          appointmentId: appt.id,
          fromStatus: appt.status,
          toStatus: !isStaffActor && appt.service.requiresApproval ? "REQUESTED" : appt.status,
          changedById: params.actor.id,
          note: `Rescheduled from ${appt.startsAt.toISOString()} to ${params.startsAt.toISOString()}`,
        },
      });
    });
  } catch (err) {
    if (isOverlapViolation(err)) throw new BookingError("Sorry, that time was just taken. Please choose another time.", "SLOT_TAKEN");
    throw err;
  }
  await notifyAppointment(appt.id, "appointment_rescheduled", {}, `resched:${params.startsAt.toISOString()}`);
}

export async function findAppointmentByManageToken(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.appointment.findUnique({
    where: { manageTokenHash: sha256(token) },
    include: { service: true, customer: true, address: true },
  });
}
