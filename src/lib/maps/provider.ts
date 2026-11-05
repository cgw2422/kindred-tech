import { env } from "../env";

/**
 * Mapping provider adapters. When no provider is configured the app runs in
 * clearly-labelled manual dispatch mode and never invents travel estimates.
 */
export type LatLng = { lat: number; lng: number };
export type Matrix = { durationsSec: (number | null)[][]; distancesMeters: (number | null)[][] };

export interface MapsProvider {
  name: "google" | "mapbox";
  geocode(address: string): Promise<LatLng | null>;
  /** Travel matrix between all points (driving). */
  matrix(points: LatLng[]): Promise<Matrix>;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Maps provider HTTP ${res.status}`);
  return res.json();
}

class GoogleMaps implements MapsProvider {
  name = "google" as const;
  constructor(private key: string) {}
  async geocode(address: string) {
    const data = (await getJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:US&key=${this.key}`)) as {
      status: string;
      results: { geometry: { location: { lat: number; lng: number } } }[];
    };
    if (data.status !== "OK" || !data.results[0]) return null;
    return data.results[0].geometry.location;
  }
  async matrix(points: LatLng[]) {
    const p = points.map((x) => `${x.lat},${x.lng}`).join("|");
    const data = (await getJson(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(p)}&destinations=${encodeURIComponent(p)}&mode=driving&units=imperial&key=${this.key}`)) as {
      status: string;
      rows: { elements: { status: string; duration?: { value: number }; distance?: { value: number } }[] }[];
    };
    if (data.status !== "OK") throw new Error(`Google Distance Matrix: ${data.status}`);
    return {
      durationsSec: data.rows.map((r) => r.elements.map((e) => (e.status === "OK" ? (e.duration?.value ?? null) : null))),
      distancesMeters: data.rows.map((r) => r.elements.map((e) => (e.status === "OK" ? (e.distance?.value ?? null) : null))),
    };
  }
}

class Mapbox implements MapsProvider {
  name = "mapbox" as const;
  constructor(private token: string) {}
  async geocode(address: string) {
    const data = (await getJson(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?country=us&limit=1&access_token=${this.token}`)) as {
      features: { center: [number, number] }[];
    };
    const f = data.features?.[0];
    return f ? { lng: f.center[0], lat: f.center[1] } : null;
  }
  async matrix(points: LatLng[]) {
    if (points.length > 25) throw new Error("Mapbox matrix supports at most 25 points.");
    const coords = points.map((x) => `${x.lng},${x.lat}`).join(";");
    const data = (await getJson(`https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?annotations=duration,distance&access_token=${this.token}`)) as {
      code: string;
      durations: (number | null)[][];
      distances: (number | null)[][];
    };
    if (data.code !== "Ok") throw new Error(`Mapbox matrix: ${data.code}`);
    return { durationsSec: data.durations, distancesMeters: data.distances };
  }
}

let testProvider: MapsProvider | null | undefined;
export function setTestMapsProvider(p: MapsProvider | null | undefined) {
  testProvider = p;
}

export function getMapsProvider(): MapsProvider | null {
  if (testProvider !== undefined) return testProvider;
  if (env.googleMapsApiKey) return new GoogleMaps(env.googleMapsApiKey);
  if (env.mapboxToken) return new Mapbox(env.mapboxToken);
  return null;
}

/** Google Maps directions link (works without an API key). */
export function googleDirectionsUrl(stops: string[], origin?: string): string {
  if (stops.length === 0) return "https://www.google.com/maps";
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);
  const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (origin) params.set("origin", origin);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function formatAddressForMaps(a: { line1: string; city: string; state: string; postalCode: string }) {
  return `${a.line1}, ${a.city}, ${a.state} ${a.postalCode}`;
}
