import type {
  ArtworkMark,
  CreateMapArtworkInput,
  GeographicArtworkPoint,
  GeographicBounds,
  MapArtwork,
} from "../data/artworkTypes.js";

export const ARTWORK_GROUPING_PROXIMITY_DEGREES = 0.0005;

export interface NewMapArtworkDocument<TTimestamp> {
  readonly creatorId: string;
  readonly createdAt: TTimestamp;
  readonly updatedAt: TTimestamp;
  readonly surfaceId: string;
  readonly composition: { readonly bounds: GeographicBounds; readonly startedAt: TTimestamp; readonly lastEditedAt: TTimestamp };
  readonly marks: readonly ArtworkMark[];
  readonly state: "draft";
  readonly visibility: "private";
}

function assertIdentifier(value: string, field: string): void {
  if (!value || value.trim() !== value || value.includes("/")) {
    throw new Error(`invalid_artwork_${field}`);
  }
}

function finiteCoordinate(point: GeographicArtworkPoint): boolean {
  return Number.isFinite(point.longitude)
    && Number.isFinite(point.latitude)
    && point.longitude >= -180
    && point.longitude <= 180
    && point.latitude >= -90
    && point.latitude <= 90;
}

export function validateArtworkMark(mark: ArtworkMark): void {
  assertIdentifier(mark.id, "mark_id");
  if (mark.type !== "stroke" || mark.geometry.format !== "geographic-stroke-v1" || !Array.isArray(mark.geometry.points) || mark.geometry.points.length < 2 || !mark.geometry.points.every(finiteCoordinate)) {
    throw new Error("invalid_artwork_geographic_points");
  }
  if (!mark.style || typeof mark.style.color !== "string" || !mark.style.color.trim()) {
    throw new Error("invalid_artwork_style_color");
  }
  if (!Number.isFinite(mark.style.width) || mark.style.width <= 0) {
    throw new Error("invalid_artwork_style_width");
  }
  if (!Number.isFinite(mark.style.opacity) || mark.style.opacity < 0 || mark.style.opacity > 1) {
    throw new Error("invalid_artwork_style_opacity");
  }
}

export function boundsForMarks(marks: readonly ArtworkMark[]): GeographicBounds {
  if (!marks.length) throw new Error("artwork_requires_mark");
  const points = marks.flatMap((mark) => [...mark.geometry.points]);
  return { west: Math.min(...points.map((p) => p.longitude)), south: Math.min(...points.map((p) => p.latitude)), east: Math.max(...points.map((p) => p.longitude)), north: Math.max(...points.map((p) => p.latitude)) };
}

export function createMapArtworkDocument<TTimestamp>(
  input: CreateMapArtworkInput,
  timestamp: TTimestamp,
): NewMapArtworkDocument<TTimestamp> {
  assertIdentifier(input.creatorId, "creator_id");
  assertIdentifier(input.surfaceId, "surface_id");
  validateArtworkMark(input.mark);
  return {
    creatorId: input.creatorId,
    createdAt: timestamp,
    updatedAt: timestamp,
    surfaceId: input.surfaceId,
    composition: { bounds: boundsForMarks([input.mark]), startedAt: timestamp, lastEditedAt: timestamp },
    marks: [input.mark],
    state: "draft",
    visibility: "private",
  };
}

function boundsGap(a: GeographicBounds, b: GeographicBounds): number {
  const dx = Math.max(0, a.west - b.east, b.west - a.east);
  const dy = Math.max(0, a.south - b.north, b.south - a.north);
  return Math.hypot(dx, dy);
}

export function selectArtworkForMark(artworks: readonly MapArtwork[], creatorId: string, surfaceId: string, mark: ArtworkMark): MapArtwork | null {
  const bounds = boundsForMarks([mark]);
  return artworks.filter((artwork) => artwork.creatorId === creatorId && artwork.surfaceId === surfaceId && artwork.state === "draft")
    .map((artwork) => ({ artwork, distance: boundsGap(artwork.composition.bounds, bounds) }))
    .filter(({ distance }) => distance <= ARTWORK_GROUPING_PROXIMITY_DEGREES)
    .sort((a, b) => a.distance - b.distance || b.artwork.composition.lastEditedAt.getTime() - a.artwork.composition.lastEditedAt.getTime())[0]?.artwork ?? null;
}
