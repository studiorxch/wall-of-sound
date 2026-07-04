## WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

**Review Date:** 2026-05-24  
**Document:** 0523C\_WOS\_MaritimeSpawnEcology\_v1.1.0  
**Version:** 1.1.0  
**Stage:** REVIEW  
**Previous Version:** v1.0.0 (governance only)

___

## Executive Summary

This specification **successfully transforms** v1.0.0 from governance principles into **implementation-safe infrastructure**. It adds concrete ecological zones, density ranges, class distribution weights, synthetic ID namespace rules, lifecycle constraints, and a clear PopulationHierarchy interface.

**Verdict:** **ACCEPT as canonical-draft** — ready for REVIEW stage progression to BUILD.

**This is the spawn ecology implementation spec that v1.0.0 promised but did not deliver.**

___

## Overall Assessment

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

|           Category            |     v1.0.0     |                   v1.1.0                   | Improvement |
|-------------------------------|----------------|--------------------------------------------|-------------|
|       Zone definitions        |   Named only   |     Schema + 5 zones + density ranges      |  **COMPLETE**   |
|   Probability distributions   |      None      |        Class weight tables per zone        |  **COMPLETE**   |
|         Spawn timing          |      None      | Interval ranges (30-120s), lifetime bounds |  **COMPLETE**   |
|      Synthetic lifecycle      |    Missing     |    Spawn→Tracking→Expiry→Despawn rules     |  **COMPLETE**   |
|         AIS conflict          | Principle only |      Out-of-zone + coexistence rules       |  **COMPLETE**   |
| PopulationHierarchy interface |   Referenced   |         Interface contract defined         |  **COMPLETE**   |
|     Validation checklist      |    5 items     |                  25 items                  |  **COMPLETE**   |

**All blocking deficiencies from v1.0.0 have been addressed.**

___

## Strengths (Preserve)

### 1\. Complete Ecological Zone Data Model

The `MaritimeEcologicalZone` type with zoneType, geographyRef, classDistribution, densityRange, syntheticCeiling, and silencePermitted is production-ready.

### 2\. Five Canonical Zones with Concrete Distributions

Industrial Corridor, Ferry Transit Corridor, Harbor Utility Zone, Open Recreational Water, Strategic Security Corridor — each with:

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

-   Dominant/secondary classes
    
-   Class distribution weights (summing to 1.0)
    
-   Density ranges (min/target/max)
    
-   Synthetic ceilings
    
-   Silence permitted flag
    

**Example:** Industrial Corridor: CARGO 0.32, TANKER 0.22, target density 18, max 42, synthetic ceiling 12.

### 3\. Synthetic ID Namespace Rule

`synth::maritime::<zoneId>::<uuid>` — prevents AIS impersonation, globally distinguishable, traceable to zone of origin.

### 4\. Spawn Authority Chain

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

```scss
WOS Maritime Spawn Ecology v1.1.0 — Infrastructure ReviewPopulationHierarchy (budget) → SpawnEcology (candidates) → ContinuityEngine (instantiation)
```

Explicit and enforceable. SpawnEcology does not directly insert vessels.

### 5\. Synthetic Vessel Lifecycle Complete

Spawn → Tracking (owned by ContinuityEngine) → Expiry (max 30 minutes) → Despawn (6 conditions including AIS recovery, budget pressure, zone exit)

### 6\. AIS Conflict Resolution

Out-of-zone AIS vessels accepted without correction. Synthetic vessels do not reconcile with AIS. AIS recovery may trigger synthetic eviction.

### 7\. PopulationHierarchy Interface Contract

`getDensitySuggestion`, `getSpawnCandidates`, `onVesselCountChanged` — clear separation of concerns.

### 8\. EcologyScore Weighting Formula

Zone affinity (35%) + time window (20%) + weather (15%) + corridor affinity (20%) + population pressure (10%) — provides deterministic probability weighting.

### 9\. Temporal Ecology (Time-of-Day Modulation)

Morning ferry increase, afternoon utility lift, evening activity, night recreational suppression — diurnal patterns without hard schedules.

### 10\. Weather Ecology

Weather influences density suggestion and synthetic ceiling but does NOT move vessels or alter continuity truth.

### 11\. Validation Checklist (25 Items)

Comprehensive coverage of authority boundaries, synthetic rules, AIS conflict, and forbidden behaviors.

### 12\. Deferred Systems Explicit List

Prevents scope creep into harbor polygons, ferry schedules, tug-cargo correlation, seasonal patterns.

___

## Required Amendments (Non-Blocking, Clarifications)

### Amendment 1: FISHING Class Missing from Zone Distributions

**Issue:** FISHING appears in taxonomy but is only present in Open Recreational Water (0.28). No presence in other zones. Real harbors have fishing vessels near industrial areas (working waterfronts).

**Fix:** Add FISHING to Harbor Utility Zone secondary classes with low weight:

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

```yaml
WOS Maritime Spawn Ecology v1.1.0 — Infrastructure ReviewHarbor Utility Zone secondary classes:
- CARGO: 0.10
- UNKNOWN: 0.10
+ FISHING: 0.05 (adjusted from other weights)

// Rebalance:
TUG: 0.34 → 0.32
SERVICE: 0.30 → 0.28
FISHING: 0.05
```

___

### Amendment 2: PASSENGER vs FERRY Clarification

**Issue:** PASSENGER and FERRY are distinct classes. Ferry Transit Corridor includes both (FERRY 0.38, PASSENGER 0.24). Real distinction: FERRY = scheduled route, PASSENGER = excursion/cruise.

**Fix:** Add clarifying note:

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

```diff
WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review+ ## PASSENGER vs FERRY Distinction
+ 
+ FERRY: Scheduled commuter/vehicle ferry with route registry.
+ PASSENGER: Excursion, sightseeing, or non-scheduled passenger vessel.
+ 
+ Both may appear in Ferry Transit Corridor.
+ FERRY has higher continuity weight and route-locked behavior.
+ PASSENGER has more flexible route discipline.
```

___

### Amendment 3: Synthetic Vessel Expiry — Missing Telemetry Requirement

**Issue:** Despawn conditions listed but no telemetry requirement for tracking synthetic vessel lifespan and despawn reasons.

**Fix:** Add telemetry requirement:

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

```diff
WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review+ ## Synthetic Vessel Telemetry
+ 
+ Required telemetry for each synthetic vessel:
+ - spawnTime, despawnTime, lifetimeMs
+ - despawnReason (EXPIRED | ZONE_EXIT | BUDGET_PRESSURE | AIS_RECOVERY | INVALIDATED | MODE_DISABLED)
+ - zoneId, vesselClass
+ - maxLifetimeMs granted
+ 
+ Telemetry enables debugging of synthetic vessel population dynamics.
```

___

### Amendment 4: EcologyScore — Missing Integration with Time/Weather Tables

**Issue:** Formula references timeWindowAffinity and weatherAffinity but no concrete time window or weather state tables.

**Fix:** Add reference to deferred specs:

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

```markdown
WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review+ ## EcologyScore Dependencies
+ 
+ timeWindowAffinity: Defined in Temporal Ecology section (diurnal patterns).
+ Concrete time window definitions deferred to:
+ `0523F_WOS_MaritimeContinuityDensity_v1.0.0`
+ 
+ weatherAffinity: Defined in Weather Ecology section.
+ Concrete weather state mapping deferred to:
+ `0523E_WOS_MaritimeAtmosphericReadability_v1.0.0`
+ 
+ Until deferred specs exist, implementations may use:
+ - timeWindowAffinity default: 1.0 (neutral)
+ - weatherAffinity default: 1.0 (neutral)
```

___

### Amendment 5: Global Synthetic Budgets — No Dynamic Adjustment

**Issue:** Budgets are static (max 50, target 24). Real harbors may need higher synthetic counts during low AIS periods or lower during high AIS periods.

**Fix:** Add budget adjustment rule:

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

```diff
WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review+ ## Dynamic Synthetic Budget Adjustment
+ 
+ Global budgets may be adjusted based on:
+ - Live AIS vessel count (inverse relationship)
+ - Time of day (higher budget during low-AIS windows)
+ - Weather conditions (reduced budget in fog/rain)
+ 
+ Adjustment formula (recommended):
+ effectiveMax = baseMax * (1 - (liveAISCount / maxExpectedAIS))
+ 
+ Maximum effective ceiling: baseMax * 1.5
+ Minimum effective ceiling: baseMax * 0.25
+ 
+ Dynamic adjustment must be deterministic for replay mode.
```

___

### Amendment 6: Zone Query Strategy — Performance Expectations Underspecified

**Issue:** "Zone lookup must be cached" and "precomputed spatial index or grid buckets" recommended but no performance targets.

**Fix:** Add performance requirements:

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

```diff
WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review+ ## Zone Query Performance Requirements
+ 
+ Zone membership lookup must complete in:
+ - < 0.1ms for cached coordinate (hot path)
+ - < 5ms for uncached coordinate (cold path)
+ 
+ Spatial index must support:
+ - 10,000 zone lookup requests per frame at 60fps
+ - O(log n) or O(1) expected complexity
+ 
+ Implementation options:
+ - Grid hashing (preferred)
+ - R-tree index
+ - Precomputed quadtree
+ 
+ GeoJSON polygon direct evaluation is FORBIDDEN in hot loops.
```

___

## Optional Refinements (Non-Blocking)

### Refinement 1: Add "ANCHORAGE" Zone Type

**Issue:** No zone for vessels at anchor (waiting for berth, weather delays, etc.). Anchorage areas have different density patterns (clustered, low motion).

**Suggested for v1.2.0:**

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

```yaml
WOS Maritime Spawn Ecology v1.1.0 — Infrastructure ReviewzoneType: "ANCHORAGE_ZONE"
dominantClasses: ["CARGO", "TANKER", "INDUSTRIAL"]
densityRange: { min: 0, target: 8, max: 20 }
syntheticCeiling: 4
```

___

### Refinement 2: Add Spawn Cooldown Per Class

Prevents spawning 10 CARGO vessels in rapid succession.

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

```yaml
WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review
const SPAWN_COOLDOWN_SECONDS = {
  CARGO: 300,
  TANKER: 300,
  FERRY: 120,
  RECREATIONAL: 30,
  TUG: 60
}
```

___

### Refinement 3: Seasonal Ecology Patterns

Summer vs winter recreational boating differences.

___

## Constitutional Compliance Check

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

|     0522O Requirement     |                    v1.1.0                     | Status |
|---------------------------|-----------------------------------------------|--------|
|      AIS owns truth       |        ✅ "AIS truth overrides ecology"        |  **PASS**  |
|  Runtime owns continuity  | ✅ Synthetic vessels owned by ContinuityEngine |  **PASS**  |
| Taxonomy defines identity |             ✅ Uses 0523A profiles             |  **PASS**  |
|  No renderer simulation   |      ✅ SpawnEcology does not own motion       |  **PASS**  |
|  Unknown class fallback   |       ✅ UNKNOWN in class distributions        |  **PASS**  |

**Constitutional status: FULLY COMPLIANT**

___

## Relationship to Other Specs

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

|               Spec                |           Relationship            |   Status    |
|-----------------------------------|-----------------------------------|-------------|
| 0523A v1.2.1 (Taxonomy Profiles)  |      Consumes vessel classes      |  ✅ Aligned  |
|    0523B (PopulationHierarchy)    | Subordinate to, interface defined |   ✅ Ready   |
|      0522O (MotionAuthority)      |       Does not override AIS       | ✅ Compliant |
|  0523E (AtmosphericReadability)   |     Weather ecology reference     | ⏸ Deferred  |
|     0523F (ContinuityDensity)     |       Time window reference       | ⏸ Deferred  |
| HarborCoverageEnvelope (deferred) |        Geography reference        | ⏸ Deferred  |

___

## Validation Checklist Status

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

|                       Requirement                       |        Status        |
|---------------------------------------------------------|----------------------|
|            Ecology never overrides AIS truth            |          ✅           |
|          Ecology never mutates lifecycle state          |          ✅           |
|               Ecology never forces routes               |          ✅           |
|           Synthetic vessels explicitly marked           |          ✅           |
|      Synthetic IDs use `synth::maritime::` namespace      |          ✅           |
|        Synthetic vessels never impersonate MMSI         |          ✅           |
| Synthetic vessels owned by ContinuityEngine after spawn |          ✅           |
|      SpawnEcology does not update synthetic motion      |          ✅           |
|         Synthetic vessels have maximum lifetime         |          ✅           |
|          Synthetic vessels have despawn rules           |          ✅           |
|       Synthetic vessels do not reconcile with AIS       |          ✅           |
|         Ecological zones have queryable schema          |          ✅           |
|             Density ranges defined per zone             |          ✅           |
|               FISHING has zone assignment               | ⚠️ Needs Amendment 1 |
|             Spawn authority chain explicit              |          ✅           |
|             AIS conflict resolution defined             |          ✅           |
|               Empty-water states possible               |          ✅           |
|       Ecology subordinate to PopulationHierarchy        |          ✅           |
|          Ecology does not assign HERO directly          |          ✅           |
|            Ecology does not control cameras             |          ✅           |
|          Ecology does not fabricate continuity          |          ✅           |
|               Corridor affinity advisory                |          ✅           |
|              Weather effects probabilistic              |          ✅           |
|      Synthetic vessels cannot persist indefinitely      |          ✅           |
|          Renderer cannot spawn ecology vessels          |          ✅           |

**24 of 25 requirements met. Amendment 1 resolves the remaining.**

___

## Documentation Quality

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

|            Section            |               Quality               |
|-------------------------------|-------------------------------------|
|            Purpose            |                Clear                |
|        Core principles        |   5 principles, well-articulated    |
|     Authority boundaries      |      Explicit ownership tables      |
|          Data model           |      Complete TypeScript types      |
|      Synthetic lifecycle      |    Spawn→Tracking→Expiry→Despawn    |
|        Canonical zones        |      5 zones with full tables       |
|         EcologyScore          |          Weighted formula           |
|   Temporal/Weather ecology    | Diurnal patterns, weather influence |
|         AIS conflict          |      Out-of-zone + coexistence      |
| PopulationHierarchy interface |          Contract defined           |
|     Validation checklist      |              25 items               |
|       Deferred systems        |            Explicit list            |

**Missing:** Example zone GeoJSON reference (deferred to companion artifact, acceptable).

___

## Implementation Readiness

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

|           Component           |               Readiness                |
|-------------------------------|----------------------------------------|
|     Zone data structures      |                 **READY**                  |
|   Class distribution tables   |        **READY** (with Amendment 1)        |
|        Density ranges         |                 **READY**                  |
|    Synthetic ID generation    |                 **READY**                  |
|      Synthetic lifecycle      |                 **READY**                  |
|    AIS conflict resolution    |                 **READY**                  |
| PopulationHierarchy interface |                 **READY**                  |
|  Zone query (spatial index)   |  **CONDITIONAL** (needs performance spec)  |
|       Temporal ecology        |  **CONDITIONAL** (needs time window spec)  |
|        Weather ecology        | **CONDITIONAL** (needs weather state spec) |

___

## Final Status

**Document Status:** **ACCEPT as canonical-draft**

**Stage:** REVIEW → **ready to advance to BUILD after Amendments 1-6**

**Can implement against this spec?** **YES** — with the understanding that:

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

-   Amendment 1 (FISHING in Harbor Utility Zone) should be incorporated
    
-   Zone query performance (Amendment 6) should be implemented per spec
    
-   Deferred references (time windows, weather states) use neutral defaults until those specs exist
    

**Required before BUILD:**

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

-   Amendment 1: Add FISHING to Harbor Utility Zone
    
-   Amendment 6: Zone query performance requirements
    

**Optional before BUILD:**

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

-   Amendments 2, 3, 4, 5 (clarifications and enhancements)
    

___

## Comparison: v1.0.0 → v1.1.0

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

# WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review

|          Aspect          |   v1.0.0   |                      v1.1.0                       |
|--------------------------|------------|---------------------------------------------------|
|          Zones           | Named only | 5 zones + schema + distributions + density ranges |
|      Class weights       |    None    |           Tables per zone (sum to 1.0)            |
|   Synthetic lifecycle    |  Missing   |           Complete spawn→despawn rules            |
|       AIS conflict       | Principle  |          Out-of-zone + coexistence rules          |
|   PopulationHierarchy    | Referenced |            Interface contract defined             |
|        Validation        |  5 items   |                     25 items                      |
| Implementation readiness |     **NO**     |            **YES** (with minor amendments)            |

**v1.1.0 is the implementation spec that v1.0.0 was not.**

___

## Final Statement

> # WOS Maritime Spawn Ecology v1.1.0 — Infrastructure Review
> 
> v1.1.0 provides **implementation-safe spawn ecology infrastructure** for WOS maritime systems. It defines concrete ecological zones with density envelopes, class distribution weights, synthetic vessel lifecycle rules, AIS conflict resolution, and a clear PopulationHierarchy interface. The authority chain is explicit, synthetic vessels are properly namespaced, and empty water remains valid. With Amendments 1 (FISHING in Harbor Utility Zone) and 6 (zone query performance) incorporated, this spec is ready for BUILD.

**Status:** ACCEPT — ready for final amendments and advancement to BUILD stage.