import { describe, expect, it } from "vitest";
import { toGeographicArtworkStroke } from "./mapArtworkBridge";

describe("toGeographicArtworkStroke", () => {
  it("persists geographic coordinates without viewport coordinates", () => {
    const result = toGeographicArtworkStroke({
      id: "stroke-1",
      points: [
        { longitude: -73.99, latitude: 40.72 },
        { longitude: -73.98, latitude: 40.73 },
      ],
      style: { color: "#ff4488", width: 4, opacity: 0.88 },
    });
    expect(result.points).toEqual([
      { longitude: -73.99, latitude: 40.72 },
      { longitude: -73.98, latitude: 40.73 },
    ]);
    expect(result.points[0]).not.toHaveProperty("x");
    expect(result.points[0]).not.toHaveProperty("y");
  });

  it("rejects screen-only points", () => {
    expect(() => toGeographicArtworkStroke({
      id: "stroke-1",
      points: [{}, {}],
      style: { color: "#fff", width: 4, opacity: 1 },
    })).toThrow("wall_stroke_missing_geographic_coordinates");
  });
});
