// ── Station geometry data model ───────────────────────────────────────────────
// 0907_WOS_Subway_Bay_Ridge_Av_Station_Geometry_v1.0.0 — checkpoint 1 of the
// V0 station-geometry system (types + coordinate math + one seeded station
// only; no storage, no editor, no rendering — see the governing recon/
// architecture proposal for the full model and roadmap).
//
// A StationGeometryData record is authored geometry for ONE real subway
// station, expressed in a station-local coordinate frame (see
// logic/maps/stationGeometryCoordinates.ts for the geographic transform).
// This module never duplicates identity/location truth that already lives in
// wall/systems/transit/mtaSubwayStationLibrary.js /
// wall/data/subway/mtaSubwayStaticSnapshot.json — `stationRef` is a pointer
// into that existing authority, never a second copy of station name/lat/lon.
//
// V0 deliberately authors NOTHING beyond the origin/orientation anchor —
// levels/platforms/trackCenterlines/connections/entrances/wallSurfaces are
// declared here for the schema's shape but are empty in the one seeded
// record this checkpoint ships (see stationGeometryBayRidgeAvSeed.ts).
// Platform config, dimensions, stairs, mezzanine, and entrances are real,
// current unknowns per the governing recon's own Known Data Gaps section —
// this file must never let a convenient default read as an established fact.

/**
 * How a value in a StationGeometryData record came to be — see the
 * governing recon's own five-way distinction. Deliberately the ONLY
 * provenance concept this checkpoint introduces (no confidence scoring
 * rubric, no source-registry, no history) — the smallest structure that
 * still lets an important value honestly say where it came from.
 *
 * - "authority": read directly from an existing repository authority
 *   (e.g. the real R42 stop record, or a real derived track bearing).
 * - "reference": derived from a public/reference dataset this app doesn't
 *   already treat as canonical (not used by the V0 Bay Ridge Av seed).
 * - "heuristic": a chosen default/convention, not measured (e.g. treating
 *   street level as altitude 0).
 * - "authored": a human manually placed/typed this value (not used by V0 —
 *   no editor exists yet to author anything with).
 * - "unknown": not yet established; present in the schema, absent in fact.
 */
export type GeometrySource = "authority" | "reference" | "heuristic" | "authored" | "unknown";

/**
 * Provenance for one value or one small group of closely-related values.
 * Every group of authored fields that matters gets its own `Provenance`,
 * never one blanket source for the whole record — see the module header.
 */
export interface Provenance {
  source: GeometrySource;
  /** 0-1, optional — omit rather than fabricate a number that wasn't computed. */
  confidence?: number;
  /** Free-text pointer to where this came from — a file path, dataset name, shapeId, etc. */
  sourceRef?: string;
  note?: string;
}

/** A local-meter point in the station-local frame — see stationGeometryCoordinates.ts. */
export interface LocalPoint2D {
  x: number; // +X = station longitudinal / along-track
  y: number; // +Y = station lateral / cross-track, 90° left of +X (right-handed with +Z up)
}

export interface LocalPoint3D extends LocalPoint2D {
  z: number; // +Z = up
}

/**
 * The one geographic anchor a station's entire local coordinate frame is
 * built from. `orientationDeg` is a real compass bearing (0-360, clockwise
 * from true north) of the station-local +X axis — see
 * stationGeometryCoordinates.ts's own header for the full convention
 * (zero reference, winding, normalization, inverse behavior). Never a
 * "visual rotation" — it is the actual real-world direction the station's
 * platforms/tracks run, derived from real track geometry wherever possible.
 */
export interface StationGeometryOrigin {
  longitude: number;
  latitude: number;
  /** Meters, relative to no particular datum for V0 — a chosen convention (see Provenance), not measured. */
  altitudeM: number;
  orientationDeg: number;
  provenance: Provenance;
}

// ── V0-empty structural arrays — declared for the schema's shape; every one
// of these is genuinely unknown for Bay Ridge Av today (see the governing
// recon's Known Data Gaps). Left as real, typed, empty arrays rather than
// omitted, so a future authoring pass has a place to put data without a
// schema migration. ──────────────────────────────────────────────────────

export type StationLevelKind = "surface" | "entrance" | "mezzanine" | "platform" | "other";

export interface StationLevel {
  id: string;
  kind: StationLevelKind;
  /**
   * Meters relative to origin.altitudeM — negative is below street level.
   * Omit entirely when no measured/sourced elevation exists yet; relative
   * vertical order between levels is instead expressed topologically, by
   * the existence of a StationConnection between them — never fabricate a
   * placeholder number here to imply a measurement that was never taken.
   */
  elevationM?: number;
  label: string;
  provenance: Provenance;
}

export type PlatformConfig = "island" | "side" | "unknown";

export interface StationPlatform {
  id: string;
  levelId: string;
  /**
   * Closed local-meter polygon ring. Omitted (not an empty array) when no
   * physical footprint has been authored yet — an empty array would read as
   * "authored to be degenerate," which is never true; omission is the only
   * honest way to say "not yet authored."
   */
  footprint?: LocalPoint2D[];
  config: PlatformConfig;
  servesRouteIds: string[];
  provenance: Provenance;
}

/**
 * Canonical service role for a physical track, explicit rather than
 * inferred from id naming or from whether platformId is null — a later
 * train-placement/service system needs to branch on this directly (e.g. "is
 * this a bypass track a train never stops at"), and inferring it from a
 * string id would not be a real, typed distinction. Optional and unused by
 * any 2-track station (Bay Ridge Av, 77th Street, UG_SIDE_2TRACK) — exists
 * for 4-track (and later) archetypes where local vs. express is a genuine
 * structural fact, not decoration.
 */
export type TrackRole = "northboundLocal" | "northboundExpress" | "southboundExpress" | "southboundLocal";

// ── TrackPhysicalRole / TrackOperatingDirection ─────────────────────────────
// 0909_WOS_Subway_Service_Pattern_Track_Role_Refinement_v1.0.0
//
// TrackRole (above) bakes operating direction into every value
// ("northboundLocal" etc.) — correct for every real track this repo has
// modeled so far (Bay Ridge Av, 77th St, 53rd St, 45th St, UG_SIDE_4TRACK's
// own archetype), where each physical track really does have one permanent
// direction. It cannot represent a REVERSIBLE track (e.g. the IRT Flushing
// Line's real center express track, whose physical role never changes but
// whose operating direction flips by time of day) without either lying about
// a fixed direction or being left blank — a real gap Corridor Classification
// Batch 02 (Flushing Line) surfaced.
//
// Deliberately NOT a replacement for TrackRole — kept fully additive and
// backward-compatible (TrackRole/role are completely unchanged; every real
// calibrated station and the 4-track archetype keep using them exactly as
// before). This pair exists only for tracks TrackRole's own direction-baked
// values cannot honestly describe.
export type TrackPhysicalRole = "local" | "express" | "reversibleExpress" | "bypass" | "yardLead" | "relay";

/**
 * "reversible" means the track's real physical role never changes but its
 * operating direction flips by time of day/service period (e.g. the
 * Flushing Line's center express track) — this is genuinely different from
 * "none" (no meaningful direction concept applies at all, e.g. a yard lead).
 * Never encodes a specific AM/PM schedule — that is runtime/service-state
 * information, explicitly out of scope here (see this checkpoint's own "do
 * not encode AM/PM schedules" instruction).
 */
export type TrackOperatingDirection = "northbound" | "southbound" | "reversible" | "none";

export interface StationTrackCenterline {
  id: string;
  platformId: string | null;
  /** Canonical service role — see TrackRole. Omitted for stations/archetypes where the distinction doesn't apply (e.g. any 2-track station), OR where the newer physicalRole/operatingDirection pair below is used instead (a reversible track). */
  role?: TrackRole;
  /**
   * The track's own physical role, independent of current operating
   * direction — required only when TrackRole's own direction-baked values
   * can't honestly describe this track (chiefly: a reversible track). Use
   * alongside operatingDirection below; both are omitted for every station
   * that already uses `role` correctly (nothing here changes their meaning).
   */
  physicalRole?: TrackPhysicalRole;
  /** Current/typical operating direction, kept separate so it can change without mutating physicalRole. See TrackOperatingDirection's own doc for what "reversible" vs "none" means. */
  operatingDirection?: TrackOperatingDirection;
  /**
   * Authored/surveyed physical center-of-track points, in station-local
   * meters. Omitted (not an empty array) until real physical geometry is
   * authored — see gtfsShapeRef below for what a track's real-world path is
   * grounded in before that happens.
   */
  localPoints?: LocalPoint2D[];
  /**
   * A pointer into an existing GTFS shape as a STATION ALIGNMENT REFERENCE
   * only — the general real-world path this logical track approximately
   * follows near the station. This is NOT physical track-centerline
   * geometry and NOT evidence of physical track spacing/offset: GTFS
   * publishes one shape per direction of travel, and near a single station
   * two directional shapes commonly digitize the same physical track to
   * the same (or nearly the same) points — see
   * stationGeometryCoordinates.test.ts's own cross-validation checkpoint,
   * which confirmed exactly this for R..N27R vs R..S27R at Bay Ridge Av.
   * Treat this purely as "this logical track's alignment authority," with
   * real authored/surveyed centerline geometry (localPoints, above) always
   * a distinct, later, separately-provenanced step:
   *   GTFS shape geometry -> station alignment authority ->
   *   authored/surveyed physical track centerline (later)
   */
  gtfsShapeRef?: { shapeId: string; fromIdx: number; toIdx: number };
  provenance: Provenance;
}

export type StationConnectionKind = "stairs" | "escalator" | "elevator" | "ramp";

/** Vertical circulation between two levels (see StationPlatformLink for platform-to-platform topology that isn't vertical circulation, e.g. an at-grade crossover). */
export interface StationConnection {
  id: string;
  fromLevelId: string;
  toLevelId: string;
  kind: StationConnectionKind;
  /** Physical path in station-local meters — omitted (not an empty array) until authored. */
  localPath?: LocalPoint2D[];
  /**
   * Which specific platform this connection instance serves, when a
   * connection kind that physically recurs per-platform (e.g. two distinct
   * staircases, one per side) needs one record per platform rather than a
   * single record standing in for both. Omit when a connection genuinely
   * serves both/all platforms undifferentiated (e.g. a single shared
   * elevator). Never implies geometry — see the field survey checklist for
   * what would eventually give a connection its own authored path.
   */
  relatedPlatformId?: string;
  provenance: Provenance;
}

export type StationPlatformLinkKind = "crossover" | "unknown";

/** Coarse, qualitative position along the station — never a substitute for authored coordinates. */
export type StationPlatformLinkPosition = "north" | "south" | "unspecified";

/**
 * A topological relationship between two platforms that is NOT vertical
 * circulation between levels (StationConnection) — e.g. a crossover, which
 * may be realized via the mezzanine, a separate crossunder, or some other
 * mechanism the current evidence doesn't establish. Exists to let "these
 * two platforms are connected, roughly here" be recorded honestly without
 * either forcing it into the level-to-level StationConnection shape it may
 * not actually be, or authoring path geometry that doesn't exist yet.
 */
export interface StationPlatformLink {
  id: string;
  platformIds: [string, string];
  kind: StationPlatformLinkKind;
  approximatePosition: StationPlatformLinkPosition;
  provenance: Provenance;
}

export type EvidenceConflictStatus = "unresolved" | "resolved" | "accepted_discrepancy";

/** One piece of evidence on one side of a conflict — a pointer, not a copy of the source data itself. */
export interface EvidenceConflictRef {
  description: string;
  sourceRef: string;
}

/**
 * Records that two or more evidence sources disagree about the same
 * geometric property — the smallest structure that can say "these sources
 * conflict" without also saying which one is right. Deliberately NOT a
 * general evidence/claims framework: no automatic reconciliation, no
 * weighting/voting logic, no history — just the conflict itself, station-
 * geometry-scoped, sitting alongside the individual records' own Provenance
 * (which is unaffected by this — a conflicted field's provenance still says
 * what IT used, this just also names what it disagrees with).
 */
export interface StationGeometryEvidenceConflict {
  id: string;
  /** Free-text pointer to the disputed field/property — not a strict schema path, e.g. "platforms[northbound/southbound].footprint width". */
  affectedField: string;
  /** Two or more sources that disagree — never auto-resolved by picking one. */
  conflictingEvidence: EvidenceConflictRef[];
  status: EvidenceConflictStatus;
  note?: string;
}

export interface StationEntrance {
  id: string;
  levelId: string;
  localPosition: LocalPoint2D;
  label: string;
  provenance: Provenance;
}

export interface StationWallSurface {
  id: string;
  levelId: string;
  localPolygon: LocalPoint3D[];
  label: string;
  suitableForArt: boolean;
  provenance: Provenance;
}

/**
 * Canonical identity for one station's geometry — deterministic from the
 * real GTFS station-level stop id, never an arbitrary random id.
 * `stationGeometry:<gtfsStopId>` (e.g. "stationGeometry:R42"), matching this
 * codebase's existing colon-namespaced canonical id convention (compare
 * "subway:stop:R42", "subway:route:R"). V0 represents exactly one canonical
 * geometry per station — variants are an explicit future concept, not
 * modeled here.
 */
export type StationGeometryId = `stationGeometry:${string}`;

export function makeStationGeometryId(gtfsStopId: string): StationGeometryId {
  return `stationGeometry:${gtfsStopId}`;
}

/** A pointer into the existing station identity authority — never a duplicate of its truth. */
export interface StationGeometryStationRef {
  /** The real, station-level GTFS stop id (e.g. "R42") — never a platform-level child id like "R42N". */
  gtfsStopId: string;
  /** Real route ids this station serves, e.g. ["R"] — carried for a cheap sanity cross-check only, never authoritative here. */
  routeIds: string[];
}

export interface StationGeometryData {
  id: StationGeometryId;
  stationRef: StationGeometryStationRef;
  /** Schema version for future migration — starts at 1. */
  version: number;
  createdAt: string;
  updatedAt: string;

  origin: StationGeometryOrigin;

  levels: StationLevel[];
  platforms: StationPlatform[];
  trackCenterlines: StationTrackCenterline[];
  connections: StationConnection[];
  /** Platform-to-platform topology that isn't vertical circulation — see StationPlatformLink. */
  platformLinks: StationPlatformLink[];
  /** Known disagreements between evidence sources — see StationGeometryEvidenceConflict. Never auto-resolved. */
  evidenceConflicts: StationGeometryEvidenceConflict[];
  entrances: StationEntrance[];
  wallSurfaces: StationWallSurface[];
}
