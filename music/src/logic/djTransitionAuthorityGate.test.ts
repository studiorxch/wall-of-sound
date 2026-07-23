import { describe, it, expect } from "vitest";
import type { DjTransitionPlan } from "../data/djTransitionTypes";
import type { DeckPlaybackState } from "../audio/dualDeckTypes";
import type { TransitionRegionCandidate } from "./djTransitionRegions";
import {
  evaluateDjTransitionAuthority, SUPPORTED_ACTIVE_TRANSITION_FAMILIES,
  isOutgoingDeckReadyForCleanCut, isIncomingDeckReadyToStart,
  type DjTransitionAuthorityContext,
} from "./djTransitionAuthorityGate";

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

function makeRegion(id: string): TransitionRegionCandidate {
  return {
    regionId: id, role: "hard_ending_handoff", startSeconds: 0, endSeconds: 10,
    availableBeatsSeconds: [], availableBarsSeconds: [], availablePhrasesSeconds: [],
    rhythmicTrust: "free_time_or_incompatible", bassActivitySummary: null, foregroundActivitySummary: null,
    localLoudness: null, localEnergy: null, loopSuitability: null, sourceExplanation: "test",
  };
}

function baseContext(overrides: Partial<DjTransitionAuthorityContext> = {}): DjTransitionAuthorityContext {
  return {
    djTransitionMode: "active",
    plan: makePlan(),
    currentOutgoingTrackId: "track-a",
    currentIncomingTrackId: "track-b",
    currentOutgoingSourceFingerprint: "fp-a",
    currentIncomingSourceFingerprint: "fp-b",
    currentAnalysisRevisionKey: "rev-1",
    outgoingRegionsNow: [makeRegion("out-region")],
    incomingRegionsNow: [makeRegion("in-region")],
    activeStemSetLostCurrency: false,
    outgoingDeckState: "playing",
    incomingDeckState: "ready",
    ...overrides,
  };
}

describe("evaluateDjTransitionAuthority", () => {
  it("authorizes a fully valid, approved, supported, non-stale plan with ready decks", () => {
    const result = evaluateDjTransitionAuthority(baseContext());
    expect(result.authorized).toBe(true);
    expect(result.gate).toBe("authorized");
  });

  it("rejects when mode is not active, even with an otherwise perfect plan", () => {
    expect(evaluateDjTransitionAuthority(baseContext({ djTransitionMode: "shadow" })).gate).toBe("mode_not_active");
    expect(evaluateDjTransitionAuthority(baseContext({ djTransitionMode: "off" })).gate).toBe("mode_not_active");
  });

  it("rejects when no plan exists for this pair", () => {
    expect(evaluateDjTransitionAuthority(baseContext({ plan: undefined })).gate).toBe("no_plan_for_pair");
  });

  it("rejects a proposed (unapproved) plan — automatic resolution alone never authorizes execution", () => {
    const result = evaluateDjTransitionAuthority(baseContext({ plan: makePlan({ evidenceState: "proposed" }) }));
    expect(result.authorized).toBe(false);
    expect(result.gate).toBe("not_approved");
  });

  it("rejects a rehearsed or revised plan just as strictly as proposed — only approved passes", () => {
    expect(evaluateDjTransitionAuthority(baseContext({ plan: makePlan({ evidenceState: "rehearsed" }) })).gate).toBe("not_approved");
    expect(evaluateDjTransitionAuthority(baseContext({ plan: makePlan({ evidenceState: "revised" }) })).gate).toBe("not_approved");
  });

  it("rejects a rejected-evidence-state plan", () => {
    expect(evaluateDjTransitionAuthority(baseContext({ plan: makePlan({ evidenceState: "rejected" }) })).gate).toBe("not_approved");
  });

  it("rejects when the current track no longer matches the plan (a migrated-stale or swapped pair)", () => {
    const result = evaluateDjTransitionAuthority(baseContext({ currentOutgoingTrackId: "track-different" }));
    expect(result.gate).toBe("stale");
  });

  it("rejects when source fingerprints have changed", () => {
    expect(evaluateDjTransitionAuthority(baseContext({ currentOutgoingSourceFingerprint: "fp-changed" })).gate).toBe("stale");
  });

  it("rejects when the analysis revision key has changed", () => {
    expect(evaluateDjTransitionAuthority(baseContext({ currentAnalysisRevisionKey: "rev-2" })).gate).toBe("stale");
  });

  it("rejects when a selected region no longer exists for the current source audio", () => {
    const result = evaluateDjTransitionAuthority(baseContext({ outgoingRegionsNow: [makeRegion("some-other-region")] }));
    expect(["stale", "regions_invalid"]).toContain(result.gate);
  });

  it("rejects any family not in the explicit supported whitelist — loop/effect/stem/phrase/free-time all blocked", () => {
    const unsupportedFamilies = ["phrase_eq_blend", "short_rhythmic_blend", "loop_assisted_handoff", "stem_assisted_transition", "effect_handoff", "reset_bridge", "do_not_place_adjacent", "free_time_perceptual_handoff"] as const;
    for (const family of unsupportedFamilies) {
      const result = evaluateDjTransitionAuthority(baseContext({ plan: makePlan({ family, evidenceState: "approved" }) }));
      expect(result.authorized).toBe(false);
      expect(result.gate).toBe("unsupported_family");
    }
  });

  it("confirms clean_cut is the only family in the supported whitelist at this checkpoint", () => {
    expect([...SUPPORTED_ACTIVE_TRANSITION_FAMILIES]).toEqual(["clean_cut"]);
  });

  describe("deck-specific readiness — outgoing and incoming are NOT the same predicate", () => {
    it("accepts ready, playing, or naturally ended for the OUTGOING deck of a clean_cut", () => {
      for (const state of ["ready", "playing", "ended"] as const) {
        expect(isOutgoingDeckReadyForCleanCut(state)).toBe(true);
      }
    });

    it("rejects empty, loading, paused, or error for the outgoing deck", () => {
      for (const state of ["empty", "loading", "paused", "error"] as const) {
        expect(isOutgoingDeckReadyForCleanCut(state)).toBe(false);
      }
    });

    it("accepts only ready or playing for the INCOMING deck — never ended", () => {
      expect(isIncomingDeckReadyToStart("ready")).toBe(true);
      expect(isIncomingDeckReadyToStart("playing")).toBe(true);
      expect(isIncomingDeckReadyToStart("ended")).toBe(false);
    });

    it("rejects empty (unloaded), error (failed/missing source), loading, and paused for the incoming deck", () => {
      for (const state of ["empty", "loading", "paused", "error"] as const) {
        expect(isIncomingDeckReadyToStart(state)).toBe(false);
      }
    });

    it("authorizes when the outgoing deck has naturally ended and the incoming deck is ready — the expected clean_cut trigger shape", () => {
      const result = evaluateDjTransitionAuthority(baseContext({ outgoingDeckState: "ended", incomingDeckState: "ready" }));
      expect(result.authorized).toBe(true);
      expect(result.gate).toBe("authorized");
    });

    it("fails with a precise outgoing_deck_not_ready gate — never broadened to also mask an incoming-deck problem", () => {
      const result = evaluateDjTransitionAuthority(baseContext({ outgoingDeckState: "error" }));
      expect(result.authorized).toBe(false);
      expect(result.gate).toBe("outgoing_deck_not_ready");
      expect(result.reason).toContain("error");
    });

    const incomingFailureStates: { state: DeckPlaybackState; label: string }[] = [
      { state: "ended", label: "already finished playing (ended)" },
      { state: "empty", label: "never loaded (empty)" },
      { state: "error", label: "failed / missing source (error)" },
      { state: "loading", label: "still loading" },
    ];
    for (const { state, label } of incomingFailureStates) {
      it(`fails authority with a precise incoming_deck_not_ready diagnostic when the incoming deck is ${label} — even though the outgoing deck is fine`, () => {
        const result = evaluateDjTransitionAuthority(baseContext({ outgoingDeckState: "ended", incomingDeckState: state }));
        expect(result.authorized).toBe(false);
        expect(result.gate).toBe("incoming_deck_not_ready");
        expect(result.reason).toContain(state);
      });
    }

    it("never reports the generic decks_not_ready gate anymore — always one of the two precise gates", () => {
      const outgoingFailure = evaluateDjTransitionAuthority(baseContext({ outgoingDeckState: "empty" }));
      const incomingFailure = evaluateDjTransitionAuthority(baseContext({ incomingDeckState: "empty" }));
      expect(outgoingFailure.gate).not.toBe("decks_not_ready");
      expect(incomingFailure.gate).not.toBe("decks_not_ready");
      expect(outgoingFailure.gate).toBe("outgoing_deck_not_ready");
      expect(incomingFailure.gate).toBe("incoming_deck_not_ready");
    });
  });

  it("rejects when a stem-assisted plan lost its current stem set, even if otherwise approved (defense in depth alongside the family whitelist)", () => {
    const stemPlan = makePlan({ family: "stem_assisted_transition", evidenceState: "approved", activeStemSetId: "set-1" });
    const result = evaluateDjTransitionAuthority(baseContext({ plan: stemPlan, activeStemSetLostCurrency: true }));
    expect(result.authorized).toBe(false);
  });
});
