import { describe, expect, it } from "vitest";
import type { Artwork } from "@studiorich/member-identity";
import {
  deriveArtworkSurfaceLabel,
  deriveArtworkTitle,
  formatArtworkUpdatedAt,
  formatMemberSince,
  sortArtworksByRecency,
} from "./artworkGallery";

function artwork(id: string, updatedAt: string, surfaceId = "map:new-york"): Artwork {
  return {
    id,
    creatorId: "member-1",
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    surfaceId,
    composition: { bounds: { west: 0, south: 0, east: 1, north: 1 }, startedAt: new Date(updatedAt), lastEditedAt: new Date(updatedAt) },
    marks: [],
    state: "draft",
    visibility: "private",
  };
}

describe("sortArtworksByRecency", () => {
  it("orders most recently updated first, without mutating the input", () => {
    const older = artwork("a", "2026-01-01T00:00:00Z");
    const newer = artwork("b", "2026-02-01T00:00:00Z");
    const input = [older, newer];

    const sorted = sortArtworksByRecency(input);

    expect(sorted.map((item) => item.id)).toEqual(["b", "a"]);
    expect(input.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("deriveArtworkTitle", () => {
  it("always returns the UI fallback label -- Artwork has no persisted title field", () => {
    expect(deriveArtworkTitle(artwork("a", "2026-01-01T00:00:00Z"))).toBe("Untitled Artwork");
  });
});

describe("deriveArtworkSurfaceLabel", () => {
  it("labels the known Subway map surface", () => {
    expect(deriveArtworkSurfaceLabel("map:new-york")).toBe("Subway — New York");
  });

  it("falls back to the raw surfaceId for an unlabeled surface", () => {
    expect(deriveArtworkSurfaceLabel("blackbook:page-1")).toBe("blackbook:page-1");
  });
});

describe("formatArtworkUpdatedAt / formatMemberSince", () => {
  it("produces non-empty human-readable strings", () => {
    expect(formatArtworkUpdatedAt(new Date("2026-03-05T10:30:00Z")).length).toBeGreaterThan(0);
    expect(formatMemberSince(new Date("2026-01-01T00:00:00Z")).length).toBeGreaterThan(0);
  });
});
