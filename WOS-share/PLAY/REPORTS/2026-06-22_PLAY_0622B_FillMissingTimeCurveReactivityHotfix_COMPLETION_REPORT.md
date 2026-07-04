# PLAY Patch 0622B — Fill Missing Time Curve Reactivity Hotfix
**Completion Report · 2026-06-22**

---

## Summary

Fixed the regression where the Flow Curve stopped repositioning track nodes after `Fill Missing Time`. Fill was marking the playlist `manualOrderDirty: true`, which made subsequent curve edits skip reassignment. Fill now leaves the playlist curve-reactive (`manualOrderDirty: false`) — the same shape as after Regenerate — so curve edits re-run assignment and nodes respond again.

---

## Root Cause

`handleCurveChange` branches on `manualOrderDirty`:
- **`true`** → only re-evaluate warnings on existing slots (no reassignment).
- **`false`** → re-run `assignPlaylistToCurve` (reassign tracks to curve) — this is what makes track nodes visibly respond to curve edits.

`handleFillMissingTime` set `manualOrderDirty: true`. So after a fill, every curve drag took the warnings-only branch → no reassignment → **track nodes froze** while control points still moved. Exactly the reported behavior.

(Not a memo/mutation/normalization issue: `FlowCurveCanvas` computes `trackNodes` inline each render, fill builds slots immutably, and `fillMissingTime` already runs `reindexPlaylistSlots` + `evaluateSlotWarnings` — slots are normalized with `warningMessages`.)

---

## Change (`src/App.tsx`, `handleFillMissingTime`)

```diff
- ...p, slots: newSlots, manualOrderDirty: true, lastFillReport: report, updatedAt: now2,
+ ...p, slots: newSlots, manualOrderDirty: false, lastFillReport: report, updatedAt: now2,
```

Rationale comment added: fill is a curve-aware operation, not a manual reorder; leaving it `false` keeps nodes responsive. `newSlots` are already reindexed + warning-evaluated by `fillMissingTime`.

One line of behavior changed; nothing else touched.

---

## Why This Is Correct / Safe

- Matches the spec's "Required Fix Shape #2 — after fill, the playlist should be in the same reactive shape as after Regenerate" (Regenerate sets `manualOrderDirty: false`).
- Source-group isolation preserved: post-fill curve edits call `assignPlaylistToCurve({ tracks: filterTracksForPlaylist(...) })` (0621E intact).
- Locks preserved: `assignPlaylistToCurve` honors `pl.locks` on reassignment.
- No `warningMessages` crash: filled slots are evaluated; `warnBadges` is hardened (0621F).
- Fill assignment algorithm, scoring weights, HUD, Scheduler, and playback (0622A) untouched.

---

## Verification (browser, port 5173)

Seeded "Mix" (target 30m, 2 placed tracks, 10 same-source library tracks m1–m10, varied energy), `manualOrderDirty: false`.

1. **Fill:** clicked Fill Missing Time → slots 2 → **9**; `manualOrderDirty` after fill = **false** (the fix); every slot has `warningMessages` (normalized); no error boundary.
2. **Reactivity:** dragged the middle curve control point up (energy 0.60 → 0.90). Slot assignment **reassigned**: `m1,m2,m3,m4,m5,m6,m7,m8,m9` → `m2,m3,m4,m5,m10,m9,m8,m7,m1` — `m10` (highest energy) pulled in where the curve now peaks. Track nodes respond to curve edits. ✅
3. **Source isolation:** only `source-pl_mix` tracks (m1–m10) were used — 0621E intact.
4. **Persistence:** reload → 9 slots persisted, `manualOrderDirty` still false (curve stays reactive after reload). 0621C intact.
5. `npx tsc --noEmit` clean; no console errors during fill or curve edit.

**Acceptance criteria: all met.**

---

## Note / Tradeoff

Because fill now leaves the playlist curve-reactive, a later curve edit will re-run full assignment (regenerate-style), which can reorder filled tracks. This is the spec's intended "same reactive shape as after Regenerate." Manual edits (drag/remove/replace) still set `manualOrderDirty: true` and remain protected from curve reassignment as before.

---

## Patch Status: ✅ COMPLETE
