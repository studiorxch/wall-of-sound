import type { CompleteSongAnalysis } from "../data/songAnalysisTypes";
import type { Track } from "../data/trackTypes";
import type { DjPhraseBars, DjPreparationCueRole } from "../data/djTrackPreparationTypes";
import type { DjTransitionPlan, TransitionCue } from "../data/djTransitionTypes";
import type { TransitionPreparationLineageValidation } from "./djTransitionPreparationLineage";
import {
  DJ_PREPARATION_CUE_ORDER,
  buildDjPreparationBasis,
  buildDjPreparationRevisionKey,
  resolveActivePreparationGrid,
  resolveDjTrackPreparationStatus,
  validateDjTrackPreparation,
} from "./edit/djTrackPreparation";
import { buildMusicalGridFromBeatMap } from "./loops/musicalGrid";

export type PreparationBridgeFailureReason =
  | "missing_analysis"
  | "wrong_source_identity"
  | "missing_preparation"
  | "preparation_not_approved"
  | "approval_basis_mismatch"
  | "invalid_preparation";

export interface PreparationCueCandidate {
  role: DjPreparationCueRole;
  seconds: number;
  frame: number;
  barIndex: number | null;
  runwayBars: number;
  alignedGroupings: DjPhraseBars[];
  transitionCue: TransitionCue;
}

export type TrackPreparationBridgeResult =
  | {
      available: true;
      preparationId: string;
      preparationRevisionKey: string;
      activeGridRevisionId: string;
      candidates: Record<DjPreparationCueRole, PreparationCueCandidate>;
    }
  | { available: false; reason: PreparationBridgeFailureReason };

export interface PairPreparationBridgeResult {
  outgoing: TrackPreparationBridgeResult;
  incoming: TrackPreparationBridgeResult;
  cleanCutAvailable: boolean;
  commonRunwayBars: DjPhraseBars | null;
}

export function transitionPlanUsesPreparation(plan: DjTransitionPlan): boolean {
  return Boolean(plan.outgoingCue.preparationLineage || plan.incomingCue.preparationLineage);
}

export function canApproveTransitionProposal(
  plan: DjTransitionPlan,
  familySupported: boolean,
  preparationLineageValidation?: TransitionPreparationLineageValidation,
): boolean {
  if (!familySupported) return false;
  if (!transitionPlanUsesPreparation(plan)) return true;
  if (!plan.outgoingCue.preparationLineage || !plan.incomingCue.preparationLineage) return false;
  return preparationLineageValidation?.valid === true && preparationLineageValidation.usesPreparation;
}

export function approveTransitionProposal(
  plan: DjTransitionPlan,
  familySupported: boolean,
  preparationLineageValidation: TransitionPreparationLineageValidation | undefined,
  now: string,
): DjTransitionPlan | null {
  if (!canApproveTransitionProposal(plan, familySupported, preparationLineageValidation)) return null;
  return { ...plan, origin: "manual", evidenceState: "approved", approvedAt: now, updatedAt: now };
}

function detectedGridTimestamp(analysis: CompleteSongAnalysis): string {
  const basis = analysis.djPreparation?.approvalBasis;
  if (basis?.activeGridRevisionId === "detected") {
    return basis.activeGridRevisionKey.split("|").at(-1) ?? analysis.updatedAt;
  }
  return analysis.updatedAt;
}

export function resolveApprovedTrackPreparation(
  track: Track,
  analysis: CompleteSongAnalysis | undefined,
): TrackPreparationBridgeResult {
  if (!analysis) return { available: false, reason: "missing_analysis" };
  if (analysis.sourceTrackId !== track.trackId) {
    return { available: false, reason: "wrong_source_identity" };
  }
  const preparation = analysis.djPreparation;
  if (!preparation) return { available: false, reason: "missing_preparation" };
  if (preparation.sourceTrackId !== track.trackId) return { available: false, reason: "wrong_source_identity" };

  const detectedGrid = buildMusicalGridFromBeatMap(
    track.beatMap,
    track.bpm,
    analysis.sourceMediaFingerprint,
    analysis.decodedFrameCount / analysis.sampleRate,
    analysis.sampleRate,
    detectedGridTimestamp(analysis),
  );
  const activeGrid = resolveActivePreparationGrid(preparation, detectedGrid);
  if (!activeGrid || analysis.sampleRate <= 0 || analysis.decodedFrameCount <= 0) {
    return { available: false, reason: "invalid_preparation" };
  }
  const currentBasis = buildDjPreparationBasis(track, analysis, activeGrid);
  const currentRevisionKey = buildDjPreparationRevisionKey(currentBasis);
  if (!preparation.approvalRevisionKey || preparation.approvalRevisionKey !== currentRevisionKey || !preparation.approvalBasis) {
    return { available: false, reason: "approval_basis_mismatch" };
  }
  if (resolveDjTrackPreparationStatus(preparation, currentBasis) !== "approved") {
    return { available: false, reason: "preparation_not_approved" };
  }
  if (validateDjTrackPreparation(analysis, activeGrid).valid === false) {
    return { available: false, reason: "invalid_preparation" };
  }

  const candidates = {} as Record<DjPreparationCueRole, PreparationCueCandidate>;
  const cueIds = new Set<string>();
  for (const role of DJ_PREPARATION_CUE_ORDER) {
    const cue = preparation.cues[role];
    if (!cue || !cue.id || cueIds.has(cue.id) || cue.role !== role || cue.basisGridRevisionId !== activeGrid.revisionId) {
      return { available: false, reason: "invalid_preparation" };
    }
    cueIds.add(cue.id);
    const barIndex = cue.barIndex ?? lastIndexAtOrBefore(activeGrid.grid.barFrames, cue.frame);
    const alignedGroupings = preparation.phraseGrid!.boundaries
      .filter((boundary) => boundary.barIndex === barIndex && boundary.provenance === "manually_confirmed")
      .map((boundary) => boundary.groupingBars)
      .filter((grouping, index, values) => values.indexOf(grouping) === index)
      .sort((a, b) => b - a);
    const runwayBars = barIndex == null ? 0 : Math.max(0, activeGrid.grid.barFrames.length - barIndex);
    candidates[role] = {
      role,
      seconds: cue.frame / analysis.sampleRate,
      frame: cue.frame,
      barIndex: barIndex ?? null,
      runwayBars,
      alignedGroupings,
      transitionCue: {
        seconds: cue.frame / analysis.sampleRate,
        beatIndex: cue.beatIndex ?? null,
        barIndex: barIndex ?? null,
        phraseIndex: null,
        regionId: null,
        manuallyAdjusted: false,
        preparationLineage: {
          preparationId: preparation.id,
          preparationRevisionKey: currentRevisionKey,
          cueId: cue.id,
          role,
          basisGridRevisionId: activeGrid.revisionId,
        },
      },
    };
  }
  return {
    available: true,
    preparationId: preparation.id,
    preparationRevisionKey: currentRevisionKey,
    activeGridRevisionId: activeGrid.revisionId,
    candidates,
  };
}

function lastIndexAtOrBefore(frames: number[], frame: number): number | undefined {
  let result: number | undefined;
  for (let index = 0; index < frames.length; index++) {
    if (frames[index] > frame) break;
    result = index;
  }
  return result;
}

export function bridgeApprovedPreparationPair(
  outgoingTrack: Track,
  outgoingAnalysis: CompleteSongAnalysis | undefined,
  incomingTrack: Track,
  incomingAnalysis: CompleteSongAnalysis | undefined,
): PairPreparationBridgeResult {
  const outgoing = resolveApprovedTrackPreparation(outgoingTrack, outgoingAnalysis);
  const incoming = resolveApprovedTrackPreparation(incomingTrack, incomingAnalysis);
  const cleanCutAvailable = outgoing.available && incoming.available;
  let commonRunwayBars: DjPhraseBars | null = null;
  if (cleanCutAvailable) {
    const outgoingCue = outgoing.candidates.MIX_OUT;
    const incomingCue = incoming.candidates.MAIN_ENTRY;
    commonRunwayBars = ([32, 16, 8, 4] as const).find((grouping) =>
      outgoingCue.alignedGroupings.includes(grouping) &&
      incomingCue.alignedGroupings.includes(grouping) &&
      outgoingCue.runwayBars >= grouping &&
      incomingCue.runwayBars >= grouping) ?? null;
  }
  return { outgoing, incoming, cleanCutAvailable, commonRunwayBars };
}
