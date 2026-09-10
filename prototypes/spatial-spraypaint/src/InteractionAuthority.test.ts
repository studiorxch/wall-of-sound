import { describe, expect, it } from "vitest";
import { resolveInteractionAuthority } from "./InteractionAuthority";
import { beginPanInteraction, resetPanInteraction, setSpacePanHeld } from "./WallView";

describe("central interaction authority", () => {
  it("allows paint when pinch is active and no navigation gesture exists", () => {
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray-can",
      drawingIntent: true,
      panInteraction: resetPanInteraction(),
      panPointerActive: false,
    });
    expect(authority).toMatchObject({ drawingAllowed: true, drawingSuppressed: false, effectiveTool: "spray-can" });
  });

  it("allows spray audio from the same authority that permits paint", () => {
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray-can",
      drawingIntent: true,
      panInteraction: resetPanInteraction(),
      panPointerActive: false,
    });
    expect(authority.materialFeedbackAllowed).toBe(true);
    expect(authority.materialFeedbackAllowed).toBe(authority.drawingAllowed);
  });

  it("self-normalizes a stale Space Pan owner without a pointer", () => {
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray-can",
      drawingIntent: true,
      panInteraction: { spaceHeld: true, source: "space" },
      panPointerActive: false,
    });
    expect(authority.normalized).toBe(true);
    expect(authority.normalizedPan).toEqual(resetPanInteraction());
    expect(authority.drawingAllowed).toBe(true);
    expect(authority.materialFeedbackAllowed).toBe(true);
  });

  it("never lets an armed Space modifier suppress Hand paint without a Pan gesture", () => {
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray-can",
      drawingIntent: true,
      panInteraction: { spaceHeld: true, source: null },
      panPointerActive: false,
    });
    expect(authority).toMatchObject({
      panGestureActive: false,
      panVisualActive: false,
      drawingAllowed: true,
      materialFeedbackAllowed: true,
      drawingSuppressed: false,
    });
  });

  it("clears Pan visual state with navigation authority", () => {
    const stalePan = beginPanInteraction(setSpacePanHeld(resetPanInteraction(), true), 0);
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray-can",
      drawingIntent: true,
      panInteraction: stalePan,
      panPointerActive: false,
    });
    expect(authority).toMatchObject({
      navigationOwner: null,
      panGestureActive: false,
      panVisualActive: false,
      effectiveTool: "spray-can",
      drawingSuppressed: false,
    });
  });

  it("suppresses paint and audio only while a real Pan pointer owns navigation", () => {
    const activePan = beginPanInteraction(setSpacePanHeld(resetPanInteraction(), true), 0);
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray-can",
      drawingIntent: true,
      panInteraction: activePan,
      panPointerActive: true,
    });
    expect(authority).toMatchObject({
      navigationOwner: "space",
      panGestureActive: true,
      panVisualActive: true,
      effectiveTool: "pan",
      drawingAllowed: false,
      materialFeedbackAllowed: false,
      drawingSuppressed: true,
    });
  });

  it("restores Hand paint and audio through repeated Pan/resume cycles", () => {
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const activePan = beginPanInteraction(setSpacePanHeld(resetPanInteraction(), true), 0);
      const navigating = resolveInteractionAuthority({
        activeDrawingTool: "spray-can",
        drawingIntent: true,
        panInteraction: activePan,
        panPointerActive: true,
      });
      expect(navigating.drawingSuppressed).toBe(true);

      const resumed = resolveInteractionAuthority({
        activeDrawingTool: "spray-can",
        drawingIntent: true,
        panInteraction: navigating.normalizedPan,
        panPointerActive: false,
      });
      expect(resumed).toMatchObject({
        normalizedPan: resetPanInteraction(),
        drawingAllowed: true,
        materialFeedbackAllowed: true,
        panVisualActive: false,
      });
    }
  });

  it("routes Paint Marker through the same drawing-versus-Pan authority", () => {
    const drawing = resolveInteractionAuthority({
      activeDrawingTool: "paint-marker",
      drawingIntent: true,
      panInteraction: resetPanInteraction(),
      panPointerActive: false,
    });
    expect(drawing).toMatchObject({ effectiveTool: "paint-marker", drawingAllowed: true });

    const panning = resolveInteractionAuthority({
      activeDrawingTool: "paint-marker",
      drawingIntent: true,
      panInteraction: beginPanInteraction(setSpacePanHeld(resetPanInteraction(), true), 0),
      panPointerActive: true,
    });
    expect(panning).toMatchObject({ effectiveTool: "pan", drawingAllowed: false });
  });
});
