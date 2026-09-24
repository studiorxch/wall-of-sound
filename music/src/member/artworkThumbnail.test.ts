import { describe, expect, it } from "vitest";
import type { Artwork, StrokeMark } from "@studiorich/member-identity";
import { createArtworkThumbnailProjector, drawArtworkThumbnail } from "./artworkThumbnail";

function fakeContext() {
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x.toFixed(1)},${y.toFixed(1)})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x.toFixed(1)},${y.toFixed(1)})`),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      calls.push(`quadraticCurveTo(${cx.toFixed(1)},${cy.toFixed(1)},${x.toFixed(1)},${y.toFixed(1)})`),
    stroke: () => calls.push("stroke"),
    globalAlpha: 1 as unknown,
    strokeStyle: "" as unknown,
    lineWidth: 0 as unknown,
    lineCap: "" as unknown,
    lineJoin: "" as unknown,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function strokeMark(id: string, points: readonly { longitude: number; latitude: number }[]): StrokeMark {
  return {
    id,
    type: "stroke",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    geometry: { format: "geographic-stroke-v1", points },
    style: { color: "#ff0000", width: 4, opacity: 0.9 },
  };
}

function geoArtwork(marks: Artwork["marks"]): Artwork {
  return {
    id: "artwork-1",
    creatorId: "member-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    surfaceId: "map:new-york",
    composition: {
      bounds: { west: -74.02, south: 40.7, east: -74.0, north: 40.72 },
      startedAt: new Date("2026-01-01T00:00:00Z"),
      lastEditedAt: new Date("2026-01-01T00:00:00Z"),
    },
    marks,
    artworkType: "map", title: "", state: "draft",
    visibility: "private",
  };
}

describe("createArtworkThumbnailProjector", () => {
  it("returns null for a non-positive target size", () => {
    expect(createArtworkThumbnailProjector({ west: 0, south: 0, east: 1, north: 1 }, { width: 0, height: 80 })).toBeNull();
  });

  it("returns null for degenerate (zero-area) bounds", () => {
    expect(createArtworkThumbnailProjector({ west: 0, south: 0, east: 0, north: 1 }, { width: 80, height: 80 })).toBeNull();
  });

  it("flips the vertical axis for geographic bounds (north is up)", () => {
    const projector = createArtworkThumbnailProjector({ west: 0, south: 0, east: 1, north: 1 }, { width: 100, height: 100 }, 0);
    const north = projector!.project({ longitude: 0.5, latitude: 1 })!;
    const south = projector!.project({ longitude: 0.5, latitude: 0 })!;
    expect(north.y).toBeLessThan(south.y);
  });

  it("does not flip local (Blackbook) bounds", () => {
    const projector = createArtworkThumbnailProjector({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { width: 100, height: 100 }, 0);
    const top = projector!.project({ x: 0.5, y: 0 })!;
    const bottom = projector!.project({ x: 0.5, y: 1 })!;
    expect(top.y).toBeLessThan(bottom.y);
  });
});

describe("drawArtworkThumbnail", () => {
  it("draws a stroke mark as a smoothed path and reports it as drawn", () => {
    const { ctx, calls } = fakeContext();
    const artwork = geoArtwork([
      strokeMark("m1", [
        { longitude: -74.015, latitude: 40.705 },
        { longitude: -74.005, latitude: 40.715 },
      ]),
    ]);

    const result = drawArtworkThumbnail(ctx, artwork, { width: 80, height: 80 });

    expect(result).toEqual({ ok: true, drawnMarkCount: 1, skippedMarkCount: 0 });
    expect(calls).toContain("stroke");
    expect(calls.some((call) => call.startsWith("moveTo"))).toBe(true);
  });

  it("skips a material-erasure mark gracefully instead of throwing", () => {
    const { ctx } = fakeContext();
    const artwork = geoArtwork([
      {
        id: "e1",
        type: "material-erasure",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        geometry: { format: "geographic-erasure-v1", points: [{ longitude: -74.01, latitude: 40.71 }, { longitude: -74.0, latitude: 40.72 }] },
        targetMaterialId: "graphite",
        width: 5,
      },
    ]);

    const result = drawArtworkThumbnail(ctx, artwork, { width: 80, height: 80 });

    expect(result).toEqual({ ok: false, drawnMarkCount: 0, skippedMarkCount: 1 });
  });

  it("skips a stroke with fewer than 2 usable points instead of throwing", () => {
    const { ctx } = fakeContext();
    const artwork = geoArtwork([strokeMark("m1", [{ longitude: -74.01, latitude: 40.71 }])]);

    const result = drawArtworkThumbnail(ctx, artwork, { width: 80, height: 80 });

    expect(result).toEqual({ ok: false, drawnMarkCount: 0, skippedMarkCount: 1 });
  });

  it("fails gracefully (ok:false, no throw) for degenerate composition bounds", () => {
    const { ctx } = fakeContext();
    const artwork = geoArtwork([strokeMark("m1", [{ longitude: -74.01, latitude: 40.71 }, { longitude: -74.0, latitude: 40.72 }])]);
    const degenerate = { ...artwork, composition: { ...artwork.composition, bounds: { west: 0, south: 0, east: 0, north: 0 } } };

    expect(() => drawArtworkThumbnail(ctx, degenerate, { width: 80, height: 80 })).not.toThrow();
    expect(drawArtworkThumbnail(ctx, degenerate, { width: 80, height: 80 }).ok).toBe(false);
  });
});
