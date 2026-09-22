import {
  createFirebaseArtworkRepository,
  createFirebaseMemberIdentityAuthority,
  MARKER_SUPPLY,
  MOP_SUPPLY,
  PEN_SUPPLY,
  PENCIL_ERASER_SUPPLY,
  PENCIL_SUPPLY,
  SPRAY_SUPPLY,
  type Artwork,
  type MemberIdentityState,
} from "@studiorich/member-identity";
import {
  BLACKBOOK_PAGE_SURFACE_ID,
  createBlackbookArtworkPersistenceBridge,
  type BlackbookOperation,
} from "./blackbookArtworkBridge";
import { resolveMopDabPlan } from "./mopDeposition";
import { hashSeed, resolveSprayCorePlan, resolveSprayParticlePlan } from "./sprayDeposition";
import { fillMopDab, fillSprayParticle, hash01, hashLateralUnit, traceSmoothedPath } from "./strokeSmoothing";

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }
const canvas = required(document.querySelector<HTMLCanvasElement>("#blackbook-page"), "blackbook_surface_missing");
const undoButton = required(document.querySelector<HTMLButtonElement>("#blackbook-undo"), "blackbook_surface_missing");
const memberButton = required(document.querySelector<HTMLButtonElement>("#blackbook-member"), "blackbook_surface_missing");
const status = required(document.querySelector<HTMLElement>("#blackbook-status"), "blackbook_surface_missing");
const pencilButton = required(document.querySelector<HTMLButtonElement>("#blackbook-pencil"), "blackbook_surface_missing");
const penButton = required(document.querySelector<HTMLButtonElement>("#blackbook-pen"), "blackbook_surface_missing");
const markerButton = required(document.querySelector<HTMLButtonElement>("#blackbook-marker"), "blackbook_surface_missing");
const mopButton = required(document.querySelector<HTMLButtonElement>("#blackbook-mop"), "blackbook_surface_missing");
const sprayButton = required(document.querySelector<HTMLButtonElement>("#blackbook-spray"), "blackbook_surface_missing");
const eraserButton = required(document.querySelector<HTMLButtonElement>("#blackbook-eraser"), "blackbook_surface_missing");
const widthControl = required(document.querySelector<HTMLInputElement>("#blackbook-width"), "blackbook_surface_missing");
const opacityControl = required(document.querySelector<HTMLInputElement>("#blackbook-opacity"), "blackbook_surface_missing");

const ctx = required(canvas.getContext("2d"), "blackbook_canvas_unavailable");

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const repository = createFirebaseArtworkRepository(import.meta.env);
let memberState: MemberIdentityState = memberIdentity.getState();
const materialLayers = Object.fromEntries(["graphite", "ink", "marker", "mop", "spray"].map((materialId) => {
  const layer = document.createElement("canvas");
  layer.width = canvas.width; layer.height = canvas.height;
  return [materialId, { canvas: layer, context: required(layer.getContext("2d"), "blackbook_material_canvas_unavailable") }];
})) as Record<"graphite" | "ink" | "marker" | "mop" | "spray", { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>;
let operations: BlackbookOperation[] = [];
let activePoints: { x: number; y: number }[] = [];
let nextOperationId = 1;
let activeSupply: "pencil" | "pen" | "marker" | "mop" | "spray" | "eraser" = "pencil";
const supplySettings: Record<"pencil" | "pen" | "marker" | "mop" | "spray", { width: number; opacity: number }> = {
  pencil: { ...PENCIL_SUPPLY.defaultSettings },
  pen: { ...PEN_SUPPLY.defaultSettings },
  marker: { ...MARKER_SUPPLY.defaultSettings },
  mop: { ...MOP_SUPPLY.defaultSettings },
  spray: { ...SPRAY_SUPPLY.defaultSettings },
};

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f3eee4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const layer of Object.values(materialLayers)) layer.context.clearRect(0, 0, canvas.width, canvas.height);
  for (const operation of operations) drawOperation(operation);
  if (activePoints.length > 1) drawOperation(activeOperation(activePoints));
  ctx.drawImage(materialLayers.graphite.canvas, 0, 0);
  ctx.drawImage(materialLayers.mop.canvas, 0, 0);
  ctx.drawImage(materialLayers.spray.canvas, 0, 0);
  ctx.drawImage(materialLayers.ink.canvas, 0, 0);
  ctx.drawImage(materialLayers.marker.canvas, 0, 0);
  undoButton.disabled = memberState.status !== "signedIn" || operations.length === 0;
  pencilButton.dataset.active = String(activeSupply === "pencil");
  penButton.dataset.active = String(activeSupply === "pen");
  markerButton.dataset.active = String(activeSupply === "marker");
  mopButton.dataset.active = String(activeSupply === "mop");
  sprayButton.dataset.active = String(activeSupply === "spray");
  eraserButton.dataset.active = String(activeSupply === "eraser");
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
  const scaled = points.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height }));
  context.beginPath();
  traceSmoothedPath(context, scaled);
}

// The plain, un-smoothed polyline -- Mop's own background pass (so it stays
// geometrically aligned with resolveMopDabPlan's dabs, which are placed at
// the same raw recorded points) and Spray's new macro core pass (below).
function rawPath(context: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]): void {
  const scaled = points.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height }));
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
  materialCtx.save();
  materialCtx.lineCap = "round"; materialCtx.lineJoin = "round";
  path(materialCtx, points);
  if (operation.operation === "eraser") {
    materialCtx.globalCompositeOperation = "destination-out";
    materialCtx.lineWidth = operation.width;
    materialCtx.globalAlpha = 1;
    materialCtx.strokeStyle = "#000";
  } else {
    materialCtx.globalCompositeOperation = "source-over";
    materialCtx.lineWidth = operation.style.width;
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
  const scaledPoints = points.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height }));
  context.save();
  context.lineCap = "round"; context.lineJoin = "round";
  context.globalCompositeOperation = "source-over";
  rawPath(context, points);
  context.lineWidth = style.width;
  context.globalAlpha = style.opacity * 0.92;
  context.strokeStyle = style.color;
  context.stroke();
  const dabs = resolveMopDabPlan(scaledPoints, style.width * 0.5);
  const baseRadius = style.width * 0.5;
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
  const scaledPoints = points.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height }));
  const seed = hashSeed(seedSource);
  const baseRadius = style.width * 0.5;

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
  // Mop's muted wet-ink teal and Spray's punchy aerosol orange each keep
  // their own material visually distinct from Marker's saturated pink at a
  // glance, independent of width/opacity differences.
  const color = activeSupply === "pencil" ? "#171412"
    : activeSupply === "pen" ? "#101828"
    : activeSupply === "mop" ? "#1c6e6e"
    : activeSupply === "spray" ? "#e2572b"
    : "#d32852";
  return { operation: activeSupply, id: "active", points, style: { color, width: Number(widthControl.value), opacity: Number(opacityControl.value) } };
}

function point(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
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
    }] : mark.type === "material-erasure" && mark.geometry.format === "local-2d-erasure-v1" ? [{ operation: "eraser", id: `blackbook-mark-${mark.id}`, artworkId: artwork.id, markId: mark.id, creatorId: artwork.creatorId, surfaceId: artwork.surfaceId, points: mark.geometry.points, width: mark.width }] : []));
  persistence.replaceKnownArtworks(artworks.filter((artwork) => artwork.surfaceId === BLACKBOOK_PAGE_SURFACE_ID));
  render();
}

canvas.addEventListener("pointerdown", (event) => {
  if (memberState.status !== "signedIn") return;
  canvas.setPointerCapture(event.pointerId);
  activePoints = [point(event)];
  render();
});
canvas.addEventListener("pointermove", (event) => {
  if (!canvas.hasPointerCapture(event.pointerId)) return;
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

// Calibration V1: the WIDTH slider's own min/max become instrument-specific
// so the slider's middle lands in each supply's everyday useful range,
// without changing what a stored Width number means when rendered (still
// a literal canvas-pixel line width, or footprint-radius*2 for Mop/Spray).
const WIDTH_RANGE: Record<"pencil" | "pen" | "marker" | "mop" | "spray", { min: number; max: number }> = {
  pencil: { min: 2, max: 14 },
  pen: { min: 1, max: 10 },
  marker: { min: 6, max: 32 },
  mop: { min: 14, max: 54 },
  spray: { min: 8, max: 40 },
};

function selectSupply(supply: "pencil" | "pen" | "marker" | "mop" | "spray" | "eraser"): void {
  activeSupply = supply;
  if (supply !== "eraser") {
    const range = WIDTH_RANGE[supply];
    widthControl.min = String(range.min);
    widthControl.max = String(range.max);
    widthControl.value = String(supplySettings[supply].width);
    opacityControl.value = String(supplySettings[supply].opacity);
  }
  render();
}

function rememberSupplySettings(): void {
  if (activeSupply === "eraser") return;
  supplySettings[activeSupply].width = Number(widthControl.value);
  supplySettings[activeSupply].opacity = Number(opacityControl.value);
}

pencilButton.addEventListener("click", () => selectSupply("pencil"));
penButton.addEventListener("click", () => selectSupply("pen"));
markerButton.addEventListener("click", () => selectSupply("marker"));
mopButton.addEventListener("click", () => selectSupply("mop"));
sprayButton.addEventListener("click", () => selectSupply("spray"));
eraserButton.addEventListener("click", () => { activeSupply = "eraser"; render(); });
widthControl.addEventListener("input", rememberSupplySettings);
opacityControl.addEventListener("input", rememberSupplySettings);
widthControl.min = String(WIDTH_RANGE.pencil.min);
widthControl.max = String(WIDTH_RANGE.pencil.max);
widthControl.value = String(PENCIL_SUPPLY.defaultSettings.width);
opacityControl.value = String(PENCIL_SUPPLY.defaultSettings.opacity);

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
    persistence.replaceKnownArtworks([]);
    render();
  }
});

render();
void memberIdentity.start();
