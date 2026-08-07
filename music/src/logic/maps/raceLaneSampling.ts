// ── raceLaneSampling.ts — pure lane-pose sampling API ────────────────────────
// 0805D_MAPS_Race_Lane_Profiles_and_Smooth_Course_Sampling
//
// sampleRaceLaneByDistance()/sampleRaceLaneByProgress() are pure, exposed for
// future racer use: no mutation of `lane`, deterministic (identical input ->
// identical output on repeat calls), clamped safely at the ends, exact at
// boundaries, shortest-arc heading interpolation between bracketing samples,
// using the SAMPLED normal vector for lane offsets (never re-derived
// independently). Always operate over the full-resolution
// lane.sampledCenterline — the editor preview's decimated array
// (raceLanePreviewGeometry.ts) is a completely separate, disposable
// rendering artifact that never enters this API.

import type { RaceLane, RaceLaneSample, RaceLanePose, RaceStartGrid, RaceGridSlot, RaceFinishPlane } from "../../data/raceLaneTypes";
import { RACE_LANE_START_GRID_ROWS, RACE_LANE_START_GRID_ROW_SPACING_METERS } from "../../data/raceLaneTypes";

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function shortestArcLerpDeg(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  const result = a + diff * t;
  return ((result % 360) + 360) % 360;
}

// Standard symmetric-fan formula: deterministic for odd (middle lane offset
// exactly 0) and even (no lane sits exactly on the centerline) counts, with
// no special-casing needed for either parity.
export function laneOffsetMeters(laneIndex: number, laneCount: number, laneWidthMeters: number): number {
  return (laneIndex - (laneCount - 1) / 2) * laneWidthMeters;
}

// Same "cos(lat)*111320" local east/north meter-per-degree formula already
// canonical in this codebase (roadTopologyAlignment.js / raceLaneGeneration.ts)
// — re-anchored at the point being offset itself, since normalEast/North are
// unit vectors and this offset is always small relative to earth curvature.
export function offsetCoordinateMeters(
  center: [number, number],
  unitEast: number,
  unitNorth: number,
  offsetMeters: number,
): [number, number] {
  if (offsetMeters === 0) return center;
  const [lng, lat] = center;
  const mpdLat = 111320;
  const mpdLng = Math.cos((lat * Math.PI) / 180) * 111320;
  return [lng + (unitEast * offsetMeters) / mpdLng, lat + (unitNorth * offsetMeters) / mpdLat];
}

function findBracket(centerline: RaceLaneSample[], distanceMeters: number): [RaceLaneSample, RaceLaneSample, number] {
  const n = centerline.length;
  const minD = centerline[0].distanceMeters;
  const maxD = centerline[n - 1].distanceMeters;
  const d = clamp(distanceMeters, minD, maxD);
  if (n === 1) return [centerline[0], centerline[0], 0];
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (centerline[mid].distanceMeters <= d) lo = mid;
    else hi = mid;
  }
  const span = centerline[hi].distanceMeters - centerline[lo].distanceMeters;
  const t = span > 0 ? (d - centerline[lo].distanceMeters) / span : 0;
  return [centerline[lo], centerline[hi], t];
}

export function sampleRaceLaneByDistance(lane: RaceLane, distanceMeters: number, laneIndex?: number): RaceLanePose {
  const centerline = lane.sampledCenterline;
  const [s0, s1, t] = findBracket(centerline, distanceMeters);
  const dClamped = clamp(distanceMeters, 0, lane.totalDistanceMeters);

  const centerCoordinate: [number, number] = [
    lerp(s0.center[0], s1.center[0], t),
    lerp(s0.center[1], s1.center[1], t),
  ];
  const headingDeg = shortestArcLerpDeg(s0.headingDeg, s1.headingDeg, t);
  const normalEast = lerp(s0.normalEast, s1.normalEast, t);
  const normalNorth = lerp(s0.normalNorth, s1.normalNorth, t);

  const idx = laneIndex ?? Math.floor((lane.laneCount - 1) / 2);
  const lateralOffsetMeters = laneOffsetMeters(idx, lane.laneCount, lane.laneWidthMeters);
  const coordinate = offsetCoordinateMeters(centerCoordinate, normalEast, normalNorth, lateralOffsetMeters);

  return {
    distanceMeters: dClamped,
    progress01: lane.totalDistanceMeters > 0 ? dClamped / lane.totalDistanceMeters : 0,
    centerCoordinate,
    coordinate,
    headingDeg,
    laneIndex: idx,
    lateralOffsetMeters,
    altitudeMeters: lane.surfaceClearanceMeters,
  };
}

export function sampleRaceLaneByProgress(lane: RaceLane, progress01: number, laneIndex?: number): RaceLanePose {
  return sampleRaceLaneByDistance(lane, clamp(progress01, 0, 1) * lane.totalDistanceMeters, laneIndex);
}

// ── Offset-intersection detection ────────────────────────────────────────────
// At a sharp enough turn, parallel lane offsets can cross each other before
// the corner exits — detected here from the local turn radius implied by
// consecutive samples' heading change, never silently producing a
// self-crossing lane polygon.

export interface OffsetIntersectionReport {
  offsetIntersectionCount: number;
  sharpestTurnRadiusMeters: number | null;
  intersectingSampleIndices: number[];
}

export function detectOffsetIntersections(
  lane: Pick<RaceLane, "sampledCenterline" | "laneCount" | "laneWidthMeters">,
): OffsetIntersectionReport {
  const centerline = lane.sampledCenterline;
  const outerA = Math.abs(laneOffsetMeters(0, lane.laneCount, lane.laneWidthMeters));
  const outerB = Math.abs(laneOffsetMeters(lane.laneCount - 1, lane.laneCount, lane.laneWidthMeters));
  const maxAbsOffset = Math.max(outerA, outerB);

  let sharpest: number | null = null;
  const intersecting: number[] = [];
  for (let i = 1; i < centerline.length - 1; i++) {
    const prev = centerline[i - 1];
    const next = centerline[i + 1];
    const ds = (next.distanceMeters - prev.distanceMeters) / 2 || 1e-6;
    let dTheta = next.headingDeg - prev.headingDeg;
    while (dTheta > 180) dTheta -= 360;
    while (dTheta < -180) dTheta += 360;
    const dThetaRad = Math.abs((dTheta * Math.PI) / 180);
    if (dThetaRad < 1e-9) continue;
    const radius = ds / dThetaRad;
    if (sharpest === null || radius < sharpest) sharpest = radius;
    if (maxAbsOffset > radius) intersecting.push(i);
  }
  return { offsetIntersectionCount: intersecting.length, sharpestTurnRadiusMeters: sharpest, intersectingSampleIndices: intersecting };
}

// ── Start grid & finish plane ────────────────────────────────────────────────
// Both are pure functions of the already-sampled centerline — no new
// geometry fetch, and generation here never mutates the lane's own distance
// figures.

export function buildStartGrid(
  lane: Pick<RaceLane, "sampledCenterline" | "laneCount" | "laneWidthMeters">,
  rows: number = RACE_LANE_START_GRID_ROWS,
  rowSpacingMeters: number = RACE_LANE_START_GRID_ROW_SPACING_METERS,
): RaceStartGrid {
  const start = lane.sampledCenterline[0];
  const slots: RaceGridSlot[] = [];
  for (let row = 0; row < rows; row++) {
    // Row 0 sits exactly at the start sample. Rows 1..N-1 are offset
    // BACKWARD along the start sample's own tangent by a straight LINEAR
    // extrapolation (never a spline extrapolation past the course's own
    // start, which would violate "anchored to course start") — slots remain
    // behind or at the start plane, never beyond it.
    const backDistance = row * rowSpacingMeters;
    const rowCenter = offsetCoordinateMeters(start.center, -start.tangentEast, -start.tangentNorth, backDistance);
    for (let laneIndex = 0; laneIndex < lane.laneCount; laneIndex++) {
      const lateral = laneOffsetMeters(laneIndex, lane.laneCount, lane.laneWidthMeters);
      const coordinate = offsetCoordinateMeters(rowCenter, start.normalEast, start.normalNorth, lateral);
      slots.push({ id: `row-${row}-lane-${laneIndex}`, row, laneIndex, coordinate, headingDeg: start.headingDeg });
    }
  }
  return { distanceMeters: start.distanceMeters, rows, rowSpacingMeters, slots };
}

export function buildFinishPlane(
  lane: Pick<RaceLane, "sampledCenterline" | "laneCount" | "laneWidthMeters" | "totalDistanceMeters">,
): RaceFinishPlane {
  const finish = lane.sampledCenterline[lane.sampledCenterline.length - 1];
  return {
    distanceMeters: lane.totalDistanceMeters,
    coordinate: finish.center,
    headingDeg: finish.headingDeg,
    widthMeters: lane.laneCount * lane.laneWidthMeters,
  };
}
