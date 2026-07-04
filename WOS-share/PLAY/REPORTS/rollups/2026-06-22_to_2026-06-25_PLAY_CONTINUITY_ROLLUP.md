---
date_generated: 2026-06-25
project: PLAY
report_type: continuity_rollup
coverage_start: 2026-06-22
coverage_end: 2026-06-25
---

# PLAY Continuity Rollup — 2026-06-22 to 2026-06-25

## Summary

17 builds completed across 4 days. The major themes were: playback/editor decoupling, curve reactivity hardening, WOS map channel integration (iframe opt-in), durable project export/import, event-first programming model, library/source pool foundation, and TypeScript build health recovery. `tsc -b` exits 0 as of 0624G. The product now has a full data model for event-first broadcast programming with source pools, mood-tagged library, and audio analysis fields.

## Completion Reports Covered

| Build | Name | Date |
|---|---|---|
| 0622A | Decouple Playback From Editor Playlist | 2026-06-22 |
| 0622B | Fill Missing Time Curve Reactivity Hotfix | 2026-06-22 |
| 0622C | RemoveLeaveGap Curve Reactivity Hotfix | 2026-06-23 |
| 0622D | Curve Node Null To Fixed Crash Hotfix | 2026-06-23 |
| 0622E | WOS Projection Source Spike | 2026-06-23 |
| 0622F | Map Channel Broadcast Wallpaper Patch | 2026-06-23 |
| 0622G | Map Channel Mock Fallback And Source UX Hotfix | 2026-06-23 |
| 0623A | WOS Local URL And Map Channel Direct Patch | 2026-06-23 |
| 0623B | Durable Project Export Import And Storage Warning Patch | 2026-06-23 |
| 0623C | Event First Programming And Library Foundation Patch | 2026-06-23 |
| 0624A | Source Pool And Playlist Template Creation Speed Patch | 2026-06-24 |
| 0624B | Source Pool As Library Metadata Hotfix | 2026-06-24 |
| 0624C | Library Bulk Metadata And Mood Catalog Patch | 2026-06-24 |
| 0624D | Library Mood Grouping Filter And Template Source Patch | 2026-06-24 |
| 0624E | Audio Analysis Fields And Mood Suggestion Bridge Patch | 2026-06-24 |
| 0624F | Import Destination Archive And Library Group Governance Hotfix | 2026-06-24 |
| 0624G | Pre-Existing TypeScript Build Health Recovery Patch | 2026-06-24 |

## Major Changes

1. **Playback decoupled from editor** — `playingPlaylistId` + `playingSlotsRef` separate runtime playback from `activePlaylistId` (editor selection). Editor browsing never stops audio.
2. **Curve reactivity contract hardened** — Fill Missing Time, RemoveLeaveGap leave `manualOrderDirty: false`; curve nodes remain reactive to edits after these operations.
3. **WOS iframe projection** — `source: "iframe"` + `IframeMapFeed` component added to Smart Grid map region. Default: `source: "none"`. Dev URL: `localhost:5503`.
4. **Map channel display mode** — `map_channel` schedule blocks route to full-bleed broadcast wallpaper region.
5. **`.wosplay` export format** — durable project file; storage warning badge at 70% quota; storage-safe mode suppresses autosave.
6. **Event-first model** — `BroadcastEvent` + `MusicSourcePool` types; scheduler language shifted to "events"; dual record created on "Add Event"; clickable event rows open playlist in editor.
7. **Source pool creation speed** — one-click playlist→pool; template playlists; deterministic `buildPlaylistSlotsFromSourcePool`.
8. **Library foundation** — mood catalog, bulk metadata edit bar, Library Groups panel, mood filter, archive status, import destination modal.
9. **Audio analysis bridge** — `TrackAudioAnalysis` with `analyzedBpm`/`analyzedKey`; "Apply Suggestions to Moods" user action.
10. **TypeScript build clean** — 15 pre-existing errors cleared; `tsc -b` exits 0.

## Builds Completed

All 17 builds: PASS. See PLAY_BUILD_STATUS.md.

## Builds Still Active

None.

## Decisions Made

- Editor selection is not playback authority.
- Fill/gap operations are curve-aware; they leave `manualOrderDirty: false`.
- `source: "iframe"` is dev opt-in only; committed default remains `source: "none"`.
- `.wosplay` is the project file format.
- `BroadcastEvent` is the promoted scheduling object; playlists attach to events.
- Library import does not trigger flow graph regeneration.
- Import destination is always explicit (modal).
- `tsc -b` must exit 0 — no accumulated errors.

## Blockers / Risks

- `npm run build` (Vite) fails: Node 18, Vite requires Node 20+ (environment issue, not code).
- Live WOS/Mapbox integration remains deferred (iframe is dev opt-in, no user toggle).
- Source pool editor UI not yet built (data model is ready).
- Event recurrence expansion not implemented.

## Do Not Reopen Updates

- Do not re-couple editor selection to playback.
- Do not set `manualOrderDirty: true` after Fill Missing Time or RemoveLeaveGap.
- Do not trigger flow graph regeneration on library import.
- Do not call `exportM3u` or `getSvgCoords` with old signatures.
- Do not use `Math.random()` in `buildPlaylistSlotsFromSourcePool`.

## Source Pack Files Updated

- `chatGPT-share/PLAY/CURRENT/PLAY_CURRENT.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_BUILD_STATUS.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_DECISIONS.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_DO_NOT_REOPEN.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_SOURCE_INDEX.md`

## Next Recommended Step

1. Source pool editor UI — CRUD for pool filters, genre/mood assignments.
2. Upgrade Node to 20+ to unblock `npm run build`.
3. Promote WOS iframe integration to a user toggle (not a code swap).
4. Event recurrence expansion engine.
