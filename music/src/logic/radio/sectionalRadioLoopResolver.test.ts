import { describe, it, expect } from "vitest";
import { resolveSectionalRadioSourceLoopAsset } from "./sectionalRadioLoopResolver";
import type { LoopAsset, LoopRevision } from "../../data/loopTypes";
import type { SectionalRadioPromotionSnapshot } from "../../data/sectionalRadioBridgeTypes";

const SAMPLE_RATE = 44100;

function loop(overrides: Partial<LoopAsset>): LoopAsset {
  return {
    id: "loop_default", sourceKind: "track", sourceTrackId: "track_a",
    startSeconds: 1, endSeconds: 2, durationSeconds: 1,
    status: "approved", boundarySource: "manual", contentClass: "unknown",
    generationMode: "manual_only", provisional: false, sectionLabel: "Manual",
    seamlessnessScore: 0.5, confidence: 0.5, createdAt: "x", updatedAt: "x",
    ...overrides,
  } as LoopAsset;
}

function snapshot(overrides: Partial<SectionalRadioPromotionSnapshot> = {}): SectionalRadioPromotionSnapshot {
  return {
    sourceTrackId: "track_a",
    sourceMediaIdentity: "fp_a",
    startFrame: 44100,
    endFrame: 88200,
    sampleRate: SAMPLE_RATE,
    durationSeconds: 1,
    alignmentMode: "grid",
    selectionReviewState: "reviewed",
    capturedAt: "x",
    ...overrides,
  };
}

describe("resolveSectionalRadioSourceLoopAsset", () => {
  it("reuses an exact frame-matching approved loop", () => {
    const l = loop({ id: "loop_1", startSeconds: 1, endSeconds: 2, status: "approved" });
    const result = resolveSectionalRadioSourceLoopAsset(snapshot(), [l], [], SAMPLE_RATE);
    expect(result).toEqual({ mode: "reuse_approved", loopId: "loop_1" });
  });

  it("flags an exact frame-matching non-approved loop for approval instead of creating a new one", () => {
    const l = loop({ id: "loop_1", startSeconds: 1, endSeconds: 2, status: "candidate" });
    const result = resolveSectionalRadioSourceLoopAsset(snapshot(), [l], [], SAMPLE_RATE);
    expect(result).toEqual({ mode: "reuse_needs_approval", loopId: "loop_1" });
  });

  it("creates new when no loop exists for this track", () => {
    const result = resolveSectionalRadioSourceLoopAsset(snapshot(), [], [], SAMPLE_RATE);
    expect(result).toEqual({ mode: "create_new" });
  });

  it("does not match a loop on the same track with different bounds", () => {
    const l = loop({ id: "loop_1", startSeconds: 5, endSeconds: 6, status: "approved" });
    const result = resolveSectionalRadioSourceLoopAsset(snapshot(), [l], [], SAMPLE_RATE);
    expect(result).toEqual({ mode: "create_new" });
  });

  it("does not match a loop with identical bounds on a different track", () => {
    const l = loop({ id: "loop_1", sourceTrackId: "track_b", startSeconds: 1, endSeconds: 2, status: "approved" });
    const result = resolveSectionalRadioSourceLoopAsset(snapshot(), [l], [], SAMPLE_RATE);
    expect(result).toEqual({ mode: "create_new" });
  });

  it("uses frame-exact comparison via the active revision, not the loop's frozen original seconds", () => {
    // Frozen seconds (9s-10s) would NOT match the snapshot; only the active
    // revision's frames (44100-88200) do — proves the resolver goes through
    // resolveActiveLoopBoundsFrames, not loop.startSeconds directly.
    const lMismatchedFrozen = loop({ id: "loop_2", startSeconds: 9, endSeconds: 10, status: "approved", activeRevisionId: "rev_2" });
    const revisions: LoopRevision[] = [
      { id: "rev_2", loopId: "loop_2", startFrame: 44100, endFrame: 88200, label: "v2", createdAt: "x", createdBy: "manual_edit" },
    ];
    const result = resolveSectionalRadioSourceLoopAsset(snapshot(), [lMismatchedFrozen], revisions, SAMPLE_RATE);
    expect(result).toEqual({ mode: "reuse_approved", loopId: "loop_2" });
  });

  it("prefers the selection's own existingLoopId when it still matches, over scanning for another candidate", () => {
    const target = loop({ id: "loop_target", startSeconds: 1, endSeconds: 2, status: "candidate" });
    const otherApproved = loop({ id: "loop_other", startSeconds: 1, endSeconds: 2, status: "approved" });
    const result = resolveSectionalRadioSourceLoopAsset(
      snapshot({ existingLoopId: "loop_target" }),
      [target, otherApproved],
      [],
      SAMPLE_RATE,
    );
    expect(result).toEqual({ mode: "reuse_needs_approval", loopId: "loop_target" });
  });

  it("falls back to scanning when existingLoopId no longer matches the current bounds", () => {
    const stale = loop({ id: "loop_stale", startSeconds: 9, endSeconds: 10, status: "approved" });
    const matching = loop({ id: "loop_matching", startSeconds: 1, endSeconds: 2, status: "approved" });
    const result = resolveSectionalRadioSourceLoopAsset(
      snapshot({ existingLoopId: "loop_stale" }),
      [stale, matching],
      [],
      SAMPLE_RATE,
    );
    expect(result).toEqual({ mode: "reuse_approved", loopId: "loop_matching" });
  });

  it("resolves deterministically across multiple matching candidates by preferring approved", () => {
    const a = loop({ id: "loop_a", startSeconds: 1, endSeconds: 2, status: "candidate" });
    const b = loop({ id: "loop_b", startSeconds: 1, endSeconds: 2, status: "approved" });
    const result = resolveSectionalRadioSourceLoopAsset(snapshot(), [a, b], [], SAMPLE_RATE);
    expect(result).toEqual({ mode: "reuse_approved", loopId: "loop_b" });
  });
});
