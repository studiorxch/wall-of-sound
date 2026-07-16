import { describe, it, expect } from "vitest";
import { computeTrackPlaybackBounds, computeSourceFingerprint, resolveEffectivePreferredBounds } from "./computeTrackPlaybackBounds";
import { isPlaybackBoundsTrusted, isBoundsOrderValid } from "./playbackBoundsTrust";
import { getEffectivePlaybackDuration, buildPlaylistContributionDuration } from "./playbackDuration";
import type { AudioAnalysisInput } from "../../data/audioDetectionTypes";
import type { TrackBeatMap } from "../../data/beatMapTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";

const SAMPLE_RATE = 22050;

// Deterministic synthetic PCM fixtures. `sustainedTone` generates a
// continuous mid-level sine (musical material); silence is literal zeros.
function sustainedTone(durationSeconds: number, amplitude = 0.3, freq = 440): Float32Array {
  const n = Math.floor(durationSeconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return out;
}

function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

function silence(durationSeconds: number): Float32Array {
  return new Float32Array(Math.floor(durationSeconds * SAMPLE_RATE));
}

function roomTone(durationSeconds: number, amplitude = 0.03): Float32Array {
  // Low-level but non-negligible noise-like signal (deterministic, not
  // Math.random) — approximates ambient room tone, not true digital silence.
  const n = Math.floor(durationSeconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin(i * 0.7) * Math.sin(i * 0.013);
  return out;
}

function fadeRamp(durationSeconds: number, from: number, to: number, freq = 440): Float32Array {
  const n = Math.floor(durationSeconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const amp = from + (to - from) * (i / n);
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  }
  return out;
}

function makeInput(mono: Float32Array): AudioAnalysisInput {
  return { sampleRate: SAMPLE_RATE, channels: [mono], mono, durationSeconds: mono.length / SAMPLE_RATE };
}

// ── Data integrity ───────────────────────────────────────────────────────────

describe("data integrity", () => {
  it("ordering invariants hold", () => {
    const mono = concat(silence(1), sustainedTone(20), silence(1));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(isBoundsOrderValid(bounds)).toBe(true);
  });

  it("effective duration is correct", () => {
    const mono = concat(silence(1), sustainedTone(20), silence(1));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(getEffectivePlaybackDuration(bounds)).toBeCloseTo(bounds.preferredEndSeconds - bounds.preferredStartSeconds, 3);
  });

  it("confidence values stay within 0-1", () => {
    const mono = concat(silence(1), sustainedTone(20), silence(1));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(bounds.startConfidence).toBeGreaterThanOrEqual(0);
    expect(bounds.startConfidence).toBeLessThanOrEqual(1);
    expect(bounds.endConfidence).toBeGreaterThanOrEqual(0);
    expect(bounds.endConfidence).toBeLessThanOrEqual(1);
    expect(bounds.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(bounds.overallConfidence).toBeLessThanOrEqual(1);
  });

  it("invalid bounds (constructed out-of-order) are rejected by the trust check", () => {
    const invalid: TrackPlaybackBounds = {
      version: "1.0", sourceDurationSeconds: 20,
      audibleStartSeconds: 5, preferredStartSeconds: 2, // out of order on purpose
      preferredEndSeconds: 18, audibleEndSeconds: 19,
      leadingSilenceSeconds: 0, trailingSilenceSeconds: 0,
      effectiveDurationSeconds: 16,
      startClassification: "musical_intro", endClassification: "musical_outro",
      startConfidence: 0.9, endConfidence: 0.9, overallConfidence: 0.9,
      source: "detected", detectorVersion: "playback-bounds-v1", analyzedAt: "", warnings: [],
    };
    expect(isBoundsOrderValid(invalid)).toBe(false);
    expect(isPlaybackBoundsTrusted(invalid)).toBe(false);
  });
});

// ── Start detection ──────────────────────────────────────────────────────────

describe("start detection", () => {
  it("technical (true digital) silence is skipped", () => {
    const mono = concat(silence(2), sustainedTone(20));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(bounds.audibleStartSeconds).toBeGreaterThan(1);
    expect(["technical_silence", "encoder_delay"]).toContain(bounds.startClassification);
  });

  it("a quiet musical intro (room tone) is preserved, not skipped", () => {
    const mono = concat(roomTone(3), sustainedTone(20));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(bounds.audibleStartSeconds).toBe(0);
    expect(bounds.startClassification).toBe("room_tone");
  });

  it("pickup is not classified as silence when a trusted beat map shows a small downbeat gap", () => {
    const mono = concat(sustainedTone(20));
    const beatMap: TrackBeatMap = {
      version: "1.0", beatTimesSeconds: [0.2, 0.6, 1.0, 1.4, 1.8], firstBeatSeconds: 0.2, firstDownbeatSeconds: 1.0,
      barStartTimesSeconds: [1.0], tempoStable: true, tempoStabilityScore: 0.9, tempoSegments: [],
      confidence: 0.9, source: "detected", detectorVersion: "beat-map-v3", analyzedAt: "", warnings: [],
    };
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3", beatMap);
    // Not asserting trust (synthetic beat map here isn't run through the
    // real trust gate's component checks), just that pickup/count_in
    // classification logic is reachable and doesn't crash or default silently.
    expect(["pickup", "count_in", "musical_intro", "abrupt_start"]).toContain(bounds.startClassification);
  });

  it("a fade-in is preserved (audibleStart stays 0) and classified", () => {
    const mono = concat(fadeRamp(3, 0, 0.4), sustainedTone(20, 0.4));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(bounds.audibleStartSeconds).toBe(0);
    if (bounds.startClassification === "fade") expect(bounds.startConfidence).toBeGreaterThan(0);
  });
});

// ── End detection ────────────────────────────────────────────────────────────

describe("end detection", () => {
  it("trailing technical silence is excluded from the audible end", () => {
    const mono = concat(sustainedTone(20), silence(2));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(bounds.audibleEndSeconds).toBeLessThan(bounds.sourceDurationSeconds - 1);
    expect(bounds.endClassification).toBe("technical_silence");
  });

  it("a musical fade-out is preserved (audibleEnd stays at source duration)", () => {
    const mono = concat(sustainedTone(20, 0.4), fadeRamp(3, 0.4, 0));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(bounds.audibleEndSeconds).toBeCloseTo(bounds.sourceDurationSeconds, 1);
  });

  it("a reverb tail (non-negligible trailing quiet) remains audible", () => {
    const mono = concat(sustainedTone(20), roomTone(3, 0.04));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(bounds.audibleEndSeconds).toBeCloseTo(bounds.sourceDurationSeconds, 1);
    expect(bounds.endClassification).toBe("reverb_tail");
  });

  it("an abrupt (hard) ending is handled without a crash", () => {
    const mono = sustainedTone(20, 0.4);
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(bounds.endClassification).toBe("abrupt_end");
    expect(bounds.audibleEndSeconds).toBeCloseTo(20, 1);
  });
});

// ── Beat-map integration ─────────────────────────────────────────────────────

describe("beat-map integration", () => {
  it("missing beat map remains neutral — bounds still compute", () => {
    const mono = concat(silence(1), sustainedTone(20));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3", undefined);
    expect(bounds).toBeDefined();
    expect(bounds.warnings).toContain("PLAYBACK_BOUNDS_NO_TRUSTED_BEAT_START");
  });

  it("a partial (untrusted) beat map does not force preferred-start snapping", () => {
    const mono = concat(roomTone(3), sustainedTone(20));
    const untrusted: TrackBeatMap = {
      version: "1.0", beatTimesSeconds: [5, 5.5], firstDownbeatSeconds: 5,
      barStartTimesSeconds: [], tempoStable: false, tempoStabilityScore: 0.1, tempoSegments: [],
      confidence: 0.1, source: "detected", detectorVersion: "beat-map-v3", analyzedAt: "", warnings: ["BEAT_MAP_LOW_CONFIDENCE"],
    };
    const withBeatMap = computeTrackPlaybackBounds(makeInput(mono), "track.mp3", untrusted);
    const withoutBeatMap = computeTrackPlaybackBounds(makeInput(mono), "track.mp3", undefined);
    // Untrusted beat map must not change the preferred start decision.
    expect(withBeatMap.preferredStartSeconds).toBeCloseTo(withoutBeatMap.preferredStartSeconds, 2);
  });
});

// ── Source replacement ───────────────────────────────────────────────────────

describe("source replacement", () => {
  it("a changed source marks bounds stale via the fingerprint and PLAYBACK_BOUNDS_SOURCE_CHANGED", () => {
    const mono1 = concat(silence(1), sustainedTone(20));
    const first = computeTrackPlaybackBounds(makeInput(mono1), "track.mp3");
    const mono2 = concat(silence(1), sustainedTone(15)); // different duration = different source
    const second = computeTrackPlaybackBounds(makeInput(mono2), "track.mp3", undefined, first);
    expect(second.warnings).toContain("PLAYBACK_BOUNDS_SOURCE_CHANGED");
  });

  it("duration recalculates after a source replacement", () => {
    const mono1 = concat(silence(1), sustainedTone(20));
    const first = computeTrackPlaybackBounds(makeInput(mono1), "track.mp3");
    const mono2 = concat(silence(1), sustainedTone(10));
    const second = computeTrackPlaybackBounds(makeInput(mono2), "track.mp3", undefined, first);
    expect(second.sourceDurationSeconds).toBeCloseTo(11, 0);
    expect(second.sourceDurationSeconds).not.toBeCloseTo(first.sourceDurationSeconds, 0);
  });

  it("an invalid manual override (now out of range) is dropped, not silently kept", () => {
    const mono1 = concat(silence(1), sustainedTone(20));
    const first = computeTrackPlaybackBounds(makeInput(mono1), "track.mp3");
    const withOverride: TrackPlaybackBounds = { ...first, override: { preferredStartSeconds: 15, preferredEndSeconds: 20, note: "manual" } };
    // Replace with a much shorter source — the override's 15-20s range no longer fits.
    const mono2 = concat(silence(1), sustainedTone(5));
    const second = computeTrackPlaybackBounds(makeInput(mono2), "track.mp3", undefined, withOverride);
    expect(second.override).toBeUndefined();
  });

  it("a still-valid manual override is preserved across a compatible source update", () => {
    const mono1 = concat(silence(1), sustainedTone(20));
    const first = computeTrackPlaybackBounds(makeInput(mono1), "track.mp3");
    const withOverride: TrackPlaybackBounds = { ...first, override: { preferredStartSeconds: 2, preferredEndSeconds: 18, note: "manual" } };
    const mono2 = concat(silence(1), sustainedTone(20)); // same duration, "re-imported" same file
    const second = computeTrackPlaybackBounds(makeInput(mono2), "track.mp3", undefined, withOverride);
    expect(second.override?.preferredStartSeconds).toBe(2);
    expect(resolveEffectivePreferredBounds(second).preferredStartSeconds).toBe(2);
  });
});

// ── Regression ───────────────────────────────────────────────────────────────

describe("regression", () => {
  it("source duration is never overwritten by effective/preferred values", () => {
    const mono = concat(silence(2), sustainedTone(20), silence(2));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    expect(bounds.sourceDurationSeconds).toBeCloseTo(24, 0);
    expect(bounds.effectiveDurationSeconds).toBeLessThan(bounds.sourceDurationSeconds);
  });

  it("playlist contribution duration model keeps overlaps at zero for this build", () => {
    const mono = concat(silence(1), sustainedTone(20));
    const bounds = computeTrackPlaybackBounds(makeInput(mono), "track.mp3");
    const contribution = buildPlaylistContributionDuration(bounds);
    expect(contribution.overlapInSeconds).toBe(0);
    expect(contribution.overlapOutSeconds).toBe(0);
    expect(contribution.contributionSeconds).toBeCloseTo(contribution.effectiveDurationSeconds, 3);
  });

  it("computeSourceFingerprint is deterministic for the same path+duration", () => {
    expect(computeSourceFingerprint("a.mp3", 20)).toBe(computeSourceFingerprint("a.mp3", 20));
    expect(computeSourceFingerprint("a.mp3", 20)).not.toBe(computeSourceFingerprint("a.mp3", 15));
  });
});
