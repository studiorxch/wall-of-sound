import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { decodeArtworkData } from "./firestoreArtworkRepository.js";

describe("legacy Artwork compatibility", () => {
  it("hydrates a legacy geographic stroke as one canonical Stroke Mark", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const artwork = decodeArtworkData("legacy-a", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surface: { type: "map" },
      geometry: { format: "geographic-strokes-v1", strokes: [{ id: "stroke-1", points: [{ longitude: -73.99, latitude: 40.72 }, { longitude: -73.98, latitude: 40.73 }], style: { color: "#fff", width: 4, opacity: 1 } }] },
      state: "draft", visibility: "private",
    });
    expect(artwork.surfaceId).toBe("map:new-york");
    expect(artwork.marks).toHaveLength(1);
    expect(artwork.marks[0]).toMatchObject({ id: "stroke-1", type: "stroke", geometry: { format: "geographic-stroke-v1" } });
    expect(artwork.composition.bounds).toEqual({ west: -73.99, south: 40.72, east: -73.98, north: 40.73 });
  });

  it("hydrates canonical local Blackbook Marks with stable identities", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const artwork = decodeArtworkData("blackbook-art-1", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surfaceId: "blackbook:studio-rich-main:page:page-1",
      composition: { bounds: { minX: 0.1, minY: 0.2, maxX: 0.3, maxY: 0.4 }, startedAt: time, lastEditedAt: time },
      marks: [{ id: "blackbook-mark-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }, style: { color: "#171412", width: 7, opacity: 0.9 } }],
      state: "draft", visibility: "private",
    });
    expect(artwork.id).toBe("blackbook-art-1");
    expect(artwork.surfaceId).toBe("blackbook:studio-rich-main:page:page-1");
    expect(artwork.marks[0]).toMatchObject({ id: "blackbook-mark-1", geometry: { format: "local-2d-stroke-v1" } });
  });

  it("hydrates Pencil identity and authored graphite erasure without changing stable IDs", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const artwork = decodeArtworkData("blackbook-art-supplies", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surfaceId: "blackbook:studio-rich-main:page:page-1",
      composition: { bounds: { minX: 0.1, minY: 0.2, maxX: 0.4, maxY: 0.5 }, startedAt: time, lastEditedAt: time },
      marks: [
        { id: "pencil-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }] }, style: { color: "#171412", width: 9, opacity: 0.55 }, material: { supplyId: "pencil", materialId: "graphite" } },
        { id: "erase-1", type: "material-erasure", createdAt: time, geometry: { format: "local-2d-erasure-v1", points: [{ x: 0.2, y: 0.3 }, { x: 0.3, y: 0.4 }] }, targetMaterialId: "graphite", width: 28 },
      ],
      state: "draft", visibility: "private",
    });
    expect(artwork.marks).toEqual([
      expect.objectContaining({ id: "pencil-1", material: { supplyId: "pencil", materialId: "graphite" }, style: { color: "#171412", width: 9, opacity: 0.55 } }),
      expect.objectContaining({ id: "erase-1", type: "material-erasure", targetMaterialId: "graphite", width: 28 }),
    ]);
  });
});
