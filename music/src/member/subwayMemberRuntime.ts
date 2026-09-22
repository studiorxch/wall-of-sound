import {
  createFirebaseArtworkRepository,
  createFirebaseMemberIdentityAuthority,
  serializePublicMember,
  MARKER_SUPPLY,
  MOP_SUPPLY,
  PEN_SUPPLY,
  PENCIL_ERASER_SUPPLY,
  PENCIL_SUPPLY,
  SPRAY_SUPPLY,
  type MemberIdentityState,
} from "@studiorich/member-identity";
import {
  createMapArtworkPersistenceBridge,
  type WallOperation,
} from "./mapArtworkBridge";
import { resolveMopDabPlan } from "./mopDeposition";
import { hashSeed, resolveSprayParticlePlan, STUDIORICH_STOCK_CAP } from "./sprayDeposition";

type WallRuntime = {
  Workspace?: { getActiveSurface(): unknown };
  SurfaceDrawingRuntime?: {
    bindArtwork(stroke: WallOperation, artworkId: string, markId: string, creatorId: string, surfaceId: string): boolean;
    hydrateArtwork(artwork: unknown): number;
    removePersistedStrokes(): number;
  };
  MemberIdentityAuthority?: unknown;
  MemberIdentityState?: MemberIdentityState;
  PublicMember?: unknown;
  /**
   * Map Art Supplies Integration V1: the SAME supply defaults and aerosol/
   * Mop deposition engines Blackbook already uses, published onto
   * `window.SBE` so the plain-script Wall runtime (no module bundler) can
   * call the real shared implementation instead of a second one. This
   * module is the seam -- it already runs as a Vite-bundled ES module
   * alongside Wall's classic scripts on the same page, sharing `window.SBE`
   * (the same bridge pattern `SurfaceDrawingRuntime`/`Workspace` already
   * use). No logic is duplicated: these are the exact same function
   * references imported by blackbookRuntime.ts.
   */
  ArtSupplies?: {
    PENCIL_SUPPLY: typeof PENCIL_SUPPLY;
    PEN_SUPPLY: typeof PEN_SUPPLY;
    MARKER_SUPPLY: typeof MARKER_SUPPLY;
    MOP_SUPPLY: typeof MOP_SUPPLY;
    SPRAY_SUPPLY: typeof SPRAY_SUPPLY;
    PENCIL_ERASER_SUPPLY: typeof PENCIL_ERASER_SUPPLY;
  };
  ArtSupplyDeposition?: {
    resolveMopDabPlan: typeof resolveMopDabPlan;
    resolveSprayParticlePlan: typeof resolveSprayParticlePlan;
    hashSeed: typeof hashSeed;
    STUDIORICH_STOCK_CAP: typeof STUDIORICH_STOCK_CAP;
  };
};

const root = window as typeof window & { SBE?: WallRuntime };
root.SBE ??= {};
root.SBE.ArtSupplies = { PENCIL_SUPPLY, PEN_SUPPLY, MARKER_SUPPLY, MOP_SUPPLY, SPRAY_SUPPLY, PENCIL_ERASER_SUPPLY };
root.SBE.ArtSupplyDeposition = { resolveMopDabPlan, resolveSprayParticlePlan, hashSeed, STUDIORICH_STOCK_CAP };

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const artworkRepository = createFirebaseArtworkRepository(import.meta.env);
root.SBE.MemberIdentityAuthority = memberIdentity;

let state: MemberIdentityState = memberIdentity.getState();
let hydratedMemberId: string | null = null;
let dialog: HTMLDialogElement | null = null;
let statusElement: HTMLElement | null = null;

function drawingRuntime() {
  return root.SBE?.SurfaceDrawingRuntime ?? null;
}

const artworkPersistence = createMapArtworkPersistenceBridge({
  repository: artworkRepository,
  drawing: {
    bindArtwork(stroke, artworkId, markId, creatorId, surfaceId) {
      return drawingRuntime()?.bindArtwork(stroke, artworkId, markId, creatorId, surfaceId) ?? false;
    },
  },
  getAuthenticatedMemberId() {
    return state.status === "signedIn" ? state.member.uid : null;
  },
});

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
  const artworks = (await (artworkRepository.listOwnedArtwork ?? artworkRepository.listOwnedMapArtwork).call(artworkRepository, memberId)).filter((artwork) => artwork.surfaceId === "map:new-york");
  artworkPersistence.replaceKnownArtworks(artworks);
  artworks.filter((artwork) => artwork.state === "draft").forEach((artwork) => drawing.hydrateArtwork(artwork));
  hydratedMemberId = memberId;
}

document.addEventListener("surface-drawing:stroke-committed", (event) => {
  if (state.status !== "signedIn") return;
  const detail = (event as CustomEvent).detail as { stroke?: WallOperation };
  if (!detail?.stroke) return;
  void artworkPersistence.persistStroke(detail.stroke).catch((error: unknown) => {
    console.error("[SubwayMemberRuntime] Artwork save failed", error);
    setMessage("Artwork could not be saved.", true);
  });
});

document.addEventListener("surface-drawing:stroke-removed", (event) => {
  if (state.status !== "signedIn") return;
  const stroke = (event as CustomEvent).detail?.stroke as WallOperation | undefined;
  if (!stroke) return;
  void artworkPersistence.removeStroke(stroke).catch((error: unknown) => {
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
