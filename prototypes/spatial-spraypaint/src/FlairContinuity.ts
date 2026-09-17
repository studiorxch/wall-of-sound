import { applyFlairOutputToPoint } from "./FlairCurves";
import { type FlairModeId } from "./ToolTaxonomy";
import { type StrokePoint } from "./types";

/**
 * Flair Continuity fix — a renderer-continuity problem, not a curve-tuning
 * one (see the build brief). Root cause: `SprayBrushEngine.renderSegment`
 * sizes an entire segment's core/mist deposition from its END point's
 * resolved `width`/`opacity` alone (see `resolveSprayDynamics(cap,
 * point.velocity, point.width)`) — it does not draw a gradient ALONG one
 * segment. That is invisible for every normal stroke, because width/opacity
 * only ever drift slowly from velocity. Flair changes `width` (via
 * `baseRadius`) and `opacity` (via the output multiplier) by MUCH larger
 * amounts, and `CanonicalStrokeManager`'s own arclength resampling
 * (`resolveInterpolationSpacing`) spaces sub-points FURTHER apart exactly
 * when `baseRadius` is large (Flair's own extended-range territory) — so
 * consecutive deposited segments can land with visibly different flat
 * widths/opacities, reading as stitched capsule sections instead of one
 * continuously tapering sprayed gesture.
 *
 * Fix: for Track Marks with an active (non-off) Flair mode ONLY, densify —
 * resample the segment from the previous rendered point to the new one at a
 * small FIXED arclength step (independent of `baseRadius`, so it stays
 * dense even at Wild's extended sizes), linearly interpolating every field
 * including width/opacity. Consecutive endpoint-to-endpoint width/opacity
 * deltas shrink until the per-segment "flat value" artifact is imperceptible
 * — no change to `SprayBrushEngine`'s technique, geometry, or any other
 * cap's code path; the exact same stochastic/dab deposition just runs over
 * many more, much shorter segments. This does not reduce Flair's range —
 * the final point in the resampled run is always the true target value.
 */
const TRACK_MARKS_FLAIR_RESAMPLE_STEP_WALL_UNITS = 1.2;
const TRACK_MARKS_FLAIR_MIN_RESAMPLE_STEPS = 4;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Pure: linearly resamples every field (x/y/z/timestamp/velocity/width/opacity) from `previous` to `target` at a small fixed arclength step. `previous === null` (a stroke's very first point) returns just `[target]`, matching every other cap's existing start-of-stroke behavior. */
export function resampleTrackMarksFlairSegment(previous: StrokePoint | null, target: StrokePoint): StrokePoint[] {
  if (!previous) return [target];
  const dx = target.x - previous.x;
  const dy = target.y - previous.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return [target];
  const steps = Math.max(
    TRACK_MARKS_FLAIR_MIN_RESAMPLE_STEPS,
    Math.ceil(dist / TRACK_MARKS_FLAIR_RESAMPLE_STEP_WALL_UNITS),
  );
  const previousZ = previous.z ?? 0;
  const targetZ = target.z ?? 0;
  const result: StrokePoint[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    result.push({
      x: lerp(previous.x, target.x, t),
      y: lerp(previous.y, target.y, t),
      z: lerp(previousZ, targetZ, t),
      timestamp: lerp(previous.timestamp, target.timestamp, t),
      velocity: lerp(previous.velocity, target.velocity, t),
      width: lerp(previous.width, target.width, t),
      opacity: lerp(previous.opacity, target.opacity, t),
    });
  }
  return result;
}

/**
 * The Flair Continuity fix's single call site from `main.ts`. Applies the
 * existing output multiplier first (`applyFlairOutputToPoint`, unchanged),
 * then — ONLY for Track Marks with an active Flair mode — replaces the
 * batch's `segmentEnds` with the dense continuity resample above, ramping
 * from the previous RENDERED point (already carrying the correct prior
 * Flair-adjusted width/opacity, since `main.ts` always passes its own
 * `segmentStart` chain here, not `CanonicalStrokeManager`'s raw internal
 * one) to this batch's true final target. Every other cap, and Track Marks
 * with Flair off, gets back `segmentEnds` with the output multiplier
 * applied and otherwise byte-identical to before this fix (`.map` over an
 * identity function preserves every value, only wraps a fresh array).
 */
export function buildContinuousSegmentEnds(
  previous: StrokePoint | null,
  segmentEnds: readonly StrokePoint[],
  capId: string,
  mode: FlairModeId,
  outputMultiplier: number,
): StrokePoint[] {
  const applied = segmentEnds.map((point) => applyFlairOutputToPoint(point, capId, mode, outputMultiplier));
  if (capId !== "track-marks" || mode === "off" || applied.length === 0) return applied;
  return resampleTrackMarksFlairSegment(previous, applied[applied.length - 1]);
}
