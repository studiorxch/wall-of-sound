# PLAY Patch 0622C — Remove Leave Gap Curve Reactivity Hotfix
**Completion Report · 2026-06-23**

---

## Summary

Fixed the regression where "Remove and Leave Gap" froze Flow Curve track-node reactivity. Previously, every "leave gap" call routed through `applyManualSlots` which set `manualOrderDirty: true` — causing all subsequent curve edits to take the warnings-only branch and never reassign tracks. The fix introduces `preservedGapSlotIds` on `PlaylistRecord` to track intentionally empty slots. The playlist stays curve-reactive (`manualOrderDirty: false`) while `handleCurveChange` re-applies gaps after each reassignment, preserving them across all future curve edits.

---

## Root Cause

`handleRemoveFromPlaylistLeaveGap` called `applyManualSlots`, which always writes `manualOrderDirty: true`:

```ts
// before fix
applyManualSlots(evaluateSlotWarnings({ slots: newSlots, tracksById: tbm }));
```

`handleCurveChange` branches on `manualOrderDirty`:
- **`true`** → warnings-only (no reassignment) — track nodes freeze
- **`false`** → `assignPlaylistToCurve` (full curve-reactive reassignment)

A gap means "keep this slot empty." It must NOT mean "stop all future curve-based reassignment." The two concerns were conflated via `manualOrderDirty`.

---

## Changes

### `src/data/playProjectTypes.ts`

Added `preservedGapSlotIds?: string[]` to `PlaylistRecord`:

```ts
preservedGapSlotIds?: string[];  // slot IDs emptied via "Remove and Leave Gap" (0622C)
```

### `src/data/playProjectStorage.ts` — `repairStoredProject`

Backfill on load:

```ts
preservedGapSlotIds: Array.isArray(pl.preservedGapSlotIds) ? pl.preservedGapSlotIds : [],
```

### `src/App.tsx` — `handleRemoveFromPlaylistLeaveGap`

No longer calls `applyManualSlots`. Writes directly via `mutatePLAndSave` with `manualOrderDirty: false` and records the gap's `slotId`:

```diff
- applyManualSlots(evaluateSlotWarnings({ slots: newSlots, tracksById: tbm }));
+ mutatePLAndSave(activePlaylistIdRef.current, (pl) => ({
+   ...pl,
+   slots: evaluated,
+   manualOrderDirty: false,
+   preservedGapSlotIds: gapSlotId
+     ? [...(pl.preservedGapSlotIds ?? []).filter((id) => id !== gapSlotId), gapSlotId]
+     : (pl.preservedGapSlotIds ?? []),
+   updatedAt: now,
+ }));
```

### `src/App.tsx` — `handleCurveChange` (reactive branch)

After `assignPlaylistToCurve` returns new slots, re-applies preserved gaps before storing:

```ts
const gapIds = new Set(pl.preservedGapSlotIds ?? []);
const sWithGaps = gapIds.size > 0
  ? s.map((slot) => gapIds.has(slot.slotId) ? { ...slot, assignedTrackId: undefined } : slot)
  : s;
newPL = { ...pl, curve: c, slots: sWithGaps, orphans: o, updatedAt: now };
```

Slot IDs are positional (`slot_0`, `slot_1`, …) — deterministic from `generateTrackSlots` — so matching by `slotId` correctly identifies preserved gap positions across reassignments.

### `src/App.tsx` — `handleFillMissingTime`

Clears filled gap IDs from `preservedGapSlotIds` so fill "consumes" a gap:

```ts
const filledIds = new Set(newSlots.filter((s) => s.assignedTrackId).map((s) => s.slotId));
const remainingGaps = (p.preservedGapSlotIds ?? []).filter((id) => !filledIds.has(id));
return { ...p, slots: newSlots, manualOrderDirty: false, lastFillReport: report, preservedGapSlotIds: remainingGaps, ... };
```

### `src/App.tsx` — `handleRemoveFromPlaylist` (compact delete)

Clears any stale gap IDs whose slots no longer exist after the compaction + reindex:

```ts
const remainingSlotIds = new Set(reindexed.map((s) => s.slotId));
mutatePLAndSave(activePlaylistIdRef.current, (pl) => ({
  ...pl, slots: evaluated, manualOrderDirty: true,
  preservedGapSlotIds: (pl.preservedGapSlotIds ?? []).filter((id) => remainingSlotIds.has(id)),
  updatedAt: now,
}));
```

---

## Why Slot IDs Are Stable Across Reassignments

`generateTrackSlots` produces `slotId: "slot_0"`, `"slot_1"`, … deterministically by index. `removeSlotLeaveGap` keeps the slot in place with its original `slotId` (only clears `assignedTrackId`). So after `assignPlaylistToCurve` generates a fresh set of slots with the same deterministic IDs, a preserved gap at index N still has `slotId: "slot_N"` — matching the stored `preservedGapSlotIds` entry.

---

## Verification (browser, port 5173)

Seeded playlist: 8 tracks (m1–m8), 8 slots (slot_0–slot_7), `manualOrderDirty: false`.

1. **Simulated "Remove and Leave Gap"** on slot_0: set `slot_0.assignedTrackId = undefined`, `manualOrderDirty: false`, `preservedGapSlotIds: ["slot_0"]` in localStorage; reloaded.

2. **Curve drag** (mousedown → mousemove → mouseup on SVG control point): `handleCurveChange` ran the reactive branch (`assignPlaylistToCurve` + gap re-application).

3. **Result after curve drag:**
   - `slot_0.assignedTrackId: null` — **gap preserved** ✅
   - `manualOrderDirty: false` — **curve-reactive** ✅
   - `preservedGapSlotIds: ["slot_0"]` — **gap ID retained** ✅
   - Slots 1–7: assigned tracks — reassignment ran ✅

4. `npx tsc --noEmit` — **clean** ✅
5. No console errors ✅

---

## Invariants Preserved

- **0622A (playback decoupling)**: `handleRemoveFromPlaylistLeaveGap` still stops playback only when `isEditingPlayingPlaylist && currentSlotIdx === slotIndex` — unchanged.
- **0622B (fill reactivity)**: `handleFillMissingTime` still sets `manualOrderDirty: false` — unchanged; now also clears consumed gap IDs.
- **0621E (source-group isolation)**: `handleCurveChange` still calls `filterTracksForPlaylist` before `assignPlaylistToCurve` — unchanged.
- **0621F (warning normalization)**: `evaluateSlotWarnings` still runs on the result — unchanged.
- **0621C (hydration guard)**: `repairStoredProject` backfill is purely additive — no risk of overwrite.

---

## Patch Status: ✅ COMPLETE
