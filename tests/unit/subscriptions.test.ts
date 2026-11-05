import { describe, expect, it } from "vitest";
import { computeSavingsTotals, monthlyEquivalentCents, savingsProblem, suggestMonthlySavingsCents } from "@/lib/subscriptions";

describe("subscription savings math", () => {
  it("converts prices to a monthly equivalent", () => {
    expect(monthlyEquivalentCents(1599, "MONTHLY")).toBe(1599);
    expect(monthlyEquivalentCents(12000, "ANNUAL")).toBe(1000);
    expect(monthlyEquivalentCents(9999, "ANNUAL")).toBe(833); // 833.25 rounds
    expect(monthlyEquivalentCents(3000, "QUARTERLY")).toBe(1000);
    expect(monthlyEquivalentCents(1000, "QUARTERLY")).toBe(333);
    expect(monthlyEquivalentCents(500, "OTHER")).toBeNull();
    expect(monthlyEquivalentCents(-5, "MONTHLY")).toBe(0);
  });

  it("suggests savings only for cancellations", () => {
    expect(suggestMonthlySavingsCents({ priceCents: 1599, frequency: "MONTHLY", decision: "CANCEL" })).toBe(1599);
    expect(suggestMonthlySavingsCents({ priceCents: 6000, frequency: "ANNUAL", decision: "CANCEL" })).toBe(500);
    expect(suggestMonthlySavingsCents({ priceCents: 900, frequency: "QUARTERLY", decision: "CANCEL" })).toBe(300);
    expect(suggestMonthlySavingsCents({ priceCents: 900, frequency: "OTHER", decision: "CANCEL" })).toBe(0);
    expect(suggestMonthlySavingsCents({ priceCents: 1599, frequency: "MONTHLY", decision: "KEEP" })).toBe(0);
    expect(suggestMonthlySavingsCents({ priceCents: 1599, frequency: "MONTHLY", decision: "DOWNGRADE" })).toBe(0);
  });

  it("rejects savings larger than the monthly cost or negative", () => {
    expect(savingsProblem({ priceCents: 1000, frequency: "MONTHLY", decision: "CANCEL", estimatedMonthlySavingsCents: 1000 })).toBeNull();
    expect(savingsProblem({ priceCents: 1000, frequency: "MONTHLY", decision: "CANCEL", estimatedMonthlySavingsCents: 1001 })).toMatch(/cannot be more/);
    expect(savingsProblem({ priceCents: 12000, frequency: "ANNUAL", decision: "DOWNGRADE", estimatedMonthlySavingsCents: 1001 })).toMatch(/cannot be more/);
    expect(savingsProblem({ priceCents: 1000, frequency: "MONTHLY", decision: "CANCEL", estimatedMonthlySavingsCents: -1 })).toMatch(/zero or more/);
    expect(savingsProblem({ priceCents: 1000, frequency: "OTHER", decision: "CANCEL", estimatedMonthlySavingsCents: 5000 })).toBeNull();
  });

  it("totals current spend and estimated savings", () => {
    const t = computeSavingsTotals([
      { priceCents: 1599, frequency: "MONTHLY", decision: "CANCEL", estimatedMonthlySavingsCents: 1599 },
      { priceCents: 12000, frequency: "ANNUAL", decision: "KEEP", estimatedMonthlySavingsCents: 400 }, // ignored: KEEP
      { priceCents: 3000, frequency: "QUARTERLY", decision: "DOWNGRADE", estimatedMonthlySavingsCents: 300 },
      { priceCents: 2500, frequency: "OTHER", decision: "UNDECIDED", estimatedMonthlySavingsCents: 0 },
    ]);
    expect(t.currentMonthlySpendCents).toBe(1599 + 1000 + 1000);
    expect(t.estimatedMonthlySavingsCents).toBe(1599 + 300);
    expect(t.estimatedAnnualSavingsCents).toBe((1599 + 300) * 12);
    expect(t.itemsWithUnknownPeriod).toBe(1);
    expect(t.itemCount).toBe(4);
    expect(t.canceledCount).toBe(1);
  });

  it("handles an empty review", () => {
    expect(computeSavingsTotals([])).toMatchObject({ currentMonthlySpendCents: 0, estimatedMonthlySavingsCents: 0, estimatedAnnualSavingsCents: 0 });
  });
});
