import { describe, expect, it } from "vitest";
import { googleDirectionsUrl } from "@/lib/maps/provider";
import { groupNearby, haversineMiles, simulate, suggestOrder, type RouteStop } from "@/lib/routing/optimize";

const T0 = Date.UTC(2026, 10, 16, 14, 0); // 9:00 ET
const min = (m: number) => T0 + m * 60000;
const stop = (id: string, startMin: number, dur = 60, locked = true): RouteStop => ({ id, earliest: min(startMin), latest: locked ? min(startMin) : min(480), durationMin: dur, locked });
// matrix over [A,B,C] in seconds
const matrix = {
  durationsSec: [
    [0, 1200, 3600],
    [1200, 0, 600],
    [3600, 600, 0],
  ],
  distancesMeters: [
    [0, 16000, 50000],
    [16000, 0, 8000],
    [50000, 8000, 0],
  ],
};

describe("route planning", () => {
  it("never moves locked appointments and keeps chronological order without a matrix", () => {
    const r = suggestOrder([stop("b", 180), stop("a", 0), stop("c", 360)], null, { hasStart: false, bufferMin: 0 });
    expect(r.order).toEqual(["a", "b", "c"]);
    expect(r.totalDriveSec).toBeNull();
    expect(r.totalDistanceMeters).toBeNull();
    expect(r.stops.map((s) => s.start)).toEqual([min(0), min(180), min(360)]);
  });
  it("computes drive totals and arrival from the matrix", () => {
    const r = simulate([stop("a", 0), stop("b", 90), stop("c", 180)], [0, 1, 2], matrix, { hasStart: false, bufferMin: 0 });
    expect(r.totalDriveSec).toBe(1800);
    expect(r.totalDistanceMeters).toBe(24000);
    expect(r.stops[1].arrival).toBe(min(60 + 20));
    expect(r.feasible).toBe(true);
  });
  it("flags a locked appointment that cannot be reached in time", () => {
    const r = simulate([stop("a", 0), stop("b", 0), stop("c", 65)], [0, 2], matrix, { hasStart: false, bufferMin: 0 });
    expect(r.feasible).toBe(false);
    expect(r.stops[1].lateMin).toBe(55);
    expect(r.warnings.length).toBe(1);
  });
  it("inserts a flexible stop where it adds the least driving", () => {
    const stops = [stop("a", 0), stop("c", 300), stop("b", 0, 30, false)];
    // b between a and c is cheapest
    const m = { durationsSec: [[0, 3600, 1200], [3600, 0, 600], [1200, 600, 0]], distancesMeters: [[0, 1, 1], [1, 0, 1], [1, 1, 0]] };
    const r = suggestOrder(stops, m, { hasStart: false, bufferMin: 0 });
    expect(r.order).toEqual(["a", "b", "c"]);
    expect(r.stops[0].start).toBe(min(0));
    expect(r.stops[2].start).toBe(min(300));
  });
  it("groups nearby jobs and falls back to city when coordinates are missing", () => {
    const g = groupNearby(
      [
        { id: "1", lat: 40.49, lng: -81.44, area: "New Philadelphia" },
        { id: "2", lat: 40.52, lng: -81.47, area: "Dover" },
        { id: "3", lat: 40.0, lng: -82.0, area: "Far" },
        { id: "4", lat: null, lng: null, area: "Sugarcreek" },
        { id: "5", lat: null, lng: null, area: "Sugarcreek" },
      ],
      5,
    );
    expect(g.map((x) => x.map((y) => y.id))).toEqual([["1", "2"], ["3"], ["4", "5"]]);
    expect(haversineMiles({ lat: 40.49, lng: -81.44 }, { lat: 40.52, lng: -81.47 })).toBeLessThan(5);
  });
  it("builds Google Maps directions links with waypoints", () => {
    const url = googleDirectionsUrl(["1 A St, Dover, OH", "2 B St, Dover, OH"], "Home");
    expect(url).toContain("destination=2+B+St");
    expect(url).toContain("waypoints=1+A+St");
    expect(url).toContain("origin=Home");
  });
});
