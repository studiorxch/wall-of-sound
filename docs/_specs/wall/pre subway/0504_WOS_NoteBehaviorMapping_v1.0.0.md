# 0504_WOS_NoteBehaviorMapping_v1.0.0.md

---

## 🧠 SYSTEM OVERVIEW

This system maps MIDI note data into **visual behavior**, **motion influence**, and **collision response**.

The goal is to make each note feel like an active object, not a passive dot.

---

## 🎯 OBJECTIVES

1. Convert MIDI values into meaningful note behavior
2. Give notes different visual personalities
3. Let note data influence walker motion
4. Preserve clear defaults so imported MIDI works immediately

---

## 🧩 INPUT DATA

Each imported MIDI note should provide:

```js
{
  pitch: 60,
  velocity: 92,
  duration: 0.25,
  startTime: 1.5
}
```

---

## 🧬 OUTPUT DATA

Each MIDI note becomes a `NoteNode`:

```js
{
  id: "note_001",
  x: 420,
  y: 260,

  pitch: 60,
  velocity: 92,
  duration: 0.25,
  startTime: 1.5,

  triggerRadius: 10,

  visual: {
    baseSize: 7,
    scale: 1,
    glow: 0,
    hue: 0,
    alpha: 1
  },

  behavior: {
    bounce: 0.4,
    gravity: 0,
    stickiness: 0.1,
    drift: 0,
    orbit: 0
  }
}
```

---

## 🎼 MAPPING RULES

### Pitch Class → Color

```js
const NOTE_HUES = {
  0: 0, // C
  1: 30, // C#
  2: 60, // D
  3: 90, // D#
  4: 120, // E
  5: 160, // F
  6: 200, // F#
  7: 230, // G
  8: 260, // G#
  9: 290, // A
  10: 320, // A#
  11: 340, // B
};

function getPitchHue(pitch) {
  return NOTE_HUES[pitch % 12] ?? 0;
}
```

---

### Velocity → Size / Glow / Bounce

```js
function normalizeVelocity(velocity) {
  return Math.max(0, Math.min(1, velocity / 127));
}

function mapVelocityToBehavior(velocity) {
  const v = normalizeVelocity(velocity);

  return {
    baseSize: 5 + v * 8,
    triggerRadius: 8 + v * 10,
    glowBoost: 0.3 + v * 0.7,
    bounce: 0.15 + v * 0.85,
  };
}
```

---

### Duration → Stickiness / Sustain

Longer notes should hold the walker slightly longer.

```js
function mapDurationToBehavior(duration) {
  const d = Math.max(0, Math.min(1, duration / 2));

  return {
    stickiness: d * 0.4,
    sustainGlow: d,
  };
}
```

---

### Pitch Register → Gravity

Low notes pull downward.
High notes lift upward.

```js
function mapPitchToGravity(pitch) {
  const center = 60; // C4
  const offset = pitch - center;

  return Math.max(-1, Math.min(1, -offset / 24));
}
```

Result:

- Low notes → positive gravity / heavier pull
- Middle notes → neutral
- High notes → anti-gravity / lift

---

## 🧲 NOTE BEHAVIOR PRESETS

### Low Notes

```js
{
  behaviorRole: "weight",
  gravity: 0.6,
  bounce: 0.25,
  stickiness: 0.25
}
```

Feel: heavy, grounded, bass-like.

---

### Mid Notes

```js
{
  behaviorRole: "pulse",
  gravity: 0,
  bounce: 0.5,
  stickiness: 0.1
}
```

Feel: stable rhythmic marker.

---

### High Notes

```js
{
  behaviorRole: "lift",
  gravity: -0.6,
  bounce: 0.75,
  stickiness: 0.05
}
```

Feel: floating, bright, reactive.

---

## 🧱 NOTE CREATION FUNCTION

```js
function createNoteNodeFromMidi(midiNote, position) {
  const velocityMap = mapVelocityToBehavior(midiNote.velocity);
  const durationMap = mapDurationToBehavior(midiNote.duration);

  return {
    id: `note_${crypto.randomUUID()}`,
    x: position.x,
    y: position.y,

    pitch: midiNote.pitch,
    velocity: midiNote.velocity,
    duration: midiNote.duration,
    startTime: midiNote.startTime,

    triggerRadius: velocityMap.triggerRadius,

    visual: {
      baseSize: velocityMap.baseSize,
      scale: 1,
      glow: 0,
      hue: getPitchHue(midiNote.pitch),
      alpha: 1,
      sustainGlow: durationMap.sustainGlow,
    },

    behavior: {
      bounce: velocityMap.bounce,
      gravity: mapPitchToGravity(midiNote.pitch),
      stickiness: durationMap.stickiness,
      drift: 0,
      orbit: 0,
    },

    state: {
      lastTriggerTime: -Infinity,
      cooldownMs: 60,
      active: false,
    },
  };
}
```

---

## 🧪 COLLISION RESPONSE EXTENSION

When a walker hits a note, behavior data should influence motion.

```js
function applyNoteBehaviorToWalker(walker, note) {
  applyBounce(walker, note);
  applyGravityImpulse(walker, note);
  applyStickiness(walker, note);
}
```

---

### Bounce

```js
function applyBounce(walker, note) {
  const dx = walker.x - note.x;
  const dy = walker.y - note.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  const nx = dx / len;
  const ny = dy / len;

  walker.vx += nx * note.behavior.bounce * 2;
  walker.vy += ny * note.behavior.bounce * 2;
}
```

---

### Gravity Impulse

```js
function applyGravityImpulse(walker, note) {
  walker.vy += note.behavior.gravity * 1.5;
}
```

---

### Stickiness

```js
function applyStickiness(walker, note) {
  const amount = Math.max(0, Math.min(0.85, note.behavior.stickiness));
  const factor = 1 - amount;

  walker.vx *= factor;
  walker.vy *= factor;
}
```

---

## 🎨 VISUAL RESPONSE EXTENSION

```js
function triggerMappedNoteVisual(note) {
  const v = normalizeVelocity(note.velocity);

  note.visual.scale = 1.3 + v * 0.7;
  note.visual.glow = 0.5 + v * 0.5;
  note.state.active = true;
}
```

---

## 🧭 DEFAULTS

Use safe defaults when MIDI data is missing:

```js
const DEFAULT_NOTE_BEHAVIOR = {
  velocity: 80,
  duration: 0.25,
  triggerRadius: 10,
  cooldownMs: 60,
};
```

---

## 🚫 NON-GOALS

- No advanced force fields yet
- No multi-walker behavior arbitration
- No chord-cluster logic
- No visual particle bursts
- No AI behavior generation

---

## ✅ ACCEPTANCE TESTS

- Low notes feel heavier
- High notes feel lighter / more reactive
- Velocity clearly changes node size and collision energy
- Duration slightly affects hold / sustain
- Same MIDI file feels visually more alive without changing notes

---

## IMPLEMENTATION GUIDE

- **Where code goes:** note creation/mapping near MIDI import; collision response near walker-note collision resolution.
- **What to run:** import MIDI, render note nodes, attach walker, enable walker-note collision.
- **What to expect:** notes now carry behavior; walker motion changes based on pitch, velocity, and duration.

---
