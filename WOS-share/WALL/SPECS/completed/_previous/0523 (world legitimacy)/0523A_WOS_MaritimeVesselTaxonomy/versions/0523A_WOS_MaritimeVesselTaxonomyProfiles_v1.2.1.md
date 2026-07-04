---
layout: spec

title: "WOS Maritime Vessel Taxonomy Profiles"
date: 2026-05-23
doc_id: "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1"
version: "1.2.1"

project: "Wall of Sound"
system: "WOS"

domain: "runtime"
component: "MaritimeVesselTaxonomyProfiles"

type: "runtime-spec"
status: "active"

priority: "high"
risk: "medium"

classification: "runtime-authority"

summary: "Defines the active concrete implementation profile layer for maritime vessel taxonomy, including profile schemas, normalized scalar semantics, enum contracts, AIS mapping, UNKNOWN fallback behavior, sticky identity rules, validation failure handling, and numerical compilation rules."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "taxonomy defines identity, not importance"
  - "profiles are read-only classification envelopes"
  - "interpretation layers observe taxonomy; they do not rewrite it"
  - "active vessel identity is sticky for the lifecycle window"

depends_on:
  - "0523A_WOS_MaritimeVesselTaxonomy_v1.1.0"
  - "AISRuntime"
  - "MaritimeMotionAuthority"
  - "ContinuityDoctrineSuite"
  - "OverlayGrammar"

enables:
  - "HarborPopulationRuntime"
  - "MarineRenderer"
  - "AtmosphericReadability"
  - "SymbolicMarineRendering"
  - "WakeRuntime"
  - "2.5DProjection"

tags:
  - "maritime"
  - "taxonomy"
  - "profiles"
  - "ais"
  - "continuity"
  - "runtime"
  - "implementation"
  - "active"

---

# 🎯 PURPOSE

Define the concrete implementation profile layer for maritime vessel taxonomy.

This specification restores the implementation infrastructure intentionally omitted from `0523A_WOS_MaritimeVesselTaxonomy_v1.1.0`, while preserving the constitutional improvements introduced by v1.1.0.

This spec exists because downstream systems require deterministic profile data for:

- vessel envelope interpretation
- AIS class normalization
- symbolic marine rendering
- wake interpretation
- harbor population grouping
- observability filtering
- continuity participation hints
- UNKNOWN fallback behavior

This spec does NOT replace v1.1.0.

Instead:

```text
0523A_v1.1.0 = taxonomy governance layer
0523A_v1.2.1 = taxonomy implementation profile layer
```

The central boundary:

```text
taxonomy defines what a vessel IS

taxonomy does NOT define:
how important it feels
how cameras should frame it
how runtime should mutate it
how atmosphere should dramatize it
```

---

# 🧾 CHANGELOG v1.2.1

## Added

- `VARIABLE` to `RouteDiscipline`
- AIS `0–19` explicit UNKNOWN mapping
- `minimumVisualCoastMs` unit and ownership clarification
- `massEnvelope` semantic definition
- `labelPriority` semantic definition
- profile validation failure handling
- active vessel identity stickiness rule
- AIS registry cache-miss graceful degradation rule
- speed anomaly guardrail for `maxExpectedSpeedKts`
- compiled primitive matrix recommendation

## Fixed

- unreachable MILITARY AIS branch in `resolveVesselClassFromAIS()`
- route discipline schema mismatch in FISHING profile
- ambiguity around `minimumVisualCoastMs`
- ambiguity around profile validation failure behavior

## Preserved

- prohibition on `cinematicImportance`
- prohibition on `continuityImportance`
- prohibition on `dramaticWeight`
- UNKNOWN as full fallback class
- renderer guessing prohibition
- numerical compilation requirement

---

# 🧠 CORE PRINCIPLES

## 1. Profiles Are Read-Only Classification Envelopes

A taxonomy profile is a passive data contract attached to a canonical vessel class.

Profiles may inform downstream interpretation.

Profiles may NOT mutate:

- AIS truth
- vessel position
- lifecycle state
- reconciliation state
- camera authority
- atmosphere authority
- renderer truth

---

## 2. Identity Is Not Importance

This spec explicitly removes ambiguous fields such as:

- `cinematicImportance`
- `continuityImportance`
- `dramaticWeight`
- `priorityMood`

These terms create hidden orchestration pressure.

Use bounded system-specific consumers instead:

- continuity uses lifecycle state and telemetry confidence
- renderer uses symbolic profile hints
- overlay uses class and registry state
- population systems use density-safe grouping rules

---

## 3. Runtime Compiles Human-Readable Profiles Into Numerical Primitives

Authoring profiles may use readable enums.

Runtime must consume compiled numeric values.

No fixed-step runtime loop may depend on string matching.

---

## 4. UNKNOWN Is A Full Constitutional Safety Class

`UNKNOWN` is not a placeholder.

It is a complete fallback profile used when AIS classification is absent, invalid, unmapped, or ambiguous.

All unmapped vessels must resolve to `UNKNOWN` before entering the runtime registry.

---

## 5. Renderer Guessing Is Forbidden

Renderers may observe taxonomy profiles.

Renderers may NOT:

- infer vessel class from dimensions
- infer vessel class from AIS strings
- rewrite vessel class from silhouette needs
- create local fallback classes
- fabricate missing profile fields

---

## 6. Active Vessel Identity Is Sticky

Once an active vessel receives a canonical `VesselClass` inside the runtime registry, that class must remain stable for the current tracking lifecycle window.

A vessel may be reclassified only when:

- it fully exits the active registry
- it reaches a clean dormant / purge boundary
- a new tracking lifecycle is created
- a trusted manual correction process explicitly reinitializes the vessel record outside the active deterministic loop

Registry cache-misses may not cause active vessel class flipping.

This prevents:

- PASSENGER → FERRY snapping
- UNKNOWN → SERVICE snapping
- renderer silhouette discontinuity
- wake profile discontinuity
- replay divergence

---

# 🏛️ AUTHORITY BOUNDARIES

This specification governs:

- vessel taxonomy profile structure
- normalized scalar semantics
- categorical enum values
- AIS-to-taxonomy mapping
- UNKNOWN fallback defaults
- numerical compilation requirements
- passive profile consumption boundaries

This specification may expose:

- physical envelope hints
- motion envelope hints
- continuity envelope hints
- wake interpretation hints
- symbolic render hints
- population grouping hints

This specification does NOT govern:

- AIS ingestion authority
- vessel motion resolution
- dead reckoning
- interpolation lifecycle
- lifecycle state transitions
- renderer styling
- shader parameters
- camera behavior
- audio generation
- atmospheric orchestration
- gameplay systems

---

# 🌊 CONTINUITY ROLE

Taxonomy profiles participate in continuity only as passive classification envelopes.

They may provide:

- conservative motion bounds
- coast window multipliers
- dormancy tolerance categories
- persistence envelope hints

They may NOT:

- directly set lifecycle state
- directly change tick tier
- directly alter reconciliation math
- override AIS authority
- force dormancy
- prevent dormancy
- create class-specific interpolation rules

Continuity runtime remains the sole owner of:

- lifecycle transitions
- coast timers
- confidence decay calculation
- interpolation weight
- dormant state handling
- dead reckoning authority

---

# 🧭 INTERPRETATION SEPARATION

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

Runtime truth includes:

- vessel identity
- vessel AIS state
- vessel lifecycle state
- vessel position
- vessel continuity state
- taxonomy profile assignment

Interpretation layers may observe:

- `vesselClass`
- `compiledProfile`
- registry state
- continuity state

Interpretation layers may derive:

- symbolic silhouettes
- wake visualization
- label priority
- fog readability
- overlay categorization
- LOD behavior

Interpretation layers may NOT:

- rewrite `vesselClass`
- modify `compiledProfile`
- fabricate class metadata
- mutate runtime state
- alter vessel motion
- override continuity authority

---

# 📦 CANONICAL VESSEL CLASSES

```ts
export type VesselClass =
  | "CARGO"
  | "TANKER"
  | "PASSENGER"
  | "FERRY"
  | "TUG"
  | "SERVICE"
  | "FISHING"
  | "RECREATIONAL"
  | "MILITARY"
  | "INDUSTRIAL"
  | "UNKNOWN";
```

These classes are inherited from `0523A_WOS_MaritimeVesselTaxonomy_v1.1.0`.

No downstream system may introduce additional primary vessel classes without a taxonomy governance revision.

---

# 📦 PROFILE SCHEMA

## Authoring Schema

Authoring profiles are readable and may contain enums.

```ts
export type MaritimeVesselTaxonomyProfile = {
  vesselClass: VesselClass;
  displayLabel: string;

  physicalProfile: PhysicalProfile;
  motionEnvelope: MotionEnvelope;
  continuityEnvelope: ContinuityEnvelope;
  wakeEnvelope: WakeEnvelope;
  renderEnvelope: RenderEnvelope;
  populationEnvelope: PopulationEnvelope;

  aisMapping: AISMappingRule[];
};
```

## Compiled Runtime Schema

Runtime profiles must use numerical primitives.

```ts
export type CompiledMaritimeVesselTaxonomyProfile = {
  vesselClass: VesselClass;

  physical: CompiledPhysicalProfile;
  motion: CompiledMotionEnvelope;
  continuity: CompiledContinuityEnvelope;
  wake: CompiledWakeEnvelope;
  render: CompiledRenderEnvelope;
  population: CompiledPopulationEnvelope;

  version: "1.2.1";
};
```

The compiled profile is the only format allowed inside the active runtime registry.

---

# 📐 NORMALIZED SCALAR CONTRACT

All normalized scalar fields use:

```text
range: 0.0 → 1.0
```

Unless explicitly stated otherwise.

## Scalar Meaning

| Scalar Range | Meaning |
|---|---|
| `0.0` | absent, minimal, or no effect |
| `0.25` | weak effect |
| `0.5` | moderate baseline |
| `0.75` | strong effect |
| `1.0` | maximum allowed effect |

## Scalar Rules

Normalized values are:

- deterministic
- bounded
- class-level
- read-only
- compiled before runtime consumption

Normalized values are NOT:

- runtime truth
- camera authority
- atmosphere authority
- simulation overrides
- class-specific behavior scripts

---

# 🧱 ENUM CONTRACTS

## DraftClass

```ts
export type DraftClass =
  | "SHALLOW"
  | "MEDIUM"
  | "DEEP"
  | "EXTREME";
```

## HeightClass

```ts
export type HeightClass =
  | "LOW"
  | "MEDIUM"
  | "TALL"
  | "EXTREME";
```

## SuperstructureClass

```ts
export type SuperstructureClass =
  | "MINIMAL"
  | "STANDARD"
  | "COMPLEX"
  | "INDUSTRIAL";
```

## MastDensity

```ts
export type MastDensity =
  | "NONE"
  | "SPARSE"
  | "MODERATE"
  | "DENSE";
```

## RouteDiscipline

```ts
export type RouteDiscipline =
  | "FREE"
  | "VARIABLE"
  | "LOCAL"
  | "CORRIDOR"
  | "ROUTE_LOCKED";
```

### RouteDiscipline Semantics

| Value | Meaning |
|---|---|
| `FREE` | unconstrained movement envelope; common for recreational craft |
| `VARIABLE` | irregular but operationally constrained movement; common for fishing vessels |
| `LOCAL` | localized harbor operation; common for tugs and service craft |
| `CORRIDOR` | expected corridor or shipping-lane behavior |
| `ROUTE_LOCKED` | known repeated route, such as ferry terminal pairs |

## DormancyTolerance

```ts
export type DormancyTolerance =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "EXTREME";
```

## SilhouetteClass

```ts
export type SilhouetteClass =
  | "BLOCK"
  | "LONG_LOW"
  | "STACKED"
  | "COMPACT"
  | "TALL_PASSENGER"
  | "UTILITY"
  | "SMALL_CRAFT"
  | "MILITARY_PROFILE"
  | "UNKNOWN_MARKER";
```

## WakeClass

```ts
export type WakeClass =
  | "NONE"
  | "NARROW"
  | "STANDARD"
  | "WIDE"
  | "HEAVY"
  | "TURBULENT";
```

## PopulationRole

```ts
export type PopulationRole =
  | "TRANSIT"
  | "INDUSTRIAL"
  | "SERVICE"
  | "BACKGROUND"
  | "SECURITY"
  | "UNKNOWN";
```

---

# 📦 PROFILE STRUCTURES

## PhysicalProfile

```ts
export type PhysicalProfile = {
  lengthClass: "SMALL" | "MEDIUM" | "LARGE" | "MASSIVE";
  beamClass: "NARROW" | "STANDARD" | "WIDE" | "EXTREME";
  draftClass: DraftClass;
  heightClass: HeightClass;
  superstructureClass: SuperstructureClass;
  mastDensity: MastDensity;

  massEnvelope: number;
  wakeAuthority: number;
  radarSignature: number;
};
```

### massEnvelope Semantics

`massEnvelope` is a normalized scalar representing relative displacement mass.

```text
1.0 = largest expected harbor vessel, such as ULCV-scale cargo or fully laden tanker
0.5 = moderate working harbor vessel
0.0 = theoretical minimum, rarely used in production
```

`UNKNOWN` uses a conservative baseline rather than zero.

Allowed consumers:

- wake intensity derivation
- symbolic inertia readability
- density grouping
- LOD grouping

Forbidden consumers:

- AIS position
- vessel speed
- heading
- path correction
- collision mutation

### Ownership

Physical profile fields are read-only class envelopes.

They may inform:

- symbolic hull scale
- wake magnitude
- overlay category display
- population LOD grouping

They may NOT influence:

- AIS position
- vessel path
- collision response
- reconciliation behavior
- dead reckoning truth

---

## MotionEnvelope

```ts
export type MotionEnvelope = {
  expectedCruiseSpeedKts: number;
  maxExpectedSpeedKts: number;

  accelerationFactor: number;
  turnRateFactor: number;
  maneuverabilityFactor: number;

  routeDiscipline: RouteDiscipline;
};
```

### Speed Anomaly Rule

If a vessel exceeds `maxExpectedSpeedKts` due to legitimate raw AIS telemetry, the system must log a data anomaly warning but must NEVER overwrite, cap, clamp, taper, or damp the incoming `speedOverGround` state variable inside the deterministic state tracker.

`maxExpectedSpeedKts` is a sanity-check and anomaly-detection hint only.

### Ownership

Motion envelope values are conservative expectation bounds.

They may inform:

- dead reckoning sanity checks
- outlier detection
- interpolation guardrails
- debug warnings

They may NOT:

- force vessel speed
- override AIS speed
- rewrite heading
- apply class-specific steering
- create simulation behavior

---

## ContinuityEnvelope

```ts
export type ContinuityEnvelope = {
  coastWindowMultiplier: number;
  dormantTolerance: DormancyTolerance;

  /**
   * milliseconds
   * Renderer and overlay fade-stabilization hint only.
   * Does not delay lifecycle transitions or prevent DORMANT entry.
   */
  minimumVisualCoastMs: number;
};
```

### Field Clarification

`coastWindowMultiplier` replaces `confidenceDecayRate`.

This avoids conflict with fixed confidence decay doctrine.

The runtime may multiply a system-level base coast window by this class-level scalar:

```ts
effectiveCoastWindowSec = BASE_COAST_WINDOW_SEC * coastWindowMultiplier;
```

`coastWindowMultiplier` must NOT be applied against a per-class `maxCoastSeconds`.

This preserves a single continuity formula while allowing conservative class-level tolerance envelopes.

### minimumVisualCoastMs Ownership

`minimumVisualCoastMs` is a renderer and overlay fade-stabilization hint only.

It may NOT:

- delay lifecycle transitions
- suppress dormancy
- extend AIS continuity
- alter continuity runtime authority
- keep a vessel alive in the runtime registry
- fabricate continuity after runtime dormancy

### Removed Field

`continuityWeight` has been removed in v1.2.1.

Reason:

```text
continuityWeight risks reintroducing importance semantics through a neutral-sounding name.
```

Continuity systems must rely on:

- lifecycle state
- AIS confidence
- elapsed coast time
- canonical continuity formulas

NOT generalized taxonomy weighting.

### Ownership

Continuity envelope values may influence:

- class-level tolerance windows
- conservative dormancy defaults
- visual coast minimums

They may NOT:

- own lifecycle transitions
- override runtime confidence
- force tick cadence
- directly set dormancy
- create class-specific interpolation logic

---

## WakeEnvelope

```ts
export type WakeEnvelope = {
  wakeClass: WakeClass;
  wakeWidthFactor: number;
  wakePersistenceFactor: number;
  turbulenceFactor: number;
  shorelineInteractionFactor: number;
};
```

### Wake Authority Rule

`physicalProfile.wakeAuthority` is the master wake magnitude scalar.

All `wakeEnvelope` fields are modifiers applied downstream.

### Shoreline Rule

`shorelineInteractionFactor` is visual attenuation metadata only.

It may NOT influence:

- vessel path
- collision behavior
- shoreline avoidance
- reconciliation
- runtime state

---

## RenderEnvelope

```ts
export type RenderEnvelope = {
  silhouetteClass: SilhouetteClass;
  projectionWeight: number;
  atmosphericResistance: number;
  labelPriority: number;
};
```

### Projection Weight Rule

`projectionWeight` is a rendering LOD and symbolic scaling hint only.

It may NOT modify:

- geographic truth
- AIS position
- vessel size in runtime state
- collision envelope
- continuity state

### labelPriority Semantics

`labelPriority` is a normalized scalar for label visibility when labels are enabled.

```text
0.0 = never show label except selected/debug override
0.5 = normal label eligibility
1.0 = most persistent label eligibility during scale / LOD reduction
```

Higher values may produce more persistent labels during scaling or LOD reduction.

Production defaults should still render labels sparingly regardless of priority.

`labelPriority` may NOT influence:

- camera target selection
- scheduler priority
- vessel runtime cadence
- continuity persistence
- atmospheric importance

---

## PopulationEnvelope

```ts
export type PopulationEnvelope = {
  populationRole: PopulationRole;
  harborZoneAffinity: number;
  densityContribution: number;
  weatherSensitivity: number;
};
```

### harborZoneAffinity Clarification

`harborZoneAffinity` is a passive population-distribution hint.

Detailed zone definitions belong to `0523B_WOS_MaritimePopulationHierarchy`.

General interpretation:

```text
1.0 = strong affinity for established harbor operation zones
0.5 = mixed or flexible zone presence
0.0 = weak affinity for structured harbor zones
```

This field may NOT directly control runtime motion or continuity cadence.

### weatherSensitivity Clarification

`weatherSensitivity` is an interpretation and population-distribution hint only.

It may NOT:

- slow vessels
- redirect vessels
- alter AIS confidence
- mutate runtime motion
- change continuity state

---

# 🛰️ AIS MAPPING STRATEGY

AIS type codes must resolve through a standalone mapping registry.

This spec defines the baseline mapping contract.

```ts
export type AISMappingRule = {
  aisTypeCodeMin: number;
  aisTypeCodeMax: number;
  vesselClass: VesselClass;
  specialization?: string;
};
```

## Baseline Mapping

| AIS Type Code Range | Canonical VesselClass |
|---:|---|
| `0–19` | `UNKNOWN` |
| `20–29` | `SERVICE` |
| `30–39` | `FISHING` |
| `40–55` | `SERVICE` |
| `56–57` | `MILITARY` |
| `58–59` | `SERVICE` |
| `60–69` | `PASSENGER` |
| `70–79` | `CARGO` |
| `80–89` | `TANKER` |
| `90–99` | `INDUSTRIAL` |
| unmapped / invalid | `UNKNOWN` |

## Ferry Mapping

Ferries may appear under passenger AIS ranges or service registries.

A vessel may resolve to `FERRY` only when one of the following is available:

- trusted route registry match
- operator registry match
- known ferry terminal route pair
- explicit vessel metadata label

AIS type code alone is insufficient to classify a vessel as `FERRY`.

## Ferry Registry Degradation Rule

If `isKnownFerry()` returns false because ferry route data, operator metadata, or trusted vessel metadata is unavailable, stale, empty, or not yet initialized, the vessel must fall through to AIS type code mapping.

Expected degradation:

```text
known ferry with unavailable registry
→ PASSENGER when AIS type code is 60–69
→ UNKNOWN when no valid AIS class exists
```

This is expected graceful degradation, not a runtime fault.

If the ferry registry becomes available later, active vessels must NOT dynamically flip class mid-lifecycle.

Reclassification may occur only at a clean lifecycle boundary.

---

# 🧬 CANONICAL PROFILE DEFINITIONS

## CARGO

```ts
export const CARGO_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "CARGO",
  displayLabel: "Cargo Vessel",

  physicalProfile: {
    lengthClass: "MASSIVE",
    beamClass: "WIDE",
    draftClass: "DEEP",
    heightClass: "TALL",
    superstructureClass: "INDUSTRIAL",
    mastDensity: "MODERATE",
    massEnvelope: 0.95,
    wakeAuthority: 0.9,
    radarSignature: 0.9
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 12,
    maxExpectedSpeedKts: 24,
    accelerationFactor: 0.12,
    turnRateFactor: 0.18,
    maneuverabilityFactor: 0.2,
    routeDiscipline: "CORRIDOR"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 1.4,
    dormantTolerance: "HIGH",
    minimumVisualCoastMs: 120000
  },

  wakeEnvelope: {
    wakeClass: "HEAVY",
    wakeWidthFactor: 0.85,
    wakePersistenceFactor: 0.9,
    turbulenceFactor: 0.65,
    shorelineInteractionFactor: 0.7
  },

  renderEnvelope: {
    silhouetteClass: "BLOCK",
    projectionWeight: 0.85,
    atmosphericResistance: 0.9,
    labelPriority: 0.75
  },

  populationEnvelope: {
    populationRole: "INDUSTRIAL",
    harborZoneAffinity: 0.85,
    densityContribution: 0.8,
    weatherSensitivity: 0.25
  },

  aisMapping: []
};
```

---

## TANKER

```ts
export const TANKER_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "TANKER",
  displayLabel: "Tanker",

  physicalProfile: {
    lengthClass: "MASSIVE",
    beamClass: "EXTREME",
    draftClass: "EXTREME",
    heightClass: "MEDIUM",
    superstructureClass: "INDUSTRIAL",
    mastDensity: "SPARSE",
    massEnvelope: 1.0,
    wakeAuthority: 0.95,
    radarSignature: 0.95
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 11,
    maxExpectedSpeedKts: 22,
    accelerationFactor: 0.1,
    turnRateFactor: 0.14,
    maneuverabilityFactor: 0.16,
    routeDiscipline: "CORRIDOR"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 1.5,
    dormantTolerance: "EXTREME",
    minimumVisualCoastMs: 150000
  },

  wakeEnvelope: {
    wakeClass: "HEAVY",
    wakeWidthFactor: 0.95,
    wakePersistenceFactor: 0.95,
    turbulenceFactor: 0.55,
    shorelineInteractionFactor: 0.75
  },

  renderEnvelope: {
    silhouetteClass: "LONG_LOW",
    projectionWeight: 0.9,
    atmosphericResistance: 0.92,
    labelPriority: 0.8
  },

  populationEnvelope: {
    populationRole: "INDUSTRIAL",
    harborZoneAffinity: 0.75,
    densityContribution: 0.85,
    weatherSensitivity: 0.2
  },

  aisMapping: []
};
```

---

## PASSENGER

```ts
export const PASSENGER_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "PASSENGER",
  displayLabel: "Passenger Vessel",

  physicalProfile: {
    lengthClass: "LARGE",
    beamClass: "WIDE",
    draftClass: "MEDIUM",
    heightClass: "EXTREME",
    superstructureClass: "COMPLEX",
    mastDensity: "MODERATE",
    massEnvelope: 0.75,
    wakeAuthority: 0.65,
    radarSignature: 0.85
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 16,
    maxExpectedSpeedKts: 30,
    accelerationFactor: 0.35,
    turnRateFactor: 0.35,
    maneuverabilityFactor: 0.45,
    routeDiscipline: "CORRIDOR"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 1.15,
    dormantTolerance: "HIGH",
    minimumVisualCoastMs: 90000
  },

  wakeEnvelope: {
    wakeClass: "STANDARD",
    wakeWidthFactor: 0.65,
    wakePersistenceFactor: 0.65,
    turbulenceFactor: 0.4,
    shorelineInteractionFactor: 0.5
  },

  renderEnvelope: {
    silhouetteClass: "TALL_PASSENGER",
    projectionWeight: 0.8,
    atmosphericResistance: 0.85,
    labelPriority: 0.8
  },

  populationEnvelope: {
    populationRole: "TRANSIT",
    harborZoneAffinity: 0.7,
    densityContribution: 0.65,
    weatherSensitivity: 0.35
  },

  aisMapping: []
};
```

---

## FERRY

```ts
export const FERRY_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "FERRY",
  displayLabel: "Ferry",

  physicalProfile: {
    lengthClass: "MEDIUM",
    beamClass: "WIDE",
    draftClass: "MEDIUM",
    heightClass: "MEDIUM",
    superstructureClass: "STANDARD",
    mastDensity: "SPARSE",
    massEnvelope: 0.55,
    wakeAuthority: 0.65,
    radarSignature: 0.7
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 14,
    maxExpectedSpeedKts: 26,
    accelerationFactor: 0.55,
    turnRateFactor: 0.55,
    maneuverabilityFactor: 0.65,
    routeDiscipline: "ROUTE_LOCKED"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 1.1,
    dormantTolerance: "HIGH",
    minimumVisualCoastMs: 90000
  },

  wakeEnvelope: {
    wakeClass: "STANDARD",
    wakeWidthFactor: 0.65,
    wakePersistenceFactor: 0.55,
    turbulenceFactor: 0.35,
    shorelineInteractionFactor: 0.45
  },

  renderEnvelope: {
    silhouetteClass: "STACKED",
    projectionWeight: 0.72,
    atmosphericResistance: 0.78,
    labelPriority: 0.85
  },

  populationEnvelope: {
    populationRole: "TRANSIT",
    harborZoneAffinity: 0.95,
    densityContribution: 0.55,
    weatherSensitivity: 0.4
  },

  aisMapping: []
};
```

---

## TUG

```ts
export const TUG_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "TUG",
  displayLabel: "Tug",

  physicalProfile: {
    lengthClass: "SMALL",
    beamClass: "WIDE",
    draftClass: "MEDIUM",
    heightClass: "LOW",
    superstructureClass: "STANDARD",
    mastDensity: "SPARSE",
    massEnvelope: 0.35,
    wakeAuthority: 0.6,
    radarSignature: 0.55
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 8,
    maxExpectedSpeedKts: 18,
    accelerationFactor: 0.75,
    turnRateFactor: 0.85,
    maneuverabilityFactor: 0.9,
    routeDiscipline: "LOCAL"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 0.95,
    dormantTolerance: "MEDIUM",
    minimumVisualCoastMs: 60000
  },

  wakeEnvelope: {
    wakeClass: "TURBULENT",
    wakeWidthFactor: 0.45,
    wakePersistenceFactor: 0.55,
    turbulenceFactor: 0.85,
    shorelineInteractionFactor: 0.6
  },

  renderEnvelope: {
    silhouetteClass: "COMPACT",
    projectionWeight: 0.65,
    atmosphericResistance: 0.7,
    labelPriority: 0.7
  },

  populationEnvelope: {
    populationRole: "SERVICE",
    harborZoneAffinity: 0.9,
    densityContribution: 0.45,
    weatherSensitivity: 0.3
  },

  aisMapping: []
};
```

---

## SERVICE

```ts
export const SERVICE_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "SERVICE",
  displayLabel: "Service Vessel",

  physicalProfile: {
    lengthClass: "SMALL",
    beamClass: "STANDARD",
    draftClass: "SHALLOW",
    heightClass: "LOW",
    superstructureClass: "STANDARD",
    mastDensity: "MODERATE",
    massEnvelope: 0.3,
    wakeAuthority: 0.35,
    radarSignature: 0.45
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 10,
    maxExpectedSpeedKts: 24,
    accelerationFactor: 0.65,
    turnRateFactor: 0.7,
    maneuverabilityFactor: 0.75,
    routeDiscipline: "LOCAL"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 0.85,
    dormantTolerance: "MEDIUM",
    minimumVisualCoastMs: 45000
  },

  wakeEnvelope: {
    wakeClass: "NARROW",
    wakeWidthFactor: 0.35,
    wakePersistenceFactor: 0.35,
    turbulenceFactor: 0.35,
    shorelineInteractionFactor: 0.4
  },

  renderEnvelope: {
    silhouetteClass: "UTILITY",
    projectionWeight: 0.55,
    atmosphericResistance: 0.6,
    labelPriority: 0.55
  },

  populationEnvelope: {
    populationRole: "SERVICE",
    harborZoneAffinity: 0.8,
    densityContribution: 0.35,
    weatherSensitivity: 0.45
  },

  aisMapping: []
};
```

---

## FISHING

```ts
export const FISHING_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "FISHING",
  displayLabel: "Fishing Vessel",

  physicalProfile: {
    lengthClass: "SMALL",
    beamClass: "STANDARD",
    draftClass: "MEDIUM",
    heightClass: "LOW",
    superstructureClass: "STANDARD",
    mastDensity: "DENSE",
    massEnvelope: 0.32,
    wakeAuthority: 0.32,
    radarSignature: 0.5
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 7,
    maxExpectedSpeedKts: 20,
    accelerationFactor: 0.45,
    turnRateFactor: 0.55,
    maneuverabilityFactor: 0.55,
    routeDiscipline: "VARIABLE"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 0.8,
    dormantTolerance: "MEDIUM",
    minimumVisualCoastMs: 45000
  },

  wakeEnvelope: {
    wakeClass: "NARROW",
    wakeWidthFactor: 0.3,
    wakePersistenceFactor: 0.3,
    turbulenceFactor: 0.45,
    shorelineInteractionFactor: 0.35
  },

  renderEnvelope: {
    silhouetteClass: "UTILITY",
    projectionWeight: 0.5,
    atmosphericResistance: 0.55,
    labelPriority: 0.45
  },

  populationEnvelope: {
    populationRole: "BACKGROUND",
    harborZoneAffinity: 0.5,
    densityContribution: 0.3,
    weatherSensitivity: 0.65
  },

  aisMapping: []
};
```

---

## RECREATIONAL

```ts
export const RECREATIONAL_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "RECREATIONAL",
  displayLabel: "Recreational Vessel",

  physicalProfile: {
    lengthClass: "SMALL",
    beamClass: "NARROW",
    draftClass: "SHALLOW",
    heightClass: "LOW",
    superstructureClass: "MINIMAL",
    mastDensity: "SPARSE",
    massEnvelope: 0.15,
    wakeAuthority: 0.2,
    radarSignature: 0.25
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 12,
    maxExpectedSpeedKts: 35,
    accelerationFactor: 0.75,
    turnRateFactor: 0.8,
    maneuverabilityFactor: 0.85,
    routeDiscipline: "FREE"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 0.6,
    dormantTolerance: "LOW",
    minimumVisualCoastMs: 30000
  },

  wakeEnvelope: {
    wakeClass: "NARROW",
    wakeWidthFactor: 0.22,
    wakePersistenceFactor: 0.2,
    turbulenceFactor: 0.25,
    shorelineInteractionFactor: 0.25
  },

  renderEnvelope: {
    silhouetteClass: "SMALL_CRAFT",
    projectionWeight: 0.35,
    atmosphericResistance: 0.35,
    labelPriority: 0.25
  },

  populationEnvelope: {
    populationRole: "BACKGROUND",
    harborZoneAffinity: 0.45,
    densityContribution: 0.2,
    weatherSensitivity: 0.8
  },

  aisMapping: []
};
```

---

## MILITARY

```ts
export const MILITARY_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "MILITARY",
  displayLabel: "Military Vessel",

  physicalProfile: {
    lengthClass: "LARGE",
    beamClass: "STANDARD",
    draftClass: "DEEP",
    heightClass: "TALL",
    superstructureClass: "COMPLEX",
    mastDensity: "DENSE",
    massEnvelope: 0.8,
    wakeAuthority: 0.65,
    radarSignature: 0.85
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 16,
    maxExpectedSpeedKts: 35,
    accelerationFactor: 0.55,
    turnRateFactor: 0.5,
    maneuverabilityFactor: 0.6,
    routeDiscipline: "LOCAL"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 1.2,
    dormantTolerance: "HIGH",
    minimumVisualCoastMs: 90000
  },

  wakeEnvelope: {
    wakeClass: "STANDARD",
    wakeWidthFactor: 0.6,
    wakePersistenceFactor: 0.6,
    turbulenceFactor: 0.45,
    shorelineInteractionFactor: 0.5
  },

  renderEnvelope: {
    silhouetteClass: "MILITARY_PROFILE",
    projectionWeight: 0.8,
    atmosphericResistance: 0.8,
    labelPriority: 0.75
  },

  populationEnvelope: {
    populationRole: "SECURITY",
    harborZoneAffinity: 0.5,
    densityContribution: 0.5,
    weatherSensitivity: 0.25
  },

  aisMapping: []
};
```

---

## INDUSTRIAL

```ts
export const INDUSTRIAL_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "INDUSTRIAL",
  displayLabel: "Industrial Vessel",

  physicalProfile: {
    lengthClass: "LARGE",
    beamClass: "WIDE",
    draftClass: "DEEP",
    heightClass: "TALL",
    superstructureClass: "INDUSTRIAL",
    mastDensity: "DENSE",
    massEnvelope: 0.85,
    wakeAuthority: 0.75,
    radarSignature: 0.8
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 8,
    maxExpectedSpeedKts: 18,
    accelerationFactor: 0.25,
    turnRateFactor: 0.25,
    maneuverabilityFactor: 0.3,
    routeDiscipline: "LOCAL"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 1.25,
    dormantTolerance: "HIGH",
    minimumVisualCoastMs: 90000
  },

  wakeEnvelope: {
    wakeClass: "HEAVY",
    wakeWidthFactor: 0.75,
    wakePersistenceFactor: 0.75,
    turbulenceFactor: 0.65,
    shorelineInteractionFactor: 0.65
  },

  renderEnvelope: {
    silhouetteClass: "UTILITY",
    projectionWeight: 0.75,
    atmosphericResistance: 0.75,
    labelPriority: 0.65
  },

  populationEnvelope: {
    populationRole: "INDUSTRIAL",
    harborZoneAffinity: 0.85,
    densityContribution: 0.7,
    weatherSensitivity: 0.35
  },

  aisMapping: []
};
```

---

## UNKNOWN

```ts
export const UNKNOWN_PROFILE: MaritimeVesselTaxonomyProfile = {
  vesselClass: "UNKNOWN",
  displayLabel: "Unknown Vessel",

  physicalProfile: {
    lengthClass: "MEDIUM",
    beamClass: "STANDARD",
    draftClass: "MEDIUM",
    heightClass: "MEDIUM",
    superstructureClass: "STANDARD",
    mastDensity: "SPARSE",
    massEnvelope: 0.4,
    wakeAuthority: 0.3,
    radarSignature: 0.35
  },

  motionEnvelope: {
    expectedCruiseSpeedKts: 8,
    maxExpectedSpeedKts: 20,
    accelerationFactor: 0.4,
    turnRateFactor: 0.4,
    maneuverabilityFactor: 0.4,
    routeDiscipline: "LOCAL"
  },

  continuityEnvelope: {
    coastWindowMultiplier: 0.75,
    dormantTolerance: "LOW",
    minimumVisualCoastMs: 30000
  },

  wakeEnvelope: {
    wakeClass: "STANDARD",
    wakeWidthFactor: 0.35,
    wakePersistenceFactor: 0.3,
    turbulenceFactor: 0.3,
    shorelineInteractionFactor: 0.25
  },

  renderEnvelope: {
    silhouetteClass: "UNKNOWN_MARKER",
    projectionWeight: 0.4,
    atmosphericResistance: 0.45,
    labelPriority: 0.35
  },

  populationEnvelope: {
    populationRole: "UNKNOWN",
    harborZoneAffinity: 0.3,
    densityContribution: 0.25,
    weatherSensitivity: 0.5
  },

  aisMapping: []
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
export const TAXONOMY_PROFILE_VERSION = "1.2.1";

export const NORMALIZED_MIN = 0.0;
export const NORMALIZED_MAX = 1.0;

export const DEFAULT_UNKNOWN_CLASS: VesselClass = "UNKNOWN";

export const BASE_COAST_WINDOW_SEC = 120;
export const MINIMUM_VISUAL_COAST_MS = 30000;

export const MAX_PROFILE_LOOKUP_CLASSES = 11;
```

Constants are implementation baselines.

They are NOT eternal doctrine.

---

# 🔧 CORE FUNCTIONS

```ts
export function resolveVesselClassFromAIS(
  aisTypeCode: number | null | undefined,
  metadata: VesselMetadata | null
): VesselClass {
  if (metadata?.trustedVesselClass) {
    return metadata.trustedVesselClass;
  }

  if (metadata && isKnownFerry(metadata)) {
    return "FERRY";
  }

  if (aisTypeCode == null || !Number.isFinite(aisTypeCode)) {
    return "UNKNOWN";
  }

  if (aisTypeCode >= 0 && aisTypeCode <= 19) return "UNKNOWN";
  if (aisTypeCode >= 20 && aisTypeCode <= 29) return "SERVICE";
  if (aisTypeCode >= 30 && aisTypeCode <= 39) return "FISHING";
  if (aisTypeCode >= 40 && aisTypeCode <= 55) return "SERVICE";
  if (aisTypeCode >= 56 && aisTypeCode <= 57) return "MILITARY";
  if (aisTypeCode >= 58 && aisTypeCode <= 59) return "SERVICE";
  if (aisTypeCode >= 60 && aisTypeCode <= 69) return "PASSENGER";
  if (aisTypeCode >= 70 && aisTypeCode <= 79) return "CARGO";
  if (aisTypeCode >= 80 && aisTypeCode <= 89) return "TANKER";
  if (aisTypeCode >= 90 && aisTypeCode <= 99) return "INDUSTRIAL";

  return "UNKNOWN";
}
```

```ts
export function assignVesselClassForLifecycle(
  vesselId: string,
  currentRegistryEntry: VesselRegistryEntry | null,
  proposedClass: VesselClass
): VesselClass {
  if (currentRegistryEntry?.vesselClass) {
    return currentRegistryEntry.vesselClass;
  }

  return proposedClass;
}
```

```ts
export function getTaxonomyProfile(
  vesselClass: VesselClass
): MaritimeVesselTaxonomyProfile {
  return TAXONOMY_PROFILE_REGISTRY[vesselClass] ?? UNKNOWN_PROFILE;
}
```

```ts
export function compileTaxonomyProfile(
  profile: MaritimeVesselTaxonomyProfile
): CompiledMaritimeVesselTaxonomyProfile {
  return {
    vesselClass: profile.vesselClass,
    physical: compilePhysicalProfile(profile.physicalProfile),
    motion: compileMotionEnvelope(profile.motionEnvelope),
    continuity: compileContinuityEnvelope(profile.continuityEnvelope),
    wake: compileWakeEnvelope(profile.wakeEnvelope),
    render: compileRenderEnvelope(profile.renderEnvelope),
    population: compilePopulationEnvelope(profile.populationEnvelope),
    version: "1.2.1"
  };
}
```

```ts
export function validateCompiledProfile(
  profile: CompiledMaritimeVesselTaxonomyProfile
): TaxonomyValidationResult {
  return validateNormalizedScalars(profile)
    .and(validateEnumCompilation(profile))
    .and(validateRequiredFields(profile));
}
```

---

# 🧮 COMPILED PRIMITIVE MATRIX RECOMMENDATION

Runtime hot paths should prefer compact compiled primitive structures.

Authoring profiles may be object-shaped.

Runtime compiled profiles should be converted during registry initialization into either:

- structured numeric objects
- typed arrays
- enum-indexed numeric matrices

Example:

```text
[Authoring Profile Object]
        ↓ Registry Initialization
[Compiled Type Object / Float64Array Matrix]

Offset | Property Vector Field
------ | ---------------------
0x00   | massEnvelope
0x01   | wakeAuthority
0x02   | coastWindowMultiplier
0x03   | silhouetteClassEnum
0x04   | projectionWeight
0x05   | atmosphericResistance
```

This prevents:

- object-path traversal inside hot loops
- repeated string matching
- renderer-local parsing
- profile lookup drift
- unnecessary garbage collection pressure

---

# 🔄 EXECUTION FLOW

```text
Raw AIS Input
→ AIS Type Code Validation
→ Optional Trusted Metadata Match
→ Canonical VesselClass Resolution
→ Existing Registry Class Stickiness Check
→ UNKNOWN Fallback If Needed
→ Taxonomy Profile Lookup
→ Profile Validation
→ Numerical Compilation
→ Runtime Registry Assignment
→ Continuity Runtime Observation
→ Interpretation Layer Observation
→ Overlay / Renderer / Atmosphere Derivation
```

Runtime registry must store the resolved canonical vessel class and compiled profile.

Downstream systems must not repeat AIS mapping.

---

# 🧯 PROFILE VALIDATION FAILURE HANDLING

## Canonical Registry Initialization

Profile registry initialization must validate all canonical profiles.

If any canonical profile fails validation:

- block registry startup
- log the failing `vesselClass`
- emit `MARITIME_TAXONOMY_FAULT`
- prevent active runtime bootstrap

Invalid canonical profiles are constitutional violations.

## Vessel Instance Runtime Fallback

If a vessel instance receives a malformed, missing, or invalid compiled profile at runtime:

1. log validation error with `vesselId` and `vesselClass`
2. emit `MARITIME_TAXONOMY_FAULT`
3. replace that vessel instance profile with `UNKNOWN_PROFILE`
4. continue runtime without crashing
5. do NOT block harbor runtime

Runtime must never allow a null taxonomy profile to enter active vessel state.

---

# 🛰️ OBSERVABILITY IMPACT

This specification improves observability by giving downstream systems stable passive identity envelopes.

It may influence:

- overlay filtering
- symbolic hull readability
- wake visibility
- label density
- atmospheric legibility
- population grouping
- debug reporting

It does NOT control:

- camera target selection
- cinematic priority
- render styling
- runtime cadence
- atmospheric scheduling
- sound generation

Observability systems may consume profile values only as hints.

They remain responsible for their own interpretation logic.

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- AISRuntime
- MaritimeMotionAuthority
- VesselMetadataRegistry
- FerryRouteRegistry
- TaxonomyGovernanceSpec v1.1.0

## Writes To

- VesselRegistry
- TaxonomyProfileRegistry
- CompiledTaxonomyProfileRegistry

## Observed By

- ContinuityRuntime
- HarborPopulationRuntime
- MarineRenderer
- SymbolicMarineRendering
- WakeRuntime
- OverlayGrammar
- AtmosphericReadability
- ObservabilityCamera

## Forbidden Mutations

This system must never mutate:

- AIS source records
- vessel geographic position
- vessel heading
- vessel speed
- lifecycle state
- confidence state
- interpolation state
- renderer state
- camera state
- atmosphere state
- audio state

---

# 🎼 ORCHESTRATION NOTES

This system exposes passive classification infrastructure only.

It does NOT orchestrate:

- channel transitions
- surface transitions
- harbor events
- camera sequences
- audio events
- atmospheric pacing
- traffic simulation
- gameplay events

Schedulers may observe taxonomy metadata.

Schedulers may NOT allow taxonomy to become a direct orchestration trigger without a separate orchestration-layer specification.

---

# 🧪 VALIDATION CHECKLIST

- [ ] Every canonical vessel class has a complete profile
- [ ] UNKNOWN has a complete conservative fallback profile
- [ ] AIS mapping resolves invalid values to UNKNOWN
- [ ] AIS mapping explicitly handles `0–19`
- [ ] MILITARY branch is reachable for AIS codes `56–57`
- [ ] FISHING route discipline is schema-valid
- [ ] No renderer-side classification exists
- [ ] No runtime loop depends on string matching
- [ ] All categorical enums are defined
- [ ] All normalized scalars are bounded to `[0.0, 1.0]`
- [ ] `confidenceDecayRate` is not used
- [ ] `cinematicImportance` is not used
- [ ] `continuityImportance` is not used
- [ ] `continuityWeight` is not used
- [ ] Wake authority has one master scalar
- [ ] Shoreline interaction is visual-only metadata
- [ ] Weather sensitivity is interpretation-only metadata
- [ ] Projection weight does not modify geographic truth
- [ ] `minimumVisualCoastMs` does not delay lifecycle transitions
- [ ] Active vessel class does not flip mid-lifecycle
- [ ] AIS speed is never clamped by taxonomy profile
- [ ] Profiles remain read-only after compilation
- [ ] Taxonomy does not mutate vessel motion
- [ ] Taxonomy does not control atmosphere
- [ ] Taxonomy does not control camera behavior
- [ ] Vocabulary remains canonical
- [ ] No gameplay assumptions introduced

---

# 🚫 NON-GOALS

This specification is NOT responsible for:

- vessel AI
- gameplay systems
- camera framing
- cinematic scripting
- atmospheric scoring
- renderer aesthetics
- shader design
- wake physics
- shoreline collision
- route planning
- harbor economics
- ecological simulation
- autonomous navigation
- military behavior modeling
- ferry schedule authority

---

# ⏸️ DEFERRED SYSTEMS

The following systems are intentionally excluded:

- `0523B_WOS_MaritimePopulationHierarchy`
- `0523E_WOS_AtmosphericReadability`
- `0523G_WOS_SymbolicMarineRendering`
- `0523H_WOS_2_5DProjection`
- advanced ferry schedule reconciliation
- autonomous vessel behavior
- intermodal logistics simulation
- aircraft taxonomy integration
- orbital continuity taxonomy

These systems may consume profiles.

They may not redefine taxonomy authority.

---

# 📚 CANONICAL REFERENCES

- `0523A_WOS_MaritimeVesselTaxonomy_v1.1.0`
- `0522O_WOS_MaritimeMotionAuthority_v1.0.0`
- `0522P_WOS_AISRuntimeContinuity`
- `0522Q_WOS_MaritimeContinuityDoctrine`
- `0521_WOS_ContinuityDoctrineSuite_v1.0.0`
- `0522_WOS_SurfaceChannelDoctrine_v1.1.0`
- `WOS_Naming_Doctrine_v1.1.0`
- `WOS_ConstitutionalSpecTemplate_v2.0.1`
- `README.md`

---

# 💬 IMPLEMENTATION NOTES

## Recommended File Placement

```text
wall/
  registries/
    maritimeTaxonomyProfiles.ts
    maritimeAISClassMapping.ts
```

## Runtime Integration

The active runtime should:

1. resolve raw AIS data into proposed `VesselClass`
2. check existing registry entry for sticky active class
3. attach the compiled taxonomy profile
4. store both in `VesselRegistry`
5. expose read-only profile state to downstream observers

## Compilation Requirement

Profile compilation must occur during registry initialization.

Runtime loops must consume precompiled values only.

## Unknown Handling

Any unmapped or malformed vessel classification must resolve to `UNKNOWN_PROFILE`.

No null profile may enter runtime.

## Downstream Contract

Downstream systems must treat all profile values as:

```text
read-only interpretation hints
```

NOT:

```text
simulation commands
```

---

# 🧠 SEMANTIC TOPOLOGY

## Doctrine

- [[2D owns truth]]
- [[2.5D owns presentation]]
- [[Continuity over twitch response]]
- [[Taxonomy defines identity, not importance]]
- [[Active vessel identity is sticky]]

## Core Concepts

- [[Continuity]]
- [[Observability]]
- [[Atmosphere]]
- [[Spatial Truth]]
- [[Taxonomy Profile]]
- [[UNKNOWN Fallback]]
- [[Compiled Primitive Matrix]]

## Related Systems

- [[AISRuntime]]
- [[MaritimeMotionAuthority]]
- [[MarineRenderer]]
- [[Overlay Grammar]]
- [[WakeRuntime]]

## Runtime Relationships

- [[Dormancy]]
- [[Continuity State]]
- [[Vessel Registry]]
- [[Taxonomy Registry]]

## Geographic Relationships

- [[Harbor Corridor]]
- [[Ferry Route Registry]]
- [[Attention Geography]]

## Governance Relationships

- [[Authority Leakage]]
- [[Cross-Domain Mutation]]
- [[Mega-Spec Drift]]
- [[Renderer Guessing]]
- [[Identity Stickiness]]
