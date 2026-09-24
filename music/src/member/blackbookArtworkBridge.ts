import type { ArtMaterialId, ArtworkRepository, LocalMaterialErasureMark, LocalStrokeMark, PageFrame } from "@studiorich/member-identity";
import { createArtworkPersistenceBridge } from "./mapArtworkBridge";

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
}) {
  return createArtworkPersistenceBridge({
    ...options,
    surfaceId: BLACKBOOK_PAGE_SURFACE_ID,
    toMark: toBlackbookMark,
    pageFrame: BLACKBOOK_PAGE_FRAME,
  });
}
