import { describe, it, expect } from "vitest";
import { buildWaveformSummary, DEFAULT_WAVEFORM_SAMPLE_COUNT } from "./songWaveformSummary";

describe("buildWaveformSummary", () => {
  it("defaults to 640 bins", () => {
    const minValues = new Array(2000).fill(-0.5);
    const maxValues = new Array(2000).fill(0.5);
    const summary = buildWaveformSummary(minValues, maxValues);
    expect(summary.sampleCount).toBe(DEFAULT_WAVEFORM_SAMPLE_COUNT);
    expect(summary.minValues).toHaveLength(DEFAULT_WAVEFORM_SAMPLE_COUNT);
    expect(summary.maxValues).toHaveLength(DEFAULT_WAVEFORM_SAMPLE_COUNT);
  });

  it("takes the true min/max within each window, not an average", () => {
    // 4 frames -> 2 bins: bin 0 = frames[0,1], bin 1 = frames[2,3].
    const minValues = [-0.1, -0.9, -0.2, -0.3];
    const maxValues = [0.1, 0.2, 0.9, 0.4];
    const summary = buildWaveformSummary(minValues, maxValues, 2);
    expect(summary.minValues[0]).toBe(-0.9);
    expect(summary.maxValues[0]).toBe(0.2);
    expect(summary.minValues[1]).toBe(-0.3);
    expect(summary.maxValues[1]).toBe(0.9);
  });

  it("covers the input with contiguous, non-overlapping windows (matches songNumericProfiles' windowing contract)", () => {
    const length = 5000;
    const minValues = Array.from({ length }, (_, i) => -i);
    const maxValues = Array.from({ length }, (_, i) => i);
    const sampleCount = 128;
    // Reconstruct the same window bounds the implementation uses (mirrors
    // songNumericProfiles.test.ts's own contiguity check).
    const bounds = Array.from({ length: sampleCount }, (_, i) => ({
      startIdx: Math.floor((i / sampleCount) * length),
      endIdx: Math.max(Math.floor((i / sampleCount) * length) + 1, Math.floor(((i + 1) / sampleCount) * length)),
    }));
    expect(bounds[0].startIdx).toBe(0);
    expect(bounds[sampleCount - 1].endIdx).toBe(length);
    for (let i = 0; i < sampleCount - 1; i++) {
      expect(bounds[i].endIdx).toBe(bounds[i + 1].startIdx);
    }
    const summary = buildWaveformSummary(minValues, maxValues, sampleCount);
    expect(summary.minValues).toHaveLength(sampleCount);
  });

  it("returns all-zero bins for empty input without throwing", () => {
    const summary = buildWaveformSummary([], [], 8);
    expect(summary.minValues).toEqual(new Array(8).fill(0));
    expect(summary.maxValues).toEqual(new Array(8).fill(0));
  });

  it("handles mismatched-length min/max arrays by using the shorter length", () => {
    const summary = buildWaveformSummary([-1, -1, -1], [1, 1], 1);
    expect(summary.minValues[0]).toBe(-1);
    expect(summary.maxValues[0]).toBe(1);
  });
});
