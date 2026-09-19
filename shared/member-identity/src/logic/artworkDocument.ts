import type {
  CreateMapArtworkInput,
  GeographicArtworkPoint,
  GeographicArtworkStroke,
} from "../data/artworkTypes.js";

export interface NewMapArtworkDocument<TTimestamp> {
  readonly creatorId: string;
  readonly createdAt: TTimestamp;
  readonly updatedAt: TTimestamp;
  readonly surface: { readonly type: "map" };
  readonly geometry: {
    readonly format: "geographic-strokes-v1";
    readonly strokes: readonly GeographicArtworkStroke[];
  };
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

export function validateGeographicStroke(stroke: GeographicArtworkStroke): void {
  assertIdentifier(stroke.id, "stroke_id");
  if (!Array.isArray(stroke.points) || stroke.points.length < 2 || !stroke.points.every(finiteCoordinate)) {
    throw new Error("invalid_artwork_geographic_points");
  }
  if (!stroke.style || typeof stroke.style.color !== "string" || !stroke.style.color.trim()) {
    throw new Error("invalid_artwork_style_color");
  }
  if (!Number.isFinite(stroke.style.width) || stroke.style.width <= 0) {
    throw new Error("invalid_artwork_style_width");
  }
  if (!Number.isFinite(stroke.style.opacity) || stroke.style.opacity < 0 || stroke.style.opacity > 1) {
    throw new Error("invalid_artwork_style_opacity");
  }
}

export function createMapArtworkDocument<TTimestamp>(
  input: CreateMapArtworkInput,
  timestamp: TTimestamp,
): NewMapArtworkDocument<TTimestamp> {
  assertIdentifier(input.creatorId, "creator_id");
  validateGeographicStroke(input.stroke);
  return {
    creatorId: input.creatorId,
    createdAt: timestamp,
    updatedAt: timestamp,
    surface: { type: "map" },
    geometry: { format: "geographic-strokes-v1", strokes: [input.stroke] },
    state: "draft",
    visibility: "private",
  };
}
