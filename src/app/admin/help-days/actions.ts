"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { failure, fd, fdBool, fdOptional, success, type ActionState } from "@/lib/forms";
import { parseDollarsToCents } from "@/lib/money";
import { formatDateKeyLong } from "@/lib/time";
import { BookingError } from "@/lib/booking/service";
import { FacilityError } from "@/lib/facilities/errors";
import {
  bookHelpDaySlot,
  cancelHelpDay,
  cancelResidentAppointment,
  completeHelpDay,
  confirmHelpDay,
  createHelpDay,
  createHelpDaySeries,
  updateHelpDay,
  type HelpDayFields,
} from "@/lib/facilities/help-days";
import { createSponsoredHelpDayInvoice } from "@/lib/facilities/billing";
import { SERIES_FREQUENCIES, type SeriesFrequency } from "@/lib/facilities/recurrence";
import { runDueJobs } from "@/lib/jobs/queue";
import "@/lib/email/send";

function handle(err: unknown): ActionState {
  if (err instanceof FacilityError || err instanceof BookingError) return failure(err.message);
  console.error("[help-days] action failed", (err as Error).message);
  return failure("Something went wrong. Please try again.");
}

function timeToMinutes(v: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) throw new FacilityError("Please enter a start time.", "VALIDATION");
  return Number(m[1]) * 60 + Number(m[2]);
}

function dateKey(formData: FormData, key: string, label = "a date"): string {
  const v = fd(formData, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new FacilityError(`Please choose ${label}.`, "VALIDATION");
  return v;
}

function cents(formData: FormData, key: string, label: string): number | null {
  const raw = fd(formData, key);
  if (!raw) return null;
  const v = parseDollarsToCents(raw);
  if (v == null || v < 0) throw new FacilityError(`${label} must be a dollar amount like 45 or 45.00.`, "VALIDATION");
  return v;
}

function int(formData: FormData, key: string, fallback: number): number {
  const raw = fd(formData, key);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new FacilityError("Please enter whole numbers of minutes.", "VALIDATION");
  return n;
}

function helpDayFields(formData: FormData): HelpDayFields {
  return {
    facilityId: fd(formData, "facilityId"),
    technicianId: fdOptional(formData, "technicianId"),
    startMinute: timeToMinutes(fd(formData, "startTime")),
    durationMinutes: int(formData, "durationMinutes", 180),
    slotMinutes: int(formData, "slotMinutes", 30),
    slotBufferMinutes: int(formData, "slotBufferMinutes", 0),
    location: fdOptional(formData, "location"),
    paymentModel: (fd(formData, "paymentModel") || "RESIDENT_PAID") as HelpDayFields["paymentModel"],
    residentPriceCents: cents(formData, "residentPrice", "Resident price"),
    sponsoredPriceCents: cents(formData, "sponsoredPrice", "Sponsored price"),
    notes: fdOptional(formData, "notes"),
    allowOutsideSchedule: fdBool(formData, "allowOutsideSchedule"),
  };
}

const dayPath = (id: string) => `/admin/help-days/${id}`;

export async function createHelpDayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  let id: string;
  try {
    const day = await createHelpDay({ ...helpDayFields(formData), dateKey: dateKey(formData, "date"), actorUserId: user.id });
    id = day.id;
  } catch (err) {
    return handle(err);
  }
  revalidatePath("/admin/help-days");
  redirect(dayPath(id));
}

export async function createHelpDaySeriesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  try {
    const frequency = fd(formData, "frequency") as SeriesFrequency;
    if (!SERIES_FREQUENCIES.includes(frequency)) throw new FacilityError("Choose how often the Tech Help Day repeats.", "VALIDATION");
    const untilDateKey = fdOptional(formData, "untilDate");
    const countRaw = fd(formData, "count");
    const r = await createHelpDaySeries({
      ...helpDayFields(formData),
      frequency,
      dayOfWeek: int(formData, "dayOfWeek", -1),
      weekOfMonth: frequency === "MONTHLY_NTH_WEEKDAY" ? int(formData, "weekOfMonth", 0) : null,
      startDateKey: dateKey(formData, "startDate", "a first date"),
      untilDateKey: untilDateKey && /^\d{4}-\d{2}-\d{2}$/.test(untilDateKey) ? untilDateKey : null,
      count: countRaw ? int(formData, "count", 0) : null,
      actorUserId: user.id,
    });
    revalidatePath("/admin/help-days");
    const details = r.skipped.map((s) => `Skipped ${formatDateKeyLong(s.dateKey)}: ${s.reason}`);
    const message =
      r.created.length === 0
        ? "No Tech Help Days were created. Every date conflicted with the technician's schedule (see below)."
        : `Created ${r.created.length} Tech Help Day${r.created.length === 1 ? "" : "s"}${r.skipped.length ? `; ${r.skipped.length} date${r.skipped.length === 1 ? " was" : "s were"} skipped` : ""}.`;
    return r.created.length === 0 ? { ok: false, error: message, data: { details } } : success(message, { details });
  } catch (err) {
    return handle(err);
  }
}

export async function updateHelpDayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const id = fd(formData, "id");
  try {
    const { facilityId: _facilityId, ...fields } = helpDayFields(formData);
    void _facilityId;
    await updateHelpDay(id, { ...fields, dateKey: dateKey(formData, "date"), actorUserId: user.id });
  } catch (err) {
    return handle(err);
  }
  revalidatePath(dayPath(id));
  return success("Tech Help Day saved.");
}

export async function confirmHelpDayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const id = fd(formData, "id");
  try {
    const r = await confirmHelpDay(id, user.id);
    await runDueJobs({ limit: 5 }).catch(() => undefined);
    revalidatePath(dayPath(id));
    return success(
      r.recipients === 0
        ? "Confirmed. No contact email is on file, so no confirmation email was sent."
        : `Confirmed. ${r.queued ? `Confirmation emailed to ${r.queued} contact${r.queued === 1 ? "" : "s"}.` : "Contacts were already notified."}`,
    );
  } catch (err) {
    return handle(err);
  }
}

export async function cancelHelpDayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const id = fd(formData, "id");
  try {
    const r = await cancelHelpDay(id, { actorUserId: user.id, reason: fdOptional(formData, "reason"), cancelResidentAppointments: fdBool(formData, "cancelResidents") });
    await runDueJobs({ limit: 10 }).catch(() => undefined);
    revalidatePath(dayPath(id));
    return success(`Tech Help Day canceled.${r.canceledAppointments ? ` ${r.canceledAppointments} resident session(s) canceled and notified.` : ""}`);
  } catch (err) {
    return handle(err);
  }
}

export async function completeHelpDayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const id = fd(formData, "id");
  try {
    const r = await completeHelpDay(id, { actorUserId: user.id, markAppointmentsCompleted: fdBool(formData, "markCompleted") });
    revalidatePath(dayPath(id));
    return success(`Tech Help Day marked completed.${r.appointmentsCompleted ? ` ${r.appointmentsCompleted} session(s) marked completed.` : ""}`);
  } catch (err) {
    return handle(err);
  }
}

export async function bookResidentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  const id = fd(formData, "id");
  try {
    const startsAt = new Date(fd(formData, "startsAt"));
    if (Number.isNaN(startsAt.getTime())) throw new FacilityError("Please choose a time slot.", "VALIDATION");
    const requesterName = fdOptional(formData, "requesterName");
    const r = await bookHelpDaySlot({
      helpDayId: id,
      startsAt,
      resident: { firstName: fd(formData, "firstName"), lastName: fd(formData, "lastName"), unit: fdOptional(formData, "unit"), phone: fdOptional(formData, "phone"), email: fdOptional(formData, "email") },
      requester: requesterName ? { name: requesterName, phone: fdOptional(formData, "requesterPhone"), email: fdOptional(formData, "requesterEmail"), relationship: fdOptional(formData, "requesterRelation") } : null,
      problemDescription: fdOptional(formData, "problemDescription"),
      acceptedTerms: true,
      channel: "STAFF",
      actorUserId: user.id,
    });
    await runDueJobs({ limit: 5 }).catch(() => undefined);
    revalidatePath(dayPath(id));
    return success(`Booked. Reference ${r.reference}.`);
  } catch (err) {
    return handle(err);
  }
}

export async function cancelResidentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  try {
    const dayId = await cancelResidentAppointment(fd(formData, "id"), { id: user.id, role: user.role }, fdOptional(formData, "reason"));
    await runDueJobs({ limit: 5 }).catch(() => undefined);
    revalidatePath(dayPath(dayId));
  } catch (err) {
    return handle(err);
  }
  return success("Session canceled.");
}

export async function createSponsoredInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("facilities:manage");
  await requirePermission("billing:manage");
  const id = fd(formData, "id");
  try {
    const r = await createSponsoredHelpDayInvoice(id, user.id);
    revalidatePath(dayPath(id));
    return success(r.created ? `Draft invoice ${r.invoice.number} created.` : `Invoice ${r.invoice.number} already exists for this day.`);
  } catch (err) {
    return handle(err);
  }
}
