import { describe, it, expect } from "vitest";
import { isRenderStale } from "./loopRenderStaleness";
import type { LoopRenderRecord } from "../../data/loopRenderTypes";
import { defaultRenderSettings } from "../../data/loopRenderTypes";

function makeRecord(overrides: Partial<LoopRenderRecord> = {}): LoopRenderRecord {
  return {
    id: "render_1", loopId: "loop_1", status: "rendered",
    settings: defaultRenderSettings(44100, 2),
    sourceFingerprint: "fp1", sourceStartSeconds: 10, sourceEndSeconds: 18,
    ...overrides,
  };
}

describe("isRenderStale", () => {
  it("is not stale when nothing changed", () => {
    const r = makeRecord();
    expect(isRenderStale(r, {
      currentSourceFingerprint: "fp1", currentStartSeconds: 10, currentEndSeconds: 18,
      currentSettings: defaultRenderSettings(44100, 2),
    })).toBe(false);
  });

  it("marks stale when the source fingerprint changes", () => {
    const r = makeRecord();
    expect(isRenderStale(r, {
      currentSourceFingerprint: "fp2", currentStartSeconds: 10, currentEndSeconds: 18,
      currentSettings: defaultRenderSettings(44100, 2),
    })).toBe(true);
  });

  it("marks stale when loop boundaries change", () => {
    const r = makeRecord();
    expect(isRenderStale(r, {
      currentSourceFingerprint: "fp1", currentStartSeconds: 11, currentEndSeconds: 18,
      currentSettings: defaultRenderSettings(44100, 2),
    })).toBe(true);
  });

  it("marks stale when render settings change", () => {
    const r = makeRecord();
    const changedSettings = { ...defaultRenderSettings(44100, 2), bitDepth: 16 as const };
    expect(isRenderStale(r, {
      currentSourceFingerprint: "fp1", currentStartSeconds: 10, currentEndSeconds: 18,
      currentSettings: changedSettings,
    })).toBe(true);
  });

  it("a not_rendered record is never stale", () => {
    const r = makeRecord({ status: "not_rendered" });
    expect(isRenderStale(r, {
      currentSourceFingerprint: "fp-different", currentStartSeconds: 999, currentEndSeconds: 1000,
      currentSettings: defaultRenderSettings(8000, 1),
    })).toBe(false);
  });

  it("marks stale when the active revision no longer matches what was rendered", () => {
    const r = makeRecord({ renderedRevisionId: "rev_v1" });
    expect(isRenderStale(r, {
      currentSourceFingerprint: "fp1", currentStartSeconds: 10, currentEndSeconds: 18,
      currentSettings: defaultRenderSettings(44100, 2), currentRevisionId: "rev_v2",
    })).toBe(true);
  });

  it("is not stale when the active revision still matches what was rendered", () => {
    const r = makeRecord({ renderedRevisionId: "rev_v1" });
    expect(isRenderStale(r, {
      currentSourceFingerprint: "fp1", currentStartSeconds: 10, currentEndSeconds: 18,
      currentSettings: defaultRenderSettings(44100, 2), currentRevisionId: "rev_v1",
    })).toBe(false);
  });

  it("does not retroactively flag a render made before provenance stamping existed", () => {
    const r = makeRecord(); // no renderedRevisionId at all — legacy record
    expect(isRenderStale(r, {
      currentSourceFingerprint: "fp1", currentStartSeconds: 10, currentEndSeconds: 18,
      currentSettings: defaultRenderSettings(44100, 2), currentRevisionId: "rev_v7",
    })).toBe(false);
  });

  it("marks stale when the grid or segmentation revision no longer matches", () => {
    const r = makeRecord({ renderedGridRevisionId: "grid_1", renderedSegmentationRevisionId: "seg_1" });
    expect(isRenderStale(r, {
      currentSourceFingerprint: "fp1", currentStartSeconds: 10, currentEndSeconds: 18,
      currentSettings: defaultRenderSettings(44100, 2),
      currentGridRevisionId: "grid_2", currentSegmentationRevisionId: "seg_1",
    })).toBe(true);
  });
});
