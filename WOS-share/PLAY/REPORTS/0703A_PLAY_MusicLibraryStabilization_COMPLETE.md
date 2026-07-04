---
build: 0703A
name: MUSIC Library Stabilization
date: 2026-07-03
status: COMPLETE
tsc: PASS
---

# 0703A — MUSIC Library Stabilization

## Summary

Stabilized the MUSIC Library architecture. Implemented source-locked library pages, Playlist Builder workflow (NewPlaylistDialog), Add Music panel, Track Inspector docked beside the table, and library-to-playlist actions for Catalog and External pages.

## Completed Features

### Source-Locked Library Pages
- Each page (Catalog, External, Reference) scoped to one `sourceOwner` before user filters run.
- `sourceScopedTracks` derived first. Filter dropdowns (Mood, Group, Genre, etc.) built from this set only.
- Source scope is structural — not a user-visible filter control.

### Playlist Builder Workflow
- `+ New Playlist` always opens `NewPlaylistDialog`.
- Collects: name, source pool (CAT only / EXT only / CAT+EXT), build mode (Manual / Auto Fill).
- Reference excluded from all source pool options.
- Auto Fill runs `buildPlaylistSlotsFromSourcePool` with `allowedSourceOwners` from chosen pool.

### Add Music Panel (AddMusicPanel)
- Accessed via `+ Music` in PlaylistHeader (playlist view only).
- Source toggles: CAT, EXT. Reference never shown.
- Filters: Mood, Group, Genre, BPM range, Rating.
- Actions: Add Selected, Add All Filtered, Replace (with confirmation).
- Deduplication on every add. New source expands `playlist.allowedSourceOwners`.

### Library-to-Playlist Actions
- Catalog and External pages: Add to Playlist, New Playlist from Selection, New Playlist from Filtered.
- Reference page: no playlist actions.

### Track Inspector
- Docked beside the table. Table remains full-width and usable.
- Clicking a track row opens inspector. Prev/Next navigates filtered list.
- Sections: Identity, Cover/File, Audio, Mood, Source.
- "NO COVER" placeholder for missing artwork. "No Cover" filter in filter section.
- Centered edit modal is fallback only.

## Not Completed (Next Milestone)
- Cover assignment workflow: bulk image-to-track matching from folder scan.

## Do Not Reopen
- Reference tracks never enter `allowedSourceOwners` of a music playlist.
- Source scope at library page is structural — do not replace with a filter dropdown.
- Track Inspector is the preferred maintenance surface. Do not promote centered modal as primary.
- `NewPlaylistDialog` is always shown for new playlists — no silent creation.
- `AddMusicPanel` never shows a Reference toggle.
