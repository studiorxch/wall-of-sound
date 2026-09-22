import { describe, expect, it, vi } from "vitest";
import { selectArtworkForMark, type Artwork, type ArtworkMark, type ArtworkRepository } from "@studiorich/member-identity";
import { BLACKBOOK_PAGE_SURFACE_ID, createBlackbookArtworkPersistenceBridge, toLocalErasureMark, toLocalStrokeMark, type BlackbookOperation, type BlackbookStroke } from "./blackbookArtworkBridge";

function stroke(id: string, offset = 0): BlackbookStroke {
  return { operation: "pencil", id, points: [{ x: 0.1 + offset, y: 0.2 }, { x: 0.2 + offset, y: 0.3 }], style: { color: "#171412", width: 7, opacity: 0.9 } };
}

function artwork(id: string, marks: readonly ArtworkMark[] = [toLocalStrokeMark(stroke("a"), "mark-a", new Date(0))]): Artwork {
  return { id, creatorId: "member-1", surfaceId: BLACKBOOK_PAGE_SURFACE_ID, createdAt: new Date(0), updatedAt: new Date(0), composition: { bounds: { minX: 0.1, minY: 0.2, maxX: 0.2, maxY: 0.3 }, startedAt: new Date(0), lastEditedAt: new Date(0) }, marks, state: "draft", visibility: "private" };
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
      deleteOwnedArtwork: vi.fn(),
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
      deleteOwnedArtwork: vi.fn(),
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
});
