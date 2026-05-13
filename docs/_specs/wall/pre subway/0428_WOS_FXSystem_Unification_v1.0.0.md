# 0428_WOS_FXSystem_Unification_v1.0.0.md

**Date:** 2026-04-28
**System:** Wall of Sound (WOS)
**Domain:** Behavior / FX
**Status:** READY
**Summary:**
Unify “Emission”, presets, and particle settings into a single **FX system**. Replace ambiguous terminology with clear roles: **FX Color + FX Style + Advanced FX params**. No behavior changes—UI + naming + wiring only.

---

## 🎯 Objective

- Replace **Emission** terminology with **FX**
- Collapse **presets + emitter** into one system
- Keep **Behavior Panel** as the only editor
- Preserve existing functionality

---

## 🧠 Model

```js id="v2b8zq"
stroke.motion = {
  mode: "pingpong" | "loop" | "once",

  fx: {
    colorSource: "note" | "custom",
    color: "#ffffff",

    style: "orbit" | "comet" | "dust" | "burst" | "ribbon",

    // advanced (optional UI)
    rate: 40,
    spread: 0.3,
    speed: 120,
    size: 3,
    life: 1.0,
    type: "dot" | "streak" | "glow",
  },
};
```

> Backward compat: if `stroke.motion` has flat fields (`rate`, `spread`, etc.), map them into `fx` on read.

---

## 🧩 Patch 1 — Rename UI (no logic change)

### 📄 index.html

- Replace section title:

```html id="l8y3pz"
<h4>EMISSION</h4>
```

→

```html id="1m2h3a"
<h4>FX</h4>
```

- Replace label “Source” with “Color”

```html id="g5h9td"
<label>Color</label>
<select id="bp-fx-color-source">
  <option value="note">Note</option>
  <option value="custom">Custom</option>
</select>
<input type="color" id="bp-fx-color" />
```

- Remove “Stroke” option

---

## 🧩 Patch 2 — Remove square-dot row

Delete any placeholder swatch grid not wired to real data:

```html id="y8c2ps"
<div class="square-dots">...</div>
```

---

## 🧩 Patch 3 — Unify Presets as FX Styles

Replace preset buttons to set `fx.style`:

```html id="9tq8we"
<div class="bp-fx-styles">
  <button data-style="orbit">Orbit</button>
  <button data-style="comet">Comet</button>
  <button data-style="dust">Dust</button>
  <button data-style="burst">Burst</button>
  <button data-style="ribbon">Ribbon</button>
</div>
```

---

## 🧩 Patch 4 — Style → Parameter Mapping

### 📄 main.js

```js id="r6z3mv"
const FX_STYLES = {
  orbit: { rate: 60, spread: 0.1, speed: 100, size: 2, life: 1.5, type: "dot" },
  comet: {
    rate: 80,
    spread: 0.2,
    speed: 300,
    size: 4,
    life: 0.4,
    type: "streak",
  },
  dust: { rate: 120, spread: 1.8, speed: 40, size: 2, life: 2.5, type: "dot" },
  burst: {
    rate: 200,
    spread: 6.28,
    speed: 200,
    size: 5,
    life: 0.5,
    type: "dot",
  },
  ribbon: {
    rate: 30,
    spread: 0.05,
    speed: 80,
    size: 3,
    life: 3.0,
    type: "streak",
  },
};
```

---

## 🧩 Patch 5 — Apply Style on Selection

```js id="x3q7cb"
function applyFXStyle(stroke, style) {
  const base = FX_STYLES[style];
  if (!stroke.motion) stroke.motion = {};
  if (!stroke.motion.fx) stroke.motion.fx = {};

  Object.assign(stroke.motion.fx, base);
  stroke.motion.fx.style = style;
}
```

Bind buttons:

```js id="8y2d4l"
document.querySelectorAll("[data-style]").forEach((btn) => {
  btn.onclick = () => {
    const stroke = getSelectedStroke();
    if (!stroke) return;
    applyFXStyle(stroke, btn.dataset.style);
    _wos_syncBehaviorPanel?.();
  };
});
```

---

## 🧩 Patch 6 — Color Resolution (FX only)

```js id="5s9r2n"
function resolveFXColor(stroke) {
  const fx = stroke.motion?.fx || {};

  if (fx.colorSource === "note") {
    return noteToColor(WOS.currentNote);
  }

  return fx.color || "#ffffff";
}
```

Replace all emitter color usage with `resolveFXColor(stroke)`.

---

## 🧩 Patch 7 — Walker / Particle Read Path

Update spawn to read from `fx`:

```js id="j3b6wp"
const fx = stroke.motion?.fx || {};

spawnParticleUnified(
  {
    x: w.x,
    y: w.y,
    vx,
    vy,
    size: fx.size ?? 3,
    life: fx.life ?? 1.0,
    type: fx.type ?? "dot",
    color: resolveFXColor(stroke),
  },
  dt,
);
```

---

## 🧩 Patch 8 — Advanced (Collapsible)

Wrap raw sliders:

```html id="q0z7fd"
<details>
  <summary>Advanced</summary>
  <!-- rate / spread / speed / size / life -->
</details>
```

Bind to `stroke.motion.fx.*`

---

## 🧩 Patch 9 — Backward Compatibility

On read:

```js id="b7u4kz"
function getFX(stroke) {
  const m = stroke.motion || {};
  if (m.fx) return m.fx;

  // migrate flat fields → fx
  const fx = {
    rate: m.rate,
    spread: m.spread,
    speed: m.speed,
    size: m.size,
    life: m.life,
    type: m.type,
    colorSource: m.colorSource,
    color: m.color,
  };
  m.fx = fx;
  return fx;
}
```

---

## 🧪 Validation

- [ ] Selecting style updates visuals immediately
- [ ] Changing color source switches correctly
- [ ] Advanced sliders override style defaults
- [ ] Undo/redo preserves `stroke.motion.fx`
- [ ] Save/load preserves FX
- [ ] No references to “Emission” remain

---

## 🚀 Implementation Guide

- **Where code goes**
  `index.html` (labels + layout), `main.js` (style map, bindings, resolveFXColor)

- **What to run**
  Select stroke → choose style → adjust advanced → change note

- **What to expect**
  Clear, single FX system controlling visuals + particles
