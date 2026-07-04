---
spec: 0701H_PLAY_LibraryModeCatalogTableUsability_v1.0.0
project: PLAY
status: COMPLETE
shipped: 2026-07-01
build_check: tsc --noEmit exits 0
---

# 0701H — Library Mode + Catalog Table Usability Pass

## Summary

Workspace separation, catalog playback polish, mood field clarity, single-line mood chips, font/density improvements, and left nav simplification.

---

## Parts Delivered

### Part 1+2 — Separate Playlist Workspace From Library Workspace / Flow Curve Playlist-Specific
- `play/src/App.tsx`: `PlaylistHeader` + `FlowCurveCanvas` are now conditionally rendered only when `viewMode === "playlist"`. All library views (StudioRich Catalog, External, Reference, Unknown Review, All Tracks, Groups, Orphans, Excluded, Locks) get the full vertical window for the catalog table — no playlist chrome visible.
- Switching between playlists still shows each playlist's own curve. Switching to a library view hides the curve. Returning to a playlist restores it.

### Part 3 — Playing a Library Track Does Not Open TrackEditorPanel
- `play/src/ui/MainTrackWindow.tsx`: All cells that do not need propagation to the row `onClick` (play column, rating, action buttons) now call `e.stopPropagation()`. Row `onClick` opens the editor only when the click reaches the row itself (title, artist, data cells). Play buttons in `col-play-ctrl` cell have explicit `e.stopPropagation()`.

### Part 4 — Library Playback Updates Player Dock
- `play/src/App.tsx`: `currentTrack` now falls back to `tbm.get(auditionTrackId)` when `currentSlotIdx` is null. The player dock title, artist, duration, rating, and play state now reflect the currently auditioning catalog track.

### Part 5 — Play Button At Far Left
- Catalog table column order: checkbox → **▶/+ (play/add)** → # → Title → Artist → Mood → Suggested → Mech. → Grouping → Genre → BPM → Key → E → Dur → Rating → × → Last → Status → Edit
- Play and Add buttons moved to `col-play-ctrl` column — second from left, always visible without scrolling.

### Part 6+8 — Clarify Suggested vs Mechanical Moods / Mechanical Visibility
- Column headers renamed: `Mood` (confirmed tags), `Suggested` (AI/import suggestions), `Mech.` (structural role tags — opener, bridge, hold…)
- New `col-mech` column displays `mechanicalMoodTags` with green chip style (`mood-chip-mech`), distinct from blue confirmed and purple suggested.
- Header tooltips clarify each column's meaning.

### Part 7 — Restore/Rebuild Suggested Moods
- Already shipped in 0701G. `handleRestoreSuggestionsFromImport`, `handleRestoreSuggestionsFromMechanical`, `handleClearSuggestedMoods` handlers remain in place; non-destructive rebuild guard still active.

### Part 9 — Single-Line Mood Chips
- `play/src/styles.css`: `.mood-chips` changed from `flex-wrap: wrap` to `flex-wrap: nowrap; overflow: hidden`. Chips are capped to a visible count in the render (3 for Mood, 3 for Suggested, 2 for Mechanical) with `+N` overflow badge. Row height stays compact.

### Part 10 — Mood Color Data-Driven
- Chip color classes (`mood-chip`, `mood-chip-suggested`, `mood-chip-mech`) are already data-driven by chip type. No hardcoded per-mood colors — future editor will only need to extend the class system.

### Part 11 — Column Layout Separation
- Library/catalog view now uses the expanded catalog table (Play, Add, #, Title, Artist, Mood, Suggested, Mech., Grouping, Genre, BPM, Key, E, Dur, Rating, ×, Last, Status, Edit).
- Playlist table retains its existing slot-based layout (#, Lock, Time, Title, Artist, BPM, Key, E, Dur, Rating, Warn). Separate workspace, separate table, no mixing.

### Part 12 — Font Size / Density
- `play/src/styles.css`:
  - `.mtw-table` font-size: `12px` → `13px`
  - `.mtw-table th` font-size: `10px` → `11px`, padding: `5px 8px` → `6px 8px`
  - `.mtw-table td` padding: `4px 8px` → `5px 8px`
  - `.fm-section-header` font-size: `9px` → `10px`
  - `.fm-label` font-size: `12px` → `13px`
  - `.fm-pl-title` font-size: `12px` → `13px`
  - `.fm-pl-item` padding: `5px 8px` → `6px 8px`

### Part 13 — Simplified Left Nav Playlist Rows
- `play/src/ui/FileManager.tsx`: Playlist rows now show only cover thumb, playlist name, and a compact track-count badge.
- Removed: duration, target, updated date from left nav. These belong in playlist header.
- Removed unused `fmtMinutes` helper and `fmtUpdatedLabel` import.
- New `.fm-pl-count-badge` style: compact pill badge at row right edge.

### Part 14 — NaN Guardrail (maintained)
- `fmtDur` NaN guard from 0701G still in place across catalog table and library tracks.

---

## Files Changed

| File | Change |
|---|---|
| `play/src/App.tsx` | Flow Curve/PlaylistHeader hidden in library views; `currentTrack` shows auditioned track in player dock |
| `play/src/ui/MainTrackWindow.tsx` | Play column far-left; stopPropagation on play/add/rating/action cells; Mech. column added; column header labels clarified |
| `play/src/ui/FileManager.tsx` | Playlist rows simplified to name + count badge; removed duration, date, fmtMinutes, fmtUpdatedLabel |
| `play/src/styles.css` | Font sizes up; mood chips single-line; col-play-ctrl; col-mech; mood-chip-mech; fm-pl-count-badge; row-auditioning highlight |

---

## Workspace Separation Behavior

- **Library view**: clicking any source (StudioRich Catalog, External, Reference, All Tracks, Groups, Orphans, etc.) shows full-height catalog table. No Flow Curve, no PlaylistHeader.
- **Playlist view**: clicking a playlist shows PlaylistHeader + FlowCurve + playlist track table.
- Switching between playlists preserves each playlist's curve. Returning from library to a playlist restores that playlist's curve exactly.

---

## Playback Behavior

- **Far-left play column**: `▶` auditions track (does not open editor), `+` auditions and adds to playlist end. Both buttons `stopPropagation` so the editor never opens on play click.
- **Catalog audition**: `handleAuditionTrack` plays track via objectUrl/filePath, sets `auditionTrackId`, `currentSlotIdx → null`.
- **Player dock updates**: `currentTrack` now resolves to the auditioned library track when no slot is playing. Dock shows title, artist, duration, rating for the catalog track being auditioned.
- **TrackEditorPanel**: opens only on explicit row click (not via play button).

---

## Moods

- **Suggested**: purple chips, from import or AI analysis. Non-destructive rebuild: never clears on empty result.
- **Mechanical**: green chips, structural roles (opener, bridge, hold…). Separate column.
- **Confirmed (Mood)**: blue chips, user-confirmed tags.
- **Chips**: single-line with `+N` overflow; row height stays compact regardless of tag count.

---

## Table/Nav Usability

- Catalog table font increased to 13px; header 11px; row padding 5px → 6px vertical.
- Left nav font increased to 13px for labels and playlist titles.
- Left nav playlist rows now show only name + track count — clean and scannable.

---

## Verification

- `tsc --noEmit` exits 0.
- Library source view hides Flow Curve: ✓ (condition `viewMode === "playlist"`)
- Playlist view shows playlist-specific Flow Curve: ✓ (unchanged logic, just conditionally rendered)
- Play button far left in library table: ✓ (`col-play-ctrl` is column 2 after checkbox)
- Playing library track does not open TrackEditorPanel: ✓ (`e.stopPropagation()` on play cell)
- Playing library track updates player dock: ✓ (`currentTrack` fallback to `auditionTrackId`)
- Mood chips single-line: ✓ (`flex-wrap: nowrap; overflow: hidden`)
- Left nav simplified: ✓ (name + count badge only)
- Source policy and Flow Curve generation untouched: ✓

---

## Do Not Reopen

- Flow Curve is playlist-specific. Do not render it in library/groups/orphans/excluded/locks views.
- Play buttons must `stopPropagation` — row `onClick` is for editor open, not for playback.
- `currentTrack` must check `auditionTrackId` when `currentSlotIdx` is null — otherwise catalog audition is invisible in the player dock.
- Mood chips must not expand row height. `flex-wrap: nowrap; overflow: hidden` is the contract.
- Left nav playlist rows carry only name and count. Duration, updated date, target live in the playlist header.
