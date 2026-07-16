// Dual-Deck Playback — transition scheduling decisions (§9, §10, §11, §12,
// §13, §14, §24). Pure functions: given a plan and current playback
// position, decide WHEN to preload, WHAT gain envelopes to run, and HOW
// much prepared playlist time has elapsed. No AudioNode access.

import type { Track } from "../data/trackTypes";
import type { PlaylistTransitionPlan } from "../data/playlistTransitionTypes";
import type { GainEnvelope } from "./dualDeckTypes";
import { makeFadeInEnvelope, makeFadeOutEnvelope } from "./gainEnvelope";
import { getEffectivePlaybackDuration } from "../logic/playbackBounds/playbackDuration";

export const DEFAULT_PRELOAD_LEAD_SECONDS = 15;

// §9 — preload once within the lead window before the outgoing cue, or
// immediately if the cue is already inside (or past) that window — e.g. a
// short track or a seek that landed close to the transition.
export function shouldPreloadNextTrack(
  currentTimeSeconds: number,
  plan: PlaylistTransitionPlan,
  preloadLeadSeconds: number = DEFAULT_PRELOAD_LEAD_SECONDS,
): boolean {
  return currentTimeSeconds >= plan.outgoingCueSeconds - preloadLeadSeconds;
}

export interface TransitionEnvelopePair {
  outgoing: GainEnvelope;
  incoming: GainEnvelope;
}

// §11/§12 — equal-power crossfade envelopes over the transition's own
// duration, in "context time" measured from transition start (0..duration).
export function buildCrossfadeEnvelopes(plan: PlaylistTransitionPlan): TransitionEnvelopePair {
  const duration = Math.max(0, plan.transitionDurationSeconds);
  return {
    outgoing: makeFadeOutEnvelope(0, duration, "equal_power"),
    incoming: makeFadeInEnvelope(0, duration, "equal_power"),
  };
}

// §14 — hard cut has no envelope: outgoing goes silent and incoming goes
// full immediately. Modeled as a zero-duration envelope so callers can use
// the same gainAtContextTime() code path without a special case.
export function buildHardCutEnvelopes(): TransitionEnvelopePair {
  return {
    outgoing: { startTimeContextSeconds: 0, endTimeContextSeconds: 0, startGain: 0, endGain: 0, curve: "linear" },
    incoming: { startTimeContextSeconds: 0, endTimeContextSeconds: 0, startGain: 1, endGain: 1, curve: "linear" },
  };
}

// §10 — 0..1 progress through the transition window, driven by the
// OUTGOING deck's position (the canonical clock during overlap).
export function computeTransitionProgress(currentOutgoingTimeSeconds: number, plan: PlaylistTransitionPlan): number {
  const duration = plan.transitionDurationSeconds;
  if (duration <= 0) return currentOutgoingTimeSeconds >= plan.outgoingCueSeconds ? 1 : 0;
  const elapsed = currentOutgoingTimeSeconds - plan.outgoingCueSeconds;
  return Math.max(0, Math.min(1, elapsed / duration));
}

function effectiveTrackDuration(track: Track): number {
  if (track.playbackBounds) return getEffectivePlaybackDuration(track.playbackBounds);
  return track.durationSeconds ?? 0;
}

// §24 — a track's contribution to the PREPARED playlist timeline: its own
// effective duration minus the overlap consumed by ITS outgoing transition
// (the incoming side of the next track's transition is the same seconds,
// counted once here — matches computePreparedPlaylistDuration's subtraction
// of each transitionDurationSeconds exactly once across all plans).
export function preparedSegmentSeconds(track: Track, outgoingPlan: PlaylistTransitionPlan | undefined): number {
  const effective = effectiveTrackDuration(track);
  const overlap = outgoingPlan ? outgoingPlan.transitionDurationSeconds : 0;
  return Math.max(0, effective - overlap);
}

// §24 — elapsed prepared playlist time. `completedTrackIds` are tracks the
// session has fully promoted past (in order); `currentDeckElapsedSeconds` is
// the active deck's current position minus its own cue start. Overlap is
// never double-counted: each completed segment already had its own outgoing
// overlap subtracted, and the current segment is capped at its own prepared
// length so simultaneous incoming-deck playback during a crossfade doesn't
// add extra elapsed time on top of the outgoing deck's clock.
export function computePreparedElapsedSeconds(
  completedTrackIds: string[],
  tracksById: Map<string, Track>,
  plansByFromTrackId: Map<string, PlaylistTransitionPlan>,
  currentTrackId: string | undefined,
  currentDeckElapsedSeconds: number,
): number {
  let elapsed = 0;
  for (const trackId of completedTrackIds) {
    const track = tracksById.get(trackId);
    if (!track) continue;
    elapsed += preparedSegmentSeconds(track, plansByFromTrackId.get(trackId));
  }
  if (currentTrackId) {
    const track = tracksById.get(currentTrackId);
    if (track) {
      const segmentLength = preparedSegmentSeconds(track, plansByFromTrackId.get(currentTrackId));
      elapsed += Math.max(0, Math.min(segmentLength, currentDeckElapsedSeconds));
    }
  }
  return elapsed;
}
