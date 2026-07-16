// Canonical playlist duplicate guard (0711_MUSIC_Playlist_Duplicate_Track_Guard).
//
// One playlist = one use per canonical track identity, by default. This is
// the single source of truth for "is this track already in the playlist" —
// every generation path (shape builder, arc builder, curve assigner) and the
// shared final-output gate (trackEligibility.ts) must use the SAME guard
// object across the whole run, not a fresh one per section, and the SAME
// canonical-key function, or two different generators could disagree about
// what counts as a duplicate.

import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";

export type PlaylistDuplicatePolicy = {
  allowExactTrackDuplicates: boolean;
  allowCanonicalSongDuplicates: boolean;
};

export const DEFAULT_DUPLICATE_POLICY: PlaylistDuplicatePolicy = {
  allowExactTrackDuplicates: false,
  allowCanonicalSongDuplicates: false,
};

export type PlaylistDuplicateGuard = {
  usedTrackIds: Set<string>;
  usedCanonicalKeys: Set<string>;
};

export type DuplicateCheckResult = {
  allowed: boolean;
  reason?: "exact_track_duplicate" | "canonical_song_duplicate";
  duplicateKey?: string;
};

const AUDIO_EXT_RE = /\.(mp3|wav|flac|aiff?|m4a|aac|ogg|opus)$/i;

/** lowercase, trim, collapse spaces, strip a trailing file extension and punctuation noise. */
export function normalizeDuplicateText(s: string): string {
  return s
    .replace(AUDIO_EXT_RE, "")
    .toLowerCase()
    .replace(/[._\-]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Level 2 — canonical song identity: normalized artist + normalized title. */
export function getTrackDuplicateKey(track: Pick<Track, "trackId" | "artist" | "title">): string {
  const artist = normalizeDuplicateText(track.artist ?? "");
  const title = normalizeDuplicateText(track.title ?? "");
  if (artist || title) return `${artist}::${title}`;
  return `track:${track.trackId}`;
}

export function createPlaylistDuplicateGuard(): PlaylistDuplicateGuard {
  return { usedTrackIds: new Set(), usedCanonicalKeys: new Set() };
}

export function checkTrackDuplicate(
  track: Track,
  guard: PlaylistDuplicateGuard,
  policy: PlaylistDuplicatePolicy = DEFAULT_DUPLICATE_POLICY,
): DuplicateCheckResult {
  if (!policy.allowExactTrackDuplicates && guard.usedTrackIds.has(track.trackId)) {
    return { allowed: false, reason: "exact_track_duplicate", duplicateKey: track.trackId };
  }
  const key = getTrackDuplicateKey(track);
  if (!policy.allowCanonicalSongDuplicates && guard.usedCanonicalKeys.has(key)) {
    return { allowed: false, reason: "canonical_song_duplicate", duplicateKey: key };
  }
  return { allowed: true };
}

export function markTrackUsed(track: Track, guard: PlaylistDuplicateGuard): void {
  guard.usedTrackIds.add(track.trackId);
  guard.usedCanonicalKeys.add(getTrackDuplicateKey(track));
}

export function filterDuplicateCandidates(
  candidates: Track[],
  guard: PlaylistDuplicateGuard,
  policy: PlaylistDuplicatePolicy = DEFAULT_DUPLICATE_POLICY,
): Track[] {
  return candidates.filter((t) => checkTrackDuplicate(t, guard, policy).allowed);
}

// ── Final output validator (spec §Final Output Validator) ───────────────────

export type PlaylistDuplicateReport = {
  exactTrackDuplicates: Array<{ trackId: string; slotIndexes: number[] }>;
  canonicalSongDuplicates: Array<{ duplicateKey: string; trackIds: string[]; slotIndexes: number[] }>;
};

/** Scans already-assembled slots for duplicate use — the last line of defense. */
export function findPlaylistDuplicates(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
): PlaylistDuplicateReport {
  const trackIdSlots = new Map<string, number[]>();
  const canonicalSlots = new Map<string, { trackIds: Set<string>; slotIndexes: number[] }>();

  for (const slot of slots) {
    if (!slot.assignedTrackId) continue;
    const track = tracksById.get(slot.assignedTrackId);
    if (!track) continue;

    const idxs = trackIdSlots.get(slot.assignedTrackId) ?? [];
    idxs.push(slot.slotIndex);
    trackIdSlots.set(slot.assignedTrackId, idxs);

    const key = getTrackDuplicateKey(track);
    const entry = canonicalSlots.get(key) ?? { trackIds: new Set<string>(), slotIndexes: [] };
    entry.trackIds.add(track.trackId);
    entry.slotIndexes.push(slot.slotIndex);
    canonicalSlots.set(key, entry);
  }

  const exactTrackDuplicates = [...trackIdSlots.entries()]
    .filter(([, idxs]) => idxs.length > 1)
    .map(([trackId, slotIndexes]) => ({ trackId, slotIndexes }));

  const canonicalSongDuplicates = [...canonicalSlots.entries()]
    .filter(([, entry]) => entry.slotIndexes.length > 1)
    .map(([duplicateKey, entry]) => ({ duplicateKey, trackIds: [...entry.trackIds], slotIndexes: entry.slotIndexes }));

  return { exactTrackDuplicates, canonicalSongDuplicates };
}

export function hasPlaylistDuplicates(report: PlaylistDuplicateReport): boolean {
  return report.exactTrackDuplicates.length > 0 || report.canonicalSongDuplicates.length > 0;
}

/**
 * For every duplicate group found by findPlaylistDuplicates, keeps the FIRST
 * slot (by slotIndex) and returns the trackIds assigned to every later
 * occurrence — the set the final gate should strip/backfill.
 */
export function collectDuplicateLeakTrackIds(slots: TrackSlot[], tracksById: Map<string, Track>): Set<string> {
  const report = findPlaylistDuplicates(slots, tracksById);
  const leakSlotIndexes = new Set<number>();
  for (const dup of report.exactTrackDuplicates) {
    const sorted = [...dup.slotIndexes].sort((a, b) => a - b);
    sorted.slice(1).forEach((i) => leakSlotIndexes.add(i));
  }
  for (const dup of report.canonicalSongDuplicates) {
    const sorted = [...dup.slotIndexes].sort((a, b) => a - b);
    sorted.slice(1).forEach((i) => leakSlotIndexes.add(i));
  }
  const leakTrackIds = new Set<string>();
  for (const slot of slots) {
    if (slot.assignedTrackId && leakSlotIndexes.has(slot.slotIndex)) leakTrackIds.add(slot.assignedTrackId);
  }
  return leakTrackIds;
}
