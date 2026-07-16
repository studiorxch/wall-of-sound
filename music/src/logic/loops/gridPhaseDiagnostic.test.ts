import { describe, it, expect } from "vitest";
import { compareToGrid, applyPreviewOffsetFrames, PREVIEW_OFFSET_MS_STEPS } from "./gridPhaseDiagnostic";
import type { MusicalGrid } from "../../data/loopTypes";

const SR = 44100;

function grid(overrides: Partial<MusicalGrid> = {}): MusicalGrid {
  return {
    bpm: 120, meterNumerator: 4, meterDenominator: 4,
    originSeconds: 0, originFrame: 0,
    originSource: "trusted_downbeat", trust: "trusted", confidence: 0.9,
    beatFrames: [0, 11025, 22050, 33075],
    barFrames: [0, 44100],
    sourceFingerprint: "fp1", updatedAt: "t0",
    ...overrides,
  };
}

describe("compareToGrid", () => {
  it("reports gridAvailable:false with no comparison data when no grid exists", () => {
    const result = compareToGrid(5000, undefined);
    expect(result).toEqual({ selectedStartFrame: 5000, gridAvailable: false });
  });

  it("finds the nearest bar/beat frame and computes offsets", () => {
    const g = grid();
    const result = compareToGrid(11100, g);
    expect(result.gridAvailable).toBe(true);
    expect(result.nearestGridFrame).toBe(11025);
    expect(result.offsetFromGridFrames).toBe(75);
    expect(result.originFrame).toBe(0);
    expect(result.offsetFromOriginFrames).toBe(11100);
  });

  it("considers both barFrames and beatFrames when finding the nearest", () => {
    const g = grid({ barFrames: [0, 44100], beatFrames: [10000, 22050] });
    const result = compareToGrid(9990, g);
    expect(result.nearestGridFrame).toBe(10000);
  });
});

describe("applyPreviewOffsetFrames", () => {
  it("shifts both boundaries by the same frame offset", () => {
    const { startFrame, endFrame } = applyPreviewOffsetFrames(1000, 5000, 50, SR);
    const expectedShift = Math.round((50 / 1000) * SR);
    expect(startFrame).toBe(1000 + expectedShift);
    expect(endFrame).toBe(5000 + expectedShift);
  });

  it("is a no-op at zero offset", () => {
    const result = applyPreviewOffsetFrames(1000, 5000, 0, SR);
    expect(result).toEqual({ startFrame: 1000, endFrame: 5000 });
  });

  it("shifts negatively for a negative offset", () => {
    const { startFrame } = applyPreviewOffsetFrames(1000, 5000, -20, SR);
    expect(startFrame).toBeLessThan(1000);
  });

  it("exposes the full set of sanctioned nudge steps", () => {
    expect(PREVIEW_OFFSET_MS_STEPS).toEqual([-100, -50, -20, 0, 20, 50, 100]);
  });
});
