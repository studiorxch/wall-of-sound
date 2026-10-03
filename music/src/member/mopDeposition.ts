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
  /**
   * MOP/SPRAY POINTER-UP WYSIWYG V1 -- a unit vector perpendicular to the
   * ORIGINATING SEGMENT's own direction (the two authored points this
   * emission was interpolated between, or the gesture's first segment for
   * the very first emission) -- computed once, here, purely from that
   * segment's own two endpoints. This is what `strokeMop` reads for a
   * dab's lateral-scatter DIRECTION instead of looking at neighboring
   * DABS by array index: a segment's own direction never changes once
   * that segment has been walked (the same append/prefix-stability
   * `densityFactor` already has), so this stays correct whether it was
   * resolved as part of a tiny live-preview window or the complete
   * gesture -- the prior design's actual defect (recon: "tangent
   * calculation uses prev/next by local array index, so window
   * boundaries change the tangent/perpendicular of otherwise identical
   * dabs"). (0, 0) only for a true single-point gesture with no segment
   * yet -- degenerate, and never actually painted (`strokeMop` requires
   * at least 2 points to draw anything).
   */
  readonly perpX: number;
  readonly perpY: number;
}

/**
 * MOP/SPRAY POINTER-UP WYSIWYG V1 -- a dab is "dot-like" (no lateral
 * scatter, no probabilistic skip -- see `strokeMop`) when it's among the
 * first `MOP_DOT_LIKE_DAB_THRESHOLD` dabs EVER produced for its own
 * gesture, by stable ordinal position from the gesture's start -- never
 * by the size of whatever array/window happened to produce it. This is
 * what makes the classification `recon`-correct: "a gesture beginning as
 * a possible dot does not cause already-visible stroke content to be
 * retroactively reclassified when it becomes a longer stroke" -- an
 * early dab's own ordinal (its position counting from the gesture's very
 * first dab) can never change once assigned, since dabs are always
 * produced in order and only ever appended, never reordered or
 * recomputed in place (the same guarantee `resolveMopEmissionPoints`
 * already has for `x`/`y`/`densityFactor`). A gesture that starts small
 * and grows long will have its first few dabs stay dot-like forever,
 * while every dab from the 4th onward is never dot-like, regardless of
 * how many more points eventually arrive -- a deliberate, disclosed
 * refinement of the previous "all-or-nothing, whole-array-length-gated"
 * behavior, which was incompatible with append-stability by construction.
 */
export const MOP_DOT_LIKE_DAB_THRESHOLD = 3;

export interface MopDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Multiplies the mark's own opacity for this dab -- individually translucent so overlapping dabs (within one stroke, or across repeated passes on the same material layer) visibly accumulate rather than instantly reaching full coverage. */
  readonly alphaScale: number;
  /** See `MopEmissionPoint.perpX`/`perpY` -- carried through unchanged. */
  readonly perpX: number;
  readonly perpY: number;
  /** See `MOP_DOT_LIKE_DAB_THRESHOLD`'s own doc. */
  readonly isDotLike: boolean;
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

/** MOP/SPRAY POINTER-UP WYSIWYG V1 -- a unit vector perpendicular to the segment `start -> end`, degenerating to (0, 0) only for a zero-length segment (never actually reached by a real two-distinct-point segment). See `MopEmissionPoint.perpX`'s own doc. */
function perpendicularOf(start: MopPoint, end: MopPoint): { readonly perpX: number; readonly perpY: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-9) return { perpX: 0, perpY: 0 };
  return { perpX: -dy / length, perpY: dx / length };
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

  if (points.length === 1) return [{ ...points[0], densityFactor: densityAt(0), perpX: 0, perpY: 0 }];

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

  // MOP/SPRAY POINTER-UP WYSIWYG V1 -- the very first emission (source[0]
  // itself) has no segment of its own yet; it borrows the FIRST real
  // segment's perpendicular (source[0] -> source[1], guaranteed to exist
  // since source.length >= 2 on this branch) -- permanently fixed the
  // instant it's computed, exactly like every other emission's own perp.
  const firstSegmentPerp = perpendicularOf(source[0], source[1]);
  const emissions: MopEmissionPoint[] = [{ ...source[0], densityFactor: densityAt(0), perpX: firstSegmentPerp.perpX, perpY: firstSegmentPerp.perpY }];
  for (let index = 1; index < source.length; index += 1) {
    const start = source[index - 1];
    const end = source[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const density = densityAt(segmentLength);
    const { perpX, perpY } = perpendicularOf(start, end);
    const steps = Math.max(1, Math.ceil(segmentLength / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      emissions.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, densityFactor: density, perpX, perpY });
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
 *
 * MOP/SPRAY POINTER-UP WYSIWYG V1 -- `dabOrdinalOffset` (default 0, which
 * reproduces today's exact single-call behavior for every existing caller
 * -- canonical bake, reload, every pre-existing test) is how many dabs
 * were already stably produced for this SAME gesture before the first dab
 * in THIS `points` array. A caller resolving a live-preview WINDOW (a
 * slice of a growing gesture, not the complete points-so-far) passes the
 * running count it has tracked across earlier windows, so each dab's own
 * `isDotLike` ordinal (`dabOrdinalOffset + index`) matches exactly what a
 * single call over the complete gesture would assign that SAME dab --
 * never merely "is this a short array," which is what made the previous
 * design's classification depend on window size instead of the dab's own
 * stable position in the gesture.
 */
export function resolveMopDabPlan(
  points: readonly MopPoint[],
  baseRadius: number,
  dabOrdinalOffset = 0,
): readonly MopDab[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  return resolveMopEmissionPoints(points, baseRadius).map((emission, index) => ({
    x: emission.x,
    y: emission.y,
    radius: baseRadius * emission.densityFactor,
    alphaScale: MOP_DAB_ALPHA_SCALE,
    perpX: emission.perpX,
    perpY: emission.perpY,
    isDotLike: dabOrdinalOffset + index < MOP_DOT_LIKE_DAB_THRESHOLD,
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
