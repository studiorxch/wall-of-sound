import { describe, it, expect } from "vitest";
import type { DjTransitionPlan } from "../data/djTransitionTypes";
import { isDjTransitionPlanStale } from "./djTransitionStaleness";

function makePlan(overrides: Partial<DjTransitionPlan> = {}): DjTransitionPlan {
  return {
    id: "dj-1", playlistId: "pl-1", outgoingSlotId: "slot-a", incomingSlotId: "slot-b",
    outgoingTrackId: "track-a", incomingTrackId: "track-b",
    outgoingSourceFingerprint: "fp-a", incomingSourceFingerprint: "fp-b",
    analysisRevisionKey: "rev-1",
    family: "clean_cut", trust: "manually_authored", timeBasis: "seconds",
    outgoingCue: { seconds: 200, beatIndex: null, barIndex: null, phraseIndex: null, regionId: "region-1", manuallyAdjusted: false },
    incomingCue: { seconds: 0, beatIndex: null, barIndex: null, phraseIndex: null, regionId: "region-2", manuallyAdjusted: false },
    overlapBars: null, overlapSeconds: 4,
    tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: null,
    automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
    doNotLayer: false, warnings: [], explanation: [],
    origin: "manual", evidenceState: "approved", rehearsals: [], listeningContext: null,
    activeStemSetId: null, activeStemRoles: [],
    approvedAt: "2026-07-22T00:00:00Z", createdAt: "2026-07-22T00:00:00Z", updatedAt: "2026-07-22T00:00:00Z",
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof isDjTransitionPlanStale>[0]> = {}) {
  return {
    plan: makePlan(),
    currentOutgoingTrackId: "track-a",
    currentIncomingTrackId: "track-b",
    currentOutgoingSourceFingerprint: "fp-a",
    currentIncomingSourceFingerprint: "fp-b",
    currentAnalysisRevisionKey: "rev-1",
    selectedRegionsStillExist: true,
    activeStemSetLostCurrency: false,
    ...overrides,
  };
}

describe("isDjTransitionPlanStale", () => {
  it("is not stale when nothing changed", () => {
    expect(isDjTransitionPlanStale(baseInput())).toBe(false);
  });

  it("goes stale when either slot points to a different track", () => {
    expect(isDjTransitionPlanStale(baseInput({ currentOutgoingTrackId: "track-other" }))).toBe(true);
    expect(isDjTransitionPlanStale(baseInput({ currentIncomingTrackId: "track-other" }))).toBe(true);
  });

  it("goes stale when decoded source identity changes", () => {
    expect(isDjTransitionPlanStale(baseInput({ currentOutgoingSourceFingerprint: "fp-a-changed" }))).toBe(true);
  });

  it("fails closed when a fingerprint is unknown/empty rather than assuming unchanged", () => {
    expect(isDjTransitionPlanStale(baseInput({ currentOutgoingSourceFingerprint: "" }))).toBe(true);
    expect(isDjTransitionPlanStale(baseInput({ plan: makePlan({ outgoingSourceFingerprint: "" }) }))).toBe(true);
  });

  it("goes stale when the analysis revision key changes", () => {
    expect(isDjTransitionPlanStale(baseInput({ currentAnalysisRevisionKey: "rev-2" }))).toBe(true);
  });

  it("goes stale when the selected candidate region disappears", () => {
    expect(isDjTransitionPlanStale(baseInput({ selectedRegionsStillExist: false }))).toBe(true);
  });

  it("goes stale when a stem-assisted plan loses its current stem set, but not for other families", () => {
    const stemPlan = makePlan({ family: "stem_assisted_transition", activeStemSetId: "set-1" });
    expect(isDjTransitionPlanStale(baseInput({ plan: stemPlan, activeStemSetLostCurrency: true }))).toBe(true);
    expect(isDjTransitionPlanStale(baseInput({ activeStemSetLostCurrency: true }))).toBe(false);
  });

  it("metadata-only changes are not represented in this input at all — nothing here can mark a plan stale from title/artist/tag edits", () => {
    // Sanity check: an unrelated field change to the plan itself (e.g. a
    // manual explanation edit) doesn't affect staleness when everything
    // this function actually checks is unchanged.
    const plan = makePlan({ explanation: ["operator note added"] });
    expect(isDjTransitionPlanStale(baseInput({ plan }))).toBe(false);
  });
});
