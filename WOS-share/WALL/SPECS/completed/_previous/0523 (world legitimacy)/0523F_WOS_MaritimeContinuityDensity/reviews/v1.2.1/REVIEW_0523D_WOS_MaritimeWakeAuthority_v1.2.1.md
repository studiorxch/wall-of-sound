# Architectural Review: 0523D_WOS_MaritimeWakeAuthority_v1.2.1

**Review Type:** Architecture — v1.1.0 Blocking Issue Resolution and Freeze Validation
**Prior Review:** REVIEW_0523D_WOS_MaritimeWakeAuthority_v1.1.0.md
**Stage:** [BUILD] / GO — reviewing against freeze decision

---

## Blocking Issue Resolution from v1.1.0 Review

| Prior Blocking Issue | Status |
|---|---|
| ISSUE-0523D-001: `parentEvicted` declared `readonly`, conflicts with post-emission eviction mutation | ✅ Resolved — Section 9 explicitly permits `parentEvicted: boolean` and `expiresAtMs: number` as mutable runtime fields; Section 14 `WakeSegment` type removes `readonly` from both |
| ISSUE-0523D-002: Emission step 4 not provenance-aware — AIS wakes suppressed by synthetic budget | ✅ Resolved — Section 4 establishes provenance supremacy with explicit eviction ordering; Section 15 defines the canonical rule: synthetic rejection permitted, AIS rejection due to synthetic occupancy forbidden |
| ISSUE-0523D-003: `wakeClass` enum divergence with 0523A (4 vs 6 values, different names) | ✅ Resolved — Section 7 establishes WakeAuthority as a consumer of 0523A taxonomy projections, defines a bridge function, and provides a complete canonical mapping of all 6 taxonomy wake classes to 4 WakeAuthority classes |

All three blocking issues resolved.

---

## What v1.2.1 Gets Right

The resolution architecture for all three issues is clean.

**ISSUE-0523D-001 resolution:** The governance framing in Section 9 is the right approach — rather than simply removing `readonly`, it establishes that mutation of these two specific fields is explicitly permitted, scoped only to deterministic decay and parent eviction compression, and that all identity/provenance fields remain immutable. The scope constraint prevents the `readonly` relaxation from becoming a general permission to mutate wake state.

**ISSUE-0523D-002 resolution:** Sections 4 and 15 together create a layered defense: Section 4 establishes the constitutional principle (AIS supremacy, provenance immutability after creation), Section 15 states the operational consequence (synthetic can fail gracefully; AIS failure due to synthetic occupancy is forbidden). The separation into doctrine (Section 4) and operational rule (Section 15) is clear.

**ISSUE-0523D-003 resolution:** The bridge function approach in Section 7 is correct. Rather than attempting to unify two enums, WakeAuthority declares itself a consumer of taxonomy projections and defines the mapping explicitly. The mapping collapses `WIDE → STANDARD` and `TURBULENT → HEAVY`, which is the correct semantic compression — WIDE wakes are visually similar to STANDARD at the memory-layer level, and TURBULENT is an intensity modifier not a distinct memory category. This resolution simultaneously closes ISSUE-0523A-001 (the `wakeClass` enum divergence tracked against 0523A).

Section 6's use of `simulationTimeMs` in wake identity (`wake::<vesselId>::<simulationTimeMs>`) is deterministically correct. Under replay, the same input state at the same simulation time produces the same wake ID — which is the desired behavior for deterministic replay consistency.

---

## Non-Blocking Issues

### 1. `resolveWakeAuthorityClass` Bridge Function Is Referenced But Not Implemented

Section 7 names the bridge function:

```ts
resolveWakeAuthorityClass(vesselClass)
```

and provides the mapping table. The function implementation is absent. The mapping is deterministic and complete — an implementer can derive the function from the table without ambiguity. But for a spec that otherwise provides executable function bodies (Sections 13–17 all include full implementations), the missing bridge function is an inconsistency.

**Recommended:** Add the implementation:

```ts
function resolveWakeAuthorityClass(
  vesselClass: string
): "NONE" | "MINIMAL" | "STANDARD" | "HEAVY" {
  // reads taxonomyWakeClass from 0523A profile for vesselClass
  // maps per Section 7 table
}
```

---

### 2. Taxonomy Wake Class Names in Section 7 Use `WAKE_` Prefix — 0523A Enum Values Do Not

The Section 7 mapping table uses:

```
WAKE_NONE | WAKE_NARROW | WAKE_STANDARD | WAKE_WIDE | WAKE_HEAVY | WAKE_TURBULENT
```

as the taxonomy wake class identifiers. The 0523A taxonomy profile enum defines these values without the `WAKE_` prefix:

```
NONE | NARROW | STANDARD | WIDE | HEAVY | TURBULENT
```

The mapping intent is unambiguous from context, but the bridge function implementation will need to handle the actual enum values (without prefix). If this spec's table is used as a code reference, the prefix mismatch could produce a mapping bug.

**Recommended:** Align the mapping table to use the exact enum values as defined in 0523A (without `WAKE_` prefix), or add a note that the prefix is documentation-only and the actual enum values are unprefixed.

---

### 3. Emission Decision Tree Is Not Provided

The v1.1.0 spec included a numbered step-by-step emission gate ordering. v1.2.1 states the provenance-aware invariants (Sections 4 and 15) but does not provide a new emission decision tree showing how the provenance-aware budget check is integrated into the gate sequence.

The stated invariants are sufficient for a competent implementer to derive correct behavior. But the detailed ordering is a useful governance artifact for review and for downstream spec authors (0523E, 0523F) who reference wake emission behavior.

**Recommended:** Add a brief emission decision tree showing the provenance-aware gate ordering, e.g.:
1. eligibility check
2. wakeClass == NONE → reject
3. populationTier == GHOST → reject
4a. AIS vessel: check against global AIS budget
4b. synthetic vessel: check against synthetic sub-budget → fail gracefully if exceeded
5. per-vessel budget
6. emit interval
7. minimum distance
8. emit

---

### 4. `0523A v1.2.2` Dependency — Unreviewed

Section 7 depends directly on 0523A's taxonomy profiles for the wake class bridge function. `0523A v1.2.2` appears in `depends_on` but has not been reviewed. The last formally reviewed 0523A version was `v1.2.0` (two blocking issues). ISSUE-0523A-001 (the `wakeClass` enum divergence tracked jointly with ISSUE-0523D-003) is now closed by this spec's bridge function approach, but 0523A v1.2.2 itself needs review confirmation.

**Recommended:** Confirm 0523A v1.2.2 is reviewed before treating the taxonomy dependency as fully settled.

---

### 5. `0523R v1.2.3` Dependency — Not Yet Reviewed

References the expected restoration patch for v1.2.2's section omissions. Has not been reviewed.

**Recommended:** Confirm `0523R v1.2.3` review when submitted.

---

## Assessment

v1.2.1 correctly resolves all three v1.1.0 blocking issues. The governance architecture is clean: Section 9's explicit mutable-field scoping, Sections 4+15's layered provenance supremacy, and Section 7's bridge-function approach to wake class canonicalization are all well-structured and do not introduce new authority contradictions.

The non-blocking issues are documentation gaps and pending upstream confirmations — none affect the correctness of the wake memory model.

This spec's own architecture is ready for build.

---

## Review Status

**READY FOR BUILD — All blocking issues resolved.**

Architecture is correct. Authority boundaries are clean. Three prior blocking issues resolved without introducing new ones. Non-blocking items are documentation recommendations only.

---

## Required Before Build (Blocking)

None. All prior blocking issues are resolved.

---

## Recommended Before Freeze (Non-Blocking)

1. Add implementation body for `resolveWakeAuthorityClass` bridge function.
2. Correct taxonomy wake class names in Section 7 mapping table to match actual 0523A enum values (remove `WAKE_` prefix or annotate as documentation-only).
3. Add emission decision tree showing provenance-aware gate ordering.
4. Confirm `0523A v1.2.2` review status.
5. Confirm `0523R v1.2.3` review when submitted.
