import { describe, expect, it, vi } from "vitest";
import type { Artwork, ArtworkRepository } from "@studiorich/member-identity";
import { BLANK_SURFACE_ID, createBlankArtworkPersistenceBridge, toBlankErasureMark, toBlankStrokeMark, type BlankErasure, type BlankStroke } from "./blankArtworkBridge";

function stroke(id: string): BlankStroke {
  return { operation: "pencil", id, points: [{ x: 10, y: -20 }, { x: 30, y: 40 }], style: { color: "#171412", width: 6, opacity: 0.9 } };
}

function artwork(id: string): Artwork {
  return {
    id,
    creatorId: "member-1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    surfaceId: BLANK_SURFACE_ID,
    artworkType: "blank",
    title: "0923",
    composition: { bounds: { minX: 10, minY: -20, maxX: 30, maxY: 40 }, startedAt: new Date(0), lastEditedAt: new Date(0) },
    marks: [],
    state: "draft",
    visibility: "private",
  };
}

describe("toBlankStrokeMark / toBlankErasureMark", () => {
  it("persists Cartesian points far outside 0..1 without treating them as geography", () => {
    const mark = toBlankStrokeMark(stroke("s1"), "mark-1");
    expect(mark.geometry).toEqual({ format: "local-2d-stroke-v1", points: [{ x: 10, y: -20 }, { x: 30, y: 40 }] });
    expect(mark.geometry.points[0]).not.toHaveProperty("longitude");
  });

  it("builds a graphite-only erasure Mark", () => {
    const erasure: BlankErasure = { operation: "eraser", id: "e1", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }], width: 12 };
    const mark = toBlankErasureMark(erasure, "mark-e1");
    expect(mark).toMatchObject({ type: "material-erasure", targetMaterialId: "graphite", width: 12, geometry: { format: "local-2d-erasure-v1" } });
  });
});

describe("createBlankArtworkPersistenceBridge -- explicit Current Artwork routing", () => {
  it("never selects by proximity: a 'pending' target creates a new Blank Artwork regardless of point magnitude", async () => {
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(async () => artwork("blank-a")),
      createMapArtwork: vi.fn(),
      listOwnedMapArtwork: vi.fn(async () => []),
      appendOwnedArtworkMark: vi.fn(),
      removeOwnedArtworkMark: vi.fn(),
      deleteOwnedArtwork: vi.fn(),
      renameOwnedArtwork: vi.fn(),
    };
    const established: string[] = [];
    const bridge = createBlankArtworkPersistenceBridge({
      repository,
      drawing: { bindArtwork: vi.fn(() => true) },
      getAuthenticatedMemberId: () => "member-1",
      getCurrentArtworkTarget: () => ({ kind: "pending", artworkType: "blank", title: "0923" }),
      onCurrentArtworkEstablished: (id) => established.push(id),
    });

    await bridge.persistStroke(stroke("far-stroke"));

    expect(repository.createArtwork).toHaveBeenCalledWith(expect.objectContaining({ surfaceId: BLANK_SURFACE_ID, artworkType: "blank", title: "0923" }));
    expect(established).toEqual(["blank-a"]);
  });

  it("appends directly to an explicit Current Artwork id", async () => {
    const repository: ArtworkRepository = {
      createArtwork: vi.fn(),
      createMapArtwork: vi.fn(),
      listOwnedMapArtwork: vi.fn(async () => []),
      appendOwnedArtworkMark: vi.fn(async () => artwork("blank-a")),
      removeOwnedArtworkMark: vi.fn(),
      deleteOwnedArtwork: vi.fn(),
      renameOwnedArtwork: vi.fn(),
    };
    const bridge = createBlankArtworkPersistenceBridge({
      repository,
      drawing: { bindArtwork: vi.fn(() => true) },
      getAuthenticatedMemberId: () => "member-1",
      getCurrentArtworkTarget: () => ({ kind: "artwork", artworkId: "blank-a" }),
    });

    await bridge.persistStroke(stroke("s2"));

    expect(repository.appendOwnedArtworkMark).toHaveBeenCalledWith("blank-a", "member-1", expect.objectContaining({}));
    expect(repository.createArtwork).not.toHaveBeenCalled();
  });

  it("leaves the stroke unbound when there is no Current Artwork", async () => {
    const createArtwork = vi.fn();
    const repository: ArtworkRepository = {
      createArtwork,
      createMapArtwork: vi.fn(),
      listOwnedMapArtwork: vi.fn(async () => []),
      appendOwnedArtworkMark: vi.fn(),
      removeOwnedArtworkMark: vi.fn(),
      deleteOwnedArtwork: vi.fn(),
      renameOwnedArtwork: vi.fn(),
    };
    const bindArtwork = vi.fn(() => true);
    const bridge = createBlankArtworkPersistenceBridge({
      repository,
      drawing: { bindArtwork },
      getAuthenticatedMemberId: () => "member-1",
      getCurrentArtworkTarget: () => ({ kind: "none" }),
    });

    await bridge.persistStroke(stroke("s3"));

    expect(createArtwork).not.toHaveBeenCalled();
    expect(bindArtwork).not.toHaveBeenCalled();
  });
});
