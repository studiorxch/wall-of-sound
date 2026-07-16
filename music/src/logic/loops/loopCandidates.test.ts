import { describe, it, expect } from "vitest";
import { generateLoopCandidates } from "./loopCandidates";
import type { TrackBeatMap } from "../../data/beatMapTypes";
import { BEAT_MAP_DETECTOR_VERSION } from "../../data/beatMapTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";
import { PLAYBACK_BOUNDS_DETECTOR_VERSION } from "../../data/playbackBoundsTypes";

function makeBeatMap(overrides: Partial<TrackBeatMap> = {}): TrackBeatMap {
  // 120 BPM → 0.5s per beat, 4/4 → 2s per bar. 160 beats = 40 bars of clean grid.
  const beatTimesSeconds: number[] = [];
  for (let i = 0; i < 160; i++) beatTimesSeconds.push(i * 0.5);
  const barStartTimesSeconds = beatTimesSeconds.filter((_, i) => i % 4 === 0);
  return {
    version: "1",
    bpm: 120,
    beatTimesSeconds,
    barStartTimesSeconds,
    tempoStable: true,
    tempoStabilityScore: 0.95,
    tempoSegments: [],
    confidence: 0.9,
    source: "detected",
    detectorVersion: BEAT_MAP_DETECTOR_VERSION,
    analyzedAt: "2026-07-14T00:00:00.000Z",
    warnings: [],
    ...overrides,
  };
}

function makeBounds(overrides: Partial<TrackPlaybackBounds> = {}): TrackPlaybackBounds {
  return {
    version: "1",
    sourceDurationSeconds: 80,
    audibleStartSeconds: 0,
    preferredStartSeconds: 0,
    preferredEndSeconds: 80,
    audibleEndSeconds: 80,
    leadingSilenceSeconds: 0,
    trailingSilenceSeconds: 0,
    effectiveDurationSeconds: 80,
    startClassification: "musical_intro",
    endClassification: "musical_outro",
    startConfidence: 0.9,
    endConfidence: 0.9,
    overallConfidence: 0.9,
    source: "detected",
    detectorVersion: PLAYBACK_BOUNDS_DETECTOR_VERSION,
    analyzedAt: "2026-07-14T00:00:00.000Z",
    warnings: [],
    ...overrides,
  };
}

describe("generateLoopCandidates — trusted_grid", () => {
  it("generates candidates for multiple bar lengths (4/8/16/32/64) when timing evidence supports it", () => {
    const candidates = generateLoopCandidates(makeBeatMap(), makeBounds(), 80);
    expect(candidates.length).toBeGreaterThan(0);
    const barSizes = new Set(candidates.map((c) => c.barCount));
    // 80s window at 2s/bar = 40 bars available — 64-bar candidates won't fit,
    // but 4/8/16/32 should all be generatable.
    expect(barSizes.has(4)).toBe(true);
    expect(barSizes.has(8)).toBe(true);
    expect(barSizes.has(16)).toBe(true);
    expect(barSizes.has(32)).toBe(true);
  });

  it("marks every candidate trusted_grid / gridTrusted / not provisional", () => {
    const candidates = generateLoopCandidates(makeBeatMap(), makeBounds(), 80);
    for (const c of candidates) {
      expect(c.generationMode).toBe("trusted_grid");
      expect(c.gridTrusted).toBe(true);
      expect(c.provisional).toBe(false);
      expect(c.boundarySource === "bar_grid" || c.boundarySource === "section_analysis").toBe(true);
    }
  });

  it("aligns every candidate boundary to a real bar-grid timestamp", () => {
    const beatMap = makeBeatMap();
    const barSet = new Set(beatMap.barStartTimesSeconds);
    const candidates = generateLoopCandidates(beatMap, makeBounds(), 80);
    for (const c of candidates) {
      expect(barSet.has(c.startSeconds)).toBe(true);
      expect(barSet.has(c.endSeconds)).toBe(true);
    }
  });

  it("limits visible candidates per section/length group to the recommended density (<=2)", () => {
    const candidates = generateLoopCandidates(makeBeatMap(), makeBounds(), 80);
    const groups = new Map<string, number>();
    for (const c of candidates) {
      const key = `${c.sectionLabel}::${c.barCount}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    for (const count of groups.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it("never exceeds the trusted window bounds", () => {
    const bounds = makeBounds({ preferredStartSeconds: 4, preferredEndSeconds: 60 });
    const candidates = generateLoopCandidates(makeBeatMap(), bounds, 80);
    for (const c of candidates) {
      expect(c.startSeconds).toBeGreaterThanOrEqual(4);
      expect(c.endSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("is deterministic across repeated calls with identical inputs", () => {
    const a = generateLoopCandidates(makeBeatMap(), makeBounds(), 80);
    const b = generateLoopCandidates(makeBeatMap(), makeBounds(), 80);
    expect(a).toEqual(b);
  });
});

describe("generateLoopCandidates — provisional_grid", () => {
  it("computes approximate bar duration from BPM when the grid is untrusted but BPM is usable", () => {
    const untrustedBeatMap = makeBeatMap({ detectorVersion: "stale-version" });
    const candidates = generateLoopCandidates(untrustedBeatMap, makeBounds(), 80);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.generationMode).toBe("provisional_grid");
      expect(c.gridTrusted).toBe(false);
      expect(c.provisional).toBe(true);
      // 120 BPM, 4 beats/bar => 2s/bar; an 8-bar candidate should be ~16s.
      if (c.barCount === 8) expect(c.durationSeconds).toBeCloseTo(16, 1);
    }
  });

  it("labels every provisional candidate with the provisional warning, never claiming trust", () => {
    const untrustedBeatMap = makeBeatMap({ detectorVersion: "stale-version" });
    const candidates = generateLoopCandidates(untrustedBeatMap, makeBounds(), 80);
    for (const c of candidates) {
      expect(c.warnings).toContain("LOOP_PROVISIONAL_BAR_GRID");
    }
  });
});

describe("generateLoopCandidates — time_fallback", () => {
  it("generates explicit 8/16/32/64-second candidates with no usable BPM/grid at all", () => {
    const candidates = generateLoopCandidates(undefined, makeBounds(), 80);
    expect(candidates.length).toBeGreaterThan(0);
    const secondsSet = new Set(candidates.map((c) => (c.length.kind === "seconds" ? c.length.seconds : null)));
    expect(secondsSet.has(8)).toBe(true);
    expect(secondsSet.has(16)).toBe(true);
    expect(secondsSet.has(32)).toBe(true);
  });

  it("labels time candidates as time_fallback with no bar count attached", () => {
    const candidates = generateLoopCandidates(undefined, makeBounds(), 80);
    for (const c of candidates) {
      expect(c.generationMode).toBe("time_fallback");
      expect(c.barCount).toBeUndefined();
      expect(c.gridTrusted).toBe(false);
      expect(c.warnings).toContain("LOOP_TIME_BASED_FALLBACK");
    }
  });

  it("respects source bounds — never produces a candidate outside the playable window", () => {
    const bounds = makeBounds({ preferredStartSeconds: 5, preferredEndSeconds: 45 });
    const candidates = generateLoopCandidates(undefined, bounds, 80);
    for (const c of candidates) {
      expect(c.startSeconds).toBeGreaterThanOrEqual(5);
      expect(c.endSeconds).toBeLessThanOrEqual(45);
    }
  });

  it("falls back cleanly with no beat map at all", () => {
    const candidates = generateLoopCandidates(undefined, makeBounds(), 80);
    expect(candidates.every((c) => c.generationMode === "time_fallback")).toBe(true);
  });
});

describe("generateLoopCandidates — manual_only / edge cases", () => {
  it("returns no candidates when the playable window is too short to be useful", () => {
    const bounds = makeBounds({ preferredStartSeconds: 0, preferredEndSeconds: 1, sourceDurationSeconds: 1, audibleEndSeconds: 1, effectiveDurationSeconds: 1 });
    const candidates = generateLoopCandidates(undefined, bounds, 1);
    expect(candidates).toEqual([]);
  });

  it("never produces a negative or inverted region across any mode", () => {
    const candidates = [
      ...generateLoopCandidates(makeBeatMap(), makeBounds(), 80),
      ...generateLoopCandidates(makeBeatMap({ detectorVersion: "stale" }), makeBounds(), 80),
      ...generateLoopCandidates(undefined, makeBounds(), 80),
    ];
    for (const c of candidates) {
      expect(c.startSeconds).toBeGreaterThanOrEqual(0);
      expect(c.endSeconds).toBeGreaterThan(c.startSeconds);
      expect(c.durationSeconds).toBeCloseTo(c.endSeconds - c.startSeconds, 6);
    }
  });
});
