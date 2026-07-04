# Architectural Review: 0523D_WOS_MaritimeWakeAuthority_v1.1.0

**Review Type:** Wake Infrastructure — v1.0.0 Blocking Issue Resolution and Freeze Validation
**Prior Review:** REVIEW_0523D_WOS_MaritimeWakeAuthority_v1.0.0.md
**Stage:** [FREEZE — GO] — reviewing against freeze decision

---

## Blocking Issue Resolution from v1.0.0 Review

| Prior Blocking Issue | Status |
|---|---|
| `shouldEmitWakeSegment` decision logic undefined | ✅ Resolved — Section 11 defines canonical ordered emission evaluation, 8-step sequence |
| `emitWakeSegment` missing `previousEmission` parameter | ✅ Resolved — Section 12 adds parameter; null behavior and geometry derivation rules defined |
| `WakeDecayResult` type undefined | ✅ Resolved — Section 16 defines type and canonical contract |
| AIS recovery wake bridge exception ambiguous | ✅ Resolved — Section 15: "No exceptions exist for coasting state. Telemetry gaps remain historically visible." |

All four blocking issues from v1.0.0 are resolved.

---

## Non-Blocking Issue Resolution from v1.0.0 Review

| Prior Issue | Status |
|---|---|
| `maxExpectedSpeedKts` source undefined | ✅ Resolved — Section 13: sourced from `taxonomy.motionEnvelope.maxExpectedSpeedKts` |
| `simulationTimeMs` clock source unspecified | ✅ Resolved — Section 18: same injectable clock as MaritimeContinuityEngine |
| `WAKE_MAX_SEGMENTS_PER_ZONE` undefined | ✅ Resolved — Section 7: `800` |
| Synthetic wake lifetime clamp formula missing | ✅ Resolved — Section 14: explicit clamp formula |
| `eligible` field ownership undefined | ✅ Resolved — Section 10: resolved by `resolveWakeEligibility()` before emission |
| Population tier enum re-declared inline | ✅ Resolved — Section 4 references 0523B as authoritative |
| `wakeId` generation format undefined | ✅ Resolved — Section 5: `wake::<vesselId>::<createdAtMs>` |

All seven non-blocking issues from v1.0.0 are resolved.

---

## What v1.1.0 Gets Right

**The ring buffer doctrine is the strongest new addition.** Fixed-allocation, O(1) mutation, deterministic overwrite ordering — this is the correct architecture for a system that must remain performant at harbor scale without triggering GC pressure. Prohibiting `array.splice()` loops explicitly is the right level of specificity for an implementation governance spec.

**The vessel eviction doctrine is architecturally elegant.** `parentEvicted = true` triggering a 4× accelerated decay cascade — rather than immediate culling — preserves atmospheric residue without implying active occupancy. The problem it solves (a vessel disappears and its wake vanishes simultaneously, creating an obvious visual discontinuity) is real, and the solution is correct.

**The wake bridge prohibition is now unconditional.** "No exceptions exist for coasting state" is the right call. The ambiguous coasting exception from v1.0.0 has been removed cleanly.

**The ordered emission evaluation (Section 11) is the spec's most important implementation contract.** Putting HERO survivability before per-vessel budget checks (4 before 5) ensures that global budget pressure suppresses mid/background vessels before touching HEROs. This is correct harbor behavior.

---

## Remaining Issues

### 1. `WakeEmitterState` Lost Fields From v1.0.0 — Implementation Gap

v1.0.0 defined `WakeEmitterState` with eight fields:

```ts
vesselId, vesselClass, provenance, populationTier,
wakeClass, wakeAuthority, wakeWidthFactor,
wakePersistenceFactor, turbulenceFactor,
shorelineInteractionFactor, eligible
```

v1.1.0 reduces this to four fields:

```ts
eligible, wakeClass, populationTier, provenance
```

The removed fields — `wakeAuthority`, `wakeWidthFactor`, `wakePersistenceFactor`, `turbulenceFactor`, `shorelineInteractionFactor` — are still referenced in the wake intensity formula and wake geometry construction. If they are no longer on `WakeEmitterState`, they must come from somewhere when `emitWakeSegment` runs.

The function signature `emitWakeSegment(emitter, vessel, previousEmission, simulationTimeMs)` suggests `vessel: VesselRuntimeState` carries these values. But `VesselRuntimeState` is still not typed in this spec. If the wake factors are sourced from the taxonomy profile at emission time rather than pre-resolved into the emitter, that is a valid architectural choice — but it must be stated explicitly.

**Required:** State where `wakeAuthority`, `wakeWidthFactor`, `wakePersistenceFactor`, and `turbulenceFactor` are sourced during `emitWakeSegment`. Either add them back to `WakeEmitterState`, or confirm they are resolved from the compiled taxonomy profile passed inside `vessel`.

---

### 2. `WakeSegment` Added `parentEvicted: boolean` Without an Update Path

`WakeSegment` fields are all `readonly`. This is correct — segments should be immutable once emitted. But Section 17 requires setting `parentEvicted = true` when an upstream vessel is evicted.

A `readonly` field cannot be mutated after creation. Two resolution paths exist:

1. `parentEvicted` is set at emission time (always `false`) and the eviction behavior is applied by replacing the segment with a new one carrying `parentEvicted: true` — but this breaks the `wakeId` stability doctrine (same `vesselId` + `createdAtMs` = same `wakeId`).

2. `parentEvicted` is not `readonly` — it is the one mutable field on an otherwise immutable segment.

The spec declares all fields `readonly` including `parentEvicted`, which makes the eviction doctrine unimplementable as written.

**Required:** Either:
- Remove `readonly` from `parentEvicted` and add a note that it is the sole mutable field, mutated only by the eviction path in WakeAuthority.
- Or replace `parentEvicted: boolean` with a separate `WakeSegmentEvictionState` overlay keyed by `wakeId`, so segments remain fully immutable and eviction state is tracked externally.

---

### 3. Ordered Emission Evaluation Step 4 Has a Suppression Gap

The canonical emission ordering is:

```
1. eligible == false → reject
2. wakeClass == NONE → reject
3. populationTier == GHOST → reject
4. global wake budget exceeded → reject
5. per-vessel budget exceeded → reject
6. emit interval not satisfied → reject
7. minimum distance not satisfied → reject
8. emit
```

Step 4 rejects on global budget exceeded — but it does not distinguish between AIS and synthetic budget pools. The spec defines separate budgets:

```ts
WAKE_MAX_SEGMENTS_GLOBAL = 5000
WAKE_MAX_SYNTHETIC_SEGMENTS_GLOBAL = 1000
```

A synthetic vessel hitting the synthetic global ceiling at step 4 should be rejected on the synthetic budget, not the total global budget. An AIS vessel should never be rejected because the synthetic budget is full.

As written, step 4 is ambiguous: does it check total segments against `WAKE_MAX_SEGMENTS_GLOBAL`, or does it check provenance-appropriate budgets?

**Required:** Split step 4 into provenance-aware checks:

```
4a. provenance == AIS_VESSEL AND global AIS+synthetic segments >= WAKE_MAX_SEGMENTS_GLOBAL → reject
4b. provenance == SYNTHETIC_ECOLOGY AND synthetic segments >= WAKE_MAX_SYNTHETIC_SEGMENTS_GLOBAL → reject
```

This prevents synthetic overflow from suppressing AIS wake emission.

---

### 4. `resolveWakeEligibility()` Is Referenced but Not Specified

Section 10 states that `eligible` is resolved by `resolveWakeEligibility()`. Section 11 uses `emitter.eligible` as step 1 of the emission check. But `resolveWakeEligibility()` has no defined signature, no defined inputs, and no defined rules.

This is the same gap that existed with `shouldEmitWakeSegment` in v1.0.0 — a gating function named but not specified.

**Required:** Define the function signature and eligibility conditions:

```ts
function resolveWakeEligibility(
  vessel: VesselRuntimeState,
  taxonomyProfile: CompiledMaritimeVesselTaxonomyProfile
): boolean {}
```

Eligibility conditions at minimum:
- vessel lifecycle state is TRACKING or COASTING (not DORMANT, SPAWNING, or RESPAWNING)
- vessel speed exceeds minimum threshold (e.g., `speedKts > 0.5`)
- taxonomy `wakeClass` is not `NONE`
- vessel provenance is valid

---

### 5. `wakeId` Stability Under Replay Has a Collision Risk

The canonical wake ID format is:

```text
wake::<vesselId>::<createdAtMs>
```

Under replay, if the same vessel emits two wake segments within the same simulation millisecond (possible if the simulation clock has low resolution or if two emission events are processed in the same tick), both segments would receive the same `wakeId`. Ring buffer overwrite behavior would then write the second over the first — silently discarding a valid segment.

At `WAKE_EMIT_INTERVAL_HERO_MS = 500ms`, this is unlikely in production. But in deterministic replay with time compression or catch-up ticking, the same millisecond timestamp could be assigned to multiple emission events.

**Required:** Add a per-vessel emission sequence counter as a tiebreaker:

```text
wake::<vesselId>::<createdAtMs>::<sequenceIndex>
```

Where `sequenceIndex` is a per-vessel monotonic counter reset on SPAWNING. This guarantees uniqueness without introducing randomness, while remaining deterministic and replay-stable.

---

## Minor Observations

### `wakeClass` Enum Changed Between Versions

v1.0.0 defined:
```ts
"NONE" | "NARROW" | "STANDARD" | "WIDE" | "HEAVY" | "TURBULENT"
```

v1.1.0 defines:
```ts
"NONE" | "MINIMAL" | "STANDARD" | "HEAVY"
```

`NARROW`, `WIDE`, and `TURBULENT` were removed and `MINIMAL` was added. This is a breaking change relative to the taxonomy profiles in 0523A v1.2.0, which defines `WakeClass` as `"NONE" | "NARROW" | "STANDARD" | "WIDE" | "HEAVY" | "TURBULENT"`.

The taxonomy and wake authority specs now disagree on valid wake class values. Before freeze, one of the two must be updated to match the other, or a mapping between them must be defined.

### `WAKE_MAX_SEGMENTS_PER_VESSEL = 48` Not in Section 7

Section 7 defines:

```ts
WAKE_MAX_SEGMENTS_GLOBAL = 5000
WAKE_MAX_SYNTHETIC_SEGMENTS_GLOBAL = 1000
WAKE_MAX_SEGMENTS_PER_VESSEL = 48
WAKE_MAX_SEGMENTS_PER_ZONE = 800
```

But the per-tier maximums from v1.0.0 (`WAKE_MAX_SEGMENTS_PER_HERO = 120`, etc.) are removed. The per-vessel cap is now flat at 48 regardless of tier. This means a HERO vessel has the same segment cap as a BACKGROUND vessel, which may suppress HERO wake quality under a full vessel registry. This is a calibration concern, not a blocking issue, but it should be a deliberate choice rather than an accidental omission.

---

## Final Assessment

---

### Review Status

**CONDITIONAL APPROVE — Two blocking issues, one required cross-spec fix.**

The four blocking issues from v1.0.0 are all resolved. The constitutional posture is strong. The ring buffer doctrine, eviction decay cascade, unconditional bridge prohibition, and ordered emission evaluation are all correct and well-specified.

The remaining blockers are precision gaps introduced by the v1.1.0 revision itself — not regressions from prior reviews.

---

### Freeze Readiness

**NOT YET FROZEN — Three items required before the FREEZE — GO decision holds.**

---

### Required Before Freeze (Blocking)

1. **Resolve `parentEvicted: boolean` readonly conflict** — a `readonly` field cannot be set post-emission; either remove `readonly` from this field specifically or track eviction state externally.
2. **Split emission step 4 into provenance-aware budget checks** — synthetic budget overflow must not suppress AIS wake emission.
3. **Reconcile `wakeClass` enum with 0523A v1.2.0** — the two specs define different valid values; one must be updated.

---

### Required Before Freeze (Non-Blocking)

4. State where `wakeAuthority`, `wakeWidthFactor`, `wakePersistenceFactor`, `turbulenceFactor` are sourced during `emitWakeSegment` — removed from `WakeEmitterState` in v1.1.0 but still needed for geometry construction.
5. Define `resolveWakeEligibility()` signature and conditions.
6. Add sequence counter to `wakeId` format to prevent same-millisecond collisions under replay time compression.

---

### Highest Residual Risk After Freeze

**`wakeClass` enum divergence between 0523A and 0523D.** Both specs are currently in circulation. Any system that reads `wakeClass` from the taxonomy profile and passes it to the wake authority will encounter a type mismatch — either at compile time in TypeScript or silently at runtime in JavaScript. `TURBULENT` from the taxonomy will not match any value in the wake authority's reduced enum, and the resulting behavior (silent fallback to STANDARD? runtime error?) is undefined. This is a cross-spec consistency failure that will surface on the first integration attempt.
