import type { ArtMaterialId, Artwork, ArtworkRepository, LocalMaterialErasureMark, LocalStrokeMark } from "@studiorich/member-identity";
import { createArtworkPersistenceBridge, type CurrentArtworkTarget } from "./mapArtworkBridge";

/**
 * ARTWORK V2 -- Blank Artwork's persistence bridge. Mirrors
 * blackbookArtworkBridge.ts's pattern exactly (same local-2d Mark formats,
 * same generic `createArtworkPersistenceBridge` factory) -- the only
 * difference is Blank's points are NOT normalized to 0..1 (an infinite
 * document space has no such bound; see artworkDocument.ts's
 * `finiteLocalCoordinate`, relaxed for exactly this reason), and this
 * bridge wires the same explicit Current-Artwork routing Map's bridge uses
 * (`getCurrentArtworkTarget`/`onCurrentArtworkEstablished`) -- Blank
 * Artwork is never chosen by proximity either.
 *
 * All Blank Artwork documents share one constant `surfaceId`, exactly like
 * every Map Artwork shares `map:new-york` -- Surface identity and Artwork
 * identity are already established as separate concepts (ARTWORK V1); nothing
 * about Blank changes that.
 */
export const BLANK_SURFACE_ID = "blank:default";

export type BlankSupplyId = "pencil" | "pen" | "marker" | "mop" | "spray";
const MATERIAL_BY_SUPPLY: Readonly<Record<BlankSupplyId, ArtMaterialId>> = Object.freeze({
  pencil: "graphite",
  pen: "ink",
  marker: "marker",
  mop: "mop",
  spray: "spray",
});

export interface BlankStroke {
  readonly operation: BlankSupplyId;
  readonly id: string;
  artworkId?: string;
  markId?: string;
  creatorId?: string;
  surfaceId?: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly style: { readonly color: string; readonly width: number; readonly opacity: number };
  /** Graphite Grades Foundation V1 -- see BlackbookStroke's identical field doc. Blank has no grade-selection UI (no change required here for that reason alone), but a Mark carrying these renders with its own stored grade rather than always assuming HB. */
  readonly variantId?: string;
  readonly profileVersion?: number;
}

export interface BlankErasure {
  readonly operation: "eraser";
  readonly id: string;
  artworkId?: string;
  markId?: string;
  creatorId?: string;
  surfaceId?: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly width: number;
}

export type BlankOperation = BlankStroke | BlankErasure;

export function toBlankStrokeMark(stroke: BlankStroke, markId: string): LocalStrokeMark {
  if (!stroke.id || stroke.points.length < 2) throw new Error("invalid_blank_stroke");
  return {
    id: markId,
    type: "stroke",
    createdAt: new Date(),
    geometry: { format: "local-2d-stroke-v1", points: stroke.points.map(({ x, y }) => ({ x, y })) },
    style: { ...stroke.style },
    material: {
      supplyId: stroke.operation,
      materialId: MATERIAL_BY_SUPPLY[stroke.operation],
      ...(stroke.operation === "pencil" && stroke.variantId !== undefined && stroke.profileVersion !== undefined
        ? { variantId: stroke.variantId, profileVersion: stroke.profileVersion }
        : {}),
    },
  };
}

export function toBlankErasureMark(erasure: BlankErasure, markId: string): LocalMaterialErasureMark {
  if (!erasure.id || erasure.points.length < 2) throw new Error("invalid_blank_erasure");
  return { id: markId, type: "material-erasure", createdAt: new Date(), geometry: { format: "local-2d-erasure-v1", points: erasure.points.map(({ x, y }) => ({ x, y })) }, targetMaterialId: "graphite", width: erasure.width };
}

export function toBlankMark(operation: BlankOperation, markId: string) {
  return operation.operation === "eraser" ? toBlankErasureMark(operation, markId) : toBlankStrokeMark(operation, markId);
}

export interface BlankArtworkPersistenceBridgeOptions {
  readonly repository: ArtworkRepository;
  readonly drawing: { bindArtwork(stroke: BlankOperation, artworkId: string, markId: string, creatorId: string, surfaceId: string): boolean };
  readonly getAuthenticatedMemberId: () => string | null;
  readonly createMarkId?: () => string;
  readonly onArtworkSaved?: (artwork: Artwork) => void;
  readonly onArtworkRemoved?: (artworkId: string) => void;
  readonly getCurrentArtworkTarget?: () => CurrentArtworkTarget;
  readonly onCurrentArtworkEstablished?: (artworkId: string) => void;
}

export function createBlankArtworkPersistenceBridge(options: BlankArtworkPersistenceBridgeOptions) {
  return createArtworkPersistenceBridge<BlankOperation>({
    ...options,
    surfaceId: BLANK_SURFACE_ID,
    toMark: toBlankMark,
  });
}
