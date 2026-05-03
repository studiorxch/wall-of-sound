# 0428_WOS_MotionBrush_Decoupling_v1.0.0.md

**Date:** 2026-04-28
**System:** Wall of Sound (WOS)
**Domain:** Interaction / Behavior / Motion
**Status:** READY
**Summary:**
Decouple Motion Brush from object motion state. Motion Brush becomes a **creation-time preset system** instead of a live editor. Behavior Panel remains the **source of truth** for object motion.

---

# 🧠 Core Change

### Before

- Motion Brush + Behavior Panel both write to `state.motion`
- Causes duplication + unclear ownership

### After

- Behavior Panel → edits **selected object**
- Motion Brush → defines **defaults for newly created strokes**

---

# 🔧 Implementation

## 1. Add Motion Brush State

### 📄 main.js (or global state module)

```js
// NEW: creation-time motion preset
state.motionBrush = {
  enabled: false,
  mode: "pingpong",
  rate: 40,
  spread: 0.3,
  speed: 120,
  size: 3,
  life: 1.0,
  type: "dot",
  colorSource: "note",
  color: "#ffffff",
};
```

---

## 2. Apply Motion Brush on Stroke Creation

### 📄 Wherever new strokes are created (pen tool / mop commit)

Find:

```js
const stroke = createStroke(points);
```

Replace with:

```js
const stroke = createStroke(points);

// APPLY motion preset ONLY at creation time
if (state.motionBrush.enabled) {
  stroke.motion = {
    mode: state.motionBrush.mode,
    rate: state.motionBrush.rate,
    spread: state.motionBrush.spread,
    speed: state.motionBrush.speed,
    size: state.motionBrush.size,
    life: state.motionBrush.life,
    type: state.motionBrush.type,
    colorSource: state.motionBrush.colorSource,
    color: state.motionBrush.color,
  };
}
```

---

## 3. Stop Motion Brush from Editing Live Objects

### 📄 controls.js

Find all Motion Brush bindings like:

```js
state.motion.rate = value;
state.motion.speed = value;
```

### ❌ REMOVE / REPLACE with:

```js
state.motionBrush.rate = value;
state.motionBrush.speed = value;
```

---

## 4. Ensure Behavior Panel Writes to Selected Object Only

No global writes allowed.

### Expected pattern:

```js
const selected = getSelectedStroke();
if (!selected) return;

selected.motion.rate = value;
```

---

## 5. Remove Shared State (Critical)

### ❌ DELETE if exists:

```js
state.motion = {...}
```

OR any logic like:

```js
selected.motion = state.motion;
```

---

## 6. Optional Safety Guard

### Prevent undefined motion errors

```js
if (!stroke.motion) {
  stroke.motion = null;
}
```

---

# 🧪 Verification

### Test 1 — Creation Flow

1. Enable Motion Brush
2. Draw stroke
   ✅ Stroke has motion

---

### Test 2 — Editing Flow

1. Select stroke
2. Change Behavior Panel
   ✅ Only that stroke updates

---

### Test 3 — Isolation

1. Change Motion Brush
2. Existing strokes remain unchanged
   ✅ PASS

---

### Test 4 — Disable Brush

1. Disable Motion Brush
2. Draw stroke
   ✅ No motion applied

---

# 🚫 Anti-Patterns (Do NOT reintroduce)

- ❌ Shared `state.motion`
- ❌ Motion Brush modifying selected objects
- ❌ Behavior Panel writing globally
- ❌ Copy-by-reference (`stroke.motion = state.motion`)

---

# 🧭 Resulting Architecture

| Layer          | Role                         |
| -------------- | ---------------------------- |
| Motion Brush   | Creation preset (input tool) |
| Behavior Panel | Object editor (truth)        |
| Stroke.motion  | Stored per-object            |

---

# 🚀 Implementation Guide

- **Where code goes:**
  `main.js` (state + stroke creation), `controls.js` (UI bindings)

- **What to run:**
  Reload app → draw + select + edit

- **What to expect:**
  Clean separation: brush affects new strokes, panel edits existing ones
