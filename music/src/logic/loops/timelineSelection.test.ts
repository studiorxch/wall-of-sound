import { describe, it, expect } from "vitest";
import { normalizeAndClamp, applySnap, createSelection, moveSelectionBoundary, moveSelection, isValidSelection } from "./timelineSelection";
import type { MusicalGrid } from "../../data/loopTypes";

const SR = 44100;

function grid(): MusicalGrid {
  return {
    bpm: 120, meterNumerator: 4, meterDenominator: 4,
    originSeconds: 0, originFrame: 0, originSource: "detected_beat", trust: "provisional", confidence: 0.5,
    beatFrames: [0, 22050, 44100, 66150, 88200],
    barFrames: [0, 88200, 176400],
    sourceFingerprint: "fp", updatedAt: "now",
  };
}

describe("normalizeAndClamp", () => {
  it("keeps a forward range unchanged", () => {
    expect(normalizeAndClamp(1000, 5000, 100000)).toEqual({ startFrame: 1000, endFrame: 5000 });
  });
  it("normalizes a reverse drag", () => {
    expect(normalizeAndClamp(5000, 1000, 100000)).toEqual({ startFrame: 1000, endFrame: 5000 });
  });
  it("clamps to the source frame count", () => {
    expect(normalizeAndClamp(-500, 200000, 100000)).toEqual({ startFrame: 0, endFrame: 100000 });
  });
});

describe("applySnap", () => {
  it("returns the raw frame when snap mode is off", () => {
    expect(applySnap(12345, "off", grid())).toBe(12345);
  });
  it("snaps to the nearest bar frame", () => {
    expect(applySnap(90000, "bar", grid())).toBe(88200);
  });
  it("snaps to the nearest beat frame", () => {
    expect(applySnap(23000, "beat", grid())).toBe(22050);
  });
  it("falls back to the raw frame when there is no grid", () => {
    expect(applySnap(500, "bar", null)).toBe(500);
  });
  it("zero_crossing mode falls through to the raw frame (not implemented this pass)", () => {
    expect(applySnap(500, "zero_crossing", grid())).toBe(500);
  });
});

describe("createSelection", () => {
  it("builds a valid selection from a forward drag", () => {
    const sel = createSelection("t1", 1000, 5000, 100000, SR, "drag", "off", null);
    expect(sel).not.toBeNull();
    expect(sel!.startFrame).toBe(1000);
    expect(sel!.endFrame).toBe(5000);
    expect(sel!.durationSeconds).toBeCloseTo(4000 / SR, 6);
  });

  it("normalizes a reverse drag automatically", () => {
    const sel = createSelection("t1", 5000, 1000, 100000, SR, "drag", "off", null);
    expect(sel!.startFrame).toBe(1000);
    expect(sel!.endFrame).toBe(5000);
  });

  it("rejects a zero-length selection", () => {
    expect(createSelection("t1", 1000, 1000, 100000, SR, "drag", "off", null)).toBeNull();
  });

  it("applies grid snap before normalizing", () => {
    const sel = createSelection("t1", 100, 90000, 200000, SR, "drag", "bar", grid());
    expect(sel!.startFrame).toBe(0); // snapped to nearest bar (0)
    expect(sel!.endFrame).toBe(88200);
  });

  it("carries source-specific linkage fields", () => {
    const sel = createSelection("t1", 0, 1000, 100000, SR, "candidate", "off", null, { candidateId: "c1" });
    expect(sel!.candidateId).toBe("c1");
    expect(sel!.source).toBe("candidate");
  });
});

describe("moveSelectionBoundary", () => {
  const base = createSelection("t1", 1000, 5000, 100000, SR, "drag", "off", null)!;

  it("moves the start boundary without affecting the end", () => {
    const next = moveSelectionBoundary(base, "start", 2000, 100000, SR, "off", null);
    expect(next!.startFrame).toBe(2000);
    expect(next!.endFrame).toBe(5000);
  });

  it("moves the end boundary without affecting the start", () => {
    const next = moveSelectionBoundary(base, "end", 8000, 100000, SR, "off", null);
    expect(next!.startFrame).toBe(1000);
    expect(next!.endFrame).toBe(8000);
  });

  it("rejects a boundary move that would invert the selection", () => {
    const next = moveSelectionBoundary(base, "start", 9000, 100000, SR, "off", null);
    expect(next).toBeNull();
  });

  it("clamps to source bounds", () => {
    const next = moveSelectionBoundary(base, "end", 999999, 100000, SR, "off", null);
    expect(next!.endFrame).toBe(100000);
  });

  it("re-derives seconds/duration after the move", () => {
    const next = moveSelectionBoundary(base, "end", 44100, 100000, SR, "off", null);
    expect(next!.endSeconds).toBeCloseTo(1, 5);
    expect(next!.durationSeconds).toBeCloseTo((44100 - 1000) / SR, 6);
  });
});

describe("moveSelection", () => {
  const base = createSelection("t1", 1000, 5000, 100000, SR, "drag", "off", null)!;

  it("shifts both edges by the same delta, preserving exact width", () => {
    const next = moveSelection(base, 2000, 100000, SR, "off", null);
    expect(next!.startFrame).toBe(3000);
    expect(next!.endFrame).toBe(7000);
    expect(next!.endFrame - next!.startFrame).toBe(base.endFrame - base.startFrame);
  });

  it("preserves durationSeconds exactly across the move", () => {
    const next = moveSelection(base, 2000, 100000, SR, "off", null);
    expect(next!.durationSeconds).toBeCloseTo(base.durationSeconds, 10);
  });

  it("clamps at the lower bound without shrinking the selection", () => {
    const next = moveSelection(base, -5000, 100000, SR, "off", null);
    expect(next!.startFrame).toBe(0);
    expect(next!.endFrame).toBe(4000);
  });

  it("clamps at the upper bound without shrinking the selection", () => {
    const next = moveSelection(base, 999999, 100000, SR, "off", null);
    expect(next!.endFrame).toBe(100000);
    expect(next!.startFrame).toBe(96000);
  });

  it("clamps against a narrower audible-content clampBounds", () => {
    const next = moveSelection(base, 999999, 100000, SR, "off", null, { minFrame: 2000, maxFrame: 10000 });
    expect(next!.endFrame).toBe(10000);
    expect(next!.startFrame).toBe(6000);
  });

  it("snaps the new start as a unit under Grid, still preserving width", () => {
    const next = moveSelection(base, 500, 200000, SR, "bar", grid());
    expect(next!.startFrame).toBe(0); // 1500 snaps to nearest bar frame 0
    expect(next!.endFrame - next!.startFrame).toBe(base.endFrame - base.startFrame);
  });

  it("returns null when the selection's own width can never fit clampBounds", () => {
    const next = moveSelection(base, 0, 100000, SR, "off", null, { minFrame: 0, maxFrame: 2000 });
    expect(next).toBeNull();
  });
});

describe("isValidSelection", () => {
  it("is true for a well-formed selection", () => {
    const sel = createSelection("t1", 1000, 5000, 100000, SR, "drag", "off", null)!;
    expect(isValidSelection(sel, 100000)).toBe(true);
  });
  it("is false for a selection exceeding the source frame count", () => {
    const sel = createSelection("t1", 1000, 5000, 100000, SR, "drag", "off", null)!;
    expect(isValidSelection(sel, 4000)).toBe(false);
  });
});
