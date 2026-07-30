// 0728E_MUSIC_Catalog_Single_Track_Remove — before a single-track removal is
// confirmed, report every existing system that currently references it, so
// the confirmation never silently omits a real dependency. Read-only: does
// not mutate or repair anything, and does not duplicate any matching logic —
// crate membership reuses resolveCrateTracks() verbatim (the same function
// Crates/CrateDetail already use to resolve a crate's live track set), and
// playlist/RADIO membership are plain lookups over the same records the app
// already holds in memory.

import type { Track } from "../../data/trackTypes";
import type { CrateRecord } from "../../data/crateTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { RadioBank } from "../../data/radioBankTypes";
import { resolveCrateTracks } from "../resolveCrate";

export interface TrackReferenceMatch {
  id: string;
  label: string;
}

export interface TrackReferenceReport {
  crates: TrackReferenceMatch[];
  playlists: TrackReferenceMatch[];
  radioPlaylists: TrackReferenceMatch[];
  radioBanks: TrackReferenceMatch[];
}

export interface FindTrackReferencesInput {
  crates?: CrateRecord[];
  libraryTracks?: Track[];
  musicPlaylists?: PlaylistRecord[];
  radioInboxItems?: RadioInboxItem[];
  radioPlaylists?: RadioPlaylist[];
  radioBanks?: RadioBank[];
}

export function findTrackReferences(trackId: string, input: FindTrackReferencesInput): TrackReferenceReport {
  const libraryTracks = input.libraryTracks ?? [];

  const crates = (input.crates ?? [])
    .filter((c) => resolveCrateTracks(c, libraryTracks).tracks.some((t) => t.trackId === trackId))
    .map((c) => ({ id: c.id, label: c.name }));

  const playlists = (input.musicPlaylists ?? [])
    .filter((pl) => pl.slots.some((s) => s.assignedTrackId === trackId))
    .map((pl) => ({ id: pl.playlistId, label: pl.title }));

  // RADIO's reference chain is indirect: an inbox item snapshots
  // sourceTrackId, and separately carries the RADIO playlist/bank ids it's
  // been assigned into — there is no direct trackId field on RadioPlaylist
  // or RadioBank themselves.
  const inboxMatches = (input.radioInboxItems ?? []).filter((item) => item.sourceTrackId === trackId);
  const radioPlaylistIds = new Set(inboxMatches.flatMap((item) => item.assignedPlaylistIds ?? []));
  const radioBankIds = new Set(inboxMatches.flatMap((item) => item.assignedBankIds ?? []));

  const radioPlaylists = (input.radioPlaylists ?? [])
    .filter((rp) => radioPlaylistIds.has(rp.id))
    .map((rp) => ({ id: rp.id, label: rp.title }));

  const radioBanks = (input.radioBanks ?? [])
    .filter((rb) => radioBankIds.has(rb.id))
    .map((rb) => ({ id: rb.id, label: rb.title }));

  return { crates, playlists, radioPlaylists, radioBanks };
}

export function isEmptyTrackReferenceReport(report: TrackReferenceReport): boolean {
  return report.crates.length === 0 && report.playlists.length === 0
    && report.radioPlaylists.length === 0 && report.radioBanks.length === 0;
}
