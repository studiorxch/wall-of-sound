import { describe, it, expect } from "vitest";
import { isDraftStale } from "./draftSelectionStaleness";
import type { DraftLoopSelection } from "../../data/loopTypes";

function draft(overrides: Partial<DraftLoopSelection> = {}): DraftLoopSelection {
  return {
    sourceTrackId: "t1", startFrame: 100, endFrame: 5000, snapMode: "bar",
    source: "manual", updatedAt: "t0",
    sourceFingerprintAtSave: "fp1", durationSecondsAtSave: 120, gridRevisionIdAtSave: "grid_1",
    segmentationRevisionIdAtSave: "seg_1",
    ...overrides,
  };
}

const baseline = { sourceFingerprint: "fp1", durationSeconds: 120, gridRevisionId: "grid_1", segmentationRevisionId: "seg_1" };

describe("isDraftStale", () => {
  it("is not stale when nothing has changed", () => {
    expect(isDraftStale(draft(), baseline)).toBe(false);
  });

  it("is stale when the source fingerprint changes", () => {
    expect(isDraftStale(draft(), { ...baseline, sourceFingerprint: "fp2" })).toBe(true);
  });

  it("is stale when the source duration changes", () => {
    expect(isDraftStale(draft(), { ...baseline, durationSeconds: 121 })).toBe(true);
  });

  it("is stale when the grid revision changes", () => {
    expect(isDraftStale(draft(), { ...baseline, gridRevisionId: "grid_2" })).toBe(true);
  });

  it("is stale for a segment-sourced draft when the segmentation revision changes", () => {
    expect(isDraftStale(draft({ source: "segment" }), { ...baseline, segmentationRevisionId: "seg_2" })).toBe(true);
  });

  it("ignores segmentation revision changes for a manual draft", () => {
    expect(isDraftStale(draft({ source: "manual" }), { ...baseline, segmentationRevisionId: "seg_2" })).toBe(false);
  });

  it("never flags staleness when no baseline was ever stamped (legacy draft)", () => {
    const legacy: DraftLoopSelection = {
      sourceTrackId: "t1", startFrame: 0, endFrame: 100, snapMode: "off", source: "manual", updatedAt: "t0",
    };
    expect(isDraftStale(legacy, { ...baseline, sourceFingerprint: "totally-different" })).toBe(false);
  });
});
