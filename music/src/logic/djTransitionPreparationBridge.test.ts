import { describe, expect, it } from "vitest";
import type { MusicalGrid } from "../data/loopTypes";
import type { CompleteSongAnalysis } from "../data/songAnalysisTypes";
import type { Track } from "../data/trackTypes";
import type { DjTransitionPlan } from "../data/djTransitionTypes";
import {
  appendPreparationGridRevision,
  approveDjTrackPreparation,
  deriveDjPhraseGrid,
  resolveActivePreparationGrid,
  reviewDjTrackPreparation,
  setPreparationCue,
  setPreparationPhraseGrid,
} from "./edit/djTrackPreparation";
import {
  bridgeApprovedPreparationPair,
  approveTransitionProposal,
  canApproveTransitionProposal,
  resolveApprovedTrackPreparation,
  transitionPlanUsesPreparation,
} from "./djTransitionPreparationBridge";
import { resolveTransitionPreparationLineageContext } from "./djTransitionPreparationLineage";

const NOW = "2026-08-07T12:00:00.000Z";

function track(id: string, source: string): Track {
  return {
    trackId: id, title: id, bpm: 120, bpmSource: "manual", analysisUpdatedAt: NOW,
    beatMap: {
      version: "beat-map-v3", bpm: 120, firstDownbeatSeconds: 0,
      beatTimesSeconds: [0, 0.5, 1, 1.5], barStartTimesSeconds: [0], tempoStable: true,
      tempoStabilityScore: 1, tempoSegments: [], confidence: 0.9, source: "manual",
      detectorVersion: "beat-map-v3", analyzedAt: NOW, warnings: [],
    },
    playbackBounds: { sourceFingerprint: source },
  } as unknown as Track;
}

function grid(source: string): MusicalGrid {
  return {
    bpm: 120, meterNumerator: 4, meterDenominator: 4, originSeconds: 0, originFrame: 0,
    originSource: "manual", trust: "manual", confidence: 1,
    beatFrames: Array.from({ length: 256 }, (_, index) => index * 100),
    barFrames: Array.from({ length: 64 }, (_, index) => index * 400),
    sourceFingerprint: source, updatedAt: NOW,
  };
}

function baseAnalysis(id: string, source: string): CompleteSongAnalysis {
  return {
    id: `analysis-${id}`, sourceTrackId: id, sourceMediaFingerprint: source,
    decodedFrameCount: 30_000, sampleRate: 1_000, analyzerVersion: "song-v1", configurationVersion: "config-v1",
    status: "READY_PROVISIONAL",
    sections: [{
      id: `section-${id}`, sourceTrackId: id, structuralType: "body", displayLabel: "Body",
      startFrame: 0, endFrame: 30_000, confidence: 1, verification: "reviewed", origin: "analyzer",
    }],
    sectionRevisions: [], createdAt: NOW, updatedAt: NOW,
  };
}

function completePreparation(id: string, source: string): { track: Track; analysis: CompleteSongAnalysis } {
  const owner = track(id, source);
  let analysis = appendPreparationGridRevision(baseAnalysis(id, source), grid(source), "manual_origin", `grid-${id}`, `prep-${id}`, NOW);
  const active = resolveActivePreparationGrid(analysis.djPreparation, null)!;
  analysis = setPreparationPhraseGrid(
    analysis,
    deriveDjPhraseGrid(active, 0, [4, 8, 16, 32], "manually_confirmed", NOW),
    `prep-${id}`,
    NOW,
  );
  const cues = [
    ["FULL_ENTRY", 0, 0],
    ["SHORT_ENTRY", 6_400, 16],
    ["MAIN_ENTRY", 12_800, 32],
    ["MIX_OUT", 12_800, 32],
  ] as const;
  for (const [role, frame, barIndex] of cues) {
    analysis = setPreparationCue(analysis, {
      id: `cue-${id}-${role}`, role, frame, barIndex, beatIndex: frame / 100,
      phraseBoundaryBarIndex: barIndex, basisGridRevisionId: active.revisionId,
      origin: "manual", provenance: "manually_confirmed", confidence: 1, updatedAt: NOW,
    }, `prep-${id}`, NOW);
  }
  analysis = reviewDjTrackPreparation(analysis, active, NOW);
  analysis = approveDjTrackPreparation(owner, analysis, active, NOW);
  return { track: owner, analysis };
}

function planWithPreparation(lineage = true): DjTransitionPlan {
  const preparationLineage = lineage ? {
    preparationId: "prep-a", preparationRevisionKey: "revision", cueId: "cue-a-MIX_OUT",
    role: "MIX_OUT" as const, basisGridRevisionId: "grid-a",
  } : undefined;
  return {
    id: "plan", playlistId: "playlist", outgoingSlotId: "a", incomingSlotId: "b",
    outgoingTrackId: "a", incomingTrackId: "b", outgoingSourceFingerprint: "source-a",
    incomingSourceFingerprint: "source-b", analysisRevisionKey: "revision", family: "clean_cut",
    trust: "manually_authored", timeBasis: "seconds",
    outgoingCue: { seconds: 1, beatIndex: null, barIndex: null, phraseIndex: null, regionId: null, manuallyAdjusted: false, preparationLineage },
    incomingCue: { seconds: 0, beatIndex: null, barIndex: null, phraseIndex: null, regionId: null, manuallyAdjusted: false,
      preparationLineage: lineage ? { ...preparationLineage!, preparationId: "prep-b", cueId: "cue-b-MAIN_ENTRY", role: "MAIN_ENTRY", basisGridRevisionId: "grid-b" } : undefined },
    overlapBars: null, overlapSeconds: .5, tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: null,
    automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
    doNotLayer: true, warnings: [], explanation: [], origin: "automatic", evidenceState: "proposed", rehearsals: [],
    listeningContext: null, activeStemSetId: null, activeStemRoles: [], approvedAt: null, createdAt: NOW, updatedAt: NOW,
  };
}

describe("DJ transition preparation bridge", () => {
  it("projects approved/current cues from authoritative frames with exact lineage", () => {
    const fixture = completePreparation("a", "source-a");
    const result = resolveApprovedTrackPreparation(fixture.track, fixture.analysis);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.candidates.MIX_OUT.seconds).toBe(12.8);
    expect(result.candidates.MAIN_ENTRY.transitionCue.preparationLineage).toEqual({
      preparationId: "prep-a", preparationRevisionKey: fixture.analysis.djPreparation?.approvalRevisionKey,
      cueId: "cue-a-MAIN_ENTRY", role: "MAIN_ENTRY", basisGridRevisionId: "grid-a",
    });
  });

  it("enumerates FULL_ENTRY, SHORT_ENTRY, MAIN_ENTRY, and MIX_OUT without role substitution", () => {
    const fixture = completePreparation("a", "source-a");
    const result = resolveApprovedTrackPreparation(fixture.track, fixture.analysis);
    expect(result.available && Object.keys(result.candidates)).toEqual(["FULL_ENTRY", "SHORT_ENTRY", "MAIN_ENTRY", "MIX_OUT"]);
  });

  it("derives the largest deterministic common manually-confirmed runway", () => {
    const outgoing = completePreparation("a", "source-a");
    const incoming = completePreparation("b", "source-b");
    const result = bridgeApprovedPreparationPair(outgoing.track, outgoing.analysis, incoming.track, incoming.analysis);
    expect(result.cleanCutAvailable).toBe(true);
    expect(result.commonRunwayBars).toBe(32);
    expect(result.outgoing.available && result.outgoing.candidates.MIX_OUT.alignedGroupings).toEqual([32, 16, 8, 4]);
  });

  it.each(["draft", "reviewed", "stale"] as const)("fails closed for %s preparation", (status) => {
    const fixture = completePreparation("a", "source-a");
    fixture.analysis.djPreparation = { ...fixture.analysis.djPreparation!, status };
    expect(resolveApprovedTrackPreparation(fixture.track, fixture.analysis)).toEqual({ available: false, reason: "preparation_not_approved" });
  });

  it("fails closed for missing and incomplete preparation", () => {
    const owner = track("a", "source-a");
    expect(resolveApprovedTrackPreparation(owner, baseAnalysis("a", "source-a"))).toEqual({ available: false, reason: "missing_preparation" });
    const fixture = completePreparation("a", "source-a");
    fixture.analysis.djPreparation = { ...fixture.analysis.djPreparation!, cues: { ...fixture.analysis.djPreparation!.cues, MIX_OUT: undefined } };
    expect(resolveApprovedTrackPreparation(fixture.track, fixture.analysis)).toEqual({ available: false, reason: "invalid_preparation" });
  });

  it("fails closed on approval-basis and source identity changes", () => {
    const fixture = completePreparation("a", "source-a");
    expect(resolveApprovedTrackPreparation({ ...fixture.track, bpm: 121 }, fixture.analysis)).toEqual({ available: false, reason: "approval_basis_mismatch" });
    expect(resolveApprovedTrackPreparation(fixture.track, { ...fixture.analysis, sourceMediaFingerprint: "changed-source" })).toEqual({ available: false, reason: "approval_basis_mismatch" });
    expect(resolveApprovedTrackPreparation(track("wrong", "source-a"), fixture.analysis)).toEqual({ available: false, reason: "wrong_source_identity" });
  });

  it("fails closed when a cue references another grid revision", () => {
    const fixture = completePreparation("a", "source-a");
    fixture.analysis.djPreparation = {
      ...fixture.analysis.djPreparation!,
      cues: { ...fixture.analysis.djPreparation!.cues, MIX_OUT: { ...fixture.analysis.djPreparation!.cues.MIX_OUT!, basisGridRevisionId: "old-grid" } },
    };
    expect(resolveApprovedTrackPreparation(fixture.track, fixture.analysis)).toEqual({ available: false, reason: "invalid_preparation" });
    const wrongRole = completePreparation("b", "source-b");
    wrongRole.analysis.djPreparation = {
      ...wrongRole.analysis.djPreparation!,
      cues: { ...wrongRole.analysis.djPreparation!.cues, MIX_OUT: { ...wrongRole.analysis.djPreparation!.cues.MIX_OUT!, role: "MAIN_ENTRY" } },
    };
    expect(resolveApprovedTrackPreparation(wrongRole.track, wrongRole.analysis)).toEqual({ available: false, reason: "invalid_preparation" });
  });

  it("identifies preparation-derived proposals while leaving existing plans unchanged", () => {
    expect(transitionPlanUsesPreparation(planWithPreparation())).toBe(true);
    expect(transitionPlanUsesPreparation(planWithPreparation(false))).toBe(false);
    expect(canApproveTransitionProposal(planWithPreparation(), true)).toBe(false);
    const validLineage = { usesPreparation: true, valid: true, failure: null, side: null, reason: null } as const;
    expect(canApproveTransitionProposal(planWithPreparation(), true, validLineage)).toBe(true);
    expect(approveTransitionProposal(planWithPreparation(), true, validLineage, NOW)?.evidenceState).toBe("approved");
    expect(approveTransitionProposal(planWithPreparation(), true, { ...validLineage, valid: false, failure: "preparation_stale", reason: "DJ track preparation is stale." }, NOW)).toBeNull();
    expect(canApproveTransitionProposal(planWithPreparation(false), true)).toBe(true);
  });

  it("canonically revalidates an approved preparation pair and reports later preparation state changes", () => {
    const outgoing = completePreparation("a", "source-a");
    const incoming = completePreparation("b", "source-b");
    const bridge = bridgeApprovedPreparationPair(outgoing.track, outgoing.analysis, incoming.track, incoming.analysis);
    expect(bridge.outgoing.available && bridge.incoming.available).toBe(true);
    if (!bridge.outgoing.available || !bridge.incoming.available) return;
    const candidatePlan = {
      ...planWithPreparation(false),
      outgoingTrackId: "a", incomingTrackId: "b", outgoingSourceFingerprint: "source-a", incomingSourceFingerprint: "source-b",
      outgoingCue: bridge.outgoing.candidates.MIX_OUT.transitionCue,
      incomingCue: bridge.incoming.candidates.MAIN_ENTRY.transitionCue,
    };
    expect(resolveTransitionPreparationLineageContext(
      candidatePlan, outgoing.track, outgoing.analysis, incoming.track, incoming.analysis,
    ).validation).toMatchObject({ usesPreparation: true, valid: true });

    for (const status of ["draft", "reviewed", "stale"] as const) {
      const changedAnalysis = { ...incoming.analysis, djPreparation: { ...incoming.analysis.djPreparation!, status } };
      const validation = resolveTransitionPreparationLineageContext(
        candidatePlan, outgoing.track, outgoing.analysis, incoming.track, changedAnalysis,
      ).validation;
      expect(validation).toMatchObject({
        valid: false,
        failure: status === "stale" ? "preparation_stale" : "preparation_not_approved",
        side: "incoming",
      });
    }

    const changedAnalysisIdentity = { ...incoming.analysis, id: "replacement-analysis" };
    expect(resolveTransitionPreparationLineageContext(
      candidatePlan, outgoing.track, outgoing.analysis, incoming.track, changedAnalysisIdentity,
    ).validation).toMatchObject({ valid: false, failure: "source_analysis_mismatch", side: "incoming" });
  });
});
