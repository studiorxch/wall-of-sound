import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";
import { appendTrackToPlaylist, reindexPlaylistSlots } from "./manualPlaylistOrder";
import { evaluateSlotWarnings } from "./warningEngine";

// ── Drag payload ──────────────────────────────────────────────────────────────

export type TrackDragPayload = {
  type: "track";
  source: "library" | "playlist";
  sourcePlaylistId?: string;
  trackIds: string[];
};

export const TRACK_DRAG_MIME = "application/x-play-tracks";

export function encodeTrackDrag(payload: TrackDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeTrackDrag(raw: string): TrackDragPayload | null {
  try {
    const p = JSON.parse(raw);
    if (p?.type === "track" && Array.isArray(p.trackIds)) return p as TrackDragPayload;
    return null;
  } catch {
    return null;
  }
}

// ── Duplicate detection ───────────────────────────────────────────────────────

export function normalizeFilePath(path?: string): string {
  return (path ?? "").trim().toLowerCase().replace(/\\/g, "/");
}

export function playlistContainsTrack(params: {
  slots: TrackSlot[];
  track: Track;
  tracksById: Map<string, Track>;
}): boolean {
  const { slots, track, tracksById } = params;
  const normPath = normalizeFilePath(track.filePath);
  return slots.some((s) => {
    if (!s.assignedTrackId) return false;
    if (s.assignedTrackId === track.trackId) return true;
    if (normPath) {
      const other = tracksById.get(s.assignedTrackId);
      if (other && normalizeFilePath(other.filePath) === normPath) return true;
    }
    return false;
  });
}

// ── Append helper ─────────────────────────────────────────────────────────────

export function appendTracksToPlaylist(params: {
  playlist: PlaylistRecord;
  tracksToAdd: Track[];
  tracksById: Map<string, Track>;
}): {
  playlist: PlaylistRecord;
  addedTrackIds: string[];
  skippedDuplicateTrackIds: string[];
} {
  const { playlist, tracksToAdd, tracksById } = params;
  const addedTrackIds: string[] = [];
  const skippedDuplicateTrackIds: string[] = [];

  let slots = [...playlist.slots];

  for (const track of tracksToAdd) {
    const isDup = playlistContainsTrack({ slots, track, tracksById });
    if (isDup) {
      skippedDuplicateTrackIds.push(track.trackId);
      continue;
    }
    slots = appendTrackToPlaylist(slots, track.trackId);
    addedTrackIds.push(track.trackId);
  }

  if (addedTrackIds.length === 0) {
    return { playlist, addedTrackIds, skippedDuplicateTrackIds };
  }

  const reindexed = reindexPlaylistSlots(slots, tracksById);
  const evaluated = evaluateSlotWarnings({ slots: reindexed, tracksById });
  const now = new Date().toISOString();

  return {
    playlist: { ...playlist, slots: evaluated, manualOrderDirty: true, updatedAt: now },
    addedTrackIds,
    skippedDuplicateTrackIds,
  };
}
