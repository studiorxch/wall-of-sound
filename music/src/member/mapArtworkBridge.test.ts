import { describe, expect, it, vi } from "vitest";
import type { ArtworkRepository, MapArtwork } from "@studiorich/member-identity";
import {
  createMapArtworkPersistenceBridge,
  toGeographicArtworkStroke,
  type WallStroke,
} from "./mapArtworkBridge";

const points = [
  { longitude: -73.99, latitude: 40.72 },
  { longitude: -73.98, latitude: 40.73 },
] as const;

function wallStroke(id: string): WallStroke {
  return { id, points, style: { color: "#ff4488", width: 4, opacity: 0.88 } };
}

function artwork(id: string, creatorId = "member-1"): MapArtwork {
  return {
    id,
    creatorId,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    surface: { type: "map" },
    geometry: { format: "geographic-strokes-v1", strokes: [] },
    state: "draft",
    visibility: "private",
  };
}

describe("toGeographicArtworkStroke", () => {
  it("persists geographic coordinates without viewport coordinates", () => {
    const result = toGeographicArtworkStroke({
      id: "stroke-1",
      points: [
        { longitude: -73.99, latitude: 40.72 },
        { longitude: -73.98, latitude: 40.73 },
      ],
      style: { color: "#ff4488", width: 4, opacity: 0.88 },
    });
    expect(result.points).toEqual([
      { longitude: -73.99, latitude: 40.72 },
      { longitude: -73.98, latitude: 40.73 },
    ]);
    expect(result.points[0]).not.toHaveProperty("x");
    expect(result.points[0]).not.toHaveProperty("y");
  });

  it("rejects screen-only points", () => {
    expect(() => toGeographicArtworkStroke({
      id: "stroke-1",
      points: [{}, {}],
      style: { color: "#fff", width: 4, opacity: 1 },
    })).toThrow("wall_stroke_missing_geographic_coordinates");
  });

  it("deletes exactly new Artwork B when hydrated A shares its local stroke ID", async () => {
    const hydratedA = Object.assign(wallStroke("stroke-1"), {
      artworkId: "artwork-a",
      creatorId: "member-1",
    });
    const newB = wallStroke("stroke-1");
    const repository: ArtworkRepository = {
      createMapArtwork: vi.fn(async () => artwork("artwork-b")),
      listOwnedMapArtwork: vi.fn(async () => []),
      deleteOwnedArtwork: vi.fn(async () => undefined),
    };
    const drawing = {
      bindArtwork: vi.fn((stroke: WallStroke, artworkId: string, creatorId: string) => {
        stroke.artworkId = artworkId;
        stroke.creatorId = creatorId;
        return true;
      }),
    };
    const bridge = createMapArtworkPersistenceBridge({
      repository,
      drawing,
      getAuthenticatedMemberId: () => "member-1",
    });

    await bridge.persistStroke(newB);
    await bridge.removeStroke(newB);

    expect(drawing.bindArtwork).toHaveBeenCalledWith(newB, "artwork-b", "member-1");
    expect(repository.deleteOwnedArtwork).toHaveBeenCalledOnce();
    expect(repository.deleteOwnedArtwork).toHaveBeenCalledWith("artwork-b", "member-1");
    expect(hydratedA.artworkId).toBe("artwork-a");
  });

  it("deletes Artwork B when Undo occurs before its save resolves", async () => {
    let resolveSave!: (value: MapArtwork) => void;
    const save = new Promise<MapArtwork>((resolve) => { resolveSave = resolve; });
    const newB = wallStroke("stroke-1");
    const repository: ArtworkRepository = {
      createMapArtwork: vi.fn(() => save),
      listOwnedMapArtwork: vi.fn(async () => []),
      deleteOwnedArtwork: vi.fn(async () => undefined),
    };
    const drawing = { bindArtwork: vi.fn(() => true) };
    const bridge = createMapArtworkPersistenceBridge({
      repository,
      drawing,
      getAuthenticatedMemberId: () => "member-1",
    });

    const persistence = bridge.persistStroke(newB);
    await bridge.removeStroke(newB);
    expect(repository.deleteOwnedArtwork).not.toHaveBeenCalled();
    resolveSave(artwork("artwork-b"));
    await persistence;

    expect(repository.deleteOwnedArtwork).toHaveBeenCalledOnce();
    expect(repository.deleteOwnedArtwork).toHaveBeenCalledWith("artwork-b", "member-1");
    expect(drawing.bindArtwork).not.toHaveBeenCalled();
  });

  it("deletes a hydrated Artwork using its retained persistence identity", async () => {
    const hydrated = Object.assign(wallStroke("stored-stroke"), {
      artworkId: "artwork-a",
      creatorId: "member-1",
    });
    const repository: ArtworkRepository = {
      createMapArtwork: vi.fn(),
      listOwnedMapArtwork: vi.fn(async () => []),
      deleteOwnedArtwork: vi.fn(async () => undefined),
    };
    const bridge = createMapArtworkPersistenceBridge({
      repository,
      drawing: { bindArtwork: vi.fn(() => true) },
      getAuthenticatedMemberId: () => "member-1",
    });

    await bridge.removeStroke(hydrated);

    expect(repository.deleteOwnedArtwork).toHaveBeenCalledWith("artwork-a", "member-1");
  });
});
