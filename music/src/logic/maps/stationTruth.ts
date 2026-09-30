// STATION-01 -- Station Cover's ONLY source of station identity/route/
// location facts. Deliberately reads the EXACT SAME file
// `wall/systems/transit/mtaSubwayStaticAdapter.js` already treats as
// canonical (`wall/data/subway/mtaSubwayStaticSnapshot.json`, real MTA
// GTFS static data, copied verbatim into the production build by
// `vite.config.ts`'s own `copy-wall-app-public` plugin, so
// `/wall-app/data/subway/mtaSubwayStaticSnapshot.json` is a stable,
// same-origin path in both dev (via the existing `/wall-app` proxy) and
// production) -- never a second/duplicated copy of station name, routes,
// or location. This module ONLY reads and looks up; it never derives,
// estimates, or fabricates a fact the snapshot doesn't already contain.
//
// Deliberately does NOT read `StationGeometryData`
// (`stationGeometryTypes.ts`/`stationGeometryStore.ts`) -- that authority
// is browser-local IndexedDB topology/geometry data, explicitly NOT a
// source of station name/routes (see that module's own doc: `stationRef`
// is "carried for a cheap sanity cross-check only, never authoritative
// here"), and Station Cover V1 does not present geometry at all (see
// docs/architecture/subway/README.md's STATION-01 section).
//
// underground/elevated classification is DELIBERATELY not modeled here:
// `stationClassificationTypes.ts` has no automatic classifier and no
// station (including Bay Ridge Av) has a hand-authored classification
// record today (docs/architecture/subway/README.md §5/§10) -- exposing a
// value here would be exactly the "uncertain fact presented as
// authoritative" this batch was told not to do. A future batch that adds
// real, provenanced classification data should extend `StationTruth`
// then, not before.

export interface StationTruthRoute {
  readonly routeId: string;
  readonly shortName: string;
  readonly longName: string;
  /** 6-digit hex, no leading "#", exactly as the GTFS static feed provides it. */
  readonly color: string;
  readonly textColor: string;
}

export interface StationTruth {
  /** The real, station-level GTFS stop id -- e.g. "R42". Never a platform-level child id. */
  readonly gtfsStopId: string;
  readonly complexId: string;
  readonly name: string;
  /** MTA's own two-letter borough code (e.g. "Bk", "Mn", "Bx", "Q", "SI") -- never expanded/translated here; presentation decides how to show it. */
  readonly borough: string;
  readonly routes: readonly StationTruthRoute[];
  readonly latitude: number;
  readonly longitude: number;
}

interface RawSnapshotComplex {
  readonly complexId?: unknown;
  readonly stopName?: unknown;
  readonly borough?: unknown;
  readonly routes?: unknown;
  readonly lat?: unknown;
  readonly lon?: unknown;
  readonly gtfsStopIds?: unknown;
}

interface RawSnapshotRoute {
  readonly routeId?: unknown;
  readonly shortName?: unknown;
  readonly longName?: unknown;
  readonly color?: unknown;
  readonly textColor?: unknown;
}

interface RawSnapshot {
  readonly complexes?: unknown;
  readonly routes?: unknown;
}

/**
 * Pure. Looks up ONE station by its real GTFS station-level stop id
 * within an already-fetched snapshot -- never fetches anything itself
 * (see `fetchStationTruth` below for the IO wrapper). Returns `null` for
 * any unknown/invalid station id, or a genuinely malformed snapshot --
 * never a partial/guessed record.
 */
export function resolveStationTruth(snapshot: unknown, gtfsStopId: string): StationTruth | null {
  if (!gtfsStopId) return null;
  const raw = snapshot as RawSnapshot;
  if (!raw || !Array.isArray(raw.complexes) || !Array.isArray(raw.routes)) return null;

  const complex = (raw.complexes as RawSnapshotComplex[]).find(
    (candidate) => Array.isArray(candidate.gtfsStopIds) && (candidate.gtfsStopIds as unknown[]).includes(gtfsStopId),
  );
  if (!complex) return null;
  if (typeof complex.complexId !== "string" && typeof complex.complexId !== "number") return null;
  if (typeof complex.stopName !== "string" || !complex.stopName) return null;
  if (typeof complex.borough !== "string") return null;
  if (typeof complex.lat !== "number" || typeof complex.lon !== "number") return null;
  if (!Array.isArray(complex.routes)) return null;

  const routesById = new Map(
    (raw.routes as RawSnapshotRoute[])
      .filter((route): route is RawSnapshotRoute & { routeId: string } => typeof route.routeId === "string")
      .map((route) => [route.routeId, route]),
  );

  const routes: StationTruthRoute[] = [];
  for (const routeId of complex.routes as unknown[]) {
    if (typeof routeId !== "string") continue;
    const route = routesById.get(routeId);
    if (!route || typeof route.shortName !== "string" || typeof route.longName !== "string" || typeof route.color !== "string" || typeof route.textColor !== "string") {
      continue; // A route id with no matching, well-formed route record is omitted, never fabricated.
    }
    routes.push({ routeId, shortName: route.shortName, longName: route.longName, color: route.color, textColor: route.textColor });
  }

  return {
    gtfsStopId,
    complexId: String(complex.complexId),
    name: complex.stopName,
    borough: complex.borough,
    routes,
    latitude: complex.lat,
    longitude: complex.lon,
  };
}

const SNAPSHOT_PATH = "/wall-app/data/subway/mtaSubwayStaticSnapshot.json";

/**
 * The one IO wrapper -- fetches the real, existing snapshot and delegates
 * to `resolveStationTruth` above. Callers that already have the snapshot
 * in memory (e.g. a future batch reusing `wall/`'s own already-loaded
 * copy) should call `resolveStationTruth` directly instead of fetching a
 * second time.
 */
export async function fetchStationTruth(gtfsStopId: string): Promise<StationTruth | null> {
  const response = await fetch(SNAPSHOT_PATH);
  if (!response.ok) throw new Error(`station_truth_snapshot_fetch_failed:${response.status}`);
  const snapshot: unknown = await response.json();
  return resolveStationTruth(snapshot, gtfsStopId);
}
