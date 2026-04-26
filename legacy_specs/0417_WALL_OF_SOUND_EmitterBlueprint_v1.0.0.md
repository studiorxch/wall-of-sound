# 0417_WALL_OF_SOUND_EmitterBlueprint_v1.0.0.md

## Scope
Single-file patch: `main.js`  
Goal: Introduce Emitter → Particle Blueprint inheritance

---

## Step 1 — Add Blueprint Structure

Add inside emitter initialization:

```js
emitter.blueprint = {
  note: 60,
  velocityBase: 70,
  velocityRange: [60, 120],
  pitchDrift: 0.02,
  retriggerMode: "energy",
};
```

---

## Step 2 — Attach Blueprint on Spawn

After creating and normalizing a ball in BOTH emitter functions:

```js
ball.blueprint = clone(line.blueprint || {
  note: 60,
  velocityBase: 70,
  velocityRange: [60, 120],
  pitchDrift: 0.02,
  retriggerMode: "energy",
});
```

---

## Step 3 — Replace Velocity Logic

Replace:

```js
const velocityBoost = Math.min(127, 60 + (ball.hitCount || 0) * 20);
```

With:

```js
const bp = ball.blueprint || {};

const base = bp.velocityBase || 70;
const range = bp.velocityRange || [60, 120];

const velocityBoost = clampInt(
  base + (ball.hitCount || 0) * 20,
  range[0],
  range[1]
);
```

---

## Step 4 — Blueprint Pitch Drift

Replace:

```js
const drift = 1 + (Math.random() - 0.5) * 0.04;
```

With:

```js
const driftAmount = (ball.blueprint?.pitchDrift ?? 0.02) * 2;
const drift = 1 + (Math.random() - 0.5) * driftAmount;
```

---

## Step 5 — Blueprint Note Override

Before dispatchCollisionEvent(ball):

```js
if (ball.sound && ball.blueprint?.note !== undefined) {
  ball.sound.midi.note = ball.blueprint.note;
}
```

---

## Step 6 — Base Frequency Stabilization

Add inside normalizeBall:

```js
if (ball.sound && typeof ball.sound.frequency === "number") {
  ball._baseFrequency = ball.sound.frequency;
}
```

Replace drift application:

```js
if (ball._baseFrequency) {
  ball.sound.frequency = ball._baseFrequency * drift;
}
```

---

## Step 7 — Safety Guard

Ensure inside motion trigger:

```js
if (!ball.sound || !ball.blueprint) return;
```

---

## Expected Result

- Emitters define sound identity
- Particles inherit behavior
- Motion drives expression
- System becomes musically controllable

---

## Implementation Guide

- Where: main.js (emitters + tick + normalizeBall)
- Run: reload app
- Expect: emitters act like instruments
