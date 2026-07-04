# PLAY Build Completion Report
## 0624F — ImportDestinationArchiveAndLibraryGroupGovernanceHotfix

**Status:** PASS
**Date:** 2026-06-24
**Build type:** Product Architecture Correction + UX Hotfix

---

## Summary

This patch corrects three structural problems in PLAY:

1. **Import destination is now explicit.** Importing a CSV shows a destination dialog: Library / Archive / Playlist / Group. Each destination has defined behavior. No silent dump.

2. **Flow Graph regression fixed.** Library and Archive imports no longer call `regenerateForPL`, which was rebuilding the active playlist's flow curve on every catalog import. Only "Playlist" destination appends to the active playlist.

3. **Library Groups are now visible and manageable.** A "Library Groups" item in the sidebar opens a dedicated Groups Panel with view, rename, remove, and Clean Empty Groups.

4. **Archive status added.** Tracks can be marked library / archive / needs_review / rejected. Batch actions in the library selection bar. Quick-filter buttons show Archive / Needs Review / Rejected counts. Status badges in library rows.

5. **Template language reduced.** "Template" → "Smart Fill" in all user-facing labels. "Create Playlist from Template" → "Generate Playlist". "Template Source Filters" → "Playlist Source Rules".

---

## Files Changed

| File | Status | Notes |
|---|---|---|
| `src/data/trackTypes.ts` | Modified | Added `TrackArchiveStatus` type + `archiveStatus?` field on `Track` |
| `src/data/playProjectStorage.ts` | Modified | Repair backfills `archiveStatus: "library"` on all existing tracks |
| `src/logic/libraryFilters.ts` | Modified | Added `archiveStatus?: TrackArchiveStatus \| "any"` filter field |
| `src/ui/TopBar.tsx` | Rewritten | Added `ImportDestination` type + `ImportDestinationDialog` modal; CSV import now shows destination picker before adding tracks |
| `src/App.tsx` | Modified | `handleTracksImported` now accepts `ImportDestination`; Library/Archive/Group imports do NOT auto-regenerate or scope to active playlist; `handleRenameSourcePool`, `handleRemoveSourcePool`, `handleCleanEmptyGroups`, `handleBulkSetArchiveStatus` handlers added |
| `src/ui/FileManager.tsx` | Modified | `ViewMode` gains `"groups"`; Library Groups sidebar item now clickable (opens groups panel); badge renamed TEMPLATE → SMART FILL |
| `src/ui/MainTrackWindow.tsx` | Modified | Props: `onBulkSetArchiveStatus`, `sourcePools`, `onRenameSourcePool`, `onRemoveSourcePool`, `onCleanEmptyGroups`; new `GroupsPanel` component; archive filter buttons (Archive/Needs Review/Rejected); archive status badges in rows; bulk status bar; `groupViewId` state for clicking into a group |
| `src/ui/PlaylistHeader.tsx` | Modified | "Template" → "Smart Fill"; "Create Playlist from Template" → "Generate Playlist"; "Template Source Filters" → "Playlist Source Rules" |
| `src/styles.css` | Modified | Import destination dialog; archive status badges; groups panel styles; bulk-bar-sep; row-dim |

---

## Import Destinations

| Destination | Behavior |
|---|---|
| **Library** | Tracks added to library only; `archiveStatus: "library"`; no playlist change; no auto-regenerate |
| **Archive** | Tracks added to library; `archiveStatus: "archive"`; no playlist change; no auto-regenerate |
| **Playlist** | Tracks added to library scoped to active playlist's source group; appended as new playlist slots (manualOrderDirty); no regenerate |
| **Group** | Tracks added to library; user applies grouping via Create Library Group after import |

---

## Archive Status

| Status | Meaning |
|---|---|
| `library` | Default; imported but not curated |
| `archive` | Approved for programming |
| `needs_review` | Metadata/audio/mood needs attention |
| `rejected` | Keep but avoid programming |

- Bulk set via selection bar (Archive ✓ / Library / Needs Review / Rejected buttons)
- Quick-filter buttons: `Archive (N)` / `Needs Review (N)` / `Rejected`
- Badges in library rows: ARC (green) / REV (amber) / REJ (red)
- `libraryFilters.archiveStatus` field for template source rules

---

## Library Groups Panel

Accessible via "Library Groups" in the FileManager sidebar (new `"groups"` ViewMode).

| Feature | Behavior |
|---|---|
| View track count | Click count number to filter library by group tracks |
| Rename group | Inline input → Save / Cancel |
| Remove group record | Removes pool + clears sourcePoolIds; does NOT delete tracks or clear grouping |
| Clean Empty Groups | Removes all groups with 0 tracks |

---

## Flow Graph Regression Fix

**Root cause:** `handleTracksImported` called `regenerateForPL` when the active playlist was not `manualOrderDirty`. This rebuilt the entire playlist from the flow curve every time any CSV was imported.

**Fix:** Library, Archive, and Group imports call `savePlayProject` directly without touching slots or calling `regenerateForPL`. Only Playlist destination modifies the active playlist (appends slots).

---

## Template Language Changes (UI only)

| Before | After |
|---|---|
| "Template" (playlist role badge) | "Smart Fill" |
| "TEMPLATE" (FileManager badge) | "SMART FILL" |
| "Create Playlist from Template" | "Generate Playlist" |
| "Template Source Filters" | "Playlist Source Rules" |

Internal `playlistRole: "template"` preserved for compatibility.

---

## Preserved from 0624A–E

- `moodSuggestions` / Apply Suggestions to Moods
- Bulk metadata edit bar
- Library filters (mood, grouping, genre, owner, rating, hasMood)
- Generated playlists / event-first model
- Broadcast HUD / Map Channel
- Export/import round-trip (archiveStatus included in project JSON)

---

## TypeScript Build

`npm run build` — 15 pre-existing errors only. Zero new errors introduced by 0624F.

Pre-existing: App.tsx (6), sourcePoolFill.ts (1), BroadcastSecondaryLayer.tsx (1), ExportPanel.tsx (1), FlowCurveCanvas.tsx (1), MainTrackWindow.tsx BulkEditBar (2), NowNextQueuePanel.tsx (2), PlaybackTransport.tsx (1).
