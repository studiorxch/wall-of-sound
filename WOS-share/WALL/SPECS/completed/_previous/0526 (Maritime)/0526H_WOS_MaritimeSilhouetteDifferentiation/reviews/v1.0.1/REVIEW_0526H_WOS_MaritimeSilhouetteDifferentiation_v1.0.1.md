# REVIEW: 0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.1
**WOS Maritime Silhouette Differentiation — patch review**
Review date: 2026-05-27

---

## VERDICT: NOT READY FOR BUILD

All five v1.0.0 blocking issues resolved. Three new blocking issues introduced.

---

## V1.0.0 BLOCKING ISSUE STATUS

| Issue | Status |
|---|---|
| ISSUE-0526H-001: No YAML front matter | RESOLVED |
| ISSUE-0526H-002: FAST_CRAFT/ANCHORED non-canonical | RESOLVED |
| ISSUE-0526H-003: No type definitions | RESOLVED |
| ISSUE-0526H-004: No public API | RESOLVED |
| ISSUE-0526H-005: Distance band naming non-canonical | RESOLVED |

---

## DEPENDENCY AUDIT

All 7 dependencies phantom or unresolved.
0526F_WOS_MaritimeLightAuthority_v1.0.2 is phantom — only v1.0.1 reviewed (3 blocking issues remain).

---

## NEW BLOCKING ISSUES

### ISSUE-0526H-006: SILHOUETTE_PROFILES dictionary declared but never populated

Section 9 declares:

  const SILHOUETTE_PROFILES: Record<MaritimeSilhouetteClass, MaritimeSilhouetteProfile>;

No profile values are provided for any of the 11 canonical classes. The type structure
is well-defined with 9 fields and a field definitions table — but the actual data is
absent. This is the primary data content of the spec. resolveSilhouetteProfile and
resolveSilhouetteClass both depend on this dictionary. Without it, nothing can be
implemented. Each of the 11 canonical classes must have a fully-specified
MaritimeSilhouetteProfile entry.

---

### ISSUE-0526H-007: resolveSilhouetteProfile has no reference implementation or assembly flow

The primary public API function is declared but the spec provides no reference
implementation and no step-by-step assembly flow. The function must:
- normalize vesselClass via resolveSilhouetteClass
- look up the profile from SILHOUETTE_PROFILES
- apply distance band degradation
- apply visibility class suppression
- handle the isValidationEntity bypass
- return an immutable MaritimeSilhouetteProfile

None of this is specified. Same pattern as ISSUE-0526E-001 and ISSUE-0526F-001.
Canonical artifact rule requires this function to be reconstructable from the document.

---

### ISSUE-0526H-008: isValidationEntity is a typed input contract with no defined meaning in the chain

MaritimeSilhouetteInput.isValidationEntity: boolean is now a required typed field
granting immunity from all suppression rules. But:

- what is a validation entity?
- who sets this flag?
- what system owns it?
- what prevents misuse?

These are undefined anywhere in this spec or the reviewed chain. An ungoverned escape
hatch in a typed contract is a structural risk. The spec must reference the system that
defines validation entities, or define the flag's governance rules internally.

---

## NON-BLOCKING OBSERVATIONS

NB-01: MaritimeSilhouetteInput.vesselClass: string still loose — should be
MaritimeSilhouetteClass | null. Sixth consecutive spec with this pattern.
Chain-wide fix is overdue.

NB-02: hullAspectBias units undefined — "relative presentation elongation multiplier"
with no reference value. Is 1.0 neutral? What is the plausible range? Required for
profile calibration.

NB-03: SBE. namespace undefined — consistent with upstream chain.

---

## WHAT THIS SPEC GETS RIGHT

- All five v1.0.0 structural failures resolved cleanly
- MaritimeSilhouetteProfile type is well-designed — presentation-only fields, no behavioral implication
- Field definitions table (Section 7.2) with semantic descriptions is the correct approach
- Distance/visibility authority non-conflation is now explicitly contractual
- Forbidden terminology table (Section 10) is the right governance model
- MaritimeSilhouetteClass correctly typed as a union, not string
- Determinism rules explicit and correct

---

## PATH TO BUILD

v1.0.2 needs three things:

1. Populate SILHOUETTE_PROFILES with all 11 canonical class profiles (9 fields each)
2. Add reference implementation or step-by-step assembly flow for resolveSilhouetteProfile
3. Define isValidationEntity governance — what it is, who sets it, what bounds its use
