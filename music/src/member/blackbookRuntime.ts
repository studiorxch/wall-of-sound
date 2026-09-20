import {
  createFirebaseArtworkRepository,
  createFirebaseMemberIdentityAuthority,
  type Artwork,
  type MemberIdentityState,
} from "@studiorich/member-identity";
import {
  BLACKBOOK_PAGE_SURFACE_ID,
  createBlackbookArtworkPersistenceBridge,
  type BlackbookStroke,
} from "./blackbookArtworkBridge";

const canvas = document.querySelector<HTMLCanvasElement>("#blackbook-page");
const undoButton = document.querySelector<HTMLButtonElement>("#blackbook-undo");
const memberButton = document.querySelector<HTMLButtonElement>("#blackbook-member");
const status = document.querySelector<HTMLElement>("#blackbook-status");
if (!canvas || !undoButton || !memberButton || !status) throw new Error("blackbook_surface_missing");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("blackbook_canvas_unavailable");

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const repository = createFirebaseArtworkRepository(import.meta.env);
let memberState: MemberIdentityState = memberIdentity.getState();
let strokes: BlackbookStroke[] = [];
let activePoints: { x: number; y: number }[] = [];
let nextStrokeId = 1;

function render(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f3eee4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) drawStroke(stroke.points, stroke.style);
  if (activePoints.length > 1) drawStroke(activePoints, { color: "#171412", width: 7, opacity: 0.9 });
  undoButton.disabled = memberState.status !== "signedIn" || strokes.length === 0;
}

function drawStroke(points: readonly { x: number; y: number }[], style: BlackbookStroke["style"]): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.globalAlpha = style.opacity;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height);
  for (const point of points.slice(1)) ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
  ctx.stroke();
  ctx.restore();
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
      return strokes.includes(stroke);
    },
  },
  getAuthenticatedMemberId: () => memberState.status === "signedIn" ? memberState.member.uid : null,
});

function hydrate(artworks: readonly Artwork[]): void {
  strokes = artworks
    .filter((artwork) => artwork.surfaceId === BLACKBOOK_PAGE_SURFACE_ID && artwork.state === "draft")
    .flatMap((artwork) => artwork.marks.flatMap((mark) => mark.geometry.format === "local-2d-stroke-v1" ? [{
      id: `blackbook-mark-${mark.id}`,
      artworkId: artwork.id,
      markId: mark.id,
      creatorId: artwork.creatorId,
      surfaceId: artwork.surfaceId,
      points: mark.geometry.points,
      style: mark.style,
    }] : []));
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
    const stroke: BlackbookStroke = { id: `blackbook-stroke-${nextStrokeId++}`, points: activePoints, style: { color: "#171412", width: 7, opacity: 0.9 } };
    strokes.push(stroke);
    void persistence.persistStroke(stroke).catch((error) => { status.textContent = error instanceof Error ? error.message : "Artwork save failed"; });
  }
  activePoints = [];
  render();
});

undoButton.addEventListener("click", () => {
  const stroke = strokes.pop();
  if (!stroke) return;
  render();
  void persistence.removeStroke(stroke).catch((error) => { status.textContent = error instanceof Error ? error.message : "Undo failed"; });
});

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
    strokes = [];
    persistence.replaceKnownArtworks([]);
    render();
  }
});

render();
void memberIdentity.start();
