import { describe, expect, it } from "vitest";
import { resolveInteractionAuthority } from "./InteractionAuthority";
import { beginPanInteraction, resetPanInteraction, setSpacePanHeld } from "./WallView";

describe("central interaction authority", () => {
  it("allows paint when pinch is active and no navigation gesture exists", () => {
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray",
      sprayIntent: true,
      panInteraction: resetPanInteraction(),
      panPointerActive: false,
    });
    expect(authority).toMatchObject({ paintAllowed: true, paintSuppressed: false, effectiveTool: "spray" });
  });

  it("allows spray audio from the same authority that permits paint", () => {
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray",
      sprayIntent: true,
      panInteraction: resetPanInteraction(),
      panPointerActive: false,
    });
    expect(authority.sprayAudioAllowed).toBe(true);
    expect(authority.sprayAudioAllowed).toBe(authority.paintAllowed);
  });

  it("self-normalizes a stale Space Pan owner without a pointer", () => {
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray",
      sprayIntent: true,
      panInteraction: { spaceHeld: true, source: "space" },
      panPointerActive: false,
    });
    expect(authority.normalized).toBe(true);
    expect(authority.normalizedPan).toEqual(resetPanInteraction());
    expect(authority.paintAllowed).toBe(true);
    expect(authority.sprayAudioAllowed).toBe(true);
  });

  it("never lets an armed Space modifier suppress Hand paint without a Pan gesture", () => {
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray",
      sprayIntent: true,
      panInteraction: { spaceHeld: true, source: null },
      panPointerActive: false,
    });
    expect(authority).toMatchObject({
      panGestureActive: false,
      panVisualActive: false,
      paintAllowed: true,
      sprayAudioAllowed: true,
      paintSuppressed: false,
    });
  });

  it("clears Pan visual state with navigation authority", () => {
    const stalePan = beginPanInteraction(setSpacePanHeld(resetPanInteraction(), true), 0);
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray",
      sprayIntent: true,
      panInteraction: stalePan,
      panPointerActive: false,
    });
    expect(authority).toMatchObject({
      navigationOwner: null,
      panGestureActive: false,
      panVisualActive: false,
      effectiveTool: "spray",
      paintSuppressed: false,
    });
  });

  it("suppresses paint and audio only while a real Pan pointer owns navigation", () => {
    const activePan = beginPanInteraction(setSpacePanHeld(resetPanInteraction(), true), 0);
    const authority = resolveInteractionAuthority({
      activeDrawingTool: "spray",
      sprayIntent: true,
      panInteraction: activePan,
      panPointerActive: true,
    });
    expect(authority).toMatchObject({
      navigationOwner: "space",
      panGestureActive: true,
      panVisualActive: true,
      effectiveTool: "pan",
      paintAllowed: false,
      sprayAudioAllowed: false,
      paintSuppressed: true,
    });
  });

  it("restores Hand paint and audio through repeated Pan/resume cycles", () => {
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const activePan = beginPanInteraction(setSpacePanHeld(resetPanInteraction(), true), 0);
      const navigating = resolveInteractionAuthority({
        activeDrawingTool: "spray",
        sprayIntent: true,
        panInteraction: activePan,
        panPointerActive: true,
      });
      expect(navigating.paintSuppressed).toBe(true);

      const resumed = resolveInteractionAuthority({
        activeDrawingTool: "spray",
        sprayIntent: true,
        panInteraction: navigating.normalizedPan,
        panPointerActive: false,
      });
      expect(resumed).toMatchObject({
        normalizedPan: resetPanInteraction(),
        paintAllowed: true,
        sprayAudioAllowed: true,
        panVisualActive: false,
      });
    }
  });
});
