
---

layout: spec

title: "WOS Overlay Grammar"  
date: 2026-05-21  
doc_id: "0521B_WOS_OverlayGrammar_v1.1.1"  
version: "1.1.1"

project: "Wall of Sound"  
system: "WOS"

domain: "overlay"  
component: "OverlayGrammar"

classification: "interpretation-layer"  
status: "canonical-draft"  
priority: "high"  
risk: "medium"

summary: "Defines symbolic observability overlays, continuity-aware telemetry presentation, and atmospheric instrumentation grammar for WOS broadcast systems."

concepts:

- continuity
    
- observability
    
- atmosphere
    
- symbolic-subtraction
    
- overlay-grammar
    
- broadcast-observability
    

---

# 🎯 PURPOSE

OverlayGrammar defines the symbolic observability language used by WOS broadcast systems.

This system governs:

- telemetry readability
    
- symbolic overlay presentation
    
- continuity-aware visibility reduction
    
- low-light observability behavior
    
- atmospheric instrumentation framing
    
- overlay projection semantics
    

OverlayGrammar is an interpretation-layer system.

It does NOT:

- own runtime truth
    
- mutate simulation state
    
- determine continuity authority
    
- compute pacing state
    
- prioritize world importance independently
    
- create observability truth
    

OverlayGrammar interprets:

```text
resolved continuity state
```

It does NOT create continuity state.

---

# 🧠 CORE PRINCIPLES

- readability over density
    
- atmosphere over dashboards
    
- continuity over visual saturation
    
- symbolic subtraction over telemetry overload
    
- observability over interface clutter
    
- infrastructural calm over reactive urgency
    

Overlays should feel:

- restrained
    
- cinematic
    
- sparse
    
- nocturnal
    
- continuity-aware
    

NOT:

- game-like
    
- tactical
    
- maximally informative
    
- aggressively interactive
    

---

# 🧠 SEMANTIC TOPOLOGY

## Related Doctrine

- [[2D owns truth]]
    
- [[2.5D owns presentation]]
    
- [[Continuity over twitch response]]
    
- [[Dormancy over deletion]]
    

## Core Concepts

- [[Continuity]]
    
- [[Observability]]
    
- [[Atmosphere]]
    
- [[Symbolic Subtraction]]
    
- [[Spatial Truth]]
    

## Related Systems

- [[AISRuntime]]
    
- [[Observability Camera]]
    
- [[Transition Runtime]]
    
- [[ContinuityStateRegistry]]
    

## Governance Relationships

- [[Authority Leakage]]
    
- [[Cross-Domain Mutation]]
    
- [[Mega-Spec Drift]]
    

---

# 🏛️ AUTHORITY BOUNDARIES

OverlayGrammar governs:

- overlay projection semantics
    
- telemetry visibility grammar
    
- continuity-aware reduction behavior
    
- symbolic observability presentation
    
- overlay density interpretation
    
- atmospheric instrumentation framing
    

OverlayGrammar does NOT govern:

- runtime coordinates
    
- vessel continuity state
    
- pacing authority
    
- camera vectors
    
- atmospheric simulation
    
- world truth
    
- scheduler authority
    
- renderer shaders
    

Signal prioritization is strictly:

```text
read-only interpretation of upstream-resolved priority state
```

OverlayGrammar MUST NEVER:

- determine continuity importance itself
    
- fabricate pacing state
    
- compute world authority
    
- mutate runtime truth
    

---

# 🌊 CONTINUITY ROLE

OverlayGrammar participates in continuity by:

- exposing observability state
    
- reducing visual density during dormancy
    
- preserving continuity readability
    
- maintaining atmospheric pacing
    
- supporting low-intensity environmental broadcasting
    

Overlay reduction behavior is lifecycle-coupled.

Primary trigger chain:

```text
Runtime Gate Transition
→ Continuity State Change
→ Overlay Reduction Evaluation
→ Symbolic Subtraction Execution
```

Atmospheric conditions are secondary modifiers.

Atmosphere may soften or influence:

- opacity
    
- glow strength
    
- density softness
    
- projection readability
    

Atmosphere MUST NOT independently trigger:

- continuity reduction
    
- dormancy interpretation
    
- overlay suppression authority
    

---

# 🧭 INTERPRETATION SEPARATION

OverlayGrammar exists entirely within the interpretation layer.

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

Overlay systems observe:

- continuity truth
    
- runtime truth
    
- observability state
    
- atmospheric state
    

Overlay systems MUST NEVER:

- mutate runtime state
    
- override continuity authority
    
- fabricate vessel state
    
- create pacing state
    
- redefine continuity hierarchy
    

OverlayGrammar interprets:

```text
world continuity visibility
```

NOT:

```text
world simulation authority
```

---

# 🌫️ SYMBOLIC SUBTRACTION DOCTRINE

Symbolic subtraction is a continuity-preservation mechanism.

Purpose:

- preserve readability
    
- preserve atmosphere
    
- reduce telemetry fatigue
    
- maintain environmental calm
    
- support low-density continuity broadcasting
    

Symbolic subtraction is primarily triggered by:

- dormancy transitions
    
- continuity reduction states
    
- observability degradation states
    

Atmospheric modifiers may influence:

- fade softness
    
- opacity weighting
    
- glow persistence
    
- reduction pacing
    

But atmosphere alone MUST NOT:

- initiate subtraction
    
- suppress runtime truth
    
- remove continuity participants
    

---

# 🌃 LOW-LIGHT OBSERVABILITY

Low-Light Observability defines readability constraints for nocturnal or low-visibility continuity conditions.

This section governs:

- readability preservation
    
- contrast hierarchy
    
- sparse continuity exposure
    
- nighttime signal survivability
    

This section does NOT govern:

- visual art direction
    
- shader implementation
    
- renderer styling
    
- post-processing systems
    

Overlay behavior should preserve:

- signal legibility
    
- environmental restraint
    
- continuity calm
    
- sparse visual hierarchy
    

---

# 📡 OBSERVABILITY TIERS

Observability tiers define interpretation weighting rules.

OverlayGrammar does NOT compute weighting authority itself.

Weighting inputs MUST originate from upstream systems.

Allowed upstream sources include:

- ContinuityStateRegistry
    
- CameraObservabilityState
    
- BroadcastAttentionRuntime
    
- TransitionRuntime
    

OverlayGrammar may interpret:

- resolved continuity weighting
    
- observability priority state
    
- camera attention weighting
    
- atmospheric visibility state
    

OverlayGrammar MUST NEVER:

- determine narrative importance
    
- create viewer attention state
    
- compute pacing significance
    
- override runtime hierarchy
    

---

# 📦 DATA MODEL

```ts
export type OverlayProjectionRecord = {
  id: string
  entityId: string
  continuityAlpha: number
  observabilityWeight: number
  projectionOpacity: number
  projectionScale: number
  reductionState: 'active' | 'reduced' | 'suppressed'
  reductionFactor: number
  sourceAuthority:
    | 'AISRuntime'
    | 'ContinuityStateRegistry'
    | 'CameraObservabilityState'
    | 'WorldAtmosphereRuntime'
}
```

OverlayProjectionRecord represents:

```text
interpretive projection state
```

NOT:

```text
simulation truth
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const MIN_OVERLAY_OPACITY = 0.08
const DORMANT_REDUCTION_ALPHA = 0.35
const MAX_OVERLAY_DENSITY = 0.75
const LOW_LIGHT_GLOW_LIMIT = 0.4
```

Constants are:

- implementation baselines
    
- tunable observability infrastructure
    

NOT:

- immutable doctrine
    

---

# 🔧 CORE FUNCTIONS

```ts
function evaluateOverlayReduction() {}
function projectOverlayState() {}
function applySymbolicSubtraction() {}
function resolveOverlayVisibility() {}
```

Overlay functions MUST:

- remain interpretation-only
    
- preserve authority separation
    
- avoid runtime mutation
    
- remain lifecycle-aware
    

---

# 🔄 EXECUTION FLOW

```text
Runtime State Resolution
→ Continuity State Propagation
→ Camera Observability Resolution
→ Overlay Visibility Evaluation
→ Symbolic Subtraction Pass
→ Overlay Projection State Output
→ Renderer Observation
```

OverlayGrammar is:

```text
a downstream interpretation participant
```

NOT:

```text
an orchestration authority
```

---

# 🛰️ OBSERVABILITY IMPACT

OverlayGrammar affects:

- continuity readability
    
- atmospheric pacing
    
- nighttime observability
    
- symbolic continuity density
    
- environmental calm
    

OverlayGrammar supports:

- sparse signal persistence
    
- low-fatigue observation
    
- broadcast continuity
    
- infrastructural atmosphere
    

OverlayGrammar does NOT:

- control renderer styling
    
- sequence transitions
    
- drive camera motion
    
- define cinematic choreography
    

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- AISRuntime
    
- ContinuityStateRegistry
    
- CameraObservabilityState
    
- WorldAtmosphereRuntime
    

## Writes To

- OverlayProjectionState
    

## Observed By

- MarineRenderer
    
- BroadcastSurfaceRenderer
    

## Forbidden Mutations

- runtime coordinates
    
- continuity cadence
    
- vessel state
    
- camera vectors
    
- atmospheric truth
    
- scheduler authority
    

---

# 🎼 ORCHESTRATION NOTES

OverlayGrammar does NOT orchestrate transitions.

OverlayGrammar participates passively within:

- continuity propagation
    
- observability reduction
    
- atmospheric blending
    
- overlay projection sequencing
    

Transition orchestration remains owned by:

- [[Transition Runtime]]
    

Camera pacing authority remains owned by:

- [[Observability Camera]]
    

---

# 🧪 VALIDATION CHECKLIST

-  Runtime truth remains deterministic
    
-  Overlay layer remains interpretation-only
    
-  Symbolic subtraction remains lifecycle-coupled
    
-  No pacing authority exists inside overlays
    
-  No renderer mutation leaks into runtime
    
-  Multi-surface compatibility remains preserved
    
-  OverlayProjectionState remains interpretation-only
    
-  Semantic topology links remain coherent
    
-  Vocabulary aligns with canonical doctrine
    

---

# 🚫 NON-GOALS

This spec does NOT define:

- renderer shaders
    
- overlay art direction
    
- cinematic scripting
    
- gameplay overlays
    
- UI framework systems
    
- narrative priority systems
    
- simulation authority
    
- atmosphere generation
    

---

# ⏸️ DEFERRED SYSTEMS

Deferred systems include:

- OverlayArtDirection
    
- OverlaySurfaceProfiles
    
- BroadcastAttentionRuntime
    
- OrbitalObservabilitySystems
    
- AircraftOverlayGrammar
    
- PlanetaryObservabilityInfrastructure
    

Future integration notes:

- BroadcastAttentionRuntime is intentionally deferred and currently excluded from active authority reads.
    
- OverlaySurfaceProfiles is intentionally deferred and not yet an active observer of OverlayProjectionState.
    
- WorldAtmosphereRuntime is acknowledged as a future upstream atmospheric provider and may eventually require its own constitutional spec.
    

These systems are acknowledged but intentionally non-governed here.

---

# 📚 CANONICAL REFERENCES

- [[README]]
    
- [[Contract Governance]]
    
- [[Continuity Doctrine]]
    
- [[Surface Channel Doctrine]]
    
- [[AISRuntime]]
    
- [[MarineRenderer]]
    
- [[Transition Runtime]]
    
- [[Observability Camera]]
    

---

# 🕸 GRAPH INTENT

This spec functions as:

- an interpretation-layer governance node
    
- a continuity observability bridge
    
- a symbolic subtraction infrastructure node
    
- an atmospheric readability support layer
    

This spec should remain:

- lightweight
    
- interpretation-focused
    
- continuity-aware
    
- authority-bounded
    

---

# 💬 IMPLEMENTATION NOTES

Promotion to v1.1.0 integrates:

- reviewer governance refinements
    
- lifecycle coupling clarification
    
- authority hardening
    
- symbolic subtraction trigger clarification
    
- OverlayProjectionState formalization
    
- orchestration separation reinforcement
    
- multi-surface compatibility acknowledgment
    

This promotion does NOT:

- alter runtime authority ownership
    
- introduce gameplay semantics
    
- create overlay orchestration authority
    
- change continuity doctrine