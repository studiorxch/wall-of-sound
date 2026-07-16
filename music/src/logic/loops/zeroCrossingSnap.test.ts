import { describe, it, expect } from "vitest";
import { findZeroCrossing } from "./zeroCrossingSnap";

const SR = 44100;
const LEN = 2000;

function linearCrossing(offset: number): Float32Array {
  const arr = new Float32Array(LEN);
  for (let i = 0; i < LEN; i++) arr[i] = i - offset;
  return arr;
}

describe("findZeroCrossing", () => {
  it("mono: returns the exact crossing frame with zero offset when raw frame is already the crossing", () => {
    const result = findZeroCrossing(100, [linearCrossing(100)], SR);
    expect(result.frame).toBe(100);
    expect(result.offsetSeconds).toBeCloseTo(0, 6);
    expect(result.warning).toBeUndefined();
  });

  it("mono: snaps to the nearest valid crossing within the search window and reports the offset", () => {
    const result = findZeroCrossing(105, [linearCrossing(100)], SR);
    expect(result.frame).toBe(100);
    expect(result.offsetSeconds).toBeCloseTo(-5 / SR, 8);
    expect(result.warning).toBeUndefined();
  });

  it("stereo: uses abs(left)+abs(right)+inter-channel-discontinuity, not one channel alone", () => {
    const left = linearCrossing(100);
    const right = linearCrossing(105);
    const result = findZeroCrossing(102, [left, right], SR);
    // combined score plateaus across [100,105]; the scan picks the first
    // (lowest-frame) point on that plateau, matching neither channel's own
    // individual crossing alone.
    expect(result.frame).toBe(100);
    expect(result.warning).toBe("ZERO_CROSSING_LOW_CONFIDENCE");
  });

  it("reports ZERO_CROSSING_NOT_FOUND when there is no usable channel data", () => {
    const result = findZeroCrossing(100, [], SR);
    expect(result.warning).toBe("ZERO_CROSSING_NOT_FOUND");
    expect(result.frame).toBe(100);
  });

  it("reports ZERO_CROSSING_NOT_FOUND when the raw frame is outside the source", () => {
    const result = findZeroCrossing(-10, [linearCrossing(100)], SR);
    expect(result.warning).toBe("ZERO_CROSSING_NOT_FOUND");
  });

  it("reports ZERO_CROSSING_FAR_FROM_BOUNDARY when the nearest crossing is outside the recommended window", () => {
    const result = findZeroCrossing(100, [linearCrossing(900)], SR, 20);
    expect(result.frame).toBe(900);
    expect(result.warning).toBe("ZERO_CROSSING_FAR_FROM_BOUNDARY");
  });

  it("respects an explicit, testable search window rather than scanning the whole source", () => {
    const result = findZeroCrossing(100, [linearCrossing(900)], SR, 5);
    // window (~5ms == ~220 frames) never reaches frame 900, so the best
    // frame found is whatever minimizes |value| inside [80,120] — not 900.
    expect(result.frame).not.toBe(900);
  });
});
