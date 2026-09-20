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

export interface GeographicArtworkStroke {
  readonly id: string;
  readonly points: readonly GeographicArtworkPoint[];
  readonly style: {
    readonly color: string;
    readonly width: number;
    readonly opacity: number;
  };
}
export interface GeographicStrokeMark { readonly id: string; readonly type: "stroke"; readonly createdAt: Date; readonly geometry: { readonly format: "geographic-stroke-v1"; readonly points: readonly GeographicArtworkPoint[] }; readonly style: GeographicArtworkStroke["style"] }
export interface LocalStrokeMark { readonly id: string; readonly type: "stroke"; readonly createdAt: Date; readonly geometry: { readonly format: "local-2d-stroke-v1"; readonly points: readonly LocalArtworkPoint[] }; readonly style: GeographicArtworkStroke["style"] }
export type StrokeMark = GeographicStrokeMark | LocalStrokeMark;
export type ArtworkMark = StrokeMark;

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
