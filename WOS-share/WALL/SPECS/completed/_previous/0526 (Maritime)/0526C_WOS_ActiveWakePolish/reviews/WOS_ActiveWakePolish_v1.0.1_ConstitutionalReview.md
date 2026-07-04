# WOS Constitutional Review Board

## Review Target

**Spec:** `0526C_WOS_ActiveWakePolish_v1.0.0`  
**Review Context:** Infrastructure governance and continuity doctrine audit  
**Review Date:** 2026-05-27

Referenced source materials:
- Active wake spec
- Review instruction template
- Constitutional template

---

# Executive Summary

The spec is structurally healthier than the abandoned MaritimeWaterMemory direction.

It correctly recenters wake rendering around:

- active vessel-local presentation
- non-accumulating interpretation
- atmospheric restraint
- class-readable motion signaling
- passive presentation semantics

The document demonstrates strong awareness of prior architectural failure modes.

Most importantly:

```text
Active wakes communicate live motion.
They do not simulate water.
```

This is a stabilizing doctrine statement.

However, the specification still contains several unresolved governance weaknesses:

- interpretation/runtime ownership leakage
- presentation-layer semantic inflation
- hidden orchestration assumptions
- excessive renderer behavioral coupling
- incomplete authority relationship declaration
- unresolved identity semantics for deterministic wake variation

The spec is close to implementation-ready but requires governance tightening before BUILD freeze.

---

# [Governance Audit]

## 1. Classification Is Structurally Correct

```yaml
classification: presentation-layer
```

is appropriate.

The system behaves as:

- an interpretation observer
- a vessel-attached symbolic renderer
- a continuity readability layer

It does not currently attempt to own runtime truth.

This is compliant with:

```text
2D owns truth.
2.5D owns presentation.
```

---

## 2. Authority Boundaries Are Mostly Clean

The strongest section in the document is:

```text
ActiveWakePolish May NOT Mutate
```

This successfully blocks:

- AIS corruption
- camera authority leakage
- map projection ownership drift
- continuity mutation
- taxonomy mutation

This materially protects runtime stability.

---

## 3. Hidden Ownership Drift Exists Around “Wake Modes”

The document states:

```text
wake mode from MaritimeWakeSignature
```

but later defines:

```ts
mode: "LINEAR" | "SPLIT_V" | "TURBULENT" | "DRIFT" | "DISCIPLINED";
```

### Required Refinement

Explicitly declare:

```text
Wake modes are interpretation-layer presentation archetypes.

They are NOT runtime behavioral states.
```

Then define:

```text
MaritimeWakeSignature owns wake archetype selection.
ActiveWakePolish owns visual refinement only.
```

Without this split, future specs will likely collapse the two systems together.

---

## 4. Debug API Risks Renderer Governance Expansion

The proposed:

```ts
_wos.wakeSignature.preview("ferry")
```

is acceptable.

However:

```ts
_wos.wakeSignature.profile("cargo")
```

begins implying live mutable presentation state ownership.

### Required Governance Constraint

Add:

```text
Debug APIs are observational tooling only.

They must not expose mutable live renderer authority.
```

and:

```text
Wake profiles are immutable presentation definitions during runtime execution.
```

---

## 5. Missing “Authority Relationships” Section

The constitutional template standardizes:

```text
Reads From
Writes To
Observed By
Forbidden Mutations
```

This spec omits that structure.

### Required Addition

```text
Reads From:
- AISRuntime
- MaritimeWakeSignature
- CameraZoomState
- VisibilityTier

Writes To:
- none

Observed By:
- MaritimeRenderer
- OverlaySystems

Forbidden Mutations:
- AIS state
- vessel continuity
- renderer orchestration
- camera framing
```

---

# [Implementation Gravity Audit]

## 1. Implementation Scope Is Appropriately Bounded

The scope is intentionally narrow:

```text
Patch maritimeWakeSignature.js
```

This prevents:

- mega-spec expansion
- premature subsystem proliferation
- scheduler contamination
- cross-domain implementation spread

Good restraint.

---

## 2. Deterministic Variation Is Underdefined

The spec allows:

```text
deterministic seeded jitter
```

but never defines:

- seed origin
- continuity persistence
- replay stability
- vessel identity relationship

### Required Clarification

```text
All wake variation seeds must derive deterministically from stable vessel identity.
```

and:

```text
Wake variation may not depend on frame-time randomness.
```

---

## 3. Zoom LOD Semantics Are Too Camera-Coupled

The spec repeatedly references:

```text
far zoom
mid zoom
close zoom
```

### Recommended Refinement

Replace semantic dependency language with:

```text
visibility thresholds derived from externally authoritative observability state
```

or:

```text
wake presentation responds to resolved visibility tier inputs
```

---

## 4. “Class Readability” Risks Gameplay Drift

The phrase:

```text
class-readable
```

contains latent gameplay pressure.

### Required Doctrine Clarification

```text
Class readability exists for atmospheric observability only.

Wake signatures are not intended as tactical gameplay identifiers.
```

---

# [Continuity Doctrine Audit]

## 1. The Spec Successfully Rejects Water Simulation Drift

The system remains:

- atmospheric
- symbolic
- observational
- presentation-attached

rather than simulation-maximalist.

Correct direction.

---

## 2. Atmospheric Restraint Is Strong

The repeated suppression doctrine:

- low-fatigue
- subtle
- restrained
- soft
- no particle spam
- no map-wide residue

is fully aligned with WOS continuity pacing.

---

## 3. “Military Wake Nearly Invisible” Is Semantically Dangerous

The issue is not the visual tuning.

The issue is the implied behavioral characterization.

### Recommended Refinement

Prefer:

```text
minimal visible disturbance
```

instead of:

```text
restrained discipline
```

---

# [Scalability Audit]

## 1. The Spec Avoids Catastrophic Field Accumulation

The explicit rejection of:

```text
accumulated wake fields
```

avoids:

- memory amplification
- viewport persistence artifacts
- map-scale redraw churn
- continuity contamination
- atmospheric saturation

Strong correction.

---

## 2. Turbulence Filament Counts Require Explicit Budget Governance

### Recommended Addition

```text
Wake turbulence rendering must degrade gracefully under population pressure.
```

and:

```text
Wake turbulence is optional presentation detail, not continuity-critical rendering.
```

---

# [Canonical Vocabulary Audit]

## 1. “WaterMemory” Remains Dangerous Terminology

Long-term rename candidate:

```text
WaterTraceField
```

or:

```text
SurfaceDisturbanceField
```

Not required immediately.

---

## 2. “Wake Signature” Is Acceptable

Because it implies interpretation rather than simulation truth.

---

## 3. “Class Readable” Needs Narrowing

Suggested replacement language:

```text
visually distinguishable at supported observability tiers
```

---

# Blocking Issues

## BLOCKING

### 1. Wake semantic ownership ambiguity

Must explicitly separate:

- MaritimeWakeSignature ownership
- ActiveWakePolish ownership
- runtime vessel truth

---

### 2. Deterministic variation source undefined

Must formally prohibit frame-randomized wake behavior.

---

### 3. Missing authority relationship topology section

Must add explicit:

- Reads From
- Writes To
- Observed By
- Forbidden Mutations

---

### 4. Camera/zoom authority wording too renderer-centric

Must avoid implicit camera authority leakage.

---

# Optional Refinements

## NON-BLOCKING

- Reduce anthropomorphic vessel language
- Narrow “class readability” semantics
- Add frame-budget degradation doctrine
- Clarify immutable debug profile behavior
- Reduce military semantic framing

---

# Production Readiness

## Current State

```text
Near-ready with governance tightening required.
```

Implementation risk is low.

Architectural survivability risk is moderate.

The primary danger is:

```text
future semantic drift
```

where presentation semantics slowly become behavioral authority.

---

# Recommended Version Escalation

## Recommended Outcome

```text
v1.0.1 REVIEW
```

Not:

```text
v1.1.0
```

because the required changes are governance clarifications rather than subsystem expansion.

---

# Final Verdict

## Review Status

```text
CONDITIONAL APPROVAL
```

## Production Readiness

```text
READY AFTER GOVERNANCE PATCHES
```

## Architectural Stability

```text
STABLE WITH MINOR DOCTRINAL LEAKAGE RISKS
```

## WOS Doctrine Alignment

```text
STRONG
```

## Primary Positive Direction

The spec correctly retreats from:

- accumulated water simulation
- persistent map contamination
- screen-space memory artifacts
- renderer-scale fluid ambitions

and recenters maritime observability around:

- local continuity
- symbolic motion traces
- restrained atmospheric readability
- passive presentation semantics

This is substantially more aligned with long-term WOS survivability.
