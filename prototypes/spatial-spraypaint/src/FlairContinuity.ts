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
// Real Spray Pass build brief, section 2: tightened from 1.2/4 (prior pass)
// -- the reported "still sometimes steps" complaint was traced to these
// still being coarse enough, at a fast drag, to leave a faint facet at
// sharp direction changes. Denser sampling costs more render calls per
// batch but stays well within frame budget at typical stroke lengths.
const TRACK_MARKS_FLAIR_RESAMPLE_STEP_WALL_UNITS = 0.7;
const TRACK_MARKS_FLAIR_MIN_RESAMPLE_STEPS = 6;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cubic smoothstep, `3t²-2t³`: zero derivative at both t=0 and t=1. Flair
 * Stabilization build brief, section A1 — the density fix in this module
 * already removed the segmented/capsule artifact, but a LINEAR ramp within
 * each resampled run still meets the next run's own linear ramp at a sharp
 * angle (a "kink") wherever the target width/opacity itself changes
 * direction (e.g. right at a near→far→near turnaround). Easing width/output
 * specifically (never x/y/z/timestamp/velocity, which must stay physically
 * linear along the actual path) makes every run start and end tangent to
 * flat, so consecutive runs blend instead of kinking — a true taper, not a
 * piecewise one. `smoothstep(0)=0` and `smoothstep(1)=1` exactly, so this
 * never changes the true endpoint values — Flair's full range is preserved.
 */
function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Deterministic pseudo-random 0..1 hash — NOT `Math.random()`, so live
 * painting and replay always draw the exact same "grain" for the exact same
 * path (this codebase's existing per-stroke seeded-random precedent — e.g.
 * `createStrokeRandom` — is for `SprayBrushEngine`'s own particle scatter;
 * this is the same idea at the continuity-resample level, cheap enough not
 * to need threading a seeded generator through this pure module).
 */
function deterministicJitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Real Spray Pass build brief, section 3: "real flares are not only width
 * changes... lighter/more translucent paint as it opens... more aerosol
 * texture/mist... less hard solid fill at the outer flare region." `bloom01`
 * (from `resolveFlairModulationWithParams`, previously computed and
 * discarded — schema-only since it was first introduced) now does two
 * things to a resampled point's OPACITY ONLY (never width — the smooth
 * taper from `smoothstep` stays exactly as continuous as before this
 * change; mist must not reintroduce a geometry artifact):
 *   1. a smooth overall dimming (`1 - bloom01*0.3`) — the flare genuinely
 *      gets more translucent, not just wider;
 *   2. a per-point deterministic grain (`1 - bloom01*0.45*jitter`) — the
 *      "aerosol mist" read, a broken-up translucent bloom rather than a
 *      flat, evenly dimmed tube (the "vector marker" failure mode this
 *      build brief explicitly calls out).
 * Both scale to ZERO at `bloom01 = 0` (a stroke/mode with no bloom response
 * configured renders byte-identical to before this change).
 */
function applyMistToOpacity(baseOpacity: number, bloom01: number, jitterSeed: number): number {
  if (bloom01 <= 0) return baseOpacity;
  const dim = 1 - bloom01 * 0.3;
  const grain = 1 - bloom01 * 0.45 * deterministicJitter(jitterSeed);
  return Math.max(0, baseOpacity * dim * grain);
}

/**
 * Pure: resamples every field from `previous` to `target` at a small fixed
 * arclength step. Position/timestamp/velocity interpolate linearly (the true
 * physical path); width eases via `smoothstep` for a continuous, non-
 * piecewise taper; opacity eases via `smoothstep` THEN receives the mist
 * treatment above, scaled by `bloom01` (0 by default — every call site that
 * doesn't pass it, or passes 0, gets the exact prior smooth-taper-only
 * behavior). `previous === null` (a stroke's very first point) returns just
 * `[target]`, matching every other cap's existing start-of-stroke behavior.
 */
export function resampleTrackMarksFlairSegment(previous: StrokePoint | null, target: StrokePoint, bloom01 = 0): StrokePoint[] {
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
    const eased = smoothstep(t);
    const baseOpacity = lerp(previous.opacity, target.opacity, eased);
    result.push({
      x: lerp(previous.x, target.x, t),
      y: lerp(previous.y, target.y, t),
      z: lerp(previousZ, targetZ, t),
      timestamp: lerp(previous.timestamp, target.timestamp, t),
      velocity: lerp(previous.velocity, target.velocity, t),
      width: lerp(previous.width, target.width, eased),
      opacity: applyMistToOpacity(baseOpacity, bloom01, previous.x * 7.13 + previous.y * 3.71 + i * 1.37),
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
  bloom01 = 0,
): StrokePoint[] {
  const applied = segmentEnds.map((point) => applyFlairOutputToPoint(point, capId, mode, outputMultiplier));
  if (capId !== "track-marks" || mode === "off" || applied.length === 0) return applied;
  return resampleTrackMarksFlairSegment(previous, applied[applied.length - 1], bloom01);
}
