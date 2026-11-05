/**
 * Time-zone helpers. All persisted timestamps are UTC. Business logic that
 * depends on wall-clock time (business hours, "today") uses the business zone.
 */
export const DEFAULT_TIME_ZONE = "America/New_York";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, tz = DEFAULT_TIME_ZONE): Parts {
  const parts = dtf(tz).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

/** Offset (ms) of the zone relative to UTC at the given instant. */
function zoneOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a local wall-clock time in tz to a UTC Date. Handles DST transitions. */
export function zonedToUtc(year: number, month: number, day: number, hour = 0, minute = 0, tz = DEFAULT_TIME_ZONE): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let offset = zoneOffsetMs(new Date(guess), tz);
  let result = guess - offset;
  const offset2 = zoneOffsetMs(new Date(result), tz);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset;
  }
  return new Date(result);
}

/** "YYYY-MM-DD" for the instant in the business zone. */
export function toDateKey(date: Date, tz = DEFAULT_TIME_ZONE): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** UTC instant of local midnight at the start of the given date key. */
export function startOfDayUtc(key: string, tz = DEFAULT_TIME_ZONE): Date {
  const { year, month, day } = parseDateKey(key);
  return zonedToUtc(year, month, day, 0, 0, tz);
}

/** Local time (minutes since midnight) on dateKey -> UTC Date. */
export function localMinuteToUtc(key: string, minuteOfDay: number, tz = DEFAULT_TIME_ZONE): Date {
  const { year, month, day } = parseDateKey(key);
  return zonedToUtc(year, month, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60, tz);
}

export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

export function weekdayOfKey(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDateTime(date: Date | string, tz = DEFAULT_TIME_ZONE): string {
  return new Date(date).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(date: Date | string, tz = DEFAULT_TIME_ZONE, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(date).toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    ...opts,
  });
}

export function formatTime(date: Date | string, tz = DEFAULT_TIME_ZONE): string {
  return new Date(date).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}

export function formatDateKeyLong(key: string): string {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}
