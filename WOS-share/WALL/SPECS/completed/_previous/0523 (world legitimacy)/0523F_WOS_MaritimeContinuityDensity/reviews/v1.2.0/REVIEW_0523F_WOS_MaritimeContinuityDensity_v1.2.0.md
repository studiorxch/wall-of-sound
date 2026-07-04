# Architectural Review: 0523F_WOS_MaritimeContinuityDensity_v1.2.0

**Review Type:** Architecture — v1.1.0 Blocking Issue Resolution and Freeze Validation
**Prior Review:** REVIEW_0523F_WOS_MaritimeContinuityDensity_v1.1.0.md
**Stage:** [BUILD] / GO — reviewing against freeze decision

---

## Blocking Issue Resolution from v1.1.0 Review

| Prior Blocking Issue | Status |
|---|---|
| `continuityAlpha` stale threshold inverted | ✅ Resolved — Section 5 defines `continuityAlpha` as dead-reckoning burden scalar (0=fresh AIS, 1=full dead-reckoning); Section 17 corrects threshold to `> 0.50`; Section 18 code matches |
| `VesselLifecycleState` diverges from constitutional states | ✅ Resolved — Section 3 establishes constitutional lifecycle alignment; Section 4 defines projection rules; Section 6 enum now matches constitutional chain: `SPAWNING \| TRACKING \| RECONCILING \| COASTING \| DORMANT \| RESPAWNING` |
| `0523D v1.2.0` not reviewed | ❌ Not resolved — `0523D v1.2.0` has not been submitted for review |
| `0523E v1.2.0` not build-ready | ❌ Not resolved — 0523E v1.2.0 remains blocked by 0523D chain |

---

## What v1.2.0 Gets Right

The `continuityAlpha` fix is clean and complete. Section 5 now provides an explicit semantic definition with directional clarity. The threshold correction in Section 17 and the implementation in Section 18 are consistent with the stated semantics. The validation checklist item "continuityAlpha semantics explicitly defined" confirms intent.

The constitutional lifecycle alignment in Sections 3 and 4 is well-structured. Separating the authority statement (Section 3: 0523F does not define a new lifecycle authority model) from the interpretation table (Section 4: how each constitutional state maps to density interpretation) is the right approach. Adding `RECONCILING` to the stale conditions is consistent with Section 4's "continuity uncertainty" interpretation of that state. `SPAWNING` and `RESPAWNING` are correctly excluded from automatic stale classification — vessels in those states can still contribute to stale count through the `signalConfidence` and `continuityAlpha` thresholds.

The `alphaBurden` accumulation and the `> 0.50` stale threshold now form a consistent model: high `continuityAlpha` contributes to `avgAlphaBurden` in the 0.35-weight term AND increments `staleCount` in the 0.20-weight term, producing appropriate double-emphasis on vessels deep into dead-reckoning.

---

## Remaining Issues

### 1. `0523D v1.2.0` Dependency Not Reviewed (Blocking for Freeze)

`depends_on` references `0523D_WOS_MaritimeWakeAuthority_v1.2.0`. This is the expected patch for ISSUE-0523D-001 (`parentEvicted` readonly conflict), ISSUE-0523D-002 (non-provenance-aware budget split), and ISSUE-0523D-003 (`wakeClass` enum divergence with 0523A). The spec has not been submitted for review and its freeze state is unknown.

0523F reads `provenance`, `ageRatio`, and `intensityRaw` from wake inputs — fields whose canonical definitions are in 0523D. If the 0523D patch changes the wake identity model or provenance semantics, the wake input contract here may shift.

**Required:** 0523D v1.2.0 must be reviewed and confirmed frozen before 0523F can enter BUILD.

---

### 2. `0523E v1.2.0` Dependency Not Build-Ready (Blocking for Freeze)

`0523E v1.2.0` was reviewed and found NOT READY FOR BUILD. The two blocking issues (0523D carrying open issues; 0523R not frozen at review time) are both being addressed by the same upstream work that unblocks 0523F. Once 0523D v1.2.0 is reviewed and frozen, 0523E's dependency blockers collapse simultaneously. Both 0523E and 0523F should reach build-ready status together.

**Required:** 0523E must reach build-ready state before 0523F can enter BUILD.

---

## Non-Blocking Issues (Carried Forward from Prior Reviews, Unresolved)

### 3. `0523R v1.2.3` Not Yet Reviewed

Referenced as the expected restoration patch for v1.2.2's section omissions. Has not been reviewed. Expected to be clean but must be confirmed.

**Recommended:** Confirm `0523R v1.2.3` review when submitted.

---

### 4. Global `vesselDensityScore`, `wakeDensityScore`, `syntheticPressure`, `aisPressure` Aggregation Not Fully Specified

Section 23 defines aggregation for the three `global`-prefixed fields (`globalDensityScore`, `globalContinuityLoad`, `globalClutterPressure`). The top-level output also includes `vesselDensityScore`, `wakeDensityScore`, `syntheticPressure`, and `aisPressure` without the `global` prefix. It is not specified whether these are computed against the `globalBudgetState` directly (total count / global max) or aggregated from sector values.

This is a naming and derivation clarity issue. It does not affect the authority model or architecture. The most natural interpretation is that they use the global budget denominators, but this should be stated.

**Recommended:** Clarify whether global `vesselDensityScore`, `wakeDensityScore`, `syntheticPressure`, and `aisPressure` are computed from `globalBudgetState` directly or aggregated from sector results.

---

### 5. `aisPressure` and `syntheticPressure` Use Different Denominators

`aisPressure` uses `maxVessels` (total ceiling); `syntheticPressure` uses `maxSyntheticVessels` (synthetic-specific ceiling). Both are diagnostic only and cannot mutate state. Carried forward from v1.0.0 as a non-blocking diagnostic clarity issue.

**Recommended:** Add a note that these use different baselines and are not directly comparable.

---

## Assessment

v1.2.0 resolves all blocking issues that were within this spec's own scope to fix. The `continuityAlpha` semantics are now unambiguous and the implementation is internally consistent. The constitutional lifecycle alignment is correct and well-documented. The authority model, formula completeness, and determinism requirements remain sound.

The two remaining blocking issues are dependency chain prerequisites — not architectural failures in this spec. Both will be resolved by the same upstream work: the 0523D v1.2.0 patch review. Once 0523D is reviewed and frozen, both 0523E and 0523F should be unblocked simultaneously.

The intrinsic spec is ready. The chain is not yet settled.

---

## Review Status

**NOT READY FOR BUILD — Two dependency chain blocking issues.**

This spec's own architecture, formulas, and semantics are correct and complete. Build is blocked by upstream 0523D and 0523E dependency state, not by issues within this spec.

---

## Required Before Build (Blocking)

1. **Resolve `0523D v1.2.0` dependency** — must be reviewed and confirmed frozen; blocks wake input model stability and unblocks 0523E simultaneously.
2. **Resolve `0523E v1.2.0` dependency** — must reach build-ready state; contingent on 0523D patch.

---

## Recommended Before Freeze (Non-Blocking)

3. Confirm `0523R v1.2.3` review when submitted.
4. Clarify how global `vesselDensityScore`, `wakeDensityScore`, `syntheticPressure`, `aisPressure` are derived (global budget vs. sector aggregation).
5. Note that `aisPressure` and `syntheticPressure` use different denominators and cannot be directly compared.
