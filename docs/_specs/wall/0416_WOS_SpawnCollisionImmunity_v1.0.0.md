---
layout: spec
title: "SpawnCollisionImmunity"
date: 2026-04-16
doc_id: "0416_WOS_SpawnCollisionImmunity_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "general"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

# 0416_WOS_SpawnCollisionImmunity_v1.0.0

Generated: 04/16/2026

---

## 🎯 Objective

Prevent particles from colliding immediately at spawn when emitted from lines or shapes.

Particles should:
- spawn cleanly
- not trigger collision or sound at birth
- begin colliding normally after a short delay

---

## 🧠 Context

Particles currently spawn directly on geometry, causing immediate collision detection.

This results in:
- instant collision
- instant death (`_dead = true`)
- unintended sound at spawn

---

## 🔧 Step 1 — Add Spawn Timing Fields

In `normalizeBall`:

```js
ball._dead = false;
ball.spawnTime = performance.now();
ball.collisionDelay = 24;
```

---

## 🔧 Step 2 — Gate Collision Detection

In collision loop:

```js
const now = performance.now();

if (now - ball.spawnTime < ball.collisionDelay) {
  continue;
}
```

---

## 🔧 Step 3 — Skip Dead Balls

```js
if (ball._dead) continue;
```

---

## 🔧 Step 4 — Optional Spawn Offset

```js
const offset = 2;

ball.x += Math.cos(direction) * offset;
ball.y += Math.sin(direction) * offset;
```

---

## 🧪 Validation Checklist

- No collision at spawn
- Normal collision after movement
- No sound at spawn
- Particles die on valid collision

---

## 🧠 Final Model

spawn → delay → movement → collision → death

---

## Implementation Guide

- Where code goes: normalizeBall, collision loop, emitter spawn
- What to run: emitter test
- What to expect: clean emission with no instant collision
