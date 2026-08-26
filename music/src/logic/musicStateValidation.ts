import type { PlayProject } from "../data/playProjectTypes";
import { summarizeMusicState } from "./musicStateSummary";

export interface DestructiveGuardResult {
  blocked: boolean;
  blockReason?: string;
}

export function isMusicStateValid(value: unknown): value is PlayProject {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<PlayProject>;
  if (p.schemaVersion !== "play-project-v2") return false;
  if (!Array.isArray(p.playlists)) return false;
  if (!Array.isArray(p.libraryTracks)) return false;
  return true;
}

// Per-sourceOwner collapse check (0813_MUSIC_P0_Clean_Library_Foundation).
// The aggregate-only trackCount check below can miss a library-specific
// wipe entirely: if External is the numerically smaller library, a bug
// that zeroes it out 100% while Catalog stays untouched can easily stay
// under the aggregate 80% floor, since Catalog's larger count masks the
// ratio. Checked independently per library so no single library's loss
// can hide behind another library's size.
function hasPerSourceCollapse(
  prevSum: ReturnType<typeof summarizeMusicState>,
  nextSum: ReturnType<typeof summarizeMusicState>,
): boolean {
  if (prevSum.externalTrackCount >= 10 && nextSum.externalTrackCount < prevSum.externalTrackCount * 0.8) return true;
  if (prevSum.studioTrackCount >= 10 && nextSum.studioTrackCount < prevSum.studioTrackCount * 0.8) return true;
  if (prevSum.referenceTrackCount >= 10 && nextSum.referenceTrackCount < prevSum.referenceTrackCount * 0.8) return true;
  return false;
}

export function isMusicStateHealthy(
  next: PlayProject,
  prev?: PlayProject | null,
): boolean {
  const nextSum = summarizeMusicState(next);
  if (nextSum.trackCount === 0) return false;
  if (!next.playlists || next.playlists.length === 0) return false;
  if (prev) {
    const prevSum = summarizeMusicState(prev);
    if (prevSum.trackCount >= 10 && nextSum.trackCount < prevSum.trackCount * 0.8) return false;
    if (hasPerSourceCollapse(prevSum, nextSum)) return false;
    if (prevSum.hasOtherRealPlaylistThanDefault && nextSum.emptyDefaultOnlyPlaylist) return false;
    if (prevSum.crateCount > 0 && nextSum.crateCount === 0) return false;
    if (prevSum.samplerBankCount > 0 && nextSum.samplerBankCount === 0) return false;
  }
  return true;
}

export function checkDestructiveSave(
  prev: PlayProject | null,
  next: PlayProject,
): DestructiveGuardResult {
  if (!prev) return { blocked: false };

  const prevPlaylists = prev.playlists ?? [];
  const nextPlaylists = next.playlists ?? [];
  const prevCrates = prev.crates ?? [];
  const nextCrates = next.crates ?? [];
  const prevTracks = prev.libraryTracks ?? [];
  const nextTracks = next.libraryTracks ?? [];

  const prevSum = summarizeMusicState(prev);
  const nextSum = summarizeMusicState(next);

  if (hasPerSourceCollapse(prevSum, nextSum)) {
    return { blocked: true, blockReason: "source_library_collapse" };
  }

  const prevUser = prevPlaylists.filter((pl) => pl.playlistKind !== "reference_overlay");
  const nextUser = nextPlaylists.filter((pl) => pl.playlistKind !== "reference_overlay");
  const prevBanks = prevPlaylists.filter((pl) => pl.playlistKind === "reference_overlay");
  const nextBanks = nextPlaylists.filter((pl) => pl.playlistKind === "reference_overlay");

  // MUSIC P0 Clean Library Foundation — Step E2
  // (0826E_MUSIC_P0_Playlist_Empty_State_Persistence). Was:
  // `prevUser.length > 0 && !isDefaultOnly(prevUser) && isDefaultOnly(nextUser)`
  // — which blocked whenever the PREVIOUS user-playlist set merely wasn't
  // "just an empty My Mix", even when "My Mix" (with tracks) was the
  // ONLY playlist that had ever existed. That made a completely ordinary,
  // reversible edit — a user removing the last track from their own only
  // playlist — indistinguishable from real playlist history vanishing,
  // live-reproduced during Step E cleanup: the UI showed the playlist as
  // emptied (optimistic state), the save was silently rejected, and the
  // track reappeared on the next reload with no error ever shown.
  // hasOtherRealPlaylistThanDefault is the precise signal instead: it's
  // only true when some OTHER real playlist existed besides "My Mix"
  // itself, which is the actual condition worth protecting against.
  // Genuine multi-playlist collapse remains fully blocked; a user's only
  // playlist going to zero tracks via direct removal no longer is.
  if (prevSum.hasOtherRealPlaylistThanDefault && nextSum.emptyDefaultOnlyPlaylist) {
    return { blocked: true, blockReason: "default_overwrite" };
  }
  if (prevCrates.length > 0 && nextCrates.length === 0) {
    return { blocked: true, blockReason: "crate_loss" };
  }
  if (prevUser.length >= 2 && nextUser.length < prevUser.length * 0.5) {
    return { blocked: true, blockReason: "large_playlist_drop" };
  }
  if (prevTracks.length >= 10 && nextTracks.length < prevTracks.length * 0.8) {
    return { blocked: true, blockReason: "track_library_collapse" };
  }
  if (prevBanks.length > 0 && nextBanks.length === 0) {
    return { blocked: true, blockReason: "sampler_bank_wipe" };
  }

  return { blocked: false };
}
