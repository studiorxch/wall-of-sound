import { describe, it, expect } from "vitest";
import { detectLaserActivity, LASER_ANALYZER_VERSION } from "./laserLayerAnalysis";
import type { MonoAudioInput } from "../../data/glyphDrumLayerTypes";

const SAMPLE_RATE = 44100;

function synthesizeTone(durationSeconds: number, freqHz: number, amplitudeModHz = 0): Float32Array {
  const n = Math.round(durationSeconds * SAMPLE_RATE);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const carrier = Math.sin(2 * Math.PI * freqHz * t);
    const amp = amplitudeModHz > 0 ? 0.5 + 0.5 * Math.sin(2 * Math.PI * amplitudeModHz * t) : 1;
    mono[i] = carrier * amp * 0.8;
  }
  return mono;
}

function synthesizeSweep(durationSeconds: number, startHz: number, endHz: number): Float32Array {
  const n = Math.round(durationSeconds * SAMPLE_RATE);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const freq = startHz + (endHz - startHz) * (t / durationSeconds);
    mono[i] = Math.sin(2 * Math.PI * freq * t) * 0.8;
  }
  return mono;
}

describe("detectLaserActivity — full-duration coverage", () => {
  it("analyzes frames across the full track duration for an active track", () => {
    const mono = synthesizeTone(3, 6000);
    const audio: MonoAudioInput = { mono, sampleRate: SAMPLE_RATE };
    const result = detectLaserActivity({ audio, source: "otherStem", sourceTrackId: "t1", analyzedAt: "2026-01-01T00:00:00.000Z" });
    expect(result.coveragePercent).toBeGreaterThan(95);
    expect(result.coverageEndSeconds).toBeGreaterThan(2.8);
    expect(result.analyzerVersion).toBe(LASER_ANALYZER_VERSION);
  });

  it("still covers the full duration for a silent (near-zero activity) track", () => {
    const mono = new Float32Array(Math.round(3 * SAMPLE_RATE));
    const audio: MonoAudioInput = { mono, sampleRate: SAMPLE_RATE };
    const result = detectLaserActivity({ audio, source: "fullMix", sourceTrackId: "t1", analyzedAt: "2026-01-01T00:00:00.000Z" });
    expect(result.coveragePercent).toBeGreaterThan(95);
    expect(result.warnings).toContain("noVisibleActivity");
  });
});

describe("detectLaserActivity — modulation amount", () => {
  it("reports higher modulationAmount for an amplitude-modulated tone than a steady tone", () => {
    const steady = synthesizeTone(3, 6000);
    const modulated = synthesizeTone(3, 6000, 2);
    const steadyResult = detectLaserActivity({ audio: { mono: steady, sampleRate: SAMPLE_RATE }, source: "otherStem", sourceTrackId: "t1", analyzedAt: "x" });
    const modResult = detectLaserActivity({ audio: { mono: modulated, sampleRate: SAMPLE_RATE }, source: "otherStem", sourceTrackId: "t1", analyzedAt: "x" });
    const avgMod = (frames: typeof steadyResult.frames) => frames.reduce((s, f) => s + f.modulationAmount, 0) / Math.max(1, frames.length);
    expect(avgMod(modResult.frames)).toBeGreaterThan(avgMod(steadyResult.frames));
  });
});

describe("detectLaserActivity — sweep direction", () => {
  it("reports a rising sweepDirection somewhere in an ascending frequency sweep", () => {
    const mono = synthesizeSweep(3, 500, 8000);
    const result = detectLaserActivity({ audio: { mono, sampleRate: SAMPLE_RATE }, source: "otherStem", sourceTrackId: "t1", analyzedAt: "x" });
    expect(result.frames.some((f) => f.sweepDirection === 1)).toBe(true);
  });

  it("reports a falling sweepDirection somewhere in a descending frequency sweep", () => {
    const mono = synthesizeSweep(3, 8000, 500);
    const result = detectLaserActivity({ audio: { mono, sampleRate: SAMPLE_RATE }, source: "otherStem", sourceTrackId: "t1", analyzedAt: "x" });
    expect(result.frames.some((f) => f.sweepDirection === -1)).toBe(true);
  });
});

describe("detectLaserActivity — determinism", () => {
  it("produces identical output for identical input", () => {
    const mono = synthesizeTone(2, 5000, 1.5);
    const audio: MonoAudioInput = { mono, sampleRate: SAMPLE_RATE };
    const a = detectLaserActivity({ audio, source: "otherStem", sourceTrackId: "t1", analyzedAt: "x" });
    const b = detectLaserActivity({ audio, source: "otherStem", sourceTrackId: "t1", analyzedAt: "x" });
    expect(a).toEqual(b);
  });
});

describe("detectLaserActivity — source warnings", () => {
  it("warns fullMixFallbackActive when source is fullMix", () => {
    const mono = synthesizeTone(1, 5000);
    const result = detectLaserActivity({ audio: { mono, sampleRate: SAMPLE_RATE }, source: "fullMix", sourceTrackId: "t1", analyzedAt: "x" });
    expect(result.warnings).toContain("fullMixFallbackActive");
  });

  it("does not warn fullMixFallbackActive when a real stem source is used", () => {
    const mono = synthesizeTone(1, 5000);
    const result = detectLaserActivity({ audio: { mono, sampleRate: SAMPLE_RATE }, source: "otherStem", sourceTrackId: "t1", analyzedAt: "x" });
    expect(result.warnings).not.toContain("fullMixFallbackActive");
  });
});

describe("detectLaserActivity — empty/invalid audio", () => {
  it("returns zero coverage and a warning for empty audio", () => {
    const result = detectLaserActivity({ audio: { mono: new Float32Array(0), sampleRate: 0 }, source: "fullMix", sourceTrackId: "t1", analyzedAt: "x" });
    expect(result.frames).toEqual([]);
    expect(result.warnings).toContain("noVisibleActivity");
  });
});
