import { describe, expect, it } from "vitest";
import {
  INITIAL_DRAWING_TOOL_SELECTION,
  getDrawingTool,
  isDrawingToolId,
  resolveSelectedToolForInput,
  resolveDrawingToolPresentation,
  selectDrawingTool,
  selectMarkerVariant,
  selectedToolVariant,
} from "./DrawingTool";
import { MARKER_VARIANTS } from "./PaintMarkerEngine";

describe("drawing Tool authority", () => {
  it("holds one canonical selected Tool", () => {
    const selected = selectDrawingTool(INITIAL_DRAWING_TOOL_SELECTION, "paint-marker");
    expect(selected.selectedToolId).toBe("paint-marker");
    expect(getDrawingTool(selected.selectedToolId).renderer).toBe("paint-marker");
  });

  it("never treats temporary Pan as a Tool", () => {
    expect(isDrawingToolId("pan")).toBe(false);
    expect(isDrawingToolId("spray-can")).toBe(true);
    expect(isDrawingToolId("paint-marker")).toBe(true);
  });

  it.each(["mouse", "spatial"] as const)("routes %s input to the same selected Tool", (input) => {
    const selected = selectDrawingTool(INITIAL_DRAWING_TOOL_SELECTION, "paint-marker");
    expect(resolveSelectedToolForInput(selected, input)?.id).toBe("paint-marker");
  });

  it("preserves contextual variants while switching Tool families", () => {
    const marker = selectMarkerVariant(
      selectDrawingTool(INITIAL_DRAWING_TOOL_SELECTION, "paint-marker"),
      "chisel",
    );
    const spray = selectDrawingTool(marker, "spray-can");
    const restoredMarker = selectDrawingTool(spray, "paint-marker");
    expect(selectedToolVariant(spray)).toBe("new-york-fat");
    expect(selectedToolVariant(restoredMarker)).toBe("chisel");
  });

  it("returns new selection state without owning view, history, or input state", () => {
    const before = { ...INITIAL_DRAWING_TOOL_SELECTION };
    const after = selectDrawingTool(before, "paint-marker");
    expect(before).toEqual(INITIAL_DRAWING_TOOL_SELECTION);
    expect(after).not.toBe(before);
    expect(Object.keys(after).sort()).toEqual(["markerVariantId", "selectedToolId", "sprayCapId"]);
  });

  it("exposes only the selected Tool family's contextual parameter chooser", () => {
    const nameCap = (id: string) => `cap:${id}`;
    const nameMarker = (id: string) => `marker:${id}`;
    expect(resolveDrawingToolPresentation(INITIAL_DRAWING_TOOL_SELECTION, nameCap, nameMarker)).toMatchObject({
      toolName: "Spray Can",
      parameterLabel: "Cap",
      contextualChooserId: "cap-chooser",
      variantName: "cap:new-york-fat",
    });
    const marker = selectMarkerVariant(
      selectDrawingTool(INITIAL_DRAWING_TOOL_SELECTION, "paint-marker"),
      "mop",
    );
    expect(resolveDrawingToolPresentation(marker, nameCap, nameMarker)).toMatchObject({
      toolName: "Paint Marker",
      parameterLabel: "Marker / Nib",
      contextualChooserId: "marker-chooser",
      variantName: "marker:mop",
    });
  });

  it("keeps Mop and Drip Mop as distinct contextual marker variants", () => {
    expect(MARKER_VARIANTS.map(({ id }) => id)).toEqual(["round", "chisel", "clean-chisel", "mop", "drip-mop"]);
    const selected = selectMarkerVariant(
      selectDrawingTool(INITIAL_DRAWING_TOOL_SELECTION, "paint-marker"),
      "drip-mop",
    );
    expect(selectedToolVariant(selected)).toBe("drip-mop");
  });

  it("offers Clean Chisel as a contextual variant without adding a Tool family", () => {
    const selected = selectMarkerVariant(
      selectDrawingTool(INITIAL_DRAWING_TOOL_SELECTION, "paint-marker"),
      "clean-chisel",
    );
    expect(selectedToolVariant(selected)).toBe("clean-chisel");
    expect(MARKER_VARIANTS.find(({ id }) => id === "clean-chisel")?.material).toBe("calligraphy");
  });
});
