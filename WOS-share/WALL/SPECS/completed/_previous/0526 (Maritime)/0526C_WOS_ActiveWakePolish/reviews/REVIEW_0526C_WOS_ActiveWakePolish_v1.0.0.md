# REVIEW: 0526C_WOS_ActiveWakePolish_v1.0.0
**WOS Active Wake Polish**
Review date: 2026-05-26

---

## VERDICT: NOT READY FOR BUILD

Three blocking issues. The `depends_on` field is missing entirely, the class profile parameter tables are structurally incomplete, and the mode type is unvalidated against its upstream contract.

---

## DEPENDENCY AUDIT

The YAML front matter has **no `depends_on` field**. This is a canonical artifact rule violation (see ISSUE-0526C-001 below).

Inferred dependencies from spec body:

| Inferred Dependency | Status |
|---|---|
| 0526A_WOS_MaritimeWakeSignature_v1.0.0 | UNREVIEWED — never reviewed in chain |
| 0526B_WOS_MaritimeWaterMemory_v1.0.0 | REVIEWED — NOT READY (4 blocking issues) |

---

## BLOCKING ISSUES

### ISSUE-0526C-001: `depends_on` field missing from YAML front matter

**Severity: BLOCKING**

The YAML header contains no `depends_on` declaration. This spec explicitly references and patches `0526A_WOS_MaritimeWakeSignature` throughout — it is a direct downstream consumer of that spec's wake mode contract. It also formally responds to `0526B_WOS_MaritimeWaterMemory`.

Neither dependency is declared. The canonical artifact rule requires all upstream dependencies to be enumerated. A spec that patches a system without declaring it as a dependency is not standalone-reconstructable.

Minimum required:
```yaml
depends_on:
  - "0526A_WOS_MaritimeWakeSignature_v1.0.0"
  - "0526B_WOS_MaritimeWaterMemory_v1.0.0"
```

---

### ISSUE-0526C-002: `ActiveWakePolishProfile` type defines 16 fields; class parameter targets provide only 6

**Severity: BLOCKING**

The type declares 16 fields:

```ts
type ActiveWakePolishProfile = {
  classKey, mode,
  lengthScale, widthScale, alphaScale,
  nearSternAlpha, farFadeAlpha,
  lineSoftness, glowStrength,
  turbulenceCount, turbulenceSpread, turbulenceLengthScale,
  maxWakeAlpha, maxGlowAlpha,
  minVisibleZoom, fullVisibleZoom
};
```

Every class parameter target provides only 6:

```ts
// example — cargo
{
  lengthScale, widthScale, alphaScale,
  maxWakeAlpha, glowStrength, turbulenceCount
}
```

Ten fields are unspecified in every profile: `nearSternAlpha`, `farFadeAlpha`, `lineSoftness`, `turbulenceSpread`, `turbulenceLengthScale`, `maxGlowAlpha`, `minVisibleZoom`, `fullVisibleZoom`, `mode`, and `classKey`.

An implementor cannot construct a complete `ActiveWakePolishProfile` object from this spec. The canonical artifact rule requires the document to be reconstructable as a standalone artifact. With 10 of 16 fields undeclared across all 10 classes, it is not.

Fix: either populate all 16 fields per class, or reduce the type to contain only the fields that are actually specified.

---

### ISSUE-0526C-003: `ActiveWakePolishProfile.mode` not validated against 0526A's wake mode contract

**Severity: BLOCKING**

`mode` is typed as:

```ts
"LINEAR" | "SPLIT_V" | "TURBULENT" | "DRIFT" | "DISCIPLINED"
```

This spec patches `maritimeWakeSignature.js` (owned by 0526A) and directly references wake modes from that system. But 0526A is unreviewed — its actual mode enum is unknown. If 0526A uses different names, this spec's mode type is incorrect and the patch will be built against an undefined contract.

`mode` must be validated against 0526A's typed wake mode definition before this spec can freeze. Since 0526A is unreviewed, this cannot be confirmed until 0526A is reviewed and frozen.

---

## NON-BLOCKING OBSERVATIONS

**NB-01: `unknown` and `default` class parameter targets missing**
The visual language section covers 10 named classes. `unknown` and `default` have no parameter targets. The failure mode says "use UNKNOWN profile" but that profile is not defined. Add parameter targets for both, or explicitly declare that `unknown` and `default` share the same tuned fallback values.

**NB-02: `classKey: string` in `ActiveWakePolishProfile`**
Consistent with the upstream pattern flagged in 0525F, 0525E, 0526B. Should be a typed class key enum. Non-blocking but persistent chain smell.

**NB-03: `SBE.` namespace undefined** — consistent with upstream chain.

---

## WHAT THIS SPEC GETS RIGHT

- The strategic decision to deprioritize WaterMemory and focus on active wakes is well-reasoned and clearly argued
- The visual language targets are specific and differentiated — cargo/tanker/ferry/tug/recreational/military all have distinct perceptual identities described in terms that translate to implementation
- Gradient stop pattern (`0.00→transparent`, `0.12→low`, `0.35→peak`, `0.72→low`, `1.00→transparent`) is a concrete, implementable target
- Softness rule (`lineCap: "round"`, `lineJoin: "round"`) is the right default and explicitly stated
- Repetition control doctrine (deterministic seeded jitter, no synchronized pulses) is correct
- `MAX_ACTIVE_WAKE_ALPHA = 0.48` system constant is a meaningful ceiling
- All system constants are quantified and reasonable
- Non-goals and build scope are tight — this spec resists scope creep well

---

## CHAIN STATUS

This is a narrow, well-scoped polish spec. The three blocking issues are all mechanical gaps — none require architectural revision. Once `depends_on` is populated, the parameter tables are completed, and 0526A is reviewed and its mode types confirmed, this should move to BUILD quickly.

Critical path to unblock: review `0526A` → confirm mode types → complete profile tables → freeze as `v1.0.1 BUILD`.
