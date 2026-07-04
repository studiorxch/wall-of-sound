# Architectural Review: 0523F_WOS_MaritimeContinuityDensity_v1.1.0

**Review Type:** Architecture — v1.0.0 Blocking Issue Resolution and Freeze Validation
**Prior Review:** REVIEW_0523F_WOS_MaritimeContinuityDensity_v1.0.0.md
**Stage:** [BUILD] / GO — reviewing against freeze decision

---

## Blocking Issue Resolution from v1.0.0 Review

| Prior Blocking Issue | Status |
|---|---|
| `staleOrLowConfidenceRatio` undefined | ✅ Resolved — Section 16 defines thresholds; Section 17 implements as executable code |
| Global aggregation method undefined | ✅ Resolved — Section 22 defines averaging for all three global fields |
| `0523D v1.2.0` not reviewed | ❌ Not resolved — `0523D v1.2.0` has not been reviewed |
| `0523E v1.2.0` not build-ready | ❌ Not resolved — 0523E v1.2.0 remains blocked by 0523D chain |
| `0523R v1.2.2` not frozen | ✅ Updated — now references `v1.2.3` |

---

## What v1.1.0 Gets Right

All non-blocking items from the v1.0.0 review were addressed:

- The circular dependency ambiguity with 0523E is cleanly resolved in Section 23: "ContinuityDensity does NOT consume atmospheric output. No circular authority path exists." This closes the "May Observe" ambiguity from v1.0.0 definitively.
- `lifecycleState` is now a typed enum (Section 6), eliminating the `string` type gap.
- Global aggregation is defined in Section 22 with deterministic averaging and explicit rejection of adaptive weighting.
- The `readonly` modifiers on all input and output contracts are a meaningful addition — they enforce at the type level that this module cannot mutate the data it receives.

Section 23's one-line statement — "No circular authority path exists" — is the correct way to close that issue. Direct and verifiable.

The `calculateContinuityLoad` function in Section 17 is the right approach: a single pass over vessel inputs, accumulating three independent measures, then combining with explicit weights. Clear and implementable.

---

## Remaining Issues

### 1. `continuityAlpha < 0.50` Stale Threshold Is Likely Inverted (Blocking)

Section 16 defines a vessel as stale or low-confidence if `continuityAlpha < 0.50`. Section 17 implements this directly:

```ts
const stale =
  vessel.signalConfidence < 0.40 ||
  vessel.continuityAlpha < 0.50 ||
  vessel.lifecycleState === "COASTING" || ...
```

`continuityAlpha` is named and positioned in the WOS chain as the dead-reckoning weight: a value near 0.0 means the vessel is being driven primarily by fresh AIS telemetry; a value near 1.0 means the vessel is being held up by dead-reckoning with little or no recent AIS input. This is consistent with how `Section 17` uses it:

```ts
alphaBurden += vessel.continuityAlpha;
```

`alphaBurden` accumulates `continuityAlpha` values. High `alphaBurden` → high average `continuityAlpha` → high `continuityLoad`. This is correct: a fleet with high average `continuityAlpha` is heavily dead-reckoned, which is a genuine continuity burden.

But the stale threshold `continuityAlpha < 0.50` classifies vessels with **low** dead-reckoning weight as stale — i.e., vessels on fresh AIS would be flagged as stale, while vessels on heavy dead-reckoning would not be. This is the opposite of the correct behavior.

The threshold should be:

```ts
vessel.continuityAlpha > 0.50
```

to flag vessels that are primarily dead-reckoned (and thus stale with respect to AIS ground truth).

If `continuityAlpha` is intended to mean something other than dead-reckoning weight in this context — for example, "confidence in the continuity signal" where 0.0 = no confidence and 1.0 = full confidence — then the accumulation `alphaBurden += vessel.continuityAlpha` is also wrong (it would accumulate confidence, not burden). The semantics of `continuityAlpha` must be explicitly stated to make either the threshold or the accumulation unambiguously correct.

**Required:** Either:
- (a) Define `continuityAlpha` as dead-reckoning weight (0.0 = fresh AIS, 1.0 = full dead-reckoning) and correct the stale threshold to `> 0.50`.
- (b) Define `continuityAlpha` as a confidence signal (0.0 = stale, 1.0 = fresh) and correct the `alphaBurden` accumulation to `1.0 - vessel.continuityAlpha`.

Either definition is acceptable. Both definition and threshold/accumulation must be consistent with each other.

---

### 2. `VesselLifecycleState` Enum Diverges from Constitutional Lifecycle States (Blocking)

Section 6 defines:

```ts
type VesselLifecycleState =
  | "TRACKING"
  | "COASTING"
  | "DORMANT"
  | "STALE"
  | "DEAD";
```

The constitutional specs (0522O/P/Q), which are listed in `depends_on`, define the authoritative lifecycle state enum as:

```
SPAWNING → TRACKING → RECONCILING → COASTING → DORMANT → RESPAWNING
```

The divergence is in both directions:

- **Present in 0523F, absent from constitutional model:** `STALE`, `DEAD`
- **Present in constitutional model, absent from 0523F:** `SPAWNING`, `RECONCILING`, `RESPAWNING`

This creates two concrete problems:

1. Vessels arriving from the runtime in `SPAWNING`, `RECONCILING`, or `RESPAWNING` states would be rejected by or fail the `VesselLifecycleState` type. The stale classification in `calculateContinuityLoad` has no branch for these states — they would silently fall through the `if (stale)` check without being classified.

2. `STALE` and `DEAD` are used in the stale classification logic (Section 16 and 17) as first-class lifecycle states, but they have no backing definition in the constitutional specs that 0523F depends on. If the runtime never emits these states, the classification conditions for them are dead code.

**Required:** Either align `VesselLifecycleState` with the constitutional lifecycle state enum (adding `SPAWNING`, `RECONCILING`, `RESPAWNING`; removing or justifying `STALE` and `DEAD`), or explicitly document that 0523F receives a projected subset of lifecycle states and specify how constitutional states are mapped to this projection.

---

### 3. `0523D v1.2.0` Dependency Not Reviewed (Blocking for Freeze)

`depends_on` references `0523D_WOS_MaritimeWakeAuthority_v1.2.0`. This is the expected patch for ISSUE-0523D-001/002/003 from the v1.1.0 review, but the spec has not been submitted for review. Its freeze state is unknown.

0523F reads `wakeCount`, `ageRatio`, `intensityRaw`, and wake `provenance` from wake inputs. These fields depend on 0523D's wake identity model being stable.

**Required:** 0523D v1.2.0 must be reviewed and confirmed frozen before 0523F can enter BUILD.

---

### 4. `0523E v1.2.0` Dependency Not Build-Ready (Blocking for Freeze)

`0523E v1.2.0` was reviewed and found NOT READY FOR BUILD, with two dependency chain blocking issues (0523D carrying open blocking issues; 0523R not frozen). Both are contingent on 0523D being patched. 0523E's own architecture is correct, but its build-readiness is gated on the same 0523D patch that blocks this spec directly.

Once 0523D v1.2.0 is reviewed and frozen, both 0523E and 0523F should be unblocked on that front simultaneously.

**Required:** 0523E must reach build-ready state before 0523F can enter BUILD.

---

## Non-Blocking Issues

### 5. `0523R v1.2.3` Dependency Not Yet Reviewed

The registry reference was correctly updated from `v1.2.2` to `v1.2.3`. However, `v1.2.3` has not been reviewed. It is expected to be the restoration patch for the three section omissions found in `v1.2.2`. If `v1.2.3` introduces any new issues, this dependency may need to be revisited.

**Recommended:** Confirm `0523R v1.2.3` review when that spec is submitted.

---

### 6. `aisPressure` and `syntheticPressure` Still Use Different Denominators

Present from v1.0.0 and not resolved. `aisPressure` uses `maxVessels` (total vessel ceiling); `syntheticPressure` uses `maxSyntheticVessels` (synthetic-specific ceiling). The two values are not comparable on the same scale.

Both are labeled as diagnostic only and cannot mutate state, so this doesn't affect correctness. But telemetry consumers comparing `aisPressure = 0.53` against `syntheticPressure = 0.60` may draw incorrect conclusions about relative pressure.

**Recommended:** Add a note documenting that these values use different baselines and cannot be directly compared, or normalize both against a common denominator.

---

## Assessment

v1.1.0 correctly resolves the two formula gaps from v1.0.0 (stale definition and global aggregation). The authority model remains clean. The `readonly` contract modifiers and the explicit denial of circular authority in Section 23 are improvements.

The two new blocking issues — the inverted `continuityAlpha` stale threshold and the lifecycle state enum divergence — are precision errors introduced by the definitions added to resolve v1.0.0 blocking issues. Neither requires architectural rework; both are targeted corrections. The dependency chain issues are the same prerequisites that apply to 0523E and will be resolved by the same 0523D patch.

---

## Review Status

**NOT READY FOR BUILD — Four blocking issues.**

Formula structure and authority model are correct. Two precision errors in the new stale classification logic, and two dependency chain prerequisites remain.

---

## Required Before Build (Blocking)

1. **Resolve `continuityAlpha` stale threshold direction** — if `continuityAlpha` is dead-reckoning weight, the stale threshold should be `> 0.50` not `< 0.50`; add explicit semantic definition of the field.
2. **Align `VesselLifecycleState` with constitutional lifecycle states** — add `SPAWNING`, `RECONCILING`, `RESPAWNING` or document the projection mapping from constitutional states to this enum.
3. **Resolve `0523D v1.2.0` dependency** — must be reviewed and frozen; blocks wake input model stability.
4. **Resolve `0523E v1.2.0` dependency** — must reach build-ready state; contingent on 0523D patch.

---

## Recommended Before Freeze (Non-Blocking)

5. Confirm `0523R v1.2.3` review when submitted.
6. Document that `aisPressure` and `syntheticPressure` use different denominators and cannot be directly compared.
