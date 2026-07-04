import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistRecord, TrackPlaybackIssue } from "../data/playProjectTypes";

export function normalizeFilePath(path?: string): string {
  return (path ?? "").trim().toLowerCase().replace(/\\/g, "/");
}

export function findPlaylistDuplicate(params: {
  slots: TrackSlot[];
  candidateTrack: Track;
  tracksById: Map<string, Track>;
  skipSlotIndex?: number;
}): {
  duplicate: boolean;
  reason?: "trackId" | "filePath";
  existingSlotIndex?: number;
  existingTrackId?: string;
} {
  const { slots, candidateTrack, tracksById, skipSlotIndex } = params;
  const normPath = normalizeFilePath(candidateTrack.filePath);

  for (const slot of slots) {
    if (skipSlotIndex !== undefined && slot.slotIndex === skipSlotIndex) continue;
    if (!slot.assignedTrackId) continue;
    if (slot.assignedTrackId === candidateTrack.trackId) {
      return { duplicate: true, reason: "trackId", existingSlotIndex: slot.slotIndex, existingTrackId: slot.assignedTrackId };
    }
    if (normPath) {
      const other = tracksById.get(slot.assignedTrackId);
      if (other && normalizeFilePath(other.filePath) === normPath) {
        return { duplicate: true, reason: "filePath", existingSlotIndex: slot.slotIndex, existingTrackId: slot.assignedTrackId };
      }
    }
  }
  return { duplicate: false };
}

const SUPPORTED_EXTS = new Set([".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".opus", ".aiff", ".aif"]);

function fileExt(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i).toLowerCase() : "";
}

export function getEligiblePlaylistCandidates(params: {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  tracksById: Map<string, Track>;
  excludedTrackIds: Set<string>;
  trackPlaybackIssues?: Record<string, TrackPlaybackIssue>;
  skipSlotIndex?: number;
}): { candidates: Track[]; rejected: { trackId: string; reason: string }[] } {
  const { playlist, libraryTracks, tracksById, excludedTrackIds, trackPlaybackIssues, skipSlotIndex } = params;
  const candidates: Track[] = [];
  const rejected: { trackId: string; reason: string }[] = [];

  for (const track of libraryTracks) {
    if (excludedTrackIds.has(track.trackId)) {
      rejected.push({ trackId: track.trackId, reason: "excluded" });
      continue;
    }
    if (trackPlaybackIssues?.[track.trackId]?.status === "unplayable") {
      rejected.push({ trackId: track.trackId, reason: "unplayable" });
      continue;
    }
    const fp = track.filePath?.trim();
    if (!fp || !SUPPORTED_EXTS.has(fileExt(fp))) {
      rejected.push({ trackId: track.trackId, reason: "no_valid_path" });
      continue;
    }
    const { duplicate, reason } = findPlaylistDuplicate({
      slots: playlist.slots,
      candidateTrack: track,
      tracksById,
      skipSlotIndex,
    });
    if (duplicate) {
      rejected.push({ trackId: track.trackId, reason: `duplicate_${reason}` });
      continue;
    }
    candidates.push(track);
  }
  return { candidates, rejected };
}
