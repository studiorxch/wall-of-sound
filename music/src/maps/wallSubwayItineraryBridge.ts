// ── wallSubwayItineraryBridge ─────────────────────────────────────────────────
// 0819_SUBWAY_Itinerary_Recovery_Transit_Foundation
//
// The one narrow bridge between the Itinerary editor and Wall's
// SubwayItineraryLegResolver (window.SBE.SubwayItineraryLegResolver) — same
// contract as wallStationLibraryBridge.ts/wallOrbProfileBridge.ts: Wall
// remains the sole authority, this module never resolves a leg itself, only
// forwards and reports an explicit failure reason instead of a fabricated
// result. window.SBE is populated by plain <script> tags in index.html (see
// music/index.html), loaded from wall/systems/transit/ through the
// /wall-app proxy — no dynamic injection needed, unlike wallMapPreview.ts's
// Mapbox GL loading.

import type {
  TransitLegPlan, TransitLiveCandidate, TransitStationRef, TransitUnresolvedReason,
} from "../data/itineraryTypes";

type RawResolveLegResult =
  | {
      ok: true;
      routeId: string;
      shapeId: string;
      boardingStation: TransitStationRef;
      exitStation: TransitStationRef;
      boardingWalkMeters: number;
      exitWalkMeters: number;
      direction: { towardStationId: string; towardStationName: string };
      orderedStops: TransitStationRef[];
      alternateRouteIds: string[];
    }
  | { ok: false; reason: TransitUnresolvedReason };

type SubwayItineraryLegResolverGlobal = {
  VERSION: string;
  resolveLeg: (
    origin: { longitude: number; latitude: number },
    destination: { longitude: number; latitude: number },
    opts?: { preferredRouteId?: string },
  ) => RawResolveLegResult;
  getLiveCandidates: (legResolution: RawResolveLegResult, opts?: { now?: number }) => TransitLiveCandidate[];
  findNearestStation: (longitude: number, latitude: number) => { station: RawStoreStation; distanceMeters: number } | null;
};

type RawStoreStation = {
  id: string;
  displayName: string | null;
  kind: string;
  longitude: number;
  latitude: number;
  routeIds: string[];
};

type MTASubwayTransitStoreGlobal = {
  loadStatic: () => Promise<{ ok: boolean; reason?: string }>;
  getRoute: (id: string) => { id: string; authoritativeId: string } | null;
  getAllStations: () => RawStoreStation[];
};

type MTASubwayStationLibraryGlobal = {
  importFromStaticModel: () => { ok: boolean; reason?: string };
};

// WallSBE is the shared named interface every wall*Bridge.ts extends — see
// wallGeographicStyleBridge.ts for the base `interface Window { SBE?: WallSBE }`
// declaration (declared once there; never redeclared here).
declare global {
  interface WallSBE {
    SubwayItineraryLegResolver?: SubwayItineraryLegResolverGlobal;
  }
}

function resolver(): SubwayItineraryLegResolverGlobal | null {
  return window.SBE?.SubwayItineraryLegResolver ?? null;
}
function store(): MTASubwayTransitStoreGlobal | null {
  return (window.SBE as unknown as { MTASubwayTransitStore?: MTASubwayTransitStoreGlobal })?.MTASubwayTransitStore ?? null;
}
function library(): MTASubwayStationLibraryGlobal | null {
  return (window.SBE as unknown as { MTASubwayStationLibrary?: MTASubwayStationLibraryGlobal })?.MTASubwayStationLibrary ?? null;
}

export function isBridgeAvailable(): boolean {
  return resolver() != null;
}

// Idempotent, shared across every call site in this page — mirrors
// wallStationLibraryBridge.ts's ensureStationsImported() but memoized as a
// single in-flight promise so concurrent stage resolutions never trigger
// redundant loadStatic()/importFromStaticModel() calls.
let _staticReadyPromise: Promise<boolean> | null = null;
function ensureStaticReady(): Promise<boolean> {
  if (_staticReadyPromise) return _staticReadyPromise;
  _staticReadyPromise = (async () => {
    const s = store(), lib = library();
    if (!s || !lib) return false;
    const result = await s.loadStatic();
    if (!result.ok) return false;
    lib.importFromStaticModel();
    return true;
  })();
  return _staticReadyPromise;
}

export type TransitLegResolution = { leg: TransitLegPlan } | { reason: TransitUnresolvedReason };

// Resolves one real SUBWAY leg for a stage's origin/destination — never
// fabricates a result; a resolver-reported failure reason is returned
// verbatim, never collapsed into a generic message.
export async function resolveTransitLeg(
  origin: { longitude: number; latitude: number },
  destination: { longitude: number; latitude: number },
  preferredRouteId?: string,
): Promise<TransitLegResolution> {
  const ready = await ensureStaticReady();
  const r = resolver();
  if (!ready || !r) return { reason: "authority_unavailable" };

  const result = r.resolveLeg(origin, destination, preferredRouteId ? { preferredRouteId } : undefined);
  if (!result.ok) return { reason: result.reason };

  const s = store();
  const route = s?.getRoute(result.routeId) ?? null;
  return {
    leg: {
      routeId: result.routeId,
      routeLabel: route?.authoritativeId ?? result.routeId,
      alternateRouteIds: result.alternateRouteIds,
      boardingStation: result.boardingStation,
      exitStation: result.exitStation,
      boardingWalkMeters: result.boardingWalkMeters,
      exitWalkMeters: result.exitWalkMeters,
      direction: result.direction,
      orderedStops: result.orderedStops,
      resolvedAt: new Date().toISOString(),
    },
  };
}

// Real, currently-active live trains for an already-resolved leg. Returns []
// (never throws, never fabricates) when the bridge or the resolved leg's own
// route/stations can't be re-submitted — e.g. the resolver script hasn't
// loaded.
export function getLiveCandidatesForLeg(leg: TransitLegPlan): TransitLiveCandidate[] {
  const r = resolver();
  if (!r) return [];
  const rawLeg: RawResolveLegResult = {
    ok: true,
    routeId: leg.routeId,
    shapeId: "",
    boardingStation: leg.boardingStation,
    exitStation: leg.exitStation,
    boardingWalkMeters: leg.boardingWalkMeters,
    exitWalkMeters: leg.exitWalkMeters,
    direction: leg.direction,
    orderedStops: leg.orderedStops,
    alternateRouteIds: leg.alternateRouteIds,
  };
  return r.getLiveCandidates(rawLeg);
}

export interface NearestStationPreview {
  station: TransitStationRef;
  distanceMeters: number;
  routeLabels: string[];
}

// The real nearest station to an arbitrary point, plus the real routes it
// serves — used by "Pick on Map" to show "Nearest subway: 59 St / N R"
// before the user commits to adding it as a stop. Never a fabricated
// match — see SubwayItineraryLegResolver.findNearestStation's own real
// walkable-distance bound.
export async function findNearestStationPreview(longitude: number, latitude: number): Promise<NearestStationPreview | null> {
  const ready = await ensureStaticReady();
  const r = resolver(), s = store();
  if (!ready || !r || !s) return null;
  const match = r.findNearestStation(longitude, latitude);
  if (!match) return null;
  const routeLabels = match.station.routeIds
    .map((id) => s.getRoute(id)?.authoritativeId)
    .filter((label): label is string => !!label);
  return {
    station: { id: match.station.id, name: match.station.displayName ?? match.station.id, longitude: match.station.longitude, latitude: match.station.latitude },
    distanceMeters: Math.round(match.distanceMeters),
    routeLabels,
  };
}

// Real, boardable ('station'-kind, never a bare platform) stations whose
// display name contains `query` (case-insensitive) — station-first
// authoring per §9: the caller gets the station's own canonical
// coordinates directly, never a name round-tripped through geocoding.
//
// 0821_SUBWAY_Boarding_UX — real duplicate display names exist in NYC
// (multiple distinct real "Rector St"/"14 St" stations serving different
// lines) and were indistinguishable in search results. `routeLabels` (real
// route display labels, e.g. "R"/"W" — the SAME join findNearestStationPreview
// already uses: st.routeIds -> store.getRoute(id).authoritativeId) is now
// attached to every result so the UI can render real line-service badges,
// never inferred from the station name.
export async function searchStations(query: string): Promise<TransitStationRef[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const ready = await ensureStaticReady();
  const s = store();
  if (!ready || !s) return [];
  const q = trimmed.toLowerCase();
  return s.getAllStations()
    .filter((st) => st.kind === "station" && st.displayName && st.displayName.toLowerCase().includes(q))
    .slice(0, 20)
    .map((st) => ({
      id: st.id,
      name: st.displayName as string,
      longitude: st.longitude,
      latitude: st.latitude,
      routeLabels: st.routeIds
        .map((id) => s.getRoute(id)?.authoritativeId)
        .filter((label): label is string => !!label),
    }));
}
