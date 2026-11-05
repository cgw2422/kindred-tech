"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { failure, fd, fdBool, success, type ActionState } from "@/lib/forms";
import { BookingError, changeAppointmentStatus, rescheduleAppointment } from "@/lib/booking/service";
import { canCustomerModify } from "@/lib/booking/status";
import { getSettings } from "@/lib/settings";
import { assertAppointmentAccess, PortalAccessError, requireAccess } from "@/lib/portal/access";
import { rateLimit } from "@/lib/rate-limit";
import { runDueJobs } from "@/lib/jobs/queue";
import "@/lib/email/send";

async function checkModifiable(appointmentId: string) {
  const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  const cancellation = await getSettings("cancellation");
  const check = canCustomerModify({ status: appt.status, startsAt: appt.startsAt, now: new Date(), freeCancellationHours: cancellation.freeCancellationHours });
  if (!check.allowed) throw new BookingError(check.reason!, "LOCKED");
  return cancellation;
}

export async function portalCancelAction(appointmentId: string, reason: string): Promise<ActionState> {
  const user = await requirePermission("customer:portal");
  try {
    await assertAppointmentAccess(user, appointmentId, "schedule");
    await checkModifiable(appointmentId);
    await changeAppointmentStatus({ appointmentId, to: "CANCELED", actor: { id: user.id, role: "CUSTOMER" }, cancelReason: reason.slice(0, 500) || "Canceled in customer portal" });
    await audit({ actorUserId: user.id, action: "appointment.canceled_in_portal", entityType: "Appointment", entityId: appointmentId });
    await runDueJobs({ limit: 5 }).catch(() => undefined);
    revalidatePath("/portal/appointments");
    return success("Your appointment has been canceled.");
  } catch (err) {
    if (err instanceof BookingError || err instanceof PortalAccessError) return failure(err.message);
    throw err;
  }
}

export async function portalRescheduleAction(appointmentId: string, startsAtIso: string): Promise<ActionState> {
  const user = await requirePermission("customer:portal");
  try {
    await assertAppointmentAccess(user, appointmentId, "schedule");
    const cancellation = await checkModifiable(appointmentId);
    if (!cancellation.allowOnlineReschedule) return failure("Please call us to reschedule.");
    const startsAt = new Date(startsAtIso);
    if (Number.isNaN(startsAt.getTime())) return failure("Please choose a new time.");
    await rescheduleAppointment({ appointmentId, startsAt, actor: { id: user.id, role: "CUSTOMER" } });
    await audit({ actorUserId: user.id, action: "appointment.rescheduled_in_portal", entityType: "Appointment", entityId: appointmentId });
    await runDueJobs({ limit: 5 }).catch(() => undefined);
    revalidatePath("/portal/appointments");
    return success("Your appointment has been moved.");
  } catch (err) {
    if (err instanceof BookingError || err instanceof PortalAccessError) return failure(err.message);
    throw err;
  }
}

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().min(1, "Last name is required.").max(60),
  preferredName: z.string().trim().max(60),
  phone: z.string().trim().max(30).refine((v) => v === "" || v.replace(/\D/g, "").length >= 10, "Please enter a 10-digit phone number."),
  bestTimeToContact: z.string().trim().max(120),
  contactPreference: z.enum(["EMAIL", "PHONE", "TEXT", "MAIL"]),
});

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("customer:portal");
  if (!user.customerId) return failure("Your sign-in is not linked to a customer record. Please contact us to update details.");
  const parsed = profileSchema.safeParse(Object.fromEntries(["firstName", "lastName", "preferredName", "phone", "bestTimeToContact", "contactPreference"].map((k) => [k, fd(formData, k)])));
  if (!parsed.success) return failure(parsed.error.issues[0].message);
  const v = parsed.data;
  const marketing = fdBool(formData, "marketingOptIn");
  const current = await prisma.customer.findUniqueOrThrow({ where: { id: user.customerId } });
  await prisma.customer.update({
    where: { id: user.customerId },
    data: {
      firstName: v.firstName,
      lastName: v.lastName,
      preferredName: v.preferredName || null,
      phone: v.phone || null,
      bestTimeToContact: v.bestTimeToContact || null,
      contactPreference: v.contactPreference,
      marketingOptIn: marketing,
      marketingOptInAt: marketing && !current.marketingOptIn ? new Date() : marketing ? current.marketingOptInAt : null,
    },
  });
  if (marketing !== current.marketingOptIn) {
    await prisma.consentRecord.create({ data: { customerId: user.customerId, type: "MARKETING_EMAIL", granted: marketing, method: "WEB_FORM", grantedByName: user.name } });
  }
  await audit({ actorUserId: user.id, action: "customer.profile_updated_in_portal", entityType: "Customer", entityId: user.customerId });
  revalidatePath("/portal/profile");
  return success("Your details have been saved.");
}

export async function supportRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("customer:portal");
  const customerId = fd(formData, "customerId") || user.customerId;
  if (!customerId) return failure("Please contact us by phone or the contact form.");
  try {
    await requireAccess(user, customerId, "schedule");
  } catch {
    if (customerId !== user.customerId) return failure("You do not have permission to request help for that person.");
  }
  const subject = fd(formData, "subject").slice(0, 150);
  const message = fd(formData, "message").slice(0, 4000);
  if (!subject || !message) return failure("Please add a short subject and description.");
  if (!(await rateLimit(`support:${user.id}`, 10, 3600))) return failure("You have sent several requests recently. We will be in touch soon.");
  await prisma.supportRequest.create({ data: { customerId, subject, message } });
  await audit({ actorUserId: user.id, action: "support.requested", entityType: "Customer", entityId: customerId });
  return success("Thank you. We received your request and will contact you soon.");
}
