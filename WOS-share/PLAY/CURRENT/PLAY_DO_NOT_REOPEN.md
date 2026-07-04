---
date_generated: 2026-06-25
project: PLAY
source_pack: do_not_reopen
coverage_start: 2026-06-22
coverage_end: 2026-06-25
---

# PLAY Do Not Reopen

## Closed Issues (This Rollup)

- **Do not re-couple editor selection to playback.** `activePlaylistId` is editor-only.
  - Closed by: 0622A

- **Do not set `manualOrderDirty: true` after Fill Missing Time or RemoveLeaveGap.**
  - Closed by: 0622B, 0622C

- **Do not treat curve node null crash as suppressible.** Fixed with null-guard.
  - Closed by: 0622D

- **Do not import to library without an explicit destination modal.**
  - Closed by: 0624F

- **Do not trigger flow graph regeneration on library import.**
  - Closed by: 0624F

- **Do not call `exportM3u` with old signature.** Updated to `{ tracks, slots, title }` → `{ content, report }`.
  - Closed by: 0624G

- **Do not call `getSvgCoords(e)` with one argument.** Requires `(clientX, clientY)`.
  - Closed by: 0624G

## Deprecated Directions

- `source: "iframe"` as committed default — dev opt-in only.
- WOS as a permanent HUD layer.
- "block" language in Scheduler UI — replaced by "event".
- `handleDeletePlaylist` stopping audio on non-playing playlist delete.

## Banned / Avoided Patterns

- `Math.random()` in `buildPlaylistSlotsFromSourcePool` — must be deterministic.
- Per-component schedule clocks — one shared `scheduleNow` only.
- Auto-fill pulling across source groups without `allowCrossGroupAutofill: true`.
- Chart, route line, or legend as default Broadcast HUD content.
- `FlowCurveCanvas` in default Broadcast HUD view.
- Label-text routing in Smart Grid — route by `region.regionType` only.
- `// @ts-ignore`, `// @ts-expect-error`, or `as any` suppressions (per 0624G).

## Closed Issues (0702A)

- **Do not restore Accent Color to the Playlist Identity modal.** Removed in 0702A.
  - Closed by: 0702A

- **Do not restore Presentation Mode (card/overlay/full_scene/map_channel) to the Playlist Identity modal.** Removed in 0702A.
  - Closed by: 0702A

- **Do not restore Map Color Themes, Extracted Theme, or Broadcast Preview to the Playlist Identity modal.** These controls belong in dedicated broadcast/colorlab tools, not a playlist identity editor.
  - Closed by: 0702A

## Closed Issues (0701J)

- **Do not show Reference or Unknown Review as peer LIBRARIES in the left nav.** These source owners are hidden from the Libraries section. Only StudioRich Catalog and External are shown.
  - Closed by: 0701J

- **Do not show global library counts on per-source rows.** Counts are derived per-owner from `libraryTracks`. External count = external tracks only.
  - Closed by: 0701J

- **External folder scan must create new Track records, not attempt to match existing tracks.** `handleImportAudioFolderAsExternal` creates one Track per audio file with `sourceOwner: "external"`, `audioLinked: true`, and a live `objectUrl`. It does NOT call `linkAudioFiles`.
  - Closed by: 0701J

- **StudioRich source menu must not show Load Seed Data, Repair Duplicates, or Build Playlist From Catalog as top-level menu items.** Simplified to: Source Settings, Scan Catalog, Re-scan Audio Folder, Analyze Mechanical Moods.
  - Closed by: 0701J

## Closed Issues (0701I)

- **Do not restore Library Groups (Groups section) to the left nav.** Library group navigation is removed. The `viewMode === "groups"` path still exists in the system but is no longer navigable from the UI.
  - Closed by: 0701I

- **Do not restore Build From Catalog button to the left nav.** Playlist creation from catalog is removed from the nav. The `onOpenPlaylistBuilder` callback and related source menu action remain available.
  - Closed by: 0701I

- **Do not restore Utility section (Orphans, Excluded, Locked Tracks) to the left nav.** These viewModes still exist but are not surfaced in the main nav.
  - Closed by: 0701I

## Closed Issues (0701H)

- **Do not render Flow Curve or PlaylistHeader in library views.** Condition: `viewMode === "playlist"`.
  - Closed by: 0701H Parts 1+2

- **Do not let play button click open TrackEditorPanel.** Play buttons must call `e.stopPropagation()`.
  - Closed by: 0701H Part 3

- **Do not show `currentTrack` as undefined during catalog audition.** `currentTrack` fallback: `tbm.get(auditionTrackId)` when `currentSlotIdx` is null.
  - Closed by: 0701H Part 4

- **Do not let mood chips expand row height.** `.mood-chips` must use `flex-wrap: nowrap; overflow: hidden`.
  - Closed by: 0701H Part 9

- **Do not carry duration, date, or target in left nav playlist rows.** Name + count badge only. Detail lives in playlist header.
  - Closed by: 0701H Part 13

## Closed Issues (0701G)

- **Do not persist `objectUrl` to localStorage.** Blob URLs are session-only; strip before serializing.
  - Closed by: 0701G Part 3

- **Do not overwrite `importedMoodTags` after initial CSV import.** Write-once at import time only.
  - Closed by: 0701G Part 6

- **Do not clear `moodSuggestions` when `suggestMoodsFromAnalysis` returns empty.** Guard: only replace when ≥1 result returned.
  - Closed by: 0701G Part 5

- **Do not call `assignPlaylistToCurve` with positional args.** Requires single object param `{ tracks, curve, locks, excludedTrackIds, targetDurationSeconds }`.
  - Closed by: 0701G Part 8

- **Do not construct `TrackSlot` without required fields.** `slotId`, `slotIndex`, `startTimeSeconds`, `targetEnergy`, `targetBpm`, `warningLevel`, `warningMessages` are all required.
  - Closed by: 0701G Part 8

## Stable Assumptions

- `tsc --noEmit` exits 0 as of 0701G. All new patches must preserve this.
- `npm run build` Vite failure is a Node 18 environment issue. Do not fix by changing product code.
- `.wosplay` is the project file format.
- Mood Catalog is the canonical tag set for `moodTags`.
- Source pool fill is deterministic and stable.
- `objectUrl` on `Track` is ephemeral — session-only, never persisted.
- `importedMoodTags` is the read-only import reference; `moodSuggestions` is the editable working set.
- `getTrackPlayUrl(track)` must check `objectUrl` first, `filePath` second.

## Carried From Prior Rollup

- Do not restore default `FlowCurveCanvas` to Broadcast HUD. (0620J)
- Do not restore permanent queue rail as default HUD. (0621D)
- Do not make map feed permanent or live by default. (0621L/0621M)
- Do not route grid content by visible label text. (0621K)
- Do not split scheduler time into multiple independent clocks. (0621I)
