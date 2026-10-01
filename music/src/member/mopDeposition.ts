/**
 * V3: Mop's "wet, broadly-applied" character, as a small, pure, fully
 * deterministic function of a stroke's own recorded path -- no extra
 * capture (pointer pressure/velocity/timestamps) and no persisted fields
 * beyond the same `{x, y}` points every other stroke Mark already stores.
 *
 * Rendered strokes (Pencil/Pen/Marker) draw ONE continuous polyline at a
 * fixed width. Mop draws that same continuous polyline (so a fast drag
 * never leaves a gap -- path continuity is guaranteed) and then layers a
 * series of round "dabs" on top, one per recorded point, whose radius
 * responds to how closely spaced the recorded points are.
 *
 * Pointer events fire at a roughly constant rate, so the spacing between
 * consecutively recorded points is already a free, deterministic proxy for
 * how slowly the pointer was moving at that instant -- closer points (slow
 * movement / dwelling) read as more material pushed through the applicator
 * (bigger dab); farther-apart points (fast movement) read as a thinner
 * pass. This needs no velocity/timestamp capture and replays byte-identical
 * from Firestore-persisted points, live or on reload.
 *
 * This is deliberately NOT a physics/fluid model -- it is a bounded,
 * one-pass geometric transform of already-authored points into a render
 * plan. See the module doc below for the drip seam this stops short of.
 */

import { simplifyPathToBudget } from "./pathSimplify";
import { MOP_DRIP_TUNING, resolveMaterialDripPlans, type DripPlan } from "./dripDeposition";

export interface MopPoint {
  readonly x: number;
  readonly y: number;
}

export interface MopEmissionPoint extends MopPoint {
  /** >1 in slow/dwelled sections, <1 in fast sections -- derived from the ORIGINAL recorded points' spacing (the same free, deterministic speed proxy the aerosol engine's `resolveSprayEmissionPoints` uses), then carried onto every interpolated point resampled from that same original segment. */
  readonly densityFactor: number;
}

export interface MopDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Multiplies the mark's own opacity for this dab -- individually translucent so overlapping dabs (within one stroke, or across repeated passes on the same material layer) visibly accumulate rather than instantly reaching full coverage. */
  readonly alphaScale: number;
}

const NEUTRAL_SPACING_RATIO = 0.6;
const MIN_SPEED_FACTOR = 0.7;
const MAX_SPEED_FACTOR = 1.25;
const SPEED_RESPONSE = 0.35;
export const MOP_DAB_ALPHA_SCALE = 0.5;

/**
 * Calibration V1 Revision 3: `resolveMopDabPlan` used to place exactly one
 * dab per RAW recorded point, with no interpolation. That worked fine when
 * pointer samples happened to land close together, but a normal fast/broad
 * gesture (routine on a large Map viewport) records points spaced well
 * apart -- with no resampling, the dabs stopped overlapping and read as a
 * chain of separate circles instead of a continuous wet body ("the user can
 * clearly see the Mop as a repeated pattern of circular dabs"). This bound
 * is the same fix Spray's `resolveSprayEmissionPoints` already has: no two
 * consecutive dab centers can ever be further apart than
 * `baseRadius * MOP_MIN_STEP_RATIO` -- comfortably under one dab radius, so
 * neighboring dabs always overlap regardless of how sparse the ORIGINAL
 * recorded points were. Bounded by `MOP_MAX_EMISSION_POINTS` so an
 * arbitrarily long stroke still produces a bounded dab count.
 */
const MOP_MIN_STEP_RATIO = 0.45;
export const MOP_MAX_EMISSION_POINTS = 260;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resamples the authored path into a bounded, overlap-guaranteed list of
 * emission points -- see the Revision 3 doc above. Mirrors
 * `resolveSprayEmissionPoints`'s shape (bounded max-step interpolation +
 * a density factor derived from the ORIGINAL point spacing) so the two
 * materials share the same proven resampling principle without importing
 * one material's module into the other's.
 */
export function resolveMopEmissionPoints(
  points: readonly MopPoint[],
  baseRadius: number,
): readonly MopEmissionPoint[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  const nominalStep = Math.max(1e-6, baseRadius * MOP_MIN_STEP_RATIO);
  const neutralSpacing = Math.max(1e-6, baseRadius * NEUTRAL_SPACING_RATIO);
  const densityAt = (spacing: number): number =>
    clamp(1 + (1 - spacing / neutralSpacing) * SPEED_RESPONSE, MIN_SPEED_FACTOR, MAX_SPEED_FACTOR);

  if (points.length === 1) return [{ ...points[0], densityFactor: densityAt(0) }];

  // Revision 4: adaptive step, same fix as resolveSprayEmissionPoints --
  // a fixed step size on a long real gesture needed more steps than
  // MOP_MAX_EMISSION_POINTS allowed, and the old early-return silently
  // dropped the rest of the path from rendering. Measure total length
  // first and widen the step (never narrower than nominal) so the whole
  // path always fits within budget; short strokes are unaffected.
  const budget = Math.max(1, MOP_MAX_EMISSION_POINTS - 1);
  // Revision 8: if raw point count alone could already overflow the
  // budget (every segment emits >=1 point below regardless of step --
  // see pathSimplify.ts's doc for the "collapses to a straight line" bug
  // this fixes), simplify the raw points first via Douglas-Peucker.
  const source = points.length - 1 > budget ? simplifyPathToBudget(points, budget + 1) : points;
  let totalLength = 0;
  for (let index = 1; index < source.length; index += 1) {
    totalLength += Math.hypot(source[index].x - source[index - 1].x, source[index].y - source[index - 1].y);
  }
  const maxStep = Math.max(nominalStep, totalLength / budget);

  const emissions: MopEmissionPoint[] = [{ ...source[0], densityFactor: densityAt(0) }];
  for (let index = 1; index < source.length; index += 1) {
    const start = source[index - 1];
    const end = source[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const density = densityAt(segmentLength);
    const steps = Math.max(1, Math.ceil(segmentLength / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      emissions.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, densityFactor: density });
    }
  }
  // Revision 8: geometry-aware simplification, not an index slice +
  // forced endpoint jump -- see sprayDeposition.ts's identical fix (and
  // pathSimplify.ts's module doc) for why the old version reproduced the
  // straight-line-collapse bug at this second (post-interpolation) layer
  // even after the raw points were correctly pre-simplified.
  if (emissions.length > MOP_MAX_EMISSION_POINTS) {
    return simplifyPathToBudget(emissions, MOP_MAX_EMISSION_POINTS);
  }
  return emissions;
}

/**
 * `points` and `baseRadius` must be in the same coordinate space (both
 * normalized 0-1, or both already scaled to canvas pixels) -- the function
 * itself is coordinate-system agnostic, which is what keeps it reusable for
 * a future non-Blackbook Surface without redesign. Internally resamples via
 * `resolveMopEmissionPoints` before resolving one dab per emission point
 * (Revision 3) -- the RETURNED dab count generally exceeds the recorded
 * point count now; each dab's speed-response radius comes from the
 * ORIGINAL segment's density factor, not the (now much more even)
 * resampled spacing.
 */
export function resolveMopDabPlan(
  points: readonly MopPoint[],
  baseRadius: number,
): readonly MopDab[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  return resolveMopEmissionPoints(points, baseRadius).map((emission) => ({
    x: emission.x,
    y: emission.y,
    radius: baseRadius * emission.densityFactor,
    alphaScale: MOP_DAB_ALPHA_SCALE,
  }));
}

/**
 * BLACKBOOK Deterministic Drips β0.1 -- completes the FUTURE DRIP SEAM this
 * doc block used to describe as not-yet-built. All three points that seam
 * anticipated are implemented exactly as sketched: the "local load" scalar
 * is `dripDeposition.ts`'s bounded trailing-window sum over this module's
 * own `densityFactor` (no new signal, no physics, no cross-stroke state);
 * the drip's geometry is the first-class `LocalMaterialDripMark`
 * (`{ originMarkId, geometry.points, targetMaterialId: "mop" }`,
 * shared/member-identity/src/data/artworkTypes.ts), never a mutation of
 * this stroke's own Mark; and its points are generated ONCE, at authoring
 * time, in blackbookRuntime.ts, then persisted and replayed verbatim --
 * never recomputed by a running loop. `MOP_DRIP_TUNING` (dripDeposition.ts)
 * is what makes Mop accumulate/run more readily than Spray's own
 * `SPRAY_DRIP_TUNING`, each material's own calibration living entirely in
 * that one shared, parameterized engine rather than a second bespoke one.
 */
export function resolveMopDripPlans(points: readonly MopPoint[], baseRadius: number, seed: number): readonly DripPlan[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  const emissions = resolveMopEmissionPoints(points, baseRadius);
  return resolveMaterialDripPlans(emissions, baseRadius, seed, MOP_DRIP_TUNING);
}
