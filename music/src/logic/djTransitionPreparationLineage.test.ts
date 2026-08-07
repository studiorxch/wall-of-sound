import { describe, expect, it } from "vitest";
import type { DjTransitionPlan, TransitionPreparationCueReference } from "../data/djTransitionTypes";
import {
  validateTransitionPreparationLineage,
  type CurrentTransitionPreparationCueSnapshot,
  type TransitionPreparationLineageContext,
} from "./djTransitionPreparationLineage";

const outgoingReference: TransitionPreparationCueReference = {
  preparationId: "prep-a", preparationRevisionKey: "prep-rev-a", cueId: "cue-out",
  role: "MIX_OUT", basisGridRevisionId: "grid-a",
};
const incomingReference: TransitionPreparationCueReference = {
  preparationId: "prep-b", preparationRevisionKey: "prep-rev-b", cueId: "cue-in",
  role: "MAIN_ENTRY", basisGridRevisionId: "grid-b",
};

function plan(lineage: "both" | "outgoing" | "none" = "both"): DjTransitionPlan {
  return {
    id: "plan", playlistId: "playlist", outgoingSlotId: "slot-a", incomingSlotId: "slot-b",
    outgoingTrackId: "track-a", incomingTrackId: "track-b", outgoingSourceFingerprint: "source-a",
    incomingSourceFingerprint: "source-b", analysisRevisionKey: "analysis-rev", family: "clean_cut",
    trust: "manually_authored", timeBasis: "seconds",
    outgoingCue: { seconds: 12.8, beatIndex: null, barIndex: 32, phraseIndex: null, regionId: null, manuallyAdjusted: false,
      preparationLineage: lineage === "none" ? undefined : outgoingReference },
    incomingCue: { seconds: 6.4, beatIndex: null, barIndex: 16, phraseIndex: null, regionId: null, manuallyAdjusted: false,
      preparationLineage: lineage === "both" ? incomingReference : undefined },
    overlapBars: null, overlapSeconds: 0, tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: null,
    automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
    doNotLayer: true, warnings: [], explanation: [], origin: "automatic", evidenceState: "proposed", rehearsals: [],
    listeningContext: null, activeStemSetId: null, activeStemRoles: [], approvedAt: null,
    createdAt: "2026-08-07T00:00:00Z", updatedAt: "2026-08-07T00:00:00Z",
  };
}

function snapshot(side: "outgoing" | "incoming"): CurrentTransitionPreparationCueSnapshot {
  const outgoing = side === "outgoing";
  return {
    ...(outgoing ? outgoingReference : incomingReference),
    sourceTrackId: outgoing ? "track-a" : "track-b",
    sourceAnalysisId: outgoing ? "analysis-a" : "analysis-b",
    sourceMediaFingerprint: outgoing ? "source-a" : "source-b",
    cueFrame: outgoing ? 12_800 : 6_400,
    sampleRate: 1_000,
    projectedCueSeconds: outgoing ? 12.8 : 6.4,
  };
}

function context(): TransitionPreparationLineageContext {
  return { outgoing: snapshot("outgoing"), incoming: snapshot("incoming") };
}

function phrasePlan(): DjTransitionPlan {
  return {
    ...plan(),
    family: "phrase_level_blend",
    timeBasis: "phrase",
    overlapBars: 16,
    overlapSeconds: 6.4,
    incomingCue: {
      ...plan().incomingCue,
      preparationLineage: { ...incomingReference, role: "FULL_ENTRY" },
    },
  };
}

function phraseContext(): TransitionPreparationLineageContext {
  const current = context();
  current.outgoing = {
    ...current.outgoing!, cueBarIndex: 32, manuallyConfirmedGroupings: [32, 16, 8, 4],
    availableRunwayBars: 32, groupingDurationSeconds: { 16: 6.4 }, availableAudioSeconds: 40,
  };
  current.incoming = {
    ...current.incoming!, role: "FULL_ENTRY", cueBarIndex: 16, manuallyConfirmedGroupings: [16, 8, 4],
    availableRunwayBars: 48, groupingDurationSeconds: { 16: 5.8 }, availableAudioSeconds: 50,
  };
  return current;
}

describe("transition preparation lineage", () => {
  it("accepts exact MIX_OUT to MAIN_ENTRY lineage", () => {
    expect(validateTransitionPreparationLineage(plan(), context())).toEqual({
      usesPreparation: true, valid: true, failure: null, side: null, reason: null,
    });
  });

  it("preserves lineage-free behavior and fails closed for one-sided or missing current lineage", () => {
    expect(validateTransitionPreparationLineage(plan("none"))).toMatchObject({ usesPreparation: false, valid: true });
    expect(validateTransitionPreparationLineage(plan("outgoing"))).toMatchObject({ valid: false, failure: "incomplete_lineage" });
    expect(validateTransitionPreparationLineage(plan())).toMatchObject({ valid: false, failure: "current_lineage_missing" });
  });

  it.each([
    ["preparationId", "changed", "preparation_id_mismatch"],
    ["preparationRevisionKey", "changed", "approval_revision_mismatch"],
    ["cueId", "changed", "cue_id_mismatch"],
    ["role", "FULL_ENTRY", "cue_role_mismatch"],
    ["basisGridRevisionId", "changed", "active_grid_mismatch"],
    ["sourceTrackId", "changed", "source_track_mismatch"],
    ["sourceMediaFingerprint", "changed", "source_analysis_mismatch"],
  ] as const)("fails closed when current %s changes", (field, value, failure) => {
    const current = context();
    current.outgoing = { ...current.outgoing!, [field]: value };
    expect(validateTransitionPreparationLineage(plan(), current)).toMatchObject({ valid: false, failure, side: "outgoing" });
  });

  it("distinguishes authoritative frame and projected-seconds changes", () => {
    const frameChanged = context();
    frameChanged.outgoing = { ...frameChanged.outgoing!, cueFrame: 12_801 };
    expect(validateTransitionPreparationLineage(plan(), frameChanged)).toMatchObject({ failure: "cue_frame_mismatch" });
    const secondsChanged = context();
    secondsChanged.outgoing = { ...secondsChanged.outgoing!, cueFrame: 12_900, projectedCueSeconds: 12.9 };
    expect(validateTransitionPreparationLineage(plan(), secondsChanged)).toMatchObject({ failure: "cue_seconds_mismatch" });
  });

  it("revalidates phrase roles, manual grouping, runway, source duration, and outgoing-clock duration", () => {
    expect(validateTransitionPreparationLineage(phrasePlan(), phraseContext())).toMatchObject({ valid: true });
    const insufficientRunway = phraseContext();
    insufficientRunway.incoming = { ...insufficientRunway.incoming!, availableRunwayBars: 15 };
    expect(validateTransitionPreparationLineage(phrasePlan(), insufficientRunway)).toMatchObject({ valid: false, side: "incoming" });
    const inferredOnly = phraseContext();
    inferredOnly.outgoing = { ...inferredOnly.outgoing!, manuallyConfirmedGroupings: [8, 4] };
    expect(validateTransitionPreparationLineage(phrasePlan(), inferredOnly)).toMatchObject({ valid: false, side: "outgoing" });
    const tooShort = phraseContext();
    tooShort.incoming = { ...tooShort.incoming!, availableAudioSeconds: 6.3 };
    expect(validateTransitionPreparationLineage(phrasePlan(), tooShort)).toMatchObject({ valid: false, failure: "preparation_invalid" });
    expect(validateTransitionPreparationLineage({ ...phrasePlan(), overlapSeconds: 6.5 }, phraseContext())).toMatchObject({ valid: false });
  });
});
