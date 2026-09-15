import { type MarkerVariantId } from "./DrawingTool";
import { PaintMarkerEngine } from "./PaintMarkerEngine";
import { createStrokeRandom, SprayBrushEngine } from "./SprayBrushEngine";
import { getSprayCapPreset, type SprayCapId, type SprayCapPreset } from "./SprayCapPresets";
import { getMarkerVariant } from "./PaintMarkerEngine";
import { type StrokePoint } from "./types";

/**
 * Deterministic brush/cap preview rendering. Reuses the real SprayBrushEngine /
 * PaintMarkerEngine so a preview is never a hand-drawn approximation of what a
 * preset actually does — it's the same renderer, fed a fixed synthetic stroke.
 */

const PREVIEW_COLOR = "#f4f3f0";
const PREVIEW_SEED = 4242;
const PREVIEW_STEPS = 6;
const PREVIEW_DWELL_STEPS = 3;

/**
 * A moving sweep alone can't show a cap's dot/halo/dwell character — a fat
 * cap's loaded-dot bloom, a specialty cap's oscillation settling, an edge
 * softness only visible where paint has had time to build up. So every
 * preview ends with a brief real dwell (near-zero-distance repeat points) at
 * its own endpoint, through the same real engine call used for the moving
 * part — never a separate fake "dot" drawing.
 */
function buildPreviewPoints(width: number, height: number, strokeWidth: number): StrokePoint[] {
  const marginX = width * 0.16;
  const midY = height * 0.5;
  const wobble = height * 0.14;
  const points: StrokePoint[] = [];
  for (let i = 0; i <= PREVIEW_STEPS; i += 1) {
    const t = i / PREVIEW_STEPS;
    points.push({
      x: marginX + (width - marginX * 2) * t,
      y: midY + Math.sin(t * Math.PI) * wobble,
      timestamp: t * 420,
      velocity: 0.3,
      width: strokeWidth,
      opacity: 1,
    });
  }
  const last = points[points.length - 1];
  for (let i = 1; i <= PREVIEW_DWELL_STEPS; i += 1) {
    points.push({ ...last, timestamp: last.timestamp + i * 40, velocity: 0.04 });
  }
  return points;
}

function clampStrokeWidth(actual: number, height: number, scale: number): number {
  return Math.max(1.5, Math.min(height * 0.85, actual * scale));
}

export function renderSprayCapPreviewToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  capId: SprayCapId | string,
): SprayCapPreset {
  const preset = getSprayCapPreset(capId);
  ctx.clearRect(0, 0, width, height);
  const strokeWidth = clampStrokeWidth(preset.baseRadius * 2, height, 0.16);
  const points = buildPreviewPoints(width, height, strokeWidth);
  const engine = new SprayBrushEngine();
  const random = createStrokeRandom(PREVIEW_SEED);
  engine.renderSegment(ctx, null, points[0], PREVIEW_COLOR, preset, random);
  for (let i = 1; i < points.length; i += 1) {
    engine.renderSegment(ctx, points[i - 1], points[i], PREVIEW_COLOR, preset, random);
  }
  return preset;
}

export function renderMarkerPreviewToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  variantId: MarkerVariantId,
): void {
  const variant = getMarkerVariant(variantId);
  ctx.clearRect(0, 0, width, height);
  const strokeWidth = clampStrokeWidth(variant.defaultSize, height, 0.4);
  const points = buildPreviewPoints(width, height, strokeWidth);
  const engine = new PaintMarkerEngine();
  engine.beginStroke(variantId);
  engine.renderSegment(ctx, null, points[0], PREVIEW_COLOR, variantId);
  for (let i = 1; i < points.length; i += 1) {
    engine.renderSegment(ctx, points[i - 1], points[i], PREVIEW_COLOR, variantId);
  }
  engine.endStroke(ctx);
}

/** Wires every `<canvas data-preview-cap>` / `<canvas data-preview-marker>` under `root` to a rendered preview. */
export function renderAllBrushPreviews(root: ParentNode): void {
  root.querySelectorAll<HTMLCanvasElement>("canvas[data-preview-cap]").forEach((canvas) => {
    const ctx = canvas.getContext("2d");
    const capId = canvas.dataset.previewCap;
    if (!ctx || !capId) return;
    renderSprayCapPreviewToContext(ctx, canvas.width, canvas.height, capId);
  });
  root.querySelectorAll<HTMLCanvasElement>("canvas[data-preview-marker]").forEach((canvas) => {
    const ctx = canvas.getContext("2d");
    const variantId = canvas.dataset.previewMarker as MarkerVariantId | undefined;
    if (!ctx || !variantId) return;
    renderMarkerPreviewToContext(ctx, canvas.width, canvas.height, variantId);
  });
}
