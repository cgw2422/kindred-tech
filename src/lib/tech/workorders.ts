import "server-only";
import type { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { audit } from "../audit";
import { allowedNextStatuses } from "../booking/status";
import { changeAppointmentStatus, notifyAppointment } from "../booking/service";
import { assertOwnedAppointment, TechError } from "./access";
import { MAX_CHECKLIST_ITEMS, MAX_CHECKLIST_LABEL, parseChecklist, defaultChecklist, type ChecklistItem } from "./checklist";
import { signatureProblem } from "./signature";

/** The signed-in technician. technicianId must come from the session, never from a form. */
export type TechActor = { userId: string; technicianId: string };

/** Appointment statuses in which field work may be recorded. */
const WORKABLE: AppointmentStatus[] = ["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"];
/** Statuses in which the timer may be started. */
const TIMER_STATUSES: AppointmentStatus[] = ["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"];

export const MAX_ADDITIONAL_WORK_CENTS = 500_000;

async function ownedWorkable(actor: TechActor, appointmentId: string) {
  const appt = await assertOwnedAppointment(actor.technicianId, appointmentId);
  if (!WORKABLE.includes(appt.status)) throw new TechError("Work can't be recorded for this appointment in its current status.", "INVALID");
  return appt;
}

/** Creates the work order for an appointment if it doesn't exist yet. */
export async function ensureWorkOrder(appointmentId: string, technicianId: string, client: Tx | typeof prisma = prisma) {
  return client.workOrder.upsert({
    where: { appointmentId },
    create: { appointmentId, technicianId, checklist: defaultChecklist() as unknown as Prisma.InputJsonValue },
    update: {},
  });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function updateJobStatus(actor: TechActor, appointmentId: string, to: AppointmentStatus) {
  const appt = await assertOwnedAppointment(actor.technicianId, appointmentId);
  if (to === "COMPLETED") return completeJob(actor, appointmentId, {});
  if (!allowedNextStatuses(appt.status, "TECHNICIAN").includes(to)) {
    throw new TechError("That status change isn't available right now.", "INVALID");
  }
  await changeAppointmentStatus({ appointmentId, to, actor: { id: actor.userId, role: "TECHNICIAN" }, technicianId: actor.technicianId });
  if (to === "NO_SHOW") await closeOpenEntries(appointmentId);
  await audit({ actorUserId: actor.userId, action: "appointment.status", entityType: "Appointment", entityId: appointmentId, metadata: { from: appt.status, to, via: "tech" } });
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

async function closeOpenEntries(appointmentId: string, client: Tx | typeof prisma = prisma, now = new Date()) {
  await client.workTimeEntry.updateMany({ where: { workOrder: { appointmentId }, endedAt: null }, data: { endedAt: now } });
}

/** Starts a timer entry. A technician may have only one running timer at a time (across all jobs). */
export async function startTimer(actor: TechActor, appointmentId: string, now = new Date()) {
  const appt = await assertOwnedAppointment(actor.technicianId, appointmentId);
  if (!TIMER_STATUSES.includes(appt.status)) throw new TechError("The timer can only be started on an active job.", "INVALID");
  return prisma.$transaction(async (tx) => {
    // Serialize timer changes per technician so two taps can't open two entries.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timer:${actor.technicianId}`}))`;
    const wo = await ensureWorkOrder(appointmentId, actor.technicianId, tx);
    if (wo.status === "COMPLETED") throw new TechError("This job is already completed.", "INVALID");
    const open = await tx.workTimeEntry.findFirst({
      where: { endedAt: null, workOrder: { appointment: { technicianId: actor.technicianId } } },
      select: { workOrder: { select: { appointmentId: true } } },
    });
    if (open) {
      throw new TechError(
        open.workOrder.appointmentId === appointmentId ? "The timer is already running." : "You have a timer running on another job. Stop it first.",
        "CONFLICT",
      );
    }
    return tx.workTimeEntry.create({ data: { workOrderId: wo.id, startedAt: now } });
  });
}

export async function stopTimer(actor: TechActor, appointmentId: string, now = new Date()) {
  await assertOwnedAppointment(actor.technicianId, appointmentId);
  const res = await prisma.workTimeEntry.updateMany({ where: { workOrder: { appointmentId }, endedAt: null }, data: { endedAt: now } });
  if (res.count === 0) throw new TechError("The timer is not running.", "INVALID");
  return res.count;
}

// ---------------------------------------------------------------------------
// Notes & checklist
// ---------------------------------------------------------------------------

export async function saveNotes(actor: TechActor, appointmentId: string, data: { troubleshootingNotes: string | null; resolutionSummary: string | null }) {
  await ownedWorkable(actor, appointmentId);
  await ensureWorkOrder(appointmentId, actor.technicianId);
  return prisma.workOrder.update({
    where: { appointmentId },
    data: { troubleshootingNotes: data.troubleshootingNotes, resolutionSummary: data.resolutionSummary },
  });
}

export async function getChecklist(appointmentId: string) {
  const wo = await prisma.workOrder.findUnique({ where: { appointmentId }, select: { checklist: true } });
  return parseChecklist(wo?.checklist ?? null);
}

/** Saves the "done" flags (by index) and optionally appends a custom item. */
export async function updateChecklist(actor: TechActor, appointmentId: string, data: { doneIndexes: number[]; addLabel?: string | null; removeIndex?: number | null }) {
  await ownedWorkable(actor, appointmentId);
  const wo = await ensureWorkOrder(appointmentId, actor.technicianId);
  let items: ChecklistItem[] = parseChecklist(wo.checklist).map((it, i) => ({ ...it, done: data.doneIndexes.includes(i) }));
  if (data.removeIndex != null && data.removeIndex >= 0 && data.removeIndex < items.length) {
    items = items.filter((_, i) => i !== data.removeIndex);
  }
  const label = data.addLabel?.trim();
  if (label) {
    if (items.length >= MAX_CHECKLIST_ITEMS) throw new TechError("The checklist is full.", "INVALID");
    items.push({ label: label.slice(0, MAX_CHECKLIST_LABEL), done: false });
  }
  await prisma.workOrder.update({ where: { id: wo.id }, data: { checklist: items as unknown as Prisma.InputJsonValue } });
  return items;
}

// ---------------------------------------------------------------------------
// Additional work
// ---------------------------------------------------------------------------

export async function addAdditionalWork(
  actor: TechActor,
  appointmentId: string,
  data: { description: string; minutes: number; priceCents: number; approvedByName: string; approvalMethod: "VERBAL" | "SIGNATURE"; customerApproved: boolean },
) {
  if (!data.customerApproved) throw new TechError("Please confirm the customer approved this cost before the work was done.", "INVALID");
  if (!data.approvedByName.trim()) throw new TechError("Please enter who approved the additional work.", "INVALID");
  if (!data.description.trim()) throw new TechError("Please describe the additional work.", "INVALID");
  if (!Number.isInteger(data.priceCents) || data.priceCents < 0 || data.priceCents > MAX_ADDITIONAL_WORK_CENTS) throw new TechError("Please enter a valid price.", "INVALID");
  if (!Number.isInteger(data.minutes) || data.minutes < 0 || data.minutes > 24 * 60) throw new TechError("Please enter valid minutes.", "INVALID");
  await ownedWorkable(actor, appointmentId);
  const wo = await ensureWorkOrder(appointmentId, actor.technicianId);
  if (wo.invoiceRequestedAt) throw new TechError("An invoice has already been requested for this job. Please contact the office to add work.", "INVALID");
  const item = await prisma.additionalWorkItem.create({
    data: {
      workOrderId: wo.id,
      description: data.description.trim(),
      minutes: data.minutes,
      priceCents: data.priceCents,
      approvedByName: data.approvedByName.trim(),
      approvalMethod: data.approvalMethod,
    },
  });
  await audit({
    actorUserId: actor.userId,
    action: "workorder.additional_work",
    entityType: "WorkOrder",
    entityId: wo.id,
    metadata: { appointmentId, itemId: item.id, priceCents: item.priceCents, minutes: item.minutes, approvalMethod: item.approvalMethod },
  });
  return item;
}

export async function removeAdditionalWork(actor: TechActor, appointmentId: string, itemId: string) {
  await ownedWorkable(actor, appointmentId);
  const item = await prisma.additionalWorkItem.findFirst({
    where: { id: itemId, workOrder: { appointmentId, appointment: { technicianId: actor.technicianId } } },
    include: { workOrder: { select: { id: true, invoiceRequestedAt: true } } },
  });
  if (!item) throw new TechError("Item not found.", "NOT_FOUND");
  if (item.workOrder.invoiceRequestedAt) throw new TechError("An invoice has already been requested. Please contact the office.", "INVALID");
  await prisma.additionalWorkItem.delete({ where: { id: item.id } });
  await audit({ actorUserId: actor.userId, action: "workorder.additional_work_removed", entityType: "WorkOrder", entityId: item.workOrder.id, metadata: { appointmentId, itemId } });
}

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

export async function saveSignature(actor: TechActor, appointmentId: string, data: { signedByName: string; dataUrl: string | null; typedConfirmed?: boolean }) {
  const name = data.signedByName.trim();
  if (!name) throw new TechError("Please enter the name of the person signing.", "INVALID");
  if (name.length > 120) throw new TechError("The name is too long.", "INVALID");
  if (data.dataUrl) {
    const problem = signatureProblem(data.dataUrl);
    if (problem) throw new TechError(problem, "INVALID");
  } else if (!data.typedConfirmed) {
    throw new TechError("Please have the customer sign, or confirm their typed name as their signature.", "INVALID");
  }
  const appt = await ownedWorkable(actor, appointmentId);
  const wo = await ensureWorkOrder(appointmentId, actor.technicianId);
  const now = new Date();
  await prisma.$transaction([
    prisma.workOrder.update({ where: { id: wo.id }, data: { signatureDataUrl: data.dataUrl, signedByName: name, signedAt: now } }),
    prisma.consentRecord.create({
      data: {
        customerId: appt.customerId,
        type: "SERVICE_AUTHORIZATION",
        granted: true,
        method: "SIGNATURE",
        grantedByName: name,
        appointmentId,
        recordedById: actor.userId,
        notes: data.dataUrl ? "Signed on technician device" : "Typed name accepted as signature on technician device",
      },
    }),
  ]);
  await audit({ actorUserId: actor.userId, action: "workorder.signed", entityType: "WorkOrder", entityId: wo.id, metadata: { appointmentId, drawn: Boolean(data.dataUrl) } });
}

// ---------------------------------------------------------------------------
// Completion & invoice request
// ---------------------------------------------------------------------------

export async function completeJob(actor: TechActor, appointmentId: string, data: { resolutionSummary?: string | null }) {
  const appt = await assertOwnedAppointment(actor.technicianId, appointmentId);
  if (appt.status !== "IN_PROGRESS") throw new TechError("Mark the job In Progress before completing it.", "INVALID");
  const wo = await ensureWorkOrder(appointmentId, actor.technicianId);
  await changeAppointmentStatus({ appointmentId, to: "COMPLETED", actor: { id: actor.userId, role: "TECHNICIAN" }, technicianId: actor.technicianId });
  const now = new Date();
  const summary = data.resolutionSummary === undefined ? wo.resolutionSummary : data.resolutionSummary;
  await prisma.$transaction(async (tx) => {
    await closeOpenEntries(appointmentId, tx, now);
    await tx.workOrder.update({ where: { id: wo.id }, data: { status: "COMPLETED", completedAt: now, resolutionSummary: summary } });
  });
  await audit({ actorUserId: actor.userId, action: "workorder.completed", entityType: "WorkOrder", entityId: wo.id, metadata: { appointmentId } });
  try {
    await notifyAppointment(appointmentId, "appointment_completed", { visitSummary: summary?.trim() || "Thank you for having us today." }, "completed");
  } catch (err) {
    console.error("[tech] failed to queue completion email", (err as Error).message);
  }
}

export async function requestInvoice(actor: TechActor, appointmentId: string) {
  const appt = await assertOwnedAppointment(actor.technicianId, appointmentId);
  if (appt.status !== "COMPLETED") throw new TechError("Complete the job before requesting an invoice.", "INVALID");
  const wo = await ensureWorkOrder(appointmentId, actor.technicianId);
  if (wo.invoiceRequestedAt) return wo;
  const updated = await prisma.workOrder.update({ where: { id: wo.id }, data: { invoiceRequestedAt: new Date() } });
  await audit({ actorUserId: actor.userId, action: "workorder.invoice_requested", entityType: "WorkOrder", entityId: wo.id, metadata: { appointmentId } });
  return updated;
}
