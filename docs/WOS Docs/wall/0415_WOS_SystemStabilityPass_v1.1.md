---
layout: spec
title: "SystemStabilityPass"
date: 2026-04-15
doc_id: "0415_WOS_SystemStabilityPass_v1.1"
version: "1.1.0"
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

0415_WOS_SystemStabilityPass_v1.1.0

Generated: 04/15/2026

---

## 🎯 GOAL

Stabilize the core interaction loop:

motion → collision → sound

Restore system reliability for recording and live use.

DO NOT add new features.
DO NOT refactor architecture.

---

## 🔴 PRIORITY 1 — PHYSICS INTEGRITY

Fix and restore:

- Line collision detection
- Shape collision via ShapeSystem segments
- Bumper (hard + elastic) behavior
- Collision highlight feedback

### Requirements

- Balls must NOT pass through geometry
- Collisions must trigger reliably
- ShapeSystem.getCollisionSegments() must be respected
- Collision system must remain the single source of truth

---

## 🟠 PRIORITY 2 — BALL LIFECYCLE CONTROL

Implement minimal agent control to prevent overflow.

### Add:

clearBalls(state)

- removes ALL balls only
- does NOT remove shapes, lines, or emitters

MAX_BALLS cap

- prevent spawning beyond limit
- safe default: 800

### Constraints

- No changes to geometry
- No changes to emitter definitions
- No scene reset behavior

---

## 🟡 PRIORITY 3 — EMITTER REGRESSION FIX

Emitter must behave as a behavior, not a system.

### Fix:

- Restore all existing behaviors (attract, repel, orbital)
- Restore collision highlight on emitter interactions
- Ensure emitter does NOT override physics or collision

### Rules:

Emitter MUST:

- spawn balls only
- respect physics system
- respect collision system
- NOT modify geometry or collision logic

---

## 🟢 PRIORITY 4 — AUDIO NORMALIZATION

Implement basic gain control.

### Add:

- Master gain node
- Reduce overall output level (~ -12 dB target)
- Prevent clipping during rapid collisions

### Constraints:

- Do NOT modify MIDI system
- Do NOT add UI for audio

---

## 🧱 SYSTEM BOUNDARY RULES (CRITICAL)

DO NOT merge or refactor systems.

Maintain strict separation:

1. Shape System
   - geometry only
   - provides collision segments

2. Collision System
   - handles all interaction detection
   - must NOT be replaced or bypassed

3. Ball System
   - movement and lifecycle only
   - must NOT modify geometry

4. Behavior System
   - modifies motion or spawning only
   - must NOT override physics or collision

---

## 🚫 DO NOT TOUCH

- Saving system
- Sampler / audio file management
- UI layout or panels
- Grid duplication system
- Rendering pipeline
- Scene serialization

---

## ✅ SUCCESS CRITERIA

- Collisions are 100% reliable
- Balls do not pass through shapes or lines
- Emitters no longer break system behavior
- System is stable under high ball counts
- Audio output is balanced and usable for OBS recording

---

## 🧪 VALIDATION TEST

1. Draw shape
2. Add balls
3. Observe:
   - collisions trigger consistently
   - bumpers behave correctly
   - no geometry pass-through
4. Add emitter:
   - system remains stable
   - behaviors still work
5. Spawn many balls:
   - system does not overflow or freeze
6. Record via OBS:
   - audio is not clipping

---

## END
