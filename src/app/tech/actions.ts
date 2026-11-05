"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { BookingError } from "@/lib/booking/service";
import { failure, fd, fdBool, success, zodFieldErrors, type ActionState } from "@/lib/forms";
import { parseDollarsToCents } from "@/lib/money";
import { getTechnicianForUser, TechError } from "@/lib/tech/access";
import {
  addAdditionalWork,
  completeJob,
  removeAdditionalWork,
  requestInvoice,
  saveNotes,
  saveSignature,
  startTimer,
  stopTimer,
  updateChecklist,
  updateJobStatus,
  type TechActor,
} from "@/lib/tech/workorders";
import {
  addSubscriptionItem,
  authorizeSubscriptionReview,
  removeSubscriptionItem,
  saveReviewNotes,
  updateSubscriptionItem,
  type SubscriptionItemInput,
} from "@/lib/tech/subscription-review";

/**
 * Technician server actions. These are thin wrappers: the technician id is
 * always resolved from the session, and every lib function re-checks that the
 * appointment belongs to that technician.
 */

const zId = z.string().trim().min(1, "Missing appointment.").max(64);

async function actor(): Promise<TechActor | null> {
  const user = await requirePermission("tech:portal", "/tech");
  const tech = await getTechnicianForUser(user.id);
  if (!tech || !tech.isActive) return null;
  return { userId: user.id, technicianId: tech.id };
}

const NO_TECH = failure("Your account is not linked to an active technician profile. Please contact the office.");

function revalidateJob(appointmentId: string) {
  revalidatePath(`/tech/appointments/${appointmentId}`, "layout");
  revalidatePath("/tech");
  revalidatePath("/tech/schedule");
}

async function run(appointmentId: string, fn: () => Promise<string>): Promise<ActionState> {
  try {
    const msg = await fn();
    revalidateJob(appointmentId);
    return success(msg);
  } catch (err) {
    if (err instanceof TechError || err instanceof BookingError) return failure(err.message);
    console.error("[tech action]", err);
    return failure("Something went wrong. Please try again, or call the office if it keeps happening.");
  }
}

function idFrom(formData: FormData) {
  return zId.safeParse(fd(formData, "appointmentId"));
}

// ---------------------------------------------------------------------------
// Status & completion
// ---------------------------------------------------------------------------

const zTechStatus = z.enum(["EN_ROUTE", "IN_PROGRESS", "COMPLETED", "NO_SHOW"]);

export async function changeStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z.object({ appointmentId: zId, to: zTechStatus }).safeParse({ appointmentId: fd(formData, "appointmentId"), to: fd(formData, "to") });
  if (!parsed.success) return failure("Please choose a valid status.");
  const { appointmentId, to } = parsed.data;
  return run(appointmentId, async () => {
    await updateJobStatus(a, appointmentId, to);
    return "Status updated.";
  });
}

export async function completeJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z
    .object({ appointmentId: zId, resolutionSummary: z.string().max(4000, "The summary is too long.") })
    .safeParse({ appointmentId: fd(formData, "appointmentId"), resolutionSummary: fd(formData, "resolutionSummary") });
  if (!parsed.success) return failure("Please check the form.", zodFieldErrors(parsed.error));
  const { appointmentId, resolutionSummary } = parsed.data;
  return run(appointmentId, async () => {
    await completeJob(a, appointmentId, { resolutionSummary: resolutionSummary || null });
    return "Job completed. A thank-you summary is being emailed to the customer.";
  });
}

export async function requestInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const id = idFrom(formData);
  if (!id.success) return failure("Missing appointment.");
  return run(id.data, async () => {
    await requestInvoice(a, id.data);
    return "Invoice requested. The office will prepare it.";
  });
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

export async function timerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z.object({ appointmentId: zId, op: z.enum(["start", "stop"]) }).safeParse({ appointmentId: fd(formData, "appointmentId"), op: fd(formData, "op") });
  if (!parsed.success) return failure("Invalid timer request.");
  const { appointmentId, op } = parsed.data;
  return run(appointmentId, async () => {
    if (op === "start") {
      await startTimer(a, appointmentId);
      return "Timer started.";
    }
    await stopTimer(a, appointmentId);
    return "Timer stopped.";
  });
}

// ---------------------------------------------------------------------------
// Notes & checklist
// ---------------------------------------------------------------------------

export async function saveNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z
    .object({
      appointmentId: zId,
      troubleshootingNotes: z.string().max(10000, "Notes are too long."),
      resolutionSummary: z.string().max(4000, "The summary is too long."),
    })
    .safeParse({ appointmentId: fd(formData, "appointmentId"), troubleshootingNotes: fd(formData, "troubleshootingNotes"), resolutionSummary: fd(formData, "resolutionSummary") });
  if (!parsed.success) return failure("Please check the form.", zodFieldErrors(parsed.error));
  const { appointmentId, troubleshootingNotes, resolutionSummary } = parsed.data;
  return run(appointmentId, async () => {
    await saveNotes(a, appointmentId, { troubleshootingNotes: troubleshootingNotes || null, resolutionSummary: resolutionSummary || null });
    return "Notes saved.";
  });
}

export async function checklistAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z
    .object({
      appointmentId: zId,
      done: z.array(z.coerce.number().int().min(0).max(100)).max(100),
      addLabel: z.string().max(160, "Keep checklist items short."),
      removeIndex: z.coerce.number().int().min(0).max(100).nullable(),
    })
    .safeParse({
      appointmentId: fd(formData, "appointmentId"),
      done: formData.getAll("done").map(String),
      addLabel: fd(formData, "addLabel"),
      removeIndex: fd(formData, "removeIndex") === "" ? null : fd(formData, "removeIndex"),
    });
  if (!parsed.success) return failure("Please check the checklist.", zodFieldErrors(parsed.error));
  const { appointmentId, done, addLabel, removeIndex } = parsed.data;
  return run(appointmentId, async () => {
    await updateChecklist(a, appointmentId, { doneIndexes: done, addLabel: addLabel || null, removeIndex });
    return "Checklist saved.";
  });
}

// ---------------------------------------------------------------------------
// Additional work
// ---------------------------------------------------------------------------

export async function addAdditionalWorkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z
    .object({
      appointmentId: zId,
      description: z.string().min(1, "Please describe the work.").max(300),
      minutes: z.coerce.number().int("Whole minutes only.").min(0).max(1440),
      price: z.string().min(1, "Please enter the price."),
      approvedByName: z.string().min(1, "Please enter who approved it.").max(120),
      approvalMethod: z.enum(["VERBAL", "SIGNATURE"]),
      customerApproved: z.literal(true, { error: "Please confirm the customer approved this cost before the work was done." }),
    })
    .safeParse({
      appointmentId: fd(formData, "appointmentId"),
      description: fd(formData, "description"),
      minutes: fd(formData, "minutes") || "0",
      price: fd(formData, "price"),
      approvedByName: fd(formData, "approvedByName"),
      approvalMethod: fd(formData, "approvalMethod"),
      customerApproved: fdBool(formData, "customerApproved"),
    });
  if (!parsed.success) {
    const errs = zodFieldErrors(parsed.error);
    return failure(Object.values(errs)[0] ?? "Please check the form.", errs);
  }
  const priceCents = parseDollarsToCents(parsed.data.price);
  if (priceCents == null || priceCents < 0) return failure("Please enter a valid price, like 40 or 40.00.");
  const { appointmentId, ...rest } = parsed.data;
  return run(appointmentId, async () => {
    await addAdditionalWork(a, appointmentId, { ...rest, priceCents, customerApproved: true });
    return "Additional work recorded.";
  });
}

export async function removeAdditionalWorkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z.object({ appointmentId: zId, itemId: zId }).safeParse({ appointmentId: fd(formData, "appointmentId"), itemId: fd(formData, "itemId") });
  if (!parsed.success) return failure("Invalid request.");
  const { appointmentId, itemId } = parsed.data;
  return run(appointmentId, async () => {
    await removeAdditionalWork(a, appointmentId, itemId);
    return "Additional work removed.";
  });
}

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

export async function saveSignatureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const raw = formData.get("signatureDataUrl");
  const parsed = z
    .object({
      appointmentId: zId,
      signedByName: z.string().min(1, "Please enter the name of the person signing.").max(120),
      // ~200KB PNG as base64 plus prefix; exact limits are enforced in the lib.
      signatureDataUrl: z.string().max(300_000, "The signature image is too large."),
      typedConfirmed: z.boolean(),
    })
    .safeParse({
      appointmentId: fd(formData, "appointmentId"),
      signedByName: fd(formData, "signedByName"),
      signatureDataUrl: typeof raw === "string" ? raw.trim() : "",
      typedConfirmed: fdBool(formData, "typedConfirmed"),
    });
  if (!parsed.success) {
    const errs = zodFieldErrors(parsed.error);
    return failure(Object.values(errs)[0] ?? "Please check the form.", errs);
  }
  const { appointmentId, signedByName, signatureDataUrl, typedConfirmed } = parsed.data;
  return run(appointmentId, async () => {
    await saveSignature(a, appointmentId, { signedByName, dataUrl: signatureDataUrl || null, typedConfirmed });
    return "Signature saved. Thank you!";
  });
}

// ---------------------------------------------------------------------------
// Subscription Review & Savings
// ---------------------------------------------------------------------------

export async function authorizeReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z
    .object({
      appointmentId: zId,
      authorizedByName: z.string().min(1, "Please enter the customer's name.").max(120),
      method: z.enum(["VERBAL", "SIGNATURE"]),
      confirmed: z.literal(true, { error: "Please confirm the customer authorized the review." }),
    })
    .safeParse({
      appointmentId: fd(formData, "appointmentId"),
      authorizedByName: fd(formData, "authorizedByName"),
      method: fd(formData, "method") || "VERBAL",
      confirmed: fdBool(formData, "confirmed"),
    });
  if (!parsed.success) {
    const errs = zodFieldErrors(parsed.error);
    return failure(Object.values(errs)[0] ?? "Please check the form.", errs);
  }
  const { appointmentId, authorizedByName, method } = parsed.data;
  return run(appointmentId, async () => {
    await authorizeSubscriptionReview(a, appointmentId, { authorizedByName, method, confirmed: true });
    return "Authorization recorded. You can now add subscriptions.";
  });
}

const zItem = z.object({
  appointmentId: zId,
  itemId: z.string().max(64),
  name: z.string().min(1, "Please enter the subscription name.").max(120),
  category: z.enum(["STREAMING", "ANTIVIRUS", "SOFTWARE", "CLOUD_STORAGE", "PHONE_APP", "INTERNET", "CABLE", "MOBILE_PHONE", "OTHER"]),
  price: z.string().min(1, "Please enter the price."),
  frequency: z.enum(["MONTHLY", "ANNUAL", "QUARTERLY", "OTHER"]),
  decision: z.enum(["UNDECIDED", "KEEP", "CANCEL", "DOWNGRADE", "SWITCH", "REVIEW_LATER"]),
  cancellationAssisted: z.boolean(),
  savingsAuto: z.boolean(),
  estimatedMonthlySavings: z.string().max(20),
  followUpNeeded: z.boolean(),
  followUpNotes: z.string().max(1000, "Notes are too long."),
});

export async function saveSubscriptionItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = zItem.safeParse({
    appointmentId: fd(formData, "appointmentId"),
    itemId: fd(formData, "itemId"),
    name: fd(formData, "name"),
    category: fd(formData, "category"),
    price: fd(formData, "price"),
    frequency: fd(formData, "frequency"),
    decision: fd(formData, "decision"),
    cancellationAssisted: fdBool(formData, "cancellationAssisted"),
    savingsAuto: fd(formData, "savingsAuto") === "1",
    estimatedMonthlySavings: fd(formData, "estimatedMonthlySavings"),
    followUpNeeded: fdBool(formData, "followUpNeeded"),
    followUpNotes: fd(formData, "followUpNotes"),
  });
  if (!parsed.success) {
    const errs = zodFieldErrors(parsed.error);
    return failure(Object.values(errs)[0] ?? "Please check the form.", errs);
  }
  const d = parsed.data;
  const priceCents = parseDollarsToCents(d.price);
  if (priceCents == null || priceCents < 0) return failure("Please enter a valid price, like 15.99.");
  let savings: number | null = null;
  if (!d.savingsAuto && d.estimatedMonthlySavings !== "") {
    savings = parseDollarsToCents(d.estimatedMonthlySavings);
    if (savings == null || savings < 0) return failure("Please enter valid estimated savings, like 15.99.");
  }
  const input: SubscriptionItemInput = {
    name: d.name,
    category: d.category,
    priceCents,
    frequency: d.frequency,
    decision: d.decision,
    cancellationAssisted: d.cancellationAssisted,
    estimatedMonthlySavingsCents: savings,
    followUpNeeded: d.followUpNeeded,
    followUpNotes: d.followUpNotes || null,
  };
  return run(d.appointmentId, async () => {
    if (d.itemId) {
      await updateSubscriptionItem(a, d.appointmentId, d.itemId, input);
      return "Subscription updated.";
    }
    await addSubscriptionItem(a, d.appointmentId, input);
    return "Subscription added.";
  });
}

export async function removeSubscriptionItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z.object({ appointmentId: zId, itemId: zId }).safeParse({ appointmentId: fd(formData, "appointmentId"), itemId: fd(formData, "itemId") });
  if (!parsed.success) return failure("Invalid request.");
  const { appointmentId, itemId } = parsed.data;
  return run(appointmentId, async () => {
    await removeSubscriptionItem(a, appointmentId, itemId);
    return "Subscription removed.";
  });
}

export async function saveReviewNotesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return NO_TECH;
  const parsed = z.object({ appointmentId: zId, notes: z.string().max(4000, "Notes are too long.") }).safeParse({ appointmentId: fd(formData, "appointmentId"), notes: fd(formData, "notes") });
  if (!parsed.success) return failure("Please check the notes.");
  const { appointmentId, notes } = parsed.data;
  return run(appointmentId, async () => {
    await saveReviewNotes(a, appointmentId, notes || null);
    return "Notes saved.";
  });
}
