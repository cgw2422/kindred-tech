import { describe, expect, it } from "vitest";
import { computeAvailability, helpDaySlots, isTechnicianFree, pickTechnician, type AvailabilityInput } from "@/lib/booking/availability";
import { localMinuteToUtc } from "@/lib/time";

const weekday = { open: true, startMinute: 540, endMinute: 1020 };
const closed = { open: false, startMinute: 540, endMinute: 1020 };
const hours = [closed, weekday, weekday, weekday, weekday, weekday, closed];
const fullWeek = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: 540, endMinute: 1020 }));

// 2026-11-09 is a Monday
const base = (): AvailabilityInput => ({
  timeZone: "America/New_York",
  now: new Date("2026-11-01T12:00:00Z"),
  fromDateKey: "2026-11-09",
  days: 1,
  businessHours: hours,
  businessBlackouts: [],
  technicians: [{ id: "t1", schedules: fullWeek, busy: [] }],
  durationMinutes: 60,
  bufferMinutes: 30,
  slotIntervalMinutes: 30,
  minNoticeHours: 24,
  maxDaysAhead: 60,
});

const at = (min: number) => localMinuteToUtc("2026-11-09", min);

describe("computeAvailability", () => {
  it("offers slots within business hours that fit the duration", () => {
    const [day] = computeAvailability(base());
    expect(day.slots[0].startsAt.toISOString()).toBe(at(540).toISOString());
    // last start = 17:00 - 60 = 16:00
    expect(day.slots.at(-1)!.startsAt.toISOString()).toBe(at(960).toISOString());
    expect(day.slots).toHaveLength(15);
  });

  it("returns nothing on closed days", () => {
    const input = { ...base(), fromDateKey: "2026-11-08" }; // Sunday
    expect(computeAvailability(input)[0].slots).toHaveLength(0);
  });

  it("blocks slots that overlap an existing booking plus travel buffer", () => {
    const input = base();
    // Existing 10:00-11:00 appointment, block until 11:30
    input.technicians[0].busy = [{ start: at(600), end: at(690) }];
    const starts = computeAvailability(input)[0].slots.map((s) => s.startsAt.getTime());
    expect(starts).not.toContain(at(570).getTime()); // 9:30 would run 9:30-10:30(+buffer) -> overlaps
    expect(starts).not.toContain(at(600).getTime());
    expect(starts).not.toContain(at(660).getTime());
    expect(starts).toContain(at(690).getTime()); // 11:30 is free (after buffer)
    // 9:00 + 60 + 30 buffer ends exactly at 10:30 -> overlaps block start 10:00
    expect(starts).not.toContain(at(540).getTime());
  });

  it("respects minimum advance notice", () => {
    const input = { ...base(), now: new Date(at(600).getTime() - 24 * 3600_000 + 1) };
    const starts = computeAvailability(input)[0].slots.map((s) => s.startsAt.getTime());
    expect(starts[0]).toBeGreaterThanOrEqual(at(630).getTime());
  });

  it("respects business-wide blackouts such as holidays", () => {
    const input = base();
    input.businessBlackouts = [{ start: at(0), end: at(1440) }];
    expect(computeAvailability(input)[0].slots).toHaveLength(0);
  });

  it("respects technician schedules (part-time technician)", () => {
    const input = base();
    input.technicians = [{ id: "t1", schedules: [{ dayOfWeek: 1, startMinute: 780, endMinute: 900 }], busy: [] }];
    const slots = computeAvailability(input)[0].slots;
    expect(slots.map((s) => s.startsAt.getTime())).toEqual([at(780), at(810), at(840)].map((d) => d.getTime()));
  });

  it("lists every free technician for a slot and balances assignment", () => {
    const input = base();
    input.technicians = [
      { id: "a", schedules: fullWeek, busy: [{ start: at(540), end: at(630) }] },
      { id: "b", schedules: fullWeek, busy: [] },
    ];
    const slot = computeAvailability(input)[0].slots.find((s) => s.startsAt.getTime() === at(660).getTime())!;
    expect(slot.technicianIds.sort()).toEqual(["a", "b"]);
    expect(pickTechnician(slot.technicianIds, { a: 1, b: 0 })).toBe("b");
  });

  it("does not offer slots beyond maxDaysAhead", () => {
    const input = { ...base(), maxDaysAhead: 3 };
    expect(computeAvailability(input)[0].slots).toHaveLength(0);
  });
});

describe("isTechnicianFree", () => {
  it("rejects a start time outside business hours", () => {
    const input = base();
    expect(isTechnicianFree(input, input.technicians[0], "2026-11-09", 990)).toBe(false); // 16:30 + 60 > 17:00
    expect(isTechnicianFree(input, input.technicians[0], "2026-11-09", 960)).toBe(true);
  });
});

describe("helpDaySlots", () => {
  it("splits a session into slots and marks booked ones unavailable", () => {
    const start = at(780);
    const slots = helpDaySlots({
      startsAt: start,
      endsAt: at(900),
      slotMinutes: 30,
      slotBufferMinutes: 0,
      booked: [{ start: at(810), end: at(840) }],
      now: new Date("2026-11-01T00:00:00Z"),
    });
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.available)).toEqual([true, false, true, true]);
  });
});
