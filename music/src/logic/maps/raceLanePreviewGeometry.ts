// ── raceLanePreviewGeometry.ts — preview-only rendering helpers ──────────────
// 0805D_MAPS_Race_Lane_Profiles_and_Smooth_Course_Sampling
//
// Everything in this module is PRESENTATION-ONLY. Nothing here is persisted
// to a RaceLane record, and nothing here is consumed by
// sampleRaceLaneByDistance()/sampleRaceLaneByProgress() — the full-resolution
// `sampledCenterline` remains the one deterministic race-sampling authority
// (raceLaneSampling.ts). Decimation exists purely because feeding ~11,000
// stored samples (the real 22,588m Broadway Course at 2m spacing) straight
// into the Mapbox preview on every render is wasteful; it must never become
// the future racer's movement authority.

import type { RaceLaneSample } from "../../data/raceLaneTypes";
import { laneOffsetMeters, offsetCoordinateMeters } from "./raceLaneSampling";

export interface PreviewDecimationOptions {
  targetPointCount?: number;
  sharpTurnThresholdDeg?: number;
}

const DEFAULT_TARGET_POINT_COUNT = 500;
const DEFAULT_SHARP_TURN_THRESHOLD_DEG = 8; // per-sample-step heading change

export interface PreviewDecimationResult {
  points: RaceLaneSample[];
  fullSampleCount: number;
  previewPointCount: number;
}

// Preserves the exact first/last sample, preserves every sample where the
// heading turns sharply from one sample to the next (so a real hairpin can
// never be thinned away), and otherwise caps the rendered count via an
// index-adaptive stride over whatever remains — never a naive fixed stride
// over the WHOLE array, which could skip a real sharp turn on an unlucky
// phase. `fullSampleCount`/`previewPointCount` are reported as two distinct
// numbers so a caller never conflates "how much geometry exists" with "how
// much got drawn."
export function decimateForPreview(
  samples: RaceLaneSample[],
  options: PreviewDecimationOptions = {},
): PreviewDecimationResult {
  const n = samples.length;
  if (n === 0) return { points: [], fullSampleCount: 0, previewPointCount: 0 };

  const target = Math.max(2, options.targetPointCount ?? DEFAULT_TARGET_POINT_COUNT);
  if (n <= target) return { points: samples.slice(), fullSampleCount: n, previewPointCount: n };

  const turnThreshold = options.sharpTurnThresholdDeg ?? DEFAULT_SHARP_TURN_THRESHOLD_DEG;
  const mustKeep = new Set<number>([0, n - 1]);
  for (let i = 1; i < n - 1; i++) {
    let delta = samples[i].headingDeg - samples[i - 1].headingDeg;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    if (Math.abs(delta) >= turnThreshold) mustKeep.add(i);
  }

  const remainingBudget = Math.max(0, target - mustKeep.size);
  const strideCandidates: number[] = [];
  for (let i = 0; i < n; i++) if (!mustKeep.has(i)) strideCandidates.push(i);
  if (remainingBudget > 0 && strideCandidates.length > 0) {
    const stride = Math.max(1, Math.floor(strideCandidates.length / remainingBudget));
    for (let k = 0; k < strideCandidates.length; k += stride) mustKeep.add(strideCandidates[k]);
  }

  const indices = Array.from(mustKeep).sort((a, b) => a - b);
  const points = indices.map((i) => samples[i]);
  return { points, fullSampleCount: n, previewPointCount: points.length };
}

// ── Track-mode filled band (required correction from plan review) ───────────
// Rendering only thicker boundary lines was rejected during plan review as
// not honestly matching a mode literally named "track" — this builds a real,
// preview-only translucent polygon between the outer lane boundaries. Point
// order is preserved from the (already decimated) centerline; the ring
// closes back to its own start point; a cheap self-intersection sweep runs
// over the ring's edges before returning it. Never written back to
// RaceLane/RaceCourse geometry.

export interface TrackPolygonResult {
  polygon: { type: "Polygon"; coordinates: [number, number][][] } | null;
  selfIntersects: boolean;
}

function crossProduct(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsProperlyIntersect(
  p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number],
): boolean {
  const d1 = crossProduct(p3, p4, p1);
  const d2 = crossProduct(p3, p4, p2);
  const d3 = crossProduct(p1, p2, p3);
  const d4 = crossProduct(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Adjacent segments share an endpoint (not a self-intersection) and are
// skipped; the first and last segment share the ring's closing vertex and
// are skipped for the same reason.
function ringSelfIntersects(ring: [number, number][]): boolean {
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (i === 0 && j === n - 2) continue;
      if (segmentsProperlyIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

export function buildRaceLaneTrackPolygon(
  decimatedPoints: RaceLaneSample[],
  laneCount: number,
  laneWidthMeters: number,
): TrackPolygonResult {
  if (decimatedPoints.length < 2) return { polygon: null, selfIntersects: false };

  const leftOffset = laneOffsetMeters(0, laneCount, laneWidthMeters) - laneWidthMeters / 2;
  const rightOffset = laneOffsetMeters(laneCount - 1, laneCount, laneWidthMeters) + laneWidthMeters / 2;

  const leftEdge = decimatedPoints.map((s) => offsetCoordinateMeters(s.center, s.normalEast, s.normalNorth, leftOffset));
  const rightEdge = decimatedPoints.map((s) => offsetCoordinateMeters(s.center, s.normalEast, s.normalNorth, rightOffset));

  const ring: [number, number][] = [...leftEdge, ...rightEdge.slice().reverse(), leftEdge[0]];

  if (ringSelfIntersects(ring)) return { polygon: null, selfIntersects: true };
  return { polygon: { type: "Polygon", coordinates: [ring] }, selfIntersects: false };
}
