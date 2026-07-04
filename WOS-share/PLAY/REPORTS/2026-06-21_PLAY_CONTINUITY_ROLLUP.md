---
date_generated: 2026-06-22
project: PLAY
report_type: continuity_rollup
coverage_start: 2026-06-21
coverage_end: 2026-06-21
---

# PLAY Continuity Rollup

## Summary

10 builds completed on 2026-06-21 (0620E–0621D). The Broadcast HUD was progressively restructured from a chart+controls panel into a full-bleed atmosphere surface with timed secondary information cards. A P0 persistence regression (0621C) was identified and fixed mid-session. All 10 builds passed TypeScript check and browser verification.

## Completion Reports Covered

| Build ID | Name | Status |
|---|---|---|
| 0620E | NowNextQueuePanelPatch | PASS |
| 0620F | BroadcastHUDPolishAndCardSeparationPatch | PASS |
| 0620G | MinimalBroadcastTransportPatch | PASS |
| 0620H | BroadcastHUDBackgroundSurfacePatch | PASS |
| 0620I | BroadcastHUDMoodPriorityPatch | PASS |
| 0620J | BroadcastHUDNoDefaultChartHotfix | PASS |
| 0621A | BroadcastHUDPriorityAndGridLayerPatch | PASS |
| 0621B | BroadcastSecondaryTimingAndPlaylistEventPatch | PASS |
| 0621C | PlaylistPersistenceReloadRegressionHotfix | PASS (P0) |
| 0621D | BroadcastHUDStageClearanceLayoutHotfix | PASS |

## Major Changes

- **0620E** — Now/Next/Up Next queue panel added as a right rail in HUD. Pure function `buildNowNextQueueState()` skips unplayable/empty slots.
- **0620F** — SVG clipPath prevents node overflow at plot boundary. Removed redundant ← Editor button from HUD header. Card/graph separation rule locked in code comment.
- **0620G** — Replaced full HUD transport strip with `MinimalBroadcastTransport` — state glyph, title, artist, 2px progress line. No prev/stop/next/seek in HUD.
- **0620H** — HUD background stack: backgroundImage → cover-blur (blur 32px / brightness 0.5) → dark. Gradient vignette replaces flat dark veil. Hard accent structural borders removed; glass panels for graph and queue.
- **0620I** — `FlowCurveDisplayMode` prop added to FlowCurveCanvas (`"editor"` / `"hud_compact"` / `"hud_minimal"`). HUD passed `"hud_compact"`. NOW progress bar removed from queue rail — bottom transport is the single progress indicator.
- **0620J** — Chart removed from HUD entirely. `.hud-canvas-zone` replaced with `.hud-atmosphere-zone` (transparent fill). HUD is now a pure image/atmosphere surface by default.
- **0621A** — Secondary information layer system introduced: `BroadcastSecondaryLayer` renders one timed glass card at a time (now_playing / playlist_identity / next_up / upcoming_buffet). `BroadcastGridLayer` adds a passive SVG registration grid overlay. TopBar action buttons compressed to icons (`⊕ ↺ ⬡`).
- **0621B** — Timed auto-dismiss added: cards expire in 7–16s and return to atmosphere. Pin button (`◫`) prevents dismissal. RundownLine animation shows time remaining per card. `upcoming_buffet` derives items from other project playlists.
- **0621C** — P0 hotfix: mount-time autosave effect (keyed on `trackPlaybackIssues`) fired before hydration and overwrote saved localStorage with default boot state. Fixed with `hasHydratedProject` flag. Storage validation + non-destructive repair added to `playProjectStorage.ts`.
- **0621D** — Operator state (secondaryMode, pinned, gridVisible, modeKey, auto-dismiss timer) lifted from BroadcastHudShell to App. `HudOperatorControls` injected into `TopBar.rightSlot` in HUD mode. Second header band (`hud-header`) removed — stage is fully clear. `MinimalBroadcastTransport` now shows playlist title alongside track/artist.

## Builds Completed

All 10 builds listed above — all PASS.

## Builds Still Active

None.

## Decisions Made

- Broadcast HUD default surface has no chart (0620J, locked).
- Broadcast Card has no chart (0620F, locked in code comment).
- Timed secondary layer replaces permanent queue rail as the HUD information channel (0621A/B).
- `purple = state signal` in HUD — not structural (0620H).
- `BroadcastHudShell` is a pure presentation component; all operator state lives in App (0621D).
- `hasHydratedProject` guard gates all autosave effects (0621C, must not be removed).
- Storage validation + repair is non-destructive; never silently discard user data (0621C).
- `HudOperatorControls` injected into `TopBar.rightSlot` (generic prop) only in HUD mode (0621D).

## Blockers / Risks

- No active blockers.
- `loadPlayProject()` called 3× per mount (two state initializers + hydration effect) — repair warning logs 3× on corrupt data; cosmetic only, deferred from 0621C P0 scope.
- Dead CSS: `.hud-header*` rules left in stylesheet after 0621D (no matching elements, safe to prune).
- Imperative save-in-handler pattern remains; `hasHydratedProject` guards against recurrence but a single guarded `useEffect([project])` would be more robust long-term.

## Do Not Reopen Updates

Added to PLAY_DO_NOT_REOPEN.md:
- No `← Editor` button in HUD header → closed (0620F)
- No chart in Broadcast Card → closed (0620F)
- No chart in Broadcast HUD default → closed (0620J)
- No large hud-header band in HUD → closed (0621D)
- No HUD operator state inside BroadcastHudShell → closed (0621D)
- `hasHydratedProject` must gate all autosave effects → closed (0621C)
- No permanent queue rail as default HUD column → deprecated (0621A)

## Source Pack Files Updated

- `chatGPT-share/PLAY/CURRENT/PLAY_CURRENT.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_BUILD_STATUS.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_DECISIONS.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_DO_NOT_REOPEN.md`
- `chatGPT-share/PLAY/CURRENT/PLAY_SOURCE_INDEX.md`

## Next Recommended Step

Define the next spec. Top candidates:
1. Dead CSS prune (`.hud-header*` + orphaned `.hud-canvas-zone` rules)
2. Consolidate `loadPlayProject()` to a single call (resolve 3× warning on corrupt data)
3. Playlist lock toggle UI
4. AutoMix wiring
5. Broadcast output / OBS browser source URL
