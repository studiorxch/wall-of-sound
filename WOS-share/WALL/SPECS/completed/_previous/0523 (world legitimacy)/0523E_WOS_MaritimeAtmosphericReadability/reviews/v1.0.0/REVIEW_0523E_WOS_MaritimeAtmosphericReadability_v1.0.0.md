# Architectural Review: 0523E_WOS_MaritimeAtmosphericReadability_v1.0.0

**Review Type:** Architecture — First Review
**Stage:** [REVIEW] / REVIEW — reviewing before build
**Spec Purpose:** Pure interpretation layer; atmosphere modifies readability descriptors without mutating runtime truth.

---

## What v1.0.0 Gets Right

The core doctrine is exactly correct. Separating existence (runtime) from readability (atmosphere) from presentation (renderer) is the right three-layer model. The strict prohibition on runtime mutation — no AIS state, no lifecycle, no population tier, no wake registry — is well-enforced throughout and repeated consistently. The repeated doctrinal statements are not redundant; they are governance anchors that survive partial reads.

The visibility class progression (`FULL → REDUCED → SILHOUETTE → MARKER_ONLY → LIGHT_ONLY → ATMOSPHERIC_HIDDEN`) is well-designed. The special-casing of `ATMOSPHERIC_HIDDEN` as a visual state only — not an existence claim — is important and stated clearly. Night doctrine (Section 18) choosing `LIGHT_ONLY` over `ATMOSPHERIC_HIDDEN` for ferry/tug/passenger traffic is atmospherically correct.

The label authority separation in Section 14 is clean:

```
labelEligibility = PopulationHierarchy
labelReadability = AtmosphericReadability
```

This is the right split. Neither system can override the other's domain.

The three pure functions in Section 20, the determinism requirements in Section 21, and the validation checklist in Section 24 are correct and complete as stated.

---

## Blocking Issues

### 1. `clutterFactor` Is Referenced in the Score Formula But Never Defined

Section 8 specifies the canonical readability score formula:

```
readabilityScore =
  baseTierReadability
  × distanceFactor
  × weatherFactor
  × timeOfDayFactor
  × taxonomyResistanceFactor
  × clutterFactor
  × provenanceFactor
```

`clutterFactor` is one of seven named factors. Five are defined elsewhere in the spec (`baseTierReadability` → Section 9, `weatherFactor` → Section 10, `timeOfDayFactor` → Section 11, `distanceFactor` → Section 12, `provenanceFactor` → Section 16). `clutterFactor` is not. `clutterPressure` exists as a context field (`0.0 → 1.0`) and Section 19 describes its effects qualitatively, but no formula maps `clutterPressure` to `clutterFactor` for use in the score multiplication.

A downstream implementer cannot write `resolveVesselReadability` without this.

**Required:** Define the `clutterFactor` derivation — at minimum, the formula that maps `MaritimeAtmosphericContext.clutterPressure` to the multiplier used in the score model.

---

### 2. `taxonomyResistanceFactor` Is Referenced in the Score Formula But Never Defined

Same issue. `taxonomyAtmosphericResistance: number // 0.0 → 1.0` is declared in `VesselReadabilityInput`, and `taxonomyResistanceFactor` is named in the Section 8 formula, but no definition says how the input value becomes the multiplier. It may be intended as a direct pass-through (resistance IS the factor), but that assumption cannot be left implicit in an infrastructure spec.

**Required:** Define the `taxonomyResistanceFactor` derivation explicitly.

---

### 3. `atmosphericBlurHint` and `atmosphericContrastHint` Have No Defined Computation

`AtmosphericReadabilityResult` includes:

```ts
atmosphericBlurHint: number;    // 0.0 → 1.0
atmosphericContrastHint: number; // 0.0 → 1.0
```

No section defines how these are computed. They are output contract fields that the renderer will consume (Section 22 confirms this), but there is no formula, lookup, or description anywhere in the spec for how blur and contrast hints are derived from weather state, time of day, distance, or any other input.

This leaves implementers to invent the computation — which breaks the spec's purpose as a governance document.

**Required:** Define how `atmosphericBlurHint` and `atmosphericContrastHint` are derived. Discrete lookup tables per `weatherState` and `timeOfDay` are sufficient; exact perceptual values can be tuned later.

---

### 4. Dependency on `0523D_WOS_MaritimeWakeAuthority_v1.0.1` — Version Does Not Exist in Review Chain

The YAML front matter declares:

```yaml
depends_on:
  - "0523D_WOS_MaritimeWakeAuthority_v1.0.1"
```

The review chain contains `0523D v1.0.0` (three blocking issues: `parentEvicted` readonly conflict, non-provenance-aware budget split, `wakeClass` enum divergence with 0523A) and `0523D v1.1.0` (same three blocking issues confirmed). There is no `v1.0.1`. The pending patch is `v1.2.0`.

This spec cannot be frozen or built until 0523D reaches a reviewed and frozen state. The dependency reference must point to the actual resolved version when it exists.

Additionally: `0523R_WOS_InfrastructureRegistry_v1.2.2` is listed as a dependency. That version was reviewed and found NOT READY FOR FREEZE (three section omissions). The dependency should resolve to `v1.2.3` once that patch is confirmed.

**Required:** Update `depends_on` to reference actual frozen versions once they exist. This spec must not be built while upstream blocking issues in 0523D are open.

---

## Non-Blocking Issues

### 5. Three Input Fields Are Declared But Unused

`VesselReadabilityInput` declares:
- `taxonomyProjectionWeight: number` — appears in no formula, no decision, no output
- `updateAdvisory` — declared and typed, never referenced anywhere in the spec

`MaritimeAtmosphericContext` declares:
- `cameraDistanceMeters: number | null` — distance attenuation (Section 12) uses `distanceMeters` from `VesselReadabilityInput`, not this field

`visibilityMeters: number | null` in context is adjacent to this concern — the weather factors in Section 10 use discrete `weatherState` enum values, not the meters value. If `visibilityMeters` is intended to override or blend with the discrete factors, that logic is absent.

Dead input fields in a spec contract mislead implementers and create future ABI debt. Each field that appears in a contract must either be used in a defined formula or removed.

**Recommended:** Remove unused fields or add explicit usage in formulas. If `visibilityMeters` is reserved for future continuous-visibility modeling, mark it as such.

---

### 6. Source of `clutterPressure` Is Unspecified

`MaritimeAtmosphericContext.clutterPressure` is consumed by the score formula (once Blocking Issue 1 is resolved), but nothing in this spec says who produces it. If `clutterPressure` is derived from renderer density, camera view frustum vessel count, or any other runtime/renderer state, it becomes a backdoor through which renderer state influences atmospheric computation — violating the one-way data flow doctrine.

**Recommended:** Specify the authority that produces `clutterPressure`. If it derives from the runtime vessel population count (not the renderer), state that. If it's an external input computed by a separate system not yet spec'd, name that future system.

---

### 7. `SYNTHETIC_DEEMPHASIS` Reason Code Has No Triggering Condition

Section 4.1 includes `"SYNTHETIC_DEEMPHASIS"` in the `AtmosphericReadabilityReason` union. Section 16 applies a 0.72 provenance factor for `SYNTHETIC_ECOLOGY`. But no code or rule specifies when `SYNTHETIC_DEEMPHASIS` is added to `reasonCodes`. It is presumably emitted whenever `provenance === "SYNTHETIC_ECOLOGY"` and the factor is applied — but this should be stated explicitly.

**Recommended:** Add a rule: emit `SYNTHETIC_DEEMPHASIS` in `reasonCodes` whenever `provenance === "SYNTHETIC_ECOLOGY"` and the provenance factor is applied.

---

### 8. `labelReadable` in Wake Readability Result Is Semantically Inapplicable

`resolveWakeReadability` returns `AtmosphericReadabilityResult`, which includes `labelReadable: boolean`. Wakes do not have labels. Reusing the vessel output type for wake results produces output fields that are meaningless for wakes. This is a minor type pollution issue.

**Recommended:** Either define a dedicated `WakeAtmosphericReadabilityResult` type without `labelReadable`, or explicitly document that `labelReadable` is always `false` for wake results and should be ignored.

---

### 9. `resolveLabelReadability` vs `labelReadable` Consistency Not Guaranteed

Section 20 defines both:
- `resolveVesselReadability(...)` → `AtmosphericReadabilityResult` (includes `labelReadable: boolean`)
- `resolveLabelReadability(...)` → `boolean`

These are two separate functions that should return consistent answers for the same input. If a caller uses `resolveVesselReadability` for the full result and separately calls `resolveLabelReadability` for label state, they may get different answers if the implementations diverge. The spec does not state that `resolveLabelReadability` must be equivalent to extracting `.labelReadable` from `resolveVesselReadability`.

**Recommended:** State explicitly that `resolveLabelReadability(input, context) === resolveVesselReadability(input, context).labelReadable`. This makes the shortcut function a guaranteed projection of the full computation, not a separate code path.

---

## Assessment

The authority boundary work in this spec is clean and well-executed. The three-layer model (runtime → atmosphere → renderer), the visibility-is-not-existence doctrine, and the label authority split are all correct. The validation checklist in Section 24 is complete against the spec's stated purpose.

The blocking issues are all implementation gaps: three formula definitions missing from the output contract, and a dependency chain that references a version that doesn't exist. None of these are architectural failures — they are precision gaps in a first-draft spec. The non-blocking issues are mostly dead fields and a few consistency rules that need to be stated.

This spec should not advance to BUILD until the four blocking issues are resolved and the 0523D dependency chain is unfrozen at a reviewed version.

---

## Review Status

**NOT READY FOR BUILD — Four blocking issues.**

Architecture and authority boundaries are correct. Formula specification is incomplete.

---

## Required Before Build (Blocking)

1. **Define `clutterFactor` derivation** — formula mapping `clutterPressure` (0.0→1.0) to score multiplier is absent.
2. **Define `taxonomyResistanceFactor` derivation** — whether it is a direct pass-through or a curve must be stated explicitly.
3. **Define `atmosphericBlurHint` and `atmosphericContrastHint` computation** — output contract fields with no derivation formula.
4. **Resolve dependency chain** — `0523D v1.0.1` does not exist; spec cannot build until 0523D reaches a reviewed frozen version. Update `depends_on` accordingly.

---

## Recommended Before Freeze (Non-Blocking)

5. Remove or justify unused input fields: `taxonomyProjectionWeight`, `updateAdvisory`, `cameraDistanceMeters`; clarify `visibilityMeters` usage.
6. Specify the authority that produces `clutterPressure` to prevent renderer-state backdoor.
7. Add triggering condition for `SYNTHETIC_DEEMPHASIS` reason code.
8. Address `labelReadable` semantic inapplicability in wake readability results.
9. State that `resolveLabelReadability` is a guaranteed projection of `resolveVesselReadability(...).labelReadable`.
