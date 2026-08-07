import { describe, it, expect } from "vitest";
import { snap, getGlyphBounds, buildSmoothPathData } from "./glyphStrokeGeometry";
import type { Stroke, Glyph } from "../../data/glyphStrokeTypes";

describe("snap", () => {
  it("rounds to the nearest grid multiple", () => {
    expect(snap(12, 25)).toBe(0);
    expect(snap(13, 25)).toBe(25);
    expect(snap(37, 25)).toBe(25);
    expect(snap(38, 25)).toBe(50);
  });
});

describe("getGlyphBounds", () => {
  it("returns null for a glyph with no points", () => {
    const glyph: Glyph = { strokes: [] };
    expect(getGlyphBounds(glyph)).toBeNull();
  });

  it("returns null for a glyph whose strokes have no points", () => {
    const glyph: Glyph = { strokes: [{ points: [] }] };
    expect(getGlyphBounds(glyph)).toBeNull();
  });

  it("computes tight bounds across multiple strokes", () => {
    const glyph: Glyph = {
      strokes: [
        { points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] },
        { points: [{ x: -5, y: 20 }, { x: 8, y: -3 }] },
      ],
    };
    const bounds = getGlyphBounds(glyph);
    expect(bounds).toEqual({ minX: -5, minY: -3, maxX: 10, maxY: 20, width: 15, height: 23 });
  });

  it("floors width/height at 1 for a single-point degenerate glyph", () => {
    const glyph: Glyph = { strokes: [{ points: [{ x: 4, y: 4 }] }] };
    const bounds = getGlyphBounds(glyph);
    expect(bounds).toEqual({ minX: 4, minY: 4, maxX: 4, maxY: 4, width: 1, height: 1 });
  });
});

describe("buildSmoothPathData", () => {
  it("returns an empty string for fewer than 2 points", () => {
    const stroke: Stroke = { points: [{ x: 0, y: 0 }] };
    expect(buildSmoothPathData(stroke)).toBe("");
  });

  it("builds straight L segments for pen mode", () => {
    const stroke: Stroke = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], mode: "pen" };
    const d = buildSmoothPathData(stroke);
    expect(d).toBe("M 0 0 L 10 0 L 10 10");
  });

  it("builds quadratic Q segments for freehand mode", () => {
    const stroke: Stroke = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], mode: "freehand" };
    const d = buildSmoothPathData(stroke);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d).toContain("Q 10 10 15 5");
  });

  it("offsets by bounds.minX/minY when bounds are supplied", () => {
    const stroke: Stroke = { points: [{ x: 5, y: 5 }, { x: 15, y: 5 }], mode: "pen" };
    const bounds = getGlyphBounds({ strokes: [stroke] })!;
    const d = buildSmoothPathData(stroke, bounds);
    expect(d).toBe("M 0 0 L 10 0");
  });
});
