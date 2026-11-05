import Stripe from "stripe";
import { prisma } from "../db";
import { env } from "../env";
import { sha256 } from "../codes";
import { invoiceBalance } from "../pricing";
import { InvoiceError, invoicePayUrl, regeneratePayToken } from "../billing/invoices";
import { committedRefundCents, recomputePaymentRefunds } from "./ledger";

/**
 * Stripe integration. Card data never touches our servers: customers pay on
 * Stripe-hosted Checkout pages, and payments are only recorded as succeeded
 * from signature-verified webhooks (see ./webhooks.ts).
 *
 * When STRIPE_SECRET_KEY is not configured, getStripe() returns null and every
 * online-payment entry point throws a PaymentsNotConfiguredError; the rest of
 * billing (invoices, manual cash/check payments) keeps working.
 */

export class PaymentsNotConfiguredError extends Error {
  constructor(message = "Online card payment is not configured. Record cash or check payments manually instead.") {
    super(message);
    this.name = "PaymentsNotConfiguredError";
  }
}

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export const NOT_CONFIGURED_LABEL = "Unpaid — online card payment is not configured";

let cached: { key: string; client: Stripe } | null = null;

/** Lazily constructs the Stripe client. Returns null when no secret key is configured. */
export function getStripe(): Stripe | null {
  const key = env.stripeSecretKey;
  if (!key) return null;
  if (cached?.key !== key) {
    cached = { key, client: new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "Kindred Tech Support" } }) };
  }
  return cached.client;
}

export function isStripeConfigured(): boolean {
  return Boolean(env.stripeSecretKey);
}

export function requireStripe(): Stripe {
  const s = getStripe();
  if (!s) throw new PaymentsNotConfiguredError();
  return s;
}

/** Returns the Stripe customer id for a Customer, creating it in Stripe if needed. */
export async function getOrCreateStripeCustomer(customerId: string, opts: { emailOverride?: string | null } = {}): Promise<string> {
  const stripe = requireStripe();
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (customer.stripeCustomerId) return customer.stripeCustomerId;
  const created = await stripe.customers.create(
    {
      email: customer.email ?? opts.emailOverride ?? undefined,
      name: `${customer.firstName} ${customer.lastName}`.trim(),
      metadata: { customerId: customer.id },
    },
    { idempotencyKey: `kts-customer-${customer.id}` },
  );
  // Only set if still empty (another request may have raced us).
  const res = await prisma.customer.updateMany({ where: { id: customer.id, stripeCustomerId: null }, data: { stripeCustomerId: created.id } });
  if (res.count === 0) {
    const again = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    return again.stripeCustomerId ?? created.id;
  }
  return created.id;
}

/** Amount the customer can pay right now: the deposit (when requested and nothing is paid yet) or the balance. */
export function payableAmount(
  inv: { totalCents: number; amountPaidCents: number; amountRefundedCents: number; depositCents: number },
  opts: { payDeposit?: boolean } = {},
): { amountCents: number; isDeposit: boolean } {
  const balance = invoiceBalance(inv);
  if (opts.payDeposit && inv.depositCents > 0 && inv.amountPaidCents === 0 && inv.depositCents < balance) {
    return { amountCents: inv.depositCents, isDeposit: true };
  }
  return { amountCents: balance, isDeposit: false };
}

function returnUrl(base: string, status: "success" | "canceled") {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}status=${status}`;
}

/**
 * Creates a Stripe Checkout Session (mode "payment") for an invoice's balance
 * or deposit. `returnTo` is the absolute URL the customer comes back to; by
 * default the public pay page for `payToken`.
 */
export async function createInvoiceCheckoutSession(
  invoiceId: string,
  opts: { payToken?: string; returnTo?: string; payDeposit?: boolean } = {},
): Promise<{ url: string; sessionId: string; amountCents: number; isDeposit: boolean }> {
  const stripe = requireStripe();
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: true, billToContact: true, facility: true } });
  if (!["OPEN", "PARTIALLY_PAID"].includes(inv.status)) throw new InvoiceError("This invoice is not open for payment.");
  const { amountCents, isDeposit } = payableAmount(inv, { payDeposit: opts.payDeposit });
  if (amountCents <= 0) throw new InvoiceError("This invoice has no balance due.");
  if (amountCents < 50) throw new InvoiceError("The amount due is below the minimum card payment of $0.50.");

  const base = opts.returnTo ?? (opts.payToken ? invoicePayUrl(opts.payToken) : `${env.appUrl}/admin/invoices/${inv.id}`);
  const metadata = { invoiceId: inv.id, kind: "invoice", invoiceNumber: inv.number, deposit: isDeposit ? "true" : "false" };

  let customer: string | undefined;
  let customerEmail: string | undefined;
  if (inv.billToContact?.email) {
    // A family member is paying: do not attach their card to the senior's Stripe customer.
    customerEmail = inv.billToContact.email;
  } else if (inv.customerId) {
    customer = await getOrCreateStripeCustomer(inv.customerId);
  } else {
    customerEmail = inv.facility?.email ?? undefined;
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer,
      customer_email: customer ? undefined : customerEmail,
      client_reference_id: inv.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: { name: isDeposit ? `Deposit for invoice ${inv.number}` : `Invoice ${inv.number}`, description: "Kindred Tech Support" },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata, description: `Invoice ${inv.number}` },
      success_url: returnUrl(base, "success"),
      cancel_url: returnUrl(base, "canceled"),
    },
    // Same invoice + amount + minute → same session, so double-clicks do not create duplicates.
    { idempotencyKey: `kts-inv-${inv.id}-${amountCents}-${inv.amountPaidCents}-${Math.floor(Date.now() / 60_000)}` },
  );
  if (!session.url) throw new PaymentError("Stripe did not return a checkout URL.");
  await prisma.invoice.update({ where: { id: inv.id }, data: { stripeCheckoutSessionId: session.id } });
  return { url: session.url, sessionId: session.id, amountCents, isDeposit };
}

/**
 * "Payment link" for an invoice: our own /pay/<token> page, which creates a
 * Checkout Session when the customer clicks Pay (Stripe Payment Links cannot
 * carry ad-hoc invoice amounts). Reuses the stored link while its token is
 * still the invoice's current token; otherwise issues a fresh token.
 */
export async function createPaymentLink(invoiceId: string, opts: { forceNew?: boolean } = {}): Promise<string> {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status === "DRAFT" || inv.status === "VOID") throw new InvoiceError("Issue the invoice before creating a payment link.");
  if (!opts.forceNew && inv.stripePaymentLinkUrl && inv.publicTokenHash) {
    const token = inv.stripePaymentLinkUrl.split("/pay/")[1]?.split(/[?#]/)[0];
    if (token && sha256(token) === inv.publicTokenHash) return inv.stripePaymentLinkUrl;
  }
  const { url } = await regeneratePayToken(invoiceId);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { stripePaymentLinkUrl: url } });
  return url;
}

/** Returns the stored pay link if it is still valid for the invoice, else null (does not create one). */
export function currentPayLink(inv: { stripePaymentLinkUrl: string | null; publicTokenHash: string | null }): string | null {
  if (!inv.stripePaymentLinkUrl || !inv.publicTokenHash) return null;
  const token = inv.stripePaymentLinkUrl.split("/pay/")[1]?.split(/[?#]/)[0];
  return token && sha256(token) === inv.publicTokenHash ? inv.stripePaymentLinkUrl : null;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

/**
 * Refunds a payment.
 *  - STRIPE: creates a Stripe refund and records a "pending" Refund row. The
 *    payment/invoice totals are only updated when Stripe confirms the refund
 *    via webhook (charge.refunded / refund.updated).
 *  - CASH / CHECK / OTHER: records the refund as manually handled and updates
 *    the totals immediately (the money was returned outside Stripe).
 */
export async function refundPayment(paymentId: string, amountCents: number, reason?: string | null, opts: { actorUserId?: string | null } = {}) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new PaymentError("Refund amount must be greater than zero.");
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { refunds: true } });
  if (!["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status)) throw new PaymentError("Only successful payments can be refunded.");
  const available = payment.amountCents - Math.max(payment.refundedCents, committedRefundCents(payment.refunds));
  if (amountCents > available) throw new PaymentError(`At most ${(available / 100).toFixed(2)} can still be refunded on this payment.`);
  const cleanReason = reason?.slice(0, 500) || null;

  if (payment.method === "STRIPE") {
    const stripe = requireStripe();
    if (!payment.stripePaymentIntentId && !payment.stripeChargeId) throw new PaymentError("This Stripe payment has no payment reference to refund.");
    const refund = await stripe.refunds.create(
      {
        ...(payment.stripePaymentIntentId ? { payment_intent: payment.stripePaymentIntentId } : { charge: payment.stripeChargeId! }),
        amount: amountCents,
        reason: "requested_by_customer",
        metadata: { paymentId: payment.id, kind: "refund", actorUserId: opts.actorUserId ?? "" },
      },
      { idempotencyKey: `kts-refund-${payment.id}-${amountCents}-${payment.refunds.length}` },
    );
    return prisma.refund.upsert({
      where: { stripeRefundId: refund.id },
      create: { paymentId: payment.id, amountCents, reason: cleanReason, stripeRefundId: refund.id, status: refund.status === "failed" || refund.status === "canceled" ? refund.status : "pending" },
      update: {},
    });
  }

  return prisma.$transaction(async (tx) => {
    // Lock the payment and re-check so concurrent refunds cannot exceed the amount paid.
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${payment.id} FOR UPDATE`;
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { refunds: true } });
    const left = fresh.amountCents - Math.max(fresh.refundedCents, committedRefundCents(fresh.refunds));
    if (amountCents > left) throw new PaymentError(`At most ${(left / 100).toFixed(2)} can still be refunded on this payment.`);
    const row = await tx.refund.create({ data: { paymentId: payment.id, amountCents, reason: cleanReason ?? "Refunded manually", status: "succeeded" } });
    await recomputePaymentRefunds(payment.id, tx);
    return row;
  });
}

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

/** Creates a subscription Checkout Session for a PENDING membership. */
export async function createMembershipCheckoutSession(
  membershipId: string,
  opts: { returnTo?: string } = {},
): Promise<{ url: string; sessionId: string }> {
  const stripe = requireStripe();
  const m = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { plan: true, customer: true, purchaserContact: true } });
  if (m.status !== "PENDING") throw new PaymentError("Only pending memberships can be sent to checkout.");
  if (m.stripeSubscriptionId) throw new PaymentError("This membership already has a Stripe subscription.");
  const customer = await getOrCreateStripeCustomer(m.customerId, { emailOverride: m.purchaserContact?.email });
  const base = opts.returnTo ?? `${env.appUrl}/admin/memberships?membership=${m.id}`;
  const metadata = { membershipId: m.id, kind: "membership", customerId: m.customerId, purchaserContactId: m.purchaserContactId ?? "" };
  const lineItem = m.plan.stripePriceId && m.priceCents === m.plan.priceCents
    ? { price: m.plan.stripePriceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: m.priceCents,
          recurring: { interval: m.plan.interval === "YEAR" ? ("year" as const) : ("month" as const) },
          product_data: { name: m.plan.name },
        },
      };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      client_reference_id: m.id,
      line_items: [lineItem],
      metadata,
      subscription_data: { metadata },
      success_url: returnUrl(base, "success"),
      cancel_url: returnUrl(base, "canceled"),
    },
    { idempotencyKey: `kts-mem-${m.id}-${Math.floor(Date.now() / 60_000)}` },
  );
  if (!session.url) throw new PaymentError("Stripe did not return a checkout URL.");
  await prisma.membership.update({ where: { id: m.id }, data: { stripeCheckoutSessionId: session.id } });
  return { url: session.url, sessionId: session.id };
}

/** Cancels (or schedules cancellation of) a Stripe subscription. Local state is updated by the caller and confirmed by webhook. */
export async function cancelStripeSubscription(subscriptionId: string, opts: { immediately: boolean }) {
  const stripe = requireStripe();
  if (opts.immediately) return stripe.subscriptions.cancel(subscriptionId, {}, { idempotencyKey: `kts-cancel-${subscriptionId}` });
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

export async function setStripeSubscriptionPaused(subscriptionId: string, paused: boolean) {
  const stripe = requireStripe();
  return stripe.subscriptions.update(subscriptionId, paused ? { pause_collection: { behavior: "void" } } : { pause_collection: "" });
}

export async function resumeStripeSubscriptionRenewal(subscriptionId: string) {
  const stripe = requireStripe();
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
}

/** Creates a Stripe Billing Portal session for a customer with a Stripe customer id. */
export async function createBillingPortalSession(customerId: string, returnTo: string): Promise<string> {
  const stripe = requireStripe();
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (!customer.stripeCustomerId) throw new PaymentError("There is no card on file to manage yet.");
  const session = await stripe.billingPortal.sessions.create({ customer: customer.stripeCustomerId, return_url: returnTo });
  return session.url;
}
