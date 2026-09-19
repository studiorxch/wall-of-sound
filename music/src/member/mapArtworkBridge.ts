import type { GeographicArtworkStroke } from "@studiorich/member-identity";

interface WallStroke {
  readonly id?: string;
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
