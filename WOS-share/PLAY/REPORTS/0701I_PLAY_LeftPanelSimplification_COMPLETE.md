---
build: 0701I
name: Left Panel Simplification
date: 2026-07-01
status: COMPLETE
tsc: PASS
---

# 0701I — Left Panel Simplification

## Summary

Simplified the PLAY left nav (`FileManager.tsx`) to show only LIBRARIES and PLAYLISTS. Removed three nav sections that are no longer surfaced to the user.

## Files Changed

| File | Change |
|---|---|
| `play/src/ui/FileManager.tsx` | Removed Groups section, Build From Catalog button, Utility section |
| `WOS-share/PLAY/CURRENT/PLAY_CURRENT.md` | Updated last completed to 0701I |
| `WOS-share/PLAY/CURRENT/PLAY_BUILD_STATUS.md` | Added 0701I row |
| `WOS-share/PLAY/CURRENT/PLAY_DO_NOT_REOPEN.md` | Added 0701I closed issues |
| `WOS-share/PLAY/CURRENT/PLAY_SOURCE_INDEX.md` | Added 0701I report pointer |

## Removed Nav Items

- **Groups section** — "Library Groups" button (`viewMode === "groups"`)
- **Build From Catalog** button in Playlists section (`fm-create-from-catalog`)
- **Utility section** — Orphans (`viewMode === "orphans"`), Excluded (`viewMode === "excluded"`), Locked Tracks (`viewMode === "locks"`)

## Remaining Nav Structure

```
LIBRARIES
  ├── [SR] StudioRich Catalog   (⋯ source menu)
  ├── [EXT] External            (⋯ source menu)
  ├── [REF] Reference           (⋯ source menu)
  └── ⊞ All Tracks

PLAYLISTS
  ├── [cover] Playlist Name   [count]  ⋮
  ├── ...
  └── + Create New Playlist
```

## Preserved Behavior

- LIBRARIES section: all 5 sources (studiorich, external, reference, unknown, all) with source menus, CSV import, audio folder linking, analyze, repair, source settings
- PLAYLISTS: playlist rows (cover thumb + name + count badge + ⋮ context menu), Create New Playlist, drag-drop track onto playlist
- Catalog selection, playlist selection, catalog playback, playlist playback
- TrackEditorPanel (opens on row click)
- Flow Curve (playlist-only, gated by `viewMode === "playlist"`)
- ViewMode type unchanged — "groups", "orphans", "excluded", "locks" still exist in the system, just not navigable from the left nav

## Verification

`tsc --noEmit` exits 0.

## Do Not Reopen

- Do not restore Library Groups (Groups section) to the left nav
- Do not restore Build From Catalog button to the left nav
- Do not restore Utility section (Orphans, Excluded, Locked Tracks) to the left nav
