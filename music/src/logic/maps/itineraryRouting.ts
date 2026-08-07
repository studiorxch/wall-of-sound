// ── itineraryRouting.ts — real geocoding + real Directions routing ───────────
// 0729E_MAPS_Itinerary_Collections_Foundation
//
// Client-side port of wall/render/routePanel.js's `_geocode` helper (same
// Mapbox Geocoding endpoint/shape) and wall/systems/routeInputSystem.js's
// Directions call (same endpoint, same geometries=geojson&overview=full),
// extended with `alternatives=true&steps=true` — no existing call site in
// this codebase requests either.
//
// Deliberately takes the Mapbox token as an explicit parameter rather than
// reading window.SBE.MapboxToken internally (unlike wallMapPreview.ts) —
// this keeps the module pure and unit-testable without a DOM environment,
// matching every other .test.ts in this codebase (none of which run under
// jsdom/happy-dom, neither of which is an installed dependency). UI call
// sites read the real token via getMapboxToken() and pass it in.
//
// Mode honesty: fetchRouteSet() only ever accepts a ROUTABLE_MODES entry
// (driving/walking/cycling) — Mapbox Directions has no transit/flight
// profile, and none is invented here. Callers must not offer transit/
// flight/other anywhere reachable in the UI (see SELECTABLE_MODES).

import type { LocationRef, Route, RouteSet, RouteStep, TravelMode } from "../../data/itineraryTypes";
import { ROUTABLE_MODES } from "../../data/itineraryTypes";

/** Real token read, same fallback chain wallMapPreview.ts already uses. UI call sites only — not exercised by unit tests. */
export function getMapboxToken(): string | undefined {
  return (window as unknown as { SBE?: { MapboxToken?: string }; MAPBOX_TOKEN?: string }).SBE?.MapboxToken
    ?? (window as unknown as { MAPBOX_TOKEN?: string }).MAPBOX_TOKEN;
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

export interface GeocodeResult {
  name: string;
  longitude: number;
  latitude: number;
  placeId?: string;
}

// Distinguishes *why* a geocode attempt produced no result — a missing token
// (the map/bridge runtime hasn't connected yet) and a genuine zero-result
// query look identical to a user unless callers can tell them apart. Collapsing
// these into one generic "no match" message is exactly what made a real
// infrastructure outage (Wall's runtime unreachable) look like a geocoding bug.
export type GeocodeFailureReason = "no_token" | "network_error" | "http_error" | "no_match";
export type GeocodeOutcome =
  | { ok: true; data: GeocodeResult }
  | { ok: false; reason: GeocodeFailureReason };

// Same endpoint/shape as wall/render/routePanel.js's _geocode.
export async function geocode(query: string, token: string | undefined): Promise<GeocodeOutcome> {
  if (!token) return { ok: false, reason: "no_token" };
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, reason: "network_error" };
  }
  if (!res.ok) return { ok: false, reason: "http_error" };
  let data: { features?: Array<{ place_name: string; center: [number, number]; id?: string }> };
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "network_error" };
  }
  const feature = data.features?.[0];
  if (!feature) return { ok: false, reason: "no_match" };
  return {
    ok: true,
    data: {
      name: feature.place_name,
      longitude: feature.center[0],
      latitude: feature.center[1],
      placeId: feature.id,
    },
  };
}

export async function geocodeToStop(query: string, token: string | undefined): Promise<LocationRef | null> {
  const result = await geocode(query, token);
  if (!result.ok) return null;
  return {
    id: genId("stop"),
    name: result.data.name,
    longitude: result.data.longitude,
    latitude: result.data.latitude,
    placeId: result.data.placeId,
  };
}

type MapboxDirectionsStep = {
  maneuver?: { instruction?: string; type?: string; location?: [number, number] };
  distance?: number;
  duration?: number;
};
type MapboxDirectionsRoute = {
  geometry?: { type: "LineString"; coordinates: [number, number][] };
  distance?: number;
  duration?: number;
  legs?: Array<{ steps?: MapboxDirectionsStep[] }>;
};

function toRouteSteps(route: MapboxDirectionsRoute): RouteStep[] {
  const steps = route.legs?.[0]?.steps ?? [];
  return steps.map((s) => ({
    instruction: s.maneuver?.instruction ?? "",
    distanceMeters: s.distance ?? 0,
    durationSeconds: s.duration ?? 0,
    maneuverType: s.maneuver?.type ?? "",
    coordinates: s.maneuver?.location ?? [0, 0],
  }));
}

/**
 * Fetches a real RouteSet (with real alternatives, when Mapbox returns them)
 * for a routable mode only. Throws if asked for a non-routable mode — this
 * is a hard guard, not a soft fallback, per mode-honesty: no computed number
 * may ever be fabricated for transit/flight/other.
 */
export async function fetchRouteSet(
  origin: LocationRef,
  destination: LocationRef,
  mode: TravelMode,
  token: string | undefined,
): Promise<RouteSet> {
  if (!ROUTABLE_MODES.includes(mode)) {
    throw new Error(`[itineraryRouting] fetchRouteSet called with a non-routable mode: ${mode}`);
  }
  const nowIso = new Date().toISOString();
  if (!token) {
    return { id: genId("routeset"), mode, routes: [], fetchedAt: null };
  }
  const coordStr = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${encodeURIComponent(coordStr)}` +
    `?access_token=${token}&geometries=geojson&overview=full&alternatives=true&steps=true`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const mapboxRoutes: MapboxDirectionsRoute[] = Array.isArray(data.routes) ? data.routes.slice(0, 3) : [];
    const routes: Route[] = mapboxRoutes
      .filter((r) => r.geometry && typeof r.distance === "number" && typeof r.duration === "number")
      .map((r) => ({
        id: genId("route"),
        geometry: r.geometry as Route["geometry"],
        distanceMeters: r.distance as number,
        durationSeconds: r.duration as number,
        steps: toRouteSteps(r),
      }));
    return { id: genId("routeset"), mode, routes, fetchedAt: nowIso };
  } catch {
    return { id: genId("routeset"), mode, routes: [], fetchedAt: null };
  }
}
