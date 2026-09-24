import { describe, expect, it, vi } from "vitest";
import type { Artwork } from "@studiorich/member-identity";
import { artworkBoundsToLngLatBox, navigateToArtwork } from "./navigateToArtwork";

function geoArtwork(surfaceId = "map:new-york"): Artwork {
  return {
    id: "artwork-1",
    creatorId: "member-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    surfaceId,
    composition: {
      bounds: { west: -74.02, south: 40.7, east: -74.0, north: 40.72 },
      startedAt: new Date("2026-01-01T00:00:00Z"),
      lastEditedAt: new Date("2026-01-01T00:00:00Z"),
    },
    marks: [],
    artworkType: "map", title: "", state: "draft",
    visibility: "private",
  };
}

function localArtwork(): Artwork {
  return {
    ...geoArtwork("blackbook:page-1"),
    composition: {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      startedAt: new Date("2026-01-01T00:00:00Z"),
      lastEditedAt: new Date("2026-01-01T00:00:00Z"),
    },
  };
}

describe("artworkBoundsToLngLatBox", () => {
  it("converts geographic bounds to a [[west,south],[east,north]] box", () => {
    expect(artworkBoundsToLngLatBox({ west: -74.02, south: 40.7, east: -74.0, north: 40.72 })).toEqual([
      [-74.02, 40.7],
      [-74.0, 40.72],
    ]);
  });

  it("returns null for local (non-geographic) bounds", () => {
    expect(artworkBoundsToLngLatBox({ minX: 0, minY: 0, maxX: 100, maxY: 100 })).toBeNull();
  });

  it("returns null for degenerate (zero-area) geographic bounds", () => {
    expect(artworkBoundsToLngLatBox({ west: -74, south: 40.7, east: -74, north: 40.7 })).toBeNull();
  });
});

describe("navigateToArtwork", () => {
  it("calls fitBounds with the Artwork's bounds when the surface matches", () => {
    const fitBounds = vi.fn();
    const navigated = navigateToArtwork({ fitBounds }, geoArtwork(), { expectedSurfaceId: "map:new-york" });

    expect(navigated).toBe(true);
    expect(fitBounds).toHaveBeenCalledWith(
      [
        [-74.02, 40.7],
        [-74.0, 40.72],
      ],
      { padding: 80 },
    );
  });

  it("does not navigate for an Artwork on a different surface", () => {
    const fitBounds = vi.fn();
    const navigated = navigateToArtwork({ fitBounds }, geoArtwork("blackbook:page-1"), { expectedSurfaceId: "map:new-york" });

    expect(navigated).toBe(false);
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it("does not navigate for non-geographic bounds even on a matching surfaceId", () => {
    const fitBounds = vi.fn();
    const navigated = navigateToArtwork({ fitBounds }, localArtwork(), { expectedSurfaceId: "blackbook:page-1" });

    expect(navigated).toBe(false);
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it("never duplicates or mutates the Artwork's Marks", () => {
    const artwork = geoArtwork();
    const marksBefore = artwork.marks;
    navigateToArtwork({ fitBounds: vi.fn() }, artwork, { expectedSurfaceId: "map:new-york" });
    expect(artwork.marks).toBe(marksBefore);
  });
});
