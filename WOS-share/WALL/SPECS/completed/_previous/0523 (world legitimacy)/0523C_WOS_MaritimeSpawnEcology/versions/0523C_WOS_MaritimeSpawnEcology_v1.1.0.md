---
layout: spec

title: "WOS Maritime Spawn Ecology"
date: 2026-05-24
doc_id: "0523C_WOS_MaritimeSpawnEcology_v1.1.0"
version: "1.1.0"

project: "Wall of Sound"
system: "WOS"

domain: "runtime"
component: "MaritimeSpawnEcology"

type: "runtime-spec"
status: "canonical-draft"

priority: "high"
risk: "high"

classification: "runtime-authority"

summary: "Defines implementation-safe maritime spawn ecology as probabilistic harbor presence infrastructure, including ecological zones, density envelopes, synthetic vessel authority boundaries, lifecycle constraints, and PopulationHierarchy coordination."

stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "none"

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "AIS truth overrides ecology"
  - "Spawn ecology describes probability, not simulation authority"
  - "Synthetic vessels are explicitly synthetic"
  - "SpawnEcology requests presence; MaritimeContinuityEngine owns motion"

depends_on:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "AISRuntime"
  - "MaritimeMotionAuthority"
  - "ContinuityDoctrineSuite"

enables:
  - "0523D_WOS_MaritimeWakeAuthority_v1.0.0"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.0.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.0.0"
  - "HarborCoverageEnvelope"
  - "WaterfrontObservabilityLayer"

tags:
  - "maritime"
  - "spawn-ecology"
  - "synthetic-vessels"
  - "ais"
  - "density"
  - "harbor"
  - "runtime"
  - "governance"

---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Review and harden before build.

This spec is not ready for implementation until review confirms:

- synthetic vessel authority is safe
- synthetic lifecycle is deterministic
- zone schema is sufficient
- density ranges are bounded
- PopulationHierarchy interface is stable

---

# 🎯 PURPOSE

Define implementation-safe maritime spawn ecology for WOS harbor systems.

Spawn ecology exists to describe:

- where vessel classes tend to appear
- how harbor density forms geographically
- how vessel composition varies by zone
- how synthetic background presence may be requested when live AIS is absent or insufficient
- how ecological silence remains possible

This system exists to create believable harbor presence without turning ecology into simulation authority.

This spec governs:

- ecological zone schema
- class distribution weights
- density ranges
- synthetic vessel request rules
- synthetic ID namespace requirements
- synthetic lifecycle boundaries
- AIS conflict behavior
- PopulationHierarchy coordination
- ecological silence doctrine

This spec does NOT govern:

- AIS ingestion
- AIS truth
- vessel motion
- vessel steering
- dead reckoning
- interpolation
- lifecycle state transitions
- wake rendering
- renderer styling
- camera behavior
- atmospheric orchestration
- gameplay
- autonomous AI

---

# 🧠 CORE PRINCIPLES

## 1. Ecology Is Probability, Not Authority

Spawn ecology describes likely harbor presence.

It does not command vessel motion.

It does not create runtime truth.

It does not override AIS.

```text
Ecology maps expectation.
Telemetry commands execution.
```

## 2. AIS Truth Overrides Ecology

If live AIS data exists, AIS truth wins.

When live AIS contradicts ecological expectation:

- AIS position remains authoritative
- AIS vessel class remains authoritative after taxonomy resolution
- ecology does not rebalance live truth
- ecology does not move the vessel
- ecology does not flag the vessel as invalid merely for being out-of-zone

## 3. Synthetic Vessels Are Second-Class Truth

Synthetic vessels may support atmosphere, density, and continuity testing.

They must never impersonate live AIS.

They must never be treated as equal to AIS truth.

They must always carry explicit synthetic provenance.

## 4. SpawnEcology Does Not Own Motion

SpawnEcology may request vessel instantiation.

After instantiation:

```text
MaritimeContinuityEngine owns all synthetic vessel motion.
```

SpawnEcology may not mutate:

- position
- heading
- speed
- lifecycle state
- interpolation state
- continuity state

## 5. Empty Water Is Valid

The harbor must permit silence.

Ecology must never force constant activity everywhere.

Empty water supports:

- realism
- pacing
- low-fatigue observability
- atmospheric restraint
- continuity honesty

---

# 🏛️ AUTHORITY BOUNDARIES

## This Spec Owns

- ecological zone definitions
- density envelopes
- class distribution weights
- synthetic spawn request constraints
- synthetic namespace rules
- ecology-to-population interface shape
- ecological silence constraints

## This Spec May Observe

- taxonomy profiles
- population budget state
- AIS coverage state
- time-of-day
- weather state
- harbor zone definitions
- active vessel counts

## This Spec May Request

- synthetic vessel instantiation candidates
- synthetic density opportunities
- ecological zone lookup
- density suppression

## This Spec Must Not Control

- AIS vessel state
- synthetic vessel motion after spawn
- vessel lifecycle transitions
- renderer styling
- camera targeting
- wake generation
- audio generation
- atmosphere pacing
- gameplay logic

---

# 🌊 CONTINUITY ROLE

SpawnEcology participates in continuity as a bounded expectation layer.

It may help determine:

- whether synthetic harbor background presence is appropriate
- which vessel classes are plausible in a zone
- how much synthetic density is safe
- whether ecological silence should persist

It may not determine:

- whether a vessel is alive
- whether a vessel is dormant
- whether a vessel should coast
- whether a vessel should be reconciled
- whether a vessel should change course

Synthetic vessel continuity is owned by the same continuity runtime that owns AIS vessel continuity.

---

# 🧭 INTERPRETATION SEPARATION

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

SpawnEcology provides probabilistic presence data.

Interpretation layers may use ecology to understand:

- zone character
- plausible density
- class mixture
- background atmospheric context

Interpretation layers may NOT:

- spawn vessels directly
- create renderer-owned vessel truth
- fill empty water for aesthetics without registry authority
- fabricate AIS-like identities
- mutate runtime vessels

---

# 📦 DATA MODEL

## Ecological Zone

```ts
type MaritimeEcologicalZone = {
  zoneId: string;
  displayLabel: string;

  zoneType:
    | "INDUSTRIAL_CORRIDOR"
    | "FERRY_TRANSIT_CORRIDOR"
    | "HARBOR_UTILITY_ZONE"
    | "OPEN_RECREATIONAL_WATER"
    | "STRATEGIC_SECURITY_CORRIDOR";

  geographyRef: {
    strategy: "POLYGON_REF" | "ANCHOR_RADIUS" | "GRID_CELL_REF";
    refId: string;
  };

  dominantClasses: VesselClass[];
  secondaryClasses: VesselClass[];

  classDistribution: Partial<Record<VesselClass, number>>;

  densityRange: {
    min: number;
    target: number;
    max: number;
  };

  syntheticCeiling: number;
  silencePermitted: boolean;

  corridorAffinity: number;
  weatherSensitivity: number;
  timeOfDaySensitivity: number;
};
```

## Synthetic Vessel Request

```ts
type SyntheticVesselRequest = {
  requestId: string;
  zoneId: string;
  vesselClass: VesselClass;

  syntheticId: string;
  provenance: "SYNTHETIC_ECOLOGY";

  initialPosition: {
    x: number;
    y: number;
  };

  initialHeadingDeg: number;
  initialSpeedKts: number;

  requestedLifetimeMs: number;
  spawnReason:
    | "AIS_COVERAGE_GAP"
    | "REPLAY_BACKGROUND"
    | "SYNTHETIC_HARBOR_MODE"
    | "ATMOSPHERIC_BACKGROUND";

  createdAtMs: number;
};
```

## Synthetic Vessel Runtime Contract

```ts
type SyntheticVesselActor = {
  syntheticId: string;
  vesselClass: VesselClass;
  provenance: "SYNTHETIC_ECOLOGY";
  spawnZoneId: string;

  createdAtMs: number;
  expiresAtMs: number;

  ownedBy: "MaritimeContinuityEngine";
};
```

---

# 🧱 SYNTHETIC ID NAMESPACE RULE

Synthetic vessel IDs must use an explicit string namespace:

```text
synth::maritime::<zoneId>::<uuid>
```

Examples:

```text
synth::maritime::industrial_kill_van_kull::8f41b0
synth::maritime::ferry_east_river::2c019d
```

Forbidden:

- fake MMSI numbers
- numeric IDs that overlap AIS
- reused AIS identifiers
- renderer-local IDs
- randomly allocated integer IDs

Live AIS vessel keys preserve their AIS/MMSI identifiers.

Synthetic vessel keys must never share the same keyspace.

---

# 🔄 SPAWN AUTHORITY CHAIN

The authority chain is fixed:

```text
PopulationHierarchy
  observes budget pressure
  ↓
SpawnEcology
  returns weighted candidate opportunities
  ↓
MaritimeContinuityEngine
  instantiates synthetic vessel actor
  owns motion and lifecycle
  ↓
Renderer / Overlay
  observe only
```

SpawnEcology does not directly insert active vessels into the runtime registry.

SpawnEcology returns candidate requests.

MaritimeContinuityEngine decides whether to instantiate.

PopulationHierarchy remains the global budget controller.

---

# 🧬 SYNTHETIC VESSEL LIFECYCLE

Synthetic vessels follow deterministic lifecycle rules.

## Spawn

Synthetic vessels may spawn only when:

- synthetic mode is enabled
- live AIS coverage is absent, sparse, or intentionally disabled
- PopulationHierarchy budget allows additional presence
- zone density is below target
- silence rules permit activity
- a valid ecological zone is available

## Tracking

After spawn, synthetic vessel motion belongs to MaritimeContinuityEngine.

SpawnEcology may not update synthetic vessel position after creation.

## Expiry

Every synthetic vessel must receive an immutable maximum lifetime.

Recommended baseline:

```ts
syntheticLifetimeMs =
  min(
    requestedLifetimeMs,
    SYNTHETIC_MAX_LIFETIME_MS
  );
```

Default values:

```ts
const SYNTHETIC_DEFAULT_LIFETIME_MS = 900000; // 15 minutes
const SYNTHETIC_MAX_LIFETIME_MS = 1800000;    // 30 minutes
```

## Despawn

Synthetic vessels must be evicted when any of the following occurs:

- lifetime expires
- vessel exits its allowed ecological boundary
- global synthetic budget is exceeded
- zone synthetic budget is exceeded
- AIS coverage recovers and live vessels are present in the same zone above target density
- MaritimeContinuityEngine invalidates the vessel
- synthetic mode is disabled

## AIS Coexistence

If a live AIS vessel appears in the same zone:

- AIS vessel is accepted without adjustment
- synthetic vessel does not reconcile with it
- synthetic vessel does not inherit AIS identity
- synthetic vessel may be scheduled for eviction if budget pressure requires
- synthetic vessel may finish its lifecycle if budgets remain safe

Synthetic vessels never transform into AIS vessels.

---

# 🗺️ ECOLOGICAL ZONE GEOGRAPHY

This spec defines ecological zone schema and zone types.

Exact coordinates may be defined in a companion geography artifact:

```text
0523C_Zones.geojson
```

or:

```text
0524_WOS_HarborCoverageEnvelope_v1.0.0
```

Until exact polygons are defined, zones must use stable `geographyRef` identifiers.

Implementers must not hardcode unnamed coordinate guesses inside runtime logic.

---

# 🌎 CANONICAL ECOLOGICAL ZONES

## 1. Industrial Corridor

Examples:

- Port Newark
- Elizabeth
- Kill Van Kull
- Red Hook industrial edges

Dominant classes:

- CARGO
- TANKER
- INDUSTRIAL
- TUG
- SERVICE

Secondary classes:

- PASSENGER
- UNKNOWN

Class distribution baseline:

```ts
{
  CARGO: 0.32,
  TANKER: 0.22,
  INDUSTRIAL: 0.16,
  TUG: 0.16,
  SERVICE: 0.10,
  UNKNOWN: 0.04
}
```

Density range:

```ts
{ min: 0, target: 18, max: 42 }
```

Synthetic ceiling:

```ts
12
```

Silence permitted:

```ts
true
```

---

## 2. Ferry Transit Corridor

Examples:

- Staten Island Ferry route
- East River ferry lanes
- Hudson commuter ferry routes

Dominant classes:

- FERRY
- PASSENGER
- SERVICE
- TUG

Secondary classes:

- CARGO
- RECREATIONAL
- UNKNOWN

Class distribution baseline:

```ts
{
  FERRY: 0.38,
  PASSENGER: 0.24,
  SERVICE: 0.14,
  TUG: 0.10,
  RECREATIONAL: 0.08,
  UNKNOWN: 0.06
}
```

Density range:

```ts
{ min: 0, target: 14, max: 30 }
```

Synthetic ceiling:

```ts
8
```

Silence permitted:

```ts
true
```

---

## 3. Harbor Utility Zone

Examples:

- tug staging areas
- maintenance sectors
- harbor support regions
- pier service edges

Dominant classes:

- TUG
- SERVICE
- INDUSTRIAL

Secondary classes:

- CARGO
- UNKNOWN

Class distribution baseline:

```ts
{
  TUG: 0.34,
  SERVICE: 0.30,
  INDUSTRIAL: 0.16,
  CARGO: 0.10,
  UNKNOWN: 0.10
}
```

Density range:

```ts
{ min: 0, target: 10, max: 24 }
```

Synthetic ceiling:

```ts
6
```

Silence permitted:

```ts
true
```

---

## 4. Open Recreational Water

Examples:

- Lower Bay recreational sectors
- outer harbor edges
- public waterfront recreational approaches

Dominant classes:

- RECREATIONAL
- FISHING
- SERVICE

Secondary classes:

- PASSENGER
- UNKNOWN

Class distribution baseline:

```ts
{
  RECREATIONAL: 0.42,
  FISHING: 0.28,
  SERVICE: 0.12,
  PASSENGER: 0.08,
  UNKNOWN: 0.10
}
```

Density range:

```ts
{ min: 0, target: 9, max: 28 }
```

Synthetic ceiling:

```ts
10
```

Silence permitted:

```ts
true
```

---

## 5. Strategic Security Corridor

Examples:

- bridge security zones
- protected infrastructure approaches
- restricted observation areas

Dominant classes:

- MILITARY
- SERVICE
- TUG

Secondary classes:

- UNKNOWN

Class distribution baseline:

```ts
{
  MILITARY: 0.18,
  SERVICE: 0.34,
  TUG: 0.22,
  UNKNOWN: 0.26
}
```

Density range:

```ts
{ min: 0, target: 4, max: 12 }
```

Synthetic ceiling:

```ts
2
```

Silence permitted:

```ts
true
```

---

# 🎚️ ECOLOGY SCORE

EcologyScore is a weighted probability value.

```text
EcologyScore =
(zoneAffinity × 0.35)
+ (timeWindowAffinity × 0.20)
+ (weatherAffinity × 0.15)
+ (corridorAffinity × 0.20)
+ (populationPressure × 0.10)
```

Output:

```text
0.0 → 1.0 probability weighting
```

This is selection weighting only.

It is not spawn certainty.

---

# ⏱️ TEMPORAL ECOLOGY

Time-of-day may alter probability.

Examples:

| Time Window | Behavior |
|---|---|
| 06:00–09:00 | ferry activity increase |
| 12:00–14:00 | moderate harbor utility lift |
| 17:00–19:00 | ferry and service activity increase |
| 22:00–05:00 | recreational suppression |
| late night | cargo persistence remains plausible |

Temporal ecology may not create hard schedules.

It is probability modulation only.

---

# 🌦️ WEATHER ECOLOGY

Weather may influence:

- recreational suppression
- visibility expectation
- density suggestion
- synthetic ceiling reduction
- ecological silence probability

Weather may NOT:

- move vessels
- rewrite AIS
- alter continuity truth
- force despawn of live vessels
- mutate lifecycle state

---

# 🧯 AIS CONFLICT RESOLUTION

## Out-of-Zone AIS Vessel

If live AIS places a vessel in an unexpected ecological zone:

- accept AIS truth
- do not move vessel
- do not reclassify vessel
- do not raise runtime fault
- optionally emit low-priority debug telemetry

Example:

```text
RECREATIONAL vessel inside Industrial Corridor
→ accepted as real AIS truth
→ no ecology correction
```

## Synthetic + AIS Same Zone

If live AIS appears in a zone containing synthetic vessels:

- AIS vessels take priority
- synthetic vessels remain synthetic
- no reconciliation occurs
- synthetic vessels may be evicted if density exceeds PopulationHierarchy budgets

---

# 🧮 POPULATIONHIERARCHY INTERFACE

SpawnEcology is subordinate to PopulationHierarchy.

## PopulationHierarchy Owns

- global tier budgets
- per-zone budget caps
- render/update advisory ceilings
- label eligibility
- over-budget telemetry

## SpawnEcology Owns

- class distribution suggestions
- zone density expectation
- synthetic candidate weighting
- ecological silence probability

## Interface

```ts
type EcologyPopulationInterface = {
  getDensitySuggestion(zoneId: string, timeMs: number): DensityProfile;

  getSpawnCandidates(
    zoneId: string,
    count: number,
    context: EcologyContext
  ): SyntheticVesselRequest[];

  onVesselCountChanged(
    zoneId: string,
    activeCount: number,
    syntheticCount: number,
    maxCount: number
  ): void;
};
```

PopulationHierarchy may reject any SpawnEcology suggestion.

SpawnEcology may not override that rejection.

---

# 🧱 GLOBAL SYNTHETIC BUDGETS

Recommended defaults:

```ts
const GLOBAL_MAX_SYNTHETIC_VESSELS = 50;
const GLOBAL_TARGET_SYNTHETIC_VESSELS = 24;
const SYNTHETIC_SPAWN_INTERVAL_MIN_MS = 30000;
const SYNTHETIC_SPAWN_INTERVAL_MAX_MS = 120000;
```

Budgets are soft ecological targets but hard runtime ceilings.

If the global synthetic ceiling is reached, no new synthetic vessel request may be approved.

---

# 🧭 ZONE QUERY STRATEGY

Zone membership may be resolved by:

- polygon reference
- anchor radius
- grid cell lookup

Recommended production path:

```text
static GeoJSON polygon lookup
```

Performance expectation:

- zone lookup must be cached
- repeated coordinate-to-zone checks must avoid expensive polygon scans in hot loops
- runtime should use precomputed spatial index or grid buckets

---

# 🧪 VALIDATION CHECKLIST

- [ ] Ecology never overrides AIS truth
- [ ] Ecology never mutates lifecycle state
- [ ] Ecology never forces routes
- [ ] Synthetic vessels are explicitly marked
- [ ] Synthetic IDs use `synth::maritime::` namespace
- [ ] Synthetic vessels never impersonate MMSI IDs
- [ ] Synthetic vessels are owned by MaritimeContinuityEngine after spawn
- [ ] SpawnEcology does not update synthetic motion after spawn
- [ ] Synthetic vessels have maximum lifetime
- [ ] Synthetic vessels have despawn rules
- [ ] Synthetic vessels do not reconcile with AIS vessels
- [ ] Ecological zones have queryable schema
- [ ] Density ranges are defined per zone
- [ ] FISHING has zone assignment
- [ ] Spawn authority chain is explicit
- [ ] AIS conflict resolution is defined
- [ ] Empty-water states remain possible
- [ ] Ecology remains subordinate to PopulationHierarchy
- [ ] Ecology does not assign HERO directly
- [ ] Ecology does not control cameras
- [ ] Ecology does not fabricate continuity
- [ ] Corridor affinity remains advisory
- [ ] Weather effects remain probabilistic
- [ ] Synthetic vessels cannot persist indefinitely
- [ ] Renderer cannot spawn ecology vessels

---

# 🚫 NON-GOALS

This specification is NOT responsible for:

- live AIS ingestion
- real vessel motion
- synthetic vessel motion after spawn
- pathfinding
- autonomous vessel AI
- camera behavior
- renderer styling
- wake rendering
- audio scoring
- atmospheric orchestration
- gameplay loops
- user missions
- fishing recommendation systems
- public waterfront access systems

---

# ⏸️ DEFERRED SYSTEMS

The following systems are intentionally excluded:

- exact HarborCoverageEnvelope polygons
- public waterfront observability
- fishing window recommendations
- ferry schedule reconciliation
- tug-cargo correlation logic
- advanced ecological rhythm systems
- seasonal harbor patterns
- renderer-side ecology presentation
- synthetic wake authority
- synthetic audio events

---

# 📚 CANONICAL REFERENCES

- `0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1`
- `0523B_WOS_MaritimePopulationHierarchy_v1.1.0`
- `0522O_WOS_MaritimeMotionAuthority_v1.0.0`
- `0522P_WOS_AISRuntimeContinuity`
- `0522Q_WOS_MaritimeContinuityDoctrine`
- `0521_WOS_ContinuityDoctrineSuite_v1.0.0`
- `WOS_Naming_Doctrine_v1.1.0`
- `WOS_ConstitutionalSpecTemplate_v2.0.1`
- `README.md`

---

# 💬 IMPLEMENTATION NOTES

Suggested files:

```text
wall/
  ecology/
    maritimeSpawnEcology.js
    maritimeEcologicalZones.js
    maritimeTemporalEcology.js
```

Do not implement until this spec receives:

```text
Stage: [BUILD]
Freeze Decision: GO
```

---

# 🧠 SEMANTIC TOPOLOGY

## Doctrine

- [[2D owns truth]]
- [[2.5D owns presentation]]
- [[AIS truth overrides ecology]]
- [[Ecology maps expectation]]
- [[Telemetry commands execution]]

## Core Concepts

- [[Spawn Ecology]]
- [[Synthetic Vessel]]
- [[Ecological Zone]]
- [[Density Envelope]]
- [[Ecological Silence]]
- [[Synthetic Namespace]]

## Related Systems

- [[AISRuntime]]
- [[MaritimeContinuityEngine]]
- [[TaxonomyProfiles]]
- [[PopulationHierarchy]]
- [[HarborCoverageEnvelope]]

## Governance Risks

- [[Synthetic Motion Leakage]]
- [[Renderer-Owned Ecology]]
- [[Ecology Scheduler Drift]]
- [[Synthetic AIS Impersonation]]
- [[Hidden AI Behavior]]
