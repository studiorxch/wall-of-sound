# 0520Q2_WOS_MarineRenderer_v1.0.4

Status: OFFICIAL  
Date: 2026-05-21  
System: WOS  
Domain: Maritime Rendering  
Component: MarineRenderer  
Version: 1.0.4

---

# Revision Purpose

v1.0.4 is a:

```
renderer contract alignment + runtime authority compliance release
```

MarineRenderer v1.0.3 is now considered:

```
DEGRADED
```

under:

```
ContractGovernance §13
```

because AISRuntime v1.6.1 introduced canonical continuity contract semantics.

v1.0.4 exists to:

- restore structural parity with AISRuntime v1.6.1
- eliminate renderer-derived continuity assumptions
- align renderer semantics with Tier 1 runtime authority
- formalize renderer interpolation behavior
- preserve strict read-only renderer doctrine

---

# Governance Metadata Block

```
Status: OFFICIALSystem: WOSDomain: Maritime RenderingComponent: MarineRendererVersion: 1.0.4Dependencies:  - AISRuntime >= v1.6.1  - ProjectionRuntime >= v2.1.0DependencyState:  AISRuntime: HEALTHY  ProjectionRuntime: HEALTHY
```

---

# Implementation Preservation Doctrine

MarineRenderer v1.0.3 remains:

```
the active renderer foundation
```

v1.0.4 MUST be treated as:

```
a surgical contract-alignment patch
```

NOT:

- renderer rewrite
- atmospheric redesign
- projection replacement

---

# Existing Renderer Infrastructure Preserved

Implementers MUST preserve:

- atmospheric rendering stack
- vessel sprite topology
- wake rendering
- emissive behavior
- maritime glow systems
- harbor cinematic presentation
- existing batching architecture
- LOD systems

unless explicitly overridden below.

---

# 1. Renderer Authority Doctrine

MarineRenderer is:

```
pure read-only cinematic interpretation infrastructure
```

MarineRenderer owns:

- atmospheric presentation
- emissive styling
- wake rendering
- visual interpolation
- maritime cinematic translation
- visual continuity presentation

MarineRenderer does NOT own:

- lifecycle state
- continuity truth
- telemetry interpretation
- dead reckoning
- vessel classification
- continuity scalar derivation

---

# 2. Canonical Runtime Dependency Doctrine

AISRuntime v1.6.1 is:

```
sole maritime continuity authority
```

MarineRenderer MUST consume:

- runtime continuity contracts
- runtime lifecycle state
- runtime vessel truth

WITHOUT:

- recomputing semantics
- renaming continuity fields
- deriving replacement confidence metrics

---

# 3. Canonical Continuity Contract Alignment

MarineRenderer MUST consume the following canonical runtime continuity contract:

```
continuity: {  signalConfidence: number;  continuityAlpha: number;  deadReckoningWeight: number;  staleWeight: number;  coastAlpha: number;  interpolationWeight: number;}
```

---

# Structural Parity Doctrine

The above field names are:

```
canonical renderer-facing continuity contract names
```

These names MUST remain identical across:

- AISRuntime
- MarineRenderer
- event payloads
- debug tooling
- renderer state accessors

---

# Deprecated Renderer Namespaces

The following names are formally deprecated:

|Deprecated|Canonical Replacement|
|---|---|
|signalQuality|signalConfidence|
|staleAge|staleWeight|
|coastWeight|coastAlpha|

---

# Forbidden

MarineRenderer MUST NOT:

- internally alias deprecated names silently
- preserve dual namespace contracts
- expose deprecated names publicly

---

# 4. Runtime Continuity Consumption Doctrine

MarineRenderer continuity behavior MUST derive exclusively from:

```
AISRuntime continuity scalars
```

---

# signalConfidence Usage

signalConfidence controls:

- telemetry trust presentation
- emissive stability
- atmospheric confidence styling
- wake certainty

---

# continuityAlpha Usage

continuityAlpha controls:

- vessel visual persistence
- fade continuity
- harbor cinematic continuity
- continuity fade strength

---

# deadReckoningWeight Usage

deadReckoningWeight controls:

- dead-reckoning visual permissibility
- wake confidence
- interpolation softness
- motion trust styling

---

# staleWeight Usage

staleWeight controls:

- uncertainty presentation
- atmospheric degradation
- stale telemetry visual treatment

---

# coastAlpha Usage

coastAlpha controls:

- forced-coast fade persistence
- cinematic coast presentation
- continuity fade visibility

---

# interpolationWeight Usage

interpolationWeight controls:

- smoothing aggressiveness
- convergence softness
- interpolation permissibility
- runtime adherence tightness

---

# IMPORTANT CLARIFICATION

interpolationWeight does NOT determine:

```
whether interpolation occurs
```

Interpolation remains:

```
mandatory renderer behavior
```

---

# 5. Renderer Interpolation Doctrine

MarineRenderer interpolation is:

```
REQUIRED
```

NOT optional.

---

# Renderer MUST

- interpolate between fixed-step runtime states
- visually smooth deterministic vessel motion
- preserve continuity during packet jitter
- maintain cinematic harbor readability

---

# Renderer MUST NOT

- invent vessel trajectories
- bypass runtime positions
- extrapolate beyond runtime authority
- create independent continuity state

---

# 6. Interpolation Weight Interpretation Matrix

|interpolationWeight|Renderer Behavior|
|---|---|
|1.0|aggressive smoothing permitted|
|0.75|cinematic smoothing|
|0.50|moderate convergence|
|0.25|tight runtime adherence|
|0.0|near-synchronous tracking|

---

# 7. Continuity Scalar Evaluation Doctrine

MarineRenderer MUST treat continuity scalars as:

```
fixed-step runtime outputs
```

evaluated at:

```
1Hz AISRuntime simulation cadence
```

---

# Renderer Clarification

MarineRenderer MAY:

- interpolate scalar presentation
- visually smooth scalar transitions
- ease atmospheric continuity behavior

between runtime simulation states.

---

# Forbidden

MarineRenderer MUST NOT:

- recompute scalar values
- evolve scalar authority independently
- mutate continuity values internally

---

# 8. Runtime Lifecycle Consumption Doctrine

MarineRenderer MUST consume runtime lifecycle state directly.

---

# Canonical Lifecycle States

```
STATUS_UNDERWAYSTATUS_ANCHOREDSTATUS_MOOREDSTATUS_RESTRICTEDSTATUS_EMERGENCYSTATUS_STALESTATUS_OFFLINESTATUS_DORMANTSTATUS_FORCED_COAST
```

---

# Lifecycle Interpretation Doctrine

MarineRenderer MAY:

- visually stylize lifecycle state
- alter emissive presentation
- alter wake behavior
- alter atmospheric presentation

MarineRenderer MUST NOT:

- invent lifecycle transitions
- reinterpret AIS semantics
- remap runtime states

---

# 9. Forced Coast Consumption Doctrine

STATUS_FORCED_COAST is:

```
runtime-authorized cinematic persistence state
```

MarineRenderer MUST:

- visually respect coastAlpha
- preserve cinematic fade continuity
- avoid abrupt vessel disappearance

---

# MarineRenderer MUST NOT

- extend coast duration
- create independent coast timers
- preserve vessels after runtime eviction

---

# 10. Protected Vessel Doctrine

Protected vessel persistence originates exclusively from:

```
AISRuntime
```

MarineRenderer MAY:

- visually emphasize protected vessels
- preserve readability near camera focus
- increase atmospheric prominence

MarineRenderer MUST NOT:

- independently protect vessels
- create renderer-side persistence registries

---

# 11. Wake Rendering Doctrine

Wake rendering remains:

```
pure atmospheric interpretation infrastructure
```

Wake behavior MAY depend on:

- vessel velocity
- deadReckoningWeight
- signalConfidence
- lifecycle state

---

# Wake Suppression Rules

Wake rendering SHOULD reduce when:

- staleWeight increases
- signalConfidence decreases
- vessel enters STATUS_STALE
- vessel enters STATUS_DORMANT

---

# 12. Emissive Stability Doctrine

Emissive stability SHOULD derive from:

- signalConfidence
- continuityAlpha
- lifecycle state
- protected vessel importance

---

# Renderer SHOULD Avoid

- emissive flicker
- packet-jitter flashing
- hard visibility oscillation
- discontinuous fade behavior

---

# 13. Projection Dependency Doctrine

ProjectionRuntime remains sole authority for:

- world-to-screen transforms
- meters-per-pixel
- geographic projection
- viewport normalization

MarineRenderer MUST consume:

- projection outputs only

WITHOUT:

- redefining projection truth
- introducing renderer-local geography

---

# 14. Visual Continuity Doctrine

MarineRenderer exists to preserve:

```
slow cinematic harbor continuity
```

The renderer SHOULD favor:

- continuity over twitch response
- atmospheric persistence over abrupt precision
- harbor readability over telemetry literalism

SO LONG AS:

```
runtime authority remains preserved
```

---

# 15. LOD Doctrine

LOD behavior remains:

```
renderer-owned interpretation infrastructure
```

AISRuntime does NOT own:

- sprite detail
- wake complexity
- emissive complexity
- atmospheric fidelity scaling

---

# MarineRenderer MAY Reduce

- wake complexity
- emissive complexity
- interpolation precision
- particle density

at distant zoom levels.

---

# 16. Debug Visibility Doctrine

MarineRenderer SHOULD expose:

- scalar visualization overlays
- lifecycle visualization
- interpolation diagnostics
- continuity debug rendering

for:

- governance verification
- runtime parity validation
- atmospheric tuning

---

# Recommended Debug APIs

```
_wos.debugMarineScalars()_wos.debugMarineInterpolation()_wos.debugMarineLifecycle()
```

---

# 17. Renderer Purity Doctrine

MarineRenderer MUST remain:

```
side-effect free interpretation infrastructure
```

MarineRenderer MUST NOT:

- mutate AISRuntime state
- dispatch lifecycle transitions
- repair vessel continuity
- persist runtime state internally

---

# 18. Event Egress Governance Doctrine

MarineRenderer MUST comply with:

```
ContractGovernance §3
```

Renderer-originated runtime requests MUST:

- remain asynchronous
- remain debounced
- remain rate-limited

---

# Canonical Limit

```
2Hz per renderer instance
```

unless explicitly overridden by Tier 1 runtime governance.

---

# 19. Final Renderer Doctrine

MarineRenderer v1.0.4 establishes:

```
strict renderer obedience to runtime authority
```

AISRuntime owns:

- continuity truth
- lifecycle truth
- semantic interpretation
- persistence authority

MarineRenderer owns:

- atmosphere
- cinematic translation
- interpolation presentation
- harbor visual continuity

Together these systems establish:

```
deterministic maritime runtime authority+cinematic harbor presentation
```

WITHOUT:

- duplicate truth
- semantic drift
- continuity fragmentation
- renderer/runtime authority conflict

# Removed Vessel Properties

The following v1.0.3 vessel properties are no longer consumed by MarineRenderer v1.0.4:

| Removed | Replacement Strategy |
|---|---|
| visibilityWeight | Use deadReckoningWeight + signalConfidence |
| importanceWeight | Use continuityAlpha + protected vessel state |

These legacy fields originated prior to the canonical AISRuntime continuity contract.

MarineRenderer v1.0.4 now derives visual continuity behavior exclusively from runtime-authoritative continuity scalars exposed by AISRuntime v1.6.1.