---
layout: spec
title: "EmitterFix"
date: 2026-04-17
doc_id: "0417_WOS_EmitterFix_v1.0.0"
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

# 0417_WOS_EmitterFix_v1.0.0
Date: 04/17
Project: Wall of Sound Engine
Scope: Fix emitter audio dispatch, ball spawning, BPM reference, and duplicate function conflict

---

## Assumptions
- Environment: Browser (Canvas + WebAudio + MIDI)
- Engine namespace: SBE
- Main file: initMain (this file)
- Event system expects:
  eventBus.triggerEvent(type, { sound: {...} })

---

## Fix 1 — Emitter Audio Dispatch (CRITICAL)

Replace:
dispatchCollisionEvent(line.sound);

With:
dispatchCollisionEvent({ sound: line.sound });

---

Replace:
dispatchCollisionEvent(seg.sound);

With:
dispatchCollisionEvent({ sound: seg.sound });

---

## Fix 2 — Ball Spawn Count Bug (CRITICAL)

Replace:
const count = ball.hitCount || 0;

With:
const count = clampInt(state.ballTool.count, 1, 8);

---

## Fix 3 — Duplicate clearBalls Function

DELETE:
function clearBalls(state) {
  state.balls.length = 0;
}

KEEP:
function clearBalls() {
  state.balls = [];
}

---

## Fix 4 — Incorrect BPM Reference

Replace:
(60000 / (state.transport.bpm || 120))

With:
(60000 / (state.bpm || 120))

---

## Fix 5 — Safe Event Dispatch Guard

Update dispatchCollisionEvent:

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

## Implementation Guide

- Where: emitter functions + dispatchCollisionEvent
- Run: reload app and test emitters
- Expect: working audio + correct spawning
