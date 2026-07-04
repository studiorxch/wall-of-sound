# Architectural Review: 0523C_WOS_MaritimeSpawnEcology_v1.2.0

**Review Type:** Ecology Infrastructure — v1.1.0 Blocking Issue Resolution and Freeze Readiness
**Prior Review:** REVIEW_0523C_WOS_MaritimeSpawnEcology_v1.1.0.md
**Stance:** Verify all prior blocking and non-blocking issues are resolved. Assess freeze readiness.

---

## Blocking Issue Resolution from v1.1.0 Review

| Prior Issue | Status |
|---|---|
| `initialPosition: { x, y }` → `{ lat, lng }` | ✅ Resolved — `SyntheticVesselRequest` now uses `lat/lng` |
| `onVesselCountChanged` direction inverted | ✅ Resolved — replaced by `updatePopulationBudgetState()` flowing downward from PopulationHierarchy |
| `SYNTHETIC_MIN_LIFETIME_MS` missing | ✅ Resolved — `60000ms` defined and clamped |
| Spawn interval enforcement ownership | ✅ Resolved — SpawnEcology owns per-zone rate limiting |
| Zone query language advisory vs mandatory | ✅ Resolved — polygon scan in hot loops is now explicitly forbidden |
| Temporal ecology clock source | ✅ Resolved — injectable simulation clock, wall-clock reads forbidden in deterministic mode |
| `ownedBy` enforcement note | ✅ Resolved — structural enforcement by absence of mutation methods is stated |
| `SYNTHETIC_HARBOR_MODE` undefined | ✅ Resolved — defined with explicit activation constraints |

All eight non-blocking issues from the v1.1.0 review are resolved.

---

## What v1.2.0 Gets Right

The changelog is an excellent addition. Documenting what was Added, Changed, and Preserved makes the spec's intent auditable and protects against future regression. The "Preserved" section is particularly valuable — it affirms that all prior constitutional commitments survived the revision.

The `updatePopulationBudgetState()` interface direction is now correct. Budget state flows downward. The prohibition on recursive call chains during budget updates closes a subtle reentrancy risk that could cause priority inversion under population pressure.

The Synthetic Kinematic Boundary Contract is the most architecturally significant new addition. It correctly identifies the problem — synthetic vessels have no AIS telemetry and will drift indefinitely without intervention — and correctly assigns the containment solution to MaritimeContinuityEngine rather than SpawnEcology. The forbidden list (SpawnEcology steering, renderer steering, wake system steering) is comprehensive.

The zone query performance targets (`< 0.1ms cached`, `< 5ms cold`, `O(1) or O(log n)`) are the right level of specificity for a spec-level performance contract.

The validation checklist at 35 items now covers every prior blocking issue. It is implementation-auditable.

---

## Remaining Issues

### 1. `maxCoordinateEnvelope` in `SyntheticVesselRequest` Has No Enforcement Owner

The new field:

```ts
maxCoordinateEnvelope: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};
```

Is introduced in `SyntheticVesselRequest` but its enforcement owner is not stated. Three candidate owners exist:

1. **SpawnEcology** — validates the envelope at request creation time
2. **MaritimeContinuityEngine** — enforces containment during motion
3. **Both** — SpawnEcology validates at creation, engine enforces at runtime

If SpawnEcology owns the envelope, it needs to know the zone's geographic bounds at request time — which requires a zone polygon lookup, putting SpawnEcology back in the hot path for geographic queries.

If MaritimeContinuityEngine owns the envelope, it needs to check containment on every tick for synthetic vessels — which adds O(n) geographic checks to the hot path.

The Synthetic Kinematic Boundary Contract section references `maxCoordinateEnvelope` as advisory input for the continuity engine's internal path selection, but "advisory" and "enforcement" are different things. If the envelope is advisory, a synthetic vessel can still exit it. If it is enforced, who enforces it must be stated.

**Required:** State explicitly whether `maxCoordinateEnvelope` is an advisory hint or a hard boundary, and which system owns enforcement. Recommended resolution:

> `maxCoordinateEnvelope` is a hard boundary enforced by MaritimeContinuityEngine. If a synthetic vessel's predicted position would exit the envelope on the next tick, the engine applies the nearest in-zone correction or initiates despawn. SpawnEcology is responsible for providing a valid envelope at request time. MaritimeContinuityEngine may reject requests with envelopes smaller than the vessel class's minimum turning radius.

---

### 2. Dynamic Synthetic Budget Formula Uses `maxExpectedAIS` — Undefined

The dynamic budget adjustment formula:

```ts
effectiveMax =
  baseMax * clamp(
    1 - (liveAISCount / maxExpectedAIS),
    0.25,
    1.5
  );
```

References `maxExpectedAIS` — a value that is not defined anywhere in this spec or referenced from another spec. Without a defined value, two engineers will implement different numbers, producing different synthetic vessel populations under the same AIS load.

The clamp upper bound of `1.5` also allows the effective synthetic ceiling to be 50% higher than `baseMax` when `liveAISCount` is zero. This means that in a harbor with no live AIS data (pure synthetic mode), the synthetic population can exceed its base ceiling by 50% — which may conflict with `GLOBAL_MAX_SYNTHETIC_VESSELS = 50`.

**Required:**
1. Define `maxExpectedAIS` or reference the spec that owns it.
2. Clarify whether the `1.5` upper clamp can breach `GLOBAL_MAX_SYNTHETIC_VESSELS`, or whether `effectiveMax` is always clamped to that ceiling as a final step.

---

### 3. Synthetic Vessel Telemetry Emission Timing Is Undefined

The telemetry section defines what to emit (`syntheticId`, `zoneId`, `spawnTimeMs`, `despawnReason`, etc.) but not when. Two critical timing questions:

- Is telemetry emitted at spawn, despawn, or both?
- Is despawn telemetry emitted synchronously (before the vessel is removed from the registry) or asynchronously (after)?

If despawn telemetry is asynchronous, a race condition exists where the vessel is evicted from the registry before its telemetry is written — making the despawn event unobservable in a fast eviction cycle.

**Required:** Add one line:

> Spawn telemetry is emitted synchronously at instantiation. Despawn telemetry is emitted synchronously before registry eviction. No synthetic vessel may be removed from the registry without a telemetry emit completing first.

---

### 4. Harbor Utility Zone `classDistribution` Sum Is 1.00 But FISHING Was Added

The v1.1.0 Harbor Utility Zone distribution was:

```ts
{ TUG: 0.34, SERVICE: 0.30, INDUSTRIAL: 0.16, CARGO: 0.10, UNKNOWN: 0.10 }
// sum = 1.00
```

v1.2.0 adds FISHING to secondary classes and updates the distribution to:

```ts
{ TUG: 0.32, SERVICE: 0.28, INDUSTRIAL: 0.16, CARGO: 0.09, FISHING: 0.05, UNKNOWN: 0.10 }
// sum = 1.00 ✅
```

Sum checks out. No issue — confirming the fix was correctly applied.

---

### 5. Spawn Interval Applies Per-Zone — But Global Budget Has No Interval

The spawn interval rule states:

> SpawnEcology must not approve more than one synthetic spawn request per zone within `SYNTHETIC_SPAWN_INTERVAL_MIN_MS`.

This is a per-zone rate limit. But there is no global spawn interval. A harbor with 5 active zones could approve 5 simultaneous spawn requests — one per zone — on the same tick. At `SYNTHETIC_SPAWN_INTERVAL_MIN_MS = 30000`, this means up to 5 synthetic vessels could be instantiated in a single tick window, each within their own zone budget.

Under normal conditions this is acceptable. Under population pressure recovery (e.g., after a mass synthetic despawn), all zones could simultaneously request maximum spawn — producing a burst that could spike the continuity engine's instantiation load.

**Recommended addition (non-blocking):**

> A global spawn rate limit of `GLOBAL_SYNTHETIC_SPAWN_INTERVAL_MS = 5000` (one spawn per 5 seconds across all zones) provides a secondary throttle. This does not replace per-zone intervals but prevents simultaneous multi-zone burst spawning under pressure recovery conditions.

---

### 6. No Defined Behavior If `getSpawnCandidates` Returns Empty

The `EcologyPopulationInterface` exposes `getSpawnCandidates(zoneId, count, context)`. The return type is `SyntheticVesselRequest[]`. The spec does not state what callers should do when the result is empty.

An empty result could mean:
- Zone silence is active (expected, no action needed)
- Budget is exhausted (expected, back off)
- Zone has no valid spawn positions (unexpected, may warrant telemetry)

Without a defined response contract, callers will implement different retry strategies — some will retry immediately, some will wait, some will escalate to PopulationHierarchy.

**Required:** Add a brief return contract:

> An empty result from `getSpawnCandidates` is a valid ecological response. Callers must not retry within the current `SYNTHETIC_SPAWN_INTERVAL_MIN_MS` window. No fault is raised on empty results. If the caller needs to distinguish silence from budget exhaustion, a separate `getZoneEcologyState(zoneId)` query should be used rather than inferring from an empty candidates array.

---

## Minor Observations

### Strategic Security Corridor `UNKNOWN: 0.26` Explanation Is Now Adequate

The note added in v1.2.0 — "UNKNOWN is intentionally elevated here to represent restricted or ambiguous observed presence. It must not be interpreted as missing data." — resolves the calibration concern raised in the v1.1.0 review. No action required.

### EcologyScore Default Affinities Are a Useful Interim Contract

`DEFAULT_TIME_WINDOW_AFFINITY = 1.0` and `DEFAULT_WEATHER_AFFINITY = 1.0` as neutral defaults pending 0523E and 0523F is the correct approach. It prevents null checks in the scoring function while making the dependency on those specs explicit.

### `populationPressure` Weight at 0.10 — Calibration Note Preserved

The calibration concern from v1.1.0 (10% population pressure weight may allow over-spawning under load) remains an open tuning question. The dynamic budget formula partially addresses this by reducing `effectiveMax` under high AIS load, but the EcologyScore formula itself still gives population pressure the lowest weight. This should be revisited during harbor population scale testing.

---

## Final Assessment

---

### Review Status

**CONDITIONAL APPROVE — One required fix, one required clarification before freeze.**

v1.2.0 is the strongest version of this spec. All prior blocking issues are resolved. The constitutional authority chain is intact. The synthetic vessel motion ownership is unambiguous. The determinism requirements are explicit. The spec is one targeted revision away from freeze-ready.

---

### Freeze Readiness

**NEARLY READY.** Two items required before freeze.

---

### Required Before Freeze (Blocking)

1. **Define `maxCoordinateEnvelope` enforcement owner** — advisory hint vs hard boundary; which system enforces containment and how violations are handled.
2. **Define `maxExpectedAIS`** — the dynamic budget formula is non-deterministic without this value; define it or reference the spec that owns it. Clarify whether the 1.5x upper clamp can breach `GLOBAL_MAX_SYNTHETIC_VESSELS`.

---

### Required Before Freeze (Non-Blocking)

3. Define telemetry emission timing — synchronous at spawn and before eviction at despawn.
4. Define `getSpawnCandidates` empty-result contract — valid ecology response, no retry within current interval.
5. Consider global spawn rate limit to prevent multi-zone burst under pressure recovery.

---

### Highest Residual Risk After Freeze

**`maxCoordinateEnvelope` without an enforcement owner.** If this field is advisory and MaritimeContinuityEngine does not actively contain synthetic vessels within their zone bounds, synthetic vessels will drift across zone boundaries, accumulate in unintended zones, and corrupt the harbor ecology that the population hierarchy is trying to maintain. A synthetic CARGO vessel that originated in the Industrial Corridor but drifted into the Ferry Transit Corridor will distort density counts, influence synthetic ceiling calculations, and produce incorrect spawn suppression in the wrong zones — all silently.
