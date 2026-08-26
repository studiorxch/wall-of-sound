import { describe, it, expect } from "vitest";
import { getAnalysisDisplayState, getAnalysisDisplayLabel, ANALYSIS_DISPLAY_LABELS } from "./analysisStatusDisplay";
import type { AnalysisStatus } from "../data/trackTypes";

describe("analysisStatusDisplay — Step C 6-bucket presentation", () => {
  const cases: [AnalysisStatus | undefined, string][] = [
    [undefined, "not_analyzed"],
    ["not_analyzed", "not_analyzed"],
    ["queued", "queued"],
    ["analyzing", "analyzing"],
    ["review_needed", "needs_review"],
    ["stale", "needs_review"],
    ["partial", "ready"],
    ["analyzed", "ready"],
    ["failed", "failed"],
  ];

  it.each(cases)("maps analysisStatus=%s to display state %s", (analysisStatus, expected) => {
    expect(getAnalysisDisplayState({ analysisStatus })).toBe(expected);
  });

  it("partial buckets under Ready, not Needs review — usable BPM/key data shouldn't nag by default", () => {
    expect(getAnalysisDisplayState({ analysisStatus: "partial" })).toBe("ready");
  });

  it("label lookup matches the display state", () => {
    expect(getAnalysisDisplayLabel({ analysisStatus: "failed" })).toBe("Failed");
    expect(getAnalysisDisplayLabel({ analysisStatus: "queued" })).toBe("Queued");
  });

  it("every display state has a label", () => {
    for (const state of Object.keys(ANALYSIS_DISPLAY_LABELS)) {
      expect(typeof ANALYSIS_DISPLAY_LABELS[state as keyof typeof ANALYSIS_DISPLAY_LABELS]).toBe("string");
    }
  });
});
