/**
 * Pure recurrence rules for Tech Help Day series. Works on business-zone date
 * keys ("YYYY-MM-DD"); callers convert to UTC with localMinuteToUtc so that the
 * wall-clock start time stays fixed across DST transitions.
 */
import { addDaysToKey, parseDateKey, weekdayOfKey } from "../time";

export const SERIES_FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY_NTH_WEEKDAY"] as const;
export type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number];

/** Hard cap so a mistyped "until" date cannot create hundreds of days. */
export const MAX_SERIES_OCCURRENCES = 104;

export type RecurrenceRule = {
  frequency: SeriesFrequency;
  /** 0 = Sunday ... 6 = Saturday */
  dayOfWeek: number;
  /** MONTHLY_NTH_WEEKDAY only: 1-4, or 5 = last weekday of the month */
  weekOfMonth?: number | null;
  startDateKey: string;
  untilDateKey?: string | null;
  count?: number | null;
};

function keyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The nth (1-4) or last (5) given weekday of a month, as a date key. */
export function nthWeekdayOfMonth(year: number, month: number, dayOfWeek: number, weekOfMonth: number): string {
  if (weekOfMonth >= 5) {
    const last = daysInMonth(year, month);
    const lastWeekday = new Date(Date.UTC(year, month - 1, last)).getUTCDay();
    const day = last - ((lastWeekday - dayOfWeek + 7) % 7);
    return keyOf(year, month, day);
  }
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((dayOfWeek - firstWeekday + 7) % 7) + (weekOfMonth - 1) * 7;
  return keyOf(year, month, day);
}

export function validateRule(rule: RecurrenceRule): string | null {
  if (!SERIES_FREQUENCIES.includes(rule.frequency)) return "Choose how often the Tech Help Day repeats.";
  if (!Number.isInteger(rule.dayOfWeek) || rule.dayOfWeek < 0 || rule.dayOfWeek > 6) return "Choose a day of the week.";
  if (rule.frequency === "MONTHLY_NTH_WEEKDAY") {
    const w = rule.weekOfMonth ?? 0;
    if (!Number.isInteger(w) || w < 1 || w > 5) return "Choose which week of the month (first through fourth, or last).";
  }
  try {
    parseDateKey(rule.startDateKey);
    if (rule.untilDateKey) parseDateKey(rule.untilDateKey);
  } catch {
    return "Please enter valid dates.";
  }
  if (rule.untilDateKey && rule.untilDateKey < rule.startDateKey) return "The end date must be on or after the start date.";
  if (!rule.untilDateKey && !rule.count) return "Enter an end date or a number of occurrences.";
  if (rule.count != null && (rule.count < 1 || rule.count > MAX_SERIES_OCCURRENCES)) return `Number of occurrences must be between 1 and ${MAX_SERIES_OCCURRENCES}.`;
  return null;
}

/**
 * Candidate dates for a series, in order. Stops at untilDateKey (inclusive) or
 * after `count` occurrences, whichever comes first. Conflicts are NOT handled
 * here: the caller decides which candidates to skip and reports them.
 */
export function generateOccurrenceDateKeys(rule: RecurrenceRule): string[] {
  const problem = validateRule(rule);
  if (problem) throw new Error(problem);
  const limit = Math.min(rule.count ?? MAX_SERIES_OCCURRENCES, MAX_SERIES_OCCURRENCES);
  const until = rule.untilDateKey ?? null;
  const out: string[] = [];
  const within = (k: string) => k >= rule.startDateKey && (!until || k <= until);

  if (rule.frequency === "WEEKLY" || rule.frequency === "BIWEEKLY") {
    const step = rule.frequency === "WEEKLY" ? 7 : 14;
    let k = addDaysToKey(rule.startDateKey, (rule.dayOfWeek - weekdayOfKey(rule.startDateKey) + 7) % 7);
    while (out.length < limit && within(k)) {
      out.push(k);
      k = addDaysToKey(k, step);
    }
    return out;
  }

  let { year, month } = parseDateKey(rule.startDateKey);
  // Safety bound: enough months to reach the cap even if the start month is skipped.
  for (let i = 0; i < MAX_SERIES_OCCURRENCES + 2 && out.length < limit; i++) {
    const k = nthWeekdayOfMonth(year, month, rule.dayOfWeek, rule.weekOfMonth ?? 1);
    if (until && k > until) break;
    if (k >= rule.startDateKey) out.push(k);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEK_OF_MONTH_LABELS: Record<number, string> = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", 5: "Last" };

export function describeRule(rule: Pick<RecurrenceRule, "frequency" | "dayOfWeek" | "weekOfMonth">): string {
  const day = WEEKDAY_NAMES[rule.dayOfWeek] ?? "?";
  if (rule.frequency === "WEEKLY") return `Every ${day}`;
  if (rule.frequency === "BIWEEKLY") return `Every other ${day}`;
  return `${WEEK_OF_MONTH_LABELS[rule.weekOfMonth ?? 1] ?? ""} ${day} of each month`;
}
