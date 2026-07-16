// Playlist Transition Preparation — staleness and local invalidation
// (§18, §19). A local edit invalidates only the affected transition(s) —
// unrelated plans must remain valid and are never recomputed.

import type { TrackSlot } from "../../data/playlistTypes";
import type { Track } from "../../data/trackTypes";
import type { PlaylistPlaybackPreparation, PlaylistTransitionPlan } from "../../data/playlistTransitionTypes";

export function isPreparationStale(
  preparation: PlaylistPlaybackPreparation | undefined,
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
): boolean {
  if (!preparation) return true;

  const ordered = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const assignedIds = ordered.filter((s) => s.assignedTrackId).map((s) => s.assignedTrackId as string);

  // Track order/assignment changed — different track set or different order.
  const preparedIds = preparation.transitionPlans.flatMap((p) => [p.fromTrackId]).concat(
    preparation.transitionPlans.length > 0 ? [preparation.transitionPlans[preparation.transitionPlans.length - 1].toTrackId] : [],
  );
  if (assignedIds.length !== preparedIds.length) return true;
  for (let i = 0; i < assignedIds.length; i++) {
    if (assignedIds[i] !== preparedIds[i]) return true;
  }

  // Source revisions changed — beat map, playback bounds, or analysis updated.
  for (const trackId of assignedIds) {
    const track = tracksById.get(trackId);
    if (!track) return true;
    const currentMarker = `${track.analysisUpdatedAt ?? ""}|${track.beatMap?.analyzedAt ?? ""}|${track.playbackBounds?.analyzedAt ?? ""}`;
    if (preparation.sourceTrackRevisionMap[trackId] !== currentMarker) return true;
  }

  return false;
}

// §19 — local invalidation. Given an edited position (0-based, in the
// resolved playlist order), returns which transitionIds are affected:
// the transition INTO the edited position and the transition OUT of it.
// Replacing position N invalidates transitions (N-1→N) and (N→N+1).
// Removing position N invalidates only the NEW adjacency it creates
// ((N-1)→(N+1) after removal) — the caller passes the post-removal slot
// list so `preparePlaylistForPlayback` naturally produces just that one
// new plan; this helper identifies which EXISTING plans to drop.
export function affectedTransitionIds(plans: PlaylistTransitionPlan[], editedPosition: number): string[] {
  return plans
    .filter((p) => p.fromPosition === editedPosition || p.toPosition === editedPosition)
    .map((p) => p.transitionId);
}

// Merges freshly-recomputed plans for the affected window into the
// existing plan list, leaving every other plan byte-for-byte untouched.
export function mergeLocalTransitionPlans(
  existingPlans: PlaylistTransitionPlan[],
  recomputedPlans: PlaylistTransitionPlan[],
  affectedIds: string[],
): PlaylistTransitionPlan[] {
  const kept = existingPlans.filter((p) => !affectedIds.includes(p.transitionId));
  const merged = [...kept, ...recomputedPlans];
  return merged.sort((a, b) => a.fromPosition - b.fromPosition);
}
