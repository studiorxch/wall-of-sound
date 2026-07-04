# PLAY Patch 0621F — Slot Warning Messages Defensive Backfill Hotfix
**Completion Report · 2026-06-21 · P0/P1 stability**

---

## Summary

Malformed slot data can no longer crash the editor. Added a shared `normalizeWarningMessages` helper, hardened `warnBadges` to use it, and normalized slot `warningMessages` during storage repair so repaired projects persist in a safe shape. No warning logic, playlist generation, HUD, or source-group behavior changed.

---

## Root Cause (carried from 0621E)

`warnBadges(slot.warningMessages)` iterated `warningMessages` with `for...of`. If a stored/imported/migrated slot lacked the field (or held `null`/non-array), the iteration threw `TypeError: messages is not iterable`, escalating to the `AppErrorBoundary`. Real generated slots always include the field; only malformed data triggered it.

---

## Files Changed

### `src/data/playlistTypes.ts` — shared helper
Added `normalizeWarningMessages` next to the `TrackSlot` type (the natural shared home, importable by both storage and UI):
```ts
export function normalizeWarningMessages(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((message): message is string => typeof message === "string")
    : [];
}
```

### `src/ui/MainTrackWindow.tsx` — render safety
- Hardened `warnBadges` itself (the spec's preferred option, since it is reused at 2 call sites):
  ```ts
  function warnBadges(messages: unknown) {
    const badges = [];
    for (const m of normalizeWarningMessages(messages)) { ... }
  }
  ```
  Both existing call sites (`slot.warningMessages` and `s.warningMessages`) are now safe with no per-site change.
- Added a value import of `normalizeWarningMessages` (the existing import was type-only).

### `src/data/playProjectStorage.ts` — storage repair
- `repairStoredProject` now normalizes every slot's `warningMessages` while it backfills timestamps + source groups, and guards `pl.slots` being non-array:
  ```ts
  slots: Array.isArray(pl.slots)
    ? pl.slots.map((s) => ({ ...s, warningMessages: normalizeWarningMessages(s.warningMessages) }))
    : [],
  ```
  Repaired projects persist back into a safe shape after reload.

---

## Helper Placement

Shared helper in `src/data/playlistTypes.ts` (not a local render helper) — used by both the render path (`warnBadges`) and the storage repair path, per the spec's preference for reuse across components.

---

## Malformed-Data Test Results (browser, port 5173)

Seeded one project with three malformed slots, reloaded:

| Slot | Stored `warningMessages` | After reload (persisted) |
|------|--------------------------|--------------------------|
| missing field | _(absent)_ | `[]` |
| null | `null` | `[]` |
| mixed | `["Energy gap", null, 42, "Duration drift"]` | `["Energy gap", "Duration drift"]` |

- ✅ No error boundary shown (`errorBoundaryShown: false`) — editor rendered, rows present.
- ✅ Console: **no errors** (the 0621E crash is gone).
- ✅ Editor screenshot confirms "Malformed Test" playlist renders with curve + controls.
- ✅ Repaired slot data persisted as `[]` / filtered string arrays after reload (criterion 5).
- ✅ Mixed array dropped non-string entries (`null`, `42`) while preserving valid strings (criterion 3 + 4).

---

## TypeScript Result

`npx tsc --noEmit` — clean.

---

## Untouched (confirmed)

- **Broadcast HUD** — no visual or behavioral change (criterion 6); no HUD files touched.
- **Source-group isolation (0621E)** — eligibility logic untouched (criterion 7); the storage-repair edit only added slot-message normalization alongside the existing group migration.
- **Playlist generation / Flow Curve assignment** — unchanged (criterion 8).
- **Warning severity/generation logic** — unchanged; this patch only normalizes the message array shape before iteration.
- Dead HUD CSS left in place (explicitly out of scope).

---

## Patch Status: ✅ COMPLETE
