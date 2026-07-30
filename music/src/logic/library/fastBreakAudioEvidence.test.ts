import { describe, it, expect } from "vitest";
import { scoreFastBreakAudioEvidence, FAST_BREAK_AUDIO_EVIDENCE_VERSION } from "./fastBreakAudioEvidence";
import type { Track, TrackAudioAnalysis } from "../../data/trackTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

function audioAnalysis(overrides: Partial<TrackAudioAnalysis>): TrackAudioAnalysis {
  return { onsetDensity: 0.1, zeroCrossingRate: 0.1, ...overrides } as TrackAudioAnalysis;
}

describe("scoreFastBreakAudioEvidence — insufficient data", () => {
  it("is insufficient when audioAnalysis is entirely absent", () => {
    const r = scoreFastBreakAudioEvidence(track({ trackId: "t1" }));
    expect(r.likelihood).toBe("insufficient");
    expect(r.confidence).toBe(0);
  });
  it("is insufficient when onsetDensity specifically was never computed", () => {
    const r = scoreFastBreakAudioEvidence(track({ trackId: "t1", audioAnalysis: audioAnalysis({ onsetDensity: undefined }) }));
    expect(r.likelihood).toBe("insufficient");
  });
});

describe("scoreFastBreakAudioEvidence — real Catalog data (this library's own genuinely ambient fixtures)", () => {
  it("Concrete Pulse's real onsetDensity/zcr (0.578/0.418) scores low, not high — genuinely ambient audio despite its manually-applied 'Jungle' genre tag", () => {
    const r = scoreFastBreakAudioEvidence(track({
      trackId: "t1",
      audioAnalysis: audioAnalysis({ onsetDensity: 0.5783, zeroCrossingRate: 0.4184, bpmConfidenceDetail: { signalConfidence: 0.855, candidateConfidence: 0.095, metricalConfidence: 0.399, overallConfidence: 0.095 } }),
    }));
    expect(r.likelihood).not.toBe("high");
  });
  it("Canyon Transit s01's real onsetDensity (0.102) scores low", () => {
    const r = scoreFastBreakAudioEvidence(track({ trackId: "t1", audioAnalysis: audioAnalysis({ onsetDensity: 0.1017, zeroCrossingRate: 0.1474 }) }));
    expect(r.likelihood).toBe("low");
  });
});

describe("scoreFastBreakAudioEvidence — synthetic high-density case (no real example exists in this library)", () => {
  it("scores high when onset density and zero-crossing rate both exceed the reused percussive-fragments thresholds", () => {
    const r = scoreFastBreakAudioEvidence(track({
      trackId: "t1",
      audioAnalysis: audioAnalysis({ onsetDensity: 0.9, zeroCrossingRate: 0.8, bpmConfidenceDetail: { signalConfidence: 0.9, candidateConfidence: 0.3, metricalConfidence: 0.3, overallConfidence: 0.3 } }),
    }));
    expect(r.likelihood).toBe("high");
    expect(r.confidence).toBeGreaterThanOrEqual(0.65);
  });
  it("scores medium for high onset density alone, when the zero-crossing rate is too low to also trigger the percussive-fragments corroboration", () => {
    const r = scoreFastBreakAudioEvidence(track({ trackId: "t1", audioAnalysis: audioAnalysis({ onsetDensity: 0.8, zeroCrossingRate: 0.2 }) }));
    expect(r.likelihood).toBe("medium");
  });
  it("moderate-tier onset density alone (below the high threshold) scores low overall — it takes either high density or a corroborating signal to clear the medium likelihood bar", () => {
    const r = scoreFastBreakAudioEvidence(track({ trackId: "t1", audioAnalysis: audioAnalysis({ onsetDensity: 0.5, zeroCrossingRate: 0.2 }) }));
    expect(r.likelihood).toBe("low");
  });
});

describe("scoreFastBreakAudioEvidence — tempoFamily arithmetic (matches spec's own worked examples)", () => {
  it("90 BPM (≤150) → half 90 / full 180", () => {
    const r = scoreFastBreakAudioEvidence(track({ trackId: "t1", bpm: 90, bpmSource: "detected", audioAnalysis: audioAnalysis({}) }));
    expect(r.tempoFamily).toEqual({ halfTime: 90, fullTime: 180 });
  });
  it("172 BPM (>150) → half 86 / full 172", () => {
    const r = scoreFastBreakAudioEvidence(track({ trackId: "t1", bpm: 172, bpmSource: "detected", audioAnalysis: audioAnalysis({}) }));
    expect(r.tempoFamily).toEqual({ halfTime: 86, fullTime: 172 });
  });
  it("is {null, null} when no BPM (canonical or candidate) exists at all", () => {
    const r = scoreFastBreakAudioEvidence(track({ trackId: "t1" }));
    expect(r.tempoFamily).toEqual({ halfTime: null, fullTime: null });
  });
});

describe("scoreFastBreakAudioEvidence — version tag", () => {
  it("stamps analysisRevision with the current scorer version", () => {
    const r = scoreFastBreakAudioEvidence(track({ trackId: "t1" }));
    expect(r.analysisRevision).toBe(FAST_BREAK_AUDIO_EVIDENCE_VERSION);
  });
});
