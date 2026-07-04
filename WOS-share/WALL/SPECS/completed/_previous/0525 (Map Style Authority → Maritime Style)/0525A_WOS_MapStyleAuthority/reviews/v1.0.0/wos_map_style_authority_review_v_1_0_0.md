# WOS Constitutional Review Board
## Governance Review — 0525A_WOS_MapStyleAuthority_v1.0.0

Review target: `0525A_WOS_MapStyleAuthority_v1.0.0`  
Review mode: Infrastructure Governance  
Review status: REVIEW  
Freeze recommendation: Maintain REVIEW freeze until presentation authority boundaries are hardened.

Reference doctrine templates reviewed against:
- `Spec Review v1.0.1`
- `WOS_ConstitutionalSpecTemplate_v2.0.1`

---

# [Governance Audit]

## 1. Structural Strengths

The spec successfully establishes a critical architectural correction:

```text
presentation authority must become registry-owned rather than renderer-hardcoded
```

This is structurally aligned with WOS doctrine.

The following governance boundaries are explicitly and correctly reinforced:

- runtime truth separation
- interpretation-layer passivity
- atmosphere ownership isolation
- anti-GIS positioning
- anti-gameplay positioning
- orchestration non-ownership

The repeated reinforcement of:

```text
2D owns truth.
2.5D owns presentation.
```

is appropriately embedded throughout the document rather than isolated into doctrine-only sections.

This materially reduces future renderer/runtime leakage risk.

---

## 2. Hidden Authority Expansion

The spec quietly accumulates multiple presentation domains into a single authority surface.

Current scope includes:

- global map rendering
- atmospheric rendering
- maritime rendering presentation
- overlay styling
- motion interpolation presentation
- far-light behavior
- live editing infrastructure
- preset orchestration infrastructure
- symbolic readability systems

This is approaching:

```text
presentation mega-spec gravity
```

The danger is not immediate implementation failure.

The danger is:

```text
future governance ambiguity
```

Specifically:

- map styling
- maritime symbolic rendering
- overlay grammar
- atmospheric projection

are currently bundled under a single presentation authority umbrella.

These domains are related.
They are not identical.

The current document risks becoming:

```text
the de facto owner of all visual interpretation systems
```

which would violate bounded governance.

---

## 3. Recommended Governance Split

The following sections should likely become independent canonical specs once implementation stabilizes:

### A. Global Map Style Registry

Owns:

- base cartographic atmosphere
- land/water styling
- label suppression
- road visibility
- atmospheric palette baselines

This is stable presentation infrastructure.

---

### B. Maritime Interpretation Style

Owns:

- vessel symbolic rendering
- wake presentation
- far-light behavior
- maritime interpolation presentation
- maritime sprite readability

This is not merely map styling.

It is:

```text
symbolic continuity presentation
```

and has separate scalability pressure.

---

### C. Surface Preset System

Owns:

- preset loading
- override application
- presentation bundle selection
- live presentation switching

This is orchestration-adjacent infrastructure.

Keeping it embedded long-term risks orchestration leakage.

---

### D. Live Style Panel

This is tooling infrastructure.

It should not remain canonically embedded inside the same spec as runtime presentation authority.

Tooling lifecycles diverge from runtime architecture lifecycles.

---

## 4. Motion Interpolation Boundary Risk

This is the single most important governance concern in the document.

The spec currently places:

```js
movementInterpolationMs
headingSmoothing
```

inside `VesselStyle`.

This is dangerous.

Why:

Interpolation timing is not purely visual styling.

It affects:

- continuity perception
- temporal pacing
- vessel cadence interpretation
- motion semantics

This creates a hidden ambiguity:

```text
Does presentation own motion cadence perception?
```

Currently:

```text
partially yes
```

which weakens doctrinal separation.

Recommendation:

Split:

```text
visual interpolation behavior
```

from:

```text
temporal continuity policy
```

Possible correction:

```js
motionPresentation: {
  headingVisualSmoothing
  interpolationCurve
}
```

while removing:

```js
movementInterpolationMs
```

from style authority.

Temporal interpolation windows likely belong closer to continuity infrastructure or presentation runtime adapters.

Not atmospheric style registries.

This is a subtle but important leakage vector.

---

## 5. OverlayGrammar Relationship Ambiguity

The spec lists:

```text
OverlayGrammar
```

as an observer.

However:

Overlay styling authority is simultaneously defined here.

This creates potential dual ownership.

Questions currently unresolved:

- Does OverlayGrammar own semantic readability rules?
- Does MapStyleAuthority own typography behavior?
- Does OverlayGrammar resolve symbolic hierarchy?
- Or are overlays merely passive style consumers?

Current document implies both.

Recommendation:

Explicitly define:

```text
OverlayGrammar owns semantic composition.
MapStyleAuthority owns visual tuning only.
```

Without this split:

```text
overlay semantic authority drift
```

is highly likely.

---

# [Implementation Gravity Audit]

## 1. Strong Executable Direction

The spec succeeds at one critical implementation goal:

```text
de-hardcoding renderer constants
```

This is concrete.
Executable.
Operationally meaningful.

The implementation sequence is appropriately ordered.

Especially:

```text
Move ALL renderer constants into registries first
```

This is correct.

Without this migration step:

future atmosphere systems become exponentially harder to govern.

---

## 2. Registry Shape Stability

Most registry structures are implementation-safe.

Positive characteristics:

- bounded ownership
- low ambiguity
- deterministic lookup potential
- renderer-friendly serialization
- live-edit feasibility

The registries are sufficiently flat.

This is good.

Avoid deep inheritance trees.
Avoid polymorphic presentation hierarchies.

Current direction remains manageable.

---

## 3. Dangerous Semantic Mixing

The following fields mix:

- visual semantics
- continuity semantics
- atmospheric semantics

inside single structures.

Example:

```js
wakeLength
movementInterpolationMs
compactScale
```

These are not equivalent categories.

One controls symbolic projection.
One controls temporal continuity perception.
One controls framing/readability.

Implementation debt risk:

```text
future renderer adapters become semantically overloaded
```

Recommendation:

Separate:

- symbolic appearance
- temporal smoothing
- framing projection

into distinct nested structures.

Not for abstraction purity.

For future survivability.

---

## 4. Live Override Risk

The hierarchy:

```text
GLOBAL MAP STYLE
→ LAYER STYLE REGISTRIES
→ SURFACE STYLE PRESETS
→ LIVE RUNTIME OVERRIDES
```

is structurally reasonable.

However:

```text
LIVE RUNTIME OVERRIDES
```

is dangerously undefined.

Questions missing:

- Are overrides ephemeral?
- Are they persisted?
- Who owns override priority resolution?
- Can multiple systems override simultaneously?
- Does SurfaceRuntime arbitrate conflicts?

Without governance constraints:

```text
override stacking entropy
```

will emerge.

Recommendation:

At minimum define:

```text
single-writer override authority
```

or:

```text
deterministic override precedence
```

before production implementation.

---

## 5. Style Registry Scalability

The current registry strategy is viable.

However:

future preset counts + runtime overrides + live editing

can eventually create:

```text
style resolution fragmentation
```

especially if style inheritance emerges later.

Recommendation:

Avoid introducing:

- cascading inheritance
- implicit fallback chains
- renderer-local overrides
- nested preset composition

Keep resolution deterministic and shallow.

---

# [Continuity Doctrine Audit]

## 1. Atmosphere Doctrine Alignment

The document strongly preserves WOS identity.

Especially successful sections:

- Atmosphere Over Utility
- Far-Light Doctrine
- Motion Presentation Doctrine
- Tilt Doctrine

These sections reinforce:

```text
passive inhabited continuity
```

rather than:

```text
interactive tactical visualization
```

This is doctrinally coherent.

---

## 2. Far-Light Doctrine Is Architecturally Valuable

The statement:

```text
Far vessels should behave like distant harbor infrastructure
```

is not merely aesthetic.

It is:

```text
continuity pacing governance
```

This is an important distinction.

The spec correctly protects:

- subconscious observability
- environmental calmness
- continuity ambiance

from tactical UI drift.

This section should remain canonical.

---

## 3. Tilt Doctrine Still Contains Hidden Renderer Debt

The spec correctly identifies current sprite limitations.

However:

```text
pitch constraint
```

is being treated as a presentation limitation.

It is actually:

```text
projection integrity governance
```

The current wording risks future contributors interpreting tilt limitations as optional polish debt.

They are not.

They are continuity protection.

Recommendation:

Strengthen wording:

```text
Projection-invalid rendering is forbidden.
```

rather than:

```text
may constrain pitch
```

The current phrasing is too soft for a doctrine-critical constraint.

---

## 4. Atmospheric Layer Creep Risk

The spec repeatedly uses:

```text
atmosphere
```

as an umbrella term.

Over time this can absorb:

- audio mood
- camera pacing
- transition timing
- environmental storytelling
- scheduler behaviors

The current document resists this.

But future contributors may not.

Recommendation:

Explicitly define:

```text
Atmosphere in this spec means visual interpretation only.
```

This would reduce future semantic drift.

---

# [Scalability Audit]

## 1. Renderer Decoupling Improves Survivability

Moving constants into registries materially improves:

- renderer swap feasibility
- preset scalability
- tooling stability
- Surface variation support
- live tuning infrastructure

This is the correct long-term direction.

---

## 2. Registry Ownership Could Become Centralized

Current architecture risks evolving into:

```text
one registry to rule all presentation systems
```

This is dangerous.

Large unified presentation registries eventually create:

- cross-team coupling
- migration difficulty
- semantic overload
- renderer synchronization pressure
- hidden orchestration logic

Recommendation:

Preserve:

```text
multiple bounded registries
```

with explicit ownership domains.

Avoid future convergence pressure.

---

## 3. Preset Explosion Risk

Surface presets are currently harmless.

But cinematic identity systems naturally drift toward:

- preset stacking
- contextual blending
- scheduler-driven transitions
- biome-specific overrides
- dynamic atmosphere routing

This spec correctly defers those systems.

Maintain those deferrals aggressively.

Otherwise:

```text
presentation authority becomes orchestration authority
```

which would violate WOS doctrine.

---

## 4. Tooling Pressure

The live style panel will eventually become:

```text
the operational center of atmospheric iteration
```

This creates future governance risk:

Who owns persistence?
Who approves canonical presets?
Who validates doctrine compliance?
Who prevents renderer-only hacks?

Not immediately blocking.

But governance process infrastructure will eventually be required.

---

# [Canonical Vocabulary Audit]

## 1. Strong Vocabulary Stability

Strong canonical terms:

- Presentation Authority
- Passive Interpretation
- Atmospheric Projection
- Surface Identity
- Observability
- Symbolic Rendering
- Continuity-Aware

These are semantically aligned with existing WOS doctrine.

---

## 2. "Style" Is Becoming Overloaded

The word:

```text
style
```

currently refers to:

- color configuration
- interpolation behavior
- projection behavior
- symbolic readability
- overlay softness
- continuity pacing appearance

This creates future ambiguity.

Recommendation:

Reserve:

```text
style
```

for:

```text
visual interpretation parameters
```

and avoid embedding temporal semantics under style ownership.

---

## 3. "Surface" Remains Slightly Underspecified

The spec references:

```text
Surface identity
Surface presets
SurfaceRuntime
```

but does not fully define:

```text
what a Surface canonically is
```

This is survivable for now.

But long-term vocabulary drift is possible.

Not blocking.

---

# [Blocking Issues]

## BLOCKING-1 — Motion interpolation authority leakage

`movementInterpolationMs` should not exist under style authority without stronger governance separation.

This currently weakens runtime/presentation boundaries.

---

## BLOCKING-2 — Overlay semantic ownership ambiguity

Relationship between:

- OverlayGrammar
- OverlayStyle
- symbolic overlay composition

is insufficiently bounded.

Future semantic overlap is likely.

---

## BLOCKING-3 — Live override governance undefined

Override precedence and authority arbitration are currently underdefined.

This will create instability once multiple runtime systems interact.

---

# [Non-Blocking Refinements]

## REFINEMENT-1

Split tooling infrastructure from canonical runtime authority docs.

---

## REFINEMENT-2

Strengthen Tilt Doctrine wording from advisory to governance-protective.

---

## REFINEMENT-3

Narrow the meaning of "atmosphere" to visual interpretation scope.

---

## REFINEMENT-4

Prepare eventual decomposition into:

- map presentation
- maritime symbolic rendering
- preset orchestration
- tooling infrastructure

once implementation stabilizes.

---

# [Production Readiness]

## Governance Readiness

```text
Moderate
```

The core direction is correct.

The renderer de-hardcoding initiative is strongly justified.

But several authority boundaries remain insufficiently hardened for long-term scalability.

---

## Implementation Readiness

```text
High for initial registry extraction
Moderate for full presentation authority rollout
```

Renderer constant extraction can proceed safely.

Preset orchestration and override layering require additional governance definition before scale expansion.

---

## Continuity Safety

```text
Strong
```

The document successfully protects:

- passive observability
- anti-gameplay posture
- atmospheric continuity
- interpretation passivity

This is one of the stronger continuity-aligned specs so far.

---

# [Recommended Semantic Version Escalation]

Recommended outcome:

```text
Remain at v1.0.x during governance hardening
```

Do NOT escalate to:

```text
v1.1.x
```

until:

- interpolation authority is clarified
- overlay ownership is bounded
- override precedence is defined
- presentation domain decomposition strategy is acknowledged

Current spec is:

```text
architecturally promising but governance-incomplete
```

rather than fully stabilized.

---

# [Final Verdict]

## Verdict

```text
APPROVE WITH GOVERNANCE CORRECTIONS
```

The foundational direction is correct.

The spec successfully:

- protects runtime truth
- reinforces interpretation passivity
- de-hardcodes renderer authority
- preserves atmospheric doctrine
- rejects tactical visualization drift

However:

presentation authority is beginning to accumulate multiple adjacent domains into a single governance surface.

Without tighter separation:

future orchestration leakage and semantic overload are likely.

The most important immediate correction is:

```text
remove temporal continuity semantics from style authority
```

before implementation solidifies around ambiguous ownership.

---

Review completed against:
- Governance Audit
- Implementation Gravity Audit
- Continuity Doctrine Audit
- Scalability Audit
- Canonical Vocabulary Audit

