---
layout: spec
title: "EmitterPhysicsFix"
date: 2026-04-10
doc_id: "0410_WALL_OF_SOUND_EmitterPhysicsFix_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "emitter_system"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

0410_WALL_OF_SOUND_EmitterPhysicsFix_v1.0.0

Generated: 04/10/2026

---

## 🎯 Objective

Fix slow-motion / floaty emitter + ball behavior caused by inconsistent time scaling between:

- physics system (dt-based)
- gravity (frame-based ❌)
- emitter timing (real-time ms)

Goal:
→ restore responsive, real-time physics
→ keep emitter timing accurate
→ DO NOT change architecture or rewrite systems

---

## ⚠️ Constraints

- Do NOT refactor unrelated systems
- Do NOT modify rendering pipeline
- Do NOT change emitter API or UI
- Only touch:
  - loop()
  - tick()
  - gravity application

---

## 🔍 Problem Summary

Current system mixes:

- dt-scaled physics
- frame-based gravity
- real-time emitter timing

Additionally:

tick((stepMs / 1000) \* (state.bpm / 120), frameTime);

→ incorrectly ties physics speed to BPM

Result:

- slow motion feel
- emitter desync
- floaty behavior

---

## ✅ Required Fixes

### 1. Remove BPM scaling from physics

FIND:

tick((stepMs / 1000) \* (state.bpm / 120), frameTime);

REPLACE WITH:

tick(stepMs / 1000, frameTime);

---

### 2. Make gravity time-based

FIND:

ball.vx += gx;
ball.vy += gy;

REPLACE WITH:

ball.vx += gx _ dt _ 60;
ball.vy += gy _ dt _ 60;

---

### 3. Keep emitter timing untouched

Emitter logic is already correct:

if (now - emitter.lastSpawn < emitter.rate) return;

Do NOT modify this.

---

## 🧪 Expected Behavior After Fix

- emitters produce consistent streams
- ramps behave predictably
- collisions feel tight
- no slow-motion lag
- system feels responsive at default BPM

---

## 🧠 Important Notes

- Physics should be time-based (dt)
- Tempo should NOT affect simulation speed
- Audio/loop system remains BPM-driven
- Visual/physics system remains real-time

---

## 🚫 Do NOT Do

- Do NOT introduce new physics systems
- Do NOT add new dependencies
- Do NOT refactor event system
- Do NOT change emitter structure
- Do NOT modify swarm logic

---

## ✅ Success Criteria

- emitter stream visually matches expected rate
- ball motion is responsive and stable
- no perceived slow-motion
- no regression in collisions or rendering

---

## ⚡ Implementation Guide

- where:
  main.js → loop(), tick()

- run:
  reload app → place emitter → observe motion

- expect:
  immediate improvement in speed + responsiveness
