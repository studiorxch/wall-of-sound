import type { ArtMaterialId, Artwork, ArtworkRepository, LocalMaterialDripMark, LocalMaterialErasureMark, LocalStrokeMark, PageFrame } from "@studiorich/member-identity";
import { createArtworkPersistenceBridge, type CurrentArtworkTarget } from "./mapArtworkBridge";
import { sortArtworksByRecency } from "./artworkGallery";

export const STUDIO_RICH_BLACKBOOK_ID = "studio-rich-main";
export const STUDIO_RICH_BLACKBOOK_PAGE_ID = "page-1";
export const BLACKBOOK_PAGE_SURFACE_ID = `blackbook:${STUDIO_RICH_BLACKBOOK_ID}:page:${STUDIO_RICH_BLACKBOOK_PAGE_ID}`;

/**
 * Blackbook Default Page Format -- the canonical page frame given to a
 * BRAND-NEW Blackbook Artwork (see blackbookRuntime.ts's `activePageFrame`
 * for how an EXISTING Artwork's own already-persisted `pageFrame` always
 * takes precedence over this constant instead). Landscape 16:9 (width=1,
 * height=9/16): Blackbook content is not assumed to be only a conventional
 * portrait sketchbook sheet -- it may become wallpaper, a zine spread, a
 * train-car or wall composition, or a video presentation, all of which read
 * naturally as landscape. `width` stays at the same "1 unit" scale the
 * original square default used, so this is purely a SHAPE change, not a
 * change of overall scale.
 *
 * Not workspace-origin-anchored by assumption elsewhere (see PageFrame's
 * own doc) -- only this one page happens to sit at the workspace origin.
 * Marks are captured through the shared Cartesian camera (see
 * cartesianWorkspaceCamera.ts), so a point is always authored directly in
 * THIS frame's own document-space units at authoring time -- there is no
 * separate "normalized" convention to reinterpret, and changing this
 * constant never retroactively changes what an already-persisted Mark's
 * `{x,y}` means.
 */
export const BLACKBOOK_PAGE_FRAME: PageFrame = { x: 0, y: 0, width: 1, height: 9 / 16 };

export interface BlackbookStroke {
  readonly operation: "pencil" | "pen" | "marker" | "mop" | "spray";
  readonly id: string;
  artworkId?: string;
  markId?: string;
  creatorId?: string;
  surfaceId?: string;
  readonly points: readonly { readonly x: number; readonly y: number; readonly tMs?: number; readonly pressure?: number }[];
  readonly style: { readonly color: string; readonly width: number; readonly opacity: number };
  /**
   * Graphite Grades Foundation V1 -- which variant/grade authored this
   * stroke (e.g. "6b"), paired with `profileVersion`. Only meaningful for
   * `operation === "pencil"`; absent for every other supply, and absent on
   * a Pencil stroke authored before this field existed (resolves to HB).
   */
  readonly variantId?: string;
  readonly profileVersion?: number;
  /** BLACKBOOK Spray Physicality V1 -- which SprayCapProfile id authored this stroke. Only meaningful for `operation === "spray"`; absent for every other supply and for a Spray stroke authored before caps existed (resolves to the Stock Cap). */
  readonly capId?: string;
}

export interface BlackbookErasure {
  readonly operation: "eraser";
  readonly id: string;
  artworkId?: string;
  markId?: string;
  creatorId?: string;
  surfaceId?: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly width: number;
}

/**
 * BLACKBOOK Deterministic Drips β0.1 -- the runtime-side counterpart to
 * `LocalMaterialDripMark` (artworkTypes.ts), mirroring how `BlackbookErasure`
 * already pairs with `LocalMaterialErasureMark`. `markId` is always
 * pre-assigned by the caller (blackbookRuntime.ts) BEFORE this is pushed
 * alongside its originating Mop/Spray operation -- never left to
 * `persistStroke`'s own `createMarkId()` fallback -- so the drip's final
 * persisted id is already known (and usable as a deterministic seed) at
 * the moment it's generated, with no async gap between creating the
 * origin's own Mark id and creating the drip that references it.
 */
export interface BlackbookDrip {
  readonly operation: "material-drip";
  readonly id: string;
  artworkId?: string;
  markId?: string;
  creatorId?: string;
  surfaceId?: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly originMarkId: string;
  readonly targetMaterialId: "mop" | "spray";
  readonly style: { readonly color: string; readonly width: number; readonly opacity: number };
}
export type BlackbookOperation = BlackbookStroke | BlackbookErasure | BlackbookDrip;

const MATERIAL_BY_SUPPLY: Readonly<Record<BlackbookStroke["operation"], ArtMaterialId>> = Object.freeze({
  pencil: "graphite",
  pen: "ink",
  marker: "marker",
  mop: "mop",
  spray: "spray",
});

export function toLocalStrokeMark(stroke: BlackbookStroke, markId: string, createdAt = new Date()): LocalStrokeMark {
  if (!stroke.id || stroke.points.length < 2) throw new Error("invalid_blackbook_stroke");
  return {
    id: markId,
    type: "stroke",
    createdAt,
    // BLACKBOOK Spray Physicality V1: preserve tMs/pressure when present
    // (Spray only ever sets them; every other supply's points never carry
    // them) -- never force an explicit `undefined` key onto a legacy-shaped
    // point.
    geometry: { format: "local-2d-stroke-v1", points: stroke.points.map((p) => ({
      x: p.x, y: p.y,
      ...(p.tMs !== undefined ? { tMs: p.tMs } : {}),
      ...(p.pressure !== undefined ? { pressure: p.pressure } : {}),
    })) },
    style: { ...stroke.style },
    material: {
      supplyId: stroke.operation,
      materialId: MATERIAL_BY_SUPPLY[stroke.operation],
      // Graphite Grades Foundation V1: only Pencil ever carries a variant;
      // omitted entirely (never `undefined`) for every other supply or when
      // no grade was selected.
      ...(stroke.operation === "pencil" && stroke.variantId !== undefined && stroke.profileVersion !== undefined
        ? { variantId: stroke.variantId, profileVersion: stroke.profileVersion }
        : {}),
      // BLACKBOOK Spray Physicality V1: only Spray ever carries a capId.
      ...(stroke.operation === "spray" && stroke.capId !== undefined ? { capId: stroke.capId } : {}),
    },
  };
}

export function toLocalErasureMark(erasure: BlackbookErasure, markId: string, createdAt = new Date()): LocalMaterialErasureMark {
  if (!erasure.id || erasure.points.length < 2) throw new Error("invalid_blackbook_erasure");
  return { id: markId, type: "material-erasure", createdAt, geometry: { format: "local-2d-erasure-v1", points: erasure.points.map(({ x, y }) => ({ x, y })) }, targetMaterialId: "graphite", width: erasure.width };
}

/** BLACKBOOK Deterministic Drips β0.1 -- see `BlackbookDrip`'s own doc. */
export function toLocalDripMark(drip: BlackbookDrip, markId: string, createdAt = new Date()): LocalMaterialDripMark {
  if (!drip.originMarkId || drip.points.length < 2) throw new Error("invalid_blackbook_drip");
  return {
    id: markId,
    type: "material-drip",
    createdAt,
    geometry: { format: "local-2d-drip-v1", points: drip.points.map(({ x, y }) => ({ x, y })) },
    originMarkId: drip.originMarkId,
    targetMaterialId: drip.targetMaterialId,
    style: { ...drip.style },
  };
}

export function toBlackbookMark(operation: BlackbookOperation, markId: string) {
  if (operation.operation === "eraser") return toLocalErasureMark(operation, markId);
  if (operation.operation === "material-drip") return toLocalDripMark(operation, markId);
  return toLocalStrokeMark(operation, markId);
}

export function createBlackbookArtworkPersistenceBridge(options: {
  repository: ArtworkRepository;
  drawing: { bindArtwork(stroke: BlackbookOperation, artworkId: string, markId: string, creatorId: string, surfaceId: string): boolean };
  getAuthenticatedMemberId: () => string | null;
  createMarkId?: () => string;
  /**
   * BLACKBOOK PAGE ISOLATION V1 -- when supplied, this is what makes NEW
   * (and reopening a specific page) mean something durable: it REPLACES
   * the legacy proximity-based `selectArtworkForMark` routing entirely
   * (see `createArtworkPersistenceBridge`'s own doc in mapArtworkBridge.ts)
   * so a Mark always lands on the explicitly active Blackbook Artwork,
   * never "whichever nearby document Surface grouping happens to pick".
   * Omitted, Blackbook falls back to its original proximity behavior
   * (pre-isolation callers/tests keep compiling unchanged).
   */
  getCurrentArtworkTarget?: () => CurrentArtworkTarget;
  /** Fires once a "pending" target's first Mark actually creates its Artwork document -- see mapArtworkBridge.ts's own doc. */
  onCurrentArtworkEstablished?: (artworkId: string) => void;
  /** Fires with the authoritative Artwork on every successful persist -- lets a caller keep its own known-Artwork cache current without a second Firestore read. */
  onArtworkSaved?: (artwork: Artwork) => void;
  /** Fires when an Artwork is fully removed (its last Mark undone). */
  onArtworkRemoved?: (artworkId: string) => void;
}) {
  return createArtworkPersistenceBridge({
    ...options,
    surfaceId: BLACKBOOK_PAGE_SURFACE_ID,
    toMark: toBlackbookMark,
    pageFrame: BLACKBOOK_PAGE_FRAME,
  });
}

/**
 * BLACKBOOK MY PAGES V1 -- the one canonical filter for "this member's
 * Blackbook pages" (used by both `blackbookRuntime.ts`'s `hydrate()` and
 * MY PAGES' own listing, so the two can never silently diverge). Excludes
 * any Artwork from a different Surface (Map, Blank Canvas) and any
 * non-`"draft"` Artwork, exactly as `hydrate()` already did inline before
 * this build factored it out for reuse/testability.
 */
export function filterBlackbookArtworks(artworks: readonly Artwork[]): Artwork[] {
  return artworks.filter((artwork) => artwork.surfaceId === BLACKBOOK_PAGE_SURFACE_ID && artwork.state === "draft");
}

/**
 * BLACKBOOK PAGE ISOLATION V1 -- explicit, deterministic active-Artwork
 * selection. Never proximity/Mark-count/size-based (the exact thing this
 * build exists to stop doing). Resolution order:
 *
 * 1. `requestedId` -- an id explicitly asked for (e.g. this session's own
 *    `?artwork=<id>` URL parameter), when it's actually one of this
 *    member's known Blackbook Artworks.
 * 2. `rememberedId` -- the last Artwork this member had open on this
 *    device (see blackbookRuntime.ts's `localStorage`-backed
 *    remember/read), when it still exists.
 * 3. FALLBACK RULE (requirement 9 -- only reached when neither of the
 *    above resolves, e.g. this member's very first load on a new device,
 *    or a legacy member who drew before NEW/isolation existed): the
 *    member's own most-recently-updated Blackbook Artwork, using the
 *    SAME recency definition `artworkGallery.ts`'s `sortArtworksByRecency`
 *    already uses for My Artwork -- the choice least surprising to
 *    someone resuming whatever they were last drawing. This never
 *    recombines Marks from more than one Artwork; it only decides which
 *    SINGLE Artwork opens.
 *
 * Returns `null` when this member has no Blackbook Artwork at all yet --
 * the caller treats that as "arm a brand-new page" (`setPendingNewArtwork`),
 * never as a reason to leave the previous state in place.
 */
export function resolveActiveBlackbookArtworkId(
  knownArtworks: readonly Artwork[],
  requestedId: string | null,
  rememberedId: string | null,
): string | null {
  const resolve = (id: string | null): string | null =>
    id !== null && knownArtworks.some((artwork) => artwork.id === id) ? id : null;
  return resolve(requestedId) ?? resolve(rememberedId) ?? (knownArtworks.length > 0 ? sortArtworksByRecency(knownArtworks)[0].id : null);
}

/**
 * NEW ARTWORK IDENTITY SYNCHRONIZATION V1 -- the pure write-side
 * counterpart to `resolveActiveBlackbookArtworkId`'s read-side resolution
 * above. Root cause this exists to fix: `blackbookRuntime.ts` had TWO
 * separate places that made an Artwork "the current one" --
 * `openArtwork()` (MY PAGES / an explicit `?artwork=` open) correctly
 * updated the URL, but `onCurrentArtworkEstablished` (a pending NEW
 * target's first Mark materializing into a real persisted Artwork) only
 * updated in-memory state and `localStorage`, never the URL. Since
 * `resolveActiveBlackbookArtworkId` above always prefers the URL over
 * `localStorage`, a stale `?artwork=<previous>` param left in place after
 * NEW materialized a brand-new Artwork silently reverted a reload back to
 * the previous Artwork -- even though the new one was genuinely, fully
 * persisted (confirmed reachable via MY PAGES the whole time). This was
 * never a persistence defect; it was a reload-fidelity / identity-
 * synchronization gap.
 *
 * Pure and DOM-free (uses the WHATWG `URL` class, not `window.location`)
 * specifically so the exact URL-rewrite behavior is directly testable
 * without a browser/jsdom harness -- `blackbookRuntime.ts`'s own
 * `setActiveArtworkIdentity` is a thin wrapper that reads
 * `window.location.href`, calls this, and applies the result via
 * `history.replaceState` (never `pushState` -- switching the active
 * Artwork, whether via MY PAGES or NEW's own materialization, remains a
 * same-session state change, never a new browser-history entry, exactly
 * as `openArtwork()` already established).
 */
export function withActiveArtworkUrlParam(currentUrl: string, artworkId: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("artwork", artworkId);
  return url.toString();
}
