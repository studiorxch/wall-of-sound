// ── raceCourseReadiness.ts — reason-coded "can this course be activated?" ────
// 0805C_MAPS_Race_Course_Library_and_Itinerary_Conversion
//
// Mirrors itineraryRunReadiness.ts's computeRunReadiness() shape exactly:
// accumulate EVERY applicable reason, never short-circuit to a generic
// failure. A pure, single-argument function of the course alone — no side
// channel, no re-derivation from the source itinerary — so it stays usable
// both right after conversion (to assign `status`) and later, independently,
// to gate Activate.

import type { RaceCourse } from "../../data/raceCourseTypes";

export type RaceCourseReadinessReason =
  | "missing_geometry"
  | "invalid_coordinate"
  | "too_few_coordinates"
  | "zero_distance"
  | "missing_start"
  | "missing_finish"
  | "checkpoint_out_of_order"
  | "section_overlap"
  | "section_gap"
  | "disconnected_geometry"
  | "missing_source_route";

export interface RaceCourseReadinessResult {
  ready: boolean;
  reasons: RaceCourseReadinessReason[];
}

function isFiniteCoordinate(c: unknown): c is [number, number] {
  return Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
}

export function computeRaceCourseReadiness(course: RaceCourse): RaceCourseReadinessResult {
  const reasons: RaceCourseReadinessReason[] = [];
  const coords = course.geometry?.coordinates ?? [];

  if (coords.length === 0) {
    reasons.push("missing_geometry");
  } else if (coords.length < 2) {
    reasons.push("too_few_coordinates");
  } else if (!coords.every(isFiniteCoordinate)) {
    reasons.push("invalid_coordinate");
  }

  if (coords.length >= 2 && !(course.totalDistanceMeters > 0)) {
    reasons.push("zero_distance");
  }

  if (coords.length === 0 || !isFiniteCoordinate(course.startLine?.coordinate)) {
    reasons.push("missing_start");
  }
  if (coords.length === 0 || !isFiniteCoordinate(course.finishLine?.coordinate)) {
    reasons.push("missing_finish");
  }

  // Checkpoints must be non-decreasing in distance and stay within [0, total].
  let lastCheckpointDistance = -Infinity;
  let checkpointOrderOk = true;
  for (const cp of course.checkpoints) {
    if (cp.distanceMeters < lastCheckpointDistance || cp.distanceMeters < 0 || cp.distanceMeters > course.totalDistanceMeters) {
      checkpointOrderOk = false;
      break;
    }
    lastCheckpointDistance = cp.distanceMeters;
  }
  if (!checkpointOrderOk) reasons.push("checkpoint_out_of_order");

  // Sections must tile [0, totalDistanceMeters] exactly — no overlap, no gap.
  const sections = course.sections.slice().sort((a, b) => a.startDistanceMeters - b.startDistanceMeters);
  let sectionOverlap = false;
  let sectionGap = false;
  if (sections.length === 0) {
    sectionGap = coords.length >= 2; // real geometry but zero sections is a gap, not an overlap
  } else {
    if (sections[0].startDistanceMeters !== 0) sectionGap = true;
    if (sections[sections.length - 1].endDistanceMeters !== course.totalDistanceMeters) sectionGap = true;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].startDistanceMeters > sections[i].endDistanceMeters) { sectionOverlap = true; }
      if (i > 0 && sections[i - 1].endDistanceMeters !== sections[i].startDistanceMeters) {
        if (sections[i - 1].endDistanceMeters > sections[i].startDistanceMeters) sectionOverlap = true;
        else sectionGap = true;
      }
    }
  }
  if (sectionOverlap) reasons.push("section_overlap");
  if (sectionGap) reasons.push("section_gap");

  if (!course.continuity.continuous) reasons.push("disconnected_geometry");
  if (course.missingRouteStageCount > 0) reasons.push("missing_source_route");

  return { ready: reasons.length === 0, reasons };
}
