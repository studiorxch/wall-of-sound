---
title: "WOS Maritime Continuity Density"
filename: "0523F_WOS_MaritimeContinuityDensity_v1.1.0.md"
version: "1.1.0"
date: "2026-05-24"
system: "WOS"
module: "Maritime Continuity Density"
type: "runtime-interpretation-spec"

status: "[BUILD]"
stage: "[BUILD]"
freeze_decision: "GO"

build_scope: "pure-density-interpretation-only"
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
  - "0523R_WOS_InfrastructureRegistry_v1.2.3"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Safe for production implementation as deterministic density interpretation infrastructure.

---

# 1. Core Doctrine

ContinuityDensity is a passive deterministic observability layer.

It measures:
- occupancy pressure
- continuity burden
- wake accumulation
- clutter pressure
- sector saturation

It does NOT:
- mutate AIS truth
- mutate vessel lifecycle
- mutate vessel identity
- mutate spawn ecology
- mutate wake authority
- mutate renderer authority
- mutate camera authority

Canonical doctrine:

```text
ContinuityDensity may describe pressure.
ContinuityDensity may never resolve pressure by mutating truth.
```

---

# 2. Runtime Authority Boundaries

```text
AISRuntime owns vessel truth.
WakeAuthority owns wake truth.
PopulationHierarchy owns population tiers.
SpawnEcology owns synthetic ecology.
AtmosphericReadability owns visibility interpretation.
ContinuityDensity owns density interpretation.
Renderer owns presentation.
```

ContinuityDensity is read-only.

It may observe runtime state.

It may never correct runtime state.

---

# 3. Allowed Responsibilities

ContinuityDensity owns:

- density scores
- continuity load scores
- clutter pressure
- density telemetry
- sector density summaries
- density classifications
- advisory pressure outputs

ContinuityDensity may NOT:

- delete vessels
- suppress AIS
- block spawn candidates
- shorten wakes
- evict wakes
- alter renderer visibility
- alter draw lists
- alter camera targets
- alter simulation cadence

---

# 4. Input Contracts

```ts
type MaritimeContinuityDensityInput = {
  readonly simulationTimeMs: number;

  readonly sectors: readonly MaritimeDensitySectorInput[];

  readonly globalBudgetState: {
    readonly maxVessels: number;
    readonly maxWakeSegments: number;
    readonly maxSyntheticVessels: number;
  };
};
```

---

# 5. Sector Input Contracts

```ts
type MaritimeDensitySectorInput = {
  readonly sectorId: string;

  readonly vessels: readonly MaritimeDensityVesselInput[];
  readonly wakes: readonly MaritimeDensityWakeInput[];

  readonly budget: {
    readonly maxVessels: number;
    readonly maxWakeSegments: number;
    readonly maxSyntheticVessels: number;
  };
};
```

Sector budgets are descriptive scaling references only.

Exceeding a budget never authorizes:
- culling
- suppression
- wake eviction
- spawn rejection

---

# 6. Vessel Input Contracts

```ts
type VesselLifecycleState =
  | "TRACKING"
  | "COASTING"
  | "DORMANT"
  | "STALE"
  | "DEAD";

type MaritimeDensityVesselInput = {
  readonly vesselId: string;

  readonly vesselClass: string;

  readonly provenance:
    | "AIS_VESSEL"
    | "SYNTHETIC_ECOLOGY";

  readonly populationTier:
    | "HERO"
    | "MID"
    | "BACKGROUND"
    | "GHOST";

  readonly lifecycleState: VesselLifecycleState;

  readonly continuityAlpha: number;   // 0.00 → 1.00
  readonly signalConfidence: number;  // 0.00 → 1.00
};
```

---

# 7. Wake Input Contracts

```ts
type MaritimeDensityWakeInput = {
  readonly wakeId: string;

  readonly vesselId: string;

  readonly provenance:
    | "AIS_VESSEL"
    | "SYNTHETIC_ECOLOGY";

  readonly ageRatio: number;      // 0.00 fresh → 1.00 expired
  readonly intensityRaw: number;  // 0.00 → 1.00
};
```

---

# 8. Output Contracts

```ts
type MaritimeContinuityDensityResult = {
  readonly simulationTimeMs: number;

  readonly globalDensityScore: number;
  readonly globalContinuityLoad: number;
  readonly globalClutterPressure: number;

  readonly vesselDensityScore: number;
  readonly wakeDensityScore: number;
  readonly syntheticPressure: number;
  readonly aisPressure: number;

  readonly densityClass:
    | "SPARSE"
    | "ACTIVE"
    | "DENSE"
    | "SATURATED";

  readonly sectors: readonly MaritimeDensitySectorResult[];

  readonly reasonCodes:
    readonly MaritimeContinuityDensityReason[];
};
```

---

# 9. Sector Result Contracts

```ts
type MaritimeDensitySectorResult = {
  readonly sectorId: string;

  readonly vesselCount: number;
  readonly wakeCount: number;

  readonly heroCount: number;
  readonly midCount: number;
  readonly backgroundCount: number;
  readonly ghostCount: number;

  readonly aisCount: number;
  readonly syntheticCount: number;

  readonly vesselDensityScore: number;
  readonly wakeDensityScore: number;

  readonly clutterPressure: number;
  readonly continuityLoad: number;

  readonly densityClass:
    | "SPARSE"
    | "ACTIVE"
    | "DENSE"
    | "SATURATED";
};
```

---

# 10. Reason Codes

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

Reason codes are diagnostic only.

They are not runtime authority.

---

# 11. Scalar Functions

```ts
function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
```

---

# 12. Vessel Density Score

```ts
function resolveVesselDensityScore(
  vesselCount: number,
  maxVessels: number
): number {
  if (maxVessels <= 0) return 0.0;

  return clamp(
    vesselCount / maxVessels,
    0.0,
    1.0
  );
}
```

Weight justification:

```text
Vessel density is the dominant contributor to harbor occupancy pressure.
```

---

# 13. Wake Density Score

```ts
function resolveWakeDensityScore(
  wakeCount: number,
  maxWakeSegments: number
): number {
  if (maxWakeSegments <= 0) return 0.0;

  return clamp(
    wakeCount / maxWakeSegments,
    0.0,
    1.0
  );
}
```

Wake density is secondary pressure:
- wakes preserve water memory
- wakes imply motion continuity
- wakes do not equal active occupancy

---

# 14. Synthetic Pressure

```ts
function resolveSyntheticPressure(
  syntheticCount: number,
  maxSyntheticVessels: number
): number {
  if (maxSyntheticVessels <= 0) return 0.0;

  return clamp(
    syntheticCount / maxSyntheticVessels,
    0.0,
    1.0
  );
}
```

Synthetic pressure is advisory only.

It may not suppress synthetic ecology.

---

# 15. AIS Pressure

```ts
function resolveAISPressure(
  aisCount: number,
  maxVessels: number
): number {
  if (maxVessels <= 0) return 0.0;

  return clamp(
    aisCount / maxVessels,
    0.0,
    1.0
  );
}
```

AISPressure preserves AIS supremacy.

AIS vessels may never be suppressed by density pressure.

---

# 16. Stale / Low Confidence Definition

A vessel is considered stale or low-confidence if ANY:

```text
signalConfidence < 0.40
continuityAlpha < 0.50
lifecycleState == COASTING
lifecycleState == DORMANT
lifecycleState == STALE
```

Formula:

```ts
staleOrLowConfidenceRatio =
staleOrLowConfidenceVesselCount / totalVesselCount
```

This ratio measures continuity burden only.

It is not lifecycle authority.

---

# 17. Continuity Load

```ts
function calculateContinuityLoad(
  vessels: readonly MaritimeDensityVesselInput[]
): number {
  if (vessels.length <= 0) return 0.0;

  let signalBurden = 0.0;
  let alphaBurden = 0.0;
  let staleCount = 0;

  for (const vessel of vessels) {
    signalBurden += (1.0 - vessel.signalConfidence);
    alphaBurden += vessel.continuityAlpha;

    const stale =
      vessel.signalConfidence < 0.40 ||
      vessel.continuityAlpha < 0.50 ||
      vessel.lifecycleState === "COASTING" ||
      vessel.lifecycleState === "DORMANT" ||
      vessel.lifecycleState === "STALE";

    if (stale) staleCount++;
  }

  const avgSignalBurden =
    signalBurden / vessels.length;

  const avgAlphaBurden =
    alphaBurden / vessels.length;

  const staleRatio =
    staleCount / vessels.length;

  return clamp(
    (avgSignalBurden * 0.45) +
    (avgAlphaBurden * 0.35) +
    (staleRatio * 0.20),
    0.0,
    1.0
  );
}
```

ContinuityLoad is descriptive only.

It may never become:
- scheduler pressure
- AIS decay authority
- lifecycle mutation authority
- wake eviction authority

---

# 18. Sector Density Score

```ts
function calculateSectorDensityScore(
  vesselDensityScore: number,
  wakeDensityScore: number,
  syntheticPressure: number,
  continuityLoad: number
): number {
  return clamp(
    (vesselDensityScore * 0.45) +
    (wakeDensityScore * 0.25) +
    (syntheticPressure * 0.15) +
    (continuityLoad * 0.15),
    0.0,
    1.0
  );
}
```

Weight justification:

```text
0.45 vessel occupancy
0.25 wake occupancy
0.15 synthetic pressure
0.15 continuity burden
```

AIS-driven occupancy remains dominant.

---

# 19. Background / Ghost Ratio

```ts
function resolveBackgroundGhostRatio(
  backgroundCount: number,
  ghostCount: number,
  vesselCount: number
): number {
  if (vesselCount <= 0) return 0.0;

  return clamp(
    (backgroundCount + ghostCount) / vesselCount,
    0.0,
    1.0
  );
}
```

---

# 20. Clutter Pressure

```ts
function calculateClutterPressure(
  sectorDensityScore: number,
  wakeDensityScore: number,
  backgroundGhostRatio: number
): number {
  return clamp(
    (sectorDensityScore * 0.55) +
    (wakeDensityScore * 0.25) +
    (backgroundGhostRatio * 0.20),
    0.0,
    1.0
  );
}
```

Weight justification:

```text
Sector density dominates clutter pressure.
Wake density contributes secondary pressure.
Background/ghost accumulation contributes atmospheric clutter.
```

clutterPressure is advisory only.

It may not:
- directly hide vessels
- directly suppress labels
- directly alter draw authority

AtmosphericReadability remains visibility authority.

---

# 21. Density Classes

```ts
function resolveDensityClass(score: number) {
  if (score >= 0.78) return "SATURATED";
  if (score >= 0.55) return "DENSE";
  if (score >= 0.25) return "ACTIVE";
  return "SPARSE";
}
```

DensityClass is descriptive only.

It is not:
- camera authority
- cinematic pacing authority
- render authority
- topology authority

---

# 22. Global Aggregation Rules

Global values are aggregated as:

```text
globalDensityScore
= average(sector density scores)

globalContinuityLoad
= average(sector continuity loads)

globalClutterPressure
= average(sector clutter pressures)
```

v1.1.0 intentionally uses:
- deterministic averaging
- no adaptive weighting
- no cinematic weighting
- no topology weighting

Future weighting systems require separate governance review.

---

# 23. Atmospheric Interface

ContinuityDensity exports:

```ts
clutterPressure: number;
```

to AtmosphericReadability.

AtmosphericReadability may use this for:
- readability reduction
- label suppression
- silhouette fallback
- marker fallback

ContinuityDensity does NOT consume atmospheric output.

No circular authority path exists.

---

# 24. Renderer Interface

Renderer may consume:
- densityClass
- clutterPressure
- reasonCodes
- sector summaries

Renderer may NOT:
- mutate AIS state
- mutate wake state
- mutate hierarchy
- override readability authority
- reinterpret density as draw authority

---

# 25. Camera Interface

Density provides no camera authority.

Camera systems may NOT use:
- densityClass
- continuityLoad
- clutterPressure
- reasonCodes

for:
- cinematic pacing
- hero selection
- route steering
- target promotion
- focus selection

---

# 26. Determinism Requirements

Forbidden:

- Date.now()
- performance.now()
- Math.random()
- renderer buffer reads
- DOM timing reads
- renderer mutation
- runtime mutation

Allowed:

- simulationTimeMs
- deterministic scalar math
- AISRuntime snapshots
- WakeAuthority snapshots
- PopulationHierarchy snapshots

---

# 27. Evaluation Cadence

```ts
const GLOBAL_DENSITY_CADENCE_MS = 500;
const SECTOR_DENSITY_CADENCE_MS = 500;
const TELEMETRY_CADENCE_MS = 2000;
```

Cadence must derive from:
```text
simulationTimeMs only
```

Evaluations may be skipped if:
- no vessel-count changes
- no wake-count changes
- no tier-distribution changes

Maximum cached-result staleness:
```text
1000ms simulation time
```

---

# 28. Public Functions

```ts
function resolveSectorDensity(
  sector: MaritimeDensitySectorInput,
  simulationTimeMs: number
): MaritimeDensitySectorResult;
```

Pure.

No mutation.

---

```ts
function resolveContinuityDensity(
  input: MaritimeContinuityDensityInput
): MaritimeContinuityDensityResult;
```

Pure.

No mutation.

---

```ts
function resolveClutterPressure(
  sectorResult: MaritimeDensitySectorResult
): number;
```

Pure projection only.

---

# 29. Validation Checklist

- [ ] ContinuityDensity never mutates AIS truth
- [ ] ContinuityDensity never mutates vessel lifecycle
- [ ] ContinuityDensity never mutates vessel motion
- [ ] ContinuityDensity never mutates vessel class
- [ ] ContinuityDensity never mutates population tier
- [ ] ContinuityDensity never mutates spawn ecology
- [ ] ContinuityDensity never creates or deletes wakes
- [ ] ContinuityDensity never alters wake lifetime
- [ ] ContinuityDensity never controls camera
- [ ] ContinuityDensity never writes renderer buffers
- [ ] Density pressure remains descriptive only
- [ ] AIS supremacy remains preserved
- [ ] clutterPressure remains advisory only
- [ ] continuityLoad remains non-scheduling
- [ ] densityClass remains non-cinematic
- [ ] All public functions are pure
- [ ] No wall-clock reads
- [ ] No random values
- [ ] No renderer buffer reads
- [ ] Evaluation cadence derives from simulation time

---

# 30. Build Readiness

```text
Stage: [BUILD]
Freeze Decision: GO
```

0523F is approved for implementation as:
```text
pure deterministic density interpretation infrastructure
```

This spec grants ZERO authority to:
- mutate truth
- optimize runtime occupancy
- orchestrate pacing
- steer cameras
- suppress AIS

---

# 31. Suggested Runtime Files

```text
wall/
  systems/
    maritimeContinuityDensity.js
```

Optional:

```text
wall/
  systems/
    maritimeContinuityDensityDebug.js
```

---

# 32. Canonical Artifact Rule

This is a complete standalone canonical artifact.

Patch releases must remain reconstructable without prior versions.

Partial-file patch releases are forbidden.

---

# 33. Implementation Guide

- **Where this goes:** `wall/systems/maritimeContinuityDensity.js`
- **What to run:** deterministic sector aggregation over AIS/wake snapshots every 500ms simulation time
- **What to expect:** measurable harbor occupancy pressure and clutter awareness without density gaining runtime authority
