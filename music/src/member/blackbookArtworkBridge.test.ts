import { describe, expect, it, vi } from "vitest";
import { selectArtworkForMark, type Artwork, type ArtworkMark, type ArtworkRepository } from "@studiorich/member-identity";
import { BLACKBOOK_PAGE_FRAME, BLACKBOOK_PAGE_SURFACE_ID, createBlackbookArtworkPersistenceBridge, toLocalErasureMark, toLocalStrokeMark, type BlackbookOperation, type BlackbookStroke } from "./blackbookArtworkBridge";

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
