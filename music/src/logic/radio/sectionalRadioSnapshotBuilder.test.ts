import { describe, it, expect } from "vitest";
import { buildSectionalRadioPromotionSnapshot, type BuildSectionalRadioPromotionSnapshotInput } from "./sectionalRadioSnapshotBuilder";
import type { LoopAsset } from "../../data/loopTypes";

function baseInput(overrides: Partial<BuildSectionalRadioPromotionSnapshotInput> = {}): BuildSectionalRadioPromotionSnapshotInput {
  return {
    trackId: "track_a",
    sourceFingerprint: "fp_track_a_120.5",
    startFrame: 44100,
    endFrame: 88200,
    sourceTotalFrames: 1_000_000,
    sampleRate: 44100,
    alignmentMode: "grid",
    isSelectionStale: false,
    capturedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildSectionalRadioPromotionSnapshot", () => {
  it("builds a valid snapshot for a fresh selection with no backing loop yet", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput());
    expect(issues).toEqual([]);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.sourceTrackId).toBe("track_a");
    expect(snapshot?.sourceMediaIdentity).toBe("fp_track_a_120.5");
    expect(snapshot?.existingLoopId).toBeUndefined();
    expect(snapshot?.activeLoopRevisionId).toBeUndefined();
    expect(snapshot?.startFrame).toBe(44100);
    expect(snapshot?.endFrame).toBe(88200);
    expect(snapshot?.durationSeconds).toBeCloseTo(1, 5);
    expect(snapshot?.selectionReviewState).toBe("reviewed");
  });

  it("builds a valid snapshot when the selection already backs an approved loop, capturing its active revision id", () => {
    const loop: LoopAsset = {
      id: "loop_1", sourceKind: "track", sourceTrackId: "track_a",
      startSeconds: 1, endSeconds: 2, durationSeconds: 1,
      status: "approved", boundarySource: "manual", contentClass: "unknown",
      generationMode: "manual_only", provisional: false, sectionLabel: "Manual",
      seamlessnessScore: 0.5, confidence: 0.5, createdAt: "x", updatedAt: "x",
      activeRevisionId: "rev_1",
    } as LoopAsset;
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ existingLoopId: "loop_1", existingLoop: loop }));
    expect(issues).toEqual([]);
    expect(snapshot?.existingLoopId).toBe("loop_1");
    expect(snapshot?.activeLoopRevisionId).toBe("rev_1");
  });

  it("treats a null activeRevisionId (implicit original revision) as null, not undefined", () => {
    const loop: LoopAsset = {
      id: "loop_1", sourceKind: "track", sourceTrackId: "track_a",
      startSeconds: 1, endSeconds: 2, durationSeconds: 1,
      status: "approved", boundarySource: "manual", contentClass: "unknown",
      generationMode: "manual_only", provisional: false, sectionLabel: "Manual",
      seamlessnessScore: 0.5, confidence: 0.5, createdAt: "x", updatedAt: "x",
    } as LoopAsset;
    const { snapshot } = buildSectionalRadioPromotionSnapshot(baseInput({ existingLoopId: "loop_1", existingLoop: loop }));
    expect(snapshot?.activeLoopRevisionId).toBeNull();
  });

  it("rejects a missing source track", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ trackId: undefined }));
    expect(snapshot).toBeNull();
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_MISSING_SOURCE_TRACK")).toBe(true);
  });

  it("rejects a missing source fingerprint without falling back to trackId", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ sourceFingerprint: undefined }));
    expect(snapshot).toBeNull();
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_MISSING_SOURCE")).toBe(true);
  });

  it("rejects a missing selection", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ startFrame: undefined, endFrame: undefined }));
    expect(snapshot).toBeNull();
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_MISSING_SELECTION")).toBe(true);
  });

  it("rejects non-finite bounds", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ endFrame: Number.NaN }));
    expect(snapshot).toBeNull();
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_INVALID_BOUNDS")).toBe(true);
  });

  it("rejects reversed bounds", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ startFrame: 88200, endFrame: 44100 }));
    expect(snapshot).toBeNull();
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_INVALID_BOUNDS")).toBe(true);
  });

  it("rejects zero-duration selections distinctly from reversed bounds", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ startFrame: 44100, endFrame: 44100 }));
    expect(snapshot).toBeNull();
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_ZERO_DURATION")).toBe(true);
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_INVALID_BOUNDS")).toBe(false);
  });

  it("rejects bounds outside the decoded track range", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ endFrame: 2_000_000 }));
    expect(snapshot).toBeNull();
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_BOUNDS_OUT_OF_RANGE")).toBe(true);
  });

  it("rejects a stale/unreviewed selection", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ isSelectionStale: true }));
    expect(snapshot).toBeNull();
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_SELECTION_STALE")).toBe(true);
  });

  it("rejects a selection whose loopId no longer resolves to a real loop", () => {
    const { snapshot, issues } = buildSectionalRadioPromotionSnapshot(baseInput({ existingLoopId: "loop_missing", existingLoop: undefined }));
    expect(snapshot).toBeNull();
    expect(issues.some((i) => i.code === "SECTIONAL_RADIO_MISSING_LOOP_REFERENCE")).toBe(true);
  });

  it("captures frame-exact bounds, not rounded seconds", () => {
    const { snapshot } = buildSectionalRadioPromotionSnapshot(baseInput({ startFrame: 44101, endFrame: 88199 }));
    expect(snapshot?.startFrame).toBe(44101);
    expect(snapshot?.endFrame).toBe(88199);
  });
});
