"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { assignTechnician, BookingError, changeAppointmentStatus, createBooking, notifyAppointment, rescheduleAppointment } from "@/lib/booking/service";
import { flashRedirect, parseTimeInput } from "@/lib/admin-helpers";
import { fd, fdBool, fdInt } from "@/lib/forms";
import { getSettings } from "@/lib/settings";
import { localMinuteToUtc } from "@/lib/time";
import { createInvoice, invoiceLinesFromEstimate } from "@/lib/billing/invoices";
import { runDueJobs } from "@/lib/jobs/queue";
import "@/lib/email/send";

const STATUSES: AppointmentStatus[] = ["REQUESTED", "CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "CANCELED", "NO_SHOW"];

function back(id: string) {
  return `/admin/appointments/${id}`;
}

async function flushEmails() {
  await runDueJobs({ limit: 10 }).catch(() => undefined);
}

export async function changeStatusAction(formData: FormData) {
  const user = await requirePermission("appointments:manage");
  const id = fd(formData, "id");
  const to = fd(formData, "to") as AppointmentStatus;
  if (!STATUSES.includes(to)) flashRedirect(back(id), "error", "Unknown status.");
  try {
    await changeAppointmentStatus({ appointmentId: id, to, actor: { id: user.id, role: user.role }, note: fd(formData, "note") || undefined, cancelReason: fd(formData, "cancelReason") || undefined });
    await audit({ actorUserId: user.id, action: "appointment.status_changed", entityType: "Appointment", entityId: id, metadata: { to } });
  } catch (err) {
    if (err instanceof BookingError) flashRedirect(back(id), "error", err.message);
    throw err;
  }
  await flushEmails();
  revalidatePath(back(id));
  flashRedirect(back(id), "ok", `Status changed to ${to.replace("_", " ").toLowerCase()}.`);
}

export async function assignTechnicianAction(formData: FormData) {
  const user = await requirePermission("appointments:manage");
  const id = fd(formData, "id");
  const technicianId = fd(formData, "technicianId") || null;
  try {
    await assignTechnician({ appointmentId: id, technicianId, actorUserId: user.id, allowOutsideHours: fdBool(formData, "allowOutsideHours") });
    await audit({ actorUserId: user.id, action: "appointment.assigned", entityType: "Appointment", entityId: id, metadata: { technicianId } });
  } catch (err) {
    if (err instanceof BookingError) flashRedirect(back(id), "error", err.message);
    throw err;
  }
  revalidatePath(back(id));
  flashRedirect(back(id), "ok", technicianId ? "Technician assigned." : "Technician unassigned.");
}

export async function rescheduleAction(formData: FormData) {
  const user = await requirePermission("appointments:manage");
  const id = fd(formData, "id");
  const date = fd(formData, "date");
  const minute = parseTimeInput(fd(formData, "time"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || minute == null) flashRedirect(back(id), "error", "Please enter a valid date and time.");
  const biz = await getSettings("business");
  const startsAt = localMinuteToUtc(date, minute!, biz.timeZone);
  const techField = fd(formData, "technicianId");
  try {
    await rescheduleAppointment({
      appointmentId: id,
      startsAt,
      actor: { id: user.id, role: user.role },
      technicianId: techField === "auto" ? undefined : techField || undefined,
      allowOutsideHours: fdBool(formData, "allowOutsideHours"),
    });
    await audit({ actorUserId: user.id, action: "appointment.rescheduled", entityType: "Appointment", entityId: id, metadata: { startsAt: startsAt.toISOString() } });
  } catch (err) {
    if (err instanceof BookingError) flashRedirect(back(id), "error", err.message);
    throw err;
  }
  await flushEmails();
  revalidatePath(back(id));
  flashRedirect(back(id), "ok", "Appointment rescheduled and the customer notified.");
}

export async function updateNotesAction(formData: FormData) {
  const user = await requirePermission("appointments:manage");
  const id = fd(formData, "id");
  await prisma.appointment.update({ where: { id }, data: { internalNotes: fd(formData, "internalNotes").slice(0, 5000) || null } });
  await audit({ actorUserId: user.id, action: "appointment.notes_updated", entityType: "Appointment", entityId: id });
  revalidatePath(back(id));
  flashRedirect(back(id), "ok", "Notes saved.");
}

export async function resendConfirmationAction(formData: FormData) {
  const user = await requirePermission("appointments:manage");
  const id = fd(formData, "id");
  await notifyAppointment(id, "appointment_confirmed", {}, `resend:${Date.now()}`);
  await audit({ actorUserId: user.id, action: "appointment.confirmation_resent", entityType: "Appointment", entityId: id });
  await flushEmails();
  flashRedirect(back(id), "ok", "Confirmation queued. Check Communications for delivery status.");
}

export async function createInvoiceFromAppointmentAction(formData: FormData) {
  const user = await requirePermission("billing:manage");
  const id = fd(formData, "id");
  const appt = await prisma.appointment.findUniqueOrThrow({
    where: { id },
    include: { customer: { include: { familyContacts: true } }, service: true, workOrder: { include: { additionalWork: true } } },
  });
  const lines = invoiceLinesFromEstimate(appt.estimateBreakdown);
  if (lines.length === 0) lines.push({ description: appt.service.name, unitPriceCents: appt.service.basePriceCents, serviceId: appt.serviceId });
  for (const w of appt.workOrder?.additionalWork ?? []) lines.push({ description: `Additional work (approved by ${w.approvedByName}): ${w.description}`, unitPriceCents: w.priceCents, kind: "ADDITIONAL" });
  const billTo = appt.customer.familyContacts.find((f) => f.isBillingContact && f.canPay);
  const inv = await createInvoice({ customerId: appt.customerId, appointmentId: appt.id, billToContactId: billTo?.id ?? null, lines });
  await audit({ actorUserId: user.id, action: "invoice.created_from_appointment", entityType: "Invoice", entityId: inv.id, metadata: { appointmentId: id } });
  redirect(`/admin/invoices/${inv.id}`);
}

export async function manualBookingAction(formData: FormData) {
  const user = await requirePermission("appointments:manage");
  const date = fd(formData, "date");
  const minute = parseTimeInput(fd(formData, "time"));
  const back_ = "/admin/appointments/new";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || minute == null) flashRedirect(back_, "error", "Please enter a valid date and time.");
  const biz = await getSettings("business");
  const startsAt = localMinuteToUtc(date, minute!, biz.timeZone);
  const existingCustomerId = fd(formData, "customerId") || null;
  let customer = { firstName: fd(formData, "firstName"), lastName: fd(formData, "lastName"), email: fd(formData, "email") || null, phone: fd(formData, "phone") || null };
  let address: { line1: string; line2?: string | null; city: string; state: string; postalCode: string } | null = null;
  if (existingCustomerId) {
    const c = await prisma.customer.findUnique({ where: { id: existingCustomerId }, include: { addresses: true } });
    if (!c) flashRedirect(back_, "error", "Customer not found.");
    customer = { firstName: c!.firstName, lastName: c!.lastName, email: c!.email, phone: c!.phone };
    const addrId = fd(formData, "addressId");
    const a = c!.addresses.find((x) => x.id === addrId) ?? c!.addresses.find((x) => x.isPrimary) ?? c!.addresses[0];
    if (a) address = { line1: a.line1, line2: a.line2, city: a.city, state: a.state, postalCode: a.postalCode };
  }
  if (!address && fd(formData, "line1")) {
    address = { line1: fd(formData, "line1"), line2: fd(formData, "line2") || null, city: fd(formData, "city"), state: fd(formData, "state") || "OH", postalCode: fd(formData, "postalCode") };
  }
  if (!customer.firstName || !customer.lastName) flashRedirect(back_, "error", "Customer first and last name are required.");
  const techField = fd(formData, "technicianId");
  let result;
  try {
    result = await createBooking({
      serviceId: fd(formData, "serviceId"),
      startsAt,
      extensionBlocks: fdInt(formData, "extensionBlocks", 0),
      customer,
      address,
      bookedForSelf: true,
      problemDescription: fd(formData, "problemDescription") || null,
      leadSource: fd(formData, "leadSource") || null,
      acceptedTerms: true,
      source: fd(formData, "source") === "PHONE" ? "PHONE" : "ADMIN",
      existingCustomerId,
      technicianId: techField && techField !== "auto" ? techField : null,
      staffOverrideHours: fdBool(formData, "allowOutsideHours"),
      statusOverride: fd(formData, "status") === "CONFIRMED" ? "CONFIRMED" : "REQUESTED",
      actorUserId: user.id,
    });
  } catch (err) {
    if (err instanceof BookingError) flashRedirect(back_, "error", err.message);
    throw err;
  }
  await audit({ actorUserId: user.id, action: "booking.created_by_staff", entityType: "Appointment", entityId: result!.appointmentId });
  await flushEmails();
  flashRedirect(`/admin/appointments/${result!.appointmentId}`, "ok", `Appointment ${result!.reference} created.`);
}
