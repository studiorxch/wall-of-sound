import type {
  ArtMaterialId,
  ArtworkRepository,
  Artwork,
  ArtworkMark,
  GeographicMaterialErasureMark,
  StrokeMark,
} from "@studiorich/member-identity";
import { selectArtworkForMark } from "@studiorich/member-identity";

export const SUBWAY_MAP_SURFACE_ID = "map:new-york";

/**
 * Map Art Supplies Integration V1: the SAME supply identities Blackbook
 * already proves (see blackbookArtworkBridge.ts's identical map), applied
 * to geographic Marks instead of local-2d ones. There is no MapPencil/
 * MapPen/MapMarker/MapMop/MapSpray -- `operation` is one of the same five
 * supply ids, and `MATERIAL_BY_SUPPLY` is the same lookup, just living here
 * because this is the geographic-coordinate bridge rather than the local
 * one. The material BEHAVIOR (deposition/rendering) stays wherever it
 * already lived (mopDeposition.ts/sprayDeposition.ts) -- this bridge only
 * carries identity through serialization, exactly like its Blackbook twin.
 */
export type WallSupplyId = "pencil" | "pen" | "marker" | "mop" | "spray";
const MATERIAL_BY_SUPPLY: Readonly<Record<WallSupplyId, ArtMaterialId>> = Object.freeze({
  pencil: "graphite",
  pen: "ink",
  marker: "marker",
  mop: "mop",
  spray: "spray",
});

export interface WallStroke {
  readonly operation?: WallSupplyId;
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
  /**
   * Calibration V1 Revision 7: the Mapbox camera zoom when this gesture
   * began (see mapZoomScale.ts) -- used ONLY for local, in-session render
   * scaling (`resolveZoomScale`). Deliberately NOT included in `toStrokeMark`
   * below: the canonical Firestore stroke-Mark schema's rules use a strict
   * `keys().hasOnly([...])` allowlist that does not list this field yet, so
   * persisting it would reject the entire write. Until that rules change is
   * explicitly approved and deployed, this value lives only in memory for
   * the current session; after reload/hydration a Mark falls back to the
   * shared `MAP_SURFACE_REFERENCE_ZOOM`, exactly like a true legacy Mark.
   */
  readonly authoredZoom?: number;
}

/** The same graphite-only authored erasure Mark Blackbook's Eraser produces (see blackbookArtworkBridge.ts's BlackbookErasure), on geographic coordinates instead of local ones. */
export interface WallErasure {
  readonly operation: "eraser";
  readonly id?: string;
  artworkId?: string;
  markId?: string;
  creatorId?: string;
  surfaceId?: string;
  readonly points?: readonly {
    readonly longitude?: number | null;
    readonly latitude?: number | null;
  }[];
  readonly width?: number;
  /** See WallStroke.authoredZoom's doc -- same local-only, not-yet-persisted semantics. */
  readonly authoredZoom?: number;
}

export type WallOperation = WallStroke | WallErasure;

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
    ...(stroke.operation ? { material: { supplyId: stroke.operation, materialId: MATERIAL_BY_SUPPLY[stroke.operation] } } : {}),
    // Calibration V1 Revision 7: now persisted (Firestore rules updated to
    // allow this key -- see firestore.rules' hasValidAuthoredZoom) only
    // when a finite value was actually captured; omitted entirely
    // otherwise, so a stroke authored before this revision (or before the
    // MapZoomScale bridge loaded) round-trips exactly as before.
    ...(Number.isFinite(stroke.authoredZoom) ? { authoredZoom: stroke.authoredZoom as number } : {}),
  };
}

export function toGeographicErasureMark(erasure: WallErasure, markId: string): GeographicMaterialErasureMark {
  if (!erasure.id || !Array.isArray(erasure.points) || erasure.points.length < 2) {
    throw new Error("invalid_wall_erasure");
  }
  const points = erasure.points.map((point) => {
    if (!Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) {
      throw new Error("wall_stroke_missing_geographic_coordinates");
    }
    return { longitude: point.longitude as number, latitude: point.latitude as number };
  });
  if (!Number.isFinite(erasure.width) || (erasure.width as number) <= 0) {
    throw new Error("invalid_wall_erasure_width");
  }
  return {
    id: markId,
    type: "material-erasure",
    createdAt: new Date(),
    geometry: { format: "geographic-erasure-v1", points },
    targetMaterialId: "graphite",
    width: erasure.width as number,
    ...(Number.isFinite(erasure.authoredZoom) ? { authoredZoom: erasure.authoredZoom as number } : {}),
  };
}

/** Routes to a Stroke or a graphite-only material-erasure Mark by `operation`, the same branch Blackbook's `toBlackbookMark` makes. */
export function toGeographicMark(operation: WallOperation, markId: string): ArtworkMark {
  return operation.operation === "eraser" ? toGeographicErasureMark(operation, markId) : toStrokeMark(operation, markId);
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

export function createMapArtworkPersistenceBridge(options: Omit<ArtworkPersistenceBridgeOptions<WallOperation>, "surfaceId" | "toMark">) {
  return createArtworkPersistenceBridge({ ...options, surfaceId: SUBWAY_MAP_SURFACE_ID, toMark: toGeographicMark });
}
