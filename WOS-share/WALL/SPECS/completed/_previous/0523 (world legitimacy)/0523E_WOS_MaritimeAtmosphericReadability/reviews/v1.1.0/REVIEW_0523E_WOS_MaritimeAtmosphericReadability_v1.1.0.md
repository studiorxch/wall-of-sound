# Architectural Review: 0523E_WOS_MaritimeAtmosphericReadability_v1.1.0

**Review Type:** Architecture — v1.0.0 Blocking Issue Resolution and Freeze Validation
**Prior Review:** REVIEW_0523E_WOS_MaritimeAtmosphericReadability_v1.0.0.md
**Stage:** [BUILD] / GO — reviewing against freeze decision

---

## Blocking Issue Resolution from v1.0.0 Review

| Prior Blocking Issue | Status |
|---|---|
| `clutterFactor` formula undefined | ✅ Resolved — Section 21 defines `resolveClutterFactor` with explicit derivation from `clutterPressure` |
| `taxonomyResistanceFactor` formula undefined | ✅ Resolved — Section 20 defines direct pass-through with clamp |
| `atmosphericBlurHint` / `atmosphericContrastHint` undefined | ✅ Resolved — Section 25 defines both with per-weather lookup tables and derivation formulas |
| Dependency on phantom `0523D v1.0.1` | ❌ Not resolved — `0523D v1.0.1` still appears in `depends_on`; version does not exist |

Three of four blocking issues resolved. The dependency issue persists unchanged.

---

## What v1.1.0 Gets Right

All five of the prior non-blocking recommendations were addressed in full:

- `clutterPressure` source is now specified in Section 13 with explicit prohibition on renderer-buffer derivation. The authority chain (`PopulationHierarchy or future density module`) is correctly named.
- Unused fields are now documented with explicit usage notes in Section 14 rather than being silently declared. `taxonomyProjectionWeight`, `taxonomyLabelPriority`, `updateAdvisory`, `visibilityMeters`, and `cameraDistanceMeters` all have defined roles or explicit deferral notes.
- `SYNTHETIC_DEEMPHASIS` trigger condition is now explicit in Section 10.
- `labelReadable = false` is now explicitly stated for wake readability results in Section 14.2.
- The `resolveLabelReadability` projection guarantee is now stated in Section 29.

The minimum visible distance protection in Section 23 is a welcome addition — it prevents the visually disorienting case of a vessel disappearing while still occupying nearby space. The `MINIMUM_DISTANCE_PROTECTED` reason code is correctly added to the reason code union.

The wake age readability formula in Section 27.1 is well-constructed:

```ts
wakeAgeFactor = clamp(1.0 - clamp(ageRatio, 0.0, 1.0) * 0.6, 0.4, 1.0)
```

A floor of 0.4 prevents even near-expired wakes from vanishing too abruptly. This is correct atmospheric behavior — wakes should fade, not pop.

Section 8 (readability score is non-authoritative) is an important addition. Listing all the prohibited downstream uses explicitly closes any ambiguity about whether a camera or pacing system could use `readabilityScore` as a trigger.

---

## Remaining Issues

### 1. Weather-Adjusted Distance and Weather Factor Are Double-Counted in the Score Formula (Blocking)

Section 22 introduces weather-adjusted effective distance:

```ts
effectiveDistanceMeters =
  distanceMeters / clamp(weatherFactor, 0.25, 1.0);
```

Under FOG (`weatherFactor = 0.38`), a vessel at 1000m is treated as if it were at approximately 2630m. This collapses `distanceFactor` from the 0.8 tier to the 0.55 tier.

The canonical score formula in Section 15 is:

```
readabilityScore =
  baseTierReadability
  × distanceFactor          ← affected by effectiveDistanceMeters
  × weatherFactor           ← 0.38 for FOG, applied again
  × timeOfDayFactor
  × taxonomyResistanceFactor
  × clutterFactor
  × provenanceFactor
```

When `effectiveDistanceMeters` is used to derive `distanceFactor`, weather suppresses readability twice: once through the expanded effective distance (making the vessel appear farther away), and again as its own direct multiplier in the score formula. In the FOG example, this produces a score baseline of roughly `(compressed distanceFactor) × 0.38` — a far more aggressive suppression than either mechanism would produce alone.

This is not the intended model. Weather should suppress readability through one path, not two simultaneous compounding paths.

The spec uses "may be adjusted" language (Section 22: "effective distance *may* be adjusted") but then presents the formula as a definitive computation, not an option. If the effective distance adjustment is optional, that conditionality needs to be explicit. If it is always applied, then `weatherFactor` must be excluded from the score formula when `effectiveDistanceMeters` is used — or the score formula must use raw `distanceMeters` for `distanceFactor` and rely solely on `weatherFactor` for weather suppression.

**Required:** Resolve the double-counting. Either:
- (a) Use raw `distanceMeters` for `distanceFactor` in the score formula; use `weatherFactor` as the sole weather suppression path; treat the effective-distance formula as a future continuous-visibility extension activated only when `visibilityMeters` is non-null.
- (b) Apply `effectiveDistanceMeters` to derive `distanceFactor` and remove `weatherFactor` from the score formula, replacing it with a note that weather suppression is carried via distance compression only.

Option (a) is preferred: it preserves the existing score formula structure and confines the effective-distance mechanism to cases where `visibilityMeters` provides a continuous input rather than the discrete weather enum.

---

### 2. Dependency on `0523D v1.0.1` — Still Phantom (Blocking)

`depends_on` still lists `0523D_WOS_MaritimeWakeAuthority_v1.0.1`. This version does not exist in the review chain. The chain contains `v1.0.0` (three blocking issues) and `v1.1.0` (same three blocking issues confirmed). The pending patch is `v1.2.0`.

This is identical to the Blocking Issue 4 raised in the v1.0.0 review. It was not resolved.

**Required:** Update `depends_on` to reference the actual frozen version of 0523D once it exists. This spec may not enter BUILD while 0523D has open blocking issues, regardless of what the freeze decision on this spec says.

---

### 3. `0523R_WOS_InfrastructureRegistry_v1.2.2_FULL` Is Non-Standard (Non-Blocking)

The registry dependency uses a `_FULL` suffix:

```yaml
- "0523R_WOS_InfrastructureRegistry_v1.2.2_FULL"
```

The registry versioning convention is semver (`v1.2.2`, `v1.2.3`, etc.). `_FULL` is not a recognized version suffix in this chain. The v1.2.2 review found the registry NOT READY FOR FREEZE due to three section omissions; the corrected version should be `v1.2.3` once reviewed. Referencing `v1.2.2_FULL` as an informal alias for the restored version bypasses the review chain.

**Recommended:** Replace with `0523R_WOS_InfrastructureRegistry_v1.2.3` once that version is reviewed and frozen.

---

### 4. `0523A v1.2.2` Dependency Is Unreviewed (Non-Blocking)

`depends_on` references `0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2`. The last reviewed 0523A version was `v1.2.0` (two blocking issues: unreachable MILITARY AIS branch, FISHING `routeDiscipline: "VARIABLE"` not in enum). `v1.2.1` is referenced by 0523C, 0523D, and prior 0523E versions but has not been formally reviewed in this chain. `v1.2.2` has not been reviewed at all.

This spec cannot be built against an unreviewed upstream taxonomy version.

**Recommended:** Confirm 0523A v1.2.2 has been reviewed and frozen before treating this dependency as resolved. The `wakeClass` enum divergence between 0523A and 0523D (ISSUE-0523A-001 / ISSUE-0523D-003) must also be resolved before either can serve as a stable upstream dependency.

---

### 5. `blurHint` Formula References `distanceFactor` Without Specifying Its Source (Non-Blocking)

Section 25.1:

```ts
blurHint =
  clamp(weatherBlurHint + (1.0 - distanceFactor) * 0.25, 0.0, 1.0);
```

`distanceFactor` here is ambiguous: is it derived from raw `distanceMeters` or from `effectiveDistanceMeters`? If the weather-adjusted effective distance from Section 22 is used, distant vessels in fog would compound blur beyond what the weather lookup alone would produce. If raw distance is used, blur increases monotonically with range regardless of weather. The intent is not stated.

Once Blocking Issue 1 is resolved (weather/distance double-counting), the blur formula should explicitly state which distance input it uses.

**Recommended:** Clarify after resolving Blocking Issue 1 whether `distanceFactor` in the blur formula uses raw or weather-adjusted distance.

---

## Assessment

v1.1.0 successfully resolves all v1.0.0 blocking issues except the phantom 0523D dependency, which carries forward unchanged. The formula completeness work — clutter factor, taxonomy resistance factor, blur/contrast hint derivations — is correct and implementable. The minimum visible distance protection and wake age formula are good additions.

The new blocking issue (weather double-counting) was introduced by the weather-adjusted effective distance mechanism in Section 22 interacting with the existing score formula. This is the kind of precision gap that emerges when a new formula is added without reconciling it against the existing multiplicative model. The fix is straightforward and does not require architectural rework — it is a scoping decision about which path carries weather suppression.

The dependency issues are governance problems, not architectural ones. The formula work is sound.

---

## Review Status

**NOT READY FOR BUILD — Two blocking issues.**

All prior formula gaps are resolved. Two issues prevent freeze: a score double-counting introduced in v1.1.0, and the unresolved phantom dependency on 0523D.

---

## Required Before Build (Blocking)

1. **Resolve weather-adjusted distance double-counting** — `effectiveDistanceMeters` in Section 22 and `weatherFactor` in the Section 15 score formula both suppress readability for the same cause. Define one authoritative path for weather suppression.
2. **Resolve `0523D v1.0.1` phantom dependency** — update `depends_on` to reference the actual frozen 0523D version when it exists.

---

## Recommended Before Freeze (Non-Blocking)

3. Replace `0523R v1.2.2_FULL` with `0523R v1.2.3` once that version is reviewed and frozen.
4. Confirm `0523A v1.2.2` has been reviewed and frozen; verify `wakeClass` enum divergence is resolved upstream.
5. Clarify whether `distanceFactor` in the blur hint formula (Section 25.1) uses raw or weather-adjusted distance, resolving after Blocking Issue 1.
