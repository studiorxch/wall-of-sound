# 0622C_PLAY_RemoveLeaveGapCurveReactivityHotfix_v1.0.0_PATCH

## Project

**PLAY — Playlist Builder / Flow Curve / Gap Reactivity**

## Patch Type

Hotfix

## Status

Draft for implementation

## Build ID

`0622C_PLAY_RemoveLeaveGapCurveReactivityHotfix_v1.0.0_PATCH`

---

# Purpose

Fix the remaining Flow Curve reactivity freeze caused by **Remove and Leave Gap**.

`0622B` fixed a valid related bug where **Fill Missing Time** incorrectly left the playlist in a manual-order state. The reported freeze still exists because the actual trigger is now understood to be the prior **Remove and Leave Gap** action.

The system must allow intentional empty gaps without globally disabling curve-based reassignment.

```text
Leaving a gap is not the same as freezing playlist order.
```

---

# Current Problem

After using **Remove and Leave Gap**, Flow Curve nodes remain draggable, but track nodes stop reacting to subsequent curve edits.

Likely current chain:

```text
Remove and Leave Gap
↓
slot remains but assignedTrackId is cleared
↓
manualOrderDirty becomes true
↓
curve drag enters warnings-only branch
↓
track reassignment does not run
↓
track nodes appear frozen against the Flow Curve
```

This makes the editor feel broken because the user can still move the curve visually, but the playlist no longer responds as a curve-authored system.

---

# Product Rule

A gap means:

```text
Keep this slot empty for now.
```

A gap must not mean:

```text
Stop all future curve-based reassignment.
```

The Flow Curve remains the editor authority unless the user performs a true manual-order action that intentionally protects the current order.

---

# Required Behavior

## Core Acceptance Path

1. Open a playlist with assigned tracks.
2. Use **Remove and Leave Gap** on a track.
3. Confirm an empty slot/gap remains visible.
4. Drag a Flow Curve point.
5. Confirm track nodes / assignments still respond to the curve.
6. Confirm the intentional gap remains empty.
7. Confirm warnings update.
8. Confirm locks remain honored.
9. Confirm source-group isolation remains honored.
10. Confirm reload persistence remains intact.

## Expected Result

```text
Remove and Leave Gap preserves an intentional empty slot,
but the rest of the playlist remains curve-reactive.
```

---

# Scope

## In Scope

- Audit **Remove and Leave Gap** handler.
- Audit related slot clearing code.
- Audit any `manualOrderDirty` mutation in gap paths.
- Prevent gap creation from globally disabling curve reassignment.
- Preserve the gap through curve reassignment.
- Keep Fill Missing Time behavior from 0622B intact.
- Keep playback/editor decoupling from 0622A intact.
- Preserve source-group isolation from 0621E.
- Preserve warning normalization from 0621F.

## Out of Scope

- Do not redesign the whole Flow Curve assignment engine.
- Do not add scheduler playback handoff.
- Do not change Broadcast HUD.
- Do not change Smart Grid.
- Do not change WOS/map feed config.
- Do not change playlist source-group rules.
- Do not introduce drag/drop timeline redesign.

---

# Likely Files / Search Targets

Start by searching for these labels and handlers:

```bash
grep -R "Remove and Leave Gap\|Leave Gap\|Delete Gap\|manualOrderDirty\|assignedTrackId" src
```

Likely areas:

```text
src/App.tsx
src/ui/MainTrackWindow.tsx
src/logic/playlistAssigner.ts
src/logic/warningEngine.ts
src/data/playlistTypes.ts
```

Exact files may differ. Patch the smallest responsible surface.

---

# Implementation Guidance

## 1. Find the Gap Handler

Locate the handler used by **Remove and Leave Gap**.

Look for behavior similar to:

```ts
slot.assignedTrackId = undefined;
manualOrderDirty = true;
```

or any state update that clears a slot and sets global manual-order protection.

## 2. Stop Treating Gap Creation as Manual Reorder

If the current handler sets:

```ts
manualOrderDirty: true
```

change it so the playlist remains curve-reactive where appropriate:

```ts
manualOrderDirty: false
```

Only do this for **Remove and Leave Gap**. Do not weaken true manual-order operations.

## 3. Preserve Intentional Empty Slots

If the assignment engine immediately fills cleared slots during curve edits, add a small explicit preserved-gap mechanism.

Preferred model if needed:

```ts
type PlaylistRecord = {
  preservedGapSlotIds?: string[];
};
```

Rules:

```text
- Remove and Leave Gap adds the slotId to preservedGapSlotIds.
- Curve reassignment must skip preserved gap slots.
- Fill Missing Time may fill preserved gaps and remove them from preservedGapSlotIds.
- Delete Gap removes the slot entirely and removes it from preservedGapSlotIds.
```

Use this only if current state cannot already represent intentional empty slots safely.

## 4. Keep Manual Edits Protected

Do not change behavior for true manual-order edits such as:

```text
manual reorder
manual replace
manual drag sequence
explicit user-crafted order preservation
```

Those may still set:

```ts
manualOrderDirty: true
```

## 5. Reuse Existing Reassignment Path

Curve edits after a gap should use the same valid assignment path as normal curve editing / regenerate.

Do not introduce a second assignment algorithm.

---

# Testing Checklist

## Required Tests

```text
1. Create or load a playlist with multiple assigned tracks.
2. Use Remove and Leave Gap on a middle track.
3. Confirm the gap remains visible.
4. Drag a Flow Curve point upward.
5. Confirm surrounding track nodes move / reassignment changes.
6. Confirm the gap remains empty.
7. Use Fill Missing Time.
8. Confirm the gap can be filled.
9. Drag the Flow Curve again.
10. Confirm reactivity still works after fill.
11. Reload browser.
12. Confirm playlist persists and remains stable.
```

## Regression Tests

```text
- Source-group isolation still prevents cross-group auto-pulls.
- Locked tracks remain locked.
- Warning badges still render.
- Missing warningMessages still normalizes safely.
- Playback continues when switching editor playlists.
- Broadcast HUD layout unchanged.
```

---

# Acceptance Criteria

This patch passes when:

1. **Remove and Leave Gap** no longer freezes Flow Curve track-node response.
2. Curve edits after gap creation still trigger assignment / visual track-node updates.
3. The intentional gap remains empty until Fill Missing Time, Delete Gap, or Regenerate changes it intentionally.
4. True manual-order edits still protect order where intended.
5. Source-group isolation remains intact.
6. Playback/editor decoupling remains intact.
7. TypeScript build passes.
8. No console errors appear during the tested workflow.

---

# Completion Report Requirement

Create:

```text
REPORTS/2026-06-22_PLAY_0622C_RemoveLeaveGapCurveReactivityHotfix_COMPLETION_REPORT.md
```

Include:

- Root cause.
- Files changed.
- Whether `manualOrderDirty` was the actual trigger.
- Whether `preservedGapSlotIds` or an equivalent was needed.
- Browser verification results.
- Any remaining edge cases.

---

# Implementation Guide

- **Where:** Start in the **Remove and Leave Gap** handler, slot-clearing logic, `manualOrderDirty` mutation path, and curve-change assignment path.
- **What:** Prevent gap creation from globally disabling curve reassignment; preserve intentional gaps while allowing surrounding unlocked tracks to keep responding to curve edits.
- **Expect:** After removing a track and leaving a gap, dragging Flow Curve nodes still reassigns/moves track nodes, warnings update, source isolation holds, and the gap remains visible until filled or deleted.
