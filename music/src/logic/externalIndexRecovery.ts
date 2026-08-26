// MUSIC P0 Clean Library Foundation — Step C2: External Update Library
// Durability (0826C_MUSIC_P0_External_Update_Library_Durability).
//
// Pure — no fetch, no React, no IndexedDB. The disk-index recovery merge
// used to be a wholesale "index wins" replace whenever the on-disk
// library.index.json's track count for an owner (external/reference)
// merely DIFFERED from what IndexedDB held — in either direction. That
// silently discarded any track IndexedDB had that a stale/behind disk
// index didn't, which is exactly how a real, accepted External library
// update got permanently reverted on the very next reload (live-reproduced
// during Step C testing).
//
// The disk index is now treated strictly as a RECOVERY/enrichment source,
// never an authority that can shrink or overwrite the accepted state: this
// function only ever identifies tracks disk has that IndexedDB is missing
// entirely (e.g. a fresh/cleared browser profile, or IndexedDB genuinely
// lagging a disk write that hasn't landed yet) — it never removes or
// overwrites a track IndexedDB already has.

import type { Track, TrackSourceOwner } from "../data/trackTypes";

/**
 * Tracks present in `diskTracks` for `owner` that `savedTracks` does not
 * already have (by trackId). Safe to append to the accepted library —
 * never returns anything that would require removing or replacing an
 * existing track.
 */
export function findTracksMissingFromSaved(
  savedTracks: Track[],
  diskTracks: Track[],
  owner: TrackSourceOwner,
): Track[] {
  const savedOwnerIds = new Set(
    savedTracks.filter((t) => t.sourceOwner === owner).map((t) => t.trackId),
  );
  return diskTracks.filter((t) => !savedOwnerIds.has(t.trackId));
}
