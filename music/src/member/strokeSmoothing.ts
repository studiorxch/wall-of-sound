/**
 * Map Art Supplies Calibration V1: a small, pure rendering helper shared by
 * every Surface that draws a continuous-line material (Pencil/Pen/Marker/
 * Mop's own background pass) -- never a second per-Surface implementation.
 *
 * Problem: drawing a raw polyline (`moveTo` + `lineTo` per recorded pointer
 * point) makes a fast handwritten gesture look like a crude, angular
 * polygon, because consecutive pointer samples are rarely more than a few
 * pixels apart in a straight line -- every sample becomes a visible kink.
 *
 * Fix: the classic "quadratic midpoint" smoothing technique. Each authored
 * point becomes a quadratic curve's CONTROL point (not its endpoint) --
 * the curve passes through the midpoint of each consecutive pair instead of
 * through the recorded point itself. This removes the polygon kinks while
 * still passing extremely close to every authored point (never further than
 * half the local segment length), so intentional sharp corners and
 * direction changes remain visible -- this is *rendering* smoothing of
 * already-authored points, not a resampling or beautification of the
 * authored geometry itself. The persisted Mark's points are never touched.
 */

import { hashSeed } from "./sprayDeposition";

export interface SmoothablePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Traces the smoothed path into `ctx`'s current path (via `moveTo`/
 * `quadraticCurveTo`) without stroking or setting any style -- the caller
 * sets `strokeStyle`/`lineWidth`/`globalAlpha` and calls `stroke()` exactly
 * as it already did for a raw polyline. A 0- or 1-point path draws nothing;
 * a 2-point path falls back to a single straight `lineTo` (a curve needs at
 * least 3 points to have a midpoint to aim at).
 */
export function traceSmoothedPath(ctx: CanvasRenderingContext2D, points: readonly SmoothablePoint[]): void {
  if (points.length < 2) return;
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    ctx.quadraticCurveTo(current.x, current.y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

/**
 * Builds an `rgba(...)` string from a `#rrggbb` hex color and an alpha in
 * [0, 1] -- used by the Spray renderer to give each particle its own alpha
 * within a radial gradient (two gradient stops need two different alphas at
 * the SAME fill color, which `ctx.globalAlpha` alone cannot express).
 * Falls back to the raw color string unchanged if it isn't `#rrggbb`.
 */
export function withAlpha(hexColor: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hexColor);
  if (!match) return hexColor;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

/**
 * Fills one Spray particle as a soft radial gradient (opaque-ish center
 * fading to fully transparent at its own radius) instead of a flat,
 * hard-edged circle -- the calibration fix for particles reading as
 * individually visible "stamps" rather than blended aerosol coverage. Alpha
 * at the particle's center is `opacity * particle.alpha` (unchanged from
 * the flat-circle version); only the EDGE now fades to zero instead of
 * cutting off sharply.
 */
export function fillSprayParticle(
  ctx: CanvasRenderingContext2D,
  particle: { readonly x: number; readonly y: number; readonly radius: number; readonly alpha: number },
  color: string,
  opacity: number,
): void {
  const centerAlpha = Math.min(1, Math.max(0, opacity * particle.alpha));
  if (centerAlpha <= 0 || particle.radius <= 0) return;
  // Defensive: a non-finite position/radius (e.g. an edge-case reprojected
  // point) throws hard inside createRadialGradient -- skip this one
  // particle/dab rather than aborting the whole render pass.
  if (!isFinite(particle.x) || !isFinite(particle.y) || !isFinite(particle.radius)) return;
  const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.radius);
  gradient.addColorStop(0, withAlpha(color, centerAlpha));
  gradient.addColorStop(0.7, withAlpha(color, centerAlpha * 0.85));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Calibration V1 Revision 11: Mop's dabs used to reuse `fillSprayParticle`
 * wholesale -- its soft aerosol falloff (opaque center fading gradually to
 * zero well before the edge) is correct for Spray but made every Mop
 * contact mark read as a diffuse blurred glow rather than a wet-applicator
 * nib touching the surface, especially visible on a stationary dot where
 * there's no surrounding texture to hide it.
 *
 * OPACITY != EDGE SOFTNESS: `centerAlpha` (from `opacity * dab.alpha`,
 * identical math to `fillSprayParticle`) still controls overall
 * translucency -- a low-opacity Mop pass is genuinely more see-through ink,
 * not a blurrier one. What's different is the gradient's SHAPE: the fill
 * stays at full `centerAlpha` all the way out to 88% of the dab's radius,
 * then falls to zero only in that last thin band -- just enough to
 * anti-alias the boundary (no jagged hard edge), never a soft halo. This
 * keeps a comparatively crisp nib/contact boundary at any opacity, while
 * still not a flat `ctx.arc().fill()` (the earlier "visible stamp" defect
 * this replaced) -- the existing deterministic per-dab jitter/scatter
 * (surfaceDrawingRuntime.js's `_drawMopPoints`, blackbookRuntime.ts's
 * `drawMopStroke`) still provides the organic deposition variation.
 */
export function fillMopDab(
  ctx: CanvasRenderingContext2D,
  dab: { readonly x: number; readonly y: number; readonly radius: number; readonly alpha: number },
  color: string,
  opacity: number,
): void {
  const centerAlpha = Math.min(1, Math.max(0, opacity * dab.alpha));
  if (centerAlpha <= 0 || dab.radius <= 0) return;
  if (!isFinite(dab.x) || !isFinite(dab.y) || !isFinite(dab.radius)) return;
  const gradient = ctx.createRadialGradient(dab.x, dab.y, 0, dab.x, dab.y, dab.radius);
  gradient.addColorStop(0, withAlpha(color, centerAlpha));
  gradient.addColorStop(0.88, withAlpha(color, centerAlpha));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Calibration V1 Revision 5/6: a deterministic pseudo-random value in
 * [0, 1) from a 2D position plus a `salt` -- classic sine-hash, pure
 * function, no seed or external state needed since a dab/point's own
 * position is already stable per authored Mark. `salt` decorrelates
 * multiple independent hashes of the SAME position (e.g. Mop's lateral
 * offset, radius jitter, alpha jitter, and inclusion/skip decision all
 * need their own independent-looking pseudo-random stream from the same
 * (x, y), not the same value reused four times).
 */
export function hash01(x: number, y: number, salt = 0): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * A deterministic pseudo-random unit value in [-1, 1] -- see `hash01`.
 * Used to scatter Mop's texture dabs laterally across the stroke's width
 * instead of stacking them on its centerline (isolating Mop's body-only vs
 * dabs-only render showed the dabs-alone layer was a second visible track
 * running dead-center through the body -- this is what turns them into
 * lateral "grain" instead).
 */
export function hashLateralUnit(x: number, y: number): number {
  return hash01(x, y) * 2 - 1;
}

/**
 * Graphite Pencil V1: a small, pure, fully deterministic rendering treatment
 * that makes Pencil read as dry graphite deposited on paper instead of a
 * lower-opacity Pen line. Two passes over the SAME already-authored points
 * `traceSmoothedPath` already receives -- no new capture, no extra
 * resolution, no persisted particle data:
 *
 * 1. BODY: the same quadratic-smoothed path every clean-line supply already
 *    draws, but at a REDUCED per-pass alpha (`opacity * 0.75`) and a touch
 *    narrower than the authored width -- this is what gives repeated
 *    sketching passes room to visibly darken via ordinary canvas alpha
 *    compositing, instead of one pass already reading as near-solid.
 * 2. GRAIN: a second, thinner pass walked segment-by-segment over the RAW
 *    (unsmoothed) points -- about 30% of segments are skipped and the
 *    surviving ones get a small perpendicular jitter and their own
 *    per-segment alpha, all derived from `hash01`/`hashLateralUnit` seeded
 *    by each segment's own coordinates plus the Mark's own stable
 *    `seedSource` (its `operation.id`/`obj.id`, assigned once and never
 *    reassigned -- the exact same seed source Mop/Spray already use, see
 *    their own "Revision 11" doc). This is what breaks up the line into an
 *    imperfect, slightly broken graphite deposit rather than a mechanically
 *    perfect stroke, WITHOUT drawing per-particle primitives -- the loop
 *    bound is the stroke's own already-recorded point count, never larger.
 *
 * Determinism: every input to `hash01` here is either a persisted point
 * coordinate or the Mark's own stable id -- never `Date.now()`, never
 * `Math.random()`, never anything from the live camera/view. The exact same
 * Mark therefore renders pixel-identical on every redraw, every zoom level,
 * every pan, and after every save/reopen -- camera movement changes only
 * the PROJECTED screen position of these same deterministic passes, never
 * their content.
 */
/**
 * Graphite Grades Foundation V1 -- the smallest typed model that
 * parameterizes exactly the behavior `strokeGraphite` already had, and
 * nothing else. Every field here replaces a constant that was previously
 * hardcoded inline (see the HB profile below, which is byte-identical to
 * Graphite Pencil V1's own former literals) -- no speculative/no-op fields
 * (no smudgeMobility, no eraserResponse, no pressure) were added, since the
 * current renderer has no meaningful use for them yet (see the recon this
 * build follows).
 */
export interface GraphiteProfile {
  /** Body-pass alpha, as a fraction of the authored opacity -- "how much graphite mass a single pass deposits." */
  readonly depositionAlpha: number;
  /** Fraction of grain segments actually drawn (0..1) -- "how continuous/dense the grain is," not merely a skip gimmick. */
  readonly grainDensity: number;
  /** Grain alpha's floor, as a fraction of authored opacity. */
  readonly grainAlphaBase: number;
  /** Grain alpha's additional random range on top of the floor. */
  readonly grainAlphaRange: number;
  /** Lateral grain jitter, as a fraction of authored width -- "how precise vs. rough the edge reads." */
  readonly edgeJitter: number;
}

/**
 * Graphite Grades Foundation V1 -- seven calibration anchors toward the
 * eventual full 9H-9B professional range (see this build's own recon).
 * HB's values are UNCHANGED from Graphite Pencil V1's own hardcoded
 * constants (0.75, 0.68, 0.22, 0.28, 0.14) -- this is the calibration
 * reference every other grade is tuned relative to, not a new value.
 *
 * The H/B progression moves multiple renderer characteristics together
 * (deposition alpha, grain density, grain alpha, edge jitter) rather than
 * a single opacity scalar, per this build's explicit "not merely opacity"
 * requirement -- harder grades read as lighter AND more restrained/precise;
 * softer grades read as darker AND richer/rougher, never just "more faded"
 * or "more solid."
 */
export type GraphiteGradeId = "9h" | "6h" | "3h" | "hb" | "3b" | "6b" | "9b";

export const GRAPHITE_GRADE_ORDER: readonly GraphiteGradeId[] = Object.freeze(["9h", "6h", "3h", "hb", "3b", "6b", "9b"]);

/** All seven anchor profiles share this version -- see strokeInk/strokeGraphite's own module doc on engine vs. profile versioning for why a separate engine-version field isn't needed yet. */
export const GRAPHITE_PROFILE_VERSION = 1;

export const GRAPHITE_PROFILES: Readonly<Record<GraphiteGradeId, GraphiteProfile>> = Object.freeze({
  "9h": Object.freeze({ depositionAlpha: 0.58, grainDensity: 0.48, grainAlphaBase: 0.12, grainAlphaRange: 0.20, edgeJitter: 0.06 }),
  "6h": Object.freeze({ depositionAlpha: 0.637, grainDensity: 0.547, grainAlphaBase: 0.153, grainAlphaRange: 0.227, edgeJitter: 0.087 }),
  "3h": Object.freeze({ depositionAlpha: 0.693, grainDensity: 0.613, grainAlphaBase: 0.187, grainAlphaRange: 0.253, edgeJitter: 0.113 }),
  hb: Object.freeze({ depositionAlpha: 0.75, grainDensity: 0.68, grainAlphaBase: 0.22, grainAlphaRange: 0.28, edgeJitter: 0.14 }),
  "3b": Object.freeze({ depositionAlpha: 0.807, grainDensity: 0.747, grainAlphaBase: 0.253, grainAlphaRange: 0.307, edgeJitter: 0.167 }),
  "6b": Object.freeze({ depositionAlpha: 0.863, grainDensity: 0.813, grainAlphaBase: 0.287, grainAlphaRange: 0.333, edgeJitter: 0.193 }),
  "9b": Object.freeze({ depositionAlpha: 0.92, grainDensity: 0.88, grainAlphaBase: 0.32, grainAlphaRange: 0.36, edgeJitter: 0.22 }),
});

/** Legacy Marks (authored before Graphite Grades Foundation V1, or missing/unknown variantId) always resolve to HB -- Graphite Pencil V1's own exact behavior, never a guess. */
export function resolveGraphiteProfile(variantId: string | null | undefined): GraphiteProfile {
  if (variantId && Object.prototype.hasOwnProperty.call(GRAPHITE_PROFILES, variantId)) {
    return GRAPHITE_PROFILES[variantId as GraphiteGradeId];
  }
  return GRAPHITE_PROFILES.hb;
}

export function strokeGraphite(
  ctx: CanvasRenderingContext2D,
  points: readonly SmoothablePoint[],
  style: { readonly color: string; readonly width: number; readonly opacity: number },
  seedSource: string,
  profile: GraphiteProfile = GRAPHITE_PROFILES.hb,
): void {
  if (points.length < 2) return;
  const seed = (() => {
    let h = 0;
    for (let i = 0; i < seedSource.length; i += 1) h = (h * 31 + seedSource.charCodeAt(i)) | 0;
    return h;
  })();

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = style.color;

  // Pass 1: primary graphite body.
  ctx.beginPath();
  traceSmoothedPath(ctx, points);
  ctx.lineWidth = Math.max(0.5, style.width * 0.92);
  ctx.globalAlpha = style.opacity * profile.depositionAlpha;
  ctx.stroke();

  // Pass 2: grain -- per-segment coverage/jitter, deterministic from the
  // segment's own position and this Mark's own stable seed.
  ctx.lineWidth = Math.max(0.4, style.width * 0.5);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const key = hash01(a.x + seed, a.y + seed, 3);
    if (key > profile.grainDensity) continue; // imperfect coverage -- fraction retained == grainDensity
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const jitter = hashLateralUnit(a.x + seed, a.y + seed) * style.width * profile.edgeJitter;
    const offsetX = (-dy / length) * jitter;
    const offsetY = (dx / length) * jitter;
    ctx.globalAlpha = style.opacity * (profile.grainAlphaBase + hash01(a.x + seed, a.y + seed, 5) * profile.grainAlphaRange);
    ctx.beginPath();
    ctx.moveTo(a.x + offsetX, a.y + offsetY);
    ctx.lineTo(b.x + offsetX, b.y + offsetY);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Ink Pen V1 -- Pen's own named, deliberately-calibrated material function,
 * distinct from Pencil's `strokeGraphite` (grainy, sub-saturation, built for
 * sketching buildup) rather than a second anonymous use of the generic path.
 *
 * Live calibration against the graphite-calibrated Pencil showed the
 * existing single continuous `traceSmoothedPath` + one `stroke()` pass --
 * full given opacity, no jitter, no secondary deposition -- ALREADY reads as
 * a crisp, confident, committed ink line once contrasted with Pencil's
 * softer, textured, sub-saturation body pass. Per this build's own guidance
 * ("a single well-calibrated body stroke may remain appropriate... the goal
 * is material identity, not algorithmic novelty"), no additional rendering
 * complexity was introduced: intersections stay perfectly clean (ordinary
 * alpha compositing, no fuzz/bloom/swelling), width/opacity/color apply
 * exactly as authored, and there is nothing here for pan/zoom/reload to
 * destabilize (purely geometric, no seed, no hash, no randomness at all --
 * even more trivially deterministic than strokeGraphite). This function
 * exists so Pen has a real, findable, testable material identity in the
 * codebase rather than silently reusing whatever the shared fallback
 * happens to do -- exactly the seam a future ink refinement would extend.
 */
export function strokeInk(
  ctx: CanvasRenderingContext2D,
  points: readonly SmoothablePoint[],
  style: { readonly color: string; readonly width: number; readonly opacity: number },
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  traceSmoothedPath(ctx, points);
  ctx.lineWidth = style.width;
  ctx.globalAlpha = style.opacity;
  ctx.strokeStyle = style.color;
  ctx.stroke();
  ctx.restore();
}

/**
 * Marker Material Calibration V1 -- Marker's own named material treatment,
 * positioned deliberately BETWEEN Pen (`strokeInk`, one crisp full-opacity
 * pass, no variation at all) and Mop (a separate wet/physical body+dab
 * system) rather than continuing to share Eraser's anonymous generic
 * single-pass fallback the recon for this build found it using.
 *
 * Three passes over the SAME already-authored/smoothed points -- no new
 * capture, no persisted data, no particles:
 *
 * 1. HALO -- the smoothed path stroked WIDER than the authored width at a
 *    low, fixed alpha, drawn FIRST (underneath). This is what reads as a
 *    marker's slightly absorptive edge -- ink just barely spreading past
 *    the nib's contact width into the paper -- without any canvas blur
 *    filter (explicitly avoided: a blur reads as airbrush/glow, not
 *    absorption). Because it sits under the denser core, only a thin outer
 *    sliver of it is ever visible past the core's own edge.
 * 2. CORE -- the SAME smoothed path stroked again, near the authored
 *    width, at a HIGH fixed alpha (`MARKER_CORE_ALPHA`, deliberately denser
 *    than Pencil's own body-pass alpha -- Marker should never read as
 *    faint/sketchy). This is most of what an artist sees; by itself it
 *    would already look like a solid, slightly-less-than-Pen-opacity
 *    marker line.
 * 3. VARIANCE -- a third pass over the SAME core geometry (not offset,
 *    not narrower/wider, not skipped like Pencil's grain) whose alpha
 *    flickers within a small deterministic range per point. Because it is
 *    perfectly colinear with the core (no lateral jitter at all), it never
 *    reads as broken/grainy the way Pencil's grain does -- it only adds
 *    the "mild deposition variation" a real marker nib has, riding
 *    entirely on top of an already-solid core.
 *
 * BUILDUP: every pass composites with ordinary `source-over` alpha, so a
 * second full pass over the same path (or a crossing stroke) naturally
 * deepens color where the passes overlap -- exactly like a real marker
 * pressed over itself -- with no separate "wetness" state to track and no
 * risk of ever reaching Mop's pooling/gravity/viscosity territory (there is
 * no such simulation here at all).
 *
 * DETERMINISM: the only "randomness" is `hash01`, a pure function of each
 * point's own persisted coordinates plus this Mark's own stable
 * `seedSource` (its `operation.id`/`obj.id`, assigned once and never
 * reassigned -- the same seed-source convention Mop/Spray/Pencil already
 * use). No `Math.random()`, no `Date.now()`, no camera/view state feeds
 * this function -- the same Mark renders pixel-identical on every redraw,
 * pan, zoom, and reload.
 */
const MARKER_HALO_WIDTH_SCALE = 1.16;
const MARKER_HALO_ALPHA = 0.22;
const MARKER_CORE_WIDTH_SCALE = 0.98;
const MARKER_CORE_ALPHA = 0.86;
const MARKER_VARIANCE_ALPHA_BASE = 0.08;
const MARKER_VARIANCE_ALPHA_RANGE = 0.1;

export function strokeMarker(
  ctx: CanvasRenderingContext2D,
  points: readonly SmoothablePoint[],
  style: { readonly color: string; readonly width: number; readonly opacity: number },
  seedSource: string,
): void {
  if (points.length < 2) return;
  const seed = hashSeed(seedSource);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = style.color;

  // Pass 1: HALO -- wide, low-alpha, drawn first/underneath.
  ctx.beginPath();
  traceSmoothedPath(ctx, points);
  ctx.lineWidth = Math.max(0.5, style.width * MARKER_HALO_WIDTH_SCALE);
  ctx.globalAlpha = style.opacity * MARKER_HALO_ALPHA;
  ctx.stroke();

  // Pass 2: CORE -- the dense, legible marker body.
  ctx.beginPath();
  traceSmoothedPath(ctx, points);
  ctx.lineWidth = Math.max(0.5, style.width * MARKER_CORE_WIDTH_SCALE);
  ctx.globalAlpha = style.opacity * MARKER_CORE_ALPHA;
  ctx.stroke();

  // Pass 3: VARIANCE -- same core geometry, no lateral offset, only a
  // small deterministic per-point alpha flicker (mild absorptive
  // deposition variation, never Pencil's broken/skipped grain).
  ctx.lineWidth = Math.max(0.5, style.width * MARKER_CORE_WIDTH_SCALE);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const variance = MARKER_VARIANCE_ALPHA_BASE + hash01(a.x + seed, a.y + seed, 11) * MARKER_VARIANCE_ALPHA_RANGE;
    ctx.globalAlpha = Math.min(1, Math.max(0, style.opacity * variance));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}
