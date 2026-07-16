import { describe, it, expect } from "vitest";
import { deriveStructuralSections } from "./structuralSections";
import { generateEqualSegments } from "./loopSegmentation";

const SR = 44100;

describe("deriveStructuralSections — canonical segments path", () => {
  it("uses first/last segment as intro/outro, middle as body when >=3 segments exist", () => {
    const segs = generateEqualSegments("t1", 0, 100, 120, 8, SR); // several 8-bar segments
    const bands = deriveStructuralSections(segs, undefined, undefined, 0, 100 * SR);
    expect(bands.map((b) => b.label)).toEqual(["intro", "body", "outro"]);
    expect(bands[0].source).toBe("canonical_segments");
  });

  it("intro/body/outro are contiguous with no gaps", () => {
    const segs = generateEqualSegments("t1", 0, 100, 120, 8, SR);
    const bands = deriveStructuralSections(segs, undefined, undefined, 0, 100 * SR);
    expect(bands[0].endFrame).toBe(bands[1].startFrame);
    expect(bands[1].endFrame).toBe(bands[2].startFrame);
  });

  it("marks confidence high when segment source is detected/manual", () => {
    const segs = generateEqualSegments("t1", 0, 100, 120, 8, SR).map((s) => ({ ...s, source: "manual" as const }));
    const bands = deriveStructuralSections(segs, undefined, undefined, 0, 100 * SR);
    expect(bands.every((b) => b.confidence === "high")).toBe(true);
  });

  it("marks confidence provisional when segment source is equal_grid", () => {
    const segs = generateEqualSegments("t1", 0, 100, 120, 8, SR); // source: equal_grid
    const bands = deriveStructuralSections(segs, undefined, undefined, 0, 100 * SR);
    expect(bands.every((b) => b.confidence === "provisional")).toBe(true);
  });
});

describe("deriveStructuralSections — trusted playback-bounds fallback", () => {
  it("uses bounds when fewer than 3 segments exist", () => {
    const bands = deriveStructuralSections([], 5 * SR, 95 * SR, 0, 100 * SR);
    expect(bands.map((b) => b.label)).toEqual(["intro", "body", "outro"]);
    expect(bands[0].source).toBe("playback_bounds");
    expect(bands.every((b) => b.confidence === "high")).toBe(true);
  });

  it("is contiguous with no gaps", () => {
    const bands = deriveStructuralSections([], 5 * SR, 95 * SR, 0, 100 * SR);
    expect(bands[0].endFrame).toBe(bands[1].startFrame);
    expect(bands[1].endFrame).toBe(bands[2].startFrame);
  });
});

describe("deriveStructuralSections — heuristic fallback", () => {
  it("falls back to heuristic when no segments or trusted bounds exist", () => {
    const bands = deriveStructuralSections([], undefined, undefined, 0, 100 * SR);
    expect(bands.map((b) => b.label)).toEqual(["intro", "body", "outro"]);
    expect(bands.every((b) => b.source === "heuristic")).toBe(true);
  });

  it("heuristic bands are ALWAYS marked provisional, never presented as fact", () => {
    const bands = deriveStructuralSections([], undefined, undefined, 0, 100 * SR);
    expect(bands.every((b) => b.confidence === "provisional")).toBe(true);
  });

  it("intro/body/outro cover the full track with no gaps or overlaps", () => {
    const bands = deriveStructuralSections([], undefined, undefined, 0, 100 * SR);
    expect(bands[0].startFrame).toBe(0);
    expect(bands[bands.length - 1].endFrame).toBe(100 * SR);
    for (let i = 0; i < bands.length - 1; i++) {
      expect(bands[i].endFrame).toBe(bands[i + 1].startFrame);
    }
  });

  it("still produces non-overlapping bands for a track only a few frames long", () => {
    // At 10%/15% intro/outro fractions the 3-way split always has
    // positive-width regions for any total > 0; this exercises the
    // rounding-edge behavior directly rather than assuming a collapse.
    const bands = deriveStructuralSections([], undefined, undefined, 0, 3);
    for (let i = 0; i < bands.length - 1; i++) {
      expect(bands[i].endFrame).toBeLessThanOrEqual(bands[i + 1].startFrame);
    }
    expect(bands.every((b) => b.confidence === "provisional")).toBe(true);
  });

  it("returns an empty array for a zero-length track", () => {
    expect(deriveStructuralSections([], undefined, undefined, 0, 0)).toEqual([]);
  });
});
