import type {
  ArtworkRepository,
  Artwork,
  ArtworkMark,
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

export interface ArtworkBindingRuntime<TStroke extends object> {
  bindArtwork(stroke: TStroke, artworkId: string, markId: string, creatorId: string, surfaceId: string): boolean;
}

export interface ArtworkPersistenceBridgeOptions<TStroke extends object> {
  readonly repository: ArtworkRepository;
  readonly drawing: ArtworkBindingRuntime<TStroke>;
  readonly getAuthenticatedMemberId: () => string | null;
  readonly surfaceId: string;
  readonly toMark: (stroke: TStroke, markId: string) => ArtworkMark;
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

export function createArtworkPersistenceBridge<TStroke extends { artworkId?: string; markId?: string; creatorId?: string; surfaceId?: string }>({
  repository,
  drawing,
  getAuthenticatedMemberId,
  surfaceId,
  toMark,
  createMarkId = () => crypto.randomUUID(),
}: ArtworkPersistenceBridgeOptions<TStroke>) {
  const removedBeforeSave = new WeakSet<TStroke>();
  const artworks = new Map<string, Artwork>();
  let persistenceQueue = Promise.resolve();

  function retain(artwork: Artwork | null, removedId?: string) {
    if (removedId) artworks.delete(removedId);
    if (artwork) artworks.set(artwork.id, artwork);
  }

  return {
    replaceKnownArtworks(known: readonly Artwork[]): void {
      artworks.clear();
      known.forEach((artwork) => artworks.set(artwork.id, artwork));
    },

    persistStroke(stroke: TStroke): Promise<void> {
      const memberId = getAuthenticatedMemberId();
      if (!memberId) return Promise.resolve();
      const markId = stroke.markId ?? createMarkId();
      stroke.markId = markId;
      const mark = toMark(stroke, markId);
      const operation = persistenceQueue.then(async () => {
        const candidate = selectArtworkForMark([...artworks.values()], memberId, surfaceId, mark);
        const artwork = candidate
          ? await repository.appendOwnedArtworkMark(candidate.id, memberId, mark)
          : await (repository.createArtwork ?? repository.createMapArtwork).call(repository, { creatorId: memberId, surfaceId, mark });
        retain(artwork);
        if (removedBeforeSave.has(stroke)) {
          removedBeforeSave.delete(stroke);
          const remaining = await repository.removeOwnedArtworkMark(artwork.id, memberId, markId);
          retain(remaining, remaining ? undefined : artwork.id);
          return;
        }
        if (!drawing.bindArtwork(stroke, artwork.id, markId, memberId, surfaceId)) {
          const remaining = await repository.removeOwnedArtworkMark(artwork.id, memberId, markId);
          retain(remaining, remaining ? undefined : artwork.id);
        }
      });
      persistenceQueue = operation.catch(() => undefined);
      return operation;
    },

    async removeStroke(stroke: TStroke): Promise<void> {
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

export function createMapArtworkPersistenceBridge(options: Omit<ArtworkPersistenceBridgeOptions<WallStroke>, "surfaceId" | "toMark">) {
  return createArtworkPersistenceBridge({ ...options, surfaceId: SUBWAY_MAP_SURFACE_ID, toMark: toStrokeMark });
}
