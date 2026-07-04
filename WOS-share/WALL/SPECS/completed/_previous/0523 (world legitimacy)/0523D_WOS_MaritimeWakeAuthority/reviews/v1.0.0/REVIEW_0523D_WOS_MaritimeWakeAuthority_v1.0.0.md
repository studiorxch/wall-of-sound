# Architectural Review: 0523D_WOS_MaritimeWakeAuthority_v1.0.0

**Review Type:** Wake Infrastructure — Constitutional Compliance and Implementation Readiness
**Prior Chain:** 0522O → 0522P → 0522Q → 0523A → 0523B → 0523C → 0523D
**Stance:** Wake is the first system in the chain that writes persistent spatial state independent of vessel position. That makes renderer boundary enforcement and lifecycle independence the primary constitutional risks.

---

## What This Spec Gets Right

The core principle — "vessel motion creates wake memory; wake memory never creates vessel motion" — is the right constitutional anchor for this system. The dormancy/eviction rules correctly prevent wake persistence from keeping vessels alive. The explicit prohibition on fabricating a wake bridge across missing telemetry closes a subtle continuity resurrection vector that would otherwise be exploited.

The `WakeSegment` schema is well-designed. `sourceContinuityConfidence` as a field on the segment — not just on the vessel — is architecturally sound. It captures the confidence at the moment of emission, which is what matters for rendering fidelity decisions. A renderer that reads current confidence would see a different value than the one that was true when the segment was emitted.

The tier-based emission cadence (HERO: 500ms, MID: 1000ms, BACKGROUND: 3000ms, GHOST: 0) is correctly scaled. GHOST emitting nothing to WakeRegistry while allowing symbolic renderer shimmer — with the explicit note that shimmer is not registry truth — is the right boundary.

The provenance separation between `AIS_VESSEL` and `SYNTHETIC_ECOLOGY` is clean and complete.

---

## Issues

### 1. `shouldEmitWakeSegment` Has No Defined Contract — HIGH RISK

The function signature is declared:

```ts
function shouldEmitWakeSegment(
  emitter: WakeEmitterState,
  previousEmission: WakeSegment | null,
  simulationTimeMs: number
): boolean {}
```

But its decision logic is not specified. This function is the gatekeeper for all wake emission. Without a defined contract, two engineers will implement it differently. Key questions left open:

- Does it check the per-tier emit interval against `simulationTimeMs - previousEmission.createdAtMs`?
- Does it check minimum segment distance (`WAKE_MIN_SEGMENT_DISTANCE_M = 8`)?
- Does it check global budget before emitting?
- Does it check per-vessel budget?
- Does it check `emitter.eligible`?
- What is the priority order of these checks?

If global budget check happens before eligibility check, a vessel in a full harbor suppresses its wake even when it would otherwise be eligible — which may or may not be the intended behavior.

**Required:** Define the decision logic as an ordered check sequence:

```text
1. emitter.eligible == false → return false
2. emitter.wakeClass == NONE → return false
3. populationTier == GHOST → return false
4. global wake budget exceeded → return false
5. per-vessel wake segment cap exceeded → return false
6. simulationTimeMs - previousEmission.createdAtMs < tierEmitInterval → return false
7. distanceFromPreviousEmission < WAKE_MIN_SEGMENT_DISTANCE_M → return false
8. return true
```

The exact order matters for determinism. Two implementations with different check orders will suppress wake emission under different conditions.

---

### 2. `emitWakeSegment` Return Schema Has a Coordinate Gap

`WakeSegment` defines segment geometry as:

```ts
start: { lat: number; lng: number; };
end: { lat: number; lng: number; };
```

But `emitWakeSegment` takes `vessel: VesselRuntimeState` as input. The spec does not define `VesselRuntimeState` — it is referenced but not typed anywhere in this spec or in the prior chain (which uses `MaritimeMotionTruth` in 0522O).

If `emitWakeSegment` derives `start` from the vessel's current position and `end` from... what? The previous emission's `end`? A projected forward position? The vessel's position one tick ago?

For a wake to represent a vessel's path, `start` should be the vessel's position at the previous emission and `end` should be the current position. But "previous position" is not stored on the vessel state — it is stored in `previousEmission.end`. This creates a dependency: `emitWakeSegment` needs both the current vessel state and the previous segment to construct the geometry correctly.

**Required:** Either add `previousEmission: WakeSegment | null` as a parameter to `emitWakeSegment`, or define how `start` is derived when `previousEmission` is null (first emission for a vessel).

Recommended signature:

```ts
function emitWakeSegment(
  emitter: WakeEmitterState,
  vessel: VesselRuntimeState,
  previousEmission: WakeSegment | null,
  simulationTimeMs: number
): WakeSegment {}
```

With rule: if `previousEmission` is null, `start` equals `end` equals current vessel position (zero-length initial segment).

---

### 3. Wake Intensity Formula References `maxExpectedSpeedKts` — Source Undefined

The intensity formula includes:

```ts
speedFactor = clamp(speedKts / maxExpectedSpeedKts, 0, 1)
```

`maxExpectedSpeedKts` is not defined in this spec. It is presumably sourced from `MotionEnvelope.maxExpectedSpeedKts` in the taxonomy profile. But this is not stated. If an implementer doesn't know where `maxExpectedSpeedKts` comes from, they will hardcode a value.

**Required:** Add one line:

> `maxExpectedSpeedKts` is sourced from the vessel's compiled taxonomy `motionEnvelope.maxExpectedSpeedKts`. It must not be hardcoded.

---

### 4. `decayWakeSegments` Return Type Is Undefined

```ts
function decayWakeSegments(
  simulationTimeMs: number
): WakeDecayResult {}
```

`WakeDecayResult` is referenced but never defined. At minimum it should expose how many segments were decayed, whether any were culled under pressure, and whether the budget state changed. Without a type definition, callers cannot handle decay results consistently.

**Required:** Define `WakeDecayResult`:

```ts
type WakeDecayResult = {
  decayedCount: number;
  culledCount: number;
  remainingSegments: number;
  budgetPressureActive: boolean;
};
```

---

### 5. Wake Emission Clock Source Is Implied, Not Explicit

The validation checklist includes:

- Wake emission uses simulation clock
- No wall-clock reads exist in deterministic mode

But the function signatures use `simulationTimeMs: number` as a parameter — implying the caller passes simulation time in. This is the correct pattern (same as 0522Q's injectable clock). However, the spec does not state where `simulationTimeMs` comes from or confirm it is the same simulation clock used by MaritimeContinuityEngine.

If WakeAuthority sources its `simulationTimeMs` from a different clock than the continuity engine, wake segment timestamps will be offset from vessel state timestamps — making replay correlation impossible.

**Required:** Add one line:

> `simulationTimeMs` passed to all WakeAuthority functions must come from the same injectable simulation clock used by MaritimeContinuityEngine. WakeAuthority does not own a clock. It receives simulation time as a parameter.

---

### 6. AIS Signal Recovery Wake Resumption Has an Ambiguous Condition

The dormancy/eviction rule states:

> If AIS signal recovers: wake emission resumes only from current authoritative vessel position. No wake bridge may be fabricated across missing telemetry unless MaritimeContinuityEngine emitted valid coasting state.

The exception — "unless MaritimeContinuityEngine emitted valid coasting state" — is undefined. What constitutes "valid coasting state" for wake purposes? Does the continuity engine need to explicitly flag coasting segments as wake-eligible? Does any coasting state permit a wake bridge, or only coasting within a certain confidence threshold?

This exception creates a conditional path that implementers will interpret differently. The safer design is to remove the exception entirely:

> No wake bridge may be fabricated across missing telemetry regardless of coasting state. Wake emission resumes from the current authoritative position on AIS recovery. The gap in wake history is real and must not be filled.

If wake continuity during coasting is genuinely required, it should be specified explicitly as a separate coasting wake emission rule — not as an exception to the bridge prohibition.

**Required:** Either remove the exception and prohibit all wake bridges, or define "valid coasting state" precisely enough to be implemented without ambiguity.

---

### 7. Per-Zone Wake Budget Is Referenced but Not Defined

The Wake Budget Governance section states WakeAuthority must maintain a "per-zone wake budget" but provides no value for it. The global budget (`WAKE_MAX_SEGMENTS_GLOBAL = 5000`) and per-vessel budgets are defined. The per-zone budget is mentioned as a requirement with no constant.

**Required:** Either define the per-zone wake budget constant or explicitly defer it:

> `WAKE_MAX_SEGMENTS_PER_ZONE` is defined by zone type. Default: `WAKE_MAX_SEGMENTS_PER_ZONE = 800`. This may be tuned per zone in the ecological zone configuration.

---

### 8. `SYNTHETIC_WAKE_MAX_LIFETIME_MULTIPLIER = 0.75` Has No Enforcement Contract

The constant is defined but no function is shown applying it. The lifetime clamp for synthetic wakes is:

```ts
syntheticWakeLifetimeMs = min(
  requestedLifetime,
  WAKE_MAX_LIFETIME_MS * SYNTHETIC_WAKE_MAX_LIFETIME_MULTIPLIER
)
```

...presumably. But this is not stated. An implementer who sees `SYNTHETIC_WAKE_MAX_LIFETIME_MULTIPLIER` in constants but finds no usage will either ignore it or apply it inconsistently.

**Required:** Show the clamp formula explicitly in the Wake Lifecycle section, the same way 0523C showed the `syntheticLifetimeMs` clamp formula.

---

## Minor Observations

### `WakeEmitterState.eligible` Boolean — Set By Whom?

`WakeEmitterState` contains `eligible: boolean` but the spec does not state who sets it or what conditions govern it. If it duplicates the checks in `shouldEmitWakeSegment`, it is redundant. If it is a pre-computed summary of those checks, it must be defined separately.

Recommended: define `eligible` as the output of a `resolveWakeEligibility()` function called inside `resolveWakeEmitterState()`, with the eligibility conditions listed explicitly.

### `populationTierAtEmission` — Enum Should Reference 0523B

The tier enum (`HERO | MID | BACKGROUND | GHOST`) is defined inline in `WakeSegment`. It should reference `0523B_WOS_MaritimePopulationHierarchy` as the authoritative tier definition rather than re-declaring it here. Inline re-declarations create the risk of the two drifting apart as 0523B evolves.

### Wake Segment `wakeId` — Generation Not Specified

`WakeSegment.wakeId` needs a defined format. Without it, IDs will be generated inconsistently across implementations. Recommend following the same pattern as synthetic vessel IDs in 0523C: a namespaced string format, e.g., `wake::<vesselId>::<simulationTimeMs>`.

---

## Final Assessment

---

### Review Status

**NOT READY FOR FREEZE — Four required fixes before build.**

The constitutional posture is correct. The boundary separations are well-drawn. The provenance model is complete. The core lifecycle rules are sound. The gaps are implementation contracts, not architectural failures — but `shouldEmitWakeSegment` without a defined decision order and `decayWakeSegments` without a return type will produce divergent implementations.

---

### Required Before Freeze (Blocking)

1. **Define `shouldEmitWakeSegment` decision logic as an ordered check sequence** — the priority order of checks governs which wake is suppressed first under pressure; two different orderings produce different harbor behavior.
2. **Add `previousEmission` to `emitWakeSegment` signature** — `start` coordinate cannot be derived without it; define first-emission behavior when null.
3. **Define `WakeDecayResult` type** — `decayWakeSegments` return type is referenced but not defined.
4. **Resolve AIS recovery wake bridge exception** — either remove the coasting exception or define "valid coasting state" precisely enough to implement without ambiguity.

---

### Required Before Freeze (Non-Blocking)

5. State that `maxExpectedSpeedKts` in the intensity formula is sourced from taxonomy `motionEnvelope`.
6. State that `simulationTimeMs` must come from the same injectable clock as MaritimeContinuityEngine.
7. Define or defer `WAKE_MAX_SEGMENTS_PER_ZONE`.
8. Show the synthetic wake lifetime clamp formula explicitly.
9. Define `eligible` field ownership in `WakeEmitterState`.
10. Reference 0523B for population tier enum rather than re-declaring inline.
11. Define `wakeId` generation format.

---

### Highest Risk

**`shouldEmitWakeSegment` without ordered decision logic.** At harbor scale with 200 active vessels and a global segment budget of 5000, the order in which suppression checks are applied determines which vessels lose wake emission first under pressure. If budget checks precede tier checks in one implementation, HERO vessels can be suppressed by background vessel overflow. If tier checks precede budget checks in another, the harbor runs over budget before suppression kicks in. This is not a calibration question — it is a correctness question that will produce materially different harbor behavior depending on implementation order.
