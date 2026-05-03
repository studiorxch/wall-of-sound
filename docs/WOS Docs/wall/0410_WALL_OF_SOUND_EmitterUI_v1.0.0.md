---
layout: spec
title: "EmitterUI"
date: 2026-04-10
doc_id: "0410_WALL_OF_SOUND_EmitterUI_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "emitter_system"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

0410_WALL_OF_SOUND_EmitterUI_v1.0.0

Generated: 04/10/2026

---

## 🎯 Objective

Expose the emitter system as a first-class interactive tool with minimal UI, enabling:

- visual placement of emitters
- control over spawn rate (rhythm)
- control over initial velocity (direction)
- selection and movement like shapes

---

## ⚠️ Scope

DO:

- render emitters
- allow selection + dragging
- add emitter tool
- add small inspector panel

DO NOT:

- redesign UI
- add complex controls
- change physics system

---

## 🧱 System Model

```txt
emitter → spawn → gravity → motion → collision → sound
```

---

## 🔧 Implementation Requirements

---

### 1. State

```js
state.emitters = [];
state.selectedEmitterId = null;
```

---

### 2. Emitter Data Model

```js
type Emitter = {
  id: string;
  x: number;
  y: number;
  rate: number;
  lastSpawn: number;
  velocity: { x: number; y: number };
};
```

---

### 3. Render Emitters

```js
function drawEmitters(ctx, emitters) {
  for (const e of emitters) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#00ffcc";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + e.velocity.x * 10, e.y + e.velocity.y * 10);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
}
```

Insert into render pipeline.

---

### 4. Tool

Add to toolbar:

```html
<button class="tool" data-tool="emitter">Emitter</button>
```

---

### 5. Placement

```js
if (tool === "emitter") {
  state.emitters.push({
    id: generateId(),
    x: pointer.x,
    y: pointer.y,
    rate: 500,
    lastSpawn: 0,
    velocity: { x: 0, y: 0 },
  });
}
```

---

### 6. Selection

```js
function findEmitterAtPoint(emitters, point, r = 20) {
  return emitters.find((e) => {
    const dx = e.x - point.x;
    const dy = e.y - point.y;
    return Math.sqrt(dx * dx + dy * dy) < r;
  });
}
```

---

### 7. Dragging

```js
if (selectedEmitter) {
  selectedEmitter.x += dx;
  selectedEmitter.y += dy;
}
```

---

### 8. Inspector Panel (Minimal)

```html
<div id="emitter-panel">
  <label>Rate</label>
  <input type="range" min="100" max="2000" step="50" />

  <label>Velocity X</label>
  <input type="range" min="-5" max="5" step="0.1" />

  <label>Velocity Y</label>
  <input type="range" min="-5" max="5" step="0.1" />
</div>
```

---

### 9. Binding

```js
emitter.rate = rateInput.value;
emitter.velocity.x = vxInput.value;
emitter.velocity.y = vyInput.value;
```

---

## 🎧 Musical Mapping

| Rate   | Musical Meaning |
| ------ | --------------- |
| 1000ms | 1/4 note        |
| 500ms  | 1/8 note        |
| 250ms  | 1/16 note       |

---

## 🧪 Test Setup

- place emitter at top
- set rate = 500
- set velocity = {0,0}
- enable gravity
- draw ramps

---

## ✅ Expected Behavior

- emitter visible
- draggable
- spawns balls consistently
- rhythm controlled by rate

---

## ⚡ Implementation Guide

- where: canvasRenderer.js, drawTools.js, main.js
- run: place emitter + ramps
- expect: playable marble-run rhythm system
