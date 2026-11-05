import { describe, expect, it } from "vitest";
import {
  addInterval,
  addMonths,
  benefitsList,
  checkAnnualReview,
  checkRemoteMinutes,
  computeChurn,
  computeMrrCents,
  inHomeDiscountCents,
  mapStripeSubscriptionStatus,
  membershipYearContaining,
  monthlyEquivalentCents,
  periodContaining,
  remoteMinutesRemaining,
  usagePeriod,
  wasActiveAt,
} from "@/lib/memberships/calc";

const d = (s: string) => new Date(s);

describe("date math", () => {
  it("adds months with end-of-month clamping", () => {
    expect(addMonths(d("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonths(d("2028-01-31T00:00:00Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(addMonths(d("2026-11-15T00:00:00Z"), 2).toISOString()).toBe("2027-01-15T00:00:00.000Z");
    expect(addInterval(d("2026-03-01T00:00:00Z"), "YEAR").toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });

  it("finds the billing period containing a date without drifting", () => {
    const anchor = d("2026-01-31T00:00:00Z");
    expect(periodContaining(anchor, "MONTH", d("2026-03-15T00:00:00Z"))).toEqual({ start: d("2026-02-28T00:00:00Z"), end: d("2026-03-31T00:00:00Z") });
    expect(periodContaining(anchor, "MONTH", d("2026-03-31T00:00:00Z"))).toEqual({ start: d("2026-03-31T00:00:00Z"), end: d("2026-04-30T00:00:00Z") });
    expect(periodContaining(anchor, "MONTH", d("2026-01-31T00:00:00Z")).start).toEqual(anchor);
    expect(periodContaining(d("2025-06-10T00:00:00Z"), "YEAR", d("2026-11-05T00:00:00Z"))).toEqual({ start: d("2026-06-10T00:00:00Z"), end: d("2027-06-10T00:00:00Z") });
  });

  it("uses the stored current period when the date falls inside it", () => {
    const m = { startedAt: d("2026-01-05T00:00:00Z"), currentPeriodStart: d("2026-11-03T00:00:00Z"), currentPeriodEnd: d("2026-12-03T00:00:00Z") };
    expect(usagePeriod(m, "MONTH", d("2026-11-20T00:00:00Z"))).toEqual({ start: m.currentPeriodStart, end: m.currentPeriodEnd });
    expect(usagePeriod(m, "MONTH", d("2027-01-10T00:00:00Z"))).toEqual({ start: d("2027-01-05T00:00:00Z"), end: d("2027-02-05T00:00:00Z") });
    expect(usagePeriod({ startedAt: null, currentPeriodStart: null, currentPeriodEnd: null }, "MONTH", new Date())).toBeNull();
  });

  it("computes the anniversary membership year", () => {
    expect(membershipYearContaining(d("2025-02-20T00:00:00Z"), d("2026-02-19T23:00:00Z"))).toEqual({ start: d("2025-02-20T00:00:00Z"), end: d("2026-02-20T00:00:00Z") });
    expect(membershipYearContaining(d("2025-02-20T00:00:00Z"), d("2026-02-20T00:00:00Z")).start).toEqual(d("2026-02-20T00:00:00Z"));
  });
});

describe("benefit rules", () => {
  it("enforces the remote-minute allowance", () => {
    expect(remoteMinutesRemaining(60, 45)).toBe(15);
    expect(remoteMinutesRemaining(60, 90)).toBe(0);
    expect(checkRemoteMinutes(60, 45, 15)).toEqual({ ok: true });
    expect(checkRemoteMinutes(60, 45, 16)).toMatchObject({ ok: false, reason: expect.stringContaining("Only 15 of 60") });
    expect(checkRemoteMinutes(0, 0, 10)).toMatchObject({ ok: false });
    expect(checkRemoteMinutes(60, 0, 0)).toMatchObject({ ok: false });
    expect(checkRemoteMinutes(60, 0, 2.5)).toMatchObject({ ok: false });
  });

  it("allows one annual review per membership year", () => {
    expect(checkAnnualReview(true, 0)).toEqual({ ok: true });
    expect(checkAnnualReview(true, 1)).toMatchObject({ ok: false });
    expect(checkAnnualReview(false, 0)).toMatchObject({ ok: false });
  });

  it("discounts in-home visits (capped, never free)", () => {
    expect(inHomeDiscountCents(9900, 10)).toBe(990);
    expect(inHomeDiscountCents(9900, 100)).toBe(4950);
    expect(inHomeDiscountCents(-5, 10)).toBe(0);
  });

  it("never lists unlimited in-home visits as a benefit", () => {
    const plan = { priorityScheduling: true, remoteMinutesPerPeriod: 60, annualReviewIncluded: true, inHomeDiscountPercent: 10, interval: "MONTH" as const, benefitsText: [] };
    const list = benefitsList(plan);
    expect(list).toEqual(["Priority scheduling", "60 minutes of remote support each month", "One annual technology review", "10% off in-home visits"]);
    expect(benefitsList({ ...plan, benefitsText: [" Custom line ", ""] })).toEqual(["Custom line"]);
    expect(list.join(" ")).not.toMatch(/unlimited/i);
  });
});

describe("metrics", () => {
  it("computes MRR from active memberships with yearly plans divided by 12", () => {
    expect(monthlyEquivalentCents(30000, "YEAR")).toBe(2500);
    expect(
      computeMrrCents([
        { status: "ACTIVE", priceCents: 2900, interval: "MONTH" },
        { status: "ACTIVE", priceCents: 30000, interval: "YEAR" },
        { status: "PAST_DUE", priceCents: 2900, interval: "MONTH" },
        { status: "CANCELED", priceCents: 2900, interval: "MONTH" },
        { status: "PENDING", priceCents: 2900, interval: "MONTH" },
      ]),
    ).toBe(5400);
  });

  it("computes monthly churn as canceled-during / active-at-start", () => {
    const start = d("2026-10-01T04:00:00Z");
    const end = d("2026-11-01T04:00:00Z");
    const ms = [
      { startedAt: d("2026-01-01T00:00:00Z"), canceledAt: null },
      { startedAt: d("2026-02-01T00:00:00Z"), canceledAt: d("2026-10-15T00:00:00Z") }, // churned
      { startedAt: d("2026-03-01T00:00:00Z"), canceledAt: d("2026-09-15T00:00:00Z") }, // gone before
      { startedAt: d("2026-04-01T00:00:00Z"), canceledAt: d("2026-11-02T00:00:00Z") }, // after
      { startedAt: d("2026-10-05T00:00:00Z"), canceledAt: d("2026-10-20T00:00:00Z") }, // new + canceled
      { startedAt: null, canceledAt: null }, // never started
    ];
    expect(wasActiveAt(ms[1], start)).toBe(true);
    const c = computeChurn(ms, start, end);
    expect(c).toEqual({ activeAtStart: 3, churned: 1, canceledNew: 1, rate: 1 / 3 });
    expect(computeChurn([], start, end).rate).toBe(0);
  });

  it("maps Stripe subscription statuses", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("ACTIVE");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("PAST_DUE");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("CANCELED");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("CANCELED");
    expect(mapStripeSubscriptionStatus("active", { paused: true })).toBe("PAUSED");
    expect(mapStripeSubscriptionStatus("incomplete", { current: "PENDING" })).toBe("PENDING");
    expect(mapStripeSubscriptionStatus("incomplete", { current: "ACTIVE" })).toBe("ACTIVE");
  });
});
