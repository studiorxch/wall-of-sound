import {
  createFirebaseArtworkRepository,
  createFirebaseMemberIdentityAuthority,
  normalizeArtworkTitle,
  serializePublicMember,
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
  type ArtworkType,
  type MemberIdentityState,
} from "@studiorich/member-identity";
import {
  createMapArtworkPersistenceBridge,
  SUBWAY_MAP_SURFACE_ID,
  type WallOperation,
} from "./mapArtworkBridge";
import { BLANK_SURFACE_ID, createBlankArtworkPersistenceBridge, type BlankOperation } from "./blankArtworkBridge";
import { createBlankCanvasRuntime } from "./blankCanvasRuntime";
import { createAnonymousArtworkClaimer, type AnonymousArtworkClaimResult } from "./claimAnonymousArtwork";
import { resolveDefaultArtworkTitle } from "./artworkGallery";
import { createCurrentArtworkSession } from "./currentArtworkSession";
import { createMemberHomeController } from "./memberHomeUI";
import { navigateToArtwork } from "./navigateToArtwork";
import { createSessionArtworkLibrary } from "./sessionArtworkLibrary";
import { resolveMopDabPlan, resolveMopEmissionPoints } from "./mopDeposition";
import { MAP_SURFACE_REFERENCE_ZOOM, resolveZoomScale } from "./mapZoomScale";
import { hashSeed, resolveSprayCorePlan, resolveSprayParticlePlan, STUDIORICH_STOCK_CAP } from "./sprayDeposition";
import { fillMopDab, fillSprayParticle, hash01, hashLateralUnit, resolveGraphiteProfile, strokeGraphite, strokeInk, strokeMarker, traceSmoothedPath, withAlpha } from "./strokeSmoothing";

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
    /** Member V1C -- a snapshot of this surface's real drawing operations that are not yet bound to a Firestore Artwork. Never the live internal array. */
    getUnclaimedStrokes(): readonly WallOperation[];
    /** ARTWORK V2 -- the currently-selected supply/color/width/opacity; Blank reuses this exact same toolbar selection instead of building its own. */
    getBrush(): { supplyId: string; color: string; width: number; opacity: number };
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
  /** Drawing Shell V1 -- see this field's assignment below for the full seam doc. */
  DrawingShellConfig?: {
    supplyOrder: typeof DRAWING_SUPPLY_ORDER;
    widthRanges: typeof DRAWING_WIDTH_RANGES;
    defaultColors: typeof DRAWING_DEFAULT_COLORS;
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
    /** Graphite Pencil V1 -- see strokeGraphite's own doc in strokeSmoothing.ts. */
    strokeGraphite: typeof strokeGraphite;
    /** Graphite Grades Foundation V1 -- see resolveGraphiteProfile's own doc in strokeSmoothing.ts. */
    resolveGraphiteProfile: typeof resolveGraphiteProfile;
    /** Ink Pen V1 -- see strokeInk's own doc in strokeSmoothing.ts. */
    strokeInk: typeof strokeInk;
    /** Marker Material Calibration V1 -- see strokeMarker's own doc in strokeSmoothing.ts. */
    strokeMarker: typeof strokeMarker;
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
/**
 * Drawing Shell V1 -- the same canonical Art Supply order/width-ranges/
 * default-colors Blackbook's own runtime reads directly (it imports
 * `@studiorich/member-identity` as a real Vite module); the plain-JS
 * `subwayMapPaintSurface.js` IIFE has no import statement, so this is how
 * it reaches the SAME values instead of keeping its own private copy. Data
 * only -- no component, no DOM, no coupling between the two bundlers.
 */
root.SBE.DrawingShellConfig = { supplyOrder: DRAWING_SUPPLY_ORDER, widthRanges: DRAWING_WIDTH_RANGES, defaultColors: DRAWING_DEFAULT_COLORS };
root.SBE.ArtSupplyDeposition = { resolveMopDabPlan, resolveMopEmissionPoints, resolveSprayParticlePlan, resolveSprayCorePlan, hashSeed, STUDIORICH_STOCK_CAP };
root.SBE.ArtSupplyRendering = { traceSmoothedPath, fillSprayParticle, fillMopDab, withAlpha, hashLateralUnit, hash01, strokeGraphite, strokeInk, strokeMarker, resolveGraphiteProfile };
root.SBE.MapZoomScale = { resolveZoomScale, MAP_SURFACE_REFERENCE_ZOOM };

const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
const artworkRepository = createFirebaseArtworkRepository(import.meta.env);
root.SBE.MemberIdentityAuthority = memberIdentity;

let state: MemberIdentityState = memberIdentity.getState();
let hydratedMemberId: string | null = null;
let dialog: HTMLDialogElement | null = null;
let statusElement: HTMLElement | null = null;
let saveStatusElement: HTMLElement | null = null;
let pendingSaveCount = 0;
let saveStatusHideTimer: number | null = null;

/**
 * Member V1B -- the ONE authoritative in-memory projection of the
 * signed-in Member's owned Artwork for this session (see
 * sessionArtworkLibrary.ts's own doc). Initial state comes from
 * `listOwnedArtwork` hydration; after that it is kept live by
 * `artworkPersistence`'s `onArtworkSaved`/`onArtworkRemoved` callbacks,
 * which only fire after a real Firestore round trip succeeds -- never
 * optimistically.
 */
const sessionArtworkLibrary = createSessionArtworkLibrary();
sessionArtworkLibrary.subscribe(() => memberHome.refresh());

/**
 * ARTWORK V1 -- the explicit Current Artwork authority (see
 * currentArtworkSession.ts's own doc). This is now what decides which
 * Firestore document a new Mark belongs to, replacing geographic proximity
 * for every Mark drawn through this runtime.
 */
const currentArtworkSession = createCurrentArtworkSession();
currentArtworkSession.subscribe(() => renderCloseArtworkControl());

/** ARTWORK V2 -- which Surface/runtime is currently being edited; `null` means the ordinary shared Map (no Current Artwork). Only ever "blank" while a Blank Artwork is pending or open. */
let activeSurfaceKind: ArtworkType | null = null;

/** Member V1C -- promotes anonymous/unbound strokes into the signed-in Member's Current Artwork by replaying them through the SAME persistence bridge below. See claimAnonymousArtwork.ts's own doc. Reused unmodified for both the sign-in-to-save path (V1C) and the signed-in-with-no-Current-Artwork path (ARTWORK V1, section 9). Map only -- Blank has no anonymous/shared surface to promote from (see section 10's scope note). */
const anonymousClaimer = createAnonymousArtworkClaimer<WallOperation>();

/** ARTWORK V2 -- Blank Artwork's own lightweight, non-Mapbox drawing runtime. See blankCanvasRuntime.ts's own doc. */
const blankCanvasRuntime = createBlankCanvasRuntime();
blankCanvasRuntime.setBrushSource(() => {
  const brush = drawingRuntime()?.getBrush();
  return {
    supplyId: (brush?.supplyId as "pencil" | "pen" | "marker" | "mop" | "spray" | "eraser") ?? "pencil",
    color: brush?.color ?? "#171412",
    width: brush?.width ?? 6,
    opacity: brush?.opacity ?? 0.9,
  };
});

const memberHome = createMemberHomeController({
  authority: memberIdentity,
  getOwnedArtworks: () => sessionArtworkLibrary.getAll(),
  onOpenArtwork(artwork) {
    memberHome.close();
    openArtwork(artwork);
  },
  onCreateArtwork(artworkType, title) {
    memberHome.close();
    void startNewArtwork(artworkType, title);
  },
  async onDeleteArtwork(artwork) {
    if (state.status !== "signedIn") return;
    await artworkRepository.deleteOwnedArtwork(artwork.id, state.member.uid);
    sessionArtworkLibrary.remove(artwork.id);
    const current = currentArtworkSession.getState();
    if (current.kind === "artwork" && current.artworkId === artwork.id) {
      closeCurrentArtwork();
    }
  },
  async onRenameArtwork(artwork, title) {
    if (state.status !== "signedIn") return;
    const renamed = await artworkRepository.renameOwnedArtwork(artwork.id, state.member.uid, title);
    sessionArtworkLibrary.upsert(renamed);
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
  onArtworkSaved: (artwork) => sessionArtworkLibrary.upsert(artwork),
  onArtworkRemoved: (artworkId) => sessionArtworkLibrary.remove(artworkId),
  getCurrentArtworkTarget: () => (activeSurfaceKind === "blank" ? { kind: "none" } : currentArtworkSession.getState()),
  onCurrentArtworkEstablished: (artworkId) => currentArtworkSession.setCurrentArtwork(artworkId),
});

const blankPersistence = createBlankArtworkPersistenceBridge({
  repository: artworkRepository,
  drawing: {
    bindArtwork(stroke, artworkId, markId, creatorId, surfaceId) {
      return blankCanvasRuntime.bindArtwork(stroke, artworkId, markId, creatorId, surfaceId);
    },
  },
  getAuthenticatedMemberId() {
    return state.status === "signedIn" ? state.member.uid : null;
  },
  onArtworkSaved: (artwork) => sessionArtworkLibrary.upsert(artwork),
  onArtworkRemoved: (artworkId) => sessionArtworkLibrary.remove(artworkId),
  getCurrentArtworkTarget: () => (activeSurfaceKind === "map" ? { kind: "none" } : currentArtworkSession.getState()),
  onCurrentArtworkEstablished: (artworkId) => currentArtworkSession.setCurrentArtwork(artworkId),
});

/**
 * ARTWORK V2 -- OPEN ARTWORK: establishes explicit document-open semantics,
 * branching by `artworkType`. Scoped hydration only -- this never touches
 * Firestore beyond the normal read already in `sessionArtworkLibrary` (the
 * `artwork` object passed in is already the full authoritative document).
 * Any previously-open Artwork's Marks are removed from its own Surface
 * first so opening A never silently composites B/C/D just because they
 * share a surfaceId, and switching Map<->Blank never leaves the other
 * Surface's stale content visible.
 */
function openArtwork(artwork: Artwork): void {
  if (artwork.artworkType === "blank") {
    drawingRuntime()?.removePersistedStrokes();
    activeSurfaceKind = "blank";
    currentArtworkSession.setCurrentArtwork(artwork.id);
    blankCanvasRuntime.hydrate(artwork);
    blankCanvasRuntime.enter();
    return;
  }
  blankCanvasRuntime.exit();
  const drawing = drawingRuntime();
  drawing?.removePersistedStrokes();
  activeSurfaceKind = "map";
  currentArtworkSession.setCurrentArtwork(artwork.id);
  if (artwork.state === "draft") drawing?.hydrateArtworks([artwork]);
  navigateToArtwork(
    { fitBounds: (bounds, options) => root.SBE?.MapboxViewportRuntime?.fitBounds(bounds, options) },
    artwork,
    { expectedSurfaceId: SUBWAY_MAP_SURFACE_ID },
  );
}

/**
 * ARTWORK V2 -- CLOSE ARTWORK: the smallest truthful way back to the
 * ordinary shared Map state (Blank has no shared "world" to return to --
 * closing a Blank Artwork returns to Member Home's ordinary shared-Map
 * backdrop too, per the build brief). Never deletes the Artwork or alters
 * its persisted Marks -- only clears session-local state and the drawing
 * overlay's in-memory copy of what was hydrated for editing.
 */
function closeCurrentArtwork(): void {
  currentArtworkSession.clear();
  if (activeSurfaceKind === "blank") blankCanvasRuntime.exit();
  else drawingRuntime()?.removePersistedStrokes();
  activeSurfaceKind = null;
}

/**
 * ARTWORK V2 -- "+ NEW ARTWORK": resolves the working title (custom, or
 * the centralized date-based default), arms a `pending` Current Artwork of
 * the chosen type (no Firestore document yet -- see currentArtworkSession.ts's
 * doc on why), and enters the matching Surface. For Map, if any strokes are
 * already unbound on screen (this is also the signed-in/no-Current-Artwork
 * path from section 9), promote them immediately via the same claim
 * mechanism V1C uses; Blank has no such pre-existing unbound state to
 * promote (see the V2 scope note on anonymous Blank drawing).
 */
async function startNewArtwork(artworkType: ArtworkType, customTitle: string): Promise<void> {
  if (state.status !== "signedIn") return;
  const title = normalizeArtworkTitle(customTitle) || resolveDefaultArtworkTitle(sessionArtworkLibrary.getAll());
  const previouslyOpenArtwork = currentArtworkSession.getState().kind === "artwork";
  if (previouslyOpenArtwork) {
    if (activeSurfaceKind === "blank") blankCanvasRuntime.exit();
    else drawingRuntime()?.removePersistedStrokes();
  }
  currentArtworkSession.setPendingNewArtwork(artworkType, title);
  if (artworkType === "blank") {
    activeSurfaceKind = "blank";
    blankCanvasRuntime.hydrate(null);
    blankCanvasRuntime.enter();
    return;
  }
  activeSurfaceKind = "map";
  await promoteUnboundDrawing();
}

function setMessage(message: string, isError = false): void {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}

/**
 * Member V1B -- the smallest truthful save-status affordance: "Saving…"
 * while a persistence operation is in flight, "Saved" only once it actually
 * succeeds, nothing on failure (the existing `setMessage` error path already
 * covers that). `pendingSaveCount` coalesces rapid consecutive strokes so
 * the status doesn't flicker Saving/Saved/Saving/Saved per stroke -- only
 * the LAST in-flight operation to finish updates the visible text.
 */
function ensureSaveStatusElement(): void {
  const controls = document.getElementById("subway-map-paint-controls");
  if (!controls || saveStatusElement) return;
  saveStatusElement = document.createElement("span");
  saveStatusElement.className = "subway-member-save-status";
  saveStatusElement.setAttribute("aria-live", "polite");
  controls.appendChild(saveStatusElement);
}

function beginSave(): void {
  ensureSaveStatusElement();
  pendingSaveCount += 1;
  if (saveStatusHideTimer !== null) {
    window.clearTimeout(saveStatusHideTimer);
    saveStatusHideTimer = null;
  }
  if (saveStatusElement) saveStatusElement.textContent = "Saving…";
}

function endSave(succeeded: boolean): void {
  pendingSaveCount = Math.max(0, pendingSaveCount - 1);
  if (!saveStatusElement || pendingSaveCount > 0) return;
  if (!succeeded) {
    saveStatusElement.textContent = "";
    return;
  }
  saveStatusElement.textContent = "Saved";
  saveStatusHideTimer = window.setTimeout(() => {
    if (saveStatusElement) saveStatusElement.textContent = "";
    saveStatusHideTimer = null;
  }, 2000);
}

/**
 * Member V1C -- ends the promotion batch's "Saving…" status. Unlike
 * `endSave`, a batch can be truthfully "Saved" only when EVERY eligible
 * anonymous operation attempted actually bound; if any remain unbound after
 * the attempt, that is surfaced as "Save incomplete" (left visible, not
 * auto-hidden) rather than a false global "Saved" or a silent blank.
 */
function endClaimBatch(result: AnonymousArtworkClaimResult): void {
  pendingSaveCount = Math.max(0, pendingSaveCount - 1);
  if (!saveStatusElement || pendingSaveCount > 0) return;
  if (saveStatusHideTimer !== null) {
    window.clearTimeout(saveStatusHideTimer);
    saveStatusHideTimer = null;
  }
  if (result.attemptedCount === 0) {
    saveStatusElement.textContent = "";
    return;
  }
  if (result.complete) {
    saveStatusElement.textContent = "Saved";
    saveStatusHideTimer = window.setTimeout(() => {
      if (saveStatusElement) saveStatusElement.textContent = "";
      saveStatusHideTimer = null;
    }, 2000);
  } else {
    saveStatusElement.textContent = "Save incomplete";
  }
}

/**
 * ARTWORK V1 -- promotes whatever strokes are currently unbound on screen
 * into the Current Artwork target (armed by the caller first: `pending`
 * for a brand-new Artwork, or an already-known id). Reused verbatim from
 * V1C's anonymous-claim mechanism (see claimAnonymousArtwork.ts) for two
 * distinct triggers: (1) sign-in-to-save, when anonymous strokes exist at
 * the moment authentication succeeds, and (2) section 9's signed-in/no-
 * Current-Artwork path, via `startNewArtwork`. Both share this one
 * function -- there is no separate "anonymous" vs. "signed-in" promotion
 * implementation.
 */
function promoteUnboundDrawing(): Promise<void> {
  const drawing = drawingRuntime();
  if (!drawing || drawing.getUnclaimedStrokes().length === 0) return Promise.resolve();
  beginSave();
  return anonymousClaimer
    .claimAnonymousStrokes(drawing, artworkPersistence)
    .then((result) => {
      endClaimBatch(result);
      if (!result.complete) {
        console.error("[SubwayMemberRuntime] Some drawing could not be saved", result);
      }
    })
    .catch((error: unknown) => {
      pendingSaveCount = Math.max(0, pendingSaveCount - 1);
      console.error("[SubwayMemberRuntime] Artwork claim failed", error);
    });
}

/** The button's label depends on whether eligible unbound drawing currently exists; refreshed only at the existing drawing-committed/removed event points, never polled. */
function hasEligibleUnboundDrawing(): boolean {
  const drawing = drawingRuntime();
  return !!drawing && drawing.getUnclaimedStrokes().length > 0;
}

let closeArtworkButton: HTMLButtonElement | null = null;

/** ARTWORK V1 -- shows/hides the CLOSE ARTWORK control based on whether a Current Artwork is actually open; called on every currentArtworkSession change. */
function renderCloseArtworkControl(): void {
  if (!closeArtworkButton) return;
  closeArtworkButton.hidden = currentArtworkSession.getState().kind !== "artwork";
}

function ensureMemberUI(): void {
  const controls = document.getElementById("subway-map-paint-controls");
  if (!controls || controls.querySelector("[data-member-action]")) return;
  // Drawing Shell V1: Member/session controls are workspace-owned, not Art
  // Supply controls (see the UI Unification recon) -- they still live
  // beside the Drawing Shell's floating panel for now (no new panel, no
  // Member UI redesign), but in their OWN wrapper/class so they read as a
  // visually distinct group rather than another paint-tool button.
  let contextGroup = controls.querySelector<HTMLDivElement>(".subway-map-context-controls");
  if (!contextGroup) {
    contextGroup = document.createElement("div");
    contextGroup.className = "subway-map-context-controls";
    controls.appendChild(contextGroup);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.memberAction = "open";
  button.textContent = "SIGN IN";
  button.setAttribute("aria-label", "StudioRich Member sign in");
  button.addEventListener("click", () => {
    if (state.status === "signedIn") memberHome.open();
    else dialog?.showModal();
  });
  contextGroup.appendChild(button);

  closeArtworkButton = document.createElement("button");
  closeArtworkButton.type = "button";
  closeArtworkButton.dataset.closeArtwork = "true";
  closeArtworkButton.textContent = "CLOSE ARTWORK";
  closeArtworkButton.setAttribute("aria-label", "Close the current Artwork and return to the shared Map");
  closeArtworkButton.hidden = true;
  closeArtworkButton.addEventListener("click", () => closeCurrentArtwork());
  contextGroup.appendChild(closeArtworkButton);

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
  button.textContent = state.status === "signedIn"
    ? "MEMBER"
    : state.status === "initializing"
      ? "…"
      : hasEligibleUnboundDrawing() ? "SIGN IN TO SAVE" : "SIGN IN";
  button.setAttribute("aria-label", state.status === "signedIn" ? "Open StudioRich Member Home" : "StudioRich Member sign in");
  if (state.status === "signedIn") {
    dialog?.close();
    setMessage("");
  } else {
    memberHome.close();
    if (state.status === "error") setMessage(state.error.message, true);
  }
}

/**
 * ARTWORK V1 -- populates the Member Home gallery projection ONLY. This
 * deliberately no longer calls `drawing.hydrateArtworks(...)`: the ordinary
 * shared Map must not automatically become a composite of every owned
 * Artwork (section 12). Rendering a specific Artwork's Marks onto the
 * drawing overlay now happens ONLY through the explicit `openArtwork` path
 * above.
 */
async function loadOwnedArtworkLibrary(memberId: string): Promise<void> {
  if (hydratedMemberId === memberId) return;
  // ARTWORK V2: the Member gallery is explicitly a MIXED Map+Blank gallery
  // (section 12) -- both surfaceIds belong to it. Blackbook's own separate
  // surfaceId is deliberately excluded; it keeps its own separate gallery.
  const artworks = (await (artworkRepository.listOwnedArtwork ?? artworkRepository.listOwnedMapArtwork).call(artworkRepository, memberId))
    .filter((artwork) => artwork.surfaceId === SUBWAY_MAP_SURFACE_ID || artwork.surfaceId === BLANK_SURFACE_ID);
  artworkPersistence.replaceKnownArtworks(artworks.filter((artwork) => artwork.surfaceId === SUBWAY_MAP_SURFACE_ID));
  blankPersistence.replaceKnownArtworks(artworks.filter((artwork) => artwork.surfaceId === BLANK_SURFACE_ID));
  // Member V1B: authoritative durable truth reconciles/replaces the session
  // projection wholesale on (re)hydration -- any earlier same-session
  // upserts are superseded by this fresh Firestore read.
  sessionArtworkLibrary.replaceAll(artworks);
  hydratedMemberId = memberId;
}

document.addEventListener("surface-drawing:stroke-committed", (event) => {
  if (state.status !== "signedIn") {
    // Member V1C: a new anonymous stroke may be the first eligible one --
    // refresh the button label ("SIGN IN" -> "SIGN IN TO SAVE") from this
    // existing event rather than polling the drawing runtime.
    renderIdentityState();
    return;
  }
  const detail = (event as CustomEvent).detail as { stroke?: WallOperation };
  if (!detail?.stroke) return;
  // ARTWORK V1 (section 9): with no Current Artwork, a signed-in stroke
  // stays unbound in memory -- never silently persisted into a
  // proximity-defined document. `artworkPersistence.persistStroke` would
  // already no-op for this case (see mapArtworkBridge.ts's "none" branch),
  // but skipping it here also avoids a misleading "Saving…"/"Saved" for
  // work that was never actually persisted.
  if (currentArtworkSession.getState().kind === "none") return;
  beginSave();
  void artworkPersistence
    .persistStroke(detail.stroke)
    .then(() => endSave(true))
    .catch((error: unknown) => {
      endSave(false);
      console.error("[SubwayMemberRuntime] Artwork save failed", error);
      setMessage("Artwork could not be saved.", true);
    });
});

document.addEventListener("surface-drawing:stroke-removed", (event) => {
  if (state.status !== "signedIn") {
    // Member V1C: undoing the last eligible anonymous stroke should return
    // the button to plain "SIGN IN".
    renderIdentityState();
    return;
  }
  const stroke = (event as CustomEvent).detail?.stroke as WallOperation | undefined;
  if (!stroke) return;
  void artworkPersistence.removeStroke(stroke).catch((error: unknown) => {
    console.error("[SubwayMemberRuntime] Artwork delete failed", error);
  });
});

/**
 * ARTWORK V2 -- Blank's own commit/remove wiring, parallel to Map's above
 * but routed through `blankPersistence`. Blank is only ever reachable
 * signed-in with an explicit Current Artwork already armed (via
 * `+ NEW ARTWORK` or OPEN) -- there is no anonymous/no-current-Artwork
 * Blank drawing state to guard against, unlike Map's "none" check.
 */
document.addEventListener("blank-drawing:stroke-committed", (event) => {
  if (state.status !== "signedIn") return;
  const detail = (event as CustomEvent).detail as { stroke?: BlankOperation };
  if (!detail?.stroke) return;
  beginSave();
  void blankPersistence
    .persistStroke(detail.stroke)
    .then(() => endSave(true))
    .catch((error: unknown) => {
      endSave(false);
      console.error("[SubwayMemberRuntime] Blank Artwork save failed", error);
      setMessage("Artwork could not be saved.", true);
    });
});

memberIdentity.subscribe((nextState) => {
  state = nextState;
  root.SBE!.MemberIdentityState = state;
  root.SBE!.PublicMember = state.status === "signedIn" ? serializePublicMember(state.member) : null;
  if (state.status === "signedIn") {
    // ARTWORK V1: every fresh sign-in starts at the ordinary shared-Map
    // default -- no Current Artwork is ever restored automatically across
    // a sign-in/reload boundary (see currentArtworkSession.ts's doc).
    currentArtworkSession.clear();
    void loadOwnedArtworkLibrary(state.member.uid).catch((error: unknown) => {
      console.error("[SubwayMemberRuntime] Artwork library load failed", error);
      setMessage("Saved artwork could not be loaded.", true);
    });
    // Member V1C (now generalized -- ARTWORK V1 section 10): if anonymous
    // strokes exist at the moment sign-in succeeds, arm a `pending` Current
    // Artwork so the whole batch converges onto ONE newly-created document
    // regardless of geographic distance, then promote it. This is
    // independent of the library load above (disjoint bound/unbound stroke
    // sets) and only ever runs here, i.e. only after authentication has
    // genuinely succeeded -- a cancelled/failed sign-in never reaches this.
    if (hasEligibleUnboundDrawing()) {
      activeSurfaceKind = "map";
      currentArtworkSession.setPendingNewArtwork("map", resolveDefaultArtworkTitle(sessionArtworkLibrary.getAll()));
      void promoteUnboundDrawing();
    }
  } else if (hydratedMemberId) {
    blankCanvasRuntime.exit();
    activeSurfaceKind = null;
    drawingRuntime()?.removePersistedStrokes();
    hydratedMemberId = null;
    sessionArtworkLibrary.replaceAll([]);
    currentArtworkSession.clear();
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
