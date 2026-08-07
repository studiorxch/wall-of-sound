// ── Itinerary data model ──────────────────────────────────────────────────────
// 0729E_MAPS_Itinerary_Collections_Foundation
//
// An Itinerary is a MUSIC-side ordered collection — unlike Geographic Style/
// Vehicles/Overlays, it owns no paint properties and has no wall/-side runtime
// consumer in this build (no orb, no cinematic route drawing). `stops` is the
// SOLE location authority: stages reference stops by id only, never embed a
// duplicated LocationRef.

export interface LocationRef {
  id: string;
  name: string;          // "Home", "388 Pearl St, NY 10038" — user-visible label
  longitude: number;
  latitude: number;
  placeId?: string;       // Mapbox Geocoding feature id, for re-resolving
}

// "driving"/"walking"/"cycling" are real, working Mapbox Directions profiles
// today — ROUTABLE_MODES stays exactly this (unchanged by 0805A) so old saved
// itineraries with an existing walking/cycling stage keep routing/readiness
// behavior identical. "transit"/"other" stay reserved in the schema for a
// future build with a real manual-entry workflow — not reachable from any UI.
export type TravelMode = "driving" | "walking" | "cycling" | "transit" | "flight" | "other";
export const ROUTABLE_MODES: TravelMode[] = ["driving", "walking", "cycling"];

// SELECTABLE_MODES: which options the mode picker RENDERS (0805A widens this
// to include flight, so the picker can show — and honestly disable — it,
// rather than omitting it silently). ITINERARY_UI_ENABLED_MODES: which of
// those rendered options are actually CLICKABLE today. This is a narrower,
// UI-selection-time restriction than ROUTABLE_MODES — walking/cycling stay
// technically routable (existing stages/data untouched) but aren't offered
// as a new-stage choice in the real workflow until genuinely supported
// end-to-end; every non-enabled option must render disabled with an explicit
// reason, never silently absent or selectable-then-failing.
export const SELECTABLE_MODES: TravelMode[] = ["driving", "walking", "cycling", "flight"];
export const ITINERARY_UI_ENABLED_MODES: TravelMode[] = ["driving"];
export const ITINERARY_UI_DISABLED_REASON = "Not yet supported for itineraries";

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverType: string;
  coordinates: [number, number];
}

export interface Route {
  id: string;
  geometry: { type: "LineString"; coordinates: [number, number][] }; // real Directions API geometry, untouched
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[]; // stored per spec's contract; no turn-by-turn UI in v1
}

export interface RouteSet {
  id: string;
  mode: TravelMode;
  routes: Route[]; // 1-3 real alternatives for routable modes, Mapbox's own order (routes[0] = default)
  manualEntry?: { distanceMeters: number | null; durationSeconds: number | null; enteredAt: string };
  fetchedAt: string | null; // null for manual/unfetched legs
}

export interface ItineraryStage {
  id: string;
  order: number;
  originStopId: string;      // reference into Itinerary.stops — never a duplicated LocationRef
  destinationStopId: string; // reference into Itinerary.stops — never a duplicated LocationRef
  mode: TravelMode;
  routeSetId: string;             // always a real, persisted RouteSet id — never optional/undefined
  selectedRouteId: string | null; // defaults to routes[0].id when present; no picker UI ships in v1
  distanceMeters: number | null;
  durationSeconds: number | null;
  presentationState?: Record<string, unknown>;
}

// STORED lifecycle only — user/lifecycle-driven, never a routing-readiness
// signal. v1 only ever sets "draft"; "active"/"completed" stay dormant until
// real playback/orb work gives them a real trigger.
export type ItineraryStatus = "draft" | "active" | "completed";

export interface Itinerary {
  id: string;
  title: string;
  stops: LocationRef[];      // the UI's reorderable unit AND the sole location authority
  stages: ItineraryStage[];  // derived from consecutive stop pairs — N-1 legs for N stops
  routeSets: RouteSetsById;  // itinerary-scoped route data, keyed by id; stages reference it via routeSetId, never embed it
  activeStageId: string | null; // stored, unused in v1
  status: ItineraryStatus;
  geographicStyleId?: string;
  vehicleId?: string;
  overlayIds?: string[];
  createdAt: string;
  updatedAt: string;
}

// Derived, NEVER stored — computed fresh from stage completeness each read.
// Kept separate from `status` (lifecycle): a draft itinerary can be "ready"
// (every stage has real route data) while still lifecycle-`draft` — "is the
// data complete?" and "what phase is this itinerary in?" are never conflated.
export type ItineraryReadiness = "incomplete" | "ready";

export interface RouteSetsById {
  [routeSetId: string]: RouteSet;
}
