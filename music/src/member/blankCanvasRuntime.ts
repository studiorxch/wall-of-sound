import type { Artwork } from "@studiorich/member-identity";
import { BLANK_SURFACE_ID, type BlankOperation } from "./blankArtworkBridge";
import { createCartesianCamera, type CartesianCamera } from "./cartesianWorkspaceCamera";
import { resolveMopDabPlan } from "./mopDeposition";
import { hashSeed, resolveSprayCorePlan, resolveSprayParticlePlan } from "./sprayDeposition";
import { fillMopDab, fillSprayParticle, hash01, hashLateralUnit, strokeGraphite, strokeInk, traceSmoothedPath } from "./strokeSmoothing";

/**
 * ARTWORK V2 -- Blank Artwork's own lightweight, non-Mapbox drawing
 * runtime. Deliberately NOT a modification of `surfaceDrawingRuntime.js`
 * (that engine's composite-caching/overscan/camera-baseline machinery
 * exists specifically for Revision 20's geographic tile presentation --
 * reopening it was explicitly out of scope). Instead this mirrors the
 * SAME precedent Blackbook already establishes: a self-contained runtime
 * reusing only the shared, coordinate-independent Art Supply deposition
 * primitives (`mopDeposition.ts`/`sprayDeposition.ts`/`strokeSmoothing.ts`)
 * -- never a second implementation of Mop/Spray/etc. material behavior.
 *
 * Document coordinates are Artwork-local Cartesian, NOT world/screen
 * coordinates (see the V2 build brief's own invariant) -- pan/zoom only
 * ever change how document space is PROJECTED onto the screen; persisted
 * geometry never contains a screen pixel or a camera value.
 */

export type BlankBrush = {
  readonly supplyId: "pencil" | "pen" | "marker" | "mop" | "spray" | "eraser";
  readonly color: string;
  readonly width: number;
  readonly opacity: number;
};

interface DocPoint {
  readonly x: number;
  readonly y: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const MIN_DOT_SCREEN_SPACING = 28;
const DOT_SPACING_STEPS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let panButton: HTMLButtonElement | null = null;

// Blackbook Spatial Workspace V1: this is the same shared camera Blackbook's
// own workspace now uses (see cartesianWorkspaceCamera.ts) -- Blank's own
// pan/zoom/projection behavior is unchanged, only the math moved to a
// reusable module instead of living privately in this file.
const cameraView: CartesianCamera = createCartesianCamera();
let panMode = false;
let isPointerDown = false;
let activeDocPoints: DocPoint[] = [];
let lastScreenPoint: { x: number; y: number } | null = null;

let operations: BlankOperation[] = [];
let nextOperationId = 1;
let getBrush: () => BlankBrush = () => ({ supplyId: "pencil", color: "#171412", width: 6, opacity: 0.9 });

function width(): number { return canvas?.clientWidth ?? window.innerWidth; }
function height(): number { return canvas?.clientHeight ?? window.innerHeight; }
function zoom(): number { return cameraView.getState().zoom; }

function docToScreen(point: DocPoint): { x: number; y: number } {
  return cameraView.docToScreen(point, width(), height());
}
function screenToDoc(x: number, y: number): DocPoint {
  return cameraView.screenToDoc(x, y, width(), height());
}

function ensureCanvas(): void {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.id = "blank-canvas-workspace";
  // z-index: this must sit above every existing Subway/world overlay canvas
  // (some of which use very high values, e.g. maritime-occupancy-canvas at
  // 999999, for their own HUD-layering purposes) so entering Blank always
  // fully occludes the shared Map/world scene -- Blank has no business
  // showing any of that content through.
  canvas.style.cssText = "position:fixed;inset:0;z-index:2000000;display:none;touch-action:none;background:#14161b;";
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");

  panButton = document.createElement("button");
  panButton.type = "button";
  panButton.id = "blank-canvas-pan-toggle";
  panButton.textContent = "PAN";
  panButton.style.cssText = "position:fixed;top:16px;left:16px;z-index:2000001;display:none;";
  panButton.addEventListener("click", () => {
    panMode = !panMode;
    panButton!.dataset.active = String(panMode);
    render();
  });
  document.body.appendChild(panButton);

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
}

function resizeCanvas(): void {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function niceDotSpacing(): number {
  for (const step of DOT_SPACING_STEPS) {
    if (step * zoom() >= MIN_DOT_SCREEN_SPACING) return step;
  }
  return DOT_SPACING_STEPS[DOT_SPACING_STEPS.length - 1];
}

/** Presentation only -- dots are never Marks, never persisted, never exported. */
function renderDots(): void {
  if (!ctx) return;
  const spacing = niceDotSpacing();
  const topLeft = screenToDoc(0, 0);
  const bottomRight = screenToDoc(width(), height());
  const startX = Math.floor(topLeft.x / spacing) * spacing;
  const startY = Math.floor(topLeft.y / spacing) * spacing;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  const radius = Math.max(0.6, Math.min(1.6, zoom()));
  for (let x = startX; x <= bottomRight.x; x += spacing) {
    for (let y = startY; y <= bottomRight.y; y += spacing) {
      const screen = docToScreen({ x, y });
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function projected(points: readonly DocPoint[]): { x: number; y: number }[] {
  return points.map((point) => docToScreen(point));
}

function drawOperation(context: CanvasRenderingContext2D, operation: BlankOperation): void {
  const points = projected(operation.points);
  if (points.length < 2) return;
  if (operation.operation === "mop") { drawMop(context, points, operation.style); return; }
  if (operation.operation === "spray") { drawSpray(context, points, operation.style, operation.id); return; }
  if (operation.operation === "pencil") {
    context.save();
    strokeGraphite(context, points, { ...operation.style, width: operation.style.width * zoom() }, operation.id);
    context.restore();
    return;
  }
  if (operation.operation === "pen") {
    context.save();
    strokeInk(context, points, { ...operation.style, width: operation.style.width * zoom() });
    context.restore();
    return;
  }
  context.save();
  context.lineCap = "round"; context.lineJoin = "round";
  context.beginPath();
  traceSmoothedPath(context, points);
  if (operation.operation === "eraser") {
    context.globalCompositeOperation = "destination-out";
    context.lineWidth = operation.width * zoom();
    context.globalAlpha = 1;
    context.strokeStyle = "#000";
  } else {
    context.globalCompositeOperation = "source-over";
    context.lineWidth = operation.style.width * zoom();
    context.globalAlpha = operation.style.opacity;
    context.strokeStyle = operation.style.color;
  }
  context.stroke();
  context.restore();
}

function drawMop(context: CanvasRenderingContext2D, points: readonly { x: number; y: number }[], style: { readonly color: string; readonly width: number; readonly opacity: number }): void {
  const scaledWidth = style.width * zoom();
  context.save();
  context.lineCap = "round"; context.lineJoin = "round";
  context.globalCompositeOperation = "source-over";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.lineWidth = scaledWidth;
  context.globalAlpha = style.opacity * 0.92;
  context.strokeStyle = style.color;
  context.stroke();
  const dabs = resolveMopDabPlan(points, scaledWidth * 0.5);
  const isDotLike = dabs.length <= 3;
  for (let index = 0; index < dabs.length; index += 1) {
    const dab = dabs[index];
    if (!isDotLike && hash01(dab.x, dab.y, 4) > 0.6) continue;
    const prev = dabs[index - 1] ?? dab;
    const next = dabs[index + 1] ?? dab;
    const tangentLength = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    const perpX = -(next.y - prev.y) / tangentLength;
    const perpY = (next.x - prev.x) / tangentLength;
    const lateral = isDotLike ? 0 : hashLateralUnit(dab.x, dab.y) * (scaledWidth * 0.5) * 0.6;
    const radiusJitter = 1 + (hash01(dab.x, dab.y, 1) * 2 - 1) * 0.5;
    const alphaJitter = 1 + (hash01(dab.x, dab.y, 2) * 2 - 1) * 0.45;
    fillMopDab(context, {
      x: dab.x + perpX * lateral,
      y: dab.y + perpY * lateral,
      radius: Math.max(0.3, dab.radius * 0.55 * radiusJitter),
      alpha: Math.max(0, dab.alphaScale * 0.55 * alphaJitter),
    }, style.color, style.opacity);
  }
  context.restore();
}

function drawSpray(context: CanvasRenderingContext2D, points: readonly { x: number; y: number }[], style: { readonly color: string; readonly width: number; readonly opacity: number }, seedSource: string): void {
  const baseRadius = (style.width * zoom()) * 0.5;
  const seed = hashSeed(seedSource);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round"; context.lineJoin = "round";
  for (const pass of resolveSprayCorePlan(points, baseRadius, seed)) {
    if (pass.points.length < 2) continue;
    context.globalAlpha = style.opacity * pass.alpha;
    context.strokeStyle = style.color;
    context.lineWidth = pass.width;
    context.beginPath();
    context.moveTo(pass.points[0].x, pass.points[0].y);
    for (const point of pass.points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
  context.restore();
  context.save();
  for (const particle of resolveSprayParticlePlan(points, baseRadius, seed)) fillSprayParticle(context, particle, style.color, style.opacity);
  context.restore();
}

function render(): void {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, width(), height());
  ctx.fillStyle = "#14161b";
  ctx.fillRect(0, 0, width(), height());
  renderDots();
  for (const operation of operations) drawOperation(ctx, operation);
  if (activeDocPoints.length > 1) {
    const brush = getBrush();
    if (brush.supplyId !== "eraser") {
      drawOperation(ctx, { operation: brush.supplyId, id: "active", points: activeDocPoints, style: { color: brush.color, width: brush.width, opacity: brush.opacity } });
    } else {
      drawOperation(ctx, { operation: "eraser", id: "active", points: activeDocPoints, width: brush.width });
    }
  }
}

function onPointerDown(event: PointerEvent): void {
  if (!canvas) return;
  canvas.setPointerCapture(event.pointerId);
  isPointerDown = true;
  if (panMode) {
    lastScreenPoint = { x: event.clientX, y: event.clientY };
    return;
  }
  activeDocPoints = [screenToDoc(event.clientX, event.clientY)];
  render();
}

function onPointerMove(event: PointerEvent): void {
  if (!isPointerDown || !canvas?.hasPointerCapture(event.pointerId)) return;
  if (panMode) {
    if (lastScreenPoint) {
      cameraView.panBy(event.clientX - lastScreenPoint.x, event.clientY - lastScreenPoint.y);
    }
    lastScreenPoint = { x: event.clientX, y: event.clientY };
    render();
    return;
  }
  const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
  const samples = coalesced.length > 0 ? coalesced : [event];
  for (const sample of samples) activeDocPoints.push(screenToDoc(sample.clientX, sample.clientY));
  render();
}

function onPointerUp(event: PointerEvent): void {
  if (!canvas?.hasPointerCapture(event.pointerId)) return;
  canvas.releasePointerCapture(event.pointerId);
  isPointerDown = false;
  lastScreenPoint = null;
  if (panMode) { return; }
  if (activeDocPoints.length > 1) {
    const brush = getBrush();
    const id = `blank-operation-${nextOperationId++}`;
    const operation: BlankOperation = brush.supplyId === "eraser"
      ? { operation: "eraser", id, points: activeDocPoints, width: brush.width }
      : { operation: brush.supplyId, id, points: activeDocPoints, style: { color: brush.color, width: brush.width, opacity: brush.opacity } };
    operations.push(operation);
    document.dispatchEvent(new CustomEvent("blank-drawing:stroke-committed", { detail: { stroke: operation } }));
  }
  activeDocPoints = [];
  render();
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0015);
  cameraView.zoomAt(event.clientX, event.clientY, factor, width(), height(), MIN_ZOOM, MAX_ZOOM);
  render();
}

function fitToContent(): void {
  if (!operations.length) {
    cameraView.reset();
    return;
  }
  const points = operations.flatMap((operation) => operation.points);
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  // Same span floor as before extraction: a single point (or a perfectly
  // straight horizontal/vertical stroke) must not zoom in to infinity.
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  cameraView.fitToRect(
    { minX: centerX - spanX / 2, minY: centerY - spanY / 2, maxX: centerX + spanX / 2, maxY: centerY + spanY / 2 },
    width(), height(), 0.8, MIN_ZOOM, MAX_ZOOM,
  );
}

export interface BlankCanvasRuntime {
  enter(): void;
  exit(): void;
  hydrate(artwork: Artwork | null): void;
  getUnclaimedStrokes(): readonly BlankOperation[];
  bindArtwork(stroke: BlankOperation, artworkId: string, markId: string, creatorId: string, surfaceId: string): boolean;
  removeOperation(operation: BlankOperation): void;
  setBrushSource(source: () => BlankBrush): void;
  isActive(): boolean;
}

let active = false;

export function createBlankCanvasRuntime(): BlankCanvasRuntime {
  return {
    enter(): void {
      ensureCanvas();
      active = true;
      if (canvas) canvas.style.display = "block";
      if (panButton) panButton.style.display = "block";
      render();
    },
    exit(): void {
      active = false;
      if (canvas) canvas.style.display = "none";
      if (panButton) panButton.style.display = "none";
      operations = [];
      activeDocPoints = [];
      panMode = false;
    },
    hydrate(artwork: Artwork | null): void {
      operations = !artwork ? [] : artwork.marks.flatMap((mark): BlankOperation[] => {
        if (mark.type === "stroke" && mark.geometry.format === "local-2d-stroke-v1") {
          return [{
            operation: (mark.material?.supplyId as BlankOperation["operation"]) ?? "pencil",
            id: `blank-mark-${mark.id}`,
            artworkId: artwork.id,
            markId: mark.id,
            creatorId: artwork.creatorId,
            surfaceId: artwork.surfaceId,
            points: mark.geometry.points,
            style: mark.style,
          } as BlankOperation];
        }
        if (mark.type === "material-erasure" && mark.geometry.format === "local-2d-erasure-v1") {
          return [{ operation: "eraser", id: `blank-mark-${mark.id}`, artworkId: artwork.id, markId: mark.id, creatorId: artwork.creatorId, surfaceId: artwork.surfaceId, points: mark.geometry.points, width: mark.width }];
        }
        return [];
      });
      ensureCanvas();
      fitToContent();
      render();
    },
    getUnclaimedStrokes: () => operations.filter((operation) => !operation.artworkId),
    bindArtwork(stroke, artworkId, markId, creatorId, surfaceId): boolean {
      const target = operations.find((operation) => operation === stroke || operation.id === stroke.id);
      if (!target) return false;
      Object.assign(target, { artworkId, markId, creatorId, surfaceId });
      return true;
    },
    removeOperation(operation: BlankOperation): void {
      operations = operations.filter((item) => item !== operation && item.id !== operation.id);
      render();
    },
    setBrushSource(source: () => BlankBrush): void {
      getBrush = source;
    },
    isActive: () => active,
  };
}

export { BLANK_SURFACE_ID };
