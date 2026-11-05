"use server";

import { revalidatePath } from "next/cache";
import { BookingError, changeAppointmentStatus, findAppointmentByManageToken, rescheduleAppointment } from "@/lib/booking/service";
import { canCustomerModify } from "@/lib/booking/status";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { runDueJobs } from "@/lib/jobs/queue";
import "@/lib/email/send";

export type ManageResult = { ok: boolean; message?: string; error?: string };

async function load(token: string) {
  const ip = (await clientIp()) ?? "unknown";
  if (!(await rateLimit(`manage:${ip}`, 30, 3600))) throw new BookingError("Too many requests. Please call us.", "RATE");
  const appt = await findAppointmentByManageToken(token);
  if (!appt) throw new BookingError("We could not find that appointment. The link may be out of date.", "NOT_FOUND");
  const cancellation = await getSettings("cancellation");
  const check = canCustomerModify({ status: appt.status, startsAt: appt.startsAt, now: new Date(), freeCancellationHours: cancellation.freeCancellationHours });
  if (!check.allowed) throw new BookingError(check.reason!, "LOCKED");
  return { appt, cancellation };
}

export async function cancelByTokenAction(token: string, reason: string): Promise<ManageResult> {
  try {
    const { appt } = await load(token);
    await changeAppointmentStatus({ appointmentId: appt.id, to: "CANCELED", actor: { id: null, role: "CUSTOMER" }, cancelReason: reason.slice(0, 500) || "Canceled by customer online" });
    await audit({ action: "appointment.canceled_by_customer", entityType: "Appointment", entityId: appt.id });
    await runDueJobs({ limit: 5 }).catch(() => undefined);
    revalidatePath("/appointments/manage");
    return { ok: true, message: "Your appointment has been canceled." };
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function rescheduleByTokenAction(token: string, startsAtIso: string): Promise<ManageResult> {
  try {
    const { appt, cancellation } = await load(token);
    if (!cancellation.allowOnlineReschedule) return { ok: false, error: "Please call us to reschedule." };
    const startsAt = new Date(startsAtIso);
    if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "Please choose a new time." };
    await rescheduleAppointment({ appointmentId: appt.id, startsAt, actor: { id: null, role: "PUBLIC" } });
    await audit({ action: "appointment.rescheduled_by_customer", entityType: "Appointment", entityId: appt.id });
    await runDueJobs({ limit: 5 }).catch(() => undefined);
    revalidatePath("/appointments/manage");
    return { ok: true, message: "Your appointment has been moved." };
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, error: err.message };
    throw err;
  }
}
