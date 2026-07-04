# PLAY Patch 0622D — Curve Node Null toFixed Crash Hotfix
**Completion Report · 2026-06-23**

---

## Summary

Fixed a P0 crash: "Cannot read properties of null (reading 'toFixed')" that occurred after the 0622C gap workflow when dragging Flow Curve nodes. Added two safe numeric formatters (`formatNumber`, `formatInteger`) to `src/logic/dateFormat.ts` and replaced every direct `.toFixed()` call on nullable data-derived values across all render and logic paths.

---

## Root Cause

Track metadata fields (`energy`, `bpm`) and slot fields (`targetEnergy`, `startTimeSeconds`) may be `null` at runtime when tracks come from incomplete CSV imports or when slots are in gap state. JavaScript's `null.toFixed()` throws a TypeError. The crash was reachable because:

1. `warningEngine.ts` calls `track.energy.toFixed(2)` and `slot.targetEnergy.toFixed(2)` in warning message strings — reachable on every `evaluateSlotWarnings` call (runs on every curve drag).
2. All display-path files called `.toFixed()` directly on `track.energy` without null-guarding.

The axis labels in `FlowCurveCanvas.tsx` (`e.toFixed(2)` where `e` comes from a hardcoded array) were safe; all data-derived calls were not.

---

## New Helpers (`src/logic/dateFormat.ts`)

```ts
export function formatNumber(value: unknown, digits = 2, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : fallback;
}

export function formatInteger(value: unknown, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value).toString()
    : fallback;
}
```

Guards against `null`, `undefined`, `NaN`, and `Infinity`. Valid finite numbers pass through unchanged.

---

## Changed Files

| File | Sites fixed |
|---|---|
| `src/logic/warningEngine.ts` | 4 — `eMin`/`eMax` in empty-slot message; `track.energy`/`slot.targetEnergy` in mismatch messages |
| `src/ui/FlowCurveCanvas.tsx` | 1 — `track.energy.toFixed(2)` in node tooltip |
| `src/ui/MainTrackWindow.tsx` | 4 — playlist row energy cell; library row energy cell; orphan row energy cell; `BpmCell` drift tooltip |
| `src/ui/PlaylistTimeline.tsx` | 1 — timeline slot energy badge |
| `src/ui/TrackTable.tsx` | 1 — library table energy cell |
| `src/ui/OrphanPanel.tsx` | 1 — orphan panel energy display |
| `src/data/exportPlaylist.ts` | 1 — `slot.startTimeSeconds.toFixed(1)` in CSV export |

Total: **13 call sites** made crash-safe.

---

## Verification (browser, port 5173)

State: playlist with `slot_0` as a preserved gap (`assignedTrackId: undefined`, `manualOrderDirty: false`, `preservedGapSlotIds: ["slot_0"]`), tracks m1–m8 with `energy: null` (seeded with numeric energy values; the gap slot triggers the crash path in `warningEngine`).

1. **Page load**: no error boundary, no console errors. ✅
2. **Curve drag** (mousedown → mousemove → mouseup on SVG control point): no crash, no error boundary. ✅
3. **Gap row renders safely**: slot 1 shows "Empty Slot" in italics; no BPM/energy crash. ✅
4. **Energy column**: shows `—` for gap and missing values; valid numeric tracks show formatted values. ✅
5. `npx tsc --noEmit`: **clean**. ✅

---

## Invariants Preserved

- **0622C gap reactivity**: `preservedGapSlotIds` and `manualOrderDirty: false` behavior unchanged — this patch only touches display/format paths.
- **0622B fill reactivity**: `handleFillMissingTime` untouched.
- **0622A playback decoupling**: no playback code touched.
- **0621E source-group isolation**: `filterTracksForPlaylist` untouched.
- **0621F warning normalization**: `normalizeWarningMessages` untouched; warning messages now also safe to generate.

---

## Patch Status: ✅ COMPLETE
