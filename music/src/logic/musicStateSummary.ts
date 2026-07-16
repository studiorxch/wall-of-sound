import type { PlayProject } from "../data/playProjectTypes";
import type { MusicSaveReason } from "./musicAutosave";

export interface MusicStateSummary {
  playlistCount: number;
  nonDefaultPlaylistCount: number;
  crateCount: number;
  bankCount: number;
  samplerBankCount: number;
  trackCount: number;
  externalTrackCount: number;
  referenceTrackCount: number;
  studioTrackCount: number;
  analyzedTrackCount: number;
  playableTrackCount: number;
  emptyDefaultOnlyPlaylist: boolean;
  lastSaveReason?: MusicSaveReason;
  lastSavedAt?: string;
}

type StoredMeta = { lastSaveReason?: MusicSaveReason; lastSavedAt?: string };

export function summarizeMusicState(state: PlayProject): MusicStateSummary {
  const tracks = state.libraryTracks ?? [];
  const playlists = state.playlists ?? [];
  const crates = state.crates ?? [];

  const userPlaylists = playlists.filter((pl) => pl.playlistKind !== "reference_overlay");
  const samplerBanks = playlists.filter((pl) => pl.playlistKind === "reference_overlay");
  const nonDefaultPlaylists = userPlaylists.filter(
    (pl) => pl.title !== "My Mix" || (pl.slots?.length ?? 0) > 0,
  );
  const emptyDefaultOnlyPlaylist =
    userPlaylists.length === 1 &&
    userPlaylists[0].title === "My Mix" &&
    (userPlaylists[0].slots?.length ?? 0) === 0;

  const meta = state as unknown as StoredMeta;

  return {
    playlistCount: userPlaylists.length,
    nonDefaultPlaylistCount: nonDefaultPlaylists.length,
    crateCount: crates.length,
    bankCount: 0,
    samplerBankCount: samplerBanks.length,
    trackCount: tracks.length,
    externalTrackCount: tracks.filter((t) => t.sourceOwner === "external").length,
    referenceTrackCount: tracks.filter((t) => t.sourceOwner === "reference").length,
    studioTrackCount: tracks.filter((t) => t.sourceOwner === "studiorich").length,
    analyzedTrackCount: tracks.filter(
      (t) => t.analysisStatus === "analyzed" || t.analysisStatus === "partial",
    ).length,
    playableTrackCount: tracks.filter(
      (t) => t.sourceOwner !== "reference" && (t.audioLinked || !!t.objectUrl),
    ).length,
    emptyDefaultOnlyPlaylist,
    lastSaveReason: meta.lastSaveReason,
    lastSavedAt: meta.lastSavedAt,
  };
}
