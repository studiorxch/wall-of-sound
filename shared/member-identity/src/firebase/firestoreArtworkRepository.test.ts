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

  it("hydrates ordered Ink and Marker Marks without changing material or style", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const points = [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }];
    const artwork = decodeArtworkData("multi-material", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surfaceId: "blackbook:studio-rich-main:page:page-1",
      composition: { bounds: { minX: 0.1, minY: 0.2, maxX: 0.4, maxY: 0.5 }, startedAt: time, lastEditedAt: time },
      marks: [
        { id: "ink-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#101828", width: 4, opacity: 0.55 }, material: { supplyId: "pen", materialId: "ink" } },
        { id: "marker-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#d32852", width: 18, opacity: 0.7 }, material: { supplyId: "marker", materialId: "marker" } },
      ],
      state: "draft", visibility: "private",
    });
    expect(artwork.marks.map((mark) => mark.id)).toEqual(["ink-1", "marker-1"]);
    expect(artwork.marks[0]).toMatchObject({ material: { supplyId: "pen", materialId: "ink" }, style: { width: 4, opacity: 0.55 } });
    expect(artwork.marks[1]).toMatchObject({ material: { supplyId: "marker", materialId: "marker" }, style: { width: 18, opacity: 0.7 } });
  });

  it("V3: hydrates Mop alongside Graphite/Ink/Marker with stable identity, Width/Opacity, and authored order preserved -- Mop is never decoded as Marker", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const points = [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }];
    const artwork = decodeArtworkData("multi-material-with-mop", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surfaceId: "blackbook:studio-rich-main:page:page-1",
      composition: { bounds: { minX: 0.1, minY: 0.2, maxX: 0.4, maxY: 0.5 }, startedAt: time, lastEditedAt: time },
      marks: [
        { id: "pencil-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#171412", width: 5, opacity: 0.82 }, material: { supplyId: "pencil", materialId: "graphite" } },
        { id: "ink-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#101828", width: 4, opacity: 0.55 }, material: { supplyId: "pen", materialId: "ink" } },
        { id: "marker-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#d32852", width: 18, opacity: 0.7 }, material: { supplyId: "marker", materialId: "marker" } },
        { id: "mop-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#1c6e6e", width: 34, opacity: 0.55 }, material: { supplyId: "mop", materialId: "mop" } },
      ],
      state: "draft", visibility: "private",
    });
    expect(artwork.marks.map((mark) => mark.id)).toEqual(["pencil-1", "ink-1", "marker-1", "mop-1"]);
    const mopMark = artwork.marks[3];
    expect(mopMark).toMatchObject({ material: { supplyId: "mop", materialId: "mop" }, style: { width: 34, opacity: 0.55 } });
    expect(mopMark.type === "stroke" ? mopMark.material?.materialId : undefined).not.toBe("marker");
  });

  it("V4: hydrates Spray alongside Graphite/Ink/Marker/Mop with stable identity, Width/Opacity, and authored order preserved -- Spray is never decoded as Marker or Mop", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const points = [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }];
    const artwork = decodeArtworkData("multi-material-with-spray", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surfaceId: "blackbook:studio-rich-main:page:page-1",
      composition: { bounds: { minX: 0.1, minY: 0.2, maxX: 0.4, maxY: 0.5 }, startedAt: time, lastEditedAt: time },
      marks: [
        { id: "pencil-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#171412", width: 5, opacity: 0.82 }, material: { supplyId: "pencil", materialId: "graphite" } },
        { id: "ink-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#101828", width: 4, opacity: 0.55 }, material: { supplyId: "pen", materialId: "ink" } },
        { id: "marker-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#d32852", width: 18, opacity: 0.7 }, material: { supplyId: "marker", materialId: "marker" } },
        { id: "mop-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#1c6e6e", width: 34, opacity: 0.55 }, material: { supplyId: "mop", materialId: "mop" } },
        { id: "spray-1", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points }, style: { color: "#e2572b", width: 24, opacity: 0.6 }, material: { supplyId: "spray", materialId: "spray" } },
      ],
      state: "draft", visibility: "private",
    });
    expect(artwork.marks.map((mark) => mark.id)).toEqual(["pencil-1", "ink-1", "marker-1", "mop-1", "spray-1"]);
    const sprayMark = artwork.marks[4];
    expect(sprayMark).toMatchObject({ material: { supplyId: "spray", materialId: "spray" }, style: { width: 24, opacity: 0.6 } });
    const sprayMaterialId = sprayMark.type === "stroke" ? sprayMark.material?.materialId : undefined;
    expect(sprayMaterialId).not.toBe("marker");
    expect(sprayMaterialId).not.toBe("mop");
  });
});

describe("Calibration V1 Revision 7 -- authoredZoom decode round trip", () => {
  it("decodes a geographic stroke Mark's authoredZoom from Firestore data", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const artwork = decodeArtworkData("zoom-art-1", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surfaceId: "map:new-york",
      composition: { bounds: { west: -73.99, south: 40.72, east: -73.98, north: 40.73 }, startedAt: time, lastEditedAt: time },
      marks: [{ id: "mark-zoom", type: "stroke", createdAt: time, geometry: { format: "geographic-stroke-v1", points: [{ longitude: -73.99, latitude: 40.72 }, { longitude: -73.98, latitude: 40.73 }] }, style: { color: "#1c6e6e", width: 34, opacity: 0.6 }, authoredZoom: 15.4 }],
      state: "draft", visibility: "private",
    });
    expect(artwork.marks[0]).toMatchObject({ authoredZoom: 15.4 });
  });

  it("decodes a geographic material-erasure Mark's authoredZoom from Firestore data", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const artwork = decodeArtworkData("zoom-art-2", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surfaceId: "map:new-york",
      composition: { bounds: { west: -73.99, south: 40.72, east: -73.98, north: 40.73 }, startedAt: time, lastEditedAt: time },
      marks: [{ id: "mark-erase-zoom", type: "material-erasure", createdAt: time, geometry: { format: "geographic-erasure-v1", points: [{ longitude: -73.99, latitude: 40.72 }, { longitude: -73.98, latitude: 40.73 }] }, targetMaterialId: "graphite", width: 28, authoredZoom: 9.1 }],
      state: "draft", visibility: "private",
    });
    expect(artwork.marks[0]).toMatchObject({ authoredZoom: 9.1 });
  });

  it("a legacy Mark without authoredZoom decodes cleanly with no such property at all", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const artwork = decodeArtworkData("zoom-art-legacy", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surfaceId: "map:new-york",
      composition: { bounds: { west: -73.99, south: 40.72, east: -73.98, north: 40.73 }, startedAt: time, lastEditedAt: time },
      marks: [{ id: "mark-legacy", type: "stroke", createdAt: time, geometry: { format: "geographic-stroke-v1", points: [{ longitude: -73.99, latitude: 40.72 }, { longitude: -73.98, latitude: 40.73 }] }, style: { color: "#171412", width: 5, opacity: 0.82 } }],
      state: "draft", visibility: "private",
    });
    expect(artwork.marks[0]).not.toHaveProperty("authoredZoom");
  });

  it("a local-2d (Blackbook) Mark never carries authoredZoom, even if a stray value were present in the document", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const artwork = decodeArtworkData("zoom-art-blackbook", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surfaceId: "blackbook:studio-rich-main:page:page-1",
      composition: { bounds: { minX: 0.1, minY: 0.2, maxX: 0.3, maxY: 0.4 }, startedAt: time, lastEditedAt: time },
      marks: [{ id: "mark-blackbook", type: "stroke", createdAt: time, geometry: { format: "local-2d-stroke-v1", points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }, style: { color: "#171412", width: 5, opacity: 0.82 }, authoredZoom: 15 }],
      state: "draft", visibility: "private",
    });
    expect(artwork.marks[0]).not.toHaveProperty("authoredZoom");
  });
});
