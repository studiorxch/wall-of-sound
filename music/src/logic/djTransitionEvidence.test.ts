import { describe, it, expect } from "vitest";
import type { Track } from "../data/trackTypes";
import type { TrackBeatMap } from "../data/beatMapTypes";
import type { BeatMapConfidenceComponents } from "../data/beatMapCalibrationTypes";
import type { CompleteSongAnalysis, SongSection } from "../data/songAnalysisTypes";
import { assembleDjTransitionTrackEvidence, DJ_TRANSITION_TRUST_POLICY } from "./djTransitionEvidence";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "track-a", title: "Track A", artist: "Artist",
    durationSeconds: 240, energy: 0.5,
    sourceOwner: "studiorich", genres: [], moodTags: [], moodSuggestions: [],
    sourcePoolIds: [], grouping: "", albumArtist: "", archiveStatus: "library",
    ...overrides,
  } as unknown as Track;
}

function makeComponents(overrides: Partial<BeatMapConfidenceComponents> = {}): BeatMapConfidenceComponents {
  return {
    onsetStrength: 0.9, onsetRegularity: 0.9, beatPhaseFit: 0.9, beatCoverage: 0.9, beatContinuity: 0.9,
    downbeatRecurrence: 0.9, barAlignment: 0.9, tempoStability: 0.9, segmentConsistency: 1,
    introRegionConfidence: 0.9, outroRegionConfidence: 0.9, priorAgreement: 1, warningPenalty: 1, total: 0.9,
    ...overrides,
  };
}

function makeBeatMap(overrides: Partial<TrackBeatMap> = {}): TrackBeatMap {
  return {
    version: "1.0",
    beatTimesSeconds: Array.from({ length: 200 }, (_, i) => i * 0.5),
    barStartTimesSeconds: Array.from({ length: 50 }, (_, i) => i * 2),
    firstDownbeatSeconds: 0.5,
    tempoStable: true,
    tempoStabilityScore: 0.95,
    tempoSegments: [],
    confidence: 0.9,
    source: "detected",
    detectorVersion: "beat-map-v3",
    analyzedAt: "2026-01-01T00:00:00Z",
    warnings: [],
    confidenceComponents: makeComponents(),
    ...overrides,
  };
}

function makeSection(overrides: Partial<SongSection> = {}): SongSection {
  return {
    id: "sec-1", sourceTrackId: "track-a", structuralType: "chorus", displayLabel: "Chorus",
    startFrame: 0, endFrame: 1000, confidence: 0.9, verification: "verified", origin: "analyzer",
    ...overrides,
  };
}

function makeSongAnalysis(overrides: Partial<CompleteSongAnalysis> = {}): CompleteSongAnalysis {
  return {
    id: "analysis-1", sourceTrackId: "track-a", sourceMediaFingerprint: "fp-a",
    decodedFrameCount: 44100 * 240, sampleRate: 44100,
    analyzerVersion: "v1", configurationVersion: "v1", status: "READY_VERIFIED",
    sections: [], sectionRevisions: [],
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("assembleDjTransitionTrackEvidence — trust cascade", () => {
  it("trusts beat and bar together once their gates clear, and trusts phrase only once corroborated by a verified section", () => {
    // 50 bars at 2s/bar = boundary candidates every 32 bars (best-fit length
    // for 50) -> boundaries at bar 0 and bar 32 (t=0s and t=64s). Put a
    // verified section right at t=64s so the phrase claim is corroborated.
    const songAnalysis = makeSongAnalysis({
      sampleRate: 1, // 1 sample per second so startFrame doubles as seconds directly
      sections: [makeSection({ startFrame: 64, verification: "verified" })],
    });
    const evidence = assembleDjTransitionTrackEvidence({
      track: makeTrack(),
      beatMap: makeBeatMap(),
      songAnalysis,
      currentStemRoleAvailability: {},
      sourceFingerprint: "fp-a",
    });
    expect(evidence.beatTrusted).toBe(true);
    expect(evidence.barTrusted).toBe(true);
    expect(evidence.beatTimesSeconds.value).not.toBeNull();
    expect(evidence.barStartTimesSeconds.value).not.toBeNull();
    expect(evidence.barStartTimesSeconds.claim).toBe("observed");
    expect(evidence.phraseTrusted).toBe(true);
    expect(evidence.phraseBoundarySeconds.value).not.toBeNull();
    expect(evidence.phraseBoundarySeconds.claim).toBe("inferred");
  });

  it("a bar-count heuristic fit alone, without any verified section corroboration, is not enough to trust a phrase", () => {
    const evidence = assembleDjTransitionTrackEvidence({
      track: makeTrack(),
      beatMap: makeBeatMap(), // 50 bars, no songAnalysis at all -> no corroboration possible
      currentStemRoleAvailability: {},
      sourceFingerprint: "fp-a",
    });
    expect(evidence.barTrusted).toBe(true);
    expect(evidence.phraseTrusted).toBe(false);
    expect(evidence.phraseBoundarySeconds.value).toBeNull();
  });

  it("a populated BPM without a trusted beat grid does not permit bar or phrase claims", () => {
    const evidence = assembleDjTransitionTrackEvidence({
      track: makeTrack({ bpm: 128, audioAnalysis: { bpmConfidence: 0.9 } }),
      beatMap: undefined,
      currentStemRoleAvailability: {},
      sourceFingerprint: "fp-a",
    });
    expect(evidence.bpm.value).toBe(128);
    expect(evidence.beatTrusted).toBe(false);
    expect(evidence.barTrusted).toBe(false);
    expect(evidence.phraseTrusted).toBe(false);
    expect(evidence.beatTimesSeconds.value).toBeNull();
    expect(evidence.barStartTimesSeconds.value).toBeNull();
    expect(evidence.phraseBoundarySeconds.value).toBeNull();
  });

  it("a beat grid without trusted downbeats permits beat alignment only", () => {
    const evidence = assembleDjTransitionTrackEvidence({
      track: makeTrack(),
      beatMap: makeBeatMap({ confidenceComponents: makeComponents({ downbeatRecurrence: 0.3 }) }),
      currentStemRoleAvailability: {},
      sourceFingerprint: "fp-a",
    });
    expect(evidence.beatTrusted).toBe(true);
    expect(evidence.barTrusted).toBe(false);
    expect(evidence.phraseTrusted).toBe(false);
    expect(evidence.beatTimesSeconds.value).not.toBeNull();
    expect(evidence.barStartTimesSeconds.value).toBeNull();
  });

  it("a downbeat grid without phrase evidence permits bar alignment only, even with a section far from any candidate boundary", () => {
    const songAnalysis = makeSongAnalysis({
      sampleRate: 1,
      sections: [makeSection({ startFrame: 5 })], // nowhere near a 32-bar-multiple boundary (0s, 64s...)
    });
    const evidence = assembleDjTransitionTrackEvidence({
      track: makeTrack(),
      beatMap: makeBeatMap(),
      songAnalysis,
      currentStemRoleAvailability: {},
      sourceFingerprint: "fp-a",
    });
    expect(evidence.barTrusted).toBe(true);
    expect(evidence.phraseTrusted).toBe(false);
    expect(evidence.phraseBoundarySeconds.value).toBeNull();
  });

  it("ignores provisional sections as corroboration — only verified/reviewed sections count", () => {
    const songAnalysis = makeSongAnalysis({
      sampleRate: 1,
      sections: [makeSection({ startFrame: 64, verification: "provisional" })],
    });
    const evidence = assembleDjTransitionTrackEvidence({
      track: makeTrack(),
      beatMap: makeBeatMap(),
      songAnalysis,
      currentStemRoleAvailability: {},
      sourceFingerprint: "fp-a",
    });
    expect(evidence.phraseTrusted).toBe(false);
  });

  it("missing data stays missing rather than being fabricated", () => {
    const evidence = assembleDjTransitionTrackEvidence({
      track: makeTrack({ bpm: undefined, musicalKey: undefined, audioAnalysis: undefined }),
      beatMap: undefined,
      playbackBounds: undefined,
      songAnalysis: undefined,
      currentStemRoleAvailability: {},
      sourceFingerprint: "",
    });
    expect(evidence.bpm.value).toBeNull();
    expect(evidence.key.value).toBeNull();
    expect(evidence.energyProfile.value).toBeNull();
    expect(evidence.currentStemRoles.value).toBeNull();
  });

  it("passes through only currently-available stem roles, never assumed ones", () => {
    const evidence = assembleDjTransitionTrackEvidence({
      track: makeTrack(),
      beatMap: undefined,
      currentStemRoleAvailability: { vocals: true, drums: false, bass: true, other: undefined },
      sourceFingerprint: "fp-a",
    });
    expect(evidence.currentStemRoles.value).toEqual(expect.arrayContaining(["vocals", "bass"]));
    expect(evidence.currentStemRoles.value).toHaveLength(2);
  });

  it("exposes the trust-policy thresholds the spec requires (0.75 bar, 0.70 phrase)", () => {
    expect(DJ_TRANSITION_TRUST_POLICY.downbeatConfidenceForBarAlignment).toBe(0.75);
    expect(DJ_TRANSITION_TRUST_POLICY.phraseConfidenceForPhraseAlignment).toBe(0.70);
  });
});
