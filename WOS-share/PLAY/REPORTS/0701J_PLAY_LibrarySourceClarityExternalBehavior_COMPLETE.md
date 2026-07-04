---
build: 0701J
name: Library Source Clarity + External Behavior
date: 2026-07-01
status: COMPLETE
tsc: PASS
---

# 0701J — Library Source Clarity + External Behavior

## Summary

Simplified library source presentation and fixed External source behavior. Reference and Unknown Review are no longer shown as peer libraries. External can now import audio files directly as External tracks (no CSV required). StudioRich source menu is reduced to four focused actions.

## Files Changed

| File | Change |
|---|---|
| `play/src/ui/FileManager.tsx` | Narrowed sourceRows to studiorich+external; simplified menus; added externalImportInputRef + new file input; new prop `onImportAudioFolderAsExternal` |
| `play/src/App.tsx` | Added `handleImportAudioFolderAsExternal`; wired to FileManager |
| `WOS-share/PLAY/CURRENT/PLAY_CURRENT.md` | Updated last completed to 0701J |
| `WOS-share/PLAY/CURRENT/PLAY_BUILD_STATUS.md` | Added 0701J row |
| `WOS-share/PLAY/CURRENT/PLAY_DO_NOT_REOPEN.md` | Added 0701J closed issues |
| `WOS-share/PLAY/CURRENT/PLAY_SOURCE_INDEX.md` | Added 0701J report pointer |

## Changes Detail

### Left Nav — Libraries section

Before: StudioRich Catalog, External, Reference, Unknown Review (conditional), All Tracks
After: **StudioRich Catalog, External, All Tracks** only

Reference and Unknown Review are hidden from the nav. Their data and `sourceOwner` values are unchanged — they remain accessible via "All Tracks". Counts on each row are source-specific (were already per-owner in the count map).

### StudioRich source menu (simplified)

Before (10 items): Link/Re-scan Audio Folder, duplicate Re-scan Audio Folder, Load Seed Data, Scan Catalog CSV, Analyze Library, Repair Duplicates, Build Playlist From Catalog, Source Settings

After (4 items + separators):
1. Source Settings
2. — sep —
3. Scan Catalog CSV
4. Re-scan Audio Folder (single adaptive action — always uses rescan input)
5. — sep —
6. Analyze Mechanical Moods

Removed: Load Seed Data, Repair Duplicates, Build Playlist From Catalog, duplicate Re-scan.

### External source menu

Before: Link/Re-scan Audio Folder (adaptive), duplicate Re-scan, Scan Catalog CSV, Analyze Library, Repair Duplicates, Source Settings

After:
1. **Import Audio Folder as External Tracks…** (highlighted when 0 external tracks — the primary action)
2. — sep —
3. Re-scan Audio Folder (only shown if external tracks already exist)
4. — sep —
5. Scan Catalog CSV
6. — sep —
7. Analyze Mechanical Moods
8. Source Settings

### External folder import — new behavior

`handleImportAudioFolderAsExternal(files: FileList)` in App.tsx:
- Filters to audio files (mp3, flac, wav, aif, aiff, ogg, m4a, aac, opus)
- Creates one `Track` per audio file:
  - `trackId`: `genId("ext")` (unique)
  - `title`: filename without extension
  - `artist`: ""
  - `bpm`: 0, `camelotKey`: "1A", `durationSeconds`: 0, `energy`: 0, `energySource`: "estimated"
  - `sourceOwner`: "external", `sourceLibrary`: "External"
  - `fileName`: f.name, `filePath`: webkitRelativePath (or name fallback)
  - `audioLinked`: true, `objectUrl`: URL.createObjectURL(f)
  - `audioLastScannedAt`: now ISO timestamp
- Appends new tracks to existing library (does NOT replace)
- Saves to localStorage via `savePlayProject`
- Shows AudioLinkReport modal with created count

This is distinct from `handleLinkAudioFolder` which matches files against existing track records by filename/sunoId/title.

## Left Nav Structure After 0701J

```
LIBRARIES
  ├── [SR] StudioRich Catalog   (⋯ menu)
  ├── [EXT] External            (⋯ menu)
  └── ⊞ All Tracks

PLAYLISTS
  ├── [cover] Playlist Name   [count]  ⋮
  └── + Create New Playlist
```

## Verification

`tsc --noEmit` exits 0.

## Do Not Reopen

- Do not restore Reference or Unknown Review to the Libraries nav section
- Do not use `linkAudioFiles` for External folder import — it matches against existing tracks. The new import creates fresh track rows
- Do not show Load Seed Data, Repair Duplicates, or Build Playlist From Catalog in the StudioRich top-level source menu
- objectUrl created by `handleImportAudioFolderAsExternal` is ephemeral — `savePlayProject` strips it before localStorage persist (same as all objectUrls)
