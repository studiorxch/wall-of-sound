import { describe, expect, it } from "vitest";
import { resolveDrawingCursorAim, resolveDrawingCursorGeometry } from "./DrawingCursor";
import { CHISEL_NIB_ANGLE } from "./PaintMarkerEngine";

describe("shared Drawing cursor authority", () => {
  it("derives Spray coverage from the canonical Cap Profile", () => {
    const fat = resolveDrawingCursorGeometry({ toolId: "spray-can", variantId: "new-york-fat", color: "#f00", size: 32 }, 1);
    const needle = resolveDrawingCursorGeometry({ toolId: "spray-can", variantId: "needle", color: "#f00", size: 5 }, 1);
    expect(fat.shape).toBe("circle");
    expect(fat.width).toBeGreaterThan(64);
    expect(needle.width).toBeGreaterThan(10);
  });

  it("makes Round and both Mop contacts circular but materially different", () => {
    const round = resolveDrawingCursorGeometry({ toolId: "paint-marker", variantId: "round", color: "#f00", size: 28 }, 1);
    const mop = resolveDrawingCursorGeometry({ toolId: "paint-marker", variantId: "mop", color: "#f00", size: 44 }, 1);
    const dripMop = resolveDrawingCursorGeometry({ toolId: "paint-marker", variantId: "drip-mop", color: "#f00", size: 50 }, 1);
    expect(round).toMatchObject({ shape: "circle", width: 28, height: 28 });
    expect(mop.shape).toBe("circle");
    expect(mop.width).toBe(mop.height);
    expect(dripMop.width).toBeGreaterThan(mop.width);
  });

  it("uses the renderer's physical Chisel angle and aspect", () => {
    const cursor = resolveDrawingCursorGeometry({ toolId: "paint-marker", variantId: "chisel", color: "#f00", size: 40 }, 1, 1.2);
    expect(cursor).toMatchObject({ shape: "chisel", width: 40, height: 8.8, angle: CHISEL_NIB_ANGLE });
  });

  it("tracks size and Wall zoom without input-source-specific geometry", () => {
    const style = { toolId: "paint-marker", variantId: "round", color: "#f00", size: 20 } as const;
    expect(resolveDrawingCursorGeometry(style, 4).width).toBe(16 * resolveDrawingCursorGeometry(style, 0.25).width);
    expect(resolveDrawingCursorGeometry({ ...style, size: 40 }, 1).width).toBe(2 * resolveDrawingCursorGeometry(style, 1).width);
    for (const zoom of [0.25, 0.5, 1, 2, 4]) {
      expect(resolveDrawingCursorGeometry(style, zoom).width).toBe(style.size * zoom);
    }
  });

  it("follows active Tool and variant selection through the same geometry entry point", () => {
    const spray = resolveDrawingCursorGeometry({ toolId: "spray-can", variantId: "calligraphy", color: "#f00", size: 25 }, 1, 0.7);
    const marker = resolveDrawingCursorGeometry({ toolId: "paint-marker", variantId: "chisel", color: "#f00", size: 34 }, 1, 0.7);
    expect(spray).toMatchObject({ toolId: "spray-can", variantId: "calligraphy", shape: "ellipse", angle: 0.7 });
    expect(marker).toMatchObject({ toolId: "paint-marker", variantId: "chisel", shape: "chisel" });
  });

  it("updates orientation from the latest aim movement without changing Tool geometry authority", () => {
    const first = resolveDrawingCursorAim({ point: null, angle: 0 }, { x: 10, y: 10 });
    const second = resolveDrawingCursorAim(first, { x: 20, y: 20 });
    expect(second.point).toEqual({ x: 20, y: 20 });
    expect(second.angle).toBeCloseTo(Math.PI / 4);
  });
});
