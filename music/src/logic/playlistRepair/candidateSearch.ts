// Playlist Local Repair — candidate search (§8). Searches against the SAME
// crates already assigned to the zone's section, using the SAME eligibility/
// duplicate-prevention rules generation already uses — no separate candidate
// universe, no duplicated math.

import type { Track } from "../../data/trackTypes";
import type { CrateRecord } from "../../data/crateTypes";
import type { PlaylistShapeSection } from "../../data/playlistShapeTypes";
import type { PlaylistRepairZone } from "../../data/playlistRepairTypes";
import { resolveCratePool } from "../resolveCrate";
import { createPlaylistDuplicateGuard, filterDuplicateCandidates, markTrackUsed, type PlaylistDuplicateGuard } from "../../lib/playlistDuplicateGuard";

export interface CandidateSearchInput {
  zone: PlaylistRepairZone;
  section?: PlaylistShapeSection;
  cratesById: Map<string, CrateRecord>;
  libraryTracks: Track[];
  /** Every track currently assigned anywhere in the playlist — seeds the
   * duplicate guard so a candidate already used elsewhere is excluded,
   * except the zone's own current track (a track may legitimately "replace
   * itself" if the search is just re-checking, though callers normally skip
   * that case). */
  playlistTrackIds: string[];
}

/**
 * Step 1 of §8's ordering: section eligibility, crate membership, duplicate
 * exclusion. Steps 4–12 (energy/BPM/key/mood/role/duration fit, confidence)
 * happen in candidateRanking.ts, which needs the full Track objects this
 * returns plus prev/next context — search only narrows the universe.
 */
export function searchRepairCandidates(input: CandidateSearchInput): Track[] {
  const { zone, section, cratesById, libraryTracks, playlistTrackIds } = input;

  // Section eligibility (§8 step 1): use the SAME crates already assigned to
  // this section — a repair must not reach into unrelated crates the user
  // never intended for this part of the playlist.
  const crateIds = section ? section.crateWeights.map((cw) => cw.crateId) : [...cratesById.keys()];
  if (crateIds.length === 0) return [];

  const pool = resolveCratePool(crateIds, cratesById, libraryTracks);

  // Duplicate exclusion (§8 step 11): seed the guard with every track
  // already in the playlist EXCEPT the one being replaced, so the current
  // (possibly-fine) track doesn't wrongly exclude itself from re-selection,
  // but every other slot's track correctly blocks re-use.
  const guard: PlaylistDuplicateGuard = createPlaylistDuplicateGuard();
  for (const id of playlistTrackIds) {
    if (id === zone.currentTrackId) continue;
    const t = libraryTracks.find((tr) => tr.trackId === id);
    if (t) markTrackUsed(t, guard);
  }

  return filterDuplicateCandidates(pool, guard);
}
