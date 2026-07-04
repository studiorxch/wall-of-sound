# 0621I_PLAY_LiveScheduleClockAndAutoResolvePatch_v1.0.0_PATCH

## Project

**PLAY** — Playlist / Scheduler / Smart Grid broadcast system

## Patch Type

Hotfix / foundation patch

## Status

Draft for implementation

## Purpose

Add a lightweight live schedule clock so the Scheduler, Broadcast HUD, upcoming buffet, and Smart Grid composition automatically re-resolve as time passes.

0621G created the first TV-guide scheduler layer. 0621H made the Smart Grid schedule-aware. Both currently resolve correctly on render, but they do not advance on their own unless something else triggers a re-render.

This patch makes PLAY behave more like a live channel surface.

```text
PLAYLIST  = creates program blocks
SCHEDULER = resolves what is now / next / later
SMART GRID = presents the resolved schedule visually
LIVE CLOCK = keeps the system moving without operator interaction
```

## Problem

The Scheduler clock is currently static at render time.

That means:

- Now / Next / Later can become stale.
- The TV-guide view does not advance automatically.
- Broadcast HUD upcoming cards may not update when the scheduled block changes.
- Smart Grid composition may keep showing the previous block's preset until a user interaction causes re-render.

This is acceptable for foundation testing, but it is not acceptable for a channel-like broadcast system.

## Product Rule

```text
A scheduled broadcast system must advance itself over time.
```

The operator should not need to click the UI to refresh Now / Next state.

## Scope

### Included

- Add a shared live `now` state.
- Tick every 30–60 seconds.
- Re-run `resolveSchedule(schedule, now)` from the shared `now` value.
- Re-run `resolveSmartGridComposition(resolvedSchedule)` from the updated schedule resolution.
- Update Scheduler guide clock display automatically.
- Update Now / Next / Later pills automatically.
- Update Broadcast HUD `upcoming_buffet` source automatically.
- Update Smart Grid preset/regions automatically when the active scheduled block changes.
- Clean up the interval on unmount.
- Keep the interval lightweight and browser-safe.

### Excluded

- No recurrence.
- No multi-day scheduler logic.
- No drag/resize calendar editing.
- No live WOS/map integration.
- No changes to playlist generation.
- No changes to source-group isolation.
- No Broadcast HUD visual redesign.
- No timeline animation system.

## Required Behavior

### 1. Shared Clock State

`App` should own one live `now` value.

Recommended shape:

```ts
const [scheduleNow, setScheduleNow] = useState<Date>(() => new Date());
```

The clock should tick every 30 or 60 seconds.

Recommended default:

```ts
const SCHEDULE_CLOCK_TICK_MS = 30_000;
```

Reason: 30 seconds is responsive enough for schedule transitions without creating noisy render churn.

### 2. Interval Cleanup

The timer must be cleaned up on unmount.

```ts
useEffect(() => {
  const intervalId = window.setInterval(() => {
    setScheduleNow(new Date());
  }, SCHEDULE_CLOCK_TICK_MS);

  return () => window.clearInterval(intervalId);
}, []);
```

### 3. Resolver Inputs

All schedule-aware surfaces should use the same `scheduleNow` value.

```text
scheduleNow
  ↓
resolveSchedule(schedule, scheduleNow)
  ↓
resolvedSchedule
  ↓
resolveSmartGridComposition(resolvedSchedule)
```

Do not let each component call `new Date()` independently for its own schedule state.

### 4. Scheduler Guide

`SchedulerGuideView` should receive the current resolved time or the live `now` value as a prop.

It should update:

- visible clock
- Now card
- Next card
- Later list
- NOW/NEXT row pills
- overlap indicators should remain unchanged

### 5. Broadcast HUD

Broadcast HUD should keep its 0621D stage-cleared layout.

Only schedule-derived data should update:

- upcoming buffet content
- active/next scheduled block reference if shown
- smart-grid composition if the active block changes

Do not reintroduce permanent queue rails, chart overlays, or header bands.

### 6. Smart Grid

The Smart Grid should re-resolve when the active scheduled block changes.

Examples:

| Time State | Expected Smart Grid Result |
|---|---|
| No active block | `full_scene`, no intrusive regions |
| Active block uses `map_channel` | WOS/MAP placeholder region appears when grid is toggled on |
| Active block role is bumper | `bumper_card` preset wins over display mode |
| Active block ends and next block begins | Grid composition updates automatically on tick |

## Implementation Notes

### Recommended Files

```text
src/App.tsx
src/ui/SchedulerGuideView.tsx
src/logic/scheduleResolver.ts
src/logic/smartGridResolver.ts
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastSecondaryLayer.tsx
```

Not all files may require changes. Keep the patch tight.

### Suggested Constants

```ts
const SCHEDULE_CLOCK_TICK_MS = 30_000;
```

If constants already live in a shared config file, place it there. Otherwise keep it near the App-level clock logic.

### Resolver Safety

This patch should not make the resolver less defensive.

`resolveSchedule` must continue to:

- filter malformed blocks
- avoid crashes
- handle empty schedules
- return safe `now`, `next`, and `later` values

`resolveSmartGridComposition` must continue to:

- default to `full_scene`
- avoid throwing on malformed schedule data
- keep grid content passive and non-interactive

## Acceptance Criteria

1. Scheduler guide clock advances automatically without user interaction.
2. Now / Next state updates automatically when a schedule block boundary passes.
3. Broadcast HUD upcoming buffet updates from the live resolved schedule.
4. Smart Grid composition updates automatically when the active scheduled block changes.
5. Grid remains off by default and `⊞`-gated.
6. Broadcast HUD layout remains stage-cleared from 0621D.
7. 0621C persistence remains stable after reload.
8. 0621E source-group isolation remains untouched.
9. 0621F warning-message hardening remains untouched.
10. TypeScript build is clean.
11. No console errors during normal operation.

## Manual Test Plan

### Test 1 — Live Clock

1. Open Scheduler mode.
2. Confirm the clock is visible.
3. Wait at least 30–60 seconds.
4. Confirm clock updates without clicking anything.

### Test 2 — Now / Next Transition

1. Create a schedule block that starts within the next minute.
2. Create another block immediately after it.
3. Wait for the boundary to pass.
4. Confirm Now / Next updates automatically.

### Test 3 — Broadcast Upcoming Buffet

1. Create at least two upcoming scheduled blocks.
2. Switch to Broadcast HUD.
3. Open `upcoming_buffet`.
4. Confirm it uses scheduled future blocks.
5. Wait for schedule time to advance.
6. Confirm stale blocks fall away after the next tick.

### Test 4 — Smart Grid Re-Resolve

1. Schedule a current block with `displayMode: map_channel`.
2. Toggle grid on with `⊞`.
3. Confirm WOS/MAP placeholder region appears.
4. Let the block end and another block begin.
5. Confirm the grid preset updates without manual interaction.

### Test 5 — Reload Persistence

1. Create schedule blocks.
2. Reload the browser.
3. Confirm schedule persists.
4. Confirm live clock resumes ticking.
5. Confirm resolved schedule is correct after reload.

## Non-Goals

Do not use this patch to add:

- recurring blocks
- drag-to-resize scheduling
- schedule deletion UX polish
- WOS live map feed
- PIP content rendering
- advanced broadcast automation
- playlist identity card redesign

## Completion Report Requirements

Write completion report to the current established reports location unless the project report structure is reorganized separately.

Recommended filename:

```text
2026-06-21_PLAY_0621I_LiveScheduleClockAndAutoResolvePatch_COMPLETION_REPORT.md
```

Report must include:

- files changed
- tick interval used
- how `scheduleNow` is shared
- scheduler verification
- HUD buffet verification
- smart-grid re-resolve verification
- persistence check
- TypeScript result
- any console warnings/errors

## Implementation Guide

- **Where:** Start in `src/App.tsx`; pass shared live time into `resolveSchedule`, `SchedulerGuideView`, and Smart Grid composition wiring.
- **What:** Add a 30-second clock interval, re-resolve schedule/grid from the shared time value, and preserve the existing HUD/grid visual structure.
- **Expect:** Scheduler, Broadcast HUD upcoming cards, and Smart Grid composition update automatically as time passes without user interaction.
