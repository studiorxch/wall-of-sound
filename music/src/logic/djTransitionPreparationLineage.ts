import type { CompleteSongAnalysis } from "../data/songAnalysisTypes";
import type { Track } from "../data/trackTypes";
import type {
  DjTransitionPlan,
  TransitionCue,
  TransitionPreparationCueReference,
} from "../data/djTransitionTypes";
import { resolveApprovedTrackPreparation } from "./djTransitionPreparationBridge";

export interface CurrentTransitionPreparationCueSnapshot extends TransitionPreparationCueReference {
  sourceTrackId: string;
  sourceAnalysisId: string;
  sourceMediaFingerprint: string;
  cueFrame: number;
  sampleRate: number;
  projectedCueSeconds: number;
}

export interface TransitionPreparationLineageContext {
  outgoing: CurrentTransitionPreparationCueSnapshot | null;
  incoming: CurrentTransitionPreparationCueSnapshot | null;
}

export type TransitionPreparationLineageFailure =
  | "incomplete_lineage"
  | "current_lineage_missing"
  | "source_track_mismatch"
  | "source_analysis_mismatch"
  | "preparation_missing"
  | "preparation_not_approved"
  | "preparation_stale"
  | "approval_revision_mismatch"
  | "preparation_id_mismatch"
  | "active_grid_mismatch"
  | "cue_missing"
  | "cue_id_mismatch"
  | "cue_role_mismatch"
  | "cue_frame_mismatch"
  | "cue_seconds_mismatch"
  | "preparation_invalid";

export interface TransitionPreparationLineageValidation {
  usesPreparation: boolean;
  valid: boolean;
  failure: TransitionPreparationLineageFailure | null;
  side: "outgoing" | "incoming" | null;
  reason: string | null;
}

const FAILURE_REASON: Record<TransitionPreparationLineageFailure, string> = {
  incomplete_lineage: "Preparation lineage is incomplete for this adjacency.",
  current_lineage_missing: "Current preparation lineage was not supplied.",
  source_track_mismatch: "Source track identity no longer matches preparation lineage.",
  source_analysis_mismatch: "Source analysis identity has changed.",
  preparation_missing: "DJ track preparation is missing.",
  preparation_not_approved: "DJ track preparation is not approved.",
  preparation_stale: "DJ track preparation is stale.",
  approval_revision_mismatch: "Preparation approval revision has changed.",
  preparation_id_mismatch: "Preparation ID no longer matches.",
  active_grid_mismatch: "Active musical-grid revision has changed.",
  cue_missing: "Preparation cue is missing.",
  cue_id_mismatch: "Preparation cue ID has changed.",
  cue_role_mismatch: "Preparation cue role has changed.",
  cue_frame_mismatch: "Preparation cue frame has changed.",
  cue_seconds_mismatch: "Preparation cue time no longer matches its authoritative frame projection.",
  preparation_invalid: "DJ track preparation is invalid or incomplete.",
};

function failed(failure: TransitionPreparationLineageFailure, side: "outgoing" | "incoming" | null = null): TransitionPreparationLineageValidation {
  return { usesPreparation: true, valid: false, failure, side, reason: FAILURE_REASON[failure] };
}

function snapshotFailure(
  track: Track,
  analysis: CompleteSongAnalysis | undefined,
): TransitionPreparationLineageFailure {
  if (!analysis) return "source_analysis_mismatch";
  if (analysis.sourceTrackId !== track.trackId || analysis.djPreparation?.sourceTrackId !== track.trackId) return "source_track_mismatch";
  if (!analysis.djPreparation) return "preparation_missing";
  if (analysis.djPreparation.status === "stale") return "preparation_stale";
  if (analysis.djPreparation.status !== "approved") return "preparation_not_approved";
  return "preparation_invalid";
}

export function resolveCurrentTransitionPreparationCueSnapshot(
  track: Track,
  analysis: CompleteSongAnalysis | undefined,
  reference: TransitionPreparationCueReference,
): { snapshot: CurrentTransitionPreparationCueSnapshot | null; failure: TransitionPreparationLineageFailure | null } {
  if (!analysis) return { snapshot: null, failure: "source_analysis_mismatch" };
  if (analysis.sourceTrackId !== track.trackId) return { snapshot: null, failure: "source_track_mismatch" };
  const preparation = analysis.djPreparation;
  if (!preparation) return { snapshot: null, failure: "preparation_missing" };
  if (preparation.sourceTrackId !== track.trackId) return { snapshot: null, failure: "source_track_mismatch" };
  if (preparation.id !== reference.preparationId) return { snapshot: null, failure: "preparation_id_mismatch" };
  if (preparation.status === "stale") return { snapshot: null, failure: "preparation_stale" };
  if (preparation.status !== "approved") return { snapshot: null, failure: "preparation_not_approved" };
  if (!preparation.approvalBasis ||
      preparation.approvalBasis.sourceMediaFingerprint !== analysis.sourceMediaFingerprint ||
      !preparation.approvalBasis.songAnalysisRevisionKey.startsWith(`${analysis.id}|`)) {
    return { snapshot: null, failure: "source_analysis_mismatch" };
  }
  if (preparation.approvalRevisionKey !== reference.preparationRevisionKey) return { snapshot: null, failure: "approval_revision_mismatch" };
  const referencedCue = preparation.cues[reference.role];
  if (!referencedCue) return { snapshot: null, failure: "cue_missing" };
  if (referencedCue.id !== reference.cueId) return { snapshot: null, failure: "cue_id_mismatch" };
  if (referencedCue.role !== reference.role) return { snapshot: null, failure: "cue_role_mismatch" };
  const resolved = resolveApprovedTrackPreparation(track, analysis);
  if (!resolved.available) {
    if (resolved.reason === "approval_basis_mismatch") return { snapshot: null, failure: "preparation_stale" };
    return { snapshot: null, failure: snapshotFailure(track, analysis) };
  }
  const candidate = resolved.candidates[reference.role];
  if (!candidate) return { snapshot: null, failure: "cue_missing" };
  return {
    snapshot: {
      sourceTrackId: track.trackId,
      sourceAnalysisId: analysis!.id,
      sourceMediaFingerprint: analysis!.sourceMediaFingerprint,
      preparationId: resolved.preparationId,
      preparationRevisionKey: resolved.preparationRevisionKey,
      cueId: candidate.transitionCue.preparationLineage!.cueId,
      role: candidate.role,
      basisGridRevisionId: resolved.activeGridRevisionId,
      cueFrame: candidate.frame,
      sampleRate: analysis!.sampleRate,
      projectedCueSeconds: candidate.seconds,
    },
    failure: null,
  };
}

function validateSide(
  side: "outgoing" | "incoming",
  planTrackId: string,
  planSourceFingerprint: string,
  cue: TransitionCue,
  snapshot: CurrentTransitionPreparationCueSnapshot | null,
): TransitionPreparationLineageValidation | null {
  const reference = cue.preparationLineage!;
  if (!snapshot) return failed("current_lineage_missing", side);
  if (snapshot.sourceTrackId !== planTrackId) return failed("source_track_mismatch", side);
  if (!snapshot.sourceAnalysisId || snapshot.sourceMediaFingerprint !== planSourceFingerprint) return failed("source_analysis_mismatch", side);
  if (snapshot.preparationId !== reference.preparationId) return failed("preparation_id_mismatch", side);
  if (snapshot.preparationRevisionKey !== reference.preparationRevisionKey) return failed("approval_revision_mismatch", side);
  if (snapshot.basisGridRevisionId !== reference.basisGridRevisionId) return failed("active_grid_mismatch", side);
  if (snapshot.cueId !== reference.cueId) return failed("cue_id_mismatch", side);
  if (snapshot.role !== reference.role) return failed("cue_role_mismatch", side);
  if (!Number.isInteger(snapshot.cueFrame) || snapshot.cueFrame < 0 || snapshot.sampleRate <= 0 || snapshot.cueFrame / snapshot.sampleRate !== snapshot.projectedCueSeconds) return failed("cue_frame_mismatch", side);
  if (!Number.isFinite(snapshot.projectedCueSeconds) || cue.seconds !== snapshot.projectedCueSeconds) return failed("cue_seconds_mismatch", side);
  return null;
}

export function validateTransitionPreparationLineage(
  plan: DjTransitionPlan,
  context?: TransitionPreparationLineageContext,
): TransitionPreparationLineageValidation {
  const outgoingReference = plan.outgoingCue.preparationLineage;
  const incomingReference = plan.incomingCue.preparationLineage;
  if (!outgoingReference && !incomingReference) {
    return { usesPreparation: false, valid: true, failure: null, side: null, reason: null };
  }
  if (!outgoingReference || !incomingReference) return failed("incomplete_lineage");
  if (plan.family === "clean_cut" && outgoingReference.role !== "MIX_OUT") return failed("cue_role_mismatch", "outgoing");
  if (plan.family === "clean_cut" && incomingReference.role !== "MAIN_ENTRY") return failed("cue_role_mismatch", "incoming");
  if (!context) return failed("current_lineage_missing");
  return validateSide("outgoing", plan.outgoingTrackId, plan.outgoingSourceFingerprint, plan.outgoingCue, context.outgoing)
    ?? validateSide("incoming", plan.incomingTrackId, plan.incomingSourceFingerprint, plan.incomingCue, context.incoming)
    ?? { usesPreparation: true, valid: true, failure: null, side: null, reason: null };
}

export function resolveTransitionPreparationLineageContext(
  plan: DjTransitionPlan,
  outgoingTrack: Track,
  outgoingAnalysis: CompleteSongAnalysis | undefined,
  incomingTrack: Track,
  incomingAnalysis: CompleteSongAnalysis | undefined,
): { context: TransitionPreparationLineageContext; validation: TransitionPreparationLineageValidation } {
  const outgoingReference = plan.outgoingCue.preparationLineage;
  const incomingReference = plan.incomingCue.preparationLineage;
  if (!outgoingReference || !incomingReference) {
    const context = { outgoing: null, incoming: null };
    return { context, validation: validateTransitionPreparationLineage(plan, context) };
  }
  const outgoing = resolveCurrentTransitionPreparationCueSnapshot(outgoingTrack, outgoingAnalysis, outgoingReference);
  if (outgoing.failure) return { context: { outgoing: null, incoming: null }, validation: failed(outgoing.failure, "outgoing") };
  const incoming = resolveCurrentTransitionPreparationCueSnapshot(incomingTrack, incomingAnalysis, incomingReference);
  if (incoming.failure) return { context: { outgoing: outgoing.snapshot, incoming: null }, validation: failed(incoming.failure, "incoming") };
  const context = { outgoing: outgoing.snapshot, incoming: incoming.snapshot };
  return { context, validation: validateTransitionPreparationLineage(plan, context) };
}
