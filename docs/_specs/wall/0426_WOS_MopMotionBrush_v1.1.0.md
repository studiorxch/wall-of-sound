---
layout: default
title: Mop Motion Brush System
component: MopMotionBrush
system: "WOS"
domain: "wall"
version: v1.1.0
status: draft
date: 2026-04-26
---

# 0426_WOS_MopMotionBrush_v1.1.0

Version: v1.1.0  
Date: 04/26/2026  
Status: Draft

---

## Objective

Unify drawing + motion + emission into a single tool:

> Mop becomes a **space-time brush** that sculpts motion directly.

This pass stabilizes:

- particle velocity consistency (SBE vs fallback)
- walker auto-bake workflow (no undo hacks)
- motion-driven emission as a first-class behavior

---

## Core Concept

```text
gesture → path → walker → emitter → particles
User input is no longer “drawing lines”
It is:
sculpting motion over time
Assumptions

Walkers already compute w.x / w.y
samplePath() is stable
SBE.ParticleSystem may or may not exist
Fallback particle system uses px/frame (no dt)
Patch 1 — Particle Velocity Unification
Problem

SBE uses px/sec
fallback uses px/frame
causes inconsistent motion + density Solution Add unified spawn wrapper:
function spawnParticleUnified(cfg, dt) {
  var hasSBE = !!window.SBE?.ParticleSystem?.spawn

  if (hasSBE) {
    SBE.ParticleSystem.spawn(cfg)
  } else {
    var frameScale = dt || (1 / 60)

    state.particles.push(Object.assign({
      maxLife: cfg.life,
      _dead: false,

      vx: cfg.vx * frameScale,
      vy: cfg.vy * frameScale
    }, cfg))
  }
}
Replace emitter spawn call

spawnParticleUnified({
  x: w.x,
  y: w.y,
  vx: vx,
  vy: vy,
  size: e.size,
  life: e.life,
  color: e.color,
  type: e.type
}, dt)
Patch 2 — Mop Motion Mode (Auto-Bake)
Problem
Current workflow:

draw stroke
spawn walker
undo stroke This is accidental, not intentional. Add state
state.motion = {
  enabled: true,
  autoBake: true,
  showPath: false
}
Modify stroke commit

if (state.motion.enabled && state.motion.autoBake) {
  var w = createWalkerFromStroke(stroke)

  state.walkers.push(w)

  // do NOT store stroke
  return
}
Patch 3 — Mop as Motion Brush
Extend walker creation

w.motionMode = state.motion.mode || "loop"

w.emitter = {
  enabled: true,
  rate: state.motion.rate || 40,
  spread: state.motion.spread || 0.3,
  speed: state.motion.particleSpeed || 120,
  size: state.motion.size || 3,
  life: state.motion.life || 1.0,
  type: state.motion.type || "dot",
  color: state.motion.color || "#ffffff"
}
Patch 4 — Tangent-Based Emission
Ensure particles follow motion direction:

function sampleTangent(path, t) {
  var eps = 0.001
  var p1 = samplePath(path, t)
  var p2 = samplePath(path, t + eps)

  var dx = p2.x - p1.x
  var dy = p2.y - p1.y
  var len = Math.sqrt(dx*dx + dy*dy) || 1

  return { x: dx / len, y: dy / len }
}
Patch 5 — Stable Emission Loop
Inside walker update:

w._emitAcc += dt * w.emitter.rate

while (w._emitAcc >= 1) {
  w._emitAcc -= 1

  var dir = sampleTangent(w.path, w.t)

  var angle = Math.atan2(dir.y, dir.x)
  angle += (Math.random() - 0.5) * w.emitter.spread

  var vx = Math.cos(angle) * w.emitter.speed
  var vy = Math.sin(angle) * w.emitter.speed

  spawnParticleUnified({
    x: w.x,
    y: w.y,
    vx: vx,
    vy: vy,
    size: w.emitter.size,
    life: w.emitter.life,
    color: w.emitter.color,
    type: w.emitter.type
  }, dt)
}
Patch 6 — Optional Path Visibility

if (state.motion.showPath) {
  drawStrokePreview(stroke)
}
Default: hidden
Interaction Model
ModeBehaviorDrawnormal strokeMotioninstant walkerMotion + AutoBakeno stroke persists

Naming
Internal:

MopMotionBrush
MotionMode
WalkerEmitter
User-facing:
Motion Brush (optional label: Space-Time Tool)
Done Criteria

Mop can spawn walkers without leaving strokes
Particle motion identical in SBE and fallback
Walkers emit particles along tangent direction
No undo required for motion workflows
Motion visually stable across framerates
Implementation Guide

Where: createWalkerFromStroke, stroke commit, walker update
What to run: enable state.motion.autoBake, draw strokes
Expect: immediate motion trails with no leftover geometry
```
