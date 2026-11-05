import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { nextCounter, randomToken, sha256 } from "../codes";
import { env } from "../env";
import { getSettings } from "../settings";
import { computeInvoiceTotals, deriveInvoiceStatus } from "../pricing";
import { formatCents } from "../money";
import { formatDate } from "../time";
import { queueTemplatedEmail } from "../email/send";

/**
 * Shared invoice operations used by admin billing, technician invoice
 * requests, facility contract billing, and Stripe webhooks.
 */

export type NewInvoiceLine = { description: string; quantity?: number; unitPriceCents: number; serviceId?: string | null; kind?: string };

export class InvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceError";
  }
}

export async function nextInvoiceNumber(client: Tx | typeof prisma = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const n = await nextCounter(`invoice-${year}`, client);
  return `KTS-${year}-${String(n).padStart(4, "0")}`;
}

/** Creates a DRAFT invoice. Exactly one of customerId / facilityId is required. */
export async function createInvoice(params: {
  customerId?: string | null;
  facilityId?: string | null;
  billToContactId?: string | null;
  appointmentId?: string | null;
  techHelpDayId?: string | null;
  lines: NewInvoiceLine[];
  notes?: string | null;
  depositCents?: number;
  tx?: Tx;
}) {
  if (!params.customerId && !params.facilityId) throw new InvoiceError("An invoice needs a customer or a facility.");
  if (params.lines.length === 0) throw new InvoiceError("An invoice needs at least one line.");
  const run = async (tx: Tx) => {
    const billing = await getSettings("billing");
    if (params.billToContactId) {
      const contact = await tx.familyContact.findUnique({ where: { id: params.billToContactId } });
      if (!contact || contact.customerId !== params.customerId || !contact.canPay) {
        throw new InvoiceError("That family contact is not authorized to pay for this customer.");
      }
    }
    const lines = params.lines.map((l, i) => {
      const quantity = Math.max(1, Math.floor(l.quantity ?? 1));
      return {
        description: l.description.slice(0, 300),
        quantity,
        unitPriceCents: Math.round(l.unitPriceCents),
        amountCents: quantity * Math.round(l.unitPriceCents),
        serviceId: l.serviceId ?? null,
        kind: l.kind ?? (l.unitPriceCents < 0 ? "DISCOUNT" : "SERVICE"),
        sortOrder: i,
      };
    });
    const totals = computeInvoiceTotals(lines, billing.taxRatePercent);
    return tx.invoice.create({
      data: {
        number: await nextInvoiceNumber(tx),
        status: "DRAFT",
        customerId: params.customerId ?? null,
        facilityId: params.facilityId ?? null,
        billToContactId: params.billToContactId ?? null,
        appointmentId: params.appointmentId ?? null,
        techHelpDayId: params.techHelpDayId ?? null,
        notes: params.notes ?? null,
        depositCents: params.depositCents ?? 0,
        ...totals,
        lines: { create: lines },
      },
      include: { lines: true },
    });
  };
  return params.tx ? run(params.tx) : prisma.$transaction(run);
}

/** Replaces the lines of a DRAFT or OPEN (unpaid) invoice and recalculates totals. */
export async function replaceInvoiceLines(invoiceId: string, lines: NewInvoiceLine[]) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (!["DRAFT", "OPEN"].includes(inv.status) || inv.amountPaidCents > 0) throw new InvoiceError("Only unpaid invoices can be edited.");
    const billing = await getSettings("billing");
    await tx.invoiceLine.deleteMany({ where: { invoiceId } });
    const rows = lines.map((l, i) => {
      const quantity = Math.max(1, Math.floor(l.quantity ?? 1));
      return { invoiceId, description: l.description, quantity, unitPriceCents: l.unitPriceCents, amountCents: quantity * l.unitPriceCents, serviceId: l.serviceId ?? null, kind: l.kind ?? (l.unitPriceCents < 0 ? "DISCOUNT" : "SERVICE"), sortOrder: i };
    });
    await tx.invoiceLine.createMany({ data: rows });
    const totals = computeInvoiceTotals(rows, billing.taxRatePercent);
    return tx.invoice.update({ where: { id: invoiceId }, data: { ...totals, stripeCheckoutSessionId: null, stripePaymentLinkUrl: null } });
  });
}

/**
 * Issues an invoice: DRAFT -> OPEN, sets due date, generates a public pay
 * token, and emails the bill-to recipient. Returns the raw token (shown once).
 */
export async function issueInvoice(invoiceId: string, opts: { sendEmail?: boolean; actorUserId?: string | null } = {}) {
  const billing = await getSettings("billing");
  const token = randomToken(24);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: true, facility: { include: { contacts: true } }, billToContact: true } });
  if (inv.status !== "DRAFT") throw new InvoiceError("Only draft invoices can be issued.");
  const issuedAt = new Date();
  const dueAt = new Date(issuedAt.getTime() + billing.invoiceDueDays * 86400_000);
  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: inv.totalCents === 0 ? "PAID" : "OPEN", issuedAt, dueAt, publicTokenHash: sha256(token) },
  });
  if (opts.sendEmail !== false) await sendInvoiceEmail(invoiceId, token);
  return { invoice: updated, payToken: token, payUrl: invoicePayUrl(token) };
}

export function invoicePayUrl(token: string) {
  return `${env.appUrl}/pay/${token}`;
}

/** Generates a fresh pay link token (invalidates the previous one). */
export async function regeneratePayToken(invoiceId: string) {
  const token = randomToken(24);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { publicTokenHash: sha256(token) } });
  return { token, url: invoicePayUrl(token) };
}

export async function findInvoiceByPayToken(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.invoice.findUnique({
    where: { publicTokenHash: sha256(token) },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: true, facility: true, billToContact: true, payments: true },
  });
}

export async function invoiceRecipient(inv: {
  customer?: { email: string | null; firstName: string } | null;
  billToContact?: { email: string | null; name: string } | null;
  facility?: { email: string | null; name: string; contacts?: { email: string | null; name: string; role: string }[] } | null;
}): Promise<{ email: string | null; name: string }> {
  if (inv.billToContact?.email) return { email: inv.billToContact.email, name: inv.billToContact.name.split(" ")[0] };
  if (inv.customer) return { email: inv.customer.email, name: inv.customer.firstName };
  if (inv.facility) {
    const billing = inv.facility.contacts?.find((c) => c.role === "BILLING" && c.email) ?? inv.facility.contacts?.find((c) => c.email);
    return { email: billing?.email ?? inv.facility.email, name: billing?.name ?? inv.facility.name };
  }
  return { email: null, name: "" };
}

export async function sendInvoiceEmail(invoiceId: string, token: string) {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { customer: true, billToContact: true, facility: { include: { contacts: true } } } });
  const biz = await getSettings("business");
  const r = await invoiceRecipient(inv);
  return queueTemplatedEmail({
    templateKey: "invoice_issued",
    to: r.email,
    customerId: inv.customerId,
    facilityId: inv.facilityId,
    vars: {
      customerName: r.name,
      invoiceNumber: inv.number,
      invoiceTotal: formatCents(inv.totalCents),
      invoiceDueDate: inv.dueAt ? formatDate(inv.dueAt, biz.timeZone) : "upon receipt",
      invoiceUrl: invoicePayUrl(token),
      paymentInstructions: env.stripeSecretKey ? "You can pay securely online by card using the link above." : "Please contact us to arrange payment by check or cash.",
    },
    idempotencyKey: `invoice-issued:${invoiceId}:${sha256(token).slice(0, 12)}`,
    relatedType: "Invoice",
    relatedId: invoiceId,
  });
}

export async function voidInvoice(invoiceId: string) {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.amountPaidCents > 0) throw new InvoiceError("Invoices with payments cannot be voided. Issue a refund instead.");
  return prisma.invoice.update({ where: { id: invoiceId }, data: { status: "VOID", voidedAt: new Date(), publicTokenHash: null } });
}

/** Recomputes paid/refunded totals from succeeded payments and updates the status. */
export async function recalculateInvoicePayments(invoiceId: string, client: Tx | typeof prisma = prisma) {
  const inv = await client.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
  const paid = inv.payments
    .filter((p) => p.status === "SUCCEEDED" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED")
    .reduce((s, p) => s + p.amountCents, 0);
  const refunded = inv.payments.reduce((s, p) => s + p.refundedCents, 0);
  const status = inv.status === "VOID" || inv.status === "DRAFT" ? inv.status : deriveInvoiceStatus({ totalCents: inv.totalCents, amountPaidCents: paid, amountRefundedCents: refunded });
  return client.invoice.update({ where: { id: invoiceId }, data: { amountPaidCents: paid, amountRefundedCents: refunded, status } });
}

/**
 * Records an offline payment (cash/check/other) entered by staff. Stripe
 * payments are ONLY recorded by verified webhooks, never through this function.
 */
export async function recordManualPayment(params: {
  invoiceId: string;
  amountCents: number;
  method: "CASH" | "CHECK" | "OTHER";
  reference?: string | null;
  notes?: string | null;
  recordedById: string;
  receivedAt?: Date;
}) {
  if (params.amountCents <= 0) throw new InvoiceError("Payment amount must be greater than zero.");
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: params.invoiceId } });
    if (inv.status === "VOID" || inv.status === "DRAFT") throw new InvoiceError("Issue the invoice before recording a payment.");
    const payment = await tx.payment.create({
      data: {
        invoiceId: inv.id,
        customerId: inv.customerId,
        facilityId: inv.facilityId,
        amountCents: params.amountCents,
        status: "SUCCEEDED",
        method: params.method,
        reference: params.reference ?? null,
        notes: params.notes ?? null,
        recordedById: params.recordedById,
        receivedAt: params.receivedAt ?? new Date(),
      },
    });
    await recalculateInvoicePayments(inv.id, tx);
    return payment;
  });
}

export function invoiceLinesFromEstimate(estimate: Prisma.JsonValue | null): NewInvoiceLine[] {
  const e = estimate as { lines?: { kind: string; label: string; amountCents: number }[] } | null;
  if (!e?.lines) return [];
  return e.lines.filter((l) => l.kind !== "TAX").map((l) => ({ description: l.label, unitPriceCents: l.amountCents, kind: l.kind }));
}
