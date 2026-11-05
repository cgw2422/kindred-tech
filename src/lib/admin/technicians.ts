import { z } from "zod";
import type { BlackoutType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { zEmail, zPhone } from "@/lib/forms";
import { addDaysToKey, formatDateTime, localMinuteToUtc, startOfDayUtc } from "@/lib/time";
import { AdminError, assertCan, parseOrThrow, parseTimeToMinutes, zBool, zDateKey, zOptText, zText, type Actor } from "./common";

const PERM = "technicians:manage" as const;
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Appointment statuses that still hold time on the calendar. */
export const ACTIVE_APPOINTMENT_STATUSES = ["REQUESTED", "CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] as const;

// ---------------------------------------------------------------------------
// Technician profile
// ---------------------------------------------------------------------------

const technicianSchema = z.object({
  name: zText("Full name", 120),
  email: zEmail,
  phone: zPhone.optional().transform((v) => (v ? v : null)),
  displayName: zText("Display name", 80),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex color like #10375B."),
  homeBaseLine: zOptText("Home base address", 300),
  isActive: zBool,
});

export type TechnicianInput = z.input<typeof technicianSchema>;

/** Creates a TECHNICIAN user (no password; they sign in with an email link) plus the Technician row. */
export async function createTechnicianWithUser(actor: Actor, input: TechnicianInput | Record<string, unknown>) {
  assertCan(actor, PERM);
  const v = parseOrThrow(technicianSchema, input);
  const existing = await prisma.user.findUnique({ where: { email: v.email } });
  if (existing) throw new AdminError("A user with that email address already exists.", { email: "A user with that email address already exists." });
  const tech = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: v.email, name: v.name, phone: v.phone, role: "TECHNICIAN", isActive: true } });
    return tx.technician.create({
      data: { userId: user.id, displayName: v.displayName, color: v.color, homeBaseLine: v.homeBaseLine, isActive: v.isActive },
    });
  });
  await audit({ actorUserId: actor.id, action: "technician.create", entityType: "Technician", entityId: tech.id, metadata: { userId: tech.userId } });
  return tech;
}

export async function updateTechnician(actor: Actor, technicianId: string, input: TechnicianInput | Record<string, unknown>) {
  assertCan(actor, PERM);
  const v = parseOrThrow(technicianSchema, input);
  const tech = await prisma.technician.findUnique({ where: { id: technicianId } });
  if (!tech) throw new AdminError("That technician no longer exists.");
  const clash = await prisma.user.findUnique({ where: { email: v.email } });
  if (clash && clash.id !== tech.userId) throw new AdminError("Another user already uses that email address.", { email: "Another user already uses that email address." });
  const homeChanged = (tech.homeBaseLine ?? null) !== v.homeBaseLine;
  await prisma.$transaction([
    prisma.user.update({ where: { id: tech.userId }, data: { name: v.name, email: v.email, phone: v.phone } }),
    prisma.technician.update({
      where: { id: technicianId },
      data: {
        displayName: v.displayName,
        color: v.color,
        homeBaseLine: v.homeBaseLine,
        isActive: v.isActive,
        // Clear stale coordinates when the address text changes; routing re-geocodes.
        ...(homeChanged ? { homeBaseLat: null, homeBaseLng: null } : {}),
      },
    }),
  ]);
  await audit({ actorUserId: actor.id, action: "technician.update", entityType: "Technician", entityId: technicianId, metadata: { isActive: v.isActive } });
}

// ---------------------------------------------------------------------------
// Weekly schedule
// ---------------------------------------------------------------------------

export type ScheduleWindow = { dayOfWeek: number; startMinute: number; endMinute: number };

/** Returns human-readable problems; empty array means the windows are valid. */
export function scheduleWindowProblems(windows: ScheduleWindow[]): string[] {
  const problems: string[] = [];
  for (const w of windows) {
    const day = WEEKDAY_NAMES[w.dayOfWeek] ?? `Day ${w.dayOfWeek}`;
    if (!Number.isInteger(w.dayOfWeek) || w.dayOfWeek < 0 || w.dayOfWeek > 6) problems.push(`Invalid weekday ${w.dayOfWeek}.`);
    if (!Number.isInteger(w.startMinute) || !Number.isInteger(w.endMinute) || w.startMinute < 0 || w.endMinute > 1440) {
      problems.push(`${day}: times must be within the day.`);
      continue;
    }
    if (w.startMinute % 15 !== 0 || w.endMinute % 15 !== 0) problems.push(`${day}: times must be on 15-minute steps (:00, :15, :30, :45).`);
    if (w.startMinute >= w.endMinute) problems.push(`${day}: the start time must be before the end time.`);
  }
  for (let d = 0; d < 7; d++) {
    const dayWins = windows.filter((w) => w.dayOfWeek === d && w.startMinute < w.endMinute).sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < dayWins.length; i++) {
      if (dayWins[i].startMinute < dayWins[i - 1].endMinute) problems.push(`${WEEKDAY_NAMES[d]}: working hours overlap. Please combine or separate them.`);
    }
  }
  return [...new Set(problems)];
}

/** Parses schedule editor form fields named w_<day>_<row>_start / w_<day>_<row>_end ("HH:MM"). */
export function parseScheduleForm(form: Record<string, string>): ScheduleWindow[] {
  const windows: ScheduleWindow[] = [];
  const problems: string[] = [];
  for (const key of Object.keys(form)) {
    const m = /^w_(\d)_(\d+)_start$/.exec(key);
    if (!m) continue;
    const day = Number(m[1]);
    const start = (form[key] ?? "").trim();
    const end = (form[`w_${m[1]}_${m[2]}_end`] ?? "").trim();
    if (!start && !end) continue;
    if (!start || !end) {
      problems.push(`${WEEKDAY_NAMES[day]}: enter both a start and an end time (or clear both).`);
      continue;
    }
    const s = parseTimeToMinutes(start);
    const e = end === "23:59" ? 1440 : parseTimeToMinutes(end);
    if (s === null || e === null) {
      problems.push(`${WEEKDAY_NAMES[day]}: please enter valid times.`);
      continue;
    }
    windows.push({ dayOfWeek: day, startMinute: s, endMinute: e });
  }
  if (problems.length) throw new AdminError(problems.join(" "));
  return windows;
}

export async function saveWeeklySchedule(actor: Actor, technicianId: string, windows: ScheduleWindow[]) {
  assertCan(actor, PERM);
  const problems = scheduleWindowProblems(windows);
  if (problems.length) throw new AdminError(problems.join(" "));
  const tech = await prisma.technician.findUnique({ where: { id: technicianId } });
  if (!tech) throw new AdminError("That technician no longer exists.");
  await prisma.$transaction([
    prisma.technicianSchedule.deleteMany({ where: { technicianId } }),
    prisma.technicianSchedule.createMany({ data: windows.map((w) => ({ technicianId, ...w })) }),
  ]);
  await audit({ actorUserId: actor.id, action: "technician.schedule_update", entityType: "Technician", entityId: technicianId, metadata: { windows: windows.length } });
}

// ---------------------------------------------------------------------------
// Blackouts: technician time off and business-wide closures
// ---------------------------------------------------------------------------

const blackoutSchema = z
  .object({
    technicianId: z.preprocess((v) => (v === undefined ? null : v), z.string().min(1, "Missing technician.").nullable()),
    type: z.enum(["HOLIDAY", "BLOCKED", "TIME_OFF"]),
    allDay: zBool,
    startDate: zDateKey("Start date"),
    endDate: z
      .preprocess((v) => v ?? "", z.string())
      .transform((v) => v.trim())
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "End date must be a date."),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    reason: zOptText("Reason", 300),
  })
  .superRefine((v, ctx) => {
    if (v.technicianId === null && v.type === "TIME_OFF") ctx.addIssue({ code: "custom", path: ["type"], message: "Business-wide closures must be a holiday or blocked date." });
    if (v.technicianId !== null && v.type === "HOLIDAY") ctx.addIssue({ code: "custom", path: ["type"], message: "Use time off or blocked for a technician." });
  });

export type BlackoutInput = z.input<typeof blackoutSchema>;

export type BlackoutConflict = { id: string; reference: string; startsAt: Date; customerName: string; technicianName: string | null; status: string };

/** Active appointments that overlap a period (optionally for one technician). */
export async function findBlackoutConflicts(startsAt: Date, endsAt: Date, technicianId: string | null): Promise<BlackoutConflict[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(technicianId ? { technicianId } : {}),
    },
    orderBy: { startsAt: "asc" },
    take: 100,
    include: { customer: { select: { firstName: true, lastName: true } }, technician: { select: { displayName: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    reference: a.reference,
    startsAt: a.startsAt,
    status: a.status,
    customerName: `${a.customer.firstName} ${a.customer.lastName}`,
    technicianName: a.technician?.displayName ?? null,
  }));
}

/** One readable line per conflicting appointment, for warnings shown to staff. */
export function conflictLines(conflicts: BlackoutConflict[], tz: string): string[] {
  return conflicts.map(
    (c) => `${formatDateTime(c.startsAt, tz)} — ${c.customerName} (ref ${c.reference}${c.technicianName ? `, ${c.technicianName}` : ""}, ${c.status.toLowerCase().replace(/_/g, " ")})`,
  );
}

/**
 * Creates a blackout. All-day blackouts span local midnight on the start date to
 * local midnight after the end date (business time zone). Overlapping active
 * appointments are NOT moved — they are returned so staff can reschedule.
 */
export async function createBlackout(actor: Actor, input: BlackoutInput | Record<string, unknown>) {
  assertCan(actor, input.technicianId ? PERM : "settings:manage");
  const v = parseOrThrow(blackoutSchema, input);
  const tz = (await getSettings("business")).timeZone;
  const endDate = v.endDate || v.startDate;
  if (endDate < v.startDate) throw new AdminError("The end date must be on or after the start date.");
  let startsAt: Date;
  let endsAt: Date;
  if (v.allDay) {
    startsAt = startOfDayUtc(v.startDate, tz);
    endsAt = startOfDayUtc(addDaysToKey(endDate, 1), tz);
  } else {
    const s = parseTimeToMinutes(v.startTime ?? "");
    const e = parseTimeToMinutes(v.endTime ?? "");
    if (s === null || e === null) throw new AdminError("Enter a start and end time, or check \"All day\".");
    startsAt = localMinuteToUtc(v.startDate, s, tz);
    endsAt = localMinuteToUtc(endDate, e, tz);
  }
  if (endsAt <= startsAt) throw new AdminError("The end must be after the start.");
  if (endsAt.getTime() - startsAt.getTime() > 366 * 86400_000) throw new AdminError("A blackout can be at most one year long.");
  if (v.technicianId && !(await prisma.technician.findUnique({ where: { id: v.technicianId } }))) throw new AdminError("That technician no longer exists.");

  const blackout = await prisma.blackout.create({
    data: { technicianId: v.technicianId, type: v.type as BlackoutType, startsAt, endsAt, reason: v.reason },
  });
  const conflicts = await findBlackoutConflicts(startsAt, endsAt, v.technicianId);
  await audit({
    actorUserId: actor.id,
    action: v.technicianId ? "technician.time_off_create" : "closure.create",
    entityType: "Blackout",
    entityId: blackout.id,
    metadata: { type: v.type, technicianId: v.technicianId, conflicts: conflicts.length },
  });
  return { blackout, conflicts };
}

export async function deleteBlackout(actor: Actor, id: string) {
  const b = await prisma.blackout.findUnique({ where: { id } });
  if (!b) throw new AdminError("That entry no longer exists.");
  assertCan(actor, b.technicianId ? PERM : "settings:manage");
  await prisma.blackout.delete({ where: { id } });
  await audit({ actorUserId: actor.id, action: b.technicianId ? "technician.time_off_delete" : "closure.delete", entityType: "Blackout", entityId: id, metadata: { type: b.type } });
}
