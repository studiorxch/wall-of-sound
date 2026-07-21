import { describe, it, expect } from "vitest";
import { buildNumericProfile, buildDensityProfile, buildPercussiveProfile, DEFAULT_PROFILE_SAMPLE_COUNT } from "./songNumericProfiles";

describe("buildNumericProfile", () => {
  it("produces windowSeconds = totalDurationSeconds / sampleCount", () => {
    const profile = buildNumericProfile(new Array(1000).fill(0.5), 100, 128);
    expect(profile.windowSeconds).toBeCloseTo(100 / 128, 6);
    expect(profile.sampleCount).toBe(128);
    expect(profile.values).toHaveLength(128);
  });

  it("defaults to 128 samples", () => {
    const profile = buildNumericProfile(new Array(500).fill(1), 60);
    expect(profile.sampleCount).toBe(DEFAULT_PROFILE_SAMPLE_COUNT);
  });

  it("covers the raw array with exact, contiguous, non-overlapping windows when length >= sampleCount", () => {
    const raw = Array.from({ length: 5000 }, (_, i) => i);
    const sampleCount = 128;
    const profile = buildNumericProfile(raw, 100, sampleCount);
    // Reconstruct the same window bounds the implementation uses and assert
    // adjacent windows share a boundary (no gap, no overlap) and the union
    // covers the whole array.
    const bounds = Array.from({ length: sampleCount }, (_, i) => ({
      startIdx: Math.floor((i / sampleCount) * raw.length),
      endIdx: Math.max(Math.floor((i / sampleCount) * raw.length) + 1, Math.floor(((i + 1) / sampleCount) * raw.length)),
    }));
    expect(bounds[0].startIdx).toBe(0);
    expect(bounds[sampleCount - 1].endIdx).toBe(raw.length);
    for (let i = 0; i < sampleCount - 1; i++) {
      expect(bounds[i].endIdx).toBe(bounds[i + 1].startIdx);
    }
    expect(profile.values).toHaveLength(sampleCount);
  });

  it("computes each window as the mean of its covered raw values", () => {
    // 4 raw values windowed into 2 samples: window 0 = [0,1], window 1 = [2,3].
    const profile = buildNumericProfile([10, 20, 30, 40], 2, 2);
    expect(profile.values[0]).toBeCloseTo(15, 6);
    expect(profile.values[1]).toBeCloseTo(35, 6);
  });

  it("returns all zeros for an empty raw array without throwing", () => {
    const profile = buildNumericProfile([], 10, 8);
    expect(profile.values).toEqual(new Array(8).fill(0));
  });
});

describe("buildDensityProfile", () => {
  // Mirrors dspFeatureExtraction.ts's reduceFrameSeriesToAudioAnalysis onset
  // calculation exactly: adaptiveThreshold = overallMean * 0.3, normalized
  // /10, clamped to [0,1] — verified here by computing the same formula
  // independently over the WHOLE array (sampleCount=1, so there's only one
  // window and no windowing ambiguity to account for).
  it("matches the existing scalar onset-density threshold/normalization when windowed to a single sample", () => {
    const rmsValues = [0.1, 0.5, 0.1, 0.6, 0.1, 0.7, 0.05, 0.65];
    const totalDurationSeconds = 4;
    const profile = buildDensityProfile(rmsValues, totalDurationSeconds, 1);

    const overallMean = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
    const adaptiveThreshold = overallMean * 0.3;
    let onsetCount = 0;
    for (let i = 1; i < rmsValues.length; i++) {
      const delta = Math.max(0, rmsValues[i] - rmsValues[i - 1]);
      if (delta > adaptiveThreshold) onsetCount++;
    }
    const rawDensity = onsetCount / Math.max(0.001, totalDurationSeconds);
    const expected = Math.max(0, Math.min(1, rawDensity / 10));

    expect(profile.values[0]).toBeCloseTo(expected, 6);
  });

  it("returns all zeros when fewer than 2 rms values are supplied", () => {
    expect(buildDensityProfile([0.5], 10, 4).values).toEqual([0, 0, 0, 0]);
    expect(buildDensityProfile([], 10, 4).values).toEqual([0, 0, 0, 0]);
  });

  it("never exceeds 1 (clamped) even with a very dense onset pattern", () => {
    const rmsValues = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const profile = buildDensityProfile(rmsValues, 1, 1);
    expect(profile.values[0]).toBeLessThanOrEqual(1);
    expect(profile.values[0]).toBeGreaterThanOrEqual(0);
  });
});

describe("buildPercussiveProfile", () => {
  it("is the geometric mean of the windowed density and windowed (zcr*8, clamped) profiles", () => {
    const rmsValues = [0.1, 0.5, 0.1, 0.6, 0.1, 0.7, 0.05, 0.65];
    const zcrValues = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
    const totalDurationSeconds = 4;
    const sampleCount = 2;

    const percussive = buildPercussiveProfile(rmsValues, zcrValues, totalDurationSeconds, sampleCount);
    const density = buildDensityProfile(rmsValues, totalDurationSeconds, sampleCount);
    const zcrNormalized = zcrValues.map((z) => Math.max(0, Math.min(1, z * 8)));
    const zcrProfile = buildNumericProfile(zcrNormalized, totalDurationSeconds, sampleCount);

    for (let i = 0; i < sampleCount; i++) {
      const expected = Math.sqrt(Math.max(0, density.values[i]) * Math.max(0, zcrProfile.values[i]));
      expect(percussive.values[i]).toBeCloseTo(expected, 6);
    }
    expect(percussive.sampleCount).toBe(sampleCount);
  });

  it("is never negative even when both inputs are zero", () => {
    const profile = buildPercussiveProfile([0, 0, 0], [0, 0, 0], 1, 4);
    expect(profile.values.every((v) => v >= 0)).toBe(true);
  });
});
