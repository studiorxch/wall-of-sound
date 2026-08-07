import { describe, it, expect } from "vitest";
import {
  computeBeatWindows, computeBeatEnergyFromChannelData, normalizeEnergyTrackRelative, buildBeatGridFromTrack,
  DEFAULT_BEATS_PER_BAR,
} from "./beatGridAdapter";
import type { Track } from "../../data/trackTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

describe("computeBeatWindows", () => {
  it("returns an empty array for no beats", () => {
    expect(computeBeatWindows([], 120, 10)).toEqual([]);
  });

  it("windows a non-final beat to 0.75x its duration to the next beat, never past it", () => {
    // 120 BPM -> 0.5s period. Beat 0 at t=0, next beat at t=0.5.
    const windows = computeBeatWindows([0, 0.5, 1.0], 120, 2);
    expect(windows[0]).toEqual({ start: 0, end: 0.375 });
    expect(windows[1]).toEqual({ start: 0.5, end: 0.875 });
  });

  it("windows the final beat using 0.75x the estimated beat duration (60/bpm)", () => {
    const windows = computeBeatWindows([0, 0.5, 1.0], 120, 2);
    // last beat: 1.0 + 0.75 * 0.5 = 1.375
    expect(windows[2]).toEqual({ start: 1.0, end: 1.375 });
  });

  it("falls back to the last observed interval as the estimated period when bpm is unavailable", () => {
    const windows = computeBeatWindows([0, 0.4, 0.8], null, 2);
    // interval = 0.4; last beat window end = 0.8 + 0.75*0.4 = 1.1
    expect(windows[2]).toEqual({ start: 0.8, end: 1.1 });
  });

  it("clamps the window end to the track duration", () => {
    const windows = computeBeatWindows([0, 0.5, 1.9], 120, 2);
    expect(windows[2].end).toBeLessThanOrEqual(2);
  });
});

describe("computeBeatEnergyFromChannelData", () => {
  it("computes RMS over each window at the given sample rate", () => {
    const sampleRate = 1000;
    const channelData = new Float32Array(2000).fill(0.5);
    const windows = [{ start: 0, end: 0.375 }, { start: 0.5, end: 0.875 }];
    const energies = computeBeatEnergyFromChannelData(channelData, sampleRate, windows);
    expect(energies[0]).toBeCloseTo(0.5, 5);
    expect(energies[1]).toBeCloseTo(0.5, 5);
  });

  it("returns 0 for a degenerate zero-length window", () => {
    const channelData = new Float32Array(100).fill(1);
    const energies = computeBeatEnergyFromChannelData(channelData, 1000, [{ start: 0.05, end: 0.05 }]);
    expect(energies[0]).toBe(0);
  });

  it("distinguishes a loud window from a quiet window", () => {
    const sampleRate = 1000;
    const channelData = new Float32Array(2000);
    for (let i = 0; i < 500; i++) channelData[i] = 0.1; // quiet: samples 0-499 (0 - 0.5s)
    for (let i = 500; i < 1000; i++) channelData[i] = 0.9; // loud: samples 500-999 (0.5 - 1.0s)
    const windows = [{ start: 0, end: 0.375 }, { start: 0.5, end: 0.875 }];
    const energies = computeBeatEnergyFromChannelData(channelData, sampleRate, windows);
    expect(energies[1]).toBeGreaterThan(energies[0]);
  });
});

describe("normalizeEnergyTrackRelative", () => {
  it("returns an empty array for no values", () => {
    expect(normalizeEnergyTrackRelative([])).toEqual([]);
  });

  it("returns uniform mid-range values when the range collapses (no real spread)", () => {
    expect(normalizeEnergyTrackRelative([0.5, 0.5, 0.5])).toEqual([0.5, 0.5, 0.5]);
  });

  it("percentile-protects against an isolated peak so it does not compress the rest of the range", () => {
    const quiet = Array(10).fill(0.2);
    const loud = Array(10).fill(0.8);
    const outlier = [50];
    const normalized = normalizeEnergyTrackRelative([...quiet, ...loud, ...outlier]);

    // The real, legible bulk of the track (quiet vs loud) keeps a full,
    // undistorted 0..1 spread — a naive min/max normalization against the
    // 50-valued outlier would have compressed 0.8 down to ~0.012.
    expect(normalized[0]).toBeCloseTo(0, 5);
    expect(normalized[10]).toBeCloseTo(1, 5);
    // The isolated peak clips to the top of the range rather than
    // redefining it.
    expect(normalized[20]).toBeLessThanOrEqual(1);
    expect(normalized[20]).toBeGreaterThanOrEqual(normalized[10]);
  });
});

describe("buildBeatGridFromTrack", () => {
  it("returns a zero-confidence empty grid when the track has no beat map", () => {
    const t = track({ trackId: "t1" });
    const grid = buildBeatGridFromTrack(t, new Float32Array(1000), 1000);
    expect(grid.beatTimesSeconds).toEqual([]);
    expect(grid.confidence).toBe(0);
    expect(grid.beatsPerBar).toBe(DEFAULT_BEATS_PER_BAR);
    expect(grid.beatsPerBarConfirmed).toBe(false);
  });

  it("defaults beatsPerBar to 4 and marks it unconfirmed when time signature is unknown", () => {
    const t = track({
      trackId: "t1",
      durationSeconds: 2,
      beatMap: {
        version: "beat-map-v3", bpm: 120, beatTimesSeconds: [0, 0.5, 1.0], barStartTimesSeconds: [],
        tempoStable: true, tempoStabilityScore: 1, tempoSegments: [], confidence: 0.9,
        source: "detected", detectorVersion: "beat-map-v3", analyzedAt: "2026-01-01T00:00:00Z", warnings: [],
      } as unknown as Track["beatMap"],
    });
    const grid = buildBeatGridFromTrack(t, new Float32Array(2000).fill(0.5), 1000);
    expect(grid.beatTimesSeconds).toEqual([0, 0.5, 1.0]);
    expect(grid.beatsPerBar).toBe(4);
    expect(grid.beatsPerBarConfirmed).toBe(false);
    expect(grid.energies).toHaveLength(3);
    expect(grid.confidence).toBe(0.9);
  });

  it("uses the real confirmed beatsPerBar when a time signature is present", () => {
    const t = track({
      trackId: "t1",
      durationSeconds: 2,
      beatMap: {
        version: "beat-map-v3", bpm: 120, beatTimesSeconds: [0, 0.5, 1.0], barStartTimesSeconds: [],
        timeSignature: { numerator: 3, denominator: 4, confidence: 0.8 },
        tempoStable: true, tempoStabilityScore: 1, tempoSegments: [], confidence: 0.9,
        source: "detected", detectorVersion: "beat-map-v3", analyzedAt: "2026-01-01T00:00:00Z", warnings: [],
      } as unknown as Track["beatMap"],
    });
    const grid = buildBeatGridFromTrack(t, new Float32Array(2000).fill(0.5), 1000);
    expect(grid.beatsPerBarConfirmed).toBe(true);
  });
});
