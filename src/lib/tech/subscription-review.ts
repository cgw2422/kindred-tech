import "server-only";
import type { AppointmentStatus, BillingFrequency, SubscriptionCategory, SubscriptionDecision } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { savingsProblem, suggestMonthlySavingsCents } from "../subscriptions";
import { assertOwnedAppointment, TechError } from "./access";
import { ensureWorkOrder, type TechActor } from "./workorders";

const REVIEW_STATUSES: AppointmentStatus[] = ["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"];
export const MAX_SUBSCRIPTION_PRICE_CENTS = 1_000_000;

async function ownedForReview(actor: TechActor, appointmentId: string) {
  const appt = await assertOwnedAppointment(actor.technicianId, appointmentId);
  if (!REVIEW_STATUSES.includes(appt.status)) throw new TechError("Subscription reviews can't be recorded for this appointment in its current status.", "INVALID");
  return appt;
}

/** Loads the review for a technician's own appointment (null review if not started). */
export async function getTechSubscriptionReview(technicianId: string, appointmentId: string) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, technicianId },
    select: {
      id: true,
      reference: true,
      status: true,
      startsAt: true,
      customer: { select: { firstName: true, lastName: true, preferredName: true } },
      workOrder: {
        select: {
          id: true,
          subscriptionReview: { include: { items: { orderBy: { createdAt: "asc" } } } },
        },
      },
    },
  });
  if (!appt) return null;
  return { appointment: appt, review: appt.workOrder?.subscriptionReview ?? null };
}

/** Records the customer's authorization. Required before any item can be added. */
export async function authorizeSubscriptionReview(
  actor: TechActor,
  appointmentId: string,
  data: { authorizedByName: string; confirmed: boolean; method: "VERBAL" | "SIGNATURE" },
) {
  const name = data.authorizedByName.trim();
  if (!data.confirmed) throw new TechError("Please confirm the customer authorized the subscription review.", "INVALID");
  if (!name) throw new TechError("Please enter the name of the person who authorized the review.", "INVALID");
  const appt = await ownedForReview(actor, appointmentId);
  const wo = await ensureWorkOrder(appointmentId, actor.technicianId);
  const now = new Date();
  const review = await prisma.$transaction(async (tx) => {
    const r = await tx.subscriptionReview.upsert({
      where: { workOrderId: wo.id },
      create: { customerId: appt.customerId, workOrderId: wo.id, authorizationConfirmed: true, authorizedByName: name, authorizedAt: now },
      update: { authorizationConfirmed: true, authorizedByName: name, authorizedAt: now },
    });
    await tx.consentRecord.create({
      data: {
        customerId: appt.customerId,
        type: "SUBSCRIPTION_CHANGES",
        granted: true,
        method: data.method,
        grantedByName: name,
        appointmentId,
        recordedById: actor.userId,
        notes: "Authorized review of subscriptions; only changes the customer approves.",
      },
    });
    return r;
  });
  await audit({ actorUserId: actor.userId, action: "subscription_review.authorized", entityType: "SubscriptionReview", entityId: review.id, metadata: { appointmentId, method: data.method } });
  return review;
}

async function authorizedReview(actor: TechActor, appointmentId: string) {
  await ownedForReview(actor, appointmentId);
  const review = await prisma.subscriptionReview.findFirst({
    where: { workOrder: { appointmentId, appointment: { technicianId: actor.technicianId } } },
  });
  if (!review || !review.authorizationConfirmed) {
    throw new TechError("Record the customer's authorization before reviewing subscriptions.", "FORBIDDEN");
  }
  return review;
}

export type SubscriptionItemInput = {
  name: string;
  category: SubscriptionCategory;
  priceCents: number;
  frequency: BillingFrequency;
  decision: SubscriptionDecision;
  cancellationAssisted: boolean;
  /** null = use the automatic suggestion */
  estimatedMonthlySavingsCents: number | null;
  followUpNeeded: boolean;
  followUpNotes: string | null;
};

function normalizeItem(input: SubscriptionItemInput) {
  const name = input.name.trim();
  if (!name) throw new TechError("Please enter the subscription name.", "INVALID");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > MAX_SUBSCRIPTION_PRICE_CENTS) throw new TechError("Please enter a valid price.", "INVALID");
  const savings = input.estimatedMonthlySavingsCents ?? suggestMonthlySavingsCents(input);
  const problem = savingsProblem({ ...input, estimatedMonthlySavingsCents: savings });
  if (problem) throw new TechError(problem, "INVALID");
  return {
    name: name.slice(0, 120),
    category: input.category,
    priceCents: input.priceCents,
    frequency: input.frequency,
    decision: input.decision,
    cancellationAssisted: input.cancellationAssisted,
    estimatedMonthlySavingsCents: savings,
    followUpNeeded: input.followUpNeeded,
    followUpNotes: input.followUpNotes?.trim().slice(0, 1000) || null,
  };
}

export async function addSubscriptionItem(actor: TechActor, appointmentId: string, input: SubscriptionItemInput) {
  const review = await authorizedReview(actor, appointmentId);
  const item = await prisma.subscriptionItem.create({ data: { reviewId: review.id, ...normalizeItem(input) } });
  await audit({ actorUserId: actor.userId, action: "subscription_item.added", entityType: "SubscriptionReview", entityId: review.id, metadata: { itemId: item.id, decision: item.decision } });
  return item;
}

export async function updateSubscriptionItem(actor: TechActor, appointmentId: string, itemId: string, input: SubscriptionItemInput) {
  const review = await authorizedReview(actor, appointmentId);
  const existing = await prisma.subscriptionItem.findFirst({ where: { id: itemId, reviewId: review.id } });
  if (!existing) throw new TechError("Subscription not found.", "NOT_FOUND");
  const item = await prisma.subscriptionItem.update({ where: { id: existing.id }, data: normalizeItem(input) });
  await audit({ actorUserId: actor.userId, action: "subscription_item.updated", entityType: "SubscriptionReview", entityId: review.id, metadata: { itemId: item.id, decision: item.decision } });
  return item;
}

export async function removeSubscriptionItem(actor: TechActor, appointmentId: string, itemId: string) {
  const review = await authorizedReview(actor, appointmentId);
  const res = await prisma.subscriptionItem.deleteMany({ where: { id: itemId, reviewId: review.id } });
  if (res.count === 0) throw new TechError("Subscription not found.", "NOT_FOUND");
  await audit({ actorUserId: actor.userId, action: "subscription_item.removed", entityType: "SubscriptionReview", entityId: review.id, metadata: { itemId } });
}

export async function saveReviewNotes(actor: TechActor, appointmentId: string, notes: string | null) {
  const review = await authorizedReview(actor, appointmentId);
  return prisma.subscriptionReview.update({ where: { id: review.id }, data: { notes: notes?.slice(0, 4000) || null } });
}
