# 0522N_WOS_MarineMotionAndTaxonomy_v1.0.0

**Status:** ACTIVE  
**Date:** 2026-05-22  
**Domain:** Maritime / Rendering / Motion  
**System:** WOS Maritime Continuity Stack  
**Version:** v1.0.0

---

# Purpose

Stabilize the first successful grounded harbor vessel implementation and define the next architectural priorities for believable maritime motion, vessel taxonomy, and long-term visual continuity.

This spec formalizes the transition from:
- debug visualization
- proof-of-rendering
- projection diagnostics

toward:
- atmospheric harbor simulation
- vessel identity systems
- motion continuity
- scalable maritime populations

---

# Current State

The grounded vessel renderer is now operational.

Confirmed:
- geographic projection works
- tilt-aware hull grounding works
- overlay canvas architecture works
- AIS runtime integration works
- harbor validation pipeline works
- dedicated marine overlay canvas resolves legacy z-index conflicts

The renderer now supports:
- perspective-aware hull geometry
- map pitch grounding
- stable overlay rendering
- runtime debug scaling
- runtime debug visibility toggles

---

# Observed Problems

## 1. Outline Spike Artifacts

Current hull outlines produce visible spike-like joins at extreme perspective compression angles.

Cause:
- projected polygon corners generate sharp miter joins
- default canvas lineJoin behavior exaggerates acute angles

Current result:
- debug hull outlines appear synthetic
- sharp spikes break grounded realism

---

## 2. Debug Label Fatigue

Persistent vessel labels:
- clutter atmosphere
- reduce realism
- expose debugging state
- break cinematic immersion

Labels are useful for:
- validation
- diagnostics
- vessel tracking

But should not exist in normal atmospheric rendering.

---

## 3. Motion Feels Synthetic

Current AIS motion updates:
- tick between positions
- appear teleport-like
- lack inertia
- lack water drag
- lack heading persistence
- lack momentum continuity

This is currently the largest realism break in the maritime layer.

---

## 4. Vessel Taxonomy Missing

All vessels currently share:
- same hull logic
- same visual identity
- same movement assumptions

World scale harbor simulation requires:
- vessel classes
- dimensions
- colors
- lighting signatures
- speed envelopes
- behavioral archetypes

---

# Architectural Direction

## Maritime Layer Philosophy

The harbor should eventually feel:
- alive
- statistical
- atmospheric
- infrastructural
- persistent

Not:
- game-like
- icon-driven
- UI-heavy
- debug-centric

The viewer should gradually perceive:
- density
- flow
- infrastructure
- rhythm
- industrial behavior

without needing labels or explicit explanation.

---

# Required Systems

# 1. Motion Continuity Layer

## Goal

Transform AIS snapshots into believable vessel movement.

---

## Required Behavior

Instead of:
- snap
- tick
- teleport

Motion should:
- ease
- drift
- carry momentum
- overshoot slightly
- settle naturally

---

## Core Concepts

### Dead Reckoning

Between AIS updates:
- continue predicted motion
- maintain heading
- preserve speed vector

---

### Water Drag

Motion interpolation should include:
- resistance
- easing
- gradual convergence

Large ships should:
- feel heavy
- resist rapid correction

Small boats should:
- react faster

---

### Heading Inertia

Heading should:
- rotate gradually
- avoid instant directional snaps

Large cargo ships:
- slow turn rates

Tugs/ferries:
- faster turn rates

---

### Confidence Decay

As AIS age increases:
- confidence lowers
- interpolation softens
- opacity may subtly reduce

Eventually:
- vessel transitions into dormant state

---

# 2. Vessel Taxonomy System

## Goal

Introduce believable harbor diversity.

---

## Required Vessel Classes

### Cargo Ship
- very large
- slow acceleration
- muted industrial palette
- heavy wake

### Ferry
- medium scale
- bright lighting
- predictable routes
- faster interpolation

### Tugboat
- compact
- aggressive maneuvering
- strong directional changes

### Fishing Vessel
- unstable drifting patterns
- irregular movement

### Coast Guard
- sharp movement
- high visibility lighting

### Pleasure Craft
- small
- fast
- erratic

---

## Per-Class Parameters

Each vessel class should define:

```js
{
  hullLengthM,
  hullWidthM,
  cruiseSpeedKts,
  maxTurnRate,
  inertia,
  drag,
  wakeStrength,
  emissiveProfile,
  hullPalette,
  lightPattern,
  labelVisibility,
  renderLOD
}
```

---

# 3. Label Doctrine

## Production Direction

Labels should become:
- contextual
- temporary
- diagnostic-only

Normal operation:
- no persistent labels

Possible exceptions:
- selected vessel
- cinematic tracking
- inspector focus
- incident state
- harbor authority overlays

---

## Long-Term Direction

Identity should emerge visually through:
- hull shape
- scale
- light signatures
- movement style
- route behavior

not text overlays.

---

# 4. Hull Rendering Evolution

## Current

Current grounded polygon system:
- functional
- accurate
- stable

But still:
- flat
- symbolic
- debug-oriented

---

## Next Direction

Move toward:
- layered hull shading
- superstructure silhouettes
- deck lighting
- wake rendering
- emissive windows
- navigation lights
- atmospheric fog interaction

without abandoning:
- lightweight rendering
- scalability
- readability

---

# 5. Harbor Density Phase

## Important

Pacing discussions are premature until:
- many vessels exist simultaneously
- movement continuity is stabilized
- harbor density emerges naturally

Current focus should remain:
- rendering correctness
- vessel diversity
- motion continuity
- scalable populations

The harbor must first feel populated before cinematic pacing can be evaluated correctly.

---

# Immediate Tasks

## Priority 1 — Motion Smoothing

Implement:
- dead reckoning
- inertia interpolation
- heading easing
- velocity continuity

This is the highest realism upgrade.

---

## Priority 2 — Vessel Taxonomy

Create:
- class registry
- hull dimensions
- movement profiles
- emissive presets

---

## Priority 3 — Outline Cleanup

Replace:
```js
ctx.lineJoin = "miter"
```

with:
```js
ctx.lineJoin = "round"
```

or:
```js
ctx.lineJoin = "bevel"
```

to eliminate spike artifacts.

---

## Priority 4 — Label Reduction

Move labels behind:
- debug mode
- selection state
- inspector targeting

Default harbor mode should avoid persistent text overlays.

---

# Long-Term Goal

The harbor should eventually resemble:
- infrastructural cinema
- ambient maritime choreography
- living industrial flow

rather than:
- debug geometry
- tactical map icons
- simulation markers

The user should feel:
- scale
- momentum
- persistence
- weather
- traffic rhythm
- industrial atmosphere

through motion and continuity alone.

---

# Production Readiness

## Current Status

### Achieved
- grounded projection
- overlay rendering
- tilt correctness
- AIS integration
- scalable canvas architecture

### Not Yet Production Ready
- motion continuity
- vessel taxonomy
- atmospheric rendering
- harbor density
- wake systems
- lighting systems

---

# Final Direction

The maritime layer is no longer blocked by rendering architecture.

The next phase is no longer:
- “Can vessels render?”

The next phase becomes:
- “Can the harbor feel alive?”
