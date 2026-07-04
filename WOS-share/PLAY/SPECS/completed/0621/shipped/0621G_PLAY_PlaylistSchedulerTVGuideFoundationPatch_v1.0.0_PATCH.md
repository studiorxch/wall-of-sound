# 0621G_PLAY_PlaylistSchedulerTVGuideFoundationPatch_v1.0.0_PATCH

## Project

PLAY — Playlist / Broadcast / Scheduler System

## Patch Type

Foundation Patch

## Status

Draft for Claude / Codex implementation

## Purpose

Create the first playlist scheduler layer so PLAY can move from a playlist builder with Broadcast HUD into a programmable music channel system.

The scheduler should arrange playlist/program blocks over time and expose a simple TV-guide-style view for operator planning and viewer-facing upcoming-program logic.

This patch should not build a full calendar product yet. It should establish the minimum data, logic, and interface needed for:

```text
Playlist Builder → creates playlist/program blocks
Scheduler        → places playlist/program blocks on a clock
Smart Grid       → presents active/upcoming blocks visually
```

## Current Product Correction

Broadcast HUD is not the product center. It is one presentation state.

The larger system is:

```text
PLAYLIST = content/program block creation
SCHEDULER = timed channel structure
SMART GRID = broadcast visual composition
```

The scheduler is the missing middle layer between playlist creation and smart-grid presentation.

## Environmental Assumptions

- Runtime: local Vite + React + TypeScript app.
- Existing playlists persist through local project storage after 0621C.
- Existing playlist source-group isolation remains active after 0621E.
- Existing malformed slot defensive repair remains active after 0621F.
- Broadcast HUD stage-clearance remains active after 0621D.
- No backend is required.
- No external calendar API is required.
- Time can use local browser time for this first foundation patch.
- Schedule should persist inside existing PLAY project storage.

## Non-Negotiable Product Rule

```text
Playlist = content unit
Scheduler = time structure
Smart Grid = visual presentation engine
```

Do not make Broadcast HUD responsible for scheduling logic.

## Scope

### Included

- Add scheduler data types.
- Add schedule blocks tied to existing playlists.
- Add simple local schedule persistence inside the existing project model.
- Add schedule resolver logic for:
  - `now`
  - `next`
  - `later`
- Add a simple TV-guide-style scheduler view.
- Add schedule block creation from existing playlists.
- Add basic start/end/duration handling.
- Expose upcoming schedule blocks to Broadcast secondary layer logic where low-risk.
- Preserve existing Broadcast HUD layout and behavior.

### Excluded

- No full drag-to-resize calendar timeline yet.
- No recurring weekly schedule yet.
- No multi-day scheduler complexity yet.
- No cloud sync.
- No external calendar import/export.
- No advanced conflict resolver.
- No smart-grid layout authoring yet.
- No WOS map feed embedding yet.
- No playlist identity card polish unless directly needed for schedule blocks.

## Required Data Model

Create a small schedule type module.

Recommended file:

```text
src/data/scheduleTypes.ts
```

Recommended types:

```ts
export type ScheduleBlockRole =
  | "main_block"
  | "bumper"
  | "interruption"
  | "replay"
  | "event";

export type ScheduleDisplayMode =
  | "full_scene"
  | "overlay"
  | "grid"
  | "map_channel";

export type ScheduleBlock = {
  blockId: string;
  playlistId: string;
  title: string;
  startTimeIso: string;
  endTimeIso: string;
  durationMinutes: number;
  role: ScheduleBlockRole;
  displayMode: ScheduleDisplayMode;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleState = {
  scheduleId: string;
  title: string;
  blocks: ScheduleBlock[];
  timezone?: string;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedSchedule = {
  now: ScheduleBlock | null;
  next: ScheduleBlock | null;
  later: ScheduleBlock[];
};
```

## Project Model Update

Extend the existing project model with schedule state.

Recommended:

```ts
schedule?: ScheduleState;
```

Storage repair should backfill a default schedule if missing.

Default schedule:

```text
PLAY Schedule
blocks: []
```

Do not overwrite existing playlist data.

## Required Logic

Create a schedule resolver.

Recommended file:

```text
src/logic/scheduleResolver.ts
```

Expected API:

```ts
export function sortScheduleBlocks(blocks: ScheduleBlock[]): ScheduleBlock[];

export function resolveSchedule(params: {
  schedule: ScheduleState;
  nowIso?: string;
}): ResolvedSchedule;

export function createScheduleBlockFromPlaylist(params: {
  playlist: PlaylistRecord;
  startTimeIso: string;
  role?: ScheduleBlockRole;
  displayMode?: ScheduleDisplayMode;
}): ScheduleBlock;
```

### Resolver Rules

- `now` is the block where current time is between `startTimeIso` and `endTimeIso`.
- `next` is the first block after the current time.
- `later` is the next 3–6 future blocks after `next`.
- Expired blocks remain in the schedule view, but should not appear as `next`.
- Overlapping blocks may be allowed in this foundation patch, but they should be visually marked as conflicts.
- Invalid blocks should not crash the app.

## Duration Rules

When creating a schedule block from a playlist:

1. Prefer playlist target duration if available.
2. Otherwise use computed playlist slot/track duration.
3. Otherwise fallback to 60 minutes.
4. Calculate `endTimeIso` from `startTimeIso + durationMinutes`.

## UI Requirements

Create a simple TV-guide-style scheduler view.

Recommended file:

```text
src/ui/SchedulerGuideView.tsx
```

### View Requirements

Show:

- Schedule title.
- Current date/time reference.
- `Now` block.
- `Next` block.
- Later blocks.
- Playlist title per block.
- Start time.
- End time.
- Duration.
- Role.
- Display mode.
- Conflict warning if blocks overlap.

### Layout Direction

Basic table/grid is enough:

```text
┌────────┬────────┬──────────────────────┬────────────┬──────────────┐
│ Time   │ Dur    │ Playlist / Program   │ Role       │ Display Mode │
├────────┼────────┼──────────────────────┼────────────┼──────────────┤
│ 02:00  │ 2h     │ Code & Caffeine      │ main block │ full scene   │
│ 04:00  │ 1h 30m │ Static Horizon       │ main block │ grid         │
│ 05:30  │ 10m    │ Station ID           │ bumper     │ overlay      │
└────────┴────────┴──────────────────────┴────────────┴──────────────┘
```

## Navigation / Mode Access

Add a lightweight way to access Scheduler.

Recommended top mode structure:

```text
Flow-Curve | Scheduler | Broadcast HUD
```

Do not overbuild navigation.

## Schedule Creation Controls

Minimum controls:

- Select playlist.
- Add to schedule.
- Start time input.
- Role dropdown.
- Display mode dropdown.
- Remove schedule block.

Optional if low-risk:

- Duplicate block.
- Move block later/earlier by 30 minutes.

## Broadcast Secondary Layer Integration

Where low-risk, update `upcoming_buffet` so it can prefer scheduled future blocks over unscheduled playlist guesses.

Priority:

1. Scheduled future blocks from `resolveSchedule().later`.
2. Existing fallback from other playlists if no schedule exists.

Do not change the visual behavior of the secondary layer.

## Smart Grid Preparation

This patch should only prepare data for Smart Grid.

Do not build Smart Grid authoring yet.

Add enough structure so a future grid patch can read:

```text
active schedule block
next schedule block
block display mode
block role
```

## Storage / Migration Requirements

- Existing saved projects must load.
- Missing schedule field should be repaired to an empty schedule.
- Malformed schedule blocks should be ignored or repaired safely.
- Autosave should persist schedule edits.
- 0621C hydration guard must remain intact.
- 0621E source-group migration must remain intact.
- 0621F warning-message repair must remain intact.

## Conflict Handling

Foundation-level conflict handling only.

If blocks overlap:

- Do not crash.
- Do not auto-delete either block.
- Mark the affected rows with warning state.
- Show short message:

```text
Schedule overlap
```

Advanced conflict resolution can come later.

## Acceptance Criteria

This patch is complete when:

1. A schedule state exists in the project model.
2. Existing projects migrate safely with an empty schedule.
3. A playlist can be added to the schedule as a timed block.
4. Schedule blocks persist after browser reload.
5. Scheduler view shows timed playlist blocks.
6. Scheduler resolver returns `now`, `next`, and `later` correctly.
7. Future scheduled blocks can feed the Broadcast secondary upcoming logic when available.
8. Overlapping blocks are marked but do not crash.
9. Broadcast HUD visuals remain unchanged.
10. Source-group isolation remains unchanged.
11. TypeScript build passes.

## Manual Test Plan

### Test 1 — Empty Project Migration

```text
1. Load existing project without schedule field.
2. Confirm app does not crash.
3. Confirm Scheduler tab appears.
4. Confirm empty schedule state exists.
5. Reload browser.
6. Confirm schedule remains available.
```

### Test 2 — Add Playlist Block

```text
1. Select Code & Caffeine.
2. Add it to schedule at 2:00 PM.
3. Confirm block appears in Scheduler view.
4. Confirm duration/end time are calculated.
5. Reload browser.
6. Confirm block persists.
```

### Test 3 — Now / Next / Later

```text
1. Create three future blocks.
2. Set one block to cover current time.
3. Confirm resolver returns it as Now.
4. Confirm next block appears as Next.
5. Confirm remaining blocks appear as Later.
```

### Test 4 — Upcoming Buffet

```text
1. Create scheduled future blocks.
2. Enter Broadcast HUD.
3. Activate upcoming_buffet secondary mode.
4. Confirm scheduled blocks appear before unscheduled playlist fallback.
```

### Test 5 — Overlap Safety

```text
1. Create two overlapping blocks.
2. Confirm both remain visible.
3. Confirm overlap warning appears.
4. Confirm no crash.
```

## Do Not Change

- Do not bring back the large Broadcast HUD header.
- Do not bring back the permanent queue rail.
- Do not bring back default FlowCurveCanvas in Broadcast HUD.
- Do not change source-group eligibility rules.
- Do not change playlist regeneration behavior.
- Do not change warning scoring/severity.
- Do not prune dead HUD CSS in this patch.

## Expected Result

PLAY gains its first scheduler layer.

The app can now create playlists, place them onto a time guide, resolve what is now/next/later, and prepare those timed blocks for future Smart Grid presentation.

This moves PLAY closer to a programmable music channel system:

```text
Playlist Builder → Scheduler / TV Guide → Smart Grid Broadcast
```

## Implementation Guide

- **Where:** Add `src/data/scheduleTypes.ts`, `src/logic/scheduleResolver.ts`, `src/ui/SchedulerGuideView.tsx`; update project storage repair, App mode navigation, and Broadcast secondary upcoming data feed.
- **What:** Add schedule state, timed playlist blocks, `now/next/later` resolver, basic guide view, safe storage migration, and persistence.
- **Expect:** PLAY shows a TV-guide-style schedule where playlists become timed program blocks; scheduled upcoming blocks can inform Broadcast HUD without changing its cleared stage layout.
