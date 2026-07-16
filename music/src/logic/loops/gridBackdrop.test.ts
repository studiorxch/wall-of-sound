import { describe, it, expect } from "vitest";
import { buildGridBackdropBands, bandsForGroupingEmphasis } from "./gridBackdrop";

// 32 bars of evenly-spaced frames (arbitrary spacing, matches a real
// MusicalGrid.barFrames array in shape).
function barFrames(count: number, spacing = 1000): number[] {
  return Array.from({ length: count }, (_, i) => i * spacing);
}

describe("buildGridBackdropBands", () => {
  it("produces one bar band per consecutive bar pair", () => {
    const levels = buildGridBackdropBands(barFrames(9));
    expect(levels.bar.length).toBe(8);
  });

  it("groups every 4 bars for group4", () => {
    const levels = buildGridBackdropBands(barFrames(17)); // 16 full bars -> 4 groups of 4
    expect(levels.group4.length).toBe(4);
    expect(levels.group4[0].startBar).toBe(1);
    expect(levels.group4[0].endBar).toBe(5);
  });

  it("alternates 8-bar bands (band A / band B)", () => {
    const levels = buildGridBackdropBands(barFrames(25)); // 3 full 8-bar groups
    expect(levels.group8.length).toBe(3);
    expect(levels.group8[0].alternateIndex).toBe(0);
    expect(levels.group8[1].alternateIndex).toBe(1);
    expect(levels.group8[2].alternateIndex).toBe(0);
  });

  it("marks 16-bar bands as emphasized, others not", () => {
    const levels = buildGridBackdropBands(barFrames(33));
    expect(levels.group16.every((b) => b.emphasized)).toBe(true);
    expect(levels.group4.every((b) => !b.emphasized)).toBe(true);
    expect(levels.group8.every((b) => !b.emphasized)).toBe(true);
  });

  it("never produces an inverted range (start < end always)", () => {
    const levels = buildGridBackdropBands(barFrames(37));
    for (const arr of Object.values(levels)) {
      for (const b of arr) {
        expect(b.startFrame).toBeLessThan(b.endFrame);
        expect(b.startBar).toBeLessThan(b.endBar);
      }
    }
  });

  it("produces a correct final partial group when bar count doesn't divide evenly", () => {
    const levels = buildGridBackdropBands(barFrames(19)); // 18 bars -> 2 full groups of 8 + 1 partial (2 bars)
    const last = levels.group8[levels.group8.length - 1];
    expect(last.endBar - last.startBar).toBe(2);
  });

  it("returns empty arrays for fewer than 2 bar frames", () => {
    const levels = buildGridBackdropBands([1000]);
    expect(levels.bar).toEqual([]);
    expect(levels.group4).toEqual([]);
  });

  it("bands cover contiguous, non-overlapping bar ranges within a level", () => {
    const levels = buildGridBackdropBands(barFrames(25));
    for (let i = 0; i < levels.group8.length - 1; i++) {
      expect(levels.group8[i].endFrame).toBe(levels.group8[i + 1].startFrame);
    }
  });
});

describe("bandsForGroupingEmphasis", () => {
  const levels = buildGridBackdropBands(barFrames(33));

  it("returns group4 bands for emphasis 4", () => {
    expect(bandsForGroupingEmphasis(levels, 4)).toBe(levels.group4);
  });
  it("returns group8 bands for emphasis 8 (default)", () => {
    expect(bandsForGroupingEmphasis(levels, 8)).toBe(levels.group8);
  });
  it("returns group16 bands for emphasis 16", () => {
    expect(bandsForGroupingEmphasis(levels, 16)).toBe(levels.group16);
  });
});
