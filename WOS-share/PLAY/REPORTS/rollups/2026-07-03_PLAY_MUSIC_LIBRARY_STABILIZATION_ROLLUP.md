---
date_generated: 2026-07-03
project: PLAY
report_type: continuity_rollup
coverage_start: 2026-07-01
coverage_end: 2026-07-03
builds: 0701G, 0701H, 0701I, 0701J, 0702A, 0703A
---

# PLAY MUSIC Library Stabilization Rollup — 2026-07-03

## Summary

This sprint completed the transition of PLAY from a Flow Curve Playlist Builder into a full **MUSIC Library system**. Six builds shipped across 2026-07-01 through 2026-07-03. The library is now source-locked, the Playlist Builder has a structured workflow, the Add Music panel supports CAT/EXT toggling with deduplication, Track Inspector is docked beside the table, and all library-to-playlist action surfaces are consistent. `tsc --noEmit` exits 0 throughout.

---

## Product Evolution

```
Before this sprint:
  Flow Curve Playlist Builder + Library (single surface, mixed concerns)

After this sprint:
  MUSIC
  └── Library
      ├── Catalog         — studiorich tracks; metadata + cover maintenance
      ├── External        — external tracks; metadata + cover maintenance
      ├── Reference       — sampler clips; never enter music playlists
      ├── Playlists       — Flow Curve construction; CAT/EXT source pools
      └── Sampler Banks   — REF clip collections
```

---

## Builds in This Rollup

### 0701G — Catalog Playback + Playlist Builder Stabilization
*2026-07-01*

12-part build stabilizing the playback and builder foundations:
- `linkAudioFiles` creates `URL.createObjectURL` blob URLs; `getTrackPlayUrl` uses `objectUrl` first
- `objectUrl` is session-only — stripped before `savePlayProject`, revoked on rescan
- Catalog rows: `▶` audition button, `+▶` audition+add button
- `auditionTrackId` state tracks highlighted row; `currentTrack` falls back to auditioned track
- `importedMoodTags`: set once at CSV import, write-once, read-only reference
- Mood restore actions in TrackEditorPanel: Restore from Import, Restore from Mechanical, Clear Suggestions
- `moodSuggestions` never cleared on empty analyzer result
- Builder: `assignPlaylistToCurve` single-object param; `TrackSlot` all required fields
- `fmtDur` / inline duration guards `isNaN` and `<= 0`
- Builder preview bar: `· X without audio` count warning
- `+▶` auditions and queues to playlist end

### 0701H — Library Mode + Catalog Table Usability Pass
*2026-07-01*

- **Workspace separation**: `viewMode === "playlist"` gates `PlaylistHeader` and `FlowCurveCanvas`. All other viewModes get full-height catalog table.
- Catalog chip strip entirely removed. Replaced with: CATALOG page header (section identity + status line) → FILTERS section (always visible: Search, Mood, Group, Genre, Source, Rating, Playable) → TRACKS label → table.
- Play/Add column moved far-left (`col-play-ctrl`). Play buttons must `stopPropagation`.
- `currentTrack` fallback: `tbm.get(auditionTrackId)` when `currentSlotIdx` is null.
- Mechanical moods column added to catalog table.
- Mood chips: `flex-wrap: nowrap; overflow: hidden` — never expand row height.
- Left nav playlist rows: cover thumb + name + count badge only. Duration, date, target removed.

### 0701I — Left Panel Simplification
*2026-07-01*

- Left nav trimmed to **LIBRARIES + PLAYLISTS** only.
- Removed: Groups section (Library Groups), Build From Catalog button, Utility section (Orphans, Excluded, Locked Tracks).
- `ViewMode` type unchanged — those modes still exist, just not navigable from nav.

### 0701J — Library Source Clarity + External Behavior
*2026-07-01*

- Left nav Libraries: **StudioRich Catalog + External + All Tracks** only. Reference and Unknown Review hidden.
- StudioRich source menu simplified to 4 actions: Source Settings / Scan Catalog / Re-scan Audio Folder / Analyze Mechanical Moods.
- External source menu: **Import Audio Folder as External Tracks…** is primary action (highlighted when 0 external tracks). Re-scan shown only when external tracks exist.
- `handleImportAudioFolderAsExternal`: creates one Track per audio file (`sourceOwner: "external"`, `audioLinked: true`, live `objectUrl`). Does NOT call `linkAudioFiles`. Appends without replacing.

### 0702A — Playlist Identity Modal Redesign
*2026-07-02*

- Full rewrite of `PlaylistIdentityPanel.tsx`.
- Two-column layout: **Artwork left** (Cover + Background with Choose File / Clear) | **Details right** (Title + large Description textarea + Mood Tags).
- Footer: Cancel + Save Changes.
- Removed: Accent Color, Presentation Mode, Map Color Themes, Extracted Theme, Broadcast Preview, Created/Updated dates.
- `pip-*` CSS classes added; legacy `id-*` classes collapsed.

### 0703A — MUSIC Library Stabilization
*2026-07-03*

**Source-locked library pages**
- Each library page (Catalog, External, Reference) is scoped to one `sourceOwner` before user filters run.
- `sourceScopedTracks` is derived first. Filter dropdowns built from this set, not all tracks.
- Source scope is structural — not a user-accessible filter.

**Playlist Builder workflow**
- `+ New Playlist` always opens `NewPlaylistDialog`.
- User specifies: name, source pool (CAT only [default] / EXT only / CAT+EXT), build mode (Manual / Auto Fill).
- Reference excluded from all source pool options.
- Auto Fill: `buildPlaylistSlotsFromSourcePool` uses `allowedSourceOwners`.

**Add Music workflow**
- `PlaylistHeader` exposes `+ Music` button (playlist view only).
- `AddMusicPanel`: CAT/EXT toggles, filters, selectable track list.
- Actions: Add Selected, Add All Filtered, Replace (with confirmation).
- Deduplication applied on every add action.
- Adding a new source expands `playlist.allowedSourceOwners`.
- Reference toggle never shown.

**Library-to-playlist actions**
- Catalog and External pages: Add to Playlist, New Playlist from Selection, New Playlist from Filtered.
- Reference page: no playlist actions (sampler material only).

**Track Inspector**
- Docked beside the table. Table remains full-width and usable.
- Clicking a row opens inspector for that track.
- Prev / Next navigates the current filtered list.
- Sections: Identity, Cover/File, Audio, Mood, Source.
- "NO COVER" placeholder for missing artwork.
- "No Cover" filter finds tracks without artwork.
- Centered edit modal remains as fallback only.

---

## Architecture State After This Rollup

### Source scope rules

| Surface | Allowed sources | Mixing? |
|---|---|---|
| Catalog page | `studiorich` only | No |
| External page | `external` only | No |
| Reference page | `reference` only | No |
| Playlist (CAT pool) | `studiorich` only | No |
| Playlist (EXT pool) | `external` only | No |
| Playlist (CAT+EXT pool) | `studiorich` + `external` | Yes — explicit opt-in only |
| All Tracks | all sources | View only |

### Key invariants

| Invariant | Build |
|---|---|
| `objectUrl` session-only; stripped before `savePlayProject`; revoked on rescan | 0701G |
| `importedMoodTags` write-once at import; never overwritten | 0701G |
| `moodSuggestions` never cleared on empty analyzer result | 0701G |
| `viewMode === "playlist"` gates FlowCurveCanvas and PlaylistHeader | 0701H |
| Catalog play buttons must `stopPropagation` | 0701H |
| `handleImportAudioFolderAsExternal` creates new rows; does not call `linkAudioFiles` | 0701J |
| Reference never enters `allowedSourceOwners` of a music playlist | 0703A |
| Source scope at library page is structural, not a filter | 0703A |
| Playlist Identity modal: no accent/presentation/theme/broadcast controls | 0702A |
| Track Inspector is preferred cleanup surface; centered modal is fallback | 0703A |

---

## Next Milestone: Cover Assignment Workflow

**Not yet implemented.** Mark as next.

Goal: allow bulk cover assignment from a folder scan (match image files to tracks by filename or ID), surface assignment status in the Track Inspector, and allow manual override per track.

Considerations:
- Images should be read as data URLs or object URLs (session-only), same pattern as audio
- Cover assignment should update `track.albumArtDataUrl` or `track.coverImagePath`
- Track Inspector "NO COVER" filter is the entry point for finding tracks that need covers

---

## Blockers (unchanged)

| Item | Reason |
|---|---|
| `npm run build` (Vite) | Node 18; Vite requires Node 20+ |
| Live WOS iframe integration | Dev opt-in only; `source: "none"` default |
| Source pool editor UI | Data model exists; UI not built |
| Event recurrence expansion | Type defined; no engine |

---

## Prior Rollup

`2026-07-02_PLAY_CONTINUITY_ROLLUP.md` — covers 0701G–0702A (overlaps first 5 builds of this sprint)
