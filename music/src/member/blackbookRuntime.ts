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
  createBlackbookArtworkPersistenceBridge,
  filterBlackbookArtworks,
  resolveActiveBlackbookArtworkId,
  toBlackbookMark,
  withActiveArtworkUrlParam,
  type BlackbookOperation,
} from "./blackbookArtworkBridge";
import { createCartesianCamera, type CartesianCamera, type DocRect } from "./cartesianWorkspaceCamera";
import { createCurrentArtworkSession } from "./currentArtworkSession";
import { numberArtworksForPagesDrawer, pickReplacementArtworkId } from "./artworkGallery";
import { drawArtworkThumbnail } from "./artworkThumbnail";
import {
  resolveGraphiteProfile,
  strokeGraphite,
  strokeInk,
  strokeMarker,
  strokeMop,
  strokeSpray,
  traceSmoothedPath,
  GRAPHITE_GRADE_ORDER,
  GRAPHITE_PROFILE_VERSION,
  type GraphiteGradeId,
} from "./strokeSmoothing";
import { resolveSprayCapProfile, DEFAULT_SPRAY_CAP_ID, STUDIORICH_STOCK_CAP, STUDIORICH_FAT_CAP } from "./sprayDeposition";
import { createBlackbookHomeSurface } from "../home/blackbookHomeSurface";

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }
const canvas = required(document.querySelector<HTMLCanvasElement>("#blackbook-page"), "blackbook_surface_missing");
const panButton = required(document.querySelector<HTMLButtonElement>("#blackbook-pan"), "blackbook_surface_missing");
const undoButton = required(document.querySelector<HTMLButtonElement>("#blackbook-undo"), "blackbook_surface_missing");
const clearButton = required(document.querySelector<HTMLButtonElement>("#blackbook-clear"), "blackbook_surface_missing");
const fitButton = required(document.querySelector<HTMLButtonElement>("#blackbook-fit"), "blackbook_surface_missing");
const newButton = required(document.querySelector<HTMLButtonElement>("#blackbook-new"), "blackbook_surface_missing");
const pagesToggleButton = required(document.querySelector<HTMLButtonElement>("#blackbook-pages-toggle"), "blackbook_surface_missing");
const pagesDrawer = required(document.querySelector<HTMLElement>("#pages-drawer"), "blackbook_surface_missing");
const pagesDrawerList = required(document.querySelector<HTMLElement>("#pages-drawer-list"), "blackbook_surface_missing");
const pagesDrawerNewButton = required(document.querySelector<HTMLButtonElement>("#pages-drawer-new"), "blackbook_surface_missing");
const pagesDrawerCollapseButton = required(document.querySelector<HTMLButtonElement>("#pages-drawer-collapse"), "blackbook_surface_missing");
const memberButton = required(document.querySelector<HTMLButtonElement>("#blackbook-member"), "blackbook_surface_missing");
const mapNavLink = required(document.querySelector<HTMLAnchorElement>("#map-nav-link"), "blackbook_surface_missing");
// HOST-03 -- explicit, query-based HOME detection (never bare window.self
// !== window.top; BLACKBOOK can have other iframe consumers). A no-op
// (isHome: false) in standalone BLACKBOOK and in any non-HOME embed.
const homeSurface = createBlackbookHomeSurface();
if (homeSurface.isHome) {
  mapNavLink.addEventListener("click", (event) => {
    event.preventDefault();
    homeSurface.requestNavigateToMap();
  });
}
/**
 * BLACKBOOK EVENT UI POLISH V1 -- the raw developer-facing Surface ID no
 * longer occupies permanent UI (requirement 14). `status` is now a
 * transient toast: `showStatus()` below is the only thing that writes to
 * it, and every "success" message clears itself automatically.
 */
const status = required(document.querySelector<HTMLElement>("#status-toast"), "blackbook_surface_missing");
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
/**
 * CONTEXTUAL MATERIAL CONTROLS (requirement 10) -- containers only, never
 * the inputs themselves, so hiding a control never has to touch its
 * remembered value (`supplySettings`) or its own change listener.
 */
const gradeContainer = required(document.querySelector<HTMLElement>("#blackbook-grade-container"), "blackbook_surface_missing");
const colorContainer = required(document.querySelector<HTMLElement>("#blackbook-color-container"), "blackbook_surface_missing");
const opacityContainer = required(document.querySelector<HTMLElement>("#blackbook-opacity-container"), "blackbook_surface_missing");
const capContainer = required(document.querySelector<HTMLElement>("#blackbook-cap-container"), "blackbook_surface_missing");
const capStockButton = required(document.querySelector<HTMLButtonElement>("#blackbook-cap-stock"), "blackbook_surface_missing");
const capFatButton = required(document.querySelector<HTMLButtonElement>("#blackbook-cap-fat"), "blackbook_surface_missing");

const ctx = required(canvas.getContext("2d"), "blackbook_canvas_unavailable");

/**
 * BLACKBOOK EVENT UI POLISH V1 -- quiet transient save/error feedback
 * (requirement 14), replacing the old permanent status line. "Saved"
 * (and any other non-error message) clears itself; an error stays until
 * the next status change so it remains actionable. Diagnostic detail for
 * a real failure still reaches the console (requirement 14's "preserve
 * useful diagnostic detail in the appropriate developer channel/log") --
 * this only controls what the MEMBER sees.
 */
let statusClearTimer: number | null = null;
function showStatus(message: string, kind: "info" | "success" | "error" = "info"): void {
  if (statusClearTimer !== null) window.clearTimeout(statusClearTimer);
  status.textContent = message;
  status.dataset.kind = kind;
  status.dataset.visible = "true";
  if (kind === "success") {
    statusClearTimer = window.setTimeout(() => { status.dataset.visible = "false"; }, 1400);
  }
}
function reportError(userMessage: string, error: unknown): void {
  console.error(`[blackbook] ${userMessage}`, error);
  showStatus(userMessage, "error");
}

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
/**
 * BLACKBOOK CLEAR + Single-Step Undo V1 -- set the instant CLEAR runs,
 * holding the pre-clear `operations` so exactly one UNDO can restore all
 * of them as a single logical action, regardless of how many Marks were
 * cleared (never a per-Mark undo stack). Invalidated (nulled) the moment
 * ANY other authoring action happens afterward -- a newly committed
 * stroke, or a second CLEAR -- so CLEAR's own undo is only ever available
 * while it is genuinely "the last action," the same single-level
 * semantics Undo already has for an individual stroke.
 */
let lastClearSnapshot: readonly BlackbookOperation[] | null = null;
interface CapturedPoint { readonly x: number; readonly y: number; readonly tMs?: number; readonly pressure?: number }
let activePoints: CapturedPoint[] = [];
/** BLACKBOOK Spray Physicality V1 -- the current gesture's own start time, reset on every pointerdown. Never persisted itself; only `tMs` (elapsed since this) is ever recorded on a point. */
let activeStrokeStartMs = 0;
let nextOperationId = 1;
/**
 * LIVE STROKE STABILITY V1 -- root cause of "mouse-up visibly reinterprets
 * the stroke": every deterministic material (Spray/Mop/Pencil/Marker) seeds
 * its own render from `operation.id` (see drawOperation's own seed-source
 * doc). The live in-progress preview previously always rendered under the
 * literal id "active", then pointerup swapped in a brand-new
 * `blackbook-operation-${n}` id for the SAME points the instant the
 * gesture ended -- reseeding the entire deterministic particle/dab field
 * to a completely different PRNG sequence at exactly the moment the
 * artist lifted the pointer. Fix: allocate the real, final id ONCE, at
 * pointerdown (before a single point is even captured), and use that same
 * id for every live-preview render AND as the committed Mark's own id --
 * never a second id, never a reseed.
 */
let activeOperationId: string | null = null;
/**
 * SPRAY PERSISTENCE V1 -- see the pointermove handler's own doc. 4000
 * points is far beyond any ordinary single Spray gesture's real raw point
 * count (confirmed live-testable ranges are in the low hundreds to low
 * thousands) while staying comfortably under the ~18,000-20,000-point
 * range where a real Spray Mark (tMs+pressure per point) was confirmed,
 * via direct Firestore-emulator repro against the real deployed rules, to
 * start hitting Firestore's own rules-evaluation resource limits.
 */
const MAX_SPRAY_RAW_POINTS = 4000;
let activeSupply: "pencil" | "pen" | "marker" | "mop" | "spray" | "eraser" = "pencil";
/**
 * Graphite Grades Foundation V1 -- TEMPORARY calibration selector state
 * only (see gradeSelect's own doc below). Controls which grade authors the
 * NEXT Pencil Mark; never mutates any already-authored Mark. Not the Art
 * Store, not "My Art Supplies" -- Pencil remains one Drawing Shell
 * instrument family; this is strictly "Pencil -> which grade" beneath it.
 */
let activeGraphiteGrade: GraphiteGradeId = "hb";
/**
 * BLACKBOOK Spray Physicality V1 -- TEMPORARY minimal cap selector state
 * (see capStockButton/capFatButton's own doc below), the smallest coherent
 * UI this batch's own instruction allows. Controls which SprayCapProfile
 * authors the NEXT Spray Mark; never mutates an already-authored Mark's own
 * persisted capId.
 */
let activeSprayCapId: string = DEFAULT_SPRAY_CAP_ID;
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
 * BLACKBOOK Workspace / Artboard Separation V1 -- Workspace is the open
 * authoring area: an effectively unconstrained dark backdrop, never a
 * bounded "sheet of paper." This function owns ONLY that backdrop fill --
 * it no longer paints any opaque region for the Artboard (see
 * renderArtboardOutline below for that). Never a Mark, never persisted,
 * never affects `composition.bounds`, never appears in a thumbnail as
 * Artwork content (requirement 5) -- exactly the same non-persistence
 * guarantee Blank Canvas's own `renderDots` already has.
 */
function renderWorkspace(): void {
  ctx.fillStyle = "#0f0d0b";
  ctx.fillRect(0, 0, width(), height());
}

/**
 * BLACKBOOK Workspace / Artboard Separation V1 -- the Artboard is the
 * finite presentation/export region (the existing artwork boundary,
 * `pageFrameRect()`/`activePageFrame`, UNCHANGED in position, dimensions,
 * and coordinate system -- only its PRESENTATION changes here). It is
 * represented as a subtle thin dotted boundary, never an opaque fill: the
 * Artboard is not a physical sheet of paper and must not read as the total
 * available creative world, or as something Artwork is clipped to. Marks
 * are drawn directly over the open Workspace regardless of whether they
 * fall inside or outside this outline -- this function draws ONLY the
 * indicator, never anything that could reinterpret or clip Artwork.
 */
function renderArtboardOutline(): void {
  const topLeft = docToScreen({ x: pageFrameRect().minX, y: pageFrameRect().minY });
  const bottomRight = docToScreen({ x: pageFrameRect().maxX, y: pageFrameRect().maxY });
  ctx.save();
  ctx.strokeStyle = "rgba(243,238,228,0.3)";
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.setLineDash([0.5, 5]);
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  ctx.restore();
}

function render(): void {
  renderWorkspace();
  for (const layer of Object.values(materialLayers)) layer.context.clearRect(0, 0, width(), height());
  for (const operation of operations) drawOperation(operation);
  if (activePoints.length > 1) drawOperation(activeOperation(activePoints));
  ctx.drawImage(materialLayers.graphite.canvas, 0, 0, width(), height());
  ctx.drawImage(materialLayers.mop.canvas, 0, 0, width(), height());
  ctx.drawImage(materialLayers.spray.canvas, 0, 0, width(), height());
  ctx.drawImage(materialLayers.ink.canvas, 0, 0, width(), height());
  ctx.drawImage(materialLayers.marker.canvas, 0, 0, width(), height());
  renderArtboardOutline();
  // BLACKBOOK CLEAR + Single-Step Undo V1 -- Undo must stay enabled right
  // after CLEAR even though `operations` is now empty (there's a pending
  // `lastClearSnapshot` to restore).
  undoButton.disabled = memberState.status !== "signedIn" || (operations.length === 0 && lastClearSnapshot === null);
  clearButton.disabled = memberState.status !== "signedIn" || operations.length === 0;
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
    materialCtx.save();
    const scaledStyle = { ...operation.style, width: operation.style.width * widthScale() };
    strokeMop(materialCtx, points.map((point) => docToScreen(point)), scaledStyle, operation.id);
    materialCtx.restore();
    return;
  }
  if (operation.operation === "spray") {
    // Calibration V1 Revision 11: `operation.id` alone, not
    // `markId ?? id` -- see the identical fix (and full rationale) in
    // surfaceDrawingRuntime.js's _drawStroke. `operation.id` is assigned
    // once and never reassigned; `markId` is set later, asynchronously,
    // once persistence completes, which would otherwise silently reroll
    // this Mark's deterministic deposition the instant that happens.
    materialCtx.save();
    const scaledStyle = { ...operation.style, width: operation.style.width * widthScale() };
    // BLACKBOOK Spray Physicality V1: docToScreen returns a fresh {x,y}
    // object -- tMs/pressure must be carried through explicitly, or every
    // Spray stroke would silently lose its velocity/pressure capture the
    // instant it's rendered.
    const sprayPoints = points as readonly { readonly x: number; readonly y: number; readonly tMs?: number; readonly pressure?: number }[];
    const screenPoints = sprayPoints.map((point) => ({ ...docToScreen(point), tMs: point.tMs, pressure: point.pressure }));
    strokeSpray(materialCtx, screenPoints, scaledStyle, operation.id, resolveSprayCapProfile(operation.capId));
    materialCtx.restore();
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
  // Marker Material Calibration V1: Marker gets its own named material
  // function (strokeMarker, strokeSmoothing.ts) instead of sharing
  // Eraser's anonymous generic block below -- same seed-source convention
  // (operation.id, stable across the Mark's whole lifecycle) already used
  // by Pencil/Mop/Spray.
  if (operation.operation === "marker") {
    materialCtx.save();
    const scaledStyle = { ...operation.style, width: operation.style.width * widthScale() };
    strokeMarker(materialCtx, points.map((point) => docToScreen(point)), scaledStyle, operation.id);
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

function activeOperation(points: readonly CapturedPoint[]): BlackbookOperation {
  // LIVE STROKE STABILITY V1 -- `activeOperationId` is allocated once, at
  // pointerdown, and reused verbatim through every live-preview render and
  // the final commit -- see its own doc above. Falls back to "active" only
  // if this is ever called with no gesture in progress (never happens on
  // the real pointerdown/move/up path, kept only as a defensive default).
  const id = activeOperationId ?? "active";
  if (activeSupply === "eraser") return { operation: "eraser", id, points, width: PENCIL_ERASER_SUPPLY.defaultWidth };
  // Drawing Shell V1: color now comes from the live COLOR control (per-supply
  // remembered, seeded from the SAME canonical DRAWING_DEFAULT_COLORS Map
  // reads) instead of a fixed per-supply constant -- changing color only
  // ever affects the NEXT authored Mark; already-persisted Marks keep their
  // own already-authored `style.color` untouched.
  return {
    operation: activeSupply,
    id,
    points,
    style: { color: colorControl.value, width: Number(widthControl.value), opacity: Number(opacityControl.value) },
    // Graphite Grades Foundation V1: only Pencil carries a grade; every
    // other supply is unaffected.
    ...(activeSupply === "pencil" ? { variantId: activeGraphiteGrade, profileVersion: GRAPHITE_PROFILE_VERSION } : {}),
    // BLACKBOOK Spray Physicality V1: only Spray carries a capId.
    ...(activeSupply === "spray" ? { capId: activeSprayCapId } : {}),
  };
}

// Blackbook Spatial Workspace V1: pointer capture now goes through the
// workspace camera instead of dividing by the canvas's own displayed size --
// this is what lets a captured point land outside [0,1] (off the page) when
// the artist has panned/zoomed, while an unrotated/unpanned canvas at
// zoom=1 would only ever have mapped a click inside the element to [0,1]
// anyway. VIEW transform only -- never touches persisted geometry.
/**
 * BLACKBOOK Spray Physicality V1 -- `tMs`/`pressure` are captured ONLY for
 * Spray (per this batch's own "strictly on Spray" scope), and only
 * `tMs`/`pressure` -- never tilt/twist/pointerType, per this batch's own
 * "do not blindly persist every browser PointerEvent property" instruction.
 * `tMs` is elapsed ms since `activeStrokeStartMs` (this gesture's own first
 * point, reset on every pointerdown) -- never `Date.now()`/wall-clock
 * itself, so replay is unaffected by when a Mark is later reopened.
 */
function point(event: PointerEvent): CapturedPoint {
  const rect = canvas.getBoundingClientRect();
  const doc = screenToDoc(event.clientX - rect.left, event.clientY - rect.top);
  if (activeSupply !== "spray") return doc;
  return { ...doc, tMs: performance.now() - activeStrokeStartMs, pressure: event.pressure };
}

/**
 * BLACKBOOK PAGE ISOLATION V1 -- explicit active-Artwork identity. THE
 * SESSION CHOOSES THE ARTWORK (same invariant `currentArtworkSession.ts`
 * already established for Map): `getCurrentArtworkTarget` below replaces
 * the legacy proximity-based routing entirely, so a Mark always lands on
 * `currentArtwork`'s own explicit target, never "whichever nearby
 * document Surface grouping happens to pick".
 */
const currentArtwork = createCurrentArtworkSession();
/**
 * Every Blackbook Artwork this signed-in member owns (surfaceId-filtered),
 * kept current by `hydrate()` and by every successful persist
 * (`onArtworkSaved`/`onArtworkRemoved`) -- NOT the rendered page itself.
 * `applyActiveArtwork()` is what decides which ONE of these is on screen.
 */
let knownArtworksCache: readonly Artwork[] = [];

function upsertKnownArtwork(artwork: Artwork): void {
  knownArtworksCache = [...knownArtworksCache.filter((known) => known.id !== artwork.id), artwork];
}
function forgetKnownArtwork(artworkId: string): void {
  knownArtworksCache = knownArtworksCache.filter((known) => known.id !== artworkId);
}

function activeArtworkStorageKey(memberId: string): string {
  return `studiorich:blackbook:active-artwork:${memberId}`;
}
/** Per-device "last opened page" memory only -- never shared/synced, never authoritative over Firestore, purely which page reopens by default. */
function readRememberedActiveArtworkId(memberId: string): string | null {
  try { return window.localStorage.getItem(activeArtworkStorageKey(memberId)); } catch { return null; }
}
function rememberActiveArtworkId(memberId: string, artworkId: string): void {
  try { window.localStorage.setItem(activeArtworkStorageKey(memberId), artworkId); } catch { /* best-effort only */ }
}

/**
 * NEW ARTWORK PERSISTENCE V1 -- the ONE place this runtime ever changes
 * which Artwork identity is authoritative, so `openArtwork()` (MY PAGES /
 * the `?artwork=` URL param) and `onCurrentArtworkEstablished` (a pending
 * NEW target's first Mark materializing into a real persisted Artwork)
 * can never diverge on what "the current Artwork" means. Root cause this
 * exists to fix: `onCurrentArtworkEstablished` previously updated
 * `currentArtwork`'s in-memory state and `localStorage`'s remembered id,
 * but NEVER the URL's own `?artwork=` param. If that URL param already
 * named a DIFFERENT (the previous) Artwork -- the normal case, since
 * opening Blackbook at all typically already resolves and writes some
 * `?artwork=<id>` -- a reload's own `resolveActiveBlackbookArtworkId`
 * prefers the URL over `localStorage` (see that function's own doc),
 * silently reverting to the stale previous Artwork and making the newly
 * materialized one (and everything drawn on it) appear to vanish on
 * reload, even though it was genuinely persisted in Firestore the whole
 * time. Only the URL/localStorage/in-memory identity was ever wrong; nothing about persistence itself.
 */
function setActiveArtworkIdentity(artworkId: string): void {
  currentArtwork.setCurrentArtwork(artworkId);
  if (memberState.status !== "signedIn") return;
  rememberActiveArtworkId(memberState.member.uid, artworkId);
  // HOST-03 -- when HOME-hosted, HOME owns the top-level URL/history; this
  // reports the already-changed identity for HOME's own replaceState sync
  // instead of writing this (iframe-local, invisible) document's own URL.
  // Standalone/non-HOME keeps the original same-document URL sync exactly
  // as before.
  if (homeSurface.isHome) homeSurface.reportArtworkChange(artworkId);
  else window.history.replaceState(null, "", withActiveArtworkUrlParam(window.location.href, artworkId));
  // BLACKBOOK Embedded PAGES Drawer V1 -- keep the drawer's own selected-
  // card state in sync with whichever path just changed the active
  // Artwork (an explicit `openArtwork()`, or NEW's own pending-Artwork
  // materialization) -- only when the drawer is actually open, since a
  // closed drawer has nothing visible to update.
  if (pagesDrawer.dataset.open === "true") renderPagesDrawerList();
}

/**
 * BLACKBOOK CLEAR + Single-Step Undo V1 -- replaces `artworkId`'s ENTIRE
 * persisted `marks` array in ONE write (`repository.replaceOwnedArtworkMarks`,
 * never a loop of per-Mark append/remove calls -- CLEAR of a 500-Mark
 * Artwork is one logical, one-write action). Reuses `toBlackbookMark`
 * (the SAME encoder every ordinary stroke commit already uses) for each
 * operation, so a restored-via-Undo Mark is byte-identical to how it was
 * originally persisted. `op.markId` is used when a stroke's own append
 * has already resolved and bound it; falls back to the operation's own
 * client-side id only for the narrow window where CLEAR/UNDO race an
 * in-flight append (the SAME class of unresolved race the existing
 * single-stroke Undo already has -- not newly introduced here).
 */
function replaceArtworkMarks(artworkId: string, ops: readonly BlackbookOperation[]): Promise<Artwork> {
  if (memberState.status !== "signedIn") return Promise.reject(new Error("blackbook_clear_requires_sign_in"));
  if (!repository.replaceOwnedArtworkMarks) return Promise.reject(new Error("blackbook_clear_unsupported"));
  const marks = ops.map((operation) => toBlackbookMark(operation, operation.markId ?? operation.id));
  return repository.replaceOwnedArtworkMarks(artworkId, memberState.member.uid, marks);
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
  getCurrentArtworkTarget: () => currentArtwork.getState(),
  // NEW ARTWORK PERSISTENCE V1 -- see setActiveArtworkIdentity's own doc.
  // Never reset activePoints/re-render here: this fires mid-gesture (the
  // pending target's FIRST Mark is what establishes the Artwork), and the
  // gesture currently being drawn must keep rendering uninterrupted.
  onCurrentArtworkEstablished: setActiveArtworkIdentity,
  onArtworkSaved: upsertKnownArtwork,
  onArtworkRemoved: forgetKnownArtwork,
});

/** Maps ONE Artwork's own Marks to BlackbookOperations -- never another Artwork's, even one sharing the same Surface (the core invariant this build introduces). */
function marksToOperations(artwork: Artwork): BlackbookOperation[] {
  return artwork.marks.flatMap((mark): BlackbookOperation[] => mark.type === "stroke" && mark.geometry.format === "local-2d-stroke-v1" ? [{
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
    // BLACKBOOK Spray Physicality V1: carry this Mark's OWN stored cap
    // through hydration -- a legacy Spray Mark (no capId) resolves to the
    // Stock Cap via resolveSprayCapProfile's own fallback, never an error.
    ...(mark.material?.supplyId === "spray" && mark.material?.capId !== undefined
      ? { capId: mark.material.capId }
      : {}),
  }] : mark.type === "material-erasure" && mark.geometry.format === "local-2d-erasure-v1" ? [{ operation: "eraser", id: `blackbook-mark-${mark.id}`, artworkId: artwork.id, markId: mark.id, creatorId: artwork.creatorId, surfaceId: artwork.surfaceId, points: mark.geometry.points, width: mark.width }] : []);
}

/**
 * Renders EXACTLY the currently-active Artwork -- never a Surface-wide
 * merge. `pageFrame` comes from that SAME Artwork (requirement 6): each
 * Artwork's own persisted frame is independent of every other Artwork
 * that happens to share this Surface.
 */
function applyActiveArtwork(): void {
  const target = currentArtwork.getState();
  const active = target.kind === "artwork" ? knownArtworksCache.find((artwork) => artwork.id === target.artworkId) ?? null : null;
  operations = active ? marksToOperations(active) : [];
  activePageFrame = active?.pageFrame ?? BLACKBOOK_PAGE_FRAME;
  fitPageIntoView();
  render();
}

/**
 * Opens exactly one Blackbook Artwork by id -- the explicit selection
 * mechanism both the `?artwork=<id>` URL parameter (see
 * `resolveInitialActiveArtwork` below) and MY PAGES route through; there
 * is exactly one way this runtime ever changes the active Artwork.
 *
 * BLACKBOOK MY PAGES V1 (requirement 17) -- also keeps the URL's own
 * `?artwork=` parameter in sync via `history.replaceState`, never
 * `pushState`/a navigation: switching pages stays a same-session, no-
 * reload operation (`hydrate()` is not re-run), while a manual page
 * reload afterward still resolves to the same Artwork through the
 * now-current URL, not only through the `localStorage` fallback.
 */
function openArtwork(artworkId: string): void {
  if (memberState.status !== "signedIn") return;
  if (!knownArtworksCache.some((artwork) => artwork.id === artworkId)) return;
  setActiveArtworkIdentity(artworkId);
  activePoints = [];
  // BLACKBOOK CLEAR + Single-Step Undo V1 -- a pending clear-undo belongs
  // only to the Artwork it was cleared from; switching to a different
  // Artwork must never let it resurface later.
  lastClearSnapshot = null;
  applyActiveArtwork();
}

function resolveInitialActiveArtwork(): void {
  if (memberState.status !== "signedIn") return;
  const memberId = memberState.member.uid;
  const requestedId = new URLSearchParams(window.location.search).get("artwork");
  const rememberedId = readRememberedActiveArtworkId(memberId);
  const resolvedId = resolveActiveBlackbookArtworkId(knownArtworksCache, requestedId, rememberedId);
  if (resolvedId) {
    openArtwork(resolvedId);
  } else {
    // No Blackbook Artwork exists for this member yet -- arm a brand-new
    // page rather than leaving any previous state in place (requirement 9).
    currentArtwork.setPendingNewArtwork("map", "");
    applyActiveArtwork();
  }
}

function hydrate(artworks: readonly Artwork[]): void {
  knownArtworksCache = filterBlackbookArtworks(artworks);
  persistence.replaceKnownArtworks(knownArtworksCache);
  // HOST-03 -- report readiness BEFORE resolving the initial Artwork: once
  // resolved, `resolveInitialActiveArtwork` -> `openArtwork` ->
  // `setActiveArtworkIdentity` immediately reports the resolved identity to
  // HOME, which is only accepted once HOME's own navigation phase is
  // "active" -- i.e. after this readiness report.
  homeSurface.reportReady();
  resolveInitialActiveArtwork();
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
  activeStrokeStartMs = performance.now();
  // LIVE STROKE STABILITY V1 -- allocate the real, final id NOW, before the
  // first point is even captured, so live preview and the eventual commit
  // never differ in seed. See activeOperationId's own doc.
  activeOperationId = `blackbook-operation-${nextOperationId++}`;
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
  for (const sample of samples) {
    // SPRAY PERSISTENCE V1 -- a genuinely long/slow Spray gesture, now that
    // each point also carries tMs/pressure (roughly 3x a legacy {x,y}
    // point's own serialized size), can accumulate a raw points array large
    // enough to exceed Firestore's own per-write rules-evaluation resource
    // limits ("PERMISSION_DENIED: maximum of 1000 expressions..." /
    // "maximum allotted memory... reached") well before any product-level
    // cap on this file's own emission/particle counts is reached --
    // confirmed by direct repro against the Firestore emulator using the
    // real, currently-deployed rules (fails at 20,000 tMs/pressure points,
    // ~1.2MB serialized; a real Artwork document may already contain other
    // Marks, further eating into that budget). This stops RECORDING new
    // raw points once a gesture reaches a generous ceiling -- far beyond
    // any ordinary single gesture's real point count -- rather than
    // letting the persisted payload grow unbounded. Once frozen, already-
    // captured points (and everything already deposited from them) are
    // completely untouched -- this preserves the exact same
    // append/prefix-stability invariant the render-side fix already
    // established, it just also bounds growth at its source. Scoped to
    // Spray only, per this batch's own scope freeze.
    if (activeSupply === "spray" && activePoints.length >= MAX_SPRAY_RAW_POINTS) break;
    activePoints.push(point(sample));
  }
  render();
});
canvas.addEventListener("pointerup", (event) => {
  if (!canvas.hasPointerCapture(event.pointerId)) return;
  canvas.releasePointerCapture(event.pointerId);
  if (panMode) { lastScreenPoint = null; return; }
  if (activePoints.length > 1) {
    // LIVE STROKE STABILITY V1 -- reuse the SAME id the live preview just
    // rendered under; never allocate a new one here. See activeOperationId's
    // own doc for why a second id at this exact moment was the root cause
    // of the reported mouse-up reshuffle.
    const operation = activeOperation(activePoints);
    operations.push(operation);
    // BLACKBOOK CLEAR + Single-Step Undo V1 -- a newly committed stroke
    // means CLEAR is no longer "the last action" -- its own one-shot Undo
    // is no longer available (same single-level semantics as an ordinary
    // stroke's own ordinary Undo).
    lastClearSnapshot = null;
    showStatus("Saving…", "info");
    void persistence.persistStroke(operation)
      .then(() => showStatus("Saved", "success"))
      .catch((error) => reportError("Couldn't save that stroke", error));
  }
  activeOperationId = null;
  activePoints = [];
  render();
});

undoButton.addEventListener("click", () => {
  if (lastClearSnapshot !== null) {
    const restored = lastClearSnapshot;
    operations = [...restored];
    lastClearSnapshot = null;
    render();
    const target = currentArtwork.getState();
    if (target.kind === "artwork") {
      showStatus("Saving…", "info");
      void replaceArtworkMarks(target.artworkId, restored)
        .then(() => showStatus("Saved", "success"))
        .catch((error) => reportError("Undo didn't save", error));
    }
    return;
  }
  const operation = operations.pop();
  if (!operation) return;
  render();
  void persistence.removeStroke(operation)
    .then(() => showStatus("Saved", "success"))
    .catch((error) => reportError("Undo didn't save", error));
});

/**
 * BLACKBOOK CLEAR + Single-Step Undo V1 -- clears the CURRENT Artwork's
 * visible authored Marks as ONE logical, ONE-write action (never a loop
 * of per-Mark removals, which -- via `removeOwnedArtworkMark`'s own
 * documented "delete the whole document once its last Mark is removed"
 * behavior -- would destroy the Artwork itself, exactly what CLEAR must
 * never do). Preserves Artwork identity: no NEW, no URL change, no
 * `localStorage` change, no MY PAGES entry. Immediate, no confirmation --
 * Undo is the safety mechanism (see `lastClearSnapshot`'s own doc).
 * Pressing CLEAR on an already-empty Artwork (including a still-pending,
 * never-yet-materialized NEW page) is a safe no-op.
 */
function clearArtwork(): void {
  if (memberState.status !== "signedIn") return;
  if (operations.length === 0) return;
  const target = currentArtwork.getState();
  const previous = operations;
  operations = [];
  lastClearSnapshot = previous;
  render();
  if (target.kind !== "artwork") return; // nothing persisted yet to clear (defensive -- operations.length>0 already implies a real Artwork exists)
  showStatus("Saving…", "info");
  void replaceArtworkMarks(target.artworkId, [])
    .then(() => showStatus("Cleared", "success"))
    .catch((error) => reportError("Couldn't clear", error));
}
clearButton.addEventListener("click", clearArtwork);

panButton.addEventListener("click", () => {
  panMode = !panMode;
  render();
});

fitButton.addEventListener("click", () => {
  fitPageIntoView();
  render();
});

/**
 * BLACKBOOK PAGE ISOLATION V1 -- NEW. Deliberately does NOT delete/clear
 * the current Artwork: it only moves `currentArtwork`'s explicit target to
 * "pending", so the FIRST next Mark creates a brand-new Artwork document
 * (via the same `createArtwork` lifecycle every Blackbook Artwork already
 * goes through, always carrying the canonical 16:9 `pageFrame`) and
 * `onCurrentArtworkEstablished` promotes it to the new active Artwork.
 * The Artwork that was just active is untouched in Firestore, stays in
 * `knownArtworksCache`, and remains independently reopenable via
 * `openArtwork` -- not just "recoverable in theory", but genuinely
 * isolated: this session no longer renders or routes Marks to it at all
 * once NEW has moved on.
 */
function startNewPage(): void {
  if (memberState.status !== "signedIn") return;
  operations = [];
  activePoints = [];
  lastClearSnapshot = null;
  currentArtwork.setPendingNewArtwork("map", "");
  activePageFrame = BLACKBOOK_PAGE_FRAME;
  fitPageIntoView();
  showStatus("New page", "success");
  render();
}
newButton.addEventListener("click", startNewPage);

/**
 * BLACKBOOK Embedded PAGES Drawer V1 -- replaces MY PAGES' previous
 * modal/overlay with a permanent layout primitive (see blackbook.html's
 * own `#pages-drawer`/`#workspace` CSS doc). Still routes through the
 * SAME explicit active-Artwork architecture Page Isolation V1
 * introduced -- OPEN/SELECT only (no delete/rename/reorder here; V1
 * ordering is `sortArtworksByRecency`, the same presentation-only
 * ordering `artworkGallery.ts` already uses elsewhere, never a persisted
 * sequence). Cards are deliberately minimal: thumbnail + presentation-
 * order number only -- no timestamp/dimensions/mark-count/id. That data
 * is NOT deleted from the Artwork itself; it simply isn't surfaced as
 * primary drawer UI (per this batch's own requirement 4). Selecting a
 * card, or pressing "+", never closes the drawer -- it stays open across
 * navigation, matching this batch's own explicit requirement.
 */
const PAGES_DRAWER_THUMBNAIL_SIZE = { width: 76, height: 47 } as const;

function renderPagesDrawerList(): void {
  pagesDrawerList.replaceChildren();
  if (knownArtworksCache.length === 0) {
    const empty = document.createElement("p");
    empty.id = "pages-drawer-empty";
    empty.textContent = "No pages yet — press + to start your first sheet.";
    pagesDrawerList.append(empty);
    return;
  }
  const activeId = currentArtwork.getState();
  const activeArtworkId = activeId.kind === "artwork" ? activeId.artworkId : null;
  numberArtworksForPagesDrawer(knownArtworksCache).forEach(({ number: pageNumber, artwork }) => {
    // BLACKBOOK Artwork DELETE V1 -- the card is a plain group (never
    // itself a button) containing two SEPARATE, non-nested buttons: open
    // and delete. Nesting a delete <button> inside the open <button>
    // would be invalid HTML/ARIA and would make delete-clicks also fire
    // open.
    const item = document.createElement("div");
    item.className = "pages-drawer-item";
    item.setAttribute("aria-current", String(artwork.id === activeArtworkId));

    const open = document.createElement("button");
    open.type = "button";
    open.className = "pages-drawer-item-open";
    open.setAttribute("aria-label", `Page ${pageNumber}`);
    const thumbnail = document.createElement("canvas");
    thumbnail.width = PAGES_DRAWER_THUMBNAIL_SIZE.width;
    thumbnail.height = PAGES_DRAWER_THUMBNAIL_SIZE.height;
    const thumbnailCtx = thumbnail.getContext("2d");
    if (thumbnailCtx) {
      // BLACKBOOK CLEAR + Single-Step Undo V1 interaction: a cleared
      // Artwork has zero Marks -- `drawArtworkThumbnail` draws nothing
      // more on top of this fill, which is exactly the sensible blank
      // preview a cleared/empty page should show (never a stale/stretched
      // leftover image, never a crash).
      thumbnailCtx.fillStyle = "#f3eee4";
      thumbnailCtx.fillRect(0, 0, thumbnail.width, thumbnail.height);
      drawArtworkThumbnail(thumbnailCtx, artwork, PAGES_DRAWER_THUMBNAIL_SIZE);
    }
    const number = document.createElement("span");
    number.className = "pages-drawer-item-number";
    // Presentation order only -- never the Artwork's own id/identity.
    number.textContent = String(pageNumber);
    open.append(thumbnail, number);
    open.addEventListener("click", () => openArtwork(artwork.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "pages-drawer-item-delete";
    deleteButton.setAttribute("aria-label", `Delete page ${pageNumber}`);
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void confirmAndDeleteArtwork(artwork.id, pageNumber);
    });

    item.append(open, deleteButton);
    pagesDrawerList.append(item);
  });
}

/**
 * BLACKBOOK Artwork DELETE V1 -- a first-class, explicit Artwork-lifecycle
 * operation, never a side effect of removing Marks (see
 * `removeOwnedArtworkMark`'s own updated doc in firestoreArtworkRepository.ts
 * -- undoing your way to zero Marks now behaves like CLEAR, preserving
 * the Artwork; only this function ever removes an Artwork document).
 * Minimal native `window.confirm` -- destructive, so (unlike CLEAR)
 * requires confirmation; CANCEL performs zero mutation.
 *
 * Failure behavior: the repository call is awaited BEFORE any local state
 * changes -- the card is never removed, and no navigation away from the
 * active Artwork ever happens, unless the real Firestore delete already
 * succeeded. A failure reports an error and leaves everything exactly as
 * it was (no rollback needed because nothing was changed yet).
 *
 * Active-Artwork replacement uses the SAME canonical `openArtwork()`
 * (779af30's identity-sync path) or `startNewPage()` (the existing
 * pending-NEW lifecycle) every other navigation already uses -- never a
 * second URL/localStorage synchronization implementation.
 * `pickReplacementArtworkId` (artworkGallery.ts) is computed from the
 * book order captured BEFORE the deletion so the deleted Artwork's own
 * neighbors are still findable.
 */
async function confirmAndDeleteArtwork(artworkId: string, pageNumber: number): Promise<void> {
  if (memberState.status !== "signedIn") return;
  if (!window.confirm(`Delete this Artwork from your Blackbook? (Page ${pageNumber})`)) return;
  const artworksBeforeDeletion = knownArtworksCache;
  const activeId = currentArtwork.getState();
  const wasActive = activeId.kind === "artwork" && activeId.artworkId === artworkId;
  showStatus("Deleting…", "info");
  try {
    await repository.deleteOwnedArtwork(artworkId, memberState.member.uid);
  } catch (error) {
    reportError("Couldn't delete that page", error);
    return;
  }
  forgetKnownArtwork(artworkId);
  if (wasActive) {
    // setActiveArtworkIdentity (inside openArtwork) already clears
    // lastClearSnapshot on any identity change -- a stale clear-undo for
    // the just-deleted Artwork can never resurface here.
    const replacementId = pickReplacementArtworkId(artworksBeforeDeletion, artworkId);
    if (replacementId) openArtwork(replacementId);
    else startNewPage();
  } else {
    // A non-active Artwork was deleted -- the active Artwork's own
    // identity/Workspace/camera state is completely untouched; only the
    // drawer's own list/numbering needs to refresh.
    renderPagesDrawerList();
  }
  showStatus("Deleted", "success");
}

/**
 * Opening/closing the drawer changes ONLY `#workspace`'s own CSS flex
 * width -- `canvas.clientWidth`/`clientHeight` (what
 * `blackbookRuntime.ts`'s own `width()`/`height()` already read) change
 * as a result, so the existing `resizeCanvasesToDisplaySize()`/`render()`
 * pair (already the exact pair the native `window` `resize` listener
 * below calls) is invoked explicitly here too. `cameraView`'s own pan/
 * zoom state is untouched -- this is a VIEWPORT remap of the same
 * document-space Artwork, never a change to any Mark/PageFrame/Artboard
 * coordinate, exactly like an ordinary window resize already is.
 */
function openPagesDrawer(): void {
  renderPagesDrawerList();
  pagesDrawer.dataset.open = "true";
  pagesToggleButton.setAttribute("aria-pressed", "true");
  // PAGES DRAWER V1.1 -- no manual resize/render call here: the canvas's
  // own ResizeObserver (below) tracks its real box continuously through
  // the drawer's own CSS width transition and resyncs the backing store
  // at every step, which a single synchronous call at toggle time cannot
  // do (see that observer's own doc for the exact bug this replaces).
}
function closePagesDrawer(): void {
  pagesDrawer.dataset.open = "false";
  pagesToggleButton.setAttribute("aria-pressed", "false");
}
pagesToggleButton.addEventListener("click", () => {
  if (pagesDrawer.dataset.open === "true") closePagesDrawer();
  else openPagesDrawer();
});
// PAGES DRAWER V1.1 -- a second, drawer-local way to close it (the
// far-side toolbar toggle above is unchanged and still works). Only ever
// closes -- opening only ever happens via the toolbar toggle, matching
// this control's own "‹" collapse-only affordance.
pagesDrawerCollapseButton.addEventListener("click", closePagesDrawer);
pagesDrawerNewButton.addEventListener("click", () => {
  startNewPage();
  renderPagesDrawerList();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = Math.exp(-event.deltaY * 0.0015);
  cameraView.zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor, width(), height(), MIN_ZOOM, MAX_ZOOM);
  render();
}, { passive: false });

/**
 * PAGES DRAWER V1.1 -- root cause of the reported cursor/Mark mismatch
 * with the drawer open: `resizeCanvasesToDisplaySize()` sets the canvas's
 * BACKING STORE pixel dimensions (`canvas.width`/`height`) from its CSS
 * box (`canvas.clientWidth`/`clientHeight`) at the instant it's called.
 * `#pages-drawer`'s own `width` CSS transition means the canvas's CSS box
 * keeps changing for ~160ms AFTER the drawer toggles -- a single
 * synchronous resize+render call made at toggle time (the previous
 * `openPagesDrawer`/`closePagesDrawer` behavior) fixed the backing store
 * to whatever transitional width existed at that exact instant, not the
 * drawer's final, settled width. Once the transition finished, the
 * canvas's CSS box no longer matched its own backing store, so the
 * browser auto-scaled the (now differently-sized) canvas bitmap onto its
 * CSS box -- shifting/stretching every already-consistent
 * `docToScreen`/`screenToDoc` calculation (both already correctly read
 * live `canvas.clientWidth/Height`) by exactly that mismatch. This was
 * never a pointer-math bug; `point()`'s own `canvas.getBoundingClientRect()`
 * read was already correct at every call. It was a stale-backing-store
 * bug that only a render pass AFTER the box truly settles can fix.
 *
 * Fix: a `ResizeObserver` on the canvas element itself is the one
 * canonical mechanism for "the canvas's actual on-screen box changed, for
 * ANY reason" -- drawer open/close (at every frame of its transition, so
 * the backing store tracks the box continuously, not just once at the
 * start), a native window resize, an orientation change, or any future
 * layout change this file doesn't yet know about. This REPLACES the
 * previous plain `window` `resize` listener (a strict subset of what this
 * observer already covers) and the drawer toggle's own manual resize
 * calls (removed from `openPagesDrawer`/`closePagesDrawer` below) --
 * there is now exactly one place this app decides "the canvas box
 * changed, resync the backing store and re-render," derived from the
 * canvas's own real measured bounds, never a hardcoded drawer-width
 * offset.
 */
new ResizeObserver(() => {
  resizeCanvasesToDisplaySize();
  render();
}).observe(canvas);

/**
 * CONTEXTUAL MATERIAL CONTROLS (requirement 10) -- only currently supported
 * controls, per supply: Pencil (grade+color+width+opacity), Pen/Marker/Mop
 * (color+width+opacity), Spray (color+width -- existing supported controls
 * only, no opacity), Eraser (width only). Toggling visibility never touches
 * rendering or any remembered value.
 */
function updateContextualControls(supply: DrawingSupplyId | "eraser"): void {
  gradeContainer.hidden = supply !== "pencil";
  colorContainer.hidden = supply === "eraser";
  opacityContainer.hidden = supply === "eraser" || supply === "spray";
  capContainer.hidden = supply !== "spray";
}

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
  updateContextualControls(supply);
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

function selectSprayCap(capId: string): void {
  activeSprayCapId = capId;
  capStockButton.setAttribute("aria-pressed", String(capId === STUDIORICH_STOCK_CAP.id));
  capFatButton.setAttribute("aria-pressed", String(capId === STUDIORICH_FAT_CAP.id));
}
capStockButton.addEventListener("click", () => selectSprayCap(STUDIORICH_STOCK_CAP.id));
capFatButton.addEventListener("click", () => selectSprayCap(STUDIORICH_FAT_CAP.id));
pencilButton.addEventListener("click", () => selectSupply("pencil"));
penButton.addEventListener("click", () => selectSupply("pen"));
markerButton.addEventListener("click", () => selectSupply("marker"));
mopButton.addEventListener("click", () => selectSupply("mop"));
sprayButton.addEventListener("click", () => selectSupply("spray"));
eraserButton.addEventListener("click", () => { activeSupply = "eraser"; updateContextualControls("eraser"); render(); });
colorControl.addEventListener("input", rememberSupplySettings);
widthControl.addEventListener("input", rememberSupplySettings);
opacityControl.addEventListener("input", rememberSupplySettings);
widthControl.min = String(DRAWING_WIDTH_RANGES.pencil.min);
widthControl.max = String(DRAWING_WIDTH_RANGES.pencil.max);
widthControl.value = String(PENCIL_SUPPLY.defaultSettings.width);
opacityControl.value = String(PENCIL_SUPPLY.defaultSettings.opacity);
colorControl.value = DRAWING_DEFAULT_COLORS.pencil;
updateContextualControls("pencil");

memberButton.addEventListener("click", () => {
  if (memberState.status === "signedIn") void memberIdentity.signOut();
  else void memberIdentity.signInWithGoogle();
});

memberIdentity.subscribe((state) => {
  memberState = state;
  memberButton.disabled = state.status === "initializing";
  memberButton.textContent = state.status === "signedIn" ? "SIGN OUT" : state.status === "initializing" ? "…" : "SIGN IN";
  if (state.status === "signedIn") {
    status.dataset.visible = "false";
    void (repository.listOwnedArtwork ?? repository.listOwnedMapArtwork).call(repository, state.member.uid).then(hydrate).catch((error) => reportError("Couldn't load your Blackbook", error));
  } else {
    showStatus("Private page — sign in to draw", "info");
    operations = [];
    activePageFrame = BLACKBOOK_PAGE_FRAME;
    knownArtworksCache = [];
    currentArtwork.clear();
    persistence.replaceKnownArtworks([]);
    closePagesDrawer();
    fitPageIntoView();
    render();
    // HOST-03 -- also a stable, interactive state (the existing "sign in to
    // draw" page), and readiness doesn't gate on auth resolving any more
    // than MAP's own MapboxViewportRuntime.onReady does; idempotent.
    homeSurface.reportReady();
  }
});

resizeCanvasesToDisplaySize();
fitPageIntoView();
render();
void memberIdentity.start();
