import { describe, it, expect } from "vitest";
import { isLegalTrackAnalysisStateTransition } from "./trackAnalysisStateMachine";

describe("trackAnalysisStateMachine — Step C transition guard", () => {
  it("allows the normal forward pipeline", () => {
    expect(isLegalTrackAnalysisStateTransition("not_analyzed", "queued")).toBe(true);
    expect(isLegalTrackAnalysisStateTransition("queued", "analyzing")).toBe(true);
    expect(isLegalTrackAnalysisStateTransition("analyzing", "analyzed")).toBe(true);
    expect(isLegalTrackAnalysisStateTransition("analyzing", "partial")).toBe(true);
    expect(isLegalTrackAnalysisStateTransition("analyzing", "failed")).toBe(true);
    expect(isLegalTrackAnalysisStateTransition("analyzing", "review_needed")).toBe(true);
  });

  it("allows interrupted-analysis recovery back to not_analyzed from queued or analyzing", () => {
    expect(isLegalTrackAnalysisStateTransition("queued", "not_analyzed")).toBe(true);
    expect(isLegalTrackAnalysisStateTransition("analyzing", "not_analyzed")).toBe(true);
  });

  it("allows re-queue from every terminal state", () => {
    for (const from of ["analyzed", "partial", "stale", "review_needed", "failed"] as const) {
      expect(isLegalTrackAnalysisStateTransition(from, "queued")).toBe(true);
    }
  });

  it("rejects illegal jumps", () => {
    expect(isLegalTrackAnalysisStateTransition("not_analyzed", "analyzing")).toBe(false);
    expect(isLegalTrackAnalysisStateTransition("not_analyzed", "analyzed")).toBe(false);
    expect(isLegalTrackAnalysisStateTransition("failed", "analyzed")).toBe(false);
    expect(isLegalTrackAnalysisStateTransition("queued", "failed")).toBe(false);
  });
});
