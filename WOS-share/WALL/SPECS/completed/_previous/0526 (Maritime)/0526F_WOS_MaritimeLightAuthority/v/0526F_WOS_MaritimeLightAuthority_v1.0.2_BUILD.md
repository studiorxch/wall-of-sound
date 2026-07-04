---
layout: spec

title: "WOS Maritime Light Authority"
date: 2026-05-27
doc_id: "0526F_WOS_MaritimeLightAuthority_v1.0.2"
version: "1.0.2"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "MaritimeLightAuthority"

type: "runtime-presentation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Build-ready deterministic vessel-local maritime light authority for navigation lights, bloom, atmospheric light collapse, distance-reactive glints, class-specific light signatures, and passive light envelopes without mutating runtime truth."

stage: "[BUILD]"
freeze_decision: "GO"
build_scope: "maritime-light-behavior-authority"

supersedes:
  - "0526F_WOS_MaritimeLightAuthority_v1.0.0"
  - "0526F_WOS_MaritimeLightAuthority_v1.0.1"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525D_WOS_SurfaceStylePresets_v1.0.1"
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
  - "0525F_WOS_ProceduralVesselTopology_v1.0.1"
  - "0526C_WOS_ActiveWakePolish_v1.0.1"
  - "0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1"

related:
  - "0526B_WOS_MaritimeWaterMemory_v1.0.1"

owner: "StudioRich / WOS"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Implement deterministic vessel-local maritime light authority. Preserve passive-envelope architecture, full class signature table, full input contract, complete fallback envelopes, and governance containment.

---

# 0526F_WOS_MaritimeLightAuthority_v1.0.2_BUILD

## Canonical Artifact Rule

This is the full standalone BUILD artifact for:

```text
0526F_WOS_MaritimeLightAuthority_v1.0.2
```

This document supersedes:

```text
0526F_WOS_MaritimeLightAuthority_v1.0.0
0526F_WOS_MaritimeLightAuthority_v1.0.1
```

v1.0.2 resolves final review blockers:

- restores full `MaritimeLightInput`
- restores full class signature table
- defines complete 23-field fallback envelope behavior
- adds `depends_on` front matter
- preserves governance containment from v1.0.1
- clarifies reflection observer independence
- clarifies overlay observer passivity
- preserves anti-urgency pulse doctrine
- preserves renderer sequencing containment

Partial patch-only releases are forbidden after this version.

---

# 1. Purpose

Define the authoritative maritime vessel light presentation system for WOS.

This specification governs:

- navigation light rendering
- distant vessel glints
- bloom behavior
- deterministic pulse and shimmer
- atmospheric light collapse
- class-specific maritime light signatures
- far-distance observability behavior
- passive light envelopes consumed by renderers

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

# 2. Core Principles

## 2.1 Presentation Only

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
- alert state
- emergency state

---

## 2.2 Light Communicates Presence

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

## 2.3 Distance Simplifies Light Structure

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

## 2.4 Deterministic Temporal Behavior

Allowed:

- deterministic pulse
- deterministic shimmer
- stable seeded offsets
- class-specific cadence
- subtle asynchronous variance

Forbidden:

- `Math.random()`
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

Pulse amplitude must remain continuity-subordinate.

Temporal variance must not dominate harbor atmosphere.

---

## 2.5 Vessel-Local Authority Only

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
- shoreline lighting
- dock-light ecology
- city glow systems

---

# 3. Authority Boundaries

## 3.1 This Spec Governs

- maritime light envelopes
- navigation-light presentation
- bloom behavior
- far-light collapse
- deterministic pulse/shimmer
- class-specific light signatures
- distance-reactive light simplification
- visibility-safe suppression
- light fallback safety
- debug light observability matrices

---

## 3.2 This Spec May Observe

- `MaritimeDistanceAtmosphere`
- `VisibilityClassRuntime`
- `MaritimeStyleRegistry`
- runtime zoom
- fog/haze pressure
- density pressure
- vessel class
- render tier
- vessel id / MMSI for deterministic phase variation

---

## 3.3 This Spec Must Not Mutate

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
- style registry state
- distance envelope state

---

## 3.4 Renderer Sequencing Clarification

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
- batching policy

---

## 3.5 Reflection Authority Clarification

Reflection systems must remain:

```text
independently authoritative observers
```

Reflection hints are:

```text
advisory metadata only
```

MaritimeLightAuthority does not own:

- water reflection rendering
- reflection distortion
- water-surface projection
- reflection timing
- reflection composition

---

## 3.6 Overlay Observer Clarification

Overlay systems may observe light envelopes passively.

They may NOT reinterpret light authority into:

- gameplay priority
- UI urgency
- alert hierarchy
- tactical classification
- interaction priority

---

# 4. Continuity Role

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

# 5. Interpretation Separation

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

# 6. Data Model

## 6.1 MaritimeLightRenderMode

```ts
type MaritimeLightRenderMode =
  | "DUAL_NAV"
  | "CLUSTER"
  | "POINT"
  | "GHOST"
  | "NONE";
```

---

## 6.2 MaritimeLightReasonCode

```ts
type MaritimeLightReasonCode =
  | "LIGHT_DUAL_NAV"
  | "LIGHT_CLUSTER"
  | "LIGHT_POINT"
  | "LIGHT_GHOST"
  | "LIGHT_SUPPRESSED"
  | "VISIBILITY_SUPPRESSED"
  | "DISTANCE_SUPPRESSED"
  | "FALLBACK_INVALID_INPUT";
```

No freeform reason strings are allowed.

---

## 6.3 MaritimeClassKey

```ts
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
```

---

## 6.4 MaritimeClassLightSignature

```ts
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
```

---

## 6.5 MaritimeLightInput

```ts
type MaritimeLightInput = {
  readonly vesselId?: string | null;
  readonly mmsi?: number | string | null;

  readonly vesselClass: string;
  readonly vesselState?: string | null;

  readonly headingDeg: number;
  readonly speedKts: number;

  readonly zoom: number;
  readonly nowMs: number;

  readonly visibilityClass: string | null;
  readonly distanceEnvelope: MaritimeDistanceEnvelope | null;

  readonly fogAlpha?: number;
  readonly hazeAlpha?: number;
  readonly densityPressure?: number;

  readonly timeOfDay?: string | null;
  readonly paletteHint?: string | null;
};
```

---

## 6.6 MaritimeLightEnvelope

```ts
type MaritimeLightEnvelope = {
  readonly version: "1.0.2";

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

All envelopes must be immutable.

---

# 7. System Constants

```ts
const MARITIME_LIGHT_AUTHORITY_VERSION = "1.0.2";

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

const REFERENCE_CLUSTER_ZOOM = 13.0;

const DEFAULT_ATMOSPHERE_FOG_WEIGHT = 0.45;
const DEFAULT_ATMOSPHERE_HAZE_WEIGHT = 0.35;
const DEFAULT_ATMOSPHERE_DENSITY_WEIGHT = 0.25;
```

Constants are implementation baselines, not eternal doctrine.

---

# 8. Complete Class Light Signature Table

This table is canonical runtime data.

It must be present in the BUILD artifact.

```ts
const CLASS_LIGHT_SIGNATURES: Record<MaritimeClassKey, MaritimeClassLightSignature> = {
  cargo: {
    classKey: "cargo",
    baseRenderMode: "POINT",
    baseAlpha: 0.44,
    bloomScale: 0.80,
    shimmerScale: 0.45,
    pulseHz: 0.06,
    pulseDepth: 0.12,
    navWarmth: 0.55,
    farWarmth: 0.65,
    clusterCount: 1,
    clusterSpreadPx: 0,
    suppressUnderAtmosphere: 0.35,
  },

  tanker: {
    classKey: "tanker",
    baseRenderMode: "POINT",
    baseAlpha: 0.38,
    bloomScale: 0.95,
    shimmerScale: 0.35,
    pulseHz: 0.045,
    pulseDepth: 0.08,
    navWarmth: 0.70,
    farWarmth: 0.75,
    clusterCount: 1,
    clusterSpreadPx: 0,
    suppressUnderAtmosphere: 0.42,
  },

  ferry: {
    classKey: "ferry",
    baseRenderMode: "DUAL_NAV",
    baseAlpha: 0.62,
    bloomScale: 0.75,
    shimmerScale: 0.55,
    pulseHz: 0.12,
    pulseDepth: 0.16,
    navWarmth: 0.35,
    farWarmth: 0.45,
    clusterCount: 2,
    clusterSpreadPx: 3.5,
    suppressUnderAtmosphere: 0.25,
  },

  tug: {
    classKey: "tug",
    baseRenderMode: "CLUSTER",
    baseAlpha: 0.58,
    bloomScale: 0.65,
    shimmerScale: 0.90,
    pulseHz: 0.18,
    pulseDepth: 0.24,
    navWarmth: 0.62,
    farWarmth: 0.70,
    clusterCount: 3,
    clusterSpreadPx: 4.0,
    suppressUnderAtmosphere: 0.30,
  },

  recreational: {
    classKey: "recreational",
    baseRenderMode: "POINT",
    baseAlpha: 0.48,
    bloomScale: 0.55,
    shimmerScale: 0.75,
    pulseHz: 0.15,
    pulseDepth: 0.20,
    navWarmth: 0.25,
    farWarmth: 0.35,
    clusterCount: 1,
    clusterSpreadPx: 0,
    suppressUnderAtmosphere: 0.40,
  },

  fishing: {
    classKey: "fishing",
    baseRenderMode: "CLUSTER",
    baseAlpha: 0.46,
    bloomScale: 0.60,
    shimmerScale: 0.80,
    pulseHz: 0.11,
    pulseDepth: 0.22,
    navWarmth: 0.50,
    farWarmth: 0.55,
    clusterCount: 2,
    clusterSpreadPx: 3.0,
    suppressUnderAtmosphere: 0.38,
  },

  passenger: {
    classKey: "passenger",
    baseRenderMode: "CLUSTER",
    baseAlpha: 0.64,
    bloomScale: 1.15,
    shimmerScale: 0.35,
    pulseHz: 0.05,
    pulseDepth: 0.08,
    navWarmth: 0.42,
    farWarmth: 0.50,
    clusterCount: 4,
    clusterSpreadPx: 5.5,
    suppressUnderAtmosphere: 0.22,
  },

  military: {
    classKey: "military",
    baseRenderMode: "GHOST",
    baseAlpha: 0.18,
    bloomScale: 0.20,
    shimmerScale: 0.20,
    pulseHz: 0.04,
    pulseDepth: 0.04,
    navWarmth: 0.30,
    farWarmth: 0.30,
    clusterCount: 1,
    clusterSpreadPx: 0,
    suppressUnderAtmosphere: 0.70,
  },

  industrial: {
    classKey: "industrial",
    baseRenderMode: "CLUSTER",
    baseAlpha: 0.50,
    bloomScale: 0.85,
    shimmerScale: 0.60,
    pulseHz: 0.09,
    pulseDepth: 0.16,
    navWarmth: 0.72,
    farWarmth: 0.78,
    clusterCount: 3,
    clusterSpreadPx: 4.5,
    suppressUnderAtmosphere: 0.36,
  },

  service: {
    classKey: "service",
    baseRenderMode: "DUAL_NAV",
    baseAlpha: 0.52,
    bloomScale: 0.65,
    shimmerScale: 0.60,
    pulseHz: 0.13,
    pulseDepth: 0.18,
    navWarmth: 0.45,
    farWarmth: 0.50,
    clusterCount: 2,
    clusterSpreadPx: 2.8,
    suppressUnderAtmosphere: 0.35,
  },

  unknown: {
    classKey: "unknown",
    baseRenderMode: "POINT",
    baseAlpha: 0.32,
    bloomScale: 0.50,
    shimmerScale: 0.45,
    pulseHz: 0.08,
    pulseDepth: 0.12,
    navWarmth: 0.45,
    farWarmth: 0.50,
    clusterCount: 1,
    clusterSpreadPx: 0,
    suppressUnderAtmosphere: 0.45,
  },
};
```

---

# 9. Passenger / Cruise Resolution

In v1.0.x:

```text
cruise resolves to passenger
```

Future versions may introduce a distinct cruise-class signature if observability behavior diverges.

---

# 10. clusterSpreadPx Units

`clusterSpreadPx` is defined at:

```text
reference zoom = 13.0
```

Scaling rule:

```ts
clusterSpread = clusterSpreadPx * (zoom / REFERENCE_CLUSTER_ZOOM)
```

This preserves perceptual consistency across zoom ranges.

---

# 11. pulseDepth Definition

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

# 12. Atmosphere Suppression

## 12.1 Atmosphere Pressure

```ts
const atmospherePressure =
  fogAlpha * DEFAULT_ATMOSPHERE_FOG_WEIGHT +
  hazeAlpha * DEFAULT_ATMOSPHERE_HAZE_WEIGHT +
  densityPressure * DEFAULT_ATMOSPHERE_DENSITY_WEIGHT;
```

Clamp:

```ts
atmospherePressure = clamp01(atmospherePressure);
```

## 12.2 suppressUnderAtmosphere Formula

`suppressUnderAtmosphere` defines how aggressively atmosphere reduces light visibility.

Formula:

```ts
finalAlpha *= (
  1.0 - atmospherePressure * suppressUnderAtmosphere
);
```

Interpretation:

- low values → lights survive atmosphere longer
- high values → lights collapse earlier

Visibility suppression remains additive only.

Atmosphere may NEVER elevate visibility.

---

# 13. Distance Collapse Policy

## HERO / NEAR

Allowed:

- DUAL_NAV
- CLUSTER

## MID

Allowed:

- CLUSTER
- POINT

## FAR

Allowed:

- POINT
- GHOST

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

# 14. Visibility Class Integration

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

# 15. Bloom Policy

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
- bounded by `MAX_BLOOM_RADIUS_PX`
- bounded by `MAX_BLOOM_ALPHA`

Far lights may bloom:

```text
larger but dimmer
```

---

# 16. Wake Glow Integration

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

# 17. Reflection Hint Integration

`allowReflectionHint` exists for:

```text
future compatibility only
```

v1.0.x does NOT implement:

- water reflections
- reflection rendering
- reflection orchestration

Reflection systems must remain independently authoritative observers.

Reflection hints are advisory metadata only.

---

# 18. Canonical Light Resolution Flow

## 18.1 resolveLightEnvelope(input)

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

## 18.2 Stable Seed Rule

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

## 18.3 Pulse Formula

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

## 18.4 Shimmer Formula

Shimmer must be deterministic.

Reference:

```ts
const shimmerNoise =
  0.5 +
  0.5 * Math.sin(nowMs * 0.001 * shimmerRate + shimmerPhase);

const shimmerAmount =
  clamp01(DEFAULT_SHIMMER_AMOUNT * shimmerScale * shimmerNoise);
```

No random shimmer is allowed.

---

# 19. Complete Fallback Envelope Behavior

## 19.1 Canonical Zero Light Envelope

All fallback envelopes must be full 23-field return objects.

```ts
const ZERO_LIGHT_ENVELOPE: MaritimeLightEnvelope = Object.freeze({
  version: "1.0.2",

  visible: false,

  renderMode: "NONE",
  reasonCode: "FALLBACK_INVALID_INPUT",

  alpha: 0,
  bloomAlpha: 0,
  bloomRadiusPx: 0,

  navAlpha: 0,
  farAlpha: 0,

  pulsePhase: 0,
  pulseValue: 0,
  shimmerAmount: 0,

  navPortColor: "rgba(0,0,0,0)",
  navStarboardColor: "rgba(0,0,0,0)",
  navSternColor: "rgba(0,0,0,0)",
  glowColor: "rgba(0,0,0,0)",

  allowNavPair: false,
  allowMastLight: false,
  allowFarGlint: false,
  allowBloom: false,

  allowWakeGlow: false,
  allowReflectionHint: false,
});
```

---

## 19.2 FALLBACK_INVALID_INPUT

```ts
{
  ...ZERO_LIGHT_ENVELOPE,
  reasonCode: "FALLBACK_INVALID_INPUT",
}
```

Behavior:

```text
fully invisible safe failure
```

---

## 19.3 VISIBILITY_SUPPRESSED

```ts
{
  ...ZERO_LIGHT_ENVELOPE,
  reasonCode: "VISIBILITY_SUPPRESSED",
}
```

Behavior:

```text
fully invisible upstream suppression
```

---

## 19.4 DISTANCE_SUPPRESSED

```ts
{
  ...ZERO_LIGHT_ENVELOPE,
  visible: true,
  renderMode: "GHOST",
  reasonCode: "DISTANCE_SUPPRESSED",
  alpha: 0.03,
  farAlpha: 0.03,
  allowFarGlint: true,
}
```

Behavior:

```text
minimal atmospheric glint only
```

Fallbacks must NEVER:

- crash renderer
- produce urgent flashes
- bypass suppression
- fabricate topology
- return sparse envelopes

---

# 20. Debug Matrix Doctrine

`.matrix()` returns:

```ts
Array<{
  classKey: MaritimeClassKey;
  distanceBand: "HERO" | "NEAR" | "MID" | "FAR" | "ATMOSPHERIC";
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

# 21. Required Public API

```ts
function resolveLightEnvelope(input: MaritimeLightInput): MaritimeLightEnvelope;

function resolveClassLightSignature(
  vesselClass: string
): MaritimeClassLightSignature;

function getFallbackLightEnvelope(
  reasonCode: MaritimeLightReasonCode
): MaritimeLightEnvelope;

function getConstants(): object;
```

Runtime namespace:

```ts
SBE.MaritimeLightAuthority
```

Debug namespace:

```ts
_wos.lightAuthority
```

---

# 22. Required Debug API

```ts
_wos.lightAuthority.preview("ferry")
_wos.lightAuthority.sample("cargo", "FAR")
_wos.lightAuthority.compare("cargo", "tug")
_wos.lightAuthority.matrix()
_wos.lightAuthority.constants()
_wos.lightAuthority.setDebug(true)
```

Debug tools are observational only.

---

# 23. Observability Impact

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
- city-light ecology

---

# 24. Authority Relationships

## Reads From

- `AISRuntime`
- `VisibilityClassRuntime`
- `MaritimeDistanceAtmosphere`
- `MaritimeStyleRegistry`

---

## Writes To

```text
NONE
```

Returns immutable presentation envelopes only.

---

## Observed By

- `MaritimeOccupancyRenderer`
- `OverlayGrammar`
- future reflection systems
- future harbor observability overlays

Overlay systems may observe light envelopes passively.

They may not reinterpret light authority into gameplay or UI priority.

---

## Forbidden Mutations

- runtime state
- continuity authority
- camera systems
- weather systems
- overlay orchestration
- AIS telemetry
- distance envelope state

---

# 25. Orchestration Notes

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

# 26. Implementation Scope

Create:

```text
wall/systems/presentation/maritimeLightAuthority.js
wall/systems/presentation/maritimeLightAuthorityDebug.js
```

Patch:

```text
wall/render/maritimeOccupancyRenderer.js
wall/index.html
```

Minimum build behavior:

- light envelope resolves per vessel
- class signature table exists
- deterministic pulse/shimmer works
- distance collapse changes light mode
- visibility suppression can only reduce
- fallback envelopes return complete objects
- debug matrix works
- existing light rendering can fall back safely

---

# 27. Validation Checklist

- [ ] Light envelopes remain immutable
- [ ] `MaritimeLightInput` is defined
- [ ] full class signature table exists
- [ ] visibility suppression only reduces visibility
- [ ] distance collapse never elevates hidden vessels
- [ ] no `Math.random()` usage exists
- [ ] pulse behavior remains non-urgent
- [ ] stable seeded timing preserved
- [ ] atmosphere suppression remains additive only
- [ ] bloom never obscures topology
- [ ] renderer sequencing remains external
- [ ] wake systems remain independent
- [ ] reflection hints remain passive metadata
- [ ] overlay observation remains passive
- [ ] debug tools remain observational only
- [ ] runtime truth remains untouched
- [ ] no gameplay semantics introduced
- [ ] military presentation avoids tactical framing
- [ ] fallbacks return full 23-field envelopes
- [ ] `.matrix()` return structure is defined

---

# 28. Non-Goals

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
- shoreline light ecology
- dock lighting
- city glow

---

# 29. Deferred Systems

Deferred intentionally:

- global harbor luminance governance
- shoreline light ecology
- dock-light systems
- water reflection rendering
- weather-reactive reflections
- atmospheric cinematic orchestration
- city glow infrastructure
- global light budget authority

These systems remain:

```text
acknowledged but non-governed
```

---

# 30. Canonical References

- README
- WOS Naming Doctrine
- Surface Channel Doctrine
- MaritimeStyleRegistry
- VisibilityClassRuntime
- MaritimeDistanceAtmosphere
- ProceduralVesselTopology
- ActiveWakePolish
- MaritimeWaterMemory

---

# 31. Implementation Notes

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

---

# 32. Final Status

```text
0526F_WOS_MaritimeLightAuthority_v1.0.2
```

Status:

```text
[BUILD]
```

Freeze Decision:

```text
GO
```

Classification:

```text
interpretation-layer
```

Build Scope:

```text
vessel-local maritime light envelopes, deterministic pulse/shimmer, distance-based light collapse, bloom governance, complete fallback safety, debug light matrix, no runtime truth mutation
```

Final instruction:

```text
Proceed to implementation.
```

---

# Implementation Guide

- Create `wall/systems/presentation/maritimeLightAuthority.js` and `wall/systems/presentation/maritimeLightAuthorityDebug.js`.
- Wire runtime after `MaritimeDistanceAtmosphere` and before renderer light decisions; keep renderer sequencing external.
- Expect distant vessels to collapse into varied atmospheric glints without becoming UI alerts, gameplay markers, or runtime truth.
