/**
 * Pure route planning for a technician's day.
 *
 * Stops have a time window. Confirmed/assigned appointments are LOCKED: their
 * window is exactly their scheduled start, so the planner never moves them; it
 * only orders flexible stops and reports infeasibility. Travel times come from
 * a provider matrix. Without a matrix, no travel estimates are produced.
 */
export type RouteStop = {
  id: string;
  /** earliest start (ms epoch) */
  earliest: number;
  /** latest start (ms epoch) */
  latest: number;
  durationMin: number;
  locked: boolean;
};

export type RouteLeg = { fromIndex: number; toIndex: number; durationSec: number | null; distanceMeters: number | null };

export type PlannedStop = { id: string; arrival: number | null; start: number; waitMin: number; lateMin: number };

export type RoutePlanResult = {
  order: string[];
  stops: PlannedStop[];
  totalDriveSec: number | null;
  totalDistanceMeters: number | null;
  feasible: boolean;
  warnings: string[];
};

/**
 * Simulate a fixed order. Matrix index 0 is the start (home base) if hasStart,
 * and stop i maps to matrix index i + (hasStart ? 1 : 0) in the ORIGINAL list.
 */
export function simulate(
  stops: RouteStop[],
  order: number[],
  matrix: { durationsSec: (number | null)[][]; distancesMeters: (number | null)[][] } | null,
  opts: { hasStart: boolean; bufferMin: number },
): RoutePlanResult {
  const off = opts.hasStart ? 1 : 0;
  let clock: number | null = null;
  let prevIdx: number | null = opts.hasStart ? 0 : null;
  let drive = 0;
  let dist = 0;
  let driveKnown = Boolean(matrix);
  const planned: PlannedStop[] = [];
  const warnings: string[] = [];
  let feasible = true;

  for (const i of order) {
    const s = stops[i];
    const mi = i + off;
    let travel: number | null = null;
    if (prevIdx !== null && matrix) {
      const d = matrix.durationsSec[prevIdx]?.[mi];
      const m = matrix.distancesMeters[prevIdx]?.[mi];
      if (d == null) driveKnown = false;
      else {
        travel = d;
        drive += d;
      }
      if (m != null) dist += m;
    }
    const arrival: number | null = clock !== null && travel !== null ? clock + travel * 1000 : null;
    let start: number = s.locked ? s.earliest : Math.max(s.earliest, arrival ?? s.earliest);
    let lateMin = 0;
    if (arrival !== null && arrival > start) {
      if (s.locked) {
        lateMin = Math.round((arrival - start) / 60000);
        feasible = false;
        warnings.push(`Estimated arrival is ${lateMin} min after the scheduled start for stop ${planned.length + 1}.`);
      } else {
        start = arrival;
      }
    }
    if (!s.locked && start > s.latest) {
      feasible = false;
      warnings.push(`Stop ${planned.length + 1} cannot start within its time window.`);
    }
    const waitMin = arrival !== null && start > arrival ? Math.round((start - arrival) / 60000) : 0;
    planned.push({ id: s.id, arrival, start, waitMin, lateMin });
    clock = start + s.durationMin * 60000; // end of service
    prevIdx = mi;
  }
  return {
    order: order.map((i) => stops[i].id),
    stops: planned,
    totalDriveSec: matrix && driveKnown ? drive : null,
    totalDistanceMeters: matrix && driveKnown ? dist : null,
    feasible,
    warnings,
  };
}

function cost(r: RoutePlanResult): number {
  const late = r.stops.reduce((s, x) => s + x.lateMin, 0);
  return (r.feasible ? 0 : 1e9) + late * 1e6 + (r.totalDriveSec ?? 0);
}

/**
 * Suggest an order. Locked stops keep their chronological order; flexible
 * stops are inserted where they add the least drive time (cheapest insertion),
 * then improved with pairwise swaps of flexible stops. Without a matrix the
 * order is simply chronological by earliest start.
 */
export function suggestOrder(
  stops: RouteStop[],
  matrix: { durationsSec: (number | null)[][]; distancesMeters: (number | null)[][] } | null,
  opts: { hasStart: boolean; bufferMin: number },
): RoutePlanResult {
  const chronological = stops.map((_, i) => i).sort((a, b) => stops[a].earliest - stops[b].earliest || stops[a].id.localeCompare(stops[b].id));
  if (!matrix) return simulate(stops, chronological, null, opts);

  const locked = chronological.filter((i) => stops[i].locked);
  const flexible = chronological.filter((i) => !stops[i].locked);
  let order = [...locked];
  for (const f of flexible) {
    let best: number[] | null = null;
    let bestCost = Infinity;
    for (let pos = 0; pos <= order.length; pos++) {
      const candidate = [...order.slice(0, pos), f, ...order.slice(pos)];
      const c = cost(simulate(stops, candidate, matrix, opts));
      if (c < bestCost) {
        bestCost = c;
        best = candidate;
      }
    }
    order = best!;
  }
  // Local improvement: swap pairs where at least one is flexible.
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    const base = cost(simulate(stops, order, matrix, opts));
    outer: for (let a = 0; a < order.length; a++) {
      for (let b = a + 1; b < order.length; b++) {
        if (stops[order[a]].locked && stops[order[b]].locked) continue;
        const cand = [...order];
        [cand[a], cand[b]] = [cand[b], cand[a]];
        if (cost(simulate(stops, cand, matrix, opts)) < base) {
          order = cand;
          improved = true;
          break outer;
        }
      }
    }
  }
  return simulate(stops, order, matrix, opts);
}

/** Straight-line distance in miles (used ONLY for grouping nearby jobs, never as a travel estimate). */
export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Group points whose straight-line distance is within `radiusMiles` (single-link clustering). */
export function groupNearby<T extends { id: string; lat: number | null; lng: number | null; area?: string | null }>(items: T[], radiusMiles: number): T[][] {
  const groups: T[][] = [];
  const assigned = new Set<string>();
  for (const item of items) {
    if (assigned.has(item.id)) continue;
    const group = [item];
    assigned.add(item.id);
    for (let i = 0; i < group.length; i++) {
      const g = group[i];
      for (const other of items) {
        if (assigned.has(other.id)) continue;
        const near =
          g.lat != null && g.lng != null && other.lat != null && other.lng != null
            ? haversineMiles({ lat: g.lat, lng: g.lng }, { lat: other.lat, lng: other.lng }) <= radiusMiles
            : Boolean(g.area && other.area && g.area === other.area);
        if (near) {
          group.push(other);
          assigned.add(other.id);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

export function metersToMiles(m: number | null | undefined): number | null {
  return m == null ? null : Math.round((m / 1609.344) * 10) / 10;
}
