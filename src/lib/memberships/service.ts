import type { MembershipUsageType, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { env } from "../env";
import { zonedToUtc } from "../time";
import { queueTemplatedEmail } from "../email/send";
import { cancelStripeSubscription, resumeStripeSubscriptionRenewal, setStripeSubscriptionPaused } from "../payments/stripe";
import {
  addInterval,
  benefitsList,
  checkAnnualReview,
  checkRemoteMinutes,
  computeChurn,
  computeMrrCents,
  inHomeDiscountCents,
  membershipYearContaining,
  remoteMinutesRemaining,
  usagePeriod,
} from "./calc";

/**
 * Kindred Care membership lifecycle and usage.
 *
 *   PENDING --(Stripe checkout webhook | staff manual activation)--> ACTIVE
 *   ACTIVE <--> PAST_DUE (renewal payment failed / paid)
 *   ACTIVE <--> PAUSED
 *   any --> CANCELED
 */

export class MembershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembershipError";
  }
}

const OPEN_STATUSES = ["PENDING", "ACTIVE", "PAST_DUE", "PAUSED"] as const;

/**
 * Creates a PENDING membership for a recipient customer. A purchaser may be a
 * family contact of that customer (for example an adult child buying for a
 * parent), but only if the customer has granted that contact permission to pay.
 */
export async function createMembership(params: {
  customerId: string;
  planId: string;
  purchaserContactId?: string | null;
  priceCents?: number;
  actorUserId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.membershipPlan.findUnique({ where: { id: params.planId } });
    if (!plan || !plan.isActive) throw new MembershipError("That membership plan is not available.");
    const customer = await tx.customer.findUnique({ where: { id: params.customerId } });
    if (!customer) throw new MembershipError("Customer not found.");
    if (params.purchaserContactId) {
      const contact = await tx.familyContact.findUnique({ where: { id: params.purchaserContactId } });
      if (!contact || contact.customerId !== customer.id) throw new MembershipError("The purchaser must be a family contact of this customer.");
      if (!contact.canPay) throw new MembershipError("This family contact is not authorized to pay for this customer.");
    }
    const open = await tx.membership.findFirst({ where: { customerId: customer.id, status: { in: [...OPEN_STATUSES] } } });
    if (open) throw new MembershipError(`This customer already has a ${open.status.toLowerCase().replace("_", " ")} membership.`);
    const priceCents = params.priceCents ?? plan.priceCents;
    if (!Number.isInteger(priceCents) || priceCents < 0) throw new MembershipError("Price must be zero or more.");
    return tx.membership.create({
      data: { planId: plan.id, customerId: customer.id, purchaserContactId: params.purchaserContactId ?? null, priceCents, status: "PENDING" },
      include: { plan: true },
    });
  });
}

async function recordNote(tx: Tx, membership: { id: string; customerId: string }, subject: string, note: string | null | undefined, actorUserId?: string | null) {
  await tx.communication.create({
    data: {
      channel: "NOTE",
      direction: "INTERNAL",
      customerId: membership.customerId,
      subject,
      bodyPreview: note?.slice(0, 2000) || null,
      status: "SENT",
      relatedType: "Membership",
      relatedId: membership.id,
      createdById: actorUserId ?? null,
    },
  });
}

/** Queues the welcome email once per membership (idempotent). */
export async function queueMembershipWelcome(membershipId: string, tx?: Tx) {
  const client = tx ?? prisma;
  const m = await client.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { plan: true, customer: true, purchaserContact: true } });
  const to = m.customer.email ?? m.purchaserContact?.email;
  const name = m.customer.email ? m.customer.preferredName || m.customer.firstName : (m.purchaserContact?.name.split(" ")[0] ?? m.customer.firstName);
  return queueTemplatedEmail({
    templateKey: "membership_welcome",
    to,
    customerId: m.customerId,
    vars: {
      customerName: name,
      planName: m.plan.name,
      benefitsList: benefitsList(m.plan).map((b) => `- ${b}`).join("\n"),
      portalUrl: `${env.appUrl}/portal`,
    },
    idempotencyKey: `membership-welcome:${m.id}`,
    relatedType: "Membership",
    relatedId: m.id,
    tx,
  });
}

/**
 * Manual activation by staff for memberships billed outside Stripe (cash,
 * check, or invoice). This does not record a payment; record that separately.
 */
export async function activateMembership(membershipId: string, params: { actorUserId?: string | null; note?: string | null; startAt?: Date; sendWelcome?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { plan: true } });
    if (m.status !== "PENDING") throw new MembershipError("Only pending memberships can be activated.");
    if (m.stripeSubscriptionId) throw new MembershipError("This membership is billed through Stripe and activates automatically when payment is confirmed.");
    const start = params.startAt ?? new Date();
    const updated = await tx.membership.update({
      where: { id: m.id },
      data: { status: "ACTIVE", startedAt: start, currentPeriodStart: start, currentPeriodEnd: addInterval(start, m.plan.interval), cancelAtPeriodEnd: false, canceledAt: null },
    });
    await recordNote(tx, m, "Membership activated manually (offline billing)", params.note, params.actorUserId);
    if (params.sendWelcome !== false) await queueMembershipWelcome(m.id, tx);
    return updated;
  });
}

/**
 * Cancels a membership. With a Stripe subscription the change is sent to
 * Stripe first; webhooks then confirm the final state.
 */
export async function cancelMembership(membershipId: string, params: { immediately: boolean; reason?: string | null; actorUserId?: string | null }) {
  const m = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
  if (m.status === "CANCELED") throw new MembershipError("This membership is already canceled.");
  const immediately = params.immediately || m.status === "PENDING";
  if (m.stripeSubscriptionId && m.status !== "PENDING") await cancelStripeSubscription(m.stripeSubscriptionId, { immediately });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: m.id },
      data: immediately
        ? { status: "CANCELED", canceledAt: new Date(), cancelAtPeriodEnd: false, cancelReason: params.reason ?? null }
        : { cancelAtPeriodEnd: true, cancelReason: params.reason ?? null },
    });
    await recordNote(tx, m, immediately ? "Membership canceled" : "Membership set to cancel at period end", params.reason, params.actorUserId);
    return updated;
  });
}

/** Undoes a scheduled cancel-at-period-end. */
export async function keepMembership(membershipId: string, params: { actorUserId?: string | null } = {}) {
  const m = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
  if (m.status === "CANCELED" || !m.cancelAtPeriodEnd) throw new MembershipError("This membership is not scheduled to cancel.");
  if (m.stripeSubscriptionId) await resumeStripeSubscriptionRenewal(m.stripeSubscriptionId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({ where: { id: m.id }, data: { cancelAtPeriodEnd: false, cancelReason: null } });
    await recordNote(tx, m, "Scheduled cancellation removed", null, params.actorUserId);
    return updated;
  });
}

export async function pauseMembership(membershipId: string, params: { reason?: string | null; actorUserId?: string | null } = {}) {
  const m = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
  if (m.status !== "ACTIVE") throw new MembershipError("Only active memberships can be paused.");
  if (m.stripeSubscriptionId) await setStripeSubscriptionPaused(m.stripeSubscriptionId, true);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({ where: { id: m.id }, data: { status: "PAUSED" } });
    await recordNote(tx, m, "Membership paused", params.reason, params.actorUserId);
    return updated;
  });
}

export async function resumeMembership(membershipId: string, params: { actorUserId?: string | null } = {}) {
  const m = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { plan: true } });
  if (m.status !== "PAUSED") throw new MembershipError("Only paused memberships can be resumed.");
  if (m.stripeSubscriptionId) await setStripeSubscriptionPaused(m.stripeSubscriptionId, false);
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const periodExpired = !m.currentPeriodEnd || m.currentPeriodEnd <= now;
    const updated = await tx.membership.update({
      where: { id: m.id },
      data: {
        status: "ACTIVE",
        // Offline memberships start a fresh period on resume; Stripe periods come from webhooks.
        ...(!m.stripeSubscriptionId && periodExpired ? { currentPeriodStart: now, currentPeriodEnd: addInterval(now, m.plan.interval) } : {}),
      },
    });
    await recordNote(tx, m, "Membership resumed", null, params.actorUserId);
    return updated;
  });
}

/** For offline-billed memberships: advance to the next period after staff records payment. */
export async function renewOfflineMembership(membershipId: string, params: { actorUserId?: string | null; note?: string | null } = {}) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { plan: true } });
    if (m.stripeSubscriptionId) throw new MembershipError("Stripe memberships renew automatically.");
    if (!["ACTIVE", "PAST_DUE"].includes(m.status)) throw new MembershipError("Only active or past-due memberships can be renewed.");
    const start = m.currentPeriodEnd ?? new Date();
    const updated = await tx.membership.update({
      where: { id: m.id },
      data: { status: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: addInterval(start, m.plan.interval), failedPaymentCount: 0 },
    });
    await recordNote(tx, m, "Membership renewed manually (offline billing)", params.note, params.actorUserId);
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

type MembershipWithPlan = Prisma.MembershipGetPayload<{ include: { plan: true } }>;

async function usedInRange(client: Tx | typeof prisma, membershipId: string, type: MembershipUsageType, start: Date, end: Date) {
  const agg = await client.membershipUsage.aggregate({ where: { membershipId, type, createdAt: { gte: start, lt: end } }, _sum: { quantity: true }, _count: true });
  return { quantity: agg._sum.quantity ?? 0, count: agg._count };
}

export async function remoteMinutesUsage(m: MembershipWithPlan, at = new Date(), client: Tx | typeof prisma = prisma) {
  const period = usagePeriod(m, m.plan.interval, at);
  if (!period) return { period: null, used: 0, allowance: m.plan.remoteMinutesPerPeriod, remaining: m.plan.remoteMinutesPerPeriod };
  const { quantity } = await usedInRange(client, m.id, "REMOTE_MINUTES", period.start, period.end);
  return { period, used: quantity, allowance: m.plan.remoteMinutesPerPeriod, remaining: remoteMinutesRemaining(m.plan.remoteMinutesPerPeriod, quantity) };
}

/**
 * Records use of a membership benefit, enforcing plan limits:
 *  - REMOTE_MINUTES: cannot exceed the plan's allowance for the current period
 *  - ANNUAL_REVIEW: once per membership year, only if the plan includes it
 *  - IN_HOME_DISCOUNT: records the discount given on a (paid) in-home visit
 *  - PRIORITY_BOOKING: only if the plan includes priority scheduling
 */
export async function recordUsage(params: {
  membershipId: string;
  type: MembershipUsageType;
  quantity?: number;
  visitPriceCents?: number;
  valueCents?: number;
  appointmentId?: string | null;
  notes?: string | null;
  at?: Date;
}) {
  const at = params.at ?? new Date();
  return prisma.$transaction(async (tx) => {
    // Serialize usage recording per membership so concurrent requests cannot overspend.
    await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${params.membershipId} FOR UPDATE`;
    const m = await tx.membership.findUnique({ where: { id: params.membershipId }, include: { plan: true } });
    if (!m) throw new MembershipError("Membership not found.");
    if (m.status !== "ACTIVE") throw new MembershipError("Benefits can only be used on an active membership.");
    let quantity = 1;
    let valueCents = 0;
    switch (params.type) {
      case "REMOTE_MINUTES": {
        quantity = params.quantity ?? 0;
        const usage = await remoteMinutesUsage(m, at, tx);
        const check = checkRemoteMinutes(m.plan.remoteMinutesPerPeriod, usage.used, quantity);
        if (!check.ok) throw new MembershipError(check.reason);
        break;
      }
      case "ANNUAL_REVIEW": {
        const anchor = m.startedAt ?? m.currentPeriodStart ?? m.createdAt;
        const year = membershipYearContaining(anchor, at);
        const { count } = await usedInRange(tx, m.id, "ANNUAL_REVIEW", year.start, year.end);
        const check = checkAnnualReview(m.plan.annualReviewIncluded, count);
        if (!check.ok) throw new MembershipError(check.reason);
        break;
      }
      case "IN_HOME_DISCOUNT": {
        if (m.plan.inHomeDiscountPercent <= 0) throw new MembershipError("This plan does not include an in-home visit discount.");
        valueCents = params.valueCents ?? inHomeDiscountCents(params.visitPriceCents ?? 0, m.plan.inHomeDiscountPercent);
        if (valueCents <= 0) throw new MembershipError("Enter the visit price so the discount can be recorded.");
        break;
      }
      case "PRIORITY_BOOKING": {
        if (!m.plan.priorityScheduling) throw new MembershipError("This plan does not include priority scheduling.");
        break;
      }
    }
    return tx.membershipUsage.create({
      data: { membershipId: m.id, type: params.type, quantity, valueCents, appointmentId: params.appointmentId ?? null, notes: params.notes?.slice(0, 1000) ?? null, createdAt: at },
    });
  });
}

/** The customer's current membership (ACTIVE or PAST_DUE), its plan, and remaining remote minutes. */
export async function getActiveMembershipForCustomer(customerId: string, at = new Date()) {
  const membership = await prisma.membership.findFirst({
    where: { customerId, status: { in: ["ACTIVE", "PAST_DUE"] } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (!membership) return null;
  const usage = await remoteMinutesUsage(membership, at);
  return { membership, plan: membership.plan, remoteMinutesRemaining: usage.remaining, remoteMinutesUsed: usage.used, period: usage.period };
}

/** Member in-home discount percent for pricing (0 when not an active member). */
export async function memberDiscountPercent(customerId: string): Promise<number> {
  const m = await prisma.membership.findFirst({ where: { customerId, status: "ACTIVE" }, include: { plan: true } });
  return m?.plan.inHomeDiscountPercent ?? 0;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export async function membershipMetrics(opts: { year?: number; month?: number; timeZone?: string } = {}) {
  const now = new Date();
  const tz = opts.timeZone ?? "America/New_York";
  const year = opts.year ?? now.getUTCFullYear();
  const month = opts.month ?? now.getUTCMonth() + 1;
  const start = zonedToUtc(year, month, 1, 0, 0, tz);
  const end = month === 12 ? zonedToUtc(year + 1, 1, 1, 0, 0, tz) : zonedToUtc(year, month + 1, 1, 0, 0, tz);
  const all = await prisma.membership.findMany({ select: { status: true, priceCents: true, startedAt: true, canceledAt: true, plan: { select: { interval: true } } } });
  const mrrCents = computeMrrCents(all.map((m) => ({ status: m.status, priceCents: m.priceCents, interval: m.plan.interval })));
  const churn = computeChurn(all, start, end);
  const counts = all.reduce<Record<string, number>>((acc, m) => ((acc[m.status] = (acc[m.status] ?? 0) + 1), acc), {});
  return { mrrCents, activeCount: counts.ACTIVE ?? 0, pastDueCount: counts.PAST_DUE ?? 0, pendingCount: counts.PENDING ?? 0, counts, churn, monthStart: start, monthEnd: end };
}
