---
title: "WOS Maritime Continuity Density"
filename: "0523F_WOS_MaritimeContinuityDensity_v1.2.0.md"
version: "1.2.0"
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
Action: Approved for deterministic continuity-density interpretation implementation.

---

# 1. Core Doctrine

MaritimeContinuityDensity is a passive deterministic observability layer.

It evaluates:

- occupancy pressure
- continuity burden
- wake accumulation
- clutter pressure
- density saturation

It does NOT:

- mutate AIS truth
- mutate lifecycle state
- mutate vessel identity
- mutate wake authority
- mutate spawn ecology
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

# 3. Constitutional Lifecycle Alignment

0523F does NOT define a new lifecycle authority model.

It consumes a projected interpretation view derived from the constitutional lifecycle states defined by:

- 0522O
- 0522P
- 0522Q

Canonical runtime lifecycle chain:

```text
SPAWNING
→ TRACKING
→ RECONCILING
→ COASTING
→ DORMANT
→ RESPAWNING
```

0523F consumes these states directly.

No alternative lifecycle authority exists in this spec.

---

# 4. Lifecycle Projection Rules

ContinuityDensity interprets constitutional lifecycle states as follows:

| Runtime Lifecycle State | Continuity Interpretation |
|---|---|
| SPAWNING | initialization pressure only |
| TRACKING | active continuity |
| RECONCILING | continuity uncertainty |
| COASTING | degraded continuity |
| DORMANT | stale continuity |
| RESPAWNING | transitional continuity |

These interpretations are descriptive only.

They do NOT:
- mutate lifecycle
- promote lifecycle
- suppress lifecycle
- accelerate lifecycle
- delay lifecycle

---

# 5. continuityAlpha Semantics

`continuityAlpha` is formally defined as:

```text
dead-reckoning continuity burden scalar
```

Semantic meaning:

```text
0.00 = fresh AIS truth dominance
1.00 = full dead-reckoning continuity dominance
```

High values indicate:
- reduced AIS freshness
- increased continuity interpolation burden
- increased runtime continuity pressure

Low values indicate:
- fresh AIS authority
- low continuity burden
- low dead-reckoning reliance

This scalar is descriptive only.

It may not:
- alter AIS confidence
- alter continuity runtime behavior
- alter lifecycle state
- alter interpolation systems

---

# 6. Input Contracts

```ts
type VesselLifecycleState =
  | "SPAWNING"
  | "TRACKING"
  | "RECONCILING"
  | "COASTING"
  | "DORMANT"
  | "RESPAWNING";

type MaritimeContinuityDensityInput = {
  readonly simulationTimeMs: number;

  readonly sectors:
    readonly MaritimeDensitySectorInput[];

  readonly globalBudgetState: {
    readonly maxVessels: number;
    readonly maxWakeSegments: number;
    readonly maxSyntheticVessels: number;
  };
};
```

---

# 7. Sector Input Contracts

```ts
type MaritimeDensitySectorInput = {
  readonly sectorId: string;

  readonly vessels:
    readonly MaritimeDensityVesselInput[];

  readonly wakes:
    readonly MaritimeDensityWakeInput[];

  readonly budget: {
    readonly maxVessels: number;
    readonly maxWakeSegments: number;
    readonly maxSyntheticVessels: number;
  };
};
```

Sector budgets are descriptive scaling references only.

Exceeding budget does NOT authorize:
- culling
- suppression
- wake eviction
- spawn rejection

---

# 8. Vessel Input Contracts

```ts
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

  readonly lifecycleState:
    VesselLifecycleState;

  readonly continuityAlpha: number;   // 0.00 → 1.00
  readonly signalConfidence: number;  // 0.00 → 1.00
};
```

---

# 9. Wake Input Contracts

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

# 10. Output Contracts

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

  readonly sectors:
    readonly MaritimeDensitySectorResult[];

  readonly reasonCodes:
    readonly MaritimeContinuityDensityReason[];
};
```

---

# 11. Reason Codes

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

# 12. Deterministic Scalar Functions

```ts
function clamp(
  v: number,
  min: number,
  max: number
): number {
  return Math.min(
    Math.max(v, min),
    max
  );
}
```

---

# 13. Vessel Density Score

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

---

# 14. Wake Density Score

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

---

# 15. Synthetic Pressure

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

SyntheticPressure is advisory only.

It may not suppress synthetic ecology.

---

# 16. AIS Pressure

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

AIS supremacy is preserved.

AIS vessels may never be suppressed by density pressure.

---

# 17. Stale / Low Confidence Definition

A vessel is considered stale or low-confidence if ANY:

```text
signalConfidence < 0.40
continuityAlpha > 0.50
lifecycleState == COASTING
lifecycleState == DORMANT
lifecycleState == RECONCILING
```

Interpretation:

```text
High continuityAlpha
=
high dead-reckoning burden
=
higher continuity pressure
```

This classification is descriptive only.

It may not:
- mutate lifecycle
- mutate AIS authority
- mutate interpolation
- alter continuity runtime logic

---

# 18. Continuity Load

```ts
function calculateContinuityLoad(
  vessels:
    readonly MaritimeDensityVesselInput[]
): number {

  if (vessels.length <= 0) {
    return 0.0;
  }

  let signalBurden = 0.0;
  let alphaBurden = 0.0;
  let staleCount = 0;

  for (const vessel of vessels) {

    signalBurden +=
      (1.0 - vessel.signalConfidence);

    alphaBurden +=
      vessel.continuityAlpha;

    const stale =
      vessel.signalConfidence < 0.40 ||
      vessel.continuityAlpha > 0.50 ||
      vessel.lifecycleState === "RECONCILING" ||
      vessel.lifecycleState === "COASTING" ||
      vessel.lifecycleState === "DORMANT";

    if (stale) {
      staleCount++;
    }
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

It may NOT become:
- scheduler pressure
- AIS decay authority
- lifecycle authority
- wake authority
- pacing authority

---

# 19. Sector Density Score

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

---

# 20. Background / Ghost Ratio

```ts
function resolveBackgroundGhostRatio(
  backgroundCount: number,
  ghostCount: number,
  vesselCount: number
): number {

  if (vesselCount <= 0) {
    return 0.0;
  }

  return clamp(
    (backgroundCount + ghostCount)
      / vesselCount,
    0.0,
    1.0
  );
}
```

---

# 21. Clutter Pressure

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

`clutterPressure` is advisory only.

It may not:
- hide vessels directly
- suppress labels directly
- alter draw authority
- mutate AtmosphericReadability

AtmosphericReadability remains visibility authority.

---

# 22. Density Classes

```ts
function resolveDensityClass(
  score: number
) {
  if (score >= 0.78) {
    return "SATURATED";
  }

  if (score >= 0.55) {
    return "DENSE";
  }

  if (score >= 0.25) {
    return "ACTIVE";
  }

  return "SPARSE";
}
```

DensityClass is descriptive only.

It is NOT:
- cinematic authority
- camera authority
- pacing authority
- render authority

---

# 23. Global Aggregation Rules

```text
globalDensityScore
= average(sector density scores)

globalContinuityLoad
= average(sector continuity loads)

globalClutterPressure
= average(sector clutter pressures)
```

v1.2.0 intentionally preserves:

- deterministic averaging
- no adaptive weighting
- no cinematic weighting
- no topology weighting

Future weighting systems require separate governance review.

---

# 24. Atmospheric Interface

ContinuityDensity exports:

```ts
clutterPressure: number;
```

to AtmosphericReadability.

AtmosphericReadability may use:
- readability reduction
- label suppression
- silhouette fallback
- marker fallback

ContinuityDensity does NOT consume atmospheric output.

No circular authority path exists.

---

# 25. Renderer Interface

Renderer may consume:
- densityClass
- clutterPressure
- reasonCodes
- summaries

Renderer may NOT:
- mutate AIS
- mutate wakes
- override readability
- reinterpret density as draw authority

---

# 26. Camera Interface

Density provides NO camera authority.

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

# 27. Determinism Requirements

Forbidden:

- Date.now()
- performance.now()
- Math.random()
- renderer buffer reads
- DOM timing reads
- runtime mutation

Allowed:

- simulationTimeMs
- deterministic scalar math
- AIS snapshots
- WakeAuthority snapshots
- PopulationHierarchy snapshots

---

# 28. Evaluation Cadence

```ts
const GLOBAL_DENSITY_CADENCE_MS = 500;
const SECTOR_DENSITY_CADENCE_MS = 500;
const TELEMETRY_CADENCE_MS = 2000;
const MAX_CACHED_STALENESS_MS = 1000;
```

Cadence derives from:

```text
simulationTimeMs only
```

Evaluations may skip if:
- no vessel-count changes
- no wake-count changes
- no tier-distribution changes

---

# 29. Public Functions

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
  sectorResult:
    MaritimeDensitySectorResult
): number;
```

Pure projection only.

---

# 30. Validation Checklist

- [ ] Never mutates AIS truth
- [ ] Never mutates lifecycle state
- [ ] Never mutates vessel motion
- [ ] Never mutates vessel class
- [ ] Never mutates population tier
- [ ] Never mutates spawn ecology
- [ ] Never creates/deletes wakes
- [ ] Never alters wake lifetime
- [ ] Never controls camera
- [ ] Never writes renderer buffers
- [ ] Density pressure remains descriptive only
- [ ] AIS supremacy preserved
- [ ] continuityAlpha semantics explicitly defined
- [ ] Lifecycle states aligned constitutionally
- [ ] clutterPressure advisory only
- [ ] densityClass non-cinematic
- [ ] All functions pure
- [ ] No wall-clock reads
- [ ] No random values
- [ ] Evaluation cadence derives from simulation time

---

# 31. Build Readiness

```text
Stage: [BUILD]
Freeze Decision: GO
```

0523F v1.2.0 is approved for implementation as:

```text
pure deterministic continuity-density interpretation infrastructure
```

This spec grants ZERO authority to:
- mutate truth
- optimize runtime occupancy
- orchestrate pacing
- steer cameras
- suppress AIS

---

# 32. Suggested Runtime Files

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

# 33. Canonical Artifact Rule

This is a complete standalone canonical artifact.

Patch releases must remain reconstructable without prior versions.

Partial-file patch releases are forbidden.

---

# 34. Implementation Guide

- **Where this goes:** `wall/systems/maritimeContinuityDensity.js`
- **What to run:** deterministic sector aggregation over AIS/wake snapshots every 500ms simulation time
- **What to expect:** measurable harbor occupancy pressure and clutter awareness without density gaining runtime authority
