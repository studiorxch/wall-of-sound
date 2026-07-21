import { describe, it, expect } from "vitest";
import { analyzeCompleteSong } from "./completeSongAnalyzer";
import type { Track } from "../../data/trackTypes";
import type { AudioAnalysisInput } from "../../data/audioDetectionTypes";
import type { SongSection } from "../../data/songAnalysisTypes";

function makeMono(length: number): Float32Array {
  const arr = new Float32Array(length);
  for (let i = 0; i < length; i++) arr[i] = Math.sin(i * 0.05) * 0.3;
  return arr;
}

function analysisInput(lengthSeconds = 2, sampleRate = 8000): AudioAnalysisInput {
  const mono = makeMono(Math.round(lengthSeconds * sampleRate));
  return { sampleRate, channels: [mono], mono, durationSeconds: mono.length / sampleRate };
}

// bpm/camelotKey/beatMap.confidence are deliberately distinctive, unlikely
// values a real detector would coincidentally reproduce — proving the
// analyzer copies them rather than recomputing.
function track(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "track_1", title: "Some Track",
    bpm: 123.456, camelotKey: "9B",
    beatMap: { version: "1.0", beatTimesSeconds: [], barStartTimesSeconds: [], confidence: 0.777, tempoStabilityScore: 0.5 },
    ...overrides,
  } as unknown as Track;
}

function section(overrides: Partial<SongSection> = {}): SongSection {
  return {
    id: "songsec_prior_1", sourceTrackId: "track_1",
    structuralType: "chorus", displayLabel: "Chorus (verified by user)",
    startFrame: 0, endFrame: 8000,
    confidence: 0.85, verification: "verified", origin: "user",
    ...overrides,
  };
}

describe("analyzeCompleteSong", () => {
  it("copies bpm/musicalKey/beatGridConfidence straight from the Track — never re-detects", async () => {
    const result = await analyzeCompleteSong({
      track: track(), analysisInput: analysisInput(), segments: [],
    });
    expect(result.bpm).toBe(123.456);
    expect(result.musicalKey).toBe("9B");
    expect(result.beatGridConfidence).toBe(0.777);
  });

  it("falls back to beatMap.tempoStabilityScore when beatMap.confidence is absent", async () => {
    const result = await analyzeCompleteSong({
      track: track({ beatMap: { version: "1.0", beatTimesSeconds: [], barStartTimesSeconds: [], tempoStabilityScore: 0.42 } as unknown as Track["beatMap"] }),
      analysisInput: analysisInput(), segments: [],
    });
    expect(result.beatGridConfidence).toBe(0.42);
  });

  it("sets status to READY_PROVISIONAL on success and leaves harmonicProfile/vocalPresenceProfile unset", async () => {
    const result = await analyzeCompleteSong({ track: track(), analysisInput: analysisInput(), segments: [] });
    expect(result.status).toBe("READY_PROVISIONAL");
    expect(result.harmonicProfile).toBeUndefined();
    expect(result.vocalPresenceProfile).toBeUndefined();
  });

  it("produces real energy/density/brightness/bassWeight/percussive profiles and a stable sourceMediaFingerprint", async () => {
    const result = await analyzeCompleteSong({ track: track(), analysisInput: analysisInput(), segments: [] });
    expect(result.energyProfile?.values.length).toBeGreaterThan(0);
    expect(result.densityProfile?.values.length).toBeGreaterThan(0);
    expect(result.brightnessProfile?.values.length).toBeGreaterThan(0);
    expect(result.bassWeightProfile?.values.length).toBeGreaterThan(0);
    expect(result.percussiveProfile?.values.length).toBeGreaterThan(0);
    expect(result.sourceMediaFingerprint).toContain("::");
  });

  it("attaches a real waveformSummary (min/max peak bins), never a second decode", async () => {
    const result = await analyzeCompleteSong({ track: track(), analysisInput: analysisInput(), segments: [] });
    expect(result.waveformSummary).toBeDefined();
    expect(result.waveformSummary!.minValues.length).toBe(result.waveformSummary!.sampleCount);
    expect(result.waveformSummary!.maxValues.length).toBe(result.waveformSummary!.sampleCount);
    // A real signal (not all-zero placeholder bins).
    expect(result.waveformSummary!.maxValues.some((v) => v > 0)).toBe(true);
    expect(result.waveformSummary!.minValues.some((v) => v < 0)).toBe(true);
  });

  it("derives a fresh, provisional section set with stable ids when there is no prior protected work", async () => {
    const result = await analyzeCompleteSong({ track: track(), analysisInput: analysisInput(), segments: [] });
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections.every((s) => s.verification === "provisional")).toBe(true);
    expect(result.previousSections).toBeUndefined();
  });

  // spec §4.5/§11 — a rerun must never silently overwrite a section with
  // active human work; the fresh analyzer output is surfaced only via
  // previousSections, a comparison candidate.
  it("preserves the entire prior section set when it contains a verified/user-touched section, exposing the fresh output only via previousSections", async () => {
    const priorSections = [section({ verification: "verified" })];
    const result = await analyzeCompleteSong({
      track: track(), analysisInput: analysisInput(), segments: [],
      priorProtectedSections: priorSections,
    });
    expect(result.sections).toEqual(priorSections);
    expect(result.previousSections).toBeDefined();
    expect(result.previousSections!.length).toBeGreaterThan(0);
    expect(result.previousSections!.every((s) => s.verification === "provisional")).toBe(true);
  });

  it("computes ranked suggestedRoles when sections exist", async () => {
    const result = await analyzeCompleteSong({ track: track(), analysisInput: analysisInput(), segments: [] });
    expect(result.suggestedRoles).toBeDefined();
    expect(result.suggestedRoles!.length).toBeGreaterThan(0);
  });

  it("propagates AbortError from the chunked profile step without saving a partial result", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(analyzeCompleteSong({
      track: track(), analysisInput: analysisInput(10, 8000), segments: [], signal: controller.signal,
    })).rejects.toThrow();
  });
});
