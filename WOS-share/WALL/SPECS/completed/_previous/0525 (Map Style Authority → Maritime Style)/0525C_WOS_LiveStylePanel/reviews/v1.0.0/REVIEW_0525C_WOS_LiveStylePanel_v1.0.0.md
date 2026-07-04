# Architectural Review: 0525C_WOS_LiveStylePanel_v1.0.0

**Review Type:** Architecture — First Review
**Stage:** [REVIEW] / REVIEW — reviewing before build
**Spec Purpose:** Developer-facing live presentation tuning panel; single-writer override governance; validation before applying style overrides to MapStyleAuthority.

---

## What v1.0.0 Gets Right

The authority model is correctly framed for developer tooling. The single-writer rule, the "ephemeral by default" doctrine for draft values, and the deferred serialization path to `0525G` are all right. The UI state machine (`INACTIVE → DRAFT → LIVE_OVERRIDE → INVALID → SERIALIZATION_CANDIDATE`) is clear and implementable.

The blocked control groups are comprehensive and correctly exclude all runtime fields: vessel position, heading truth, visibilityClass assignment, wake lifetime, population tier, camera routing, overlay semantic content. The blocked list reads as a correct inversion of the allowed list.

The approved execution path is correct:

```text
LiveStylePanel → StyleOverrideDraft → Validation → MapStyleAuthority.setSingleLiveOverride() → MapStyleManifest → MarineRenderer
```

The two forbidden paths (direct renderer mutation; direct runtime mutation) are stated explicitly.

The validation checklist is thorough and correctly references authority rules (`twinkleRateHz > 1.0 rejected`, `holdMs > 3200ms rejected`).

`atmosphere.visibilityFalloffKm` is correctly absent from the allowed controls list — its exclusion is implicit in the 0525A authority boundary concern about that field overriding 0523E. Its absence here is the right call.

---

## Blocking Issues

### 1. `0525B v1.0.1` Is a Phantom Dependency

`depends_on` references `0525B_WOS_MaritimeStyleRegistry_v1.0.1`. The review chain contains only `0525B v1.0.0` (reviewed, NOT READY FOR BUILD due to upstream chain). `v1.0.1` does not exist in the review chain. This is the same phantom dependency pattern that caused multiple review cycles for 0523E (which referenced `0523D v1.0.1`).

**Required:** Update to reference `0525B_WOS_MaritimeStyleRegistry_v1.0.0` or the actual frozen version once it exists. Do not reference versions that have not been submitted for review.

---

### 2. `StyleOverride` Type Is Undefined

The spec lists `StyleOverride` as a primary produced artifact in three places:

- "This Specification Produces: `StyleOverride`"
- The approved write path passes a `StyleOverride` to `MapStyleAuthority.setSingleLiveOverride()`
- `convertDraftToStyleOverride(draft)` returns a `StyleOverride`

`StyleOverride` is never defined anywhere in this spec. `StyleOverrideDraft`, `StylePanelValidationResult`, and `StylePanelSnapshot` are all defined — but not the final applied override type that the entire override governance model depends on.

**Required:** Define `StyleOverride` as a complete type. At minimum it must include: override ID, target domain, target layer or class key, validated field values, provenance, and creation timestamp.

---

### 3. `isAllowedStyleField` Is Called But Never Defined

`validateStyleOverrideDraft` contains:

```ts
if (!isAllowedStyleField(draft, fieldKey)) {
  errors.push({ ... authorityViolation: true });
}
```

`isAllowedStyleField` is not defined anywhere in this spec. This function is the core of the entire validation authority boundary — it is what prevents runtime fields from being submitted as style overrides. Without its definition, the validation path is architecturally incomplete.

**Required:** Define `isAllowedStyleField(draft, fieldKey)` with an explicit allowed-field lookup against the control groups defined in the "ALLOWED CONTROL GROUPS" section.

---

### 4. `convertDraftToStyleOverride` Is Called But Never Defined

`applyDraftAsLiveOverride` contains:

```ts
const override = convertDraftToStyleOverride(draft);
SBE.MapStyleAuthority.setSingleLiveOverride(override);
```

`convertDraftToStyleOverride` is not defined. This is the only path from a validated draft to an applied override. Without the function, the apply path is not implementable from this spec.

**Required:** Define `convertDraftToStyleOverride(draft: StyleOverrideDraft): StyleOverride`. At minimum it should extract validated fields, assign a stable override ID, and attach the provenance value.

---

### 5. `setSingleLiveOverride` and `clearLiveOverride` Are Not Defined in 0525A

The entire write authority model depends on:

```ts
SBE.MapStyleAuthority.setSingleLiveOverride(override)
SBE.MapStyleAuthority.clearLiveOverride()
```

Neither method exists in 0525A v1.0.1's public API surface. 0525A v1.0.1 does not define a public API at all — it states the manifest pattern but does not define the methods that LiveStylePanel must call to enforce single-writer override governance.

These must be defined in 0525A v1.0.2 (the complete canonical document that 0525A v1.0.1 must become). Until they exist in a reviewed and frozen 0525A, this spec's write path is undefined.

**Required:** Confirm that `setSingleLiveOverride` and `clearLiveOverride` will be defined as public API in 0525A v1.0.2. Note this dependency explicitly in 0525C.

---

### 6. `0525A v1.0.1` Is Not Frozen (Blocking for Freeze)

`depends_on` references `0525A_WOS_MapStyleAuthority_v1.0.1` which was reviewed NOT READY FOR BUILD (patch format violation; undefined sub-types; undefined `InterpolationCurve`). 0525C cannot freeze until 0525A is frozen at a valid reviewed version.

**Required:** 0525A v1.0.2 (complete canonical document) must be produced and frozen.

---

## Non-Blocking Issues

### 7. `Date.now()` Used in `createStyleOverrideDraft` — Determinism Exception Not Stated

`createStyleOverrideDraft` uses `Date.now()` three times:

```ts
draftId: `style-draft::${Date.now()}`,
createdAtMs: Date.now(),
updatedAtMs: Date.now(),
```

Every runtime spec in the 0522/0523 chain explicitly forbids `Date.now()`. The LiveStylePanel is developer tooling — draft IDs using wall-clock time for UI tracking is reasonable and poses no runtime truth risk. But the spec doesn't explicitly acknowledge this as an intentional tooling exception to the determinism doctrine.

**Recommended:** Add a note: "Draft IDs and timestamps in LiveStylePanel use wall-clock time (`Date.now()`) as tooling identifiers only. This is an intentional exception to the runtime determinism doctrine — these values are ephemeral tooling records and do not affect runtime truth or replay."

---

### 8. `densityResponse.labelVisualSuppressionStrength` Exposed as Tunable — Field Is Unimplemented in 0525B

The allowed maritime controls include `densityResponse.labelVisualSuppressionStrength`. However, the 0525B v1.0.0 review identified this field as declared in `DensityResponseStyle` but never applied in `applyDensityPressureToStyle`. Exposing an unimplemented field as a tunable slider creates a confusing developer experience — the slider moves, no visual change occurs.

**Recommended:** Either (a) remove from the allowed control list until 0525B implements the field, or (b) mark it in the panel UI as "pending implementation" so developers understand its current state.

---

### 9. `SBE.` Namespace Undefined

`SBE.MapStyleAuthority.setSingleLiveOverride()` — `SBE` appears here as it did in 0525B without definition. Carried forward.

**Recommended:** Define `SBE` or replace with the actual module access pattern.

---

### 10. Upstream Chain Dependency State

- `0523E v1.2.0` — NOT READY FOR BUILD (pending `0523R v1.2.3`)
- `0523F v1.2.0` — NOT READY FOR BUILD (pending 0523E, `0523R v1.2.3`)
- `0523R v1.2.3` — not yet reviewed

With `0523D v1.2.1` now READY FOR BUILD, these blockers reduce to `0523R v1.2.3`. No action in this spec.

---

## Assessment

The authority model, UI state machine, single-writer governance, and allowed/blocked field lists are all correctly designed. The spec correctly identifies what the panel may and may not do. The architecture of "draft → validate → apply through approved API → manifest → renderer" is right.

The blocking issues are concentrated in two areas: a phantom upstream dependency (`0525B v1.0.1`) and four undefined elements that are each required for the spec to be implementable (`StyleOverride` type, `isAllowedStyleField`, `convertDraftToStyleOverride`, and the upstream `MapStyleAuthority` API). None require architectural rework — they are definition gaps.

---

## Review Status

**NOT READY FOR BUILD — Six blocking issues.**

Authority model and governance structure are correct. Four undefined elements in core functions and two dependency chain issues prevent freeze.

---

## Required Before Build (Blocking)

1. **Update `0525B` dependency** — `v1.0.1` does not exist; reference `v1.0.0` or actual frozen version.
2. **Define `StyleOverride` type** — the primary produced artifact has no type definition.
3. **Define `isAllowedStyleField`** — validation core path is incomplete without it.
4. **Define `convertDraftToStyleOverride`** — apply path is incomplete without it.
5. **Confirm `setSingleLiveOverride` / `clearLiveOverride` will be defined in 0525A v1.0.2** — note this API dependency explicitly.
6. **0525A v1.0.2 must be produced and frozen** — 0525A v1.0.1 is not frozen; 0525C cannot freeze while its primary upstream is a patch-only document.

---

## Recommended Before Freeze (Non-Blocking)

7. Add explicit tooling exception note for `Date.now()` usage in draft creation.
8. Remove `densityResponse.labelVisualSuppressionStrength` from allowed controls or mark as "pending implementation" until 0525B implements the field.
9. Define `SBE.` namespace or replace with actual module access pattern.
10. Confirm `0523R v1.2.3` reviewed and frozen to unblock 0523E/F chain.
