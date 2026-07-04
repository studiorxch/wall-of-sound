---
title: "WOS Maritime Wake Authority"
filename: "0523D_WOS_MaritimeWakeAuthority_v1.1.0.md"
version: "1.1.0"
date: "2026-05-24"
system: "WOS"
module: "Maritime Wake Authority"
type: "runtime-governance-spec"
status: "[FREEZE — GO]"
build_readiness: "[FREEZE — GO]"
owner: "StudioRich / WOS"

canonical_scope:
  - wake emission governance
  - wake lifecycle containment
  - deterministic wake decay
  - wake provenance separation
  - wake replay compatibility
  - renderer containment
  - wake budget governance
  - continuity-safe wake infrastructure

supersedes:
  - "0523D_WOS_MaritimeWakeAuthority_v1.0.0.md"

parent_specs:
  - "0522O_WOS_MaritimeMotionAuthority_v1.0.0.md"
  - "0523A_WOS_MaritimeVesselTaxonomy_v1.1.0.md"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.0.0.md"
  - "0523C_WOS_MaritimeSpawnEcology_v1.2.1.md"
---

# 0523D_WOS_MaritimeWakeAuthority_v1.1.0

## Build Readiness

**Status:** `[FREEZE — GO]`

This revision hardens:
- deterministic wake emission ordering
- wake geometry construction contracts
- replay-safe decay semantics
- ring-buffer governance
- continuity-safe AIS recovery behavior
- wake cleanup determinism
- simulation clock ownership
- wake identifier stability
- harbor-scale scalability guarantees

This specification is now considered:
- constitutionally stable
- replay-safe
- continuity-safe
- renderer-contained
- implementation-ready
- harbor-scale survivable

---

# 1. Core Wake Doctrine

The wake system preserves passive structural memory.

Wake systems may visualize:
- path residue
- atmospheric turbulence
- directional movement memory
- environmental readability

Wake systems may NOT:
- create continuity authority
- extend vessel truth
- resurrect vessel state
- infer vessel motion
- steer simulation
- generate authoritative navigation

Core invariant:

```text
vessel motion creates wake memory
wake memory never creates vessel motion
```

---

# 2. Runtime Authority Boundary

WakeAuthority owns:
- wake emission
- wake lifecycle
- wake decay
- wake provenance
- wake registry mutation
- deterministic cleanup

Renderer systems may:
- observe WakeRegistry
- visualize wake geometry
- apply symbolic atmospheric interpretation

Renderer systems may NOT:
- create authoritative wake events
- alter wake lifetime
- extend wake continuity
- move wake anchors
- mutate wake provenance
- alter vessel state

WakeRegistry remains runtime-owned truth.

---

# 3. Wake Provenance Doctrine

Wake provenance must remain explicitly declared.

```ts
type WakeProvenance =
  | "AIS_VESSEL"
  | "SYNTHETIC_ECOLOGY";
```

Synthetic wakes may NOT:
- impersonate AIS truth
- inherit AIS authority
- survive beyond synthetic lifetime limits
- silently convert into authoritative wakes

---

# 4. Wake Segment Schema

```ts
type WakeSegment = {
  readonly wakeId: string;

  readonly vesselId: string;
  readonly provenance: WakeProvenance;

  readonly createdAtMs: number;
  readonly expiresAtMs: number;

  readonly start: {
    readonly lat: number;
    readonly lng: number;
  };

  readonly end: {
    readonly lat: number;
    readonly lng: number;
  };

  readonly headingDeg: number;
  readonly speedKts: number;

  readonly intensityRaw: number;
  readonly widthMeters: number;
  readonly turbulenceRaw: number;

  readonly populationTierAtEmission:
    | "HERO"
    | "MID"
    | "BACKGROUND"
    | "GHOST";

  readonly sourceContinuityConfidence: number;

  readonly parentEvicted: boolean;
};
```

Population tiers are governed by:

```text
0523B_WOS_MaritimePopulationHierarchy_v1.0.0.md
```

Wake geometry is:
- symbolic
- bounded
- lightweight
- replay-safe

Wake geometry is NOT:
- hydrodynamic simulation
- physics truth
- environmental authority

---

# 5. Wake Identifier Doctrine

Wake identifiers must remain deterministic.

Canonical format:

```text
wake::<vesselId>::<createdAtMs>
```

Example:

```text
wake::mmsi_367445120::1716561200000
```

Wake identifiers may not:
- use random UUIDs
- use wall-clock timestamps
- vary between replay runs

---

# 6. Wake Registry Governance

WakeRegistry stores passive wake memory.

WakeRegistry is:
- append-controlled
- runtime-owned
- replay-compatible
- deterministic

WakeRegistry may not:
- own vessel lifecycle
- infer continuity
- mutate vessel state
- preserve dead vessels

---

## 6.1 Ring Buffer Doctrine

WakeRegistry must use:
- fixed-allocation ring buffers
- deterministic overwrite ordering
- O(1) mutation performance

WakeRegistry may NOT:
- rely on repeated array shifting
- rely on heap-fragmenting splice loops
- depend on garbage-collection cleanup

Overflow behavior:
- oldest eligible segment overwritten first
- overwrite ordering deterministic
- overwrite ordering replay-safe

---

# 7. Wake Budget Governance

```ts
const WAKE_MAX_SEGMENTS_GLOBAL = 5000;

const WAKE_MAX_SYNTHETIC_SEGMENTS_GLOBAL = 1000;

const WAKE_MAX_SEGMENTS_PER_VESSEL = 48;

const WAKE_MAX_SEGMENTS_PER_ZONE = 800;
```

Budget limits exist to:
- preserve replay determinism
- prevent atmospheric inflation
- maintain harbor readability
- preserve renderer scalability

Budget systems may not:
- silently alter provenance
- preferentially preserve synthetic wakes
- suppress HERO wakes unpredictably

---

# 8. Wake Emission Cadence

```ts
const WAKE_EMIT_INTERVAL_HERO_MS = 500;

const WAKE_EMIT_INTERVAL_MID_MS = 1000;

const WAKE_EMIT_INTERVAL_BACKGROUND_MS = 3000;

const WAKE_EMIT_INTERVAL_GHOST_MS = 0;
```

Ghost vessels emit:
- no WakeRegistry geometry
- no authoritative wake segments

Renderer shimmer for ghost vessels is:
- symbolic only
- renderer-local
- non-authoritative

Renderer shimmer is NOT WakeRegistry truth.

---

# 9. Wake Emission Distance Governance

```ts
const WAKE_MIN_SEGMENT_DISTANCE_M = 8;
```

Distance checks must use:
- localized harbor-space approximation
- deterministic linear scaling
- low-cost coordinate conversion

WakeAuthority may NOT:
- perform expensive geodetic calculations
- rely on per-frame haversine loops
- introduce frame-rate-dependent geometry emission

The wake system prioritizes:
- deterministic atmospheric realism
- scalability
- replay safety

NOT:
- centimeter-accurate maritime surveying

---

# 10. Wake Emitter State

```ts
type WakeEmitterState = {
  eligible: boolean;

  wakeClass:
    | "NONE"
    | "MINIMAL"
    | "STANDARD"
    | "HEAVY";

  populationTier:
    | "HERO"
    | "MID"
    | "BACKGROUND"
    | "GHOST";

  provenance: WakeProvenance;
};
```

`eligible` is resolved by:

```ts
resolveWakeEligibility()
```

Eligibility is determined BEFORE emission checks occur.

---

# 11. Deterministic Emission Doctrine

Wake emission ordering must remain deterministic.

Canonical ordered emission evaluation:

```text
1. emitter.eligible == false → reject
2. wakeClass == NONE → reject
3. populationTier == GHOST → reject
4. global wake budget exceeded → reject
5. per-vessel budget exceeded → reject
6. emit interval not satisfied → reject
7. minimum distance not satisfied → reject
8. emit wake segment
```

This ordering may not vary between implementations.

Emission ordering determines:
- suppression behavior
- replay parity
- harbor density distribution
- HERO survivability under pressure

---

# 12. Wake Emission Contract

```ts
function emitWakeSegment(
  emitter: WakeEmitterState,
  vessel: VesselRuntimeState,
  previousEmission: WakeSegment | null,
  simulationTimeMs: number
): WakeSegment {}
```

Geometry rules:

If:
```ts
previousEmission === null
```

Then:
```text
start == end == current vessel position
```

Otherwise:
- `start` derives from previousEmission.end
- `end` derives from current vessel position

WakeAuthority does not project future positions.

Wake geometry represents:
- authoritative movement residue only

---

# 13. Wake Intensity Doctrine

Wake intensity remains bounded:

```text
0.0 → 1.0
```

Canonical intensity model:

```ts
speedFactor = clamp(
  speedKts / maxExpectedSpeedKts,
  0,
  1
);
```

`maxExpectedSpeedKts` is sourced from:

```text
taxonomy.motionEnvelope.maxExpectedSpeedKts
```

It may NOT be hardcoded.

Wake intensity may not:
- imply vessel confidence
- imply continuity authority
- preserve dead vessels visually

---

# 14. Wake Lifecycle Doctrine

Wake segments are passive temporal residue.

Wake segments may never:
- keep a vessel alive
- prevent dormancy
- resurrect dormant vessels
- restore continuity
- imply active navigation

Maximum wake lifetime:

```ts
const WAKE_MAX_LIFETIME_MS = 1800000;
```

Synthetic wake clamp:

```ts
const SYNTHETIC_WAKE_MAX_LIFETIME_MULTIPLIER = 0.75;
```

Canonical synthetic lifetime rule:

```ts
syntheticLifetimeMs = min(
  requestedLifetimeMs,
  WAKE_MAX_LIFETIME_MS *
    SYNTHETIC_WAKE_MAX_LIFETIME_MULTIPLIER
);
```

---

# 15. AIS Recovery Doctrine

AIS recovery may not fabricate wake continuity.

If AIS signal disappears:
- wake emission halts
- existing segments decay naturally

If AIS signal recovers:
- wake emission resumes only from current authoritative position

WakeAuthority may NOT:
- fabricate wake bridges
- interpolate missing wake geometry
- conceal telemetry gaps
- reconstruct continuity from wake memory

No exceptions exist for coasting state.

Telemetry gaps remain historically visible.

---

# 16. Wake Decay Governance

```ts
type WakeDecayResult = {
  decayedCount: number;
  culledCount: number;
  remainingSegments: number;
  budgetPressureActive: boolean;
};
```

Canonical contract:

```ts
function decayWakeSegments(
  simulationTimeMs: number
): WakeDecayResult {}
```

Decay ownership remains runtime-owned.

Renderer systems may NOT:
- own decay timing
- own wake persistence
- delay cleanup
- preserve expired geometry

---

# 17. Vessel Eviction Doctrine

If an upstream vessel is evicted:
- existing wake segments may remain temporarily visible
- wake memory transitions into accelerated decay

Canonical behavior:

```text
parentEvicted = true
```

Evicted wake segments enter:
- accelerated decay cascade
- 4× decay speed multiplier

This preserves:
- atmospheric residue
WITHOUT:
- implying active occupancy
- preserving dead vessel authority

---

# 18. Simulation Clock Doctrine

WakeAuthority does not own a clock.

All functions receive:

```ts
simulationTimeMs
```

from the same injectable simulation clock used by:

```text
MaritimeContinuityEngine
```

WakeAuthority may NOT:
- read wall-clock time
- create local clocks
- derive timestamps independently

Deterministic mode prohibits wall-clock reads.

---

# 19. Renderer Observation Doctrine

Renderer systems observe WakeRegistry only.

Renderer systems may:
- read wake geometry
- apply symbolic visual interpretation
- apply atmospheric styling

Renderer systems may NOT:
- reconstruct wake continuity
- synthesize authoritative wake state
- extend wake persistence
- infer vessel motion

Wake rendering remains:
- observational
- symbolic
- non-authoritative

---

# 20. Shoreline Interaction Doctrine

```ts
shorelineInteractionFactor
```

is interpretive only.

It may influence:
- symbolic turbulence
- atmospheric breakup
- visual fragmentation

It may NOT become:
- collision authority
- shoreline physics
- environmental simulation ownership
- vessel steering logic

---

# 21. Replay Compatibility Doctrine

Wake systems must remain replay-compatible.

Replay-safe guarantees include:
- deterministic emission ordering
- deterministic overflow handling
- deterministic decay timing
- deterministic wake identifiers
- deterministic cleanup ordering

Replay systems may reconstruct:
- wake visibility
- wake density
- atmospheric layering

Replay systems may NOT reconstruct:
- vessel continuity
- missing telemetry
- fabricated movement

---

# 22. Acceptance Criteria

This specification is accepted only when:
- wake memory remains passive
- wake systems preserve continuity separation
- renderer systems remain non-authoritative
- emission ordering remains deterministic
- overflow cleanup remains replay-safe
- wake identifiers remain stable
- AIS gaps remain visible
- wake bridges remain prohibited
- synthetic provenance remains explicit
- atmospheric rendering remains observational

---

# 23. Freeze Status

**Status:** `[FREEZE — GO]`

Maritime Wake Authority is now considered:
- constitutionally stable
- replay-compatible
- renderer-contained
- deterministic
- continuity-safe
- harbor-scale survivable

Future work should prioritize:
- atmospheric readability
- renderer integration
- visual survivability
- environmental interpretation

NOT:
- continuity inference
- wake-driven simulation authority
- environmental orchestration
- vessel resurrection semantics

---

# 24. Implementation Guide

- **Where this goes:** `docs/_specs/wos/0523D_WOS_MaritimeWakeAuthority_v1.1.0.md`
- **What to run:** implement WakeAuthority as passive deterministic harbor-memory infrastructure using ring-buffer governance and replay-safe emission ordering.
- **What to expect:** symbolic atmospheric wake residue that preserves harbor readability without inheriting continuity authority.
