---
date_generated: 2026-07-01
project: PLAY
source_pack: source_index
coverage_start: 2026-06-22
coverage_end: 2026-07-01
---

# PLAY Source Index

## Completion Reports Used (This Rollup)

| Build | File |
|---|---|
| 0622A | `REPORTS/2026-06-22_PLAY_0622A_DecouplePlaybackFromEditorPlaylist_COMPLETION_REPORT.md` |
| 0622B | `REPORTS/2026-06-22_PLAY_0622B_FillMissingTimeCurveReactivityHotfix_COMPLETION_REPORT.md` |
| 0622C | `REPORTS/2026-06-23_PLAY_0622C_RemoveLeaveGapCurveReactivityHotfix_COMPLETION_REPORT.md` |
| 0622D | `REPORTS/2026-06-23_PLAY_0622D_CurveNodeNullToFixedCrashHotfix_COMPLETION_REPORT.md` |
| 0622E | `REPORTS/2026-06-23_PLAY_0622E_WOSProjectionSourceSpike_COMPLETION_REPORT.md` |
| 0622F | `REPORTS/2026-06-23_PLAY_0622F_MapChannelBroadcastWallpaperPatch_COMPLETION_REPORT.md` |
| 0622G | `REPORTS/2026-06-23_PLAY_0622G_MapChannelMockFallbackAndSourceUXHotfix_COMPLETION_REPORT.md` |
| 0623A | `REPORTS/2026-06-23_PLAY_0623A_WOSLocalUrlAndMapChannelDirectPatch_COMPLETION_REPORT.md` |
| 0623B | `REPORTS/2026-06-23_PLAY_0623B_DurableProjectExportImportAndStorageWarningPatch_COMPLETION_REPORT.md` |
| 0623C | `REPORTS/2026-06-23_PLAY_0623C_EventFirstProgrammingAndLibraryFoundationPatch_COMPLETION_REPORT.md` |
| 0624A | `REPORTS/2026-06-24_PLAY_0624A_SourcePoolAndPlaylistTemplateCreationSpeedPatch_COMPLETION_REPORT.md` |
| 0624B | `REPORTS/2026-06-24_PLAY_0624B_SourcePoolAsLibraryMetadataHotfix_COMPLETION_REPORT.md` |
| 0624C | `REPORTS/2026-06-24_PLAY_0624C_LibraryBulkMetadataAndMoodCatalogPatch_COMPLETION_REPORT.md` |
| 0624D | `REPORTS/2026-06-24_PLAY_0624D_LibraryMoodGroupingFilterAndTemplateSourcePatch_COMPLETION_REPORT.md` |
| 0624E | `REPORTS/2026-06-24_PLAY_0624E_AudioAnalysisFieldsAndMoodSuggestionBridgePatch_COMPLETION_REPORT.md` |
| 0624F | `REPORTS/2026-06-24_PLAY_0624F_ImportDestinationArchiveAndLibraryGroupGovernanceHotfix_COMPLETION_REPORT.md` |
| 0624G | `REPORTS/2026-06-24_PLAY_0624G_PreExistingTypeScriptBuildHealthRecoveryPatch_COMPLETION_REPORT.md` |
| 0701G | `REPORTS/0701G_PLAY_CatalogPlaybackPlaylistBuilderStabilization_COMPLETE.md` |
| 0701H | `REPORTS/0701H_PLAY_LibraryModeCatalogTableUsability_COMPLETE.md` |
| 0701I | `REPORTS/0701I_PLAY_LeftPanelSimplification_COMPLETE.md` |
| 0701J | `REPORTS/0701J_PLAY_LibrarySourceClarityExternalBehavior_COMPLETE.md` |
| 0702A | `REPORTS/0702A_PLAY_PlaylistIdentityModalRedesign_COMPLETE.md` |

## Prior Rollup

`REPORTS/rollups/2026-06-21_PLAY_CONTINUITY_ROLLUP.md` — covers 0621E → 0621M

## New Files Added in This Rollup

| File | Added By |
|---|---|
| `flow-curve-builder/src/data/eventTypes.ts` | 0623C |
| `flow-curve-builder/src/data/sourcePoolTypes.ts` | 0623C |
| `flow-curve-builder/src/data/moodCatalog.ts` | 0624C |
| `flow-curve-builder/src/logic/sourcePoolFill.ts` | 0624A |

## New Files Added (0701G)

| File | Added By |
|---|---|
| *(no new files — changes were patches to existing files)* | 0701G |

## Important Current Files

| File | Role |
|---|---|
| `play/src/App.tsx` | Orchestration root — all state, handlers, persistence, clock |
| `play/src/data/trackTypes.ts` | `Track` type — incl. `objectUrl`, `importedMoodTags` (0701G) |
| `play/src/data/importCsv.ts` | CSV import — sets `importedMoodTags` at import time |
| `play/src/data/playProjectStorage.ts` | Load/save — strips `objectUrl` before persist |
| `play/src/logic/audioFolderLinker.ts` | `linkAudioFiles` — creates objectUrls, `playableCount`, rescan revoke |
| `play/src/data/eventTypes.ts` | `BroadcastEvent`, `BroadcastEventStatus`, `BroadcastEventRecurrence` |
| `play/src/data/sourcePoolTypes.ts` | `MusicSourcePool` type |
| `play/src/data/moodCatalog.ts` | Canonical mood tag set |
| `play/src/logic/sourcePoolFill.ts` | `buildPlaylistSlotsFromSourcePool` — deterministic fill |
| `play/src/ui/MainTrackWindow.tsx` | Catalog + library track UI; audition buttons; mood restore props |
| `play/src/ui/TrackEditorPanel.tsx` | Track editor — importedMoodTags display + restore actions |
| `play/src/ui/PlaylistBuilderPanel.tsx` | Playlist builder dialog — playable-only filter, unlinked warning |
| `play/src/ui/mapRegionFeedConfig.ts` | `ACTIVE_MAP_REGION_FEED_CONFIG` (default: `source: "none"`) |
| `play/src/ui/SchedulerGuideView.tsx` | TV-guide / event-first scheduler UI |
| `play/src/ui/BroadcastGridLayer.tsx` | Smart Grid overlay + region content router |
| `play/src/data/scheduleTypes.ts` | `ScheduleBlock`, `ScheduleState`, `ResolvedSchedule` |
| `play/src/data/smartGridTypes.ts` | `SmartGridComposition`, `SmartGridRegion`, presets |
| `play/src/data/playProjectTypes.ts` | `PlayProject`, `PlaylistRecord` (+ events, pools, roles) |

## Repo Locations

- App root: `play/src/` (Vite + React + TypeScript, port 5173)
- Completion reports: `WOS-share/PLAY/REPORTS/`
- Rollups: `WOS-share/PLAY/REPORTS/rollups/`
- CURRENT source pack: `WOS-share/PLAY/CURRENT/`
