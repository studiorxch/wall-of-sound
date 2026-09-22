export interface GeographicArtworkPoint {
  readonly longitude: number;
  readonly latitude: number;
}
export interface LocalArtworkPoint {
  readonly x: number;
  readonly y: number;
}
export interface GeographicBounds { readonly west: number; readonly south: number; readonly east: number; readonly north: number }
export interface LocalBounds { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
export type ArtworkBounds = GeographicBounds | LocalBounds;
import type { ArtMaterialId, MarkMaterialIdentity } from "./artSupplyTypes.js";

export interface GeographicArtworkStroke {
  readonly id: string;
  readonly points: readonly GeographicArtworkPoint[];
  readonly style: {
    readonly color: string;
    readonly width: number;
    readonly opacity: number;
  };
}
/** `authoredZoom`: the Mapbox camera zoom when this geographic Mark's gesture began (Map Art Supplies Calibration V1 Revision 7 -- see mapZoomScale.ts in music/src/member/). Geographic-only: a Blackbook/local-2d Mark has no camera zoom concept and never carries this field. Optional so legacy Marks (authored before this revision) remain valid -- render-time falls back to a shared reference zoom for those. */
export interface GeographicStrokeMark { readonly id: string; readonly type: "stroke"; readonly createdAt: Date; readonly geometry: { readonly format: "geographic-stroke-v1"; readonly points: readonly GeographicArtworkPoint[] }; readonly style: GeographicArtworkStroke["style"]; readonly material?: MarkMaterialIdentity; readonly authoredZoom?: number }
export interface LocalStrokeMark { readonly id: string; readonly type: "stroke"; readonly createdAt: Date; readonly geometry: { readonly format: "local-2d-stroke-v1"; readonly points: readonly LocalArtworkPoint[] }; readonly style: GeographicArtworkStroke["style"]; readonly material?: MarkMaterialIdentity }
export type StrokeMark = GeographicStrokeMark | LocalStrokeMark;
export interface LocalMaterialErasureMark { readonly id: string; readonly type: "material-erasure"; readonly createdAt: Date; readonly geometry: { readonly format: "local-2d-erasure-v1"; readonly points: readonly LocalArtworkPoint[] }; readonly targetMaterialId: ArtMaterialId; readonly width: number }
/** See GeographicStrokeMark.authoredZoom's doc -- same semantics for the geographic Eraser Mark. */
export interface GeographicMaterialErasureMark { readonly id: string; readonly type: "material-erasure"; readonly createdAt: Date; readonly geometry: { readonly format: "geographic-erasure-v1"; readonly points: readonly GeographicArtworkPoint[] }; readonly targetMaterialId: ArtMaterialId; readonly width: number; readonly authoredZoom?: number }
export type MaterialErasureMark = LocalMaterialErasureMark | GeographicMaterialErasureMark;
export type ArtworkMark = StrokeMark | MaterialErasureMark;

export interface Artwork {
  readonly id: string;
  readonly creatorId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly surfaceId: string;
  readonly composition: { readonly bounds: ArtworkBounds; readonly startedAt: Date; readonly lastEditedAt: Date };
  readonly marks: readonly ArtworkMark[];
  readonly state: "draft" | "archived";
  readonly visibility: "private";
}
export type MapArtwork = Artwork;

export interface CreateArtworkInput {
  readonly creatorId: string;
  readonly surfaceId: string;
  readonly mark: ArtworkMark;
}
export type CreateMapArtworkInput = CreateArtworkInput;

export interface ArtworkRepository {
  createArtwork?(input: CreateArtworkInput): Promise<Artwork>;
  listOwnedArtwork?(creatorId: string): Promise<readonly Artwork[]>;
  appendOwnedArtworkMark(artworkId: string, creatorId: string, mark: ArtworkMark): Promise<Artwork>;
  removeOwnedArtworkMark(artworkId: string, creatorId: string, markId: string): Promise<Artwork | null>;
  deleteOwnedArtwork(artworkId: string, creatorId: string): Promise<void>;
  /** Backward-compatible Map aliases. */
  createMapArtwork(input: CreateMapArtworkInput): Promise<MapArtwork>;
  listOwnedMapArtwork(creatorId: string): Promise<readonly MapArtwork[]>;
}
