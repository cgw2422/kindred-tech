import { describe, expect, it } from "vitest";
import { addDaysToKey, localMinuteToUtc, toDateKey, weekdayOfKey, zonedToUtc } from "@/lib/time";

describe("time zone helpers", () => {
  it("converts Eastern wall time to UTC in standard time", () => {
    expect(zonedToUtc(2026, 12, 1, 9, 0).toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });
  it("converts Eastern wall time to UTC in daylight time", () => {
    expect(zonedToUtc(2026, 7, 1, 9, 0).toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });
  it("handles the DST change day (Nov 1 2026)", () => {
    expect(localMinuteToUtc("2026-11-01", 10 * 60).toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(localMinuteToUtc("2026-03-08", 10 * 60).toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });
  it("computes date keys in the business zone", () => {
    expect(toDateKey(new Date("2026-11-06T03:00:00Z"))).toBe("2026-11-05");
  });
  it("adds days and weekdays", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOfKey("2026-11-05")).toBe(4);
  });
});
