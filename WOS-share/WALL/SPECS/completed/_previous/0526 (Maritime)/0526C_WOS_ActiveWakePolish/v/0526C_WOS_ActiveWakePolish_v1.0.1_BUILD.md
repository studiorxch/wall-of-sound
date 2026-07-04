---
layout: spec
title: "WOS Active Wake Polish"
date: 2026-05-27
doc_id: "0526C_WOS_ActiveWakePolish_v1.0.1"
version: "1.0.1"
project: "Wall of Sound"
system: "WOS"
domain: "presentation"
component: "ActiveWakePolish"
type: "runtime-presentation-spec"
status: "approved"
priority: "high"
risk: "low"
classification: "presentation-layer"
summary: "Build-ready active vessel wake polish specification. Refines live, vessel-attached wake rendering into soft, stateless, class-distinguishable gradient marks while keeping MaritimeWaterMemory disabled by default."
stage: "[BUILD]"
freeze_decision: "GO"
build_scope: "active-vessel-wake-softening-class-distinguishable-motion-polish"
depends_on:
  - "0526A_WOS_MaritimeWakeSignature_v1.0.0"
  - "0526B_WOS_MaritimeWaterMemory_v1.0.1"
  - "0525F_WOS_ProceduralVesselTopology_v1.0.1"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
supersedes:
  - "0526C_WOS_ActiveWakePolish_v1.0.0"
owner: "StudioRich / WOS"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Implement stateless, active, vessel-local wake polish. Do not revive accumulated WaterMemory rendering.

# 0526C_WOS_ActiveWakePolish_v1.0.1_BUILD

## Canonical Artifact Rule

This is the full standalone BUILD artifact for `0526C_WOS_ActiveWakePolish_v1.0.1`.

This version resolves v1.0.0 review blockers:

- declares upstream dependencies
- completes all profile fields
- separates wake archetype ownership from visual polish ownership
- defines authority relationships
- defines deterministic seed source
- narrows class readability to atmospheric observability
- keeps MaritimeWaterMemory disabled by default

---

# 1. Purpose

Define the build-ready active wake polish layer for WOS maritime rendering.

This spec refines active wakes into:

- soft gradient marks
- class-distinguishable vessel-local motion traces
- low-fatigue maritime presentation
- zoom-aware visibility
- deterministic non-repeating variation
- no accumulated screen-space water memory
- no simulation truth mutation

The core correction:

```text
Active wakes should carry maritime motion readability.

WaterMemory should remain experimental and disabled by default.
```

---

# 2. Core Doctrine

```text
Active wakes communicate live motion.
They do not simulate water.
```

```text
Wake polish improves perception.
It may not fabricate runtime truth.
```

```text
Class distinction exists for atmospheric observability only.
It is not tactical gameplay identification.
```

---

# 3. Ownership Split

## MaritimeWakeSignature Owns

- wake archetype selection
- canonical wake modes
- class-to-mode assignment
- base wake profile registry
- public wake draw entrypoint

## ActiveWakePolish Owns

- visual softness
- alpha shaping
- gradient tapering
- line width clamping
- zoom visibility thresholds
- deterministic visual jitter
- class-specific visual polish parameters

## Runtime Truth Owns

- vessel identity
- vessel position
- vessel heading
- vessel speed
- vessel class truth
- continuity state

Canonical rule:

```text
Wake modes are interpretation-layer presentation archetypes.
They are not runtime behavioral states.
```

---

# 4. Authority Relationships

## Reads From

- AISRuntime vessel projection state
- MaritimeWakeSignature wake archetype
- MaritimeStyleRegistry palette values
- VisibilityClassRuntime visibility state
- renderer zoom / observability input
- vessel topology scale

## Writes To

```text
none
```

ActiveWakePolish draws to the current canvas context only.

It does not write runtime state.

## Observed By

- MaritimeOccupancyRenderer
- debug tooling
- visual QA workflows

## Forbidden Mutations

- AIS state
- vessel coordinates
- vessel heading truth
- vessel speed truth
- vessel continuity
- vessel taxonomy
- visibility class
- population tier
- camera framing
- renderer orchestration
- map projection
- route topology
- WaterMemory state

---

# 5. WaterMemory Policy

Runtime default:

```ts
SBE.runtimeFlags.showMaritimeWaterMemory = false;
```

ActiveWakePolish must look correct when WaterMemory is fully disabled.

ActiveWakePolish must not depend on WaterMemory.

WaterMemory may remain available only for explicit debug experiments.

---

# 6. Deterministic Variation Rule

All wake variation seeds must derive from stable vessel identity.

Preferred seed source:

```text
vessel.mmsi
→ vessel.id
→ vessel.uid
→ deterministic class fallback
```

Forbidden:

- Math.random()
- frame-time randomness
- Date.now() seeded variation
- non-deterministic jitter
- variation that implies false maneuvering

---

# 7. Wake Mode Contract

Valid wake modes, inherited from 0526A:

```ts
type ActiveWakePolishMode =
  | "LINEAR"
  | "SPLIT_V"
  | "TURBULENT"
  | "DRIFT"
  | "DISCIPLINED";
```

If 0526A changes wake mode names, this spec must be updated before implementation.

---

# 8. Data Contracts

```ts
type ActiveWakeClassKey =
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
  | "unknown"
  | "default";

type ActiveWakePolishProfile = {
  readonly classKey: ActiveWakeClassKey;
  readonly mode: ActiveWakePolishMode;
  readonly lengthScale: number;
  readonly widthScale: number;
  readonly alphaScale: number;
  readonly nearSternAlpha: number;
  readonly farFadeAlpha: number;
  readonly lineSoftness: number;
  readonly glowStrength: number;
  readonly turbulenceCount: number;
  readonly turbulenceSpread: number;
  readonly turbulenceLengthScale: number;
  readonly maxWakeAlpha: number;
  readonly maxGlowAlpha: number;
  readonly minVisibleZoom: number;
  readonly fullVisibleZoom: number;
};
```

---

# 9. System Constants

```ts
const ACTIVE_WAKE_POLISH_VERSION = "1.0.1";
const DEFAULT_WAKE_MIN_ZOOM = 11.6;
const DEFAULT_WAKE_FULL_ZOOM = 13.0;
const MAX_ACTIVE_WAKE_ALPHA = 0.48;
const MAX_ACTIVE_WAKE_GLOW_ALPHA = 0.16;
const MAX_WAKE_LINE_WIDTH_PX = 5.5;
const MIN_WAKE_LINE_WIDTH_PX = 0.75;
const MAX_TURBULENCE_FILAMENTS = 5;
const WAKE_DEBUG_DEFAULT = false;
```

---

# 10. Complete Profile Table

```ts
const ACTIVE_WAKE_POLISH_PROFILES: Record<ActiveWakeClassKey, ActiveWakePolishProfile> = {
  cargo:        { classKey: "cargo", mode: "LINEAR", lengthScale: 1.45, widthScale: 0.75, alphaScale: 0.42, nearSternAlpha: 0.15, farFadeAlpha: 0.0, lineSoftness: 2.5, glowStrength: 0.06, turbulenceCount: 0, turbulenceSpread: 0, turbulenceLengthScale: 0, maxWakeAlpha: 0.30, maxGlowAlpha: 0.04, minVisibleZoom: 11.6, fullVisibleZoom: 13.0 },
  tanker:       { classKey: "tanker", mode: "LINEAR", lengthScale: 1.65, widthScale: 1.10, alphaScale: 0.32, nearSternAlpha: 0.10, farFadeAlpha: 0.0, lineSoftness: 4.0, glowStrength: 0.04, turbulenceCount: 0, turbulenceSpread: 0, turbulenceLengthScale: 0, maxWakeAlpha: 0.24, maxGlowAlpha: 0.02, minVisibleZoom: 11.6, fullVisibleZoom: 13.0 },
  ferry:        { classKey: "ferry", mode: "SPLIT_V", lengthScale: 1.05, widthScale: 1.05, alphaScale: 0.62, nearSternAlpha: 0.40, farFadeAlpha: 0.0, lineSoftness: 1.5, glowStrength: 0.10, turbulenceCount: 0, turbulenceSpread: 0, turbulenceLengthScale: 0, maxWakeAlpha: 0.42, maxGlowAlpha: 0.08, minVisibleZoom: 11.6, fullVisibleZoom: 13.0 },
  tug:          { classKey: "tug", mode: "TURBULENT", lengthScale: 0.55, widthScale: 1.10, alphaScale: 0.58, nearSternAlpha: 0.35, farFadeAlpha: 0.0, lineSoftness: 3.5, glowStrength: 0.08, turbulenceCount: 3, turbulenceSpread: 1.20, turbulenceLengthScale: 0.60, maxWakeAlpha: 0.38, maxGlowAlpha: 0.06, minVisibleZoom: 11.8, fullVisibleZoom: 13.2 },
  recreational: { classKey: "recreational", mode: "SPLIT_V", lengthScale: 0.85, widthScale: 0.65, alphaScale: 0.68, nearSternAlpha: 0.45, farFadeAlpha: 0.0, lineSoftness: 1.0, glowStrength: 0.10, turbulenceCount: 0, turbulenceSpread: 0, turbulenceLengthScale: 0, maxWakeAlpha: 0.44, maxGlowAlpha: 0.06, minVisibleZoom: 12.0, fullVisibleZoom: 13.5 },
  fishing:      { classKey: "fishing", mode: "DRIFT", lengthScale: 0.90, widthScale: 0.80, alphaScale: 0.42, nearSternAlpha: 0.20, farFadeAlpha: 0.0, lineSoftness: 2.0, glowStrength: 0.05, turbulenceCount: 1, turbulenceSpread: 0.80, turbulenceLengthScale: 0.80, maxWakeAlpha: 0.30, maxGlowAlpha: 0.03, minVisibleZoom: 11.8, fullVisibleZoom: 13.0 },
  passenger:    { classKey: "passenger", mode: "LINEAR", lengthScale: 1.35, widthScale: 0.90, alphaScale: 0.36, nearSternAlpha: 0.15, farFadeAlpha: 0.0, lineSoftness: 2.0, glowStrength: 0.06, turbulenceCount: 0, turbulenceSpread: 0, turbulenceLengthScale: 0, maxWakeAlpha: 0.28, maxGlowAlpha: 0.04, minVisibleZoom: 11.6, fullVisibleZoom: 13.0 },
  military:     { classKey: "military", mode: "DISCIPLINED", lengthScale: 0.70, widthScale: 0.50, alphaScale: 0.18, nearSternAlpha: 0.05, farFadeAlpha: 0.0, lineSoftness: 1.0, glowStrength: 0.00, turbulenceCount: 0, turbulenceSpread: 0, turbulenceLengthScale: 0, maxWakeAlpha: 0.12, maxGlowAlpha: 0.00, minVisibleZoom: 12.0, fullVisibleZoom: 13.5 },
  industrial:   { classKey: "industrial", mode: "TURBULENT", lengthScale: 0.65, widthScale: 1.20, alphaScale: 0.46, nearSternAlpha: 0.25, farFadeAlpha: 0.0, lineSoftness: 4.5, glowStrength: 0.05, turbulenceCount: 3, turbulenceSpread: 1.50, turbulenceLengthScale: 0.50, maxWakeAlpha: 0.34, maxGlowAlpha: 0.04, minVisibleZoom: 11.8, fullVisibleZoom: 13.2 },
  service:      { classKey: "service", mode: "SPLIT_V", lengthScale: 0.90, widthScale: 0.80, alphaScale: 0.46, nearSternAlpha: 0.25, farFadeAlpha: 0.0, lineSoftness: 2.0, glowStrength: 0.06, turbulenceCount: 0, turbulenceSpread: 0, turbulenceLengthScale: 0, maxWakeAlpha: 0.34, maxGlowAlpha: 0.04, minVisibleZoom: 11.8, fullVisibleZoom: 13.0 },
  unknown:      { classKey: "unknown", mode: "LINEAR", lengthScale: 0.90, widthScale: 0.75, alphaScale: 0.30, nearSternAlpha: 0.12, farFadeAlpha: 0.0, lineSoftness: 2.0, glowStrength: 0.03, turbulenceCount: 0, turbulenceSpread: 0, turbulenceLengthScale: 0, maxWakeAlpha: 0.22, maxGlowAlpha: 0.02, minVisibleZoom: 11.8, fullVisibleZoom: 13.0 },
  default:      { classKey: "default", mode: "LINEAR", lengthScale: 1.00, widthScale: 1.00, alphaScale: 0.40, nearSternAlpha: 0.20, farFadeAlpha: 0.0, lineSoftness: 2.0, glowStrength: 0.05, turbulenceCount: 0, turbulenceSpread: 0, turbulenceLengthScale: 0, maxWakeAlpha: 0.30, maxGlowAlpha: 0.04, minVisibleZoom: 11.6, fullVisibleZoom: 13.0 },
};
```

---

# 11. Visual Rules

All active wakes must use multi-stop alpha gradients.

Recommended stop pattern:

```text
0.00 → transparent
0.12 → low alpha
0.35 → peak alpha
0.72 → low alpha
1.00 → transparent
```

Every active wake line must use:

```ts
ctx.lineCap = "round";
ctx.lineJoin = "round";
```

Forbidden:

- square caps
- hard rectangles
- debug boxes
- tiled marks
- cell boundaries
- persistent ghost residue

---

# 12. LOD Rules

## Far Observability

At low observability:

```text
no active wake
```

or:

```text
single faint direction tick
```

No turbulence. No glow. No split foam.

## Mid Observability

Allow the primary class wake archetype:

- cargo: faint center line
- ferry: clean split-V
- tug: short disturbance
- recreational: tight V
- fishing: asymmetric drift

## Close Observability

Allow:

- subtle glow
- refined taper
- class-specific line width
- limited turbulence

Still forbidden:

- accumulated memory
- debug labels
- large repeated patterns

---

# 13. Turbulence Budget

Turbulence is optional presentation detail.

It is not continuity-critical rendering.

Rules:

- maximum 5 filaments per vessel
- reduce turbulence under population pressure
- skip turbulence under low observability
- never allow turbulence to dominate vessel silhouette
- never imply emergency or operational state

---

# 14. Military Language Correction

Use:

```text
minimal visible disturbance
```

Avoid:

```text
restrained discipline
```

Military wake presentation must not imply threat, stealth, or tactical state.

---

# 15. Public Debug API

Debug namespace:

```ts
_wos.wakeSignature
```

Required methods:

```ts
_wos.wakeSignature.profile("cargo")
_wos.wakeSignature.preview("ferry")
_wos.wakeSignature.compare("cargo", "tug")
_wos.wakeSignature.setDebug(true)
_wos.wakeSignature.constants()
```

Debug constraints:

```text
Debug APIs are observational tooling only.
They must not expose mutable live renderer authority.
```

Wake profiles must be immutable during runtime execution.

---

# 16. Implementation Scope

Patch:

```text
wall/systems/presentation/maritimeWakeSignature.js
```

Optional new file:

```text
wall/systems/presentation/maritimeWakeSignatureDebug.js
```

Do not patch WaterMemory except to preserve:

```ts
SBE.runtimeFlags.showMaritimeWaterMemory = false;
```

Do not create new field systems.

Do not create accumulated water state.

---

# 17. Validation Checklist

- [ ] WaterMemory remains disabled by default
- [ ] active wakes render without WaterMemory
- [ ] wake modes match 0526A
- [ ] full profile table exists for all classes
- [ ] unknown and default profiles exist
- [ ] deterministic seeds derive from stable vessel identity
- [ ] no frame-time randomness
- [ ] far observability suppresses wake clutter
- [ ] mid observability shows class-distinguishable wake modes
- [ ] close observability improves wake character without noise
- [ ] cargo/tanker wakes are long and faint
- [ ] ferry wake is clean split-V
- [ ] tug wake is short and turbulent
- [ ] recreational wake is tight and lively
- [ ] fishing wake is asymmetric but subtle
- [ ] military wake is minimal visible disturbance
- [ ] no rectangular/cellular patterns
- [ ] no persistent ghost trails
- [ ] no runtime truth mutation
- [ ] no AIS state mutation
- [ ] no camera mutation
- [ ] debug APIs are observational only

---

# 18. Non-Goals

This spec does NOT implement:

- WaterMemory resurrection
- fluid simulation
- accumulated wake fields
- geographic water-space memory
- shoreline interaction
- tide modeling
- particle systems
- map-wide foam overlays
- 2.5D wake extrusion
- VisualLab export
- active wake audio-reactivity
- tactical gameplay identification

---

# 19. Final Status

```text
0526C_WOS_ActiveWakePolish_v1.0.1
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
active-vessel-wake-softening-class-distinguishable-motion-polish
```

Build Scope:

```text
stateless active wake gradients, complete class profile table, deterministic variation, wake LOD suppression, WaterMemory isolation, debug profile inspection
```

Final instruction:

```text
Proceed to implementation.
```

---

# Implementation Guide

- Patch `wall/systems/presentation/maritimeWakeSignature.js`; optionally add `wall/systems/presentation/maritimeWakeSignatureDebug.js`.
- Keep `SBE.runtimeFlags.showMaritimeWaterMemory = false` and do not create accumulated wake fields.
- Expect softer active wakes, no ghost trails, and clearer vessel-local motion marks.
