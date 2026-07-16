import { describe, it, expect } from "vitest";
import {
  secondsToFrame, frameToSeconds, makeBoundary, generateEqualSegments, validateSegmentation,
} from "./loopSegmentation";

describe("frame/seconds conversion", () => {
  it("round-trips seconds -> frame -> seconds within one sample", () => {
    const sr = 44100;
    const frame = secondsToFrame(12.3456, sr);
    const seconds = frameToSeconds(frame, sr);
    expect(Math.abs(seconds - 12.3456)).toBeLessThan(1 / sr);
  });

  it("makeBoundary derives seconds from frame, not the reverse", () => {
    const b = makeBoundary(1.0, 8);
    expect(b.frame).toBe(8);
    expect(b.seconds).toBe(1.0);
  });
});

describe("generateEqualSegments — the 83.31 BPM regression fixture", () => {
  // §12 of the spec: at 83.31 BPM, 8 bars = 23.046s exactly (not 22.857s,
  // which is what a rounded 84 BPM would produce).
  it("computes exact 8-bar duration from decimal BPM, not rounded BPM", () => {
    const segs = generateEqualSegments("trk1", 0, 100, 83.31, 8, 44100);
    const secondsPerBar = (60 / 83.31) * 4;
    const expectedDuration = secondsPerBar * 8;
    expect(segs[0].endSeconds - segs[0].startSeconds).toBeCloseTo(expectedDuration, 3);
    expect(expectedDuration).toBeCloseTo(23.046, 2);
    // A rounded-84-BPM implementation would produce ~22.857s — confirm we
    // are NOT that.
    expect(Math.abs(expectedDuration - 22.857)).toBeGreaterThan(0.1);
  });
});

describe("generateEqualSegments — invariants (§21)", () => {
  it("first segment starts at the window start", () => {
    const segs = generateEqualSegments("trk1", 2, 50, 120, 8, 44100);
    expect(segs[0].startFrame).toBe(secondsToFrame(2, 44100));
  });

  it("last segment ends exactly at the window end", () => {
    const segs = generateEqualSegments("trk1", 0, 47.3, 120, 8, 44100);
    const last = segs[segs.length - 1];
    expect(last.endFrame).toBe(secondsToFrame(47.3, 44100));
  });

  it("every segment's end equals the next segment's start (no gaps)", () => {
    const segs = generateEqualSegments("trk1", 0, 100, 128, 4, 44100);
    for (let i = 0; i < segs.length - 1; i++) {
      expect(segs[i].endFrame).toBe(segs[i + 1].startFrame);
    }
  });

  it("segments never overlap and remain ordered", () => {
    const segs = generateEqualSegments("trk1", 0, 100, 128, 4, 44100);
    const { hasGaps, hasOverlaps, isOrdered } = validateSegmentation(segs);
    expect(hasGaps).toBe(false);
    expect(hasOverlaps).toBe(false);
    expect(isOrdered).toBe(true);
  });

  it("marks a shorter final segment when the window doesn't divide evenly", () => {
    // 4 bars @ 120bpm = 8s exactly; a 19s window leaves a 3s partial tail.
    const segs = generateEqualSegments("trk1", 0, 19, 120, 4, 44100);
    const last = segs[segs.length - 1];
    expect(last.label).toBe("tail");
    expect(last.endSeconds).toBeCloseTo(19, 2);
    expect(last.endSeconds - last.startSeconds).toBeLessThan(8);
  });

  it("full segments are NOT labeled tail", () => {
    const segs = generateEqualSegments("trk1", 0, 16, 120, 4, 44100); // exactly 2 segments of 8s
    expect(segs.every((s) => s.label !== "tail")).toBe(true);
  });

  it("orders match array index", () => {
    const segs = generateEqualSegments("trk1", 0, 40, 120, 4, 44100);
    segs.forEach((s, i) => expect(s.order).toBe(i));
  });
});

describe("generateEqualSegments — edge cases", () => {
  it("returns an empty array for a zero-length window", () => {
    expect(generateEqualSegments("trk1", 5, 5, 120, 8, 44100)).toEqual([]);
  });

  it("returns an empty array for a non-positive BPM", () => {
    expect(generateEqualSegments("trk1", 0, 10, 0, 8, 44100)).toEqual([]);
  });

  it("returns an empty array for a non-positive bar count", () => {
    expect(generateEqualSegments("trk1", 0, 10, 120, 0, 44100)).toEqual([]);
  });
});

describe("validateSegmentation", () => {
  it("detects a manually introduced gap", () => {
    const segs = generateEqualSegments("trk1", 0, 40, 120, 4, 44100);
    segs[1] = { ...segs[1], startFrame: segs[1].startFrame + 100 };
    const { hasGaps } = validateSegmentation(segs);
    expect(hasGaps).toBe(true);
  });

  it("detects a manually introduced overlap", () => {
    const segs = generateEqualSegments("trk1", 0, 40, 120, 4, 44100);
    segs[1] = { ...segs[1], startFrame: segs[1].startFrame - 100 };
    const { hasOverlaps } = validateSegmentation(segs);
    expect(hasOverlaps).toBe(true);
  });
});
