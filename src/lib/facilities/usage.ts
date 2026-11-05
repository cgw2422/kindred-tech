/**
 * Aggregate facility usage. Returns counts only (never resident identities),
 * so it is safe to show in the facility portal.
 */
import { prisma } from "../db";
import { getSettings } from "../settings";
import { toDateKey } from "../time";

export type MonthUsage = {
  monthKey: string;
  helpDaysHeld: number;
  sessionsCompleted: number;
  residentsServed: number;
  serviceHours: number;
};

export type FacilityUsage = {
  totals: {
    helpDaysHeld: number;
    upcomingHelpDays: number;
    sessionsCompleted: number;
    sessionsBooked: number;
    residentsServed: number;
    serviceHours: number;
    onSiteHours: number;
  };
  byMonth: MonthUsage[];
};

function lastMonthKeys(now: Date, months: number, tz: string): string[] {
  const [y, m] = toDateKey(now, tz).split("-").map(Number);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function getFacilityUsage(facilityId: string, opts: { months?: number; now?: Date } = {}): Promise<FacilityUsage> {
  const now = opts.now ?? new Date();
  const tz = (await getSettings("business")).timeZone;
  const months = Math.min(Math.max(opts.months ?? 12, 1), 36);
  const monthKeys = lastMonthKeys(now, months, tz);

  const [days, appts] = await Promise.all([
    prisma.techHelpDay.findMany({ where: { facilityId, status: { not: "CANCELED" } }, select: { startsAt: true, endsAt: true, status: true } }),
    prisma.appointment.findMany({
      where: { facilityId, status: { notIn: ["CANCELED", "NO_SHOW"] } },
      select: { status: true, customerId: true, startsAt: true, endsAt: true },
    }),
  ]);

  // A day counts as held once completed, or once its time has passed (not canceled).
  const held = days.filter((d) => d.status === "COMPLETED" || d.endsAt <= now);
  const completed = appts.filter((a) => a.status === "COMPLETED");
  const minutes = (a: { startsAt: Date; endsAt: Date }) => (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000;

  const byMonth: MonthUsage[] = monthKeys.map((monthKey) => {
    const inMonth = <T extends { startsAt: Date }>(rows: T[]) => rows.filter((r) => toDateKey(r.startsAt, tz).slice(0, 7) === monthKey);
    const c = inMonth(completed);
    return {
      monthKey,
      helpDaysHeld: inMonth(held).length,
      sessionsCompleted: c.length,
      residentsServed: new Set(c.map((a) => a.customerId)).size,
      serviceHours: round1(c.reduce((s, a) => s + minutes(a), 0) / 60),
    };
  });

  return {
    totals: {
      helpDaysHeld: held.length,
      upcomingHelpDays: days.filter((d) => d.startsAt > now && (d.status === "SCHEDULED" || d.status === "CONFIRMED")).length,
      sessionsCompleted: completed.length,
      sessionsBooked: appts.filter((a) => a.startsAt > now).length,
      residentsServed: new Set(completed.map((a) => a.customerId)).size,
      serviceHours: round1(completed.reduce((s, a) => s + minutes(a), 0) / 60),
      onSiteHours: round1(held.reduce((s, d) => s + minutes(d), 0) / 60),
    },
    byMonth,
  };
}
