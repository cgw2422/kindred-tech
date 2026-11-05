import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/codes";
import {
  createInvoice,
  findInvoiceByPayToken,
  InvoiceError,
  issueInvoice,
  issueInvoiceWithPayLink,
  recordManualPayment,
  regeneratePayLink,
  replaceInvoiceLinesKeepingPayLink,
  voidInvoice,
} from "@/lib/billing/invoices";
import { invoiceBalance } from "@/lib/pricing";
import { createInvoiceCheckoutSession, createPaymentLink, currentPayLink, payableAmount, PaymentsNotConfiguredError, refundPayment } from "@/lib/payments/stripe";
import { getInvoiceForUser, listInvoicesForUser } from "@/lib/payments/portal";
import { createCustomer, createUser, resetDb, seedBasics } from "../helpers/db";

let staffId: string;

beforeEach(async () => {
  await resetDb();
  await seedBasics();
  staffId = (await createUser("ADMIN")).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function issued(lines: { description: string; quantity?: number; unitPriceCents: number }[], extra: { depositCents?: number; customerId?: string; billToContactId?: string } = {}) {
  const customerId = extra.customerId ?? (await createCustomer()).id;
  const inv = await createInvoice({ customerId, lines, depositCents: extra.depositCents, billToContactId: extra.billToContactId });
  const r = await issueInvoiceWithPayLink(inv.id, { sendEmail: false });
  return { ...r, invoiceId: inv.id, customerId };
}

describe("invoice totals", () => {
  it("computes subtotal, discounts, tax and total", async () => {
    await prisma.setting.update({ where: { key: "billing" }, data: { value: { invoiceDueDays: 14, taxRatePercent: 5, defaultTravelFeeCents: 0, depositPercent: 0 } } });
    const customer = await createCustomer();
    const inv = await createInvoice({
      customerId: customer.id,
      lines: [
        { description: "Visit", unitPriceCents: 9900 },
        { description: "Extra 30 minutes", quantity: 2, unitPriceCents: 4000 },
        { description: "Member discount", unitPriceCents: -1790 },
      ],
    });
    expect(inv.subtotalCents).toBe(17900);
    expect(inv.discountCents).toBe(1790);
    expect(inv.taxCents).toBe(806); // 5% of 16110 = 805.5 -> 806
    expect(inv.totalCents).toBe(16916);
    expect(inv.status).toBe("DRAFT");
    expect(inv.lines).toHaveLength(3);
  });

  it("requires a customer or facility and at least one line", async () => {
    await expect(createInvoice({ lines: [{ description: "x", unitPriceCents: 100 }] })).rejects.toBeInstanceOf(InvoiceError);
    const c = await createCustomer();
    await expect(createInvoice({ customerId: c.id, lines: [] })).rejects.toBeInstanceOf(InvoiceError);
  });
});

describe("manual payments", () => {
  it("records partial then full cash/check payments", async () => {
    const { invoiceId } = await issued([{ description: "Visit", unitPriceCents: 10000 }]);
    await recordManualPayment({ invoiceId, amountCents: 4000, method: "CASH", recordedById: staffId });
    let inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv.status).toBe("PARTIALLY_PAID");
    expect(invoiceBalance(inv)).toBe(6000);
    await recordManualPayment({ invoiceId, amountCents: 6000, method: "CHECK", reference: "1042", recordedById: staffId });
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv.status).toBe("PAID");
    expect(inv.amountPaidCents).toBe(10000);
    const pays = await prisma.payment.findMany({ where: { invoiceId } });
    expect(pays.every((p) => p.recordedById === staffId && p.method !== "STRIPE")).toBe(true);
  });

  it("rejects payments on drafts and non-positive amounts", async () => {
    const c = await createCustomer();
    const draft = await createInvoice({ customerId: c.id, lines: [{ description: "x", unitPriceCents: 1000 }] });
    await expect(recordManualPayment({ invoiceId: draft.id, amountCents: 1000, method: "CASH", recordedById: staffId })).rejects.toBeInstanceOf(InvoiceError);
    const { invoiceId } = await issued([{ description: "x", unitPriceCents: 1000 }]);
    await expect(recordManualPayment({ invoiceId, amountCents: 0, method: "CASH", recordedById: staffId })).rejects.toBeInstanceOf(InvoiceError);
  });

  it("records a manual refund for a cash payment and updates the invoice", async () => {
    const { invoiceId } = await issued([{ description: "Visit", unitPriceCents: 10000 }]);
    const p = await recordManualPayment({ invoiceId, amountCents: 10000, method: "CASH", recordedById: staffId });
    await refundPayment(p.id, 2500, "Partial refund — shorter visit");
    let pay = await prisma.payment.findUniqueOrThrow({ where: { id: p.id }, include: { refunds: true } });
    expect(pay.status).toBe("PARTIALLY_REFUNDED");
    expect(pay.refundedCents).toBe(2500);
    expect(pay.refunds[0].status).toBe("succeeded");
    let inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv.status).toBe("PARTIALLY_PAID");
    await expect(refundPayment(p.id, 8000, null)).rejects.toThrow(/At most 75.00/);
    await refundPayment(p.id, 7500, null);
    pay = await prisma.payment.findUniqueOrThrow({ where: { id: p.id }, include: { refunds: true } });
    expect(pay.status).toBe("REFUNDED");
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv.status).toBe("REFUNDED");
  });

  it("refuses a card refund when Stripe is not configured", async () => {
    const { invoiceId } = await issued([{ description: "Visit", unitPriceCents: 5000 }]);
    const p = await prisma.payment.create({ data: { invoiceId, amountCents: 5000, status: "SUCCEEDED", method: "STRIPE", stripePaymentIntentId: "pi_x" } });
    await expect(refundPayment(p.id, 1000, null)).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
    expect(await prisma.refund.count()).toBe(0);
  });
});

describe("voiding", () => {
  it("cannot void an invoice with payments; can void an unpaid one", async () => {
    const paid = await issued([{ description: "Visit", unitPriceCents: 5000 }]);
    await recordManualPayment({ invoiceId: paid.invoiceId, amountCents: 5000, method: "CASH", recordedById: staffId });
    await expect(voidInvoice(paid.invoiceId)).rejects.toThrow(/cannot be voided/);
    const unpaid = await issued([{ description: "Visit", unitPriceCents: 5000 }]);
    await voidInvoice(unpaid.invoiceId);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: unpaid.invoiceId } });
    expect(inv.status).toBe("VOID");
    expect(await findInvoiceByPayToken(unpaid.payToken)).toBeNull();
  });
});

describe("family payers", () => {
  it("a family contact without canPay cannot be the bill-to", async () => {
    const c = await createCustomer();
    const noPay = await prisma.familyContact.create({ data: { customerId: c.id, name: "Sam Son", canPay: false } });
    await expect(createInvoice({ customerId: c.id, billToContactId: noPay.id, lines: [{ description: "x", unitPriceCents: 100 }] })).rejects.toThrow(/not authorized to pay/);
    const other = await createCustomer();
    const otherPayer = await prisma.familyContact.create({ data: { customerId: other.id, name: "Other", canPay: true } });
    await expect(createInvoice({ customerId: c.id, billToContactId: otherPayer.id, lines: [{ description: "x", unitPriceCents: 100 }] })).rejects.toThrow(/not authorized to pay/);
    const payer = await prisma.familyContact.create({ data: { customerId: c.id, name: "Dana Daughter", canPay: true, email: "dana@example.com" } });
    const inv = await createInvoice({ customerId: c.id, billToContactId: payer.id, lines: [{ description: "x", unitPriceCents: 100 }] });
    expect(inv.billToContactId).toBe(payer.id);
  });

  it("portal: account holder and canPay family payer see the invoice; others do not; drafts hidden", async () => {
    const c = await createCustomer({ firstName: "Mary", lastName: "Senior" });
    const holder = await createUser("CUSTOMER", { customerId: c.id });
    const payerUser = await createUser("CUSTOMER");
    const stranger = await createUser("CUSTOMER");
    const payer = await prisma.familyContact.create({ data: { customerId: c.id, name: "Dana Daughter", canPay: true, userId: payerUser.id } });
    const { invoiceId } = await issued([{ description: "Wi-Fi setup", unitPriceCents: 9900 }], { customerId: c.id, billToContactId: payer.id });
    await createInvoice({ customerId: c.id, lines: [{ description: "draft", unitPriceCents: 100 }] });

    expect((await listInvoicesForUser(holder)).map((i) => i.id)).toEqual([invoiceId]);
    const asPayer = await getInvoiceForUser(payerUser, invoiceId);
    expect(asPayer?.view).toBe("payer");
    expect(asPayer?.forName).toBe("Mary S.");
    expect(asPayer?.lines[0].description).toBe("Wi-Fi setup");
    expect(asPayer).not.toHaveProperty("notes");
    expect(await getInvoiceForUser(stranger, invoiceId)).toBeNull();

    // Revoking canPay removes access
    await prisma.familyContact.update({ where: { id: payer.id }, data: { canPay: false } });
    expect(await getInvoiceForUser(payerUser, invoiceId)).toBeNull();
  });
});

describe("deposits and pay links", () => {
  it("offers the deposit only before anything is paid", async () => {
    const { invoiceId } = await issued([{ description: "Computer setup", unitPriceCents: 30000 }], { depositCents: 7500 });
    let inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(payableAmount(inv, { payDeposit: true })).toEqual({ amountCents: 7500, isDeposit: true });
    expect(payableAmount(inv)).toEqual({ amountCents: 30000, isDeposit: false });
    await recordManualPayment({ invoiceId, amountCents: 7500, method: "CHECK", recordedById: staffId });
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv.status).toBe("PARTIALLY_PAID");
    expect(payableAmount(inv, { payDeposit: true })).toEqual({ amountCents: 22500, isDeposit: false });
  });

  it("stores the pay link on issue, keeps it across line edits, and replaces it on regenerate", async () => {
    const { invoiceId, payUrl, payToken } = await issued([{ description: "Visit", unitPriceCents: 9900 }]);
    let inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv.stripePaymentLinkUrl).toBe(payUrl);
    expect(currentPayLink(inv)).toBe(payUrl);
    expect(await createPaymentLink(invoiceId)).toBe(payUrl);

    await replaceInvoiceLinesKeepingPayLink(invoiceId, [{ description: "Visit (updated)", unitPriceCents: 12000 }]);
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv.totalCents).toBe(12000);
    expect(currentPayLink(inv)).toBe(payUrl);
    expect((await findInvoiceByPayToken(payToken))?.id).toBe(invoiceId);

    const fresh = await regeneratePayLink(invoiceId);
    inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv.publicTokenHash).toBe(sha256(fresh.token));
    expect(currentPayLink(inv)).toBe(fresh.url);
    expect(await findInvoiceByPayToken(payToken)).toBeNull();
  });

  it("works without Stripe: issuing succeeds, card checkout is refused, nothing is marked paid", async () => {
    const c = await createCustomer();
    const inv = await createInvoice({ customerId: c.id, lines: [{ description: "Visit", unitPriceCents: 9900 }] });
    const r = await issueInvoice(inv.id, { sendEmail: true });
    expect(r.invoice.status).toBe("OPEN");
    await expect(createInvoiceCheckoutSession(inv.id, { payToken: r.payToken })).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.status).toBe("OPEN");
    expect(after.amountPaidCents).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });
});
