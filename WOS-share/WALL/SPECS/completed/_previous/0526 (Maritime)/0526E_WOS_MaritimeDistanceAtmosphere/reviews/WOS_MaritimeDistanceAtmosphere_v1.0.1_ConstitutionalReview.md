# WOS Constitutional Review Board

# Review Target

**Spec:** `0526E_WOS_MaritimeDistanceAtmosphere_v1.0.0`  
**Review Date:** 2026-05-27  
**Review Mode:** Constitutional infrastructure governance audit

---

# Executive Summary

This is one of the strongest maritime presentation governance specs produced so far in the WOS stack.

The document successfully understands that the next atmospheric problem is:

```text
hierarchy
```

rather than:

```text
more rendering detail
```

That is the correct direction.

The spec maintains strong adherence to:

```text
2D owns truth.
2.5D owns presentation.
```

through most of the architecture.

It correctly frames distance atmosphere as:

- interpretation
- suppression
- compression
- atmospheric readability
- presentation hierarchy

rather than simulation.

The strongest architectural success is this statement:

```text
Distance atmosphere interprets visibility.
It does not define reality.
```

However, several structural risks remain:

- hidden camera authority coupling
- orchestration leakage through renderer sequencing
- future cinematic-director contamination
- ambiguous focus-center ownership
- semantic drift toward gameplay visibility
- atmospheric policy becoming renderer governance

The spec is substantially healthier than WaterMemory-era thinking and is near production-ready with governance refinements.

---

# [Governance Audit]

## 1. Architectural Positioning Is Strong

The canonical flow is structurally coherent.

Particularly important:

```text
DistanceAtmosphere is an interpretation layer.
```

This prevents:

- simulation ownership confusion
- renderer truth mutation
- topology authority corruption

Correct separation.

---

## 2. Authority Boundaries Are Exceptionally Clean

The strongest governance characteristic is:

```text
May Produce
```

instead of:

```text
May Control
```

The document successfully blocks mutation of:

- AIS truth
- lifecycle
- camera state
- map projection
- wake authority
- topology blueprint
- style registry

This is strong constitutional containment.

---

## 3. Hidden Focus-Center Authority Problem Exists

The largest governance issue is:

```text
viewport center = focus center
```

followed by future references to:

- camera focus
- selected vessel
- director-mode focal subject
- route progress anchor

This introduces cinematic authority creep into a presentation compression system.

### Required Governance Refinement

Add:

```text
DistanceAtmosphere consumes externally resolved focus anchors.

It does not determine focal authority.
```

and:

```text
Focus-anchor resolution belongs to orchestration systems outside this spec.
```

---

## 4. Renderer Integration Sequence Risks Hidden Orchestration Ownership

The renderer integration section implies centralized sequencing authority.

That risks:

- render pipeline coupling
- hidden orchestration centralization
- pass-order rigidity

### Recommended Refinement

Clarify:

```text
DistanceAtmosphere exposes passive presentation envelopes.

Renderer sequencing ownership remains external.
```

---

## 5. VisibilityClass Integration Is Architecturally Excellent

Particularly strong:

```text
DistanceAtmosphere may reduce visibility.
It may not elevate suppressed detail.
```

The spec correctly behaves as a visibility consumer rather than visibility authority.

---

# [Implementation Gravity Audit]

## 1. Data Model Is Operationally Strong

The `MaritimeDistanceEnvelope` structure is highly implementable.

Strong characteristics:

- deterministic
- immutable semantics
- bounded outputs
- explicit permissions
- renderer-safe

Especially strong:

```ts
allowWake
allowTopology
allowHover
allowFarLight
```

These are executable governance primitives.

---

## 2. `reason: string` Is a Hidden Debt Vector

This field:

```ts
reason: string;
```

creates long-term risk:

- semantic ambiguity
- conditional renderer branching
- gameplay logic hooks
- debug prose accumulation

### Required Refinement

Replace with:

```ts
reasonCode: DistanceReasonCode;
```

Avoid freeform runtime semantic strings.

---

## 3. Distance Calculation Is Too Screen-Centric

Using normalized screen-space distance is acceptable for v1.

However it introduces future instability risk:

- ultrawide viewport distortion
- UI-layout coupling
- cinematic framing leakage

### Required Clarification

Add:

```text
Screen-space distance is a temporary presentation heuristic for v1.
```

and:

```text
DistanceAtmosphere does not own long-term observability geography.
```

---

## 4. Failure Modes Are Well Designed

Especially strong:

```text
No exception should break maritime rendering.
```

and:

```text
return ATMOSPHERIC-safe envelope
```

This demonstrates strong continuity-safe degradation discipline.

---

# [Continuity Doctrine Audit]

## 1. The Spec Correctly Prioritizes Suppression Over Amplification

The atmosphere system mainly:

- removes
- compresses
- softens
- suppresses
- abstracts

It does not continuously add spectacle.

That aligns strongly with WOS continuity pacing.

---

## 2. The Harbor Finally Begins Behaving Like Space

This sentence is structurally important:

```text
Everything appears too equally present.
```

The spec correctly addresses:

- observability hierarchy
- atmospheric depth pacing
- attention compression
- distance ambiguity

without requiring:

- simulation fog
- volumetrics
- gameplay mechanics

Correct direction.

---

## 3. `HERO` Terminology Is Mildly Dangerous

The distance band:

```text
HERO
```

contains latent gameplay and cinematic semantics.

### Recommended Rename

Prefer:

```text
FOREGROUND
```

or:

```text
PRIMARY
```

Non-blocking but recommended.

---

## 4. Hover Suppression Rules Are Strong

The rule:

```text
Hover cards must not appear for atmospheric vessels.
```

protects:

- scale perception
- harbor silence
- distance ambiguity
- observability pacing

Correct atmospheric governance.

---

# [Scalability Audit]

## 1. Envelope-Once-Per-Vessel Is Correct

This is a major scalability success:

```text
The distance envelope should be computed once per vessel per frame.
```

Correct.

This avoids:

- redundant calculations
- renderer disagreement
- pass inconsistency
- cross-render divergence

---

## 2. The System Risks Becoming Universal Visibility Middleware

The spec currently feeds:

- topology
- wakes
- labels
- lights
- hover cards

Long-term pressure will likely attempt adding:

- audio attenuation
- AI observability
- event prioritization
- cinematic weighting

### Required Addition

Add:

```text
MaritimeDistanceAtmosphere governs presentation compression only.

It is not a global observability authority.
```

---

## 3. Far-Light Persistence Is Well Restrained

The document correctly avoids:

- urgency
- emergency coding
- gameplay signaling

This preserves atmospheric neutrality.

---

# [Canonical Vocabulary Audit]

## 1. `Distance Atmosphere` Is Strong Terminology

Because it implies:

- interpretation
- presentation
- perceptual compression

rather than simulation truth.

---

## 2. `Distance Band` Is Stable

Simple.
Deterministic.
Operational.

No governance concerns.

---

## 3. `Hero` Should Be Reconsidered

The issue is semantic narrative framing, not functionality.

---

# Blocking Issues

## BLOCKING

### 1. Focus-anchor authority ambiguity

Must prevent cinematic/director ownership leakage into atmosphere resolution.

---

### 2. Renderer integration wording implies sequencing authority

Must clarify passive-envelope behavior.

---

### 3. `reason: string` introduces unbounded semantic drift

Must constrain to deterministic enum/code semantics.

---

### 4. DistanceAtmosphere requires stronger anti-middleware containment

Must explicitly forbid expansion into global observability governance.

---

# Optional Refinements

## NON-BLOCKING

- Rename `HERO` band
- Clarify temporary screen-space heuristic status
- Reduce future cinematic terminology
- Add explicit passive-observer doctrine wording
- Clarify orchestration ownership boundaries

---

# Production Readiness

## Current State

```text
High readiness with moderate governance pressure risks.
```

Implementation feasibility is strong.

The main risks are:

- semantic expansion
- orchestration absorption
- cinematic authority creep

not rendering complexity.

---

# Recommended Version Escalation

## Recommended Outcome

```text
v1.0.1 REVIEW
```

No subsystem-scale redesign required.

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
STRONG
```

## Continuity Doctrine Alignment

```text
VERY STRONG
```

## Primary Positive Direction

The spec successfully transitions maritime rendering away from:

- flat equal-presence visibility
- indiscriminate detail exposure

and toward:

- atmospheric hierarchy
- distance compression
- observability pacing
- symbolic maritime space

without violating core WOS doctrine.
