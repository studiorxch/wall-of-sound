import type {
  ArtworkMark,
  ArtworkBounds,
  CreateArtworkInput,
  GeographicArtworkPoint,
  LocalArtworkPoint,
  MapArtwork,
} from "../data/artworkTypes.js";

export const ARTWORK_GROUPING_PROXIMITY_DEGREES = 0.0005;
export const ARTWORK_GROUPING_PROXIMITY_LOCAL = 0.08;

export interface NewMapArtworkDocument<TTimestamp> {
  readonly creatorId: string;
  readonly createdAt: TTimestamp;
  readonly updatedAt: TTimestamp;
  readonly surfaceId: string;
  readonly composition: { readonly bounds: ArtworkBounds; readonly startedAt: TTimestamp; readonly lastEditedAt: TTimestamp };
  readonly marks: readonly ArtworkMark[];
  readonly state: "draft";
  readonly visibility: "private";
}

function assertIdentifier(value: string, field: string): void {
  if (!value || value.trim() !== value || value.includes("/")) {
    throw new Error(`invalid_artwork_${field}`);
  }
}

function finiteGeographicCoordinate(point: GeographicArtworkPoint): boolean {
  return Number.isFinite(point.longitude)
    && Number.isFinite(point.latitude)
    && point.longitude >= -180
    && point.longitude <= 180
    && point.latitude >= -90
    && point.latitude <= 90;
}

function finiteLocalCoordinate(point: LocalArtworkPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export function validateArtworkMark(mark: ArtworkMark): void {
  assertIdentifier(mark.id, "mark_id");
  if (!Array.isArray(mark.geometry.points) || mark.geometry.points.length < 2) {
    throw new Error("invalid_artwork_points");
  }
  if (mark.geometry.format === "geographic-stroke-v1" || mark.geometry.format === "geographic-erasure-v1") {
    if (!mark.geometry.points.every(finiteGeographicCoordinate)) throw new Error("invalid_artwork_geographic_points");
  } else if (mark.geometry.format === "local-2d-stroke-v1" || mark.geometry.format === "local-2d-erasure-v1") {
    if (!mark.geometry.points.every(finiteLocalCoordinate)) throw new Error("invalid_artwork_local_points");
  } else {
    throw new Error("invalid_artwork_geometry_format");
  }
  if (mark.type === "material-erasure") {
    if (mark.targetMaterialId !== "graphite" || !Number.isFinite(mark.width) || mark.width <= 0) throw new Error("invalid_artwork_erasure");
    return;
  }
  if (mark.type !== "stroke") throw new Error("invalid_artwork_mark_type");
  if (mark.material) {
    const validMaterial = (mark.material.supplyId === "pencil" && mark.material.materialId === "graphite")
      || (mark.material.supplyId === "pen" && mark.material.materialId === "ink")
      || (mark.material.supplyId === "marker" && mark.material.materialId === "marker")
      || (mark.material.supplyId === "mop" && mark.material.materialId === "mop")
      || (mark.material.supplyId === "spray" && mark.material.materialId === "spray");
    if (!validMaterial) throw new Error("invalid_artwork_material");
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

export function boundsForMarks(marks: readonly ArtworkMark[]): ArtworkBounds {
  if (!marks.length) throw new Error("artwork_requires_mark");
  const geographic = marks[0].geometry.format.startsWith("geographic-");
  if (!marks.every((mark) => mark.geometry.format.startsWith(geographic ? "geographic-" : "local-2d-"))) throw new Error("artwork_mixed_coordinate_formats");
  if (geographic) {
    const points: GeographicArtworkPoint[] = marks.flatMap((mark) => "longitude" in mark.geometry.points[0] ? [...mark.geometry.points] as GeographicArtworkPoint[] : []);
    return { west: Math.min(...points.map((p) => p.longitude)), south: Math.min(...points.map((p) => p.latitude)), east: Math.max(...points.map((p) => p.longitude)), north: Math.max(...points.map((p) => p.latitude)) };
  }
  const points: LocalArtworkPoint[] = marks.flatMap((mark) => "x" in mark.geometry.points[0] ? [...mark.geometry.points] as LocalArtworkPoint[] : []);
  return { minX: Math.min(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)), maxX: Math.max(...points.map((p) => p.x)), maxY: Math.max(...points.map((p) => p.y)) };
}

export function createMapArtworkDocument<TTimestamp>(
  input: CreateArtworkInput,
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

function normalizedBounds(bounds: ArtworkBounds): { minX: number; minY: number; maxX: number; maxY: number; format: "geographic" | "local" } {
  return "west" in bounds
    ? { minX: bounds.west, minY: bounds.south, maxX: bounds.east, maxY: bounds.north, format: "geographic" }
    : { ...bounds, format: "local" };
}

function boundsGap(a: ArtworkBounds, b: ArtworkBounds): number {
  const aa = normalizedBounds(a); const bb = normalizedBounds(b);
  if (aa.format !== bb.format) return Number.POSITIVE_INFINITY;
  const dx = Math.max(0, aa.minX - bb.maxX, bb.minX - aa.maxX);
  const dy = Math.max(0, aa.minY - bb.maxY, bb.minY - aa.maxY);
  return Math.hypot(dx, dy);
}

export function selectArtworkForMark(artworks: readonly MapArtwork[], creatorId: string, surfaceId: string, mark: ArtworkMark): MapArtwork | null {
  const bounds = boundsForMarks([mark]);
  const local = mark.geometry.format.startsWith("local-2d-");
  const threshold = local ? ARTWORK_GROUPING_PROXIMITY_LOCAL : ARTWORK_GROUPING_PROXIMITY_DEGREES;
  return artworks.filter((artwork) => artwork.creatorId === creatorId && artwork.surfaceId === surfaceId && artwork.state === "draft" && artwork.marks[0]?.geometry.format.startsWith(local ? "local-2d-" : "geographic-"))
    .map((artwork) => ({ artwork, distance: boundsGap(artwork.composition.bounds, bounds) }))
    .filter(({ distance }) => distance <= threshold)
    .sort((a, b) => a.distance - b.distance || b.artwork.composition.lastEditedAt.getTime() - a.artwork.composition.lastEditedAt.getTime())[0]?.artwork ?? null;
}
