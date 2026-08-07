// ── Race Course data model ────────────────────────────────────────────────────
// 0805C_MAPS_Race_Course_Library_and_Itinerary_Conversion
//
// A Race Course is a canonical, IMMUTABLE competitive path converted from a
// saved Itinerary — a value snapshot, never a live reference. The source
// Itinerary and the Race Course are related but not interchangeable: an
// Itinerary is ordered destinations + selected route stages; a Race Course is
// one shared path every future racer will use. Editing the source itinerary
// after conversion never mutates the course (see sourceFingerprint below);
// editing the course never mutates the itinerary.
//
// This build establishes course truth only — no marbles, racers, physics,
// ranking, camera rigs, events, or wall/-side race runtime.

export type RaceCourseStatus = "ready" | "needs_review" | "archived";

// Mapbox Directions geometry is stored to ~6 decimal degrees (~0.1m at NYC
// latitude); a real itinerary's stage boundary is the SAME geocoded stop
// resolved twice (once as stage N's destination, once as stage N+1's
// origin), so any sub-meter difference between them is floating-point/
// precision noise, not a real gap. 1 meter sits comfortably above that noise
// floor and comfortably below "a real, humanly-noticeable gap" (a genuinely
// missed connector is tens to hundreds of meters at minimum).
export const RACE_COURSE_CONTINUITY_TOLERANCE_METERS = 1;

export interface RaceCourseMarker {
  id: string;
  label: string;
  distanceMeters: number;
  progress01: number;
  coordinate: [number, number];
}

export interface RaceCheckpoint extends RaceCourseMarker {
  sourceStopId?: string;
  sourceStopIndex?: number;
}

export interface RaceSection {
  id: string;
  name: string;
  startDistanceMeters: number;
  endDistanceMeters: number;
  startProgress01: number;
  endProgress01: number;
}

export interface RaceCourseDiscontinuity {
  afterStageIndex: number;
  gapMeters: number;
  previousEnd: [number, number];
  nextStart: [number, number];
}

export interface RaceCourseContinuity {
  continuous: boolean;
  discontinuities: RaceCourseDiscontinuity[];
}

// `active` is part of every consumer's read contract, but it is NEVER
// independently persisted as part of a course record — raceCourseStorage.ts
// strips/ignores whatever value is on the object being saved. The true value
// is always derived at read time by comparing a course's id against the
// single canonical activeRaceCourseId pointer (raceCourseStorage.ts's `meta`
// object store) — "at most one active course" is a structural property of
// the persistence layer, not a convention every caller must maintain.
export interface RaceCourse {
  id: string;
  name: string;
  description?: string;

  sourceItineraryId: string | null;
  sourceItineraryName: string | null;
  sourceFingerprint: string | null;

  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };

  totalDistanceMeters: number;
  startLine: RaceCourseMarker;
  finishLine: RaceCourseMarker;
  checkpoints: RaceCheckpoint[];
  sections: RaceSection[];

  continuity: RaceCourseContinuity;
  targetDurationMinutes: number | null;

  // Count of source stages whose selected route could not be resolved during
  // conversion (geometry for that stage was simply omitted, never
  // fabricated). Stored ON the course itself so computeRaceCourseReadiness()
  // stays a pure, single-argument function of the course alone — no side
  // channel needed to report the missing_source_route reason.
  missingRouteStageCount: number;

  active: boolean;
  status: RaceCourseStatus;

  createdAt: number;
  updatedAt: number;
}

export const RACE_COURSE_TARGET_DURATION_MIN_MINUTES = 1;
export const RACE_COURSE_TARGET_DURATION_MAX_MINUTES = 600;
