// Playlist Repair — candidate transition preview (§12). Informational-only
// preview of what the previous→candidate and candidate→next transitions
// would look like if a repair candidate were applied. Reuses
// buildTransitionPlan exactly as prepared plans do; never persisted, never
// used to reorder or re-rank candidates (§298 — no ranking-weight changes).

import type { Track } from "../../data/trackTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import type { RepairCandidateTransitionPreview } from "../../data/playlistTransitionTypes";
import { buildTransitionPlan } from "../playlistTransition/preparePlaylist";

function previewSlot(id: string): TrackSlot {
  return {
    slotId: id,
    slotIndex: 0,
    startTimeSeconds: 0,
    targetEnergy: 0,
    targetBpm: 0,
    warningLevel: "none",
    warningMessages: [],
  };
}

export function previewCandidateTransition(
  playlistId: string,
  candidateTrackId: string,
  previousTrack: Track | undefined,
  nextTrack: Track | undefined,
  tracksById: Map<string, Track>,
  nowIso: string,
): RepairCandidateTransitionPreview {
  const candidateTrack = tracksById.get(candidateTrackId);
  const warningCodes: string[] = [];
  if (!candidateTrack) return { candidateTrackId, warningCodes };

  const preview: RepairCandidateTransitionPreview = { candidateTrackId, warningCodes };

  if (previousTrack) {
    const plan = buildTransitionPlan(playlistId, {
      fromSlot: previewSlot("preview-previous"), toSlot: previewSlot("preview-candidate"),
      fromTrack: previousTrack, toTrack: candidateTrack, fromPosition: 0, toPosition: 1,
    }, nowIso);
    preview.previousPlanStatus = plan.status;
    preview.previousSyncMode = plan.syncMode;
    preview.previousConfidence = plan.confidence;
    warningCodes.push(...plan.warnings);
  }

  if (nextTrack) {
    const plan = buildTransitionPlan(playlistId, {
      fromSlot: previewSlot("preview-candidate"), toSlot: previewSlot("preview-next"),
      fromTrack: candidateTrack, toTrack: nextTrack, fromPosition: 0, toPosition: 1,
    }, nowIso);
    preview.nextPlanStatus = plan.status;
    preview.nextSyncMode = plan.syncMode;
    preview.nextConfidence = plan.confidence;
    warningCodes.push(...plan.warnings);
  }

  return preview;
}
