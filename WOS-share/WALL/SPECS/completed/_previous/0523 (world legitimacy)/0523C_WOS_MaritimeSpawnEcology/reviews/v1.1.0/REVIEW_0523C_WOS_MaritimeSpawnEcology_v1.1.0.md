# Architectural Review: 0523C_WOS_MaritimeSpawnEcology_v1.1.0

**Review Type:** Ecology Infrastructure — v1.0.0 Blocking Issue Resolution and Freeze Readiness
**Prior Review:** REVIEW_0523C_WOS_MaritimeSpawnEcology_v1.0.0.md
**Stance:** Verify all prior blocking issues are resolved. Identify any remaining gaps before freeze.

---

## Blocking Issue Resolution from v1.0.0 Review

| Prior Blocking Issue | Status |
|---|---|
| Synthetic vessel motion authority assigned to MaritimeContinuityEngine | ✅ Resolved — explicit in Core Principles §4 and Spawn Authority Chain |
| Synthetic vessel lifecycle defined | ✅ Resolved — spawn, tracking, expiry, despawn, AIS coexistence all specified |
| Spawn authority assigned to exactly one system | ✅ Resolved — authority chain is explicit: PopulationHierarchy → SpawnEcology → MaritimeContinuityEngine |
| Ecological zone schema defined | ✅ Resolved — `MaritimeEcologicalZone` type with geography ref, distribution, density range |
| Density ranges defined per zone | ✅ Resolved — all five zones have `{ min, target, max }` |
| FISHING zone assignment | ✅ Resolved — assigned to Open Recreational Water |
| AIS conflict resolution procedure | ✅ Resolved — explicit section with both scenarios covered |
| Reference to 0523A as taxonomy source | ✅ Resolved — in `depends_on` and canonical references |

All eight blocking issues from the v1.0.0 review are resolved. The spec has made a complete structural jump from stub to implementation-ready draft.

---

## What v1.1.0 Gets Right

The spawn authority chain is the clearest architectural statement in the spec:

```text
PopulationHierarchy → SpawnEcology → MaritimeContinuityEngine → Renderer/Overlay
```

This is correct and unambiguous. The explicit statement "SpawnEcology does not directly insert active vessels into the runtime registry" closes the most dangerous constitutional gap from v1.0.0.

The synthetic ID namespace (`synth::maritime::<zoneId>::<uuid>`) is well-designed. It is human-readable, zone-traceable, and structurally impossible to confuse with MMSI integers.

The EcologyScore formula is a useful calibration tool. Weighting zone affinity (0.35), corridor affinity (0.20), time window (0.20), weather (0.15), and population pressure (0.10) is a reasonable starting distribution.

The validation checklist is now 25 items and covers all prior blocking issues. This is the right level of specificity for a constitutional review artifact.

---

## Remaining Issues

### 1. `classDistribution` Sum Consistency — DATA ERROR

Four of the five zone distributions do not sum to 1.0.

| Zone | Sum |
|---|---|
| Industrial Corridor | 0.32 + 0.22 + 0.16 + 0.16 + 0.10 + 0.04 = **1.00** ✅ |
| Ferry Transit Corridor | 0.38 + 0.24 + 0.14 + 0.10 + 0.08 + 0.06 = **1.00** ✅ |
| Harbor Utility Zone | 0.34 + 0.30 + 0.16 + 0.10 + 0.10 = **1.00** ✅ |
| Open Recreational Water | 0.42 + 0.28 + 0.12 + 0.08 + 0.10 = **1.00** ✅ |
| Strategic Security Corridor | 0.18 + 0.34 + 0.22 + 0.26 = **1.00** ✅ |

All five sum correctly on manual check. No data error — the distributions are internally consistent.

---

### 2. `SyntheticVesselRequest.initialPosition` Uses Local Coordinates

```ts
initialPosition: {
  x: number;
  y: number;
};
```

`x` and `y` are ambiguous. They could be:
- pixel/screen coordinates
- projected map coordinates
- geographic lat/lng

Every other position in the spec chain uses geographic coordinates (`lat`, `lng`). Using `x/y` here creates an inconsistency that will be interpreted differently by different implementers. If a renderer engineer receives a `SyntheticVesselRequest`, they will assume screen space. If the continuity engine receives it, they will assume projected map space.

**Required:** Replace with explicit geographic fields:

```ts
initialPosition: {
  lat: number;
  lng: number;
};
```

This is consistent with `MaritimeMotionTruth` in 0522O and prevents coordinate space ambiguity at the continuity engine's spawn interface.

---

### 3. `requestedLifetimeMs` Has No Minimum Bound

The lifetime formula correctly clamps to `SYNTHETIC_MAX_LIFETIME_MS = 1800000`. But there is no minimum bound. A request for `requestedLifetimeMs: 0` or a negative value is not handled.

A synthetic vessel spawned with zero lifetime would enter and immediately exit the registry within one tick — creating a spawn/despawn cycle that generates telemetry noise and wastes continuity engine resources.

**Required:** Add `SYNTHETIC_MIN_LIFETIME_MS` and clamp from below:

```ts
syntheticLifetimeMs = clamp(
  requestedLifetimeMs,
  SYNTHETIC_MIN_LIFETIME_MS,
  SYNTHETIC_MAX_LIFETIME_MS
);
```

Suggested: `SYNTHETIC_MIN_LIFETIME_MS = 60000` (1 minute). A synthetic vessel that cannot survive at least one full minute is not a meaningful harbor presence contribution.

---

### 4. `SYNTHETIC_SPAWN_INTERVAL` Governance Is Incomplete

The spec defines:

```ts
const SYNTHETIC_SPAWN_INTERVAL_MIN_MS = 30000;
const SYNTHETIC_SPAWN_INTERVAL_MAX_MS = 120000;
```

But does not state:
- Who enforces this interval
- Whether it is per-zone or global
- What happens if PopulationHierarchy requests a spawn faster than the minimum interval

If PopulationHierarchy can request spawns at any rate and SpawnEcology is responsible for rate limiting, that must be stated. If the continuity engine enforces the interval at instantiation time, that must also be stated.

**Required:** Add one sentence:

> Spawn interval enforcement is owned by SpawnEcology. It must not approve more than one synthetic spawn request per zone within `SYNTHETIC_SPAWN_INTERVAL_MIN_MS`, regardless of PopulationHierarchy pressure.

---

### 5. `EcologyPopulationInterface.onVesselCountChanged` Direction Is Reversed

```ts
onVesselCountChanged(
  zoneId: string,
  activeCount: number,
  syntheticCount: number,
  maxCount: number
): void;
```

This is a callback from SpawnEcology to PopulationHierarchy — notifying hierarchy when counts change. But the authority chain places PopulationHierarchy above SpawnEcology. PopulationHierarchy should be pushing budget state down to SpawnEcology, not receiving callbacks from it.

If SpawnEcology is calling `onVesselCountChanged` on PopulationHierarchy, SpawnEcology is notifying its superior of changes it observed — which means SpawnEcology has count authority, not PopulationHierarchy.

**Required clarification:** This method either belongs on a SpawnEcology interface (PopulationHierarchy calling down to notify SpawnEcology of budget changes), or it should be renamed `reportVesselCountToHierarchy()` and its directional role explicitly stated. The current signature reads as SpawnEcology pushing data upward, which inverts the authority chain.

---

### 6. Zone Query Performance Requirement Is Advisory, Not Bounded

The Zone Query Strategy section states:

> zone lookup must be cached  
> repeated coordinate-to-zone checks must avoid expensive polygon scans in hot loops  
> runtime should use precomputed spatial index or grid buckets

"Must be cached" and "should use precomputed spatial index" are contradictory in strength. "Must" implies a hard requirement. "Should" implies a recommendation. A hot-path zone lookup that uses a polygon scan instead of a spatial index will be a performance bottleneck at 200 active vessels, but the spec gives implementers an escape hatch with "should."

**Required:** Normalize the language:

> Zone membership must be resolved via a precomputed spatial index or grid bucket lookup. Direct per-frame polygon scan is forbidden in the runtime hot path. Zone membership may only be recomputed when a vessel's position crosses a zone boundary or on registry initialization.

---

### 7. Temporal Ecology Has No Clock Source

The temporal ecology section gates behavior on time windows (06:00–09:00, etc.) but does not specify which clock provides the time. This is the same clock source ambiguity resolved in 0522Q for the continuity engine.

If temporal ecology reads wall clock time directly (`Date.now()`), it will be non-deterministic in replay mode — ecology will produce different spawn distributions depending on when the replay is run.

**Required:** Add one line:

> Temporal ecology consumes the same injectable clock source as MaritimeContinuityEngine. In deterministic mode, temporal ecology uses the controlled sequence clock. Time-of-day windows are evaluated against simulation time, not wall clock time.

---

### 8. `SyntheticVesselActor.ownedBy` Is a String Literal, Not an Enforced Contract

```ts
ownedBy: "MaritimeContinuityEngine";
```

This field documents ownership intent but does not enforce it. Any system that receives a `SyntheticVesselActor` and reads `ownedBy` can choose to ignore it. The field will not prevent SpawnEcology from later calling a position update on the vessel if that path exists in the codebase.

This is an acceptable limitation for a spec-level data contract — runtime enforcement belongs in implementation. But the spec should acknowledge this and state the enforcement mechanism:

**Required addition:**

> `ownedBy` is a provenance declaration, not a runtime lock. Enforcement is structural: SpawnEcology must not expose any method that accepts a `syntheticId` and mutates position, heading, speed, or lifecycle state. The absence of such methods is the enforcement mechanism.

---

## Minor Observations

### EcologyScore Population Pressure Weight Is Low

`populationPressure × 0.10` is the lowest weight in the EcologyScore formula. Population pressure is the signal that prevents over-spawning — if the harbor is already dense, synthetic vessels should become less likely. A 10% weight means a harbor at 90% capacity still produces ecology scores that are 90% driven by zone, time, weather, and corridor affinity, with only 10% suppression from density. This may produce over-spawning under load.

This is a calibration observation, not a blocking issue. Flag for tuning during harbor population scale testing.

### Strategic Security Corridor `UNKNOWN: 0.26` Is Unusually High

The security zone has a 26% unknown vessel distribution — higher than any other zone. This means roughly 1 in 4 synthetic vessels in a security zone would be classified UNKNOWN. This may be intentional (restricted zone, vessels don't broadcast clearly) but it should be confirmed as deliberate, not a default carry-over.

### `SYNTHETIC_HARBOR_MODE` as a `spawnReason` Has No Definition

The `spawnReason` enum includes `"SYNTHETIC_HARBOR_MODE"` but this mode is not defined anywhere in the spec. What is synthetic harbor mode? When is it active? Who enables it? This should either be defined or removed from the enum until it has a governing spec.

---

## Final Assessment

---

### Review Status

**CONDITIONAL APPROVE — Two required fixes, one required clarification.**

The spec successfully resolves all eight blocking issues from v1.0.0. It is architecturally sound and constitutionally compliant. The authority chain is explicit. Synthetic vessel motion ownership is unambiguous. The lifecycle rules are deterministic. The zone schema is queryable and typed.

The remaining issues are precision gaps, not structural failures.

---

### Freeze Readiness

**NEARLY READY.** Two fixes are required before freeze. After those, this spec is implementable.

---

### Required Before Freeze (Blocking)

1. **Replace `initialPosition: { x, y }` with `{ lat, lng }`** — coordinate space must be geographic, consistent with the rest of the spec chain.
2. **Define `onVesselCountChanged` direction and ownership** — either invert to PopulationHierarchy pushing down, or rename and explicitly state it is SpawnEcology reporting upward.

---

### Required Before Freeze (Non-Blocking)

3. Add `SYNTHETIC_MIN_LIFETIME_MS` and clamp `requestedLifetimeMs` from below.
4. Add spawn interval enforcement ownership — SpawnEcology enforces per-zone rate limiting.
5. Normalize zone query language — replace "should use" with "must use" for spatial index requirement.
6. Add temporal ecology clock source — injectable clock, simulation time not wall clock.
7. Add `ownedBy` enforcement mechanism note — absence of mutation methods is the contract.
8. Define or remove `SYNTHETIC_HARBOR_MODE` spawn reason.

---

### Highest Residual Risk After Freeze

**Temporal ecology wall clock dependency.** If temporal ecology reads system time rather than simulation time, every deterministic replay will produce different spawn distributions depending on time of day. This is a silent non-determinism that will not surface until replay testing is attempted — at which point harbor population behavior will be unreproducible across sessions.
