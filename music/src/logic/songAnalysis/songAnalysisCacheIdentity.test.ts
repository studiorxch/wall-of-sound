import { describe, it, expect } from "vitest";
import { computeSongAnalysisCacheIdentity, isSongAnalysisCacheValid, isSongAnalysisStale } from "./songAnalysisCacheIdentity";
import { CURRENT_SONG_ANALYZER_VERSION, CURRENT_SONG_ANALYSIS_CONFIG_VERSION, type CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { Track } from "../../data/trackTypes";

function track(overrides: Partial<Track> = {}): Track {
  return { trackId: "track_1", title: "Some Track", audioRelPath: "some-track.wav", ...overrides } as unknown as Track;
}

function analysisFromIdentity(overrides: Partial<CompleteSongAnalysis> = {}): CompleteSongAnalysis {
  const identity = computeSongAnalysisCacheIdentity(track(), 44100 * 10, 44100);
  return {
    id: "songana_1", sourceTrackId: "track_1",
    sourceMediaFingerprint: identity.sourceMediaFingerprint,
    decodedFrameCount: identity.decodedFrameCount,
    sampleRate: identity.sampleRate,
    analyzerVersion: identity.analyzerVersion,
    configurationVersion: identity.configurationVersion,
    status: "READY_PROVISIONAL",
    sections: [], sectionRevisions: [],
    createdAt: "t0", updatedAt: "t0",
    ...overrides,
  };
}

describe("computeSongAnalysisCacheIdentity", () => {
  it("derives the fingerprint from pathHint + duration (decodedFrameCount/sampleRate), not any track metadata field", () => {
    const identity = computeSongAnalysisCacheIdentity(track({ audioRelPath: "a.wav" }), 44100 * 5, 44100);
    expect(identity.sourceMediaFingerprint).toBe("a.wav::5.00");
    expect(identity.decodedFrameCount).toBe(44100 * 5);
    expect(identity.sampleRate).toBe(44100);
    expect(identity.analyzerVersion).toBe(CURRENT_SONG_ANALYZER_VERSION);
    expect(identity.configurationVersion).toBe(CURRENT_SONG_ANALYSIS_CONFIG_VERSION);
  });

  it("falls back to filePath then trackId when audioRelPath is absent", () => {
    const byFilePath = computeSongAnalysisCacheIdentity(track({ audioRelPath: undefined, filePath: "/x/b.wav" }), 44100, 44100);
    expect(byFilePath.sourceMediaFingerprint).toBe("/x/b.wav::1.00");
    const byTrackId = computeSongAnalysisCacheIdentity(track({ audioRelPath: undefined, filePath: undefined, trackId: "track_9" }), 44100, 44100);
    expect(byTrackId.sourceMediaFingerprint).toBe("track_9::1.00");
  });
});

describe("isSongAnalysisCacheValid / isSongAnalysisStale", () => {
  it("is valid when all five identity dimensions match", () => {
    const analysis = analysisFromIdentity();
    const current = computeSongAnalysisCacheIdentity(track(), analysis.decodedFrameCount, analysis.sampleRate);
    expect(isSongAnalysisCacheValid(analysis, current)).toBe(true);
    expect(isSongAnalysisStale(analysis, current)).toBe(false);
  });

  // spec §4.4 — track ID alone is never sufficient; each of the five
  // dimensions is checked independently, mirroring 0717B's
  // SECTIONAL_RADIO_MISSING_SOURCE doctrine for sourceMediaIdentity.
  it("is stale when sourceMediaFingerprint differs (e.g. the file path changed)", () => {
    const analysis = analysisFromIdentity();
    const current = computeSongAnalysisCacheIdentity(track({ audioRelPath: "different.wav" }), analysis.decodedFrameCount, analysis.sampleRate);
    expect(isSongAnalysisCacheValid(analysis, current)).toBe(false);
    expect(isSongAnalysisStale(analysis, current)).toBe(true);
  });

  it("is stale when decodedFrameCount differs", () => {
    const analysis = analysisFromIdentity();
    const current = computeSongAnalysisCacheIdentity(track(), analysis.decodedFrameCount + 1000, analysis.sampleRate);
    expect(isSongAnalysisCacheValid(analysis, current)).toBe(false);
  });

  it("is stale when sampleRate differs", () => {
    const analysis = analysisFromIdentity();
    const current = { ...computeSongAnalysisCacheIdentity(track(), analysis.decodedFrameCount, analysis.sampleRate), sampleRate: 48000 };
    expect(isSongAnalysisCacheValid(analysis, current)).toBe(false);
  });

  it("is stale when analyzerVersion differs", () => {
    const analysis = analysisFromIdentity();
    const current = { ...computeSongAnalysisCacheIdentity(track(), analysis.decodedFrameCount, analysis.sampleRate), analyzerVersion: "song-analyzer-v0.0.1" };
    expect(isSongAnalysisCacheValid(analysis, current)).toBe(false);
  });

  it("is stale when configurationVersion differs", () => {
    const analysis = analysisFromIdentity();
    const current = { ...computeSongAnalysisCacheIdentity(track(), analysis.decodedFrameCount, analysis.sampleRate), configurationVersion: "song-analysis-config-v0.0.1" };
    expect(isSongAnalysisCacheValid(analysis, current)).toBe(false);
  });

  it("never treats a matching track ID alone (with a differing fingerprint) as valid", () => {
    const analysis = analysisFromIdentity({ sourceTrackId: "track_1" });
    const current = computeSongAnalysisCacheIdentity(track({ trackId: "track_1", audioRelPath: "renamed.wav" }), analysis.decodedFrameCount, analysis.sampleRate);
    expect(isSongAnalysisCacheValid(analysis, current)).toBe(false);
  });
});
