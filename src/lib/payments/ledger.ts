import { prisma, type Tx } from "../db";
import { recalculateInvoicePayments } from "../billing/invoices";

/** Refund statuses that count against a payment's refundable amount. */
const COMMITTED = new Set(["succeeded", "pending", "requires_action"]);

/** Sums refunds that are committed (succeeded, plus Stripe refunds still pending). */
export function committedRefundCents(refunds: { amountCents: number; status: string }[]) {
  return refunds.filter((r) => COMMITTED.has(r.status)).reduce((s, r) => s + r.amountCents, 0);
}

export function succeededRefundCents(refunds: { amountCents: number; status: string }[]) {
  return refunds.filter((r) => r.status === "succeeded").reduce((s, r) => s + r.amountCents, 0);
}

export function paymentStatusAfterRefund(amountCents: number, refundedCents: number): "SUCCEEDED" | "PARTIALLY_REFUNDED" | "REFUNDED" {
  if (refundedCents <= 0) return "SUCCEEDED";
  return refundedCents >= amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED";
}

/**
 * Sets Payment.refundedCents to the sum of its succeeded Refund rows, updates
 * the payment status, and recalculates the linked invoice.
 */
export async function recomputePaymentRefunds(paymentId: string, client: Tx | typeof prisma = prisma) {
  const payment = await client.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { refunds: true } });
  if (!["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) return payment;
  const refundedCents = Math.min(payment.amountCents, succeededRefundCents(payment.refunds));
  const updated = await client.payment.update({
    where: { id: payment.id },
    data: { refundedCents, status: paymentStatusAfterRefund(payment.amountCents, refundedCents) },
  });
  if (payment.invoiceId) await recalculateInvoicePayments(payment.invoiceId, client);
  return updated;
}
