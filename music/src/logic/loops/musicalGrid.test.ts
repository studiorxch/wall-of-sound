import { describe, it, expect } from "vitest";
import {
  buildMusicalGridFromBeatMap, setManualOrigin, nudgeGridOrigin, halfBpm, doubleBpm, setManualBpm,
  resetToDetectedGrid, buildGridMarks,
} from "./musicalGrid";
import { secondsToFrame } from "./loopSegmentation";
import type { TrackBeatMap } from "../../data/beatMapTypes";

const SR = 44100;

function trustedBeatMap(): TrackBeatMap {
  const beatTimesSeconds = [0, 0.4877, 0.9754, 1.4631, 1.9508, 2.4385, 2.9262, 3.4139];
  return {
    bpm: 123.05,
    confidence: 0.9,
    beatTimesSeconds,
    barStartTimesSeconds: [beatTimesSeconds[0], beatTimesSeconds[4]],
    tempoStable: true,
    tempoStabilityScore: 0.9,
    detectorVersion: "beat-map-v3",
    source: "detected",
    warnings: [],
  } as unknown as TrackBeatMap;
}

describe("buildMusicalGridFromBeatMap", () => {
  it("builds a trusted grid from a trusted beat map's own frames", () => {
    const grid = buildMusicalGridFromBeatMap(trustedBeatMap(), undefined, "fp1", 200, SR);
    expect(grid).not.toBeNull();
    expect(grid!.trust).toBe("trusted");
    expect(grid!.originSource).toBe("trusted_downbeat");
    expect(grid!.bpm).toBeCloseTo(123.05, 2); // decimal preserved, not rounded
    expect(grid!.barFrames.length).toBeGreaterThan(0);
  });

  it("falls back to a provisional spacing grid when only a usable BPM exists", () => {
    const grid = buildMusicalGridFromBeatMap(undefined, 128, "fp2", 30, SR);
    expect(grid).not.toBeNull();
    expect(grid!.trust).toBe("provisional");
    expect(grid!.bpm).toBe(128);
    expect(grid!.barFrames.length).toBeGreaterThan(0);
  });

  it("returns null when there is no usable BPM at all", () => {
    expect(buildMusicalGridFromBeatMap(undefined, undefined, "fp3", 30, SR)).toBeNull();
  });
});

describe("manual grid corrections", () => {
  const base = buildMusicalGridFromBeatMap(undefined, 120, "fp4", 60, SR)!;

  it("setManualOrigin writes an exact frame and marks the grid manual", () => {
    const next = setManualOrigin(base, 2.5, 60, SR);
    expect(next.originFrame).toBe(secondsToFrame(2.5, SR));
    expect(next.trust).toBe("manual");
    expect(next.originSource).toBe("manual");
  });

  it("nudgeGridOrigin moves the origin by exactly the requested delta", () => {
    const next = nudgeGridOrigin(base, 0.01, 60, SR); // +10ms
    expect(next.originSeconds).toBeCloseTo(base.originSeconds + 0.01, 4);
  });

  it("nudge never goes negative", () => {
    const next = nudgeGridOrigin(base, -999, 60, SR);
    expect(next.originSeconds).toBeGreaterThanOrEqual(0);
  });

  it("halfBpm exactly halves and preserves decimal precision", () => {
    const withDecimal = buildMusicalGridFromBeatMap(undefined, 83.31, "fp5", 60, SR)!;
    const next = halfBpm(withDecimal, 60, SR);
    expect(next.bpm).toBeCloseTo(41.655, 3);
  });

  it("doubleBpm exactly doubles and preserves decimal precision", () => {
    const withDecimal = buildMusicalGridFromBeatMap(undefined, 83.31, "fp6", 60, SR)!;
    const next = doubleBpm(withDecimal, 60, SR);
    expect(next.bpm).toBeCloseTo(166.62, 2);
  });

  it("half/double do not move the origin", () => {
    const withOrigin = setManualOrigin(base, 3, 60, SR);
    const next = halfBpm(withOrigin, 60, SR);
    expect(next.originSeconds).toBeCloseTo(3, 4);
  });

  it("setManualBpm accepts a precise decimal value without coercion", () => {
    const next = setManualBpm(base, 91.417, 60, SR);
    expect(next.bpm).toBe(91.417);
  });

  it("setManualBpm rejects non-finite or out-of-range values", () => {
    expect(() => setManualBpm(base, NaN, 60, SR)).toThrow();
    expect(() => setManualBpm(base, -5, 60, SR)).toThrow();
    expect(() => setManualBpm(base, 5000, 60, SR)).toThrow();
  });
});

describe("resetToDetectedGrid", () => {
  it("re-derives the same grid the detector would produce, discarding manual state", () => {
    const manual = setManualBpm(buildMusicalGridFromBeatMap(trustedBeatMap(), undefined, "fp7", 200, SR)!, 200, 200, SR);
    expect(manual.trust).toBe("manual");
    const reset = resetToDetectedGrid(trustedBeatMap(), undefined, "fp7", 200, SR);
    expect(reset!.trust).toBe("trusted");
    expect(reset!.bpm).toBeCloseTo(123.05, 2);
  });
});

describe("buildGridMarks", () => {
  const grid = buildMusicalGridFromBeatMap(trustedBeatMap(), undefined, "fp8", 200, SR)!;

  it("overview zoom shows sparse bar marks only", () => {
    const marks = buildGridMarks(grid, SR, "overview");
    expect(marks.every((m) => m.kind === "bar")).toBe(true);
  });

  it("beats zoom includes beat marks between bars", () => {
    const marks = buildGridMarks(grid, SR, "beats");
    expect(marks.some((m) => m.kind === "beat")).toBe(true);
  });

  it("marks are frame-derived, not built from rounded seconds", () => {
    const marks = buildGridMarks(grid, SR, "bars");
    for (const m of marks) {
      expect(m.seconds).toBeCloseTo(m.frame / SR, 6);
    }
  });

  it("marks are sorted by frame position", () => {
    const marks = buildGridMarks(grid, SR, "beats");
    for (let i = 0; i < marks.length - 1; i++) {
      expect(marks[i].frame).toBeLessThanOrEqual(marks[i + 1].frame);
    }
  });
});
