---


Status: OFFICIAL  
Date: 2026-05-21  
System: WOS  
Domain: Maritime Telemetry Runtime  
Component: AISRuntime  
Version: 1.6.1

---

# Revision Purpose

v1.6.1 is a:

```
contract hardening + governance compliance release
```

AISRuntime v1.5.1 remains the implemented runtime authority.

v1.6.0 established:

- renderer-facing continuity contracts
- lifecycle clarification
- deterministic continuity doctrine
- MarineRenderer authority separation

v1.6.1 exists to:

- achieve ContractGovernance v1.3.0 compliance
- resolve structural parity violations
- formalize continuity scalar derivation behavior
- clarify interpolation semantics
- close remaining threshold ambiguities
- stabilize cross-spec namespace consistency

---

# Governance Metadata Block

```
Status: OFFICIALSystem: WOSDomain: Maritime Telemetry RuntimeComponent: AISRuntimeVersion: 1.6.1Dependencies:  - MarineRenderer >= v1.0.3  - ProjectionRuntime >= v2.1.0  - RealitySyncRuntime >= v1.0.0DependencyState:  MarineRenderer: HEALTHY  ProjectionRuntime: HEALTHY  RealitySyncRuntime: HEALTHY
```

---

# Implementation Preservation Doctrine

AISRuntime v1.5.1 remains:

```
the implemented operational authority
```

v1.6.1 MUST be treated as:

```
a surgical contract-extension patch
```

NOT:

- runtime replacement
- lifecycle rewrite
- ingest topology mutation

---

# Existing Runtime Authority Preserved

Implementers MUST preserve:

- dormant bucket topology
- feed degradation lifecycle
- protected vessel doctrine
- forced coast behavior
- dead-reckoning architecture
- AIS ingest bridge flow
- persistent vessel registry
- continuity ownership

unless explicitly overridden below.

---

# 1. Runtime Ownership Doctrine

AISRuntime remains sole authority owner for:

- vessel truth
- lifecycle state
- dead reckoning
- maritime telemetry interpretation
- vessel continuity
- continuity scalar generation
- AIS semantic translation

---

# MarineRenderer Relationship Doctrine

MarineRenderer is:

```
read-only visual interpretation infrastructure
```

MarineRenderer MUST consume:

- runtime continuity scalars
- lifecycle state
- vessel authority truth

WITHOUT:

- recomputing runtime semantics
- inferring lifecycle state
- repairing telemetry
- inventing continuity behavior

---

# 2. Canonical Renderer Continuity Contract

AISRuntime MUST expose canonical continuity scalars per vessel.

---

# Canonical Continuity Contract

```
continuity: {  signalConfidence: number;      // 0.0 → 1.0  continuityAlpha: number;      // 0.0 → 1.0  deadReckoningWeight: number;  // 0.0 → 1.0  staleWeight: number;          // 0.0 → 1.0  coastAlpha: number;           // 0.0 → 1.0  interpolationWeight: number;  // 0.0 → 1.0}
```

---

# Structural Parity Doctrine

The above scalar names are:

```
canonical public continuity contract names
```

These names MUST remain structurally identical across:

- AISRuntime
- MarineRenderer
- event payloads
- public APIs
- runtime state exports

---

# Forbidden

The following namespace divergence is forbidden:

```
coastWeightcoastFadeghostAlpha
```

when:

```
coastAlpha
```

is canonical.

---

# 3. Continuity Scalar Derivation Doctrine

AISRuntime owns:

- scalar derivation
- scalar evolution
- continuity decay behavior
- confidence weighting

Renderers consume:

- scalar outputs only

---

# signalConfidence Doctrine

signalConfidence represents:

```
runtime confidence in upstream telemetry validity
```

---

# signalConfidence MUST Consider

- feed freshness
- packet cadence
- telemetry validity
- reprojection stability
- feed degradation state

---

# Reference Derivation Shape

```
signalConfidence =  freshnessWeight *  cadenceWeight *  validityWeight *  reprojectionWeight
```

clamped:

```
0.0 → 1.0
```

---

# continuityAlpha Doctrine

continuityAlpha represents:

```
visual continuity persistence strength
```

---

# continuityAlpha MUST

- decay smoothly
- remain deterministic
- preserve cinematic persistence
- survive brief packet loss gracefully

---

# Reference Decay Shape

```
continuityAlpha =  Math.exp(-staleAge / continuityHalfLife)
```

---

# deadReckoningWeight Doctrine

deadReckoningWeight represents:

```
runtime confidence in extrapolated motion validity
```

---

# staleWeight Doctrine

staleWeight represents:

```
telemetry uncertainty accumulation
```

---

# coastAlpha Doctrine

coastAlpha represents:

```
forced-coast cinematic persistence visibility
```

---

# interpolationWeight Doctrine

interpolationWeight represents:

```
renderer smoothing permissibility strength
```

---

# IMPORTANT CLARIFICATION

interpolationWeight does NOT determine:

```
whether interpolation exists
```

Interpolation is:

```
mandatory renderer behavior
```

---

# interpolationWeight Instead Controls

- smoothing aggressiveness
- convergence tightness
- visual lag permissibility
- continuity softness

---

# Canonical Interpretation Examples

|interpolationWeight|Expected Behavior|
|---|---|
|1.0|aggressive smoothing permitted|
|0.5|moderate convergence|
|0.1|renderer tightly tracks runtime|
|0.0|renderer remains near-synchronous|

---

# 4. Scalar Determinism Doctrine

All continuity scalars MUST:

- remain deterministic
- evolve continuously
- avoid render-cadence coupling
- avoid packet-jitter oscillation

---

# Forbidden

Scalars MUST NOT:

- jump discontinuously
- fluctuate from single-packet instability
- evolve per render frame

---

# Required Formula Style

Correct:

```
value = 1 - Math.exp(-dt / halfLife)
```

Forbidden:

```
value -= 0.1 per frame
```

---

# 5. Scalar Evaluation Cadence Doctrine

Canonical scalar evaluation occurs at:

```
fixed-step simulation cadence
```

---

# Canonical Simulation Step

```
Δt_sim = 1.0 second
```

---

# Renderer Clarification

Renderers MAY interpolate:

- scalar presentation
- scalar visual response
- continuity visualization

between simulation states.

---

# Purpose

Prevent:

- browser-dependent continuity drift
- frame-rate divergence
- renderer/runtime desynchronization

---

# 6. Feed Recovery Lifecycle Clarification

Feed lifecycle remains:

```
FEED_OFFLINE→ FEED_DEGRADED→ FEED_LIVE
```

---

# Direct OFFLINE → LIVE Recovery

Direct:

```
OFFLINE → LIVE
```

is FORBIDDEN.

---

# Recovery Requirements

Recovery requires:

- minimum 3 valid packets
- within 30 seconds
- without schema violations

before:

```
FEED_LIVE
```

may resume.

---

# 7. Stabilization Window Clarification

Boundary reprojection stabilization windows last:

```
10 seconds maximum
```

---

# Early Exit Rule

Stabilization MAY terminate early after:

```
2 consecutive valid in-water packets
```

arrive across:

```
2 consecutive fixed-step simulation ticks
```

---

# Stabilization Effects

During stabilization:

- continuityAlpha reduced
- deadReckoningWeight reduced
- interpolationWeight reduced
- smoothing permissibility constrained

---

# 8. Mooring + Anchoring Doctrine

Mooring anchors are formally defined as:

```
the vessel position captured at STATUS_MOORED entry
```

---

# Anchoring references are formally defined as:

```
the vessel position captured at STATUS_ANCHORED entry
```

---

# Persistence Rule

References remain stable until:

- valid departure  
    OR:
- authoritative AIS state change

---

# 9. Departure + Relock Doctrine

Departure behavior remains:

- hysteresis-protected
- deterministic
- continuity-preserving

---

# Departure Threshold

Departure requires:

```
≥ 0.8 knots outward motion
```

for:

```
4 consecutive simulation ticks
```

---

# Relock Threshold

Relock requires:

```
< 0.2 knots sustained motion
```

for:

```
60 continuous seconds
```

---

# 10. Heading Freeze Clarification

Heading freeze behavior applies ONLY to:

```
already-underway vessels decelerating below low-speed thresholds
```

---

# Heading Freeze Threshold

Heading freeze occurs below:

```
1.0 knot
```

---

# IMPORTANT CLARIFICATION

Heading freeze MUST NOT block:

- moored departure
- anchored departure
- valid departure transitions

---

# Heading Reactivation Rule

Heading updates MAY resume immediately after:

```
valid departure gate completion
```

NOT:

```
1.0 knot threshold crossing
```

---

# Purpose

Prevent:

- bow jitter
- anchor twitching
- orientation oscillation

WITHOUT:

- suppressing departure orientation updates

---

# 11. Dormant Rehydration Doctrine

Dormant vessels MUST preserve identity continuity during reactivation.

---

# Canonical Rehydration Rule

Before allocating new vessel state:  
AISRuntime MUST check:

- ACTIVE bucket
- DORMANT bucket
- PROTECTED_DORMANT bucket

for matching MMSI.

---

# Duplicate Allocation Is Forbidden

Dormant state MUST be restored in-place when available.

---

# 12. Rehydration Merge Precedence

|Authority|Priority|
|---|---|
|persistent vessel registry|highest|
|fresh telemetry|second|
|dormant continuity state|third|
|renderer assumptions|forbidden|

---

# Persistent Vessel Registry Clarification

Persistent vessel registry currently refers to:

```
AISRuntime-local persistent vessel registry infrastructure
```

---

# Future Compatibility Note

Future:

```
SurfaceRegistry
```

integration MAY supersede this authority layer.

---

# Fresh Telemetry Wins For

- position
- heading
- speed
- course
- AIS status
- timestamps

---

# Dormant State Wins For

- continuity memory
- continuity decay history
- persistence scalars
- cinematic continuity memory

---

# 13. ACTIVE → DORMANT Transition Doctrine

|Vessel Type|Dormant Threshold|
|---|---|
|underway|10 minutes|
|moored|2 hours|
|protected|24 hours|

---

# Protected Vessel Rule

Protected vessels bypass:

```
standard dormant LRU eviction
```

within:

```
PROTECTED_DORMANT
```

partition.

---

# 14. Forced Coast Lifecycle Completion

STATUS_FORCED_COAST is:

```
temporary cinematic continuity infrastructure
```

NOT:

- dormant replacement
- permanent lifecycle state

---

# Canonical Lifecycle

```
ACTIVE→ signal loss→ FORCED_COAST→ fade decay→ DORMANT or EVICT
```

---

# Standard Forced Coast Duration

```
30 seconds maximum
```

---

# Protected Vessel Extension

Protected vessels MAY extend persistence up to:

```
120 seconds
```

when:

- near active camera focus
- maintaining cinematic continuity
- preserving harbor readability

---

# Renderer Restriction

MarineRenderer MUST NOT:

- extend coast duration
- invent persistence
- override runtime coast authority

---

# 15. AIS Status Translation Matrix

AISRuntime remains sole authority for:

- AIS numeric interpretation
- lifecycle mapping
- semantic reduction

---

# Canonical Translation Table

|AIS Code|Meaning|WOS State|
|---|---|---|
|0|underway using engine|UNDERWAY|
|1|at anchor|ANCHORED|
|2|not under command|RESTRICTED|
|3|restricted maneuverability|RESTRICTED|
|4|constrained by draught|RESTRICTED|
|5|moored|MOORED|
|6|aground|RESTRICTED|
|7|engaged in fishing|RESTRICTED|
|8|under way sailing|UNDERWAY|
|14|AIS-SART / MOB / EPIRB|EMERGENCY|

---

# Unknown Status Rule

Unknown AIS statuses MUST resolve to:

```
STATUS_STALE
```

NOT:

```
STATUS_UNDERWAY
```

---

# 16. Heading vs Course-Over-Ground Doctrine

AISRuntime MUST preserve distinction between:

- heading
- course-over-ground

---

# heading Represents

```
where the bow points
```

---

# COG Represents

```
actual movement vector
```

---

# 17. Simulation Timing Doctrine

AISRuntime simulation MUST operate using:

```
fixed-step deterministic simulation
```

---

# Canonical Simulation Step

```
Δt_sim = 1.0 second
```

---

# Required Runtime Architecture

AISRuntime MUST:

- accumulate frame deltas
- update vessel truth at fixed cadence
- decouple render cadence from runtime truth

---

# 18. Renderer Interpolation Doctrine

MarineRenderer interpolation is:

```
REQUIRED
```

NOT optional.

---

# Renderer MUST

- interpolate between simulation states
- preserve motion continuity
- visually smooth deterministic runtime truth

---

# Renderer MUST NOT

- invent vessel motion
- override runtime authority
- bypass continuity scalars

---

# 19. connectFeed() Contract Expansion

```
connectFeed({  url,  protocol,  authToken,  reconnectInterval,  normalizationProfile,  transport,  retryPolicy})
```

---

# Field Contract Table

|Field|Required|Purpose|Default|
|---|---|---|---|
|url|yes|feed endpoint|none|
|protocol|yes|websocket / polling|websocket|
|authToken|no|upstream auth|null|
|reconnectInterval|no|retry cadence|5000ms|
|normalizationProfile|yes|parser selection|generic|
|transport|no|ingest transport|websocket|
|retryPolicy|no|reconnect strategy|exponentialBackoff|

---

# 20. Feed Failure Doctrine

Feed failure MUST degrade gracefully.

---

# Canonical Lifecycle

```
LIVE→ packet degradation→ FEED_DEGRADED→ prolonged outage→ FEED_OFFLINE
```

---

# Runtime MAY

- continue dead reckoning
- decay continuity confidence
- reduce interpolationWeight
- preserve protected vessels

---

# Runtime MUST NOT

- instantly despawn harbor traffic
- hard-reset continuity state
- invalidate protected vessels immediately

---

# 21. Final Runtime Authority Doctrine

AISRuntime v1.6.1 establishes:

```
canonical maritime continuity authority
```

All:

- continuity semantics
- lifecycle semantics
- scalar derivation
- persistence behavior
- dead-reckoning confidence
- telemetry interpretation

originate exclusively from:

```
AISRuntime
```

MarineRenderer remains:

```
pure read-only cinematic interpretation infrastructure
```