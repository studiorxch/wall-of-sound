# Architectural Review: 0523D-2_WOS_InfrastructureRegistry_v1.0.0

**Review Type:** Administrative Infrastructure — Governance Completeness and Internal Consistency
**Chain Position:** This spec governs the governance layer itself — it is reviewed against the chain it describes.
**Stance:** A registry that is internally inconsistent or that misrepresents the state of the specs it tracks is worse than no registry. Every record is checked against the review chain.

---

## What This Spec Gets Right

The stage/freeze separation is correct and important. Many governance systems conflate "ready to build" with "build has started" — keeping `stage` and `freezeDecision` as distinct fields prevents that. The `implementationStatus` enum is the most useful addition: distinguishing `BUILT_UNVERIFIED` from `BUILT_VERIFIED` is exactly the gap that causes late-stage integration surprises.

The `do_not_build` scope per record is the right pattern. It makes the boundary between what was specified and what must not be built explicit and auditable.

The Runtime Authority Registry table is a useful single-page summary of the constitutional authority boundaries established across the entire 0522–0523 chain. It belongs here.

The supersession rules are precise. "A newer version does NOT supersede an older version merely because it adds notes" prevents version inflation.

---

## Issues

### 1. Registry Lists 0523D `freeze_decision: GO` — Review Chain Does Not Support This

The registry records `0523D_WOS_MaritimeWakeAuthority` as:

```yaml
stage: "[BUILD]"
freeze_decision: "GO"
implementation_status: "BUILT_UNVERIFIED"
```

The most recent review (REVIEW_0523D_WOS_MaritimeWakeAuthority_v1.1.0) concluded:

> **NOT YET FROZEN — Three blocking issues before the FREEZE — GO decision holds.**

The three blocking issues were:
1. `parentEvicted: boolean` readonly conflict
2. Emission step 4 not provenance-aware
3. `wakeClass` enum divergence from 0523A

These have not been resolved in any reviewed version. The registry is marking a spec as GO that the review chain explicitly did not pass. This is the core failure mode the registry exists to prevent.

**Required:** Either update the registry record to:

```yaml
stage: "[REVIEW]"
freeze_decision: "REVIEW"
implementation_status: "PATCH_REQUIRED"
```

and add the three issues to `openIssues`, or produce a v1.2.0 of 0523D that resolves them before the registry moves to GO.

**This is the highest priority issue in this review.**

---

### 2. `ISSUE-0523D-001` Severity Is Understated

The registry records the 0523D precision gaps as `NON_BLOCKING / WATCH`. The review chain classified three of them as **blocking before freeze**:

- `parentEvicted` readonly conflict — blocking
- Provenance-aware budget step — blocking  
- `wakeClass` enum cross-spec divergence — blocking

A blocking issue tracked as `NON_BLOCKING / WATCH` will not receive the urgency required to resolve it before downstream build begins. If `0523E_WOS_MaritimeAtmosphericReadability` inherits from 0523D and consumes `wakeClass` values, it will inherit the enum mismatch.

**Required:** Update ISSUE-0523D-001 to `BLOCKING / OPEN` and split it into three discrete issues, one per blocking item, so resolution can be tracked independently.

---

### 3. `wakeClass` Enum Divergence Is Not Tracked as a Cross-Spec Issue

The `wakeClass` enum mismatch between 0523A v1.2.0 (six values: `NONE | NARROW | STANDARD | WIDE | HEAVY | TURBULENT`) and 0523D v1.1.0 (four values: `NONE | MINIMAL | STANDARD | HEAVY`) affects both specs. It is currently tracked only against 0523D.

Any system that reads `wakeClass` from a taxonomy profile (0523A) and passes it to the wake authority (0523D) will encounter a type mismatch. The affected specs are 0523A and 0523D jointly. The registry should reflect this as a cross-spec issue with entries under both records.

**Required:** Add a second issue record under 0523A:

```yaml
issueId: "ISSUE-0523A-001"
severity: "BLOCKING"
status: "OPEN"
summary: "WakeClass enum in 0523A (NARROW | WIDE | TURBULENT) does not match 0523D v1.1.0 (MINIMAL | STANDARD | HEAVY). Cross-spec type mismatch. One spec must be updated before either goes to BUILT_VERIFIED."
affectedSpec: "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1"
```

---

### 4. `BUILT_VERIFIED` for 0523A and 0523B Is Inconsistent with Open Cross-Spec Issue

The registry marks both 0523A and 0523B as `BUILT_VERIFIED`. But 0523A has an unresolved cross-spec issue with 0523D (the `wakeClass` enum). `BUILT_VERIFIED` implies the implementation "passed architecture, authority, and interface review." A spec with a known cross-spec type mismatch against a downstream consumer has not passed interface review.

**Required:** The `BUILT_VERIFIED` definition should include:

> No open BLOCKING cross-spec issues exist against downstream consumers.

Until the `wakeClass` mismatch is resolved, 0523A should be `BUILT_VERIFIED` with a noted caveat, or downgraded to `PATCH_REQUIRED`.

---

### 5. `RegistryIssue.severity` Missing `BLOCKING` in 0523D-001

The `RegistryIssue` type defines:

```ts
severity: "BLOCKING" | "NON_BLOCKING" | "WATCH";
```

ISSUE-0523D-001 uses `NON_BLOCKING` but should be `BLOCKING` per the review chain. This is an internal consistency failure in the registry's own data — the schema supports `BLOCKING` but the record doesn't use it when it should.

---

### 6. Registry Record for 0523D Does Not Include `parentSpecs` or `downstreamSpecs`

The `WOSInfrastructureRegistryRecord` schema defines `parentSpecs` and `downstreamSpecs` as fields, but the 0523D YAML record does not include them. The `parent_specs` field in the spec's own YAML frontmatter lists 0523A, 0523B, 0523C as parents. These should appear in the registry record.

More importantly, downstream specs of 0523D — particularly 0523E (Atmospheric Readability) and 0523F (Continuity Density) — are listed in the Next Maritime Specs table but not in 0523D's registry record as `downstreamSpecs`. Without this linkage, a `PATCH_REQUIRED` on 0523D won't automatically surface as a risk for 0523E and 0523F.

**Required:** Add `parentSpecs` and `downstreamSpecs` to all canonical records, not just the schema definition.

---

### 7. Next Maritime Specs Table Has No `implementationStatus` Column

The Next Maritime Specs table shows:

| Spec | Target Version | Stage | Freeze Decision | Notes |

But does not include `implementationStatus`. For specs in `[REVIEW]` with `Freeze Decision: REVIEW`, the implementation status should be `NOT_STARTED`. Making this explicit — rather than implied — prevents the table from becoming a list of specs without clear state. A reviewer who sees a spec in the next table with no implementation status will wonder whether work has already begun.

**Required:** Add `implementationStatus` column to the Next Maritime Specs table. All entries should read `NOT_STARTED` until a spec is promoted to `[BUILD] / GO`.

---

### 8. No Record for 0522O, 0522P, 0522Q

The registry covers 0523A through 0523D but does not include the 0522 constitutional chain (MaritimeMotionAuthority, DeterministicRuntime, RuntimePrecision). These are listed as `parentSpecs` in downstream records but have no registry entries of their own.

This creates an incomplete dependency graph. If any of the 0522 specs require a patch (e.g., 0522Q's heading integration definition), there is no registry entry to track the patch state, no `implementationStatus` to update, and no open issues to surface.

**Required:** Add registry records for 0522O, 0522P, and 0522Q — even if minimal. At minimum:

```yaml
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "NOT_STARTED"
```

Their inclusion ensures dependency resolution works correctly when downstream specs reference them.

---

## Minor Observations

### Registry Filename Convention Is Inconsistent

All other specs use `NNNN_WOS_ComponentName_vX.Y.Z.md`. This spec uses `0523D-2_WOS_InfrastructureRegistry_v1.0.0.md`. The `-2` suffix deviates from the naming doctrine. If the registry is meant to be a permanent administrative artifact alongside 0523D (Wake Authority), it should have its own distinct `specId` in the main sequence — perhaps `0523R` for Registry, or a dedicated admin namespace like `0000_WOS_InfrastructureRegistry`. The `-2` suffix implies it is a sub-document of 0523D, which it is not.

### `lastReviewDate` and `lastBuildDate` Are Null in All Records

The schema includes these fields but all records show `null`. For a registry that is the "canonical memory surface for infrastructure state," having null review dates makes it impossible to tell when a record was last validated. Recommend populating these from the review dates in this session at minimum.

### Registry Update Cadence Is Not Defined

The Implementation Guide says "keep this registry updated after every spec review, build handoff, implementation return, and patch cycle." But it does not state who is responsible for updates or what the lag tolerance is. A registry that is correct at publication but not updated for three spec cycles is worse than a registry that is clearly marked as of a specific date.

---

## Final Assessment

---

### Review Status

**NOT READY FOR FREEZE — One critical internal consistency failure, two required corrections.**

The registry's core value proposition is that it faithfully represents the state of the chain. Marking 0523D as `GO` when the review chain returned three blocking issues undermines that value on its first publication. This must be corrected before the registry can serve as authoritative governance.

---

### Required Before Freeze (Blocking)

1. **Correct 0523D registry record** — downgrade from `GO / BUILT_UNVERIFIED` to `REVIEW / PATCH_REQUIRED` until v1.1.0 blocking issues are resolved.
2. **Upgrade ISSUE-0523D-001 severity to BLOCKING** and split into three discrete issues.
3. **Add ISSUE-0523A-001** for `wakeClass` cross-spec enum mismatch — affects both 0523A and 0523D.

---

### Required Before Freeze (Non-Blocking)

4. Add `parentSpecs` and `downstreamSpecs` to all canonical records.
5. Add `implementationStatus` column to Next Maritime Specs table.
6. Add registry records for 0522O, 0522P, 0522Q.
7. Resolve `0523D-2` filename — should not use a sub-document suffix; assign a distinct spec ID.
8. Populate `lastReviewDate` from current review cycle.

---

### Highest Risk

**A GO-marked spec with known blocking issues becoming the basis for downstream build work.** If 0523E (Atmospheric Readability) is built against 0523D v1.1.0 before the `wakeClass` enum is reconciled, the atmospheric system will inherit the enum mismatch. By the time the mismatch surfaces in integration testing, two specs and their implementations will need to be patched simultaneously. The registry exists precisely to prevent this — but only if its state accurately reflects the review chain.
