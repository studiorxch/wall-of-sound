import { describe, expect, it, vi } from "vitest";
import type { Track } from "../../data/trackTypes";

// The real analyzer functions are exercised by their own test suites
// (dspFeatureExtraction.test.ts, mechanicalMoodAnalyzer.test.ts) and by live
// browser verification against real Suno audio. This file tests the ADAPTER
// boundary itself — that it builds a correctly-shaped ephemeral Track and
// maps the analyzer's real output onto SunoAnalysisResultInput — not the
// analysis math a second time.
vi.mock("../dspFeatureExtraction", () => ({ analyzeTrackDspFeatures: vi.fn() }));
vi.mock("../mechanicalMoodAnalyzer", () => ({ analyzeMechanicalMoods: vi.fn() }));

import { analyzeTrackDspFeatures } from "../dspFeatureExtraction";
import { analyzeMechanicalMoods } from "../mechanicalMoodAnalyzer";
import { analyzeSunoRecording } from "./sunoIntelligenceAdapter";

const mockDsp = vi.mocked(analyzeTrackDspFeatures);
const mockMechanical = vi.mocked(analyzeMechanicalMoods);

const PARAMS = {
  canonicalRecordingId: "canon-abc123",
  title: "Warm Analog Pads",
  durationSeconds: 187.4,
  playableAudioUrl: "/suno-library-audio/asset-e316ea792c2a069cc50c5dc0",
};

describe("analyzeSunoRecording — ephemeral adapter Track shape", () => {
  it("passes analyzeTrackDspFeatures a Track-shaped object carrying the Suno playback URL via objectUrl, never a real trackId", async () => {
    mockDsp.mockResolvedValue({ analysisStatus: "failed", analysisWarnings: ["stop here"] } as unknown as Track);
    await analyzeSunoRecording(PARAMS);

    expect(mockDsp).toHaveBeenCalledTimes(1);
    const passedTrack = mockDsp.mock.calls[0][0];
    expect(passedTrack.objectUrl).toBe(PARAMS.playableAudioUrl);
    expect(passedTrack.title).toBe(PARAMS.title);
    expect(passedTrack.durationSeconds).toBe(PARAMS.durationSeconds);
    expect(passedTrack.sourceOwner).toBe("unknown");
    // Never a real library trackId — this object must never collide with,
    // or be mistaken for, a genuine Catalog/External Track record.
    expect(passedTrack.trackId).toContain(PARAMS.canonicalRecordingId);
    expect(passedTrack.trackId).toContain("suno-analysis-adapter");
  });
});

describe("analyzeSunoRecording — failure path", () => {
  it("returns ok:false with the real analyzer's warnings when DSP analysis fails (e.g. non-materialized/undecodable audio)", async () => {
    mockDsp.mockResolvedValue({
      analysisStatus: "failed",
      analysisWarnings: ["DSP_HTTP_404"],
    } as unknown as Track);

    const result = await analyzeSunoRecording(PARAMS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.warnings).toEqual(["DSP_HTTP_404"]);
    expect(mockMechanical).not.toHaveBeenCalled();
  });
});

describe("analyzeSunoRecording — success path", () => {
  it("maps the real DSP + mechanical analyzer output onto SunoAnalysisResultInput, running mechanical analysis on the DSP result", async () => {
    const dspOutput = {
      analysisStatus: "analyzed",
      bpm: 122.4,
      camelotKey: "8A",
      energy: 0.63,
      moodTags: ["Hypnotic", "Warm"],
      moodSuggestions: ["Nostalgic", "Somber"],
      analysisWarnings: [],
    } as unknown as Track;
    mockDsp.mockResolvedValue(dspOutput);
    mockMechanical.mockReturnValue({
      mechanicalMoodTags: ["tension", "opener"],
      mechanicalMoodConfidence: {},
      mechanicalAnalysisStatus: "analyzed",
      mechanicalAnalysisSources: [],
      mechanicalAnalysisNotes: [],
    } as any);

    const result = await analyzeSunoRecording(PARAMS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({
        analysisStatus: "analyzed",
        bpm: 122.4,
        camelotKey: "8A",
        energy: 0.63,
        moodTags: ["Hypnotic", "Warm"],
        moodSuggestions: ["Nostalgic", "Somber"],
        mechanicalMoodTags: ["tension", "opener"],
        analysisWarnings: [],
      });
    }
    // Mechanical analysis must run on the DSP result (so it can read the
    // energy/brightness/bpm/moodTags DSP just computed), not the original
    // pre-analysis ephemeral Track.
    expect(mockMechanical).toHaveBeenCalledWith(dspOutput);
  });

  it("forwards the DSP result's beatMap through to SunoAnalysisResultInput — 0828 plumbing fix", async () => {
    const beatMap = {
      version: "v1", bpm: 122.4, beatTimesSeconds: [0, 0.5, 1.0], barStartTimesSeconds: [0],
      tempoStable: true, tempoStabilityScore: 0.9, tempoSegments: [], confidence: 0.9,
      source: "detected", detectorVersion: "v1",
    };
    mockDsp.mockResolvedValue({
      analysisStatus: "analyzed", bpm: 122.4, camelotKey: "8A", energy: 0.63,
      moodTags: [], moodSuggestions: [], analysisWarnings: [], beatMap,
    } as unknown as Track);
    mockMechanical.mockReturnValue({ mechanicalMoodTags: [] } as any);

    const result = await analyzeSunoRecording(PARAMS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.beatMap).toEqual(beatMap);
  });

  it("leaves beatMap absent when the DSP result has none — never fabricates a grid", async () => {
    mockDsp.mockResolvedValue({
      analysisStatus: "analyzed", bpm: 122.4, camelotKey: "8A", energy: 0.63,
      moodTags: [], moodSuggestions: [], analysisWarnings: [],
    } as unknown as Track);
    mockMechanical.mockReturnValue({ mechanicalMoodTags: [] } as any);

    const result = await analyzeSunoRecording(PARAMS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.beatMap).toBeUndefined();
  });

  it("treats a 'partial' DSP result as a real, usable success (not a failure)", async () => {
    mockDsp.mockResolvedValue({
      analysisStatus: "partial",
      bpm: 90,
      camelotKey: null,
      energy: 0.4,
      moodTags: [],
      moodSuggestions: [],
      analysisWarnings: ["key detection below confidence threshold"],
    } as unknown as Track);
    mockMechanical.mockReturnValue({ mechanicalMoodTags: [] } as any);

    const result = await analyzeSunoRecording(PARAMS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.analysisStatus).toBe("partial");
  });
});
