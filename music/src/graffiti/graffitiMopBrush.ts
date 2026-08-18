// ── graffitiMopBrush ───────────────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §12
//
// Behavioral reference: WOS-share/SUBWAY/ARCHIVE/REFERENCE/Drip_Brush/archive/
// graffiti-mop-engine-v2.4.9.2.html (gravity/drag/taper/bulb/dripChance
// concepts, hardened-state drip lifecycle, static/active layer split for
// performance). NOT copied — that prototype drives a real-time
// requestAnimationFrame physics loop seeded by Math.random() every drip,
// which is intentionally NOT reproduced here: this build's drips are
// computed ONCE, analytically, in a fixed number of steps, seeded from the
// stroke's own deterministic seed (graffitiRandom.ts) — replaying the same
// stored stroke always produces the identical drip shapes (BUILD §12
// "serializable enough for persistence/replay"), and there is no
// per-frame animation cost at all (BUILD §36 performance — no unbounded
// drip objects, no continuous simulation loop).
//
// Ink deposit ("dwell can increase ink deposit", BUILD §12) is modeled from
// the ACTUAL captured points: consecutive points close together in
// normalized space (the pointer moved slowly / lingered) count as higher
// dwell at that location, raising both drip probability and the spawned
// drip's initial width there — a real signal derived from captured data,
// never fabricated.

import type { Stroke, StrokePoint } from "./graffitiTypes";
import { createSeededRandom } from "./graffitiRandom";

const GRAVITY = 0.0022; // normalized-units/step^2 equivalent, tuned for a ~350-1000px canvas
const DRAG = 0.92;
const TAPER = 0.9;
const MAX_DRIP_STEPS = 26;
const MAX_DRIPS_PER_STROKE = 8; // bounded growth (BUILD §36)
const MIN_VELOCITY_TO_CONTINUE = 0.0006;

function colorWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Local "dwell" at point i — inverse of the distance to neighbors. High
// when consecutive captured points cluster tightly (slow movement).
function dwellAt(points: StrokePoint[], i: number): number {
  const p = points[i];
  const prev = points[Math.max(0, i - 1)];
  const dx = p.x - prev.x, dy = p.y - prev.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return 1 / (dist + 0.01);
}

export interface DripShape {
  originX: number; originY: number;
  circles: Array<{ x: number; y: number; radius: number; alpha: number }>;
}

// Exposed separately from rendering so tests can assert on the shape
// (deterministic given the same stroke + originIndex) without a canvas.
export function simulateDrip(points: StrokePoint[], originIndex: number, baseWidth: number, seed: number): DripShape {
  const rand = createSeededRandom(seed + originIndex * 97);
  const origin = points[originIndex];
  const dwell = Math.min(3, dwellAt(points, originIndex));
  let v = GRAVITY * (1 + dwell) * (0.6 + rand() * 0.8);
  let width = baseWidth * (0.5 + dwell * 0.15) * (0.7 + (origin.pressure ?? 1) * 0.3);
  let x = origin.x, y = origin.y;
  const circles: DripShape["circles"] = [];
  for (let step = 0; step < MAX_DRIP_STEPS; step++) {
    circles.push({ x, y, radius: width / 2, alpha: 0.85 * (1 - step / MAX_DRIP_STEPS * 0.3) });
    v *= DRAG;
    if (v < MIN_VELOCITY_TO_CONTINUE) break;
    y += v;
    width *= TAPER;
    x += (rand() - 0.5) * 0.0008; // tiny lateral wobble, deterministic
  }
  return { originX: origin.x, originY: origin.y, circles };
}

function collectDripOrigins(points: StrokePoint[], seed: number): number[] {
  const rand = createSeededRandom(seed);
  const origins: number[] = [];
  for (let i = 1; i < points.length && origins.length < MAX_DRIPS_PER_STROKE; i++) {
    const dwell = dwellAt(points, i);
    const chance = Math.min(0.35, 0.04 + dwell * 0.05);
    if (rand() < chance) origins.push(i);
  }
  return origins;
}

export function renderMopStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, canvasWidthPx: number, canvasHeightPx: number): void {
  const points = stroke.points;
  if (points.length === 0) return;
  const dim = Math.min(canvasWidthPx, canvasHeightPx);

  // Wet centerline — thicker, slightly translucent so overlapping passes
  // deepen naturally like real ink.
  ctx.save();
  ctx.strokeStyle = colorWithAlpha(stroke.color, 0.8);
  ctx.fillStyle = colorWithAlpha(stroke.color, 0.8);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x * canvasWidthPx, p.y * canvasHeightPx, Math.max(1, (stroke.baseWidth * dim * (p.pressure ?? 1)) / 2), 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0].x * canvasWidthPx, points[0].y * canvasHeightPx);
    for (let i = 1; i < points.length; i++) {
      ctx.lineWidth = Math.max(1, stroke.baseWidth * dim * (points[i].pressure ?? 1));
      ctx.lineTo(points[i].x * canvasWidthPx, points[i].y * canvasHeightPx);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(points[i].x * canvasWidthPx, points[i].y * canvasHeightPx);
    }
  }
  ctx.restore();

  // Deterministic drips, spawned wherever the captured data shows dwell.
  const origins = collectDripOrigins(points, stroke.seed);
  origins.forEach((originIndex) => {
    const drip = simulateDrip(points, originIndex, stroke.baseWidth * dim, stroke.seed);
    ctx.save();
    ctx.fillStyle = stroke.color;
    drip.circles.forEach((c) => {
      ctx.globalAlpha = c.alpha;
      ctx.beginPath();
      ctx.arc(c.x * canvasWidthPx, c.y * canvasHeightPx, Math.max(0.5, c.radius), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  });
}
