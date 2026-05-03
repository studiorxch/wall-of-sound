---
layout: spec
title: "PhysicsTuning"
date: 2026-04-10
doc_id: "0410_WALL_OF_SOUND_PhysicsTuning_v1.0.0"
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

0410_WALL_OF_SOUND_PhysicsTuning_v1.0.0

Generated: 04/10/2026

---

## 🎯 Objective

Fix “slow / floaty / clustered” motion after recent physics update.

Current system is technically correct (dt-based), but values are no longer tuned for real-time physics.

Goal:
→ restore responsive, natural marble-run motion
→ ensure emitters produce clean rhythmic flow
→ DO NOT require manual tuning by user

---

## ⚠️ Constraints

- Do NOT rewrite physics engine
- Do NOT modify emitter timing logic
- Do NOT change collision system
- Do NOT touch audio or export systems
- Only adjust:
  - physics constants
  - emitter defaults
  - optional auto-normalization

---

## 🔍 Problem Summary

After fixing time scaling:

- gravity is now correctly dt-based
- emitter uses real-time ms
- damping applies per frame

BUT:

Existing values were tuned for incorrect physics

Result:

- motion appears slow
- balls cluster and lose energy
- ramps do not carry motion properly
- emitter produces dense “foam” instead of flow

---

## ✅ Required Fixes

### 1. Retune Physics Defaults

Update:

```js
state.physics = {
  gravity: { x: 0, y: 3.0 },
  damping: 0.9997,
  maxSpeed: 20,
};
```

---

### 2. Normalize Gravity Scale (IMPORTANT)

Ensure gravity is consistent regardless of dt:

```js
const gravityScale = dt * 60;

ball.vx += state.physics.gravity.x * gravityScale;
ball.vy += state.physics.gravity.y * gravityScale;
```

---

### 3. Improve Emitter Defaults

When creating new emitters, use:

```js
rate: 400,
velocity: { x: 1.2, y: 0 }
```

NOT zero velocity.

---

### 4. Prevent Ball Clumping (Light Fix Only)

Add slight separation impulse when balls overlap:

```js
if (distance < minDistance) {
  applySeparation(ballA, ballB, 0.05);
}
```

Keep minimal — do NOT introduce full physics system.

---

### 5. Optional: Adaptive Spawn Density

If emitter produces too many balls:

```js
if (state.balls.length > 300) return;
```

---

## 🧪 Expected Behavior

After fix:

- balls fall with visible acceleration
- ramps guide motion smoothly
- emitters create clean streams (not clusters)
- system feels responsive (no slow motion)

---

## 🚫 Do NOT Do

- Do NOT rewrite collision system
- Do NOT introduce new physics engine
- Do NOT change dt pipeline
- Do NOT add UI
- Do NOT modify existing scene data format

---

## ✅ Success Criteria

- emitter produces visible stream, not clumps
- motion feels fast and responsive
- ramps visibly influence direction
- no regression in stability

---

## ⚡ Implementation Guide

- where:
  main.js → physics config + emitter creation

- run:
  reload → place emitter → observe motion

- expect:
  natural falling motion + clean rhythmic flow
