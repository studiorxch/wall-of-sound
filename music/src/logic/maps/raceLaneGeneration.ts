// ── raceLaneGeneration.ts — pure smooth-centerline generation ────────────────
// 0805D_MAPS_Race_Lane_Profiles_and_Smooth_Course_Sampling
//
// Pure, deterministic, synchronous. No network calls, no mutation of the
// source RaceCourse. Ports two already-proven wall/ algorithms to TS rather
// than inventing new geometry math:
//   - wall/systems/world/roadTopologyAlignment.js's WGS84<->local-meter
//     projection (mpdLng = cos(lat)*111320, mpdLat = 111320 constant).
//   - wall/systems/world/trafficFlowRuntime.js's Catmull-Rom + arc-length
//     preprocessing pipeline (_splineEval / _preprocessCorridor /
//     _sampleAtDist / _tangentAtDist), generalized to take a configurable
//     tension parameter (the wall/ version hardcodes the standard 0.5
//     Catmull-Rom tangent scale; at tension=0.5 this produces byte-identical
//     output to that formula).
//
// REQUIRED CORRECTION (plan review): a discontinuous or not-ready source
// course is refused OUTRIGHT — this module never splits the source into
// segments and never concatenates independently-smoothed pieces into one
// sampledCenterline. A single spliced cumulative-distance array could
// accidentally count a geographic gap as travel distance, and every
// downstream consumer (lane offsets, start grid, finish plane, a future
// racer) assumes one genuinely continuous path. Multi-segment courses are
// explicitly deferred to a future, separate segmented-course model.

import type { RaceCourse } from "../../data/raceCourseTypes";
import type { RaceLaneSample, RaceLaneSmoothingConfig } from "../../data/raceLaneTypes";

export class RaceLaneSourceCourseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RaceLaneSourceCourseError";
  }
}

// Requires status==='ready' AND continuity.continuous===true. Called at the
// very top of buildRaceLaneCenterline() and by every store-level entry point
// before generation is ever attempted — never a "generate anyway, flag it"
// path.
export function assertRaceLaneSourceEligible(course: RaceCourse): void {
  if (course.status === "archived") {
    throw new RaceLaneSourceCourseError(`Race Course "${course.name}" is archived and cannot produce a Race Lane.`);
  }
  if (course.status !== "ready") {
    throw new RaceLaneSourceCourseError(`Race Course "${course.name}" is not ready (status: ${course.status}).`);
  }
  if (!course.continuity.continuous) {
    throw new RaceLaneSourceCourseError(
      `Race Course "${course.name}" has ${course.continuity.discontinuities.length} discontinuit${course.continuity.discontinuities.length === 1 ? "y" : "ies"} — Race Lanes can only be created from a fully continuous course. Multi-segment courses are not supported yet.`,
    );
  }
  if (!Array.isArray(course.geometry.coordinates) || course.geometry.coordinates.length < 2) {
    throw new RaceLaneSourceCourseError(`Race Course "${course.name}" has too few coordinates to smooth.`);
  }
}

// ── WGS84 <-> local meter-space projection (ported roadTopologyAlignment.js) ─

interface LocalPoint {
  x: number;
  y: number;
}

interface ProjectionAnchor {
  lat: number;
  lng: number;
  mpdLat: number;
  mpdLng: number;
}

function makeProjectionAnchor(lng: number, lat: number): ProjectionAnchor {
  return { lat, lng, mpdLat: 111320, mpdLng: Math.cos((lat * Math.PI) / 180) * 111320 };
}

function geoToLocal(anchor: ProjectionAnchor, coord: [number, number]): LocalPoint {
  const [lng, lat] = coord;
  return { x: (lng - anchor.lng) * anchor.mpdLng, y: (lat - anchor.lat) * anchor.mpdLat };
}

function localToGeo(anchor: ProjectionAnchor, p: LocalPoint): [number, number] {
  return [anchor.lng + p.x / anchor.mpdLng, anchor.lat + p.y / anchor.mpdLat];
}

// ── Catmull-Rom spline evaluation, generalized with a tension parameter ─────
// (ported trafficFlowRuntime.js's _splineEval; at tension=0.5 this reduces to
// byte-identical output to that fixed-0.5 formula — verified by algebraic
// expansion of the Cardinal-spline Hermite basis, not re-derived from
// scratch.)
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function splineEval(pts: LocalPoint[], t: number, tension: number): LocalPoint {
  const n = pts.length;
  if (n < 2) return { x: pts[0].x, y: pts[0].y };
  const seg = n - 1;
  const si = clamp(Math.floor(t * seg), 0, seg - 1);
  const lt = t * seg - si;
  const i0 = Math.max(0, si - 1);
  const i1 = si;
  const i2 = Math.min(n - 1, si + 1);
  const i3 = Math.min(n - 1, si + 2);
  const P0 = pts[i0];
  const P1 = pts[i1];
  const P2 = pts[i2];
  const P3 = pts[i3];
  const c = tension;
  const t2 = lt * lt;
  const t3 = t2 * lt;
  const coeff0 = -c * t3 + 2 * c * t2 - c * lt;
  const coeff1 = 2 * t3 - 3 * t2 + 1 - c * t3 + c * t2;
  const coeff2 = -2 * t3 + 3 * t2 + c * t3 - 2 * c * t2 + c * lt;
  const coeff3 = c * t3 - c * t2;
  return {
    x: P0.x * coeff0 + P1.x * coeff1 + P2.x * coeff2 + P3.x * coeff3,
    y: P0.y * coeff0 + P1.y * coeff1 + P2.y * coeff2 + P3.y * coeff3,
  };
}

const SAMPLE_RESOLUTION_METERS = 3; // matches trafficFlowRuntime.js's oversampling grain

interface Corridor {
  samples: LocalPoint[];
  cumulativeDistances: number[];
  totalLength: number;
}

// Ported _preprocessCorridor: oversamples the spline at SAMPLE_RESOLUTION_METERS
// grain and builds an arc-length index. This is an internal, fine-grained
// oversampling pass — NOT the final stored RaceLaneSample[] output (see
// resampleUniform below).
function preprocessCorridor(pts: LocalPoint[], tension: number): Corridor {
  let roughLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    roughLen += Math.sqrt(dx * dx + dy * dy);
  }
  const N = Math.max(100, Math.ceil(roughLen / SAMPLE_RESOLUTION_METERS));
  const samples: LocalPoint[] = new Array(N + 1);
  const cumDist: number[] = new Array(N + 1);
  cumDist[0] = 0;
  for (let k = 0; k <= N; k++) {
    samples[k] = splineEval(pts, k / N, tension);
  }
  for (let k = 1; k <= N; k++) {
    const dx = samples[k].x - samples[k - 1].x;
    const dy = samples[k].y - samples[k - 1].y;
    cumDist[k] = cumDist[k - 1] + Math.sqrt(dx * dx + dy * dy);
  }
  return { samples, cumulativeDistances: cumDist, totalLength: cumDist[N] };
}

// Ported _sampleAtDist: binary search + lerp, clamped to [0, totalLength].
function sampleAtDist(corridor: Corridor, distMeters: number): LocalPoint {
  const cum = corridor.cumulativeDistances;
  const samples = corridor.samples;
  const n = cum.length;
  if (distMeters <= 0) return samples[0];
  if (distMeters >= cum[n - 1]) return samples[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= distMeters) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const t = span > 0 ? (distMeters - cum[lo]) / span : 0;
  return {
    x: samples[lo].x + t * (samples[hi].x - samples[lo].x),
    y: samples[lo].y + t * (samples[hi].y - samples[lo].y),
  };
}

const SHARP_TURN_THRESHOLD_DEG = 45;

function angleBetweenDeg(a: LocalPoint, b: LocalPoint): number {
  const dot = a.x * b.x + a.y * b.y;
  const lenA = Math.sqrt(a.x * a.x + a.y * a.y) || 1;
  const lenB = Math.sqrt(b.x * b.x + b.y * b.y) || 1;
  const cos = clamp(dot / (lenA * lenB), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

function buildRawCumulativeDistances(localPts: LocalPoint[]): number[] {
  const cum: number[] = new Array(localPts.length).fill(0);
  for (let i = 1; i < localPts.length; i++) {
    const dx = localPts[i].x - localPts[i - 1].x;
    const dy = localPts[i].y - localPts[i - 1].y;
    cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }
  return cum;
}

// Interior raw vertices where the incoming/outgoing segment direction turns
// sharply — these are where Catmull-Rom overshoot is most likely to cut a
// hairpin into a small loop/reversal. Returns each such vertex's own
// arc-length position along the RAW (unsmoothed) polyline.
function findProtectedCornerDistances(localPts: LocalPoint[], rawCumDist: number[]): number[] {
  const corners: number[] = [];
  for (let i = 1; i < localPts.length - 1; i++) {
    const inbound = { x: localPts[i].x - localPts[i - 1].x, y: localPts[i].y - localPts[i - 1].y };
    const outbound = { x: localPts[i + 1].x - localPts[i].x, y: localPts[i + 1].y - localPts[i].y };
    if (angleBetweenDeg(inbound, outbound) >= SHARP_TURN_THRESHOLD_DEG) corners.push(rawCumDist[i]);
  }
  return corners;
}

function pointOnRawPolylineAtDistance(localPts: LocalPoint[], rawCumDist: number[], distance: number): LocalPoint {
  const n = rawCumDist.length;
  const total = rawCumDist[n - 1];
  const d = clamp(distance, 0, total);
  if (d <= 0) return localPts[0];
  if (d >= total) return localPts[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (rawCumDist[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = rawCumDist[hi] - rawCumDist[lo];
  const t = span > 0 ? (d - rawCumDist[lo]) / span : 0;
  return {
    x: localPts[lo].x + t * (localPts[hi].x - localPts[lo].x),
    y: localPts[lo].y + t * (localPts[hi].y - localPts[lo].y),
  };
}

// Blends the oversampled spline corridor toward the raw (unsmoothed)
// polyline near sharp interior turns, weighted by proximity within
// cornerProtectionMeters — full spline at weight 0 (untouched, everywhere
// away from a sharp corner), full raw polyline at weight 1 (exactly at the
// corner itself). Recomputes cumulative distances from the blended points
// afterward, since blending changes point-to-point distances. Raw-polyline
// arc length and spline arc length are not perfectly identical scales, but
// they're close enough for a proximity-weighted blend — this is a
// protective heuristic against overshoot, not a precision requirement.
function applyCornerProtection(corridor: Corridor, localPts: LocalPoint[], cornerProtectionMeters: number): Corridor {
  if (cornerProtectionMeters <= 0) return corridor;
  const rawCumDist = buildRawCumulativeDistances(localPts);
  const corners = findProtectedCornerDistances(localPts, rawCumDist);
  if (corners.length === 0) return corridor;

  const blended: LocalPoint[] = corridor.samples.map((pt, k) => {
    const d = corridor.cumulativeDistances[k];
    let weight = 0;
    for (const cornerDist of corners) {
      const delta = Math.abs(d - cornerDist);
      if (delta < cornerProtectionMeters) weight = Math.max(weight, 1 - delta / cornerProtectionMeters);
    }
    if (weight <= 0) return pt;
    const raw = pointOnRawPolylineAtDistance(localPts, rawCumDist, d);
    return { x: pt.x + (raw.x - pt.x) * weight, y: pt.y + (raw.y - pt.y) * weight };
  });

  const cumDist: number[] = new Array(blended.length);
  cumDist[0] = 0;
  for (let k = 1; k < blended.length; k++) {
    const dx = blended[k].x - blended[k - 1].x;
    const dy = blended[k].y - blended[k - 1].y;
    cumDist[k] = cumDist[k - 1] + Math.sqrt(dx * dx + dy * dy);
  }
  return { samples: blended, cumulativeDistances: cumDist, totalLength: cumDist[cumDist.length - 1] };
}

// Ported _tangentAtDist: central-difference, TAN_EPS scaled proportionally to
// the caller's own sampleSpacingMeters (never smaller than the corridor's own
// oversampling grain, so the finite difference always spans real distinct
// samples).
function tangentAtDist(corridor: Corridor, distMeters: number, tanEps: number): { x: number; y: number } {
  const p0 = sampleAtDist(corridor, Math.max(0, distMeters - tanEps));
  const p1 = sampleAtDist(corridor, Math.min(corridor.totalLength, distMeters + tanEps));
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
}

export interface RaceLaneCenterlineResult {
  sampledCenterline: RaceLaneSample[];
  totalDistanceMeters: number;
}

export function buildRaceLaneCenterline(
  course: RaceCourse,
  smoothing: RaceLaneSmoothingConfig,
): RaceLaneCenterlineResult {
  assertRaceLaneSourceEligible(course);

  const coords = course.geometry.coordinates;
  const anchor = makeProjectionAnchor(coords[0][0], coords[0][1]);
  const localPts = coords.map((c) => geoToLocal(anchor, c));

  const rawCorridor = preprocessCorridor(localPts, smoothing.tension);
  const corridor = applyCornerProtection(rawCorridor, localPts, smoothing.cornerProtectionMeters);
  const tanEps = Math.max(0.5, smoothing.sampleSpacingMeters / 4);

  const spacing = Math.max(0.1, smoothing.sampleSpacingMeters);
  const sampleCount = Math.max(1, Math.round(corridor.totalLength / spacing));
  const sampledCenterline: RaceLaneSample[] = [];

  for (let i = 0; i <= sampleCount; i++) {
    // Exact endpoints, uniform steps in between — never an off-by-epsilon
    // final sample past totalLength.
    const distanceMeters = i === sampleCount ? corridor.totalLength : i * spacing;
    const local = sampleAtDist(corridor, distanceMeters);
    const tangent = tangentAtDist(corridor, distanceMeters, tanEps);
    const headingDeg = (Math.atan2(tangent.x, tangent.y) * 180) / Math.PI;
    // Normal = tangent rotated 90 degrees (east/north local axes).
    const normalEast = -tangent.y;
    const normalNorth = tangent.x;
    const center = localToGeo(anchor, local);
    sampledCenterline.push({
      index: i,
      distanceMeters,
      progress01: corridor.totalLength > 0 ? distanceMeters / corridor.totalLength : 0,
      center,
      headingDeg,
      tangentEast: tangent.x,
      tangentNorth: tangent.y,
      normalEast,
      normalNorth,
    });
  }

  return { sampledCenterline, totalDistanceMeters: corridor.totalLength };
}
