import { describe, expect, it, vi } from "vitest";
import type { Artwork } from "@studiorich/member-identity";
import { createSessionArtworkLibrary } from "./sessionArtworkLibrary";

function artwork(id: string, updatedAt: string): Artwork {
  return {
    id,
    creatorId: "member-1",
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    surfaceId: "map:new-york",
    composition: { bounds: { west: 0, south: 0, east: 1, north: 1 }, startedAt: new Date(updatedAt), lastEditedAt: new Date(updatedAt) },
    marks: [],
    artworkType: "map", title: "", state: "draft",
    visibility: "private",
  };
}

describe("createSessionArtworkLibrary", () => {
  it("starts empty and is populated by an initial hydration replaceAll", () => {
    const library = createSessionArtworkLibrary();
    expect(library.getAll()).toEqual([]);
    library.replaceAll([artwork("a", "2026-01-01T00:00:00Z")]);
    expect(library.getAll().map((item) => item.id)).toEqual(["a"]);
  });

  it("upsert inserts a genuinely new Artwork without touching existing ones", () => {
    const library = createSessionArtworkLibrary();
    library.replaceAll([artwork("a", "2026-01-01T00:00:00Z")]);
    library.upsert(artwork("b", "2026-01-02T00:00:00Z"));
    expect(library.getAll().map((item) => item.id).sort()).toEqual(["a", "b"]);
  });

  it("upsert replaces the SAME Artwork id instead of duplicating a card", () => {
    const library = createSessionArtworkLibrary();
    library.replaceAll([artwork("a", "2026-01-01T00:00:00Z")]);
    library.upsert(artwork("a", "2026-01-02T00:00:00Z"));
    expect(library.getAll()).toHaveLength(1);
    expect(library.getAll()[0].updatedAt.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("remove deletes an Artwork from the session projection", () => {
    const library = createSessionArtworkLibrary();
    library.replaceAll([artwork("a", "2026-01-01T00:00:00Z"), artwork("b", "2026-01-02T00:00:00Z")]);
    library.remove("a");
    expect(library.getAll().map((item) => item.id)).toEqual(["b"]);
  });

  it("remove of an unknown id is a harmless no-op and does not notify", () => {
    const library = createSessionArtworkLibrary();
    library.replaceAll([artwork("a", "2026-01-01T00:00:00Z")]);
    const listener = vi.fn();
    library.subscribe(listener);
    library.remove("does-not-exist");
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies subscribers on replaceAll, upsert, and remove", () => {
    const library = createSessionArtworkLibrary();
    const listener = vi.fn();
    library.subscribe(listener);

    library.replaceAll([artwork("a", "2026-01-01T00:00:00Z")]);
    library.upsert(artwork("b", "2026-01-02T00:00:00Z"));
    library.remove("a");

    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("subscribe returns an unsubscribe function", () => {
    const library = createSessionArtworkLibrary();
    const listener = vi.fn();
    const unsubscribe = library.subscribe(listener);
    unsubscribe();
    library.upsert(artwork("a", "2026-01-01T00:00:00Z"));
    expect(listener).not.toHaveBeenCalled();
  });

  it("rapid consecutive upserts to the same id converge to the latest state with no duplicate", () => {
    const library = createSessionArtworkLibrary();
    library.replaceAll([]);
    library.upsert(artwork("a", "2026-01-01T00:00:00Z"));
    library.upsert(artwork("a", "2026-01-01T00:00:01Z"));
    library.upsert(artwork("a", "2026-01-01T00:00:02Z"));
    expect(library.getAll()).toHaveLength(1);
    expect(library.getAll()[0].updatedAt.toISOString()).toBe("2026-01-01T00:00:02.000Z");
  });
});
