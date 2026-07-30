import { describe, it, expect } from "vitest";
import { resolveTransitionHintForAdjacency, type TransitionHintResolutionContext } from "./radioWebTransitionHint";
import type { DjTransitionPlan } from "../../data/djTransitionTypes";

function makeCue(regionId: string | null = null): DjTransitionPlan["outgoingCue"] {
  return { seconds: 10, beatIndex: null, barIndex: null, phraseIndex: null, regionId, manuallyAdjusted: false };
}

function makePlan(overrides: Partial<DjTransitionPlan> = {}): DjTransitionPlan {
  return {
    id: "djplan_1",
    playlistId: "playlist_1",
    outgoingSlotId: "slot_out",
    incomingSlotId: "slot_in",
    outgoingTrackId: "track_a",
    incomingTrackId: "track_b",
    outgoingSourceFingerprint: "hash_a",
    incomingSourceFingerprint: "hash_b",
    analysisRevisionKey: "rev_a::rev_b",
    family: "clean_cut",
    trust: "trusted_rhythmic",
    timeBasis: "seconds",
    outgoingCue: makeCue(null),
    incomingCue: makeCue(null),
    overlapBars: null,
    overlapSeconds: 0,
    tempoAdjustmentPercentA: 0,
    tempoAdjustmentPercentB: 0,
    pulseRatio: null,
    automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
    doNotLayer: false,
    warnings: [],
    explanation: [],
    origin: "manual",
    evidenceState: "approved",
    rehearsals: [],
    listeningContext: null,
    activeStemSetId: null,
    activeStemRoles: [],
    approvedAt: "2026-07-24T00:00:00.000Z",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeContext(overrides: Partial<TransitionHintResolutionContext> = {}): TransitionHintResolutionContext {
  return {
    djTransitionMode: "active",
    plan: makePlan(),
    currentOutgoingTrackId: "track_a",
    currentIncomingTrackId: "track_b",
    currentOutgoingSourceFingerprint: "hash_a",
    currentIncomingSourceFingerprint: "hash_b",
    currentAnalysisRevisionKey: "rev_a::rev_b",
    outgoingRegionsNow: [],
    incomingRegionsNow: [],
    activeStemSetLostCurrency: false,
    ...overrides,
  };
}

describe("resolveTransitionHintForAdjacency", () => {
  it("returns the clean_cut hint for a fully valid, approved, non-stale plan", () => {
    expect(resolveTransitionHintForAdjacency(makeContext())).toEqual({ family: "clean_cut", strategy: "clean_cut_hard_cut" });
  });

  it("returns null when djTransitionMode is off", () => {
    expect(resolveTransitionHintForAdjacency(makeContext({ djTransitionMode: "off" }))).toBeNull();
  });

  it("returns null when djTransitionMode is shadow", () => {
    expect(resolveTransitionHintForAdjacency(makeContext({ djTransitionMode: "shadow" }))).toBeNull();
  });

  it("returns null when no plan exists for the adjacency", () => {
    expect(resolveTransitionHintForAdjacency(makeContext({ plan: undefined }))).toBeNull();
  });

  it.each(["proposed", "rehearsed", "revised", "rejected"] as const)("returns null for evidenceState %s (not approved)", (evidenceState) => {
    expect(resolveTransitionHintForAdjacency(makeContext({ plan: makePlan({ evidenceState }) }))).toBeNull();
  });

  it("returns null when the outgoing track identity changed (stale)", () => {
    expect(resolveTransitionHintForAdjacency(makeContext({ currentOutgoingTrackId: "track_other" }))).toBeNull();
  });

  it("returns null when the incoming source fingerprint changed (stale)", () => {
    expect(resolveTransitionHintForAdjacency(makeContext({ currentIncomingSourceFingerprint: "hash_changed" }))).toBeNull();
  });

  it("returns null when the analysis revision changed (stale)", () => {
    expect(resolveTransitionHintForAdjacency(makeContext({ currentAnalysisRevisionKey: "rev_a::rev_new" }))).toBeNull();
  });

  it("returns null for an unsupported family even if otherwise approved and current", () => {
    expect(resolveTransitionHintForAdjacency(makeContext({ plan: makePlan({ family: "reset_bridge" }) }))).toBeNull();
  });

  it("returns null when the plan references a region that no longer resolves", () => {
    const plan = makePlan({ outgoingCue: makeCue("region_1"), incomingCue: makeCue(null) });
    expect(resolveTransitionHintForAdjacency(makeContext({ plan, outgoingRegionsNow: [], incomingRegionsNow: [] }))).toBeNull();
  });

  it("is unaffected by empty region lists when the plan is pure-seconds (no regionId on either cue)", () => {
    const plan = makePlan({ outgoingCue: makeCue(null), incomingCue: makeCue(null) });
    expect(resolveTransitionHintForAdjacency(makeContext({ plan, outgoingRegionsNow: [], incomingRegionsNow: [] }))).toEqual({
      family: "clean_cut",
      strategy: "clean_cut_hard_cut",
    });
  });
});
