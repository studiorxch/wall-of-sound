# 0522Q_WOS_MaritimeRuntimePrecision_v1.1.0

**Status:** CONSTITUTIONAL PRECISION FREEZE DRAFT  
**Date:** 2026-05-22  
**Domain:** runtime  
**Component:** MaritimeRuntimePrecision  
**Type:** governance-spec  
**Classification:** runtime-authority  
**Version:** v1.1.0

---

# Purpose

This specification freezes the remaining deterministic runtime precision gaps identified during review of:

- 0522O_WOS_MaritimeMotionAuthority_v1.0.0
- 0522P_WOS_MaritimeDeterministicRuntime_v1.0.0

This spec defines:

- deterministic timestep governance
- renderer HOLD semantics
- reconciliation mathematics
- packet merge behavior
- divergence recovery semantics
- adaptive cadence boundaries
- deterministic replay scope
- fault entry/exit law
- runtime precision guarantees

This document intentionally excludes:

- atmosphere styling
- wake visuals
- cinematic pacing
- overlay aesthetics
- camera choreography
- vessel rendering art direction

---

# Constitutional Runtime Law

```text
Precision ambiguity is runtime instability.
```

If identical AIS input can produce:
- different runtime outputs
- different reconciliation behavior
- different vessel paths
- different dormancy transitions

then runtime governance is incomplete.

---

# Determinism Scope

## Canonical Guarantee

```text
Deterministic replay guarantees:

same-machine
same-runtime
same-build
same-input
same-timestep
→ equivalent continuity output
```

---

# Explicit Non-Guarantees

The system does NOT guarantee:
- cross-browser float equivalence
- GPU deterministic rendering
- cross-platform IEEE parity
- browser scheduling equivalence

Cross-platform replay drift:
- is expected
- is NOT considered runtime corruption

---

# Runtime Modes

```js
const RUNTIME_MODES = {
  DETERMINISTIC_MODE: {
    fixedTimestepMs: 50,
    adaptiveCadence: false,
    rendererInterpolation: false,
    decorativeMotion: false,
    replayAuthority: true,
    telemetryVerbose: true
  },

  PRODUCTION_MODE: {
    fixedTimestepMs: 50,
    adaptiveCadence: true,
    rendererInterpolation: true,
    decorativeMotion: true,
    replayAuthority: false,
    telemetryVerbose: false
  }
};
```

---

# Production Mode Constraint

```text
Production mode may optimize scheduling.
Production mode may NOT alter continuity mathematics.
```

Production mode may:
- reduce tick frequency
- reduce telemetry cadence
- disable debug overlays

Production mode may NOT:
- alter reconciliation curves
- alter lifecycle transitions
- alter dead reckoning integration
- alter deterministic continuity ownership

---

# Fixed Timestep Freeze

## Canonical Timestep

```js
const FIXED_TIMESTEP_MS = 50;
const FIXED_TIMESTEP_SEC = 0.05;
```

---

# Runtime Clock Freeze

## Required Clock

```js
performance.now()
```

---

# Forbidden Clock Sources

Forbidden:
- Date.now()
- requestAnimationFrame timestamps
- timezone-adjusted clocks
- renderer frame clocks

---

# Canonical Accumulator Loop

```js
accumulatorMs += deltaMs;

while (accumulatorMs >= FIXED_TIMESTEP_MS) {
  continuityTick(FIXED_TIMESTEP_SEC);
  accumulatorMs -= FIXED_TIMESTEP_MS;
}
```

---

# Accumulator Precision Rule

Long-duration uptime implementations should prefer:

```js
accumulatorTicks += elapsedTicks;
```

over:
```js
accumulatorMs += deltaMs;
```

to minimize floating-point drift.

---

# Renderer Frame Rotation Freeze

## Canonical Two-Frame Model

```js
previousTruthFrame = currentTruthFrame;
currentTruthFrame = incomingTruthFrame;
```

No additional:
- smoothing windows
- hidden interpolation history
- correction caches
- frame arbitration systems

are permitted.

---

# Renderer HOLD Semantics

## Canonical HOLD Rule

```text
If no newer truth frame exists:
renderer HOLDS currentTruthFrame exactly.
```

Forbidden during HOLD:
- extrapolation
- velocity projection
- predictive smoothing
- drift continuation
- visual continuity repair

---

# HOLD Timeout Governance

```js
MAX_HOLD_DURATION_MS = 100;
```

If HOLD exceeds threshold:

```text
MARITIME_RUNTIME_BACKPRESSURE
```

must trigger.

---

# Backpressure Response

Required:
1. emit telemetry
2. expose debug warning
3. preserve truth position
4. reduce runtime load if possible

Forbidden:
- speculative continuation
- renderer dead reckoning
- fake continuity smoothing

---

# Divergence Governance

## Canonical Thresholds

```js
const MAX_RENDER_DIVERGENCE_M = 5;
const HARD_RENDER_DIVERGENCE_M = 10;
```

---

# Divergence Fault Entry

If:

```js
divergenceM > HARD_RENDER_DIVERGENCE_M
```

enter:

```text
MARITIME_RENDER_DIVERGENCE_FAULT
```

---

# Divergence Recovery

On fault entry:
1. disable renderer interpolation
2. snap renderer to truth
3. clear interpolation buffers
4. emit telemetry immediately

---

# Constitutional Recovery Rule

```text
Visual harshness during recovery is acceptable.
Truth preservation is mandatory.
```

---

# Divergence Fault Exit

Fault exits only after:

```js
divergenceM < MAX_RENDER_DIVERGENCE_M
```

for:

```js
FAULT_RECOVERY_FRAMES = 3
```

consecutive frames.

---

# Reconciliation Freeze

## Canonical Reconciliation Type

```text
Critically damped bounded convergence
```

ONLY.

Linear interpolation is forbidden.

---

# Canonical Integration Method

```text
Symplectic Euler integration
```

is mandatory.

---

# Integration Order Freeze

```js
velocity += acceleration * dt;
position += velocity * dt;
```

must execute in that order.

---

# Forbidden Integration Methods

Forbidden:
- explicit Euler position-first integration
- variable dt integration
- adaptive integration
- frame-dependent integration

---

# Natural Frequency Freeze

## Canonical Formula

```js
naturalFrequency = 2 / settlingTimeSec;
```

---

# Settling Time Mapping

```js
t =
  clamp(
    errorM / RECONCILIATION_ERROR_M,
    0,
    1
  );

settlingTimeSec =
  lerp(
    minDurationSec,
    maxDurationSec,
    t
  );
```

---

# Frequency Constraints

Forbidden:
- randomization
- camera-derived frequencies
- visibility-derived frequencies
- adaptive convergence tuning

---

# Canonical Reconciliation Step

```js
const dt = FIXED_TIMESTEP_SEC;

const error =
  targetPosition - currentPosition;

const k =
  2 * naturalFrequency;

const damping =
  naturalFrequency * naturalFrequency;

const acceleration =
  error * k -
  velocity * damping;

velocity += acceleration * dt;

position += velocity * dt;
```

---

# Reconciliation Stability Law

Correction must:
- converge monotonically
- avoid overshoot
- avoid oscillation
- avoid repeated sign reversal

---

# Heading Reconciliation Freeze

Heading reconciliation is independent from positional reconciliation.

Required:
- heading uses shortest angular path
- heading wraparound normalization must occur before reconciliation
- heading convergence must remain bounded

---

# Canonical Heading Normalization

```js
deltaHeading =
  ((targetHeading - currentHeading + 540) % 360) - 180;
```

---

# Heading Oscillation Fault

Enter:

```text
RECONCILIATION_OSCILLATION_FAULT
```

if:
```js
headingCorrectionSignChanges > 2
```

within one reconciliation window.

---

# Oscillation Recovery

On fault:
1. clear heading reconciliation velocity
2. snap heading to latest AIS heading
3. restart reconciliation from current truth state

---

# Packet Merge Freeze

## Canonical Merge Rule

On new AIS packet during reconciliation:

1. preserve current reconciliation velocity
2. replace target position
3. recompute error
4. continue convergence

---

# Forbidden Packet Merge Behavior

Forbidden:
- additive correction stacking
- restart-from-zero reconciliation
- reconciliation queues
- multi-target convergence
- oscillating packet arbitration

---

# AIS Flood Suppression

Within a single deterministic tick:
- retain latest valid AIS packet only
- discard older packets for same MMSI

Older packets:
- do not accumulate
- do not restart reconciliation
- do not mutate continuity state

---

# Tick Tier Freeze

## Canonical Tick Tiers

```js
const TICK_TIERS = {
  ACTIVE: 20,
  REDUCED: 5,
  DORMANT: 0.1
};
```

---

# Tick Transition Governance

Tick tier transitions may derive ONLY from:
- lifecycleState
- AIS age
- dormant state

Forbidden:
- camera proximity
- viewport visibility
- overlay visibility
- cinematic importance
- renderer state

---

# Tick Tier Dwell Freeze

```js
MIN_TIER_DWELL_MS = 5000;
```

Tier transitions before dwell expiration:
- are suppressed
- do not reset dwell timer

This prevents cadence flapping.

---

# Dormant Precision Freeze

## Canonical Threshold

```js
DORMANT_CONFIDENCE_THRESHOLD = 0.1;
```

---

# Confidence Decay Freeze

Confidence decays linearly:
- from 1.0 at latest AIS contact
- to 0.0 at maxCoastSeconds

---

# Dormant Tick Clarification

```text
DORMANT cadence is lifecycle-governed.
It is NOT adaptive cadence.
```

Dormant vessels remain deterministic.

---

# AIS Validation Freeze

## Canonical Limits

```js
const AIS_VALIDATION = {
  MAX_VALID_SPEED_KTS: 60,
  MAX_VALID_HEADING_DEG: 360,
  MAX_PACKET_AGE_MS: 300000
};
```

---

# Rejected Packet Rule

Rejected packets:
- do not update lastAIS timestamp
- do not reset reconciliation
- do not alter lifecycle state

---

# Consecutive Rejection Escalation

After:

```js
3 consecutive rejected packets
```

effective AIS age accelerates:

```js
effectiveAISAgeMs *= 2;
```

---

# Forced Dormancy

After:

```js
10 consecutive rejected packets
```

force:
```text
DORMANT
```

---

# Fault Precision Freeze

## Required Fault Set

```js
const RUNTIME_FAULTS = {
  MARITIME_RENDER_DIVERGENCE_FAULT: {},
  RECONCILIATION_OSCILLATION_FAULT: {},
  INVALID_AIS_PACKET_FAULT: {},
  VARIABLE_TICK_DETERMINISM_FAULT: {},
  DORMANT_LEAK_FAULT: {},
  MARITIME_RUNTIME_BACKPRESSURE: {}
};
```

---

# Mandatory Fault Semantics

Every fault must define:
- entry conditions
- recovery behavior
- exit conditions
- telemetry emission
- visibility rules

Silent fault states are forbidden.

---

# DORMANT_LEAK_FAULT

## Trigger

```js
dormantPositionDeltaM > 1
```

---

# Recovery

1. reset vessel to dormant truth position
2. clear dead reckoning velocity
3. emit telemetry immediately

---

# VARIABLE_TICK_DETERMINISM_FAULT

## Trigger

```js
tickVarianceMs > 1
```

while deterministic mode is enabled.

---

# Recovery

1. force continuity resync
2. clear accumulator drift
3. emit deterministic violation telemetry

---

# Telemetry Freeze

## Canonical Telemetry Flush

```js
TELEMETRY_FLUSH_HZ = 1;
```

Aggregate telemetry:
- flushes once per second
- does not emit every tick

---

# Immediate Fault Telemetry

Fault events:
- emit immediately
- bypass flush cadence

---

# Fault Roster Freeze

## Canonical Fault Roster

```js
FAULT_ROSTER_SIZE = 50;
```

Maintain bounded ring buffer:

```js
{
  mmsi,
  faultType,
  timestampMs,
  lifecycleState
}
```

---

# Wake Precision Freeze

Wake TTL values belong inside:

```text
physicalProfile
```

NOT:
- renderer
- overlay systems
- observability systems

---

# Decorative Motion Freeze

Decorative motion:
- exists in local render space only
- never mutates geographic truth

---

# Deterministic Override

When deterministic mode is enabled:
- decorative motion disabled
- wake randomness disabled
- emissive randomness disabled

---

# Acceptance Criteria

This spec is accepted when:

- frame rotation is frozen
- HOLD semantics are frozen
- divergence recovery semantics are frozen
- reconciliation frequency derivation is frozen
- heading reconciliation semantics are frozen
- packet merge behavior is frozen
- tick-tier dwell behavior is frozen
- dormant thresholds are frozen
- AIS rejection escalation is frozen
- fault recovery semantics are frozen
- telemetry cadence is frozen
- integration method is frozen

---

# Review Status

This document is intended as the final runtime precision freeze before implementation-scale maritime continuity development.

After approval:
- runtime mathematics should be considered constitutionally frozen
- further changes should require amendment-level governance review
