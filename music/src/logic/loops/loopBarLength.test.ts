import { describe, it, expect } from "vitest";
import { secondsPerBar, computeLoopBars, frameToBarBeat } from "./loopBarLength";
import type { MusicalGrid } from "../../data/loopTypes";

function grid(overrides: Partial<MusicalGrid> = {}): MusicalGrid {
  return {
    bpm: 120, meterNumerator: 4, meterDenominator: 4,
    originSeconds: 0, originFrame: 0, originSource: "detected_beat",
    trust: "trusted", confidence: 0.9,
    beatFrames: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100],
    barFrames: [0, 400, 800],
    sourceFingerprint: "fp", updatedAt: "t0",
    ...overrides,
  };
}

describe("secondsPerBar — bar→seconds under known BPM/meter", () => {
  it("120 BPM, 4/4 = 2 seconds per bar", () => {
    expect(secondsPerBar(120, 4)).toBe(2);
  });

  it("90 BPM, 3/4 = 2 seconds per bar", () => {
    expect(secondsPerBar(90, 3)).toBe(2);
  });
});

describe("computeLoopBars — exact loop bar-length calculation", () => {
  it("a loop exactly 8 bars long at 120 BPM 4/4 (2s/bar) is 16 seconds", () => {
    expect(computeLoopBars(16, 120, 4)).toBe(8);
  });

  it("a loop exactly 16 bars long at 120 BPM 4/4 is 32 seconds", () => {
    expect(computeLoopBars(32, 120, 4)).toBe(16);
  });

  it("does not silently assume 4/4 — a real, pre-existing bug this consolidation fixes", () => {
    // At 3/4, 8 bars of 120 BPM is 12 seconds, NOT the 16 seconds a
    // hardcoded-4 calculation would have produced.
    expect(computeLoopBars(12, 120, 3)).toBe(8);
  });
});

describe("frameToBarBeat — beat→bar conversion", () => {
  it("frame 0 is bar 1, beat 1", () => {
    expect(frameToBarBeat(0, grid())).toEqual({ bar: 1, beat: 1 });
  });

  it("a frame partway through bar 1 lands on the correct beat within that bar", () => {
    expect(frameToBarBeat(250, grid())).toEqual({ bar: 1, beat: 3 });
  });

  it("a frame exactly on the second bar's downbeat is bar 2, beat 1", () => {
    expect(frameToBarBeat(400, grid())).toEqual({ bar: 2, beat: 1 });
  });

  it("a frame near the end of bar 2 lands on its last beat", () => {
    expect(frameToBarBeat(750, grid())).toEqual({ bar: 2, beat: 4 });
  });

  it("returns null when the grid has no usable bar frames — honest unavailable, never fabricated", () => {
    expect(frameToBarBeat(100, grid({ barFrames: [] }))).toBeNull();
    expect(frameToBarBeat(100, null)).toBeNull();
  });
});
