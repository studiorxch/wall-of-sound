import type {
  ArtworkRepository,
  MapArtwork,
  StrokeMark,
} from "@studiorich/member-identity";
import { selectArtworkForMark } from "@studiorich/member-identity";

export const SUBWAY_MAP_SURFACE_ID = "map:new-york";

export interface WallStroke {
  readonly id?: string;
  artworkId?: string;
  markId?: string;
  creatorId?: string;
  surfaceId?: string;
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
  bindArtwork(stroke: WallStroke, artworkId: string, markId: string, creatorId: string, surfaceId: string): boolean;
}

interface MapArtworkPersistenceBridgeOptions {
  readonly repository: ArtworkRepository;
  readonly drawing: ArtworkBindingRuntime;
  readonly getAuthenticatedMemberId: () => string | null;
  readonly createMarkId?: () => string;
}

export function toStrokeMark(stroke: WallStroke, markId: string): StrokeMark {
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
    id: markId,
    type: "stroke",
    createdAt: new Date(),
    geometry: { format: "geographic-stroke-v1", points },
    style: { color, width: width as number, opacity: opacity as number },
  };
}

export function createMapArtworkPersistenceBridge({
  repository,
  drawing,
  getAuthenticatedMemberId,
  createMarkId = () => crypto.randomUUID(),
}: MapArtworkPersistenceBridgeOptions) {
  const removedBeforeSave = new WeakSet<WallStroke>();
  const artworks = new Map<string, MapArtwork>();
  let persistenceQueue = Promise.resolve();

  function retain(artwork: MapArtwork | null, removedId?: string) {
    if (removedId) artworks.delete(removedId);
    if (artwork) artworks.set(artwork.id, artwork);
  }

  return {
    replaceKnownArtworks(known: readonly MapArtwork[]): void {
      artworks.clear();
      known.forEach((artwork) => artworks.set(artwork.id, artwork));
    },

    persistStroke(stroke: WallStroke): Promise<void> {
      const memberId = getAuthenticatedMemberId();
      if (!memberId) return Promise.resolve();
      const markId = stroke.markId ?? createMarkId();
      stroke.markId = markId;
      const mark = toStrokeMark(stroke, markId);
      const operation = persistenceQueue.then(async () => {
        const candidate = selectArtworkForMark([...artworks.values()], memberId, SUBWAY_MAP_SURFACE_ID, mark);
        const artwork = candidate
          ? await repository.appendOwnedArtworkMark(candidate.id, memberId, mark)
          : await repository.createMapArtwork({ creatorId: memberId, surfaceId: SUBWAY_MAP_SURFACE_ID, mark });
        retain(artwork);
        if (removedBeforeSave.has(stroke)) {
          removedBeforeSave.delete(stroke);
          const remaining = await repository.removeOwnedArtworkMark(artwork.id, memberId, markId);
          retain(remaining, remaining ? undefined : artwork.id);
          return;
        }
        if (!drawing.bindArtwork(stroke, artwork.id, markId, memberId, SUBWAY_MAP_SURFACE_ID)) {
          const remaining = await repository.removeOwnedArtworkMark(artwork.id, memberId, markId);
          retain(remaining, remaining ? undefined : artwork.id);
        }
      });
      persistenceQueue = operation.catch(() => undefined);
      return operation;
    },

    async removeStroke(stroke: WallStroke): Promise<void> {
      const memberId = getAuthenticatedMemberId();
      if (!memberId) return;
      if (!stroke.artworkId) {
        removedBeforeSave.add(stroke);
        return;
      }
      if (stroke.creatorId !== memberId) return;
      if (!stroke.markId) throw new Error("persisted_stroke_missing_mark_id");
      const remaining = await repository.removeOwnedArtworkMark(stroke.artworkId, memberId, stroke.markId);
      retain(remaining, remaining ? undefined : stroke.artworkId);
    },
  };
}
