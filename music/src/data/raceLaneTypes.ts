// ── Race Lane data model ──────────────────────────────────────────────────────
// 0805D_MAPS_Race_Lane_Profiles_and_Smooth_Course_Sampling
//
// A Race Lane is a DERIVED CHILD of a Race Course — a smooth, multi-lane,
// uniformly-sampled racing surface generated from the course's immutable
// centerline. It never rewrites RaceCourse.geometry/distance/checkpoints/
// sections/start/finish. A course must be `status: 'ready'` AND
// `continuity.continuous === true` before a lane can be created — a
// discontinuous or not-ready source is refused outright, never spliced or
// silently bridged (see raceLaneGeneration.ts / raceLaneReadiness.ts).
//
// This build establishes lane geometry + a pure sampling API only — no
// marbles, racers, physics, ranking, camera rigs, or wall/-side race runtime.

export type RaceLanePreviewMode = "invisible" | "guide" | "track";

export interface RaceLaneSmoothingConfig {
  method: "catmull_rom";
  sampleSpacingMeters: number;
  tension: number;
  cornerProtectionMeters: number;
}

export interface RaceLaneSample {
  index: number;
  distanceMeters: number;
  progress01: number;
  center: [number, number];
  headingDeg: number;
  tangentEast: number;
  tangentNorth: number;
  normalEast: number;
  normalNorth: number;
}

export interface RaceGridSlot {
  id: string;
  row: number;
  laneIndex: number;
  coordinate: [number, number];
  headingDeg: number;
}

export interface RaceStartGrid {
  distanceMeters: number;
  rows: number;
  rowSpacingMeters: number;
  slots: RaceGridSlot[];
}

export interface RaceFinishPlane {
  distanceMeters: number;
  coordinate: [number, number];
  headingDeg: number;
  widthMeters: number;
}

export type RaceLaneReadinessReason =
  | "missing_source_course"
  | "source_course_not_ready"
  | "source_course_changed"
  | "source_discontinuous"
  | "missing_centerline"
  | "too_few_samples"
  | "zero_distance"
  | "invalid_sample"
  | "heading_invalid"
  | "offset_intersection"
  | "start_grid_invalid"
  | "finish_plane_invalid";

export interface RaceLaneReadinessDiagnostics {
  sourceDistanceMeters: number;
  sampledDistanceMeters: number;
  distanceDeltaMeters: number;
  sampleCount: number;
  meanSampleSpacingMeters: number;
  maxSampleSpacingMeters: number;
  laneCount: number;
  totalLaneWidthMeters: number;
  sharpestTurnRadiusMeters: number | null;
  offsetIntersectionCount: number;
}

export interface RaceLaneReadinessSnapshot {
  // Alias of runtimeReady — preserved for backward compatibility with every
  // existing caller that treats "ready" as the strict, full bar (a future
  // Start Race–style gate should keep reading `ready`/`runtimeReady`
  // interchangeably). New callers deciding whether the lane can be
  // PUBLISHED for RACETRACK's cached presentation should read
  // `presentationReady` instead — see raceLaneReadiness.ts's required
  // correction (0805F).
  ready: boolean;
  // Valid continuous Race Course, nonzero route, valid start/finish/
  // centerline, no malformed coordinates, valid source fingerprint — the
  // bar for showing/publishing this lane, NOT for future racer/physics
  // execution.
  presentationReady: boolean;
  // presentationReady AND no physical-corridor/racer concerns (offset
  // intersections, an invalid start grid) — the bar for a future race
  // runtime, never required just to preview or publish a Course Package.
  runtimeReady: boolean;
  reasons: RaceLaneReadinessReason[];
  diagnostics: RaceLaneReadinessDiagnostics;
}

export interface RaceLane {
  id: string;
  name: string;

  sourceRaceCourseId: string;
  sourceRaceCourseName: string;
  sourceCourseFingerprint: string;

  laneCount: number;
  laneWidthMeters: number;
  centerlineSmoothing: RaceLaneSmoothingConfig;

  // Full-resolution deterministic sampling authority — the ONE stored
  // representation of this lane's centerline. Never decimated, never
  // trimmed for display; editor preview decimates a SEPARATE, disposable
  // array at render time (raceLanePreviewGeometry.ts) and never writes back
  // here.
  sampledCenterline: RaceLaneSample[];
  totalDistanceMeters: number;

  startGrid: RaceStartGrid;
  finishPlane: RaceFinishPlane;

  previewMode: RaceLanePreviewMode;
  surfaceClearanceMeters: number;

  readiness: RaceLaneReadinessSnapshot;

  createdAt: number;
  updatedAt: number;
}

export interface RaceLanePose {
  distanceMeters: number;
  progress01: number;
  centerCoordinate: [number, number];
  coordinate: [number, number];
  headingDeg: number;
  laneIndex: number;
  lateralOffsetMeters: number;
  altitudeMeters: number;
}

export const RACE_LANE_DEFAULTS: {
  laneCount: number;
  laneWidthMeters: number;
  sampleSpacingMeters: number;
  tension: number;
  cornerProtectionMeters: number;
  surfaceClearanceMeters: number;
  previewMode: RaceLanePreviewMode;
} = {
  laneCount: 4,
  laneWidthMeters: 3,
  sampleSpacingMeters: 2,
  tension: 0.5,
  cornerProtectionMeters: 8,
  surfaceClearanceMeters: 1,
  previewMode: "guide",
};

export const RACE_LANE_MIN_LANE_COUNT = 1;
export const RACE_LANE_MAX_LANE_COUNT = 12;
export const RACE_LANE_START_GRID_ROWS = 3;
export const RACE_LANE_START_GRID_ROW_SPACING_METERS = 6;
