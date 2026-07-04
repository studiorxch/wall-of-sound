---
date_generated: 2026-06-25
project: PLAY
source_pack: decisions
coverage_start: 2026-06-22
coverage_end: 2026-06-25
---

# PLAY Decisions

## Decisions Made in This Rollup

### Playback / Editor Decoupling (0622A)
- Editor selection (`activePlaylistId`) does not control live playback. Playback context is a separate runtime state (`playingPlaylistId`).
- Only explicit play actions bind the playing context. Continuation always runs on the playing playlist.
- Deleting the editor-active (non-playing) playlist never stops audio.

### Curve Reactivity Contract (0622B, 0622C)
- Fill Missing Time and RemoveLeaveGap are curve-aware. They leave `manualOrderDirty: false`.
- Only explicit manual drag-reorder sets `manualOrderDirty: true`.

### WOS / Map Channel (0622E, 0622F, 0623A)
- WOS enters PLAY only through Smart Grid `map_placeholder` region — never as a HUD layer.
- `source: "iframe"` is dev opt-in. `ACTIVE_MAP_REGION_FEED_CONFIG` stays `source: "none"` in committed code.
- `map_channel` schedule blocks route to full-bleed broadcast wallpaper region.

### Project Persistence (0623B)
- Projects export as `.wosplay` JSON files.
- Storage warning badge appears at 70% localStorage quota.
- Storage-safe mode suppresses autosave.

### Event-First Model (0623C)
- `BroadcastEvent` is the promoted scheduling object. Each "Add Event" creates both a `ScheduleBlock` and a `BroadcastEvent`.
- Scheduler UI language: "Add Event", "NOW EVENT", "NEXT EVENT".
- Clicking an event row opens the attached playlist in the editor.

### Source Pools (0624A, 0624B)
- `buildPlaylistSlotsFromSourcePool` is deterministic (no `Math.random()`).
- Template playlists hold `sourcePoolId` and `targetDurationMinutes`.

### Library (0624C, 0624D, 0624E, 0624F)
- Mood Catalog defines the canonical tag set.
- Audio analysis fields are suggestions only — applying is a one-way user action.
- Import destination is always explicit (modal). No silent routing.
- Importing to Library does not trigger flow graph regeneration.
- Archive status marks tracks as non-playable in normal flows.

## Active Product Locks (carried)

- Broadcast HUD is mood-first, no-default-chart, full-bleed atmosphere.
- Flow Curve lives in the editor only.
- Smart Grid is off by default and `⊞`-gated.
- One shared `scheduleNow` clock (30s tick).
- Schedule state persists in `PlayProject.schedule`.
- Playlist source groups isolate automatic fill/regeneration.

### Workspace Separation (0701H)
- Playlist view and Library view are distinct workspaces. Flow Curve and PlaylistHeader are playlist-only chrome.
- Condition: `viewMode === "playlist"` gates PlaylistHeader and FlowCurveCanvas. All other viewModes get full-height catalog table.
- Play buttons in catalog rows are in the far-left column (`col-play-ctrl`) and must `stopPropagation` so they do not trigger TrackEditorPanel.
- `currentTrack` for the player dock falls back to the auditioned library track when no playlist slot is playing.

### Catalog Column Layout (0701H)
- Catalog table column order: checkbox → Play/Add → # → Title → Artist → Mood → Suggested → Mech. → Grouping → Genre → BPM → Key → E → Dur → Rating → × → Last → Status → Edit.
- Play/Add is column 2 (far-left interactive column). Edit/Exclude/Remove are right-side.
- Mood (blue) = confirmed; Suggested (purple) = import/AI; Mech. (green) = structural role tags. Never mix.

### Left Nav Density (0701H)
- Playlist rows in left nav: cover thumb + name + track count badge only. Duration, updated date, and target removed from nav — they live in the playlist header after entering the playlist.

### Audio Linking + objectUrl (0701G)
- `linkAudioFiles` creates `URL.createObjectURL(file)` on match — tracks get a live `objectUrl` for direct browser playback without a media server.
- `objectUrl` is session-only: stripped in `savePlayProject` before localStorage serialization; revoked on rescan via `revokeUrls`.
- `getTrackPlayUrl(track)` is the single playback URL resolver: `objectUrl` first (direct), `filePath` second (server path).

### Mood Field Separation (0701G)
- `importedMoodTags` — set once at CSV import, never overwritten. Read-only reference.
- `moodTags` — user-editable working set.
- `moodSuggestions` — AI/mechanical suggestions working set. Never cleared on empty analyzer result.
- `mechanicalMoodTags` — mechanical analyzer output, separate from both above.

### Catalog Audition (0701G)
- Catalog rows have a `▶` (audition) and `+▶` (audition+add) button.
- Audition plays directly via `getTrackPlayUrl`, sets `auditionTrackId`, does not require a slot assignment.
- `auditionTrackId` state tracks the highlighted catalog row; clears when another slot starts playing.

## Architecture Locks

- App root: `play/src/` (NOT `play/flow-curve-builder/` — renamed, 0701G confirmed)
- `App.tsx` is the orchestration root.
- Data → Logic → UI layer separation.

## Workflow / Source Truth Split

- Tracks: `PlayProject.tracks[]` (localStorage + `.wosplay`)
- Schedule: `PlayProject.schedule` + `PlayProject.broadcastEvents`
- Source pools: `PlayProject.sourcePools[]`
- Runtime-only (not persisted): `playingPlaylistId`, Smart Grid preset, `scheduleNow`

## Open Questions

- Source pool dedicated panel vs. playlist list integration?
- `BroadcastEvent` status transitions — automated or manual?
- Node.js upgrade path to unblock `npm run build`?
