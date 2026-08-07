// ── raceLaneReadiness.ts — reason-coded "is this lane usable?" gate ──────────
// 0805D_MAPS_Race_Lane_Profiles_and_Smooth_Course_Sampling, corrected 0805F
//
// Mirrors raceCourseReadiness.ts's accumulate-EVERY-applicable-reason shape
// exactly — never short-circuits to a generic failure. `source_discontinuous`
// is a HARD BLOCKER (required correction from plan review): a lane whose
// source course is discontinuous is never `ready`, full stop, even though a
// lane should structurally never exist for such a source in the first place
// (raceLaneStore.ts's createRaceLane()/regenerateRaceLane() refuse before
// generation is attempted) — this function still reports it honestly if a
// source course is later broken by some future edit path, or a lane is
// inspected in isolation from its store.
//
// REQUIRED CORRECTION (0805F): readiness splits into `presentationReady`
// (can this lane be shown/published at all?) and `runtimeReady`
// (additionally, is it fit for a future race runtime?). Two reasons are
// physical-corridor/future-racer concerns, not presentation blockers:
// `offset_intersection` and `start_grid_invalid`. Every other reason blocks
// BOTH — a lane that can't even be shown correctly certainly isn't fit to
// race on either. `runtimeReady` always implies `presentationReady`, never
// the inverse. `ready` stays an alias of `runtimeReady` for every existing
// caller that means the strict, full bar.

import type { RaceCourse } from "../../data/raceCourseTypes";
import type {
  RaceLane, RaceLaneReadinessReason, RaceLaneReadinessDiagnostics, RaceLaneReadinessSnapshot,
} from "../../data/raceLaneTypes";
import { detectOffsetIntersections } from "./raceLaneSampling";

const RUNTIME_ONLY_REASONS: RaceLaneReadinessReason[] = ["offset_intersection", "start_grid_invalid"];

// A fingerprint of the source course's own GEOMETRIC truth — the fields a
// lane's smoothed centerline actually depends on. Deliberately excludes
// name/status/targetDurationMinutes/active, which can legitimately change
// without invalidating an already-generated lane. Race Courses are immutable
// today (0805C), so this practically never mismatches yet — it exists so a
// future course-editing path can't silently invalidate a lane without this
// catching it.
export function computeSourceCourseFingerprint(course: RaceCourse): string {
  return JSON.stringify([
    course.id,
    course.geometry.coordinates,
    course.totalDistanceMeters,
    course.checkpoints.map((c) => [c.id, c.distanceMeters]),
    course.sections.map((s) => [s.id, s.startDistanceMeters, s.endDistanceMeters]),
    course.continuity,
  ]);
}

function isFiniteCoordinate(c: unknown): c is [number, number] {
  return Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
}

export function computeRaceLaneReadiness(lane: RaceLane, sourceCourse: RaceCourse | null): RaceLaneReadinessSnapshot {
  const reasons: RaceLaneReadinessReason[] = [];

  if (!sourceCourse) {
    reasons.push("missing_source_course");
  } else {
    if (sourceCourse.status === "needs_review") reasons.push("source_course_not_ready");
    if (!sourceCourse.continuity.continuous) reasons.push("source_discontinuous");
    if (computeSourceCourseFingerprint(sourceCourse) !== lane.sourceCourseFingerprint) {
      reasons.push("source_course_changed");
    }
  }

  const centerline = lane.sampledCenterline;
  if (!Array.isArray(centerline) || centerline.length === 0) {
    reasons.push("missing_centerline");
  } else if (centerline.length < 2) {
    reasons.push("too_few_samples");
  } else if (!centerline.every((s) => isFiniteCoordinate(s.center) && Number.isFinite(s.distanceMeters))) {
    reasons.push("invalid_sample");
  }

  if (centerline.length >= 2 && !(lane.totalDistanceMeters > 0)) {
    reasons.push("zero_distance");
  }
  if (centerline.length >= 2 && !centerline.every((s) => Number.isFinite(s.headingDeg))) {
    reasons.push("heading_invalid");
  }

  const intersections = centerline.length >= 2
    ? detectOffsetIntersections(lane)
    : { offsetIntersectionCount: 0, sharpestTurnRadiusMeters: null, intersectingSampleIndices: [] as number[] };
  if (intersections.offsetIntersectionCount > 0) reasons.push("offset_intersection");

  const startGridOk =
    !!lane.startGrid &&
    lane.startGrid.slots.length === lane.startGrid.rows * lane.laneCount &&
    lane.startGrid.slots.every((s) => isFiniteCoordinate(s.coordinate) && Number.isFinite(s.headingDeg));
  if (!startGridOk) reasons.push("start_grid_invalid");

  const finishPlaneOk =
    !!lane.finishPlane && isFiniteCoordinate(lane.finishPlane.coordinate) && lane.finishPlane.widthMeters > 0;
  if (!finishPlaneOk) reasons.push("finish_plane_invalid");

  const spacings: number[] = [];
  for (let i = 1; i < centerline.length; i++) spacings.push(centerline[i].distanceMeters - centerline[i - 1].distanceMeters);
  const meanSpacing = spacings.length > 0 ? spacings.reduce((a, b) => a + b, 0) / spacings.length : 0;
  const maxSpacing = spacings.length > 0 ? Math.max(...spacings) : 0;

  const diagnostics: RaceLaneReadinessDiagnostics = {
    sourceDistanceMeters: sourceCourse?.totalDistanceMeters ?? 0,
    sampledDistanceMeters: lane.totalDistanceMeters,
    distanceDeltaMeters: (sourceCourse?.totalDistanceMeters ?? 0) - lane.totalDistanceMeters,
    sampleCount: centerline.length,
    meanSampleSpacingMeters: meanSpacing,
    maxSampleSpacingMeters: maxSpacing,
    laneCount: lane.laneCount,
    totalLaneWidthMeters: lane.laneCount * lane.laneWidthMeters,
    sharpestTurnRadiusMeters: intersections.sharpestTurnRadiusMeters,
    offsetIntersectionCount: intersections.offsetIntersectionCount,
  };

  const presentationReady = reasons.every((r) => RUNTIME_ONLY_REASONS.includes(r));
  const runtimeReady = reasons.length === 0;

  return { ready: runtimeReady, presentationReady, runtimeReady, reasons, diagnostics };
}
