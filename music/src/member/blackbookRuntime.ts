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
import { hashSeed, resolveSprayParticlePlan } from "./sprayDeposition";

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

function path(context: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]): void {
  context.beginPath();
  context.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
  for (const point of points.slice(1)) context.lineTo(point.x * canvas.width, point.y * canvas.height);
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
    drawSprayStroke(materialCtx, points, operation.style, operation.markId ?? operation.id);
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
 * V3: Mop is deliberately NOT the same uniform-width polyline stroke every
 * other supply uses. Two passes over the same recorded points:
 * 1. A continuous rounded-cap stroke at slightly reduced opacity --
 *    guarantees no gaps on a fast drag (path continuity) and reads as a
 *    softer, less mechanically crisp pass than Marker's single solid line.
 * 2. A layer of round "dabs" from `resolveMopDabPlan` (see mopDeposition.ts
 *    for the full rationale) -- their radius responds to how closely the
 *    points were recorded, so slower/dwelled sections of the same stroke
 *    visibly bulge, and every dab is individually translucent so
 *    overlapping dabs (within one stroke, or across repeated Mop passes on
 *    this same persistent material layer) accumulate toward heavier
 *    coverage instead of capping at one flat opacity.
 */
function drawMopStroke(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  style: { readonly color: string; readonly width: number; readonly opacity: number },
): void {
  const scaledPoints = points.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height }));
  context.save();
  context.lineCap = "round"; context.lineJoin = "round";
  context.globalCompositeOperation = "source-over";
  path(context, points);
  context.lineWidth = style.width;
  context.globalAlpha = style.opacity * 0.7;
  context.strokeStyle = style.color;
  context.stroke();
  context.fillStyle = style.color;
  for (const dab of resolveMopDabPlan(scaledPoints, style.width * 0.5)) {
    context.globalAlpha = style.opacity * dab.alphaScale;
    context.beginPath();
    context.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

/**
 * V4: Spray is a coverage FIELD, not a rendered path -- no `path()`/
 * `stroke()` call at all. `resolveSprayParticlePlan` (see sprayDeposition.ts
 * for the full aerosol-engine rationale) turns the authored points into a
 * bounded, deterministic list of small particles seeded from the Mark's own
 * stable id (`seedSource`), so the same persisted Mark always redraws the
 * exact same speckle pattern -- live, on reload, and after sign-in
 * rehydration. Each particle is its own small filled circle at its own
 * alpha (already carrying the Stock Cap's center/edge falloff and local
 * density response), scaled by the Mark's own opacity, so overlapping
 * particles accumulate instead of capping at one flat wash.
 */
function drawSprayStroke(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  style: { readonly color: string; readonly width: number; readonly opacity: number },
  seedSource: string,
): void {
  const scaledPoints = points.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height }));
  const plan = resolveSprayParticlePlan(scaledPoints, style.width * 0.5, hashSeed(seedSource));
  context.save();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = style.color;
  for (const particle of plan) {
    context.globalAlpha = style.opacity * particle.alpha;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    context.fill();
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
  activePoints.push(point(event));
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

function selectSupply(supply: "pencil" | "pen" | "marker" | "mop" | "spray" | "eraser"): void {
  activeSupply = supply;
  if (supply !== "eraser") {
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
