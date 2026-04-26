---
layout: spec
title: "mainjs patch"
date: 2026-04-17
doc_id: "0417_WALL_OF_SOUND_mainjs_patch_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "audio_system"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

# 0417_WALL_OF_SOUND_mainjs_patch_v1.0.0

## Scope
Single-file patch: `main.js`

Applies motion-driven sound triggering to particles by replacing one-shot birth triggers with velocity-based expression logic.

---

## Change 1 — tick() Sound Loop Rewrite

### FIND (or equivalent pattern)
```js
if (!ball.sound) return;
if (ball._soundFired) return;

dispatchCollisionEvent(ball);
ball._soundFired = true;
```

### REPLACE WITH
```js
if (!ball.sound) return;

const speed = Math.hypot(ball.vx, ball.vy);

// Trigger on motion, not birth
if (speed > 2.5 && !ball._played) {

  // Velocity-based MIDI scaling
  const velocityBoost = Math.min(127, 60 + (ball.hitCount || 0) * 20);

  if (ball.sound.midi) {
    ball.sound.midi.velocity = velocityBoost;
  }

  // Micro pitch drift to prevent static repetition
  if (typeof ball.sound.frequency === "number") {
    const drift = 1 + (Math.random() - 0.5) * 0.04; // ±2%
    ball.sound.frequency *= drift;
  }

  dispatchCollisionEvent(ball);
  ball._played = true;
}

// Reset gate when particle slows down
if (speed < 1.2) {
  ball._played = false;
}
```

---

## Change 2 — Emitter Initialization Update

### FIND (both emitter functions)
```js
ball._soundFired = false;
```

### REPLACE WITH
```js
ball._played = false;
```

---

## Change 3 — normalizeBall Initialization

### ADD
```js
ball._played = false;
```

---

## Remove Deprecated State

### DELETE ALL
```js
ball._soundFired
```

---

## Assumptions

- `ball.vx`, `ball.vy` exist and are numeric
- `dispatchCollisionEvent()` is the correct sound trigger
- `ball.hitCount` is incremented elsewhere (fallback = 0)
- `ball.sound` may contain:
  - `midi.velocity`
  - `frequency`

---

## Expected Behavior

- No sound on spawn
- Sound triggered only by motion energy
- Faster particles = louder/stronger hits
- Subtle pitch variation prevents repetition fatigue
- Natural retrigger cycle based on slowdown → reacceleration

---

## Implementation Guide

- Where: `main.js` → inside `tick()` particle loop + emitter + normalizeBall
- Run: reload app
- Expect: particles behave like expressive instruments, not one-shot triggers
