import { describe, it, expect } from "vitest";
import {
  createRevision, updateExistingRevision, buildRevisionCompareSummary, resolveActiveLoopBoundsFrames,
  normalizeRevisionId, revisionIdsMatch, buildRevisionTimeline, wouldActivationStaleRender,
} from "./loopRevisions";
import type { LoopAsset, LoopRevision } from "../../data/loopTypes";
import type { LoopRenderRecord } from "../../data/loopRenderTypes";

function loop(overrides: Partial<LoopAsset> = {}): LoopAsset {
  return {
    id: "loop_1", sourceKind: "track", sourceTrackId: "t1",
    title: "Groove A", sourceTitle: "Track One",
    startSeconds: 20.62, endSeconds: 41.24, durationSeconds: 20.62,
    boundarySource: "manual", contentClass: "unknown",
    status: "approved", warnings: [], createdAt: "t0", updatedAt: "t0",
    ...overrides,
  };
}

describe("createRevision", () => {
  it("creates a v-next revision without mutating the source loop", () => {
    const l = loop();
    const rev = createRevision(l, { startFrame: 1000, endFrame: 5000 }, { createdBy: "manual_edit" }, "t1");
    expect(rev.loopId).toBe("loop_1");
    expect(rev.startFrame).toBe(1000);
    expect(rev.endFrame).toBe(5000);
    expect(rev.createdBy).toBe("manual_edit");
    expect(l.startSeconds).toBe(20.62); // untouched
  });

  it("defaults the label to the loop's own title", () => {
    const rev = createRevision(loop(), { startFrame: 0, endFrame: 100 }, { createdBy: "manual_edit" });
    expect(rev.label).toBe("Groove A");
  });

  it("links parentRevisionId when provided", () => {
    const rev = createRevision(loop(), { startFrame: 0, endFrame: 100 },
      { createdBy: "manual_edit", parentRevisionId: "rev_v1" });
    expect(rev.parentRevisionId).toBe("rev_v1");
  });
});

describe("updateExistingRevision", () => {
  it("returns a new revision object linked to the prior one, never mutating it", () => {
    const l = loop();
    const v1 = createRevision(l, { startFrame: 0, endFrame: 1000 }, { createdBy: "manual_edit" }, "t1");
    const v2 = updateExistingRevision(l, v1, { startFrame: 10, endFrame: 1010 }, { createdBy: "manual_edit" }, "t2");
    expect(v2.parentRevisionId).toBe(v1.id);
    expect(v2.id).not.toBe(v1.id);
    expect(v1.startFrame).toBe(0); // prior revision object itself is untouched
  });
});

describe("resolveActiveLoopBoundsFrames", () => {
  const SR = 44100;

  function revision(overrides: Partial<LoopRevision> = {}): LoopRevision {
    return {
      id: "rev_1", loopId: "loop_1", startFrame: 1000, endFrame: 5000,
      label: "Groove A", createdAt: "t1", createdBy: "manual_edit",
      ...overrides,
    };
  }

  // 0715D — regression coverage for the live-caught defect: rendering and
  // staleness checks both silently used the loop's own frozen ORIGINAL
  // startSeconds/endSeconds instead of the active revision's bounds. This
  // is the one shared function all four affected call sites now go
  // through, so a regression here would be caught immediately rather than
  // requiring live re-verification.
  it("returns the active revision's own frame bounds when one exists", () => {
    const l = loop({ activeRevisionId: "rev_2" });
    const revisions = [revision({ id: "rev_1" }), revision({ id: "rev_2", startFrame: 2000, endFrame: 6000 })];
    const result = resolveActiveLoopBoundsFrames(l, revisions, SR);
    expect(result.startFrame).toBe(2000);
    expect(result.endFrame).toBe(6000);
    expect(result.activeRevision?.id).toBe("rev_2");
  });

  it("falls back to the loop's own stored seconds (converted to frames) when there is no active revision", () => {
    const l = loop({ activeRevisionId: undefined, startSeconds: 10, endSeconds: 18 });
    const result = resolveActiveLoopBoundsFrames(l, [], SR);
    expect(result.startFrame).toBe(Math.round(10 * SR));
    expect(result.endFrame).toBe(Math.round(18 * SR));
    expect(result.activeRevision).toBeUndefined();
  });

  it("falls back to the loop's own bounds when activeRevisionId points at a revision that isn't in the list", () => {
    const l = loop({ activeRevisionId: "rev_missing", startSeconds: 5, endSeconds: 9 });
    const result = resolveActiveLoopBoundsFrames(l, [revision({ id: "rev_other" })], SR);
    expect(result.startFrame).toBe(Math.round(5 * SR));
    expect(result.endFrame).toBe(Math.round(9 * SR));
  });
});

describe("buildRevisionCompareSummary", () => {
  const SR = 44100;

  it("computes before/after seconds and durations", () => {
    const summary = buildRevisionCompareSummary(
      { startFrame: Math.round(20.62 * SR), endFrame: Math.round(41.24 * SR) },
      { startFrame: Math.round(20.643 * SR), endFrame: Math.round(41.198 * SR) },
      SR,
    );
    expect(summary.startBeforeSeconds).toBeCloseTo(20.62, 3);
    expect(summary.startAfterSeconds).toBeCloseTo(20.643, 3);
    expect(summary.endBeforeSeconds).toBeCloseTo(41.24, 3);
    expect(summary.endAfterSeconds).toBeCloseTo(41.198, 3);
  });

  it("computes bar counts when a bar-frame-length is supplied", () => {
    const barFrames = 4 * 22050; // one bar at 120bpm/4-4
    const summary = buildRevisionCompareSummary(
      { startFrame: 0, endFrame: barFrames * 8 },
      { startFrame: 0, endFrame: Math.round(barFrames * 7.99) },
      SR,
      barFrames,
    );
    expect(summary.barsBefore).toBeCloseTo(8, 2);
    expect(summary.barsAfter).toBeCloseTo(7.99, 1);
  });

  it("leaves bar counts undefined when no bar-frame-length is supplied", () => {
    const summary = buildRevisionCompareSummary({ startFrame: 0, endFrame: 1000 }, { startFrame: 0, endFrame: 900 }, SR);
    expect(summary.barsBefore).toBeUndefined();
    expect(summary.barsAfter).toBeUndefined();
  });
});

// 0715E — the implicit "v1 · original" revision is `null` in code while
// `activeRevisionId`/`renderedRevisionId` represent the same state as
// `undefined`. These two functions are the only sanctioned comparison path.
describe("normalizeRevisionId / revisionIdsMatch", () => {
  it("treats undefined and null as the same (both mean 'original')", () => {
    expect(normalizeRevisionId(undefined)).toBe(null);
    expect(normalizeRevisionId(null)).toBe(null);
    expect(revisionIdsMatch(undefined, null)).toBe(true);
    expect(revisionIdsMatch(null, undefined)).toBe(true);
    expect(revisionIdsMatch(undefined, undefined)).toBe(true);
  });

  it("does not match a real id against original", () => {
    expect(revisionIdsMatch("rev_1", null)).toBe(false);
    expect(revisionIdsMatch(undefined, "rev_1")).toBe(false);
  });

  it("matches identical real ids and rejects different ones", () => {
    expect(revisionIdsMatch("rev_1", "rev_1")).toBe(true);
    expect(revisionIdsMatch("rev_1", "rev_2")).toBe(false);
  });
});

describe("buildRevisionTimeline", () => {
  const SR = 44100;

  function revision(overrides: Partial<LoopRevision> = {}): LoopRevision {
    return {
      id: "rev_1", loopId: "loop_1", startFrame: 1000, endFrame: 5000,
      label: "Groove A", createdAt: "t1", createdBy: "manual_edit",
      ...overrides,
    };
  }

  it("returns a single active original entry when no revisions exist yet", () => {
    const l = loop({ activeRevisionId: undefined });
    const timeline = buildRevisionTimeline(l, [], SR);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].id).toBe(null);
    expect(timeline[0].isActive).toBe(true); // undefined-vs-null must still read active
  });

  it("marks the middle revision active by id, and everything else inactive", () => {
    const l = loop({ activeRevisionId: "rev_2" });
    const revisions = [
      revision({ id: "rev_1", createdAt: "t1" }),
      revision({ id: "rev_2", createdAt: "t2" }),
      revision({ id: "rev_3", createdAt: "t3" }),
    ];
    const timeline = buildRevisionTimeline(l, revisions, SR);
    expect(timeline.map((e) => e.isActive)).toEqual([false, false, true, false]);
    expect(timeline.map((e) => e.id)).toEqual([null, "rev_1", "rev_2", "rev_3"]);
  });

  it("orders revisions chronologically regardless of array insertion order", () => {
    const l = loop({ activeRevisionId: undefined });
    const revisions = [
      revision({ id: "rev_late", createdAt: "t3" }),
      revision({ id: "rev_early", createdAt: "t1" }),
      revision({ id: "rev_mid", createdAt: "t2" }),
    ];
    const timeline = buildRevisionTimeline(l, revisions, SR);
    expect(timeline.map((e) => e.id)).toEqual([null, "rev_early", "rev_mid", "rev_late"]);
  });
});

describe("wouldActivationStaleRender", () => {
  function render(overrides: Partial<LoopRenderRecord> = {}): LoopRenderRecord {
    return {
      id: "render_1", loopId: "loop_1", status: "rendered",
      settings: { format: "wav", sampleRate: 44100, bitDepth: 24, channels: 2, normalize: false, bakeBoundaryCrossfade: false },
      sourceFingerprint: "fp1", sourceStartSeconds: 0, sourceEndSeconds: 10,
      ...overrides,
    };
  }

  it("is false when there is no render at all", () => {
    expect(wouldActivationStaleRender(undefined, "rev_2")).toBe(false);
  });

  it("is false when the render's revision and the target both mean 'original'", () => {
    expect(wouldActivationStaleRender(render({ renderedRevisionId: undefined }), null)).toBe(false);
  });

  it("is false when the render already matches the target revision", () => {
    expect(wouldActivationStaleRender(render({ renderedRevisionId: "rev_2" }), "rev_2")).toBe(false);
  });

  it("is true when the render was made from a different revision than the target", () => {
    expect(wouldActivationStaleRender(render({ renderedRevisionId: "rev_1" }), "rev_2")).toBe(true);
  });

  it("is true when the render was made from the original but a real revision is being activated", () => {
    expect(wouldActivationStaleRender(render({ renderedRevisionId: undefined }), "rev_2")).toBe(true);
  });
});
