# Architectural Review: 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0

**Review Type:** Architecture — v1.1.0 Blocking Issue Resolution and Freeze Validation
**Prior Review:** REVIEW_0523E_WOS_MaritimeAtmosphericReadability_v1.1.0.md
**Stage:** [BUILD] / GO — reviewing against freeze decision

---

## Blocking Issue Resolution from v1.1.0 Review

| Prior Blocking Issue | Status |
|---|---|
| Weather/distance double-counting | ✅ Resolved — Section 15.1 explicitly designates `weatherFactor` as the sole default weather suppression path; Section 22 states `distanceFactor` must use raw distance only; Section 23 moves effective distance into optional continuous-visibility mode; Section 26.1 explicitly names `rawDistanceFactor` in the blur formula |
| Dependency on phantom `0523D v1.0.1` | ⚠️ Partially resolved — phantom version replaced with `0523D v1.1.0`, which exists. But `0523D v1.1.0` carries three open blocking issues (ISSUE-0523D-001, ISSUE-0523D-002, ISSUE-0523D-003). The reference is no longer phantom; the upstream is still blocked. |

---

## What v1.2.0 Gets Right

The weather suppression fix is clean and complete. Section 15.1, Section 22, and Section 26.1 form a consistent rule: raw distance for `distanceFactor`, `weatherFactor` as the sole weather multiplier, effective distance gated behind an explicitly opt-in continuous-visibility mode. The `rawDistanceFactor` naming in the blur formula closes the last ambiguity from the v1.1.0 review.

Section 23 (Optional Continuous-Visibility Mode) is correctly scoped. The four explicit prohibitions — no double-counting, no hard culling threshold, no runtime absence implication, must remain deterministic — are exactly right. Gating activation behind `visibilityMeters !== null` plus explicit implementation config is the correct pattern.

The non-blocking issues from v1.1.0 were all addressed:
- `0523R v1.2.2_FULL` non-standard suffix removed.
- Section 26.1 explicitly calls out `rawDistanceFactor`.
- The validation checklist now includes `weather suppression is not double-counted` and `dependency versions reference actual canonical artifacts`.

The intrinsic architecture of this spec is correct. Authority boundaries are clean, formulas are implementable, determinism requirements are sufficient, and the three-layer model (runtime / atmosphere / renderer) is enforced throughout.

---

## Remaining Issues

### 1. `0523D v1.1.0` Dependency — Version Exists But Carries Three Open Blocking Issues (Blocking for Freeze)

The dependency reference was updated from the phantom `v1.0.1` to `v1.1.0`, which is a real reviewed version. But `0523D v1.1.0` was reviewed and found NOT READY FOR BUILD, with three blocking issues:

- **ISSUE-0523D-001**: `parentEvicted: boolean` is declared `readonly` in `WakeSegment`, but eviction doctrine requires post-emission mutation. The `readonly` constraint conflicts with the eviction lifecycle.
- **ISSUE-0523D-002**: Wake emission step 4 (global budget check) is not provenance-aware. AIS wakes can be suppressed when the synthetic budget fills. Requires a split into 4a (AIS against global ceiling) and 4b (synthetic against synthetic ceiling).
- **ISSUE-0523D-003**: `wakeClass` enum divergence with 0523A. 0523D v1.1.0 defines `NONE | MINIMAL | STANDARD | HEAVY` (4 values); 0523A defines `NONE | NARROW | STANDARD | WIDE | HEAVY | TURBULENT` (6 values, different names). The enum must be reconciled cross-spec before either can be built against the other.

0523E consumes wake readability inputs that include `provenance`, `intensityRaw`, and `turbulenceRaw` — fields that depend on 0523D's wake identity model. ISSUE-0523D-003 (`wakeClass` enum divergence) directly affects how wake provenance and intensity are expressed in the registry that 0523E reads from.

**A freeze decision of GO on 0523E cannot be accepted while the upstream wake authority it depends on has three open blocking issues.**

This is a governance requirement, not a formula gap in this spec. The spec itself is architecturally correct. The dependency chain is not clean.

**Required:** Update `depends_on` to reference a frozen 0523D version once ISSUE-0523D-001/002/003 are resolved and a patched version is reviewed. The pending patch is `0523D v1.2.0`.

---

### 2. `0523R_WOS_InfrastructureRegistry_v1.2.2` — Registry Is Not Frozen (Blocking for Freeze)

`0523R v1.2.2` was reviewed and found NOT READY FOR FREEZE. Three sections were omitted during a precision patch: the 0522O/P/Q YAML records (Section 13), four canonical spec records (Section 14), and two runtime authority entries (Section 15). That review concluded that v1.2.2 cannot stand as a self-contained governance artifact.

The corrected version, `v1.2.3`, is pending review. Referencing an unfrozen registry as a dependency means the infrastructure governance foundation for this spec is not settled.

**Required:** Update `depends_on` to `0523R_WOS_InfrastructureRegistry_v1.2.3` once that version is reviewed and frozen.

---

### 3. `0523A v1.2.2` Dependency — Unreviewed (Non-Blocking)

`0523A v1.2.2` is referenced in `depends_on`. The last formally reviewed 0523A version was `v1.2.0` (two blocking issues: unreachable MILITARY AIS branch, FISHING `routeDiscipline: "VARIABLE"` not in enum). `v1.2.1` appears throughout the chain by reference but has not been reviewed here. `v1.2.2` has not been reviewed at all.

Additionally, ISSUE-0523A-001 (`wakeClass` enum divergence, linked to ISSUE-0523D-003) must be resolved before 0523A can be considered stable. 0523E reads `taxonomyAtmosphericResistance` from taxonomy profiles; if 0523A's profiles contain unresolved structural issues, the input values passed to 0523E may be unreliable.

**Recommended:** Confirm 0523A v1.2.2 has been reviewed and that ISSUE-0523A-001 is resolved before treating this as a stable upstream dependency.

---

### 4. `wakeReadable: boolean` Has No Defined Threshold (Non-Blocking)

`AtmosphericReadabilityResult` includes `wakeReadable: boolean`. Section 28 defines `wakeReadabilityScore` (a scalar 0.0→1.0). Section 29.1 defines the `labelReadable` threshold explicitly:

```ts
labelReadable =
  readabilityScore >= 0.55
  && clutterPressure < 0.72
  && taxonomyLabelPriority >= 0.35;
```

No equivalent threshold is defined for `wakeReadable`. An implementer must invent the threshold, which is exactly the precision gap the formula sections are meant to prevent.

**Recommended:** Define a `wakeReadable` threshold formula analogous to the `labelReadable` formula. A simple baseline such as `wakeReadabilityScore >= 0.25` would be sufficient to make the field implementable.

---

### 5. `turbulenceRaw` in `WakeReadabilityInput` Is Never Used in Any Formula (Non-Blocking)

`WakeReadabilityInput` declares `turbulenceRaw: number // 0.0 → 1.0`. The wake readability score formula in Section 28.1 uses:

```
wakeReadabilityScore =
  intensityRaw × weatherFactor × timeOfDayFactor × clutterFactor × provenanceFactor × wakeAgeFactor
```

`turbulenceRaw` appears in no formula and no decision path. This is the same dead-field pattern as `taxonomyProjectionWeight` in the vessel input (which was addressed with a usage note in v1.1.0).

**Recommended:** Either add `turbulenceRaw` to the wake readability score formula (e.g., as an additive intensity modifier for turbulent wakes under fog or storm conditions), or add a usage note indicating it is reserved for a future visual turbulence effect and not consumed by the current readability score.

---

## Assessment

The intrinsic formula and architecture of v1.2.0 is clean. All prior blocking issues that were within the scope of this spec to fix are resolved. The weather double-counting fix is correct and complete. The optional continuous-visibility mode scoping is correct. The dependency chain is the only remaining obstacle.

The two governance blocking issues — `0523D v1.1.0` being blocked upstream, and `0523R v1.2.2` being unfrozen — are not architectural defects in this spec. They are dependency chain prerequisites. Once 0523D resolves its three blocking issues (pending `v1.2.0` patch) and 0523R is frozen at `v1.2.3`, this spec should be clean for freeze with no further changes required to its formulas or authority model.

---

## Review Status

**NOT READY FOR BUILD — Two dependency chain blocking issues.**

This spec's own architecture and formulas are correct. Build is blocked by upstream dependency state, not by issues in this spec.

---

## Required Before Build (Blocking)

1. **Update `0523D` dependency** — `v1.1.0` carries open ISSUE-0523D-001/002/003. Update to reference the frozen patched version (`v1.2.0` pending review) once those issues are resolved.
2. **Update `0523R` dependency** — `v1.2.2` is not frozen. Update to `v1.2.3` once that version is reviewed and frozen.

---

## Recommended Before Freeze (Non-Blocking)

3. Confirm `0523A v1.2.2` has been reviewed and ISSUE-0523A-001 is resolved.
4. Define a `wakeReadable` boolean threshold — the scalar `wakeReadabilityScore` is defined but the boolean derived from it is not.
5. Document or use `turbulenceRaw` — field is declared in `WakeReadabilityInput` but consumed by no formula.
