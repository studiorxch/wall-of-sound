import { describe, it, expect } from "vitest";
import { computeSubdivisionSnapTarget } from "./subdivisionSnap";
import type { MusicalGrid } from "../../data/loopTypes";

const SR = 44100;

// 4/4 grid, 120bpm-ish: one beat = 22050 frames, one bar (4 beats) = 88200.
function grid(): MusicalGrid {
  return {
    bpm: 120, meterNumerator: 4, meterDenominator: 4,
    originSeconds: 0, originFrame: 0, originSource: "detected_beat", trust: "provisional", confidence: 0.5,
    beatFrames: [0, 22050, 44100, 66150, 88200],
    barFrames: [0, 88200],
    sourceFingerprint: "fp", updatedAt: "now",
  };
}

describe("computeSubdivisionSnapTarget", () => {
  it("1/4 division snaps to beat frames only", () => {
    const t = computeSubdivisionSnapTarget(23000, grid(), 4, SR);
    expect(t!.frame).toBe(22050);
    expect(t!.division).toBe(4);
    expect(t!.subdivision).toBe(0);
  });

  it("1/8 division adds a midpoint between beats", () => {
    const t = computeSubdivisionSnapTarget(33000, grid(), 8, SR); // midpoint of beat 1-2 is 33075
    expect(t!.frame).toBe(33075);
    expect(t!.subdivision).toBe(1);
  });

  it("1/16 division produces four subdivisions per beat", () => {
    const t = computeSubdivisionSnapTarget(0, grid(), 16, SR);
    expect(t!.frame).toBe(0);
    const quarterIntoBeat = computeSubdivisionSnapTarget(5500, grid(), 16, SR);
    expect(quarterIntoBeat!.frame).toBe(5513); // 22050/4 rounded
  });

  it("1/32 division produces eight subdivisions per beat", () => {
    const t = computeSubdivisionSnapTarget(1400, grid(), 32, SR);
    expect(t!.frame).toBe(Math.round(22050 / 8)); // nearest 1/32 mark
  });

  it("reports exact frame and derived seconds, never rounded-second timing", () => {
    const t = computeSubdivisionSnapTarget(22050, grid(), 16, SR);
    expect(t!.frame).toBe(22050);
    expect(t!.seconds).toBeCloseTo(22050 / SR, 10);
  });

  it("never returns a frame outside the grid's own beat-frame bounds", () => {
    const t = computeSubdivisionSnapTarget(999999, grid(), 16, SR);
    expect(t!.frame).toBeLessThanOrEqual(88200);
    expect(t!.frame).toBeGreaterThanOrEqual(0);
  });

  it("returns null when the grid has fewer than two beat frames", () => {
    const sparse: MusicalGrid = { ...grid(), beatFrames: [0] };
    expect(computeSubdivisionSnapTarget(100, sparse, 16, SR)).toBeNull();
  });

  it("computes bar/beat indices relative to the meter", () => {
    const t = computeSubdivisionSnapTarget(66150, grid(), 4, SR);
    expect(t!.bar).toBe(0);
    expect(t!.beat).toBe(3);
  });
});
