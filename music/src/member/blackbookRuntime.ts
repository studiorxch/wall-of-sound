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
  type BlackbookDrip,
  type BlackbookOperation,
  type BlackbookStroke,
} from "./blackbookArtworkBridge";
import { createCartesianCamera, type CartesianCamera, type DocRect } from "./cartesianWorkspaceCamera";
import { createStableMarkId } from "./mapArtworkBridge";
import { createRenderScheduler } from "./renderScheduler";
import { createHostAwareMemberIdentity } from "./hostAwareMemberIdentity";
import { createCurrentArtworkSession } from "./currentArtworkSession";
import { numberArtworksForPagesDrawer, pickReplacementArtworkId } from "./artworkGallery";
import { drawArtworkThumbnail } from "./artworkThumbnail";
import {
  paintSprayParticles,
  resolveGraphiteProfile,
  strokeGraphite,
  strokeInk,
  strokeMarker,
  strokeMaterialDrip,
  strokeMop,
  strokeSpray,
  traceSmoothedPath,
  GRAPHITE_GRADE_ORDER,
  GRAPHITE_PROFILE_VERSION,
  type GraphiteGradeId,
} from "./strokeSmoothing";
import {
  advanceSprayEmissionPoints,
  advanceSprayParticles,
  finalizeSprayParticles,
  resolveSprayCapProfile,
  resolveSprayDripPlans,
  hashSeed,
  DEFAULT_SPRAY_CAP_ID,
  STUDIORICH_STOCK_CAP,
  STUDIORICH_FAT_CAP,
  STUDIORICH_PRECISION_CAP,
  STUDIORICH_CALLIGRAPHY_CAP,
  type SprayCapProfile,
  type SprayEmissionCursor,
  type SprayParticle,
  type SprayParticleCursor,
} from "./sprayDeposition";
import { resolveMopDripPlans } from "./mopDeposition";
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
const capPrecisionButton = required(document.querySelector<HTMLButtonElement>("#blackbook-cap-precision"), "blackbook_surface_missing");
const capCalligraphyButton = required(document.querySelector<HTMLButtonElement>("#blackbook-cap-calligraphy"), "blackbook_surface_missing");

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

// MEMBER-01A -- standalone/embedded: unchanged, the same local authority
// as before. HOME-hosted: consumes the persistent parent's ONE live
// authority instead of constructing a second, competing one -- see
// hostAwareMemberIdentity.ts's own doc.
const memberIdentity = createHostAwareMemberIdentity(() => createFirebaseMemberIdentityAuthority(import.meta.env));
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

type MaterialLayerId = "graphite" | "ink" | "marker" | "mop" | "spray";
type MaterialLayerSet = Record<MaterialLayerId, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>;

function createMaterialLayerSet(): MaterialLayerSet {
  return Object.fromEntries(["graphite", "ink", "marker", "mop", "spray"].map((materialId) => {
    const layer = document.createElement("canvas");
    return [materialId, { canvas: layer, context: required(layer.getContext("2d"), "blackbook_material_canvas_unavailable") }];
  })) as MaterialLayerSet;
}

const materialLayers = createMaterialLayerSet();
/**
 * DRAWING LATENCY V1 -- `materialLayers` composites onto the visible canvas
 * every `render()` call; `committedLayers` is the same five-canvas shape
 * holding only COMMITTED (already pushed to `operations`) Marks' already-
 * rendered pixels. `render()` blits this (cheap) instead of re-running
 * every committed Mop/Spray Mark's deterministic deposition from scratch
 * on every `pointermove` -- see `rebuildCommittedCacheIfNeeded`'s own doc.
 * The deterministic generators themselves, and what gets PERSISTED, are
 * completely unaffected: this cache only ever holds the RESULT of calling
 * the same unchanged `drawOperation` this file always used.
 */
const committedLayers = createMaterialLayerSet();
/**
 * DRAWING LATENCY V1 -- one shared scratch canvas for the CURRENTLY ACTIVE
 * gesture's own incremental live preview (Mop/Spray only -- see
 * `advanceLivePreview`'s own doc). Only one gesture can ever be active at
 * once, so "mop" and "spray" safely alias the same canvas/context; this is
 * never persisted and never read by anything other than `render()`.
 */
const livePreviewCanvas = document.createElement("canvas");
const livePreviewContext = required(livePreviewCanvas.getContext("2d"), "blackbook_material_canvas_unavailable");
const livePreviewLayers: MaterialLayerSet = {
  graphite: materialLayers.graphite, ink: materialLayers.ink, marker: materialLayers.marker,
  mop: { canvas: livePreviewCanvas, context: livePreviewContext },
  spray: { canvas: livePreviewCanvas, context: livePreviewContext },
};

/** Keeps the visible canvas and every material layer's backing store in sync with the element's live CSS size (DPR-aware) -- mirrors blankCanvasRuntime.ts's `resizeCanvas`. Never re-frames the camera: an existing view must survive a viewport resize unchanged (requirement 2). */
function resizeCanvasesToDisplaySize(): void {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const layer of [...Object.values(materialLayers), ...Object.values(committedLayers), { canvas: livePreviewCanvas, context: livePreviewContext }]) {
    layer.canvas.width = Math.round(cssWidth * dpr);
    layer.canvas.height = Math.round(cssHeight * dpr);
    layer.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // DRAWING LATENCY V1 -- resizing a canvas element clears its own pixels
  // (a platform behavior, not something this file controls), so whatever
  // the committed cache/live preview held is now stale regardless of
  // camera state -- see render()'s own camera-signature check for the
  // general case; this covers the resize-without-a-camera-change case
  // explicitly (e.g. the PAGES drawer's own width transition).
  committedCacheDirty = true;
  liveBakedPointCount = 0;
  sprayEmissionCursor = null;
  sprayParticleCursor = null;
}

let operations: BlackbookOperation[] = [];
/**
 * DRAWING LATENCY V1 -- true whenever `committedLayers` no longer
 * reflects `operations` and must be fully rebuilt before the next
 * `render()` composites it (see `rebuildCommittedCacheIfNeeded`). Set
 * explicitly at every place `operations` is replaced/spliced other than
 * the single-committed-Mark append path (which updates `committedLayers`
 * incrementally instead -- see the `pointerup` handler) -- Undo, CLEAR,
 * CLEAR-undo, Pages/artwork switching, sign-out, and canvas resize.
 * Starts `true` so the very first `render()` populates the cache.
 */
let committedCacheDirty = true;
/**
 * DRAWING LATENCY V1 -- how many of the CURRENT gesture's own
 * `activePoints` have already been baked into `livePreviewCanvas`. Reset
 * to 0 (with the canvas cleared) at `pointerdown` and whenever the camera
 * (pan/zoom/viewport size) changes mid-gesture -- see `advanceLivePreview`.
 */
let liveBakedPointCount = 0;
/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- the current gesture's own
 * incremental Spray deposition cursors (null = nothing resolved yet this
 * gesture). `advanceLivePreview` threads FULL, growing `activePoints`
 * through these every frame (never a window slice) via
 * `advanceSprayEmissionPoints`/`advanceSprayParticles` -- each call
 * resumes the SAME seeded PRNG stream and emission walk instead of
 * restarting it, which is what eliminates the live-vs-canonical particle-
 * count divergence recon measured (~19.3% on a representative stroke).
 * Reset to null at exactly the same points `liveBakedPointCount` resets
 * to 0 (pointerdown, camera-signature change) plus pointerup, once
 * `beginSprayCanonicalBake` has read them -- never carried over into a
 * different gesture.
 */
let sprayEmissionCursor: SprayEmissionCursor | null = null;
let sprayParticleCursor: SprayParticleCursor | null = null;

/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- one just-committed Spray stroke's
 * still-in-progress canonical (soft-gradient) repaint. `pendingCanvas`
 * holds the EXACT pixels the live preview already showed at the moment of
 * pointer-up (copied, never repainted, so there is zero visible
 * difference the instant this bake begins) and is what `render()`
 * composites on top of `committedLayers.spray` for as long as this entry
 * exists. `bakeCanvas` starts blank and accumulates the real canonical
 * particles (gradient-filled, the expensive primitive recon identified)
 * in bounded per-frame chunks via `runSprayBakeFrame` -- invisible until
 * complete, at which point it's merged into `committedLayers.spray` in
 * one `drawImage` and this entry is dropped. Painting the canonical
 * gradient version onto a SEPARATE blank canvas (rather than layering it
 * additively on top of `pendingCanvas`'s own already-painted flat pixels)
 * is deliberate -- additive source-over blending would double-expose the
 * overlap instead of cleanly replacing it. A plain array (never more than
 * a small handful of entries in practice) rather than a single slot
 * because a fast artist CAN start and finish a short second Spray gesture
 * before a long first one's bake completes -- `operations` already
 * carries both in the correct order, and bakes are drained strictly FIFO
 * (oldest first) in `runSprayBakeFrame`, so a later merge never reorders
 * an earlier one.
 */
interface PendingSprayBake {
  readonly operationId: string;
  readonly pendingCanvas: HTMLCanvasElement;
  readonly bakeCanvas: HTMLCanvasElement;
  readonly bakeContext: CanvasRenderingContext2D;
  readonly screenPoints: readonly { readonly x: number; readonly y: number; readonly tMs?: number; readonly pressure?: number }[];
  readonly scaledStyle: { readonly color: string; readonly width: number; readonly opacity: number };
  readonly cap: SprayCapProfile;
  readonly particles: readonly SprayParticle[];
  corePassesPainted: boolean;
  nextParticleIndex: number;
}
let pendingSprayBakes: PendingSprayBake[] = [];
let sprayBakeFrameScheduled = false;
/** A conservative per-frame time budget for `runSprayBakeFrame`'s particle-painting chunk -- leaves headroom in a 16ms frame for everything else `render()` already does, on whatever hardware this runs on. Adaptive by construction (checked via `performance.now()`, never a guessed particle-count-per-frame constant) because the real per-particle gradient-fill cost this batch's own recon could not measure synthetically is exactly what determines how many particles actually fit in that time. */
const SPRAY_BAKE_FRAME_BUDGET_MS = 6;
/** How many particles `runSprayBakeFrame` paints before re-checking the time budget -- coarse enough to keep `performance.now()` call overhead negligible, fine enough that one frame is never overshot by more than this many particles' worth of paint time. */
const SPRAY_BAKE_CHECK_INTERVAL = 200;

let lastCameraSignature: string | null = null;
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

/**
 * DRAWING LATENCY V1 -- `docToScreen`'s projection depends on the camera's
 * pan/zoom and the viewport's own size; a cached raster is only valid for
 * the exact camera/size it was painted under. Rather than hunt down every
 * individual pan/zoom/resize call site, `render()` itself compares this
 * signature every call -- panning and drawing are already mutually
 * exclusive (`panMode`), so this never fires mid-gesture for the common
 * "actively dragging Mop/Spray" case this batch exists to fix; it only
 * (correctly, infrequently) forces a full rebuild on an actual camera/size
 * change, exactly matching today's existing per-frame replay cost for
 * that already-rare case -- never worse than before this batch.
 */
function currentCameraSignature(): string {
  const state = cameraView.getState();
  return `${state.panX}|${state.panY}|${state.zoom}|${width()}|${height()}`;
}

/**
 * DRAWING LATENCY V1 -- replays every committed operation into
 * `committedLayers` exactly once (never per-frame) whenever something
 * other than a single fresh commit changed the Mark set or the camera/
 * viewport invalidated the cached raster. Uses the exact same
 * `drawOperation` (and therefore the exact same deterministic
 * `strokeMop`/`strokeSpray`/etc.) every other render path already used --
 * this changes WHEN that work happens, never WHAT it computes.
 */
function rebuildCommittedCacheIfNeeded(): void {
  if (!committedCacheDirty) return;
  // SPRAY POINTER-UP RECONCILIATION V1 -- a wholesale Mark-set/viewport
  // change (Undo, CLEAR, Pages switching, resize, ...) is about to fully
  // replay `operations` below via the unchanged synchronous canonical
  // `drawOperation` path -- any spray bake still in flight is stale
  // either way (if its own operation was just removed, baking it in
  // would be wrong; if it's still present, the loop below already
  // re-bakes it canonically, synchronously). Dropping the queue here, in
  // this ONE place, is what keeps every `committedCacheDirty = true` call
  // site correct without having to individually remember to also clear it.
  pendingSprayBakes = [];
  for (const layer of Object.values(committedLayers)) layer.context.clearRect(0, 0, width(), height());
  for (const operation of operations) drawOperation(operation, committedLayers);
  committedCacheDirty = false;
}

/**
 * DRAWING LATENCY V1 -- the live, in-progress Mop gesture's own
 * incremental preview. `resolveMopDabPlan` is already proven (LIVE STROKE
 * STABILITY V1/V2) to depend only on LOCAL, segment-to-segment context --
 * never on the array's own total length/count beyond the emission-count
 * ceiling -- so calling it on a bounded trailing WINDOW of `activePoints`
 * (one point of overlap with whatever was already baked, for correct
 * segment continuity at the seam) produces the same local deposition a
 * full from-scratch call would, without re-walking and re-painting
 * everything already baked this gesture. The window is painted onto
 * `livePreviewCanvas`, which is never cleared mid-gesture -- each call
 * only adds the NEWLY arrived material, never regenerates the whole
 * gesture-so-far.
 *
 * SPRAY POINTER-UP RECONCILIATION V1 -- Spray's own live preview no
 * longer shares this windowed approach (see `advanceSprayLivePreview`
 * below) -- recon found the windowed particle field's own per-window PRNG
 * restart (plus the 1-point overlap's double emission) was producing a
 * live-accumulated particle set measurably denser (~19.3% on a
 * representative stroke) than the canonical single-stream computation,
 * which is exactly what made pointer-up's swap to canonical visibly
 * "redefine" the stroke on top of the (separately fixed) blocking paint
 * cost. Mop has no such divergence (it never restarts anything --
 * `resolveMopDabPlan` has no PRNG at all) and this batch's own scope is
 * Spray-only, so Mop's own preview is untouched here.
 */
function advanceLivePreview(): void {
  if (activeSupply !== "mop" && activeSupply !== "spray") return;
  if (activePoints.length <= liveBakedPointCount) return;
  if (activeSupply === "spray") {
    advanceSprayLivePreview();
    return;
  }
  const windowStart = Math.max(0, liveBakedPointCount - 1);
  const windowPoints = activePoints.slice(windowStart);
  liveBakedPointCount = activePoints.length;
  if (windowPoints.length < 2) return;
  drawOperation({ ...activeOperation(activePoints), points: windowPoints }, livePreviewLayers, "livePreview");
}

/** Converts the gesture's own authored `activePoints` into the screen-space points `drawOperation`'s own Spray branch feeds `strokeSpray` -- the exact same `docToScreen` + tMs/pressure-carry mapping, kept in sync by being the one shared helper both paths now call. */
function activeSprayScreenPoints(): readonly { readonly x: number; readonly y: number; readonly tMs?: number; readonly pressure?: number }[] {
  return activePoints.map((p) => ({ ...docToScreen(p), tMs: p.tMs, pressure: p.pressure }));
}

/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- replaces the windowed-restart
 * particle field with an incremental, cursor-based one that shares a
 * SINGLE continuous deterministic deposition authority with pointer-up's
 * own canonical finalize (`beginSprayCanonicalBake`), instead of each live
 * window and the eventual canonical bake independently resolving their
 * own particle sets. `sprayEmissionCursor`/`sprayParticleCursor` are
 * threaded through `advanceSprayEmissionPoints`/`advanceSprayParticles`
 * with the FULL, growing `activePoints` every call (never a slice) --
 * each resumes exactly where the previous call left off (same seeded PRNG
 * state, same emission walk), so only the segments/particles implied by
 * points captured since the LAST call are ever computed, keeping this
 * exactly as cheap per frame as the windowed approach it replaces, while
 * producing a particle set that is byte-identical (mod the one-time tail
 * flare `beginSprayCanonicalBake` alone adds) to what a single canonical
 * `resolveSprayParticlePlan` call over the same points would produce.
 * Only the newly-added particles are painted (flat fill, the primitive
 * 1003C already proved sufficiently cheap for live use) onto the never-
 * cleared `livePreviewCanvas` -- O(new particles), never O(total
 * particles). Core passes are resolved and painted exactly as before this
 * batch -- same per-window slice, routed through the SAME `strokeSpray`
 * core-pass logic every canonical caller already uses (via its own
 * `particles: []` override, so strokeSpray paints core passes only, never
 * re-resolving or re-painting the particle field itself) -- nothing about
 * core-pass behavior changes here.
 */
function advanceSprayLivePreview(): void {
  const operation = activeOperation(activePoints);
  if (operation.operation !== "spray") return;
  const cap = resolveSprayCapProfile(operation.capId);
  const scaledStyle = { ...operation.style, width: operation.style.width * widthScale() };
  const baseRadius = scaledStyle.width * 0.5;
  const screenPoints = activeSprayScreenPoints();

  const windowStart = Math.max(0, liveBakedPointCount - 1);
  const windowScreenPoints = screenPoints.slice(windowStart);
  liveBakedPointCount = activePoints.length;
  if (windowScreenPoints.length >= 2) {
    strokeSpray(livePreviewLayers.spray.context, windowScreenPoints, scaledStyle, operation.id, cap, { particles: [] });
  }

  const previousParticleCount = sprayParticleCursor?.particles.length ?? 0;
  sprayEmissionCursor = advanceSprayEmissionPoints(sprayEmissionCursor, screenPoints, baseRadius, cap);
  sprayParticleCursor = advanceSprayParticles(sprayParticleCursor, hashSeed(operation.id), sprayEmissionCursor, baseRadius, cap);
  const addedParticles = sprayParticleCursor.particles.slice(previousParticleCount);
  if (addedParticles.length === 0) return;
  const liveCtx = livePreviewLayers.spray.context;
  liveCtx.save();
  liveCtx.globalCompositeOperation = "source-over";
  paintSprayParticles(liveCtx, addedParticles, scaledStyle.color, scaledStyle.opacity, "flat");
  liveCtx.restore();
}

/** The one shared supply->material mapping `drawOperation` and `render` both need -- never duplicated. Eraser targets graphite only. */
function materialIdForSupply(supply: "pencil" | "pen" | "marker" | "mop" | "spray" | "eraser"): MaterialLayerId {
  return supply === "pencil" ? "graphite"
    : supply === "pen" ? "ink"
    : supply === "marker" ? "marker"
    : supply === "mop" ? "mop"
    : supply === "spray" ? "spray"
    : "graphite";
}

const MATERIAL_DRAW_ORDER: readonly MaterialLayerId[] = ["graphite", "mop", "spray", "ink", "marker"];

function render(): void {
  renderWorkspace();
  const cameraSignature = currentCameraSignature();
  if (cameraSignature !== lastCameraSignature) {
    lastCameraSignature = cameraSignature;
    committedCacheDirty = true;
    liveBakedPointCount = 0;
    sprayEmissionCursor = null;
    sprayParticleCursor = null;
    livePreviewContext.clearRect(0, 0, width(), height());
  }
  rebuildCommittedCacheIfNeeded();

  // DRAWING LATENCY V2 -- fixes e005906's own regression: that pass
  // unconditionally copied all five `committedLayers` into all five
  // `materialLayers` on EVERY render, even for materials nothing touched
  // that frame -- a flat compositing tax paid identically by every tool,
  // including Pencil/Pen/Marker/Eraser (which never needed the cache's
  // deposition-skipping benefit in the first place). Only the ONE
  // material actually being drawn into this frame (if any) needs the
  // extra committed+live compositing hop through `materialLayers`; every
  // other material's already-cached pixels go STRAIGHT onto the main
  // canvas, skipping `materialLayers` (and its own `clearRect`) entirely.
  const activeMaterialId: MaterialLayerId | null = activePoints.length > 1 ? materialIdForSupply(activeSupply) : null;

  for (const materialId of MATERIAL_DRAW_ORDER) {
    if (materialId !== activeMaterialId) {
      ctx.drawImage(committedLayers[materialId].canvas, 0, 0, width(), height());
      // SPRAY POINTER-UP RECONCILIATION V1 -- a just-lifted Spray stroke
      // whose canonical gradient bake hasn't finished yet still needs to
      // be VISIBLE (its own `pendingCanvas`, layered on top of the
      // committed cache it isn't part of yet) even when nothing is
      // actively being drawn this frame (`activeMaterialId` is null
      // between gestures). Every pending bake's own `pendingCanvas` holds
      // exactly the pixels the live preview already showed -- compositing
      // it here is never a new paint, only a cheap `drawImage` repeat.
      if (materialId === "spray") for (const bake of pendingSprayBakes) ctx.drawImage(bake.pendingCanvas, 0, 0, width(), height());
      continue;
    }
    const layer = materialLayers[materialId];
    layer.context.clearRect(0, 0, width(), height());
    layer.context.drawImage(committedLayers[materialId].canvas, 0, 0, width(), height());
    if (materialId === "spray") for (const bake of pendingSprayBakes) layer.context.drawImage(bake.pendingCanvas, 0, 0, width(), height());
    if (activeSupply === "mop" || activeSupply === "spray") {
      advanceLivePreview();
      layer.context.drawImage(livePreviewCanvas, 0, 0, width(), height());
    } else {
      // Pencil/Pen/Marker/Eraser's own `drawOperation` cost is cheap
      // (quadratic-smoothed path + one stroke(), no particle/dab
      // generation) -- recomputing it fresh every frame was never the
      // latency problem this V1/V2 pair exists to fix.
      drawOperation(activeOperation(activePoints), materialLayers);
    }
    ctx.drawImage(layer.canvas, 0, 0, width(), height());
  }
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

/**
 * DRAWING LATENCY V2 -- development-only counters proving the scheduler's
 * actual coalescing behavior, inspectable live (e.g. in Safari's own Web
 * Inspector console while drawing on iPad) via
 * `window.__blackbookRenderDiagnostics` -- never a `console.log` (no
 * production noise), and the whole block is gated on `import.meta.env.DEV`
 * so it has zero footprint in a production build. `scheduleCalls` counts
 * every `scheduleRender()` call (one per pointermove/wheel/resize
 * dispatch); `actualRenders` counts every real `render()` execution --
 * the ratio between them IS the measured coalescing factor.
 */
const renderDiagnostics = import.meta.env.DEV
  ? { scheduleCalls: 0, renderNowCalls: 0, actualRenders: 0 }
  : null;
if (renderDiagnostics) {
  (window as unknown as { __blackbookRenderDiagnostics?: typeof renderDiagnostics }).__blackbookRenderDiagnostics = renderDiagnostics;
}
const renderScheduler = createRenderScheduler(() => {
  if (renderDiagnostics) renderDiagnostics.actualRenders += 1;
  render();
});
/** Coalesces many triggers (pointermove/wheel/resize dispatches) within one frame interval into at most one real render -- see renderScheduler.ts's own doc for why this is the actual latency fix. */
function scheduleRender(): void {
  if (renderDiagnostics) renderDiagnostics.scheduleCalls += 1;
  renderScheduler.schedule();
}
/** Cancels any pending scheduled render and renders synchronously, right now -- every discrete state-changing action (pointerup, Undo, CLEAR, Pages/artwork switching, sign-out, a tool click) uses this so nothing stale can repaint obsolete state later. */
function renderNow(): void {
  if (renderDiagnostics) renderDiagnostics.renderNowCalls += 1;
  renderScheduler.renderNow();
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


/**
 * DRAWING LATENCY V1 -- `layers` lets callers target `materialLayers`
 * (the default -- the live visible-canvas-bound path, unchanged), the
 * cached `committedLayers` (cache rebuild/append), or the ephemeral
 * `livePreviewLayers` (the active gesture's own windowed preview). The
 * deterministic rendering math inside this function is completely
 * unaffected either way -- only WHICH canvas receives the result changes.
 */
/**
 * SPRAY LIVE PREVIEW PERFORMANCE V1 -- `renderMode` only ever changes
 * Spray's own particle paint (`strokeSpray`'s `particleRendering` option,
 * strokeSmoothing.ts) -- every other supply, and Spray's own deposition
 * plan/core passes/cap resolution, are completely unaffected by it.
 * `"canonical"` (the default) is what every existing call site already
 * used before this batch -- the committed-cache bake (pointerup,
 * rebuildCommittedCacheIfNeeded) and reload path never pass `"livePreview"`,
 * so their output is byte-identical to before. Only `advanceLivePreview`'s
 * own ephemeral window call opts into `"livePreview"`.
 */
function drawOperation(operation: BlackbookOperation, layers: MaterialLayerSet = materialLayers, renderMode: "canonical" | "livePreview" = "canonical"): void {
  const { points } = operation;
  if (points.length < 2) return;
  // BLACKBOOK Deterministic Drips β0.1 -- a drip renders on its OWN target
  // material's layer (mop/spray), never a third layer, so it visually
  // composites with (and z-orders alongside) that material exactly like an
  // ordinary Mop/Spray Mark. Rendering only ever replays this Mark's own
  // already-persisted/already-generated points (strokeMaterialDrip derives
  // taper purely from point index) -- no re-simulation happens here.
  if (operation.operation === "material-drip") {
    const dripCtx = layers[operation.targetMaterialId].context;
    dripCtx.save();
    const scaledStyle = { ...operation.style, width: operation.style.width * widthScale() };
    strokeMaterialDrip(dripCtx, points.map((point) => docToScreen(point)), scaledStyle, operation.targetMaterialId);
    dripCtx.restore();
    return;
  }
  const materialId = materialIdForSupply(operation.operation);
  const materialCtx = layers[materialId].context;
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
    strokeSpray(materialCtx, screenPoints, scaledStyle, operation.id, resolveSprayCapProfile(operation.capId), {
      particleRendering: renderMode === "livePreview" ? "flat" : "gradient",
    });
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
    // BLACKBOOK Deterministic Drips β0.1 -- Mop/Spray's own persisted Mark
    // id is pre-assigned HERE, synchronously, rather than left to
    // persistStroke's own createMarkId() fallback. This is what lets
    // createDripOperationsFor (pointerup, below) know the real originMarkId
    // a drip must reference -- and use it as a stable deterministic seed --
    // without waiting on an async persist round-trip. Every other supply is
    // unaffected (no drip seam exists for it).
    ...(activeSupply === "mop" || activeSupply === "spray" ? { markId: createStableMarkId() } : {}),
    style: { color: colorControl.value, width: Number(widthControl.value), opacity: Number(opacityControl.value) },
    // Graphite Grades Foundation V1: only Pencil carries a grade; every
    // other supply is unaffected.
    ...(activeSupply === "pencil" ? { variantId: activeGraphiteGrade, profileVersion: GRAPHITE_PROFILE_VERSION } : {}),
    // BLACKBOOK Spray Physicality V1: only Spray carries a capId.
    ...(activeSupply === "spray" ? { capId: activeSprayCapId } : {}),
  };
}

/**
 * BLACKBOOK Deterministic Drips β0.1 -- the one place a committed Mop/Spray
 * operation's own authored points turn into zero or more sibling
 * BlackbookDrip operations. Called synchronously at pointerup, BEFORE any
 * persistence call -- `operation.markId` is already pre-assigned (see
 * `activeOperation` above), so this never waits on an async round-trip, and
 * nothing else can be pushed onto `operations` between an origin and its
 * own drips (JS's single-threaded, synchronous execution is what keeps the
 * two always contiguous for `popLastGesture`'s own undo grouping below).
 * `operation.markId` doubles as this drip's own deterministic seed --
 * `hashSeed` is the same stable string->int hash Spray/Mop/Pencil/Marker's
 * own rendering already uses for their deterministic particle/dab fields.
 */
function createDripOperationsFor(operation: BlackbookOperation): BlackbookDrip[] {
  if (operation.operation !== "mop" && operation.operation !== "spray") return [];
  if (!operation.markId) return []; // defensive -- always pre-assigned above
  // Narrow explicitly into a local -- BlackbookOperation's shared
  // `operation` field spans several supply-specific literal sets, which
  // the guard above doesn't narrow cleanly through TS's own control-flow
  // analysis (BlackbookStroke's own `operation` type is itself a 5-literal
  // union, not a single discriminant literal).
  const targetMaterialId: "mop" | "spray" = operation.operation === "mop" ? "mop" : "spray";
  const originMarkId = operation.markId;
  const baseRadius = operation.style.width * 0.5;
  const seed = hashSeed(originMarkId);
  const plans = targetMaterialId === "mop"
    ? resolveMopDripPlans(operation.points, baseRadius, seed)
    : resolveSprayDripPlans(operation.points, baseRadius, seed, resolveSprayCapProfile(operation.capId));
  return plans.map((plan) => ({
    operation: "material-drip" as const,
    id: `blackbook-drip-${nextOperationId++}`,
    markId: createStableMarkId(),
    points: plan.points,
    originMarkId,
    targetMaterialId,
    style: { ...operation.style },
  }));
}

/**
 * BLACKBOOK Deterministic Drips β0.1 -- Undo's own grouping unit. A
 * gesture's origin operation and any drip operations it spawned are always
 * pushed onto `operations` contiguously, origin first (see
 * `createDripOperationsFor`'s own doc) -- so "the last authored gesture" is
 * simply the trailing run of `material-drip` operations plus the one
 * ordinary operation beneath them. This is what makes one Undo remove a
 * drip together with its originating Mark, never leaving it orphaned
 * (requirement 7), while an ordinary non-drip-producing gesture (nothing
 * trailing) still undoes exactly as it always did -- one operation, one step.
 */
function popLastGesture(): BlackbookOperation[] {
  const removed: BlackbookOperation[] = [];
  let next = operations[operations.length - 1];
  while (next && next.operation === "material-drip") {
    removed.unshift(operations.pop() as BlackbookOperation);
    next = operations[operations.length - 1];
  }
  if (next) removed.unshift(operations.pop() as BlackbookOperation);
  return removed;
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
  }] : mark.type === "material-erasure" && mark.geometry.format === "local-2d-erasure-v1" ? [{ operation: "eraser", id: `blackbook-mark-${mark.id}`, artworkId: artwork.id, markId: mark.id, creatorId: artwork.creatorId, surfaceId: artwork.surfaceId, points: mark.geometry.points, width: mark.width }]
  // BLACKBOOK Deterministic Drips β0.1 -- reconstructs a persisted drip
  // Mark back into its own BlackbookDrip operation on hydrate/reload,
  // exactly like every other Mark type here -- never regenerated, only
  // replayed from its own already-persisted points.
  : mark.type === "material-drip" && mark.geometry.format === "local-2d-drip-v1" ? [{ operation: "material-drip" as const, id: `blackbook-mark-${mark.id}`, artworkId: artwork.id, markId: mark.id, creatorId: artwork.creatorId, surfaceId: artwork.surfaceId, points: mark.geometry.points, originMarkId: mark.originMarkId, targetMaterialId: mark.targetMaterialId as "mop" | "spray", style: mark.style }]
  : []);
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
  // DRAWING LATENCY V1 -- the committed Mark SET just changed wholesale
  // (a different Artwork's own Marks, or none) -- never assume the
  // camera/viewport check in render() alone will catch this.
  committedCacheDirty = true;
  activePageFrame = active?.pageFrame ?? BLACKBOOK_PAGE_FRAME;
  fitPageIntoView();
  renderNow();
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
  // DRAWING LATENCY V1 -- a fresh gesture starts its own live-preview
  // accumulation from scratch (never reusing the PREVIOUS gesture's baked
  // pixels, even though the canvas object is shared -- see
  // livePreviewLayers' own doc).
  liveBakedPointCount = 0;
  livePreviewContext.clearRect(0, 0, width(), height());
  renderNow();
});
canvas.addEventListener("pointermove", (event) => {
  if (!canvas.hasPointerCapture(event.pointerId)) return;
  if (panMode) {
    if (lastScreenPoint) {
      cameraView.panBy(event.clientX - lastScreenPoint.x, event.clientY - lastScreenPoint.y);
    }
    lastScreenPoint = { x: event.clientX, y: event.clientY };
    scheduleRender();
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
  scheduleRender();
});
/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- replaces, for Spray only, the
 * single synchronous `drawOperation(operation, committedLayers)` call
 * pointer-up used to make. Recon measured that call's own canonical
 * particle paint (`createRadialGradient` x 18K-26K, in one blocking burst)
 * as the entire source of the reported ~5s pointer-up stall -- never
 * persistence, which remains fire-and-forget and unaffected by any of
 * this. Called synchronously from pointerup, AFTER `operations.push`,
 * BEFORE `activePoints`/the live cursors are reset -- the one place this
 * gesture's own incremental `sprayEmissionCursor`/`sprayParticleCursor`
 * are read before they're cleared for the next gesture.
 *
 * What makes this non-blocking without lowering `maxEmissionPoints` or
 * touching deposition behavior: the FINAL particle list is resolved here
 * (cheap -- `finalizeSprayParticles` only catches the cursor up on
 * whatever tail of points the live preview hadn't yet reached, then adds
 * the one-time tail flare), but PAINTING it with the real canonical
 * soft-gradient fill is deferred to `runSprayBakeFrame`'s bounded,
 * multi-frame chunks. In the meantime, `pendingCanvas` -- a COPY of
 * exactly the live-preview pixels already on screen, never a repaint --
 * is what `render()` shows in this stroke's place, so pointer-up itself
 * changes nothing visible; only once the background bake finishes does
 * the softer canonical fill quietly replace the flat one, at the same
 * particle positions.
 */
function beginSprayCanonicalBake(operation: BlackbookStroke): void {
  const cap = resolveSprayCapProfile(operation.capId);
  const scaledStyle = { ...operation.style, width: operation.style.width * widthScale() };
  const baseRadius = scaledStyle.width * 0.5;
  const screenPoints = activeSprayScreenPoints();
  const finalEmissionCursor = advanceSprayEmissionPoints(sprayEmissionCursor, screenPoints, baseRadius, cap);
  const particles = finalizeSprayParticles(sprayParticleCursor, hashSeed(operation.id), finalEmissionCursor, baseRadius, cap);

  const pendingCanvas = document.createElement("canvas");
  pendingCanvas.width = livePreviewCanvas.width;
  pendingCanvas.height = livePreviewCanvas.height;
  const pendingContext = required(pendingCanvas.getContext("2d"), "blackbook_material_canvas_unavailable");
  if (sprayEmissionCursor) {
    // The common case (any gesture lasting more than one animation frame,
    // i.e. virtually every real drag): the artist's eye was already on
    // exactly these pixels a moment ago -- copying them is cheaper than,
    // and pixel-identical to, repainting.
    pendingContext.drawImage(livePreviewCanvas, 0, 0);
  } else {
    // Rare edge case: a gesture so brief no render() ever ran between its
    // pointerdown and this pointerup, so `livePreviewCanvas` never
    // received a single live-preview frame for it (still showing
    // whatever the PREVIOUS gesture left on it, already cleared, or
    // blank). Fall back to one flat-filled paint of the SAME final
    // particles/core passes this bake will later repaint with gradient
    // fill -- the identical bounded primitive 1003C already proved cheap
    // enough for live use, just run once for the whole (necessarily
    // short -- no frame had time to fire) gesture instead of per-window.
    strokeSpray(pendingContext, screenPoints, scaledStyle, operation.id, cap, { particles, particleRendering: "flat" });
  }

  const bakeCanvas = document.createElement("canvas");
  bakeCanvas.width = livePreviewCanvas.width;
  bakeCanvas.height = livePreviewCanvas.height;
  const bakeContext = required(bakeCanvas.getContext("2d"), "blackbook_material_canvas_unavailable");

  pendingSprayBakes.push({
    operationId: operation.id,
    pendingCanvas,
    bakeCanvas,
    bakeContext,
    screenPoints,
    scaledStyle,
    cap,
    particles,
    corePassesPainted: false,
    nextParticleIndex: 0,
  });
  scheduleSprayBakeFrame();
}

/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- paints at most
 * `SPRAY_BAKE_FRAME_BUDGET_MS` worth of one pending bake's canonical
 * (soft-gradient) particles into its own blank `bakeCanvas`, resuming
 * across as many animation frames as the real on-device per-particle
 * paint cost (never measured synthetically -- see this batch's own recon)
 * turns out to need. Core passes are painted once, via the SAME
 * `strokeSpray` core-pass logic every other caller uses (`particles: []`
 * suppresses its own particle paint, since particles are this function's
 * own job, chunked). Processes `pendingSprayBakes` strictly FIFO -- the
 * oldest queued bake (the one that would otherwise block the longest)
 * always finishes first, and merging it into `committedLayers.spray`
 * (one `drawImage`, replacing that bake's own `pendingCanvas` contribution
 * with its now-complete canonical one) never reorders anything relative
 * to `operations`' own append order.
 */
function runSprayBakeFrame(): void {
  sprayBakeFrameScheduled = false;
  const bake = pendingSprayBakes[0];
  if (!bake) return;
  if (!bake.corePassesPainted) {
    strokeSpray(bake.bakeContext, bake.screenPoints, bake.scaledStyle, bake.operationId, bake.cap, { particles: [] });
    bake.corePassesPainted = true;
  }
  const deadline = performance.now() + SPRAY_BAKE_FRAME_BUDGET_MS;
  bake.bakeContext.save();
  bake.bakeContext.globalCompositeOperation = "source-over";
  while (bake.nextParticleIndex < bake.particles.length) {
    const nextIndex = Math.min(bake.particles.length, bake.nextParticleIndex + SPRAY_BAKE_CHECK_INTERVAL);
    paintSprayParticles(bake.bakeContext, bake.particles.slice(bake.nextParticleIndex, nextIndex), bake.scaledStyle.color, bake.scaledStyle.opacity, "gradient");
    bake.nextParticleIndex = nextIndex;
    if (performance.now() >= deadline) break;
  }
  bake.bakeContext.restore();
  if (bake.nextParticleIndex >= bake.particles.length) {
    committedLayers.spray.context.drawImage(bake.bakeCanvas, 0, 0);
    pendingSprayBakes.shift();
    scheduleRender();
  }
  if (pendingSprayBakes.length > 0) scheduleSprayBakeFrame();
}

function scheduleSprayBakeFrame(): void {
  if (sprayBakeFrameScheduled) return;
  sprayBakeFrameScheduled = true;
  requestAnimationFrame(runSprayBakeFrame);
}

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
    if (operation.operation === "spray") {
      // SPRAY POINTER-UP RECONCILIATION V1 -- see beginSprayCanonicalBake's
      // own doc. Replaces the single blocking canonical paint with a
      // non-blocking, visually-stable hand-off; every other supply below
      // keeps the exact synchronous path it already had.
      beginSprayCanonicalBake(operation);
    } else {
      // DRAWING LATENCY V1 -- bakes this ONE just-committed Mark into the
      // cache incrementally (no full-array rebuild needed for the common
      // single-commit path) by calling the exact same, unmodified
      // `drawOperation` on the COMPLETE, final `activePoints` -- the
      // canonical computation, never the live preview's windowed
      // approximation. `render()` (below) then draws this cached result in
      // place of the discarded live-preview layer within the same
      // synchronous call -- no intermediate frame, no visible gap.
      drawOperation(operation, committedLayers);
    }
    // BLACKBOOK Deterministic Drips β0.1 -- generated and pushed
    // synchronously, immediately after the origin (see
    // createDripOperationsFor's own doc for why this must happen here,
    // before any persistence call, and why that keeps the two always
    // contiguous in `operations`).
    const dripOperations = createDripOperationsFor(operation);
    for (const dripOperation of dripOperations) {
      operations.push(dripOperation);
      drawOperation(dripOperation, committedLayers);
    }
    // BLACKBOOK CLEAR + Single-Step Undo V1 -- a newly committed stroke
    // means CLEAR is no longer "the last action" -- its own one-shot Undo
    // is no longer available (same single-level semantics as an ordinary
    // stroke's own ordinary Undo).
    lastClearSnapshot = null;
    showStatus("Saving…", "info");
    void persistence.persistStroke(operation)
      .then(() => Promise.all(dripOperations.map((dripOperation) => persistence.persistStroke(dripOperation))))
      .then(() => showStatus("Saved", "success"))
      .catch((error) => reportError("Couldn't save that stroke", error));
  }
  activeOperationId = null;
  activePoints = [];
  // SPRAY POINTER-UP RECONCILIATION V1 -- this gesture is fully
  // reconciled now (baked directly, non-Spray; or handed off to
  // beginSprayCanonicalBake, which already read everything it needed) --
  // the next gesture (Spray or not) must never inherit this one's PRNG
  // stream/emission history.
  sprayEmissionCursor = null;
  sprayParticleCursor = null;
  renderNow();
});

undoButton.addEventListener("click", () => {
  if (lastClearSnapshot !== null) {
    const restored = lastClearSnapshot;
    operations = [...restored];
    committedCacheDirty = true; // DRAWING LATENCY V1 -- Mark set changed wholesale
    lastClearSnapshot = null;
    renderNow();
    const target = currentArtwork.getState();
    if (target.kind === "artwork") {
      showStatus("Saving…", "info");
      void replaceArtworkMarks(target.artworkId, restored)
        .then(() => showStatus("Saved", "success"))
        .catch((error) => reportError("Undo didn't save", error));
    }
    return;
  }
  // BLACKBOOK Deterministic Drips β0.1 -- removes the last GESTURE (its
  // origin operation plus any drip operations it spawned) as one logical
  // Undo step, never orphaning a drip -- see popLastGesture's own doc.
  // A non-drip-producing gesture still undoes exactly one operation, same
  // as before this build.
  const removedGesture = popLastGesture();
  if (removedGesture.length === 0) return;
  committedCacheDirty = true; // DRAWING LATENCY V1 -- Mark set changed wholesale
  renderNow();
  showStatus("Saving…", "info");
  void Promise.all(removedGesture.map((operation) => persistence.removeStroke(operation)))
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
  committedCacheDirty = true; // DRAWING LATENCY V1 -- Mark set changed wholesale
  lastClearSnapshot = previous;
  renderNow();
  if (target.kind !== "artwork") return; // nothing persisted yet to clear (defensive -- operations.length>0 already implies a real Artwork exists)
  showStatus("Saving…", "info");
  void replaceArtworkMarks(target.artworkId, [])
    .then(() => showStatus("Cleared", "success"))
    .catch((error) => reportError("Couldn't clear", error));
}
clearButton.addEventListener("click", clearArtwork);

panButton.addEventListener("click", () => {
  panMode = !panMode;
  renderNow();
});

fitButton.addEventListener("click", () => {
  fitPageIntoView();
  renderNow();
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
  committedCacheDirty = true; // DRAWING LATENCY V1 -- Mark set changed wholesale
  activePoints = [];
  lastClearSnapshot = null;
  currentArtwork.setPendingNewArtwork("map", "");
  activePageFrame = BLACKBOOK_PAGE_FRAME;
  fitPageIntoView();
  showStatus("New page", "success");
  renderNow();
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
  scheduleRender();
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
  scheduleRender();
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
  renderNow();
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

const CAP_BUTTONS: readonly [HTMLButtonElement, string][] = [
  [capStockButton, STUDIORICH_STOCK_CAP.id],
  [capFatButton, STUDIORICH_FAT_CAP.id],
  [capPrecisionButton, STUDIORICH_PRECISION_CAP.id],
  [capCalligraphyButton, STUDIORICH_CALLIGRAPHY_CAP.id],
];
function selectSprayCap(capId: string): void {
  activeSprayCapId = capId;
  for (const [button, buttonCapId] of CAP_BUTTONS) button.setAttribute("aria-pressed", String(capId === buttonCapId));
}
for (const [button, capId] of CAP_BUTTONS) button.addEventListener("click", () => selectSprayCap(capId));
pencilButton.addEventListener("click", () => selectSupply("pencil"));
penButton.addEventListener("click", () => selectSupply("pen"));
markerButton.addEventListener("click", () => selectSupply("marker"));
mopButton.addEventListener("click", () => selectSupply("mop"));
sprayButton.addEventListener("click", () => selectSupply("spray"));
eraserButton.addEventListener("click", () => { activeSupply = "eraser"; updateContextualControls("eraser"); renderNow(); });
colorControl.addEventListener("input", rememberSupplySettings);
widthControl.addEventListener("input", rememberSupplySettings);
opacityControl.addEventListener("input", rememberSupplySettings);
widthControl.min = String(DRAWING_WIDTH_RANGES.pencil.min);
widthControl.max = String(DRAWING_WIDTH_RANGES.pencil.max);
widthControl.value = String(PENCIL_SUPPLY.defaultSettings.width);
opacityControl.value = String(PENCIL_SUPPLY.defaultSettings.opacity);
colorControl.value = DRAWING_DEFAULT_COLORS.pencil;
updateContextualControls("pencil");

/**
 * HOST-03B -- hosted-context sign-in transport. HOME's own never-nested
 * window owns the actual Google popup; this only relays the resulting
 * credential into the SAME `memberIdentity` this file already uses
 * everywhere else -- no second member-state authority, no change to
 * standalone behavior (the `else` branch below, unchanged from before this
 * batch). Never falls back to a locally-initiated `signInWithGoogle()` on
 * any failure -- that would silently reintroduce the exact nested-popup
 * defect this transport exists to avoid.
 */
function hostedGoogleSignInFailureMessage(reason: string): string {
  switch (reason) {
    case "popup_blocked": return "The browser blocked the Google sign-in window.";
    case "popup_closed": return "Google sign-in was closed before it finished.";
    case "credential_missing": return "Google sign-in did not return a usable credential.";
    case "home_unavailable": return "StudioRich Home is unavailable -- try reloading.";
    case "stale_identity": case "surface_left": return "Navigation changed before sign-in finished -- try again.";
    default: return "StudioRich sign-in is temporarily unavailable.";
  }
}
memberButton.addEventListener("click", () => {
  if (memberState.status === "signedIn") { void memberIdentity.signOut(); return; }
  if (homeSurface.isHome) {
    void homeSurface.requestGoogleCredential().then((result) => {
      if (!result.ok) { reportError(hostedGoogleSignInFailureMessage(result.reason), new Error(result.reason)); return; }
      return memberIdentity.signInWithCredential(result.credential).catch((error: unknown) => {
        reportError("StudioRich sign-in is temporarily unavailable.", error);
      });
    });
    return;
  }
  void memberIdentity.signInWithGoogle();
});

// MEMBER-01A -- HOME-hosted: the persistent parent avatar already owns
// sign-in/out presentation, so this document's own local control is
// redundant. Never removed from the DOM (keeps every other call site's
// `memberButton` references valid), just never shown.
memberButton.hidden = homeSurface.isHome;

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
    committedCacheDirty = true; // DRAWING LATENCY V1 -- Mark set changed wholesale
    activePageFrame = BLACKBOOK_PAGE_FRAME;
    knownArtworksCache = [];
    currentArtwork.clear();
    persistence.replaceKnownArtworks([]);
    closePagesDrawer();
    fitPageIntoView();
    renderNow();
    // HOST-03 -- also a stable, interactive state (the existing "sign in to
    // draw" page), and readiness doesn't gate on auth resolving any more
    // than MAP's own MapboxViewportRuntime.onReady does; idempotent.
    homeSurface.reportReady();
  }
});

resizeCanvasesToDisplaySize();
fitPageIntoView();
renderNow();
void memberIdentity.start();
