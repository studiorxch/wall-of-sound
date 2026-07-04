# REVIEW: 0526F_WOS_MaritimeLightAuthority_v1.0.0
**WOS Maritime Light Authority**
Review date: 2026-05-27

---

## VERDICT: NOT READY FOR BUILD

Three blocking issues. All seven dependencies are phantom versions or not frozen.

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
| 0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1 | PHANTOM — only v1.0.0 reviewed (4 blocking issues) |

All 7 dependencies unresolved.

---

## BLOCKING ISSUES

### ISSUE-0526F-001: `resolveLightEnvelope` reference implementation missing

**Severity: BLOCKING**

The primary API function is declared but never implemented in the spec:

```ts
function resolveLightEnvelope(input: MaritimeLightInput): MaritimeLightEnvelope;
```

Component snippets are given — pulse formula, seed rule, distance collapse table, visibility-class suppression rules — but the function that assembles these into a complete `MaritimeLightEnvelope` is absent. An implementor cannot reconstruct the assembly from the parts alone: the interaction between `suppressUnderAtmosphere`, distance band collapse, visibility class hard-suppression, temporal pulse, and bloom scaling is unspecified.

Same gap as ISSUE-0526E-001. The canonical artifact rule requires the primary output function to be reconstructable from the document.

---

### ISSUE-0526F-002: `getFallbackLightEnvelope` return values undefined

**Severity: BLOCKING**

`getFallbackLightEnvelope` is listed as a required public API function:

```ts
function getFallbackLightEnvelope(reasonCode: MaritimeLightReasonCode): MaritimeLightEnvelope;
```

`MaritimeLightEnvelope` has 23 fields. The spec defines what `reasonCode` values exist and when fallbacks should trigger, but never specifies what values the fallback envelope should contain for each code. The failure modes section says "return NONE fallback" and "return conservative POINT fallback" — these describe `renderMode`, but 22 other fields remain undefined.

Without fallback values defined, this function is non-reconstructable. It must either define the full fallback envelope per `reasonCode`, or define a single canonical safe-fallback shape.

---

### ISSUE-0526F-003: `_wos.lightAuthority.matrix()` structure undefined

**Severity: BLOCKING**

The debug API declares `.matrix()` with no definition of structure, axes, or return type. Identical pattern to ISSUE-0525E-006 and ISSUE-0526E-004. This is now the third spec in the chain with this gap. The chain should resolve this once with a shared debug matrix spec rather than leaving it undefined in every spec that includes `.matrix()`.

---

## NON-BLOCKING OBSERVATIONS

**NB-01: `vesselClass: string` in `MaritimeLightInput` and `MaritimeClassLightSignature`**
Fifth consecutive spec with loose string typing for vessel class. The chain-wide fix should apply these typed enums consistently: `VesselTopologyClassKey` (0525F) or equivalent. Non-blocking per established review pattern, but the accumulation makes it a systematic gap.

**NB-02: Color fields (`navPortColor`, `navStarboardColor`, `navSternColor`, `glowColor`) typed as `string` without format specification**
These color values are consumed by Canvas drawing code. The spec doesn't specify whether they're hex, rgba(), CSS named, or another format. Since they originate from `MaritimeStyleRegistry`, the format is presumably defined there — but the connection is unstated. Document the expected format or reference the registry's color type.

**NB-03: `suppressUnderAtmosphere` interaction with alpha policy unspecified**
`suppressUnderAtmosphere` is a `number` per-class signature field (e.g. `cargo: 0.35`, `military: 0.70`) but no formula defines how it modifies the final envelope alpha. Is it a multiplier? A threshold? A lerp target? Without a formula, the field is declared but not usable.

**NB-04: `SBE.` namespace undefined** — consistent with upstream chain.

---

## WHAT THIS SPEC GETS RIGHT

- `reasonCode` is a typed union — no freeform strings allowed. This is the correct fix for the `reason: string` gap identified in 0526E-003, and it's applied here from the start
- Class signature table is complete: all 11 canonical classes plus `unknown`/`default` are specified with all 12 fields
- Pulse formula is explicit and deterministic: `1.0 - pulseDepth + pulseDepth * (0.5 + 0.5 * sin(nowMs * pulseHz * TAU + pulsePhase))`
- Seed priority order is defined: `mmsi → vesselId → classKey → 0`
- `Math.random()` is explicitly forbidden — determinism is enforced at the spec level
- `MaritimeLightRenderMode` enum (`DUAL_NAV | CLUSTER | POINT | GHOST | NONE`) is a well-designed five-value collapse hierarchy
- Military language is constrained: "Do not describe as stealth, threat, or tactical concealment"
- `MaritimeLightEnvelope` fields are comprehensive and cover the full rendering contract

---

## CHAIN STATUS

This is the strongest spec in the 0526 series structurally. The signature table, determinism doctrine, and typed reason codes are improvements over preceding specs. Three mechanical gaps to close for v1.0.1.

Recommended: resolve `suppressUnderAtmosphere` formula as part of the `resolveLightEnvelope` reference implementation — the two are naturally co-authored.

Critical path: upstream chain → `resolveLightEnvelope` reference logic + fallback values → `0526F v1.0.1 BUILD`
