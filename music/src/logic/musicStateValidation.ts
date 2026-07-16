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
    if (prevSum.nonDefaultPlaylistCount > 0 && nextSum.emptyDefaultOnlyPlaylist) return false;
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

  const prevUser = prevPlaylists.filter((pl) => pl.playlistKind !== "reference_overlay");
  const nextUser = nextPlaylists.filter((pl) => pl.playlistKind !== "reference_overlay");
  const prevBanks = prevPlaylists.filter((pl) => pl.playlistKind === "reference_overlay");
  const nextBanks = nextPlaylists.filter((pl) => pl.playlistKind === "reference_overlay");

  const isDefaultOnly = (pls: typeof nextUser) =>
    pls.length === 1 && pls[0].title === "My Mix" && (pls[0].slots?.length ?? 0) === 0;

  if (prevUser.length > 0 && !isDefaultOnly(prevUser) && isDefaultOnly(nextUser)) {
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
