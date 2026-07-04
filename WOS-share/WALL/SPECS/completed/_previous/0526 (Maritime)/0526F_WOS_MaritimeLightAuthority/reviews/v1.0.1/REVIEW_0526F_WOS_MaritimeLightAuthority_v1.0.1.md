# REVIEW: 0526F_WOS_MaritimeLightAuthority_v1.0.1
**WOS Maritime Light Authority — patch review**
Review date: 2026-05-27

---

## VERDICT: NOT READY FOR BUILD

Three blocking issues from v1.0.0 were addressed; two are resolved, one remains partial. Three new blocking issues introduced.

---

## V1.0.0 BLOCKING ISSUE STATUS

| Issue | Status |
|---|---|
| ISSUE-0526F-001: `resolveLightEnvelope` implementation missing | ✅ RESOLVED — 11-step canonical flow + all formulas sufficient for reconstruction |
| ISSUE-0526F-002: `getFallbackLightEnvelope` values undefined | ⚠️ PARTIAL — 3 fallback shapes defined; each specifies 5 of 23 fields |
| ISSUE-0526F-003: `matrix()` structure undefined | ✅ RESOLVED — structure, axes, and purpose now defined |

---

## NEW BLOCKING ISSUES

### ISSUE-0526F-004: Class signature table absent — `resolveClassLightSignature` non-reconstructable

**Severity: BLOCKING**

v1.0.0 contained a complete class signature table: all 11 canonical vessel classes with all 12 fields per class. v1.0.1 removes this table entirely. The core function `resolveClassLightSignature` is declared but cannot be implemented without it.

If v1.0.1 is intended as a full canonical document, the class signature table must be present. If it is a patch document, it violates the canonical artifact rule. Either form is currently broken.

The signature table is not supplementary material — it is the primary data content of this spec.

---

### ISSUE-0526F-005: `MaritimeLightInput` type definition missing

**Severity: BLOCKING**

`resolveLightEnvelope(input: MaritimeLightInput)` is the primary API function. `MaritimeLightInput` was defined in v1.0.0 with 14 fields. v1.0.1 does not include it. The spec references the function but the input contract is undefined. Without the input type, the spec is not standalone-reconstructable.

---

### ISSUE-0526F-006: Fallback envelopes specify 5 of 23 fields — unresolvable as typed return values

**Severity: BLOCKING**

The three fallback envelopes are an improvement over v1.0.0 but remain partial. Each specifies 4–5 fields:

```ts
// FALLBACK_INVALID_INPUT — 5 fields specified:
{ visible, renderMode, alpha, bloomAlpha, allowBloom }

// DISTANCE_SUPPRESSED — 5 fields specified:
{ visible, renderMode, alpha, bloomAlpha, allowFarGlint }
```

`MaritimeLightEnvelope` has 23 fields. The remaining 18 (`bloomRadiusPx`, `navAlpha`, `farAlpha`, `pulsePhase`, `pulseValue`, `shimmerAmount`, `navPortColor`, `navStarboardColor`, `navSternColor`, `glowColor`, `allowNavPair`, `allowMastLight`, `allowWakeGlow`, `allowReflectionHint`, etc.) are unspecified. `getFallbackLightEnvelope` must return a fully-populated immutable object. A renderer consuming this return value has no defined values for the majority of the type.

Fix: either specify all 23 fields for each fallback, or define a canonical "zero-state" object shape and document that fallbacks are sparse overrides of it.

---

## NON-BLOCKING OBSERVATIONS

**NB-01: `depends_on` field still missing from YAML front matter**
Same issue as 0526C. The spec references MaritimeDistanceAtmosphere, VisibilityClassRuntime, MaritimeStyleRegistry, ProceduralVesselTopology, and ActiveWakePolish — none are declared. Required for canonical artifact compliance.

**NB-02: Full debug API section removed**
v1.0.0 defined `preview()`, `sample()`, `compare()`, `setDebug()`, `constants()`. v1.0.1 retains only the matrix doctrine. If a debug companion file is produced, its API will be unspecified. Acceptable to defer to the debug companion spec, but should be noted.

**NB-03: `MaritimeClassKey` type now correctly defined**
Improvement from v1.0.0 — `classKey` is now a typed union, not `string`. Correctly applied in `MaritimeClassLightSignature`. This is the right fix for the chain-wide loose string pattern. Noted as a structural improvement.

**NB-04: `atmospherePressure` formula moved to spec body**
`suppressUnderAtmosphere` formula is now defined (`finalAlpha *= (1.0 - atmospherePressure * suppressUnderAtmosphere)`) — resolves NB-03 from the v1.0.0 review. Correct.

---

## WHAT REMAINS CORRECT FROM V1.0.0

- Pulse formula
- Seed priority rule
- Distance collapse hierarchy
- Visibility-class suppression table
- `reasonCode` as typed union
- `Math.random()` prohibition
- `MaritimeLightRenderMode` five-value enum
- Military tactical language prohibition

---

## PATH TO BUILD

v1.0.1 is a governance improvement over v1.0.0 but introduced content regressions. For v1.0.2 BUILD:

1. Restore the class signature table (all 11 classes, all 12 fields)
2. Restore `MaritimeLightInput` type definition
3. Complete fallback envelope shapes to all 23 fields
4. Add `depends_on` to YAML front matter
