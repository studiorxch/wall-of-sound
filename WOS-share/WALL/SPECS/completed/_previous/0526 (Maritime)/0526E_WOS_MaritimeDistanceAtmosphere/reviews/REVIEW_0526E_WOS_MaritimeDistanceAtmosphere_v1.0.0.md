# REVIEW: 0526E_WOS_MaritimeDistanceAtmosphere_v1.0.0
**WOS Maritime Distance Atmosphere**
Review date: 2026-05-27

---

## VERDICT: NOT READY FOR BUILD

Four blocking issues. All six dependencies are phantom versions or not frozen.

---

## DEPENDENCY AUDIT

| Dependency | Status |
|---|---|
| 0525A_WOS_MapStyleAuthority_v1.0.2 | PHANTOM — v1.0.2 not yet produced |
| 0525B_WOS_MaritimeStyleRegistry_v1.0.1 | PHANTOM — only v1.0.0 reviewed |
| 0525D_WOS_SurfaceStylePresets_v1.0.1 | UNREVIEWED — never reviewed in chain |
| 0525E_WOS_VisibilityClassRuntime_v1.0.0 | REVIEWED — NOT READY (6 blocking issues) |
| 0525F_WOS_ProceduralVesselTopology_v1.0.1 | PHANTOM — only v1.0.0 reviewed (3 blocking issues) |
| 0526C_WOS_ActiveWakePolish_v1.0.1 | PHANTOM — only v1.0.0 reviewed (3 blocking issues) |

All 6 dependencies unresolved.

---

## BLOCKING ISSUES

### ISSUE-0526E-001: `resolveDistanceEnvelope` reference implementation missing

**Severity: BLOCKING**

`resolveDistanceEnvelope` is the primary public API function — it produces the `MaritimeDistanceEnvelope` consumed by every downstream renderer. Reference implementations exist for the two helper functions (`resolveDistanceNorm`, `resolveDistanceBand`) but not for the function that actually assembles the envelope.

```ts
// declared but never implemented in spec:
function resolveDistanceEnvelope(input: MaritimeDistanceInput): MaritimeDistanceEnvelope;
```

The alpha policy table provides values by band, and atmospheric compression defines `atmosphereNorm`, but how these are combined into the full `MaritimeDistanceEnvelope` — including population tier refinement, fog/haze weighting, and visibilityClass suppression — is never shown. The canonical artifact rule requires the spec to be standalone-reconstructable. The core assembly function is the gap.

---

### ISSUE-0526E-002: `MaritimeDistanceInput` uses loose `string` for typed enum fields

**Severity: BLOCKING**

Three fields that reference established upstream types are declared as unbound strings:

```ts
type MaritimeDistanceInput = {
  readonly vesselClass: string;          // should be VesselTopologyClassKey or WaterMemoryClass
  readonly populationTier: string | null; // should be PopulationTier
  readonly visibilityClass: string | null; // should be VisibilityClass
};
```

All three types exist in the reviewed chain (`VisibilityClass` in 0525E, `PopulationTier` in 0525E, vessel class keys in 0525F/0526B). This is the fourth consecutive spec with this pattern — it should be resolved chain-wide in the v1.0.1 pass, not deferred spec by spec.

---

### ISSUE-0526E-003: `MaritimeDistanceEnvelope.reason` field undefined

**Severity: BLOCKING**

The envelope type includes:

```ts
readonly reason: string;
```

No section of the spec defines what values `reason` should contain, what format it uses, or how it is populated by `resolveDistanceEnvelope`. It appears to be a debug/diagnostic field but is typed as a required string on every envelope. Without a defined format or value set, implementors cannot populate it correctly, and consumers (e.g. debug tools) cannot interpret it.

Fix: either define a typed union of valid reason strings, specify the format (e.g. `"BAND:FAR|VC:REDUCED"`), or change to `reason?: string` and document it as an optional diagnostic field.

---

### ISSUE-0526E-004: `_wos.distanceAtmosphere.matrix()` structure undefined

**Severity: BLOCKING**

The debug API declares `.matrix()` but the spec never defines what the matrix contains, what axes it covers, or what type it returns. Same issue as ISSUE-0525E-006. This is a build criterion ("debug overlay may visualize bands") without a spec. Cannot implement an undeclared contract.

---

## NON-BLOCKING OBSERVATIONS

**NB-01: `MAX_FAR_LIGHT_ALPHA = 0.55` not referenced in any reference logic**
The value appears in the alpha policy table (`Light: 0.55` for FAR band) but is never referenced by name in code. The reference implementation for `resolveDistanceEnvelope` would close this gap naturally once written.

**NB-02: Population tier refinement described but not specified**
The spec states "Population tier may refine but not replace distance band" with an example, but no quantification. How much does a HERO-tier vessel preserve in the FAR band? This should be specified or deferred explicitly.

**NB-03: `applyVisibilityClassToEnvelope` immutable pattern not stated**
The function takes a `readonly` envelope and returns a `MaritimeDistanceEnvelope`. Since all fields are `readonly`, this must construct a new object. The spec should explicitly state this is an immutable construction, not an in-place mutation, to prevent implementor confusion.

**NB-04: `SBE.` namespace undefined** — consistent with upstream chain.

---

## WHAT THIS SPEC GETS RIGHT

- The five-band model (`HERO → NEAR → MID → FAR → ATMOSPHERIC`) is clean and covers the full range
- Alpha policy table is quantified and complete — all six presentation channels by all five bands
- Atmospheric compression formula is explicit and cheap
- Wake suppression doctrine ("before drawing, not after") is architecturally correct
- Light preservation policy is well-reasoned — far lights survive atmosphere as signal, not emergency coding
- Label/hover suppression at FAR/ATMOSPHERIC is the right call
- Compute-once-per-vessel-per-frame directive is an important performance note
- Failure modes provide safe defaults for every missing input
- The strategic framing ("better distance hierarchy, not more detail") is correct

---

## CHAIN STATUS

This is architecturally the right next spec — the harbor needs depth hierarchy before additional vessel detail. The four blocking issues are all resolvable in a v1.0.1 pass. The main production gap is the missing `resolveDistanceEnvelope` reference implementation.

Critical path: upstream chain → `resolveDistanceEnvelope` reference logic → type all loose string inputs → define `reason` format → `0526E v1.0.1 BUILD`
