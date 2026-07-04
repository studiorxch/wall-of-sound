---
date_generated: 2026-06-23
project: PLAY
report_type: continuity_rollup
coverage_start: 2026-06-21
coverage_end: 2026-06-23
---

# PLAY Continuity Rollup

## Summary

14 builds completed across 2026-06-21 to 2026-06-23 (0621E–0622D). PLAY evolved from a broadcast HUD into a full programmable music channel system: Playlist Builder → Scheduler → Smart Grid → Broadcast HUD. A cluster of P0/P1 stability patches (0621E, 0621F, 0622B, 0622C, 0622D) hardened source isolation, malformed data, and curve reactivity. Playback was decoupled from editor selection (0622A). All 14 builds passed TypeScript check and browser verification.

## Completion Reports Covered

| Build ID | Name | Date | Status |
|---|---|---|---|
| 0621E | PlaylistSourceGroupIsolationPatch | 2026-06-21 | PASS (P0/P1) |
| 0621F | SlotWarningMessagesDefensiveBackfillHotfix | 2026-06-21 | PASS (P0/P1) |
| 0621G | PlaylistSchedulerTVGuideFoundationPatch | 2026-06-21 | PASS |
| 0621H | SmartGridBroadcastCompositionFoundation | 2026-06-21 | PASS |
| 0621I | LiveScheduleClockAndAutoResolvePatch | 2026-06-21 | PASS |
| 0621J | SchedulePreviewRegionContentPatch | 2026-06-21 | PASS |
| 0621K | WOSMapRegionPlaceholderAndGridContentRouting | 2026-06-21 | PASS |
| 0621L | WOSMapRegionFeedSpike | 2026-06-21 | PASS (flag OFF) |
| 0621M | MapRegionFeedSourceSelectorPatch | 2026-06-21 | PASS (default none) |
| 0621N | CurrentArchitectureReadmeAndContinuity | 2026-06-21 | PASS (DOC) |
| 0622A | DecouplePlaybackFromEditorPlaylist | 2026-06-22 | PASS |
| 0622B | FillMissingTimeCurveReactivityHotfix | 2026-06-22 | PASS |
| 0622C | RemoveLeaveGapCurveReactivityHotfix | 2026-06-23 | PASS |
| 0622D | CurveNodeNullToFixedCrashHotfix | 2026-06-23 | PASS (P0) |

## Major Changes

- **0621E** — Source group isolation. Auto-fill/regen/fill-gap scoped to active playlist's source group. `isTrackEligibleForPlaylist` in `sourceEligibility.ts` is the single eligibility authority. Manual drag unaffected. Legacy unscoped tracks remain globally eligible. Migration non-destructive.

- **0621F** — Slot warning messages defensive backfill. `normalizeWarningMessages` helper added to `playlistTypes.ts`. `warnBadges` hardened to never crash on null/missing/malformed data. Storage repair normalizes all slot messages on load. Closed the 0621E flagged crash risk.

- **0621G** — Playlist Scheduler / TV Guide. Third workspace mode. `ScheduleBlock` with start/end/role/displayMode. TV guide view. Add/remove/move ±30m. Conflict detection. `resolveSchedule` produces `now`/`next`/`later`. `upcoming_buffet` prefers scheduled blocks. 30s live clock (added in 0621I).

- **0621H** — Smart Grid foundation. `resolveSmartGridComposition` maps active block role+displayMode → 5 layout presets → regions on 4×6 grid. `BroadcastGridLayer` renders dashed region outlines per composition. `⊞`-gated, off by default.

- **0621I** — Single shared `scheduleNow` state in App ticking every 30s. All schedule-aware surfaces (Scheduler guide, buffet, grid) advance automatically from one shared tick.

- **0621J** — `schedule_preview` region gets live NOW/NEXT/LATER content from the shared clock. `buildSchedulePreviewItems` in `scheduleResolver.ts`.

- **0621K** — Single `renderRegionContent` router in `BroadcastGridLayer` keyed on `regionType`. WOS/MAP placeholder for `map_placeholder`; PROGRAM card for `bumper_card`. Region types locked — do not rename.

- **0621L** — Mock SVG map feed behind `ENABLE_MAP_REGION_FEED` flag (default false). Proves region can host map-like content. No Mapbox, no network.

- **0621M** — Typed `MapRegionFeedSource` selector replaces boolean flag. `mapRegionFeedConfig.ts`. Default committed source `none`. Mock, snapshot, iframe, live_wos typed; only mock is a supported renderer.

- **0621N** — Documentation only. Architecture README updated. No code changed.

- **0622A** — Playback decoupled from editor selection. `playingPlaylistId` + `playingSlotsRef` as independent playback context. Editor switch no longer stops/rebinds audio. Continuation reads `playingSlotsRef`, not editor `slotsRef`. Scheduler NOW does not hijack playback.

- **0622B** — Fill Missing Time sets `manualOrderDirty: false` (was `true`). Fixes freeze of curve-node reactivity after fill. One-line fix; curve now stays reactive after fill — same shape as after Regenerate.

- **0622C** — `preservedGapSlotIds` on `PlaylistRecord`. Remove and Leave Gap records gap slot IDs, sets `manualOrderDirty: false`. `handleCurveChange` re-applies gaps after each reassignment. Fill clears consumed gap IDs. Compact delete purges stale gap IDs.

- **0622D** — P0 crash: `null.toFixed()` on track/slot data fields. `formatNumber` / `formatInteger` safe formatters added to `dateFormat.ts`. 13 call sites crash-proofed across warningEngine, FlowCurveCanvas, MainTrackWindow, PlaylistTimeline, TrackTable, OrphanPanel, exportPlaylist.

## Builds Completed

All 14 builds listed above — all PASS.

## Builds Still Active

None.

## Decisions Made

- Source group isolation: `isTrackEligibleForPlaylist` is the single authority; manual placement always allowed.
- PLAY is a programmable music channel system: Playlist → Scheduler → Smart Grid → HUD.
- Scheduler is the timing authority; Smart Grid reads from it.
- Single shared 30s schedule clock in App.
- Smart Grid region types must not be renamed.
- Map feed default committed source is `none`.
- Playback is decoupled from editor selection: `playingPlaylistId` is the playback authority, not persisted.
- `manualOrderDirty: false` for Fill and Leave-Gap operations; `preservedGapSlotIds` tracks intentional gaps.
- Direct `.toFixed()` on data-derived values is banned; use `formatNumber` / `formatInteger`.

## Blockers / Risks

- No active blockers.
- Dead CSS: `.hud-header*` rules left in stylesheet (safe to prune).
- `loadPlayProject()` called 3× per mount; repair warning logs 3× on corrupt data (cosmetic).
- Scheduler clock lags up to 30s at block boundaries (30s tick; acceptable for foundation).
- `ScheduleState.timezone` field exists but not applied; local browser time used.
- Map feed sources `snapshot`/`iframe`/`live_wos` are typed only; no live renderer.

## Do Not Reopen Updates (additions)

- No second schedule clock — single `scheduleNow` in App (0621I)
- Route Smart Grid content by `regionType`, not label text (0621K)
- Do not rename Smart Grid region types (0621K)
- Do not set `manualOrderDirty: true` in Fill Missing Time (0622B)
- Do not set `manualOrderDirty: true` in Remove and Leave Gap — use `preservedGapSlotIds` (0622C)
- Do not call `.toFixed()` directly on data-derived values (0622D)
- Editor selection cannot stop or rebind live playback (0622A)
- Scheduler NOW does not hijack playback (0622A)
- Do not remove gap re-application step in `handleCurveChange` (0622C)

## Source Pack Files Updated

- `chatGPT-share/PLAY/CURRENT/PLAY_CURRENT.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_BUILD_STATUS.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_DECISIONS.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_DO_NOT_REOPEN.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_SOURCE_INDEX.md`

## Next Recommended Step

Define the next spec. Top candidates:
1. Dead CSS prune (`.hud-header*` + orphaned `.hud-canvas-zone`)
2. Consolidate `loadPlayProject()` single-call refactor
3. Playlist lock toggle UI
4. AutoMix wiring
5. Live map/WOS feed (`MapRegionFeedSource = "iframe"` or `"live_wos"`)
