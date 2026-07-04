# 🚦 SPEC STAGE

Stage: [REVIEW]
Freeze Decision: REVIEW
Action: Define canonical silhouette differentiation architecture before BUILD.

# 0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.0

## Purpose

Define the constitutional presentation rules for vessel silhouette differentiation within the WOS maritime layer.

This specification establishes:

- perceptual vessel hierarchy
- silhouette category differentiation
- atmospheric mass readability
- non-textural maritime identity
- distance-safe vessel recognition
- cinematic harbor occupancy shaping

The goal is to evolve maritime rendering from:

```text
uniform iconographic occupancy
```

toward:

```text
emotionally readable maritime presence
```

without introducing:

- simulation corruption
- AIS fabrication
- texture dependency
- asset-heavy rendering
- gameplay-style iconography
- renderer-state mutation

---

# Constitutional Doctrine

## Presentation Interprets Reality

Silhouette differentiation exists ONLY within:

```text
presentation-space
```

It may NOT:

- alter AIS truth
- modify vessel state
- inject fake classifications
- affect continuity
- influence motion
- mutate occupancy authority

---

# Core Atmospheric Principle

## Maritime Identity Emerges Through Shape Language

WOS must avoid:

```text
literal vessel rendering
```

The target is:

```text
recognizable atmospheric implication
```

Examples:

| Vessel Type | Psychological Read |
|---|---|
| Tug | dense mechanical mass |
| Ferry | elongated passenger motion |
| Cargo | distributed industrial bulk |
| Fast craft | narrow directional energy |
| Anchored ship | sleeping structure |
| Distant traffic | drifting light ecology |

---

# Renderer Constraints

## NO Texture Dependence

Silhouette differentiation must NOT rely on:

- photo textures
- sprite atlases
- painted ship assets
- detailed 3D geometry
- identifiable commercial vessel likenesses

Differentiation must emerge through:

- aspect ratio
- mass distribution
- light spacing
- wake behavior
- temporal persistence
- glow cadence
- directional bias
- motion inertia

---

# Distance Authority

Differentiation must weaken naturally with distance.

| Distance Band | Allowed Differentiation |
|---|---|
| CLOSE | full silhouette weighting |
| MID | reduced category implication |
| FAR | light spacing + mass bias only |
| ATMOSPHERIC | light ecology only |
| LIGHT_ONLY | no hull rendering |

---

# Vessel Presentation Classes

## TUG

Psychological read:

```text
dense industrial puller
```

Characteristics:

- compact hull
- stronger rear glow density
- heavier wake persistence
- asymmetrical lighting acceptable

---

## FERRY

Psychological read:

```text
public movement corridor
```

Characteristics:

- elongated horizontal mass
- smoother cadence
- balanced bilateral lights
- stable heading implication

---

## CARGO

Psychological read:

```text
floating infrastructure
```

Characteristics:

- distributed light spacing
- heavy forward inertia
- broad occupancy footprint
- layered atmospheric bloom

---

## FAST_CRAFT

Psychological read:

```text
directional energy
```

Characteristics:

- narrow projection
- stronger directional streaking
- sharper wake taper
- reduced bloom persistence

---

## ANCHORED

Psychological read:

```text
sleeping mechanical structure
```

Characteristics:

- minimal wake
- high persistence
- low directional implication
- stronger environmental blending

---

# Light Grouping Doctrine

At FAR and ATMOSPHERIC bands:

```text
light spacing becomes the vessel
```

Hull readability becomes secondary.

Examples:

| Type | Light Pattern |
|---|---|
| Tug | clustered dense glints |
| Ferry | elongated bilateral spacing |
| Cargo | distributed staggered chain |
| Fast craft | narrow directional streak |
| Anchored | stable isolated pulse |

---

# Motion Personality

Differentiation should emerge from:

- heading stability
- inertia smoothing
- directional confidence
- wake persistence
- cadence behavior
- turn softness

NOT from:

- exaggerated oscillation
- cartoon motion
- gameplay exaggeration
- procedural jitter

---

# Atmospheric Persistence

Large occupancy classes may retain:

- glow memory
- wake persistence
- atmospheric bloom
- directional residue

slightly longer than smaller vessels.

This creates:

```text
harbor memory
```

rather than:

```text
object turnover
```

---

# Validation Vessel Immunity

Validation/debug vessels MUST bypass:

- atmospheric suppression
- silhouette degradation
- class variance
- drift modulation
- differentiation weighting

This preserves diagnostic authority.

---

# Forbidden Directions

DO NOT introduce:

- ship texture packs
- realistic ship models
- explicit vessel branding
- MMO iconography
- procedural ocean simulation
- fake AIS identities

---

# Recommended Runtime Structure

```js
{
  classId: 'FERRY',

  hullAspectBias: 1.8,
  wakePersistence: 0.65,
  bloomSoftness: 0.45,
  directionalConfidence: 0.80,

  farLightSpacing: 1.4,
  lightClusterVariance: 0.15,

  atmosphericMassBias: 0.70
}
```

Profiles must remain:

```text
renderer-owned
```

and must NEVER contaminate AIS/runtime authority.

---

# Success Criteria

The system succeeds when:

- distant vessels feel alive but restrained
- vessel categories feel emotionally distinct
- zoom level changes harbor psychology
- lights imply occupation without noise
- vessels feel infrastructural rather than game-like
- maritime space feels inhabited
- renderer complexity remains lightweight

---

# Final Doctrine

```text
The harbor should not feel rendered.

It should feel occupied.
```
