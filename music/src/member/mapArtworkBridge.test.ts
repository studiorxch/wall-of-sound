import { describe, expect, it, vi } from "vitest";
import type { ArtworkRepository, MapArtwork } from "@studiorich/member-identity";
import {
  createMapArtworkPersistenceBridge,
  SUBWAY_MAP_SURFACE_ID,
  toGeographicErasureMark,
  toStrokeMark,
  type WallErasure,
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
    surfaceId: SUBWAY_MAP_SURFACE_ID,
    composition: { bounds: { west: -73.99, south: 40.72, east: -73.98, north: 40.73 }, startedAt: new Date(0), lastEditedAt: new Date(0) },
    marks: [],
    state: "draft",
    visibility: "private",
  };
}

describe("Artwork composition bridge", () => {
  it("persists geographic coordinates without viewport coordinates", () => {
    const result = toStrokeMark({
      id: "stroke-1",
      points: [
        { longitude: -73.99, latitude: 40.72 },
        { longitude: -73.98, latitude: 40.73 },
      ],
      style: { color: "#ff4488", width: 4, opacity: 0.88 },
    }, "mark-1");
    expect(result.geometry.points).toEqual([
      { longitude: -73.99, latitude: 40.72 },
      { longitude: -73.98, latitude: 40.73 },
    ]);
    expect(result.geometry.points[0]).not.toHaveProperty("x");
    expect(result.geometry.points[0]).not.toHaveProperty("y");
  });

  it("rejects screen-only points", () => {
    expect(() => toStrokeMark({
      id: "stroke-1",
      points: [{}, {}],
      style: { color: "#fff", width: 4, opacity: 1 },
    }, "mark-1")).toThrow("wall_stroke_missing_geographic_coordinates");
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
      appendOwnedArtworkMark: vi.fn(async () => artwork("artwork-b")),
      removeOwnedArtworkMark: vi.fn(async () => null),
      deleteOwnedArtwork: vi.fn(async () => undefined),
    };
    const drawing = {
      bindArtwork: vi.fn((stroke: WallStroke, artworkId: string, markId: string, creatorId: string, surfaceId: string) => {
        stroke.artworkId = artworkId;
        stroke.markId = markId;
        stroke.creatorId = creatorId;
        stroke.surfaceId = surfaceId;
        return true;
      }),
    };
    const bridge = createMapArtworkPersistenceBridge({
      repository,
      drawing,
      getAuthenticatedMemberId: () => "member-1",
      createMarkId: () => "mark-b",
    });

    await bridge.persistStroke(newB);
    await bridge.removeStroke(newB);

    expect(drawing.bindArtwork).toHaveBeenCalledWith(newB, "artwork-b", "mark-b", "member-1", SUBWAY_MAP_SURFACE_ID);
    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledWith("artwork-b", "member-1", "mark-b");
    expect(hydratedA.artworkId).toBe("artwork-a");
  });

  it("deletes Artwork B when Undo occurs before its save resolves", async () => {
    let resolveSave!: (value: MapArtwork) => void;
    const save = new Promise<MapArtwork>((resolve) => { resolveSave = resolve; });
    const newB = wallStroke("stroke-1");
    const repository: ArtworkRepository = {
      createMapArtwork: vi.fn(() => save),
      listOwnedMapArtwork: vi.fn(async () => []),
      appendOwnedArtworkMark: vi.fn(async () => artwork("artwork-b")),
      removeOwnedArtworkMark: vi.fn(async () => null),
      deleteOwnedArtwork: vi.fn(async () => undefined),
    };
    const drawing = { bindArtwork: vi.fn(() => true) };
    const bridge = createMapArtworkPersistenceBridge({
      repository,
      drawing,
      getAuthenticatedMemberId: () => "member-1",
      createMarkId: () => "mark-b",
    });

    const persistence = bridge.persistStroke(newB);
    await bridge.removeStroke(newB);
    expect(repository.removeOwnedArtworkMark).not.toHaveBeenCalled();
    resolveSave(artwork("artwork-b"));
    await persistence;

    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledOnce();
    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledWith("artwork-b", "member-1", "mark-b");
    expect(drawing.bindArtwork).not.toHaveBeenCalled();
  });

  it("deletes a hydrated Artwork using its retained persistence identity", async () => {
    const hydrated = Object.assign(wallStroke("stored-stroke"), {
      artworkId: "artwork-a",
      markId: "mark-a",
      creatorId: "member-1",
    });
    const repository: ArtworkRepository = {
      createMapArtwork: vi.fn(),
      listOwnedMapArtwork: vi.fn(async () => []),
      appendOwnedArtworkMark: vi.fn(),
      removeOwnedArtworkMark: vi.fn(async () => null),
      deleteOwnedArtwork: vi.fn(async () => undefined),
    };
    const bridge = createMapArtworkPersistenceBridge({
      repository,
      drawing: { bindArtwork: vi.fn(() => true) },
      getAuthenticatedMemberId: () => "member-1",
    });

    await bridge.removeStroke(hydrated);

    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledWith("artwork-a", "member-1", "mark-a");
  });

  it("adds a nearby second Mark to the existing Artwork and Undo removes only that Mark", async () => {
    const existingMark = toStrokeMark(wallStroke("stroke-a"), "mark-a");
    const existing = { ...artwork("artwork-a"), marks: [existingMark] };
    const updated = { ...existing, marks: [existingMark, toStrokeMark(wallStroke("stroke-b"), "mark-b")] };
    const repository: ArtworkRepository = {
      createMapArtwork: vi.fn(), listOwnedMapArtwork: vi.fn(async () => [existing]),
      appendOwnedArtworkMark: vi.fn(async () => updated),
      removeOwnedArtworkMark: vi.fn(async () => existing), deleteOwnedArtwork: vi.fn(),
    };
    const strokeB = wallStroke("stroke-b");
    const drawing = { bindArtwork: vi.fn((stroke: WallStroke, artworkId: string, markId: string, creatorId: string, surfaceId: string) => Object.assign(stroke, { artworkId, markId, creatorId, surfaceId }) && true) };
    const bridge = createMapArtworkPersistenceBridge({ repository, drawing, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-b" });
    bridge.replaceKnownArtworks([existing]);

    await bridge.persistStroke(strokeB);
    await bridge.removeStroke(strokeB);

    expect(repository.createMapArtwork).not.toHaveBeenCalled();
    expect(repository.appendOwnedArtworkMark).toHaveBeenCalledWith("artwork-a", "member-1", expect.objectContaining({ id: "mark-b" }));
    expect(repository.removeOwnedArtworkMark).toHaveBeenCalledWith("artwork-a", "member-1", "mark-b");
    expect(repository.deleteOwnedArtwork).not.toHaveBeenCalled();
  });

  it("creates a separate Artwork for a spatially distant Mark", async () => {
    const existingMark = toStrokeMark(wallStroke("stroke-a"), "mark-a");
    const existing = { ...artwork("artwork-a"), marks: [existingMark] };
    const distantStroke: WallStroke = { ...wallStroke("stroke-b"), points: [{ longitude: -74.2, latitude: 40.5 }, { longitude: -74.19, latitude: 40.51 }] };
    const repository: ArtworkRepository = {
      createMapArtwork: vi.fn(async () => artwork("artwork-b")), listOwnedMapArtwork: vi.fn(async () => [existing]),
      appendOwnedArtworkMark: vi.fn(), removeOwnedArtworkMark: vi.fn(), deleteOwnedArtwork: vi.fn(),
    };
    const bridge = createMapArtworkPersistenceBridge({ repository, drawing: { bindArtwork: vi.fn(() => true) }, getAuthenticatedMemberId: () => "member-1", createMarkId: () => "mark-b" });
    bridge.replaceKnownArtworks([existing]);
    await bridge.persistStroke(distantStroke);
    expect(repository.createMapArtwork).toHaveBeenCalledOnce();
    expect(repository.appendOwnedArtworkMark).not.toHaveBeenCalled();
  });

  it("Map Art Supplies V1: carries Mop and Spray material identity through geographic Marks -- the SAME supply ids Blackbook uses, never a Map-specific duplicate", () => {
    const mop = toStrokeMark({ ...wallStroke("stroke-mop"), operation: "mop", style: { color: "#1c6e6e", width: 34, opacity: 0.55 } }, "mark-mop");
    const spray = toStrokeMark({ ...wallStroke("stroke-spray"), operation: "spray", style: { color: "#e2572b", width: 24, opacity: 0.6 } }, "mark-spray");
    expect(mop).toMatchObject({ material: { supplyId: "mop", materialId: "mop" }, style: { width: 34, opacity: 0.55 } });
    expect(spray).toMatchObject({ material: { supplyId: "spray", materialId: "spray" }, style: { width: 24, opacity: 0.6 } });
    expect(spray.material?.materialId).not.toBe("marker");
    expect(spray.material?.materialId).not.toBe("mop");
  });

  it("Map Art Supplies V1: authors graphite-only material-erasure on geographic coordinates, the same Mark type Blackbook's Eraser produces", () => {
    const erasure: WallErasure = { operation: "eraser", id: "erase-1", points: [{ longitude: -73.99, latitude: 40.72 }, { longitude: -73.98, latitude: 40.73 }], width: 28 };
    const mark = toGeographicErasureMark(erasure, "erase-mark");
    expect(mark).toMatchObject({ type: "material-erasure", targetMaterialId: "graphite", width: 28, geometry: { format: "geographic-erasure-v1" } });
  });

  it("rejects a geographic erasure with fewer than two points or non-geographic points", () => {
    expect(() => toGeographicErasureMark({ operation: "eraser", id: "e", points: [{}], width: 20 } as unknown as WallErasure, "m")).toThrow();
    expect(() => toGeographicErasureMark({ operation: "eraser", id: "e", points: [{ longitude: 1, latitude: 1 }, {}], width: 20 } as unknown as WallErasure, "m")).toThrow("wall_stroke_missing_geographic_coordinates");
  });
});
