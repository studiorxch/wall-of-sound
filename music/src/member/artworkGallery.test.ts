import { describe, expect, it } from "vitest";
import type { Artwork, ArtworkType } from "@studiorich/member-identity";
import {
  deriveArtworkSurfaceLabel,
  deriveArtworkTitle,
  deriveArtworkTypeLabel,
  formatArtworkUpdatedAt,
  formatMemberSince,
  numberArtworksForPagesDrawer,
  resolveDefaultArtworkTitle,
  sortArtworksByRecency,
} from "./artworkGallery";

function artwork(id: string, updatedAt: string, surfaceId = "map:new-york", title = "", artworkType: ArtworkType = "map"): Artwork {
  return {
    id,
    creatorId: "member-1",
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    surfaceId,
    composition: { bounds: { west: 0, south: 0, east: 1, north: 1 }, startedAt: new Date(updatedAt), lastEditedAt: new Date(updatedAt) },
    marks: [],
    artworkType, title, state: "draft",
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
  it("falls back to 'Untitled Artwork' only for a legacy/title-less document", () => {
    expect(deriveArtworkTitle(artwork("a", "2026-01-01T00:00:00Z"))).toBe("Untitled Artwork");
  });

  it("returns the persisted title when one exists", () => {
    expect(deriveArtworkTitle(artwork("a", "2026-01-01T00:00:00Z", "map:new-york", "0923"))).toBe("0923");
  });

  it("treats a whitespace-only title as no title", () => {
    expect(deriveArtworkTitle(artwork("a", "2026-01-01T00:00:00Z", "map:new-york", "   "))).toBe("Untitled Artwork");
  });
});

describe("deriveArtworkTypeLabel", () => {
  it("labels map and blank Artwork types", () => {
    expect(deriveArtworkTypeLabel("map")).toBe("Map");
    expect(deriveArtworkTypeLabel("blank")).toBe("Blank");
  });
});

describe("resolveDefaultArtworkTitle", () => {
  const today = new Date("2026-09-23T12:00:00Z");

  it("produces the MMDD date name when nothing exists yet today", () => {
    expect(resolveDefaultArtworkTitle([], today)).toBe("0923");
  });

  it("produces '0923-2' once '0923' is already taken", () => {
    const existing = [artwork("a", "2026-09-23T00:00:00Z", "map:new-york", "0923")];
    expect(resolveDefaultArtworkTitle(existing, today)).toBe("0923-2");
  });

  it("uses max-existing-suffix + 1, not a plain count", () => {
    const existing = [
      artwork("a", "2026-09-23T00:00:00Z", "map:new-york", "0923"),
      artwork("b", "2026-09-23T00:00:00Z", "map:new-york", "0923-2"),
      artwork("c", "2026-09-23T00:00:00Z", "map:new-york", "0923-3"),
    ];
    expect(resolveDefaultArtworkTitle(existing, today)).toBe("0923-4");
  });

  it("deleting a middle suffix and creating another does not reissue an already-used title", () => {
    // 0923, 0923-2, 0923-3 existed; 0923-2 was deleted -- only 0923 and 0923-3 remain.
    const existing = [
      artwork("a", "2026-09-23T00:00:00Z", "map:new-york", "0923"),
      artwork("c", "2026-09-23T00:00:00Z", "map:new-york", "0923-3"),
    ];
    expect(resolveDefaultArtworkTitle(existing, today)).toBe("0923-4");
  });

  it("Map and Blank share the same date-name sequence", () => {
    const existing = [
      artwork("a", "2026-09-23T00:00:00Z", "map:new-york", "0923", "map"),
      artwork("b", "2026-09-23T00:00:00Z", "blank:default", "0923-2", "blank"),
    ];
    expect(resolveDefaultArtworkTitle(existing, today)).toBe("0923-3");
  });

  it("ignores unrelated titles and other dates' generated names", () => {
    const existing = [
      artwork("a", "2026-09-22T00:00:00Z", "map:new-york", "0922"),
      artwork("b", "2026-09-23T00:00:00Z", "map:new-york", "My Brooklyn Piece"),
    ];
    expect(resolveDefaultArtworkTitle(existing, today)).toBe("0923");
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

describe("BLACKBOOK Embedded PAGES Drawer V1 -- numberArtworksForPagesDrawer", () => {
  it("numbers 1..N in the SAME recency order sortArtworksByRecency already uses -- never a second/parallel ordering", () => {
    const older = artwork("a", "2026-01-01T00:00:00Z");
    const newer = artwork("b", "2026-02-01T00:00:00Z");
    const numbered = numberArtworksForPagesDrawer([older, newer]);
    expect(numbered.map((entry) => entry.artwork.id)).toEqual(sortArtworksByRecency([older, newer]).map((a) => a.id));
    expect(numbered.map((entry) => entry.number)).toEqual([1, 2]);
  });

  it("numbers are presentation order only -- reordering the underlying recency never makes a number equal an Artwork id, and the same Artwork can receive a DIFFERENT number after its recency changes", () => {
    const a = artwork("art-a", "2026-01-01T00:00:00Z");
    const b = artwork("art-b", "2026-02-01T00:00:00Z");
    const before = numberArtworksForPagesDrawer([a, b]);
    expect(before.find((entry) => entry.artwork.id === "art-b")?.number).toBe(1);
    // "art-a" becomes more recently updated than "art-b" -- a real recency change, not an identity change.
    const aUpdated = { ...a, updatedAt: new Date("2026-03-01T00:00:00Z") };
    const after = numberArtworksForPagesDrawer([aUpdated, b]);
    expect(after.find((entry) => entry.artwork.id === "art-a")?.number).toBe(1);
    // The Artwork's own id/identity is completely unaffected by its number changing.
    expect(after.find((entry) => entry.artwork.id === "art-a")?.artwork.id).toBe("art-a");
  });

  it("removes no data from the underlying Artwork -- every original field is still present on each numbered entry", () => {
    const a = artwork("art-a", "2026-01-01T00:00:00Z", "blackbook:studio-rich-main:page:page-1", "", "blank");
    const numbered = numberArtworksForPagesDrawer([a]);
    expect(numbered[0].artwork).toEqual(a);
  });

  it("an empty Artwork list numbers to an empty list, never throwing", () => {
    expect(numberArtworksForPagesDrawer([])).toEqual([]);
  });
});
