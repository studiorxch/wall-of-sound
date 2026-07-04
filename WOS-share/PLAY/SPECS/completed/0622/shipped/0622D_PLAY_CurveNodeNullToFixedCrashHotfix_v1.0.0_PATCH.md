# 0622D_PLAY_CurveNodeNullToFixedCrashHotfix_v1.0.0_PATCH

## Project

PLAY — Flow Curve Playlist Builder

## Document Type

Patch Spec / Hotfix

## Version

v1.0.0

## Status

Ready for implementation

## Trigger

After the 0622C investigation path, dragging or moving a Flow Curve node crashes the app to the error boundary with:

```text
Cannot read properties of null (reading 'toFixed')
```

This occurs when attempting to move a node, likely after a gap/removal workflow introduced a null numeric value into a render or formatting path.

## Priority

P0 stability hotfix.

The editor must never crash while moving Flow Curve nodes.

## Current Problem

A UI/render path is calling:

```ts
someValue.toFixed(...)
```

on a value that can now be `null`.

The most likely values are numeric fields used by Flow Curve / track-node / slot rendering:

- `energy`
- `targetEnergy`
- `targetBpm`
- `bpm`
- `durationSeconds`
- `startTimeSeconds`
- track-node position values
- gap slot values
- warning display values

The crash indicates the app does not currently normalize or guard numeric display values after a gap state is introduced.

## Product Rule

```text
Malformed, empty, or gap-state numeric values must not crash the editor.
```

Gap slots are valid editor states.

They may have missing track metadata, but they must still render safely.

## Required Behavior

1. Dragging any Flow Curve node must not crash.
2. Empty/gap slots must render safely.
3. Missing numeric values should display as `—`, `0`, or a safe fallback depending on context.
4. Valid numeric values must preserve existing display formatting.
5. Curve editing must remain responsive.
6. Source-group isolation must remain intact.
7. 0622A playback/editor decoupling must remain intact.
8. 0622B Fill Missing Time behavior must remain intact.
9. 0622C Remove and Leave Gap reactivity work should continue after this crash guard is fixed.

## Non-Goals

Do not redesign Flow Curve assignment.

Do not change scoring logic.

Do not change warning severity logic.

Do not change Broadcast HUD.

Do not change Scheduler / Smart Grid / Map feed behavior.

Do not hide the gap feature.

## Likely Search Targets

Search for direct `.toFixed(` calls:

```bash
grep -R "\.toFixed(" src
```

Prioritize files related to:

```text
FlowCurveCanvas
MainTrackWindow
PlaylistTimeline
TrackTable
slot rendering
warning badges
curve node rendering
track node rendering
format helpers
```

## Required Helper

Add a defensive numeric formatter.

Recommended helper:

```ts
export function formatNumber(value: unknown, digits = 2, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : fallback;
}
```

For display values that need integer-style output:

```ts
export function formatInteger(value: unknown, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value).toString()
    : fallback;
}
```

## Required Fix

Replace unsafe direct display calls like:

```ts
slot.targetEnergy.toFixed(2)
track.energy.toFixed(2)
track.bpm.toFixed(1)
```

with guarded formatting:

```ts
formatNumber(slot.targetEnergy, 2)
formatNumber(track.energy, 2)
formatNumber(track.bpm, 1)
```

For computation paths, do not silently format. Validate before arithmetic:

```ts
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
```

## Gap-State Handling

Gap slots may legally have no assigned track.

Rendering code must handle:

```ts
assignedTrackId === undefined
track === undefined
energy === null
bpm === null
targetEnergy === null
```

Expected display:

```text
BPM: —
Energy: —
Duration: —
```

Do not crash.

## Storage Repair Optional Add-On

If stored project repair already normalizes slots, add a numeric repair pass only if low risk.

Do not overreach.

The minimum acceptable fix is render-safe numeric formatting.

## Acceptance Tests

### Test 1 — Current Crash Reproduction

1. Open Flow-Curve editor.
2. Trigger the workflow that previously caused the crash.
3. Move a curve node.
4. App does not crash.
5. No error boundary appears.

### Test 2 — Gap Safety

1. Use Remove and Leave Gap.
2. Confirm a gap remains visible.
3. Drag a Flow Curve node.
4. Gap renders safely.
5. Track nodes remain visible.
6. No `.toFixed` crash.

### Test 3 — Valid Formatting Preserved

1. Open a normal playlist with valid tracks.
2. Confirm BPM, energy, duration, and warning displays remain readable.
3. Confirm existing valid decimals still format correctly.

### Test 4 — Regression Safety

1. Confirm playback remains decoupled from editor selection.
2. Confirm Fill Missing Time still runs.
3. Confirm source-group isolation still holds.
4. Run TypeScript build.

## Implementation Guide

- **Where:** Search all `.toFixed(` calls in `src/`, then patch Flow Curve / slot / track-node display paths first.
- **What:** Add safe numeric formatting helpers and replace direct display `.toFixed()` calls on nullable or data-derived values.
- **Expect:** Moving Flow Curve nodes no longer crashes when gaps or malformed slot values are present; valid numeric display formatting remains unchanged.
