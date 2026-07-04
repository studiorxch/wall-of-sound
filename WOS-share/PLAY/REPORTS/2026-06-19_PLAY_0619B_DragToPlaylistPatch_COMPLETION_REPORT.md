# PLAY 0619B — Drag-To-Playlist Patch — Completion Report

**Date:** 2026-06-19
**Patch:** `0619B_PLAY_DragToPlaylistPatch_v1.0.0_PATCH`
**Status:** PASS

---

## 1. Summary

Implemented drag-to-playlist behavior for the PLAY multi-playlist workspace. Users can now drag any track from the Library view or the active playlist table onto a playlist row in the FileManager to append it to that playlist. Duplicate prevention blocks re-adds by trackId and normalized filePath. Toast notifications report added/skipped counts. Existing slot-reorder drag is unaffected.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `src/logic/playlistMembership.ts` | `TrackDragPayload` type, `TRACK_DRAG_MIME` constant, encode/decode helpers, `normalizeFilePath`, `playlistContainsTrack`, `appendTracksToPlaylist` |

---

## 3. Files Modified

| File | Changes |
|------|---------|
| `src/ui/MainTrackWindow.tsx` | Added `activePlaylistId` prop; playlist rows set `TRACK_DRAG_MIME` payload + `effectAllowed = "copyMove"`; library rows made `draggable` with `effectAllowed = "copy"`; updated import from `DrawerMode` → `ViewMode` |
| `src/ui/FileManager.tsx` | Added `onDropTracksOnPlaylist` prop; playlist rows changed `<button>` → `<div role="button">` (fixes nested-button HTML violation); drag event handlers (`onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop`); `.is-drop-target` class on hover |
| `src/App.tsx` | Added `handleDropTracksOnPlaylist` with locked-playlist guard, duplicate counting, toast reporting, autosave; passed `activePlaylistId` and `onDropTracksOnPlaylist` to children |
| `src/styles.css` | Added `.is-drop-target` (accent border + background) and `.is-dragging` (reduced opacity) |

---

## 4. Architecture Notes

- **Drag protocol:** `TRACK_DRAG_MIME = "application/x-play-tracks"` carries a JSON `TrackDragPayload` — does not conflict with existing slot-reorder drag which uses only internal React state (`dragFrom` state variable, no MIME data).
- **Copy, not move:** Dragging a playlist track onto another playlist copies it — source playlist is unchanged.
- **`appendTracksToPlaylist`:** Deduplicates by `trackId` and `normalizeFilePath` (lowercased, forward-slash normalized). Calls `reindexPlaylistSlots` + `evaluateSlotWarnings` and sets `manualOrderDirty: true`.
- **Locked playlists:** Drop is rejected with a toast if `playlist.locked === true`.
- **Toast timing:** A `setTimeout(0)` is used after `setPlaylists` to read the updated playlist title from `playlistsRef` for the notification message.

---

## 5. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | User can drag one Library track onto a playlist row | PASS |
| 2 | Target playlist count increases | PASS |
| 3 | Target playlist duration increases | PASS |
| 4 | Reload preserves added track | PASS |
| 5 | Drop onto active playlist updates visible table immediately | PASS |
| 6 | Warnings recalculate without crash | PASS |
| 7 | Drop onto inactive playlist does not switch active playlist | PASS |
| 8 | File manager row count updates for inactive target | PASS |
| 9 | Selecting inactive target later shows added track | PASS |
| 10 | Dropping duplicate track is blocked by trackId | PASS |
| 11 | Dropping duplicate normalized filePath is blocked | PASS |
| 12 | Toast reports skipped duplicates | PASS |
| 13 | Existing active playlist row reorder still works | PASS |
| 14 | Context menu actions still work | PASS |
| 15 | Fill Missing Time still works | PASS |
| 16 | Autosave still works | PASS |
| 17 | No crash from malformed drag event | PASS |
| 18 | Locked playlist rejects drop with toast | PASS |

---

## 6. Bug Fixed (Bonus)

- **Nested `<button>` HTML violation** — `FileManager` playlist rows were `<button>` elements containing the `fm-ctx-btn` `<button>`. Changed outer element to `<div role="button" tabIndex={0}>` with `onKeyDown` for keyboard accessibility. This was a pre-existing 0619A issue surfaced during 0619B verification.

---

## 7. TypeScript

`npx tsc --noEmit` — clean, no errors.

---

## 8. Known Limitations / Out of Scope

- Multi-select drag (drag selected rows as a batch) — not implemented; single-track drag is solid per spec priority order.
- Finder-to-playlist drag (native OS files) — excluded per spec.
- Curve regeneration on drop target — excluded per spec (deferred to 0619C).
