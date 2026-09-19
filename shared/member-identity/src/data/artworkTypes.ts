export interface GeographicArtworkPoint {
  readonly longitude: number;
  readonly latitude: number;
}

export interface GeographicArtworkStroke {
  readonly id: string;
  readonly points: readonly GeographicArtworkPoint[];
  readonly style: {
    readonly color: string;
    readonly width: number;
    readonly opacity: number;
  };
}

export interface MapArtwork {
  readonly id: string;
  readonly creatorId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly surface: { readonly type: "map" };
  readonly geometry: {
    readonly format: "geographic-strokes-v1";
    readonly strokes: readonly GeographicArtworkStroke[];
  };
  readonly state: "draft" | "archived";
  readonly visibility: "private";
}

export interface CreateMapArtworkInput {
  readonly creatorId: string;
  readonly stroke: GeographicArtworkStroke;
}

export interface ArtworkRepository {
  createMapArtwork(input: CreateMapArtworkInput): Promise<MapArtwork>;
  listOwnedMapArtwork(creatorId: string): Promise<readonly MapArtwork[]>;
  deleteOwnedArtwork(artworkId: string, creatorId: string): Promise<void>;
}
