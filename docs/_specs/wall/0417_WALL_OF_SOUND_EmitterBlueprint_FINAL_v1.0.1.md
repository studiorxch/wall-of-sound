---
layout: spec
title: "EmitterBlueprint FINAL"
date: 2026-04-17
doc_id: "0417_WALL_OF_SOUND_EmitterBlueprint_FINAL_v1.0.1"
version: "1.0.1"
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

# 0417_WALL_OF_SOUND_EmitterBlueprint_FINAL_v1.0.1.md

## Scope
Single-file patch: `main.js`  
Goal: Complete Step 4 with **correct note inheritance** + stabilized blueprint system

---

## ✅ Summary of Fix
Prevents all particles defaulting to C by inheriting the emitter's actual MIDI note.

---

## 🔧 Step 4 FINAL — Patch Instructions

### 1. Fix Blueprint Note Inheritance (CRITICAL)

#### FIND (in BOTH emitter spawn functions)
```js
ball.blueprint = clone(cfg.blueprint || {
  note: 60,
  velocityBase: 70,
  velocityRange: [60, 120],
  pitchDrift: 0.02,
  retriggerMode: "energy",
});
```

#### REPLACE WITH
```js
const sourceNote =
  (line && line.sound && line.sound.midi && line.sound.midi.note) ??
  (seg && seg.sound && seg.sound.midi && seg.sound.midi.note) ??
  60;

ball.blueprint = clone(cfg.blueprint || {
  note: sourceNote,
  velocityBase: 70,
  velocityRange: [60, 120],
  pitchDrift: 0.02,
  retriggerMode: "energy",
});
```

---

### 2. Safe Note Override (guarded)

#### FIND
```js
ball.sound.midi.note = ball.blueprint.note;
```

#### REPLACE WITH
```js
if (
  ball.sound &&
  ball.sound.midi &&
  ball.blueprint &&
  ball.blueprint.note !== undefined
) {
  ball.sound.midi.note = ball.blueprint.note;
}
```

---

### 3. Ensure Base Frequency Exists (stability)

#### INSIDE normalizeBall
```js
if (ball.sound && typeof ball.sound.frequency === "number") {
  ball._baseFrequency = ball.sound.frequency;
}
```

---

### 4. Ensure Drift Uses Base Frequency

#### FIND
```js
ball.sound.frequency *= drift;
```

#### REPLACE
```js
if (ball._baseFrequency) {
  ball.sound.frequency = ball._baseFrequency * drift;
}
```

---

## 🧪 Expected Result

- Each emitter produces its own pitch
- No global “C note lock”
- Motion-driven expression still intact
- Pitch drift remains stable over time

---

## ⚠️ Validation Checklist

- Draw multiple lines with different notes
- Convert them to emitters
- Spawn particles

You should observe:
- Distinct pitches per emitter
- Consistent musical separation
- No pitch drift runaway

---

## 🚀 Implementation Guide

- Where: `main.js` → emitter spawn + tick() + normalizeBall
- Run: reload app
- Expect: emitters behave like independent instruments (correct pitch inheritance)
