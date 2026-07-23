// 0722C_MUSIC_Production_Stem_Export — one shared predicate for "should
// this track still appear as an ordinary top-level row anywhere." A
// migrated legacy derived-stem track (see LegacyStemMigrationPanel.tsx)
// must stop appearing everywhere it could previously surface — Library
// grid rows/counts/search/filters and the Sectional Looper's own
// derivedKind==="stem" lookup — while its underlying Track record and
// audio file stay fully intact on disk (non-destructive). Applied at the
// single shared LibraryDataGrid.tsx data-selection layer plus
// SectionalLooperWorkspace's stem lookups, so "everywhere" is enforced
// from as few call sites as this codebase's actual architecture allows
// (legacy derived-stem tracks are sourceOwner:"reference", so they were
// already confined to the Sounds library and never entered Catalog/
// External/playlists/Banks — narrowing this to those two real call sites).

import type { Track } from "../../data/trackTypes";

export function isMigratedLegacyStem(track: Track): boolean {
  return track.derivedKind === "stem" && track.stemArchiveMigration?.status === "migrated";
}

export function selectVisibleLibraryTracks(tracks: Track[]): Track[] {
  return tracks.filter((t) => !isMigratedLegacyStem(t));
}
