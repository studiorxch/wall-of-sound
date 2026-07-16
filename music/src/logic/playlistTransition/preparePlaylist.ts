// Playlist Transition Preparation — top-level orchestrator (§17). Builds
// ONE plan per adjacency from persisted analysis only — no audio decode
// during preparation (§32). Reuses existing BPM/key/beat-map/playback-
// bounds helpers; does not re-derive any of their underlying evidence.

import type { Track } from "../../data/trackTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import type {
  PlaylistTransitionPlan, PlaylistPlaybackPreparation, PlaylistPlaybackReadiness,
  TempoRelationship, PlaylistTransitionPlanWarningCode,
} from "../../data/playlistTransitionTypes";
import { PLAYLIST_TRANSITION_DETECTOR_VERSION } from "../../data/playlistTransitionTypes";
import { selectOutgoingCue, selectIncomingCue } from "./cueSelection";
import { selectSyncMode, selectTransitionDuration } from "./transitionMode";
import { composeTransitionConfidence, classifyTransitionStatus } from "./transitionConfidence";
import { isBpmTrustedForAnalysis, isKeyTrustedForAnalysis } from "../dspFeatureExtraction";
import { computeBpmTransitionDistance, scoreBpmTransition } from "../playlistSequencing/bpmTransition";
import { scoreKeyTransition } from "../playlistSequencing/keyTransition";

export interface PlaylistAdjacencyPair {
  fromSlot: TrackSlot;
  toSlot: TrackSlot;
  fromTrack: Track;
  toTrack: Track;
  fromPosition: number;
  toPosition: number;
}

function computeTempoRelationship(fromTrack: Track, toTrack: Track): { relationship: TempoRelationship; bpmFit: number; directBpmDelta?: number; effectiveBpmDelta?: number } {
  const fromTrusted = isBpmTrustedForAnalysis(fromTrack);
  const toTrusted = isBpmTrustedForAnalysis(toTrack);
  if (!fromTrusted || !toTrusted) return { relationship: "unknown", bpmFit: 0.5 };

  const distance = computeBpmTransitionDistance(fromTrack.bpm, toTrack.bpm);
  const bpmFit = scoreBpmTransition(distance);
  let relationship: TempoRelationship = "unknown";
  if (distance.relationship === "half_time") relationship = "half_time";
  else if (distance.relationship === "double_time") relationship = "double_time";
  else if (distance.relationship === "direct") {
    relationship = (distance.effectiveDelta ?? 0) <= 3 ? "direct" : "tempo_change";
  }
  return { relationship, bpmFit, directBpmDelta: distance.directDelta, effectiveBpmDelta: distance.effectiveDelta };
}

export function buildTransitionPlan(playlistId: string, pair: PlaylistAdjacencyPair, nowIso: string): PlaylistTransitionPlan {
  const { fromSlot, toSlot, fromTrack, toTrack, fromPosition, toPosition } = pair;

  const outgoing = selectOutgoingCue(fromTrack);
  const incoming = selectIncomingCue(toTrack);
  const tempo = computeTempoRelationship(fromTrack, toTrack);

  const fromKeyTrusted = isKeyTrustedForAnalysis(fromTrack);
  const toKeyTrusted = isKeyTrustedForAnalysis(toTrack);
  const keyResult = scoreKeyTransition(
    fromKeyTrusted ? (fromTrack.camelotKey as string | undefined) : undefined,
    toKeyTrusted ? (toTrack.camelotKey as string | undefined) : undefined,
  );

  const beatMapSignals = [outgoing.fromBeatMapTrusted, incoming.toBeatMapTrusted, outgoing.fromBarGridTrusted, incoming.toBarGridTrusted];
  const beatMapFit = beatMapSignals.filter(Boolean).length / beatMapSignals.length;

  const boundsSignals = [outgoing.fromPlaybackBoundsTrusted, incoming.toPlaybackBoundsTrusted];
  const regionFactor = Math.max(0, Math.min(1, (outgoing.outgoingAvailableSeconds + incoming.incomingAvailableSeconds) / 8));
  const playbackBoundsFit = +((boundsSignals.filter(Boolean).length / boundsSignals.length) * 0.6 + regionFactor * 0.4).toFixed(3);

  const phraseFit = 0.5; // neutral — no phrase evidence exists yet (documented limitation)

  const fromEnergy = typeof fromTrack.energy === "number" && fromTrack.energy > 0 ? fromTrack.energy : undefined;
  const toEnergy = typeof toTrack.energy === "number" && toTrack.energy > 0 ? toTrack.energy : undefined;
  const energyContinuityFit = fromEnergy != null && toEnergy != null
    ? +(1 - Math.min(1, Math.abs(fromEnergy - toEnergy))).toFixed(3)
    : 0.5;

  const confidence = composeTransitionConfidence(
    { bpmFit: tempo.bpmFit, keyFit: keyResult.score, beatMapFit, playbackBoundsFit, phraseFit, energyContinuityFit },
    outgoing.outgoingAvailableSeconds, incoming.incomingAvailableSeconds,
  );

  const durationKnown = (fromTrack.durationSeconds ?? 0) > 0 && (toTrack.durationSeconds ?? 0) > 0;
  const { syncMode, fallbackMode } = selectSyncMode({
    fromBeatMapTrusted: outgoing.fromBeatMapTrusted, toBeatMapTrusted: incoming.toBeatMapTrusted,
    fromBarGridTrusted: outgoing.fromBarGridTrusted, toBarGridTrusted: incoming.toBarGridTrusted,
    fromPlaybackBoundsTrusted: outgoing.fromPlaybackBoundsTrusted, toPlaybackBoundsTrusted: incoming.toPlaybackBoundsTrusted,
    tempoRelationship: tempo.relationship,
    outgoingAvailableSeconds: outgoing.outgoingAvailableSeconds, incomingAvailableSeconds: incoming.incomingAvailableSeconds,
    durationKnown,
  });

  const secondsPerBar = isBpmTrustedForAnalysis(fromTrack) && fromTrack.bpm ? (60 / fromTrack.bpm) * 4 : undefined;
  const { transitionDurationSeconds, transitionBars } = selectTransitionDuration(
    syncMode, outgoing.outgoingAvailableSeconds, incoming.incomingAvailableSeconds, secondsPerBar,
  );

  const warnings: PlaylistTransitionPlanWarningCode[] = [];
  if (!outgoing.fromBeatMapTrusted || !incoming.toBeatMapTrusted) warnings.push("TRANSITION_PLAN_MISSING_BEAT_MAP");
  if ((outgoing.fromBeatMapTrusted && !outgoing.fromBarGridTrusted) || (incoming.toBeatMapTrusted && !incoming.toBarGridTrusted)) warnings.push("TRANSITION_PLAN_MISSING_BAR_GRID");
  if (!outgoing.fromPlaybackBoundsTrusted || !incoming.toPlaybackBoundsTrusted) warnings.push("TRANSITION_PLAN_UNTRUSTED_PLAYBACK_BOUNDS");
  if (outgoing.outgoingAvailableSeconds < 1) warnings.push("TRANSITION_PLAN_INSUFFICIENT_OUTRO");
  if (incoming.incomingAvailableSeconds < 1) warnings.push("TRANSITION_PLAN_INSUFFICIENT_INTRO");
  if (tempo.relationship === "tempo_change" || tempo.bpmFit < 0.3) warnings.push("TRANSITION_PLAN_BPM_MISMATCH");
  if (tempo.relationship === "half_time" || tempo.relationship === "double_time") warnings.push("TRANSITION_PLAN_HALF_DOUBLE_AMBIGUITY");
  if (keyResult.penalty != null && keyResult.score < 0.4) warnings.push("TRANSITION_PLAN_KEY_TENSION");
  if (energyContinuityFit < 0.5) warnings.push("TRANSITION_PLAN_ENERGY_DISCONTINUITY");
  if (fallbackMode === "timed_crossfade") warnings.push("TRANSITION_PLAN_TIMED_FALLBACK");
  if (fallbackMode === "gapless") warnings.push("TRANSITION_PLAN_GAPLESS_FALLBACK");
  if (fallbackMode === "hard_cut") warnings.push("TRANSITION_PLAN_HARD_CUT_REQUIRED");
  if (syncMode === "unsynced") warnings.push("TRANSITION_PLAN_BLOCKED");

  const status = classifyTransitionStatus(syncMode, confidence, warnings);

  const outgoingCueSeconds = +Math.max(0, outgoing.outgoingEndSeconds - transitionDurationSeconds).toFixed(3);

  return {
    transitionId: `${fromSlot.slotId}__${toSlot.slotId}`,
    playlistId,
    fromSlotId: fromSlot.slotId, toSlotId: toSlot.slotId,
    fromTrackId: fromTrack.trackId, toTrackId: toTrack.trackId,
    fromPosition, toPosition,
    outgoingCueSeconds, outgoingEndSeconds: outgoing.outgoingEndSeconds,
    incomingCueSeconds: incoming.incomingCueSeconds, incomingFullLevelSeconds: incoming.incomingFullLevelSeconds,
    outgoingBarIndex: outgoing.outgoingBarIndex, incomingBarIndex: incoming.incomingBarIndex,
    transitionDurationSeconds, transitionBars,
    tempoRelationship: tempo.relationship,
    syncMode, fallbackMode,
    bpmFit: +tempo.bpmFit.toFixed(3), keyFit: +keyResult.score.toFixed(3), beatMapFit: +beatMapFit.toFixed(3),
    playbackBoundsFit, phraseFit, energyContinuityFit,
    confidence, status, warnings,
    evidence: {
      fromBeatMapTrusted: outgoing.fromBeatMapTrusted, toBeatMapTrusted: incoming.toBeatMapTrusted,
      fromBarGridTrusted: outgoing.fromBarGridTrusted, toBarGridTrusted: incoming.toBarGridTrusted,
      fromPlaybackBoundsTrusted: outgoing.fromPlaybackBoundsTrusted, toPlaybackBoundsTrusted: incoming.toPlaybackBoundsTrusted,
      fromOutroRegionAvailable: outgoing.fromOutroRegionAvailable, toIntroRegionAvailable: incoming.toIntroRegionAvailable,
      directBpmDelta: tempo.directBpmDelta, effectiveBpmDelta: tempo.effectiveBpmDelta, camelotPenalty: keyResult.penalty,
      outgoingAvailableSeconds: outgoing.outgoingAvailableSeconds, incomingAvailableSeconds: incoming.incomingAvailableSeconds,
      selectedFromBoundary: outgoing.selectedFromBoundary, selectedToBoundary: incoming.selectedToBoundary,
    },
    detectorVersion: PLAYLIST_TRANSITION_DETECTOR_VERSION,
    preparedAt: nowIso,
  };
}

export function trackRevisionMarker(track: Track): string {
  return `${track.analysisUpdatedAt ?? ""}|${track.beatMap?.analyzedAt ?? ""}|${track.playbackBounds?.analyzedAt ?? ""}`;
}

function resolveAssignedInOrder(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
): { slot: TrackSlot; track: Track; position: number }[] {
  const ordered = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const assigned: { slot: TrackSlot; track: Track; position: number }[] = [];
  for (const slot of ordered) {
    if (!slot.assignedTrackId) continue;
    const track = tracksById.get(slot.assignedTrackId);
    if (!track) continue;
    assigned.push({ slot, track, position: assigned.length });
  }
  return assigned;
}

// A plan is still current (safe to reuse byte-for-byte, no recompute) only
// if its slot-pair identity, resolved position, AND both tracks' source
// revision markers are all unchanged since it was prepared.
function planIsCurrent(
  old: PlaylistTransitionPlan | undefined,
  fromTrack: Track,
  toTrack: Track,
  fromPosition: number,
  toPosition: number,
  preparation: PlaylistPlaybackPreparation,
): boolean {
  if (!old) return false;
  if (old.fromPosition !== fromPosition || old.toPosition !== toPosition) return false;
  if (preparation.sourceTrackRevisionMap[fromTrack.trackId] !== trackRevisionMarker(fromTrack)) return false;
  if (preparation.sourceTrackRevisionMap[toTrack.trackId] !== trackRevisionMarker(toTrack)) return false;
  return true;
}

export function computeReadiness(plans: PlaylistTransitionPlan[]): PlaylistPlaybackReadiness {
  if (plans.length === 0) return "unprepared";
  const readyCount = plans.filter((p) => p.status === "ready").length;
  const fallbackCount = plans.filter((p) => p.status === "ready_with_fallback").length;
  const reviewCount = plans.filter((p) => p.status === "needs_review").length;
  const blockedCount = plans.filter((p) => p.status === "blocked").length;

  if (blockedCount > 0) return "blocked";
  if (reviewCount > 0) return "needs_review";
  if (fallbackCount > 0) return "ready_with_fallbacks";
  if (readyCount === plans.length) return "ready";
  return "prepared";
}

// §17 — "Prepare for Playback": resolves assigned tracks in order, creates
// one plan per adjacency, computes readiness, leaves playback unchanged.
export function preparePlaylistForPlayback(
  playlistId: string,
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
  nowIso: string,
  existingOverrides?: PlaylistPlaybackPreparation["overrides"],
): PlaylistPlaybackPreparation {
  const assigned = resolveAssignedInOrder(slots, tracksById);

  const plans: PlaylistTransitionPlan[] = [];
  for (let i = 0; i < assigned.length - 1; i++) {
    const from = assigned[i];
    const to = assigned[i + 1];
    plans.push(buildTransitionPlan(playlistId, {
      fromSlot: from.slot, toSlot: to.slot, fromTrack: from.track, toTrack: to.track,
      fromPosition: from.position, toPosition: to.position,
    }, nowIso));
  }

  const readiness = computeReadiness(plans);
  const sourceTrackRevisionMap: Record<string, string> = {};
  for (const { track } of assigned) sourceTrackRevisionMap[track.trackId] = trackRevisionMarker(track);

  return {
    playlistId,
    version: "1.0",
    transitionPlans: plans,
    readiness,
    readyCount: plans.filter((p) => p.status === "ready").length,
    fallbackCount: plans.filter((p) => p.status === "ready_with_fallback").length,
    reviewCount: plans.filter((p) => p.status === "needs_review").length,
    blockedCount: plans.filter((p) => p.status === "blocked").length,
    sourceTrackRevisionMap,
    preparedAt: nowIso,
    detectorVersion: PLAYLIST_TRANSITION_DETECTOR_VERSION,
    warnings: [],
    overrides: existingOverrides,
  };
}

// §10/§19 — local re-preparation. Recomputes only the adjacencies whose
// slot-pair identity, resolved position, or source revision changed;
// every other plan is carried over as the exact same object (byte parity)
// so unrelated plans are provably untouched. No audio decode — same
// persisted-analysis-only path as a full prepare.
export function reprepareLocalTransitions(
  playlistId: string,
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
  preparation: PlaylistPlaybackPreparation,
  nowIso: string,
): PlaylistPlaybackPreparation {
  const assigned = resolveAssignedInOrder(slots, tracksById);
  const oldById = new Map(preparation.transitionPlans.map((p) => [p.transitionId, p]));

  const plans: PlaylistTransitionPlan[] = [];
  for (let i = 0; i < assigned.length - 1; i++) {
    const from = assigned[i];
    const to = assigned[i + 1];
    const transitionId = `${from.slot.slotId}__${to.slot.slotId}`;
    const old = oldById.get(transitionId);
    if (planIsCurrent(old, from.track, to.track, from.position, to.position, preparation)) {
      plans.push(old!);
    } else {
      plans.push(buildTransitionPlan(playlistId, {
        fromSlot: from.slot, toSlot: to.slot, fromTrack: from.track, toTrack: to.track,
        fromPosition: from.position, toPosition: to.position,
      }, nowIso));
    }
  }

  const readiness = computeReadiness(plans);
  const sourceTrackRevisionMap: Record<string, string> = {};
  for (const { track } of assigned) sourceTrackRevisionMap[track.trackId] = trackRevisionMarker(track);

  return {
    ...preparation,
    transitionPlans: plans,
    readiness,
    readyCount: plans.filter((p) => p.status === "ready").length,
    fallbackCount: plans.filter((p) => p.status === "ready_with_fallback").length,
    reviewCount: plans.filter((p) => p.status === "needs_review").length,
    blockedCount: plans.filter((p) => p.status === "blocked").length,
    sourceTrackRevisionMap,
    preparedAt: nowIso,
  };
}

// §9/§11 — count of adjacencies that `reprepareLocalTransitions` would
// actually recompute, without doing the recompute. Used by the Repair
// panel to show "N local transition plans are stale" without a full
// buildTransitionPlan pass just to render a banner.
export function countStaleLocalTransitions(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
  preparation: PlaylistPlaybackPreparation | undefined,
): number {
  if (!preparation) return 0;
  const assigned = resolveAssignedInOrder(slots, tracksById);
  const oldById = new Map(preparation.transitionPlans.map((p) => [p.transitionId, p]));

  let count = 0;
  for (let i = 0; i < assigned.length - 1; i++) {
    const from = assigned[i];
    const to = assigned[i + 1];
    const transitionId = `${from.slot.slotId}__${to.slot.slotId}`;
    const old = oldById.get(transitionId);
    if (!planIsCurrent(old, from.track, to.track, from.position, to.position, preparation)) count++;
  }
  return count;
}
