import { type MarkerVariantId } from "./DrawingTool";
import { PaintMarkerEngine } from "./PaintMarkerEngine";
import { createStrokeRandom, SprayBrushEngine } from "./SprayBrushEngine";
import { getSprayCapPreset, type SprayCapId, type SprayCapPreset } from "./SprayCapPresets";
import { getMarkerVariant } from "./PaintMarkerEngine";
import { type StrokePoint } from "./types";
import {
  resolveFlairModulationWithParams,
  resolveFlairSize,
  type EffectiveFlairParams,
} from "./FlairCurves";
import { type FlairModeId } from "./ToolTaxonomy";

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

/**
 * A richer deterministic path for Brush Studio's larger preview: a straight
 * segment, then a steep diagonal (the opposite directional extreme), then a
 * curve, then a dwell tail — the same composition manually verified live for
 * Oval Calligraphy / Rectangular Transversal's wide/narrow contrast, plus a
 * dot/dwell signature and enough curvature to show taper, wiggle, and halo
 * behavior in one compact pass. Still the real engine, still deterministic.
 */
function buildStudioPreviewPoints(width: number, height: number, strokeWidth: number): StrokePoint[] {
  const marginX = width * 0.08;
  const topY = height * 0.24;
  const midY = height * 0.5;
  const botY = height * 0.78;
  const straightEndX = marginX + (width - marginX * 2) * 0.28;
  const diagEndX = marginX + (width - marginX * 2) * 0.52;
  const curveEndX = width - marginX;

  const points: StrokePoint[] = [];
  let t = 0;
  const push = (x: number, y: number, velocity = 0.3) => {
    points.push({ x, y, timestamp: t, velocity, width: strokeWidth, opacity: 1 });
    t += 40;
  };

  const straightSteps = 5;
  for (let i = 0; i <= straightSteps; i += 1) {
    push(marginX + (straightEndX - marginX) * (i / straightSteps), topY);
  }
  const diagSteps = 5;
  for (let i = 1; i <= diagSteps; i += 1) {
    const f = i / diagSteps;
    push(straightEndX + (diagEndX - straightEndX) * f, topY + (botY - topY) * f);
  }
  const curveSteps = 10;
  for (let i = 1; i <= curveSteps; i += 1) {
    const f = i / curveSteps;
    push(diagEndX + (curveEndX - diagEndX) * f, botY - Math.sin(f * Math.PI) * (botY - midY));
  }

  const last = points[points.length - 1];
  for (let i = 1; i <= PREVIEW_DWELL_STEPS; i += 1) {
    points.push({ ...last, timestamp: last.timestamp + i * 40, velocity: 0.04 });
  }
  return points;
}

export interface SprayStudioPreviewOptions {
  size?: number;
  coverage?: number;
  fillMode?: boolean;
  /** Degrees, 0-PLUME_MAX_ANGLE_DEGREES — see `SprayBrushEngine.resolveMouseSprayInput`. Only visibly affects a `depositionShape: "plume"` cap (Pink Dot Fat); inert on every other cap, same as fillMode. */
  sprayAngle?: number;
}

/**
 * Brush Studio's live preview. Takes the resolved preset directly (not just
 * an id) so it renders custom brushes too, and accepts the EFFECTIVE
 * size/coverage/fillMode/sprayAngle so property edits are reflected
 * immediately — still the same real SprayBrushEngine, still deterministic
 * per call.
 */
export function renderSprayBrushStudioPreview(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  preset: SprayCapPreset,
  options: SprayStudioPreviewOptions = {},
): void {
  ctx.clearRect(0, 0, width, height);
  const strokeWidth = clampStrokeWidth((options.size ?? preset.baseRadius) * 2, height, 0.16);
  const points = buildStudioPreviewPoints(width, height, strokeWidth);
  const engine = new SprayBrushEngine();
  const random = createStrokeRandom(PREVIEW_SEED);
  const coverage = options.coverage ?? 1;
  const fillMode = options.fillMode ?? false;
  const sprayAngle = options.sprayAngle ?? 0;
  engine.beginStroke();
  engine.renderSegment(ctx, null, points[0], PREVIEW_COLOR, preset, random, coverage, fillMode, sprayAngle);
  for (let i = 1; i < points.length; i += 1) {
    engine.renderSegment(ctx, points[i - 1], points[i], PREVIEW_COLOR, preset, random, coverage, fillMode, sprayAngle);
  }
}

/**
 * Brush Studio's Flair preview, for the real accessible caps (Pink Dot Fat,
 * New York Fat -- see `isFlairEligibleCap` in `FlairCurves.ts`; Brush Studio Flair Controls
 * build brief, section 5). Sweeps simulated distance near -> far -> near
 * ACROSS the preview stroke's own points — a real, deterministic call to
 * `resolveFlairModulationWithParams`, the exact function the live Alt-drag
 * routing hook in `main.ts` also calls — so one static preview image shows
 * the thick<->thin/output modulation directly, with no animation loop and
 * no faked preview. Still the real `SprayBrushEngine`.
 */
export function renderFlairPreview(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  preset: SprayCapPreset,
  mode: FlairModeId,
  params: EffectiveFlairParams,
): void {
  ctx.clearRect(0, 0, width, height);
  const basePoints = buildStudioPreviewPoints(width, height, clampStrokeWidth(preset.baseRadius * 2, height, 0.16));
  const points: StrokePoint[] = basePoints.map((point, index) => {
    const progress = index / Math.max(1, basePoints.length - 1);
    // Triangle wave: near (0) -> far (1) -> near (0) across the stroke's own length.
    const distance01 = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
    const modulation = resolveFlairModulationWithParams(mode, params, {
      distance01,
      output: point.opacity,
      velocity: point.velocity,
      angle: 0,
    });
    const resolvedSize = resolveFlairSize(modulation.width01, params);
    return {
      ...point,
      width: clampStrokeWidth(resolvedSize * 2, height, 0.16),
      opacity: Math.max(0, Math.min(1, modulation.output)),
    };
  });
  const engine = new SprayBrushEngine();
  const random = createStrokeRandom(PREVIEW_SEED);
  engine.beginStroke();
  engine.renderSegment(ctx, null, points[0], PREVIEW_COLOR, preset, random);
  for (let i = 1; i < points.length; i += 1) {
    engine.renderSegment(ctx, points[i - 1], points[i], PREVIEW_COLOR, preset, random);
  }
}

/** Same richer path, for Paint Marker — real PaintMarkerEngine, optional live size override. */
export function renderMarkerBrushStudioPreview(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  variantId: MarkerVariantId,
  sizeOverride?: number,
): void {
  const variant = getMarkerVariant(variantId);
  ctx.clearRect(0, 0, width, height);
  const strokeWidth = clampStrokeWidth((sizeOverride ?? variant.defaultSize), height, 0.4);
  const points = buildStudioPreviewPoints(width, height, strokeWidth);
  const engine = new PaintMarkerEngine();
  engine.beginStroke(variantId);
  engine.renderSegment(ctx, null, points[0], PREVIEW_COLOR, variantId);
  for (let i = 1; i < points.length; i += 1) {
    engine.renderSegment(ctx, points[i - 1], points[i], PREVIEW_COLOR, variantId);
  }
  engine.endStroke(ctx);
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

/**
 * V0.10.2 Marker + Spray Control Reduction: replaces the abstract XS/S/M/L/
 * XL size-preset labels with an actual visual sample of the nib/footprint
 * at its real relative size and shape -- "the user should be able to choose
 * size visually without guessing what a letter means." A deliberately
 * simple, static footprint glyph (not a live `PaintMarkerEngine` stroke
 * sample like `renderMarkerBrushStudioPreview` above) -- the shape alone is
 * what needs to read at a glance across 5 small buttons in a row, and a
 * dynamic stroke render there would visually compete with the SELECTED
 * size's own live preview shown just above the row. Purely a UI selector
 * glyph; the actual live-paint renderer (`PaintMarkerEngine`) is untouched.
 *
 * Family mapping mirrors `markerFamilyFor` (`BrushStudio.ts`) exactly, kept
 * as its own tiny local copy rather than an import so this module (already
 * imported BY `BrushStudio.ts`) never imports back from it.
 */
export function renderMarkerSizeSample(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  variantId: MarkerVariantId,
  sizePx: number,
): void {
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const maxDiameter = Math.min(width, height) - 4;
  const diameter = Math.max(3, Math.min(sizePx, maxDiameter));
  ctx.fillStyle = "rgba(244,243,240,0.94)";
  if (variantId === "round") {
    ctx.beginPath();
    ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (variantId === "mop" || variantId === "drip-mop") {
    // Broad, soft round footprint -- same circular shape as Round, but
    // deliberately lower-opacity/wider to read as the softer, wetter Mop
    // tip rather than a crisp round nib.
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    // Chisel family: a flat, elongated rectangular footprint -- the
    // characteristic cross-section of a chisel tip, never a circle.
    const rectWidth = diameter;
    const rectHeight = Math.max(3, diameter * 0.4);
    const radius = Math.min(3, rectHeight / 2);
    const left = cx - rectWidth / 2;
    const top = cy - rectHeight / 2;
    ctx.beginPath();
    ctx.moveTo(left + radius, top);
    ctx.arcTo(left + rectWidth, top, left + rectWidth, top + rectHeight, radius);
    ctx.arcTo(left + rectWidth, top + rectHeight, left, top + rectHeight, radius);
    ctx.arcTo(left, top + rectHeight, left, top, radius);
    ctx.arcTo(left, top, left + rectWidth, top, radius);
    ctx.closePath();
    ctx.fill();
  }
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
