# 0621J_PLAY_SchedulePreviewRegionContentPatch_v1.0.0_PATCH

## Project

PLAY — Playlist Scheduler / Smart Grid / Broadcast HUD

## Patch Type

PATCH

## Status

Ready for implementation

## Purpose

Populate the Smart Grid schedule-preview region with useful schedule information when the active grid composition requests it.

0621G created the Scheduler / TV-guide foundation. 0621H made the Smart Grid schedule-aware. 0621I added a shared live clock so Scheduler, HUD, and Smart Grid advance automatically. 0621J connects those pieces visually by allowing the Smart Grid to display a compact, non-interactive schedule preview inside designated grid regions.

The goal is not to add another permanent HUD menu. The goal is to make scheduled programming visible when the Smart Grid layout calls for it.

```text
Scheduler decides what is coming.
Smart Grid decides where it appears.
Broadcast HUD remains the output surface.
```

---

## Current State

Completed and trusted:

- 0621C — playlist persistence reload regression fixed.
- 0621D — Broadcast HUD stage cleared.
- 0621E — source-group isolation implemented.
- 0621F — malformed slot warning crash hardened.
- 0621G — Scheduler / TV-guide foundation added.
- 0621H — Smart Grid became schedule-aware.
- 0621I — shared live schedule clock added.

Current limitation:

- Smart Grid can draw schedule-aware regions, but those regions are still mostly structure only.
- `schedule_preview` / guide-preview regions do not yet display meaningful Now / Next / Later content.

---

## Product Rule

```text
Smart Grid regions may display lightweight broadcast information only when the active composition asks for it.
```

Do not reintroduce permanent HUD clutter.

Do not make the schedule preview a replacement for the Scheduler editor view.

---

## Scope

### Include

- Render compact schedule-preview content inside Smart Grid regions.
- Use live `ResolvedSchedule` from 0621I.
- Show:
  - Now
  - Next
  - Later, limited to 1–3 items
  - playlist/program title
  - scheduled start time
  - optional role/display label
- Keep schedule preview non-interactive in Broadcast HUD.
- Keep grid off by default and `⊞`-gated.
- Keep secondary cards independent.
- Preserve existing Smart Grid region outlines and technical labels.

### Exclude

- No drag-resize.
- No recurrence.
- No full calendar UI.
- No live WOS/map integration.
- No playlist generation changes.
- No persistence changes unless a small type addition requires safe optional handling.
- No Broadcast HUD layout restructuring.

---

## Required Behavior

### 1. Pass Schedule Data Into Smart Grid

`BroadcastGridLayer` should receive enough schedule data to render preview content.

Expected prop shape can be direct or wrapped:

```ts
import type { ResolvedSchedule } from "../data/scheduleTypes";
import type { SmartGridComposition } from "../data/smartGridTypes";

type BroadcastGridLayerProps = {
  composition: SmartGridComposition;
  resolvedSchedule: ResolvedSchedule;
};
```

If a narrower prop is preferred, pass only the schedule preview items derived from `ResolvedSchedule`.

---

### 2. Render Content Only In Schedule Preview Regions

Only regions with a schedule-oriented type should render Now / Next / Later content.

Examples:

```ts
type SmartGridRegionType =
  | "wos_map"
  | "schedule_preview"
  | "bumper"
  | "lower_third"
  | "safe_area"
  | "technical";
```

If the current implementation uses different names, follow the shipped 0621H names exactly. Do not rename existing field names just to match this spec.

---

### 3. Preview Content Hierarchy

Recommended compact display:

```text
NOW
A Playlist for Nappers
12:00 PM — 1:20 PM

NEXT
Robot Blips & Quips
1:20 PM

LATER
Night Signal
3:00 PM
```

Keep the content readable and sparse.

Do not include the full playlist track list.

---

### 4. Live Updating

The preview must update through the existing 0621I live clock chain.

Do not create a second timer inside `BroadcastGridLayer`.

Required rule:

```text
One shared schedule clock controls Scheduler, HUD, and Smart Grid.
```

---

### 5. Empty Schedule Fallback

If no schedule blocks exist:

```text
NO SCHEDULE
Add blocks in Scheduler
```

If there is no current block but future blocks exist:

```text
STANDBY
Next: <title>
<start time>
```

If current block exists but no next block:

```text
NOW
<title>
No upcoming block
```

---

## Display Rules

- Text should be small, clean, and broadcast-safe.
- Avoid large opaque panels that block the atmosphere surface.
- Use transparent / glass / outline treatment consistent with current Smart Grid styling.
- Do not animate aggressively.
- Do not overlap the bottom playback row.
- Do not create scrollbars in Broadcast HUD.
- Use truncation for long playlist names.

---

## Suggested Helpers

### `formatScheduleTime`

Use existing formatting if already available. Otherwise add a small helper:

```ts
export function formatScheduleTime(valueIso: string): string {
  const date = new Date(valueIso);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
```

### `buildSchedulePreviewItems`

Optional helper:

```ts
export type SchedulePreviewItem = {
  label: "NOW" | "NEXT" | "LATER";
  title: string;
  startTimeLabel: string;
  endTimeLabel?: string;
  roleLabel?: string;
};
```

This keeps `BroadcastGridLayer` from becoming a God component.

---

## Acceptance Criteria

1. Smart Grid still defaults to off.
2. Turning grid on still shows the existing grid/regions.
3. If the active composition includes a schedule-preview region, it displays compact schedule content.
4. Preview content uses live `ResolvedSchedule` from 0621I.
5. Now / Next / Later update automatically on the next shared clock tick.
6. Empty schedule does not crash.
7. Missing/malformed schedule block data does not crash.
8. Secondary cards still work independently.
9. HUD stage clearance from 0621D remains intact.
10. Source-group isolation from 0621E remains untouched.
11. TypeScript is clean.
12. No console errors during normal use.

---

## Test Plan

### Test 1 — Empty Schedule

1. Clear schedule blocks.
2. Open Broadcast HUD.
3. Toggle grid on.
4. Confirm no crash.
5. Confirm fallback copy appears only if a schedule-preview region exists.

Expected:

```text
NO SCHEDULE
Add blocks in Scheduler
```

### Test 2 — Now / Next / Later

1. Add three schedule blocks.
2. Ensure current time falls inside block 1.
3. Toggle grid on.
4. Use a composition that creates a schedule-preview region.

Expected:

- NOW shows block 1.
- NEXT shows block 2.
- LATER shows block 3.

### Test 3 — Live Rollover

1. Create block A ending within roughly 30 seconds.
2. Create block B immediately after.
3. Open Broadcast HUD with grid on.
4. Wait for the 0621I tick.

Expected:

- NOW moves from A to B without interaction.
- Preview content updates without a second timer.

### Test 4 — Secondary Card Independence

1. Toggle a secondary mode such as `upcoming_buffet`.
2. Toggle Smart Grid on.
3. Confirm secondary card and grid preview can coexist without sharing state.
4. Confirm secondary auto-dismiss still works.

### Test 5 — Build

Run:

```bash
npm run build
```

Expected:

```text
TypeScript clean.
No build errors.
```

---

## Do Not Reopen

- Do not bring back the permanent queue rail.
- Do not bring back the large HUD header row.
- Do not show FlowCurveCanvas by default in Broadcast HUD.
- Do not make schedule preview always visible.
- Do not build full WOS integration in this patch.
- Do not build drag-resize grid authoring in this patch.

---

## Implementation Guide

- **Where:** Update `BroadcastGridLayer`, Smart Grid region rendering, schedule formatting helpers, and the App-to-HUD prop wiring that already carries `gridComposition` / `resolvedSchedule`.
- **What:** Render compact Now / Next / Later content inside schedule-preview regions only, using the live 0621I `ResolvedSchedule`; keep the grid off-by-default and non-interactive.
- **Expect:** When the Smart Grid composition calls for a guide/schedule preview, the Broadcast HUD can show lightweight TV-guide information inside the grid without reintroducing HUD clutter.
