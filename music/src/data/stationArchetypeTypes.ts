// ── Station archetype data model ──────────────────────────────────────────────
// 0909_WOS_Subway_Underground_Side_Platform_2Track_Archetype_v1.0.0
//
// An archetype is A REUSABLE EDITABLE STARTING MODEL, NOT GEOGRAPHIC TRUTH.
// It exists to generate a labeled-heuristic StationGeometryData shell that a
// human then edits/calibrates — never a hidden source of truth for any real
// station, and never a step toward automatic bulk station generation (see
// stationArchetypeInstantiate.ts's own doc for the explicit non-goals).
//
// Deliberately reuses stationGeometryTypes.ts's own Provenance/GeometrySource
// ("heuristic" already exists there — no new provenance concept needed) and
// LocalPoint2D, rather than inventing a second, incompatible geometry
// vocabulary. This file adds ONLY what's genuinely new: archetype identity
// and the UG_SIDE_2TRACK parameter shape.

/**
 * Deterministic archetype identity — never a random id, matching this
 * codebase's existing `stationGeometry:${gtfsStopId}` convention (see
 * makeStationGeometryId). Three archetype keys ship as of STATION-06
 * ("UG_SIDE_2TRACK", "UG_SIDE_4TRACK", "UG_ISLAND_2TRACK"), but the id
 * shape supports more without a schema change.
 */
export type StationArchetypeId = `stationArchetype:${string}`;

export function makeStationArchetypeId(archetypeKey: string): StationArchetypeId {
  return `stationArchetype:${archetypeKey}`;
}

export const UG_SIDE_2TRACK_ARCHETYPE_KEY = "UG_SIDE_2TRACK";
export const UG_SIDE_2TRACK_ARCHETYPE_ID: StationArchetypeId = makeStationArchetypeId(UG_SIDE_2TRACK_ARCHETYPE_KEY);

/**
 * Compact parameter set for the UG_SIDE_2TRACK archetype — generates simple
 * initial geometry only; every value defaults to a labeled `heuristic`
 * starting point (see DEFAULT_UG_SIDE_2TRACK_PARAMETERS) and is always
 * editable/overridable before or after instantiation. Elevations are
 * negative-below-street, matching StationGeometryOrigin's own
 * altitudeM=0-at-street convention.
 */
export interface UndergroundSide2TrackParameters {
  platformLengthM: number;
  northboundPlatformWidthM: number;
  southboundPlatformWidthM: number;
  trackCenterSpacingM: number;
  platformEdgeToTrackCenterM: number;
  platformElevationM: number;
  mezzanineElevationM: number;
  mezzanineLengthM: number;
  mezzanineWidthM: number;
}

/**
 * Generic, explicitly-labeled defaults — plausible round numbers for an
 * underground NYC-scale side-platform station, never derived from any real
 * station's data (Bay Ridge Av's own real values must never leak in here;
 * see stationArchetypeUndergroundSide2Track.ts's own Bay Ridge isolation
 * note). Every one of these ships with `source: "heuristic"` provenance
 * when instantiated — never authority/reference/authored.
 */
export const DEFAULT_UG_SIDE_2TRACK_PARAMETERS: UndergroundSide2TrackParameters = {
  platformLengthM: 150,
  northboundPlatformWidthM: 4,
  southboundPlatformWidthM: 4,
  trackCenterSpacingM: 4,
  platformEdgeToTrackCenterM: 1.5,
  platformElevationM: -10,
  mezzanineElevationM: -5,
  mezzanineLengthM: 30,
  mezzanineWidthM: 15,
};

/** One rejected-parameter finding — see validateUndergroundSide2TrackParameters. */
export interface ParameterValidationIssue {
  field: keyof UndergroundSide2TrackParameters;
  message: string;
}

/** Input to the generic train-consist clearance check — see validateTrainConsistClearance. */
export interface TrainConsistClearanceInput {
  usablePlatformLengthM: number;
  trainConsistLengthM: number;
  stoppingMarginM: number;
}

export interface TrainConsistClearanceResult {
  ok: boolean;
  requiredLengthM: number;
  marginRemainingM: number;
  issues: string[];
}

// ── UG_SIDE_4TRACK ───────────────────────────────────────────────────────────
// 0909_WOS_Subway_Underground_Side_Platform_4Track_Archetype_v1.0.0
//
// Same "reusable editable starting model, not geographic truth" doctrine as
// UG_SIDE_2TRACK above — a genuinely separate archetype (2 side platforms,
// but 4 physical tracks: an outer platform-serving LOCAL pair and an inner
// bypass EXPRESS pair), never UG_SIDE_2TRACK-plus-two-anonymous-tracks. The
// explicit TrackRole type (stationGeometryTypes.ts) is what makes the
// distinction real rather than a naming convention.
export const UG_SIDE_4TRACK_ARCHETYPE_KEY = "UG_SIDE_4TRACK";
export const UG_SIDE_4TRACK_ARCHETYPE_ID: StationArchetypeId = makeStationArchetypeId(UG_SIDE_4TRACK_ARCHETYPE_KEY);

/**
 * Compact parameter set for UG_SIDE_4TRACK. Independent control over every
 * spacing the spec called out — none of these are derived from one another.
 * Elevations follow the same negative-below-street convention as
 * UG_SIDE_2TRACK.
 */
export interface UndergroundSide4TrackParameters {
  platformLengthM: number;
  northboundPlatformWidthM: number;
  southboundPlatformWidthM: number;
  /** Outer platform edge to the ADJACENT LOCAL track's own centerline. */
  outerPlatformEdgeToLocalTrackCenterM: number;
  /** Spacing between a side's local track centerline and its own express track centerline. */
  localToExpressSpacingM: number;
  /** Spacing between the two inner express track centerlines (northbound express <-> southbound express). */
  expressPairSpacingM: number;
  platformElevationM: number;
  mezzanineElevationM: number;
  mezzanineLengthM: number;
  mezzanineWidthM: number;
}

/** Generic, explicitly-labeled defaults — never derived from any real station's data. */
export const DEFAULT_UG_SIDE_4TRACK_PARAMETERS: UndergroundSide4TrackParameters = {
  platformLengthM: 150,
  northboundPlatformWidthM: 4,
  southboundPlatformWidthM: 4,
  outerPlatformEdgeToLocalTrackCenterM: 1.5,
  localToExpressSpacingM: 4,
  expressPairSpacingM: 4,
  platformElevationM: -10,
  mezzanineElevationM: -5,
  mezzanineLengthM: 30,
  mezzanineWidthM: 15,
};

/** One rejected-parameter finding — see validateUndergroundSide4TrackParameters. Deliberately a separate type from ParameterValidationIssue above (different field union) rather than a shared generic, to avoid touching UG_SIDE_2TRACK's own type. */
export interface FourTrackParameterValidationIssue {
  field: keyof UndergroundSide4TrackParameters;
  message: string;
}

// ── UG_ISLAND_2TRACK ─────────────────────────────────────────────────────────
// STATION-06 (0912_WOS_Subway_Station_Base_Truth_Extension_v1.0.0)
//
// Same "reusable editable starting model, not geographic truth" doctrine as
// UG_SIDE_2TRACK/UG_SIDE_4TRACK above — a genuinely separate archetype: ONE
// island platform flanked by two tracks, one on each of the platform's two
// edges (see stationGeometryTypes.ts's own PlatformSide doc for what "A"/"B"
// means — structural, never a direction). This is the first archetype whose
// StationPlatform.config is "island" rather than "side" (see
// stationArchetypeUndergroundSide2Track.ts/Side4Track.ts, both hardcode
// "side" — STATION-05's own recon confirmed no island archetype existed
// before this checkpoint).
//
// Parameterization is deliberately NOT a mirror of UG_SIDE_2TRACK's
// trackCenterSpacingM-first shape: a side station's tracks sit BETWEEN the
// two platforms (tracks are the given, platforms build outward), while an
// island station's ONE platform sits BETWEEN its two tracks (the platform
// is the given, tracks build outward from its two edges) — a real physical
// difference, not an arbitrary renaming.
export const UG_ISLAND_2TRACK_ARCHETYPE_KEY = "UG_ISLAND_2TRACK";
export const UG_ISLAND_2TRACK_ARCHETYPE_ID: StationArchetypeId = makeStationArchetypeId(UG_ISLAND_2TRACK_ARCHETYPE_KEY);

/**
 * Compact parameter set for UG_ISLAND_2TRACK. Elevations follow the same
 * negative-below-street convention as the other two archetypes.
 */
export interface UndergroundIsland2TrackParameters {
  platformLengthM: number;
  /** The one island platform's own width — there is only one platform, so (unlike UG_SIDE_2TRACK) there is no northbound/southbound pair of widths to keep independent. */
  platformWidthM: number;
  /** Gap from EACH of the platform's two edges to its own adjacent track's centerline — applied symmetrically to both sides. */
  platformEdgeToTrackCenterM: number;
  platformElevationM: number;
  mezzanineElevationM: number;
  mezzanineLengthM: number;
  mezzanineWidthM: number;
}

/** Generic, explicitly-labeled defaults — never derived from any real station's data. Platform width defaults wider than a side platform's own default (4m) since an island platform typically serves passengers boarding/alighting from both edges. */
export const DEFAULT_UG_ISLAND_2TRACK_PARAMETERS: UndergroundIsland2TrackParameters = {
  platformLengthM: 150,
  platformWidthM: 8,
  platformEdgeToTrackCenterM: 1.5,
  platformElevationM: -10,
  mezzanineElevationM: -5,
  mezzanineLengthM: 30,
  mezzanineWidthM: 15,
};

/** One rejected-parameter finding — see validateUndergroundIsland2TrackParameters. A separate type from the other two issue types (different field union), same convention. */
export interface IslandParameterValidationIssue {
  field: keyof UndergroundIsland2TrackParameters;
  message: string;
}
