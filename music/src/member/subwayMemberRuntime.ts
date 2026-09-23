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
import type { Artwork } from "@studiorich/member-identity";
import {
  createMapArtworkPersistenceBridge,
  SUBWAY_MAP_SURFACE_ID,
  type WallOperation,
} from "./mapArtworkBridge";
import { createMemberHomeController } from "./memberHomeUI";
import { navigateToArtwork } from "./navigateToArtwork";
import { resolveMopDabPlan, resolveMopEmissionPoints } from "./mopDeposition";
import { MAP_SURFACE_REFERENCE_ZOOM, resolveZoomScale } from "./mapZoomScale";
import { hashSeed, resolveSprayCorePlan, resolveSprayParticlePlan, STUDIORICH_STOCK_CAP } from "./sprayDeposition";
import { fillMopDab, fillSprayParticle, hash01, hashLateralUnit, traceSmoothedPath, withAlpha } from "./strokeSmoothing";

type WallRuntime = {
  Workspace?: { getActiveSurface(): unknown };
  SurfaceDrawingRuntime?: {
    bindArtwork(stroke: WallOperation, artworkId: string, markId: string, creatorId: string, surfaceId: string): boolean;
    hydrateArtwork(artwork: unknown): number;
    /**
     * Calibration V1 Revision 11: bulk sign-in hydration -- decodes/pushes
     * every given Artwork's Marks with a SINGLE render/cache rebuild at the
     * end, instead of one per Artwork document (the O(n^2) cost that made
     * sign-in Artwork restoration take ~30s with the current ~150-200
     * Artwork dataset). See surfaceDrawingRuntime.js's own doc.
     */
    hydrateArtworks(artworks: readonly unknown[]): number;
    removePersistedStrokes(): number;
  };
  MemberIdentityAuthority?: unknown;
  MemberIdentityState?: MemberIdentityState;
  PublicMember?: unknown;
  MapboxViewportRuntime?: {
    fitBounds(bounds: readonly [readonly [number, number], readonly [number, number]], options?: Record<string, unknown>): void;
  };
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
    resolveMopEmissionPoints: typeof resolveMopEmissionPoints;
    resolveSprayParticlePlan: typeof resolveSprayParticlePlan;
    resolveSprayCorePlan: typeof resolveSprayCorePlan;
    hashSeed: typeof hashSeed;
    STUDIORICH_STOCK_CAP: typeof STUDIORICH_STOCK_CAP;
  };
  /**
   * Map Art Supplies Calibration V1: the same rendering-quality helpers
   * (path smoothing, soft Spray particle fill) blackbookRuntime.ts uses --
   * see strokeSmoothing.ts. Pure canvas-drawing functions, never a second
   * per-Surface implementation.
   */
  ArtSupplyRendering?: {
    traceSmoothedPath: typeof traceSmoothedPath;
    fillSprayParticle: typeof fillSprayParticle;
    fillMopDab: typeof fillMopDab;
    withAlpha: typeof withAlpha;
    hashLateralUnit: typeof hashLateralUnit;
    hash01: typeof hash01;
  };
  /**
   * Map Art Supplies Calibration V1 Revision 7: authored-zoom Width scale
   * correction -- see mapZoomScale.ts. Pure math, shared by every material
   * layer's render call so an Artwork's internal proportions survive
   * camera zoom.
   */
  MapZoomScale?: {
    resolveZoomScale: typeof resolveZoomScale;
    MAP_SURFACE_REFERENCE_ZOOM: typeof MAP_SURFACE_REFERENCE_ZOOM;
  };
};

const root = window as typeof window & { SBE?: WallRuntime };
root.SBE ??= {};
root.SBE.ArtSupplies = { PENCIL_SUPPLY, PEN_SUPPLY, MARKER_SUPPLY, MOP_SUPPLY, SPRAY_SUPPLY, PENCIL_ERASER_SUPPLY };
root.SBE.ArtSupplyDeposition = { resolveMopDabPlan, resolveMopEmissionPoints, resolveSprayParticlePlan, resolveSprayCorePlan, hashSeed, STUDIORICH_STOCK_CAP };
root.SBE.ArtSupplyRendering = { traceSmoothedPath, fillSprayParticle, fillMopDab, withAlpha, hashLateralUnit, hash01 };
root.SBE.MapZoomScale = { resolveZoomScale, MAP_SURFACE_REFERENCE_ZOOM };

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const artworkRepository = createFirebaseArtworkRepository(import.meta.env);
root.SBE.MemberIdentityAuthority = memberIdentity;

let state: MemberIdentityState = memberIdentity.getState();
let hydratedMemberId: string | null = null;
let dialog: HTMLDialogElement | null = null;
let statusElement: HTMLElement | null = null;
/** Member V1A -- the same Artwork list already hydrated onto the canvas at sign-in, kept here so Member Home's gallery reads it directly instead of issuing a second `listOwnedArtwork` query merely to render a UI. */
let ownedArtworks: readonly Artwork[] = [];

const memberHome = createMemberHomeController({
  authority: memberIdentity,
  getOwnedArtworks: () => ownedArtworks,
  onOpenArtwork(artwork) {
    memberHome.close();
    navigateToArtwork(
      { fitBounds: (bounds, options) => root.SBE?.MapboxViewportRuntime?.fitBounds(bounds, options) },
      artwork,
      { expectedSurfaceId: SUBWAY_MAP_SURFACE_ID },
    );
  },
  async onDeleteArtwork(artwork) {
    if (state.status !== "signedIn") return;
    await artworkRepository.deleteOwnedArtwork(artwork.id, state.member.uid);
    ownedArtworks = ownedArtworks.filter((item) => item.id !== artwork.id);
    drawingRuntime()?.removePersistedStrokes();
    drawingRuntime()?.hydrateArtworks(ownedArtworks.filter((item) => item.state === "draft"));
  },
});

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
    if (state.status === "signedIn") memberHome.open();
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
  button.setAttribute("aria-label", state.status === "signedIn" ? "Open StudioRich Member Home" : "StudioRich Member sign in");
  if (state.status === "signedIn") {
    dialog?.close();
    setMessage("");
  } else {
    memberHome.close();
    if (state.status === "error") setMessage(state.error.message, true);
  }
}

async function hydrateOwnedArtwork(memberId: string): Promise<void> {
  if (hydratedMemberId === memberId) return;
  const drawing = drawingRuntime();
  if (!drawing) return;
  drawing.removePersistedStrokes();
  const artworks = (await (artworkRepository.listOwnedArtwork ?? artworkRepository.listOwnedMapArtwork).call(artworkRepository, memberId)).filter((artwork) => artwork.surfaceId === SUBWAY_MAP_SURFACE_ID);
  artworkPersistence.replaceKnownArtworks(artworks);
  ownedArtworks = artworks;
  // Calibration V1 Revision 11: ONE batch call, ONE render/cache rebuild --
  // was previously one `hydrateArtwork` call (and therefore one full
  // static-composite rebuild) PER Artwork document, an O(n^2) cost across
  // this account's ~150-200 Map Artworks that measured close to the
  // reported ~30s sign-in freeze.
  drawing.hydrateArtworks(artworks.filter((artwork) => artwork.state === "draft"));
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
    ownedArtworks = [];
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
