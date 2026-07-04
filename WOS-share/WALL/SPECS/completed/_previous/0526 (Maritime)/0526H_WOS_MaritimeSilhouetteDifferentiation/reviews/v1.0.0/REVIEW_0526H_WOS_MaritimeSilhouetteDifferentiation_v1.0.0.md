# REVIEW: 0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.0
**WOS Maritime Silhouette Differentiation**
Review date: 2026-05-27

---

## VERDICT: NOT READY FOR BUILD

Five blocking issues. This is a doctrinal/conceptual draft — it lacks the structural elements required for a canonical artifact.

---

## DEPENDENCY AUDIT

No YAML front matter exists. `depends_on` cannot be evaluated. Inferred references to MaritimeDistanceAtmosphere, MaritimeLightAuthority, ProceduralVesselTopology — all unresolved in the chain.

---

## BLOCKING ISSUES

### ISSUE-0526H-001: No YAML front matter

**Severity: BLOCKING**

The spec has no YAML header. Missing: `doc_id`, `version`, `depends_on`, `enables`, `status`, `owner`, `stage`, `freeze_decision`, `build_scope`, `summary`, `classification`, `type`. Every prior spec in the chain requires these fields for registry and dependency tracking. This document cannot be placed in the chain without them.

---

### ISSUE-0526H-002: `FAST_CRAFT` and `ANCHORED` are not canonical vessel class keys

**Severity: BLOCKING**

The vessel presentation classes section defines:

```text
TUG | FERRY | CARGO | FAST_CRAFT | ANCHORED
```

The canonical vessel taxonomy established in 0525F, 0526F, and the constitutional chain is:

```text
cargo | tanker | ferry | service | recreational | fishing | passenger
| tug | military | industrial | unknown | default
```

`FAST_CRAFT` does not exist in the canonical taxonomy. `ANCHORED` is a vessel state, not a vessel class — anchored status belongs to the AIS runtime layer, not the presentation taxonomy.

The spec must either:
- map `FAST_CRAFT` and `ANCHORED` to their canonical class equivalents, or
- define a formal bridge function (as 0523D did for `WakeClass` divergence), or
- request a constitutional taxonomy extension

Using non-canonical class identifiers in a presentation spec that feeds renderers will cause silent misses for any vessel whose class doesn't match these presentation classes.

---

### ISSUE-0526H-003: No type definitions

**Severity: BLOCKING**

The spec provides one example JavaScript object as a "Recommended Runtime Structure":

```js
{
  classId: 'FERRY',
  hullAspectBias: 1.8,
  wakePersistence: 0.65,
  bloomSoftness: 0.45,
  directionalConfidence: 0.80,
  farLightSpacing: 1.4,
  lightClusterVariance: 0.15,
  atmosphericMassBias: 0.70
}
```

There is no TypeScript type definition. Field ranges, semantics, and units are undefined. Seven fields have no documented meaning: what does `hullAspectBias: 1.8` mean relative to `1.0`? What does `directionalConfidence: 0.80` affect? Without a typed data model, implementors cannot construct profiles for any class.

---

### ISSUE-0526H-004: No public API declared

**Severity: BLOCKING**

No functions are declared. The spec defines behavioral intent but provides no:
- `resolveSilhouetteProfile(classKey)` or equivalent
- `applySilhouetteDifferentiation(input)` or equivalent
- system namespace
- debug API
- constants

A spec that defines presentation rules without specifying how they are accessed or applied is not implementable as a standalone artifact.

---

### ISSUE-0526H-005: Distance band naming is non-canonical and conflates visibility classes

**Severity: BLOCKING**

The distance authority table uses:

```text
CLOSE | MID | FAR | ATMOSPHERIC | LIGHT_ONLY
```

Issues:
- `CLOSE` is not a canonical distance band — the canonical bands from 0526E are `HERO | NEAR | MID | FAR | ATMOSPHERIC`
- `LIGHT_ONLY` is a **visibility class** (0525E), not a distance band — the two systems are separate authorities

Mixing these two systems in the same table creates ambiguity about which authority governs silhouette suppression at each level.

---

## NON-BLOCKING OBSERVATIONS

**NB-01: "Validation vessel" concept undefined**
The validation vessel immunity section grants debug vessels exemption from suppression and differentiation, but "validation vessel" is never defined in this spec or the chain. What field or flag marks a vessel as a validation vessel? This will need definition before implementation.

**NB-02: `atmosphericMassBias` and `wakePersistence` overlap with upstream systems**
`wakePersistence` is already governed by MaritimeWakeAuthority (0523D) and MaritimeWaterMemory (0526B). `atmosphericMassBias` may conflict with MaritimeDistanceAtmosphere's alpha policy. These fields need authority boundary clarification — does this spec modulate upstream values, or define independent presentation parameters consumed after upstream resolution?

---

## WHAT THIS SPEC GETS RIGHT

- The core doctrine ("presentation interprets reality, not defines it") is sound and consistent with the chain
- The "no texture dependence" constraint is correct and important
- The psychological read descriptions (tug = dense industrial puller, cargo = floating infrastructure) are clear authoring intent
- Light grouping doctrine at FAR/ATMOSPHERIC is consistent with 0526F's CLUSTER/POINT/GHOST collapse model
- "The harbor should not feel rendered. It should feel occupied." is a strong doctrinal anchor

---

## CHAIN STATUS

This reads as a conceptual/doctrinal early draft — it correctly captures intent but needs full structural conversion to a canonical spec before it can be built against. All five blocking issues are structural, not conceptual.

Recommended path: produce v1.0.1 as a full canonical document with YAML front matter, canonical class keys, a typed data model, public API, and distance band names aligned with 0526E.
