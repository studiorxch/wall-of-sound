# 0522Q_WOS_MaritimeRuntimePrecision_v1.0.0

**Status:** CONSTITUTIONAL PRECISION FREEZE DRAFT  
**Date:** 2026-05-22  
**Domain:** Maritime / Runtime / Deterministic Precision Governance  
**System:** WOS Maritime Continuity Stack  
**Version:** v1.0.0

---

# Purpose

This specification freezes the remaining mathematical and runtime precision gaps identified during review of:

- 0522O_WOS_MaritimeMotionAuthority_v1.0.0
- 0522P_WOS_MaritimeDeterministicRuntime_v1.0.0

This spec exists to prevent:
- divergent implementations
- ambiguous reconciliation behavior
- hidden renderer interpolation creep
- cadence oscillation instability
- undefined fault recovery semantics
- replay inconsistency
- cross-team runtime drift

This document intentionally excludes:
- atmosphere systems
- cinematic systems
- wake visuals
- vessel rendering aesthetics
- camera pacing
- overlay grammar presentation

This is:
- a runtime precision freeze
- a deterministic implementation lock
- a constitutional hardening layer

---

# Constitutional Runtime Law

```text
Precision ambiguity is runtime instability.
```

---

# Determinism Scope

## Canonical Determinism Guarantee

```text
WOS maritime determinism guarantees:
same-machine
same-runtime
same-build
same-input
replay equivalence only.
```

---

# Explicit Non-Guarantees

The system does NOT guarantee:
- cross-browser float equivalence
- cross-platform float equivalence
- GPU deterministic rendering
- cross-engine IEEE consistency
- browser scheduling equivalence

Cross-platform replay drift:
- is expected
- is not considered a runtime fault

---

# Deterministic Runtime Modes

```js
const RUNTIME_MODES = {
  DETERMINISTIC_MODE: {
    fixedTimestepMs: 50,
    adaptiveCadence: false,
    decorativeMotion: false,
    rendererInterpolation: false,
    replayAuthority: true,
    runtimePriority: "truth"
  },

  PRODUCTION_MODE: {
    fixedTimestepMs: 50,
    adaptiveCadence: true,
    decorativeMotion: true,
    rendererInterpolation: true,
    replayAuthority: false,
    runtimePriority: "performance"
  }
};
```

---

# Constitutional Rule

```text
Production mode may optimize scheduling.
It may not mutate continuity mathematics.
```

---

# Fixed Timestep Precision Freeze

```js
const FIXED_TIMESTEP_MS = 50;
const FIXED_TIMESTEP_SEC = 0.05;
```

---

# Clock Source Freeze

Required runtime clock:

```js
performance.now()
```

Forbidden:
- Date.now()
- requestAnimationFrame timestamps
- browser wall clock
- timezone-adjusted clocks

---

# Accumulator Precision Freeze

```js
accumulatorMs += deltaMs;

while (accumulatorMs >= FIXED_TIMESTEP_MS) {
  continuityTick(FIXED_TIMESTEP_SEC);
  accumulatorMs -= FIXED_TIMESTEP_MS;
}
```

Preferred long-duration form:

```js
accumulatorTicks += elapsedTicks;
```

---

# Renderer Frame Rotation Freeze

```js
previousTruthFrame = currentTruthFrame;
currentTruthFrame = incomingTruthFrame;
```

No frame may exist outside the canonical two-slot rotation.

Forbidden:
- historical interpolation windows
- frame selection logic
- smoothing history
- cached convergence states

---

# HOLD Semantics Freeze

```text
If no newer truth frame exists:
renderer HOLDS currentTruthFrame exactly.
```

No:
- extrapolation
- drift
- easing
- predictive smoothing

---

# HOLD Recovery Law

```js
MAX_HOLD_DURATION_MS = 100;
```

If exceeded:

```text
MARITIME_RUNTIME_BACKPRESSURE
```

Required actions:
- emit telemetry
- surface warning
- reduce active load
- preserve continuity truth

---

# Divergence Recovery Freeze

```js
const MAX_RENDER_DIVERGENCE_M = 5;
const HARD_RENDER_DIVERGENCE_M = 10;
```

If divergence exceeds HARD threshold:

```text
MARITIME_RENDER_DIVERGENCE_FAULT
```

Recovery:
1. disable interpolation
2. snap renderer to truth
3. clear interpolation buffer
4. emit telemetry

Visual discontinuity is acceptable.

Fault exits only after:

```js
FAULT_RECOVERY_FRAMES = 3
```

consecutive healthy frames.

---

# Reconciliation Precision Freeze

Canonical reconciliation:

```text
Critically damped bounded convergence
```

Canonical integration:

```text
Symplectic Euler integration
```

Required order:

```js
velocity += acceleration * dt;
position += velocity * dt;
```

Forbidden:
- explicit Euler position-first integration
- variable-step integration
- adaptive dt integration

---

# Reconciliation Frequency Freeze

```js
naturalFrequency = 2 / settlingTimeSec;
```

Deterministic mapping:

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

Forbidden:
- randomization
- camera-derived frequencies
- visibility-derived frequencies

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

# Oscillation Fault Freeze

Enter:

```text
RECONCILIATION_OSCILLATION_FAULT
```

if heading correction reverses sign more than:

```js
2
```

times within one reconciliation window.

Recovery:
- reset reconciliation velocity
- snap heading to latest AIS heading
- restart reconciliation

---

# Packet Merge Freeze

On incoming AIS packet during reconciliation:
1. preserve current velocity
2. replace target position
3. recompute error
4. continue convergence

Forbidden:
- additive correction stacking
- restart-from-zero correction
- queued reconciliation chains

---

# AIS Flood Suppression Freeze

Within a single fixed tick:
retain latest valid AIS packet only per MMSI.

Earlier packets:
- are discarded
- do not accumulate
- do not enter reconciliation

---

# Tick Tier Precision Freeze

```js
const TICK_TIERS = {
  ACTIVE: 20,
  REDUCED: 5,
  DORMANT: 0.1
};
```

Transitions may derive only from lifecycle state.

Forbidden:
- camera proximity
- viewport visibility
- renderer state
- cinematic importance

---

# Tick Tier Dwell Freeze

```js
MIN_TIER_DWELL_MS = 5000;
```

Transitions before dwell expiration:
- are suppressed
- do not reset dwell timer

---

# Dormant Precision Freeze

```js
DORMANT_CONFIDENCE_THRESHOLD = 0.1;
```

Confidence decays linearly:
- 1.0 at latest AIS contact
- 0.0 at maxCoastSeconds

Dormant ticking is lifecycle-governed,
NOT adaptive cadence.

---

# AIS Validation Freeze

```js
const AIS_VALIDATION = {
  MAX_VALID_SPEED_KTS: 60,
  MAX_VALID_HEADING_DEG: 360,
  MAX_PACKET_AGE_MS: 300000
};
```

Rejected packets:
- do not update lastAIS timestamp
- do not reset reconciliation
- do not alter lifecycle state

After 3 consecutive rejected packets:

```js
effectiveAISAgeMs *= 2;
```

After 10 consecutive rejected packets:
force DORMANT.

---

# Fault Precision Freeze

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

Every fault must define:
- entry conditions
- recovery behavior
- exit conditions
- telemetry emission
- visibility rules

Silent faults are forbidden.

---

# DORMANT_LEAK_FAULT Freeze

Trigger:

```js
dormantPositionDeltaM > 1
```

Recovery:
- reset vessel position
- clear velocity
- emit telemetry

---

# VARIABLE_TICK_DETERMINISM_FAULT Freeze

Trigger:

```js
tickVarianceMs > 1
```

while deterministic mode is enabled.

Recovery:
- force continuity resync
- clear accumulator drift
- emit telemetry

---

# Telemetry Precision Freeze

```js
TELEMETRY_FLUSH_HZ = 1;
```

Aggregate telemetry:
- flushes once per second
- does not update every tick

Fault telemetry emits immediately.

---

# Fault Roster Freeze

```js
FAULT_ROSTER_SIZE = 50;
```

Maintain ring buffer:

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

NOT renderer or overlay systems.

---

# Decorative Motion Freeze

Decorative motion:
- exists in local render space only
- never mutates geographic truth

Deterministic mode disables:
- decorative motion
- wake randomness
- emissive randomness

---

# Runtime Precision Acceptance Criteria

Accepted when:
- frame rotation frozen
- HOLD semantics frozen
- divergence recovery frozen
- reconciliation frequency frozen
- packet merge frozen
- tick dwell frozen
- dormant threshold frozen
- fault recovery frozen
- telemetry cadence frozen
- deterministic scope frozen
- integration method frozen

---

# Review Questions

1. Are all remaining deterministic ambiguities now frozen?
2. Can two independent engineers implement identical reconciliation behavior?
3. Are tick-tier transitions sufficiently bounded?
4. Is fault recovery operationally complete?
5. Is replay determinism scope explicit?
6. Are packet flood semantics deterministic?
7. Is renderer frame rotation sufficiently constrained?
8. Does production mode remain subordinate to continuity truth?

---

# Review Status

This document is intended as the final runtime precision freeze before implementation-scale maritime continuity development.

After approval:
- runtime mathematics should be considered constitutionally frozen
- further changes should require amendment-level governance review
