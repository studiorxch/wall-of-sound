# Architectural Review: 0523C_WOS_MaritimeSpawnEcology_v1.2.1

**Review Type:** Patch Completion — v1.2.0 Blocking Issue Resolution
**Prior Review:** REVIEW_0523C_WOS_MaritimeSpawnEcology_v1.2.0.md
**Stage:** [BUILD] — reviewing against GO decision

---

## Blocking Issue Resolution from v1.2.0 Review

| Prior Issue | Status |
|---|---|
| `maxCoordinateEnvelope` enforcement owner undefined | ✅ Resolved — derives from ecological zone geographic bounds; request rejected if bounds unavailable |
| `maxExpectedAIS` undefined in dynamic budget formula | ✅ Resolved — `populationPressure` sourced from latest `updatePopulationBudgetState()`, no live queries |

Both blocking issues are resolved.

---

## Non-Blocking Issue Resolution from v1.2.0 Review

| Prior Issue | Status |
|---|---|
| Telemetry emission timing undefined | ✅ Resolved — rejection telemetry is explicit; implied by rejection handling semantics |
| `getSpawnCandidates` empty-result contract | ✅ Resolved — rejection advances interval as if succeeded; no retry chains |
| Global spawn rate limit for multi-zone burst | ✅ Resolved — global vs local budgets must both pass independently |

---

## What v1.2.1 Gets Right

**Rejection handling is now deterministic.** The rule "interval advances as if request succeeded" on rejection is the correct design. It prevents SpawnEcology from hammering the continuity engine with retries during pressure conditions, and it keeps the spawn timing deterministic regardless of whether requests are accepted or rejected.

**`populationPressure` ownership is clean.** Sourcing it exclusively from the last `updatePopulationBudgetState()` call — with no live PopulationHierarchy queries — preserves the downward-only budget flow established in v1.2.0 and eliminates the reentrancy risk.

**Deterministic spawn interval formula is correct.** `lerp(MAX, MIN, ecologyScore)` produces a deterministic interval that shortens as ecological conditions favor spawning and lengthens under low-score conditions. This is the right calibration direction.

**The forbidden list for clock and RNG sources is explicit.** `Date.now()`, `performance.now()`, and `Math.random()` are all named. The allowed alternatives — simulation clock and seeded RNG — are named. This is sufficient for implementation.

---

## Remaining Issues

### 1. `maxCoordinateEnvelope` Enforcement Is Rejection-Only — Drift After Spawn Is Unaddressed

The resolution states:

> Envelope derives from ecological zone geographic bounds. If bounds are unavailable: reject request.

This closes the pre-spawn validation gap. But the v1.2.0 review's core concern was post-spawn drift — a synthetic vessel that receives an initial position within its zone but then drifts outside it after MaritimeContinuityEngine begins driving its motion.

The Synthetic Kinematic Boundary Contract in v1.2.0 assigned containment to MaritimeContinuityEngine, listing allowed solutions (bounded route loop, zone-contained kinematic curve, fade-and-evict before boundary breach). But v1.2.1 does not confirm that the `maxCoordinateEnvelope` is enforced at runtime, only that the request is rejected if bounds are unavailable at spawn time.

These are two different enforcement points. The patch closes one and leaves the other implicit.

**Required clarification (non-blocking for BUILD, but must be addressed before population scale testing):**

> `maxCoordinateEnvelope` is provided to MaritimeContinuityEngine at instantiation. The engine is responsible for using it to contain synthetic vessel motion after spawn. Boundary enforcement implementation details are owned by the continuity engine, not SpawnEcology.

This should be added either here or in a follow-up continuity engine spec.

---

### 2. `weatherState: string | null` Is Weakly Typed

`EcologyContext` uses:

```ts
weatherState: string | null;
```

A raw string is not a sufficient contract for downstream systems that need to branch on weather state. If the ecology score formula applies different `weatherAffinity` values based on weather conditions, implementers need to know what string values are valid. An arbitrary string allows:

- `"rainy"` vs `"RAIN"` vs `"rain"` — case inconsistency
- `"foggy"` vs `"fog"` vs `"low_visibility"` — semantic fragmentation
- `null` — neutral/unknown state, which is documented nowhere

**Required:** Either replace with a typed enum or reference the spec that defines valid weather state values:

```ts
weatherState: WeatherState | null;
// where WeatherState is defined in 0523E_WOS_MaritimeAtmosphericReadability
```

This is a low-effort fix that prevents a common cross-team string mismatch class of bugs.

---

### 3. Seeded RNG Source Is Not Specified

The patch correctly forbids `Math.random()` and permits "deterministic seeded RNG." But it does not specify:

- What seeds the RNG
- Where the seed comes from
- Whether the seed is per-session, per-zone, or per-vessel-class
- Whether the seed is serialized as part of replay state

Without a seed source, two engineers will produce different RNG implementations that are individually deterministic but non-equivalent across systems — defeating the replay guarantee.

**Required:** Add one line:

> The seeded RNG seed is derived from the session's deterministic replay seed, as defined in the ContinuityDoctrineSuite. SpawnEcology does not own the seed value. It receives a seeded RNG instance from the runtime at initialization.

---

## Final Assessment

---

### Review Status

**APPROVE WITH NOTES — BUILD/GO decision is supportable.**

The two blocking issues from v1.2.0 are resolved. The non-blocking issues are addressed. The spec is implementable. The remaining items are precision notes that should be resolved during implementation or in the continuity engine spec — they do not block build start.

---

### Freeze Status

**FROZEN as of v1.2.1.** The 0523C spec chain is complete.

---

### Pre-Build Notes (Non-Blocking)

1. Clarify that `maxCoordinateEnvelope` post-spawn enforcement is owned by MaritimeContinuityEngine — close the loop on the drift-after-spawn question before population scale testing.
2. Replace `weatherState: string | null` with a typed enum or a reference to the owning spec.
3. Define seeded RNG seed source — session replay seed, injected at initialization, not owned by SpawnEcology.

---

### 0523C Spec Chain Summary

| Version | Status | Key Contribution |
|---|---|---|
| v1.0.0 | Superseded | Initial draft — synthetic authority unassigned |
| v1.1.0 | Superseded | Zone schema, lifecycle, authority chain established |
| v1.2.0 | Superseded | Coordinate contract, budget direction, determinism hardened |
| v1.2.1 | **FROZEN** | Rejection handling, clock ownership, envelope validation, BUILD/GO |
