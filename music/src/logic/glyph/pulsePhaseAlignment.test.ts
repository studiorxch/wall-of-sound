import { describe, it, expect } from "vitest";
import { computePhaseOffset, alignPulseToAnchor } from "./pulsePhaseAlignment";

describe("computePhaseOffset", () => {
  it("returns 0 for no anchors", () => {
    expect(computePhaseOffset([], 0.5)).toBe(0);
  });

  it("returns the shared phase when every anchor lands at the same offset", () => {
    // secondsPerPulse = 0.5; anchors at phase 0.1 repeatedly.
    const offset = computePhaseOffset([0.1, 0.6, 1.1, 1.6], 0.5);
    expect(offset).toBeCloseTo(0.1, 5);
  });

  it("is deterministic for identical input", () => {
    const anchors = [0.12, 0.63, 1.11, 1.58];
    expect(computePhaseOffset(anchors, 0.5)).toBe(computePhaseOffset(anchors, 0.5));
  });

  it("handles phase wraparound near the boundary correctly", () => {
    // Phases clustered near 0 / secondsPerPulse boundary (0.48, 0.02) should
    // average near 0, not near 0.25 (a naive arithmetic mean would be wrong).
    const offset = computePhaseOffset([0.48, 1.02], 0.5);
    expect(offset < 0.05 || offset > 0.45).toBe(true);
  });

  it("returns a value within [0, secondsPerPulse)", () => {
    const offset = computePhaseOffset([0.3, 0.9, 1.7, 2.1], 0.5);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(0.5);
  });
});

describe("alignPulseToAnchor", () => {
  it("snaps to the nearest anchor within tolerance", () => {
    const result = alignPulseToAnchor(1.0, [0.5, 1.05, 2.0], 0.1);
    expect(result.matchedAnchorSeconds).toBe(1.05);
    expect(result.timeSeconds).toBe(1.05);
  });

  it("leaves the grid time unchanged when no anchor is within tolerance", () => {
    const result = alignPulseToAnchor(1.0, [0.2, 3.0], 0.1);
    expect(result.matchedAnchorSeconds).toBeNull();
    expect(result.timeSeconds).toBe(1.0);
  });

  it("leaves the grid time unchanged with an empty anchor list", () => {
    const result = alignPulseToAnchor(1.0, [], 0.1);
    expect(result.matchedAnchorSeconds).toBeNull();
    expect(result.timeSeconds).toBe(1.0);
  });

  it("picks the closest of multiple in-tolerance anchors", () => {
    const result = alignPulseToAnchor(1.0, [0.95, 1.02], 0.1);
    expect(result.matchedAnchorSeconds).toBe(1.02);
  });
});
