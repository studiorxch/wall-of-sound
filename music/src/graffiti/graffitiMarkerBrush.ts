// ── graffitiMarkerBrush ────────────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §13
//
// The one reliable non-simulated brush: solid color, round cap/join, smooth
// interpolation, pressure-responsive width where supplied, predictable
// mouse fallback (pressure ?? 1 — see graffitiInputController.ts's header
// for why mouse pressure is never left at the Pointer Events spec's
// synthetic 0).
//
// Width varies per segment with the source point's pressure, which means
// each smoothed segment is stroked individually (canvas has no per-path
// variable-width primitive) — each starts exactly where the previous one
// ended, so the visible line stays continuous despite the separate stroke() calls.

import type { Stroke } from "./graffitiTypes";
import { smoothedCurveSegments } from "./graffitiSmoothing";

export function renderMarkerStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, canvasWidthPx: number, canvasHeightPx: number): void {
  const points = stroke.points;
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    // A tap/click with no movement — draw a single dot so it isn't silently lost.
    const p = points[0];
    const r = (stroke.baseWidth * (p.pressure ?? 1) * canvasWidthPx) / 2;
    ctx.beginPath();
    ctx.arc(p.x * canvasWidthPx, p.y * canvasHeightPx, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const segments = smoothedCurveSegments(points);
  let cursorX = points[0].x * canvasWidthPx, cursorY = points[0].y * canvasHeightPx;
  segments.forEach((seg, i) => {
    const sourcePoint = points[Math.min(i + 1, points.length - 1)];
    ctx.lineWidth = Math.max(0.5, stroke.baseWidth * (sourcePoint.pressure ?? 1) * canvasWidthPx);
    const controlX = seg.controlX * canvasWidthPx, controlY = seg.controlY * canvasHeightPx;
    const endX = seg.endX * canvasWidthPx, endY = seg.endY * canvasHeightPx;
    ctx.beginPath();
    ctx.moveTo(cursorX, cursorY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.stroke();
    cursorX = endX; cursorY = endY;
  });
  ctx.restore();
}
