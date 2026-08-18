// ── graffitiFatcapBrush ────────────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §11
//
// The spray/fatcap brush: stamps overlapping soft (radial-gradient) dots
// along the smoothed centerline at fixed arc-length spacing (never
// fixed-per-point spacing — that would make density depend on how densely
// the browser sampled pointermove events, not on hand speed). Pressure
// widens the radius; velocity thins the spacing and softens opacity
// (faster movement -> sparser, lighter coverage, matching real spray-can
// behavior). Jitter is seeded from the stroke's own `seed` (via
// graffitiRandom.ts) so the same stored points always render identically —
// required for undo/redo and serialization determinism (BUILD §11).

import type { Stroke } from "./graffitiTypes";
import { createSeededRandom } from "./graffitiRandom";

const STEP_SPACING_FACTOR = 0.35; // spacing between stamps, as a fraction of baseWidth
const MIN_STEP_SPACING = 0.003; // normalized units — floor so tiny strokes still get >=1 stamp

function pointAt(points: Stroke["points"], t: number, totalLen: number, cumulative: number[]): { x: number; y: number; pressure: number } {
  const target = t * totalLen;
  let i = 1;
  while (i < cumulative.length && cumulative[i] < target) i++;
  const segStart = cumulative[i - 1], segEnd = cumulative[i] ?? segStart;
  const segT = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0;
  const a = points[i - 1], b = points[Math.min(i, points.length - 1)];
  return {
    x: a.x + (b.x - a.x) * segT,
    y: a.y + (b.y - a.y) * segT,
    pressure: (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * segT,
  };
}

export function renderFatcapStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, canvasWidthPx: number, canvasHeightPx: number): void {
  const points = stroke.points;
  if (points.length === 0) return;
  const rand = createSeededRandom(stroke.seed);
  const dim = Math.min(canvasWidthPx, canvasHeightPx);

  if (points.length === 1) {
    stampFatcapDot(ctx, points[0].x * canvasWidthPx, points[0].y * canvasHeightPx, stroke.baseWidth * dim * (points[0].pressure ?? 1), stroke.color, rand);
    return;
  }

  // Cumulative arc length in normalized space, and average velocity for
  // spacing/softness modulation.
  const cumulative = [0];
  let totalVelocity = 0, velocitySamples = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.sqrt(dx * dx + dy * dy));
    if (points[i].velocity != null) { totalVelocity += points[i].velocity as number; velocitySamples++; }
  }
  const totalLen = cumulative[cumulative.length - 1];
  if (totalLen === 0) {
    stampFatcapDot(ctx, points[0].x * canvasWidthPx, points[0].y * canvasHeightPx, stroke.baseWidth * dim * (points[0].pressure ?? 1), stroke.color, rand);
    return;
  }
  const avgVelocity = velocitySamples > 0 ? totalVelocity / velocitySamples : 0;
  // Faster average movement -> sparser stamps (larger spacing).
  const spacing = Math.max(MIN_STEP_SPACING, stroke.baseWidth * STEP_SPACING_FACTOR * (1 + avgVelocity * 40));
  const steps = Math.max(1, Math.floor(totalLen / spacing));

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const p = pointAt(points, t, totalLen, cumulative);
    const radius = stroke.baseWidth * dim * 0.5 * (0.6 + 0.4 * p.pressure);
    stampFatcapDot(ctx, p.x * canvasWidthPx, p.y * canvasHeightPx, radius, stroke.color, rand);
  }
}

function stampFatcapDot(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string, rand: () => number): void {
  if (radius <= 0) return;
  // Deterministic jitter — offsets the stamp center slightly so the spray
  // reads as organic texture rather than a mechanically even dotted line.
  const jitterX = (rand() - 0.5) * radius * 0.4;
  const jitterY = (rand() - 0.5) * radius * 0.4;
  const gradient = ctx.createRadialGradient(cx + jitterX, cy + jitterY, 0, cx + jitterX, cy + jitterY, radius);
  gradient.addColorStop(0, colorWithAlpha(color, 0.55));
  gradient.addColorStop(0.7, colorWithAlpha(color, 0.3));
  gradient.addColorStop(1, colorWithAlpha(color, 0));
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx + jitterX, cy + jitterY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function colorWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}
