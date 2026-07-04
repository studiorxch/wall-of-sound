# 0522P_WOS_MaritimeDeterministicRuntime_v1.0.0

**Status:** REVIEW DRAFT  
**Date:** 2026-05-22  
**Domain:** Maritime / Runtime / Determinism Governance  
**System:** WOS Maritime Continuity Stack  
**Version:** v1.0.0

---

# Purpose

Freeze the deterministic runtime rules governing maritime continuity before implementing:

- large harbor populations
- wake systems
- reconciliation smoothing
- adaptive cadence systems
- atmospheric vessel behaviors
- cinematic orchestration
- historical replay systems

This spec formalizes:

- fixed timestep governance
- frame decoupling rules
- reconciliation mathematics
- adaptive cadence law
- deterministic replay requirements
- divergence enforcement
- dormant-state timing semantics

This spec extends:

0522O_WOS_MaritimeMotionAuthority_v1.0.0

and should be considered a runtime hardening layer over the motion authority doctrine.

---

# Constitutional Runtime Law

Deterministic continuity truth is more important than visual smoothness.

If forced to choose between:
- perfect visual interpolation
- deterministic continuity stability

the system must preserve:
- deterministic continuity
- replay consistency
- motion authority integrity

Visual smoothness is subordinate.

---

# Runtime Ownership Hierarchy

```js
const MARITIME_RUNTIME_HIERARCHY = {
  AIS_RUNTIME: "discrete telemetry ingest",
  MARITIME_CONTINUITY_ENGINE: "deterministic fixed-step motion authority",
  MARINE_RENDERER: "read-only frame presentation",
  OVERLAY_GRAMMAR: "symbolic visibility interpretation",
  OBSERVABILITY_CAMERA: "viewport framing only"
};
```

Only MaritimeContinuityEngine may advance continuous vessel state.

---

# Fixed Timestep Governance

## Canonical Runtime Tick

```js
const DETERMINISTIC_RUNTIME = {
  FIXED_TICK_MS: 50,
  FIXED_TICK_HZ: 20
};
```

All deterministic continuity calculations must occur on fixed 50ms boundaries.

---

# Runtime Rule

Continuity truth advances on fixed simulation ticks only.

Truth may never advance:
- on render frames
- on requestAnimationFrame cadence
- on camera updates
- on overlay evaluation cadence
- on browser timing jitter

---

# Runtime Clock Separation

## Required Architecture

MaritimeContinuityEngine owns its own accumulator clock.

Renderer frame timing is independent.

---

# Required Loop

```js
let accumulatorMs = 0;

function update(deltaMs) {
  accumulatorMs += deltaMs;

  while (accumulatorMs >= FIXED_TICK_MS) {
    continuityTick(FIXED_TICK_MS);
    accumulatorMs -= FIXED_TICK_MS;
  }
}
```

---

# Deterministic Rule

The continuity engine must never receive:
- variable delta-time motion integration
- direct frame delta movement
- browser frame cadence as simulation truth

---

# Deterministic Replay Clock

MaritimeContinuityEngine must support injected clock control.

Required:

```js
const engine = new MaritimeContinuityEngine({
  getTimestampMs: customClockFn
});
```

Production default:

```js
Date.now()
```

Deterministic replay:
- uses controlled sequence clock
- never reads system wall clock directly

---

# Frame Decoupling Law

## Core Rule

Frame decoupling is NOT motion simulation.

Renderer frame decoupling exists solely to:
- reduce visual stutter
- decouple display refresh from runtime cadence

It must never:
- extrapolate
- dead reckon
- predict
- reconcile
- smooth authority truth

---

# Permitted Frame Decoupling

Renderer may perform only:

linear interpolation between two authoritative continuity snapshots

---

# Forbidden Renderer Behavior

Renderer must not:

- extrapolate beyond latest continuity frame
- use velocity to project forward
- infer future heading
- apply drag
- apply inertia
- calculate future trajectory
- estimate missing continuity ticks
- preserve hidden correction buffers

---

# Canonical Frame Decoupling Rule

If no newer continuity snapshot exists:
renderer HOLDS at the latest truth frame.

Never:
- project forward
- estimate future motion
- blend toward expected position

---

# Renderer Interpolation Scope Lock

Frame decoupling logic may exist only inside:

MarineRenderer._projectVesselToScreen()

or equivalent final projection draw stage.

It must not exist:
- in shared utilities
- in vessel entities
- in overlay systems
- in camera systems
- in AISRuntime
- in continuity engine state

---

# Renderer Temporal Buffer Rules

Renderer may retain only:

```js
{
  previousTruthFrame,
  currentTruthFrame
}
```

No additional:
- historical smoothing windows
- correction history
- future prediction buffers
- adaptive interpolation state

---

# Renderer Divergence Budget

```js
const MAX_RENDER_DIVERGENCE_M = 5;
const HARD_RENDER_DIVERGENCE_M = 10;
```

---

# Divergence Enforcement

Every frame:

```js
divergenceM = distanceMeters(
  truthPosition,
  renderProjectedPosition
);
```

---

# Development Mode

If:

```js
divergenceM > MAX_RENDER_DIVERGENCE_M
```

MarineRenderer must:
- emit console warning
- record telemetry event
- expose divergence through debug APIs

---

# Hard Error Threshold

If:

```js
divergenceM > HARD_RENDER_DIVERGENCE_M
```

System enters:

MARITIME_RENDER_DIVERGENCE_FAULT

Fault behavior:
- disable renderer interpolation
- snap renderer to continuity truth
- expose runtime fault visibly

Silent divergence accumulation is forbidden.

---

# AIS Cadence Governance

AIS cadence variability must be explicitly modeled.

---

# Cadence Profiles

```js
const AIS_CADENCE_PROFILES = {
  CLASS_A_MOVING: {
    expectedIntervalMs: 5000,
    healthyThresholdMs: 15000
  },

  CLASS_A_ANCHORED: {
    expectedIntervalMs: 180000,
    healthyThresholdMs: 300000
  },

  CLASS_B: {
    expectedIntervalMs: 30000,
    healthyThresholdMs: 90000
  },

  DROPOUT: {
    expectedIntervalMs: null,
    healthyThresholdMs: 120000
  }
};
```

---

# Cadence Rule

AIS cadence interpretation must be:
- vessel-class aware
- motion-state aware
- deterministic

A 50m error after:
- 5 seconds
is different from:
- 60 seconds

Reconciliation thresholds must account for AIS cadence profile.

---

# Reconciliation Governance

## Core Rule

Reconciliation must converge deterministically without oscillation.

---

# Forbidden Reconciliation Behavior

Forbidden:
- rubber-banding
- overshoot oscillation
- snap-back drift
- exponential correction stacking
- repeated heading reversal
- frame-rate-dependent convergence

---

# Canonical Reconciliation Curve

Use:

critically damped bounded convergence

Linear interpolation is forbidden.

---

# Required Reconciliation Model

```js
error = targetPosition - predictedPosition;

correctionVelocity =
  error * (2 * naturalFrequency) -
  currentVelocity * naturalFrequency * naturalFrequency;
```

---

# Vessel-Class Correction Durations

```js
const RECONCILIATION_DURATION = {
  container: [30, 60],
  tanker: [25, 50],
  ferry: [10, 20],
  tug: [5, 10],
  pleasure: [3, 8]
};
```

---

# Reconciliation Stability Rules

Correction must:
- converge monotonically
- avoid heading oscillation
- avoid repeated sign reversal
- clamp correction velocity
- remain deterministic across replay

---

# Reconciliation Packet Flood Protection

Multiple AIS packets arriving rapidly must not:
- restart convergence repeatedly
- stack corrections infinitely
- create oscillating trajectories

Required:

new reconciliation packets merge into current correction state

rather than restarting motion correction from scratch.

---

# Dormancy Governance

## Core Rule

Dormant vessels must stop generating continuity pressure.

Dormancy exists to:
- prevent ghost drift
- bound stale continuity
- stabilize long-duration harbor uptime

---

# COASTING → DORMANT Rule

A vessel exits COASTING when ANY:

```js
AISAgeMs > maxCoastSeconds
deadReckoningDistanceM > maxDeadReckoningDistanceM
confidence < DORMANT_CONFIDENCE_THRESHOLD
```

---

# Dormant Rule

DORMANT vessels:
- stop dead reckoning
- stop predictive motion
- preserve identity only
- preserve reacquisition metadata only

Dormant vessels may not:
- continue drifting
- continue wake generation
- continue heading integration
- accumulate hidden motion state

---

# Dormant Tick Policy

Dormant vessels tick only at:

```js
DORMANT_TICK_HZ = 0.1
```

Purpose:
- identity maintenance
- AIS reacquisition checks
- cleanup evaluation

Dormant vessels are not active continuity participants.

---

# Respawn Governance

## Core Rule

Respawn replaces continuity.
It does not slide continuity across geography.

---

# RESPAWNING Duration Bound

```js
const MAX_RESPAWN_WINDOW_MS = 10000;
```

If:
- no confirming AIS packet arrives
- continuity confidence fails

within respawn window:

RESPAWNING → DORMANT

---

# Adaptive Tick Governance

## Dangerous Area

Adaptive cadence must never allow:
- camera observation
- renderer visibility
- overlay state

to mutate deterministic continuity truth.

---

# Deterministic Override Rule

In deterministic mode:

ALL adaptive cadence is disabled.

All vessels:
- tick at fixed cadence
- advance identically across replay

---

# Production Adaptive Tick Tiers

```js
const TICK_TIERS = {
  FULL_TICK_HZ: 20,
  REDUCED_TICK_HZ: 5,
  DORMANT_TICK_HZ: 0.1
};
```

---

# Performance Governance

## Runtime Budget Targets

```js
const PERFORMANCE_BUDGET = {
  continuityUpdatePerVessel_us: 50,
  renderPerVessel_us: 100,
  aisPacketProcessing_us: 200
};
```

---

# Runtime Telemetry Requirements

Required telemetry:

```js
{
  tickDurationMs,
  activeVesselCount,
  dormantVesselCount,
  reconciliationCount,
  divergenceFaultCount,
  staleVesselCount,
  adaptiveTickTransitions
}
```

---

# AIS Validation Governance

AISRuntime must reject:
- impossible coordinates
- impossible headings
- impossible timestamps
- impossible vessel speeds

Rejected packets:
- never enter reconciliation
- never mutate continuity truth

---

# Wake Determinism Governance

Wake systems may read:
- lifecycleState
- speedKts
- vesselClass

Wake systems must not read:
- confidence
- reconciliation state
- dead reckoning state

Wake TTL must be:
- fixed per class
- deterministic
- lifecycle-bound

---

# Decorative Motion Governance

Allowed:
- local-space bobbing
- emissive flicker
- non-geographic sway

Forbidden:
- geographic displacement
- continuity offsets
- hidden drift
- wake-driven displacement

Decorative motion:
- must disable in deterministic mode
- must never alter truthPosition

---

# Runtime Debug Governance

## Required APIs

```js
_wos.debugMaritimeRuntime()
_wos.debugMaritimeDeterminism()
_wos.debugMaritimeDivergence()
_wos.debugMaritimeCadence()
_wos.debugMaritimeLifecycle()
```

---

# Runtime Fault States

## Fault Categories

```js
const MARITIME_RUNTIME_FAULTS = {
  RENDER_DIVERGENCE_FAULT: {},
  RECONCILIATION_OSCILLATION_FAULT: {},
  INVALID_AIS_PACKET_FAULT: {},
  VARIABLE_TICK_DETERMINISM_FAULT: {},
  DORMANT_LEAK_FAULT: {}
};
```

---

# Acceptance Criteria

This spec is accepted when:

- fixed timestep governance is frozen
- renderer frame decoupling is constrained
- renderer extrapolation is forbidden
- divergence enforcement exists
- deterministic replay clocks exist
- reconciliation mathematics are frozen
- adaptive cadence is bounded
- dormant semantics are explicit
- AIS cadence profiles are modeled
- deterministic mode fully disables adaptive behavior

---

# Review Questions

Ask reviewers:

1. Does this fully prevent renderer-side pseudo-simulation?
2. Are deterministic replay guarantees strong enough?
3. Is frame decoupling constrained tightly enough?
4. Can adaptive cadence leak observability into runtime truth?
5. Are reconciliation curves deterministic enough?
6. Are dormant semantics fully bounded?
7. Are divergence enforcement rules sufficient?
8. Are runtime telemetry and fault systems adequate for harbor-scale uptime?

---

# Review Status

This is a constitutional runtime freeze draft.

Do not implement large-scale harbor continuity systems until reviewed and frozen.
