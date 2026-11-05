/**
 * Pure membership calculations (no database access). All money is integer cents.
 *
 * Kindred Care memberships include priority scheduling, a remote-support
 * minute allowance per billing period, an optional annual technology review,
 * and a percentage discount on in-home visits. They never include unlimited
 * in-home visits.
 */
export type Interval = "MONTH" | "YEAR";
export type MembershipStatusValue = "PENDING" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "CANCELED";

function daysInMonthUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Adds whole months to a date (UTC), clamping to the end of shorter months (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInMonthUtc(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

export function addInterval(date: Date, interval: Interval, count = 1): Date {
  return addMonths(date, interval === "YEAR" ? 12 * count : count);
}

/**
 * The billing period containing `at` for a membership anchored at `anchor`.
 * Periods are computed from the anchor each time (not chained) so month-end
 * clamping does not drift.
 */
export function periodContaining(anchor: Date, interval: Interval, at: Date): { start: Date; end: Date } {
  if (at < anchor) return { start: anchor, end: addInterval(anchor, interval) };
  const step = interval === "YEAR" ? 12 : 1;
  const monthsApart = (at.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (at.getUTCMonth() - anchor.getUTCMonth());
  let n = Math.max(0, Math.floor(monthsApart / step));
  while (n > 0 && addMonths(anchor, n * step) > at) n--;
  while (addMonths(anchor, (n + 1) * step) <= at) n++;
  return { start: addMonths(anchor, n * step), end: addMonths(anchor, (n + 1) * step) };
}

/**
 * The usage period for a membership. Uses the stored Stripe/local current
 * period when `at` falls inside it, otherwise derives it from the start date.
 */
export function usagePeriod(
  m: { startedAt: Date | null; currentPeriodStart: Date | null; currentPeriodEnd: Date | null },
  interval: Interval,
  at: Date,
): { start: Date; end: Date } | null {
  if (m.currentPeriodStart && m.currentPeriodEnd && at >= m.currentPeriodStart && at < m.currentPeriodEnd) {
    return { start: m.currentPeriodStart, end: m.currentPeriodEnd };
  }
  const anchor = m.startedAt ?? m.currentPeriodStart;
  if (!anchor) return null;
  return periodContaining(anchor, interval, at);
}

/** Membership year (anniversary-based) containing `at`. */
export function membershipYearContaining(startedAt: Date, at: Date): { start: Date; end: Date } {
  return periodContaining(startedAt, "YEAR", at);
}

export function remoteMinutesRemaining(allowance: number, used: number): number {
  return Math.max(0, allowance - used);
}

export type UsageCheck = { ok: true } | { ok: false; reason: string };

/** Checks whether `requested` remote minutes fit within the period allowance. */
export function checkRemoteMinutes(allowance: number, used: number, requested: number): UsageCheck {
  if (!Number.isInteger(requested) || requested <= 0) return { ok: false, reason: "Minutes must be a whole number greater than zero." };
  if (allowance <= 0) return { ok: false, reason: "This plan does not include remote support minutes." };
  const remaining = remoteMinutesRemaining(allowance, used);
  if (requested > remaining) {
    return { ok: false, reason: `Only ${remaining} of ${allowance} included remote minutes remain this period.` };
  }
  return { ok: true };
}

export function checkAnnualReview(included: boolean, usedThisYear: number): UsageCheck {
  if (!included) return { ok: false, reason: "This plan does not include an annual technology review." };
  if (usedThisYear > 0) return { ok: false, reason: "The annual technology review has already been used this membership year." };
  return { ok: true };
}

/** In-home visits are discounted, never free or unlimited. */
export function inHomeDiscountCents(visitPriceCents: number, discountPercent: number): number {
  const pct = Math.min(Math.max(0, discountPercent), 50);
  return Math.round((Math.max(0, visitPriceCents) * pct) / 100);
}

export function monthlyEquivalentCents(priceCents: number, interval: Interval): number {
  return interval === "YEAR" ? Math.round(priceCents / 12) : priceCents;
}

/** Monthly recurring revenue from ACTIVE memberships (yearly plans count as price / 12). */
export function computeMrrCents(memberships: { status: MembershipStatusValue; priceCents: number; interval: Interval }[]): number {
  return memberships.filter((m) => m.status === "ACTIVE").reduce((s, m) => s + monthlyEquivalentCents(m.priceCents, m.interval), 0);
}

export type ChurnInput = { startedAt: Date | null; canceledAt: Date | null };

/** Whether a membership had started and not yet been canceled at `at`. */
export function wasActiveAt(m: ChurnInput, at: Date): boolean {
  return Boolean(m.startedAt && m.startedAt <= at && (!m.canceledAt || m.canceledAt > at));
}

/**
 * Churn for a period [start, end): memberships canceled during the period
 * divided by memberships active at the start of the period. Only memberships
 * that were active at the start count as churned (new members who cancel in
 * the same month are reported separately as `canceledNew`).
 */
export function computeChurn(memberships: ChurnInput[], start: Date, end: Date) {
  const activeAtStart = memberships.filter((m) => wasActiveAt(m, start));
  const churned = activeAtStart.filter((m) => m.canceledAt && m.canceledAt >= start && m.canceledAt < end).length;
  const canceledNew = memberships.filter((m) => !wasActiveAt(m, start) && m.startedAt && m.startedAt >= start && m.canceledAt && m.canceledAt >= start && m.canceledAt < end).length;
  const rate = activeAtStart.length === 0 ? 0 : churned / activeAtStart.length;
  return { activeAtStart: activeAtStart.length, churned, canceledNew, rate };
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** Maps a Stripe subscription status to our membership status. */
export function mapStripeSubscriptionStatus(status: string, opts: { paused?: boolean; current?: MembershipStatusValue } = {}): MembershipStatusValue {
  if (status === "canceled" || status === "incomplete_expired") return "CANCELED";
  if (opts.paused || status === "paused") return "PAUSED";
  if (status === "active" || status === "trialing") return "ACTIVE";
  if (status === "past_due" || status === "unpaid") return "PAST_DUE";
  if (status === "incomplete") return opts.current && opts.current !== "PENDING" ? opts.current : "PENDING";
  return opts.current ?? "PENDING";
}

export function benefitsList(plan: {
  priorityScheduling: boolean;
  remoteMinutesPerPeriod: number;
  annualReviewIncluded: boolean;
  inHomeDiscountPercent: number;
  interval: Interval;
  benefitsText: string[];
}): string[] {
  // Staff-written benefit lines take precedence; otherwise describe the structured benefits.
  const written = plan.benefitsText.map((l) => l.trim()).filter(Boolean);
  if (written.length) return written;
  const out: string[] = [];
  if (plan.priorityScheduling) out.push("Priority scheduling");
  if (plan.remoteMinutesPerPeriod > 0) out.push(`${plan.remoteMinutesPerPeriod} minutes of remote support each ${plan.interval === "YEAR" ? "year" : "month"}`);
  if (plan.annualReviewIncluded) out.push("One annual technology review");
  if (plan.inHomeDiscountPercent > 0) out.push(`${plan.inHomeDiscountPercent}% off in-home visits`);
  return out;
}
