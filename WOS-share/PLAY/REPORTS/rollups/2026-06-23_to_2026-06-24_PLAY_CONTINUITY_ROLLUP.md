---
date_generated: 2026-06-24
project: PLAY
report_type: continuity_rollup
coverage_start: 2026-06-23
coverage_end: 2026-06-24
---

# PLAY Continuity Rollup

## Summary

10 builds completed across 2026-06-23 to 2026-06-24 (0622E–0624D), plus the PLAY project relocation into the WOS monorepo (`/Users/studio/Projects/wall-of-sound/play/`). The Map Channel path was built end-to-end: from iframe spike → playlist wallpaper mode → mock fallback → committed WOS local URL (`http://localhost:5500`). PLAY gained a durable export/import path with dirty tracking. The data model shifted to event-first programming with `BroadcastEvent` + `MusicSourcePool`. The library became a full DJ music catalog with bulk metadata, mood filtering, source pool templates, and template source filters. All 10 builds passed TypeScript check.

## Completion Reports Covered

| Build ID | Name | Date | Status |
|---|---|---|---|
| 0622E | WOSProjectionSourceSpike | 2026-06-23 | PASS |
| 0622F | MapChannelBroadcastWallpaperPatch | 2026-06-23 | PASS |
| 0622G | MapChannelMockFallbackAndSourceUXHotfix | 2026-06-23 | PASS |
| 0623A | WOSLocalUrlAndMapChannelDirectPatch | 2026-06-23 | PASS |
| 0623B | DurableProjectExportImportAndStorageWarningPatch | 2026-06-23 | PASS |
| 0623C | EventFirstProgrammingAndLibraryFoundationPatch | 2026-06-23 | PASS |
| 0624A | SourcePoolAndPlaylistTemplateCreationSpeedPatch | 2026-06-24 | PASS |
| 0624B | SourcePoolAsLibraryMetadataHotfix | 2026-06-24 | PASS |
| 0624C | LibraryBulkMetadataAndMoodCatalogPatch | 2026-06-24 | PASS |
| 0624D | LibraryMoodGroupingFilterAndTemplateSourcePatch | 2026-06-24 | PASS |

## Major Changes

- **0622E** — First real WOS projection path: `IframeMapFeed` component added; `MapRegionFeedConfig` gains `iframeUrl` + `label`; `"iframe"` added to supported sources. Default remains `source: "none"`.

- **0622F** — Map Channel as playlist-level broadcast wallpaper. `isMapChannel` detection in `BroadcastHudShell`; `hud-bg-map` layer renders `MapRegionFeed`. No scheduler block required. Established separation: Playlist = visual source, Smart Grid = layout, Scheduler = timing.

- **0622G** — `MapRegionFeedRenderContext` (`"wallpaper"` | `"region"`): wallpaper context falls back to mock when live source unavailable; region context honors configured source. BroadcastGridLayer passes `context="region"` (Smart Grid path unchanged).

- **0623A** — Full config schema rewrite. `source: "wos_iframe"` is the committed default. `wosUrl: "http://localhost:5500"`, `allowMockFallback: false`. `WosIframeFeed` and `WosUnavailable` components. `IframeMapFeed` removed. Map Channel is now a live WOS connection out of the box.

- **0623B** — Durable project save path: `PlayProjectExport` envelope, filename with title+date, `stableProjectHash` for dirty tracking, TopBar save-status indicator (never / dirty / clean). `repairStoredProject` exported so import uses same repair chain. Import sets hash baseline but not `lastExportedAt`.

- **0623C** — Event-first data model: `BroadcastEvent` + `MusicSourcePool` types established. Library catalog fields added to `Track` (genres, moodTags, sourceOwner, albumTitle, albumGroupId). Playlist roles (static/template/event_generated). Scheduler language shift to "Add Event" / "NOW EVENT" / "NEXT EVENT". Clickable event rows open playlist in editor.

- **0624A** — Template creation speed: `buildPlaylistSlotsFromSourcePool` deterministic fill algorithm. Create Source Pool from playlist. Template role settings (sourcePoolId, targetTrackCount, regenerationMode). Create Playlist from Template generates `event_generated` playlist with date in title, fills from pool. `setSourcePools` setter missing from 0623C — added here.

- **0624B** — Source Pool model corrected: Source Pools are library metadata groups, not a competing sidebar stack. "Create Library Group" replaces "Create Source Pool" in UI. `track.sourcePoolIds[]` field added. Source Pool sidebar section removed; compact "Library Groups · N" count under Library only. All 0624A functionality preserved.

- **0624C** — Full DJ-catalog on `Track`: 15+ new fields (moodTags, grouping, rating, sourceOwner, albumArtist, year, composer, groove, rhythmDensity, phraseLength, percussiveShape, energyLevel, audioFilename, albumArtUrl, key). `trackMetadata.ts` parse/normalize helpers. CSV import maps all new columns; `parseDurationToSeconds` accepts MM:SS / H:MM:SS. Bulk edit bar for multi-track mood/grouping/rating/owner. `MoodChips` inline in library rows. Legacy mood-map fields (`moods`, `confidence`, `coord_*`) transparently mapped on load.

- **0624D** — Library catalog operational: `libraryFilters.ts` with `LibraryTrackFilters` + `filterTracksByLibraryFilters` + `buildFilterOptions`. Catalog filter bar with dynamic dropdowns. "Select Filtered" adds filtered rows to selection. "Create Library Group" inline prompt. Template Source Filters on template playlists drive fill without explicit source pool. `templateSourceFilters` takes priority over pool's albumGroupIds/genreFilter in fill algorithm.

## Builds Completed

All 10 builds listed above — all PASS.

## Builds Still Active

None.

## Decisions Made

- Map Channel is triggered by `playlist.broadcastIdentity.presentationMode === "map_channel"` — no scheduler, no grid toggle required
- Committed map feed config: `source: "wos_iframe"`, `wosUrl: "http://localhost:5500"`, `allowMockFallback: false`
- WOS enters PLAY only through Smart Grid map region or HUD background layer — never through playlist/scheduler/playback
- `MapRegionFeedContext` decouples wallpaper behavior from region behavior
- `IframeMapFeed` → superseded and removed by `WosIframeFeed` (0623A)
- Export envelope `exportKind: "PLAY_PROJECT"` is a stable file-type identifier — must not change
- Import ≠ export: import sets content hash baseline; does not record a file write
- `BroadcastEvent` is the promoted scheduling object; `PlaylistRecord` is the music engine attached to it
- Source Pools are library metadata groups — not a sidebar navigation stack
- `templateSourceFilters` takes priority over pool filter fields in fill algorithm

## Blockers / Risks

- No active blockers.
- 10 pre-existing TypeScript errors (unused-var / missing-prop) — existed before PLAY relocation; not introduced by recent patches.
- Browser sandbox may block `localhost:5500` iframe in some configurations (expected; not a bug).
- Source pool fill order is deterministic (no seeded shuffle) — may not produce varied playlists.
- Dead CSS: `.hud-header*` + legacy `.mrf-iframe` rules remain in stylesheet.

## Do Not Reopen Updates (additions)

- Do not require a Scheduler block or Smart Grid toggle for Map Channel wallpaper (0622F)
- Do not use `IframeMapFeed` — replaced by `WosIframeFeed` (0623A)
- Do not commit map feed config with source other than `"wos_iframe"` or `"none"` (0623A)
- Do not set `lastExportedAt` on import (0623B)
- Do not change `exportKind: "PLAY_PROJECT"` (0623B)
- Do not add Source Pools as a competing sidebar navigation stack (0624B)

## Project Relocation

PLAY relocated into the WOS monorepo during this period:
- **Active:** `/Users/studio/Projects/wall-of-sound/play/`
- **Legacy (inactive):** `/Users/studio/Projects/play/`
- Do not write new code, specs, or reports to the legacy path.

## Source Pack Files Updated

- `chatGPT-share/PLAY/CURRENT/PLAY_CURRENT.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_BUILD_STATUS.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_DECISIONS.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_DO_NOT_REOPEN.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_SOURCE_INDEX.md`

(Written to new active path: `/Users/studio/Projects/wall-of-sound/play/chatGPT-share/PLAY/`)

## Next Recommended Step

Define the next spec. Top candidates:
1. Source pool editor UI (edit genre/mood/album filter fields on existing pools)
2. Playlist lock toggle UI
3. AutoMix wiring
4. Dead CSS + legacy code prune (`.hud-header*`, `.mrf-iframe`, legacy export functions)
5. Fix 10 pre-existing TypeScript errors
