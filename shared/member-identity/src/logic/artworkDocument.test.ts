import { describe, expect, it } from "vitest";
import { boundsForMarks, createMapArtworkDocument, selectArtworkForMark } from "./artworkDocument.js";

const mark = {
  id: "mark-1",
  type: "stroke" as const,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  geometry: { format: "geographic-stroke-v1" as const, points: [
    { longitude: -73.99, latitude: 40.72 },
    { longitude: -73.98, latitude: 40.73 },
  ] },
  style: { color: "#ff4488", width: 4, opacity: 0.88 },
} as const;

describe("createMapArtworkDocument", () => {
  it("creates private draft map artwork owned by the authenticated member", () => {
    expect(createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "map:new-york", mark }, "server-time")).toEqual({
      creatorId: "member-uid",
      createdAt: "server-time",
      updatedAt: "server-time",
      surfaceId: "map:new-york",
      composition: { bounds: { west: -73.99, south: 40.72, east: -73.98, north: 40.73 }, startedAt: "server-time", lastEditedAt: "server-time" },
      marks: [mark],
      state: "draft",
      visibility: "private",
    });
  });

  it("rejects invalid geographic coordinates", () => {
    expect(() => createMapArtworkDocument({
      creatorId: "member-uid",
      surfaceId: "map:new-york",
      mark: { ...mark, geometry: { ...mark.geometry, points: [{ longitude: 200, latitude: 40 }, mark.geometry.points[1]] } },
    }, "server-time")).toThrow("invalid_artwork_geographic_points");
  });

  it("groups nearby marks but separates distant, creator, and surface boundaries", () => {
    const base = { id: "art-1", creatorId: "member-uid", surfaceId: "map:new-york", createdAt: new Date(0), updatedAt: new Date(0), composition: { bounds: boundsForMarks([mark]), startedAt: new Date(0), lastEditedAt: new Date(0) }, marks: [mark], state: "draft" as const, visibility: "private" as const };
    const nearby = { ...mark, id: "mark-2", geometry: { ...mark.geometry, points: [{ longitude: -73.9798, latitude: 40.73 }, { longitude: -73.97, latitude: 40.74 }] } };
    const distant = { ...nearby, geometry: { ...mark.geometry, points: [{ longitude: -74.2, latitude: 40.5 }, { longitude: -74.19, latitude: 40.51 }] } };
    expect(selectArtworkForMark([base], "member-uid", "map:new-york", nearby)?.id).toBe("art-1");
    expect(selectArtworkForMark([base], "member-uid", "map:new-york", distant)).toBeNull();
    expect(selectArtworkForMark([base], "other", "map:new-york", mark)).toBeNull();
    expect(selectArtworkForMark([base], "member-uid", "station:1:wall", mark)).toBeNull();
  });

  it("expands bounds across all marks", () => {
    const other = { ...mark, id: "mark-2", geometry: { ...mark.geometry, points: [{ longitude: -74.1, latitude: 40.6 }, { longitude: -73.8, latitude: 40.9 }] } };
    expect(boundsForMarks([mark, other])).toEqual({ west: -74.1, south: 40.6, east: -73.8, north: 40.9 });
  });
});
