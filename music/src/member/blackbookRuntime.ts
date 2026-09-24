import {
  createFirebaseArtworkRepository,
  createFirebaseMemberIdentityAuthority,
  DRAWING_DEFAULT_COLORS,
  DRAWING_SUPPLY_ORDER,
  DRAWING_WIDTH_RANGES,
  MARKER_SUPPLY,
  MOP_SUPPLY,
  PEN_SUPPLY,
  PENCIL_ERASER_SUPPLY,
  PENCIL_SUPPLY,
  SPRAY_SUPPLY,
  type Artwork,
  type DrawingSupplyId,
  type MemberIdentityState,
  type PageFrame,
} from "@studiorich/member-identity";
import {
  BLACKBOOK_PAGE_FRAME,
  BLACKBOOK_PAGE_SURFACE_ID,
  createBlackbookArtworkPersistenceBridge,
  type BlackbookOperation,
} from "./blackbookArtworkBridge";
import { createCartesianCamera, type CartesianCamera, type DocRect } from "./cartesianWorkspaceCamera";
import { resolveMopDabPlan } from "./mopDeposition";
import { hashSeed, resolveSprayCorePlan, resolveSprayParticlePlan } from "./sprayDeposition";
import {
  fillMopDab,
  fillSprayParticle,
  hash01,
  hashLateralUnit,
  resolveGraphiteProfile,
  strokeGraphite,
  strokeInk,
  traceSmoothedPath,
  GRAPHITE_GRADE_ORDER,
  GRAPHITE_PROFILE_VERSION,
  type GraphiteGradeId,
} from "./strokeSmoothing";

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }
const canvas = required(document.querySelector<HTMLCanvasElement>("#blackbook-page"), "blackbook_surface_missing");
const panButton = required(document.querySelector<HTMLButtonElement>("#blackbook-pan"), "blackbook_surface_missing");
const undoButton = required(document.querySelector<HTMLButtonElement>("#blackbook-undo"), "blackbook_surface_missing");
const memberButton = required(document.querySelector<HTMLButtonElement>("#blackbook-member"), "blackbook_surface_missing");
const status = required(document.querySelector<HTMLElement>("#blackbook-status"), "blackbook_surface_missing");
const pencilButton = required(document.querySelector<HTMLButtonElement>("#blackbook-pencil"), "blackbook_surface_missing");
const penButton = required(document.querySelector<HTMLButtonElement>("#blackbook-pen"), "blackbook_surface_missing");
const markerButton = required(document.querySelector<HTMLButtonElement>("#blackbook-marker"), "blackbook_surface_missing");
const mopButton = required(document.querySelector<HTMLButtonElement>("#blackbook-mop"), "blackbook_surface_missing");
const sprayButton = required(document.querySelector<HTMLButtonElement>("#blackbook-spray"), "blackbook_surface_missing");
const eraserButton = required(document.querySelector<HTMLButtonElement>("#blackbook-eraser"), "blackbook_surface_missing");
const colorControl = required(document.querySelector<HTMLInputElement>("#blackbook-color"), "blackbook_surface_missing");
/**
 * Graphite Grades Foundation V1 -- TEMPORARY calibration-only instrument.
 * This is explicitly NOT the Art Store, NOT "My Art Supplies", and NOT the
 * eventual Drawing Shell variant UX (see this build's own recon/brief) --
 * it exists only so grade progression can be evaluated by a human before
 * any of that architecture is built. Deliberately a single plain `<select>`
 * subordinate to the PENCIL button (never a peer button, never seven new
 * top-level tools), isolated behind its own id/element reference so it can
 * be deleted or swapped for the future Store UI without touching any
 * graphite rendering code.
 */
const gradeSelect = required(document.querySelector<HTMLSelectElement>("#blackbook-grade-select"), "blackbook_surface_missing");

// Drawing Shell V1: the static HTML's supply-button order is authored by
// hand -- this guard fails loudly in development the moment it drifts from
// the canonical order Map now also reads, instead of the two silently
// diverging again the way the pre-Shell WIDTH_RANGE/color duplicates did.
{
  const buttonOrder = [pencilButton, penButton, markerButton, mopButton, sprayButton].map((button) => button.id.replace("blackbook-", ""));
  if (buttonOrder.join(",") !== DRAWING_SUPPLY_ORDER.join(",")) {
    throw new Error(`blackbook_supply_order_mismatch: expected [${DRAWING_SUPPLY_ORDER.join(",")}], found [${buttonOrder.join(",")}]`);
  }
}
const widthControl = required(document.querySelector<HTMLInputElement>("#blackbook-width"), "blackbook_surface_missing");
const opacityControl = required(document.querySelector<HTMLInputElement>("#blackbook-opacity"), "blackbook_surface_missing");

const ctx = required(canvas.getContext("2d"), "blackbook_canvas_unavailable");

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const repository = createFirebaseArtworkRepository(import.meta.env);
let memberState: MemberIdentityState = memberIdentity.getState();

/**
 * Blackbook Spatial Workspace V1 -- the SAME shared Cartesian camera Blank
 * Canvas uses (cartesianWorkspaceCamera.ts). VIEW transform only: this never
 * reads or mutates a persisted Mark's `{x,y}` -- it only changes how a
 * document-space point PROJECTS onto the screen. Zoom bounds are chosen for
 * this workspace's own unit convention (the page's LARGER dimension is 1
 * document unit -- see BLACKBOOK_PAGE_FRAME's doc; this held for the
 * original 1x1 square default and still holds for the 16:9 landscape
 * default): MIN_ZOOM lets the artist zoom far out to see a wide desk around
 * a small page; MAX_ZOOM allows a close, high-fidelity zoom into fine
 * linework.
 */
const cameraView: CartesianCamera = createCartesianCamera();
const MIN_ZOOM = 20;
const MAX_ZOOM = 4000;
/**
 * Blackbook Default Page Format -- the page frame actually rendered/fitted
 * is resolved PER SESSION from whatever's hydrated, never hardcoded to the
 * canonical default alone. This is what keeps an OLD Artwork's own
 * authored page frame authoritative: `hydrate()` below sets this to the
 * FIRST persisted `pageFrame` it finds among this member's own Blackbook
 * Artworks (proximity grouping can split one page's content across
 * several Artwork documents, but they all share one authored page, so the
 * first one found is the right one); brand-new/legacy content with no
 * persisted pageFrame at all falls back to `BLACKBOOK_PAGE_FRAME` (today's
 * canonical default). Never mutates any persisted document -- purely which
 * rect this session fits/outlines.
 */
let activePageFrame: PageFrame = BLACKBOOK_PAGE_FRAME;
function pageFrameRect(): DocRect {
  return {
    minX: activePageFrame.x,
    minY: activePageFrame.y,
    maxX: activePageFrame.x + activePageFrame.width,
    maxY: activePageFrame.y + activePageFrame.height,
  };
}
let panMode = false;
let lastScreenPoint: { x: number; y: number } | null = null;

function width(): number { return canvas.clientWidth; }
function height(): number { return canvas.clientHeight; }
/**
 * Every already-persisted `style.width`/`erasure.width` value was authored
 * against Blackbook's OLD fixed 720px-wide backing store -- a width of "5"
 * meant "5 real screen pixels when the page fills a 720px-wide canvas",
 * never "5 document units". Scaling a material's width by the raw camera
 * zoom (document-units-per-screen-pixel, ~1 at the OLD fixed scale but now
 * anywhere from MIN_ZOOM..MAX_ZOOM) would make an old width of "5" render
 * anywhere from a hairline to an enormous solid block depending on the
 * CURRENT view -- not a zoom bug, a unit-mismatch bug. Dividing by this
 * reference converts the camera's zoom back into "screen pixels per the
 * OLD reference page width", so a Mark authored (or reopened) at the page's
 * OWN natural fitted scale renders at effectively its original size, and
 * scales proportionally with the page exactly like Blank's own Marks do.
 */
const WIDTH_REFERENCE_ZOOM = 720;
function widthScale(): number { return cameraView.getState().zoom / WIDTH_REFERENCE_ZOOM; }
function docToScreen(point: { x: number; y: number }): { x: number; y: number } {
  return cameraView.docToScreen(point, width(), height());
}
function screenToDoc(x: number, y: number): { x: number; y: number } {
  return cameraView.screenToDoc(x, y, width(), height());
}
/** Frames the fixed page (never the content) -- see requirement 5's "page initially fits sensibly in view". Runtime-only view state, never persisted (requirement 8). */
function fitPageIntoView(): void {
  cameraView.fitToRect(pageFrameRect(), width(), height(), 0.6, MIN_ZOOM, MAX_ZOOM);
}

const materialLayers = Object.fromEntries(["graphite", "ink", "marker", "mop", "spray"].map((materialId) => {
  const layer = document.createElement("canvas");
  return [materialId, { canvas: layer, context: required(layer.getContext("2d"), "blackbook_material_canvas_unavailable") }];
})) as Record<"graphite" | "ink" | "marker" | "mop" | "spray", { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>;

/** Keeps the visible canvas and every material layer's backing store in sync with the element's live CSS size (DPR-aware) -- mirrors blankCanvasRuntime.ts's `resizeCanvas`. Never re-frames the camera: an existing view must survive a viewport resize unchanged (requirement 2). */
function resizeCanvasesToDisplaySize(): void {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const layer of Object.values(materialLayers)) {
    layer.canvas.width = Math.round(cssWidth * dpr);
    layer.canvas.height = Math.round(cssHeight * dpr);
    layer.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

let operations: BlackbookOperation[] = [];
let activePoints: { x: number; y: number }[] = [];
let nextOperationId = 1;
let activeSupply: "pencil" | "pen" | "marker" | "mop" | "spray" | "eraser" = "pencil";
/**
 * Graphite Grades Foundation V1 -- TEMPORARY calibration selector state
 * only (see gradeSelect's own doc below). Controls which grade authors the
 * NEXT Pencil Mark; never mutates any already-authored Mark. Not the Art
 * Store, not "My Art Supplies" -- Pencil remains one Drawing Shell
 * instrument family; this is strictly "Pencil -> which grade" beneath it.
 */
let activeGraphiteGrade: GraphiteGradeId = "hb";
// Drawing Shell V1 -- per-supply remembered Width/Opacity/Color, seeded from
// the SAME canonical defaults Map now reads too (DRAWING_DEFAULT_COLORS,
// each supply's own `defaultSettings`). Switching supplies restores that
// supply's own last-used values instead of leaking one supply's settings
// into another -- unchanged behavior, only the color is new.
const supplySettings: Record<DrawingSupplyId, { width: number; opacity: number; color: string }> = {
  pencil: { ...PENCIL_SUPPLY.defaultSettings, color: DRAWING_DEFAULT_COLORS.pencil },
  pen: { ...PEN_SUPPLY.defaultSettings, color: DRAWING_DEFAULT_COLORS.pen },
  marker: { ...MARKER_SUPPLY.defaultSettings, color: DRAWING_DEFAULT_COLORS.marker },
  mop: { ...MOP_SUPPLY.defaultSettings, color: DRAWING_DEFAULT_COLORS.mop },
  spray: { ...SPRAY_SUPPLY.defaultSettings, color: DRAWING_DEFAULT_COLORS.spray },
};

/**
 * UI/workspace chrome only -- the page's dotted perimeter and the neutral
 * workspace backdrop. Never a Mark, never persisted, never affects
 * `composition.bounds`, never appears in a thumbnail as Artwork content
 * (requirement 5) -- exactly the same non-persistence guarantee Blank
 * Canvas's own `renderDots` already has.
 */
function renderWorkspaceAndPageFrame(): void {
  ctx.fillStyle = "#0f0d0b";
  ctx.fillRect(0, 0, width(), height());
  const topLeft = docToScreen({ x: pageFrameRect().minX, y: pageFrameRect().minY });
  const bottomRight = docToScreen({ x: pageFrameRect().maxX, y: pageFrameRect().maxY });
  ctx.fillStyle = "#f3eee4";
  ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
}

function renderPageFrameOutline(): void {
  const topLeft = docToScreen({ x: pageFrameRect().minX, y: pageFrameRect().minY });
  const bottomRight = docToScreen({ x: pageFrameRect().maxX, y: pageFrameRect().maxY });
  ctx.save();
  ctx.strokeStyle = "rgba(243,238,228,0.35)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  ctx.restore();
}

function render(): void {
  renderWorkspaceAndPageFrame();
  for (const layer of Object.values(materialLayers)) layer.context.clearRect(0, 0, width(), height());
  for (const operation of operations) drawOperation(operation);
  if (activePoints.length > 1) drawOperation(activeOperation(activePoints));
  ctx.drawImage(materialLayers.graphite.canvas, 0, 0, width(), height());
  ctx.drawImage(materialLayers.mop.canvas, 0, 0, width(), height());
  ctx.drawImage(materialLayers.spray.canvas, 0, 0, width(), height());
  ctx.drawImage(materialLayers.ink.canvas, 0, 0, width(), height());
  ctx.drawImage(materialLayers.marker.canvas, 0, 0, width(), height());
  renderPageFrameOutline();
  undoButton.disabled = memberState.status !== "signedIn" || operations.length === 0;
  // Drawing Shell V1: `aria-pressed` is now the one canonical active-tool
  // state signal (same convention Map's toolbar already used) -- CSS reads
  // it directly ([aria-pressed="true"]), so a screen reader and the visual
  // highlight can never disagree the way a separate data-attribute risked.
  pencilButton.setAttribute("aria-pressed", String(activeSupply === "pencil"));
  penButton.setAttribute("aria-pressed", String(activeSupply === "pen"));
  markerButton.setAttribute("aria-pressed", String(activeSupply === "marker"));
  mopButton.setAttribute("aria-pressed", String(activeSupply === "mop"));
  sprayButton.setAttribute("aria-pressed", String(activeSupply === "spray"));
  eraserButton.setAttribute("aria-pressed", String(activeSupply === "eraser"));
  panButton.setAttribute("aria-pressed", String(panMode));
  // Graphite Grades Foundation V1: the grade selector only makes sense
  // while Pencil is the active supply -- disabled (never hidden) otherwise,
  // same "visually modest, clearly subordinate" treatment as the rest of
  // this temporary instrument.
  gradeSelect.disabled = activeSupply !== "pencil";
}

// Calibration V1 (revised): quadratic-midpoint smoothing (see
// strokeSmoothing.ts) applies ONLY to the clean-line instruments --
// Pencil/Pen/Marker -- where it removes the "crude/angular" kinks a fast
// handwritten gesture produces from lineTo-per-sample. Mop and Spray are
// deliberately NOT clean-line materials (Mop's identity is a continuous
// pass plus discrete dabs at the RECORDED points; Spray is a deposit field)
// -- routing their own background passes through this same smoothing
// broke Mop's accepted V3 character (the dabs, still placed at raw
// points, no longer lined up with the now-curved background stroke).
// Pointer-sample density (coalescing) is a separate, earlier layer and
// still applies to every supply -- see the pointermove handler below.
function path(context: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]): void {
  const scaled = points.map((point) => docToScreen(point));
  context.beginPath();
  traceSmoothedPath(context, scaled);
}

// The plain, un-smoothed polyline -- Mop's own background pass (so it stays
// geometrically aligned with resolveMopDabPlan's dabs, which are placed at
// the same raw recorded points) and Spray's new macro core pass (below).
function rawPath(context: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]): void {
  const scaled = points.map((point) => docToScreen(point));
  context.beginPath();
  context.moveTo(scaled[0].x, scaled[0].y);
  for (const point of scaled.slice(1)) context.lineTo(point.x, point.y);
}

function drawOperation(operation: BlackbookOperation): void {
  const { points } = operation;
  if (points.length < 2) return;
  const materialId = operation.operation === "pencil" ? "graphite"
    : operation.operation === "pen" ? "ink"
    : operation.operation === "marker" ? "marker"
    : operation.operation === "mop" ? "mop"
    : operation.operation === "spray" ? "spray"
    : "graphite"; // eraser targets graphite only
  const materialCtx = materialLayers[materialId].context;
  if (operation.operation === "mop") {
    drawMopStroke(materialCtx, points, operation.style);
    return;
  }
  if (operation.operation === "spray") {
    // Calibration V1 Revision 11: `operation.id` alone, not
    // `markId ?? id` -- see the identical fix (and full rationale) in
    // surfaceDrawingRuntime.js's _drawStroke. `operation.id` is assigned
    // once and never reassigned; `markId` is set later, asynchronously,
    // once persistence completes, which would otherwise silently reroll
    // this Mark's deterministic deposition the instant that happens.
    drawSprayStroke(materialCtx, points, operation.style, operation.id);
    return;
  }
  // Graphite Pencil V1: Pencil gets its own deterministic graphite render
  // treatment (strokeGraphite, strokeSmoothing.ts) instead of the flat
  // single-pass line Pen/Marker/Eraser still use below -- same seed-source
  // convention as Mop/Spray (operation.id, stable across the Mark's whole
  // lifecycle).
  if (operation.operation === "pencil") {
    materialCtx.save();
    const scaledStyle = { ...operation.style, width: operation.style.width * widthScale() };
    // Graphite Grades Foundation V1: resolve THIS Mark's own stored grade,
    // never the currently-selected UI grade -- an old Mark authored as 6B
    // must keep rendering as 6B even after the artist switches the
    // selector to HB for their next stroke. Legacy Marks (no variantId)
    // resolve to HB automatically (resolveGraphiteProfile's own fallback).
    const profile = resolveGraphiteProfile(operation.variantId);
    strokeGraphite(materialCtx, points.map((point) => docToScreen(point)), scaledStyle, operation.id, profile);
    materialCtx.restore();
    return;
  }
  // Ink Pen V1: Pen gets its own named material function (strokeInk,
  // strokeSmoothing.ts) instead of sharing Marker/Eraser's anonymous
  // generic block below -- pixel-identical to the previous rendering (same
  // single continuous pass), but now a real, findable, testable material
  // identity distinct from Pencil's graphite treatment.
  if (operation.operation === "pen") {
    materialCtx.save();
    const scaledStyle = { ...operation.style, width: operation.style.width * widthScale() };
    strokeInk(materialCtx, points.map((point) => docToScreen(point)), scaledStyle);
    materialCtx.restore();
    return;
  }
  materialCtx.save();
  materialCtx.lineCap = "round"; materialCtx.lineJoin = "round";
  path(materialCtx, points);
  if (operation.operation === "eraser") {
    materialCtx.globalCompositeOperation = "destination-out";
    materialCtx.lineWidth = operation.width * widthScale();
    materialCtx.globalAlpha = 1;
    materialCtx.strokeStyle = "#000";
  } else {
    materialCtx.globalCompositeOperation = "source-over";
    materialCtx.lineWidth = operation.style.width * widthScale();
    materialCtx.globalAlpha = operation.style.opacity;
    materialCtx.strokeStyle = operation.style.color;
  }
  materialCtx.stroke(); materialCtx.restore();
}

/**
 * Calibration V1 Revision 6: at close zoom, even with Revision 5's lateral
 * scatter, Mop's dabs still read as an identifiable sequence of stamps --
 * a close-up isolated render confirmed the combination of causes: dabs are
 * (a) a flat, hard-edged filled circle (no soft falloff, unlike Spray's
 * particles), (b) drawn at every resampled point with near-uniform size
 * (only the narrow 0.7x-1.25x speed-response range) and (c) at perfectly
 * regular spacing (the resampling that fixed Revision 3's continuity gaps).
 * A human eye reconstructs "the sampling path" from any of these alone;
 * together they made it unmistakable.
 *
 * Fix, targeting all three causes without hiding the layer behind more
 * opacity (kept as a real, architecturally separate deposition pass):
 * (a) dabs now use the SAME soft radial-gradient fill as Spray's particles
 *     (`fillSprayParticle`, already shared) instead of a flat circle --
 *     no hard edge to individually register.
 * (b) each dab's rendered radius AND alpha get their own independent
 *     deterministic jitter (`hash01` with different salts) on top of the
 *     existing speed response, so consecutive same-speed dabs no longer
 *     look near-identical.
 * (c) each dab has an independent, deterministic chance of being skipped
 *     entirely (`MOP_DAB_INCLUDE_PROBABILITY`), breaking the perfectly
 *     regular along-path rhythm the resampling otherwise guarantees --
 *     the resampling's overlap guarantee (Revision 3's actual fix) lives
 *     in the CONTINUOUS BODY stroke, not in the dab texture, so skipping
 *     dabs never reintroduces a body gap.
 *
 * Lateral scatter (Revision 5, still the fix for the "second centerline
 * track") is unchanged.
 */
const MOP_DAB_VISUAL_SCALE = 0.55;
const MOP_DAB_LATERAL_SCALE = 0.6;
const MOP_DAB_INCLUDE_PROBABILITY = 0.6;
const MOP_DAB_RADIUS_JITTER_RANGE = 0.5; // +/- 50% around the speed-response radius
const MOP_DAB_ALPHA_JITTER_RANGE = 0.45; // +/- 45% around the base alpha

function drawMopStroke(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  style: { readonly color: string; readonly width: number; readonly opacity: number },
): void {
  const scaledPoints = points.map((point) => docToScreen(point));
  const scaledWidth = style.width * widthScale();
  context.save();
  context.lineCap = "round"; context.lineJoin = "round";
  context.globalCompositeOperation = "source-over";
  rawPath(context, points);
  context.lineWidth = scaledWidth;
  context.globalAlpha = style.opacity * 0.92;
  context.strokeStyle = style.color;
  context.stroke();
  const dabs = resolveMopDabPlan(scaledPoints, scaledWidth * 0.5);
  const baseRadius = scaledWidth * 0.5;
  // Calibration V1 Revision 10 (dot-gesture fix, mirrored here for
  // consistency with the Map's identical fix): the random inclusion
  // probability and lateral scatter exist to break up a LONG stroke's
  // regular rhythm; applied to a dot (1-3 dabs total) they instead make it
  // a coin-flip whether the dab renders at all, and visibly off-center.
  const isDotLike = dabs.length <= 3;
  for (let index = 0; index < dabs.length; index += 1) {
    const dab = dabs[index];
    if (!isDotLike && hash01(dab.x, dab.y, 4) > MOP_DAB_INCLUDE_PROBABILITY) continue;
    const prev = dabs[index - 1] ?? dab;
    const next = dabs[index + 1] ?? dab;
    const tangentX = next.x - prev.x;
    const tangentY = next.y - prev.y;
    const tangentLength = Math.hypot(tangentX, tangentY) || 1;
    // Perpendicular to the local path direction -- rotate the tangent 90°.
    const perpX = -tangentY / tangentLength;
    const perpY = tangentX / tangentLength;
    const lateral = isDotLike ? 0 : hashLateralUnit(dab.x, dab.y) * baseRadius * MOP_DAB_LATERAL_SCALE;
    const radiusJitter = 1 + (hash01(dab.x, dab.y, 1) * 2 - 1) * MOP_DAB_RADIUS_JITTER_RANGE;
    const alphaJitter = 1 + (hash01(dab.x, dab.y, 2) * 2 - 1) * MOP_DAB_ALPHA_JITTER_RANGE;
    // Calibration V1 Revision 11: `fillMopDab` (a comparatively crisp
    // contact-edge fill), not `fillSprayParticle` (Spray's soft aerosol
    // falloff) -- see strokeSmoothing.ts's doc for the full rationale.
    fillMopDab(
      context,
      {
        x: dab.x + perpX * lateral,
        y: dab.y + perpY * lateral,
        radius: Math.max(0.3, dab.radius * MOP_DAB_VISUAL_SCALE * radiusJitter),
        alpha: Math.max(0, dab.alphaScale * 0.55 * alphaJitter),
      },
      style.color,
      style.opacity,
    );
  }
  context.restore();
}

/**
 * Calibration V1 Revision 4: two deposition scales, drawn in order.
 *
 * 1. CORE -- `resolveSprayCorePlan` (see sprayDeposition.ts): `corePasses`
 *    low-alpha, deterministically jittered CONTINUOUS strokes (one
 *    `moveTo`/`lineTo` chain + one `stroke()` call PER PASS -- never many
 *    separate short segment strokes; Revision 3 did that and the segments
 *    were shorter than the core's own line width, so each one rendered as
 *    a fat round blob, producing the "dotted/stamped pattern" regression).
 *    A continuous stroke has no regularly-spaced node artifact regardless
 *    of point count. No canvas blur anywhere (that was Revision 2's
 *    airbrush-glow problem).
 * 2. OVERSPRAY -- the existing deterministic particle field, the fine EDGE
 *    TEXTURE layer (not the primary stroke).
 *
 * Both passes read the SAME authored points and use independent seeded PRNG
 * streams from the same `seedSource`, so replay is pixel-identical.
 */
function drawSprayStroke(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  style: { readonly color: string; readonly width: number; readonly opacity: number },
  seedSource: string,
): void {
  const scaledPoints = points.map((point) => docToScreen(point));
  const seed = hashSeed(seedSource);
  const baseRadius = (style.width * widthScale()) * 0.5;

  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round"; context.lineJoin = "round";
  for (const pass of resolveSprayCorePlan(scaledPoints, baseRadius, seed)) {
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

  const plan = resolveSprayParticlePlan(scaledPoints, baseRadius, seed);
  context.save();
  context.globalCompositeOperation = "source-over";
  // Each particle is a soft radial gradient (see fillSprayParticle in
  // strokeSmoothing.ts) instead of a flat, hard-edged circle -- fine
  // texture around the core, not separately visible "stamps".
  for (const particle of plan) {
    fillSprayParticle(context, particle, style.color, style.opacity);
  }
  context.restore();
}

function activeOperation(points: readonly { x: number; y: number }[]): BlackbookOperation {
  if (activeSupply === "eraser") return { operation: "eraser", id: "active", points, width: PENCIL_ERASER_SUPPLY.defaultWidth };
  // Drawing Shell V1: color now comes from the live COLOR control (per-supply
  // remembered, seeded from the SAME canonical DRAWING_DEFAULT_COLORS Map
  // reads) instead of a fixed per-supply constant -- changing color only
  // ever affects the NEXT authored Mark; already-persisted Marks keep their
  // own already-authored `style.color` untouched.
  return {
    operation: activeSupply,
    id: "active",
    points,
    style: { color: colorControl.value, width: Number(widthControl.value), opacity: Number(opacityControl.value) },
    // Graphite Grades Foundation V1: only Pencil carries a grade; every
    // other supply is unaffected.
    ...(activeSupply === "pencil" ? { variantId: activeGraphiteGrade, profileVersion: GRAPHITE_PROFILE_VERSION } : {}),
  };
}

// Blackbook Spatial Workspace V1: pointer capture now goes through the
// workspace camera instead of dividing by the canvas's own displayed size --
// this is what lets a captured point land outside [0,1] (off the page) when
// the artist has panned/zoomed, while an unrotated/unpanned canvas at
// zoom=1 would only ever have mapped a click inside the element to [0,1]
// anyway. VIEW transform only -- never touches persisted geometry.
function point(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return screenToDoc(event.clientX - rect.left, event.clientY - rect.top);
}

const persistence = createBlackbookArtworkPersistenceBridge({
  repository,
  drawing: {
    bindArtwork(stroke, artworkId, markId, creatorId, surfaceId) {
      Object.assign(stroke, { artworkId, markId, creatorId, surfaceId });
      return operations.includes(stroke);
    },
  },
  getAuthenticatedMemberId: () => memberState.status === "signedIn" ? memberState.member.uid : null,
});

function hydrate(artworks: readonly Artwork[]): void {
  operations = artworks
    .filter((artwork) => artwork.surfaceId === BLACKBOOK_PAGE_SURFACE_ID && artwork.state === "draft")
    .flatMap((artwork) => artwork.marks.flatMap((mark): BlackbookOperation[] => mark.type === "stroke" && mark.geometry.format === "local-2d-stroke-v1" ? [{
      operation: mark.material?.supplyId === "pen" ? "pen" : mark.material?.supplyId === "marker" ? "marker" : mark.material?.supplyId === "mop" ? "mop" : mark.material?.supplyId === "spray" ? "spray" : "pencil",
      id: `blackbook-mark-${mark.id}`,
      artworkId: artwork.id,
      markId: mark.id,
      creatorId: artwork.creatorId,
      surfaceId: artwork.surfaceId,
      points: mark.geometry.points,
      style: mark.style,
      // Graphite Grades Foundation V1: carry this Mark's OWN stored grade
      // through hydration so drawOperation renders it with the grade it was
      // actually authored with, not whatever grade is currently selected.
      ...(mark.material?.variantId !== undefined && mark.material?.profileVersion !== undefined
        ? { variantId: mark.material.variantId, profileVersion: mark.material.profileVersion }
        : {}),
    }] : mark.type === "material-erasure" && mark.geometry.format === "local-2d-erasure-v1" ? [{ operation: "eraser", id: `blackbook-mark-${mark.id}`, artworkId: artwork.id, markId: mark.id, creatorId: artwork.creatorId, surfaceId: artwork.surfaceId, points: mark.geometry.points, width: mark.width }] : []));
  const knownArtworks = artworks.filter((artwork) => artwork.surfaceId === BLACKBOOK_PAGE_SURFACE_ID);
  // Blackbook Default Page Format: an OLD Artwork's own authored page frame
  // remains authoritative -- resolve THIS session's page frame from
  // whatever was actually persisted, never silently substitute the current
  // canonical default for existing content. Proximity grouping can split
  // one page's content across several Artwork documents; they all share
  // one authored page, so the first persisted pageFrame found is correct.
  // Brand-new/legacy content with no persisted pageFrame at all falls back
  // to today's canonical default (BLACKBOOK_PAGE_FRAME).
  activePageFrame = knownArtworks.find((artwork) => artwork.pageFrame)?.pageFrame ?? BLACKBOOK_PAGE_FRAME;
  persistence.replaceKnownArtworks(knownArtworks);
  fitPageIntoView();
  render();
}

// Blackbook Spatial Workspace V1: the smallest interaction consistent with
// Blank Canvas's own pattern -- a PAN toggle button switches the SAME
// pointer gesture between drawing and navigating, so drawing and navigation
// can never occur simultaneously (requirement 7). Wheel-zoom is always
// active regardless of mode, exactly like Blank.
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  if (panMode) {
    lastScreenPoint = { x: event.clientX, y: event.clientY };
    return;
  }
  if (memberState.status !== "signedIn") return;
  activePoints = [point(event)];
  render();
});
canvas.addEventListener("pointermove", (event) => {
  if (!canvas.hasPointerCapture(event.pointerId)) return;
  if (panMode) {
    if (lastScreenPoint) {
      cameraView.panBy(event.clientX - lastScreenPoint.x, event.clientY - lastScreenPoint.y);
    }
    lastScreenPoint = { x: event.clientX, y: event.clientY };
    render();
    return;
  }
  if (memberState.status !== "signedIn") return;
  // Calibration V1: browsers batch several real pointer samples into one
  // "coalesced" move event during a fast gesture; reading only the event's
  // own final position (the old behavior) silently drops those in-between
  // samples, producing a coarser/more angular recorded path exactly when
  // the hand is moving fastest. getCoalescedEvents (where supported) hands
  // back every batched sample so no authored point is lost. This changes
  // only how many points are RECORDED, not any interpolation/smoothing.
  const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
  const samples = coalesced.length > 0 ? coalesced : [event];
  for (const sample of samples) activePoints.push(point(sample));
  render();
});
canvas.addEventListener("pointerup", (event) => {
  if (!canvas.hasPointerCapture(event.pointerId)) return;
  canvas.releasePointerCapture(event.pointerId);
  if (panMode) { lastScreenPoint = null; return; }
  if (activePoints.length > 1) {
    const operation = { ...activeOperation(activePoints), id: `blackbook-operation-${nextOperationId++}` } as BlackbookOperation;
    operations.push(operation);
    void persistence.persistStroke(operation).catch((error) => { status.textContent = error instanceof Error ? error.message : "Artwork save failed"; });
  }
  activePoints = [];
  render();
});

undoButton.addEventListener("click", () => {
  const operation = operations.pop();
  if (!operation) return;
  render();
  void persistence.removeStroke(operation).catch((error) => { status.textContent = error instanceof Error ? error.message : "Undo failed"; });
});

panButton.addEventListener("click", () => {
  panMode = !panMode;
  render();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = Math.exp(-event.deltaY * 0.0015);
  cameraView.zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor, width(), height(), MIN_ZOOM, MAX_ZOOM);
  render();
}, { passive: false });

window.addEventListener("resize", () => {
  resizeCanvasesToDisplaySize();
  render();
});

function selectSupply(supply: DrawingSupplyId | "eraser"): void {
  activeSupply = supply;
  if (supply !== "eraser") {
    const range = DRAWING_WIDTH_RANGES[supply];
    widthControl.min = String(range.min);
    widthControl.max = String(range.max);
    widthControl.value = String(supplySettings[supply].width);
    opacityControl.value = String(supplySettings[supply].opacity);
    colorControl.value = supplySettings[supply].color;
  }
  render();
}

function rememberSupplySettings(): void {
  if (activeSupply === "eraser") return;
  supplySettings[activeSupply].width = Number(widthControl.value);
  supplySettings[activeSupply].opacity = Number(opacityControl.value);
  supplySettings[activeSupply].color = colorControl.value;
}

gradeSelect.addEventListener("change", () => {
  const value = gradeSelect.value;
  if ((GRAPHITE_GRADE_ORDER as readonly string[]).includes(value)) activeGraphiteGrade = value as GraphiteGradeId;
});
pencilButton.addEventListener("click", () => selectSupply("pencil"));
penButton.addEventListener("click", () => selectSupply("pen"));
markerButton.addEventListener("click", () => selectSupply("marker"));
mopButton.addEventListener("click", () => selectSupply("mop"));
sprayButton.addEventListener("click", () => selectSupply("spray"));
eraserButton.addEventListener("click", () => { activeSupply = "eraser"; render(); });
colorControl.addEventListener("input", rememberSupplySettings);
widthControl.addEventListener("input", rememberSupplySettings);
opacityControl.addEventListener("input", rememberSupplySettings);
widthControl.min = String(DRAWING_WIDTH_RANGES.pencil.min);
widthControl.max = String(DRAWING_WIDTH_RANGES.pencil.max);
widthControl.value = String(PENCIL_SUPPLY.defaultSettings.width);
opacityControl.value = String(PENCIL_SUPPLY.defaultSettings.opacity);
colorControl.value = DRAWING_DEFAULT_COLORS.pencil;

memberButton.addEventListener("click", () => {
  if (memberState.status === "signedIn") void memberIdentity.signOut();
  else void memberIdentity.signInWithGoogle();
});

memberIdentity.subscribe((state) => {
  memberState = state;
  memberButton.disabled = state.status === "initializing";
  memberButton.textContent = state.status === "signedIn" ? "SIGN OUT" : state.status === "initializing" ? "…" : "SIGN IN";
  status.textContent = state.status === "signedIn" ? BLACKBOOK_PAGE_SURFACE_ID : "Private page — sign in to draw";
  if (state.status === "signedIn") {
    void (repository.listOwnedArtwork ?? repository.listOwnedMapArtwork).call(repository, state.member.uid).then(hydrate).catch((error) => { status.textContent = error instanceof Error ? error.message : "Artwork hydration failed"; });
  } else {
    operations = [];
    activePageFrame = BLACKBOOK_PAGE_FRAME;
    persistence.replaceKnownArtworks([]);
    fitPageIntoView();
    render();
  }
});

resizeCanvasesToDisplaySize();
fitPageIntoView();
render();
void memberIdentity.start();
