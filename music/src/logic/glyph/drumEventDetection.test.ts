import { describe, it, expect } from "vitest";
import { detectDrumEvents, selectDrumAudioSource } from "./drumEventDetection";

const SAMPLE_RATE = 44100;
const ANALYZED_AT = "2026-08-04T00:00:00Z";

// Synthesize a mono buffer with sharp clicks (broadband transients) at
// known times, silence elsewhere — a deterministic, dependency-free
// stand-in for real drum hits.
function synthesizeClicks(durationSeconds: number, clickTimes: number[], amplitude = 0.9): Float32Array {
  const samples = new Float32Array(Math.round(durationSeconds * SAMPLE_RATE));
  for (const t of clickTimes) {
    const start = Math.round(t * SAMPLE_RATE);
    for (let i = 0; i < 40 && start + i < samples.length; i++) {
      // A short decaying burst, alternating sign (broadband-ish), not a pure tone.
      samples[start + i] = amplitude * (i % 2 === 0 ? 1 : -1) * Math.exp(-i / 10);
    }
  }
  return samples;
}

describe("detectDrumEvents — deterministic extraction", () => {
  it("finds events near each synthesized click", () => {
    const clickTimes = [0.5, 1.0, 1.5, 2.0];
    const mono = synthesizeClicks(2.5, clickTimes);
    const result = detectDrumEvents({
      audio: { mono, sampleRate: SAMPLE_RATE }, source: "fullMix", sourceTrackId: "t1", analyzedAt: ANALYZED_AT,
    });
    expect(result.events.length).toBeGreaterThan(0);
    for (const click of clickTimes) {
      expect(result.events.some((e) => Math.abs(e.timeSeconds - click) < 0.05)).toBe(true);
    }
  });

  it("is fully deterministic for identical input", () => {
    const mono = synthesizeClicks(2, [0.3, 0.9, 1.4]);
    const input = { audio: { mono, sampleRate: SAMPLE_RATE }, source: "fullMix" as const, sourceTrackId: "t1", analyzedAt: ANALYZED_AT };
    expect(detectDrumEvents(input)).toEqual(detectDrumEvents(input));
  });
});

describe("detectDrumEvents — minimum spacing", () => {
  it("does not report two events closer together than minIntervalSeconds", () => {
    // Two clicks 30ms apart — closer than a 80ms default minimum.
    const mono = synthesizeClicks(1, [0.5, 0.53]);
    const result = detectDrumEvents({
      audio: { mono, sampleRate: SAMPLE_RATE }, source: "fullMix", sourceTrackId: "t1",
      minIntervalSeconds: 0.08, analyzedAt: ANALYZED_AT,
    });
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].timeSeconds - result.events[i - 1].timeSeconds).toBeGreaterThanOrEqual(0.079);
    }
  });
});

describe("detectDrumEvents — strength normalization", () => {
  it("normalizes every event's strength into [0,1] with at least one at or near 1", () => {
    const mono = synthesizeClicks(2, [0.2, 0.8, 1.4], 0.9);
    const result = detectDrumEvents({ audio: { mono, sampleRate: SAMPLE_RATE }, source: "fullMix", sourceTrackId: "t1", analyzedAt: ANALYZED_AT });
    expect(result.events.every((e) => e.strength >= 0 && e.strength <= 1)).toBe(true);
    if (result.events.length > 0) {
      expect(Math.max(...result.events.map((e) => e.strength))).toBeCloseTo(1, 5);
    }
  });
});

describe("detectDrumEvents — source metadata", () => {
  it("stamps every event and the result with the supplied source and track id", () => {
    const mono = synthesizeClicks(1, [0.5]);
    const result = detectDrumEvents({ audio: { mono, sampleRate: SAMPLE_RATE }, source: "drumStem", sourceTrackId: "trackA", sourceStemId: "stem1", analyzedAt: ANALYZED_AT });
    expect(result.source).toBe("drumStem");
    expect(result.sourceTrackId).toBe("trackA");
    expect(result.sourceStemId).toBe("stem1");
    expect(result.events.every((e) => e.sourceTrackId === "trackA" && e.source === "drumStem")).toBe(true);
  });
});

describe("detectDrumEvents — zero-event warning", () => {
  it("warns onsetDetectionZeroEvents for pure silence", () => {
    const mono = new Float32Array(SAMPLE_RATE * 2); // all zeros
    const result = detectDrumEvents({ audio: { mono, sampleRate: SAMPLE_RATE }, source: "fullMix", sourceTrackId: "t1", analyzedAt: ANALYZED_AT });
    expect(result.eventCount).toBe(0);
    expect(result.warnings).toContain("onsetDetectionZeroEvents");
  });

  it("warns onsetDetectionZeroEvents for empty audio", () => {
    const result = detectDrumEvents({ audio: { mono: new Float32Array(0), sampleRate: SAMPLE_RATE }, source: "fullMix", sourceTrackId: "t1", analyzedAt: ANALYZED_AT });
    expect(result.warnings).toContain("onsetDetectionZeroEvents");
  });
});

describe("detectDrumEvents — full-mix fallback warning", () => {
  it("flags fullMixFallbackActive whenever source is fullMix", () => {
    const mono = synthesizeClicks(1, [0.5]);
    const result = detectDrumEvents({ audio: { mono, sampleRate: SAMPLE_RATE }, source: "fullMix", sourceTrackId: "t1", analyzedAt: ANALYZED_AT });
    expect(result.warnings).toContain("fullMixFallbackActive");
  });

  it("does not flag fullMixFallbackActive for a drum-stem source", () => {
    const mono = synthesizeClicks(1, [0.5]);
    const result = detectDrumEvents({ audio: { mono, sampleRate: SAMPLE_RATE }, source: "drumStem", sourceTrackId: "t1", analyzedAt: ANALYZED_AT });
    expect(result.warnings).not.toContain("fullMixFallbackActive");
  });
});

describe("selectDrumAudioSource", () => {
  const fullMix = { mono: new Float32Array(4), sampleRate: SAMPLE_RATE };
  const stem = { mono: new Float32Array(4).fill(1), sampleRate: SAMPLE_RATE };

  it("prefers an existing drum stem when a decoder is supplied", async () => {
    const result = await selectDrumAudioSource({
      hasDrumStem: true,
      decodeDrumStemAudio: async () => stem,
      decodeFullMixAudio: async () => fullMix,
    });
    expect(result.source).toBe("drumStem");
    expect(result.audio).toBe(stem);
  });

  it("falls back to full-mix when no drum stem exists", async () => {
    const result = await selectDrumAudioSource({
      hasDrumStem: false,
      decodeFullMixAudio: async () => fullMix,
    });
    expect(result.source).toBe("fullMix");
  });

  it("falls back to full-mix when a stem exists but no decoder is supplied (this build's Foundation-scope gap)", async () => {
    const result = await selectDrumAudioSource({
      hasDrumStem: true,
      decodeFullMixAudio: async () => fullMix,
    });
    expect(result.source).toBe("fullMix");
  });

  it("prefers a separated stem over full-mix when no existing stem is available", async () => {
    const result = await selectDrumAudioSource({
      hasDrumStem: false,
      hasSeparatedDrumStem: true,
      decodeSeparatedDrumStemAudio: async () => stem,
      decodeFullMixAudio: async () => fullMix,
    });
    expect(result.source).toBe("separatedDrumStem");
  });
});
