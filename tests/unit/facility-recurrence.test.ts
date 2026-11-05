import { describe, expect, it } from "vitest";
import { generateOccurrenceDateKeys, nthWeekdayOfMonth, validateRule } from "@/lib/facilities/recurrence";
import { localMinuteToUtc, zonedParts } from "@/lib/time";

describe("facility recurrence", () => {
  it("weekly series starts on the first matching weekday", () => {
    // 2026-10-19 is a Monday; Tuesdays follow
    expect(generateOccurrenceDateKeys({ frequency: "WEEKLY", dayOfWeek: 2, startDateKey: "2026-10-19", count: 4 })).toEqual([
      "2026-10-20",
      "2026-10-27",
      "2026-11-03",
      "2026-11-10",
    ]);
  });

  it("biweekly series respects untilDate (inclusive)", () => {
    expect(generateOccurrenceDateKeys({ frequency: "BIWEEKLY", dayOfWeek: 4, startDateKey: "2026-11-05", untilDateKey: "2026-12-17" })).toEqual([
      "2026-11-05",
      "2026-11-19",
      "2026-12-03",
      "2026-12-17",
    ]);
  });

  it("monthly nth weekday and last weekday", () => {
    expect(nthWeekdayOfMonth(2026, 11, 2, 2)).toBe("2026-11-10");
    expect(nthWeekdayOfMonth(2026, 11, 5, 5)).toBe("2026-11-27");
    expect(nthWeekdayOfMonth(2027, 1, 5, 5)).toBe("2027-01-29");
    expect(nthWeekdayOfMonth(2027, 2, 1, 4)).toBe("2027-02-22");
    expect(
      generateOccurrenceDateKeys({ frequency: "MONTHLY_NTH_WEEKDAY", dayOfWeek: 2, weekOfMonth: 2, startDateKey: "2026-11-11", count: 3 }),
    ).toEqual(["2026-12-08", "2027-01-12", "2027-02-09"]);
    expect(
      generateOccurrenceDateKeys({ frequency: "MONTHLY_NTH_WEEKDAY", dayOfWeek: 5, weekOfMonth: 5, startDateKey: "2026-11-01", untilDateKey: "2027-02-28" }),
    ).toEqual(["2026-11-27", "2026-12-25", "2027-01-29", "2027-02-26"]);
  });

  it("keeps local wall-clock time across DST in America/New_York", () => {
    const keys = generateOccurrenceDateKeys({ frequency: "MONTHLY_NTH_WEEKDAY", dayOfWeek: 1, weekOfMonth: 2, startDateKey: "2027-02-01", count: 3 });
    expect(keys).toEqual(["2027-02-08", "2027-03-08", "2027-04-12"]);
    const utc = keys.map((k) => localMinuteToUtc(k, 600, "America/New_York"));
    expect(utc[0].toISOString()).toBe("2027-02-08T15:00:00.000Z"); // EST
    expect(utc[1].toISOString()).toBe("2027-03-08T15:00:00.000Z"); // still EST (DST starts Mar 14)
    expect(utc[2].toISOString()).toBe("2027-04-12T14:00:00.000Z"); // EDT
    for (const d of utc) expect(zonedParts(d, "America/New_York").hour).toBe(10);
  });

  it("validates rules", () => {
    expect(validateRule({ frequency: "MONTHLY_NTH_WEEKDAY", dayOfWeek: 1, weekOfMonth: 0, startDateKey: "2026-11-01", count: 2 })).toMatch(/week of the month/);
    expect(validateRule({ frequency: "WEEKLY", dayOfWeek: 1, startDateKey: "2026-11-01" })).toMatch(/end date/);
    expect(validateRule({ frequency: "WEEKLY", dayOfWeek: 1, startDateKey: "2026-11-01", untilDateKey: "2026-10-01" })).toMatch(/after/);
  });
});
