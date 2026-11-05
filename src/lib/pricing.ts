/**
 * Pure pricing & invoice math. All values are integer cents.
 */
export type PricingServiceInput = {
  name: string;
  pricingType: "FIXED" | "STARTING_AT" | "CUSTOM_QUOTE";
  basePriceCents: number;
  extensionMinutes?: number | null;
  extensionPriceCents?: number | null;
  memberDiscountEligible?: boolean;
};

export type PricingAddonInput = { name: string; priceCents: number };

export type PricingDiscountInput = { name: string; type: "PERCENT" | "FIXED"; value: number } | null;

export type EstimateLine = { kind: "SERVICE" | "EXTENSION" | "ADDON" | "TRAVEL" | "DISCOUNT" | "MEMBER_DISCOUNT" | "TAX"; label: string; amountCents: number };

export type Estimate = {
  lines: EstimateLine[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  isStartingPrice: boolean;
  isCustomQuote: boolean;
  note?: string;
};

export function percentOf(amountCents: number, percent: number): number {
  return Math.round((amountCents * percent) / 100);
}

export function estimatePrice(params: {
  service: PricingServiceInput;
  addons?: PricingAddonInput[];
  extensionBlocks?: number;
  travelFeeCents?: number;
  discount?: PricingDiscountInput;
  memberDiscountPercent?: number;
  taxRatePercent?: number;
  overrideBaseCents?: number | null;
}): Estimate {
  const { service } = params;
  const lines: EstimateLine[] = [];
  const isCustomQuote = service.pricingType === "CUSTOM_QUOTE";
  const base = params.overrideBaseCents ?? service.basePriceCents;

  if (isCustomQuote && params.overrideBaseCents == null) {
    return {
      lines: [{ kind: "SERVICE", label: service.name, amountCents: 0 }],
      subtotalCents: 0,
      discountCents: 0,
      taxCents: 0,
      totalCents: 0,
      isStartingPrice: false,
      isCustomQuote: true,
      note: "Custom pricing. We will contact you with a quote before any work is scheduled.",
    };
  }

  lines.push({ kind: "SERVICE", label: service.name, amountCents: base });

  const blocks = Math.max(0, Math.floor(params.extensionBlocks ?? 0));
  if (blocks > 0 && service.extensionPriceCents) {
    lines.push({
      kind: "EXTENSION",
      label: `Additional ${service.extensionMinutes ?? 30} minutes x ${blocks}`,
      amountCents: service.extensionPriceCents * blocks,
    });
  }
  for (const addon of params.addons ?? []) lines.push({ kind: "ADDON", label: addon.name, amountCents: addon.priceCents });

  const serviceSubtotal = lines.reduce((s, l) => s + l.amountCents, 0);

  if (params.travelFeeCents && params.travelFeeCents > 0) {
    lines.push({ kind: "TRAVEL", label: "Travel fee", amountCents: params.travelFeeCents });
  }

  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);

  // Discounts apply to service charges only (not travel), and never below zero.
  let discountCents = 0;
  if (params.memberDiscountPercent && params.memberDiscountPercent > 0 && service.memberDiscountEligible !== false) {
    const d = percentOf(serviceSubtotal, params.memberDiscountPercent);
    if (d > 0) {
      lines.push({ kind: "MEMBER_DISCOUNT", label: `Kindred Care member discount (${params.memberDiscountPercent}%)`, amountCents: -d });
      discountCents += d;
    }
  }
  if (params.discount) {
    const remaining = serviceSubtotal - discountCents;
    const raw = params.discount.type === "PERCENT" ? percentOf(remaining, params.discount.value) : params.discount.value;
    const d = Math.min(Math.max(0, raw), remaining);
    if (d > 0) {
      lines.push({ kind: "DISCOUNT", label: params.discount.name, amountCents: -d });
      discountCents += d;
    }
  }

  const taxable = subtotalCents - discountCents;
  const taxCents = params.taxRatePercent ? Math.round((taxable * params.taxRatePercent) / 100) : 0;
  if (taxCents > 0) lines.push({ kind: "TAX", label: `Sales tax (${params.taxRatePercent}%)`, amountCents: taxCents });

  return {
    lines,
    subtotalCents,
    discountCents,
    taxCents,
    totalCents: taxable + taxCents,
    isStartingPrice: service.pricingType === "STARTING_AT",
    isCustomQuote: false,
    note:
      service.pricingType === "STARTING_AT"
        ? "This is a starting price. Your technician will confirm any additional cost with you before doing extra work."
        : undefined,
  };
}

export type InvoiceLineInput = { quantity: number; unitPriceCents: number };

/** Computes invoice totals. Negative unit prices represent discount lines. */
export function computeInvoiceTotals(lines: InvoiceLineInput[], taxRatePercent = 0) {
  let subtotal = 0;
  let discount = 0;
  for (const l of lines) {
    const amount = l.quantity * l.unitPriceCents;
    if (amount >= 0) subtotal += amount;
    else discount += -amount;
  }
  discount = Math.min(discount, subtotal);
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * taxRatePercent) / 100);
  return { subtotalCents: subtotal, discountCents: discount, taxCents: tax, totalCents: taxable + tax };
}

export function invoiceBalance(inv: { totalCents: number; amountPaidCents: number; amountRefundedCents: number }) {
  return Math.max(0, inv.totalCents - (inv.amountPaidCents - inv.amountRefundedCents));
}

/** Derive invoice status from payment amounts (does not handle DRAFT/VOID). */
export function deriveInvoiceStatus(inv: { totalCents: number; amountPaidCents: number; amountRefundedCents: number }):
  | "OPEN"
  | "PARTIALLY_PAID"
  | "PAID"
  | "REFUNDED" {
  const net = inv.amountPaidCents - inv.amountRefundedCents;
  if (inv.amountPaidCents > 0 && net <= 0) return "REFUNDED";
  if (net >= inv.totalCents && inv.totalCents > 0) return "PAID";
  if (inv.totalCents === 0 && inv.amountPaidCents === 0) return "OPEN";
  if (net > 0) return "PARTIALLY_PAID";
  return "OPEN";
}
