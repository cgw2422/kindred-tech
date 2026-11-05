import { describe, expect, it } from "vitest";
import { computeInvoiceTotals, deriveInvoiceStatus, estimatePrice, invoiceBalance } from "@/lib/pricing";
import { formatCents, parseDollarsToCents } from "@/lib/money";

const standard = { name: "Standard In-Home Support", pricingType: "FIXED" as const, basePriceCents: 9900, extensionMinutes: 30, extensionPriceCents: 4000 };

describe("estimatePrice", () => {
  it("prices a standard visit", () => {
    expect(estimatePrice({ service: standard }).totalCents).toBe(9900);
  });
  it("adds extension blocks, add-ons, and travel fees", () => {
    const e = estimatePrice({ service: standard, extensionBlocks: 2, addons: [{ name: "Printer setup", priceCents: 2500 }], travelFeeCents: 1500 });
    expect(e.subtotalCents).toBe(9900 + 8000 + 2500 + 1500);
    expect(e.totalCents).toBe(21900);
  });
  it("applies percentage discounts to service charges only, not travel", () => {
    const e = estimatePrice({ service: standard, travelFeeCents: 1000, discount: { name: "10% off", type: "PERCENT", value: 10 } });
    expect(e.discountCents).toBe(990);
    expect(e.totalCents).toBe(9900 + 1000 - 990);
  });
  it("never discounts below zero", () => {
    const e = estimatePrice({ service: standard, discount: { name: "Big", type: "FIXED", value: 50000 } });
    expect(e.totalCents).toBe(0);
  });
  it("stacks member discount before coupon", () => {
    const e = estimatePrice({ service: standard, memberDiscountPercent: 10, discount: { name: "$10 off", type: "FIXED", value: 1000 } });
    expect(e.totalCents).toBe(9900 - 990 - 1000);
  });
  it("marks custom quotes without inventing a price", () => {
    const e = estimatePrice({ service: { name: "Tech Help Day", pricingType: "CUSTOM_QUOTE", basePriceCents: 0 } });
    expect(e.isCustomQuote).toBe(true);
    expect(e.totalCents).toBe(0);
  });
  it("flags starting prices", () => {
    expect(estimatePrice({ service: { ...standard, pricingType: "STARTING_AT", basePriceCents: 14900 } }).isStartingPrice).toBe(true);
  });
  it("applies tax after discounts", () => {
    const e = estimatePrice({ service: standard, taxRatePercent: 7, discount: { name: "x", type: "FIXED", value: 900 } });
    expect(e.taxCents).toBe(630);
    expect(e.totalCents).toBe(9000 + 630);
  });
});

describe("invoice math", () => {
  it("computes totals with discount lines", () => {
    expect(computeInvoiceTotals([{ quantity: 1, unitPriceCents: 9900 }, { quantity: 2, unitPriceCents: 4000 }, { quantity: 1, unitPriceCents: -1000 }])).toEqual({
      subtotalCents: 17900,
      discountCents: 1000,
      taxCents: 0,
      totalCents: 16900,
    });
  });
  it("computes balances and statuses", () => {
    expect(invoiceBalance({ totalCents: 9900, amountPaidCents: 5000, amountRefundedCents: 0 })).toBe(4900);
    expect(deriveInvoiceStatus({ totalCents: 9900, amountPaidCents: 5000, amountRefundedCents: 0 })).toBe("PARTIALLY_PAID");
    expect(deriveInvoiceStatus({ totalCents: 9900, amountPaidCents: 9900, amountRefundedCents: 0 })).toBe("PAID");
    expect(deriveInvoiceStatus({ totalCents: 9900, amountPaidCents: 9900, amountRefundedCents: 9900 })).toBe("REFUNDED");
    expect(deriveInvoiceStatus({ totalCents: 9900, amountPaidCents: 0, amountRefundedCents: 0 })).toBe("OPEN");
  });
  it("formats and parses money", () => {
    expect(formatCents(9900)).toBe("$99");
    expect(formatCents(4050)).toBe("$40.50");
    expect(parseDollarsToCents("$1,234.5")).toBe(123450);
    expect(parseDollarsToCents("abc")).toBeNull();
  });
});
