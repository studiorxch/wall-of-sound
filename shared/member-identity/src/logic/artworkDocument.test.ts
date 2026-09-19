import { describe, expect, it } from "vitest";
import { createMapArtworkDocument } from "./artworkDocument.js";

const stroke = {
  id: "stroke-1",
  points: [
    { longitude: -73.99, latitude: 40.72 },
    { longitude: -73.98, latitude: 40.73 },
  ],
  style: { color: "#ff4488", width: 4, opacity: 0.88 },
} as const;

describe("createMapArtworkDocument", () => {
  it("creates private draft map artwork owned by the authenticated member", () => {
    expect(createMapArtworkDocument({ creatorId: "member-uid", stroke }, "server-time")).toEqual({
      creatorId: "member-uid",
      createdAt: "server-time",
      updatedAt: "server-time",
      surface: { type: "map" },
      geometry: { format: "geographic-strokes-v1", strokes: [stroke] },
      state: "draft",
      visibility: "private",
    });
  });

  it("rejects invalid geographic coordinates", () => {
    expect(() => createMapArtworkDocument({
      creatorId: "member-uid",
      stroke: { ...stroke, points: [{ longitude: 200, latitude: 40 }, stroke.points[1]] },
    }, "server-time")).toThrow("invalid_artwork_geographic_points");
  });
});
