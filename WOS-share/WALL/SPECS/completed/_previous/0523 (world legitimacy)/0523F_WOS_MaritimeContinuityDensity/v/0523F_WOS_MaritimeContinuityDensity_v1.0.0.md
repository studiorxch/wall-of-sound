---
title: "WOS Maritime Continuity Density"
filename: "0523F_WOS_MaritimeContinuityDensity_v1.0.0.md"
version: "1.0.0"
date: "2026-05-24"
system: "WOS"
module: "Maritime Continuity Density"
type: "runtime-interpretation-spec"

status: "[REVIEW]"
stage: "[REVIEW]"
freeze_decision: "REVIEW"

build_scope: "none"
owner: "StudioRich / WOS"

depends_on:
  - "0522O_WOS_MaritimeMotionAuthority_v1.0.0"
  - "0522P_WOS_AISRuntimeContinuity_v1.0.0"
  - "0522Q_WOS_MaritimeContinuityDoctrine_v1.0.0"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523C_WOS_MaritimeSpawnEcology_v1.2.1"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.0"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523R_WOS_InfrastructureRegistry_v1.2.2"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Architecture + governance review before build.

---

# 0523F_WOS_MaritimeContinuityDensity_v1.0.0

## Purpose

Define how WOS evaluates maritime continuity density pressure without mutating AIS truth, vessel lifecycle, vessel identity, population tier, spawn ecology, wake authority, atmospheric readability, renderer state, or camera behavior.

This spec governs:

- continuity density interpretation
- harbor occupancy pressure
- vessel-density pressure
- wake-density pressure
- zone-density pressure
- continuity-load scoring
- advisory density descriptors
- density telemetry
- downstream readability hints

This spec does NOT govern:

- AIS ingestion
- AIS truth
- vessel existence
- vessel lifecycle state
- vessel motion
- vessel identity class
- population tier assignment
- spawn creation
- wake segment creation
- wake segment eviction
- atmospheric visibility class
- renderer drawing
- camera targeting
- gameplay pacing
- audio generation

Core doctrine:

```text
ContinuityDensity may describe pressure.
ContinuityDensity may never resolve pressure by mutating truth.
```

---

# 1. Core Principle

MaritimeContinuityDensity is a deterministic interpretation layer.

It observes runtime state and computes density pressure descriptors.

It does not own runtime truth.

```text
AISRuntime owns vessel truth.
WakeAuthority owns wake truth.
PopulationHierarchy owns population tiers.
AtmosphericReadability owns readability.
ContinuityDensity owns density interpretation.
Renderer owns presentation.
```

ContinuityDensity may say:

```text
this harbor sector is visually dense
```

ContinuityDensity may NOT say:

```text
delete vessels until density is acceptable
```

---

# 2. Authority Boundaries

## ContinuityDensity Owns

- density scores
- density pressure descriptors
- sector density summaries
- wake-density summaries
- continuity-load scores
- diagnostic density telemetry
- advisory clutterPressure output
- advisory continuityLoad output

## ContinuityDensity May Observe

- AIS vessel count
- AIS vessel lifecycle state
- vessel population tier
- vessel class
- vessel provenance
- vessel zone
- vessel distance grouping
- wake segment count
- wake provenance
- wake age ratio
- atmospheric readability output
- spawn ecology zone records
- population budget state
- simulation time

## ContinuityDensity May Not Mutate

- AIS state
- vessel position
- vessel heading
- vessel speed
- vessel lifecycle state
- vessel class
- population tier
- wake segment registry
- wake lifetime
- spawn ecology state
- atmospheric readability result
- renderer buffers
- camera state

---

# 3. Density Is Not Runtime Authority

Density pressure may be high.

That does not authorize this module to:

- delete vessels
- demote vessels
- hide vessels directly
- suppress AIS packets
- reduce wake lifetime
- block spawn candidates
- promote camera targets
- alter renderer draw lists

Density output is advisory.

Any downstream consumer must preserve its own authority boundary.

---

# 4. Relationship To Prior Specs

## 4.1 AISRuntime

AISRuntime owns vessel truth.

ContinuityDensity may read active/dormant/protected counts.

ContinuityDensity may not alter AIS lifecycle.

## 4.2 MaritimePopulationHierarchy

PopulationHierarchy owns tier assignment.

ContinuityDensity may read tier distribution.

ContinuityDensity may not assign tiers.

## 4.3 MaritimeSpawnEcology

SpawnEcology owns spawn candidate pressure and synthetic generation requests.

ContinuityDensity may provide advisory density summaries.

ContinuityDensity may not accept/reject spawn candidates.

## 4.4 MaritimeWakeAuthority

WakeAuthority owns wake memory and wake decay.

ContinuityDensity may read wake counts and wake provenance.

ContinuityDensity may not evict, shorten, extend, or create wake segments.

## 4.5 AtmosphericReadability

AtmosphericReadability owns visibility interpretation.

ContinuityDensity may provide `clutterPressure` as an input.

AtmosphericReadability may consume that pressure.

AtmosphericReadability may not mutate ContinuityDensity state.

## 4.6 MarineRenderer

Renderer owns presentation.

ContinuityDensity may provide advisory density descriptors.

Renderer may consume those descriptors.

Renderer may not treat density pressure as runtime truth.

---

# 5. Output Contract

```ts
type MaritimeContinuityDensityResult = {
  simulationTimeMs: number;

  globalDensityScore: number;      // 0.0 → 1.0
  globalContinuityLoad: number;    // 0.0 → 1.0
  globalClutterPressure: number;   // 0.0 → 1.0

  vesselDensityScore: number;      // 0.0 → 1.0
  wakeDensityScore: number;        // 0.0 → 1.0
  syntheticPressure: number;       // 0.0 → 1.0
  aisPressure: number;             // 0.0 → 1.0

  densityClass:
    | "SPARSE"
    | "ACTIVE"
    | "DENSE"
    | "SATURATED";

  sectors: MaritimeDensitySectorResult[];

  reasonCodes: MaritimeContinuityDensityReason[];
};
```

---

# 6. Sector Output Contract

```ts
type MaritimeDensitySectorResult = {
  sectorId: string;

  vesselCount: number;
  wakeCount: number;

  heroCount: number;
  midCount: number;
  backgroundCount: number;
  ghostCount: number;

  aisCount: number;
  syntheticCount: number;

  vesselDensityScore: number;      // 0.0 → 1.0
  wakeDensityScore: number;        // 0.0 → 1.0
  clutterPressure: number;         // 0.0 → 1.0
  continuityLoad: number;          // 0.0 → 1.0

  densityClass:
    | "SPARSE"
    | "ACTIVE"
    | "DENSE"
    | "SATURATED";
};
```

---

# 7. Reason Codes

```ts
type MaritimeContinuityDensityReason =
  | "HIGH_AIS_PRESSURE"
  | "HIGH_SYNTHETIC_PRESSURE"
  | "HIGH_WAKE_PRESSURE"
  | "HIGH_BACKGROUND_PRESSURE"
  | "HIGH_GHOST_PRESSURE"
  | "SECTOR_SATURATION"
  | "WAKE_MEMORY_DENSE"
  | "VISUAL_CLUTTER_RISK"
  | "CONTINUITY_LOAD_HIGH"
  | "DENSITY_NOMINAL";
```

Reason codes are diagnostic.

They may not trigger mutation.

---

# 8. Input Contract

```ts
type MaritimeContinuityDensityInput = {
  simulationTimeMs: number;

  sectors: MaritimeDensitySectorInput[];

  globalBudgetState: {
    maxVessels: number;
    maxWakeSegments: number;
    maxSyntheticVessels: number;
  };
};
```

---

# 9. Sector Input Contract

```ts
type MaritimeDensitySectorInput = {
  sectorId: string;

  vessels: MaritimeDensityVesselInput[];
  wakes: MaritimeDensityWakeInput[];

  budget: {
    maxVessels: number;
    maxWakeSegments: number;
    maxSyntheticVessels: number;
  };
};
```

---

# 10. Vessel Input Contract

```ts
type MaritimeDensityVesselInput = {
  vesselId: string;

  vesselClass: VesselClass;

  provenance:
    | "AIS_VESSEL"
    | "SYNTHETIC_ECOLOGY";

  populationTier:
    | "HERO"
    | "MID"
    | "BACKGROUND"
    | "GHOST";

  lifecycleState: string;

  continuityAlpha: number;     // 0.0 → 1.0
  signalConfidence: number;    // 0.0 → 1.0
};
```

---

# 11. Wake Input Contract

```ts
type MaritimeDensityWakeInput = {
  wakeId: string;

  vesselId: string;

  provenance:
    | "AIS_VESSEL"
    | "SYNTHETIC_ECOLOGY";

  ageRatio: number;       // 0.0 fresh → 1.0 expired
  intensityRaw: number;   // 0.0 → 1.0
};
```

---

# 12. Density Score Model

Canonical sector model:

```text
sectorDensityScore =
vesselDensityScore × 0.45
+ wakeDensityScore × 0.25
+ syntheticPressure × 0.15
+ continuityLoad × 0.15
```

Output is clamped:

```text
0.0 → 1.0
```

This score is interpretive only.

It may not mutate:

- AIS lifecycle
- population tier
- wake lifetime
- spawn ecology
- renderer visibility
- atmospheric visibility

---

# 13. Vessel Density Score

```ts
function resolveVesselDensityScore(
  vesselCount: number,
  maxVessels: number
): number {
  if (maxVessels <= 0) return 0;
  return clamp(vesselCount / maxVessels, 0.0, 1.0);
}
```

---

# 14. Wake Density Score

```ts
function resolveWakeDensityScore(
  wakeCount: number,
  maxWakeSegments: number
): number {
  if (maxWakeSegments <= 0) return 0;
  return clamp(wakeCount / maxWakeSegments, 0.0, 1.0);
}
```

---

# 15. Synthetic Pressure

```ts
function resolveSyntheticPressure(
  syntheticCount: number,
  maxSyntheticVessels: number
): number {
  if (maxSyntheticVessels <= 0) return 0;
  return clamp(syntheticCount / maxSyntheticVessels, 0.0, 1.0);
}
```

SyntheticPressure is advisory.

It may not suppress synthetic vessels directly.

SpawnEcology may observe this later only if a separate authority spec grants that relationship.

---

# 16. AIS Pressure

```ts
function resolveAISPressure(
  aisCount: number,
  maxVessels: number
): number {
  if (maxVessels <= 0) return 0;
  return clamp(aisCount / maxVessels, 0.0, 1.0);
}
```

AISPressure is diagnostic.

It may not suppress AIS vessels.

---

# 17. Continuity Load

Continuity load estimates how much continuity memory is being carried by the runtime.

```text
continuityLoad =
average(1.0 - signalConfidence)
× 0.45
+ average(continuityAlpha)
× 0.35
+ staleOrLowConfidenceRatio
× 0.20
```

Clamped:

```text
0.0 → 1.0
```

Interpretation:

```text
0.0 = low continuity burden
1.0 = high continuity burden
```

ContinuityLoad is advisory.

It may not alter runtime continuity state.

---

# 18. Clutter Pressure

Clutter pressure is the primary output consumed by AtmosphericReadability.

```text
clutterPressure =
sectorDensityScore × 0.55
+ wakeDensityScore × 0.25
+ backgroundGhostRatio × 0.20
```

Clamped:

```text
0.0 → 1.0
```

This value may be provided to `MaritimeAtmosphericContext.clutterPressure`.

It may not directly hide vessels.

AtmosphericReadability remains responsible for visibility interpretation.

---

# 19. Background / Ghost Ratio

```ts
function resolveBackgroundGhostRatio(
  backgroundCount: number,
  ghostCount: number,
  vesselCount: number
): number {
  if (vesselCount <= 0) return 0;
  return clamp((backgroundCount + ghostCount) / vesselCount, 0.0, 1.0);
}
```

This helps pressure labels and readability in crowded background space.

It does not demote vessels.

---

# 20. Density Classes

```ts
function resolveDensityClass(score: number) {
  if (score >= 0.78) return "SATURATED";
  if (score >= 0.55) return "DENSE";
  if (score >= 0.25) return "ACTIVE";
  return "SPARSE";
}
```

DensityClass is descriptive.

It is not an instruction to cull, hide, or mutate.

---

# 21. AIS Supremacy Rule

AIS vessels must not be suppressed by ContinuityDensity.

High AISPressure may produce:

```text
HIGH_AIS_PRESSURE
```

but it may not produce:

- AIS eviction
- AIS lifecycle demotion
- AIS visibility deletion
- AIS priority downgrade

AIS pressure is diagnostic.

---

# 22. Synthetic Pressure Rule

SyntheticPressure may describe background density from synthetic ecology.

It may not:

- delete synthetic vessels
- block synthetic candidates
- mutate spawn intervals
- mutate spawn ecology budgets
- rewrite synthetic IDs

Any future feedback from density to SpawnEcology requires a separate spec.

---

# 23. Wake Pressure Rule

WakeDensity may describe water-memory pressure.

It may not:

- evict WakeSegments
- shorten WakeSegments
- create WakeSegments
- mutate WakeAuthority budgets
- mutate wake provenance

WakeAuthority remains the only wake memory authority.

---

# 24. Atmospheric Interface

ContinuityDensity may provide:

```ts
clutterPressure: number;
```

to AtmosphericReadability.

AtmosphericReadability may consume it for:

- label suppression
- readability reduction
- marker fallback
- silhouette fallback
- visual simplification

AtmosphericReadability may not mutate density state.

ContinuityDensity may not consume AtmosphericReadability output as runtime authority.

---

# 25. Renderer Interface

Renderer may consume:

- densityClass
- clutterPressure
- sector density summaries
- reasonCodes

Renderer may not use these values to:

- mutate draw authority
- delete vessels
- change AIS state
- change wake registry
- override AtmosphericReadability
- override PopulationHierarchy

Renderer may use density outputs only as visual context.

---

# 26. Camera Interface

ContinuityDensity grants no camera authority.

Camera systems may not treat densityClass as:

- camera target priority
- cinematic pacing trigger
- focus lock
- hero promotion
- route steering

Any future camera consumption requires a separate camera-governance spec.

---

# 27. Evaluation Cadence

ContinuityDensity should not be evaluated per vessel per frame unless necessary.

Recommended cadence:

```text
global density: every 500ms simulation time
sector density: every 500ms simulation time
debug telemetry: every 2000ms simulation time
```

Cadence must use simulation time.

Forbidden:

- `Date.now()`
- `performance.now()`
- renderer frame timing
- wall-clock scheduling

---

# 28. Determinism Requirements

ContinuityDensity must be deterministic.

Forbidden:

- `Date.now()`
- `performance.now()`
- `Math.random()`
- live DOM reads
- renderer buffer reads
- runtime mutation
- camera mutation

Allowed:

- provided simulation time
- AISRuntime read snapshots
- PopulationHierarchy read snapshots
- WakeAuthority read snapshots
- SpawnEcology zone records
- deterministic scalar math

---

# 29. Public Functions

## 29.1 resolveContinuityDensity

```ts
function resolveContinuityDensity(
  input: MaritimeContinuityDensityInput
): MaritimeContinuityDensityResult;
```

Pure.

No mutation.

---

## 29.2 resolveSectorDensity

```ts
function resolveSectorDensity(
  sector: MaritimeDensitySectorInput,
  simulationTimeMs: number
): MaritimeDensitySectorResult;
```

Pure.

No mutation.

---

## 29.3 resolveClutterPressure

```ts
function resolveClutterPressure(
  sectorResult: MaritimeDensitySectorResult
): number;
```

Pure projection of sector result.

May not diverge into a separate authority path.

---

# 30. Debug / Telemetry

```ts
type MaritimeContinuityDensityDebug = {
  evaluatedAtMs: number;

  sectorCount: number;

  globalDensityScore: number;
  globalContinuityLoad: number;
  globalClutterPressure: number;

  totalVessels: number;
  totalAISVessels: number;
  totalSyntheticVessels: number;
  totalWakes: number;

  saturatedSectors: number;
  denseSectors: number;

  averageSectorDensity: number;
};
```

Telemetry is diagnostic only.

It must not become runtime control.

---

# 31. Validation Checklist

- [ ] ContinuityDensity never mutates AIS truth
- [ ] ContinuityDensity never mutates vessel lifecycle
- [ ] ContinuityDensity never mutates vessel motion
- [ ] ContinuityDensity never mutates vessel class
- [ ] ContinuityDensity never mutates population tier
- [ ] ContinuityDensity never mutates spawn ecology
- [ ] ContinuityDensity never creates or deletes WakeSegments
- [ ] ContinuityDensity never changes wake lifetime
- [ ] ContinuityDensity never controls camera
- [ ] ContinuityDensity never writes renderer buffers
- [ ] Density pressure is descriptive, not corrective
- [ ] clutterPressure is advisory to AtmosphericReadability only
- [ ] AISPressure cannot suppress AIS vessels
- [ ] SyntheticPressure cannot suppress synthetic vessels
- [ ] WakePressure cannot mutate WakeAuthority
- [ ] All public functions are pure
- [ ] No wall-clock reads
- [ ] No random values
- [ ] No renderer buffer reads
- [ ] Evaluation cadence uses simulation time
- [ ] DensityClass remains descriptive only

---

# 32. Build Readiness

Current state:

```text
Stage: [REVIEW]
Freeze Decision: REVIEW
```

Do not build until review confirms:

- density does not become runtime correction authority
- clutterPressure does not become hidden visibility authority
- syntheticPressure does not control SpawnEcology
- wakeDensity does not control WakeAuthority
- densityClass does not control camera behavior
- renderer consumption remains visual-only
- deterministic cadence rules are sufficient

---

# 33. Suggested Runtime Files

```text
wall/
  systems/
    maritimeContinuityDensity.js
```

Optional later:

```text
wall/
  systems/
    maritimeContinuityDensityDebug.js
```

---

# 34. Canonical Artifact Rule

This is a full standalone canonical artifact.

Patch versions must not omit prior canonical structural content unless removal is explicit and justified.

This version is self-contained and reconstructable without prior versions.

---

# 35. Implementation Guide

- **Where this goes:** `docs/_specs/wos/0523F_WOS_MaritimeContinuityDensity_v1.0.0.md`
- **What to run:** review before build; then implement as a pure deterministic density interpretation module that can provide `clutterPressure` to AtmosphericReadability.
- **What to expect:** harbor occupancy, wake memory, and continuity load become measurable without density gaining runtime authority.
