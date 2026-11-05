/**
 * Pure availability engine. No database access, so it is fully unit-testable.
 *
 * Model:
 *  - An appointment occupies [startsAt, endsAt).
 *  - Its calendar "block" is [startsAt, endsAt + bufferMinutes): the buffer is
 *    travel/reset time required AFTER the appointment before the next one.
 *  - Two blocks for the same technician may never overlap. Because every block
 *    carries its own trailing buffer, consecutive appointments are always
 *    separated by at least the earlier appointment's buffer.
 *  - The appointment itself (not the trailing buffer) must fit inside both the
 *    business hours and the technician's working hours for that weekday.
 */
import { addDaysToKey, localMinuteToUtc, weekdayOfKey } from "../time";

export type Interval = { start: Date; end: Date };

export type DayHours = { open: boolean; startMinute: number; endMinute: number };

export type TechnicianAvailabilityInput = {
  id: string;
  /** Working windows per weekday (0 = Sunday), minutes since local midnight */
  schedules: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  /** Existing busy blocks: other appointments' blocks, Tech Help Days, time off */
  busy: Interval[];
};

export type AvailabilityInput = {
  timeZone: string;
  now: Date;
  fromDateKey: string;
  days: number;
  businessHours: DayHours[]; // length 7
  businessBlackouts: Interval[];
  technicians: TechnicianAvailabilityInput[];
  durationMinutes: number;
  bufferMinutes: number;
  slotIntervalMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
};

export type Slot = { startsAt: Date; endsAt: Date; technicianIds: string[] };
export type DayAvailability = { dateKey: string; slots: Slot[] };

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function blockFor(startsAt: Date, durationMinutes: number, bufferMinutes: number): Interval {
  const end = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return { start: startsAt, end: new Date(end.getTime() + bufferMinutes * 60_000) };
}

/** Is a specific start time valid for a specific technician? */
export function isTechnicianFree(
  input: Pick<AvailabilityInput, "timeZone" | "businessHours" | "businessBlackouts" | "durationMinutes" | "bufferMinutes">,
  tech: TechnicianAvailabilityInput,
  dateKey: string,
  startMinute: number,
): boolean {
  const weekday = weekdayOfKey(dateKey);
  const biz = input.businessHours[weekday];
  if (!biz?.open) return false;
  const endMinute = startMinute + input.durationMinutes;
  if (startMinute < biz.startMinute || endMinute > biz.endMinute) return false;
  const fitsSchedule = tech.schedules.some(
    (s) => s.dayOfWeek === weekday && startMinute >= s.startMinute && endMinute <= s.endMinute,
  );
  if (!fitsSchedule) return false;

  const startsAt = localMinuteToUtc(dateKey, startMinute, input.timeZone);
  const appt: Interval = { start: startsAt, end: new Date(startsAt.getTime() + input.durationMinutes * 60_000) };
  const block = blockFor(startsAt, input.durationMinutes, input.bufferMinutes);

  if (input.businessBlackouts.some((b) => intervalsOverlap(appt, b))) return false;
  if (tech.busy.some((b) => intervalsOverlap(block, b))) return false;
  return true;
}

export function computeAvailability(input: AvailabilityInput): DayAvailability[] {
  const result: DayAvailability[] = [];
  const earliest = input.now.getTime() + input.minNoticeHours * 3600_000;
  const latest = input.now.getTime() + input.maxDaysAhead * 86400_000;

  for (let i = 0; i < input.days; i++) {
    const dateKey = addDaysToKey(input.fromDateKey, i);
    const weekday = weekdayOfKey(dateKey);
    const biz = input.businessHours[weekday];
    const slots: Slot[] = [];
    if (biz?.open) {
      for (let m = biz.startMinute; m + input.durationMinutes <= biz.endMinute; m += input.slotIntervalMinutes) {
        const startsAt = localMinuteToUtc(dateKey, m, input.timeZone);
        if (startsAt.getTime() < earliest || startsAt.getTime() > latest) continue;
        const techIds = input.technicians.filter((t) => isTechnicianFree(input, t, dateKey, m)).map((t) => t.id);
        if (techIds.length > 0) {
          slots.push({
            startsAt,
            endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
            technicianIds: techIds,
          });
        }
      }
    }
    result.push({ dateKey, slots });
  }
  return result;
}

/**
 * Choose which technician gets a new booking: the one with the fewest busy
 * blocks that day (simple load balancing), ties broken by id for determinism.
 */
export function pickTechnician(candidateIds: string[], busyCountById: Record<string, number>): string | null {
  if (candidateIds.length === 0) return null;
  return [...candidateIds].sort((a, b) => (busyCountById[a] ?? 0) - (busyCountById[b] ?? 0) || a.localeCompare(b))[0];
}

/** Slots inside a Tech Help Day session. Each resident slot is slotMinutes long, separated by slotBuffer. */
export function helpDaySlots(params: {
  startsAt: Date;
  endsAt: Date;
  slotMinutes: number;
  slotBufferMinutes: number;
  booked: Interval[];
  now: Date;
}): { startsAt: Date; endsAt: Date; available: boolean }[] {
  const out: { startsAt: Date; endsAt: Date; available: boolean }[] = [];
  const step = (params.slotMinutes + params.slotBufferMinutes) * 60_000;
  for (let t = params.startsAt.getTime(); t + params.slotMinutes * 60_000 <= params.endsAt.getTime(); t += step) {
    const slot = { start: new Date(t), end: new Date(t + params.slotMinutes * 60_000) };
    const taken = params.booked.some((b) => intervalsOverlap(slot, b));
    out.push({ startsAt: slot.start, endsAt: slot.end, available: !taken && slot.start > params.now });
  }
  return out;
}
