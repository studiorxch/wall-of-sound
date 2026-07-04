# 0622B_PLAY_FillMissingTimeCurveReactivityHotfix_v1.0.0_PATCH

## Project

PLAY — Flow Curve Playlist Builder

## Document Type

Hotfix Spec

## Version

v1.0.0

## Status

Ready for implementation after 0622A

## Purpose

Fix a Flow Curve reactivity regression where track nodes stop adjusting after `Fill Missing Time` is used.

After filling missing time, curve control points remain draggable, but the track nodes/markers visually freeze and no longer respond to curve edits. The Flow Curve must remain fully reactive after fill operations.

## Product Rule

```txt
Fill Missing Time must update the playlist without breaking Flow Curve reactivity.
```

## Current Issue

Observed behavior:

```txt
1. Use Fill Missing Time.
2. New/fill tracks are added.
3. Curve nodes remain movable.
4. Track nodes stay fixed.
5. Track node positions no longer adjust to curve edits.
```

Likely cause:

```txt
Fill Missing Time updates playlist slots/tracks,
but the derived track-node projection is not recalculated or not receiving the updated dependency chain.
```

This may be caused by stale memoization, mutated slot arrays, incomplete dependency arrays, or fill logic bypassing the same regeneration path used by normal curve edits.

## Scope

### Included

- Ensure `Fill Missing Time` produces fresh playlist/slot/curve state references.
- Ensure track nodes remain bound to the active curve after fill.
- Ensure curve edits after fill recalculate visual track markers.
- Ensure warning badges update after fill and curve edits.
- Ensure source-group isolation remains intact.
- Ensure locks remain respected.
- Add defensive normalization if filled slots are missing expected fields.

### Excluded

- Do not rewrite playlist assignment algorithm.
- Do not change scoring weights.
- Do not change source-group isolation rules from 0621E.
- Do not alter Broadcast HUD.
- Do not alter Scheduler.
- Do not add playback handoff.
- Do not redesign the Flow Curve UI.

## Investigation Targets

Search likely flow paths:

```bash
grep -R "Fill Missing Time\|fillMissing\|Regenerate From Curve\|curvePoints\|slots\|track nodes\|FlowCurve" src
```

Review:

- Fill Missing Time handler
- slot generation / assignment call path
- playlist state update reducer
- FlowCurveCanvas props
- track marker derivation/memoization
- warning evaluation after fill
- lock preservation after fill

## Required Fix Shape

### 1. Avoid In-Place Mutation

Fill operations must not mutate existing arrays/objects in place.

Bad pattern:

```ts
playlist.slots.push(newSlot);
slot.assignedTrackId = trackId;
```

Required pattern:

```ts
const nextSlots = buildFilledSlots(...);
const nextPlaylist = {
  ...playlist,
  slots: nextSlots,
  updatedAt: new Date().toISOString(),
};
```

### 2. Reuse the Same Recalculation Path

After fill, the playlist should be in the same reactive shape as after regenerate.

Preferred behavior:

```txt
Fill Missing Time
↓
produce updated track pool / slot set
↓
run assignment / warning evaluation
↓
set fresh playlist state
↓
FlowCurveCanvas receives fresh slots and curve props
```

### 3. Fix Memo Dependencies

If track nodes are derived with `useMemo`, dependencies must include all state that changes after fill:

```ts
const trackNodes = useMemo(() => {
  return buildTrackNodes({ curve, slots, tracksById });
}, [curve, slots, tracksById]);
```

If slots are nested inside playlist state, include stable dependencies that actually change:

```ts
[activePlaylist.curvePoints, activePlaylist.slots, project.libraryTracks]
```

Do not depend only on `curvePoints` if fill changes slots.

### 4. Normalize Filled Slots

Every slot must include expected render fields:

- `slotId`
- `slotIndex`
- `startTimeSeconds`
- `targetEnergy`
- `targetBpm`
- `assignedTrackId` if assigned
- `warningLevel`
- `warningMessages: []`

Use existing normalization helpers where possible, including `normalizeWarningMessages` from 0621F.

### 5. Preserve Source Isolation

Fill Missing Time must keep using the 0621E eligibility helper:

```ts
filterTracksForPlaylist(...)
```

Do not restore global auto-pull behavior.

## Acceptance Criteria

- Use `Fill Missing Time` on a playlist with missing duration.
- Filled tracks appear correctly.
- Curve nodes remain draggable.
- Track nodes visually respond to curve edits after fill.
- Warning badges update after curve edits.
- Locked tracks remain fixed.
- Source-group isolation remains intact.
- No missing `warningMessages` crash.
- TypeScript passes.
- No console errors during fill or curve edit.

## Regression Test

```txt
1. Open Flow-Curve editor.
2. Select playlist with missing time.
3. Click Fill Missing Time.
4. Confirm playlist fills.
5. Drag a curve point up/down.
6. Confirm track nodes update visually.
7. Drag another point left/right.
8. Confirm track nodes remain responsive.
9. Confirm warning badges update.
10. Reload browser.
11. Confirm playlist persists and curve remains responsive.
```

## Do Not Reopen

- Do not change the curve scoring model.
- Do not change source-group isolation.
- Do not force all library tracks into the fill.
- Do not treat this as a visual redesign.

## Implementation Guide

- **Where:** Fill Missing Time handler, playlist state update reducer, slot/track node derivation, FlowCurveCanvas memo dependencies, warning evaluation path.
- **What:** Ensure Fill Missing Time updates state immutably and reuses the same slot/assignment/warning recalculation path as curve regeneration; fix stale memo dependencies so track markers recalculate after fill.
- **Expect:** After Fill Missing Time, moving the Flow Curve continues to reposition/update track nodes and warnings normally.
