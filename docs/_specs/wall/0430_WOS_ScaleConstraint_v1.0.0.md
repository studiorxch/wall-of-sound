# 0430_WOS_ScaleConstraint_v1.0.0.md

**Date:** 04/30/2026
**System:** Wall of Sound (WOS)
**Domain:** Composition Layer
**Component:** Scale Constraint (Lightweight)
**Status:** Ready for Implementation

---

# 🧠 PURPOSE

Introduce optional scale-based note constraint at the **stroke level**, allowing musical coherence without restricting system flexibility.

---

# 🎯 GOAL

Ensure that:

```text
stroke.note → conforms to musical scale (optional)
```

Without breaking:

- per-stroke control
- existing fallback behavior
- event system

---

# 🧱 CURRENT STATE

System already supports:

- `quantizeToScale(note, root, type)`
- `state.audio.scale`
- per-event quantization

Limitation:

```text
quantization happens AFTER note assignment
```

👉 This makes stroke intent unpredictable

---

# ✅ SOLUTION

Move scale constraint closer to **note definition layer**

---

# 🔩 IMPLEMENTATION

## 1. ADD STROKE FLAG

```js
stroke.useScale = true; // default
```

---

## 2. APPLY SCALE DURING EVENT RESOLUTION

Inside `resolveNoteAndSample()`:

Replace:

```js
note = sourceObject.sound.midi.note || 60;

if (state.audio.scale.enabled) {
  note = quantizeToScale(note, root, type);
}
```

---

### With:

```js
note = sourceObject.sound.midi.note || 60;

var useScale = sourceObject.useScale !== false; // default true

if (useScale && state.audio.scale.enabled) {
  note = quantizeToScale(note, state.audio.scale.root, state.audio.scale.type);
}
```

---

## 3. PASS FLAG FROM STROKE

When emitting:

```js
emitEvent({
  ...
  data: {
    note: stroke.note
  },
  useScale: stroke.useScale
});
```

---

## 4. PRESERVE FALLBACK

If no stroke:

```js
useScale defaults to true
```

---

# 🎼 SUPPORTED SCALES

Already available:

```js
major;
minor;
pentatonic;
```

Future-safe:

```js
dorian;
phrygian;
custom;
```

---

# 🎛️ BEHAVIOR

## Case 1 — Default

```js
stroke.useScale = true;
```

👉 Notes snap to scale

---

## Case 2 — Free Mode

```js
stroke.useScale = false;
```

👉 Full chromatic freedom

---

## Case 3 — Mixed System

Different strokes:

```js
lead → useScale true
fx   → useScale false
```

👉 harmonic + noise coexist

---

# 🧪 TEST PLAN

## Test 1 — Scale ON

```js
state.audio.scale.enabled = true;
state.audio.scale.root = 60;
state.audio.scale.type = "major";
```

Draw random notes → all snap to C major

---

## Test 2 — Scale OFF per stroke

```js
stroke.useScale = false;
```

Expected:

- notes bypass scale
- chromatic tones allowed

---

## Test 3 — Mixed

Multiple strokes:

- some quantized
- some not

Expected:

- layered harmonic + dissonant system

---

# 🚫 NON-GOALS

- No UI controls
- No scale editor
- No chord system
- No sequencing

---

# 🧠 DESIGN PRINCIPLE

> Constraint should be optional and local

---

# 🏁 SUMMARY

This adds:

```text
controlled musical coherence
```

Without removing:

```text
creative freedom
```

---

# Implementation Guide

- **Where:** `resolveNoteAndSample()` + event emission
- **What to run:** toggle stroke.useScale and compare output
- **What to expect:** harmonic consistency when enabled, full freedom when disabled
