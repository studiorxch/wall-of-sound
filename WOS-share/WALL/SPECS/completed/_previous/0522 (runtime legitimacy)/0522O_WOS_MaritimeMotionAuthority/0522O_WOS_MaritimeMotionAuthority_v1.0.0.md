# 0522O_WOS_MaritimeMotionAuthority_v1.0.0

**Status:** REVIEW DRAFT  
**Date:** 2026-05-22  
**Domain:** Maritime / Motion / Continuity Governance  
**System:** WOS Maritime Continuity Stack  
**Version:** v1.0.0

---

# Purpose

Define the canonical motion authority architecture for WOS maritime vessels before implementing motion smoothing, dead reckoning, vessel taxonomy, harbor population, wakes, or atmospheric vessel behaviors.

This spec exists to prevent:

- renderer-controlled simulation truth
- hidden double interpolation
- ambiguous AIS authority
- non-deterministic vessel motion
- stale vessel ghost accumulation
- taxonomy leakage between simulation and rendering
- future debugging collapse at harbor scale

This spec follows the rendering milestone already achieved:

- grounded tilt-aware vessel projection works
- dedicated marine overlay canvas works
- AIS integration works
- debug vessel rendering works
- Mapbox projection works

This spec is not about whether boats can render.

This spec defines who owns vessel truth.

---

# Core Law

```text
Continuity Engine owns vessel motion truth.
Renderer owns presentation only.
```

No other system may mutate or reinterpret vessel position, heading, speed, velocity, lifecycle state, or continuity state.

---

# Authority Hierarchy

```js
const MARITIME_MOTION_AUTHORITY = {
  AIS_RUNTIME: "provides discrete source snapshots",
  MARITIME_CONTINUITY_ENGINE: "sole authority for between-snapshot vessel motion truth",
  MARINE_RENDERER: "read-only visual projection of continuity engine output",
  OBSERVABILITY_CAMERA: "view/framing only; never vessel transform",
  OVERLAY_GRAMMAR: "symbolic visibility only; never vessel transform",
  ATMOSPHERE_SYSTEMS: "presentation modifiers only; never vessel transform"
};
```

---

# Layer Responsibilities

## 1. AISRuntime

AISRuntime owns:

- raw AIS packet ingestion
- packet normalization
- MMSI identity association
- source timestamps
- raw latitude / longitude
- raw SOG / COG / heading fields
- AIS lifecycle metadata
- feed health state

AISRuntime does not own:

- smoothed vessel position
- cinematic movement
- visual easing
- renderer interpolation
- wake behavior
- camera importance

AISRuntime emits discrete maritime source snapshots.

---

## 2. MaritimeContinuityEngine

Create:

```text
wall/systems/world/maritimeContinuityEngine.js
```

This system is the sole authority for continuous vessel motion truth.

It owns:

- predicted position
- predicted heading
- velocity vector
- dead reckoning
- AIS reconciliation
- heading inertia
- class-based motion constraints
- confidence decay
- lifecycle state transitions
- dormant vessel progression
- fixed-step deterministic ticking

It consumes:

- AISRuntime snapshots
- vessel simulation profiles
- timestamps
- continuity doctrine constants

It emits:

```js
{
  mmsi,
  state,
  lifecycleState,
  sourceSnapshot,
  truthPosition,
  predictedPosition,
  velocity,
  speedKts,
  headingDeg,
  confidence,
  staleWeight,
  deadReckoningWeight,
  interpolationWeight,
  lastAISAt,
  lastContinuityTickAt,
  classId
}
```

This emitted state is read-only for every downstream system.

---

## 3. MarineRenderer

MarineRenderer owns:

- geographic projection
- grounded hull drawing
- screen-space styling
- LOD rendering
- debug overlays
- label rendering
- wake drawing as presentation
- emissive presentation

MarineRenderer must not:

- calculate dead reckoning
- modify vessel position
- modify vessel heading
- apply water drag
- infer velocity from frame deltas
- reconcile AIS packets
- create synthetic trajectories
- store long-lived motion correction state

Renderer may only perform frame interpolation if explicitly allowed by this spec and only between two authoritative continuity frames.

Default direction:

```text
Renderer should receive continuous vessel truth from MaritimeContinuityEngine and draw it directly.
```

---

## 4. ObservabilityCamera

ObservabilityCamera owns:

- camera framing
- camera pacing
- viewport drift
- linger behavior
- geographic attention

ObservabilityCamera must not:

- extend vessel motion
- preserve fake vessel continuity
- modify vessel position
- create implied vessel movement
- slow or speed vessel truth

Camera may linger on geography.

Camera may not fabricate maritime continuity.

---

## 5. OverlayGrammar

OverlayGrammar owns:

- symbolic visibility reduction
- uncertainty expression
- opacity / scale interpretation
- overlay projection records

OverlayGrammar must not:

- alter vessel motion state
- alter continuity truth
- alter AIS lifecycle
- influence dead reckoning
- suppress runtime vessel existence

---

# Motion Truth Contract

Every vessel has exactly one authoritative continuous state at time `t`.

That state is owned by MaritimeContinuityEngine.

```js
type MaritimeMotionTruth = {
  mmsi: string;
  timestampMs: number;
  lifecycleState: MaritimeLifecycleState;
  lat: number;
  lng: number;
  headingDeg: number;
  velocityEastMps: number;
  velocityNorthMps: number;
  speedKts: number;
  confidence: number;
  staleWeight: number;
  deadReckoningWeight: number;
  classId: string;
};
```

Downstream systems must treat this object as immutable.

---

# Maritime Lifecycle State Machine

```js
const MARITIME_LIFECYCLE = {
  SPAWNING: "first observation; no continuity history yet",
  TRACKING: "recent AIS; normal deterministic motion",
  RECONCILING: "new AIS conflicts with predicted position",
  COASTING: "AIS delayed; dead reckoning active",
  DORMANT: "AIS stale; motion reduced or stopped",
  RESPAWNING: "large discontinuity or reacquisition after dormancy"
};
```

---

# Lifecycle Rules

## SPAWNING

Entered when:

- vessel appears for first time
- no previous continuity state exists

Behavior:

- initialize from AIS snapshot
- no interpolation history
- fade-in may be renderer-only
- motion truth starts at source coordinate

---

## TRACKING

Entered when:

- AIS cadence is healthy
- position error is within reconciliation threshold

Behavior:

- continuity engine advances motion deterministically
- vessel follows predicted kinematic path
- renderer reads truth directly

---

## RECONCILING

Entered when:

- new AIS packet diverges from predicted position
- divergence is above minor correction threshold
- divergence is below respawn threshold

Behavior:

- continuity engine resolves correction
- correction curve is deterministic
- correction speed depends on vessel simulation profile
- renderer does not add additional correction

---

## COASTING

Entered when:

- AIS update is delayed but within allowed coast window

Behavior:

- continue dead reckoning
- decay confidence gradually
- reduce deadReckoningWeight over time
- clamp prediction to maximum dead-reckoning radius

---

## DORMANT

Entered when:

- AIS age exceeds class or system threshold
- confidence decays below minimum active threshold
- vessel no longer has reliable predictive authority

Behavior:

- stop or reduce motion truth
- preserve identity for reacquisition
- renderer may reduce opacity through OverlayGrammar
- vessel must not continue drifting indefinitely

---

## RESPAWNING

Entered when:

- AIS reacquires vessel after dormancy
- position jump exceeds hard discontinuity threshold
- predicted state is no longer trustworthy

Behavior:

- reset continuity state
- optionally fade visual identity out/in
- do not slide vessel unrealistically across harbor

---

# AIS Reconciliation Protocol

When new AIS packet arrives:

1. AISRuntime normalizes packet.
2. MaritimeContinuityEngine compares AIS position against predicted truth.
3. Compute spatial error:

```js
errorM = distanceMeters(predictedPosition, aisPosition)
```

4. Select protocol:

```js
if (errorM <= MINOR_ERROR_M) {
  applySmallCorrection();
} else if (errorM <= RECONCILIATION_ERROR_M) {
  enterReconciling();
} else {
  enterRespawning();
}
```

---

# Correction Classes

## Small Correction

- no visible jump
- update velocity vector gradually
- keep lifecycle TRACKING

## Reconciliation Correction

- lifecycle becomes RECONCILING
- correction is deterministic
- correction duration is class-dependent
- maximum correction velocity is bounded
- renderer does not apply additional smoothing

## Respawn Correction

- lifecycle becomes RESPAWNING
- no high-speed slide
- no rubber-band motion
- reset to AIS position after transition policy

---

# Dead Reckoning Bounds

Dead reckoning must be bounded.

Each vessel class defines:

```js
{
  maxCoastSeconds,
  maxDeadReckoningDistanceM,
  maxCorrectionSpeedMps,
  maxTurnRateDegPerSec
}
```

A vessel may never continue indefinitely from stale telemetry.

If predicted position exceeds allowed dead-reckoning radius:

```text
motion truth decelerates toward stop
confidence continues decaying
lifecycle moves toward DORMANT
```

---

# Interpolation Ownership Rule

Only one system may apply temporal smoothing to vessel position.

Canonical ownership:

```text
MaritimeContinuityEngine owns motion smoothing.
MarineRenderer does not.
```

Renderer may perform only frame decoupling if and only if:

- it interpolates between two authoritative continuity snapshots
- it does not alter truth
- it does not store long-lived correction state
- it never extrapolates beyond authoritative state

Forbidden:

- renderer-side dead reckoning
- renderer-side water drag
- renderer-side heading inertia
- renderer-side AIS reconciliation
- camera-driven vessel smoothing
- atmospheric vessel motion modulation

---

# Renderer Divergence Budget

Renderer visual position may not diverge from MaritimeContinuityEngine truth beyond:

```js
MAX_RENDER_DIVERGENCE_M = 5;
```

Exception:

- purely decorative offsets such as bobbing may occur in screen-space or local hull-space
- decorative offsets must not affect canonical vessel coordinate
- decorative offsets must be disabled in deterministic debug mode

---

# Taxonomy Separation

Vessel taxonomy must split into three profiles.

## Physical Profile

Shared by simulation and rendering.

```js
physicalProfile: {
  hullLengthM,
  hullWidthM,
  displacementClass,
  wakeStrengthBase
}
```

## Simulation Profile

Consumed only by MaritimeContinuityEngine.

```js
simulationProfile: {
  cruiseSpeedKts,
  maxTurnRateDegPerSec,
  accelerationMps2,
  decelerationMps2,
  inertia,
  drag,
  maxCoastSeconds,
  maxDeadReckoningDistanceM,
  maxCorrectionSpeedMps
}
```

## Render Profile

Consumed only by MarineRenderer.

```js
renderProfile: {
  hullPalette,
  accentPalette,
  emissiveProfile,
  lightPattern,
  labelPolicy,
  renderLOD,
  outlinePolicy
}
```

Flat taxonomy objects are forbidden.

---

# Initial Vessel Classes

```js
const VESSEL_CLASSES = {
  ferry: {},
  tug: {},
  tanker: {},
  container: {},
  passenger: {},
  service: {},
  fishing: {},
  pleasure: {},
  unknown: {}
};
```

All unmapped AIS types must fall back to `unknown`.

Taxonomy mapping must be data-driven and extendable.

---

# Debug / Runtime Separation

Debug overlays must be separate from production render passes.

Debug may show:

- MMSI labels
- projected center dots
- hull outlines
- motion vectors
- truth vs render offset
- lifecycle state
- reconciliation state
- confidence decay
- stale weight
- dead reckoning radius

Debug must not:

- alter vessel scale
- alter vessel motion
- alter vessel lifecycle
- alter renderer truth
- influence camera selection
- modify AIS state

Production defaults:

```js
labels: false
centerDots: false
debugOutlines: false
motionVectors: false
```

---

# Required Debug APIs

```js
_wos.debugMaritimeMotion(mmsi)
_wos.debugMaritimeTruth()
_wos.debugMaritimeLifecycle()
_wos.debugMaritimeDivergence()
_wos.debugMaritimeTaxonomy(mmsi)
_wos.setMaritimeDeterministicMode(true|false)
```

---

# Canonical Debug Truth View

For every vessel, debug must show:

```js
{
  mmsi,
  lifecycleState,
  aisPosition,
  predictedPosition,
  renderPosition,
  aisAgeMs,
  errorFromAIS_M,
  renderDivergenceM,
  confidence,
  staleWeight,
  deadReckoningWeight,
  classId,
  simulationProfileId,
  renderProfileId
}
```

This prevents future debugging collapse.

---

# Determinism Requirements

MaritimeContinuityEngine must support deterministic mode.

Deterministic mode requires:

- fixed timestep
- no frame-rate-dependent vessel truth
- seeded random behavior
- reproducible vessel paths from identical AIS input
- no renderer-owned motion correction
- no decorative motion applied to truth

Same input AIS stream must produce same vessel path.

---

# Performance / Scale Governance

Maritime motion must support harbor-scale populations.

Initial scale targets:

```js
TARGET_ACTIVE_VESSELS = 200;
TARGET_DORMANT_VESSELS = 2000;
TARGET_RENDERED_VESSELS = 500;
```

---

# Variable Tick Policy

Not all vessels require equal update frequency.

MaritimeContinuityEngine may reduce tick rate based on:

- distance from camera
- projected screen size
- lifecycle state
- observability state
- vessel class
- confidence level

But reduced tick rate must not change deterministic output in deterministic mode.

---

# Atmospheric Systems Boundary

Atmosphere may affect:

- opacity
- haze
- color grading
- glow
- wake visibility
- lighting intensity

Atmosphere must not affect:

- vessel position
- vessel heading
- vessel speed
- velocity vector
- AIS reconciliation
- lifecycle state

---

# Camera Boundary

Camera may:

- observe vessel clusters
- frame geographic areas
- linger on harbor zones
- react to density

Camera may not:

- extend stale vessel motion
- imply fake trajectory continuation
- alter vessel speed
- alter dead reckoning
- alter reconciliation

Camera watches geography.

It does not steer maritime truth.

---

# Wake Boundary

Wake rendering is presentation only.

Wake may read:

- vessel speed
- vessel class
- confidence
- lifecycle state

Wake may not:

- influence vessel motion
- imply active motion after lifecycle DORMANT
- persist indefinitely after vessel dormancy

Wake persistence must have hard TTL.

---

# Implementation Phases

## Phase 1 — Authority Extraction

- create MaritimeContinuityEngine
- move vessel motion smoothing out of MarineRenderer
- disable renderer-owned vessel interpolation
- expose canonical motion truth state

## Phase 2 — Lifecycle Protocol

- implement SPAWNING / TRACKING / RECONCILING / COASTING / DORMANT / RESPAWNING
- implement AIS reconciliation thresholds
- implement dead reckoning bounds

## Phase 3 — Taxonomy Split

- create physicalProfile
- create simulationProfile
- create renderProfile
- map AIS type codes to vessel classes
- add unknown fallback

## Phase 4 — Debug Instrumentation

- truth vs render inspection
- lifecycle visualization
- reconciliation logging
- divergence warnings
- deterministic replay mode

## Phase 5 — Harbor Population

- seed 50 vessels
- seed 200 vessels
- profile performance
- identify O(n²) risks
- validate variable tick policy

---

# Blocking Rules Before More Features

Do not implement the following until MaritimeMotionAuthority is frozen:

- wakes
- emissive vessel lighting
- harbor-wide population
- camera pacing changes
- atmospheric motion modulation
- 2.5D vessel models
- vessel behavior archetypes

Reason:

All of these depend on stable motion truth.

---

# Acceptance Criteria

This spec is accepted when:

- one system owns continuous vessel motion truth
- renderer interpolation cannot become pseudo-simulation
- AIS reconciliation protocol is defined
- lifecycle state machine is defined
- taxonomy is split into physical / simulation / render profiles
- debug/runtime separation is explicit
- deterministic mode is specified
- dead reckoning has bounds
- stale vessels cannot drift indefinitely
- camera and atmosphere cannot mutate vessel truth

---

# Review Questions

Ask reviewers:

1. Does this fully prevent renderer-controlled vessel motion?
2. Are AIS truth and predicted truth separated cleanly enough?
3. Is the interpolation ownership rule strict enough?
4. Are lifecycle transitions sufficient for stale and reacquired vessels?
5. Does taxonomy separation prevent renderer/runtime leakage?
6. Are deterministic debug requirements strong enough?
7. Are scale targets and tick policies realistic?
8. Are any systems still able to mutate vessel truth accidentally?

---

# Review Status

This is a review draft.

Do not implement until reviewed.

The purpose of this spec is to freeze maritime motion authority before adding any additional harbor realism.
