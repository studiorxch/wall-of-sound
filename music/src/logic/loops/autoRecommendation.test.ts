import { describe, it, expect } from "vitest";
import { recommendForRegion, buildScopedPlaybackBounds } from "./autoRecommendation";
import type { TrackBeatMap } from "../../data/beatMapTypes";
import { BEAT_MAP_DETECTOR_VERSION } from "../../data/beatMapTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";
import { PLAYBACK_BOUNDS_DETECTOR_VERSION } from "../../data/playbackBoundsTypes";

function makeBeatMap(overrides: Partial<TrackBeatMap> = {}): TrackBeatMap {
  // 120 BPM -> 0.5s/beat, 4/4 -> 2s/bar. 160 beats = 40 bars of clean grid.
  const beatTimesSeconds: number[] = [];
  for (let i = 0; i < 160; i++) beatTimesSeconds.push(i * 0.5);
  const barStartTimesSeconds = beatTimesSeconds.filter((_, i) => i % 4 === 0);
  return {
    version: "1", bpm: 120, beatTimesSeconds, barStartTimesSeconds,
    tempoStable: true, tempoStabilityScore: 0.95, tempoSegments: [], confidence: 0.9,
    source: "detected", detectorVersion: BEAT_MAP_DETECTOR_VERSION,
    analyzedAt: "2026-07-14T00:00:00.000Z", warnings: [],
    ...overrides,
  };
}

function makeBounds(overrides: Partial<TrackPlaybackBounds> = {}): TrackPlaybackBounds {
  return {
    version: "1", sourceDurationSeconds: 80,
    audibleStartSeconds: 0, preferredStartSeconds: 0, preferredEndSeconds: 80, audibleEndSeconds: 80,
    leadingSilenceSeconds: 0, trailingSilenceSeconds: 0, effectiveDurationSeconds: 80,
    startClassification: "musical_intro", endClassification: "musical_outro",
    startConfidence: 0.9, endConfidence: 0.9, overallConfidence: 0.9,
    source: "detected", detectorVersion: PLAYBACK_BOUNDS_DETECTOR_VERSION,
    analyzedAt: "2026-07-14T00:00:00.000Z", warnings: [],
    ...overrides,
  };
}

describe("buildScopedPlaybackBounds", () => {
  it("preserves the base bounds' other fields, only moving preferred start/end", () => {
    const base = makeBounds({ overallConfidence: 0.77 });
    const scoped = buildScopedPlaybackBounds(base, 10, 26, 80);
    expect(scoped.preferredStartSeconds).toBe(10);
    expect(scoped.preferredEndSeconds).toBe(26);
    expect(scoped.overallConfidence).toBe(0.77);
    expect(scoped.override).toBeUndefined();
  });

  it("synthesizes a minimal valid bounds object when none exists", () => {
    const scoped = buildScopedPlaybackBounds(undefined, 5, 21, 80);
    expect(scoped.preferredStartSeconds).toBe(5);
    expect(scoped.preferredEndSeconds).toBe(21);
    expect(scoped.effectiveDurationSeconds).toBeCloseTo(16, 5);
  });
});

describe("recommendForRegion", () => {
  it("returns a single winning candidate for a region with a trusted grid", () => {
    const result = recommendForRegion({
      regionStartSeconds: 0, regionEndSeconds: 32, sourceDurationSeconds: 80,
      beatMap: makeBeatMap(), playbackBounds: makeBounds(),
      lengthPreference: "auto", tempoStabilityScore: 0.95,
    });
    expect(result.winner).not.toBeNull();
    expect(result.winner!.startSeconds).toBeGreaterThanOrEqual(0);
    expect(result.winner!.endSeconds).toBeLessThanOrEqual(32);
  });

  it("scopes generation to the region — a winner's bounds never leave the requested region", () => {
    const result = recommendForRegion({
      regionStartSeconds: 20, regionEndSeconds: 52, sourceDurationSeconds: 80,
      beatMap: makeBeatMap(), playbackBounds: makeBounds(), lengthPreference: "auto",
    });
    expect(result.winner!.startSeconds).toBeGreaterThanOrEqual(20 - 0.001);
    expect(result.winner!.endSeconds).toBeLessThanOrEqual(52 + 0.001);
  });

  it("respects an explicit length preference over auto", () => {
    const result = recommendForRegion({
      regionStartSeconds: 0, regionEndSeconds: 32, sourceDurationSeconds: 80,
      beatMap: makeBeatMap(), playbackBounds: makeBounds(), lengthPreference: 8,
    });
    expect(result.winner!.barCount).toBe(8);
  });

  it("marks a requested length unavailable when no candidate fits", () => {
    // A 6-second region can't fit a 64-bar (128s) candidate at 120bpm.
    const result = recommendForRegion({
      regionStartSeconds: 0, regionEndSeconds: 6, sourceDurationSeconds: 80,
      beatMap: makeBeatMap(), playbackBounds: makeBounds(), lengthPreference: "auto",
    });
    expect(result.availableLengths[64]).toBe(false);
  });

  it("filters out candidates exceeding the duration-target ceiling", () => {
    const result = recommendForRegion({
      regionStartSeconds: 0, regionEndSeconds: 80, sourceDurationSeconds: 80,
      beatMap: makeBeatMap(), playbackBounds: makeBounds(),
      lengthPreference: "auto", durationTargetSeconds: 15,
    });
    expect(result.winner).not.toBeNull();
    expect(result.winner!.durationSeconds).toBeLessThanOrEqual(15);
  });

  it("returns a null winner and all-unavailable lengths when the region is too short to generate anything", () => {
    const result = recommendForRegion({
      regionStartSeconds: 10, regionEndSeconds: 10.5, sourceDurationSeconds: 80,
      beatMap: makeBeatMap(), playbackBounds: makeBounds(), lengthPreference: "auto",
    });
    expect(result.winner).toBeNull();
    expect(Object.values(result.availableLengths).every((v) => v === false)).toBe(true);
  });
});
