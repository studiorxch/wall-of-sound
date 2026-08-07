// ── raceCourseConversion.ts — pure Itinerary → Race Course conversion ────────
// 0805C_MAPS_Race_Course_Library_and_Itinerary_Conversion
//
// buildRaceCourseFromItinerary() is pure and synchronous — it reads the
// itinerary as a value snapshot and never mutates it, never issues a
// Directions request, and never rewrites/regenerates stored route
// coordinates. Every marker (start/finish/checkpoints/sections) is placed
// from ONE cumulative-distance walk computed once during flattening, never
// re-derived independently in more than one place — this is what guarantees
// total distance, checkpoint distances, and section boundaries can never
// numerically disagree with each other.
//
// Status assignment (required correction from plan review): the full
// candidate course is built FIRST, then computeRaceCourseReadiness() runs
// against it, and `status` is assigned from THAT result — continuity is only
// one of readiness's many checks, never a standalone proxy for the whole
// status. This happens right here, inside this module, not left to a caller
// that could forget — "one canonical schema and validation path" means the
// conversion function itself is the only place status is ever decided.

import type { Itinerary, ItineraryStage, Route } from "../../data/itineraryTypes";
import { resolveSelectedRoute } from "./itineraryRunReadiness";
import type {
  RaceCourse, RaceCheckpoint, RaceSection, RaceCourseDiscontinuity,
} from "../../data/raceCourseTypes";
import { RACE_COURSE_CONTINUITY_TOLERANCE_METERS } from "../../data/raceCourseTypes";
import { computeRaceCourseReadiness } from "./raceCourseReadiness";

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

// Same formula as wall/systems/runtime/itineraryRouteSampler.js's proven
// haversineM (R=6371000) — re-expressed in TS for the MUSIC side, not a new
// geometry algorithm.
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function isValidGeometry(route: Route | undefined): route is Route {
  if (!route) return false;
  const coords = route.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  return coords.every((c) => Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]));
}

// Deterministic, JSON-array-based (never object-key-order-dependent) — built
// directly from exactly the inputs the spec lists: itinerary id, stop order,
// stage ids, selected route ids, route geometry, distances, durations. No
// crypto/hash function needed — itineraries are small, so embedding the
// actual coordinate arrays directly is simple and unambiguous.
function computeSourceFingerprint(
  itinerary: Itinerary,
  sortedStages: ItineraryStage[],
  stageRoutes: (Route | undefined)[],
): string {
  const payload = [
    itinerary.id,
    itinerary.stops.map((s) => s.id),
    sortedStages.map((s, i) => [
      s.id,
      s.selectedRouteId,
      stageRoutes[i]?.id ?? null,
      stageRoutes[i]?.distanceMeters ?? null,
      stageRoutes[i]?.durationSeconds ?? null,
      stageRoutes[i]?.geometry.coordinates ?? null,
    ]),
  ];
  return JSON.stringify(payload);
}

export interface RaceCourseConversionResult {
  course: RaceCourse;
  // Stage indices (into the sorted stage order) whose selected route could
  // not be resolved — surfaced so computeRaceCourseReadiness() can report
  // missing_source_route without re-deriving this from scratch.
  missingRouteStageIndices: number[];
}

export function buildRaceCourseFromItinerary(itinerary: Itinerary, name?: string): RaceCourseConversionResult {
  const sortedStages = itinerary.stages.slice().sort((a, b) => a.order - b.order);
  const stageRoutes: (Route | undefined)[] = sortedStages.map((s) => resolveSelectedRoute(itinerary, s));
  const missingRouteStageIndices: number[] = [];

  const flatCoords: [number, number][] = [];
  const stageEndCumDistance: number[] = new Array(sortedStages.length).fill(0);
  const stageEndCoordinate: ([number, number] | null)[] = new Array(sortedStages.length).fill(null);
  const discontinuities: RaceCourseDiscontinuity[] = [];

  let cumDistance = 0;
  let lastValidStageIndex = -1;
  let lastCoord: [number, number] | null = null;

  for (let i = 0; i < sortedStages.length; i++) {
    const route = stageRoutes[i];
    if (!isValidGeometry(route)) {
      missingRouteStageIndices.push(i);
      stageEndCumDistance[i] = cumDistance;
      stageEndCoordinate[i] = lastCoord;
      continue;
    }
    const coords = route.geometry.coordinates;

    let startIdx = 0;
    if (lastCoord) {
      const gap = haversineMeters(lastCoord, coords[0]);
      if (gap <= RACE_COURSE_CONTINUITY_TOLERANCE_METERS) {
        startIdx = 1; // exact/near-exact boundary — dedupe, don't push a second near-identical point
      } else {
        discontinuities.push({
          afterStageIndex: lastValidStageIndex,
          gapMeters: gap,
          previousEnd: lastCoord,
          nextStart: coords[0],
        });
      }
    }

    for (let j = startIdx; j < coords.length; j++) {
      const c = coords[j];
      if (flatCoords.length > 0) {
        cumDistance += haversineMeters(flatCoords[flatCoords.length - 1], c);
      }
      flatCoords.push(c);
    }

    lastCoord = coords[coords.length - 1];
    lastValidStageIndex = i;
    stageEndCumDistance[i] = cumDistance;
    stageEndCoordinate[i] = lastCoord;
  }

  const totalDistanceMeters = cumDistance;
  const progress01 = (d: number) => (totalDistanceMeters > 0 ? d / totalDistanceMeters : 0);

  const startCoordinate = flatCoords[0] ?? [0, 0];
  const finishCoordinate = flatCoords[flatCoords.length - 1] ?? startCoordinate;

  const startLine = {
    id: genId("start"),
    label: "Start",
    distanceMeters: 0,
    progress01: 0,
    coordinate: startCoordinate,
  };
  const finishLine = {
    id: genId("finish"),
    label: "Finish",
    distanceMeters: totalDistanceMeters,
    progress01: 1,
    coordinate: finishCoordinate,
  };

  // One checkpoint per INTERIOR stage boundary — every stage's end EXCEPT the
  // very last (whose end is the course's own finish, not a checkpoint).
  const checkpoints: RaceCheckpoint[] = [];
  for (let i = 0; i < sortedStages.length - 1; i++) {
    const stage = sortedStages[i];
    const destStop = itinerary.stops.find((s) => s.id === stage.destinationStopId);
    const coordinate = stageEndCoordinate[i] ?? finishCoordinate;
    checkpoints.push({
      id: genId("checkpoint"),
      label: destStop?.name ?? `Checkpoint ${i + 1}`,
      distanceMeters: stageEndCumDistance[i],
      progress01: progress01(stageEndCumDistance[i]),
      coordinate,
      sourceStopId: stage.destinationStopId,
      sourceStopIndex: destStop ? itinerary.stops.indexOf(destStop) : undefined,
    });
  }

  // One section per source stage — boundaries come from the SAME cumulative-
  // distance array as checkpoints, guaranteeing full 0→total coverage with no
  // gap/overlap by construction, not a separate validation pass.
  const sections: RaceSection[] = sortedStages.map((stage, i) => {
    const startDistanceMeters = i === 0 ? 0 : stageEndCumDistance[i - 1];
    const endDistanceMeters = stageEndCumDistance[i];
    const originStop = itinerary.stops.find((s) => s.id === stage.originStopId);
    const destStop = itinerary.stops.find((s) => s.id === stage.destinationStopId);
    return {
      id: genId("section"),
      name: `${originStop?.name ?? "?"} → ${destStop?.name ?? "?"}`,
      startDistanceMeters,
      endDistanceMeters,
      startProgress01: progress01(startDistanceMeters),
      endProgress01: progress01(endDistanceMeters),
    };
  });

  const continuity = {
    continuous: discontinuities.length === 0,
    discontinuities,
  };

  const sourceFingerprint = computeSourceFingerprint(itinerary, sortedStages, stageRoutes);

  const now = Date.now();
  // Build the full candidate first with a placeholder status — readiness
  // needs the complete course object (geometry/checkpoints/sections/
  // continuity/missingRouteStageCount all populated) to evaluate correctly.
  const candidate: RaceCourse = {
    id: genId("race"),
    name: name?.trim() || `${itinerary.title} Course`,
    sourceItineraryId: itinerary.id,
    sourceItineraryName: itinerary.title,
    sourceFingerprint,
    geometry: { type: "LineString", coordinates: flatCoords },
    totalDistanceMeters,
    startLine,
    finishLine,
    checkpoints,
    sections,
    continuity,
    targetDurationMinutes: null,
    missingRouteStageCount: missingRouteStageIndices.length,
    // Display default only — never authoritative. raceCourseStorage.ts never
    // persists this value; the canonical activeRaceCourseId pointer is the
    // only real source of truth, and a brand-new course is never active by
    // construction (nothing points to it yet).
    active: false,
    status: "needs_review", // overwritten immediately below from full readiness
    createdAt: now,
    updatedAt: now,
  };

  // Required correction: status reflects FULL readiness, not continuity
  // alone. A missing route or a checkpoint/section defect must force
  // needs_review even if the geometry that DID resolve happens to be
  // physically continuous.
  const readiness = computeRaceCourseReadiness(candidate);
  const course: RaceCourse = { ...candidate, status: readiness.ready ? "ready" : "needs_review" };

  return { course, missingRouteStageIndices };
}
