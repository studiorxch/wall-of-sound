# 0621F_PLAY_SlotWarningMessagesDefensiveBackfillHotfix_v1.0.0_PATCH

## Project

**Project:** PLAY / PLAYLIST  
**Build ID:** 0621F  
**Patch Name:** Slot Warning Messages Defensive Backfill Hotfix  
**Version:** v1.0.0  
**Type:** P0/P1 stability hotfix  
**Status:** Ready for implementation  

---

## Purpose

Prevent malformed playlist slot data from crashing the editor when `warningMessages` is missing, malformed, or not an array.

This is a narrow defensive patch following the 0621C persistence repair work and the 0621E source-group migration work.

The hotfix should make malformed stored project data safe to render without changing warning logic, playlist generation behavior, Broadcast HUD behavior, or Flow Curve assignment.

---

## Problem

During 0621E testing, a malformed test seed exposed a crash path:

```ts
warnBadges(slot.warningMessages)
```

If a slot does not include `warningMessages`, the editor can crash into the error boundary.

Real generated data normally includes this field, but imported, migrated, manually edited, or corrupted project data may not.

Malformed slot data should be repaired or safely normalized, not allowed to crash the UI.

---

## Product Rule

```text
Malformed slot data should not crash the editor.
```

---

## Scope

### Included

- Add a defensive normalization helper for warning message arrays.
- Ensure render paths never pass missing or malformed `warningMessages` into `warnBadges`.
- Backfill malformed stored slots during project repair/load.
- Preserve valid warning messages.
- Drop invalid non-string values from malformed arrays.
- Warn only if existing project repair already warns for repaired malformed data.
- Verify TypeScript build remains clean.

### Excluded

- Do not change warning generation logic.
- Do not change warning severity logic.
- Do not change playlist assignment.
- Do not change Flow Curve behavior.
- Do not change source-group isolation.
- Do not change Broadcast HUD visuals.
- Do not prune dead HUD CSS in this patch.
- Do not expand this into a broader schema cleanup.

---

## Required Behavior

### Valid Slot

Input:

```ts
{
  warningMessages: ["Energy gap", "Camelot risk"]
}
```

Expected:

```ts
["Energy gap", "Camelot risk"]
```

### Missing Warning Messages

Input:

```ts
{
  slotId: "slot-1"
}
```

Expected:

```ts
warningMessages: []
```

### Malformed Warning Messages

Input:

```ts
{
  warningMessages: null
}
```

Expected:

```ts
warningMessages: []
```

### Mixed Array

Input:

```ts
{
  warningMessages: ["Energy gap", null, 42, "Duration drift"]
}
```

Expected:

```ts
warningMessages: ["Energy gap", "Duration drift"]
```

---

## Recommended Helper

Add a small shared helper near existing project/slot repair utilities, or near the warning badge render if no shared utility location exists.

```ts
export function normalizeWarningMessages(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((message): message is string => typeof message === "string")
    : [];
}
```

Use this helper in both storage repair and render safety paths.

---

## Required Code Paths

### 1. Render Safety

Update the call site that currently does this:

```ts
warnBadges(slot.warningMessages)
```

Replace with a normalized call:

```ts
warnBadges(normalizeWarningMessages(slot.warningMessages))
```

If `warnBadges` is used in multiple places, apply the same guard everywhere.

### 2. Storage Repair

During stored project repair/load, normalize each slot:

```ts
warningMessages: normalizeWarningMessages(slot.warningMessages)
```

This ensures repaired projects persist back into a safe shape after reload.

### 3. Optional Defensive `warnBadges` Signature

If low-risk, harden `warnBadges` itself:

```ts
function warnBadges(messages: unknown) {
  const safeMessages = normalizeWarningMessages(messages);
  // existing rendering logic
}
```

This is preferable if `warnBadges` is reused in more than one UI component.

---

## Acceptance Criteria

This patch is complete when all criteria pass:

1. A malformed project with a slot missing `warningMessages` loads without crashing.
2. A malformed project with `warningMessages: null` loads without crashing.
3. A malformed project with mixed invalid values inside `warningMessages` loads without crashing.
4. Valid warning messages still render as before.
5. Repaired slot data persists as `warningMessages: []` or a filtered string array after reload.
6. No Broadcast HUD behavior changes.
7. No source-group eligibility behavior changes.
8. No playlist generation behavior changes.
9. TypeScript build is clean.
10. Browser console has no new runtime errors.

---

## Manual Verification Checklist

```text
1. Seed a malformed project with one slot missing warningMessages.
2. Reload browser.
3. Confirm the editor renders instead of crashing.
4. Confirm the affected slot behaves as if warningMessages is [].
5. Seed a malformed project with warningMessages: null.
6. Reload browser.
7. Confirm no crash.
8. Seed a malformed project with warningMessages: ["A", null, 42, "B"].
9. Reload browser.
10. Confirm only A and B remain visible/persisted.
11. Create or regenerate a normal playlist.
12. Confirm normal warning badges still render.
13. Run npm run build.
```

---

## Risk Notes

This is a low-risk patch if it stays limited to normalization.

Do not alter the semantics of warnings. This patch is only about preventing malformed data from breaking rendering and storage hydration.

---

## Completion Report Requirements

When complete, write:

```text
REPORTS/2026-06-21_PLAY_0621F_SlotWarningMessagesDefensiveBackfillHotfix_COMPLETION_REPORT.md
```

Include:

- files changed
- whether normalization was placed in a shared helper or local render helper
- malformed-data test results
- TypeScript result
- browser verification result
- confirmation that Broadcast HUD and source-group isolation were untouched

---

## Implementation Guide

- **Where:** Update the `warnBadges(slot.warningMessages)` call site in `MainTrackWindow` or equivalent track/slot UI, then update slot repair logic in `playProjectStorage.ts`; add a small shared `normalizeWarningMessages` helper if there is already a safe utility location.
- **What:** Normalize `warningMessages` before rendering and during storage repair, then run `npm run build` and the malformed-project reload tests.
- **Expect:** Malformed slot data no longer crashes the editor; missing or invalid `warningMessages` backfills to `[]`; valid warning badges remain unchanged.
