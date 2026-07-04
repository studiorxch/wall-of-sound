# Architectural Review: 0523F_WOS_MaritimeContinuityDensity_v1.0.0

**Review Type:** Architecture — First Review
**Stage:** [REVIEW] / REVIEW — reviewing before build
**Spec Purpose:** Pure deterministic interpretation layer computing density pressure descriptors from runtime state observations; primary output is `clutterPressure` consumed by AtmosphericReadability.

---

## What v1.0.0 Gets Right

The authority boundary model is well-constructed. Listing six separate ownership lines (AISRuntime / WakeAuthority / PopulationHierarchy / AtmosphericReadability / ContinuityDensity / Renderer) at the top of the spec establishes the chain clearly. The repeated prohibitions — no eviction, no tier mutation, no spawn blocking, no camera authority — are consistently applied through Sections 20–26 without contradiction.

The core doctrine:

```
ContinuityDensity may describe pressure.
ContinuityDensity may never resolve pressure by mutating truth.
```

is the correct framing and the right level of specificity for a density interpretation layer.

The `clutterPressure` handoff to AtmosphericReadability (Section 24) is correctly modeled. 0523F computes the pressure; 0523E decides what to do with it. The directionality is right.

The sector-level detail in the output contract is appropriate. Global density scores alone would be too coarse to be useful; per-sector summaries let downstream consumers understand where pressure is concentrated.

The evaluation cadence in Section 27 (500ms for density, 2000ms for debug telemetry) is correct for a system that aggregates over simulation state rather than tracking per-vessel per-frame.

---

## Blocking Issues

### 1. `staleOrLowConfidenceRatio` Used in Continuity Load Formula But Never Defined

Section 17 defines continuity load:

```
continuityLoad =
  average(1.0 - signalConfidence) × 0.45
+ average(continuityAlpha) × 0.35
+ staleOrLowConfidenceRatio × 0.20
```

`staleOrLowConfidenceRatio` appears as a term that accounts for 20% of the continuity load score, but no definition is provided anywhere in the spec. Critical questions an implementer cannot answer without it:

- What threshold defines "stale" — is it a lifecycle state (`COASTING`, `DORMANT`)? A `signalConfidence` value below some cutoff?
- What threshold defines "low confidence" — `signalConfidence < 0.3`? `< 0.5`?
- Is it a ratio over total vessels in the sector, or over AIS-only vessels?
- How does it interact with the already-present `average(1.0 - signalConfidence)` term? If low-confidence vessels are already captured by the first term, this term may double-count them.

**Required:** Define `staleOrLowConfidenceRatio` explicitly — including the threshold(s) that classify a vessel as stale or low-confidence, and the denominator of the ratio.

---

### 2. Global Aggregation Method Undefined — Three Top-Level Output Fields Have No Derivation Formula

`MaritimeContinuityDensityResult` includes `globalDensityScore`, `globalContinuityLoad`, and `globalClutterPressure` at the top level. `resolveContinuityDensity` returns this result and takes `MaritimeContinuityDensityInput` (a list of sector inputs). The spec defines how each sector score is computed but never defines how the global scores aggregate from sector results.

Questions that cannot be answered without a defined aggregation:
- Is `globalDensityScore` the average of sector density scores, the maximum, a weighted sum by sector vessel count, or something else?
- Is `globalContinuityLoad` the average continuity load across sectors?
- Is `globalClutterPressure` the output of `resolveClutterPressure` applied globally, or the max sector clutter pressure?

`resolveClutterPressure` (Section 29.3) takes a `sectorResult` — a single sector — and returns a scalar. The global `clutterPressure` that gets provided to AtmosphericReadability must be a single value. Without a defined rollup, implementers will diverge.

**Required:** Define the aggregation method for each global field: `globalDensityScore`, `globalContinuityLoad`, and `globalClutterPressure`. At minimum, specify whether each uses average, maximum, or weighted-by-vessel-count aggregation over sectors.

---

### 3. Dependency on `0523D v1.2.0` — Version Not Reviewed

`depends_on` references `0523D_WOS_MaritimeWakeAuthority_v1.2.0`. The review chain contains `0523D v1.0.0` and `v1.1.0`, both with three open blocking issues (ISSUE-0523D-001: `parentEvicted` readonly conflict; ISSUE-0523D-002: non-provenance-aware budget split; ISSUE-0523D-003: `wakeClass` enum divergence). `v1.2.0` is the expected patch for those issues but has not been submitted for review. Its freeze state is unknown.

0523F reads `wakeCount`, `wakeProvenance`, `ageRatio`, and `intensityRaw` from wake inputs. If 0523D's `wakeClass` enum or provenance model changes in the patch, the inputs to 0523F may shift.

**Required:** 0523D v1.2.0 must be reviewed and confirmed frozen before 0523F can be built. Update `depends_on` if the version identifier changes.

---

### 4. Dependency on `0523E v1.2.0` — Upstream Not Build-Ready

`depends_on` references `0523E_WOS_MaritimeAtmosphericReadability_v1.2.0`, which was reviewed and found NOT READY FOR BUILD (two dependency chain blocking issues: 0523D carrying open blocking issues, 0523R not frozen). 0523E cannot be built; 0523F cannot be built against an upstream that cannot be built.

Additionally, see Non-Blocking Issue 5 below regarding an ambiguity introduced by listing 0523E as a dependency while also listing "atmospheric readability output" in the "May Observe" section.

**Required:** 0523E must reach BUILD-ready state before 0523F can proceed. Both are contingent on 0523D resolving ISSUE-0523D-001/002/003.

---

### 5. Dependency on `0523R v1.2.2` — Registry Not Frozen

`0523R v1.2.2` was reviewed and found NOT READY FOR FREEZE. Three sections were omitted: the 0522O/P/Q YAML records, four canonical spec records, and two runtime authority entries. The corrected version is `v1.2.3`, pending review.

**Required:** Update to `0523R_WOS_InfrastructureRegistry_v1.2.3` once that version is reviewed and frozen.

---

## Non-Blocking Issues

### 6. "Atmospheric Readability Output" in May Observe Creates Circular Runtime Data Flow Ambiguity

Section 2 lists "atmospheric readability output" under `ContinuityDensity May Observe`. Section 24 establishes that ContinuityDensity provides `clutterPressure` to AtmosphericReadability. This creates an apparent circular runtime data flow:

```
0523F → clutterPressure → 0523E (AtmosphericReadability)
0523E → atmospheric output → 0523F (if consumed)
```

If 0523F consumes 0523E output AND 0523E consumes 0523F output, the runtime evaluation order is undefined. However: the input contract in Section 8 (`MaritimeContinuityDensityInput`) does not include atmospheric readability output. No formula in this spec uses it. The "May Observe" claim is aspirational, not operative.

This creates confusion about whether a circular dependency exists. A reader looking at Section 2 would assume 0523F reads 0523E output; looking at the input contract and formulas, it does not.

**Recommended:** Remove "atmospheric readability output" from the "May Observe" list, or add a note clarifying it is reserved for a future extension and not consumed by any current formula. The `depends_on` declaration of 0523E is appropriate (0523F was written to be compatible with 0523E's interface), but "May Observe" implies runtime consumption which the input contract does not support.

---

### 7. `aisPressure` and `syntheticPressure` Use Different Denominators — Diagnostic Values Are Incomparable

Section 16 (AIS Pressure) uses `maxVessels` as the denominator. Section 15 (Synthetic Pressure) uses `maxSyntheticVessels`. These are different ceilings. A scene with 80 AIS vessels against a `maxVessels = 150` budget produces `aisPressure = 0.53`, while 30 synthetic vessels against a `maxSyntheticVessels = 50` budget produces `syntheticPressure = 0.60` — suggesting synthetic pressure is higher than AIS pressure, even though there are nearly three times as many AIS vessels.

Both values are diagnostic only and cannot suppress vessels, so this doesn't create a runtime correctness problem. But it creates misleading telemetry that could confuse debugging and tuning.

**Recommended:** Either normalize both against the same total-vessel denominator, or add a note explaining that the two values are intentionally measured against different baselines (AIS against total capacity, synthetic against synthetic ceiling) and should not be compared directly.

---

### 8. `lifecycleState: string` Should Be a Typed Enum

`MaritimeDensityVesselInput.lifecycleState` is typed as `string`. Every other lifecycle state reference in the chain uses a defined enum (`SPAWNING | TRACKING | RECONCILING | COASTING | DORMANT | RESPAWNING` from 0522O/P/Q). Using `string` here loses type safety, allows invalid state values into the density computation, and makes `staleOrLowConfidenceRatio` (once defined) harder to implement against a known set of states.

**Recommended:** Type `lifecycleState` as the lifecycle state enum defined in the constitutional specs, or define an explicit allowed-values list in this spec if the full enum is not yet stable.

---

### 9. `vesselDensityScore` and `wakeDensityScore` Appear in Both Global Output and Sector Output — Derivation Ambiguous

`MaritimeContinuityDensityResult` (Section 5) includes both `vesselDensityScore` and `wakeDensityScore` at the top level, in addition to `sectors: MaritimeDensitySectorResult[]` which each contain their own `vesselDensityScore` and `wakeDensityScore`. The global fields share the same names as the per-sector fields. Without the aggregation formula (Blocking Issue 2), it is unclear whether the top-level scores are global averages, maximums, or something else — or whether they are redundant given that sectors contain the same fields.

This is a clarity issue that will be resolved by defining the aggregation method (Blocking Issue 2).

---

## Assessment

The architecture and authority model are correct. ContinuityDensity is cleanly scoped as a pure interpretive layer that describes density without mutating any authoritative state. The relationship to AtmosphericReadability (density provides input, atmosphere decides output) is correctly directional.

The blocking issues are formula gaps and dependency chain state — not architectural problems. Two formula gaps (undefined `staleOrLowConfidenceRatio`, undefined global aggregation method) and three dependency chain prerequisites (0523D v1.2.0 not reviewed, 0523E blocked, 0523R not frozen). Once these are resolved, the architecture supports clean build readiness with no structural rework required.

---

## Review Status

**NOT READY FOR BUILD — Five blocking issues.**

Authority architecture is correct. Formula specification is incomplete, and upstream dependency chain is not settled.

---

## Required Before Build (Blocking)

1. **Define `staleOrLowConfidenceRatio`** — threshold definitions for "stale" and "low confidence," denominator, and relationship to the existing `average(1.0 - signalConfidence)` term.
2. **Define global aggregation method** — how `globalDensityScore`, `globalContinuityLoad`, and `globalClutterPressure` are derived from per-sector results.
3. **Resolve `0523D v1.2.0` dependency** — version not reviewed; must be confirmed frozen before build.
4. **Resolve `0523E v1.2.0` dependency** — upstream not build-ready; contingent on 0523D patch.
5. **Update registry dependency** — `0523R v1.2.2` is not frozen; update to `v1.2.3` once reviewed.

---

## Recommended Before Freeze (Non-Blocking)

6. Remove or annotate "atmospheric readability output" from the May Observe list to eliminate circular dependency ambiguity.
7. Normalize `aisPressure` and `syntheticPressure` against consistent denominators, or document their different baselines explicitly.
8. Type `lifecycleState` as the appropriate lifecycle state enum from the constitutional specs.
9. Clarify whether global `vesselDensityScore` and `wakeDensityScore` in the top-level result are aggregated from sectors, and remove or rename if redundant with sector outputs.
