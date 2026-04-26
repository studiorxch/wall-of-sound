---
layout: spec
title: "ParticleCleanup"
date: 2026-04-16
doc_id: "0416_WOS_ParticleCleanup_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "particle_system"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

# 0416_WOS_ParticleCleanup_v1.0.0

Generated: 04/16/2026

---

## 🎯 Objective

Ensure all particles (balls) are removed immediately after collision and cleaned from the system every frame.

---

## 🧠 Assumptions

- Particles are stored in a central array (e.g. state.balls)
- Collision system already exists
- Main loop (tick/update) runs continuously

---

## 🔧 Step 1 — Add Death Flag

Each particle must include:

```js
ball._dead = false;
```

---

## 🔧 Step 2 — Kill on Collision

Inject into collision handler:

```js
function onCollision(ball, target) {
  if (ball._dead) return;
  ball._dead = true;
}
```

---

## 🔧 Step 3 — Cleanup Pass

In main loop:

```js
function tick(dt) {
  updatePhysics(dt);
  handleCollisions();

  // cleanup dead particles
  state.balls = state.balls.filter(ball => !ball._dead);

  render();
}
```

---

## 🧪 Validation Checklist

- Particle disappears on impact
- Particle count does not increase over time
- No ghost collisions
- Scene remains clean

---

## 🧠 Final Model

```js
collision → ball._dead = true → cleanup removes ball
```

---

## Implementation Guide

- Where code goes: collision handler + main tick loop
- What to run: simulate collisions
- What to expect: particles disappear and do not accumulate
