# 0523A_WOS_MaritimeVesselTaxonomy_v1.0.0

**Status:** Draft Foundational World Spec  
**Domain:** Maritime Ecology / Vessel Identity  
**System:** WOS Maritime Layer  
**Classification:** Taxonomy Infrastructure  
**Date:** 2026-05-23  
**Version:** v1.0.0

---

# Purpose

This specification establishes the foundational vessel taxonomy system for the WOS maritime layer.

The taxonomy system exists to transform vessels from:

```text
anonymous moving geometry
```

into:

```text
readable infrastructural actors
```

This specification defines:

- vessel class hierarchy
- physical identity
- motion identity
- observability weighting
- wake authority
- render identity
- ecological role
- atmospheric readability traits
- continuity expectations

This specification does NOT define:

- runtime reconciliation mathematics
- renderer implementation details
- camera choreography
- harbor pacing systems
- cinematic logic
- economic simulation

---

# Constitutional Dependency

This taxonomy operates under:

```text
0522O_WOS_MaritimeMotionAuthority_v1.0.0
0522Q_WOS_MaritimeRuntimePrecision_v1.1.0
```

Taxonomy may influence:

- readability
- observability
- wake authority
- continuity expectations
- render identity

Taxonomy may NOT override:

- AIS truth
- runtime authority
- deterministic cadence
- continuity mathematics

---

# Core Taxonomy Doctrine

```text
A vessel class is not a visual preset.
A vessel class is a continuity personality.
```

A vessel class defines:

- how a vessel occupies space
- how a vessel moves through continuity
- how a vessel influences surrounding ecology
- how a vessel is interpreted observationally

---

# Canonical Vessel Classes

## Tier 1 — Foundational Harbor Classes

These classes form the baseline maritime ecology.

| Class | Primary Role | Harbor Identity |
|---|---|---|
| TUG | harbor labor | directional force |
| FERRY | civic transport | rhythmic continuity |
| CARGO | industrial mass | infrastructural gravity |
| PILOT | guidance | agile coordination |
| COAST_GUARD | authority | patrol presence |
| BARGE | heavy drift | inert continuity |
| SERVICE | utility | maintenance ecology |
| RECREATIONAL | civilian noise | irregularity |

---

# Vessel Taxonomy Structure

Each vessel class must define:

```js
{
  classId,
  physicalProfile,
  motionProfile,
  continuityProfile,
  wakeProfile,
  renderProfile,
  observabilityProfile,
  ecologyProfile
}
```

---

# Physical Profile

Defines real-world spatial characteristics.

## Canonical Structure

```js
physicalProfile: {
  lengthRangeM,
  beamRangeM,
  draftClass,
  massClass,
  heightClass,
  superstructureClass,
  bridgeOffset,
  mastDensity,
  wakeAuthority,
  radarSignature
}
```

---

# Physical Doctrine

Physical profiles influence:

- hull projection
- wake generation
- dimensional readability
- harbor presence
- observability silhouette

Physical profiles must NOT influence:

- AIS authority
- reconciliation mathematics
- continuity ownership

---

# Motion Profile

Defines continuity personality.

## Canonical Structure

```js
motionProfile: {
  cruiseSpeedKts,
  maxSpeedKts,
  accelerationClass,
  decelerationClass,
  turnRateClass,
  routeDiscipline,
  idleBehavior,
  dockingBehavior,
  driftBehavior,
  continuityStability
}
```

---

# Motion Doctrine

Motion profile defines:

- inertia feel
- route discipline
- turning behavior
- harbor occupation style
- continuity readability

Examples:

```text
TUG
→ slow directional force
→ aggressive turn authority
→ localized continuity

FERRY
→ highly rhythmic motion
→ route-locked continuity
→ stable observability

CARGO
→ massive inertia
→ long continuity arcs
→ slow correction behavior
```

---

# Continuity Profile

Defines continuity interpretation traits.

## Canonical Structure

```js
continuityProfile: {
  continuityWeight,
  dormantTolerance,
  staleVisibility,
  holdTolerance,
  confidenceDecayRate,
  continuityImportance,
  routePersistence,
  isolationResistance
}
```

---

# Continuity Doctrine

Continuity profile affects:

- visibility persistence
- atmospheric survivability
- continuity readability
- long-form observation

Examples:

```text
CARGO
→ high continuity persistence
→ visible through fog and distance
→ strong dormant survivability

RECREATIONAL
→ weak persistence
→ highly disposable continuity
→ fast observability decay
```

---

# Wake Profile

Defines ecological water disturbance.

## Canonical Structure

```js
wakeProfile: {
  wakeClass,
  wakeWidthFactor,
  wakePersistence,
  turbulenceAuthority,
  overlapStrength,
  harborScarring,
  shorelineInteraction,
  wakeBrightness
}
```

---

# Wake Doctrine

Wake systems are:

```text
continuity memory infrastructure
```

Wake profile defines:

- how long movement remains visible
- ecological disturbance authority
- harbor rhythm influence
- layered water memory

Examples:

```text
CARGO
→ long persistence
→ heavy harbor scarring
→ wide turbulence envelope

PILOT
→ sharp localized wakes
→ low persistence
→ high maneuver readability
```

---

# Render Profile

Defines symbolic rendering identity.

## Canonical Structure

```js
renderProfile: {
  silhouetteClass,
  emissiveClass,
  hullColorClass,
  mastVisibility,
  labelPriority,
  iconographicComplexity,
  projectionWeight,
  dimensionalityBias,
  atmosphericResistance
}
```

---

# Render Doctrine

Render profile defines:

- symbolic readability
- silhouette identity
- atmospheric survivability
- visual hierarchy
- 2.5D interpretation style

Render profile must NOT:

- alter geographic truth
- modify continuity
- influence runtime state

---

# Observability Profile

Defines documentary importance.

## Canonical Structure

```js
observabilityProfile: {
  observabilityWeight,
  cinematicImportance,
  routeInterest,
  interactionInterest,
  weatherInterest,
  rarityWeight,
  nighttimeVisibility,
  silencePotential
}
```

---

# Observability Doctrine

Observability affects:

- camera prioritization
- atmospheric focus
- documentary significance
- ecological meaning density

Observability must NOT affect:

- runtime cadence
- AIS authority
- continuity mathematics
- reconciliation behavior

---

# Ecology Profile

Defines ecological role inside harbor continuity.

## Canonical Structure

```js
ecologyProfile: {
  harborZoneAffinity,
  congestionContribution,
  corridorAffinity,
  industrialWeight,
  civilianWeight,
  nocturnalBehavior,
  weatherSensitivity,
  persistenceIdentity
}
```

---

# Ecology Doctrine

Ecology profile defines:

- where vessels belong
- how they shape harbor mood
- how they contribute to density
- how they affect environmental rhythm

Examples:

```text
FERRY
→ corridor-heavy
→ civic repetition
→ temporal rhythm anchor

BARGE
→ industrial clustering
→ slow harbor occupation
→ heavy persistence zones
```

---

# Canonical Class Examples

## TUG

```js
TUG: {
  physicalProfile: {
    lengthRangeM: [18, 42],
    beamRangeM: [6, 12],
    massClass: 'medium-heavy',
    wakeAuthority: 0.65
  },

  motionProfile: {
    cruiseSpeedKts: 7,
    maxSpeedKts: 14,
    turnRateClass: 'aggressive',
    routeDiscipline: 'localized'
  },

  continuityProfile: {
    continuityWeight: 0.7,
    dormantTolerance: 'high'
  },

  observabilityProfile: {
    cinematicImportance: 0.65,
    interactionInterest: 0.8
  }
}
```

---

## FERRY

```js
FERRY: {
  physicalProfile: {
    lengthRangeM: [45, 120],
    beamRangeM: [12, 30],
    massClass: 'heavy',
    wakeAuthority: 0.8
  },

  motionProfile: {
    cruiseSpeedKts: 18,
    maxSpeedKts: 28,
    routeDiscipline: 'route-locked',
    continuityStability: 'high'
  },

  continuityProfile: {
    continuityWeight: 0.9,
    routePersistence: 'strong'
  },

  observabilityProfile: {
    cinematicImportance: 0.85,
    routeInterest: 0.9
  }
}
```

---

## CARGO

```js
CARGO: {
  physicalProfile: {
    lengthRangeM: [120, 400],
    beamRangeM: [24, 60],
    massClass: 'extreme',
    wakeAuthority: 1.0
  },

  motionProfile: {
    cruiseSpeedKts: 14,
    maxSpeedKts: 24,
    accelerationClass: 'slow',
    turnRateClass: 'wide'
  },

  continuityProfile: {
    continuityWeight: 1.0,
    dormantTolerance: 'extreme'
  },

  observabilityProfile: {
    cinematicImportance: 1.0,
    silencePotential: 0.95
  }
}
```

---

# Population Hierarchy Dependency

This taxonomy feeds directly into:

```text
0523B_WOS_MaritimePopulationHierarchy_v1.0.0
```

Population systems may derive:

- vessel density
- visibility tiers
- ecological distribution
- simulation priority
- observability weighting

from taxonomy profiles.

---

# Atmospheric Dependency

This taxonomy feeds directly into:

```text
0523E_WOS_MaritimeAtmosphericReadability_v1.0.0
```

Atmospheric systems may derive:

- fog readability
- emissive survivability
- silhouette persistence
- weather visibility
- distance degradation

from renderProfile and continuityProfile.

---

# Symbolic Rendering Dependency

This taxonomy feeds directly into:

```text
0523G_WOS_MaritimeSymbolicRendering_v1.0.0
0523H_WOS_Maritime2_5DProjectionLanguage_v1.0.0
```

Taxonomy defines:

- hull language
- silhouette hierarchy
- dimensional implication
- mast identity
- emissive hierarchy

---

# Scalability Doctrine

Future vessel classes must:

- comply with constitutional authority doctrine
- preserve runtime separation
- preserve deterministic continuity
- preserve taxonomy structure

Future classes may extend:

- render identity
- ecological identity
- atmospheric traits
- observability traits

without altering:

- AIS authority
- continuity ownership
- renderer governance

---

# Forbidden Taxonomy Behaviors

Forbidden:

- taxonomy-driven runtime mutation
- class-specific reconciliation rules
- renderer-owned vessel logic
- atmospheric continuity mutation
- camera-driven vessel behavior
- cinematic override authority

Taxonomy is:

```text
identity infrastructure
```

NOT:

```text
simulation authority
```

---

# Acceptance Criteria

This specification is accepted when:

- vessel classes are canonically defined
- physical/motion/render/ecology layers are separated
- continuity ownership remains constitutional
- wake authority is class-governed
- observability remains interpretation-only
- renderer authority remains bounded
- future population systems can derive hierarchy from taxonomy

---

# Review Questions

1. Are vessel identities sufficiently differentiated?
2. Are continuity traits separated cleanly from runtime authority?
3. Does taxonomy remain interpretation infrastructure rather than simulation ownership?
4. Are wake and ecology systems properly separated?
5. Is symbolic rendering extensible enough for future 2.5D evolution?
6. Does the taxonomy scale to hundreds or thousands of vessels?
7. Are observability and cinematic importance safely bounded?
8. Does the taxonomy preserve constitutional authority doctrine?

---

# Final Taxonomy Statement

```text
A vessel class is not decoration.
A vessel class is a continuity identity.
```

