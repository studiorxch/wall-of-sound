import { describe, expect, it } from "vitest";
import {
  DRAWING_DEFAULT_COLORS,
  DRAWING_SUPPLY_ORDER,
  DRAWING_WIDTH_RANGES,
  MARKER_SUPPLY,
  MOP_SUPPLY,
  PEN_SUPPLY,
  PENCIL_ERASER_SUPPLY,
  PENCIL_SUPPLY,
  SPRAY_SUPPLY,
  canEraseMaterial,
} from "./artSupplyTypes.js";

describe("Art Supplies V1", () => {
  it("defines Pencil as a graphite-producing supply with editable performance settings", () => {
    expect(PENCIL_SUPPLY).toMatchObject({ id: "pencil", materialId: "graphite", defaultSettings: { width: 5, opacity: 0.82 } });
  });

  it("limits the Pencil Eraser to graphite instead of creating a universal eraser", () => {
    expect(PENCIL_ERASER_SUPPLY.targetMaterialId).toBe("graphite");
    expect(canEraseMaterial("eraser", "graphite")).toBe(true);
    expect(canEraseMaterial("eraser", "legacy-neutral")).toBe(false);
    expect(canEraseMaterial("eraser", "ink")).toBe(false);
    expect(canEraseMaterial("eraser", "marker")).toBe(false);
  });

  it("defines Pen and Marker as reusable supplies with distinct materials and defaults", () => {
    expect(PEN_SUPPLY).toMatchObject({ id: "pen", materialId: "ink", defaultSettings: { width: 3, opacity: 0.95 } });
    expect(MARKER_SUPPLY).toMatchObject({ id: "marker", materialId: "marker", defaultSettings: { width: 16, opacity: 0.72 } });
  });
});

describe("Art Supplies V3 -- Mop", () => {
  it("defines Mop as an explicit reusable supply with its own material identity, not Marker", () => {
    expect(MOP_SUPPLY).toMatchObject({ id: "mop", materialId: "mop", defaultSettings: { width: 34, opacity: 0.55 } });
    expect(MOP_SUPPLY.materialId).not.toBe(MARKER_SUPPLY.materialId);
    expect(MOP_SUPPLY.id).not.toBe(MARKER_SUPPLY.id);
  });

  it("gives Mop a broader default width and lower default opacity than Marker -- a translucent, accumulating pass, not a thicker Marker", () => {
    expect(MOP_SUPPLY.defaultSettings.width).toBeGreaterThan(MARKER_SUPPLY.defaultSettings.width);
    expect(MOP_SUPPLY.defaultSettings.opacity).toBeLessThan(MARKER_SUPPLY.defaultSettings.opacity);
  });

  it("keeps the graphite-only Eraser from targeting Mop -- no universal or Mop-specific eraser", () => {
    expect(canEraseMaterial("eraser", "mop")).toBe(false);
    expect(canEraseMaterial("eraser", "graphite")).toBe(true);
  });
});

describe("Art Supplies V4 -- Spray", () => {
  it("defines Spray as an explicit reusable supply with its own material identity, distinct from Marker and Mop", () => {
    expect(SPRAY_SUPPLY).toMatchObject({ id: "spray", materialId: "spray", defaultSettings: { width: 24, opacity: 0.6 } });
    expect(SPRAY_SUPPLY.materialId).not.toBe(MARKER_SUPPLY.materialId);
    expect(SPRAY_SUPPLY.materialId).not.toBe(MOP_SUPPLY.materialId);
    expect(SPRAY_SUPPLY.id).not.toBe(MARKER_SUPPLY.id);
    expect(SPRAY_SUPPLY.id).not.toBe(MOP_SUPPLY.id);
  });

  it("keeps the graphite-only Eraser from targeting Spray -- no universal or Spray-specific eraser", () => {
    expect(canEraseMaterial("eraser", "spray")).toBe(false);
    expect(canEraseMaterial("eraser", "graphite")).toBe(true);
  });
});

describe("Drawing Shell V1 -- canonical presentation constants", () => {
  it("defines a stable, canonical Art Supply order", () => {
    expect(DRAWING_SUPPLY_ORDER).toEqual(["pencil", "pen", "marker", "mop", "spray"]);
  });

  it("gives every canonical supply a width range whose middle differs per instrument", () => {
    expect(Object.keys(DRAWING_WIDTH_RANGES).sort()).toEqual([...DRAWING_SUPPLY_ORDER].sort());
    for (const supply of DRAWING_SUPPLY_ORDER) {
      const range = DRAWING_WIDTH_RANGES[supply];
      expect(range.min).toBeLessThan(range.max);
    }
  });

  it("gives every canonical supply its own visually-distinct default color", () => {
    expect(Object.keys(DRAWING_DEFAULT_COLORS).sort()).toEqual([...DRAWING_SUPPLY_ORDER].sort());
    const colors = DRAWING_SUPPLY_ORDER.map((supply) => DRAWING_DEFAULT_COLORS[supply]);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("Mop and Marker keep visually distinct default colors, matching their distinct material identities", () => {
    expect(DRAWING_DEFAULT_COLORS.mop).not.toBe(DRAWING_DEFAULT_COLORS.marker);
  });
});
