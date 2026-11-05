import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  activateMembership,
  cancelMembership,
  createMembership,
  getActiveMembershipForCustomer,
  keepMembership,
  MembershipError,
  membershipMetrics,
  pauseMembership,
  recordUsage,
  renewOfflineMembership,
  resumeMembership,
} from "@/lib/memberships/service";
import { createMembershipCheckoutSession, PaymentsNotConfiguredError } from "@/lib/payments/stripe";
import { createCustomer, resetDb, seedBasics } from "../helpers/db";

let planId: string;
let yearlyPlanId: string;

beforeEach(async () => {
  await resetDb();
  await seedBasics();
  planId = (
    await prisma.membershipPlan.create({
      data: { name: "Kindred Care", slug: "kindred-care", description: "x", priceCents: 2900, interval: "MONTH", remoteMinutesPerPeriod: 60, annualReviewIncluded: true, inHomeDiscountPercent: 10, benefitsText: [] },
    })
  ).id;
  yearlyPlanId = (
    await prisma.membershipPlan.create({ data: { name: "Kindred Care Annual", slug: "kindred-care-annual", description: "x", priceCents: 30000, interval: "YEAR", remoteMinutesPerPeriod: 600, benefitsText: [] } })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("lifecycle", () => {
  it("creates PENDING, activates manually with a note and welcome email, then pause/resume/cancel", async () => {
    const c = await createCustomer();
    const m = await createMembership({ customerId: c.id, planId });
    expect(m.status).toBe("PENDING");
    expect(m.priceCents).toBe(2900);
    await expect(createMembership({ customerId: c.id, planId })).rejects.toBeInstanceOf(MembershipError);

    const start = new Date("2026-11-01T15:00:00Z");
    const a = await activateMembership(m.id, { note: "Paid by check #1001", startAt: start });
    expect(a.status).toBe("ACTIVE");
    expect(a.currentPeriodEnd?.toISOString()).toBe("2026-12-01T15:00:00.000Z");
    expect(await prisma.communication.count({ where: { relatedId: m.id, channel: "NOTE" } })).toBe(1);
    expect(await prisma.communication.count({ where: { templateKey: "membership_welcome" } })).toBe(1);
    await expect(activateMembership(m.id)).rejects.toBeInstanceOf(MembershipError);

    expect((await pauseMembership(m.id)).status).toBe("PAUSED");
    await expect(recordUsage({ membershipId: m.id, type: "PRIORITY_BOOKING" })).rejects.toThrow(/active membership/);
    expect((await resumeMembership(m.id)).status).toBe("ACTIVE");

    const scheduled = await cancelMembership(m.id, { immediately: false, reason: "Moving" });
    expect(scheduled.status).toBe("ACTIVE");
    expect(scheduled.cancelAtPeriodEnd).toBe(true);
    expect((await keepMembership(m.id)).cancelAtPeriodEnd).toBe(false);
    const canceled = await cancelMembership(m.id, { immediately: true });
    expect(canceled.status).toBe("CANCELED");
    expect(canceled.canceledAt).not.toBeNull();
    // Can start a new one after cancellation
    await expect(createMembership({ customerId: c.id, planId })).resolves.toBeTruthy();
  });

  it("supports a family member with canPay buying for a parent, and rejects one without", async () => {
    const parent = await createCustomer({ firstName: "Ruth" });
    const child = await prisma.familyContact.create({ data: { customerId: parent.id, name: "Alex Child", canPay: true, email: "alex@example.com" } });
    const noPay = await prisma.familyContact.create({ data: { customerId: parent.id, name: "Nephew", canPay: false } });
    const otherCustomer = await createCustomer();
    const stranger = await prisma.familyContact.create({ data: { customerId: otherCustomer.id, name: "Stranger", canPay: true } });

    await expect(createMembership({ customerId: parent.id, planId, purchaserContactId: noPay.id })).rejects.toThrow(/not authorized to pay/);
    await expect(createMembership({ customerId: parent.id, planId, purchaserContactId: stranger.id })).rejects.toThrow(/family contact of this customer/);
    const m = await createMembership({ customerId: parent.id, planId, purchaserContactId: child.id });
    expect(m.customerId).toBe(parent.id);
    expect(m.purchaserContactId).toBe(child.id);
  });

  it("refuses Stripe checkout when Stripe is not configured (manual activation still works)", async () => {
    const c = await createCustomer();
    const m = await createMembership({ customerId: c.id, planId });
    await expect(createMembershipCheckoutSession(m.id)).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("PENDING");
  });

  it("renews offline memberships to the next period", async () => {
    const c = await createCustomer();
    const m = await createMembership({ customerId: c.id, planId });
    await activateMembership(m.id, { startAt: new Date("2026-10-01T12:00:00Z"), sendWelcome: false });
    const r = await renewOfflineMembership(m.id);
    expect(r.currentPeriodStart?.toISOString()).toBe("2026-11-01T12:00:00.000Z");
    expect(r.currentPeriodEnd?.toISOString()).toBe("2026-12-01T12:00:00.000Z");
  });
});

describe("usage", () => {
  async function activeMembership(start = new Date("2026-11-01T12:00:00Z"), plan = planId) {
    const c = await createCustomer();
    const m = await createMembership({ customerId: c.id, planId: plan });
    await activateMembership(m.id, { startAt: start, sendWelcome: false });
    return { customer: c, membership: m };
  }

  it("enforces the per-period remote-minute allowance and resets next period", async () => {
    const { membership, customer } = await activeMembership();
    const at = new Date("2026-11-10T15:00:00Z");
    await recordUsage({ membershipId: membership.id, type: "REMOTE_MINUTES", quantity: 45, at });
    await expect(recordUsage({ membershipId: membership.id, type: "REMOTE_MINUTES", quantity: 20, at })).rejects.toThrow(/Only 15 of 60/);
    await recordUsage({ membershipId: membership.id, type: "REMOTE_MINUTES", quantity: 15, at });
    await expect(recordUsage({ membershipId: membership.id, type: "REMOTE_MINUTES", quantity: 1, at })).rejects.toThrow(/Only 0 of 60/);
    const summary = await getActiveMembershipForCustomer(customer.id, at);
    expect(summary?.remoteMinutesRemaining).toBe(0);
    expect(summary?.plan.id).toBe(planId);
    // Next period (after Dec 1) has a fresh allowance
    const next = new Date("2026-12-05T15:00:00Z");
    await recordUsage({ membershipId: membership.id, type: "REMOTE_MINUTES", quantity: 30, at: next });
    expect((await getActiveMembershipForCustomer(customer.id, next))?.remoteMinutesRemaining).toBe(30);
  });

  it("serializes concurrent usage so the allowance cannot be overspent", async () => {
    const { membership } = await activeMembership();
    const at = new Date("2026-11-10T15:00:00Z");
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => recordUsage({ membershipId: membership.id, type: "REMOTE_MINUTES", quantity: 20, at })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const agg = await prisma.membershipUsage.aggregate({ where: { membershipId: membership.id }, _sum: { quantity: true } });
    expect(agg._sum.quantity).toBe(60);
  });

  it("allows the annual review once per membership year", async () => {
    const { membership } = await activeMembership(new Date("2026-01-15T12:00:00Z"));
    await recordUsage({ membershipId: membership.id, type: "ANNUAL_REVIEW", at: new Date("2026-03-01T12:00:00Z") });
    await expect(recordUsage({ membershipId: membership.id, type: "ANNUAL_REVIEW", at: new Date("2027-01-14T12:00:00Z") })).rejects.toThrow(/already been used/);
    await expect(recordUsage({ membershipId: membership.id, type: "ANNUAL_REVIEW", at: new Date("2027-01-16T12:00:00Z") })).resolves.toBeTruthy();
  });

  it("records in-home discounts (not free visits) and rejects benefits the plan lacks", async () => {
    const { membership } = await activeMembership();
    const u = await recordUsage({ membershipId: membership.id, type: "IN_HOME_DISCOUNT", visitPriceCents: 9900 });
    expect(u.valueCents).toBe(990);
    const yearly = await activeMembership(undefined, yearlyPlanId);
    await expect(recordUsage({ membershipId: yearly.membership.id, type: "ANNUAL_REVIEW" })).rejects.toThrow(/does not include an annual/);
    await expect(recordUsage({ membershipId: yearly.membership.id, type: "IN_HOME_DISCOUNT", visitPriceCents: 9900 })).rejects.toThrow(/does not include/);
  });
});

describe("metrics", () => {
  it("computes MRR, active count, and churn for a month", async () => {
    const mk = async (plan: string, status: "ACTIVE" | "CANCELED" | "PAST_DUE", startedAt: Date, canceledAt: Date | null = null) => {
      const c = await createCustomer();
      const p = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: plan } });
      return prisma.membership.create({ data: { customerId: c.id, planId: plan, priceCents: p.priceCents, status, startedAt, canceledAt } });
    };
    await mk(planId, "ACTIVE", new Date("2026-05-01T12:00:00Z"));
    await mk(planId, "ACTIVE", new Date("2026-06-01T12:00:00Z"));
    await mk(yearlyPlanId, "ACTIVE", new Date("2026-07-01T12:00:00Z"));
    await mk(planId, "PAST_DUE", new Date("2026-07-01T12:00:00Z"));
    await mk(planId, "CANCELED", new Date("2026-03-01T12:00:00Z"), new Date("2026-10-12T12:00:00Z"));
    const m = await membershipMetrics({ year: 2026, month: 10 });
    expect(m.mrrCents).toBe(2900 * 2 + 2500);
    expect(m.activeCount).toBe(3);
    expect(m.pastDueCount).toBe(1);
    expect(m.churn.activeAtStart).toBe(5);
    expect(m.churn.churned).toBe(1);
    expect(m.churn.rate).toBeCloseTo(0.2);
  });
});
