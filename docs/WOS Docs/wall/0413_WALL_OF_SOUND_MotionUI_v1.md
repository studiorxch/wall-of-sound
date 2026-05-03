---
layout: spec
title: "MotionUI"
date: 2026-04-13
doc_id: "0413_WALL_OF_SOUND_MotionUI_v1"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "ui"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

# 0413_WALL_OF_SOUND_MotionUI_v1.0.0

Generated: 04/13/2026

---

## 🎯 Objective

Install a minimal Motion UI into the existing Inspector panel that:

- attaches motion to selected shapes
- updates in real-time (no reload required)
- does not break existing systems
- uses existing state + selection model

---

## 🧠 Assumptions

- `state.shapes` exists
- `state.selectedShapeId` is used for selection
- Inspector UI already exists
- `ui/controls.js` handles inspector bindings
- MotionSystem is already installed and running

---

## ⚠️ Constraints (CRITICAL)

- DO NOT modify ShapeSystem behavior
- DO NOT modify rendering pipeline
- DO NOT introduce new global state
- ONLY extend UI + interaction layer
- Motion must be attached per-shape (`shape.motion`)

---

## 🧱 STEP 1 — Add Motion UI Block

### File: `index.html`

Insert inside `<aside id="inspector">`  
Place AFTER Behavior block

```html
<section class="inspector-block" id="motion-block">
  <p class="micro-title">Motion</p>

  <label class="mini-toggle">
    <input id="motion-enabled" type="checkbox" />
    <span>Enable</span>
  </label>

  <div class="compact-grid two">
    <label class="field compact">
      <span>VX</span>
      <input
        id="motion-vx"
        type="range"
        min="-200"
        max="200"
        step="1"
        value="0"
      />
      <output id="motion-vx-value">0</output>
    </label>

    <label class="field compact">
      <span>VY</span>
      <input
        id="motion-vy"
        type="range"
        min="-200"
        max="200"
        step="1"
        value="0"
      />
      <output id="motion-vy-value">0</output>
    </label>
  </div>

  <label class="field compact">
    <span>Rotate</span>
    <input id="motion-rot" type="range" min="-5" max="5" step="0.1" value="0" />
    <output id="motion-rot-value">0</output>
  </label>

  <label class="mini-toggle">
    <input id="motion-loop" type="checkbox" checked />
    <span>Loop</span>
  </label>
</section>
```

---

## 🧱 STEP 2 — Wire Motion Controls

### File: `ui/controls.js`

Add at bottom of file:

```js
// --- MOTION UI ---

const motionEnabled = document.getElementById("motion-enabled");
const motionVX = document.getElementById("motion-vx");
const motionVY = document.getElementById("motion-vy");
const motionRot = document.getElementById("motion-rot");
const motionLoop = document.getElementById("motion-loop");

const motionVXVal = document.getElementById("motion-vx-value");
const motionVYVal = document.getElementById("motion-vy-value");
const motionRotVal = document.getElementById("motion-rot-value");

function getSelectedShape() {
  return state.shapes.find((s) => s.id === state.selectedShapeId);
}

function ensureMotion(shape) {
  if (!shape.motion) {
    shape.motion = {
      enabled: false,
      vx: 0,
      vy: 0,
      angularVelocity: 0,
      loop: true,
    };
  }
}

// ENABLE
motionEnabled.addEventListener("change", () => {
  const shape = getSelectedShape();
  if (!shape) return;

  ensureMotion(shape);
  shape.motion.enabled = motionEnabled.checked;
});

// VX
motionVX.addEventListener("input", () => {
  const shape = getSelectedShape();
  if (!shape) return;

  ensureMotion(shape);
  shape.motion.vx = parseFloat(motionVX.value);
  motionVXVal.textContent = motionVX.value;
});

// VY
motionVY.addEventListener("input", () => {
  const shape = getSelectedShape();
  if (!shape) return;

  ensureMotion(shape);
  shape.motion.vy = parseFloat(motionVY.value);
  motionVYVal.textContent = motionVY.value;
});

// ROTATION
motionRot.addEventListener("input", () => {
  const shape = getSelectedShape();
  if (!shape) return;

  ensureMotion(shape);
  shape.motion.angularVelocity = parseFloat(motionRot.value);
  motionRotVal.textContent = motionRot.value;
});

// LOOP
motionLoop.addEventListener("change", () => {
  const shape = getSelectedShape();
  if (!shape) return;

  ensureMotion(shape);
  shape.motion.loop = motionLoop.checked;
});
```

---

## 🧱 STEP 3 — Sync UI on Selection

### File: `ui/controls.js` OR selection handler file

Add function:

```js
function updateMotionUI(shape) {
  if (!shape) return;

  const m = shape.motion || {
    enabled: false,
    vx: 0,
    vy: 0,
    angularVelocity: 0,
    loop: true,
  };

  motionEnabled.checked = m.enabled;
  motionVX.value = m.vx;
  motionVY.value = m.vy;
  motionRot.value = m.angularVelocity;
  motionLoop.checked = m.loop;

  motionVXVal.textContent = m.vx;
  motionVYVal.textContent = m.vy;
  motionRotVal.textContent = m.angularVelocity;
}
```

---

### Hook it into selection flow

Find where shape selection occurs (likely `onSelectShape` or `selectShape()`)

Add:

```js
const shape = getSelectedShape();
updateMotionUI(shape);
```

---

## 🧪 Expected Behavior

1. Select a shape
2. Open Inspector
3. Enable Motion
4. Adjust sliders

Result:

- shape moves immediately
- no refresh required
- motion persists in state

---

## 🚫 Do NOT

- do NOT mutate segments directly
- do NOT bypass ShapeSystem transforms
- do NOT create global motion state
- do NOT add animation loops outside main tick

---

## ✅ Success Criteria

- Motion UI appears in inspector
- Values update correctly when selecting shapes
- Motion changes apply instantly
- No console errors
- No interference with existing tools

---

## ⚡ Implementation Guide

**where**

- `index.html` → inspector block
- `ui/controls.js` → event + sync logic

**run**

- reload app
- select shape → enable motion

**expect**

- real-time movement + rotation
- loop wrapping if enabled
