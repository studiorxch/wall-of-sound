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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * `points` and `baseRadius` must be in the same coordinate space (both
 * normalized 0-1, or both already scaled to canvas pixels) -- the function
 * itself is coordinate-system agnostic, which is what keeps it reusable for
 * a future non-Blackbook Surface without redesign.
 */
export function resolveMopDabPlan(
  points: readonly MopPoint[],
  baseRadius: number,
): readonly MopDab[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  const neutralSpacing = Math.max(1e-6, baseRadius * NEUTRAL_SPACING_RATIO);
  return points.map((point, index) => {
    const prev = points[index - 1] ?? point;
    const next = points[index + 1] ?? point;
    const spacing = (Math.hypot(point.x - prev.x, point.y - prev.y) + Math.hypot(next.x - point.x, next.y - point.y)) / 2;
    const relativeSpacing = spacing / neutralSpacing;
    const speedFactor = clamp(1 + (1 - relativeSpacing) * SPEED_RESPONSE, MIN_SPEED_FACTOR, MAX_SPEED_FACTOR);
    return { x: point.x, y: point.y, radius: baseRadius * speedFactor, alphaScale: MOP_DAB_ALPHA_SCALE };
  });
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
