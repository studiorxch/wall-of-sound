# 0413_WALL_OF_SOUND_AudioStateFix_v1.0.0

Generated: 04/13/2026

---

## 🎯 Objective

Fix critical issue where:

1. Undo breaks sound playback
2. Saved JSON scenes lose sound functionality

Ensure:

> Sound is ALWAYS reproducible from scene data alone

---

## 🧠 Core Principle

Audio must be **derived state**, not stored runtime state.

```js
scene → geometry → collision → sound
```

NOT:

```js
scene + hidden runtime state → sound
```

---

## 🔥 Problems Identified

### 1. Undo does not restore audio bindings

- `applyScene()` restores geometry only
- Audio system is not reinitialized

---

### 2. JSON serialization is incomplete

- `note` and `midiChannel` may be missing or undefined
- Causes silent collisions after reload

---

### 3. Audio system relies on stale runtime state

- MIDI triggers depend on previous session state
- Not rebuilt after undo/load

---

## ✅ Required Fixes

---

## 🧱 FIX 1 — Enforce Segment Audio Integrity

### Update Segment Definition

```ts
type Segment = {
  id: string;
  type: string;

  x1: number;
  y1: number;
  x2: number;
  y2: number;

  color: string;
  thickness: number;

  note: number; // REQUIRED
  midiChannel: number; // REQUIRED

  behavior?: string;
};
```

### Rule

- `note` and `midiChannel` must NEVER be undefined
- Assign defaults during creation AND hydration

---

## 🧱 FIX 2 — Safe Serialization

### File: sceneManager.js OR shapeSystem.js

```js
function serializeSegment(seg) {
  return {
    id: seg.id,
    type: seg.type,
    x1: seg.x1,
    y1: seg.y1,
    x2: seg.x2,
    y2: seg.y2,
    color: seg.color,
    thickness: seg.thickness,

    note: seg.note ?? 60, // default middle C
    midiChannel: seg.midiChannel ?? 1, // default channel

    behavior: seg.behavior ?? "none",
  };
}
```

---

## 🧱 FIX 3 — Safe Hydration

```js
function hydrateSegment(raw) {
  return {
    ...raw,

    note: raw.note ?? 60,
    midiChannel: raw.midiChannel ?? 1,

    behavior: raw.behavior ?? "none",
  };
}
```

Apply this for:

- lines
- shapes
- ALL segment sources

---

## 🧱 FIX 4 — Rebuild Audio After Scene Load

### File: main.js

### Add:

```js
function rebuildAudioBindings(state) {
  const segments = [];

  // lines
  state.lines.forEach((line) => segments.push(line));

  // shapes
  state.shapes.forEach((shape) => {
    shape.segments.forEach((seg) => segments.push(seg));
  });

  // validate
  segments.forEach((seg) => {
    if (seg.note == null) seg.note = 60;
    if (seg.midiChannel == null) seg.midiChannel = 1;
  });

  // optional: future MIDI cache rebuild here
}
```

---

### Modify applyScene()

```js
function applyScene(scene) {
  // existing logic
  state.lines = scene.lines || [];
  state.shapes = scene.shapes || [];

  // NEW
  rebuildAudioBindings(state);

  renderFrame();
}
```

---

## 🧱 FIX 5 — Fix Undo Pipeline

Wherever undo restores state:

### BEFORE (broken)

```js
applyScene(prevState);
```

### AFTER (correct)

```js
applyScene(prevState);
rebuildAudioBindings(state);
```

---

## 🧱 FIX 6 — Stateless Audio Trigger

### File: midiOut.js OR collision handler

### Replace:

```js
playNote(segment);
```

### With:

```js
playNote({
  note: segment.note,
  velocity: 100,
  channel: segment.midiChannel,
});
```

---

### Ensure playNote is PURE

```js
function playNote({ note, velocity = 100, channel = 1 }) {
  if (note == null) return;

  // send MIDI event
}
```

NO dependency on:

- previous note
- cached channel
- global state

---

## 🧱 FIX 7 — Debug Guard (Temporary)

Add validation:

```js
function validateSegments(state) {
  const allSegments = [];

  state.lines.forEach((l) => allSegments.push(l));
  state.shapes.forEach((s) =>
    s.segments.forEach((seg) => allSegments.push(seg)),
  );

  allSegments.forEach((seg) => {
    if (seg.note == null) {
      console.warn("Missing note:", seg.id);
    }
  });
}
```

Call after:

- applyScene
- undo

---

## 🧪 Test Plan

### Test 1 — Undo Stability

1. Draw shape
2. Assign notes
3. Undo
4. Redo

✅ Expected:

- sound still triggers

---

### Test 2 — JSON Roundtrip

1. Create scene
2. Save JSON
3. Reload JSON

✅ Expected:

- identical sound behavior

---

### Test 3 — Mixed System

1. Lines + Shapes
2. Assign different notes
3. Run swarm

✅ Expected:

- all collisions produce sound

---

## 🚫 Constraints

DO NOT:

- modify physics engine
- modify collision system logic
- add new audio features
- change UI

ONLY:

- stabilize audio state consistency

---

## 🧭 Success Criteria

✔ Undo never breaks sound
✔ JSON reload preserves sound
✔ No segment exists without note
✔ Audio is 100% derived from scene

---

## ⚡ Implementation Guide

- **Where:** `sceneManager.js`, `main.js`, segment serialize/hydrate, `midiOut.js`
- **Run:** Undo + Save/Load test cycle
- **Expect:** Sound persists across ALL state transitions

---

## 🧬 Version Notes

v1.0.0

- Initial stabilization pass for audio-state consistency
- Introduces rebuildAudioBindings system
- Enforces segment audio integrity
