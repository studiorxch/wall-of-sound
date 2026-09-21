import {
  createFirebaseArtworkRepository,
  createFirebaseMemberIdentityAuthority,
  PENCIL_ERASER_SUPPLY,
  PENCIL_SUPPLY,
  type Artwork,
  type MemberIdentityState,
} from "@studiorich/member-identity";
import {
  BLACKBOOK_PAGE_SURFACE_ID,
  createBlackbookArtworkPersistenceBridge,
  type BlackbookOperation,
} from "./blackbookArtworkBridge";

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }
const canvas = required(document.querySelector<HTMLCanvasElement>("#blackbook-page"), "blackbook_surface_missing");
const undoButton = required(document.querySelector<HTMLButtonElement>("#blackbook-undo"), "blackbook_surface_missing");
const memberButton = required(document.querySelector<HTMLButtonElement>("#blackbook-member"), "blackbook_surface_missing");
const status = required(document.querySelector<HTMLElement>("#blackbook-status"), "blackbook_surface_missing");
const pencilButton = required(document.querySelector<HTMLButtonElement>("#blackbook-pencil"), "blackbook_surface_missing");
const eraserButton = required(document.querySelector<HTMLButtonElement>("#blackbook-eraser"), "blackbook_surface_missing");
const widthControl = required(document.querySelector<HTMLInputElement>("#blackbook-width"), "blackbook_surface_missing");
const opacityControl = required(document.querySelector<HTMLInputElement>("#blackbook-opacity"), "blackbook_surface_missing");

const ctx = required(canvas.getContext("2d"), "blackbook_canvas_unavailable");

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const repository = createFirebaseArtworkRepository(import.meta.env);
let memberState: MemberIdentityState = memberIdentity.getState();
const materialCanvas = document.createElement("canvas");
materialCanvas.width = canvas.width; materialCanvas.height = canvas.height;
const materialCtx = required(materialCanvas.getContext("2d"), "blackbook_material_canvas_unavailable");
let operations: BlackbookOperation[] = [];
let activePoints: { x: number; y: number }[] = [];
let nextOperationId = 1;
let activeSupply: "pencil" | "eraser" = "pencil";

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f3eee4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  materialCtx.clearRect(0, 0, canvas.width, canvas.height);
  for (const operation of operations) drawOperation(operation);
  if (activePoints.length > 1) drawOperation(activeOperation(activePoints));
  ctx.drawImage(materialCanvas, 0, 0);
  undoButton.disabled = memberState.status !== "signedIn" || operations.length === 0;
  pencilButton.dataset.active = String(activeSupply === "pencil");
  eraserButton.dataset.active = String(activeSupply === "eraser");
}

function path(points: readonly { x: number; y: number }[]): void {
  materialCtx.beginPath();
  materialCtx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
  for (const point of points.slice(1)) materialCtx.lineTo(point.x * canvas.width, point.y * canvas.height);
}

function drawOperation(operation: BlackbookOperation): void {
  const { points } = operation;
  if (points.length < 2) return;
  materialCtx.save();
  materialCtx.lineCap = "round"; materialCtx.lineJoin = "round";
  path(points);
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

function activeOperation(points: readonly { x: number; y: number }[]): BlackbookOperation {
  return activeSupply === "eraser"
    ? { operation: "eraser", id: "active", points, width: PENCIL_ERASER_SUPPLY.defaultWidth }
    : { operation: "pencil", id: "active", points, style: { color: "#171412", width: Number(widthControl.value), opacity: Number(opacityControl.value) } };
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
    .flatMap((artwork) => artwork.marks.flatMap((mark): BlackbookOperation[] => mark.geometry.format === "local-2d-stroke-v1" ? [{
      operation: "pencil",
      id: `blackbook-mark-${mark.id}`,
      artworkId: artwork.id,
      markId: mark.id,
      creatorId: artwork.creatorId,
      surfaceId: artwork.surfaceId,
      points: mark.geometry.points,
      style: mark.style,
    }] : mark.geometry.format === "local-2d-erasure-v1" ? [{ operation: "eraser", id: `blackbook-mark-${mark.id}`, artworkId: artwork.id, markId: mark.id, creatorId: artwork.creatorId, surfaceId: artwork.surfaceId, points: mark.geometry.points, width: mark.width }] : []));
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

pencilButton.addEventListener("click", () => { activeSupply = "pencil"; render(); });
eraserButton.addEventListener("click", () => { activeSupply = "eraser"; render(); });
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
