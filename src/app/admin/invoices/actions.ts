"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { failure, fd, fdBool, fdOptional, success, type ActionState } from "@/lib/forms";
import { parseDollarsToCents } from "@/lib/money";
import { computeInvoiceTotals } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import {
  createInvoice,
  InvoiceError,
  issueInvoiceWithPayLink,
  recordManualPayment,
  regeneratePayLink,
  replaceInvoiceLinesKeepingPayLink,
  updateInvoiceDeposit,
  voidInvoice,
  type NewInvoiceLine,
} from "@/lib/billing/invoices";
import { createInvoiceCheckoutSession, currentPayLink, isStripeConfigured, refundPayment } from "@/lib/payments/stripe";

const lineSchema = z.object({
  description: z.string().trim().min(1, "Each line needs a description.").max(300),
  quantity: z.coerce.number().int().min(1).max(1000),
  unitPrice: z.string().trim(),
  serviceId: z.string().optional().nullable(),
});

function knownError(err: unknown): string | null {
  const e = err as Error;
  return ["InvoiceError", "PaymentError", "PaymentsNotConfiguredError"].includes(e?.name) ? e.message : null;
}

function parseLines(raw: string): { lines: NewInvoiceLine[] } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw || "[]");
  } catch {
    return { error: "The invoice lines could not be read." };
  }
  const parsed = z.array(lineSchema).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the invoice lines." };
  if (parsed.data.length === 0) return { error: "Add at least one line." };
  const lines: NewInvoiceLine[] = [];
  for (const l of parsed.data) {
    const cents = parseDollarsToCents(l.unitPrice);
    if (cents == null) return { error: `Enter a valid price for "${l.description}".` };
    if (Math.abs(cents) > 10_000_000) return { error: "Line amounts must be under $100,000." };
    lines.push({ description: l.description, quantity: l.quantity, unitPriceCents: cents, serviceId: l.serviceId || null });
  }
  return { lines };
}

export async function createInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("billing:manage");
  const parsed = parseLines(fd(formData, "lines"));
  if ("error" in parsed) return failure(parsed.error);
  const depositRaw = fd(formData, "deposit");
  const depositCents = depositRaw ? parseDollarsToCents(depositRaw) : 0;
  if (depositCents == null || depositCents < 0) return failure("Enter a valid deposit amount.", { deposit: "Enter a dollar amount, e.g. 50.00" });
  let id: string;
  try {
    const customerId = fdOptional(formData, "customerId");
    const facilityId = fdOptional(formData, "facilityId");
    if (customerId && facilityId) return failure("Bill either a customer or a facility, not both.");
    const billing = await getSettings("billing");
    const totals = computeInvoiceTotals(parsed.lines.map((l) => ({ quantity: l.quantity ?? 1, unitPriceCents: l.unitPriceCents })), billing.taxRatePercent);
    if (depositCents > totals.totalCents) return failure("The deposit cannot be more than the invoice total.", { deposit: "Too large" });
    const inv = await createInvoice({
      customerId,
      facilityId,
      billToContactId: customerId ? fdOptional(formData, "billToContactId") : null,
      lines: parsed.lines,
      notes: fdOptional(formData, "notes"),
      depositCents,
    });
    id = inv.id;
    await audit({ actorUserId: user.id, action: "invoice.create", entityType: "Invoice", entityId: inv.id, metadata: { number: inv.number, totalCents: inv.totalCents } });
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    throw err;
  }
  redirect(`/admin/invoices/${id}`);
}

export async function updateInvoiceLinesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("billing:manage");
  const invoiceId = fd(formData, "invoiceId");
  const parsed = parseLines(fd(formData, "lines"));
  if ("error" in parsed) return failure(parsed.error);
  const depositRaw = fd(formData, "deposit");
  const depositCents = depositRaw ? parseDollarsToCents(depositRaw) : 0;
  if (depositCents == null || depositCents < 0) return failure("Enter a valid deposit amount.");
  try {
    await replaceInvoiceLinesKeepingPayLink(invoiceId, parsed.lines);
    await updateInvoiceDeposit(invoiceId, depositCents, fdOptional(formData, "notes"));
    await audit({ actorUserId: user.id, action: "invoice.update_lines", entityType: "Invoice", entityId: invoiceId });
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    throw err;
  }
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return success("Invoice updated.");
}

export async function issueInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("billing:manage");
  const invoiceId = fd(formData, "invoiceId");
  try {
    const sendEmail = fdBool(formData, "sendEmail");
    const r = await issueInvoiceWithPayLink(invoiceId, { sendEmail, actorUserId: user.id });
    await audit({ actorUserId: user.id, action: "invoice.issue", entityType: "Invoice", entityId: invoiceId, metadata: { emailed: sendEmail } });
    revalidatePath(`/admin/invoices/${invoiceId}`);
    return success(sendEmail ? "Invoice issued and emailed (if the customer has an email address)." : "Invoice issued.", { payUrl: r.payUrl });
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    throw err;
  }
}

export async function regeneratePayLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("billing:manage");
  const invoiceId = fd(formData, "invoiceId");
  try {
    const r = await regeneratePayLink(invoiceId);
    await audit({ actorUserId: user.id, action: "invoice.regenerate_pay_link", entityType: "Invoice", entityId: invoiceId });
    revalidatePath(`/admin/invoices/${invoiceId}`);
    return success("New pay link created. The previous link no longer works.", { payUrl: r.url });
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    throw err;
  }
}

export async function recordManualPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("billing:manage");
  const invoiceId = fd(formData, "invoiceId");
  const amountCents = parseDollarsToCents(fd(formData, "amount"));
  if (amountCents == null || amountCents <= 0) return failure("Enter the amount received.", { amount: "Enter a dollar amount, e.g. 99.00" });
  const method = fd(formData, "method");
  if (!["CASH", "CHECK", "OTHER"].includes(method)) return failure("Choose how the payment was made.");
  const receivedRaw = fd(formData, "receivedAt");
  const receivedAt = receivedRaw ? new Date(`${receivedRaw}T12:00:00`) : undefined;
  if (receivedAt && Number.isNaN(receivedAt.getTime())) return failure("Enter a valid date.");
  try {
    const p = await recordManualPayment({
      invoiceId,
      amountCents,
      method: method as "CASH" | "CHECK" | "OTHER",
      reference: fdOptional(formData, "reference"),
      notes: fdOptional(formData, "notes"),
      recordedById: user.id,
      receivedAt,
    });
    await audit({ actorUserId: user.id, action: "payment.record_manual", entityType: "Payment", entityId: p.id, metadata: { invoiceId, amountCents, method } });
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    throw err;
  }
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return success("Payment recorded.");
}

export async function voidInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("billing:manage");
  const invoiceId = fd(formData, "invoiceId");
  try {
    await voidInvoice(invoiceId);
    await prisma.invoice.update({ where: { id: invoiceId }, data: { stripePaymentLinkUrl: null } });
    await audit({ actorUserId: user.id, action: "invoice.void", entityType: "Invoice", entityId: invoiceId });
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    throw err;
  }
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return success("Invoice voided. Its pay link no longer works.");
}

export async function refundPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("billing:refund");
  const paymentId = fd(formData, "paymentId");
  const amountCents = parseDollarsToCents(fd(formData, "amount"));
  if (amountCents == null || amountCents <= 0) return failure("Enter the refund amount.");
  let message: string;
  try {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const refund = await refundPayment(paymentId, amountCents, fdOptional(formData, "reason"), { actorUserId: user.id });
    await audit({ actorUserId: user.id, action: "payment.refund", entityType: "Payment", entityId: paymentId, metadata: { amountCents, refundId: refund.id, method: payment.method } });
    message =
      payment.method === "STRIPE"
        ? "Refund sent to Stripe. It will show as completed once Stripe confirms it."
        : "Refund recorded manually. Remember to return the money to the customer.";
    if (payment.invoiceId) revalidatePath(`/admin/invoices/${payment.invoiceId}`);
  } catch (err) {
    const msg = knownError(err);
    if (msg) return failure(msg);
    throw err;
  }
  revalidatePath("/admin/payments");
  return success(message);
}

/** Staff-initiated Stripe Checkout (e.g. customer on the phone, or to send the Stripe URL directly). */
export async function startInvoiceCheckoutAction(formData: FormData) {
  const user = await requirePermission("billing:manage");
  const invoiceId = fd(formData, "invoiceId");
  if (!isStripeConfigured()) redirect(`/admin/invoices/${invoiceId}?error=${encodeURIComponent("Online card payment is not configured.")}`);
  let url: string;
  try {
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const link = currentPayLink(inv);
    const s = await createInvoiceCheckoutSession(invoiceId, { returnTo: link ?? undefined, payDeposit: fd(formData, "deposit") === "1" });
    await audit({ actorUserId: user.id, action: "invoice.checkout_session", entityType: "Invoice", entityId: invoiceId, metadata: { amountCents: s.amountCents } });
    url = s.url;
  } catch (err) {
    const msg = knownError(err) ?? "Could not start Stripe Checkout.";
    if (!(err instanceof InvoiceError) && !knownError(err)) console.error("[admin checkout]", (err as Error).message);
    redirect(`/admin/invoices/${invoiceId}?error=${encodeURIComponent(msg)}`);
  }
  redirect(url);
}
