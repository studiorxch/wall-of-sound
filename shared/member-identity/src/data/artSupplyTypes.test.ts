import { describe, expect, it } from "vitest";
import { MARKER_SUPPLY, MOP_SUPPLY, PEN_SUPPLY, PENCIL_ERASER_SUPPLY, PENCIL_SUPPLY, canEraseMaterial } from "./artSupplyTypes.js";

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
