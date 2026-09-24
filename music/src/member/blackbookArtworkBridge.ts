import type { ArtMaterialId, Artwork, ArtworkRepository, LocalMaterialErasureMark, LocalStrokeMark, PageFrame } from "@studiorich/member-identity";
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
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly style: { readonly color: string; readonly width: number; readonly opacity: number };
  /**
   * Graphite Grades Foundation V1 -- which variant/grade authored this
   * stroke (e.g. "6b"), paired with `profileVersion`. Only meaningful for
   * `operation === "pencil"`; absent for every other supply, and absent on
   * a Pencil stroke authored before this field existed (resolves to HB).
   */
  readonly variantId?: string;
  readonly profileVersion?: number;
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
export type BlackbookOperation = BlackbookStroke | BlackbookErasure;

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
    geometry: { format: "local-2d-stroke-v1", points: stroke.points.map(({ x, y }) => ({ x, y })) },
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
    },
  };
}

export function toLocalErasureMark(erasure: BlackbookErasure, markId: string, createdAt = new Date()): LocalMaterialErasureMark {
  if (!erasure.id || erasure.points.length < 2) throw new Error("invalid_blackbook_erasure");
  return { id: markId, type: "material-erasure", createdAt, geometry: { format: "local-2d-erasure-v1", points: erasure.points.map(({ x, y }) => ({ x, y })) }, targetMaterialId: "graphite", width: erasure.width };
}

export function toBlackbookMark(operation: BlackbookOperation, markId: string) {
  return operation.operation === "eraser" ? toLocalErasureMark(operation, markId) : toLocalStrokeMark(operation, markId);
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
