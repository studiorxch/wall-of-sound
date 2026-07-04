---
layout: spec

title: "WOS Maritime Silhouette Differentiation"
date: 2026-05-27
doc_id: "0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.1"
version: "1.0.1"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "MaritimeSilhouetteDifferentiation"

type: "runtime-presentation-spec"
classification: "interpretation-layer"

status: "[REVIEW]"
stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "maritime-silhouette-readability"

summary: "Constitutionally bounded silhouette readability and atmospheric vessel differentiation for the WOS maritime presentation layer."

owner: "StudioRich / WOS"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
  - "0525F_WOS_ProceduralVesselTopology_v1.0.1"
  - "0526C_WOS_ActiveWakePolish_v1.0.1"
  - "0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1"
  - "0526F_WOS_MaritimeLightAuthority_v1.0.2"

related:
  - "0526B_WOS_MaritimeWaterMemory_v1.0.1"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Tighten governance containment and formalize runtime contracts before BUILD.

# 0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.1_REVIEW

---

# 1. Purpose

Define the constitutional presentation-readability system for maritime silhouette differentiation inside WOS.

This specification governs:

- silhouette readability
- atmospheric vessel distinction
- category-level shape implication
- distance-safe vessel differentiation
- non-textural maritime presence
- lightweight occupancy readability

This system exists to evolve maritime rendering from:

```text
uniform occupancy markers
```

toward:

```text
atmospherically distinguishable maritime presence
```

without introducing:

- simulation mutation
- AIS corruption
- gameplay iconography
- narrative orchestration
- behavioral simulation
- texture dependency
- persistent environmental state

---

# 2. Constitutional Doctrine

## 2.1 Presentation Interprets Reality

Silhouette differentiation exists ONLY within:

```text
presentation-space
```

It may NOT:

- alter AIS truth
- modify vessel state
- inject fake classifications
- affect continuity
- mutate occupancy authority
- rewrite visibility state
- modify camera state
- persist environmental simulation

---

## 2.2 Presentation-Readability Only

MaritimeSilhouetteDifferentiation governs:

```text
presentation readability only
```

It is NOT:

- a vessel identity authority system
- a behavioral simulation layer
- a continuity engine
- a harbor-state accumulator
- a cinematic orchestration layer

---

## 2.3 Shape Language Over Literal Representation

The system rejects:

- texture realism
- literal vessel depiction
- branded ship likenesses
- detailed simulation geometry
- MMO-style iconography

Vessel distinction must emerge through:

- aspect ratio
- atmospheric mass weighting
- light spacing
- wake readability modulation
- directional persistence
- bloom softness
- occupancy density implication

---

# 3. Authority Boundaries

## 3.1 Owns

This system owns:

- silhouette readability profiles
- atmospheric mass interpretation
- hull aspect weighting
- presentation-only directional persistence
- far-light spacing interpretation
- silhouette degradation policy
- presentation-only wake readability scaling

---

## 3.2 Observes

This system may observe:

- AIS vessel class
- AIS vessel state
- speed
- heading
- visibility class
- distance atmosphere envelopes
- wake authority outputs
- light authority outputs

---

## 3.3 Must Not Mutate

This system must NEVER mutate:

- AISRuntime
- MaritimeDistanceAtmosphere
- MaritimeLightAuthority
- ActiveWakePolish
- VisibilityClassRuntime
- ProceduralVesselTopology
- camera state
- continuity state
- harbor environmental state

---

# 4. Canonical Taxonomy Alignment

This system MUST use canonical maritime taxonomy keys.

## Allowed Class Keys

```ts
type MaritimeSilhouetteClass =
  | "cargo"
  | "tanker"
  | "ferry"
  | "service"
  | "recreational"
  | "fishing"
  | "passenger"
  | "tug"
  | "military"
  | "industrial"
  | "unknown";
```

---

## Vessel State Separation

Anchored/drifting/stationary behavior belongs to:

```text
vesselState
```

NOT class taxonomy.

Forbidden:

```text
ANCHORED as a class
FAST_CRAFT as a class
```

---

# 5. Distance Authority

Canonical distance bands must align with 0526E.

```ts
type DistanceBand =
  | "HERO"
  | "NEAR"
  | "MID"
  | "FAR"
  | "ATMOSPHERIC";
```

Visibility classes remain separate authority systems.

---

# 6. Visibility Authority

Visibility classes must align with 0525E.

```ts
type VisibilityClass =
  | "FULL"
  | "REDUCED"
  | "SILHOUETTE"
  | "MARKER_ONLY"
  | "LIGHT_ONLY"
  | "ATMOSPHERIC_HIDDEN";
```

Distance authority and visibility authority must NEVER be conflated.

---

# 7. Runtime Contracts

## 7.1 MaritimeSilhouetteProfile

```ts
type MaritimeSilhouetteProfile = {
  readonly version: "1.0.1";

  readonly silhouetteClass: MaritimeSilhouetteClass;

  // Structural interpretation
  readonly hullAspectBias: number;
  readonly atmosphericMassBias: number;

  // Presentation-only motion readability
  readonly wakeReadabilityScale: number;
  readonly headingStabilityBias: number;
  readonly turnSoftnessDeg: number;

  // Light readability interpretation
  readonly farLightSpacing: number;
  readonly lightClusterVariance: number;

  // Atmospheric softness
  readonly bloomSoftness: number;
};
```

---

## 7.2 Field Definitions

| Field | Meaning |
|---|---|
| hullAspectBias | relative presentation elongation multiplier |
| atmosphericMassBias | resistance to atmospheric silhouette collapse |
| wakeReadabilityScale | presentation-only wake readability weighting |
| headingStabilityBias | visual directional persistence smoothing |
| turnSoftnessDeg | rotational dampening threshold |
| farLightSpacing | normalized spacing multiplier for far-light grouping |
| lightClusterVariance | deterministic cluster offset variance |
| bloomSoftness | edge-softening multiplier for glow interpretation |

All fields are presentation-only.

No field may imply:

- cognition
- intent
- tactical awareness
- navigation certainty
- runtime behavior

---

# 8. Input Contracts

```ts
type MaritimeSilhouetteInput = {
  readonly vesselId: string;

  readonly vesselClass: string;
  readonly vesselState?: string | null;

  readonly speedKts: number;
  readonly headingDeg: number;

  readonly distanceBand: DistanceBand;
  readonly visibilityClass: VisibilityClass;

  readonly isValidationEntity: boolean;
};
```

---

# 9. Canonical Profile Dictionary

```ts
const SILHOUETTE_PROFILES: Record<
  MaritimeSilhouetteClass,
  MaritimeSilhouetteProfile
>;
```

Profiles must remain:

```text
presentation-layer owned
```

and must NEVER contaminate runtime truth.

---

# 10. Atmospheric Persistence Governance

Persistence effects must remain:

```text
lightweight
local
non-accumulative
```

No persistent environmental simulation state may emerge from silhouette systems.

Replace prohibited terminology:

| Forbidden | Allowed |
|---|---|
| glow memory | residual atmospheric persistence |
| harbor memory | atmospheric persistence |
| motion personality | motion readability |

---

# 11. Light Readability Doctrine

At FAR and ATMOSPHERIC bands:

```text
light spacing becomes the vessel
```

Hull readability becomes secondary.

Examples:

| Vessel Type | Far-Light Readability |
|---|---|
| tug | clustered dense glints |
| ferry | elongated bilateral spacing |
| cargo | distributed staggered chain |
| recreational | narrow directional spacing |
| passenger | broad layered occupancy glow |

---

# 12. Motion Readability

Motion differentiation must emerge from:

- heading stability
- inertia smoothing
- wake readability
- turn softness
- directional persistence

NOT from:

- animation exaggeration
- behavioral implication
- gameplay semantics
- procedural chaos
- cartoon oscillation

These characteristics are:

```text
presentation interpretations only
```

They must NOT imply runtime behavioral state.

---

# 13. Validation Vessel Immunity

Validation/debug vessels MUST bypass:

- atmospheric suppression
- silhouette degradation
- drift modulation
- readability reduction
- distance degradation

This preserves diagnostic authority.

---

# 14. Determinism Rules

Allowed:

- deterministic seeded offsets
- stable ID-derived spacing
- repeatable degradation
- bounded mathematical modulation

Forbidden:

- Math.random()
- non-repeatable variance
- frame-dependent instability
- runtime entropy

---

# 15. Distance Collapse Rules

## HERO / NEAR

Allowed:

- full silhouette readability
- class-specific weighting
- wake readability differentiation

---

## MID

Allowed:

- reduced structural distinction
- moderate simplification
- reduced wake readability

---

## FAR

Allowed:

- light-spacing readability
- atmospheric mass implication
- reduced hull readability

---

## ATMOSPHERIC

Allowed:

- light ecology only
- minimal atmospheric implication
- no readable hull identity

---

# 16. Public API

```ts
function resolveSilhouetteProfile(
  input: MaritimeSilhouetteInput
): MaritimeSilhouetteProfile;

function resolveSilhouetteClass(
  vesselClass: string,
  vesselState?: string | null
): MaritimeSilhouetteClass;

function getSilhouetteConstants(): object;
```

Runtime namespace:

```ts
SBE.MaritimeSilhouetteDifferentiation
```

Debug namespace:

```ts
_wos.silhouetteDifferentiation
```

---

# 17. Debug API

```ts
_wos.silhouetteDifferentiation.inspect("cargo")
_wos.silhouetteDifferentiation.preview("ferry")
_wos.silhouetteDifferentiation.compare("cargo", "tug")
_wos.silhouetteDifferentiation.constants()
```

Debug tooling must remain:

```text
observational only
```

---

# 18. Integration Rules

This system modulates presentation interpretation only.

It must NEVER override:

- MaritimeWakeAuthority
- MaritimeDistanceAtmosphere
- MaritimeLightAuthority
- VisibilityClassRuntime

This system consumes upstream authority outputs and applies presentation-readability interpretation afterward.

---

# 19. Renderer Constraints

The following are permanently forbidden:

- ship texture packs
- realistic ship models
- explicit commercial branding
- minimap iconography
- MMO presentation semantics
- cinematic flare abuse
- procedural ocean simulation
- fake AIS identities

---

# 20. Success Criteria

The system succeeds when:

- distant vessels feel atmospherically distinct
- vessel classes remain lightweight
- harbor occupancy feels inhabited
- light spacing communicates presence
- zoom transitions alter observability hierarchy
- renderer complexity remains low
- atmosphere increases without realism collapse

---

# 21. Failure Conditions

The system fails if:

- vessels resemble game icons
- categories become literal
- silhouettes require textures
- rendering becomes noisy
- persistence becomes accumulative
- atmosphere implies narrative authority
- presentation mutates runtime truth

---

# 22. Validation Checklist

- [ ] canonical taxonomy keys only
- [ ] no non-canonical vessel classes
- [ ] no distance/visibility authority conflation
- [ ] no runtime mutation
- [ ] no texture dependency
- [ ] no persistent environmental state
- [ ] no gameplay semantics
- [ ] deterministic only
- [ ] validation vessels bypass degradation
- [ ] public API declared
- [ ] TypeScript contracts defined
- [ ] authority boundaries explicit

---

# 23. Final Doctrine

```text
The harbor should not feel rendered.

It should feel occupied.
```

---

# Implementation Guide

- Define runtime in `wall/systems/presentation/maritimeSilhouetteDifferentiation.js`.
- Integrate AFTER visibility/distance envelopes and BEFORE final sprite/light dispatch.
- Expect distant vessel readability to emerge from spacing, mass implication, and atmospheric hierarchy rather than literal geometry.
