# MUSIC Playlist & Crate Recovery Report

Generated: 2026-07-07 12:45:17
Mode: --write

---

## Root Cause

The index-wins hydration (moodDrifted check) triggered a `savePlayProject` call
while `playlistsRef.current` was still the initial default `["My Mix"]` — before
`applyProject` had a chance to sync the ref via React's `useEffect`.

**Fix applied:** `applyProject` now sets `playlistsRef.current = pls` and
`libraryTracksRef.current = p.libraryTracks` directly, before any async save
can run against a stale ref.

---

## Library Backup Files (track data only)

library.index.json backups contain **track arrays only** — no playlists or crates.
Playlist and crate state is stored exclusively in browser `localStorage`.

- library.index.json.bak_20260707_022456: 96 tracks, ✗ no playlists, ✗ no crates
- library.index.json.bak_20260707_023122: 96 tracks, ✗ no playlists, ✗ no crates
- library.index.json.bak_20260707_024834: 96 tracks, ✗ no playlists, ✗ no crates
- library.index.json.bak_20260707_025116: 96 tracks, ✗ no playlists, ✗ no crates
- library.index.json.bak_20260707_025556: 96 tracks, ✗ no playlists, ✗ no crates
- library.index.json.bak_20260707_030910: 96 tracks, ✗ no playlists, ✗ no crates
- library.index.json.bak_20260707_040306: 96 tracks, ✗ no playlists, ✗ no crates

---

## Exported Project Files Found

### PLAY_Project_The_Robots_Got_HR_Involved_2026-06-23_23-54.json
- Path: `/Users/studio/Downloads/_INBOX/SAVES/PLAY_Project_The_Robots_Got_HR_Involved_2026-06-23_23-54.json`
- Exported: 2026-06-24T03:54:10.652Z
- Playlists: 2 (1 with tracks)
  - Names: The Robots Got HR Involved, Untitled Playlist
- Total playlist slots: 15
- Crates: 0
- Library tracks in export: 115

---

## Recovery Summary

**Source selected:** `PLAY_Project_The_Robots_Got_HR_Involved_2026-06-23_23-54.json`
**Exported:** 2026-06-24T03:54:10.652Z

### Recovered Playlists
- The Robots Got HR Involved — 15 slots
- Untitled Playlist — 0 slots

### Recovered Crates
- Count: 0

### Track Coverage: All slot trackIds found in current library ✓

### Preserved Fields
- External library tracks preserved: 96
- Protected track fields changed: 0

---

## Recovery Import File Written

**Path:** `/Users/studio/Projects/wall-of-sound/music/reports/MUSIC_recovery_import.json`

### How to apply recovery
1. Open the MUSIC app in your browser
2. Click ··· (settings menu) → Import Project
3. Select the file at the path above
4. The app will restore the recovered playlists
5. The index-wins hydration will automatically refresh
   External library tracks from library.index.json

