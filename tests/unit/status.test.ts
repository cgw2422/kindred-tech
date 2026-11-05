import { describe, expect, it } from "vitest";
import { allowedNextStatuses, canCustomerModify, canTransition } from "@/lib/booking/status";

describe("appointment status transitions", () => {
  it("allows the normal lifecycle for staff", () => {
    expect(canTransition("REQUESTED", "CONFIRMED", "ADMIN")).toBe(true);
    expect(canTransition("CONFIRMED", "ASSIGNED", "DISPATCHER")).toBe(true);
    expect(canTransition("ASSIGNED", "EN_ROUTE", "ADMIN")).toBe(true);
    expect(canTransition("EN_ROUTE", "IN_PROGRESS", "ADMIN")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED", "ADMIN")).toBe(true);
  });
  it("blocks invalid jumps", () => {
    expect(canTransition("REQUESTED", "COMPLETED", "OWNER")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELED", "OWNER")).toBe(false);
    expect(canTransition("CANCELED", "COMPLETED", "OWNER")).toBe(false);
  });
  it("limits technicians to field statuses", () => {
    expect(canTransition("ASSIGNED", "EN_ROUTE", "TECHNICIAN")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED", "TECHNICIAN")).toBe(true);
    expect(canTransition("REQUESTED", "CONFIRMED", "TECHNICIAN")).toBe(false);
    expect(canTransition("ASSIGNED", "CANCELED", "TECHNICIAN")).toBe(false);
  });
  it("lets customers only cancel", () => {
    expect(allowedNextStatuses("CONFIRMED", "CUSTOMER")).toEqual(["CANCELED"]);
    expect(canTransition("EN_ROUTE", "CANCELED", "CUSTOMER")).toBe(false);
    expect(canTransition("CONFIRMED", "CANCELED", "FACILITY_CONTACT")).toBe(false);
  });
  it("enforces the online change cutoff", () => {
    const startsAt = new Date("2026-11-10T15:00:00Z");
    expect(canCustomerModify({ status: "CONFIRMED", startsAt, now: new Date("2026-11-08T15:00:00Z"), freeCancellationHours: 24 }).allowed).toBe(true);
    expect(canCustomerModify({ status: "CONFIRMED", startsAt, now: new Date("2026-11-10T00:00:00Z"), freeCancellationHours: 24 }).allowed).toBe(false);
    expect(canCustomerModify({ status: "IN_PROGRESS", startsAt, now: new Date("2026-11-01T00:00:00Z"), freeCancellationHours: 24 }).allowed).toBe(false);
  });
});
