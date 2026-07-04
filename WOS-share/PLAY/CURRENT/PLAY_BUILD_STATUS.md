---
date_generated: 2026-07-01
project: PLAY
source_pack: build_status
coverage_start: 2026-06-22
coverage_end: 2026-07-01
---

# PLAY Build Status

## Active

None. Last completed build: 0702A.

## Completed in This Rollup (2026-06-22 → 2026-06-25)

| Build ID | Name | Status | Notes |
|---|---|---|---|
| `0622A` | Decouple Playback From Editor | PASS | `playingPlaylistId` + `playingSlotsRef`; editor selection no longer stops playback |
| `0622B` | Fill Missing Time Curve Reactivity | PASS | `manualOrderDirty: false` after fill |
| `0622C` | RemoveLeaveGap Curve Reactivity | PASS | Same fix applied to RemoveLeaveGap path |
| `0622D` | Curve Node Null Crash | PASS | Null-guard in `FlowCurveCanvas.tsx` |
| `0622E` | WOS Projection Source Spike | PASS | `source: "iframe"` + `IframeMapFeed`; default stays `none` |
| `0622F` | Map Channel Broadcast Wallpaper | PASS | `map_channel` block → full-bleed wallpaper region |
| `0622G` | Map Channel Mock Fallback UX | PASS | Graceful degradation; unsupported sources → placeholder |
| `0623A` | WOS Local URL + Map Channel Direct | PASS | `localhost:5503` dev config; direct display mode |
| `0623B` | Durable Export/Import + Storage Warning | PASS | `.wosplay` format; storage warning badge; storage-safe mode |
| `0623C` | Event-First Programming + Library Foundation | PASS | `BroadcastEvent`, `MusicSourcePool`; scheduler language → "events" |
| `0624A` | Source Pool + Template Creation Speed | PASS | One-click playlist→pool; `buildPlaylistSlotsFromSourcePool` |
| `0624B` | Source Pool Library Metadata Hotfix | PASS | Source pool hydration/persistence fix |
| `0624C` | Library Bulk Metadata + Mood Catalog | PASS | `BulkEditBar`; predefined mood tag set |
| `0624D` | Library Mood Grouping + Filter | PASS | Library Groups panel; mood filter; template source pool selector |
| `0624E` | Audio Analysis + Mood Suggestion Bridge | PASS | `TrackAudioAnalysis`; "Apply Suggestions to Moods" |
| `0624F` | Import Destination + Archive + Governance | PASS | Import destination modal; archive status; flow graph regression fix |
| `0624G` | TypeScript Build Health Recovery | PASS | Cleared 15 TS errors; `tsc -b` exits 0 |
| `0701G` | Catalog Playback + Playlist Builder Stabilization | PASS | 12-part: objectUrl audio, catalog audition, mood restore, builder fix, NaN timing |
| `0701H` | Library Mode + Catalog Table Usability Pass | PASS | Workspace separation, play column far-left, player dock audition, single-line moods, nav simplification |
| `0701I` | Left Panel Simplification | PASS | Removed Groups section, Build From Catalog button, Utility section from FileManager |
| `0701J` | Library Source Clarity + External Behavior | PASS | StudioRich menu simplified; External folder import creates tracks; Reference/Unknown hidden from nav |
| `0702A` | Playlist Identity Modal Redesign | PASS | Two-column layout; removed accent/presentation/theme/broadcast controls; large description textarea |

## Previously Completed (pre-rollup)

| Range | Status |
|---|---|
| 0619A–0621M (19 builds) | PASS |

See `REPORTS/rollups/2026-06-21_PLAY_CONTINUITY_ROLLUP.md` for full prior chain.

## Blocked / Deferred

| Item | Reason | Resume When |
|---|---|---|
| `npm run build` (Vite) | Node 18; Vite requires Node 20+ | Environment Node upgrade |
| Live WOS iframe integration | Dev opt-in only | User requests live map channel |
| Source pool editor UI | Data model exists; UI not built | Next event-programming sprint |
| Event recurrence expansion | Type defined; no engine | Next scheduling sprint |
