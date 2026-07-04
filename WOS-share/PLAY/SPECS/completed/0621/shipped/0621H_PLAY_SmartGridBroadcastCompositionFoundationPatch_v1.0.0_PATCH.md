# 0621H_PLAY_SmartGridBroadcastCompositionFoundationPatch_v1.0.0_PATCH

## Project

**PLAY — Smart Grid Broadcast Composition Foundation**

## Build ID

`0621H_PLAY_SmartGridBroadcastCompositionFoundationPatch_v1.0.0_PATCH`

## Status

Draft patch spec for implementation.

---

## Purpose

Turn the existing `BroadcastGridLayer` from a passive visual overlay into the first **schedule-aware broadcast composition layer**.

This patch should connect three now-established systems:

```text
PLAYLIST  = creates playlist/program blocks
SCHEDULER = places playlist/program blocks on a clock
SMART GRID = decides how active/upcoming blocks appear on screen
```

The Smart Grid should not become a full visual editor yet. This is a foundation patch: it reads the active and upcoming scheduled blocks, chooses a simple layout preset, and presents subtle grid-aware regions without disrupting the cleared Broadcast HUD surface.

---

## Product Rule

```text
Scheduler decides what should be shown.
Smart Grid decides where/how it appears.
Broadcast HUD remains the output surface.
```

---

## Current Context

### Recently Completed

- `0621C` restored playlist persistence and added hydration/autosave guards.
- `0621D` cleared the Broadcast HUD stage into one compact top row, full-bleed atmosphere, and bottom playback/program line.
- `0621E` added source-group isolation so playlists do not auto-contaminate each other.
- `0621F` hardened malformed slot warning data.
- `0621G` added the first Scheduler / TV Guide layer with schedule blocks, `now / next / later`, persistence, overlap marking, and HUD upcoming-buffet integration.

### Existing Grid State

`BroadcastGridLayer` currently exists as a passive SVG overlay:

- 4×6 default grid
- registration crosshairs at intersections
- corner brackets
- `pointer-events: none`
- off by default
- toggled by `⊞`

This patch should preserve that restraint while giving the grid semantic layout intelligence.

---

## Problem

The Smart Grid currently has visual presence but no programming awareness.

It does not yet know:

- what schedule block is active
- what schedule block is next
- whether the active block is a main block, bumper, event, replay, or interruption
- whether the block should appear as full scene, overlay, grid, or map channel
- which screen regions should be reserved for playlist world, WOS/map, guide preview, or upcoming cards

Without this connection, the grid is decorative. With scheduler awareness, it becomes the first real broadcast compositor.

---

## Goals

1. Make Smart Grid read the resolved schedule state.
2. Add grid layout presets based on `ScheduleBlock.displayMode` and `ScheduleBlock.scheduleRole`.
3. Keep the current grid subtle and non-interactive.
4. Preserve Broadcast HUD stage clearance.
5. Prepare future WOS/map integration by defining placeholder regions.
6. Avoid full drag/resize/layout editing.
7. Avoid deep WOS runtime integration in this patch.

---

## Non-Goals

Do **not** build:

- drag-to-resize grid regions
- custom visual editor
- recurring schedule logic
- multi-day scheduler
- live WOS map integration
- OBS scene switching
- user-authored grid templates
- animation timeline editor
- complex PIP choreography
- default permanent guide overlay
- any return of the old HUD header, queue rail, or chart-dominant surface

---

## Required Inputs

Use the 0621G scheduler outputs where available:

```ts
type ResolvedSchedule = {
  now?: ScheduleBlock;
  next?: ScheduleBlock;
  later: ScheduleBlock[];
  conflicts: ScheduleConflict[];
};
```

Use existing schedule block properties:

```ts
type ScheduleBlock = {
  blockId: string;
  playlistId: string;
  title: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  scheduleRole: ScheduleRole;
  displayMode: ScheduleDisplayMode;
};
```

Exact field names should follow the implemented `scheduleTypes.ts` from 0621G.

---

## Proposed Display Modes

Use existing display modes if already implemented. If the exact enum differs, map to the closest current values.

| Display Mode | Smart Grid Meaning |
|---|---|
| `full_scene` | Playlist/background owns full surface. Minimal grid only. |
| `overlay` | Atmosphere remains dominant; small lower/side info regions are available. |
| `grid` | Grid composition becomes visibly active with multiple reserved regions. |
| `map_channel` | Reserve a major region for WOS/map placeholder or future map feed. |

---

## Proposed Schedule Roles

Use role to influence presentation tone.

| Role | Smart Grid Behavior |
|---|---|
| `main_block` | Keep background dominant; minimal overlays. |
| `bumper` | Allow centered or side card region. |
| `interruption` | Permit stronger temporary card/panel region. |
| `replay` | Add subtle archive/replay treatment if easy. |
| `event` | Allow upcoming/event emphasis region. |

Do not over-style these yet. Use classes/data attributes so later patches can refine design.

---

## Required Layout Presets

Add a small grid preset resolver.

### `full_scene`

Default mood-first presentation.

```text
┌────────────────────────────┐
│                            │
│        atmosphere           │
│                            │
│                            │
└────────────────────────────┘
```

Rules:

- Full-bleed background remains dominant.
- Grid overlay may remain subtle if toggled.
- No extra permanent panels.

### `lower_third`

Reserved bottom information lane.

```text
┌────────────────────────────┐
│                            │
│        atmosphere           │
│                            │
├────────────────────────────┤
│ lower third / program line  │
└────────────────────────────┘
```

Rules:

- Should respect the existing bottom playback/program line.
- Do not duplicate bottom content unless explicitly needed.

### `guide_preview`

Small schedule preview region.

```text
┌────────────────────────────┐
│ atmosphere                  │
│                  ┌───────┐ │
│                  │ next  │ │
│                  │ block │ │
│                  └───────┘ │
└────────────────────────────┘
```

Rules:

- Useful before transitions or when `next` exists.
- Should not become a permanent queue rail.

### `map_channel`

Prepare a major WOS/map region.

```text
┌────────────────────────────┐
│ ┌──────────────────────┐   │
│ │ WOS / map placeholder │   │
│ └──────────────────────┘   │
│ playlist/world info         │
└────────────────────────────┘
```

Rules:

- Do not integrate live WOS yet.
- Show only a subtle placeholder/region if necessary.
- Keep `pointer-events: none`.

### `bumper_card`

Temporary program transition card region.

```text
┌────────────────────────────┐
│                            │
│        ┌──────────┐        │
│        │ bumper   │        │
│        │ card     │        │
│        └──────────┘        │
│                            │
└────────────────────────────┘
```

Rules:

- May be used for `bumper`, `event`, or transition role.
- Should be temporary or passive; do not create a permanent card system here.

---

## Data / Logic Requirements

### Add Grid Types

Create or extend a grid type file if useful:

```text
src/data/smartGridTypes.ts
```

Suggested types:

```ts
export type SmartGridPreset =
  | "full_scene"
  | "lower_third"
  | "guide_preview"
  | "map_channel"
  | "bumper_card";

export type SmartGridRegionType =
  | "atmosphere"
  | "program_line"
  | "schedule_preview"
  | "map_placeholder"
  | "bumper_card";

export type SmartGridRegion = {
  regionId: string;
  regionType: SmartGridRegionType;
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
  label?: string;
};

export type SmartGridComposition = {
  preset: SmartGridPreset;
  columns: number;
  rows: number;
  regions: SmartGridRegion[];
  activeBlockId?: string;
  nextBlockId?: string;
};
```

Keep this lightweight. Avoid building a full layout engine.

### Add Preset Resolver

Create:

```text
src/logic/smartGridResolver.ts
```

Expected API:

```ts
export function resolveSmartGridComposition(params: {
  resolvedSchedule?: ResolvedSchedule;
  columns?: number;
  rows?: number;
}): SmartGridComposition;
```

Resolver behavior:

1. Default to `full_scene` if no schedule is available.
2. Prefer the active block’s `displayMode`.
3. Use the next block to expose a `guide_preview` region only when useful.
4. Map `map_channel` display mode to `map_channel` preset.
5. Map `bumper` role to `bumper_card` preset when active.
6. Never throw on malformed schedule input.

Suggested mapping:

| Input | Preset |
|---|---|
| no active block | `full_scene` |
| active displayMode `full_scene` | `full_scene` |
| active displayMode `overlay` | `lower_third` |
| active displayMode `grid` | `guide_preview` or `bumper_card` depending role |
| active displayMode `map_channel` | `map_channel` |
| active role `bumper` | `bumper_card` |
| active role `event` | `guide_preview` or `bumper_card` |

Keep this conservative.

---

## UI Requirements

### BroadcastGridLayer

Update `BroadcastGridLayer` to accept an optional composition prop:

```ts
composition?: SmartGridComposition;
```

Render:

- existing grid lines/crosshairs/brackets
- optional region outlines only when grid is toggled on
- optional region labels in tiny technical text

Do not render large cards here. The grid layer should show composition regions, not duplicate content owned by secondary cards or bottom row.

### BroadcastHudShell

Pass schedule-aware composition into `BroadcastGridLayer` if available.

Rules:

- HUD layout from 0621D must stay intact.
- Secondary cards from 0621B must stay independent.
- Grid toggle from 0621A must continue to control visibility.
- Grid remains `pointer-events: none`.

### SchedulerGuideView

No major change required. Only expose enough resolved schedule state upward if not already available.

### App Wiring

App should already resolve schedule for Scheduler/HUD after 0621G. Reuse that output.

If no shared resolved schedule exists, compute it once at the App level and pass down as needed.

---

## Visual Rules

Use subtle system language:

- thin region outlines
- low-opacity grid boundaries
- small labels
- no heavy widgets
- no bright blocks unless active/armed state requires it
- no permanent schedule guide overlay in HUD

The Smart Grid should feel like an underlying broadcast layout system, not a new menu.

---

## Acceptance Criteria

1. `BroadcastGridLayer` still works as a passive overlay when toggled.
2. A schedule-aware composition is resolved from active/next schedule blocks.
3. Active `displayMode` influences the selected grid preset.
4. Active `scheduleRole` can influence bumper/event treatment.
5. `map_channel` display mode produces a visible map/WOS placeholder region when grid is shown.
6. `full_scene` remains the default and least invasive layout.
7. `upcoming_buffet` and secondary cards remain independent.
8. Broadcast HUD stage clearance from 0621D remains intact.
9. Playlist persistence from 0621C remains intact.
10. Source-group isolation from 0621E remains intact.
11. Schedule state from 0621G remains persisted and valid after reload.
12. TypeScript build passes.
13. No console errors during normal editor, scheduler, or HUD use.

---

## Manual Test Plan

### Test 1 — Default No Schedule

1. Clear or load a project with no scheduled blocks.
2. Open Broadcast HUD.
3. Toggle grid on.
4. Confirm default passive grid appears.
5. Confirm no crash and no extra panels.

Expected:

```text
Grid = full_scene composition; atmosphere remains dominant.
```

### Test 2 — Main Block Full Scene

1. Schedule a playlist block with `displayMode = full_scene` and role `main_block`.
2. Open Broadcast HUD during the block.
3. Toggle grid on.

Expected:

```text
Grid remains subtle; no permanent card appears.
```

### Test 3 — Map Channel Placeholder

1. Schedule a playlist block with `displayMode = map_channel`.
2. Open Broadcast HUD during the block.
3. Toggle grid on.

Expected:

```text
Grid shows a reserved WOS/map placeholder region without integrating live WOS.
```

### Test 4 — Bumper Role

1. Schedule an active block with role `bumper`.
2. Open Broadcast HUD.
3. Toggle grid on.

Expected:

```text
Grid composition marks a bumper-card region; no permanent card content is forced.
```

### Test 5 — Persistence Safety

1. Add schedule blocks.
2. Toggle grid.
3. Reload browser.
4. Confirm playlists, schedule, and grid behavior remain stable.

Expected:

```text
No data loss, no empty overwrite, no malformed slot crash.
```

---

## Risks

| Risk | Mitigation |
|---|---|
| Grid starts competing with mood surface | Keep region rendering subtle and only visible when grid toggled. |
| Smart Grid duplicates secondary cards | Grid should show regions only, not content-heavy cards. |
| Scheduler logic leaks into HUD | Resolve composition in a helper, pass simple props. |
| WOS integration scope expands | Use placeholder region only. |
| Layout presets become too complex | Keep five presets max for this patch. |

---

## Do Not Reopen

Do not reopen these closed directions:

- Default FlowCurveCanvas in Broadcast HUD.
- Permanent queue rail.
- Large second HUD header row.
- Playlist cover as persistent HUD identity.
- Grid as part of `BroadcastSecondaryMode`.
- Cross-group auto-pull as default behavior.

---

## Completion Report Requirements

Write a completion report:

```text
PLAY/REPORTS/completion/2026-06-21_PLAY_0621H_SmartGridBroadcastCompositionFoundation_COMPLETION_REPORT.md
```

Include:

- files changed
- grid types/helpers added
- presets implemented
- scheduler fields used
- screenshots/tests performed
- persistence verification
- TypeScript result
- any deferred items

---

## Implementation Guide

- **Where:** Add `src/data/smartGridTypes.ts`, `src/logic/smartGridResolver.ts`, then update `BroadcastGridLayer`, `BroadcastHudShell`, and App-level schedule/HUD wiring.
- **What:** Resolve a `SmartGridComposition` from the active/next schedule block and render subtle grid regions based on preset, role, and display mode.
- **Expect:** The Smart Grid begins acting like a broadcast compositor: schedule-aware, subtle, non-interactive, and ready for future WOS/map/PIP integration without disturbing the cleared HUD surface.
