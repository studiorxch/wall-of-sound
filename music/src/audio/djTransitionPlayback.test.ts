import { describe, it, expect } from "vitest";
import type { DjTransitionPlan, TransitionFamily } from "../data/djTransitionTypes";
import { compileDjTransition } from "./djTransitionPlayback";

function makePlan(overrides: Partial<DjTransitionPlan> = {}): DjTransitionPlan {
  return {
    id: "dj-1", playlistId: "pl-1", outgoingSlotId: "slot-a", incomingSlotId: "slot-b",
    outgoingTrackId: "track-a", incomingTrackId: "track-b",
    outgoingSourceFingerprint: "fp-a", incomingSourceFingerprint: "fp-b", analysisRevisionKey: "rev-1",
    family: "clean_cut", trust: "manually_authored", timeBasis: "seconds",
    outgoingCue: { seconds: 200, beatIndex: null, barIndex: null, phraseIndex: null, regionId: "out-region", manuallyAdjusted: false },
    incomingCue: { seconds: 0, beatIndex: null, barIndex: null, phraseIndex: null, regionId: "in-region", manuallyAdjusted: false },
    overlapBars: null, overlapSeconds: 0.5, tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: null,
    automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
    doNotLayer: true, warnings: [], explanation: [],
    origin: "manual", evidenceState: "approved", rehearsals: [], listeningContext: null,
    activeStemSetId: null, activeStemRoles: [],
    approvedAt: "2026-07-22T00:00:00Z", createdAt: "2026-07-22T00:00:00Z", updatedAt: "2026-07-22T00:00:00Z",
    ...overrides,
  };
}

describe("compileDjTransition", () => {
  it("compiles a clean_cut plan to the clean_cut_hard_cut strategy", () => {
    const result = compileDjTransition(makePlan());
    expect(result.compiled).toBe(true);
    if (result.compiled) {
      expect(result.strategy).toBe("clean_cut_hard_cut");
      expect(result.djPlanId).toBe("dj-1");
    }
  });

  it("fails to compile every family this build has no real execution path for", () => {
    const unsupported: TransitionFamily[] = [
      "phrase_eq_blend", "short_rhythmic_blend", "loop_assisted_handoff", "stem_assisted_transition",
      "effect_handoff", "reset_bridge", "do_not_place_adjacent", "free_time_perceptual_handoff",
    ];
    for (const family of unsupported) {
      const result = compileDjTransition(makePlan({ family }));
      expect(result.compiled).toBe(false);
      if (!result.compiled) expect(result.reason).toContain(family);
    }
  });
});
