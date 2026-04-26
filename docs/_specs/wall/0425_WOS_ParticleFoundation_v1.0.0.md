---
layout: spec
title: "Particle Foundation"
date: 2026-04-25
doc_id: "0425_WOS_ParticleFoundation_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "rendering"
component: "particle_system"

type: "core-spec"
status: "active"
priority: "high"
risk: "low"

summary: "Defines the core particle simulation layer including motion, gravity, decay, and rendering. Serves as the foundational output system for all emitter and behavior-driven effects."

depends_on: []
enables:
  - "behavior_system"
  - "emitter_system"
  - "collision_effects"
  - "visual_feedback_layer"

tags:
  - particles
  - rendering
  - physics
  - foundation
  - realtime
---

# 0425_WOS_ParticleFoundation_v1.0.0

# Date: 04/25/2026

# System: particle_system

# Status: ACTIVE BASELINE

---

## 🎯 PURPOSE

Establish a stable, deterministic particle system that:

- Produces visible, physically believable motion
- Matches legacy gravity-based behavior (arc + decay)
- Serves as the unified output layer for all future emitter/behavior systems

This system MUST work independently of UI and emitter logic.

---

## 🧠 CORE PRINCIPLE

Particles are NOT tied to emitters.

Particles are the FINAL OUTPUT of:

    event → behavior → particle

This spec defines ONLY the particle layer.

---

## 📦 DATA MODEL

Each particle MUST follow this structure:

```js
type Particle = {
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  maxLife: number,
  size: number,
  color: string,
  alpha: number
}
```
