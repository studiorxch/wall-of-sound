import {
  createFirebaseArtworkRepository,
  createFirebaseMemberIdentityAuthority,
  serializePublicMember,
  type MemberIdentityState,
} from "@studiorich/member-identity";
import { toGeographicArtworkStroke } from "./mapArtworkBridge";

type WallRuntime = {
  Workspace?: { getActiveSurface(): unknown };
  SurfaceDrawingRuntime?: {
    bindArtwork(strokeId: string, artworkId: string, creatorId: string): boolean;
    hydrateArtwork(artwork: unknown): number;
    removePersistedStrokes(): number;
  };
  MemberIdentityAuthority?: unknown;
  MemberIdentityState?: MemberIdentityState;
  PublicMember?: unknown;
};

const root = window as typeof window & { SBE?: WallRuntime };
root.SBE ??= {};

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const artworkRepository = createFirebaseArtworkRepository(import.meta.env);
root.SBE.MemberIdentityAuthority = memberIdentity;

let state: MemberIdentityState = memberIdentity.getState();
let hydratedMemberId: string | null = null;
const removedBeforeSave = new Set<string>();
let dialog: HTMLDialogElement | null = null;
let statusElement: HTMLElement | null = null;

function drawingRuntime() {
  return root.SBE?.SurfaceDrawingRuntime ?? null;
}

function setMessage(message: string, isError = false): void {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}

function ensureMemberUI(): void {
  const controls = document.getElementById("subway-map-paint-controls");
  if (!controls || controls.querySelector("[data-member-action]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.memberAction = "open";
  button.textContent = "SIGN IN";
  button.setAttribute("aria-label", "StudioRich Member sign in");
  button.addEventListener("click", () => {
    if (state.status === "signedIn") void memberIdentity.signOut();
    else dialog?.showModal();
  });
  controls.appendChild(button);

  dialog = document.createElement("dialog");
  dialog.className = "subway-member-dialog";
  dialog.setAttribute("aria-label", "StudioRich Member sign in");
  dialog.innerHTML = `
    <form method="dialog" class="subway-member-form">
      <button type="submit" class="subway-member-close" aria-label="Close sign in">×</button>
      <h2>StudioRich Member</h2>
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <div class="subway-member-actions">
        <button type="button" data-auth-action="sign-in">SIGN IN</button>
        <button type="button" data-auth-action="create">CREATE ACCOUNT</button>
        <button type="button" data-auth-action="google">GOOGLE</button>
      </div>
      <p class="subway-member-status" aria-live="polite"></p>
    </form>`;
  document.body.appendChild(dialog);
  statusElement = dialog.querySelector(".subway-member-status");

  dialog.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-auth-action]") : null;
    const action = target?.getAttribute("data-auth-action");
    if (!action) return;
    const email = (dialog?.querySelector('[name="email"]') as HTMLInputElement | null)?.value ?? "";
    const password = (dialog?.querySelector('[name="password"]') as HTMLInputElement | null)?.value ?? "";
    setMessage("Connecting…");
    const operation = action === "google"
      ? memberIdentity.signInWithGoogle()
      : action === "create"
        ? memberIdentity.createAccountWithEmailPassword(email, password)
        : memberIdentity.signInWithEmailPassword(email, password);
    void operation.catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "StudioRich sign-in failed.", true);
    });
  });
}

function renderIdentityState(): void {
  ensureMemberUI();
  const button = document.querySelector<HTMLButtonElement>("[data-member-action]");
  if (!button) return;
  button.disabled = state.status === "initializing";
  button.textContent = state.status === "signedIn" ? "MEMBER" : state.status === "initializing" ? "…" : "SIGN IN";
  button.setAttribute("aria-label", state.status === "signedIn" ? "Sign out StudioRich Member" : "StudioRich Member sign in");
  if (state.status === "signedIn") {
    dialog?.close();
    setMessage("");
  } else if (state.status === "error") {
    setMessage(state.error.message, true);
  }
}

async function hydrateOwnedArtwork(memberId: string): Promise<void> {
  if (hydratedMemberId === memberId) return;
  const drawing = drawingRuntime();
  if (!drawing) return;
  drawing.removePersistedStrokes();
  const artworks = await artworkRepository.listOwnedMapArtwork(memberId);
  artworks.filter((artwork) => artwork.state === "draft").forEach((artwork) => drawing.hydrateArtwork(artwork));
  hydratedMemberId = memberId;
}

document.addEventListener("surface-drawing:stroke-committed", (event) => {
  if (state.status !== "signedIn") return;
  const detail = (event as CustomEvent).detail as { stroke?: Parameters<typeof toGeographicArtworkStroke>[0] };
  if (!detail?.stroke) return;
  const memberId = state.member.uid;
  void artworkRepository.createMapArtwork({
    creatorId: memberId,
    stroke: toGeographicArtworkStroke(detail.stroke),
  }).then((artwork) => {
    const strokeId = detail.stroke!.id!;
    if (removedBeforeSave.delete(strokeId)) {
      return artworkRepository.deleteOwnedArtwork(artwork.id, memberId);
    }
    drawingRuntime()?.bindArtwork(strokeId, artwork.id, memberId);
  }).catch((error: unknown) => {
    console.error("[SubwayMemberRuntime] Artwork save failed", error);
    setMessage("Artwork could not be saved.", true);
  });
});

document.addEventListener("surface-drawing:stroke-removed", (event) => {
  if (state.status !== "signedIn") return;
  const stroke = (event as CustomEvent).detail?.stroke as { artworkId?: string; creatorId?: string } | undefined;
  if (!stroke) return;
  if (!stroke.artworkId) {
    const strokeId = (stroke as { id?: string }).id;
    if (strokeId) removedBeforeSave.add(strokeId);
    return;
  }
  if (stroke.creatorId !== state.member.uid) return;
  void artworkRepository.deleteOwnedArtwork(stroke.artworkId, state.member.uid).catch((error: unknown) => {
    console.error("[SubwayMemberRuntime] Artwork delete failed", error);
  });
});

memberIdentity.subscribe((nextState) => {
  state = nextState;
  root.SBE!.MemberIdentityState = state;
  root.SBE!.PublicMember = state.status === "signedIn" ? serializePublicMember(state.member) : null;
  if (state.status === "signedIn") {
    void hydrateOwnedArtwork(state.member.uid).catch((error: unknown) => {
      console.error("[SubwayMemberRuntime] Artwork hydration failed", error);
      setMessage("Saved artwork could not be loaded.", true);
    });
  } else if (hydratedMemberId) {
    drawingRuntime()?.removePersistedStrokes();
    hydratedMemberId = null;
  }
  renderIdentityState();
});

function startWhenWallIsReady(attempt = 0): void {
  ensureMemberUI();
  if (drawingRuntime() && root.SBE?.Workspace) {
    void memberIdentity.start().catch((error: unknown) => {
      console.error("[SubwayMemberRuntime] Member authority failed to start", error);
    });
    return;
  }
  if (attempt < 100) window.setTimeout(() => startWhenWallIsReady(attempt + 1), 50);
}

startWhenWallIsReady();
