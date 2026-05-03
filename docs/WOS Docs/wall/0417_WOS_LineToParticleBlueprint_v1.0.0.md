---
layout: spec
title: "LineToParticleBlueprint"
date: 2026-04-17
doc_id: "0417_WOS_LineToParticleBlueprint_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "line_tool"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

# 0417_WOS_LineToParticleBlueprint_v1.0.0
Date: 04/17
Project: Wall of Sound Engine
Phase: Step 3 — Line → Particle Blueprint

---

## Objective
Convert emitters from collision-triggered sound sources into particle-driven sound systems.

---

## Assumptions
- Existing emitter system is working
- dispatchCollisionEvent({ sound: ... }) is stable
- state.balls lifecycle is stable
- tick() loop controls motion + collisions

---

## Step 1 — Attach Sound to Particles

### In updateBehaviorEmitters

After creating ball:

ADD:

ball.sourceId = line.id;
ball.sourceType = "emitter";
ball.sound = line.sound;
ball._soundFired = false;

---

### In updateShapeEmitters

After creating ball:

ADD:

ball.sourceId = seg.id;
ball.sourceType = "emitter";
ball.sound = seg.sound;
ball._soundFired = false;

---

## Step 2 — Remove Emitter Sound Trigger

### In BOTH emitter functions

REMOVE:

dispatchCollisionEvent({ sound: line.sound });
dispatchCollisionEvent({ sound: seg.sound });

---

## Step 3 — Move Sound Trigger to Particle Lifecycle

### Inside tick()

AFTER movement update and BEFORE collision resolution:

ADD:

state.balls.forEach(function (ball) {
  if (!ball.sound) return;

  if (!ball._soundFired) {
    dispatchCollisionEvent(ball);
    ball._soundFired = true;
  }
});

---

## Step 4 — Safety Guard (Required)

Ensure dispatchCollisionEvent supports particle input:

function dispatchCollisionEvent(sourceObject) {
  if (!sourceObject || !sourceObject.sound) return;

  if (sourceObject.isMuted) return;

  if (
    sourceObject.behavior &&
    sourceObject.behavior.emitterConfig &&
    sourceObject.behavior.emitterConfig.isMuted
  ) return;

  const currentTime = getTransportTime();

  if (!state.quantize.enabled) {
    eventBus.triggerEvent("collision", sourceObject);
    recordLoopEvent(sourceObject, currentTime);
    return;
  }

  const gridTime = getQuantizeGridTime();
  const nextTime = Math.ceil(currentTime / gridTime) * gridTime;

  state.quantizeQueue.push({
    time: nextTime,
    sourceObject: sourceObject,
  });
}

---

## Expected Behavior

- Emitters spawn particles ONLY (no direct sound)
- Particles trigger sound once on birth
- Sound system no longer depends on collision
- Spatial sound begins to emerge

---

## Optional Extensions (DO NOT IMPLEMENT YET)

- Beat-based retriggering
- Velocity-based sound triggering
- Position-based sound zones

---

## Implementation Guide

- Where:
  - updateBehaviorEmitters
  - updateShapeEmitters
  - tick()

- Run:
  - Reload app
  - Create emitter
  - Observe particle sound without collisions

- Expect:
  - Each particle plays sound once on spawn
  - No emitter-based sound firing
