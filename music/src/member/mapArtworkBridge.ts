import type {
  ArtworkRepository,
  GeographicArtworkStroke,
} from "@studiorich/member-identity";

export interface WallStroke {
  readonly id?: string;
  artworkId?: string;
  creatorId?: string;
  readonly points?: readonly {
    readonly longitude?: number | null;
    readonly latitude?: number | null;
  }[];
  readonly style?: {
    readonly color?: string;
    readonly width?: number;
    readonly opacity?: number;
  };
}

interface ArtworkBindingRuntime {
  bindArtwork(stroke: WallStroke, artworkId: string, creatorId: string): boolean;
}

interface MapArtworkPersistenceBridgeOptions {
  readonly repository: ArtworkRepository;
  readonly drawing: ArtworkBindingRuntime;
  readonly getAuthenticatedMemberId: () => string | null;
}

export function toGeographicArtworkStroke(stroke: WallStroke): GeographicArtworkStroke {
  if (!stroke.id || !Array.isArray(stroke.points) || stroke.points.length < 2) {
    throw new Error("invalid_wall_stroke");
  }
  const points = stroke.points.map((point) => {
    if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) {
      throw new Error("wall_stroke_missing_geographic_coordinates");
    }
    return { longitude: point.longitude as number, latitude: point.latitude as number };
  });
  const color = stroke.style?.color;
  const width = stroke.style?.width;
  const opacity = stroke.style?.opacity;
  if (typeof color !== "string" || !Number.isFinite(width) || !Number.isFinite(opacity)) {
    throw new Error("invalid_wall_stroke_style");
  }
  return {
    id: stroke.id,
    points,
    style: { color, width: width as number, opacity: opacity as number },
  };
}

export function createMapArtworkPersistenceBridge({
  repository,
  drawing,
  getAuthenticatedMemberId,
}: MapArtworkPersistenceBridgeOptions) {
  const removedBeforeSave = new WeakSet<WallStroke>();

  return {
    async persistStroke(stroke: WallStroke): Promise<void> {
      const memberId = getAuthenticatedMemberId();
      if (!memberId) return;
      const artwork = await repository.createMapArtwork({
        creatorId: memberId,
        stroke: toGeographicArtworkStroke(stroke),
      });
      if (removedBeforeSave.has(stroke)) {
        removedBeforeSave.delete(stroke);
        await repository.deleteOwnedArtwork(artwork.id, memberId);
        return;
      }
      if (!drawing.bindArtwork(stroke, artwork.id, memberId)) {
        await repository.deleteOwnedArtwork(artwork.id, memberId);
      }
    },

    async removeStroke(stroke: WallStroke): Promise<void> {
      const memberId = getAuthenticatedMemberId();
      if (!memberId) return;
      if (!stroke.artworkId) {
        removedBeforeSave.add(stroke);
        return;
      }
      if (stroke.creatorId !== memberId) return;
      await repository.deleteOwnedArtwork(stroke.artworkId, memberId);
    },
  };
}
