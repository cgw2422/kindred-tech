import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import { createInvoice, issueInvoice } from "@/lib/billing/invoices";
import { processStripeEvent } from "@/lib/payments/webhooks";
import { POST } from "@/app/api/stripe/webhook/route";
import { createCustomer, resetDb, seedBasics } from "../helpers/db";

const WHSEC = "whsec_test_kindred_dummy_secret";

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
});

afterAll(async () => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  await seedBasics();
});

let seq = 0;
function evt(type: string, object: Record<string, unknown>, id?: string): Stripe.Event {
  seq++;
  return {
    id: id ?? `evt_test_${Date.now()}_${seq}`,
    object: "event",
    api_version: "2026-10-28.endive",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

async function openInvoice(totalCents = 9900, extra: { depositCents?: number } = {}) {
  const customer = await createCustomer();
  const inv = await createInvoice({ customerId: customer.id, lines: [{ description: "In-home visit", unitPriceCents: totalCents }], depositCents: extra.depositCents });
  await issueInvoice(inv.id, { sendEmail: false });
  return { customer, invoice: await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } }) };
}

function checkoutSession(invoiceId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `cs_test_${seq}_${Math.random().toString(36).slice(2, 8)}`,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 9900,
    payment_intent: `pi_test_${Math.random().toString(36).slice(2, 10)}`,
    customer: null,
    customer_details: { email: "payer@example.com", name: "Pat Payer" },
    customer_email: null,
    metadata: { invoiceId, kind: "invoice" },
    subscription: null,
    ...overrides,
  };
}

function signedRequest(payload: string, opts: { secret?: string; header?: string | null } = {}) {
  const header =
    opts.header === undefined ? Stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? WHSEC }) : opts.header;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (header) headers["stripe-signature"] = header;
  return new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", headers, body: payload });
}

async function membershipFixture(status: "PENDING" | "ACTIVE" = "ACTIVE") {
  const customer = await createCustomer();
  const plan = await prisma.membershipPlan.create({
    data: { name: "Kindred Care Monthly", slug: `care-${Math.random()}`, description: "x", priceCents: 2900, interval: "MONTH", remoteMinutesPerPeriod: 60, benefitsText: [] },
  });
  const m = await prisma.membership.create({
    data: {
      planId: plan.id,
      customerId: customer.id,
      priceCents: 2900,
      status,
      stripeSubscriptionId: "sub_test_123",
      startedAt: status === "ACTIVE" ? new Date("2026-09-01T00:00:00Z") : null,
    },
  });
  return { customer, plan, membership: m };
}

describe("webhook route (signature verification)", () => {
  it("rejects a bad signature with 400 and records nothing", async () => {
    const { invoice } = await openInvoice();
    const payload = JSON.stringify(evt("checkout.session.completed", checkoutSession(invoice.id)));
    const bad = await POST(signedRequest(payload, { secret: "whsec_wrong_secret" }));
    expect(bad.status).toBe(400);
    const missing = await POST(signedRequest(payload, { header: null }));
    expect(missing.status).toBe(400);
    const tampered = await POST(signedRequest(payload, { header: Stripe.webhooks.generateTestHeaderString({ payload: payload + " ", secret: WHSEC }) }));
    expect(tampered.status).toBe(400);
    expect(await prisma.stripeEvent.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("returns 503 when the webhook secret is not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const res = await POST(signedRequest("{}"));
      expect(res.status).toBe(503);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
    }
  });

  it("accepts a correctly signed event and marks the invoice paid exactly once across duplicate deliveries", async () => {
    const { invoice } = await openInvoice();
    const event = evt("checkout.session.completed", checkoutSession(invoice.id));
    const payload = JSON.stringify(event);
    const first = await POST(signedRequest(payload));
    expect(first.status).toBe(200);
    const second = await POST(signedRequest(payload));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ status: "duplicate" });

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(inv.status).toBe("PAID");
    expect(inv.amountPaidCents).toBe(9900);
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id, status: "SUCCEEDED" } })).toBe(1);
    expect((await prisma.stripeEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("processed");
    expect(await prisma.communication.count({ where: { templateKey: "payment_receipt" } })).toBe(1);
  });

  it("returns 500 (so Stripe retries) when processing fails and records the error", async () => {
    const event = evt("checkout.session.completed", checkoutSession("missing-invoice-id"));
    const res = await POST(signedRequest(JSON.stringify(event)));
    expect(res.status).toBe(500);
    const row = await prisma.stripeEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/Invoice not found/);
  });
});

describe("processStripeEvent", () => {
  it("checkout.session.completed is idempotent even when the same payment arrives as two different events", async () => {
    const { invoice } = await openInvoice();
    const session = checkoutSession(invoice.id);
    await processStripeEvent(evt("checkout.session.completed", session));
    await processStripeEvent(evt("checkout.session.completed", session)); // different event id, same payment intent
    await processStripeEvent(evt("checkout.session.async_payment_succeeded", session));
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(inv.status).toBe("PAID");
    expect(inv.amountPaidCents).toBe(9900);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.communication.count({ where: { templateKey: "payment_receipt" } })).toBe(1);
  });

  it("does not mark an unpaid checkout session as paid", async () => {
    const { invoice } = await openInvoice();
    await processStripeEvent(evt("checkout.session.completed", checkoutSession(invoice.id, { payment_status: "unpaid" })));
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(inv.status).toBe("OPEN");
    expect(inv.amountPaidCents).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("records a deposit as a partial payment", async () => {
    const { invoice } = await openInvoice(20000, { depositCents: 5000 });
    await processStripeEvent(evt("checkout.session.completed", checkoutSession(invoice.id, { amount_total: 5000, metadata: { invoiceId: invoice.id, kind: "invoice", deposit: "true" } })));
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(inv.status).toBe("PARTIALLY_PAID");
    expect(inv.amountPaidCents).toBe(5000);
  });

  it("payment_intent.payment_failed records a failed attempt without changing the invoice, and a later success upgrades it", async () => {
    const { invoice } = await openInvoice();
    const pi = { id: "pi_fail_1", object: "payment_intent", amount: 9900, metadata: { invoiceId: invoice.id, kind: "invoice" }, last_payment_error: { message: "Your card was declined." } };
    await processStripeEvent(evt("payment_intent.payment_failed", pi));
    let pay = await prisma.payment.findUniqueOrThrow({ where: { stripePaymentIntentId: "pi_fail_1" } });
    expect(pay.status).toBe("FAILED");
    expect(pay.failureReason).toBe("Your card was declined.");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("OPEN");

    await processStripeEvent(evt("checkout.session.completed", checkoutSession(invoice.id, { payment_intent: "pi_fail_1" })));
    pay = await prisma.payment.findUniqueOrThrow({ where: { stripePaymentIntentId: "pi_fail_1" } });
    expect(pay.status).toBe("SUCCEEDED");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");
    // A late failure event must never downgrade the success
    await processStripeEvent(evt("payment_intent.payment_failed", pi));
    expect((await prisma.payment.findUniqueOrThrow({ where: { stripePaymentIntentId: "pi_fail_1" } })).status).toBe("SUCCEEDED");
  });

  it("invoice.payment_failed marks the membership PAST_DUE and queues a payment_failed email once", async () => {
    const { membership } = await membershipFixture();
    const sinv = {
      id: "in_test_fail",
      object: "invoice",
      amount_due: 2900,
      amount_paid: 0,
      attempt_count: 1,
      number: "ABC-0001",
      customer: "cus_test",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_test_123", metadata: { membershipId: membership.id } } },
      lines: { data: [] },
    };
    const event = evt("invoice.payment_failed", sinv);
    await processStripeEvent(event);
    await processStripeEvent(event); // duplicate delivery
    const m = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(m.status).toBe("PAST_DUE");
    expect(m.failedPaymentCount).toBe(1);
    expect(m.lastPaymentFailedAt).not.toBeNull();
    expect(await prisma.communication.count({ where: { templateKey: "payment_failed", relatedId: membership.id } })).toBe(1);
    expect(await prisma.job.count({ where: { type: "email.send" } })).toBe(1);

    // A later successful retry restores ACTIVE, records the payment, resets the counter
    await processStripeEvent(
      evt("invoice.paid", {
        ...sinv,
        amount_paid: 2900,
        status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
        lines: { data: [{ period: { start: 1793491200, end: 1796169600 } }] },
      }),
    );
    const after = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.failedPaymentCount).toBe(0);
    expect(after.currentPeriodStart?.getTime()).toBe(1793491200 * 1000);
    const pays = await prisma.payment.findMany({ where: { membershipId: membership.id } });
    expect(pays).toHaveLength(1);
    expect(pays[0].status).toBe("SUCCEEDED");
    expect(pays[0].amountCents).toBe(2900);
  });

  it("invoice.paid for a renewal is recorded once even if delivered under two event ids", async () => {
    const { membership } = await membershipFixture();
    const sinv = {
      id: "in_test_renew",
      object: "invoice",
      amount_paid: 2900,
      amount_due: 2900,
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_test_123", metadata: {} } },
      lines: { data: [{ period: { start: 1793491200, end: 1796169600 } }] },
    };
    await processStripeEvent(evt("invoice.paid", sinv));
    await processStripeEvent(evt("invoice.paid", sinv));
    expect(await prisma.payment.count({ where: { membershipId: membership.id } })).toBe(1);
  });

  it("checkout.session.completed for a membership activates it and queues the welcome email", async () => {
    const { membership, customer } = await membershipFixture("PENDING");
    await prisma.membership.update({ where: { id: membership.id }, data: { stripeSubscriptionId: null } });
    await processStripeEvent(
      evt("checkout.session.completed", {
        id: "cs_mem_1",
        object: "checkout.session",
        mode: "subscription",
        payment_status: "paid",
        subscription: "sub_new_1",
        customer: "cus_new_1",
        metadata: { membershipId: membership.id, kind: "membership" },
      }),
    );
    const m = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(m.status).toBe("ACTIVE");
    expect(m.stripeSubscriptionId).toBe("sub_new_1");
    expect(m.startedAt).not.toBeNull();
    expect(m.currentPeriodEnd).not.toBeNull();
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).stripeCustomerId).toBe("cus_new_1");
    expect(await prisma.communication.count({ where: { templateKey: "membership_welcome" } })).toBe(1);
  });

  it("customer.subscription.deleted cancels the membership; updated maps cancel_at_period_end", async () => {
    const { membership } = await membershipFixture();
    const sub = {
      id: "sub_test_123",
      object: "subscription",
      status: "active",
      cancel_at_period_end: true,
      canceled_at: null,
      ended_at: null,
      pause_collection: null,
      metadata: { membershipId: membership.id },
      start_date: 1788220800,
      items: { data: [{ current_period_start: 1793491200, current_period_end: 1796169600 }] },
    };
    await processStripeEvent(evt("customer.subscription.updated", sub));
    let m = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(m.status).toBe("ACTIVE");
    expect(m.cancelAtPeriodEnd).toBe(true);
    expect(m.currentPeriodEnd?.getTime()).toBe(1796169600 * 1000);

    await processStripeEvent(evt("customer.subscription.deleted", { ...sub, status: "canceled", ended_at: 1796169600, canceled_at: 1795000000 }));
    m = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(m.status).toBe("CANCELED");
    expect(m.canceledAt?.getTime()).toBe(1796169600 * 1000);
    expect(m.cancelAtPeriodEnd).toBe(false);
  });

  it("charge.refunded updates the payment, refund rows, and invoice (idempotently)", async () => {
    const { invoice } = await openInvoice();
    await processStripeEvent(evt("checkout.session.completed", checkoutSession(invoice.id, { payment_intent: "pi_refund_1" })));
    const payment = await prisma.payment.findUniqueOrThrow({ where: { stripePaymentIntentId: "pi_refund_1" } });
    // A refund initiated from our admin is first recorded as pending
    await prisma.refund.create({ data: { paymentId: payment.id, amountCents: 4000, stripeRefundId: "re_1", status: "pending" } });

    const charge = {
      id: "ch_1",
      object: "charge",
      amount: 9900,
      amount_refunded: 4000,
      refunded: false,
      payment_intent: "pi_refund_1",
      metadata: {},
      refunds: { data: [{ id: "re_1", object: "refund", amount: 4000, status: "succeeded" }] },
    };
    await processStripeEvent(evt("charge.refunded", charge));
    let pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pay.refundedCents).toBe(4000);
    expect(pay.status).toBe("PARTIALLY_REFUNDED");
    expect(pay.stripeChargeId).toBe("ch_1");
    let inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(inv.amountRefundedCents).toBe(4000);
    expect(inv.status).toBe("PARTIALLY_PAID");

    // Full refund from the Stripe dashboard (no refunds list expanded) followed by its refund.updated event
    const full = evt("charge.refunded", { ...charge, amount_refunded: 9900, refunded: true, refunds: undefined });
    await processStripeEvent(full);
    await processStripeEvent(full);
    await processStripeEvent(evt("refund.updated", { id: "re_2", object: "refund", amount: 5900, status: "succeeded", payment_intent: "pi_refund_1", charge: "ch_1", metadata: {} }));
    pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pay.refundedCents).toBe(9900);
    expect(pay.status).toBe("REFUNDED");
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(2);
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(inv.status).toBe("REFUNDED");
    expect(inv.amountRefundedCents).toBe(9900);
  });

  it("a failed refund is reversed out of the refunded total", async () => {
    const { invoice } = await openInvoice();
    await processStripeEvent(evt("checkout.session.completed", checkoutSession(invoice.id, { payment_intent: "pi_rf" })));
    const payment = await prisma.payment.findUniqueOrThrow({ where: { stripePaymentIntentId: "pi_rf" } });
    await processStripeEvent(evt("refund.created", { id: "re_x", amount: 1000, status: "succeeded", payment_intent: "pi_rf", charge: "ch_x", metadata: { paymentId: payment.id } }));
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedCents).toBe(1000);
    await processStripeEvent(evt("refund.failed", { id: "re_x", amount: 1000, status: "failed", payment_intent: "pi_rf", charge: "ch_x", metadata: { paymentId: payment.id } }));
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.refundedCents).toBe(0);
    expect(after.status).toBe("SUCCEEDED");
  });

  it("ignores unrelated event types but records them as processed", async () => {
    const e = evt("customer.created", { id: "cus_1", object: "customer" });
    expect(await processStripeEvent(e)).toMatchObject({ status: "processed" });
    expect(await processStripeEvent(e)).toMatchObject({ status: "duplicate" });
  });
});
