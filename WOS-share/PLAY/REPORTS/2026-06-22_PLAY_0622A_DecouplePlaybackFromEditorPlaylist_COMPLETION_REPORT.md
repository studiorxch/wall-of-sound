# PLAY Patch 0622A — Decouple Playback From Editor Playlist
**Completion Report · 2026-06-22**

---

## Summary

Live playback is now independent of the editor's playlist selection. The operator can play Playlist A, then browse/edit/fill Playlist B, and A keeps playing uninterrupted. A new runtime `playingPlaylistId` + `playingSlotsRef` carry the playback context; editor selection (`activePlaylistId`) only moves the workspace view.

```text
Editor selection does not control live playback.
Only explicit play (re)binds the playing context.
Continuation (next/prev/autoplay) runs on the PLAYING playlist's slots.
```

---

## Root Cause

Playback was coupled to the editor's active playlist two ways:
1. `handleSelectPlaylist` called `handleStop()` (and reset `currentSlotIdx`) on every selection.
2. All continuation logic (`handleNext`/`handlePrevious`/audio `ended`/`error`) read `slotsRef.current` — which is synced to the **editor's** active playlist — so even continuation followed the editor, not the player.

---

## Changes (all in `src/App.tsx`)

### Playback context state/refs
- `playingPlaylistId` state (runtime-only, not persisted — per spec).
- `playingPlaylistIdRef`, `playingSlotsRef` (stable across editor selection).
- Effect keeps `playingSlotsRef` synced to the **playing** playlist's slots across edits (fill/regenerate/remove), independent of which playlist is being edited.

### Derived playing context
- `playingPlaylist` / `playingSlots` derived from `playingPlaylistId`.
- `currentTrack` now derives from `playingSlots[currentSlotIdx]` (was editor `slots`).
- `isEditingPlayingPlaylist` + `editorNowPlayingSlotIdx` — the editor only highlights the now-playing row/node when it is editing the playing playlist.
- `hudPlaylist = playingPlaylist ?? activePlaylist` — HUD/transport reflect playing context, fall back to editor when idle.

### Selection no longer touches playback
- `handleSelectPlaylist` — removed `handleStop()` and `setCurrentSlotIdx(null)`; only updates editor view + saves `activePlaylistId`.

### Explicit play is the only rebind
- `beginPlaybackFromActive(slotIndex)` sets `playingPlaylistId` + `playingSlotsRef` to the editor's selected playlist, then plays. `handlePlayFromSlot` routes through it.
- `handlePlay` resumes the existing playing context if present; otherwise starts from the editor selection (explicit).

### Continuation uses the playing playlist
- `handleNext` / `handlePrevious` / audio `ended` + `error` handlers now read `playingSlotsRef.current` (and `currentSlotIdxRef`) — never the editor `slotsRef`.

### Slot-removal handlers gated
- `handleRemoveFromPlaylist`, `handleRemoveFromPlaylistLeaveGap`, `handleReplaceSlot` only stop/reindex playback when `isEditingPlayingPlaylist` (removing a slot in playlist B no longer touches A's playback).

### Delete-playing-playlist safety (Case 3)
- `handleDeletePlaylist` clears playback context + stops only when the **playing** playlist is deleted; deleting the editor-active (non-playing) playlist no longer stops audio.

### Render wiring
- HUD: `playlist={hudPlaylist}`, `hudQueue` built from `hudPlaylist`.
- Editor `FlowCurveCanvas` + `MainTrackWindow`: `nowPlayingSlotIndex={editorNowPlayingSlotIdx}` (gated highlight).
- Editor `PlaybackTransport`: `totalSlots` is the playing playlist's count when playing; `currentTrack` is the playing track.

`activePlaylistId` kept as the editor-selection alias (compatibility); it is no longer playback authority.

---

## Verification (browser, port 5173)

Seeded Playlist A (tracks a1/a2) + Playlist B (empty). Audio element mocked so `play()` resolves without real media (placeholder file paths can't load headlessly).

### Case 1 — Manual playback continues (definitive)
1. Selected Playlist A, started playback.
2. Switched editor selection to **Playlist B**.
3. Result: editor active = **Playlist B**, transport **still playing** (`pt-play.active`), transport shows **"x – a2" at slot #02** — a track from **Playlist A** (B is empty). Editor main window shows B empty.
- ✅ Playback continued on A while the editor displays B — bottom row bound to the playing playlist, not the selection.

### Regression / safety
- ✅ App loads with two playlists; editor A↔B switching works, persists (`activePlaylistId`), no error boundary.
- ✅ Reload persistence intact (2 playlists, active preserved) — 0621C unaffected.
- ✅ Source-group `sourceGroupId` values preserved on the seeded playlists — 0621E untouched.
- ✅ `npx tsc --noEmit` clean; no console errors.

### Cases 2 & 3
- **Case 2** (explicit play on another playlist rebinds context) and **Case 3** (delete playing playlist clears context, no crash) are implemented and source-verified; they could not be exercised end-to-end headlessly (Case 2 needs a populated second playlist + real audio; Case 3 logic is in `handleDeletePlaylist`). The rebind path (`beginPlaybackFromActive`) and the delete-clear block are the only writers of `playingPlaylistId`.

---

## Honest Limitation

Real cross-track audio continuity (actual `<audio>` playback across a playlist switch) could not be exercised in this environment because the test seeds use placeholder file paths and there is no media server. The behavioral proof above used a mocked media element to reach the "playing" state; the transport correctly displayed Playlist A's track while the editor showed Playlist B. All coupling points were removed at the source level and type-checked.

---

## Do Not Reopen (honored)

- Playback is no longer coupled to `activePlaylistId`.
- No scheduler autoplay added; scheduler `NOW` does not hijack playback.
- Broadcast HUD is not responsible for playback routing (App owns the playing context).

---

## Patch Status: ✅ COMPLETE
