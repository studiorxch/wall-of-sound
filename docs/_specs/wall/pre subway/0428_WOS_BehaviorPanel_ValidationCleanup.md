0428_WOS_BehaviorPanel_ValidationCleanup_v1.0.0

Date: 2026-04-28
Project: Wall of Sound (WOS)
system: "WOS"
domain: "wall"
Scope: Motion System Stabilization + Data Integrity
Status: READY

---

## 🎯 Objective

Stabilize the new motion architecture:

- `state.motionBrush` → creation-time preset
- `stroke.motion` → per-object behavior source
- Behavior Panel → edits selected stroke only

Ensure:

- No legacy writes to `state.motion`
- Motion persists across undo/save/load
- Panels reflect correct data at all times

---

## ⚠️ Assumptions

- `getSelectedStroke()` exists and is reliable
- `createWalkerFromStroke()` already resolves:
  `stroke.motion → state.motionBrush → defaults`
- `state.motion` still exists but is unused
- History system uses `pushHistory()` snapshots

---

## 🧩 Patch 1 — Persist `stroke.motion` in History

### Problem

Undo/redo may drop motion because it is not serialized.

### Fix

Locate `pushHistory()` stroke serialization.

### BEFORE

```js
return {
  points: stroke.points,
  width: stroke.width,
  color: stroke.color,
  behavior: stroke.behavior,
  drips: stroke.drips,
};
```
