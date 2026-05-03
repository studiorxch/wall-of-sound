---
layout: spec
title: "ParticleExpression"
date: 2026-04-17
doc_id: "0417_WALL_OF_SOUND_ParticleExpression_v3.5.0"
version: "3.5.0"
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

# 0417_WALL_OF_SOUND_ParticleExpression_v3.5.0

## Objective
Replace one-shot particle sound triggering with a motion-driven expression system based on velocity and lifecycle state.

---

## Step 1 — Replace One-Shot Trigger

FIND:

if (!ball.sound) return;
if (ball._soundFired) return;

dispatchCollisionEvent(ball);
ball._soundFired = true;

REPLACE WITH:

if (!ball.sound) return;

const speed = Math.hypot(ball.vx, ball.vy);

if (speed > 2.5 && !ball._played) {

  const velocityBoost = Math.min(127, 60 + (ball.hitCount || 0) * 20);

  if (ball.sound.midi) {
    ball.sound.midi.velocity = velocityBoost;
  }

  if (typeof ball.sound.frequency === "number") {
    const drift = 1 + (Math.random() - 0.5) * 0.04;
    ball.sound.frequency *= drift;
  }

  dispatchCollisionEvent(ball);
  ball._played = true;
}

if (speed < 1.2) {
  ball._played = false;
}

---

## Step 2 — Remove Deprecated Flag

Delete:
ball._soundFired

---

## Step 3 — Initialize New State

Add in normalizeBall():

ball._played = false;

---

## Step 4 — Safety Guard

Ensure:

if (!sourceObject || !sourceObject.sound) return;

---

## Implementation Guide

- Where: tick() particle loop
- Run: reload app
- Expect: motion-driven sound instead of spawn-triggered sound
