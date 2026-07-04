# 0621K_PLAY_WOSMapRegionPlaceholderAndGridContentRoutingPatch_v1.0.0_PATCH

## Project

PLAY — Playlist / Scheduler / Smart Grid Broadcast System

## Patch Type

Hot-path feature foundation patch

## Status

Draft for implementation

## Purpose

0621K turns the Smart Grid from a schedule-aware outline system into a simple content-routing compositor.

The Smart Grid should begin deciding what kind of content belongs inside each region type without integrating live WOS / Mapbox yet.

Current system lock:

```text
PLAYLIST  = creates trusted program blocks
SCHEDULER = resolves Now / Next / Later live
SMART GRID = places schedule-aware content into regions
HUD       = remains the clean output surface
```

0621K adds the next rule:

```text
Smart Grid regions route content by region type.
```

## Product Rule

```text
Scheduler decides what should be shown.
Smart Grid decides where/how it appears.
Region type decides what kind of content renderer is allowed.
```

## Background

0621H made `BroadcastGridLayer` schedule-aware and added region outlines for five composition presets.

0621J populated the `schedule_preview` region with live TV-guide content from the resolved schedule.

0621K should generalize that pattern so future region types can receive appropriate content without hard-coding everything into one branch.

## Primary Goal

Add a small region-content routing layer inside the Smart Grid.

Required mappings:

```text
schedule_preview → schedule preview content
map_channel      → WOS / map placeholder content
bumper_card      → playlist / program card placeholder content
full_scene       → no extra region content; atmosphere remains dominant
lower_third      → reserved / minimal content only
```

## Non-Goals

Do not implement:

- live WOS integration
- Mapbox rendering
- map controls
- drag / resize grid editing
- persistent grid layout editor
- new schedule recurrence
- playlist generation changes
- source-group logic changes
- Broadcast HUD layout changes
- permanent grid visibility

## Files Likely Touched

```text
src/ui/BroadcastGridLayer.tsx
src/data/smartGridTypes.ts
src/logic/smartGridResolver.ts
src/App.tsx
src/styles.css
```

Optional, if keeping renderers modular:

```text
src/ui/smartGrid/SmartGridRegionContent.tsx
src/ui/smartGrid/SchedulePreviewRegionContent.tsx
src/ui/smartGrid/MapPlaceholderRegionContent.tsx
src/ui/smartGrid/BumperCardRegionContent.tsx
```

## Data / Type Requirements

If needed, extend `SmartGridRegion` with stable content-oriented fields without breaking existing regions.

Suggested shape:

```ts
export type SmartGridRegionType =
  | "atmosphere"
  | "schedule_preview"
  | "map_channel"
  | "bumper_card"
  | "lower_third"
  | "technical";

export type SmartGridRegion = {
  regionId: string;
  type: SmartGridRegionType;
  label: string;
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
  priority?: number;
};
```

Keep any existing field names from the implemented code. Do not rename fields just to match this example.

## Content Routing Requirements

Create a single routing function/component, such as:

```ts
function renderRegionContent(region: SmartGridRegion): React.ReactNode;
```

or:

```tsx
<SmartGridRegionContent
  region={region}
  resolvedSchedule={resolvedSchedule}
  activePlaylist={activePlaylist}
  activeBlock={resolvedSchedule.now}
  nextBlock={resolvedSchedule.next}
/>
```

The router should switch on `region.type`, not on label text.

## Required Region Behaviors

### 1. `schedule_preview`

Use existing 0621J behavior.

Show compact live guide content:

```text
NOW   Playlist Title    9:51–11:11 AM
NEXT  Robot Blips       11:11 AM
LATER Night Signal      1:11 PM
```

Rules:

- Preserve `buildSchedulePreviewItems` behavior.
- Keep `laterLimit` compact.
- Keep `pointer-events: none`.
- Suppress technical SVG labels where content labels already exist.

### 2. `map_channel`

Render a non-live WOS / map placeholder inside the region.

Suggested copy:

```text
WOS / MAP
spatial feed placeholder
```

Optional microcopy:

```text
awaiting live world source
```

Rules:

- This is only a placeholder.
- Do not instantiate Mapbox.
- Do not fetch WOS data.
- Do not add controls.
- Keep it subtle, technical, and non-dominant.
- The placeholder should prove the region can host a future map feed.

### 3. `bumper_card`

Render a simple playlist/program card placeholder.

Content should prefer the active schedule block, then active playlist fallback.

Suggested display:

```text
PROGRAM
A Playlist for Nappers
soft / ambient / 1h 20m
```

Rules:

- Use existing playlist/block data only.
- Do not reintroduce the removed large HUD header.
- Do not show permanent cover art unless already safe and subtle.
- Keep this as a region-specific placeholder, not a new global HUD card.

### 4. `full_scene`

Render no extra content.

Rules:

- Full-bleed atmosphere remains dominant.
- No region outline if current implementation already uses zero regions for default full scene.
- Do not add new text.

### 5. `lower_third`

Reserve for future use or render a very small placeholder only if needed.

Rules:

- Do not duplicate the existing bottom playback/program line.
- Avoid clutter.
- It may remain outline-only in 0621K.

## Visual Requirements

The Smart Grid must remain:

- off by default
- toggled by `⊞`
- `pointer-events: none`
- subtle
- behind or below critical HUD readability
- compatible with the cleared 0621D stage

Technical labels should yield to user-facing region content.

```text
If a region renders user-facing content, suppress or soften the technical label for that region.
```

## Acceptance Criteria

0621K is complete when:

1. Grid still defaults off.
2. `⊞` toggles the grid on/off.
3. Existing `schedule_preview` content from 0621J still works.
4. `map_channel` regions render a WOS / map placeholder.
5. `bumper_card` regions render a playlist/program placeholder.
6. `full_scene` remains atmosphere-dominant with no extra clutter.
7. Technical labels do not collide with user-facing content.
8. All region content is `pointer-events: none`.
9. Broadcast HUD stage clearance from 0621D remains intact.
10. Scheduler live clock from 0621I still advances grid content.
11. Persistence from 0621C remains stable.
12. Source-group isolation from 0621E remains untouched.
13. TypeScript build passes.
14. No console errors.

## Manual Verification Checklist

Test these scenarios:

```text
1. No schedule / default display
   - Grid on → full_scene remains clean.

2. Active block displayMode = map_channel
   - Grid on → WOS / MAP placeholder appears in map region.

3. Active block role = bumper
   - Grid on → bumper/program card placeholder appears.

4. Active block displayMode = grid / guide_preview
   - Grid on → schedule preview content appears.

5. Secondary cards
   - Cycle secondary cards while grid is on.
   - Confirm secondary cards and grid content do not fight.

6. Reload
   - Schedule and grid behavior survive reload.
```

## Risks

### Risk: HUD clutter returns

Mitigation:

- Keep grid off by default.
- Keep content sparse.
- Do not add global widgets.

### Risk: content routing becomes a God component

Mitigation:

- Use one small router.
- Extract renderers only if the file becomes hard to read.

### Risk: placeholder feels like fake functionality

Mitigation:

- Label WOS/map clearly as placeholder.
- Do not imply live map integration exists yet.

## Completion Report Requirement

Create a completion report:

```text
REPORTS/2026-06-21_PLAY_0621K_WOSMapRegionPlaceholderAndGridContentRouting_COMPLETION_REPORT.md
```

Include:

- files changed
- region routing behavior
- scenarios verified
- confirmation that live WOS was not integrated
- TypeScript result
- console status
- any follow-up recommendations

## Likely Next Patch

After 0621K, the next logical patch may be one of:

```text
0621L_PLAY_SmartGridWOSMapFeedIntegrationSpike_v1.0.0_PATCH
0621L_PLAY_SchedulerBlockEditingRefinementPatch_v1.0.0_PATCH
0621L_PLAY_BroadcastGuideModeLayoutRefinementPatch_v1.0.0_PATCH
```

Choose based on whether the next pressure is visual integration, scheduler usability, or broadcast guide readability.

## Implementation Guide

- **Where:** Start in `BroadcastGridLayer`; add or extract a region-content router. Reuse existing schedule preview helpers from `scheduleResolver.ts`. Update `smartGridTypes.ts` only if region typing needs clarity.
- **What:** Route content by `region.type`: preserve schedule preview, add WOS/map placeholder for `map_channel`, add program card placeholder for `bumper_card`, and keep full-scene/lower-third minimal.
- **Expect:** Smart Grid becomes a reusable compositor with content-specific regions while staying off-by-default, subtle, non-interactive, and ready for future WOS/map integration.
