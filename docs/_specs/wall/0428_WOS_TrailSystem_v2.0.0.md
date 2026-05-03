# 0428_WOS_TrailSystem_v2.0.0.md

**Date:** 2026-04-28
**System:** Wall of Sound (WOS)
**Domain:** Trail / Debug / Visibility
**Status:** READY
**Summary:**
Introduce a **visible, testable Trail System v2** with built-in debug overlays.
All new functionality must be accessible through the UI—no console-only features.

---

# 🎯 OBJECTIVE

Make motion systems:

- Visible
- Testable
- Understandable in real time

Eliminate:

- hidden state
- console-only debugging
- guesswork

---

# 🧠 PRINCIPLE

```text
If the user cannot toggle it in UI,
it is not part of the system.
```

---

# 🧩 PATCH 1 — ADD TRAIL DEBUG PANEL (UI REQUIRED)

### 📄 index.html

Inside Object Inspector, BELOW Trail section:

```html
<section id="trail-debug-panel" class="inspector-section">
  <h4>Debug</h4>

  <label>
    <input type="checkbox" id="debug-walkers" />
    Show Walkers
  </label>

  <label>
    <input type="checkbox" id="debug-paths" />
    Show Paths
  </label>

  <label>
    <input type="checkbox" id="debug-info" />
    Show Info
  </label>
</section>
```

---

# 🧩 PATCH 2 — DEBUG STATE (NO CONSOLE ONLY)

### 📄 main.js

```js
state.debug = {
  walkers: false,
  paths: false,
  info: false,
};
```

---

# 🧩 PATCH 3 — UI BINDING (MANDATORY)

### 📄 main.js (bindBehaviorPanel or similar)

```js
document.getElementById("debug-walkers").onchange = (e) => {
  state.debug.walkers = e.target.checked;
  renderFrame();
};

document.getElementById("debug-paths").onchange = (e) => {
  state.debug.paths = e.target.checked;
  renderFrame();
};

document.getElementById("debug-info").onchange = (e) => {
  state.debug.info = e.target.checked;
  renderFrame();
};
```

---

# 🧩 PATCH 4 — WALKER VISIBILITY LAYER

### 📄 render loop

```js
if (state.debug.walkers) {
  ctx.fillStyle = walker.color || "#fff";
  ctx.fillRect(w.x - 2, w.y - 2, 4, 4);
}
```

---

# 🧩 PATCH 5 — PATH VISIBILITY

```js
if (state.debug.paths) {
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  drawStrokeOutline(stroke);
}
```

---

# 🧩 PATCH 6 — INFO OVERLAY

```js
if (state.debug.info) {
  ctx.fillStyle = "#fff";
  ctx.font = "10px monospace";
  ctx.fillText(`t:${w.t.toFixed(2)}`, w.x + 6, w.y);
}
```

---

# 🧩 PATCH 7 — WALKER COLOR (VISIBLE IDENTITY)

Ensure walkers inherit color:

```js
walker.color = stroke.color;
```

---

# 🧩 PATCH 8 — TRAIL NAMING (FX → TRAIL)

### 📄 index.html

Replace all labels:

```text
FX → Trail
```

---

# 🧩 PATCH 9 — REMOVE CONSOLE-ONLY FEATURES

Any feature added must:

- have a UI control OR
- be visible by default

❌ NOT allowed:

```js
_wos.debug = true;
```

✅ REQUIRED:

```html
<input type="checkbox" />
```

---

# 🧪 VALIDATION CHECKLIST

### UI Visibility

- [ ] Debug panel is visible in inspector
- [ ] Checkboxes toggle immediately

### Walker Layer

- [ ] Walkers appear when enabled
- [ ] Walkers disappear when disabled

### Path Layer

- [ ] Stroke outlines visible in debug mode

### Info Layer

- [ ] t-values display correctly

---

# 🚫 DO NOT

- do not hide debug behind console
- do not add features without UI toggle
- do not create new panels outside inspector
- do not require page reload to see changes

---

# 🚀 RESULT

```text
draw → select → toggle debug → SEE behavior
```

Instead of:

```text
draw → guess → console → maybe understand
```

---

# ⚡ IMPLEMENTATION GUIDE

- **Where code goes**
  - `index.html` → debug panel
  - `main.js` → bindings + render overlay

- **What to run**
  - reload app → select object → toggle debug

- **What to expect**
  - immediate visual confirmation of system state

````

---

# 🔥 Why this spec matters

You just set a **development rule**:

> UI = truth layer

That changes everything:
- faster iteration
- fewer hidden bugs
- real feedback loop

---

If Claude follows this correctly, you’ll immediately feel:

```text
“I know what the system is doing”
````

instead of:

```text
“I think it’s working…?”
```

---
