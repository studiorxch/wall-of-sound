import { describe, it, expect } from "vitest";
import { generateEqualSegments, validateSegmentation } from "./loopSegmentation";
import { splitSegmentAtFrame, mergeAdjacentSegments, moveSharedBoundary, relabelSegment } from "./segmentEditing";

const SR = 44100;

function base() {
  return generateEqualSegments("trk1", 0, 40, 120, 4, SR); // 4bar@120bpm = 8s -> 5 segments
}

describe("splitSegmentAtFrame", () => {
  it("splits a segment into two contiguous halves", () => {
    const segs = base();
    const mid = segs[0].startFrame + Math.floor((segs[0].endFrame - segs[0].startFrame) / 2);
    const result = splitSegmentAtFrame(segs, segs[0].id, mid, SR);
    expect(result.ok).toBe(true);
    expect(result.segments.length).toBe(segs.length + 1);
    const { hasGaps, hasOverlaps } = validateSegmentation(result.segments);
    expect(hasGaps).toBe(false);
    expect(hasOverlaps).toBe(false);
  });

  it("rejects a split exactly at a boundary", () => {
    const segs = base();
    const result = splitSegmentAtFrame(segs, segs[0].id, segs[0].startFrame, SR);
    expect(result.ok).toBe(false);
  });

  it("rejects a split outside the segment", () => {
    const segs = base();
    const result = splitSegmentAtFrame(segs, segs[0].id, segs[2].startFrame + 10, SR);
    expect(result.ok).toBe(false);
  });
});

describe("mergeAdjacentSegments", () => {
  it("merges two adjacent segments into one spanning both", () => {
    const segs = base();
    const result = mergeAdjacentSegments(segs, segs[0].id, segs[1].id);
    expect(result.ok).toBe(true);
    expect(result.segments.length).toBe(segs.length - 1);
    const merged = result.segments.find((s) => s.startFrame === segs[0].startFrame)!;
    expect(merged.endFrame).toBe(segs[1].endFrame);
  });

  it("preserves the first segment's label", () => {
    const segs = base();
    segs[0] = { ...segs[0], label: "intro" };
    const result = mergeAdjacentSegments(segs, segs[0].id, segs[1].id);
    const merged = result.segments.find((s) => s.startFrame === segs[0].startFrame)!;
    expect(merged.label).toBe("intro");
  });

  it("rejects merging non-adjacent segments", () => {
    const segs = base();
    const result = mergeAdjacentSegments(segs, segs[0].id, segs[2].id);
    expect(result.ok).toBe(false);
  });

  it("keeps the segmentation valid after merge", () => {
    const segs = base();
    const result = mergeAdjacentSegments(segs, segs[1].id, segs[2].id);
    const { hasGaps, hasOverlaps } = validateSegmentation(result.segments);
    expect(hasGaps).toBe(false);
    expect(hasOverlaps).toBe(false);
  });
});

describe("moveSharedBoundary", () => {
  it("updates both neighbors atomically", () => {
    const segs = base();
    const boundary = segs[0].endFrame;
    const newBoundary = boundary + 1000;
    const result = moveSharedBoundary(segs, segs[0].id, segs[1].id, newBoundary, SR);
    expect(result.ok).toBe(true);
    const left = result.segments.find((s) => s.id === segs[0].id)!;
    const right = result.segments.find((s) => s.id === segs[1].id)!;
    expect(left.endFrame).toBe(newBoundary);
    expect(right.startFrame).toBe(newBoundary);
  });

  it("rejects when it would cross the adjacent boundary (minimum segment length)", () => {
    const segs = base();
    const tooFar = segs[1].endFrame + 1; // would make the middle segment negative-length
    const result = moveSharedBoundary(segs, segs[0].id, segs[1].id, tooFar, SR, 100);
    expect(result.ok).toBe(false);
  });

  it("rejects segments that do not actually share a boundary", () => {
    const segs = base();
    const result = moveSharedBoundary(segs, segs[0].id, segs[2].id, segs[0].endFrame + 500, SR);
    expect(result.ok).toBe(false);
  });

  it("is exactly one operation — no other segment is touched", () => {
    const segs = base();
    const result = moveSharedBoundary(segs, segs[1].id, segs[2].id, segs[1].endFrame + 500, SR);
    const untouched = result.segments.find((s) => s.id === segs[3].id)!;
    expect(untouched.startFrame).toBe(segs[3].startFrame);
    expect(untouched.endFrame).toBe(segs[3].endFrame);
  });
});

describe("relabelSegment", () => {
  it("updates only the targeted segment's label", () => {
    const segs = base();
    const next = relabelSegment(segs, segs[1].id, "drop", "The Drop");
    expect(next.find((s) => s.id === segs[1].id)!.label).toBe("drop");
    expect(next.find((s) => s.id === segs[1].id)!.displayLabel).toBe("The Drop");
    expect(next.find((s) => s.id === segs[0].id)!.label).toBe(segs[0].label);
  });
});
