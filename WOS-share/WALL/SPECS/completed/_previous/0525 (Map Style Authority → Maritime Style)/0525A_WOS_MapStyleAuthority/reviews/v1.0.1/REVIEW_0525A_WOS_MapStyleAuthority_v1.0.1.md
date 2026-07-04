# Architectural Review: 0525A_WOS_MapStyleAuthority_v1.0.1

**Review Type:** Architecture — v1.0.0 Blocking Issue Resolution and Freeze Validation
**Prior Review:** REVIEW_0525A_WOS_MapStyleAuthority_v1.0.0_FULL.md
**Stage:** [REVIEW] / REVIEW — reviewing against governance hardening objectives

---

## Blocking Issue Resolution from v1.0.0 Review

| Prior Blocking Issue | Status |
|---|---|
| No `depends_on` dependency declarations | ✅ Resolved — PATCH-1 adds formal YAML dependency chain |
| `LandStyle` type undefined | ✅ Resolved — "NEW DATA MODEL ADDITIONS" defines `LandStyle` |
| `AtmosphereStyle` vs 0523E authority boundary undefined | ✅ Resolved — PATCH-2 adds canonical authority separation doctrine |
| `movementInterpolationMs` runtime motion authority conflict | ✅ Resolved — PATCH-3 replaces with `MotionPresentationStyle` + explicit visual-only constraint |
| "Writes To: RendererStyleState" write-path ambiguity | ✅ Resolved — PATCH-5 replaces with `Produces: MapStyleManifest` manifest pattern |

All five v1.0.0 blocking issues resolved in principle. Three new blocking issues introduced.

---

## What v1.0.1 Gets Right

The governance corrections in PATCH-1 through PATCH-5 are all correct in direction:

**PATCH-2 (Atmospheric authority)** adds the exact doctrine the prior review requested:

```text
MapStyleAuthority may NEVER elevate a vessel
to a higher visibilityClass than assigned by
AtmosphericReadability.
```

This closes the authority leakage concern precisely.

**PATCH-3 (Motion authority)** correctly replaces `movementInterpolationMs` with a properly scoped `MotionPresentationStyle` struct, with explicit doctrine that it affects only the presentation layer and may never alter runtime cadence, fixed timestep accumulation, or AIS continuity.

**PATCH-5 (Manifest pattern)** correctly resolves the write-path ambiguity:

```text
MapStyleAuthority produces immutable presentation manifests
consumed by MarineRenderer.
MarineRenderer remains authoritative owner of render execution state.
```

This is the right pattern. MarineRenderer remains in control of what it does with the manifest.

The non-blocking recommendations were also addressed: ObservabilityCamera governance note added; wake presentation scope clarified; `PresentationState` ambiguity resolved by moving to manifest language.

---

## Blocking Issues

### 1. Patch Format Violates Canonical Artifact Rule (Blocking)

Every spec in the 0523 chain contains this rule:

```text
Canonical Artifact Rule:
Patch releases must remain reconstructable without prior versions.
Partial-file patch releases are forbidden.
```

v1.0.1 is a patch summary document — it describes what changed relative to v1.0.0 but does not contain the full specification. To understand the complete governance state of 0525A at v1.0.1, a reader must hold both v1.0.0 and v1.0.1 simultaneously and mentally merge the diffs.

This is exactly the failure mode the canonical artifact rule was designed to prevent. The rule exists because:
- Downstream spec authors cannot declare a dependency against a partial patch
- The registry cannot verify governance state from v1.0.1 alone
- Subsequent patches would need to diff against multiple prior versions
- Any consumer reading v1.0.1 in isolation cannot find the full authority boundary model, the complete style layer schemas, the full validation checklist, or the execution flow

**Required:** v1.0.1 must be a complete standalone canonical document containing all sections from v1.0.0 with the v1.0.1 corrections applied in place. The patch description may be included as a "Change Summary" section (as 0523E v1.1.0 and 0523F v1.2.0 did), but the full spec content must be present.

---

### 2. Three Sub-Types Introduced by PATCH-3 Are Undefined (Blocking)

PATCH-3 restructures `VesselStyle` to:

```ts
type VesselStyle = {
  readonly symbolic: SymbolicVesselStyle
  readonly lighting: VesselLightingStyle
  readonly wakePresentation: WakePresentationStyle
  readonly motionPresentation: MotionPresentationStyle
}
```

`MotionPresentationStyle` is defined in PATCH-3. The other three sub-types — `SymbolicVesselStyle`, `VesselLightingStyle`, `WakePresentationStyle` — have no definition anywhere in this document or in v1.0.0. They replace the complete v1.0.0 `VesselStyle` field set (`hullColor`, `deckColor`, `accentColor`, `wakeAlpha`, `wakeLength`, `farLightAlpha`, `farLightHalo`, `twinkleStrength`, `compactScale`, `detailedScale`) without providing equivalent definitions for the new structure.

An implementer cannot construct a `VesselStyle` from this spec.

**Required:** Define `SymbolicVesselStyle`, `VesselLightingStyle`, and `WakePresentationStyle` as complete types. The v1.0.0 fields (`hullColor`, `deckColor`, `farLightAlpha`, etc.) should be distributed into these sub-types as appropriate to the restructuring intent.

---

### 3. `InterpolationCurve` Is a New Undefined Type Reference (Blocking)

`MotionPresentationStyle` includes:

```ts
readonly interpolationCurve: InterpolationCurve
```

`InterpolationCurve` is not defined in this patch or in any prior chain document. It may be an enum (`LINEAR | EASE_IN | EASE_OUT | EASE_IN_OUT`), a numeric parameter, or a named curve type. An implementer cannot type-safely use `MotionPresentationStyle` without knowing what values `interpolationCurve` accepts.

**Required:** Define `InterpolationCurve` as either an enum or a documented scalar type with explicit allowed values and semantic descriptions.

---

## Non-Blocking Issues

### 4. Dependency Chain: 0523E v1.2.0 and 0523F v1.2.0 Not Yet Build-Ready

`depends_on` correctly references:
- `0523D v1.2.1` — READY FOR BUILD ✅
- `0523E v1.2.0` — NOT READY FOR BUILD (pending 0523R v1.2.3 review)
- `0523F v1.2.0` — NOT READY FOR BUILD (pending 0523E build-readiness, pending 0523R v1.2.3)
- `0523R v1.2.3` — not yet reviewed

With `0523D v1.2.1` now BUILD-ready, the 0523D-related blocker across 0523E and 0523F is resolved. The remaining blocker for both is `0523R v1.2.3` — once that is reviewed and frozen, the entire chain from 0523D → 0523E → 0523F → 0525A should unblock simultaneously.

This is not a defect in 0525A v1.0.1 itself; it is an upstream chain prerequisite that will resolve naturally. No action required in this spec.

---

### 5. `MaritimeStyleRegistry` Still Missing Six Vessel Classes

Present in v1.0.0 and not addressed in v1.0.1. The registry example covers `cargo, tanker, ferry, service, recreational, fishing`. Missing: `PASSENGER, TUG, MILITARY, INDUSTRIAL, UNKNOWN`, and notably also `CARGO` capitalization conventions need alignment with 0523A's enum.

**Recommended:** When producing the full v1.0.1 canonical document (per Blocking Issue 1), expand `MaritimeStyleRegistry` to cover all 11 canonical vessel classes or define a `default: VesselStyle` fallback.

---

### 6. "Runtime Registry" in Execution Flow Remains Undefined

Present in v1.0.0 and not addressed in v1.0.1. The execution flow shows:

```text
AIS Runtime → Continuity Resolution → Runtime Registry → Style Registry Lookup → ...
```

"Runtime Registry" is unnamed and undefined.

**Recommended:** When producing the full canonical document, either define "Runtime Registry" as a named system with an owner, or replace it with the appropriate system name from the chain.

---

## Assessment

The governance corrections in PATCH-1 through PATCH-5 are all architecturally correct. PATCH-2 (atmospheric authority) and PATCH-5 (manifest pattern) in particular resolve the two most significant structural concerns from v1.0.0. The patch achieves its stated objective of governance stabilization without feature escalation.

The blocking issues are all artifacts of the patch format choice: the document describes changes rather than constituting a complete spec, and in doing so, the restructuring introduced by PATCH-3 left three new types undefined. These are not architectural failures — they are document completeness gaps that will be resolved when the full canonical document is produced.

---

## Review Status

**NOT READY FOR BUILD — Three blocking issues.**

Governance corrections are correct. Document format and new undefined types prevent freeze.

---

## Required Before Build (Blocking)

1. **Produce full standalone canonical document** — v1.0.1 must contain the complete spec content, not only the patch delta. Patch summary may be included as a change-summary section.
2. **Define `SymbolicVesselStyle`, `VesselLightingStyle`, `WakePresentationStyle`** — three sub-types introduced by PATCH-3 have no definition.
3. **Define `InterpolationCurve`** — new type referenced in `MotionPresentationStyle` with no definition.

---

## Recommended Before Freeze (Non-Blocking)

4. Expand `MaritimeStyleRegistry` to all 11 canonical vessel classes or define default fallback (carry-forward from v1.0.0).
5. Define or replace "Runtime Registry" in the execution flow (carry-forward from v1.0.0).
