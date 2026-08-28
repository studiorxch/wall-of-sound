import { describe, it, expect } from "vitest";
import { decimateBarFrames, gridWithBarMultiple } from "./barMultipleSnap";
import { applySnap } from "./timelineSelection";
import type { MusicalGrid } from "../../data/loopTypes";

const BAR_FRAMES = [0, 100, 200, 300, 400, 500, 600, 700, 800];

function grid(overrides: Partial<MusicalGrid> = {}): MusicalGrid {
  return {
    bpm: 120, meterNumerator: 4, meterDenominator: 4,
    originSeconds: 0, originFrame: 0, originSource: "detected_beat",
    trust: "trusted", confidence: 0.9,
    beatFrames: [0, 25, 50, 75, 100], barFrames: BAR_FRAMES,
    sourceFingerprint: "fp", updatedAt: "t0",
    ...overrides,
  };
}

describe("decimateBarFrames", () => {
  it("1-bar multiple returns every bar frame unchanged", () => {
    expect(decimateBarFrames(BAR_FRAMES, 1)).toEqual(BAR_FRAMES);
  });

  it("2-bar multiple keeps every other bar, anchored at index 0", () => {
    expect(decimateBarFrames(BAR_FRAMES, 2)).toEqual([0, 200, 400, 600, 800]);
  });

  it("4-bar multiple keeps every 4th bar", () => {
    expect(decimateBarFrames(BAR_FRAMES, 4)).toEqual([0, 400, 800]);
  });

  it("a multiple larger than the available bars still keeps bar 0 (the anchor)", () => {
    expect(decimateBarFrames(BAR_FRAMES, 16)).toEqual([0]);
  });
});

describe("gridWithBarMultiple", () => {
  it("returns the SAME grid reference for multiple 1 — a true no-op", () => {
    const g = grid();
    expect(gridWithBarMultiple(g, 1)).toBe(g);
  });

  it("returns a new grid with decimated barFrames, all other fields identical", () => {
    const g = grid();
    const result = gridWithBarMultiple(g, 4);
    expect(result).not.toBe(g);
    expect(result.barFrames).toEqual([0, 400, 800]);
    expect(result.bpm).toBe(g.bpm);
    expect(result.beatFrames).toBe(g.beatFrames);
    expect(result.trust).toBe(g.trust);
  });
});

describe("integration with applySnap — the existing, unmodified 'bar' branch naturally snaps coarser", () => {
  it("snap mode 'bar' against a 1-bar-multiple grid behaves exactly as before (every bar)", () => {
    expect(applySnap(190, "bar", gridWithBarMultiple(grid(), 1))).toBe(200);
  });

  it("snap mode 'bar' against a 2-bar-multiple grid only lands on even-numbered bar lines", () => {
    const g2 = gridWithBarMultiple(grid(), 2);
    expect(applySnap(190, "bar", g2)).toBe(200); // nearest of [0,200,400,600,800]
    expect(applySnap(290, "bar", g2)).toBe(200); // NOT bar 3 (300) — that bar line no longer exists in this grid variant
  });

  it("snap mode 'bar' against an 8-bar-multiple grid on this 9-bar-frame fixture only offers bars 0 and 8", () => {
    const g8 = gridWithBarMultiple(grid(), 8);
    expect(g8.barFrames).toEqual([0, 800]);
    expect(applySnap(350, "bar", g8)).toBe(0);
    expect(applySnap(750, "bar", g8)).toBe(800);
  });

  it("beat mode is completely unaffected by barMultiple — decimation only ever touches barFrames", () => {
    const g4 = gridWithBarMultiple(grid(), 4);
    expect(applySnap(30, "beat", g4)).toBe(25);
  });
});
