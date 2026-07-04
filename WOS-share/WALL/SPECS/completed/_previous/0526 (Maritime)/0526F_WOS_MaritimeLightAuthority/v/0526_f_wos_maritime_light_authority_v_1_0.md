# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Resolve governance tightening + canonical implementation completeness before BUILD.

---

layout: spec

title: "WOS Maritime Light Authority"
date: 2026-05-27
doc_id: "0526F_WOS_MaritimeLightAuthority_v1.0.1"
version: "1.0.1"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "MaritimeLightAuthority"

type: "runtime-presentation-spec"
status: "review"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Defines deterministic vessel-local maritime light presentation, bloom behavior, atmospheric light collapse, and distance-reactive harbor signal readability without mutating runtime truth."

---

# 🎯 PURPOSE

Define the authoritative maritime vessel light presentation system for WOS.

This specification governs:

- navigation light rendering
- distant vessel glints
- bloom behavior
- deterministic pulse/shimmer
- atmospheric light collapse
- class-specific maritime light signatures
- far-distance observability behavior

This system exists because:

```text
At distance, lights become the vessel.
```

The purpose of MaritimeLightAuthority is to preserve:

- harbor presence
- atmospheric continuity
- low-light readability
- symbolic vessel identity
- distant maritime observability

without requiring full topology readability.

---

# 🧠 CORE PRINCIPLES

## Presentation Only

MaritimeLightAuthority is:

```text
purely interpretive presentation infrastructure
```

It does NOT simulate:

- electrical systems
- tactical visibility
- navigation legality
- runtime state
- vessel intent

---

## Light Communicates Presence

```text
Light communicates presence.

It does not define existence.
```

Lights imply:

- continuity
- occupancy
- atmosphere
- signal persistence

They do NOT establish runtime truth.

---

## Distance Simplifies Light Structure

Canonical collapse chain:

```text
DUAL_NAV
→ CLUSTER
→ POINT
→ GHOST
→ NONE
```

Distance reduces:

- topology readability
- cluster complexity
- bloom size
- light grouping fidelity

before it removes presence entirely.

---

## Deterministic Temporal Behavior

Allowed:

- deterministic pulse
- deterministic shimmer
- stable seeded offsets
- class-specific cadence
- subtle asynchronous variance

Forbidden:

- Math.random()
- synchronized global blinking
- emergency-style flashing
- urgent pulsing
- gameplay alert signaling

Pulse behavior represents:

```text
atmospheric temporal variance only
```

Pulse behavior must NEVER imply:

- alert state
- urgency
- interaction priority
- tactical signaling

---

## Vessel-Local Authority Only

MaritimeLightAuthority governs:

```text
vessel-local maritime light behavior only
```

It does NOT govern:

- global harbor atmosphere
- weather systems
- cinematic orchestration
- harbor mood systems
- environmental storytelling

---

# 🏛️ AUTHORITY BOUNDARIES

## This Spec Governs

- maritime light envelopes
- navigation-light presentation
- bloom behavior
- far-light collapse
- deterministic pulse/shimmer
- class-specific light signatures
- distance-reactive light simplification
- visibility-safe suppression

---

## This Spec MAY Observe

- MaritimeDistanceAtmosphere
- VisibilityClassRuntime
- MaritimeStyleRegistry
- runtime zoom
- fog/haze pressure
- vessel class
- render tier

---

## This Spec MUST NOT Mutate

- AIS runtime truth
- vessel position
- speed
- heading
- continuity state
- camera state
- weather systems
- overlay orchestration
- wake runtime behavior
- atmospheric simulation

---

## Renderer Sequencing Clarification

Renderer sequencing remains:

```text
external orchestration responsibility
```

MaritimeLightAuthority exposes:

```text
passive immutable presentation envelopes only
```

It does NOT own:

- renderer order
- frame sequencing
- draw orchestration
- pipeline coordination

---

# 🌊 CONTINUITY ROLE

MaritimeLightAuthority participates in continuity by:

- preserving distant maritime occupancy
- maintaining harbor signal persistence
- reducing visual collapse at low detail
- preserving low-light vessel readability
- reinforcing atmospheric harbor depth

This system supports:

```text
symbolic observability continuity
```

rather than:

```text
simulation realism
```

---

# 🧭 INTERPRETATION SEPARATION

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

MaritimeLightAuthority is:

```text
presentation interpretation only
```

It consumes runtime state.

It does NOT create runtime state.

Interpretation systems must NEVER:

- fabricate continuity
- override visibility authority
- invent runtime behavior
- elevate hidden vessels
- bypass atmospheric suppression

---

# 📦 DATA MODEL

```ts
type MaritimeLightRenderMode =
  | "DUAL_NAV"
  | "CLUSTER"
  | "POINT"
  | "GHOST"
  | "NONE";


type MaritimeLightReasonCode =
  | "LIGHT_DUAL_NAV"
  | "LIGHT_CLUSTER"
  | "LIGHT_POINT"
  | "LIGHT_GHOST"
  | "LIGHT_SUPPRESSED"
  | "VISIBILITY_SUPPRESSED"
  | "DISTANCE_SUPPRESSED"
  | "FALLBACK_INVALID_INPUT";


type MaritimeClassKey =
  | "cargo"
  | "tanker"
  | "ferry"
  | "tug"
  | "recreational"
  | "fishing"
  | "passenger"
  | "military"
  | "industrial"
  | "service"
  | "unknown";


type MaritimeClassLightSignature = {
  readonly classKey: MaritimeClassKey;
  readonly baseRenderMode: MaritimeLightRenderMode;

  readonly baseAlpha: number;
  readonly bloomScale: number;
  readonly shimmerScale: number;

  readonly pulseHz: number;
  readonly pulseDepth: number;

  readonly navWarmth: number;
  readonly farWarmth: number;

  readonly clusterCount: number;
  readonly clusterSpreadPx: number;

  readonly suppressUnderAtmosphere: number;
};


type MaritimeLightEnvelope = {
  readonly version: "1.0.1";

  readonly visible: boolean;

  readonly renderMode: MaritimeLightRenderMode;
  readonly reasonCode: MaritimeLightReasonCode;

  readonly alpha: number;
  readonly bloomAlpha: number;
  readonly bloomRadiusPx: number;

  readonly navAlpha: number;
  readonly farAlpha: number;

  readonly pulsePhase: number;
  readonly pulseValue: number;
  readonly shimmerAmount: number;

  readonly navPortColor: string;
  readonly navStarboardColor: string;
  readonly navSternColor: string;
  readonly glowColor: string;

  readonly allowNavPair: boolean;
  readonly allowMastLight: boolean;
  readonly allowFarGlint: boolean;
  readonly allowBloom: boolean;

  readonly allowWakeGlow: boolean;
  readonly allowReflectionHint: boolean;
};
```

---

# 🌫️ ATMOSPHERE SUPPRESSION

## suppressUnderAtmosphere Formula

`suppressUnderAtmosphere` defines how aggressively atmosphere reduces light visibility.

Formula:

```ts
finalAlpha *= (
  1.0 - atmospherePressure * suppressUnderAtmosphere
);
```

Where:

```ts
atmospherePressure =
  fogAlpha * 0.45 +
  hazeAlpha * 0.35 +
  densityPressure * 0.25;
```

Interpretation:

- low values → lights survive atmosphere longer
- high values → lights collapse earlier

Example:

```text
military → heavy suppression
passenger → softer suppression
```

Visibility suppression remains additive only.

Atmosphere may NEVER elevate visibility.

---

# 🌊 PASSENGER / CRUISE RESOLUTION

In v1.0.x:

```text
cruise resolves to passenger
```

Future versions may introduce:

```text
distinct cruise-class signatures
```

if observability behavior diverges.

---

# 📏 clusterSpreadPx UNITS

`clusterSpreadPx` is defined at:

```text
reference zoom = 13.0
```

Scaling rule:

```ts
clusterSpread = clusterSpreadPx * (zoom / 13.0)
```

This preserves perceptual consistency across zoom ranges.

---

# 🌊 pulseDepth DEFINITION

`pulseDepth` defines intensity modulation range.

```text
0.0 = no pulse
1.0 = full modulation range
```

Recommended ranges:

```text
cargo/tanker → low pulse depth
ferry → moderate pulse depth
working vessels → higher pulse depth
```

Pulse must remain:

```text
subtle
atmospheric
non-urgent
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const MARITIME_LIGHT_AUTHORITY_VERSION = "1.0.1";

const MIN_LIGHT_ALPHA = 0.02;
const MAX_NAV_ALPHA = 0.92;
const MAX_FAR_LIGHT_ALPHA = 0.55;

const MIN_BLOOM_RADIUS_PX = 1.2;
const MAX_BLOOM_RADIUS_PX = 9.0;
const MAX_BLOOM_ALPHA = 0.22;

const DEFAULT_SHIMMER_AMOUNT = 0.08;
const MAX_SHIMMER_AMOUNT = 0.28;

const DEFAULT_PULSE_HZ = 0.08;
const MAX_PULSE_HZ = 0.33;
```

Constants are:

```text
implementation baselines
```

—not eternal doctrine.

---

# 🔧 CORE FUNCTIONS

```ts
function resolveClassLightSignature() {}
function resolveLightEnvelope() {}
function getFallbackLightEnvelope() {}
```

Functions must:

- remain deterministic
- avoid side effects
- preserve suppression hierarchy
- avoid orchestration mutation
- preserve immutable output

---

# 🔄 EXECUTION FLOW

Canonical runtime flow:

```text
AIS Runtime
→ VisibilityClassRuntime
→ MaritimeDistanceAtmosphere
→ MaritimeLightAuthority
→ Renderer Observation
→ Passive Light Projection
```

The renderer owns:

- draw ordering
- batching
- orchestration
- pipeline sequencing

MaritimeLightAuthority owns:

```text
light interpretation only
```

---

# 🧠 CANONICAL LIGHT RESOLUTION FLOW

## resolveLightEnvelope(input)

Canonical assembly order:

```text
1. validate input
2. resolve fallback state
3. resolve class signature
4. generate stable seed
5. resolve pulse phase/value
6. resolve shimmer variance
7. resolve distance collapse
8. apply visibility suppression
9. apply atmosphere suppression
10. resolve bloom
11. finalize immutable envelope
```

---

## Stable Seed Rule

Canonical order:

```text
mmsi
→ vesselId
→ classKey
→ 0
```

Seed may influence:

- pulse phase
- shimmer phase
- cluster offsets

Seed must NEVER imply:

- behavior
- intent
- gameplay state

---

## Pulse Formula

```ts
pulseValue =
  1.0 - pulseDepth +
  pulseDepth * (
    0.5 + 0.5 * Math.sin(
      nowMs * pulseHz * TAU + pulsePhase
    )
  );
```

---

# 🛰️ DISTANCE COLLAPSE POLICY

## HERO / NEAR

Allowed:

- DUAL_NAV
- CLUSTER

---

## MID

Allowed:

- CLUSTER
- POINT

---

## FAR

Allowed:

- POINT
- GHOST

---

## ATMOSPHERIC

Allowed:

- GHOST
- NONE

Distance may:

- simplify render mode
- reduce bloom
- collapse clusters
- suppress detail

Distance may NEVER:

- elevate hidden vessels
- bypass visibility suppression

---

# 🌫️ VISIBILITY CLASS INTEGRATION

Visibility suppression hierarchy:

| Visibility Class | Allowed Modes |
|---|---|
| FULL | distance-controlled |
| REDUCED | simplified modes |
| SILHOUETTE | POINT / GHOST |
| MARKER_ONLY | POINT |
| LIGHT_ONLY | POINT / GHOST |
| ATMOSPHERIC_HIDDEN | NONE |

Visibility systems may:

```text
suppress only
```

They may NEVER elevate visibility.

---

# 🌊 BLOOM POLICY

Bloom must remain:

```text
subtle
atmospheric
non-urgent
```

Rules:

- smaller at close range
- softer at far range
- dimmer under atmosphere
- never emergency-like
- never topology-obscuring

Far lights may bloom:

```text
larger but dimmer
```

---

# 🌊 WAKE GLOW INTEGRATION

Wake glow eligibility is:

```text
advisory presentation metadata only
```

Wake systems remain:

```text
independently authoritative
```

Wake glow must NEVER:

- imply propulsion simulation
- imply gameplay state
- override wake runtime authority

Recommended wake glow alpha:

```text
≤ 0.15
```

---

# 🌊 REFLECTION HINT INTEGRATION

`allowReflectionHint` exists for:

```text
future compatibility only
```

v1.0.x does NOT implement:

- water reflections
- reflection rendering
- reflection orchestration

---

# 🧪 FALLBACK ENVELOPES

## FALLBACK_INVALID_INPUT

```ts
{
  visible: false,
  renderMode: "NONE",
  alpha: 0,
  bloomAlpha: 0,
  allowBloom: false
}
```

---

## VISIBILITY_SUPPRESSED

```ts
{
  visible: false,
  renderMode: "NONE",
  alpha: 0,
  bloomAlpha: 0,
  allowFarGlint: false
}
```

---

## DISTANCE_SUPPRESSED

```ts
{
  visible: true,
  renderMode: "GHOST",
  alpha: 0.03,
  bloomAlpha: 0,
  allowFarGlint: true
}
```

Fallbacks must NEVER:

- crash renderer
- produce urgent flashes
- bypass suppression
- fabricate topology

---

# 📊 DEBUG MATRIX DOCTRINE

`.matrix()` returns:

```ts
Array<{
  classKey: MaritimeClassKey;
  distanceBand: string;
  renderMode: MaritimeLightRenderMode;
  alpha: number;
  bloomAlpha: number;
}>;
```

Axes:

```text
rows = vessel classes
columns = distance bands
```

Purpose:

```text
observability inspection only
```

Debug tools must NEVER mutate runtime state.

---

# 🛰️ OBSERVABILITY IMPACT

MaritimeLightAuthority influences:

- harbor readability
- distant occupancy persistence
- atmospheric vessel depth
- low-light observability
- symbolic harbor continuity

It does NOT control:

- weather
- overlays
- camera pacing
- soundtrack systems
- environmental orchestration

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- AISRuntime
- VisibilityClassRuntime
- MaritimeDistanceAtmosphere
- MaritimeStyleRegistry

---

## Writes To

```text
NONE
```

Returns immutable presentation envelopes only.

---

## Observed By

- MaritimeOccupancyRenderer
- OverlayGrammar
- future reflection systems
- future harbor observability overlays

---

## Forbidden Mutations

- runtime state
- continuity authority
- camera systems
- weather systems
- overlay orchestration
- AIS telemetry

---

# 🎼 ORCHESTRATION NOTES

MaritimeLightAuthority:

```text
does NOT orchestrate rendering
```

It participates as:

```text
passive presentation infrastructure
```

No sequencing authority exists inside this system.

---

# 🧪 VALIDATION CHECKLIST

- [ ] Light envelopes remain immutable
- [ ] Visibility suppression only reduces visibility
- [ ] Distance collapse never elevates hidden vessels
- [ ] No Math.random() usage exists
- [ ] Pulse behavior remains non-urgent
- [ ] Stable seeded timing preserved
- [ ] Atmosphere suppression remains additive only
- [ ] Bloom never obscures topology
- [ ] Renderer sequencing remains external
- [ ] Wake systems remain independent
- [ ] Reflection hints remain passive metadata
- [ ] Debug tools remain observational only
- [ ] Runtime truth remains untouched
- [ ] No gameplay semantics introduced
- [ ] Military presentation avoids tactical framing

---

# 🚫 NON-GOALS

This system does NOT govern:

- gameplay visibility
- stealth systems
- tactical simulation
- environmental weather
- harbor orchestration
- cinematic direction
- soundtrack systems
- wake simulation
- reflection rendering
- atmospheric storytelling

---

# ⏸️ DEFERRED SYSTEMS

Deferred intentionally:

- global harbor luminance governance
- shoreline light ecology
- dock-light systems
- water reflection rendering
- weather-reactive reflections
- atmospheric cinematic orchestration
- city glow infrastructure

These systems remain:

```text
acknowledged but non-governed
```

---

# 📚 CANONICAL REFERENCES

- README
- WOS Naming Doctrine
- Surface Channel Doctrine
- MaritimeStyleRegistry
- VisibilityClassRuntime
- MaritimeDistanceAtmosphere
- ProceduralVesselTopology
- ActiveWakePolish

---

# 💬 IMPLEMENTATION NOTES

Cluster rendering may degrade under:

```text
high population pressure
```

Far-distance simplification takes precedence over:

```text
cluster fidelity
```

This preserves:

- renderer scalability
- atmospheric calmness
- harbor readability
- continuity pacing

