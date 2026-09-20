export interface GeographicArtworkPoint {
  readonly longitude: number;
  readonly latitude: number;
}
export interface GeographicBounds { readonly west: number; readonly south: number; readonly east: number; readonly north: number }

export interface GeographicArtworkStroke {
  readonly id: string;
  readonly points: readonly GeographicArtworkPoint[];
  readonly style: {
    readonly color: string;
    readonly width: number;
    readonly opacity: number;
  };
}
export interface StrokeMark { readonly id: string; readonly type: "stroke"; readonly createdAt: Date; readonly geometry: { readonly format: "geographic-stroke-v1"; readonly points: readonly GeographicArtworkPoint[] }; readonly style: GeographicArtworkStroke["style"] }
export type ArtworkMark = StrokeMark;

export interface MapArtwork {
  readonly id: string;
  readonly creatorId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly surfaceId: string;
  readonly composition: { readonly bounds: GeographicBounds; readonly startedAt: Date; readonly lastEditedAt: Date };
  readonly marks: readonly ArtworkMark[];
  readonly state: "draft" | "archived";
  readonly visibility: "private";
}

export interface CreateMapArtworkInput {
  readonly creatorId: string;
  readonly surfaceId: string;
  readonly mark: ArtworkMark;
}

export interface ArtworkRepository {
  createMapArtwork(input: CreateMapArtworkInput): Promise<MapArtwork>;
  listOwnedMapArtwork(creatorId: string): Promise<readonly MapArtwork[]>;
  appendOwnedArtworkMark(artworkId: string, creatorId: string, mark: ArtworkMark): Promise<MapArtwork>;
  removeOwnedArtworkMark(artworkId: string, creatorId: string, markId: string): Promise<MapArtwork | null>;
  deleteOwnedArtwork(artworkId: string, creatorId: string): Promise<void>;
}
