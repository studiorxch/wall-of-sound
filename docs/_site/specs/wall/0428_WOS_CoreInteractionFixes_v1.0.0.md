# 0428_WOS_CoreInteractionFixes_v1.0.0

Generated: 04/28/2026

---

## 🎯 PURPOSE

Stabilize core interaction layer so the Object Inspector becomes a **live control surface**.

This pass fixes:

- broken bindings (color, width, mode)
- missing propagation to walkers
- lack of opacity system
- absence of motion presets
- adds tunnel motion mode

NO UI redesign. NO system rewrites.

---

## ⚙️ ASSUMPTIONS

- Strokes exist as `stroke` objects with:
  - `id`
  - `color`
  - `width`
  - `motion`

- Walkers exist in `state.walkers`
- Walkers now include:
  - `strokeId`

- Inspector already writes to `stroke.motion`

---

# 🔧 PATCH 1 — WIDTH PROPAGATION FIX

## Problem

Stroke width updates do not reflect visually.

## Fix

### Add function:

```js
function applyStrokeWidth(stroke) {
  if (!stroke) return;

  const t = stroke.width;

  // unify render + collision thickness
  stroke.thickness = t;

  // update segments if present
  if (stroke.segments) {
    stroke.segments.forEach((s) => {
      s.thickness = t;
    });
  }
}
```

---

## Hook into:

```js
function applyStrokeUpdates(stroke) {
  if (!stroke) return;

  applyStrokeWidth(stroke);
  applyModeToStroke(stroke);
  applyPresetToWalkers(stroke);
}
```

---

# 🔁 PATCH 2 — MODE PROPAGATION (FIXED)

## Problem

Changing mode does nothing on active walkers.

## Fix

```js
function applyModeToStroke(stroke) {
  if (!stroke || !stroke.motion) return;

  const mode = stroke.motion.mode;

  state.walkers.forEach((w) => {
    if (w.strokeId === stroke.id) {
      w.motionMode = mode;
    }
  });
}
```

---

# 🌀 PATCH 3 — TUNNEL MODE

## Add new mode:

```js
"tunnel";
```

---

## Walker update patch:

```js
function applyTunnelMode(walker) {
  if (walker.motionMode !== "tunnel") return;

  if (walker.t >= 1) walker.t = 0;
  if (walker.t <= 0) walker.t = 1;
}
```

---

## Insert into walker loop:

```js
updateWalkerMovement(walker);

applyTunnelMode(walker);
```

---

# 🌫️ PATCH 4 — OPACITY SYSTEM (REPLACES AUTO-BAKE)

## Add to stroke:

```js
stroke.opacity = 1.0;
```

---

## Renderer patch:

Before drawing stroke:

```js
ctx.globalAlpha = stroke.opacity;
```

After drawing:

```js
ctx.globalAlpha = 1;
```

---

## Performance rule:

```js
if (stroke.opacity === 0) return;
```

Apply to:

- render pass
- collision pass

---

# 🎨 PATCH 5 — NOTE COLOR PROPAGATION

## Problem

Note changes do not update stroke color.

## Fix

```js
function applyNoteColorToSelection(note) {
  const stroke = getSelectedStroke();
  if (!stroke) return;

  stroke.color = noteToColor(note);

  renderFrame();
}
```

---

## Hook into note click:

After:

```js
WOS.currentNote = note;
```

Add:

```js
applyNoteColorToSelection(note);
```

---

# 🎛️ PATCH 6 — MOTION PRESETS (FOUNDATION)

## Add registry:

```js
const MOTION_PRESETS = {
  drift: {
    walker: { speed: 0.0012, mode: "loop" },
    emission: { rate: 120, spread: 0.4, life: 1.8, size: 2 },
  },
  pulse: {
    walker: { speed: 0.0035, mode: "pingpong" },
    emission: { rate: 40, spread: 0.1, life: 0.4, size: 3 },
  },
  tunnel: {
    walker: { speed: 0.0028, mode: "tunnel" },
  },
};
```

---

## Apply function:

```js
function applyMotionPreset(stroke, id) {
  const preset = MOTION_PRESETS[id];
  if (!preset || !stroke) return;

  stroke.motionPreset = id;

  if (!stroke.motion) stroke.motion = {};

  Object.assign(stroke.motion, preset.walker);

  applyStrokeUpdates(stroke);
}
```

---

## Walker sync:

```js
function applyPresetToWalkers(stroke) {
  const preset = MOTION_PRESETS[stroke.motionPreset];
  if (!preset) return;

  state.walkers.forEach((w) => {
    if (w.strokeId === stroke.id) {
      Object.assign(w, preset.walker);
    }
  });
}
```

---

# 🧠 PATCH 7 — CENTRAL UPDATE PIPELINE

## REQUIRED

Every inspector change must call:

```js
applyStrokeUpdates(stroke);
renderFrame();
```

---

# ✅ VALIDATION CHECKLIST

After implementation:

### Interaction

- [ ] Stroke auto-selects after draw
- [ ] Note click changes stroke color instantly
- [ ] Width slider updates stroke thickness live
- [ ] Mode dropdown affects active walkers immediately
- [ ] Tunnel mode loops correctly (no bounce)

### Visual

- [ ] Opacity slider fades stroke correctly
- [ ] Opacity 0 removes stroke visually and from collision

### Behavior

- [ ] Presets apply instantly
- [ ] Walkers update without recreation

---

# ❌ DO NOT

- do not recreate walkers
- do not delete `state.motion`
- do not add new panels
- do not refactor architecture

---

# 🚀 RESULT

System becomes:

```text
draw → select → tweak → immediate response
```

NOT:

```text
draw → guess → reselect → hope it updates
```

---

# ⚡ IMPLEMENTATION GUIDE

- **where code goes**
  - `main.js` → all patches (updates, presets, walker logic)
  - renderer → opacity + width usage

- **what to run**
  - reload app
  - draw stroke → adjust inspector controls

- **what to expect**
  - all controls respond instantly
  - no re-selection needed
  - motion behaves predictably

---

END
