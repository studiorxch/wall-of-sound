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
export function strokeGraphite(
  ctx: CanvasRenderingContext2D,
  points: readonly SmoothablePoint[],
  style: { readonly color: string; readonly width: number; readonly opacity: number },
  seedSource: string,
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
  ctx.globalAlpha = style.opacity * 0.75;
  ctx.stroke();

  // Pass 2: grain -- per-segment coverage/jitter, deterministic from the
  // segment's own position and this Mark's own stable seed.
  ctx.lineWidth = Math.max(0.4, style.width * 0.5);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const key = hash01(a.x + seed, a.y + seed, 3);
    if (key > 0.68) continue; // ~32% of segments skipped -> imperfect coverage
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const jitter = hashLateralUnit(a.x + seed, a.y + seed) * style.width * 0.14;
    const offsetX = (-dy / length) * jitter;
    const offsetY = (dx / length) * jitter;
    ctx.globalAlpha = style.opacity * (0.22 + hash01(a.x + seed, a.y + seed, 5) * 0.28);
    ctx.beginPath();
    ctx.moveTo(a.x + offsetX, a.y + offsetY);
    ctx.lineTo(b.x + offsetX, b.y + offsetY);
    ctx.stroke();
  }
  ctx.restore();
}
