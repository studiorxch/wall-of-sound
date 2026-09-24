import { describe, expect, it } from "vitest";
import { boundsForMarks, createMapArtworkDocument, selectArtworkForMark, validateArtworkMark } from "./artworkDocument.js";

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

const localMark = {
  id: "local-mark-1",
  type: "stroke" as const,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  geometry: { format: "local-2d-stroke-v1" as const, points: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.3 }] },
  style: { color: "#171412", width: 7, opacity: 0.9 },
} as const;

describe("createMapArtworkDocument", () => {
  it("composes Pencil and graphite-erasure Marks on a local Surface without coupling supply identity to coordinates", () => {
    const pencil = { ...localMark, material: { supplyId: "pencil" as const, materialId: "graphite" as const } };
    const erase = { id: "erase-1", type: "material-erasure" as const, createdAt: new Date(1), geometry: { format: "local-2d-erasure-v1" as const, points: [{ x: 0.22, y: 0.3 }, { x: 0.25, y: 0.35 }] }, targetMaterialId: "graphite" as const, width: 20 };
    const base = { id: "local-art", creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", createdAt: new Date(0), updatedAt: new Date(0), composition: { bounds: boundsForMarks([pencil]), startedAt: new Date(0), lastEditedAt: new Date(0) }, marks: [pencil], artworkType: "map" as const, title: "", state: "draft" as const, visibility: "private" as const };
    expect(selectArtworkForMark([base], base.creatorId, base.surfaceId, erase)?.id).toBe("local-art");
    expect(boundsForMarks([pencil, erase])).toEqual({ minX: 0.1, minY: 0.2, maxX: 0.25, maxY: 0.35 });
  });

  it("keeps graphite, ink, marker, and graphite erasure in one authored Artwork", () => {
    const pencil = { ...localMark, id: "pencil", material: { supplyId: "pencil" as const, materialId: "graphite" as const } };
    const pen = { ...localMark, id: "pen", material: { supplyId: "pen" as const, materialId: "ink" as const }, style: { color: "#101828", width: 3, opacity: 0.65 } };
    const marker = { ...localMark, id: "marker", material: { supplyId: "marker" as const, materialId: "marker" as const }, style: { color: "#d32852", width: 16, opacity: 0.72 } };
    const erase = { id: "erase", type: "material-erasure" as const, createdAt: new Date(3), geometry: { format: "local-2d-erasure-v1" as const, points: localMark.geometry.points }, targetMaterialId: "graphite" as const, width: 28 };
    const base = { id: "art", creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", createdAt: new Date(0), updatedAt: new Date(0), composition: { bounds: boundsForMarks([pencil]), startedAt: new Date(0), lastEditedAt: new Date(0) }, marks: [pencil], artworkType: "map" as const, title: "", state: "draft" as const, visibility: "private" as const };
    expect(selectArtworkForMark([base], base.creatorId, base.surfaceId, pen)?.id).toBe("art");
    expect(selectArtworkForMark([base], base.creatorId, base.surfaceId, marker)?.id).toBe("art");
    expect([pencil, pen, marker, erase].map((item) => item.id)).toEqual(["pencil", "pen", "marker", "erase"]);
    for (const item of [pencil, pen, marker, erase]) expect(() => createMapArtworkDocument({ creatorId: base.creatorId, surfaceId: base.surfaceId, mark: item }, "server-time")).not.toThrow();
  });

  it("keeps Mop as its own material -- coexists with graphite/ink/marker, is not confused with Marker, and works on both local and geographic coordinate variants", () => {
    const pencil = { ...localMark, id: "pencil", material: { supplyId: "pencil" as const, materialId: "graphite" as const } };
    const mop = { ...localMark, id: "mop", material: { supplyId: "mop" as const, materialId: "mop" as const }, style: { color: "#1c6e6e", width: 34, opacity: 0.55 } };
    const base = { id: "art", creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", createdAt: new Date(0), updatedAt: new Date(0), composition: { bounds: boundsForMarks([pencil]), startedAt: new Date(0), lastEditedAt: new Date(0) }, marks: [pencil], artworkType: "map" as const, title: "", state: "draft" as const, visibility: "private" as const };
    expect(selectArtworkForMark([base], base.creatorId, base.surfaceId, mop)?.id).toBe("art");
    expect(mop.material.materialId).not.toBe("marker");
    expect(() => createMapArtworkDocument({ creatorId: base.creatorId, surfaceId: base.surfaceId, mark: mop }, "server-time")).not.toThrow();

    const geographicMop = { ...mark, id: "mop-geo", material: { supplyId: "mop" as const, materialId: "mop" as const } };
    expect(() => createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "map:new-york", mark: geographicMop }, "server-time")).not.toThrow();
  });

  it("keeps Spray as its own material -- coexists with graphite/ink/marker/mop, is not confused with Marker or Mop, and works on both local and geographic coordinate variants", () => {
    const pencil = { ...localMark, id: "pencil", material: { supplyId: "pencil" as const, materialId: "graphite" as const } };
    const spray = { ...localMark, id: "spray", material: { supplyId: "spray" as const, materialId: "spray" as const }, style: { color: "#e2572b", width: 24, opacity: 0.6 } };
    const base = { id: "art", creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", createdAt: new Date(0), updatedAt: new Date(0), composition: { bounds: boundsForMarks([pencil]), startedAt: new Date(0), lastEditedAt: new Date(0) }, marks: [pencil], artworkType: "map" as const, title: "", state: "draft" as const, visibility: "private" as const };
    expect(selectArtworkForMark([base], base.creatorId, base.surfaceId, spray)?.id).toBe("art");
    expect(spray.material.materialId).not.toBe("marker");
    expect(spray.material.materialId).not.toBe("mop");
    expect(() => createMapArtworkDocument({ creatorId: base.creatorId, surfaceId: base.surfaceId, mark: spray }, "server-time")).not.toThrow();

    const geographicSpray = { ...mark, id: "spray-geo", material: { supplyId: "spray" as const, materialId: "spray" as const } };
    expect(() => createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "map:new-york", mark: geographicSpray }, "server-time")).not.toThrow();
  });

  it("allows Pencil material identity on geographic Marks without a Map-specific supply", () => {
    const pencil = { ...mark, material: { supplyId: "pencil" as const, materialId: "graphite" as const } };
    expect(createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "map:new-york", mark: pencil }, "server-time").marks[0]).toMatchObject({ material: { supplyId: "pencil", materialId: "graphite" }, geometry: { format: "geographic-stroke-v1" } });
  });
  it("creates private draft map artwork owned by the authenticated member", () => {
    expect(createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "map:new-york", mark }, "server-time")).toEqual({
      creatorId: "member-uid",
      createdAt: "server-time",
      updatedAt: "server-time",
      surfaceId: "map:new-york",
      composition: { bounds: { west: -73.99, south: 40.72, east: -73.98, north: 40.73 }, startedAt: "server-time", lastEditedAt: "server-time" },
      marks: [mark],
      artworkType: "map",
      title: "",
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
    const base = { id: "art-1", creatorId: "member-uid", surfaceId: "map:new-york", createdAt: new Date(0), updatedAt: new Date(0), composition: { bounds: boundsForMarks([mark]), startedAt: new Date(0), lastEditedAt: new Date(0) }, marks: [mark], artworkType: "map" as const, title: "", state: "draft" as const, visibility: "private" as const };
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

  it("supports local page coordinates without treating them as geography", () => {
    expect(createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", mark: localMark }, "server-time").composition.bounds)
      .toEqual({ minX: 0.1, minY: 0.2, maxX: 0.2, maxY: 0.3 });
  });

  // ARTWORK V2: local/Cartesian coordinates are no longer assumed to be a
  // normalized 0..1 page -- that was Blackbook's own convention, not a
  // shared invariant. A Blank Artwork's infinite document space has no
  // such bound (see artworkDocument.ts's `finiteLocalCoordinate` doc).
  // Only non-finite values are rejected now.
  it("accepts local coordinates far outside 0..1 (Blank Artwork's infinite document space)", () => {
    expect(() => createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "blank:default", mark: { ...localMark, geometry: { ...localMark.geometry, points: [{ x: 12000, y: -4500 }, localMark.geometry.points[1]] } } }, "server-time"))
      .not.toThrow();
  });

  it("still rejects non-finite local coordinates", () => {
    expect(() => createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "blank:default", mark: { ...localMark, geometry: { ...localMark.geometry, points: [{ x: Number.NaN, y: 0.2 }, localMark.geometry.points[1]] } } }, "server-time"))
      .toThrow("invalid_artwork_local_points");
  });

  it("groups related local Marks only on the same local Surface and format", () => {
    const base = { id: "local-art", creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", createdAt: new Date(0), updatedAt: new Date(0), composition: { bounds: boundsForMarks([localMark]), startedAt: new Date(0), lastEditedAt: new Date(0) }, marks: [localMark], artworkType: "map" as const, title: "", state: "draft" as const, visibility: "private" as const };
    const nearby = { ...localMark, id: "local-mark-2", geometry: { ...localMark.geometry, points: [{ x: 0.21, y: 0.3 }, { x: 0.3, y: 0.4 }] } };
    expect(selectArtworkForMark([base], "member-uid", base.surfaceId, nearby)?.id).toBe("local-art");
    expect(selectArtworkForMark([base], "member-uid", "blackbook:book-1:page:page-2", nearby)).toBeNull();
    expect(selectArtworkForMark([base], "member-uid", base.surfaceId, mark)).toBeNull();
  });

  // Blackbook Spatial Workspace V1: pageFrame is optional, additive, and
  // never affects composition.bounds (which stays purely content-derived).
  describe("pageFrame", () => {
    it("omits pageFrame entirely when the caller doesn't supply one", () => {
      const document = createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", mark: localMark }, "server-time");
      expect(document).not.toHaveProperty("pageFrame");
    });

    it("persists a supplied pageFrame without affecting composition.bounds", () => {
      const document = createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", mark: localMark, pageFrame: { x: 0, y: 0, width: 1, height: 1 } }, "server-time");
      expect(document.pageFrame).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      expect(document.composition.bounds).toEqual({ minX: 0.1, minY: 0.2, maxX: 0.2, maxY: 0.3 });
    });

    it("rejects a non-positive-size pageFrame", () => {
      expect(() => createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", mark: localMark, pageFrame: { x: 0, y: 0, width: 0, height: 1 } }, "server-time"))
        .toThrow("invalid_artwork_page_frame");
    });

    it("rejects a non-finite pageFrame", () => {
      expect(() => createMapArtworkDocument({ creatorId: "member-uid", surfaceId: "blackbook:book-1:page:page-1", mark: localMark, pageFrame: { x: Number.NaN, y: 0, width: 1, height: 1 } }, "server-time"))
        .toThrow("invalid_artwork_page_frame");
    });
  });

  describe("Graphite Grades Foundation V1 -- Mark material variant identity", () => {
    const pencilMark = { ...localMark, material: { supplyId: "pencil" as const, materialId: "graphite" as const } };

    it("a legacy Pencil Mark (no variantId) remains valid", () => {
      expect(() => validateArtworkMark(pencilMark)).not.toThrow();
    });

    it("a Pencil Mark with a valid variantId + profileVersion is valid", () => {
      const graded = { ...pencilMark, material: { ...pencilMark.material, variantId: "6b", profileVersion: 1 } };
      expect(() => validateArtworkMark(graded)).not.toThrow();
    });

    it("variantId and profileVersion must be present together", () => {
      const onlyVariant = { ...pencilMark, material: { ...pencilMark.material, variantId: "6b" } };
      expect(() => validateArtworkMark(onlyVariant as never)).toThrow();
      const onlyVersion = { ...pencilMark, material: { ...pencilMark.material, profileVersion: 1 } };
      expect(() => validateArtworkMark(onlyVersion as never)).toThrow();
    });

    it("a non-Pencil supply may not carry a variantId", () => {
      const penMark = { ...localMark, material: { supplyId: "pen" as const, materialId: "ink" as const, variantId: "6b", profileVersion: 1 } };
      expect(() => validateArtworkMark(penMark as never)).toThrow();
    });

    it("profileVersion must be a positive integer", () => {
      const zero = { ...pencilMark, material: { ...pencilMark.material, variantId: "6b", profileVersion: 0 } };
      expect(() => validateArtworkMark(zero as never)).toThrow();
      const fractional = { ...pencilMark, material: { ...pencilMark.material, variantId: "6b", profileVersion: 1.5 } };
      expect(() => validateArtworkMark(fractional as never)).toThrow();
    });
  });
});
