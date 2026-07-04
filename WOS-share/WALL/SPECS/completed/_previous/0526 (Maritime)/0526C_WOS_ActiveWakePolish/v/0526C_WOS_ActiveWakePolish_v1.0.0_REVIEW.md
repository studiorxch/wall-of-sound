---
layout: spec
title: "WOS Active Wake Polish"
date: 2026-05-26
doc_id: "0526C_WOS_ActiveWakePolish_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "presentation"
component: "ActiveWakePolish"
type: "runtime-presentation-spec"
status: "review"
priority: "high"
risk: "low"
classification: "presentation-layer"
summary: "Refines active vessel wake rendering into soft, class-readable, non-repeating maritime motion marks while keeping MaritimeWaterMemory disabled and experimental."
stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "active-vessel-wake-softening-class-readable-motion-polish"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Refine active vessel wakes as the primary motion readability system while keeping MaritimeWaterMemory disabled by default.

# 0526C_WOS_ActiveWakePolish_v1.0.0

## Purpose

Define the active wake polish layer for WOS maritime rendering.

This spec responds to the failure of screen-space water-memory rendering as a default visual system.

The correct immediate direction is:

```text
active wakes only
```

not:

```text
accumulated water-memory fields
```

This specification refines active wakes into:

- softer visual marks
- cleaner class differentiation
- lower repetition
- better atmospheric blending
- stronger close-zoom readability
- less debug-like geometry
- no runtime accumulation

---

# 🧠 CORE DOCTRINE

```text
Active wakes communicate live motion.

They do not simulate water.
```

Active wakes should feel like:

```text
motion passing through water
```

not:

```text
patterns stamped onto a map
```

Canonical rule:

```text
Wake polish improves perception.
It may not fabricate runtime truth.
```

---

# 🧭 STRATEGIC CONTEXT

`0526B MaritimeWaterMemory` remains experimental.

Its runtime visual output should stay disabled by default because screen-space accumulation produced:

- ghost trails
- duplication on viewport changes
- repetitive cell/ribbon patterns
- confusing water artifacts
- debug-looking marks

This spec moves focus back to the stronger system:

```text
0526A MaritimeWakeSignature
```

Active wakes are closer to the vessel, easier to control, and less likely to pollute the whole map.

---

# 🏛️ AUTHORITY BOUNDARIES

## ActiveWakePolish Owns

- wake softness
- wake tapering
- class-specific wake readability
- active wake opacity limits
- wake LOD thresholds
- wake visual restraint
- wake mode parameter tuning
- wake gradient shaping
- close-vs-mid zoom wake behavior

## ActiveWakePolish May Observe

- vessel class
- vessel speed
- vessel heading
- current zoom
- population tier
- visibility class
- atmospheric alpha
- wake mode from MaritimeWakeSignature
- vessel topology scale

## ActiveWakePolish May NOT Mutate

- AIS truth
- vessel coordinates
- vessel heading truth
- vessel speed truth
- continuity state
- visibility class
- population tier
- camera state
- map projection
- water memory state
- route topology
- vessel taxonomy

---

# 🔒 WATER MEMORY POLICY

Runtime default:

```ts
SBE.runtimeFlags.showMaritimeWaterMemory = false;
```

WaterMemory may remain available for:

- debug
- experiments
- future water-space field research

It must not be required for active wakes.

ActiveWakePolish must not depend on WaterMemory.

Canonical rule:

```text
Active wakes must look good with WaterMemory fully disabled.
```

---

# 🎯 DESIGN GOALS

Active wakes should be:

- soft
- directional
- class-readable
- subtle
- vessel-attached
- zoom-aware
- atmosphere-aware
- non-repeating
- low-fatigue

Active wakes should not be:

- boxy
- cellular
- tiled
- debug-like
- overly bright
- particle spam
- fluid simulation
- map-wide ghost residue

---

# 🌊 VISUAL LANGUAGE TARGET

## Cargo

Feeling:

```text
heavy linear inertia
```

Visual:

- long faint center wake
- very low turbulence
- subtle broad tail
- slow visual decay
- no bright foam spam

## Tanker

Feeling:

```text
broad displacement
```

Visual:

- wider, dimmer wake
- low central sheen
- almost no active sparkle
- very smooth lines

## Ferry

Feeling:

```text
organized corridor energy
```

Visual:

- clean split-V
- brighter but controlled
- symmetrical arms
- sharper near stern
- quick fade downstream

## Tug

Feeling:

```text
localized mechanical force
```

Visual:

- short turbulent wake
- clustered near stern
- not long map streaks
- broken but soft
- high character, low footprint

## Recreational

Feeling:

```text
fast playful slicing
```

Visual:

- tighter bright V
- shorter length
- narrow foam streak
- more agile than ferry

## Fishing

Feeling:

```text
unstable drifting trace
```

Visual:

- asymmetric faint wake
- one stronger side
- loose drift mark
- not repetitive

## Passenger / Cruise

Feeling:

```text
smooth ceremonial glide
```

Visual:

- elegant long wake
- very smooth taper
- minimal turbulence
- stronger close-up reward

## Military

Feeling:

```text
restrained discipline
```

Visual:

- minimal wake
- almost invisible at mid zoom
- narrow controlled trace
- no dramatic energy

## Industrial

Feeling:

```text
mechanical churn
```

Visual:

- short broad disturbance
- low-opacity clustered turbulence
- slightly dirty/heavy feel
- never emergency-coded

## Service

Feeling:

```text
utility movement
```

Visual:

- moderate small V
- controlled footprint
- practical working-boat wake

---

# 📦 WAKE POLISH PARAMETERS

Each wake profile should support:

```ts
type ActiveWakePolishProfile = {
  readonly classKey: string;
  readonly mode: "LINEAR" | "SPLIT_V" | "TURBULENT" | "DRIFT" | "DISCIPLINED";

  readonly lengthScale: number;
  readonly widthScale: number;
  readonly alphaScale: number;

  readonly nearSternAlpha: number;
  readonly farFadeAlpha: number;

  readonly lineSoftness: number;
  readonly glowStrength: number;

  readonly turbulenceCount: number;
  readonly turbulenceSpread: number;
  readonly turbulenceLengthScale: number;

  readonly maxWakeAlpha: number;
  readonly maxGlowAlpha: number;

  readonly minVisibleZoom: number;
  readonly fullVisibleZoom: number;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const ACTIVE_WAKE_POLISH_VERSION = "1.0.0";
const DEFAULT_WAKE_MIN_ZOOM = 11.6;
const DEFAULT_WAKE_FULL_ZOOM = 13.0;
const MAX_ACTIVE_WAKE_ALPHA = 0.48;
const MAX_ACTIVE_WAKE_GLOW_ALPHA = 0.16;
const MAX_WAKE_LINE_WIDTH_PX = 5.5;
const MIN_WAKE_LINE_WIDTH_PX = 0.75;
const MAX_TURBULENCE_FILAMENTS = 5;
const WAKE_DEBUG_DEFAULT = false;
```

---

# 🔍 LOD POLICY

## Far Zoom

At far zoom:

```text
no active wake
```

or:

```text
single faint direction tick
```

Allowed:

- minimal directional hint
- no turbulence
- no glow
- no split foam

## Mid Zoom

At mid zoom:

```text
class wake becomes readable
```

Allowed:

- cargo center line
- ferry split-V
- tug short disturbance
- recreational tight V
- fishing asymmetric mark

## Close Zoom

At close zoom:

```text
wake gains character
```

Allowed:

- additional taper detail
- subtle glow
- soft turbulence
- class-specific refinement

Still forbidden:

- debug labels
- cell artifacts
- memory residue fields
- high-frequency repeated strokes

---

# 🎨 GRADIENT DOCTRINE

Active wakes should use gradients instead of solid lines.

Required gradient behavior:

```text
transparent at origin edge
soft rise near stern
peak low alpha close to stern
fade fully downstream
```

Recommended stop pattern:

```ts
0.00 → transparent
0.12 → low alpha
0.35 → peak alpha
0.72 → low alpha
1.00 → transparent
```

This avoids hard-ended wake strokes.

---

# 🧊 SOFTNESS RULE

Every active wake line must use:

```ts
ctx.lineCap = "round";
ctx.lineJoin = "round";
```

No square caps.

No hard rectangular fills.

No visible debugging geometry.

---

# 🔁 REPETITION CONTROL

Active wake variation may use deterministic seeded jitter.

Allowed:

- tiny control-point drift
- minor length variation
- per-vessel phase offset
- non-synchronized turbulence

Forbidden:

- obvious repeating wave cycles
- synchronized pulses
- tiled mark placement
- per-cell pattern repetition
- large seeded deviations that imply false maneuvering

---

# 🛰️ MARITIME WAKE SIGNATURE PATCH SCOPE

Patch:

```text
wall/systems/presentation/maritimeWakeSignature.js
```

Focus changes:

- lower global wake alpha
- soften all gradients
- reduce glow opacity
- reduce turbulence footprint
- clamp line widths
- make LINEAR smoother
- make SPLIT_V cleaner
- make TURBULENT shorter and softer
- make DRIFT less pattern-like
- keep DISCIPLINED nearly invisible

---

# 🚢 CLASS PARAMETER TARGETS

## Cargo

```ts
{
  lengthScale: 1.45,
  widthScale: 0.75,
  alphaScale: 0.42,
  maxWakeAlpha: 0.30,
  glowStrength: 0.06,
  turbulenceCount: 0
}
```

## Tanker

```ts
{
  lengthScale: 1.65,
  widthScale: 1.10,
  alphaScale: 0.32,
  maxWakeAlpha: 0.24,
  glowStrength: 0.04,
  turbulenceCount: 0
}
```

## Ferry

```ts
{
  lengthScale: 1.05,
  widthScale: 1.05,
  alphaScale: 0.62,
  maxWakeAlpha: 0.42,
  glowStrength: 0.10,
  turbulenceCount: 0
}
```

## Tug

```ts
{
  lengthScale: 0.55,
  widthScale: 1.10,
  alphaScale: 0.58,
  maxWakeAlpha: 0.38,
  glowStrength: 0.08,
  turbulenceCount: 3
}
```

## Recreational

```ts
{
  lengthScale: 0.85,
  widthScale: 0.65,
  alphaScale: 0.68,
  maxWakeAlpha: 0.44,
  glowStrength: 0.10,
  turbulenceCount: 0
}
```

## Fishing

```ts
{
  lengthScale: 0.90,
  widthScale: 0.80,
  alphaScale: 0.42,
  maxWakeAlpha: 0.30,
  glowStrength: 0.05,
  turbulenceCount: 1
}
```

## Passenger / Cruise

```ts
{
  lengthScale: 1.35,
  widthScale: 0.90,
  alphaScale: 0.36,
  maxWakeAlpha: 0.28,
  glowStrength: 0.06,
  turbulenceCount: 0
}
```

## Military

```ts
{
  lengthScale: 0.70,
  widthScale: 0.50,
  alphaScale: 0.18,
  maxWakeAlpha: 0.12,
  glowStrength: 0.00,
  turbulenceCount: 0
}
```

## Industrial

```ts
{
  lengthScale: 0.65,
  widthScale: 1.20,
  alphaScale: 0.46,
  maxWakeAlpha: 0.34,
  glowStrength: 0.05,
  turbulenceCount: 3
}
```

## Service

```ts
{
  lengthScale: 0.90,
  widthScale: 0.80,
  alphaScale: 0.46,
  maxWakeAlpha: 0.34,
  glowStrength: 0.06,
  turbulenceCount: 0
}
```

---

# 🧪 DEBUG API

Add or extend:

```ts
_wos.wakeSignature
```

Required methods:

```ts
_wos.wakeSignature.profile("cargo")
_wos.wakeSignature.preview("ferry")
_wos.wakeSignature.compare("cargo", "tug")
_wos.wakeSignature.setDebug(true)
_wos.wakeSignature.constants()
```

If `_wos.wakeSignature` does not exist yet, create a small debug companion:

```text
wall/systems/presentation/maritimeWakeSignatureDebug.js
```

---

# ✅ VALIDATION CHECKLIST

- [ ] WaterMemory remains disabled by default
- [ ] active wakes render without WaterMemory
- [ ] far zoom does not show wake clutter
- [ ] mid zoom shows class-readable wake modes
- [ ] close zoom improves wake character without noise
- [ ] cargo/tanker wakes are long and faint
- [ ] ferry wake is clean split-V
- [ ] tug wake is short and turbulent
- [ ] recreational wake is tight and lively
- [ ] fishing wake is asymmetric but subtle
- [ ] military wake is nearly invisible
- [ ] no rectangular/cellular wake patterns
- [ ] no persistent ghost trails
- [ ] no runtime truth mutation
- [ ] no AIS state mutation
- [ ] no camera mutation
- [ ] no dependency on WaterMemory

---

# 🚫 NON-GOALS

This spec does NOT implement:

- WaterMemory resurrection
- fluid simulation
- accumulated wake fields
- geographic water-space memory
- shoreline interactions
- tide modeling
- particle systems
- map-wide foam overlays
- 2.5D wake extrusion
- VisualLab export
- active wake audio-reactivity

---

# 🧱 FIRST BUILD SCOPE

Patch:

```text
wall/systems/presentation/maritimeWakeSignature.js
```

Optional debug file:

```text
wall/systems/presentation/maritimeWakeSignatureDebug.js
```

Do not patch WaterMemory except to verify it stays disabled.

Do not create new field systems.

---

# 📊 FINAL STATUS

```text
0526C_WOS_ActiveWakePolish_v1.0.0
```

Status:

```text
[REVIEW]
```

Freeze Decision:

```text
REVIEW
```

Classification:

```text
active-vessel-wake-softening-class-readable-motion-polish
```

Build Scope:

```text
active wake gradient softening, class-specific wake tuning, LOD suppression, debug wake profile inspection, no accumulation
```

Final instruction:

```text
Submit for review, then produce v1.0.1 BUILD before implementation.
```

---

# Implementation Guide

- Patch `wall/systems/presentation/maritimeWakeSignature.js`; keep `SBE.runtimeFlags.showMaritimeWaterMemory = false`.
- Add optional `_wos.wakeSignature` debug companion only if needed for profile inspection.
- Expect softer active wakes, no ghost trails, and clearer class motion without accumulated water artifacts.
