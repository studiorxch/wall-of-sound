import type { ArtMaterialId, ArtworkRepository, LocalMaterialErasureMark, LocalStrokeMark } from "@studiorich/member-identity";
import { createArtworkPersistenceBridge } from "./mapArtworkBridge";

export const STUDIO_RICH_BLACKBOOK_ID = "studio-rich-main";
export const STUDIO_RICH_BLACKBOOK_PAGE_ID = "page-1";
export const BLACKBOOK_PAGE_SURFACE_ID = `blackbook:${STUDIO_RICH_BLACKBOOK_ID}:page:${STUDIO_RICH_BLACKBOOK_PAGE_ID}`;

export interface BlackbookStroke {
  readonly operation: "pencil" | "pen" | "marker";
  readonly id: string;
  artworkId?: string;
  markId?: string;
  creatorId?: string;
  surfaceId?: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly style: { readonly color: string; readonly width: number; readonly opacity: number };
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
});

export function toLocalStrokeMark(stroke: BlackbookStroke, markId: string, createdAt = new Date()): LocalStrokeMark {
  if (!stroke.id || stroke.points.length < 2) throw new Error("invalid_blackbook_stroke");
  return {
    id: markId,
    type: "stroke",
    createdAt,
    geometry: { format: "local-2d-stroke-v1", points: stroke.points.map(({ x, y }) => ({ x, y })) },
    style: { ...stroke.style },
    material: { supplyId: stroke.operation, materialId: MATERIAL_BY_SUPPLY[stroke.operation] },
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
  });
}
