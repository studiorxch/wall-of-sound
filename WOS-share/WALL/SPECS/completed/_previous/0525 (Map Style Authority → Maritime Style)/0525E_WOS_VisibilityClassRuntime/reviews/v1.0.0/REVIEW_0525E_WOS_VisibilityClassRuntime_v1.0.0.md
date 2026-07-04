# REVIEW: 0525E_WOS_VisibilityClassRuntime_v1.0.0
**WOS Visibility Class Runtime**
Review date: 2026-05-26

---

## VERDICT: NOT READY FOR BUILD

Six blocking issues. Five dependencies are phantom versions, unreviewed, or unresolved upstream.

---

## DEPENDENCY AUDIT

| Dependency | Status |
|---|---|
| 0525A_WOS_MapStyleAuthority_v1.0.2 | PHANTOM — v1.0.2 not yet produced; v1.0.1 is patch-format violation |
| 0525B_WOS_MaritimeStyleRegistry_v1.0.1 | PHANTOM — only v1.0.0 reviewed |
| 0525C_WOS_LiveStylePanel_v1.0.1 | PHANTOM — only v1.0.0 reviewed; v1.0.0 has 6 blocking issues |
| 0525D_WOS_SurfaceStylePresets_v1.0.1 | UNREVIEWED — never reviewed in chain |
| 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0 | REVIEWED — NOT READY (blocked on 0523R v1.2.3) |
| 0523F_WOS_MaritimeContinuityDensity_v1.2.0 | REVIEWED — NOT READY (blocked on 0523R v1.2.3) |
| 0523B_WOS_MaritimePopulationHierarchy_v1.1.0 | UNREVIEWED — not reviewed in this chain |

5 of 7 dependencies are phantom, unreviewed, or not frozen.

---

## BLOCKING ISSUES

### ISSUE-0525E-001: `sourceAuthority` single-winner overwrite loses multi-factor attribution

**Severity: BLOCKING**

`sourceAuthority` is reassigned sequentially through each tightening block. If density tightens and then zoom also tightens, the final value is `"ZOOM"` regardless of density's contribution. Last-write wins.

```ts
// density tightens resolved → sourceAuthority = "DENSITY"
// then zoom tightens further → sourceAuthority = "ZOOM"
// density's contribution is lost from the result record
```

Fix: change to `sourceAuthorities: readonly SourceAuthority[]`, or establish an explicit authority precedence order and document it.

---

### ISSUE-0525E-002: `populationTier === "GHOST"` block has no `sourceAuthority` update + enum gap

**Severity: BLOCKING**

When GHOST tier tightens to `LIGHT_ONLY`, `sourceAuthority` is never updated:

```ts
if (input.populationTier === "GHOST") {
  resolved = tightenVisibility(resolved, "LIGHT_ONLY");
  // sourceAuthority not set — inherits whatever previous block last wrote
}
```

Additionally, `"POPULATION_TIER"` is not in the `sourceAuthority` union type:

```ts
sourceAuthority: "ATMOSPHERIC_READABILITY" | "DENSITY" | "ZOOM" | "PRESET" | "FALLBACK"
// POPULATION_TIER is missing
```

GHOST-driven tightening will be misattributed to the last-set authority.

---

### ISSUE-0525E-003: Distance-driven tightening labeled as `"ZOOM"` authority

**Severity: BLOCKING**

```ts
if (input.distanceKm !== null && input.distanceKm >= FAR_DISTANCE_KM) {
  resolved = tightenVisibility(resolved, "LIGHT_ONLY");
  sourceAuthority = "ZOOM";  // WRONG — this is DISTANCE, not ZOOM
}
```

Distance and zoom are distinct inputs. `"DISTANCE"` must be added to the `sourceAuthority` union. Distance-driven and zoom-driven tightening are separate authorities and must be separately attributable in debug output.

---

### ISSUE-0525E-004: `atmosphereStrength`, `readabilityBias`, `densityBias` declared as inputs but never consumed

**Severity: BLOCKING**

All three fields are declared in `VisibilityResolutionInput` and echoed in `factors`, but the resolver never reads them. The spec never defines how they influence resolution. A declared input with no effect on output violates the canonical artifact rule's requirement for well-defined implementable contracts.

Resolution: either implement their effect on resolution or remove them from the type.

---

### ISSUE-0525E-005: Preset category list is open-ended with no fallback contract

**Severity: BLOCKING**

Only `"SIGNAL_DRIFT"` and `"BROADCAST_FAILURE"` are handled. Unrecognized categories silently no-op. The spec does not enumerate all valid `activePresetCategory` values or declare how unrecognized ones are handled. When 0525D defines additional categories, this resolver will silently ignore them.

Fix: type `activePresetCategory` against 0525D's category enum, or declare an explicit fallback contract for unrecognized values.

---

### ISSUE-0525E-006: `_wos.visibilityClass.matrix()` structure undefined

**Severity: BLOCKING**

The debug API declares `.matrix()` and the build readiness criteria requires "debug matrix is implemented," but the spec never defines what the matrix contains, what axes it covers, or what type it returns. Cannot implement an undeclared contract.

---

## NON-BLOCKING OBSERVATIONS

**NB-01: `SBE.` namespace undefined** — consistent with upstream chain, non-blocking.

**NB-02: `ATMOSPHERIC_HIDDEN` unreachable in reference implementation** — no tightening path in `resolveVisibilityClass` produces this class. If upstream AtmosphericReadability is the sole source, state that explicitly.

**NB-03: `null` upstream / authority-present distinction** — validation rule says "defaults to FULL only if no upstream authority is present" but code does unconditional `|| DEFAULT_VISIBILITY_CLASS`. Acceptable in practice; align the language or add an `upstreamAuthorityPresent` flag for explicitness.

---

## WHAT THIS SPEC GETS RIGHT

- Downward-only visibility rule is clean and correctly implemented via `tightenVisibility`
- `VISIBILITY_ORDER` array with `indexOf`-based rank is correct
- `tightenVisibility` is a pure function with no side effects
- Authority boundary section is well-structured and conservative
- Core doctrine ("visibility classes constrain presentation, not simulation truth") is correct and consistently stated throughout

---

## CHAIN STATUS

Critical path to unblock this spec:
```
0523R v1.2.3 → 0523E/F freeze → 0525A v1.0.2 → 0525B v1.0.1 → 0525C v1.0.1 → 0525D v1.0.1 → 0525E v1.0.1
```
