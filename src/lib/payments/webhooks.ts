import type Stripe from "stripe";
import type { MembershipStatus } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { env } from "../env";
import { formatCents } from "../money";
import { queueTemplatedEmail } from "../email/send";
import { invoiceRecipient, recalculateInvoicePayments } from "../billing/invoices";
import { addInterval, mapStripeSubscriptionStatus } from "../memberships/calc";
import { queueMembershipWelcome } from "../memberships/service";
import { recomputePaymentRefunds } from "./ledger";

/**
 * Stripe webhook processing. Every handler runs inside one database
 * transaction together with marking the StripeEvent row processed, and every
 * write is keyed on a Stripe id (payment intent, Stripe invoice, refund) so a
 * redelivered event can never record a payment twice.
 */

export type ProcessResult = { status: "processed" | "duplicate" | "busy"; type: string };

const STALE_PROCESSING_MS = 5 * 60_000;

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

function fromUnix(ts: number | null | undefined): Date | null {
  return ts ? new Date(ts * 1000) : null;
}

/** Inserts (or reclaims a failed/stale) StripeEvent row. */
async function claimEvent(event: Stripe.Event): Promise<"claimed" | "duplicate" | "busy"> {
  let row = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (!row) {
    try {
      await prisma.stripeEvent.create({ data: { id: event.id, type: event.type, status: "processing" } });
      return "claimed";
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err; // concurrent delivery inserted it first
    }
    row = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  }
  if (row?.status === "processed") return "duplicate";
  const reclaimed = await prisma.stripeEvent.updateMany({
    where: { id: event.id, OR: [{ status: "failed" }, { status: "processing", receivedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } }] },
    data: { status: "processing", error: null, receivedAt: new Date() },
  });
  return reclaimed.count > 0 ? "claimed" : "busy";
}

/**
 * Idempotently processes a verified Stripe event. Throws on processing errors
 * (after recording them on the StripeEvent row) so the caller returns 5xx and
 * Stripe retries.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<ProcessResult> {
  const claim = await claimEvent(event);
  if (claim !== "claimed") return { status: claim, type: event.type };
  try {
    await prisma.$transaction(
      async (tx) => {
        await dispatch(event, tx);
        await tx.stripeEvent.update({ where: { id: event.id }, data: { status: "processed", processedAt: new Date(), error: null } });
      },
      { timeout: 20_000 },
    );
    return { status: "processed", type: event.type };
  } catch (err) {
    const message = (err as Error).message?.slice(0, 1000) ?? "Unknown error";
    await prisma.stripeEvent.update({ where: { id: event.id }, data: { status: "failed", error: message } }).catch(() => {});
    throw err;
  }
}

async function dispatch(event: Stripe.Event, tx: Tx) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handleCheckoutSession(event.data.object as Stripe.Checkout.Session, tx);
    case "payment_intent.payment_failed":
      return handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent, tx);
    case "invoice.paid":
      return handleStripeInvoicePaid(event.data.object as Stripe.Invoice, tx);
    case "invoice.payment_failed":
      return handleStripeInvoiceFailed(event.data.object as Stripe.Invoice, tx);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return handleSubscription(event.data.object as Stripe.Subscription, false, tx);
    case "customer.subscription.deleted":
      return handleSubscription(event.data.object as Stripe.Subscription, true, tx);
    case "charge.refunded":
      return handleChargeRefunded(event.data.object as Stripe.Charge, tx);
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
    case "charge.refund.updated":
      return handleRefund(event.data.object as Stripe.Refund, tx);
    default:
      return; // Not an event we act on; recorded as processed.
  }
}

// ---------------------------------------------------------------------------
// One-time invoice payments
// ---------------------------------------------------------------------------

async function handleCheckoutSession(session: Stripe.Checkout.Session, tx: Tx) {
  const kind = session.metadata?.kind;
  const stripeCustomerId = idOf(session.customer as string | { id: string } | null);
  if (session.mode === "payment" && kind === "invoice") return handleInvoiceCheckout(session, tx);
  if (session.mode === "subscription" && kind === "membership") return handleMembershipCheckout(session, stripeCustomerId, tx);
}

async function handleInvoiceCheckout(session: Stripe.Checkout.Session, tx: Tx) {
  // Only a "paid" session moves money. "unpaid" (e.g. delayed bank debits) waits for async_payment_succeeded.
  if (session.payment_status !== "paid") return;
  const invoiceId = session.metadata?.invoiceId;
  const inv =
    (invoiceId ? await tx.invoice.findUnique({ where: { id: invoiceId } }) : null) ??
    (await tx.invoice.findUnique({ where: { stripeCheckoutSessionId: session.id } }));
  if (!inv) throw new Error(`Invoice not found for checkout session ${session.id}`);
  const paymentIntentId = idOf(session.payment_intent as string | { id: string } | null);
  const amountCents = session.amount_total ?? 0;
  if (amountCents <= 0) return;

  const existing = paymentIntentId
    ? await tx.payment.findUnique({ where: { stripePaymentIntentId: paymentIntentId } })
    : await tx.payment.findFirst({ where: { method: "STRIPE", reference: session.id } });
  if (existing && existing.status !== "FAILED" && existing.status !== "PENDING") return; // already recorded

  const data = {
    invoiceId: inv.id,
    customerId: inv.customerId,
    facilityId: inv.facilityId,
    amountCents,
    status: "SUCCEEDED" as const,
    method: "STRIPE" as const,
    stripePaymentIntentId: paymentIntentId,
    reference: session.id,
    failureReason: null,
    notes: session.metadata?.deposit === "true" ? "Deposit paid online" : "Paid online by card (Stripe)",
    receivedAt: new Date(),
  };
  const payment = existing ? await tx.payment.update({ where: { id: existing.id }, data }) : await tx.payment.create({ data });
  await recalculateInvoicePayments(inv.id, tx);

  const full = await tx.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { customer: true, billToContact: true, facility: { include: { contacts: true } } } });
  const recipient = await invoiceRecipient(full);
  await queueTemplatedEmail({
    templateKey: "payment_receipt",
    to: recipient.email ?? session.customer_details?.email ?? session.customer_email,
    customerId: inv.customerId,
    facilityId: inv.facilityId,
    vars: { customerName: recipient.name || session.customer_details?.name || "", paymentAmount: formatCents(amountCents), invoiceNumber: inv.number },
    idempotencyKey: `payment-receipt:${payment.id}`,
    relatedType: "Invoice",
    relatedId: inv.id,
    tx,
  });
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent, tx: Tx) {
  if (pi.metadata?.kind !== "invoice" || !pi.metadata.invoiceId) return; // membership failures arrive as invoice.payment_failed
  const inv = await tx.invoice.findUnique({ where: { id: pi.metadata.invoiceId } });
  if (!inv) return;
  const existing = await tx.payment.findUnique({ where: { stripePaymentIntentId: pi.id } });
  if (existing && existing.status !== "FAILED" && existing.status !== "PENDING") return; // never downgrade a success
  const failureReason = (pi.last_payment_error?.message ?? pi.last_payment_error?.code ?? "Card payment failed").slice(0, 500);
  const data = {
    invoiceId: inv.id,
    customerId: inv.customerId,
    facilityId: inv.facilityId,
    amountCents: pi.amount,
    status: "FAILED" as const,
    method: "STRIPE" as const,
    stripePaymentIntentId: pi.id,
    failureReason,
    notes: "Online card payment attempt failed",
  };
  if (existing) await tx.payment.update({ where: { id: existing.id }, data });
  else await tx.payment.create({ data });
  // Invoice status is intentionally unchanged: a failed attempt does not alter what is owed.
}

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

async function findMembership(tx: Tx, opts: { membershipId?: string | null; subscriptionId?: string | null }) {
  if (opts.membershipId) {
    const m = await tx.membership.findUnique({ where: { id: opts.membershipId }, include: { plan: true } });
    if (m) return m;
  }
  if (opts.subscriptionId) return tx.membership.findUnique({ where: { stripeSubscriptionId: opts.subscriptionId }, include: { plan: true } });
  return null;
}

async function attachStripeCustomer(tx: Tx, customerId: string, stripeCustomerId: string | null) {
  if (!stripeCustomerId) return;
  const taken = await tx.customer.findUnique({ where: { stripeCustomerId } });
  if (!taken) await tx.customer.updateMany({ where: { id: customerId, stripeCustomerId: null }, data: { stripeCustomerId } });
}

async function handleMembershipCheckout(session: Stripe.Checkout.Session, stripeCustomerId: string | null, tx: Tx) {
  const subscriptionId = idOf(session.subscription as string | { id: string } | null);
  const m = await findMembership(tx, { membershipId: session.metadata?.membershipId, subscriptionId });
  if (!m) throw new Error(`Membership not found for checkout session ${session.id}`);
  await attachStripeCustomer(tx, m.customerId, stripeCustomerId);
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const activate = paid && (m.status === "PENDING" || m.status === "PAST_DUE");
  const now = new Date();
  const sub = typeof session.subscription === "object" && session.subscription ? (session.subscription as Stripe.Subscription) : null;
  const item = sub?.items?.data?.[0];
  await tx.membership.update({
    where: { id: m.id },
    data: {
      stripeSubscriptionId: m.stripeSubscriptionId ?? subscriptionId,
      stripeCheckoutSessionId: session.id,
      ...(activate
        ? {
            status: "ACTIVE",
            startedAt: m.startedAt ?? now,
            currentPeriodStart: fromUnix(item?.current_period_start) ?? m.currentPeriodStart ?? now,
            currentPeriodEnd: fromUnix(item?.current_period_end) ?? m.currentPeriodEnd ?? addInterval(now, m.plan.interval),
            failedPaymentCount: 0,
          }
        : {}),
    },
  });
  if (activate) await queueMembershipWelcome(m.id, tx);
}

function subscriptionRef(inv: Stripe.Invoice) {
  const details = inv.parent?.subscription_details;
  return { subscriptionId: idOf(details?.subscription as string | { id: string } | undefined), membershipId: details?.metadata?.membershipId ?? null };
}

async function handleStripeInvoicePaid(sinv: Stripe.Invoice, tx: Tx) {
  const ref = subscriptionRef(sinv);
  if (!ref.subscriptionId && !ref.membershipId) return; // not a subscription invoice
  const m = await findMembership(tx, ref);
  if (!m) return; // a subscription we do not manage
  await attachStripeCustomer(tx, m.customerId, idOf(sinv.customer as string | { id: string } | null));

  if (sinv.amount_paid > 0) {
    const existing = await tx.payment.findUnique({ where: { stripeInvoiceId: sinv.id } });
    if (!existing || existing.status === "FAILED" || existing.status === "PENDING") {
      const piId = idOf(sinv.payments?.data?.[0]?.payment?.payment_intent as string | { id: string } | undefined);
      const piTaken = piId ? await tx.payment.findUnique({ where: { stripePaymentIntentId: piId } }) : null;
      const data = {
        membershipId: m.id,
        customerId: m.customerId,
        amountCents: sinv.amount_paid,
        status: "SUCCEEDED" as const,
        method: "STRIPE" as const,
        stripeInvoiceId: sinv.id,
        stripePaymentIntentId: piTaken && piTaken.id !== existing?.id ? undefined : (piId ?? undefined),
        failureReason: null,
        reference: sinv.number ?? null,
        notes: `${m.plan.name} membership payment`,
        receivedAt: fromUnix(sinv.status_transitions?.paid_at) ?? new Date(),
      };
      if (existing) await tx.payment.update({ where: { id: existing.id }, data });
      else await tx.payment.create({ data });
    }
  }

  const line = sinv.lines?.data?.[0];
  const periodStart = fromUnix(line?.period?.start);
  const periodEnd = fromUnix(line?.period?.end);
  const wasPending = m.status === "PENDING";
  const status: MembershipStatus = m.status === "CANCELED" || m.status === "PAUSED" ? m.status : "ACTIVE";
  const newer = !m.currentPeriodEnd || (periodEnd && periodEnd >= m.currentPeriodEnd);
  await tx.membership.update({
    where: { id: m.id },
    data: {
      status,
      stripeSubscriptionId: m.stripeSubscriptionId ?? ref.subscriptionId,
      startedAt: m.startedAt ?? periodStart ?? new Date(),
      ...(newer && periodStart && periodEnd ? { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd } : {}),
      failedPaymentCount: 0,
    },
  });
  if (wasPending && status === "ACTIVE") await queueMembershipWelcome(m.id, tx);
}

async function handleStripeInvoiceFailed(sinv: Stripe.Invoice, tx: Tx) {
  const ref = subscriptionRef(sinv);
  if (!ref.subscriptionId && !ref.membershipId) return;
  const m = await findMembership(tx, ref);
  if (!m) return;
  const updated = await tx.membership.update({
    where: { id: m.id },
    data: {
      status: m.status === "CANCELED" ? "CANCELED" : "PAST_DUE",
      failedPaymentCount: { increment: 1 },
      lastPaymentFailedAt: new Date(),
    },
    include: { customer: true, purchaserContact: true },
  });
  const existing = await tx.payment.findUnique({ where: { stripeInvoiceId: sinv.id } });
  if (!existing) {
    await tx.payment.create({
      data: {
        membershipId: m.id,
        customerId: m.customerId,
        amountCents: sinv.amount_due,
        status: "FAILED",
        method: "STRIPE",
        stripeInvoiceId: sinv.id,
        failureReason: "Membership renewal payment failed",
        reference: sinv.number ?? null,
      },
    });
  } else if (existing.status === "FAILED" || existing.status === "PENDING") {
    await tx.payment.update({ where: { id: existing.id }, data: { status: "FAILED", failureReason: "Membership renewal payment failed" } });
  }
  if (m.status === "CANCELED") return;
  const payer = updated.purchaserContact?.email ? { email: updated.purchaserContact.email, name: updated.purchaserContact.name.split(" ")[0] } : { email: updated.customer.email, name: updated.customer.preferredName || updated.customer.firstName };
  await queueTemplatedEmail({
    templateKey: "payment_failed",
    to: payer.email,
    customerId: m.customerId,
    vars: { customerName: payer.name, planName: m.plan.name, billingUrl: `${env.appUrl}/portal` },
    idempotencyKey: `payment-failed:${sinv.id}:${sinv.attempt_count ?? 0}`,
    relatedType: "Membership",
    relatedId: m.id,
    tx,
  });
}

async function handleSubscription(sub: Stripe.Subscription, deleted: boolean, tx: Tx) {
  const m = await findMembership(tx, { membershipId: sub.metadata?.membershipId, subscriptionId: sub.id });
  if (!m) return;
  const item = sub.items?.data?.[0];
  const status = deleted ? "CANCELED" : mapStripeSubscriptionStatus(sub.status, { paused: Boolean(sub.pause_collection), current: m.status });
  const canceledAt = status === "CANCELED" ? (fromUnix(sub.ended_at) ?? fromUnix(sub.canceled_at) ?? m.canceledAt ?? new Date()) : null;
  await tx.membership.update({
    where: { id: m.id },
    data: {
      status,
      stripeSubscriptionId: m.stripeSubscriptionId ?? sub.id,
      cancelAtPeriodEnd: status === "CANCELED" ? false : Boolean(sub.cancel_at_period_end),
      canceledAt,
      ...(item?.current_period_start && item?.current_period_end
        ? { currentPeriodStart: fromUnix(item.current_period_start), currentPeriodEnd: fromUnix(item.current_period_end) }
        : {}),
      ...(status === "ACTIVE" && !m.startedAt ? { startedAt: fromUnix(sub.start_date) ?? new Date() } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

async function findPaymentForStripe(tx: Tx, refs: { paymentId?: string | null; paymentIntentId?: string | null; chargeId?: string | null }) {
  if (refs.paymentId) {
    const p = await tx.payment.findUnique({ where: { id: refs.paymentId } });
    if (p) return p;
  }
  if (refs.paymentIntentId) {
    const p = await tx.payment.findUnique({ where: { stripePaymentIntentId: refs.paymentIntentId } });
    if (p) return p;
  }
  if (refs.chargeId) return tx.payment.findFirst({ where: { stripeChargeId: refs.chargeId } });
  return null;
}

/** Inserts or updates the Refund row for a Stripe refund, adopting an unlabelled reconciliation row when one matches. */
async function upsertStripeRefund(tx: Tx, paymentId: string, r: { id: string; amount: number; status: string | null; reason?: string | null }) {
  const status = r.status ?? "pending";
  const existing = await tx.refund.findUnique({ where: { stripeRefundId: r.id } });
  if (existing) {
    if (existing.status !== status) await tx.refund.update({ where: { id: existing.id }, data: { status } });
    return;
  }
  const orphan = await tx.refund.findFirst({ where: { paymentId, stripeRefundId: null, amountCents: r.amount, reason: RECONCILED_REASON } });
  if (orphan) {
    await tx.refund.update({ where: { id: orphan.id }, data: { stripeRefundId: r.id, status } });
    return;
  }
  await tx.refund.create({ data: { paymentId, amountCents: r.amount, stripeRefundId: r.id, status, reason: r.reason ? `Stripe: ${r.reason}` : "Refunded in Stripe" } });
}

const RECONCILED_REASON = "Refunded in Stripe (reconciled from charge)";

async function handleChargeRefunded(charge: Stripe.Charge, tx: Tx) {
  const payment = await findPaymentForStripe(tx, {
    paymentId: charge.metadata?.paymentId,
    paymentIntentId: idOf(charge.payment_intent as string | { id: string } | null),
    chargeId: charge.id,
  });
  if (!payment) return;
  if (!payment.stripeChargeId) await tx.payment.update({ where: { id: payment.id }, data: { stripeChargeId: charge.id } });
  for (const r of charge.refunds?.data ?? []) await upsertStripeRefund(tx, payment.id, r);

  // Reconcile against Stripe's authoritative cumulative amount.
  const rows = await tx.refund.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "asc" } });
  let succeeded = rows.filter((r) => r.status === "succeeded").reduce((s, r) => s + r.amountCents, 0);
  for (const r of rows) {
    if (succeeded >= charge.amount_refunded) break;
    if (r.status === "pending" && succeeded + r.amountCents <= charge.amount_refunded) {
      await tx.refund.update({ where: { id: r.id }, data: { status: "succeeded" } });
      succeeded += r.amountCents;
    }
  }
  if (succeeded < charge.amount_refunded) {
    await tx.refund.create({ data: { paymentId: payment.id, amountCents: charge.amount_refunded - succeeded, status: "succeeded", reason: RECONCILED_REASON } });
  }
  await recomputePaymentRefunds(payment.id, tx);
}

async function handleRefund(refund: Stripe.Refund, tx: Tx) {
  const payment = await findPaymentForStripe(tx, {
    paymentId: refund.metadata?.paymentId,
    paymentIntentId: idOf(refund.payment_intent as string | { id: string } | null),
    chargeId: idOf(refund.charge as string | { id: string } | null),
  });
  if (!payment) return;
  await upsertStripeRefund(tx, payment.id, refund);
  await recomputePaymentRefunds(payment.id, tx);
}
