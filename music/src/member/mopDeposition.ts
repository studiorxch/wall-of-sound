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
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalLength += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  const budget = Math.max(1, MOP_MAX_EMISSION_POINTS - 1);
  const maxStep = Math.max(nominalStep, totalLength / budget);

  const emissions: MopEmissionPoint[] = [{ ...points[0], densityFactor: densityAt(0) }];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const density = densityAt(segmentLength);
    const steps = Math.max(1, Math.ceil(segmentLength / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      emissions.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, densityFactor: density });
    }
  }
  if (emissions.length > MOP_MAX_EMISSION_POINTS) {
    const trimmed = emissions.slice(0, MOP_MAX_EMISSION_POINTS);
    trimmed[trimmed.length - 1] = emissions[emissions.length - 1];
    return trimmed;
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
 * FUTURE DRIP SEAM (not implemented in V3 -- see Art Supplies V3 brief
 * §5). A convincing drip would need, at minimum:
 *
 * 1. A bounded, deterministic "local load" scalar derived the same way as
 *    `resolveMopDabPlan`'s speedFactor above -- e.g. summing dab radii (or
 *    inverse spacing) within a fixed trailing window of a Mop stroke's own
 *    points, capped at a small constant. No physics, no simulation state
 *    carried between strokes.
 * 2. A drip's geometry would need to be a SEPARATE Mark (the same pattern
 *    `material-erasure` already uses for Eraser: its own authored Mark
 *    type, e.g. `"material-drip"`, carrying `{ originMarkId, points,
 *    targetMaterialId: "mop" }`), not a hidden mutation of the originating
 *    Mop stroke Mark. This keeps Undo, ordering, and replay exactly as
 *    simple as they are for Eraser today.
 * 3. The drip's own points would be generated ONCE, deterministically, at
 *    the moment of authoring (from the local-load scalar above plus the
 *    stroke's own endpoint and gravity direction) and then persisted like
 *    any other Mark's points -- never recomputed by a running physics loop
 *    on every render.
 *
 * This is intentionally not built here: a convincing gravity-driven drip
 * needs real visual tuning (see the much larger Spatial Spraypaint
 * prototype's DripLogic.ts for how many iterations that took even in an
 * isolated sandbox), and forcing it into Blackbook's simple per-material
 * canvas-layer renderer in this pass would either produce an unconvincing
 * result or pull in that larger subsystem wholesale -- both explicitly
 * out of scope for V3.
 */
