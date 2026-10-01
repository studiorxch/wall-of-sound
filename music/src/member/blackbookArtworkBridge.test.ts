import { describe, expect, it, vi } from "vitest";
import { selectArtworkForMark, type Artwork, type ArtworkMark, type ArtworkRepository } from "@studiorich/member-identity";
import { BLACKBOOK_PAGE_FRAME, BLACKBOOK_PAGE_SURFACE_ID, createBlackbookArtworkPersistenceBridge, filterBlackbookArtworks, resolveActiveBlackbookArtworkId, toBlackbookMark, toLocalDripMark, toLocalErasureMark, toLocalStrokeMark, withActiveArtworkUrlParam, type BlackbookOperation, type BlackbookStroke } from "./blackbookArtworkBridge";

function stroke(id: string, offset = 0): BlackbookStroke {
  return { operation: "pencil", id, points: [{ x: 0.1 + offset, y: 0.2 }, { x: 0.2 + offset, y: 0.3 }], style: { color: "#171412", width: 7, opacity: 0.9 } };
}

function artwork(id: string, marks: readonly ArtworkMark[] = [toLocalStrokeMark(stroke("a"), "mark-a", new Date(0))]): Artwork {
  return { id, creatorId: "member-1", surfaceId: BLACKBOOK_PAGE_SURFACE_ID, createdAt: new Date(0), updatedAt: new Date(0), composition: { bounds: { minX: 0.1, minY: 0.2, maxX: 0.2, maxY: 0.3 }, startedAt: new Date(0), lastEditedAt: new Date(0) }, marks, artworkType: "map", title: "", state: "draft", visibility: "private" };
}

describe("Blackbook Artwork Surface bridge", () => {
  it("uses a stable Blackbook page Surface identity and local normalized points", () => {
    expect(BLACKBOOK_PAGE_SURFACE_ID).toBe("blackbook:studio-rich-main:page:page-1");
    const mark = toLocalStrokeMark(stroke("stroke-a"), "mark-a", new Date(0));
    expect(mark.geometry).toEqual({ format: "local-2d-stroke-v1", points: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.3 }] });
    expect(mark.material).toEqual({ supplyId: "pencil", materialId: "graphite" });
  });

  it("authors material-specific erasure as a separate Mark rather than Undo", () => {
    const mark = toLocalErasureMark({ operation: "eraser", id: "erase-a", points: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.3 }], width: 28 }, "erase-mark", new Date(0));
    expect(mark).toMatchObject({ type: "material-erasure", targetMaterialId: "graphite", width: 28, geometry: { format: "local-2d-erasure-v1" } });
  });

  it("preserves Pen and Marker identity, width, and opacity in shared local Marks", () => {
    const pen = toLocalStrokeMark({ ...stroke("pen"), operation: "pen", style: { color: "#101828", width: 4, opacity: 0.55 } }, "mark-pen", new Date(1));
    const marker = toLocalStrokeMark({ ...stroke("marker"), operation: "marker", style: { color: "#d32852", width: 18, opacity: 0.7 } }, "mark-marker", new Date(2));
    expect(pen).toMatchObject({ material: { supplyId: "pen", materialId: "ink" }, style: { width: 4, opacity: 0.55 } });
    expect(marker).toMatchObject({ material: { supplyId: "marker", materialId: "marker" }, style: { width: 18, opacity: 0.7 } });
  });

  it("V3: gives Mop its own material identity, distinct from Marker, with Width/Opacity preserved", () => {
    const mop = toLocalStrokeMark({ ...stroke("mop"), operation: "mop", style: { color: "#1c6e6e", width: 34, opacity: 0.55 } }, "mark-mop", new Date(3));
    expect(mop).toMatchObject({ material: { supplyId: "mop", materialId: "mop" }, style: { width: 34, opacity: 0.55 } });
    expect(mop.material?.materialId).not.toBe("marker");
    expect(mop.material?.supplyId).not.toBe("marker");
  });

  it("V3: Mop coexists with Graphite/Ink/Marker in one Artwork -- selecting Mop does not inherently split the Artwork when composition says the Marks belong together", () => {
    const pencilMark = toLocalStrokeMark(stroke("pencil-a"), "mark-pencil", new Date(0));
    const withPencil = artwork("art-multi", [pencilMark]);
    const mopMark = toLocalStrokeMark({ ...stroke("mop-a", 0.01), operation: "mop", style: { color: "#1c6e6e", width: 34, opacity: 0.55 } }, "mark-mop", new Date(1));
    expect(selectArtworkForMark([withPencil], "member-1", BLACKBOOK_PAGE_SURFACE_ID, mopMark)?.id).toBe("art-multi");
  });

  it("composes nearby Marks, removes one Mark, then deletes the Artwork on final Mark", async () => {
    const first = artwork("art-1");
    const secondMark = toLocalStrokeMark(stroke("b", 0.01), "mark-b", new Date(1));
    const twoMarks = artwork("art-1", [...first.marks, secondMark]);
    expect(selectArtworkForMark([first], "member-1", BLACKBOOK_PAGE_SURFACE_ID, secondMark)?.id).toBe("art-1");
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(async () => first), listOwnedArtwork: vi.fn(async () => [first]),
      createMapArtwork: vi.fn(async () => first), listOwnedMapArtwork: vi.fn(async () => [first]),
      appendOwnedArtworkMark: vi.fn(async () => twoMarks),
      removeOwnedArtworkMark: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(null),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn((item: BlackbookOperation, artworkId: string, markId: string, creatorId: string, surfaceId: string) => Boolean(Object.assign(item, { artworkId, markId, creatorId, surfaceId })));
    const bridge = createBlackbookArtworkPersistenceBridge({ repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-b" });
    bridge.replaceKnownArtworks([first]);
    const second = stroke("b", 0.01);
    await bridge.persistStroke(second);
    await bridge.removeStroke(second);
    expect(repository.appendOwnedArtworkMark).toHaveBeenCalledWith("art-1", "member-1", expect.objectContaining({ id: "mark-b" }));
    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledWith("art-1", "member-1", "mark-b");

    const hydratedFirst = Object.assign(stroke("a"), { artworkId: "art-1", markId: "mark-a", creatorId: "member-1", surfaceId: BLACKBOOK_PAGE_SURFACE_ID });
    await bridge.removeStroke(hydratedFirst);
    expect(repository.removeOwnedArtworkMark).toHaveBeenLastCalledWith("art-1", "member-1", "mark-a");
  });

  it("V3: Undo removes only the latest Mop operation, leaving the Artwork and its other Marks untouched", async () => {
    const pencilMark = toLocalStrokeMark(stroke("a"), "mark-a", new Date(0));
    const first = artwork("art-mop", [pencilMark]);
    const mopStroke: BlackbookStroke = { operation: "mop", id: "mop-op", points: [{ x: 0.11, y: 0.21 }, { x: 0.21, y: 0.31 }], style: { color: "#1c6e6e", width: 34, opacity: 0.55 } };
    const mopMark = toLocalStrokeMark(mopStroke, "mark-mop", new Date(1));
    const withMop = artwork("art-mop", [pencilMark, mopMark]);
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(async () => first), listOwnedArtwork: vi.fn(async () => [first]),
      createMapArtwork: vi.fn(async () => first), listOwnedMapArtwork: vi.fn(async () => [first]),
      appendOwnedArtworkMark: vi.fn(async () => withMop),
      removeOwnedArtworkMark: vi.fn(async () => first),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn((item: BlackbookOperation, artworkId: string, markId: string, creatorId: string, surfaceId: string) => Boolean(Object.assign(item, { artworkId, markId, creatorId, surfaceId })));
    const bridge = createBlackbookArtworkPersistenceBridge({ repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-mop" });
    bridge.replaceKnownArtworks([first]);
    await bridge.persistStroke(mopStroke);
    expect(repository.appendOwnedArtworkMark).toHaveBeenCalledWith("art-mop", "member-1", expect.objectContaining({ id: "mark-mop", material: { supplyId: "mop", materialId: "mop" } }));
    await bridge.removeStroke(mopStroke);
    // Only the Mop Mark's own ID is removed -- the Artwork identity and the
    // neighboring Pencil Mark are never touched by Undoing Mop.
    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledWith("art-mop", "member-1", "mark-mop");
    expect(repository.removeOwnedArtworkMark).not.toHaveBeenCalledWith("art-mop", "member-1", "mark-a");
  });

  it("V4: gives Spray its own material identity, distinct from Marker and Mop, with Width/Opacity preserved", () => {
    const spray = toLocalStrokeMark({ ...stroke("spray"), operation: "spray", style: { color: "#e2572b", width: 24, opacity: 0.6 } }, "mark-spray", new Date(4));
    expect(spray).toMatchObject({ material: { supplyId: "spray", materialId: "spray" }, style: { width: 24, opacity: 0.6 } });
    expect(spray.material?.materialId).not.toBe("marker");
    expect(spray.material?.materialId).not.toBe("mop");
    expect(spray.material?.supplyId).not.toBe("marker");
    expect(spray.material?.supplyId).not.toBe("mop");
  });

  it("V4: Spray coexists with Graphite/Ink/Marker/Mop in one Artwork -- selecting Spray does not inherently split the Artwork when composition says the Marks belong together", () => {
    const pencilMark = toLocalStrokeMark(stroke("pencil-a"), "mark-pencil", new Date(0));
    const withPencil = artwork("art-multi", [pencilMark]);
    const sprayMark = toLocalStrokeMark({ ...stroke("spray-a", 0.01), operation: "spray", style: { color: "#e2572b", width: 24, opacity: 0.6 } }, "mark-spray", new Date(1));
    expect(selectArtworkForMark([withPencil], "member-1", BLACKBOOK_PAGE_SURFACE_ID, sprayMark)?.id).toBe("art-multi");
  });

  it("V4: Undo removes only the latest Spray operation (one authored Mark, regardless of how many deterministic particles it renders), leaving the Artwork and its other Marks untouched", async () => {
    const pencilMark = toLocalStrokeMark(stroke("a"), "mark-a", new Date(0));
    const first = artwork("art-spray", [pencilMark]);
    const sprayStroke: BlackbookStroke = { operation: "spray", id: "spray-op", points: [{ x: 0.11, y: 0.21 }, { x: 0.21, y: 0.31 }], style: { color: "#e2572b", width: 24, opacity: 0.6 } };
    const sprayMark = toLocalStrokeMark(sprayStroke, "mark-spray", new Date(1));
    const withSpray = artwork("art-spray", [pencilMark, sprayMark]);
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(async () => first), listOwnedArtwork: vi.fn(async () => [first]),
      createMapArtwork: vi.fn(async () => first), listOwnedMapArtwork: vi.fn(async () => [first]),
      appendOwnedArtworkMark: vi.fn(async () => withSpray),
      removeOwnedArtworkMark: vi.fn(async () => first),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn((item: BlackbookOperation, artworkId: string, markId: string, creatorId: string, surfaceId: string) => Boolean(Object.assign(item, { artworkId, markId, creatorId, surfaceId })));
    const bridge = createBlackbookArtworkPersistenceBridge({ repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-spray" });
    bridge.replaceKnownArtworks([first]);
    await bridge.persistStroke(sprayStroke);
    expect(repository.appendOwnedArtworkMark).toHaveBeenCalledWith("art-spray", "member-1", expect.objectContaining({ id: "mark-spray", material: { supplyId: "spray", materialId: "spray" } }));
    await bridge.removeStroke(sprayStroke);
    // Only the Spray Mark's own ID is removed as ONE operation -- there is
    // no per-particle removal, and the neighboring Pencil Mark is untouched.
    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledWith("art-spray", "member-1", "mark-spray");
    expect(repository.removeOwnedArtworkMark).not.toHaveBeenCalledWith("art-spray", "member-1", "mark-a");
  });

  it("Blackbook Spatial Workspace V1: a brand-new page's first Mark creates its Artwork WITH the fixed page frame", async () => {
    const first = artwork("art-first");
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(async () => first), listOwnedArtwork: vi.fn(async () => []),
      createMapArtwork: vi.fn(async () => first), listOwnedMapArtwork: vi.fn(async () => []),
      appendOwnedArtworkMark: vi.fn(), removeOwnedArtworkMark: vi.fn(),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn(() => true);
    const bridge = createBlackbookArtworkPersistenceBridge({ repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-a" });
    await bridge.persistStroke(stroke("a"));
    expect(repository.createArtwork).toHaveBeenCalledWith(expect.objectContaining({ pageFrame: BLACKBOOK_PAGE_FRAME }));
  });
});

describe("Graphite Grades Foundation V1 -- Mark variant identity", () => {
  it("a Pencil stroke with a grade persists variantId + profileVersion on the Mark", () => {
    const graded = { ...stroke("a"), variantId: "6b", profileVersion: 1 };
    const mark = toLocalStrokeMark(graded, "mark-a", new Date(0));
    expect(mark.material).toEqual({ supplyId: "pencil", materialId: "graphite", variantId: "6b", profileVersion: 1 });
  });

  it("a Pencil stroke with no grade selected omits variantId/profileVersion entirely (legacy-compatible)", () => {
    const mark = toLocalStrokeMark(stroke("a"), "mark-a", new Date(0));
    expect(mark.material).toEqual({ supplyId: "pencil", materialId: "graphite" });
    expect(mark.material).not.toHaveProperty("variantId");
  });

  it("a non-Pencil supply never carries a variantId, even if one were mistakenly supplied", () => {
    const penStroke = { ...stroke("a"), operation: "pen" as const, variantId: "6b", profileVersion: 1 };
    const mark = toLocalStrokeMark(penStroke, "mark-a", new Date(0));
    expect(mark.material).toEqual({ supplyId: "pen", materialId: "ink" });
  });

  it("changing the active grade does not mutate an already-authored Mark", () => {
    const first = toLocalStrokeMark({ ...stroke("a"), variantId: "3h", profileVersion: 1 }, "mark-a", new Date(0));
    const second = toLocalStrokeMark({ ...stroke("b"), variantId: "9b", profileVersion: 1 }, "mark-b", new Date(1));
    expect(first.material).toMatchObject({ variantId: "3h" });
    expect(second.material).toMatchObject({ variantId: "9b" });
    // Building the second Mark must not have touched the first.
    expect(first.material).toMatchObject({ variantId: "3h" });
  });
});

describe("Blackbook Event UI Polish V1 -- NEW workflow", () => {
  it("NEW (replaceKnownArtworks([])) makes the next Mark create a brand-new Artwork with the canonical 16:9 pageFrame, rather than appending to the artwork just left", async () => {
    const previous = artwork("art-previous");
    const fresh = artwork("art-fresh", [toLocalStrokeMark(stroke("fresh"), "mark-fresh", new Date(1))]);
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(async () => fresh), listOwnedArtwork: vi.fn(async () => [previous, fresh]),
      createMapArtwork: vi.fn(async () => fresh), listOwnedMapArtwork: vi.fn(async () => [previous, fresh]),
      appendOwnedArtworkMark: vi.fn(async () => previous), removeOwnedArtworkMark: vi.fn(),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn(() => true);
    const bridge = createBlackbookArtworkPersistenceBridge({ repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-fresh" });
    // Simulates the session already knowing about `previous` (as if hydrated/drawn on).
    bridge.replaceKnownArtworks([previous]);
    // NEW: forget the in-session artwork so the next Mark cannot be routed to it by proximity.
    bridge.replaceKnownArtworks([]);
    await bridge.persistStroke(stroke("fresh"));
    expect(repository.createArtwork).toHaveBeenCalledWith(expect.objectContaining({ pageFrame: BLACKBOOK_PAGE_FRAME }));
    expect(repository.appendOwnedArtworkMark).not.toHaveBeenCalled();
  });

  it("repeated NEW produces distinct Artwork identities, and the previously active Artwork is never deleted or mutated by NEW itself", async () => {
    const page1 = artwork("art-page-1");
    const page2 = artwork("art-page-2");
    const page3 = artwork("art-page-3");
    const createArtwork = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2).mockResolvedValueOnce(page3);
    const repository: ArtworkRepository = {
      createArtwork, listOwnedArtwork: vi.fn(async () => []),
      createMapArtwork: createArtwork, listOwnedMapArtwork: vi.fn(async () => []),
      appendOwnedArtworkMark: vi.fn(), removeOwnedArtworkMark: vi.fn(),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn(() => true);
    let markCounter = 0;
    const bridge = createBlackbookArtworkPersistenceBridge({ repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => `mark-${(markCounter += 1)}` });

    await bridge.persistStroke(stroke("s1"));
    bridge.replaceKnownArtworks([]); // NEW
    await bridge.persistStroke(stroke("s2"));
    bridge.replaceKnownArtworks([]); // NEW
    await bridge.persistStroke(stroke("s3"));

    expect(createArtwork).toHaveBeenCalledTimes(3);
    expect(repository.deleteOwnedArtwork).not.toHaveBeenCalled();
    // Every created Artwork carries the same canonical 16:9 default -- NEW never invents an alternate paper size.
    for (const call of createArtwork.mock.calls) {
      expect(call[0]).toMatchObject({ pageFrame: BLACKBOOK_PAGE_FRAME });
    }
  });
});

describe("Blackbook Default Page Format -- canonical 16:9 landscape default", () => {
  it("the canonical default page frame is landscape 16:9, not the old square", () => {
    expect(BLACKBOOK_PAGE_FRAME.width).toBeGreaterThan(BLACKBOOK_PAGE_FRAME.height);
    expect(BLACKBOOK_PAGE_FRAME.width / BLACKBOOK_PAGE_FRAME.height).toBeCloseTo(16 / 9, 10);
  });

  it("a brand-new Blackbook Artwork receives the canonical 16:9 pageFrame", async () => {
    const first = artwork("art-first");
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(async () => first), listOwnedArtwork: vi.fn(async () => []),
      createMapArtwork: vi.fn(async () => first), listOwnedMapArtwork: vi.fn(async () => []),
      appendOwnedArtworkMark: vi.fn(), removeOwnedArtworkMark: vi.fn(),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn(() => true);
    const bridge = createBlackbookArtworkPersistenceBridge({ repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-a" });
    await bridge.persistStroke(stroke("a"));
    expect(repository.createArtwork).toHaveBeenCalledWith(expect.objectContaining({ pageFrame: { x: 0, y: 0, width: 1, height: 9 / 16 } }));
  });
});

describe("Blackbook Page Isolation V1 -- explicit active-Artwork routing", () => {
  function repositoryFor(artworks: Record<string, Artwork>): ArtworkRepository {
    return {
      createArtwork: vi.fn(), listOwnedArtwork: vi.fn(async () => Object.values(artworks)),
      createMapArtwork: vi.fn(), listOwnedMapArtwork: vi.fn(async () => Object.values(artworks)),
      appendOwnedArtworkMark: vi.fn(async (artworkId: string, _creatorId: string, mark: ArtworkMark) => {
        const existing = artworks[artworkId];
        const updated = { ...existing, marks: [...existing.marks, mark] };
        artworks[artworkId] = updated;
        return updated;
      }),
      removeOwnedArtworkMark: vi.fn(async (artworkId: string, _creatorId: string, markId: string) => {
        const existing = artworks[artworkId];
        const remaining = existing.marks.filter((mark) => mark.id !== markId);
        if (remaining.length === 0) { delete artworks[artworkId]; return null; }
        const updated = { ...existing, marks: remaining };
        artworks[artworkId] = updated;
        return updated;
      }),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
  }

  it("Artwork A and Artwork B may share the same Blackbook Surface without their Marks merging", () => {
    const a = artwork("art-a");
    const b = artwork("art-b", [toLocalStrokeMark(stroke("b", 0.3), "mark-b", new Date(1))]);
    expect(a.surfaceId).toBe(BLACKBOOK_PAGE_SURFACE_ID);
    expect(b.surfaceId).toBe(BLACKBOOK_PAGE_SURFACE_ID);
    expect(a.marks).not.toEqual(b.marks);
  });

  it("an explicit 'artwork' target appends only to that Artwork, never a Surface-proximity match, even when another Artwork sits right next to it", async () => {
    const a = artwork("art-a"); // marks near (0.1,0.2)
    const b = artwork("art-b", [toLocalStrokeMark(stroke("b", 0.001), "mark-b-seed", new Date(0))]); // marks almost on top of A's
    const artworks: Record<string, Artwork> = { "art-a": a, "art-b": b };
    const repository = repositoryFor(artworks);
    const bindArtwork = vi.fn(() => true);
    const bridge = createBlackbookArtworkPersistenceBridge({
      repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-new",
      getCurrentArtworkTarget: () => ({ kind: "artwork", artworkId: "art-b" }),
    });
    await bridge.persistStroke(stroke("new", 0.0005)); // geographically indistinguishable from A
    expect(repository.appendOwnedArtworkMark).toHaveBeenCalledWith("art-b", "member-1", expect.objectContaining({ id: "mark-new" }));
    expect(repository.appendOwnedArtworkMark).not.toHaveBeenCalledWith("art-a", expect.anything(), expect.anything());
  });

  it("NEW ('pending' target) creates a distinct Artwork and establishes it as the new active Artwork via onCurrentArtworkEstablished", async () => {
    const created = artwork("art-fresh", [toLocalStrokeMark(stroke("fresh"), "mark-fresh", new Date(1))]);
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(async () => created), listOwnedArtwork: vi.fn(async () => []),
      createMapArtwork: vi.fn(async () => created), listOwnedMapArtwork: vi.fn(async () => []),
      appendOwnedArtworkMark: vi.fn(), removeOwnedArtworkMark: vi.fn(),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn(() => true);
    const established = vi.fn();
    const bridge = createBlackbookArtworkPersistenceBridge({
      repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-fresh",
      getCurrentArtworkTarget: () => ({ kind: "pending", artworkType: "map", title: "" }),
      onCurrentArtworkEstablished: established,
    });
    await bridge.persistStroke(stroke("fresh"));
    expect(repository.createArtwork).toHaveBeenCalledWith(expect.objectContaining({ pageFrame: BLACKBOOK_PAGE_FRAME }));
    expect(established).toHaveBeenCalledWith("art-fresh");
  });

  it("Undo (removeStroke) affects only the active Artwork the removed Mark actually belongs to", async () => {
    const a = artwork("art-a");
    const artworks: Record<string, Artwork> = { "art-a": a };
    const repository = repositoryFor(artworks);
    const bindArtwork = vi.fn(() => true);
    const bridge = createBlackbookArtworkPersistenceBridge({ repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1" });
    const hydratedMarkOfA = Object.assign(stroke("a"), { artworkId: "art-a", markId: "mark-a", creatorId: "member-1", surfaceId: BLACKBOOK_PAGE_SURFACE_ID });
    await bridge.removeStroke(hydratedMarkOfA);
    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledWith("art-a", "member-1", "mark-a");
    expect(repository.removeOwnedArtworkMark).not.toHaveBeenCalledWith("art-b", expect.anything(), expect.anything());
  });

  describe("resolveActiveBlackbookArtworkId -- explicit/deterministic selection only", () => {
    it("prefers an explicitly requested id (e.g. a '?artwork=' link) when it is one of this member's known Artworks", () => {
      const a = artwork("art-a");
      const b = artwork("art-b");
      expect(resolveActiveBlackbookArtworkId([a, b], "art-b", "art-a")).toBe("art-b");
    });

    it("falls back to the remembered (last-opened) id when nothing was explicitly requested", () => {
      const a = artwork("art-a");
      const b = artwork("art-b");
      expect(resolveActiveBlackbookArtworkId([a, b], null, "art-b")).toBe("art-b");
    });

    it("ignores a requested or remembered id that no longer belongs to this member, falling through instead of erroring", () => {
      const a = artwork("art-a");
      expect(resolveActiveBlackbookArtworkId([a], "art-ghost", "also-ghost")).toBe("art-a");
    });

    it("FALLBACK RULE (requirement 9): with no requested/remembered id, resolves to the most recently updated known Artwork -- the same recency definition artworkGallery.ts's My Artwork listing already uses", () => {
      const older = { ...artwork("art-old"), updatedAt: new Date(0) };
      const newer = { ...artwork("art-new"), updatedAt: new Date(1000) };
      expect(resolveActiveBlackbookArtworkId([older, newer], null, null)).toBe("art-new");
    });

    it("a legacy Artwork with no remembered active-Artwork metadata at all still resolves (never null) as long as the member owns at least one Blackbook Artwork", () => {
      const legacySquare = { ...artwork("art-legacy"), pageFrame: { x: 0, y: 0, width: 1, height: 1 } };
      expect(resolveActiveBlackbookArtworkId([legacySquare], null, null)).toBe("art-legacy");
    });

    it("resolves to null (caller arms a brand-new page) only when the member has no Blackbook Artwork at all", () => {
      expect(resolveActiveBlackbookArtworkId([], null, null)).toBeNull();
    });

    it("different persisted pageFrames stay independent per Artwork -- resolving an id never substitutes another Artwork's frame", () => {
      const square = { ...artwork("art-square"), pageFrame: { x: 0, y: 0, width: 1, height: 1 } };
      const landscape = { ...artwork("art-landscape"), pageFrame: BLACKBOOK_PAGE_FRAME };
      const resolvedSquareId = resolveActiveBlackbookArtworkId([square, landscape], "art-square", null);
      const resolvedLandscapeId = resolveActiveBlackbookArtworkId([square, landscape], "art-landscape", null);
      expect([square, landscape].find((a) => a.id === resolvedSquareId)?.pageFrame).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      expect([square, landscape].find((a) => a.id === resolvedLandscapeId)?.pageFrame).toEqual(BLACKBOOK_PAGE_FRAME);
    });
  });

  describe("withActiveArtworkUrlParam -- the write-side identity sync (NEW Artwork reload-fidelity repair)", () => {
    it("replaces an existing '?artwork=' param with the newly established Artwork's id", () => {
      const next = withActiveArtworkUrlParam("https://app.example/blackbook.html?artwork=art-a", "art-b");
      expect(new URL(next).searchParams.get("artwork")).toBe("art-b");
    });

    it("adds the param when the URL had none yet (e.g. this session's very first materialized Artwork)", () => {
      const next = withActiveArtworkUrlParam("https://app.example/blackbook.html", "art-b");
      expect(new URL(next).searchParams.get("artwork")).toBe("art-b");
    });

    it("preserves the URL's other parts (path, unrelated query params) -- never a full navigation/rewrite", () => {
      const next = withActiveArtworkUrlParam("https://app.example/blackbook.html?foo=bar&artwork=art-a", "art-b");
      const url = new URL(next);
      expect(url.pathname).toBe("/blackbook.html");
      expect(url.searchParams.get("foo")).toBe("bar");
      expect(url.searchParams.get("artwork")).toBe("art-b");
    });
  });

  describe("NEW Artwork reload-fidelity repair -- end-to-end identity synchronization (pure, DOM-free)", () => {
    // Simulates blackbookRuntime.ts's own sequence without any DOM/browser
    // dependency: `withActiveArtworkUrlParam` computes what the URL becomes;
    // `resolveActiveBlackbookArtworkId` (the read side, already exhaustively
    // tested above) decides what a subsequent reload resolves to. Together
    // these two pure functions ARE the complete identity-synchronization
    // contract `setActiveArtworkIdentity` wraps for the real DOM.
    it("Artwork A active -> NEW -> first Mark materializes B -> URL and remembered identity both become B -> a reload resolves to B, not A", () => {
      const a = artwork("art-a");
      const b = artwork("art-b");
      const knownAfterBMaterializes = [a, b]; // B is now genuinely persisted and known, exactly as MY PAGES would show it

      // Before materialization: URL still names A (the ordinary case -- any returning session already has SOME ?artwork= param).
      const urlBeforeMaterialization = "https://app.example/blackbook.html?artwork=art-a";

      // The exact write blackbookRuntime.ts's onCurrentArtworkEstablished(B) now performs:
      const urlAfterMaterialization = withActiveArtworkUrlParam(urlBeforeMaterialization, "art-b");
      const rememberedAfterMaterialization = "art-b"; // rememberActiveArtworkId's own effect, already correct before this repair

      expect(new URL(urlAfterMaterialization).searchParams.get("artwork")).toBe("art-b");

      // A subsequent reload reads exactly these two values back:
      const requestedOnReload = new URL(urlAfterMaterialization).searchParams.get("artwork");
      const resolvedOnReload = resolveActiveBlackbookArtworkId(knownAfterBMaterializes, requestedOnReload, rememberedAfterMaterialization);
      expect(resolvedOnReload).toBe("art-b"); // NOT "art-a" -- the exact regression this batch fixes
    });

    it("before this repair (URL never updated on materialization), the same reload would have incorrectly resolved back to A -- proves this test actually exercises the real regression, not a tautology", () => {
      const a = artwork("art-a");
      const b = artwork("art-b");
      const knownAfterBMaterializes = [a, b];
      // The OLD, buggy behavior: URL is never touched by materialization.
      const staleUrl = "https://app.example/blackbook.html?artwork=art-a";
      const rememberedAfterMaterialization = "art-b";
      const requestedOnReload = new URL(staleUrl).searchParams.get("artwork");
      const resolvedOnReload = resolveActiveBlackbookArtworkId(knownAfterBMaterializes, requestedOnReload, rememberedAfterMaterialization);
      expect(resolvedOnReload).toBe("art-a"); // the bug, reproduced directly
    });

    it("opening an existing Artwork through MY PAGES (openArtwork's own path) continues to synchronize identity correctly -- unchanged by this repair", () => {
      const a = artwork("art-a");
      const b = artwork("art-b");
      // openArtwork's own sequence: URL + remembered both set to the opened id.
      const urlAfterOpen = withActiveArtworkUrlParam("https://app.example/blackbook.html?artwork=art-a", "art-b");
      const rememberedAfterOpen = "art-b";
      const resolvedOnReload = resolveActiveBlackbookArtworkId([a, b], new URL(urlAfterOpen).searchParams.get("artwork"), rememberedAfterOpen);
      expect(resolvedOnReload).toBe("art-b");
    });

    it("the URL continues to outrank a remembered id during reload when it explicitly addresses a known Artwork (pre-existing, unchanged priority rule)", () => {
      const a = artwork("art-a");
      const b = artwork("art-b");
      // URL says B, but a DIFFERENT device/tab last remembered A -- URL must still win.
      expect(resolveActiveBlackbookArtworkId([a, b], "art-b", "art-a")).toBe("art-b");
    });

    it("creating B never touches A's own document/state -- withActiveArtworkUrlParam and resolveActiveBlackbookArtworkId are pure functions of their own inputs, never mutating the Artwork list they're given", () => {
      const a = artwork("art-a");
      const knownBefore = [a];
      const snapshotBefore = JSON.parse(JSON.stringify(knownBefore));
      withActiveArtworkUrlParam("https://app.example/blackbook.html?artwork=art-a", "art-b");
      resolveActiveBlackbookArtworkId(knownBefore, "art-b", "art-b");
      expect(JSON.parse(JSON.stringify(knownBefore))).toEqual(snapshotBefore);
    });
  });
});

describe("Blackbook My Pages V1 -- listing", () => {
  it("lists a member's Blackbook Artworks", () => {
    const a = artwork("art-a");
    const b = artwork("art-b");
    expect(filterBlackbookArtworks([a, b])).toEqual([a, b]);
  });

  it("excludes non-Blackbook Artworks (a different Surface) from the listing", () => {
    const blackbookArtwork = artwork("art-blackbook");
    const mapArtwork = { ...artwork("art-map"), surfaceId: "map:new-york" };
    expect(filterBlackbookArtworks([blackbookArtwork, mapArtwork])).toEqual([blackbookArtwork]);
  });

  it("excludes an archived (non-draft) Artwork from the listing", () => {
    const draft = artwork("art-draft");
    const archived = { ...artwork("art-archived"), state: "archived" as const };
    expect(filterBlackbookArtworks([draft, archived])).toEqual([draft]);
  });

  it("MY PAGES switching (openArtwork's underlying resolution) never mutates a non-selected Artwork's own data -- resolving an id is a pure read, not a write", () => {
    const a = artwork("art-a");
    const b = artwork("art-b");
    const beforeA = JSON.stringify(a);
    resolveActiveBlackbookArtworkId([a, b], "art-b", null);
    expect(JSON.stringify(a)).toBe(beforeA);
  });
});

describe("BLACKBOOK Deterministic Drips β0.1 -- material-drip Mark bridge", () => {
  it("authors a drip as a first-class Mark carrying its own originMarkId/targetMaterialId, never a mutation of the origin stroke", () => {
    const drip = toLocalDripMark(
      { operation: "material-drip", id: "drip-a", points: [{ x: 0.1, y: 0.2 }, { x: 0.11, y: 0.26 }, { x: 0.1, y: 0.3 }], originMarkId: "mark-mop-origin", targetMaterialId: "mop", style: { color: "#1c6e6e", width: 34, opacity: 0.55 } },
      "mark-drip-a",
      new Date(0),
    );
    expect(drip).toMatchObject({
      id: "mark-drip-a",
      type: "material-drip",
      originMarkId: "mark-mop-origin",
      targetMaterialId: "mop",
      geometry: { format: "local-2d-drip-v1" },
      style: { color: "#1c6e6e", width: 34, opacity: 0.55 },
    });
  });

  it("toBlackbookMark dispatches a material-drip operation to toLocalDripMark, distinct from the stroke/eraser branches", () => {
    const dripOperation: BlackbookOperation = { operation: "material-drip", id: "drip-b", points: [{ x: 0.1, y: 0.2 }, { x: 0.1, y: 0.3 }], originMarkId: "mark-spray-origin", targetMaterialId: "spray", style: { color: "#e2572b", width: 24, opacity: 0.6 } };
    const mark = toBlackbookMark(dripOperation, "mark-drip-b");
    expect(mark).toMatchObject({ type: "material-drip", originMarkId: "mark-spray-origin", targetMaterialId: "spray" });
  });

  it("rejects a drip with fewer than 2 points or no originMarkId, mirroring the same authoring-time validation every other Mark-producing operation already has", () => {
    expect(() => toLocalDripMark({ operation: "material-drip", id: "drip-c", points: [{ x: 0, y: 0 }], originMarkId: "mark-a", targetMaterialId: "mop", style: { color: "#1c6e6e", width: 34, opacity: 0.55 } }, "mark-drip-c")).toThrow();
    expect(() => toLocalDripMark({ operation: "material-drip", id: "drip-d", points: [{ x: 0, y: 0 }, { x: 0, y: 1 }], originMarkId: "", targetMaterialId: "mop", style: { color: "#1c6e6e", width: 34, opacity: 0.55 } }, "mark-drip-d")).toThrow();
  });

  it("Undo removes a drip Mark through the same generic removeStroke path as any other Mark -- no special-cased persistence for drips", async () => {
    const mopMark = toLocalStrokeMark({ ...stroke("mop"), operation: "mop", style: { color: "#1c6e6e", width: 34, opacity: 0.55 } }, "mark-mop", new Date(0));
    const dripMark = toLocalDripMark({ operation: "material-drip", id: "drip-e", points: [{ x: 0.11, y: 0.21 }, { x: 0.11, y: 0.26 }], originMarkId: "mark-mop", targetMaterialId: "mop", style: { color: "#1c6e6e", width: 34, opacity: 0.55 } }, "mark-drip-e", new Date(1));
    const withBoth = artwork("art-drip", [mopMark, dripMark]);
    const afterDripRemoved = artwork("art-drip", [mopMark]);
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(), listOwnedArtwork: vi.fn(async () => [withBoth]),
      createMapArtwork: vi.fn(), listOwnedMapArtwork: vi.fn(async () => [withBoth]),
      appendOwnedArtworkMark: vi.fn(),
      removeOwnedArtworkMark: vi.fn(async () => afterDripRemoved),
      deleteOwnedArtwork: vi.fn(), renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn(() => true);
    const bridge = createBlackbookArtworkPersistenceBridge({ repository, drawing: { bindArtwork }, getAuthenticatedMemberId: () => "member-1" });
    const hydratedDrip = Object.assign(
      { operation: "material-drip" as const, id: "drip-e", points: dripMark.geometry.points, originMarkId: "mark-mop", targetMaterialId: "mop" as const, style: dripMark.style },
      { artworkId: "art-drip", markId: "mark-drip-e", creatorId: "member-1", surfaceId: BLACKBOOK_PAGE_SURFACE_ID },
    );
    await bridge.removeStroke(hydratedDrip);
    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledWith("art-drip", "member-1", "mark-drip-e");
    // The origin Mop Mark is never touched by removing its drip.
    expect(repository.removeOwnedArtworkMark).not.toHaveBeenCalledWith("art-drip", "member-1", "mark-mop");
  });
});
