import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistRecord, PlaylistFillReport, TrackPlaybackIssue } from "../data/playProjectTypes";
import { appendTrackToPlaylist, reindexPlaylistSlots } from "./manualPlaylistOrder";
import { evaluateSlotWarnings } from "./warningEngine";

const SUPPORTED_EXTS = new Set([".mp3", ".flac", ".wav", ".aac", ".ogg", ".m4a", ".opus", ".aiff", ".aif"]);

function fileExt(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i).toLowerCase() : "";
}

function normPath(p: string): string {
  return p.trim().toLowerCase().replace(/\\/g, "/");
}

function playlistDuration(slots: TrackSlot[], tracksById: Map<string, Track>): number {
  return slots.reduce(
    (sum, s) => sum + (tracksById.get(s.assignedTrackId ?? "")?.durationSeconds ?? 0),
    0,
  );
}

const RATING_RANK: Record<string, number> = {
  "5star": 5, "4star": 4, "3star": 3, "2star": 2, "1star": 1, skip: 0,
};

export function fillMissingTime(params: {
  playlist: PlaylistRecord;
  libraryTracks: Track[];
  excludedTrackIds: Set<string>;
  attemptedAt: string;
  trackPlaybackIssues?: Record<string, TrackPlaybackIssue>;
  // Source-group isolation (0621E): when provided, only these track ids may be
  // pulled as new candidates. The full libraryTracks is still used to resolve
  // already-placed slot tracks (duration/dedup), so manual placements stay intact.
  eligibleTrackIds?: Set<string>;
}): { slots: TrackSlot[]; report: PlaylistFillReport } {
  const { playlist, libraryTracks, excludedTrackIds, attemptedAt, trackPlaybackIssues, eligibleTrackIds } = params;

  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));
  const targetSeconds = playlist.targetDurationMinutes * 60;
  const currentBefore = playlistDuration(playlist.slots, tracksById);
  const missingBefore = Math.max(0, targetSeconds - currentBefore);

  const baseReport: Omit<PlaylistFillReport, "currentSecondsAfter" | "missingSecondsAfter" | "insertedTrackCount"> = {
    attemptedAt,
    targetSeconds,
    currentSecondsBefore: currentBefore,
    missingSecondsBefore: missingBefore,
    eligibleTrackCount: 0,
  };

  if (missingBefore <= 0) {
    return {
      slots: playlist.slots,
      report: {
        ...baseReport,
        currentSecondsAfter: currentBefore,
        missingSecondsAfter: 0,
        insertedTrackCount: 0,
        reason: "Playlist already at or above target duration",
      },
    };
  }

  // Build sets of already-assigned tracks/paths
  const assignedIds = new Set(
    playlist.slots.map((s) => s.assignedTrackId).filter(Boolean) as string[],
  );
  const assignedPaths = new Set<string>();
  for (const id of assignedIds) {
    const fp = tracksById.get(id)?.filePath;
    if (fp) assignedPaths.add(normPath(fp));
  }

  const eligible = libraryTracks.filter((t) => {
    if (excludedTrackIds.has(t.trackId)) return false;
    if (eligibleTrackIds && !eligibleTrackIds.has(t.trackId)) return false;
    if (trackPlaybackIssues?.[t.trackId]?.status === "unplayable") return false;
    if (assignedIds.has(t.trackId)) return false;
    const fp = t.filePath?.trim();
    if (!fp) return false;
    if (assignedPaths.has(normPath(fp))) return false;
    if (!SUPPORTED_EXTS.has(fileExt(fp))) return false;
    return true;
  });

  // Sort: rating desc, then play count asc (prefer high-rated, less-played)
  eligible.sort((a, b) => {
    const ra = RATING_RANK[a.rating ?? ""] ?? 2;
    const rb = RATING_RANK[b.rating ?? ""] ?? 2;
    if (rb !== ra) return rb - ra;
    return (a.playCount ?? 0) - (b.playCount ?? 0);
  });

  if (eligible.length === 0) {
    return {
      slots: playlist.slots,
      report: {
        ...baseReport,
        eligibleTrackCount: 0,
        currentSecondsAfter: currentBefore,
        missingSecondsAfter: missingBefore,
        insertedTrackCount: 0,
        reason: "No eligible unused tracks available in library",
      },
    };
  }

  let slots = [...playlist.slots];
  let remaining = missingBefore;
  let inserted = 0;
  const usedEligible = new Set<string>();

  // Phase 1: fill existing empty slots in-place
  const emptySlotIndices = slots
    .map((s, i) => (!s.assignedTrackId ? i : -1))
    .filter((i) => i >= 0);

  for (const slotIdx of emptySlotIndices) {
    if (remaining <= 0) break;
    const best = eligible.find((t) => !usedEligible.has(t.trackId));
    if (!best) break;
    slots = slots.map((s, i) => i === slotIdx ? { ...s, assignedTrackId: best.trackId } : s);
    assignedIds.add(best.trackId);
    if (best.filePath) assignedPaths.add(normPath(best.filePath));
    usedEligible.add(best.trackId);
    remaining -= best.durationSeconds ?? 0;
    inserted++;
  }

  // Phase 2: append new slots until target reached or pool exhausted
  for (const track of eligible) {
    if (remaining <= 0) break;
    if (usedEligible.has(track.trackId)) continue;
    slots = appendTrackToPlaylist(slots, track.trackId);
    assignedIds.add(track.trackId);
    if (track.filePath) assignedPaths.add(normPath(track.filePath));
    remaining -= track.durationSeconds ?? 0;
    inserted++;
  }

  const reindexed = reindexPlaylistSlots(slots, tracksById);
  const evaluated = evaluateSlotWarnings({ slots: reindexed, tracksById });
  const currentAfter = playlistDuration(evaluated, tracksById);
  const missingAfter = Math.max(0, targetSeconds - currentAfter);

  let reason: string | undefined;
  if (missingAfter > 0) {
    reason = `Added ${inserted} track${inserted !== 1 ? "s" : ""}. Library pool exhausted — ${Math.round(missingAfter / 60)} min still missing.`;
  }

  return {
    slots: evaluated,
    report: {
      ...baseReport,
      eligibleTrackCount: eligible.length,
      currentSecondsAfter: currentAfter,
      missingSecondsAfter: missingAfter,
      insertedTrackCount: inserted,
      reason,
    },
  };
}
