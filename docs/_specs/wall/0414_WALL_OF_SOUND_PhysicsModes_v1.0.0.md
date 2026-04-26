---
layout: spec
title: "PhysicsModes"
date: 2026-04-14
doc_id: "0414_WALL_OF_SOUND_PhysicsModes_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "physics"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

# 0414_WALL_OF_SOUND_PhysicsModes_v1.0.0

## 🎯 Objective

Implement a unified physics system that supports multiple world behaviors:
- Directional Gravity (pinball / front view)
- Planar (billiards / top-down)
- Zero-G (space / water)

System must be centralized, emitter-compatible, and support clean live switching.

---

## 🧠 Core Principle

Velocity evolves based on physics mode. All motion flows through a single controller.

---

## 🧩 Architecture

```js
const PHYSICS_MODE = {
  GRAVITY: "gravity",
  PLANAR: "planar",
  ZERO_G: "zero_g"
};

let physicsMode = PHYSICS_MODE.GRAVITY;

let gravity = { x: 0, y: 1 };
let gravityStrength = 9.8;

const DRAG = 0.98;
```

---

## ⚙️ Core Pipeline

```js
function applyPhysics(p, dt) {
  switch (physicsMode) {
    case PHYSICS_MODE.GRAVITY:
      applyDirectionalGravity(p, dt);
      break;
    case PHYSICS_MODE.PLANAR:
      applyPlanar(p, dt);
      break;
    case PHYSICS_MODE.ZERO_G:
      applyZeroG(p, dt);
      break;
  }
  applyDrag(p);
}
```

---

## 🔵 Modes

### Gravity

```js
function applyDirectionalGravity(p, dt) {
  p.vx += gravity.x * gravityStrength * dt;
  p.vy += gravity.y * gravityStrength * dt;
}
```

---

### Planar

```js
function applyPlanar(p, dt) {}
```

```js
function applyBounds(p, bounds) {
  if (p.x < 0 || p.x > bounds.width) p.vx *= -1;
  if (p.y < 0 || p.y > bounds.height) p.vy *= -1;
}
```

---

### Zero-G

```js
function applyZeroG(p, dt) {
  const noise = 0.02;
  p.vx += (Math.random() - 0.5) * noise;
  p.vy += (Math.random() - 0.5) * noise;
}
```

---

## Drag

```js
function applyDrag(p) {
  p.vx *= DRAG;
  p.vy *= DRAG;
}
```

---

## Emitters

```js
function getInitialVelocity() {
  switch (physicsMode) {
    case PHYSICS_MODE.GRAVITY:
      return { vx: random(-0.5, 0.5), vy: random(1, 3) };
    case PHYSICS_MODE.PLANAR:
      return { vx: random(-2, 2), vy: random(-2, 2) };
    case PHYSICS_MODE.ZERO_G:
      return { vx: random(-1, 1), vy: random(-1, 1) };
  }
}
```

---

## Mode Switch

```js
function setPhysicsMode(mode) {
  physicsMode = mode;

  for (const p of particles) {
    const speed = Math.hypot(p.vx, p.vy);

    if (mode === PHYSICS_MODE.PLANAR) {
      p.vx = random(-1, 1) * speed;
      p.vy = random(-1, 1) * speed;
    }

    if (mode === PHYSICS_MODE.GRAVITY) {
      p.vy += random(0.5, 1.5);
    }

    if (mode === PHYSICS_MODE.ZERO_G) {
      p.vx *= 0.7;
      p.vy *= 0.7;
    }
  }
}
```

---

## 🚀 Implementation Guide

- Place in: engine/physicsSystem.js
- Call applyPhysics() in tick loop before collisions
- Replace all direct velocity updates
- Update emitters to use getInitialVelocity()

Expected: clean switching, stable motion, no snapping.
