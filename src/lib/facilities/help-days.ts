/**
 * Tech Help Days: on-site sessions at a partner facility.
 *
 * A help day reserves its technician for [startsAt, endsAt] (+ travel buffer).
 * Resident sessions inside it are ordinary Appointment rows with
 * techHelpDayId/facilityId set and technicianId = the help day's technician,
 * so the database exclusion constraint prevents overlapping resident slots.
 * createBooking() cannot be used for these (it treats the help day itself as
 * busy), so bookHelpDaySlot() reserves slots directly under the same
 * per-technician advisory lock used by booking/service.ts.
 */
import { z } from "zod";
import type { AppointmentStatus, HelpDayPaymentModel, HelpDayStatus, Prisma, Role } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { env } from "../env";
import { randomCode } from "../codes";
import { audit } from "../audit";
import { getSettings } from "../settings";
import { queueTemplatedEmail } from "../email/send";
import { helpDaySlots, type Interval } from "../booking/availability";
import { changeAppointmentStatus, notifyAppointment } from "../booking/service";
import { formatDate, formatTime, localMinuteToUtc, toDateKey, weekdayOfKey, zonedParts } from "../time";
import { FacilityError, isOverlapViolation } from "./errors";
import { generateOccurrenceDateKeys, validateRule, type RecurrenceRule, type SeriesFrequency } from "./recurrence";

export const RESIDENT_SERVICE_SLUG = "tech-help-day-resident-session";
const INACTIVE: AppointmentStatus[] = ["CANCELED", "NO_SHOW"];
const ACTIVE_WHERE = { notIn: INACTIVE };
export const BOOKABLE_HELP_DAY_STATUSES: HelpDayStatus[] = ["SCHEDULED", "CONFIRMED"];

export const HELP_DAY_PAYMENT_LABELS: Record<HelpDayPaymentModel, string> = {
  RESIDENT_PAID: "Resident-paid",
  FACILITY_SPONSORED: "Facility-sponsored",
  CONTRACT: "Included in contract",
};

// ---------------------------------------------------------------------------
// Locking & conflict detection
// ---------------------------------------------------------------------------

/** Same key format as booking/service.ts so help-day work and public bookings serialize per technician. */
async function lockTechnician(tx: Tx, technicianId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"tech:" + technicianId}))`;
}
async function lockHelpDay(tx: Tx, helpDayId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"helpday:" + helpDayId}))`;
}
/** Always technician first, then the help day, so lock order is consistent. */
async function lockForHelpDay(tx: Tx, helpDay: { id: string; technicianId: string | null }) {
  if (helpDay.technicianId) await lockTechnician(tx, helpDay.technicianId);
  await lockHelpDay(tx, helpDay.id);
}

export type TechConflict = { kind: "APPOINTMENT" | "HELP_DAY" | "BLACKOUT" | "SCHEDULE" | "PAST"; startsAt: Date; endsAt: Date; label: string };

/**
 * Everything that prevents `technicianId` from working [startsAt, endsAt]
 * (plus the travel buffer afterwards): active appointments, other help days,
 * technician or business blackouts, and (optionally) the weekly schedule.
 */
export async function findTechnicianConflicts(
  client: Tx | typeof prisma,
  params: { technicianId: string | null; startsAt: Date; endsAt: Date; excludeHelpDayId?: string; checkSchedule: boolean; travelBufferMinutes: number; timeZone: string },
): Promise<TechConflict[]> {
  const out: TechConflict[] = [];
  const windowEnd = new Date(params.endsAt.getTime() + params.travelBufferMinutes * 60_000);
  const businessBlackouts = await client.blackout.findMany({
    where: { technicianId: null, startsAt: { lt: params.endsAt }, endsAt: { gt: params.startsAt } },
  });
  for (const b of businessBlackouts) out.push({ kind: "BLACKOUT", startsAt: b.startsAt, endsAt: b.endsAt, label: `Business closed${b.reason ? `: ${b.reason}` : ""}` });
  if (!params.technicianId) return out;

  const [appointments, helpDays, blackouts, schedules] = await Promise.all([
    client.appointment.findMany({
      where: {
        technicianId: params.technicianId,
        status: ACTIVE_WHERE,
        blockStartsAt: { lt: windowEnd },
        blockEndsAt: { gt: params.startsAt },
        ...(params.excludeHelpDayId ? { OR: [{ techHelpDayId: null }, { techHelpDayId: { not: params.excludeHelpDayId } }] } : {}),
      },
      select: { id: true, reference: true, startsAt: true, endsAt: true },
    }),
    client.techHelpDay.findMany({
      where: {
        technicianId: params.technicianId,
        status: { not: "CANCELED" },
        startsAt: { lt: windowEnd },
        endsAt: { gt: new Date(params.startsAt.getTime() - params.travelBufferMinutes * 60_000) },
        ...(params.excludeHelpDayId ? { id: { not: params.excludeHelpDayId } } : {}),
      },
      include: { facility: { select: { name: true } } },
    }),
    client.blackout.findMany({ where: { technicianId: params.technicianId, startsAt: { lt: params.endsAt }, endsAt: { gt: params.startsAt } } }),
    params.checkSchedule ? client.technicianSchedule.findMany({ where: { technicianId: params.technicianId } }) : Promise.resolve([]),
  ]);
  for (const a of appointments) out.push({ kind: "APPOINTMENT", startsAt: a.startsAt, endsAt: a.endsAt, label: `Appointment ${a.reference}` });
  for (const h of helpDays) out.push({ kind: "HELP_DAY", startsAt: h.startsAt, endsAt: h.endsAt, label: `Tech Help Day at ${h.facility.name}` });
  for (const b of blackouts) out.push({ kind: "BLACKOUT", startsAt: b.startsAt, endsAt: b.endsAt, label: `Technician unavailable (${b.type.toLowerCase().replace("_", " ")})${b.reason ? `: ${b.reason}` : ""}` });

  if (params.checkSchedule) {
    const dateKey = toDateKey(params.startsAt, params.timeZone);
    const weekday = weekdayOfKey(dateKey);
    const s = zonedParts(params.startsAt, params.timeZone);
    const e = zonedParts(params.endsAt, params.timeZone);
    const startMin = s.hour * 60 + s.minute;
    const endMin = toDateKey(params.endsAt, params.timeZone) === dateKey ? e.hour * 60 + e.minute : 24 * 60 + e.hour * 60 + e.minute;
    const fits = schedules.some((w) => w.dayOfWeek === weekday && startMin >= w.startMinute && endMin <= w.endMinute);
    if (!fits) out.push({ kind: "SCHEDULE", startsAt: params.startsAt, endsAt: params.endsAt, label: "Outside the technician's working hours" });
  }
  return out;
}

function describeConflicts(conflicts: TechConflict[], tz: string): string {
  return conflicts
    .slice(0, 3)
    .map((c) => `${c.label} (${formatTime(c.startsAt, tz)}–${formatTime(c.endsAt, tz)})`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// Creating help days and series
// ---------------------------------------------------------------------------

const helpDayFieldsSchema = z.object({
  facilityId: z.string().min(1),
  technicianId: z.string().min(1).nullish().transform((v) => v || null),
  startMinute: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(30, "A Tech Help Day must be at least 30 minutes.").max(12 * 60),
  slotMinutes: z.number().int().min(10).max(240).default(30),
  slotBufferMinutes: z.number().int().min(0).max(120).default(0),
  location: z.string().trim().max(200).nullish().transform((v) => v || null),
  paymentModel: z.enum(["RESIDENT_PAID", "FACILITY_SPONSORED", "CONTRACT"]).default("RESIDENT_PAID"),
  residentPriceCents: z.number().int().min(0).nullish().transform((v) => (v == null ? null : v)),
  sponsoredPriceCents: z.number().int().min(0).nullish().transform((v) => (v == null ? null : v)),
  notes: z.string().trim().max(5000).nullish().transform((v) => v || null),
  allowOutsideSchedule: z.boolean().default(false),
});
export type HelpDayFields = z.input<typeof helpDayFieldsSchema>;

function parseFields(input: HelpDayFields) {
  const r = helpDayFieldsSchema.safeParse(input);
  if (!r.success) throw new FacilityError(r.error.issues[0]?.message ?? "Please check the form.", "VALIDATION");
  if (r.data.slotMinutes > r.data.durationMinutes) throw new FacilityError("Resident slots cannot be longer than the Tech Help Day.", "VALIDATION");
  return r.data;
}

async function assertFacilityAndTech(client: Tx | typeof prisma, facilityId: string, technicianId: string | null) {
  const facility = await client.facility.findUnique({ where: { id: facilityId } });
  if (!facility) throw new FacilityError("Facility not found.", "NOT_FOUND");
  if (technicianId) {
    const tech = await client.technician.findUnique({ where: { id: technicianId } });
    if (!tech || !tech.isActive) throw new FacilityError("That technician is not active.", "TECHNICIAN");
  }
  return facility;
}

/** Creates a single Tech Help Day. Rejects when the technician is not free for the whole window. */
export async function createHelpDay(input: HelpDayFields & { dateKey: string; actorUserId?: string | null; now?: Date }) {
  const f = parseFields(input);
  const [biz, booking] = await Promise.all([getSettings("business"), getSettings("booking")]);
  const tz = biz.timeZone;
  const startsAt = localMinuteToUtc(input.dateKey, f.startMinute, tz);
  const endsAt = new Date(startsAt.getTime() + f.durationMinutes * 60_000);
  if (startsAt.getTime() < (input.now ?? new Date()).getTime()) throw new FacilityError("That date and time has already passed.", "PAST");

  const day = await prisma.$transaction(
    async (tx) => {
      await assertFacilityAndTech(tx, f.facilityId, f.technicianId);
      if (f.technicianId) await lockTechnician(tx, f.technicianId);
      const conflicts = await findTechnicianConflicts(tx, {
        technicianId: f.technicianId,
        startsAt,
        endsAt,
        checkSchedule: !f.allowOutsideSchedule,
        travelBufferMinutes: booking.travelBufferMinutes,
        timeZone: tz,
      });
      if (conflicts.length > 0) {
        throw new FacilityError(`The technician is not available for that time: ${describeConflicts(conflicts, tz)}.`, "TECH_CONFLICT", { conflicts });
      }
      return tx.techHelpDay.create({
        data: {
          facilityId: f.facilityId,
          technicianId: f.technicianId,
          startsAt,
          endsAt,
          slotMinutes: f.slotMinutes,
          slotBufferMinutes: f.slotBufferMinutes,
          location: f.location,
          paymentModel: f.paymentModel,
          residentPriceCents: f.residentPriceCents,
          sponsoredPriceCents: f.sponsoredPriceCents,
          notes: f.notes,
        },
      });
    },
    { isolationLevel: "ReadCommitted", timeout: 20_000 },
  );
  await audit({ actorUserId: input.actorUserId, action: "helpday.created", entityType: "TechHelpDay", entityId: day.id, metadata: { facilityId: day.facilityId } });
  return day;
}

export type SkippedOccurrence = { dateKey: string; reason: string };

/**
 * Creates a recurring series and its occurrences. Dates that conflict with the
 * technician's schedule, appointments, other help days or blackouts (or that
 * are already past) are skipped and reported, never silently moved.
 */
export async function createHelpDaySeries(
  input: HelpDayFields & {
    frequency: SeriesFrequency;
    dayOfWeek: number;
    weekOfMonth?: number | null;
    startDateKey: string;
    untilDateKey?: string | null;
    count?: number | null;
    actorUserId?: string | null;
    now?: Date;
  },
) {
  const f = parseFields(input);
  const rule: RecurrenceRule = {
    frequency: input.frequency,
    dayOfWeek: input.dayOfWeek,
    weekOfMonth: input.frequency === "MONTHLY_NTH_WEEKDAY" ? input.weekOfMonth : null,
    startDateKey: input.startDateKey,
    untilDateKey: input.untilDateKey || null,
    count: input.count || null,
  };
  const problem = validateRule(rule);
  if (problem) throw new FacilityError(problem, "VALIDATION");
  const dateKeys = generateOccurrenceDateKeys(rule);
  const [biz, booking] = await Promise.all([getSettings("business"), getSettings("booking")]);
  const tz = biz.timeZone;
  const now = input.now ?? new Date();

  const result = await prisma.$transaction(
    async (tx) => {
      await assertFacilityAndTech(tx, f.facilityId, f.technicianId);
      if (f.technicianId) await lockTechnician(tx, f.technicianId);
      const series = await tx.techHelpDaySeries.create({
        data: {
          facilityId: f.facilityId,
          frequency: rule.frequency,
          dayOfWeek: rule.dayOfWeek,
          weekOfMonth: rule.weekOfMonth ?? null,
          startMinute: f.startMinute,
          durationMinutes: f.durationMinutes,
          startDate: localMinuteToUtc(rule.startDateKey, 0, tz),
          untilDate: rule.untilDateKey ? localMinuteToUtc(rule.untilDateKey, 0, tz) : null,
        },
      });
      const created: { id: string; dateKey: string; startsAt: Date }[] = [];
      const skipped: SkippedOccurrence[] = [];
      for (const dateKey of dateKeys) {
        const startsAt = localMinuteToUtc(dateKey, f.startMinute, tz);
        const endsAt = new Date(startsAt.getTime() + f.durationMinutes * 60_000);
        if (startsAt <= now) {
          skipped.push({ dateKey, reason: "Date has already passed" });
          continue;
        }
        // Days created earlier in this loop are visible inside the transaction.
        const conflicts = await findTechnicianConflicts(tx, {
          technicianId: f.technicianId,
          startsAt,
          endsAt,
          checkSchedule: !f.allowOutsideSchedule,
          travelBufferMinutes: booking.travelBufferMinutes,
          timeZone: tz,
        });
        if (conflicts.length > 0) {
          skipped.push({ dateKey, reason: describeConflicts(conflicts, tz) });
          continue;
        }
        const day = await tx.techHelpDay.create({
          data: {
            facilityId: f.facilityId,
            seriesId: series.id,
            technicianId: f.technicianId,
            startsAt,
            endsAt,
            slotMinutes: f.slotMinutes,
            slotBufferMinutes: f.slotBufferMinutes,
            location: f.location,
            paymentModel: f.paymentModel,
            residentPriceCents: f.residentPriceCents,
            sponsoredPriceCents: f.sponsoredPriceCents,
            notes: f.notes,
          },
        });
        created.push({ id: day.id, dateKey, startsAt });
      }
      return { series, created, skipped };
    },
    { isolationLevel: "ReadCommitted", timeout: 60_000 },
  );
  await audit({
    actorUserId: input.actorUserId,
    action: "helpday.series_created",
    entityType: "TechHelpDaySeries",
    entityId: result.series.id,
    metadata: { facilityId: f.facilityId, created: result.created.length, skipped: result.skipped.length },
  });
  return result;
}

/**
 * Updates a help day. Time, slot settings and technician can only change when
 * no residents are booked (staff must cancel or move them first); the
 * technician must be free for the new window.
 */
export async function updateHelpDay(
  helpDayId: string,
  input: Omit<HelpDayFields, "facilityId"> & { dateKey: string; actorUserId?: string | null },
) {
  const existing = await prisma.techHelpDay.findUniqueOrThrow({ where: { id: helpDayId } });
  const f = parseFields({ ...input, facilityId: existing.facilityId });
  const [biz, booking] = await Promise.all([getSettings("business"), getSettings("booking")]);
  const tz = biz.timeZone;
  const startsAt = localMinuteToUtc(input.dateKey, f.startMinute, tz);
  const endsAt = new Date(startsAt.getTime() + f.durationMinutes * 60_000);
  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        // Lock technicians in id order (as booking/service.ts does) to avoid deadlocks.
        const techIds = [...new Set([existing.technicianId, f.technicianId].filter((v): v is string => Boolean(v)))].sort();
        for (const id of techIds) await lockTechnician(tx, id);
        await lockHelpDay(tx, helpDayId);
        const day = await tx.techHelpDay.findUniqueOrThrow({ where: { id: helpDayId } });
        if (day.status === "CANCELED" || day.status === "COMPLETED") throw new FacilityError("Canceled or completed Tech Help Days cannot be edited.", "INVALID_STATUS");
        const booked = await tx.appointment.count({ where: { techHelpDayId: helpDayId, status: ACTIVE_WHERE } });
        const timingChanged =
          startsAt.getTime() !== day.startsAt.getTime() ||
          endsAt.getTime() !== day.endsAt.getTime() ||
          f.slotMinutes !== day.slotMinutes ||
          f.slotBufferMinutes !== day.slotBufferMinutes;
        const techChanged = f.technicianId !== day.technicianId;
        if (booked > 0 && timingChanged) {
          throw new FacilityError("Residents are already booked. Cancel their sessions before changing the time or slot length.", "HAS_BOOKINGS");
        }
        if (timingChanged || techChanged) {
          if (f.technicianId) await assertFacilityAndTech(tx, day.facilityId, f.technicianId);
          const conflicts = await findTechnicianConflicts(tx, {
            technicianId: f.technicianId,
            startsAt,
            endsAt,
            excludeHelpDayId: helpDayId,
            checkSchedule: !f.allowOutsideSchedule,
            travelBufferMinutes: booking.travelBufferMinutes,
            timeZone: tz,
          });
          if (conflicts.length > 0) throw new FacilityError(`The technician is not available for that time: ${describeConflicts(conflicts, tz)}.`, "TECH_CONFLICT", { conflicts });
        }
        if (techChanged && booked > 0) {
          await tx.appointment.updateMany({ where: { techHelpDayId: helpDayId, status: ACTIVE_WHERE }, data: { technicianId: f.technicianId } });
        }
        return tx.techHelpDay.update({
          where: { id: helpDayId },
          data: {
            technicianId: f.technicianId,
            startsAt,
            endsAt,
            slotMinutes: f.slotMinutes,
            slotBufferMinutes: f.slotBufferMinutes,
            location: f.location,
            paymentModel: f.paymentModel,
            residentPriceCents: f.residentPriceCents,
            sponsoredPriceCents: f.sponsoredPriceCents,
            notes: f.notes,
          },
        });
      },
      { isolationLevel: "ReadCommitted", timeout: 20_000 },
    );
    await audit({ actorUserId: input.actorUserId, action: "helpday.updated", entityType: "TechHelpDay", entityId: helpDayId });
    return updated;
  } catch (err) {
    if (isOverlapViolation(err)) throw new FacilityError("That technician already has an overlapping appointment.", "TECH_CONFLICT");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Slots & pricing
// ---------------------------------------------------------------------------

type PricedHelpDay = { paymentModel: HelpDayPaymentModel; residentPriceCents: number | null };

/** What a resident pays for one session. Sponsored and contract days are free to residents. */
export function residentPriceFor(helpDay: PricedHelpDay, facility: { residentRateCents: number | null }, serviceBasePriceCents: number): number {
  if (helpDay.paymentModel === "FACILITY_SPONSORED" || helpDay.paymentModel === "CONTRACT") return 0;
  return helpDay.residentPriceCents ?? facility.residentRateCents ?? serviceBasePriceCents;
}

async function residentService(client: Tx | typeof prisma) {
  const byslug = await client.service.findFirst({ where: { slug: RESIDENT_SERVICE_SLUG, isActive: true } });
  if (byslug) return byslug;
  const any = await client.service.findFirst({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  if (!any) throw new FacilityError("No active service is configured for Tech Help Day sessions.", "NO_SERVICE");
  return any;
}

/** Price shown to residents before booking. */
export async function residentPriceForHelpDay(helpDay: PricedHelpDay & { facility: { residentRateCents: number | null } }) {
  const service = await residentService(prisma);
  return residentPriceFor(helpDay, helpDay.facility, service.basePriceCents);
}

export type HelpDaySlot = { startsAt: Date; endsAt: Date; available: boolean };

/** Slot grid for a help day given its active resident appointments. */
export function slotGrid(
  helpDay: { startsAt: Date; endsAt: Date; slotMinutes: number; slotBufferMinutes: number },
  booked: Interval[],
  now: Date,
): HelpDaySlot[] {
  return helpDaySlots({ startsAt: helpDay.startsAt, endsAt: helpDay.endsAt, slotMinutes: helpDay.slotMinutes, slotBufferMinutes: helpDay.slotBufferMinutes, booked, now });
}

async function bookedIntervals(client: Tx | typeof prisma, helpDay: { id: string; technicianId: string | null; startsAt: Date; endsAt: Date }): Promise<Interval[]> {
  const rows = await client.appointment.findMany({
    where: {
      status: ACTIVE_WHERE,
      OR: [
        { techHelpDayId: helpDay.id },
        ...(helpDay.technicianId ? [{ technicianId: helpDay.technicianId, blockStartsAt: { lt: helpDay.endsAt }, blockEndsAt: { gt: helpDay.startsAt } }] : []),
      ],
    },
    select: { blockStartsAt: true, blockEndsAt: true },
  });
  return rows.map((r) => ({ start: r.blockStartsAt, end: r.blockEndsAt }));
}

/**
 * Public view of a help day for the resident sign-up page. Contains no
 * resident information: only which slots are open.
 */
export async function getPublicHelpDay(helpDayId: string, now = new Date()) {
  const day = await prisma.techHelpDay.findUnique({
    where: { id: helpDayId },
    include: { facility: { select: { id: true, name: true, city: true, state: true, line1: true, residentRateCents: true } } },
  });
  if (!day) return null;
  const bookable = BOOKABLE_HELP_DAY_STATUSES.includes(day.status) && day.endsAt > now;
  const booked = bookable ? await bookedIntervals(prisma, day) : [];
  const slots = bookable ? slotGrid(day, booked, now) : [];
  const priceCents = await residentPriceForHelpDay(day);
  return {
    id: day.id,
    status: day.status,
    bookable,
    startsAt: day.startsAt,
    endsAt: day.endsAt,
    location: day.location,
    slotMinutes: day.slotMinutes,
    paymentModel: day.paymentModel,
    priceCents,
    facility: { name: day.facility.name, city: day.facility.city, state: day.facility.state, line1: day.facility.line1 },
    slots: slots.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, available: s.available })),
  };
}

// ---------------------------------------------------------------------------
// Booking a resident into a slot
// ---------------------------------------------------------------------------

export const residentBookingSchema = z.object({
  firstName: z.string().trim().min(1, "Please enter the resident's first name.").max(100),
  lastName: z.string().trim().min(1, "Please enter the resident's last name.").max(100),
  unit: z.string().trim().max(50).nullish().transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .max(30)
    .nullish()
    .refine((v) => !v || v.replace(/\D/g, "").length >= 10, "Please enter a 10-digit phone number.")
    .transform((v) => v || null),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .nullish()
    .refine((v) => !v || z.string().email().safeParse(v).success, "Please enter a valid email address.")
    .transform((v) => v || null),
});

export type BookHelpDaySlotInput = {
  helpDayId: string;
  startsAt: Date;
  resident: z.input<typeof residentBookingSchema>;
  /** Family member booking on the resident's behalf */
  requester?: { name: string; email?: string | null; phone?: string | null; relationship?: string | null } | null;
  problemDescription?: string | null;
  acceptedTerms: boolean;
  channel: "PUBLIC" | "STAFF";
  actorUserId?: string | null;
  existingCustomerId?: string | null;
  now?: Date;
};

export type BookHelpDaySlotResult = { appointmentId: string; reference: string; customerId: string; priceCents: number };

export async function bookHelpDaySlot(input: BookHelpDaySlotInput): Promise<BookHelpDaySlotResult> {
  const now = input.now ?? new Date();
  const isPublic = input.channel === "PUBLIC";
  if (isPublic && !input.acceptedTerms) throw new FacilityError("Please review and accept the terms to continue.", "TERMS");
  const parsed = residentBookingSchema.safeParse(input.resident);
  if (!parsed.success) throw new FacilityError(parsed.error.issues[0]?.message ?? "Please check the form.", "VALIDATION");
  const resident = parsed.data;
  if (isPublic && !resident.phone && !resident.email && !input.requester?.phone && !input.requester?.email) {
    throw new FacilityError("Please give a phone number or email so we can reach you if anything changes.", "VALIDATION");
  }
  const requester = input.requester?.name?.trim() ? input.requester : null;

  const helpDay = await prisma.techHelpDay.findUnique({ where: { id: input.helpDayId }, include: { facility: true } });
  if (!helpDay) throw new FacilityError("That Tech Help Day was not found.", "NOT_FOUND");
  if (!BOOKABLE_HELP_DAY_STATUSES.includes(helpDay.status)) throw new FacilityError("This Tech Help Day is no longer taking sign-ups.", "NOT_BOOKABLE");

  // The slot must be exactly one of the grid slots.
  const grid = slotGrid(helpDay, [], isPublic ? now : new Date(0));
  const slot = grid.find((s) => s.startsAt.getTime() === input.startsAt.getTime());
  if (!slot) throw new FacilityError("Please choose one of the listed times.", "SLOT_INVALID");
  if (isPublic && !slot.available) throw new FacilityError("That time has already passed. Please choose another time.", "SLOT_INVALID");

  const [service, biz] = await Promise.all([residentService(prisma), getSettings("business")]);
  const priceCents = residentPriceFor(helpDay, helpDay.facility, service.basePriceCents);
  const slotEnd = slot.endsAt;
  const blockEnd = new Date(slotEnd.getTime() + helpDay.slotBufferMinutes * 60_000);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await lockForHelpDay(tx, helpDay);
        const fresh = await tx.techHelpDay.findUniqueOrThrow({ where: { id: helpDay.id } });
        if (!BOOKABLE_HELP_DAY_STATUSES.includes(fresh.status)) throw new FacilityError("This Tech Help Day is no longer taking sign-ups.", "NOT_BOOKABLE");
        if (fresh.technicianId !== helpDay.technicianId || fresh.startsAt.getTime() !== helpDay.startsAt.getTime()) {
          throw new FacilityError("This Tech Help Day was just changed. Please refresh and choose a time again.", "CHANGED");
        }
        const overlapping = await tx.appointment.count({
          where: {
            status: ACTIVE_WHERE,
            blockStartsAt: { lt: blockEnd },
            blockEndsAt: { gt: slot.startsAt },
            OR: [{ techHelpDayId: helpDay.id }, ...(helpDay.technicianId ? [{ technicianId: helpDay.technicianId }] : [])],
          },
        });
        if (overlapping > 0) throw new FacilityError("Sorry, that time was just taken. Please choose another time.", "SLOT_TAKEN");

        // Resident record: explicit, else by email, else same name + unit/phone at this facility.
        let customerId = input.existingCustomerId ?? null;
        if (customerId) {
          const c = await tx.customer.findUnique({ where: { id: customerId } });
          if (!c) throw new FacilityError("Customer not found.", "NOT_FOUND");
        }
        if (!customerId && resident.email) {
          const m = await tx.customer.findFirst({ where: { email: { equals: resident.email, mode: "insensitive" } }, orderBy: { createdAt: "asc" } });
          customerId = m?.id ?? null;
        }
        if (!customerId && (resident.unit || resident.phone)) {
          const m = await tx.customer.findFirst({
            where: {
              facilityId: helpDay.facilityId,
              firstName: { equals: resident.firstName, mode: "insensitive" },
              lastName: { equals: resident.lastName, mode: "insensitive" },
              OR: [...(resident.unit ? [{ facilityUnit: { equals: resident.unit, mode: "insensitive" as const } }] : []), ...(resident.phone ? [{ phone: resident.phone }] : [])],
            },
            orderBy: { createdAt: "asc" },
          });
          customerId = m?.id ?? null;
        }
        if (customerId) {
          const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
          await tx.customer.update({
            where: { id: customerId },
            data: {
              facilityId: c.facilityId ?? helpDay.facilityId,
              facilityUnit: c.facilityId && c.facilityId !== helpDay.facilityId ? c.facilityUnit : (resident.unit ?? c.facilityUnit),
              phone: c.phone ?? resident.phone,
              email: c.email ?? resident.email,
            },
          });
          if (isPublic) {
            const already = await tx.appointment.count({ where: { techHelpDayId: helpDay.id, customerId, status: ACTIVE_WHERE } });
            if (already > 0) throw new FacilityError("This resident already has a time reserved at this Tech Help Day. Please call us if you need another session.", "ALREADY_BOOKED");
          }
        } else {
          const c = await tx.customer.create({
            data: {
              firstName: resident.firstName,
              lastName: resident.lastName,
              email: resident.email,
              phone: resident.phone,
              contactPreference: resident.phone ? "PHONE" : "EMAIL",
              status: "ACTIVE",
              leadSource: `Tech Help Day: ${helpDay.facility.name}`,
              facilityId: helpDay.facilityId,
              facilityUnit: resident.unit,
            },
          });
          customerId = c.id;
        }

        // Visit address = the facility, with the resident's unit.
        let addressId: string | null = null;
        const fac = helpDay.facility;
        if (fac.line1 && fac.city && fac.postalCode) {
          const line2 = resident.unit ? `Unit ${resident.unit}` : null;
          const existingAddr = await tx.address.findFirst({ where: { customerId, line1: { equals: fac.line1, mode: "insensitive" }, postalCode: fac.postalCode } });
          if (existingAddr) addressId = existingAddr.id;
          else {
            const hasPrimary = await tx.address.count({ where: { customerId, isPrimary: true } });
            const a = await tx.address.create({
              data: { customerId, label: fac.name, line1: fac.line1, line2, city: fac.city, state: fac.state, postalCode: fac.postalCode, county: fac.county, lat: fac.lat, lng: fac.lng, isPrimary: hasPrimary === 0 },
            });
            addressId = a.id;
          }
        }

        if (requester) {
          const exists = await tx.familyContact.findFirst({
            where: {
              customerId,
              OR: [...(requester.email ? [{ email: { equals: requester.email, mode: "insensitive" as const } }] : []), { name: { equals: requester.name.trim(), mode: "insensitive" as const } }],
            },
          });
          if (!exists) {
            await tx.familyContact.create({
              data: {
                customerId,
                name: requester.name.trim().slice(0, 200),
                relationship: requester.relationship?.trim().slice(0, 100) || null,
                email: requester.email?.trim().toLowerCase() || null,
                phone: requester.phone?.trim() || null,
                canSchedule: true,
                canReceiveUpdates: Boolean(requester.email),
                canViewServiceDetails: false,
                notes: "Added from a Tech Help Day sign-up. Confirm permissions with the resident.",
              },
            });
          }
        }

        const reference = randomCode(6);
        const breakdown = {
          lines: [{ kind: "SERVICE", label: `${service.name} (${helpDay.facility.name})`, amountCents: priceCents }],
          subtotalCents: priceCents,
          discountCents: 0,
          taxCents: 0,
          totalCents: priceCents,
          isStartingPrice: false,
          isCustomQuote: false,
          note: priceCents === 0 ? `Sponsored by ${helpDay.facility.name}` : undefined,
        };
        const appt = await tx.appointment.create({
          data: {
            reference,
            status: "CONFIRMED",
            source: "FACILITY_DAY",
            customerId,
            addressId,
            serviceId: service.id,
            technicianId: helpDay.technicianId,
            facilityId: helpDay.facilityId,
            techHelpDayId: helpDay.id,
            startsAt: slot.startsAt,
            endsAt: slotEnd,
            blockStartsAt: slot.startsAt,
            blockEndsAt: blockEnd,
            isRemote: false,
            bookedForSelf: !requester,
            requesterName: requester?.name.trim() ?? null,
            requesterEmail: requester?.email?.trim().toLowerCase() || null,
            requesterPhone: requester?.phone?.trim() || null,
            requesterRelation: requester?.relationship?.trim() || null,
            problemDescription: input.problemDescription?.trim().slice(0, 4000) || null,
            estimatedTotalCents: priceCents,
            estimateBreakdown: breakdown as unknown as Prisma.InputJsonValue,
            leadSource: `Tech Help Day: ${helpDay.facility.name}`,
            confirmedAt: now,
          },
        });
        await tx.appointmentStatusChange.create({
          data: { appointmentId: appt.id, fromStatus: null, toStatus: "CONFIRMED", changedById: input.actorUserId ?? null, note: `Tech Help Day sign-up (${isPublic ? "online" : "staff"})` },
        });
        await tx.consentRecord.create({
          data: {
            customerId,
            type: "TERMS_ACCEPTED",
            granted: true,
            method: isPublic ? "WEB_FORM" : "VERBAL",
            grantedByName: requester ? requester.name.trim() : `${resident.firstName} ${resident.lastName}`,
            appointmentId: appt.id,
            recordedById: input.actorUserId ?? null,
          },
        });

        // Confirmation to the resident and/or the family member who booked.
        const recipients = [...new Set([resident.email, requester?.email?.trim().toLowerCase()].filter((e): e is string => Boolean(e)))];
        for (const to of recipients) {
          await queueTemplatedEmail({
            tx,
            templateKey: "appointment_confirmed",
            to,
            customerId,
            vars: {
              customerName: resident.firstName,
              serviceName: service.name,
              appointmentDate: formatDate(slot.startsAt, biz.timeZone),
              appointmentTime: formatTime(slot.startsAt, biz.timeZone),
              appointmentReference: reference,
              appointmentLocation: [helpDay.location, helpDay.facility.name].filter(Boolean).join(", "),
              technicianName: "Your technician",
              manageUrl: `${env.appUrl}/portal`,
            },
            idempotencyKey: `helpday-booking:${appt.id}:${to}`,
            relatedType: "Appointment",
            relatedId: appt.id,
          });
        }
        return { appointmentId: appt.id, reference, customerId, priceCents };
      },
      { isolationLevel: "ReadCommitted", timeout: 20_000 },
    );
    await audit({
      actorUserId: input.actorUserId ?? null,
      action: "helpday.slot_booked",
      entityType: "Appointment",
      entityId: result.appointmentId,
      metadata: { helpDayId: helpDay.id, facilityId: helpDay.facilityId, channel: input.channel },
    });
    return result;
  } catch (err) {
    if (isOverlapViolation(err)) throw new FacilityError("Sorry, that time was just taken. Please choose another time.", "SLOT_TAKEN");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

/** Contacts who receive help-day notices: Primary and Activities Director, else anyone with an email. */
export function helpDayRecipients(
  facility: { email: string | null; name: string },
  contacts: { name: string; email: string | null; role: string }[],
): { email: string; name: string }[] {
  const withEmail = contacts.filter((c) => c.email);
  const preferred = withEmail.filter((c) => c.role === "PRIMARY" || c.role === "ACTIVITIES_DIRECTOR");
  const list = (preferred.length ? preferred : withEmail).map((c) => ({ email: c.email!.toLowerCase(), name: c.name.split(" ")[0] }));
  if (list.length === 0 && facility.email) list.push({ email: facility.email.toLowerCase(), name: facility.name });
  const seen = new Set<string>();
  return list.filter((r) => (seen.has(r.email) ? false : (seen.add(r.email), true)));
}

export function helpDaySignupUrl(helpDayId: string) {
  return `${env.appUrl}/help-days/${helpDayId}`;
}

/** SCHEDULED -> CONFIRMED and email the facility's primary/activities contacts. */
export async function confirmHelpDay(helpDayId: string, actorUserId?: string | null) {
  const day = await prisma.techHelpDay.findUniqueOrThrow({ where: { id: helpDayId }, include: { facility: { include: { contacts: true } } } });
  if (day.status !== "SCHEDULED" && day.status !== "CONFIRMED") throw new FacilityError("Only scheduled Tech Help Days can be confirmed.", "INVALID_STATUS");
  if (day.status === "SCHEDULED") {
    const res = await prisma.techHelpDay.updateMany({ where: { id: helpDayId, status: "SCHEDULED" }, data: { status: "CONFIRMED" } });
    if (res.count === 0) throw new FacilityError("This Tech Help Day was changed by someone else. Please refresh.", "CONFLICT");
  }
  const biz = await getSettings("business");
  const recipients = helpDayRecipients(day.facility, day.facility.contacts);
  let queued = 0;
  for (const r of recipients) {
    const res = await queueTemplatedEmail({
      templateKey: "tech_help_day_confirmed",
      to: r.email,
      facilityId: day.facilityId,
      vars: {
        contactName: r.name,
        facilityName: day.facility.name,
        helpDayDate: formatDate(day.startsAt, biz.timeZone),
        helpDayTime: `${formatTime(day.startsAt, biz.timeZone)} to ${formatTime(day.endsAt, biz.timeZone)}`,
        helpDayLocation: day.location || day.facility.name,
        signupUrl: helpDaySignupUrl(day.id),
      },
      idempotencyKey: `helpday-confirmed:${day.id}:${day.startsAt.toISOString()}:${r.email}`,
      relatedType: "TechHelpDay",
      relatedId: day.id,
      createdById: actorUserId ?? null,
    });
    if (res.queued) queued++;
  }
  await audit({ actorUserId, action: "helpday.confirmed", entityType: "TechHelpDay", entityId: helpDayId, metadata: { facilityId: day.facilityId, emailsQueued: queued } });
  return { queued, recipients: recipients.length };
}

/**
 * Cancels a help day. If residents are booked, the caller must pass
 * cancelResidentAppointments: true (staff confirmation); their sessions are
 * canceled with status history and cancellation emails.
 */
export async function cancelHelpDay(helpDayId: string, opts: { actorUserId?: string | null; reason?: string | null; cancelResidentAppointments: boolean }) {
  const day = await prisma.techHelpDay.findUniqueOrThrow({ where: { id: helpDayId } });
  if (day.status === "CANCELED") return { canceledAppointments: 0 };
  if (day.status === "COMPLETED") throw new FacilityError("Completed Tech Help Days cannot be canceled.", "INVALID_STATUS");
  const reason = opts.reason?.trim().slice(0, 500) || "Tech Help Day canceled";
  const now = new Date();
  const canceledIds = await prisma.$transaction(
    async (tx) => {
      await lockForHelpDay(tx, day);
      const active = await tx.appointment.findMany({ where: { techHelpDayId: helpDayId, status: ACTIVE_WHERE, NOT: { status: "COMPLETED" } } });
      if (active.length > 0 && !opts.cancelResidentAppointments) {
        throw new FacilityError(`${active.length} resident session(s) are booked. Confirm that their sessions should be canceled too.`, "NEEDS_CONFIRMATION", { count: active.length });
      }
      for (const a of active) {
        const res = await tx.appointment.updateMany({ where: { id: a.id, status: a.status }, data: { status: "CANCELED", canceledAt: now, cancelReason: reason } });
        if (res.count === 0) continue;
        await tx.appointmentStatusChange.create({ data: { appointmentId: a.id, fromStatus: a.status, toStatus: "CANCELED", changedById: opts.actorUserId ?? null, note: reason } });
      }
      await tx.techHelpDay.update({ where: { id: helpDayId }, data: { status: "CANCELED" } });
      return active.map((a) => a.id);
    },
    { isolationLevel: "ReadCommitted", timeout: 20_000 },
  );
  for (const id of canceledIds) {
    await notifyAppointment(id, "appointment_canceled", {}, `helpday-canceled:${helpDayId}`).catch((e) => console.error("[helpday] cancel notice failed", (e as Error).message));
  }
  await audit({ actorUserId: opts.actorUserId, action: "helpday.canceled", entityType: "TechHelpDay", entityId: helpDayId, metadata: { facilityId: day.facilityId, canceledAppointments: canceledIds.length } });
  return { canceledAppointments: canceledIds.length };
}

/** Marks the day completed; optionally marks its still-active resident sessions completed. */
export async function completeHelpDay(helpDayId: string, opts: { actorUserId?: string | null; markAppointmentsCompleted: boolean; now?: Date }) {
  const day = await prisma.techHelpDay.findUniqueOrThrow({ where: { id: helpDayId } });
  if (day.status === "CANCELED") throw new FacilityError("A canceled Tech Help Day cannot be completed.", "INVALID_STATUS");
  if (day.startsAt > (opts.now ?? new Date())) throw new FacilityError("A Tech Help Day can only be completed after it starts.", "INVALID_STATUS");
  let completed = 0;
  await prisma.$transaction(async (tx) => {
    await lockForHelpDay(tx, day);
    if (opts.markAppointmentsCompleted) {
      const active = await tx.appointment.findMany({ where: { techHelpDayId: helpDayId, status: { in: ["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] } } });
      for (const a of active) {
        const res = await tx.appointment.updateMany({ where: { id: a.id, status: a.status }, data: { status: "COMPLETED" } });
        if (res.count === 0) continue;
        completed++;
        await tx.appointmentStatusChange.create({ data: { appointmentId: a.id, fromStatus: a.status, toStatus: "COMPLETED", changedById: opts.actorUserId ?? null, note: "Tech Help Day completed" } });
      }
    }
    await tx.techHelpDay.update({ where: { id: helpDayId }, data: { status: "COMPLETED" } });
  });
  await audit({ actorUserId: opts.actorUserId, action: "helpday.completed", entityType: "TechHelpDay", entityId: helpDayId, metadata: { facilityId: day.facilityId, appointmentsCompleted: completed } });
  return { appointmentsCompleted: completed };
}

/** Cancels one resident session (staff). Uses the standard status workflow, history and email. */
export async function cancelResidentAppointment(appointmentId: string, actor: { id: string; role: Role }, reason?: string | null) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || !appt.techHelpDayId) throw new FacilityError("That is not a Tech Help Day session.", "NOT_FOUND");
  await changeAppointmentStatus({ appointmentId, to: "CANCELED", actor: { id: actor.id, role: actor.role }, cancelReason: reason?.trim() || "Canceled by staff" });
  return appt.techHelpDayId;
}

// ---------------------------------------------------------------------------
// Admin queries
// ---------------------------------------------------------------------------

export async function listHelpDays(filters: { facilityId?: string | null; technicianId?: string | null; status?: string | null; range?: "upcoming" | "past" | "all"; now?: Date } = {}) {
  const now = filters.now ?? new Date();
  const where: Prisma.TechHelpDayWhereInput = {};
  if (filters.facilityId) where.facilityId = filters.facilityId;
  if (filters.technicianId) where.technicianId = filters.technicianId;
  if (filters.status && ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED"].includes(filters.status)) where.status = filters.status as HelpDayStatus;
  const range = filters.range ?? "upcoming";
  if (range === "upcoming") where.endsAt = { gte: now };
  if (range === "past") where.endsAt = { lt: now };
  return prisma.techHelpDay.findMany({
    where,
    orderBy: { startsAt: range === "past" ? "desc" : "asc" },
    take: 300,
    include: {
      facility: { select: { id: true, name: true } },
      technician: { select: { id: true, displayName: true } },
      series: { select: { id: true, frequency: true } },
      _count: { select: { appointments: { where: { status: ACTIVE_WHERE } } } },
    },
  });
}

/** Full staff view, including resident sessions (staff only — never expose to facility contacts). */
export async function getHelpDayForStaff(helpDayId: string, now = new Date()) {
  const day = await prisma.techHelpDay.findUnique({
    where: { id: helpDayId },
    include: {
      facility: true,
      technician: { select: { id: true, displayName: true } },
      series: true,
      invoices: { orderBy: { createdAt: "desc" } },
      appointments: {
        orderBy: { startsAt: "asc" },
        include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, facilityUnit: true } } },
      },
    },
  });
  if (!day) return null;
  const active = day.appointments.filter((a) => !INACTIVE.includes(a.status));
  const booked = await bookedIntervals(prisma, day);
  const grid = slotGrid(day, booked, now).map((s) => ({
    ...s,
    appointment: active.find((a) => a.startsAt < s.endsAt && s.startsAt < a.endsAt) ?? null,
  }));
  const service = await residentService(prisma);
  return { day, grid, activeAppointments: active, residentPriceCents: residentPriceFor(day, day.facility, service.basePriceCents) };
}
