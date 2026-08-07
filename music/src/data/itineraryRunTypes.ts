// ── Itinerary run data model ──────────────────────────────────────────────────
// 0730D_MAPS_Itinerary_Runner_and_Active_Orb_Traversal
//
// Ephemeral RUN-STATE data — deliberately separate from stored Itinerary data
// (music/src/data/itineraryTypes.ts) and from presentation consumers. The
// runner executes only on canonical LIVE MAP (wall/index.html); MUSIC only
// ever sends commands and receives snapshots across contexts via
// wallItineraryRunBridge.ts — nothing here is a same-page authority.

export type ItineraryRunStatus =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "stopping"
  | "completed"
  | "error";

// 0805A — shared vocabulary for presentation warnings. Only 'orb_unavailable'
// is ever assigned into the real ItineraryRunSnapshot (below) — it's the only
// variant the wall-side runner can know about, since a run/snapshot must
// already exist for it to apply. The two launch-only variants
// ('live_map_not_ready'/'live_map_popup_blocked') can only ever be known
// BEFORE a run exists (no owning wall/ tab yet to publish a snapshot from) —
// they live only in ItineraryRunControls.tsx's local launch-attempt state,
// never on this shared snapshot type. Kept here as one shared union so the
// one warning-banner UI component can reference a single vocabulary
// regardless of which source populated it.
export type ItineraryPresentationWarning =
  | "orb_unavailable"
  | "live_map_not_ready"
  | "live_map_popup_blocked";

export interface ItineraryRunSnapshot {
  runId: string | null;
  itineraryId: string | null;

  status: ItineraryRunStatus;

  stageId: string | null;
  stageIndex: number;
  stageCount: number;

  stageProgress01: number;
  itineraryProgress01: number;

  elapsedSeconds: number;
  stageElapsedSeconds: number;

  distanceTraveledMeters: number;
  distanceRemainingMeters: number | null;

  estimatedRemainingSeconds: number | null;

  longitude: number | null;
  latitude: number | null;
  headingDeg: number | null;
  /** Presentation-only rendering offset — never affects route/progress/heading. */
  altitudeMeters: number;
  /**
   * A SECOND, independent presentation-only offset (0805A diagnostic bridge
   * for a later occlusion/terrain build — not the final height solution).
   * Never affects route geometry/progress/duration/distance/heading/actor
   * coordinates; applied only by the renderer.
   */
  heroVisualLiftPixels: number;
  /** Current playback speed multiplier (e.g. 1 = real-time). */
  playbackRate: number;
  /** Whether canonical LIVE MAP's camera is continuously centering on the actor. */
  followHeroEnabled: boolean;
  /** Which hero is actually visible right now — 'none' when the Orb is unavailable (no Hero Car substitute during itinerary presentation). */
  visibleHeroKind: "orb" | "none";
  /** Narrower than ItineraryPresentationWarning — the only variant the wall-side runner ever assigns; see that type's comment. */
  presentationWarning: "orb_unavailable" | null;

  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;

  errorCode: string | null;
  errorMessage: string | null;
}

export const IDLE_RUN_SNAPSHOT: ItineraryRunSnapshot = {
  runId: null,
  itineraryId: null,
  status: "idle",
  stageId: null,
  stageIndex: 0,
  stageCount: 0,
  stageProgress01: 0,
  itineraryProgress01: 0,
  elapsedSeconds: 0,
  stageElapsedSeconds: 0,
  distanceTraveledMeters: 0,
  distanceRemainingMeters: null,
  estimatedRemainingSeconds: null,
  longitude: null,
  latitude: null,
  headingDeg: null,
  altitudeMeters: 0,
  heroVisualLiftPixels: 0,
  playbackRate: 1,
  followHeroEnabled: false,
  visibleHeroKind: "none",
  presentationWarning: null,
  startedAt: null,
  pausedAt: null,
  completedAt: null,
  errorCode: null,
  errorMessage: null,
};

// 0730E — bounded presets/range shared by the pre-Start picker and the live
// in-run controls (music/src/ui/maps/ItineraryRunControls.tsx). Mirror the
// wall-side clamps in wall/systems/runtime/itineraryRunController.js
// (PLAYBACK_RATE_MIN/MAX, HERO_ALTITUDE_MIN_M/MAX_M) — kept in sync by hand
// since the two runtimes don't share a module.
export const PLAYBACK_RATE_PRESETS: number[] = [0.5, 1, 2, 5, 10, 30];
export const PLAYBACK_RATE_DEFAULT = 1;
export const HERO_ALTITUDE_MIN_M = 0;
export const HERO_ALTITUDE_MAX_M = 400;
export const HERO_ALTITUDE_DEFAULT_M = 0;

// 0805A — mirrors wall-side HERO_VISUAL_LIFT_MIN_PX/MAX_PX in
// itineraryRunController.js.
export const HERO_VISUAL_LIFT_MIN_PX = 0;
export const HERO_VISUAL_LIFT_MAX_PX = 200;
export const HERO_VISUAL_LIFT_DEFAULT_PX = 0;

// The immutable payload MUSIC sends when the user clicks Run — a value
// snapshot, never a live reference back into MAPS_ITINERARY_DB. The wall/
// runner never reaches into IndexedDB directly.
export interface ItineraryRunStageInput {
  stageId: string;
  originStopId: string;
  destinationStopId: string;
  mode: "driving" | "walking" | "cycling";
  routeSetId: string;
  routeId: string;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceMeters: number;
  durationSeconds: number;
}

export interface ItineraryRunPayload {
  itineraryId: string;
  title: string;
  stages: ItineraryRunStageInput[];
  builtAt: string;
}

// Reason codes a "Run Itinerary" preflight check can report — never a
// generic "Unable to run." Distinct from ItineraryReadiness (itineraryTypes.ts),
// which is a coarse editing-time boolean; this is the run-specific gate.
export type RunBlockReason =
  | "missing_selected_route"
  | "unsupported_mode"
  | "invalid_geometry"
  | "missing_stage"
  | "run_already_active";

export interface RunReadinessResult {
  ready: boolean;
  reasons: RunBlockReason[];
}
