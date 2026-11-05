/**
 * Pure math for the Subscription Review & Savings workflow.
 * All amounts are integer cents. Savings are ESTIMATES and never guaranteed.
 * Safe to import from client components (no server dependencies).
 */

export type Frequency = "MONTHLY" | "ANNUAL" | "QUARTERLY" | "OTHER";
export type Decision = "UNDECIDED" | "KEEP" | "CANCEL" | "DOWNGRADE" | "SWITCH" | "REVIEW_LATER";

export type SubscriptionLike = {
  priceCents: number;
  frequency: Frequency;
  decision: Decision;
  estimatedMonthlySavingsCents: number;
};

/** Decisions whose estimated savings count toward the totals. */
export const SAVINGS_DECISIONS: Decision[] = ["CANCEL", "DOWNGRADE", "SWITCH"];

/**
 * Monthly-equivalent cost of a subscription. ANNUAL / 12, QUARTERLY / 3.
 * Returns null for OTHER, because the billing period is unknown.
 */
export function monthlyEquivalentCents(priceCents: number, frequency: Frequency): number | null {
  if (!Number.isFinite(priceCents) || priceCents < 0) return 0;
  switch (frequency) {
    case "MONTHLY":
      return Math.round(priceCents);
    case "QUARTERLY":
      return Math.round(priceCents / 3);
    case "ANNUAL":
      return Math.round(priceCents / 12);
    default:
      return null;
  }
}

/**
 * Suggested estimated monthly savings. Canceling saves the full monthly
 * equivalent; downgrades and switches depend on the new plan so the
 * technician enters them (suggestion 0). Everything else saves nothing.
 */
export function suggestMonthlySavingsCents(item: Pick<SubscriptionLike, "priceCents" | "frequency" | "decision">): number {
  if (item.decision !== "CANCEL") return 0;
  return monthlyEquivalentCents(item.priceCents, item.frequency) ?? 0;
}

/** Returns an error message when the entered savings estimate is not plausible. */
export function savingsProblem(item: Pick<SubscriptionLike, "priceCents" | "frequency" | "decision" | "estimatedMonthlySavingsCents">): string | null {
  const s = item.estimatedMonthlySavingsCents;
  if (!Number.isInteger(s) || s < 0) return "Estimated savings must be zero or more.";
  const monthly = monthlyEquivalentCents(item.priceCents, item.frequency);
  if (monthly != null && s > monthly) return "Estimated monthly savings cannot be more than the subscription's monthly cost.";
  return null;
}

export type SavingsTotals = {
  /** Sum of monthly-equivalent cost for items with a known billing period. */
  currentMonthlySpendCents: number;
  estimatedMonthlySavingsCents: number;
  estimatedAnnualSavingsCents: number;
  /** Items left out of the spend total because their billing period is OTHER. */
  itemsWithUnknownPeriod: number;
  itemCount: number;
  canceledCount: number;
};

export function computeSavingsTotals(items: SubscriptionLike[]): SavingsTotals {
  let spend = 0;
  let savings = 0;
  let unknown = 0;
  let canceled = 0;
  for (const it of items) {
    const m = monthlyEquivalentCents(it.priceCents, it.frequency);
    if (m == null) unknown++;
    else spend += m;
    if (SAVINGS_DECISIONS.includes(it.decision)) savings += Math.max(0, it.estimatedMonthlySavingsCents || 0);
    if (it.decision === "CANCEL") canceled++;
  }
  return {
    currentMonthlySpendCents: spend,
    estimatedMonthlySavingsCents: savings,
    estimatedAnnualSavingsCents: savings * 12,
    itemsWithUnknownPeriod: unknown,
    itemCount: items.length,
    canceledCount: canceled,
  };
}

export const SUBSCRIPTION_CATEGORY_LABELS: Record<string, string> = {
  STREAMING: "Streaming",
  ANTIVIRUS: "Antivirus / security",
  SOFTWARE: "Software",
  CLOUD_STORAGE: "Cloud storage",
  PHONE_APP: "Phone app",
  INTERNET: "Internet",
  CABLE: "Cable / satellite TV",
  MOBILE_PHONE: "Mobile phone plan",
  OTHER: "Other",
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  MONTHLY: "Monthly",
  ANNUAL: "Yearly",
  QUARTERLY: "Every 3 months",
  OTHER: "Other / unsure",
};

export const DECISION_LABELS: Record<Decision, string> = {
  UNDECIDED: "Undecided",
  KEEP: "Keep",
  CANCEL: "Cancel",
  DOWNGRADE: "Downgrade",
  SWITCH: "Switch provider",
  REVIEW_LATER: "Review later",
};
