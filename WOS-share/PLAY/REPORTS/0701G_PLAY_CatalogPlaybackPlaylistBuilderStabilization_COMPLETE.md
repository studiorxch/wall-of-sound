---
spec: 0701G_PLAY_CatalogPlaybackPlaylistBuilderStabilization_v1.0.0
project: PLAY
status: COMPLETE
shipped: 2026-07-01
build_check: tsc --noEmit exits 0
---

# 0701G — Catalog Playback + Playlist Builder Stabilization

## Summary

12-part stabilization of the StudioRich catalog workflow. Audio linking is now actually playable via `URL.createObjectURL`. Catalog rows have audition buttons. Mood fields are separated with restore actions. Playlist builder validates and references trackIds correctly. NaN timing is fixed. Source menu is readable.

---

## Parts Delivered

### Part 1 — Source menu readability
- `play/src/styles.css`: `.fm-source-dropdown` → `min-width: 240px; max-width: 340px`
- `.fm-source-action`: `white-space: normal; word-break: break-word` (was `white-space: nowrap`)
- Long items like "Re-scan Audio Folder (47 linked, 5 missing)" now wrap instead of clipping

### Part 2 — Catalog track audition playback
- `play/src/ui/MainTrackWindow.tsx`: added `onAuditionTrack`, `onAuditionAndAdd`, `auditionTrackId` props to `Props`, `LibraryRows` type, and the component destructure
- `LibraryRows` catalog row actions: `▶` button calls `onAuditionTrack(trackId)`, `+▶` button calls `onAuditionAndAdd(trackId)` (disabled when no audio)
- Playing track highlighted with `.tb-btn-playing` CSS class
- CSS: `.tb-btn.tb-btn-playing`, `.tb-btn.tb-btn-dim` added to `styles.css`

### Part 3 — Audio linking actually playable
- `play/src/logic/audioFolderLinker.ts`: reworked lookup maps from `Map<string, string>` to `Map<string, {rel, file}>` so `File` objects are retained during matching
- On match: `URL.createObjectURL(file)` creates blob URL, stored in `objectUrl` field on track and returned in `objectUrls: Map<trackId, string>`
- `options.revokeUrls?: string[]` added — stale objectUrls revoked before creating new ones
- `play/src/data/trackTypes.ts`: added `objectUrl?: string` (ephemeral, session-only)
- `play/src/data/playProjectStorage.ts`: `savePlayProject` strips `objectUrl` before serializing (blob URLs aren't valid across sessions)

### Part 4 — Audio link report: playableCount
- `AudioLinkResult` interface: added `playableCount: number`
- `report.playableCount` counts tracks that got a live objectUrl this scan

### Part 5 — Fix Re-suggest Moods: no destructive clear on failure/empty
- `play/src/App.tsx` `handleGenerateMoodSuggestionsForTracks`: added guard `if (!suggestions.length) return t` — only replaces `moodSuggestions` when `suggestMoodsFromAnalysis` returns ≥1 result; empty result leaves existing suggestions intact

### Part 6 — Separate mood fields: importedMoodTags
- `play/src/data/trackTypes.ts`: added `importedMoodTags?: string[]`
- `play/src/data/importCsv.ts`: at import time, when `moodTags` is populated from CSV, also sets `importedMoodTags` to the same value — preserves the original import reference even if user later edits `moodTags`
- `TrackEditorPanel`: shows "From Import" row with `importedMoodTags` as read-only reference
- Shows current `moodSuggestions` in a "Suggested" row

### Part 7 — Restore mood suggestion actions
- `play/src/ui/TrackEditorPanel.tsx`: new Props: `onRestoreSuggestionsFromImport`, `onRestoreSuggestionsFromMechanical`, `onClearSuggestedMoods`
- Buttons rendered in "Suggestions" row of mood section:
  - "Restore from Import" — copies `importedMoodTags` → `moodSuggestions` (visible when importedMoodTags exist)
  - "Restore from Mechanical" — copies `mechanicalMoodTags` names → `moodSuggestions` (visible when mechanicalMoodTags exist)
  - "Clear Suggestions" — clears `moodSuggestions`
- CSS: `.te-action-row`, `.te-action-btn`, `.te-action-btn-danger`, `.te-label-dim`, `.te-row-actions`
- `play/src/App.tsx`: handlers `handleRestoreSuggestionsFromImport`, `handleRestoreSuggestionsFromMechanical`, `handleClearSuggestedMoods`
- Wired through `MainTrackWindow` → `LibraryRows` → `TrackEditorPanel`

### Part 8 — Generated playlists reference catalog trackIds (not clones)
- `play/src/App.tsx` `handlePlaylistBuilderConfirm`: slot construction now uses `assignedTrackId: t.trackId` with all required `TrackSlot` fields (`slotIndex`, `startTimeSeconds`, `targetEnergy`, `targetBpm`, `warningLevel`)
- Fixed broken `assignPlaylistToCurve` call for `create_fit_curve` / `create_fill_time` modes — was calling with wrong positional signature; now uses correct object param `{ tracks, curve, locks, excludedTrackIds, targetDurationSeconds }`

### Part 9 — Fix NaN timing
- `play/src/ui/MainTrackWindow.tsx` `fmtDur`: `(s: number | undefined | null)` → returns `"—"` when `s == null || isNaN(s) || s <= 0`
- `play/src/ui/TrackTable.tsx`: inline duration format now also guards `isNaN` and `<= 0`

### Part 10 — Playlist builder validation
- `play/src/ui/PlaylistBuilderPanel.tsx`: preview bar now shows `"· X without audio"` warning when matching tracks include tracks with `!audioLinked && !objectUrl`

### Part 11 — Audition + Add workflow
- `play/src/App.tsx`: `handleAuditionAndAdd(trackId)` = `handleAuditionTrack + handleAddToPlaylistEnd` in one action
- Wired through MainTrackWindow and surfaced as `+▶` button in catalog rows

### Part 12 — Playable-only filter label
- `play/src/ui/PlaylistBuilderPanel.tsx`: "Linked only" → "Playable only (audio linked)"; "Missing only" → "Missing audio only"

---

## Files Changed

| File | Change |
|---|---|
| `play/src/data/trackTypes.ts` | Added `objectUrl`, `importedMoodTags` fields |
| `play/src/data/importCsv.ts` | Populate `importedMoodTags` at import |
| `play/src/data/playProjectStorage.ts` | Strip `objectUrl` before persist |
| `play/src/logic/audioFolderLinker.ts` | objectUrl creation, `playableCount`, rescan revoke |
| `play/src/App.tsx` | `getTrackPlayUrl`, audition handlers, mood restore handlers, builder fix, playSlotDirect update |
| `play/src/ui/MainTrackWindow.tsx` | `fmtDur` NaN fix, audition/restore props threaded through |
| `play/src/ui/TrackEditorPanel.tsx` | importedMoodTags display, restore mood action buttons |
| `play/src/ui/TrackTable.tsx` | NaN duration fix |
| `play/src/ui/PlaylistBuilderPanel.tsx` | Unlinked warning, "Playable only" label |
| `play/src/styles.css` | Source menu width, audition btn states, te-action-btn styles |

---

## Preserved (not touched)
- Flow Curve engine, curve presets, assignPlaylistToCurve logic
- Source policy / sourceGroupId / sourceEligibility
- TrackEditorPanel field editing (bpm, energy, key, etc.)
- mechanicalMoodAnalyzer / analyzer job states
- OBS broadcast surface, BroadcastHudShell
- WOS/WALL/MAPS — none touched

## Do Not Reopen
- `getTrackPlayUrl` must check `objectUrl` before `filePath` — `objectUrl` is the live playable URL; `filePath` requires a media server
- `objectUrl` must never be persisted — it's a browser blob URL valid only for the current session
- `importedMoodTags` is write-once at import — never overwrite on subsequent scans/edits
- `linkAudioFiles` must revoke stale objectUrls on rescan via `options.revokeUrls` — browser memory leak otherwise
