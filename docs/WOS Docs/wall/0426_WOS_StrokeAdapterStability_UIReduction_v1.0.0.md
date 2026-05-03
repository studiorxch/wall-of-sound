---
layout: spec
title: "Stroke Adapter Stabilization + UI Reduction"
date: 2026-04-26
doc_id: "0426_WOS_StrokeAdapterStability_UIReduction_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "wall"
component: "stroke_adapter"

type: "stability-spec"
status: "active"
priority: "critical"
risk: "low"

summary: "Stabilizes stroke-to-line adapter system, restores note/color assignment, fixes emitter trigger behavior, and reduces UI clutter by removing legacy Shapes panel."
---

# 🎯 PURPOSE

Fix fragmentation between Mop strokes and engine lines without modifying engine modules.

Restore:

- stroke integrity (no segment behavior)
- note/color assignment system
- proper emitter triggering
- simplified UI

---

# 🚨 CURRENT ISSUES

1. Mop strokes are broken into segments and treated independently
2. Note → color assignment no longer works
3. Key press triggers emitters globally
4. Shapes UI panel adds confusion and is no longer needed

---

# 🧠 CORE PRINCIPLE

```plaintext
strokes[] = source of truth
state.lines[] = derived (engine-only)
```

Segments must never behave independently from their parent stroke.

---

# 🔧 IMPLEMENTATION

## 1. STROKE → LINE ADAPTER (EXISTING)

Keep existing:

```js
strokeToLines(stroke);
```

But enforce:

```js
line._strokeId = stroke.id;
line._isDerived = true;
```

---

## 2. COLLISION AGGREGATION (CRITICAL)

Replace per-line reactions with per-stroke:

```js
const hitStrokeIds = new Set();

for (const line of state.lines) {
  if (line._strokeId && checkCollision(p, line)) {
    hitStrokeIds.add(line._strokeId);
  }
}

for (const id of hitStrokeIds) {
  triggerStrokeCollision(id);
}
```

No direct reaction to individual segments.

---

## 3. RENDER FROM STROKES (NOT LINES)

Ensure Mop strokes render as continuous paths:

```js
function drawStroke(stroke) {
  const pts = stroke.points;
  if (!pts.length) return;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }

  ctx.stroke();
}
```

state.lines must not be used for visual rendering.

---

## 4. NOTE / COLOR SYSTEM RESTORE

Reintroduce vertical note selector.

UI layout:

```plaintext
C
C#
D
D#
E
F
F#
G
G#
A
A#
B
```

Each note button:

```js
onclick = () => {
  WOS.currentNote = note;
  WOS.mode = "assign";
};
```

---

## 5. APPLY NOTE ON STROKE COMMIT

When stroke completes:

```js
stroke.note = WOS.currentNote;
stroke.color = noteToColor(WOS.currentNote);
```

---

## 6. INPUT MODE SEPARATION

Add mode system:

```js
WOS.mode = "assign"; // or "play"
```

Key handling:

```js
function onKeyPress(note) {
  if (WOS.mode === "assign") {
    assignNoteToSelection(note);
  } else if (WOS.mode === "play") {
    triggerEmitters(note);
  }
}
```

---

## 7. FIX EMITTER TRIGGER SCOPE

Remove global trigger:

```js
triggerEmitters(note); // ❌ remove from global input
```

Only trigger inside play mode.

---

## 8. UI REDUCTION

Remove entire Shapes block:

- delete Shapes panel DOM
- remove related event handlers
- remove shape creation tools

Mop becomes primary geometry tool.

---

# 🧪 VALIDATION

- [ ] Mop stroke renders as continuous shape
- [ ] No visible segment artifacts
- [ ] Particles collide correctly
- [ ] Note buttons assign color to strokes
- [ ] Key press does NOT trigger emitters unless in play mode
- [ ] Shapes panel is removed

---

# 🚫 NON-GOALS

- No engine rewrites
- No particle system redesign
- No collision system rewrite
- No object system migration

---

# 🔥 SUCCESS

User draws a Mop stroke:

- appears as one continuous object
- reacts as one object
- carries note + color
- triggers particles correctly
- UI is simplified

---

# 💬 NOTES

This spec formalizes the adapter approach as a stable intermediate architecture.

Prevents repeated regressions caused by segment-level logic and mixed input modes.
