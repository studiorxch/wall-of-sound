// ── graffitiCanvasRenderer ────────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §6 (high-DPI), §36 (perf)
//
// Renders a whole session's strokes onto a canvas element, high-DPI aware:
// the canvas's backing-store pixel size is set to CSS size * devicePixelRatio
// and every draw call works in that pixel space directly (no ctx.scale
// left engaged across frames, which is a common source of cumulative
// mis-scaling bugs) — normalized stroke coordinates are multiplied by the
// FULL backing-store pixel dimensions, and the CSS width/height are set
// separately so the element visually stays its intended on-screen size.
//
// A full-session `renderSession()` clears and redraws everything — used
// for undo/redo and initial load. `renderIncrementalPoint()` handles the
// live in-progress stroke without touching the already-rendered strokes
// beneath it (BUILD §36: no full-canvas expensive redraw per pointer event).

import type { ArtworkCreationSession, Stroke } from "./graffitiTypes";
import { BRUSH_REGISTRY } from "./graffitiBrushRegistry";

export function sizeCanvasForDPR(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, dpr: number): void {
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
}

export function renderSession(ctx: CanvasRenderingContext2D, session: ArtworkCreationSession, backingWidthPx: number, backingHeightPx: number): void {
  ctx.clearRect(0, 0, backingWidthPx, backingHeightPx);
  session.strokes.forEach((stroke) => renderStroke(ctx, stroke, backingWidthPx, backingHeightPx));
}

export function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, backingWidthPx: number, backingHeightPx: number): void {
  const renderer = BRUSH_REGISTRY[stroke.tool];
  renderer(ctx, stroke, backingWidthPx, backingHeightPx);
}
