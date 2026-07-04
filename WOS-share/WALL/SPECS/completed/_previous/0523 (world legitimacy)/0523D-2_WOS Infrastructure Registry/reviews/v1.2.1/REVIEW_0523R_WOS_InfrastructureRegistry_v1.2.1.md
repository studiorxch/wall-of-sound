# Architectural Review: 0523R_WOS_InfrastructureRegistry_v1.2.1

**Review Type:** Administrative Governance — v1.2.0 Blocking Issue Resolution and Freeze Validation
**Prior Review:** REVIEW_0523R_WOS_InfrastructureRegistry_v1.2.0.md
**Stage:** [BUILD] / GO — reviewing against freeze decision

---

## Blocking Issue Resolution from v1.2.0 Review

| Prior Blocking Issue | Status |
|---|---|
| `runtime_owner` on 0522O/P/Q should be `null` — constitutional specs have no runtime owner | ✅ Resolved — Section 13 sets `runtime_owner: null` for all three; explanatory note added |
| `lastBuildDate: "2026-05-24"` on `NOT_STARTED` records is a data error | ✅ Resolved — Section 4 formalizes the coherence rule; all 0522 records now use `lastBuildDate: null` |

Both blocking issues resolved.

---

## Non-Blocking Issue Resolution from v1.2.0 Review

| Prior Issue | Status |
|---|---|
| 0523C `parentSpecs` missing 0522O and 0522P | ✅ Resolved — both added to 0523C record |
| ISSUE-0523C-001 has no owner or audit criteria | ✅ Resolved — owner assigned, six-point audit criteria added to summary |
| Constitutional downstream lists unclear — first-order vs all | ✅ Resolved — Constitutional Transitivity Note added in Section 13 |
| Section 14 guardrails did not reference Section 10 | ✅ Resolved — Section 16 now opens with "See Section 12 for the full dependency block table" |
| `lastReviewDate` null in records | ✅ Resolved — all records show `2026-05-24` |

All non-blocking issues resolved.

---

## What v1.2.1 Gets Right

The status/date coherence rule in Section 4 is a clean, enforceable addition. Formalizing it as a spec rule rather than a data fix means it will persist as a linting target.

The ISSUE-0523C-001 audit criteria are specific and actionable:
- no SpawnEcology motion mutation methods exist
- no renderer-owned spawning paths exist
- synthetic namespace is enforced
- seeded RNG is injectable
- simulation clock is respected
- per-zone interval rejection behavior is deterministic

This is exactly the right level of specificity for a `WATCH` audit. An auditor can work from this list without additional context.

The Constitutional Transitivity Note closes the ambiguity about whether downstream lists are exhaustive. Making first-order explicit prevents future engineers from reading a missing entry as "this spec doesn't depend on the constitution."

Section 9 (`registry_format_version` governance) is a clean addition — versioning the format itself, with defined increment triggers and a stability contract, is the right long-term governance pattern.

---

## Remaining Issues

### 1. 0523D `lastBuildDate: "2026-05-24"` With `PATCH_REQUIRED` Status

The 0523D record shows:

```yaml
implementation_status: "PATCH_REQUIRED"
lastBuildDate: "2026-05-24"
```

The coherence rule in Section 4 covers `NOT_STARTED → lastBuildDate: null`. But `PATCH_REQUIRED` implies an implementation exists that requires correction — so a build date is semantically valid. The date here presumably reflects when the v1.1.0 implementation was built (or when the spec was last reviewed), not when a patch was applied.

The issue is not that a date exists, but that it is ambiguous. Is `lastBuildDate` the date of the most recent build, the date of the patch, or the date the build was verified? Without a definition, the date is uninterpretable.

**Required:** Add a one-line definition to Section 4 or Section 7:

> `lastBuildDate` records the date of the most recent code implementation return. It is not updated by spec review alone, patch spec creation, or registry maintenance. It updates only when implementation code is returned for review.

This prevents date creep — where `lastBuildDate` gets updated during registry maintenance passes rather than only when code changes.

---

### 2. `RegistryIssue.status` Added `"VERIFIED"` — Not Present in Issue Records

The v1.2.1 schema adds:

```ts
status: "OPEN" | "RESOLVED" | "DEFERRED" | "VERIFIED";
```

`VERIFIED` is a new status added in this version. But the Section 10.2 issue lifecycle shows:

```text
OPEN → RESOLVED
RESOLVED → VERIFIED
```

Without a definition of what `VERIFIED` means — specifically, how it differs from `RESOLVED` — two interpretations are possible:

1. `RESOLVED` = patch spec exists; `VERIFIED` = patch implementation has been reviewed and confirmed
2. `RESOLVED` = issue is acknowledged as fixed; `VERIFIED` = registry owner has confirmed

The first interpretation aligns with how `BUILT_UNVERIFIED` vs `BUILT_VERIFIED` works for implementation status. This is likely the intended meaning, but it should be stated.

**Required:** Add a one-line definition:

> `RESOLVED` means the fix has been applied in a spec or implementation. `VERIFIED` means the fix has been confirmed through architectural review and the affected contracts have been validated.

---

### 3. 0523D `parentSpecs` Remains Incomplete

The 0523D record lists:

```yaml
parentSpecs:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523B_WOS_MaritimePopulationHierarchy"
  - "0523C_WOS_MaritimeSpawnEcology"
```

But 0523D v1.1.0's own frontmatter declares:

```yaml
parent_specs:
  - "0522O_WOS_MaritimeMotionAuthority_v1.0.0.md"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1.md"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.0.0.md"
  - "0523C_WOS_MaritimeSpawnEcology_v1.2.1.md"
```

`0522O` is listed as a direct parent of 0523D in the spec itself but is absent from the registry record. This is the same gap that was identified for 0523C in the v1.2.0 review and corrected there.

**Required:** Add `0522O_WOS_MaritimeMotionAuthority` to 0523D's `parentSpecs`.

---

## Minor Observations

### `registry_format_version: "1.2.1"` Increment Is Appropriate

Section 9 states `registry_format_version` increments when schema fields change. v1.2.1 adds `"VERIFIED"` to the `RegistryIssue.status` enum and adds the `Status / Date Coherence Rule`. Both qualify as semantic field changes. The increment is correct.

### 0523R Record in the Snapshot Table Shows `READY_TO_BUILD`

The snapshot table shows:

```
0523R Infrastructure Registry | v1.2.1 | [BUILD] | GO | READY_TO_BUILD
```

This is accurate — the registry itself has no implementation to build, so `READY_TO_BUILD` is the correct terminal implementation status for an administrative-only spec. No action required, but it is worth noting that `READY_TO_BUILD` is the permanent status for this spec unless a tooling implementation is later added.

### Section 16 Reference to Section 12 Should Be Section 12, Not 12

The guardrails section opens "See Section 12 for the full dependency block table." Section 12 in this document is the Dependency Block Table. Correct reference. No action required.

---

## Final Assessment

---

### Review Status

**CONDITIONAL APPROVE — Three precision additions required before freeze holds.**

Both blocking issues from v1.2.0 are cleanly resolved. The registry now accurately represents the full chain state. The schema, coherence rules, issue lifecycle, and constitutional records are complete. The three remaining items are precision gaps in this revision — one introduced by the `VERIFIED` status addition, one by the 0523D parent gap, and one definitional gap in `lastBuildDate`.

None of the three prevent the registry from functioning correctly today. But the `VERIFIED` status without a definition and the `lastBuildDate` ambiguity will both produce inconsistent records within the first registry maintenance cycle.

---

### Required Before Freeze (Blocking)

1. **Define `lastBuildDate` update semantics** — code return only, not spec review or registry maintenance. Prevents date creep.
2. **Define `RESOLVED` vs `VERIFIED` distinction explicitly** — the lifecycle exists in Section 10.2 but the semantic difference is not stated.
3. **Add `0522O` to 0523D `parentSpecs`** — the spec's own frontmatter declares this dependency; the registry must reflect it.

---

### Post-Freeze Chain State

After these three additions, the registry is ready for BUILD/GO. Current chain state:

| Spec | Version | Freeze | Status | Open Blocking Issues |
|---|---|---|---|---|
| 0522O | v1.0.0 | GO | NOT_STARTED | — |
| 0522P | v1.0.0 | GO | NOT_STARTED | — |
| 0522Q | v1.0.0 | GO | NOT_STARTED | — |
| 0523A | v1.2.1 | GO | PATCH_REQUIRED | ISSUE-0523A-001 |
| 0523B | v1.1.0 | GO | BUILT_VERIFIED | — |
| 0523C | v1.2.1 | GO | BUILT_UNVERIFIED | ISSUE-0523C-001 (WATCH) |
| 0523D | v1.1.0 | REVIEW | PATCH_REQUIRED | ISSUE-0523D-001/002/003 |
| 0523R | v1.2.1 | GO | READY_TO_BUILD | — |
| 0523E | — | REVIEW | NOT_STARTED | Blocked by 0523D patch |
| 0523F | — | REVIEW | NOT_STARTED | Blocked by 0523D patch |
