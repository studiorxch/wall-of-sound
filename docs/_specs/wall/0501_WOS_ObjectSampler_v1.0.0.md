# 0501_WOS_ObjectSampler_v1.0.0.md

**Date:** 05/01/2026
**System:** Wall of Sound (WOS)
**Domain:** Audio Engine
**Component:** Sampling Architecture
**Priority:** HIGH (post-core stabilization)

---

# 🚨 PROBLEM

Current sampler model:

```js
sampleMap[noteClass] → audio buffers
```

This assumes:

👉 notes = instruments

But WOS now operates as:

```text
stroke → event → note → sound
```

👉 strokes = instruments
👉 notes = pitch variation

---

# 🎯 GOAL

Replace global note-based sampler with:

👉 **object-based sampler (per-stroke instruments)**

WITHOUT breaking:

- emitEvent system
- resolveNoteAndSample
- oscillatorOutput.handle

---

# 🧠 NEW MODEL

## Before (global sampler)

```text
noteClass → sample
```

## After (object sampler)

```text
stroke → samples → pitch(note)
```

---

# ✅ CORE CHANGE

## 1. Add sample container to stroke

### In `createStrokeObject`

```js
base.samples = []; // array of AudioBuffers (instrument)
```

---

## 2. Update drop handler (critical shift)

### BEFORE

```js
loadSampleToNote(file, noteClass);
```

---

### AFTER

```js
loadSampleToStroke(file, strokeId);
```

---

### Implementation

```js
async function loadSampleToStroke(file, strokeId) {
  const stroke = state.strokes.find((s) => s.id === strokeId);
  if (!stroke) return false;

  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await state.audio.context.decodeAudioData(arrayBuffer);

  stroke.samples.push(audioBuffer);

  console.log("[sampler] Assigned sample → stroke", strokeId);

  return true;
}
```

---

## 3. Modify drop routing logic

### Replace note targeting:

```js
var noteClass = hoveredNoteClass;
```

---

### With:

```js
var selected = getSelectedStroke();
if (!selected) {
  showToast("Select a stroke to assign sound");
  return;
}
```

---

### Then:

```js
await loadSampleToStroke(file, selected.id);
```

---

# 🔁 SAMPLE RESOLUTION UPDATE

## Modify `resolveNoteAndSample`

---

### BEFORE

```js
var result = getSampleForNote(state, noteClass);
```

---

### AFTER

```js
var stroke = state.strokes.find((s) => s.id === sourceObject.id);

if (stroke && stroke.samples && stroke.samples.length > 0) {
  result = stroke.samples;
  resolvedClass = noteClass; // still used for pitch logic
} else {
  result = getSampleForNote(state, noteClass); // fallback
}
```

---

# 🎚 PLAYBACK LOGIC UPDATE

## Inside `oscillatorOutput.handle`

NO structural change needed.

Already supports:

```js
if (Array.isArray(result)) {
  result.forEach(playSampleBuffer);
}
```

👉 This now plays **multi-sample instruments**

---

# 🎹 PITCH BEHAVIOR (unchanged)

```js
pitch = Math.pow(2, (note - root) / 12);
```

👉 same sample, different pitch = instrument behavior

---

# ⚙️ OPTIONAL (Phase 1.1)

## Limit sample stack

```js
if (stroke.samples.length > 4) {
  stroke.samples.shift(); // keep latest 4
}
```

---

## Randomize within stroke

```js
var sample = stroke.samples[Math.floor(Math.random() * stroke.samples.length)];
```

---

# 🧪 TEST PLAN

## Test 1 — Assign sample

- Select stroke
- Drag audio file

Expected:

```text
[sampler] Assigned sample → stroke
```

---

## Test 2 — Playback

- Trigger walker OR collision

Expected:

- sound plays
- pitch varies across notes

---

## Test 3 — Multiple samples

- assign 2–3 files to same stroke

Expected:

- layered or varied playback

---

## Test 4 — Fallback

- stroke without samples

Expected:

- still uses global sampleMap

---

# 🧠 DESIGN BENEFITS

### ✔ Matches WOS philosophy

- sound comes from **objects**, not keys

---

### ✔ Infinite instrument scaling

- each stroke = unique sound identity

---

### ✔ Simplifies UI

- no need for piano sampler grid

---

### ✔ Supports emergent composition

- visual placement = musical structure

---

# ⚠️ CONSTRAINTS

- DO NOT remove `sampleMap` yet (fallback required)
- DO NOT change event system
- DO NOT change velocity / gain logic
- DO NOT break existing drag/drop

---

# 🏁 SUCCESS CRITERIA

- strokes produce sound independently
- same sample plays across multiple notes (pitched)
- multiple strokes = multiple instruments
- no regression in collision / walker system

---

# Implementation Guide

- **Where:** `createStrokeObject`, drop handler, `resolveNoteAndSample`
- **What to run:** assign sample → trigger collision/walker
- **What to expect:** per-stroke instruments, pitched playback
