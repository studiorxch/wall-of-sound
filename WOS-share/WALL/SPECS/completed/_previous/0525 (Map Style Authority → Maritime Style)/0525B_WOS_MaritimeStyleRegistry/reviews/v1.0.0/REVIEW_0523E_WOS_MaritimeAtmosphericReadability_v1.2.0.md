# Architectural Review: 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0

**Review Type:** Architecture — v1.1.0 Blocking Issue Resolution and Freeze Validation
**Prior Review:** REVIEW_0523E_WOS_MaritimeAtmosphericReadability_v1.1.0.md
**Stage:** [BUILD] / GO — reviewing against freeze decision

## Blocking Issue Resolution from v1.1.0 Review

| Prior Blocking Issue | Status |
|---|---|
| Weather/distance double-counting | ✅ Resolved — Section 15.1 designates `weatherFactor` as sole default weather suppression path; Section 22 uses raw distance only; Section 23 moves effective distance into optional continuous-visibility mode; Section 26.1 names `rawDistanceFactor` explicitly |
| Dependency on phantom `0523D v1.0.1` | ⚠️ Partially resolved — replaced with `0523D v1.1.0` (exists, but carries three open blocking issues) |

## What v1.2.0 Gets Right

The weather suppression fix is clean and complete. Section 15.1, Section 22, and Section 26.1 form a consistent rule: raw distance for `distanceFactor`, `weatherFactor` as the sole weather multiplier, effective distance gated behind explicitly opt-in continuous-visibility mode. Section 23's four explicit prohibitions (no double-counting, no hard culling, no runtime absence, must remain deterministic) are exactly right.

## Remaining Issues

### 1. `0523D v1.1.0` Dependency — Version Exists But Carries Three Open Blocking Issues (Blocking for Freeze)

`0523D v1.1.0` was reviewed NOT READY FOR BUILD with three blocking issues: ISSUE-0523D-001 (`parentEvicted` readonly conflict), ISSUE-0523D-002 (non-provenance-aware budget split), ISSUE-0523D-003 (`wakeClass` enum divergence). This spec cannot freeze while its upstream wake authority dependency has open blocking issues.

**Required:** Update `depends_on` to reference a frozen 0523D version. The pending patch is `0523D v1.2.1` (reviewed READY FOR BUILD).

### 2. `0523R v1.2.2` Not Frozen (Blocking for Freeze)

`0523R v1.2.2` was reviewed NOT READY FOR FREEZE (three section omissions). Update to `v1.2.3` once reviewed.

### 3. `0523A v1.2.2` Dependency Unreviewed (Non-Blocking)

Last reviewed 0523A was v1.2.0 with two blocking issues. v1.2.2 unreviewed.

### 4. `wakeReadable: boolean` Has No Defined Threshold (Non-Blocking)

`wakeReadabilityScore` (scalar) is defined. `wakeReadable` (boolean) derived from it has no threshold formula.

### 5. `turbulenceRaw` in `WakeReadabilityInput` Never Used (Non-Blocking)

Declared in input contract, consumed by no formula.

## Review Status

**NOT READY FOR BUILD — Two dependency chain blocking issues.**

This spec's own architecture and formulas are correct and complete. Build is blocked by upstream dependency state.

## Required Before Build (Blocking)

1. Update `0523D` dependency to `v1.2.1` (reviewed READY FOR BUILD).
2. Update `0523R` dependency to `v1.2.3` once reviewed and frozen.

## Recommended Before Freeze (Non-Blocking)

3. Confirm `0523A v1.2.2` reviewed and frozen.
4. Define `wakeReadable` boolean threshold formula.
5. Document or use `turbulenceRaw`.
