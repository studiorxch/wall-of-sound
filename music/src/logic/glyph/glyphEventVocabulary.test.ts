import { describe, it, expect } from "vitest";
import { computeEventFeatures, classifyEvent, buildAudibleEvents, EVENT_VOCABULARY_ANALYZER_VERSION } from "./glyphEventVocabulary";
import type { DrumEvent, MonoAudioInput } from "../../data/glyphDrumLayerTypes";

const SAMPLE_RATE = 44100;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Broadband noise burst with a fast decay — the textbook clap/snare
// signature (mid/high-dominant, spectrally flat, sharp attack, fast decay).
function synthesizeClapLike(durationSeconds: number, onsetSeconds: number): Float32Array {
  const n = Math.round(durationSeconds * SAMPLE_RATE);
  const mono = new Float32Array(n);
  const rand = mulberry32(42);
  const onsetSample = Math.round(onsetSeconds * SAMPLE_RATE);
  const decaySamples = Math.round(0.08 * SAMPLE_RATE);
  for (let i = 0; i < decaySamples && onsetSample + i < n; i++) {
    const env = Math.exp(-i / (decaySamples / 5));
    mono[onsetSample + i] = (rand() * 2 - 1) * env;
  }
  return mono;
}

// Low-frequency tonal burst with a slow decay — a kick-like signature
// (low-dominant, tonal/not-flat, slower decay).
function synthesizeKickLike(durationSeconds: number, onsetSeconds: number): Float32Array {
  const n = Math.round(durationSeconds * SAMPLE_RATE);
  const mono = new Float32Array(n);
  const onsetSample = Math.round(onsetSeconds * SAMPLE_RATE);
  const decaySamples = Math.round(0.25 * SAMPLE_RATE);
  const freq = 60;
  for (let i = 0; i < decaySamples && onsetSample + i < n; i++) {
    const env = Math.exp(-i / (decaySamples / 3));
    mono[onsetSample + i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * env;
  }
  return mono;
}

describe("computeEventFeatures", () => {
  it("returns empty features for an out-of-range timestamp", () => {
    const mono = new Float32Array(1000);
    expect(computeEventFeatures(mono, SAMPLE_RATE, 999)).toEqual({});
  });

  it("returns populated features for a real onset", () => {
    const mono = synthesizeClapLike(1, 0.3);
    const features = computeEventFeatures(mono, SAMPLE_RATE, 0.3);
    expect(features.lowBandEnergy).toBeGreaterThanOrEqual(0);
    expect(features.spectralFlatness).toBeGreaterThan(0);
    expect(features.decaySeconds).toBeGreaterThan(0);
  });

  it("is deterministic for identical input", () => {
    const mono = synthesizeClapLike(1, 0.3);
    expect(computeEventFeatures(mono, SAMPLE_RATE, 0.3)).toEqual(computeEventFeatures(mono, SAMPLE_RATE, 0.3));
  });
});

describe("classifyEvent — clap-like classification", () => {
  it("classifies a broadband, sharp-attack, fast-decay onset as clap-like", () => {
    const mono = synthesizeClapLike(1, 0.3);
    const features = computeEventFeatures(mono, SAMPLE_RATE, 0.3);
    const result = classifyEvent(features, 0.6);
    expect(result.family).toBe("clap");
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
  });
});

describe("classifyEvent — drum fallback", () => {
  it("classifies a low-band-dominant, tonal, slow-decay onset as drum, not clap", () => {
    const mono = synthesizeKickLike(1, 0.3);
    const features = computeEventFeatures(mono, SAMPLE_RATE, 0.3);
    const result = classifyEvent(features, 0.6);
    expect(result.family).not.toBe("clap");
  });
});

describe("classifyEvent — accent classification", () => {
  it("classifies a high-strength clap-like onset as accent, not plain clap", () => {
    const mono = synthesizeClapLike(1, 0.3);
    const features = computeEventFeatures(mono, SAMPLE_RATE, 0.3);
    const result = classifyEvent(features, 0.95);
    expect(result.family).toBe("accent");
  });

  it("classifies a high-strength non-clap onset as accent via the strength fallback path", () => {
    const mono = synthesizeKickLike(1, 0.3);
    const features = computeEventFeatures(mono, SAMPLE_RATE, 0.3);
    const result = classifyEvent(features, 0.95);
    expect(result.family).toBe("accent");
  });
});

describe("classifyEvent — light transient", () => {
  it("classifies a low-strength, non-clap onset as lightTransient", () => {
    const mono = synthesizeKickLike(1, 0.3);
    const features = computeEventFeatures(mono, SAMPLE_RATE, 0.3);
    const result = classifyEvent(features, 0.1);
    expect(result.family).toBe("lightTransient");
  });
});

describe("classifyEvent — low-confidence / missing-feature fallback", () => {
  it("never forces a clap/accent classification when features are missing", () => {
    const result = classifyEvent({}, 0.6);
    expect(result.family).not.toBe("clap");
    expect(result.family).not.toBe("accent");
  });

  it("returns unknown for a non-finite strength value", () => {
    const result = classifyEvent({}, NaN);
    expect(result.family).toBe("unknown");
  });
});

describe("classifyEvent — determinism", () => {
  it("produces identical output for identical input", () => {
    const features = { lowBandEnergy: 0.1, midBandEnergy: 0.4, highBandEnergy: 0.5, transientSharpness: 0.8, spectralFlatness: 0.5, decaySeconds: 0.05 };
    expect(classifyEvent(features, 0.6)).toEqual(classifyEvent(features, 0.6));
  });
});

describe("buildAudibleEvents", () => {
  function drumEvent(overrides: Partial<DrumEvent> = {}): DrumEvent {
    return {
      id: "d0", timeSeconds: 0.3, strength: 0.6, confidence: 0.8,
      source: "fullMix", sourceTrackId: "t1", classification: "unknown",
      ...overrides,
    };
  }

  it("produces one GlyphAudibleEvent per DrumEvent, each traceable via sourceDrumEventId", () => {
    const mono = synthesizeClapLike(1, 0.3);
    const audio: MonoAudioInput = { mono, sampleRate: SAMPLE_RATE };
    const result = buildAudibleEvents([drumEvent()], audio, "t1", "2026-01-01T00:00:00.000Z");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].sourceDrumEventId).toBe("d0");
    expect(result.analyzerVersion).toBe(EVENT_VOCABULARY_ANALYZER_VERSION);
  });

  it("never drops an event — one GlyphAudibleEvent per DrumEvent even for a large set", () => {
    const mono = synthesizeClapLike(5, 0.1);
    const audio: MonoAudioInput = { mono, sampleRate: SAMPLE_RATE };
    const events = Array.from({ length: 20 }, (_, i) => drumEvent({ id: `d${i}`, timeSeconds: 0.1 + i * 0.2 }));
    const result = buildAudibleEvents(events, audio, "t1", "2026-01-01T00:00:00.000Z");
    expect(result.events).toHaveLength(20);
  });

  it("warns acceptedCountZero for an empty drum-event list", () => {
    const audio: MonoAudioInput = { mono: new Float32Array(1000), sampleRate: SAMPLE_RATE };
    const result = buildAudibleEvents([], audio, "t1", "2026-01-01T00:00:00.000Z");
    expect(result.warnings).toContain("acceptedCountZero");
  });

  it("warns sourceUnavailable for empty audio", () => {
    const audio: MonoAudioInput = { mono: new Float32Array(0), sampleRate: 0 };
    const result = buildAudibleEvents([drumEvent()], audio, "t1", "2026-01-01T00:00:00.000Z");
    expect(result.warnings).toContain("sourceUnavailable");
  });

  it("never writes a definitive label back into the original DrumEvent objects (provenance stays separate)", () => {
    const mono = synthesizeClapLike(1, 0.3);
    const audio: MonoAudioInput = { mono, sampleRate: SAMPLE_RATE };
    const events = [drumEvent()];
    buildAudibleEvents(events, audio, "t1", "2026-01-01T00:00:00.000Z");
    expect(events[0].classification).toBe("unknown");
  });
});
