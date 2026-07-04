# 0621N_PLAY_CurrentArchitectureReadmeAndContinuityPatch_v1.0.0_DOC

## Project

PLAY — Playlist Builder / Scheduler / Smart Grid Broadcast System

## Document Type

Documentation / continuity patch

## Status

Ready for implementation

## Purpose

Update the current PLAY documentation so it reflects the actual post-0621M architecture.

The project has moved beyond a playlist-builder-with-HUD model. PLAY is now a programmable music channel system made from three coordinated layers:

```text
PLAYLIST  = program block authoring
SCHEDULER = live TV-guide timing
SMART GRID = schedule-aware visual compositor
```

Broadcast HUD is no longer the central product. It is the clean output surface where scheduled playlist blocks and Smart Grid compositions are presented.

---

# Environmental Assumptions

- Runtime: local Vite / React / TypeScript prototype.
- Documentation target: Markdown files only.
- No code changes are required for this patch unless docs are generated from source comments.
- Existing completion reports for 0621E–0621M are available.
- Existing current source pack structure exists under `PLAY/CURRENT/`.
- Existing report files currently live in `REPORTS/` root and should not be moved during this patch unless explicitly requested.

---

# Current Architecture to Record

## Product Stack

```text
PLAY
├── PLAYLIST
│   └── Creates trusted playlist/program blocks.
│
├── SCHEDULER
│   └── Places playlist/program blocks on a live clock / TV-guide timeline.
│
├── SMART GRID
│   └── Routes visual content into schedule-aware broadcast regions.
│
└── BROADCAST HUD
    └── Presents the current program as a clean, OBS-friendly output surface.
```

## Core Rule

```text
Playlist Builder creates the content block.
Scheduler decides what is on now and what comes next.
Smart Grid decides where visual content appears.
Broadcast HUD remains the output surface.
```

---

# Builds to Capture

This documentation patch should summarize the current state after:

| Build | Status | Summary |
|---|---:|---|
| 0621E | PASS | Playlist source-group isolation prevents cross-group contamination during automatic fill/regeneration. |
| 0621F | PASS | Slot warning messages are defensively normalized to prevent malformed-data crashes. |
| 0621G | PASS | Scheduler / TV-guide foundation added with timed playlist blocks and Now / Next / Later resolution. |
| 0621H | PASS | Smart Grid became schedule-aware and can resolve composition presets from active schedule blocks. |
| 0621I | PASS | Shared live schedule clock updates Scheduler, HUD, and Smart Grid automatically. |
| 0621J | PASS | Schedule preview region renders live TV-guide content inside Smart Grid. |
| 0621K | PASS | Smart Grid region-content router added schedule, map placeholder, bumper, and reserved region handling. |
| 0621L | PASS | Flagged mock WOS/map feed spike proved map-like content can live inside Smart Grid regions. |
| 0621M | PASS | Map feed boolean replaced with typed source selector: `none`, `mock`, `snapshot`, `iframe`, `live_wos`. |

---

# Documentation Targets

## 1. PLAYLIST README

Update the active PLAYLIST README to replace older Broadcast-HUD-centered language with the current triad:

```text
PLAYLIST  = creates program blocks
SCHEDULER = arranges blocks over time
SMART GRID = presents blocks visually
```

### Required README Changes

Add or update sections:

```text
Current Product Model
Playlist Builder
Playlist Scheduler / TV Guide
Smart Grid Broadcast Composition
Broadcast HUD Output Surface
Source Group Isolation
Map / WOS Feed Source Contract
Current Build State
Near-Term Roadmap
```

### README Must Preserve

- PLAYLIST turns playlists into programmable broadcast channels.
- Playlists are not static catalogs.
- Cover/background identity still matters.
- Flow Curve remains the editor/composition authority.
- Broadcast HUD remains mood-first and no-chart by default.

### README Must Update

Replace any language implying Broadcast HUD default should show:

```text
flow curve chart
current playing node
route line
axes
legend
permanent queue rail
large persistent playlist header
```

with:

```text
Broadcast HUD = full-bleed atmosphere + compact operator row + bottom playback/program line + optional timed secondary layers + optional Smart Grid.
```

---

## 2. PLAY Current Source Pack

Update the five current source files:

```text
PLAY/CURRENT/PLAY_CURRENT.md
PLAY/CURRENT/PLAY_BUILD_STATUS.md
PLAY/CURRENT/PLAY_DECISIONS.md
PLAY/CURRENT/PLAY_DO_NOT_REOPEN.md
PLAY/CURRENT/PLAY_SOURCE_INDEX.md
```

### `PLAY_CURRENT.md`

Must state:

```text
Current focus: PLAY is now a playlist/program authoring + live scheduler + Smart Grid broadcast composition system.
```

Must include:

- Current architecture stack.
- Current active build state after 0621M.
- No active blockers unless new ones are known.
- Next likely work: real map source integration, schedule refinement, or rollup depending on user priority.

### `PLAY_BUILD_STATUS.md`

Must add 0621E–0621M as completed PASS builds.

Use exact build IDs:

```text
0621E_PLAY_PlaylistSourceGroupIsolationPatch_v1.0.0_PATCH
0621F_PLAY_SlotWarningMessagesDefensiveBackfillHotfix_v1.0.0_PATCH
0621G_PLAY_PlaylistSchedulerTVGuideFoundationPatch_v1.0.0_PATCH
0621H_PLAY_SmartGridBroadcastCompositionFoundationPatch_v1.0.0_PATCH
0621I_PLAY_LiveScheduleClockAndAutoResolvePatch_v1.0.0_PATCH
0621J_PLAY_SchedulePreviewRegionContentPatch_v1.0.0_PATCH
0621K_PLAY_WOSMapRegionPlaceholderAndGridContentRoutingPatch_v1.0.0_PATCH
0621L_PLAY_WOSMapRegionFeedSpike_v1.0.0_PATCH
0621M_PLAY_MapRegionFeedSourceSelectorPatch_v1.0.0_PATCH
```

### `PLAY_DECISIONS.md`

Must include decisions:

- Playlist source groups isolate automatic fill/regeneration.
- Manual cross-group movement remains explicit.
- Scheduler is now the timing authority.
- One shared live time source drives schedule-aware surfaces.
- Smart Grid regions route by `region.regionType`, not label text.
- Technical grid labels yield to user-facing content labels.
- WOS/map content must enter through Smart Grid regions, not as a new permanent HUD layer.
- Map feed source is typed and default-safe.

### `PLAY_DO_NOT_REOPEN.md`

Must include:

- Do not restore default FlowCurveCanvas to Broadcast HUD.
- Do not restore permanent queue rail.
- Do not restore large persistent HUD header.
- Do not make the map feed permanent or live by default.
- Do not route grid content by visible label text.
- Do not let auto-fill/regenerate pull across source groups unless explicitly allowed.
- Do not split scheduler time into multiple independent clocks.
- Do not move existing 0621x reports midstream unless performing a full report hierarchy cleanup.

### `PLAY_SOURCE_INDEX.md`

Must map current important files:

```text
src/data/scheduleTypes.ts
src/data/smartGridTypes.ts
src/data/playlistTypes.ts
src/data/playProjectStorage.ts
src/logic/scheduleResolver.ts
src/logic/smartGridResolver.ts
src/logic/sourceEligibility.ts
src/ui/SchedulerGuideView.tsx
src/ui/BroadcastGridLayer.tsx
src/ui/BroadcastHudShell.tsx
src/ui/HudOperatorControls.tsx
src/ui/MapRegionFeed.tsx
src/ui/mapRegionFeedConfig.ts
src/App.tsx
```

Include completion reports for 0621E–0621M where known. If exact report paths are not known, mark them as:

```text
REPORTS/ root — exact filename to verify from repo.
```

---

## 3. Archived Rollup

Create or update an archived rollup:

```text
PLAY/REPORTS/rollups/2026-06-21_PLAY_CONTINUITY_ROLLUP.md
```

or create a new one if the previous 0621 rollup should remain immutable:

```text
PLAY/REPORTS/rollups/2026-06-21_to_2026-06-22_PLAY_CONTINUITY_ROLLUP.md
```

Preferred rule:

```text
Do not overwrite an archived rollup unless this workflow already treats it as mutable.
Create a new dated rollup if unsure.
```

The rollup should summarize:

- 0621E–0621M added after the previous rollup.
- Current architecture model.
- Stable decisions.
- Deferred items.
- Next recommended work.

---

# Required Current Architecture Language

Use this language directly in the README and current files:

```text
PLAY is now a programmable music channel system.

PLAYLIST creates trusted program blocks.
SCHEDULER places those blocks on a live TV-guide timeline.
SMART GRID routes visual content into schedule-aware regions.
BROADCAST HUD presents the result as a clean OBS-friendly output surface.
```

---

# Source Group Isolation Summary

Include this summary:

```text
Each playlist owns a source group. Automatic Fill Missing Time, Regenerate From Curve, Fill Gap, and flow-curve assignment should only pull from the active playlist's source group unless cross-group autofill is explicitly allowed. Manual drag/add remains an explicit user action.
```

---

# Scheduler Summary

Include this summary:

```text
The Scheduler turns playlists into timed program blocks. It provides a TV-guide-like view with Now / Next / Later and persists schedule state inside the project. A shared live schedule clock updates the Scheduler, Broadcast HUD upcoming buffet, and Smart Grid composition automatically.
```

---

# Smart Grid Summary

Include this summary:

```text
The Smart Grid is a schedule-aware broadcast compositor. It is off by default and toggled with the grid control. It can reserve regions for schedule previews, bumper/program cards, map placeholders, program lines, and atmosphere. Content is routed by region type, not label text.
```

---

# Map / WOS Feed Summary

Include this summary:

```text
WOS/map content is not live-integrated yet. The Smart Grid has a typed map feed source contract: none, mock, snapshot, iframe, live_wos. The shipped default is none. Mock proves the host can render map-like content safely. Unsupported sources fall back to a placeholder.
```

---

# Deferred Items

Mark these as deferred, not missing:

- Live WOS / Mapbox integration.
- WOS iframe integration.
- Map controls.
- Schedule recurrence.
- Multi-day calendar.
- Drag-resize schedule blocks.
- Drag-resize Smart Grid regions.
- Full report hierarchy cleanup.
- Dead `.hud-header*` CSS pruning.

---

# Acceptance Criteria

This documentation patch is complete when:

1. README reflects the triad: Playlist Builder / Scheduler / Smart Grid.
2. README no longer frames Broadcast HUD as the primary product.
3. README states the current map/WOS feed contract honestly.
4. Current source pack files include 0621E–0621M.
5. Decisions and Do Not Reopen files preserve the current architecture locks.
6. Source index identifies current data, logic, UI, and config files.
7. Archived rollup captures the post-0621M state.
8. No docs claim live WOS / Mapbox integration exists.
9. No docs claim the grid is permanent by default.
10. No docs encourage restoring chart-led Broadcast HUD behavior.

---

# Testing Checklist

Manual review only:

- Search docs for `FlowCurveCanvas` and confirm it is editor-only unless described as optional/operator mode.
- Search docs for `queue rail` and confirm it is not described as permanent default HUD UI.
- Search docs for `Mapbox`, `WOS`, `live_wos`, and confirm all live integrations are marked future/deferred.
- Search docs for `Scheduler` and confirm it is described as the timing authority.
- Search docs for `Smart Grid` and confirm it is described as a compositor, not decoration.
- Confirm exact build IDs 0621E–0621M appear in build status/source index.

---

# Implementation Guide

- **Where:** Update `PLAYLIST_README`, `PLAY/CURRENT/PLAY_CURRENT.md`, `PLAY/CURRENT/PLAY_BUILD_STATUS.md`, `PLAY/CURRENT/PLAY_DECISIONS.md`, `PLAY/CURRENT/PLAY_DO_NOT_REOPEN.md`, `PLAY/CURRENT/PLAY_SOURCE_INDEX.md`, and the current rollup file or a new dated rollup.
- **What:** Replace HUD-centered language with the current architecture: Playlist Builder → Scheduler → Smart Grid → Broadcast HUD, and record 0621E–0621M as completed PASS builds.
- **Expect:** Future Claude/Codex/ChatGPT sessions understand PLAY as a programmable music channel system with source-isolated playlists, live scheduler, schedule-aware Smart Grid, and typed but non-live WOS/map feed sources.
