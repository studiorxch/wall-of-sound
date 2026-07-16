import { describe, it, expect } from "vitest";
import {
  computePeaksForFrameRange,
  computePeaksForRange,
  generateWaveformEnvelope,
  WAVEFORM_GENERATOR_VERSION,
} from "./waveformPeaks";
import {
  buildWaveformCacheKey,
  getCachedWaveform,
  setCachedWaveform,
  isWaveformEnvelopeStale,
} from "./waveformCache";

// Minimal AudioBuffer stand-in — real AudioBuffer is not constructible
// outside a browser AudioContext, matching this project's existing
// convention of not unit-testing Web-Audio-dependent code directly (only
// the pure numeric reducers here are exercised).
function fakeBuffer(channels: number[][], sampleRate = 44100): AudioBuffer {
  const length = channels[0]?.length ?? 0;
  return {
    sampleRate,
    length,
    duration: length / sampleRate,
    numberOfChannels: channels.length,
    getChannelData: (ch: number) => Float32Array.from(channels[ch]),
  } as unknown as AudioBuffer;
}

describe("computePeaksForFrameRange", () => {
  it("returns the requested bin count", () => {
    const buf = fakeBuffer([[0, 0.5, -0.5, 1, -1, 0.25, -0.25, 0]]);
    const peaks = computePeaksForFrameRange(buf, 0, buf.length, 4);
    expect(peaks.length).toBe(4);
  });

  it("min/max are always valid (min <= max) and within source range", () => {
    const buf = fakeBuffer([[0, 0.9, -0.9, 0.3, -0.3, 0.6, -0.6, 0.1]]);
    const peaks = computePeaksForFrameRange(buf, 0, buf.length, 4);
    for (const p of peaks) {
      expect(p.min).toBeLessThanOrEqual(p.max);
      expect(p.max).toBeLessThanOrEqual(1);
      expect(p.min).toBeGreaterThanOrEqual(-1);
    }
  });

  it("downmixes stereo channels (averages L/R)", () => {
    const buf = fakeBuffer([
      [1, 1, 1, 1],
      [-1, -1, -1, -1],
    ]);
    const peaks = computePeaksForFrameRange(buf, 0, buf.length, 1);
    expect(peaks[0].min).toBeCloseTo(0);
    expect(peaks[0].max).toBeCloseTo(0);
  });

  it("silence renders as flat zero peaks, not empty/undefined", () => {
    const buf = fakeBuffer([[0, 0, 0, 0, 0, 0, 0, 0]]);
    const peaks = computePeaksForFrameRange(buf, 0, buf.length, 4);
    expect(peaks.every((p) => p.min === 0 && p.max === 0)).toBe(true);
  });

  it("respects an explicit frame sub-range (does not read outside it)", () => {
    const buf = fakeBuffer([[0, 0, 5, 5, 0, 0]]);
    const peaks = computePeaksForFrameRange(buf, 2, 4, 2);
    expect(peaks.every((p) => p.max <= 5 && p.max > 0)).toBe(true);
  });

  it("handles a zero-length range without throwing", () => {
    const buf = fakeBuffer([[0, 0, 0, 0]]);
    const peaks = computePeaksForFrameRange(buf, 2, 2, 4);
    expect(peaks.length).toBe(4);
    expect(peaks.every((p) => p.min === 0 && p.max === 0)).toBe(true);
  });
});

describe("computePeaksForRange (candidate slices)", () => {
  it("derives frame bounds from seconds and stays within the buffer", () => {
    const sr = 8;
    const samples = new Array(80).fill(0).map((_, i) => Math.sin(i));
    const buf = fakeBuffer([samples], sr);
    const peaks = computePeaksForRange(buf, 2, 4, 16); // 2s–4s of a 10s buffer
    expect(peaks.length).toBe(16);
    for (const p of peaks) {
      expect(Number.isFinite(p.min)).toBe(true);
      expect(Number.isFinite(p.max)).toBe(true);
    }
  });

  it("a short candidate window still renders the full requested bin count", () => {
    const sr = 100;
    const samples = new Array(1000).fill(0.2);
    const buf = fakeBuffer([samples], sr);
    const peaks = computePeaksForRange(buf, 1.0, 1.05, 32); // 50ms window
    expect(peaks.length).toBe(32);
  });

  it("does not leak samples from outside its own candidate region", () => {
    const sr = 10;
    // first half silent, second half loud
    const samples = [...new Array(50).fill(0), ...new Array(50).fill(1)];
    const buf = fakeBuffer([samples], sr);
    const silentSlice = computePeaksForRange(buf, 0, 4, 8);
    expect(silentSlice.every((p) => p.max === 0 && p.min === 0)).toBe(true);
  });
});

describe("generateWaveformEnvelope", () => {
  it("produces the requested bin count and carries generator/version metadata", () => {
    const buf = fakeBuffer([[0, 1, -1, 0.5, -0.5, 0, 1, -1]]);
    const env = generateWaveformEnvelope(buf, "track_1", "fp_abc", 8);
    expect(env.peaks.length).toBe(8);
    expect(env.generatorVersion).toBe(WAVEFORM_GENERATOR_VERSION);
    expect(env.sourceId).toBe("track_1");
    expect(env.sourceFingerprint).toBe("fp_abc");
    expect(env.durationSeconds).toBeCloseTo(buf.duration);
  });
});

describe("waveform cache key", () => {
  it("is stable for the same inputs", () => {
    const a = buildWaveformCacheKey("fp1", "1.0.0", 768);
    const b = buildWaveformCacheKey("fp1", "1.0.0", 768);
    expect(a).toBe(b);
  });

  it("differs when fingerprint, version, or bin count differ", () => {
    const base = buildWaveformCacheKey("fp1", "1.0.0", 768);
    expect(buildWaveformCacheKey("fp2", "1.0.0", 768)).not.toBe(base);
    expect(buildWaveformCacheKey("fp1", "1.0.1", 768)).not.toBe(base);
    expect(buildWaveformCacheKey("fp1", "1.0.0", 512)).not.toBe(base);
  });

  it("round-trips through get/set", () => {
    const buf = fakeBuffer([[0, 1, -1, 0]]);
    const env = generateWaveformEnvelope(buf, "t1", "fp9", 4);
    const key = buildWaveformCacheKey("fp9", WAVEFORM_GENERATOR_VERSION, 4);
    setCachedWaveform(key, env);
    expect(getCachedWaveform(key)).toBe(env);
  });
});

describe("isWaveformEnvelopeStale", () => {
  const buf = fakeBuffer([[0, 1, -1, 0]], 100);
  const env = generateWaveformEnvelope(buf, "t1", "fp_current", 4);

  it("is not stale when fingerprint and duration still match", () => {
    expect(isWaveformEnvelopeStale(env, "fp_current", env.durationSeconds)).toBe(false);
  });

  it("is stale when the source fingerprint changes", () => {
    expect(isWaveformEnvelopeStale(env, "fp_new", env.durationSeconds)).toBe(true);
  });

  it("is stale when the source duration changes materially", () => {
    expect(isWaveformEnvelopeStale(env, "fp_current", env.durationSeconds + 5)).toBe(true);
  });
});
