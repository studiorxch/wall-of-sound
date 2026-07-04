---
title: "WOS Infrastructure Registry"
filename: "0523R_WOS_InfrastructureRegistry_v1.2.2.md"
version: "1.2.2"
date: "2026-05-24"
system: "WOS"
module: "Infrastructure Registry"
type: "governance-registry-spec"

status: "[BUILD]"
stage: "[BUILD]"
freeze_decision: "GO"

build_scope: "administrative-governance-only"
owner: "StudioRich / WOS"

registry_format_version: "1.2.2"

supersedes:
  - "0523D-2_WOS_InfrastructureRegistry_v1.0.0.md"
  - "0523R_WOS_InfrastructureRegistry_v1.1.0.md"
  - "0523R_WOS_InfrastructureRegistry_v1.2.0.md"
  - "0523R_WOS_InfrastructureRegistry_v1.2.1.md"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Canonical freeze-grade administrative registry.

---

# 0523R_WOS_InfrastructureRegistry_v1.2.2

## Purpose

Final precision freeze patch for the WOS Infrastructure Registry.

This revision resolves the remaining semantic precision gaps identified during v1.2.1 freeze validation:

- `lastBuildDate` semantics are now explicitly defined
- `RESOLVED` vs `VERIFIED` issue states are now explicitly distinguished
- `0522O_WOS_MaritimeMotionAuthority` added to `0523D.parentSpecs`

This revision does not alter the constitutional architecture.

It hardens:
- metadata interpretation
- issue lifecycle semantics
- dependency coherence
- freeze-state survivability

---

# 1. Registry Doctrine

The Infrastructure Registry is:

```text
administrative truth
NOT runtime truth
```

The registry may declare:

- canonical versions
- supersession state
- freeze state
- build readiness
- verification state
- open blocking issues
- dependency relationships
- runtime authority ownership

The registry may NOT:

- mutate runtime systems
- trigger builds automatically
- activate deployments
- gate runtime execution
- configure renderer behavior
- configure simulation behavior
- assign continuity authority
- orchestrate runtime systems

---

# 2. Anti-Automation Doctrine

Registry metadata must never become direct execution authority.

Forbidden automation uses:

```text
implementationStatus → automatic runtime activation
freezeDecision → automatic deployment
runtimeOwner → execution permission
dependencyStatus → runtime feature gating
canonicalStatus → renderer configuration
```

Allowed automation uses:

```text
registry linting
documentation validation
missing-field detection
duplicate-spec detection
broken-link detection
dependency warning reports
```

Automation may inspect registry state.

Automation may not use registry state as runtime authority.

---

# 3. Stage and Freeze Decision

Use only:

```text
Stage:
- [REVIEW]
- [BUILD]
```

And:

```text
Freeze Decision:
- REVIEW
- GO
- STOP
```

Important:

```text
Stage: [BUILD]
Freeze Decision: GO
```

does NOT imply:

- implementation has started
- implementation has passed review
- deployment is complete
- downstream compatibility is guaranteed

That is tracked separately by `implementationStatus`.

---

# 4. Implementation Status

```ts
type ImplementationStatus =
  | "NOT_STARTED"
  | "READY_TO_BUILD"
  | "IN_PROGRESS"
  | "BUILT_UNVERIFIED"
  | "BUILT_VERIFIED"
  | "PATCH_REQUIRED"
  | "BLOCKED";
```

## Status / Date Coherence Rule

If:

```yaml
implementation_status: "NOT_STARTED"
```

then:

```yaml
lastBuildDate: null
```

A record with `NOT_STARTED` may not have a build date.

## lastBuildDate Semantics

`lastBuildDate` records:

```text
the date of the most recent code implementation return
```

It is NOT updated by:

- spec review alone
- registry maintenance
- freeze-state changes
- patch spec creation
- issue lifecycle changes

It updates only when implementation code is returned for review.

This prevents:
- date creep
- false implementation freshness
- stale-state ambiguity
- governance timeline corruption

---

# 5. BUILT_VERIFIED Criteria

`BUILT_VERIFIED` requires:

- code review completed
- authority boundaries preserved
- runtime ownership correct
- forbidden mutations absent
- deterministic constraints preserved
- cross-spec interfaces validated
- dependency contracts validated
- debug APIs safe
- script order correct
- initialization order reviewed
- no unresolved BLOCKING issues remain

Verification must record:

- reviewer
- review date
- verified version
- affected files
- open caveats, if any

---

# 6. Registry Update Cadence

Registry must update whenever:

- stage changes
- freeze decision changes
- implementation status changes
- canonical version changes
- supersession occurs
- blocking issue appears
- blocking issue resolves
- dependency relationship changes
- downstream compatibility changes
- runtime ownership changes

Registry updates should occur within:

```text
1 business day
```

of the underlying architectural change.

A stale registry becomes:

```text
deployment-blocking governance drift
```

---

# 7. Registry Record Schema

```ts
type WOSInfrastructureRegistryRecord = {
  specId: string;
  filename: string;
  title: string;
  version: string;

  system: string;
  module: string;
  domain: string;

  stage: "[REVIEW]" | "[BUILD]";
  freezeDecision: "REVIEW" | "GO" | "STOP";

  canonicalStatus:
    | "CANONICAL"
    | "SUPERSEDED"
    | "REFERENCE_ONLY"
    | "DEPRECATED"
    | "REJECTED";

  implementationStatus:
    | "NOT_STARTED"
    | "READY_TO_BUILD"
    | "IN_PROGRESS"
    | "BUILT_UNVERIFIED"
    | "BUILT_VERIFIED"
    | "PATCH_REQUIRED"
    | "BLOCKED";

  runtimeOwner: string | null;

  supersedes: string[];
  supersededBy: string | null;

  parentSpecs: string[];
  downstreamSpecs: string[];

  buildScope: string[];
  doNotBuild: string[];

  lastReviewDate: string | null;
  lastBuildDate: string | null;

  lastReviewer: string | null;
  lastVerifier: string | null;

  openIssues: RegistryIssue[];
};
```

---

# 8. Registry Issue Schema

```ts
type RegistryIssue = {
  issueId: string;

  severity:
    | "BLOCKING"
    | "NON_BLOCKING"
    | "WATCH";

  status:
    | "OPEN"
    | "RESOLVED"
    | "DEFERRED"
    | "VERIFIED";

  summary: string;
  affectedSpec: string;

  owner: string | null;

  targetFixVersion: string | null;
  resolutionVersion: string | null;
  resolutionDate: string | null;

  linkedIssues: string[];
};
```

## Issue Lifecycle Semantics

```text
RESOLVED
```

means:

```text
the fix has been applied
in a spec revision or implementation return
```

```text
VERIFIED
```

means:

```text
architectural review has confirmed
the fix is correct and the affected contracts are valid
```

This distinction mirrors:

```text
BUILT_UNVERIFIED
vs
BUILT_VERIFIED
```

for implementation lifecycle tracking.

---

# 9. Registry Format Versioning

`registry_format_version` increments when:

- schema fields change
- required fields are added
- enum values change
- semantic meaning of a field changes
- issue lifecycle semantics change

`registry_format_version` does NOT increment merely for:

- adding new spec records
- updating implementation status
- resolving issues
- changing freeze decision
- changing stage

Consumers should validate `registry_format_version` compatibility before parsing.

---

# 10. Issue Coordination Rules

## 10.1 Shared Root-Cause Issues

Some issues appear in more than one spec but share a single root cause.

Example:

```text
ISSUE-0523A-001
ISSUE-0523D-003
```

Both describe the same `wakeClass` enum mismatch from opposite sides.

They must be resolved together.

## 10.2 Issue Status Transitions

```text
OPEN → RESOLVED
```

Allowed when:

- patch spec is created
- patch code is returned, if required
- affected contract is updated

```text
RESOLVED → VERIFIED
```

Allowed when:

- source/spec review confirms the fix
- downstream compatibility is restored
- no linked blocking issue remains open

## 10.3 Stale Blocking Issue Escalation

If a BLOCKING issue remains OPEN for more than:

```text
14 days
```

then:

- registry owner must review
- dependent specs must remain blocked unless explicitly exempted
- issue receives architecture review priority

If unresolved for more than:

```text
30 days
```

then affected specs should be marked:

```text
BLOCKED
```

or superseded by a corrective version.

---

# 11. Current Canonical Maritime Snapshot

| Spec | Version | Stage | Freeze | Implementation Status | Blocked By |
|---|---:|---|---|---|---|
| 0522O Maritime Motion Authority | v1.0.0 | [BUILD] | GO | NOT_STARTED | — |
| 0522P AIS Runtime Continuity | v1.0.0 | [BUILD] | GO | NOT_STARTED | — |
| 0522Q Maritime Continuity Doctrine | v1.0.0 | [BUILD] | GO | NOT_STARTED | — |
| 0523A Maritime Vessel Taxonomy Profiles | v1.2.1 | [BUILD] | GO | PATCH_REQUIRED | ISSUE-0523A-001 |
| 0523B Maritime Population Hierarchy | v1.1.0 | [BUILD] | GO | BUILT_VERIFIED | — |
| 0523C Maritime Spawn Ecology | v1.2.1 | [BUILD] | GO | BUILT_UNVERIFIED | Source audit pending |
| 0523D Maritime Wake Authority | v1.1.0 | [REVIEW] | REVIEW | PATCH_REQUIRED | ISSUE-0523D-001/002/003 |
| 0523R Infrastructure Registry | v1.2.2 | [BUILD] | GO | READY_TO_BUILD | — |
| 0523E Maritime Atmospheric Readability | — | [REVIEW] | REVIEW | NOT_STARTED | 0523D patch |
| 0523F Maritime Continuity Density | — | [REVIEW] | REVIEW | NOT_STARTED | 0523D patch |

---

# 12. Dependency Block Table

| Blocking Source | Blocks | Reason |
|---|---|---|
| 0523A PATCH_REQUIRED | wakeClass consumers | Taxonomy wakeClass enum mismatch |
| 0523D PATCH_REQUIRED | 0523E | Atmospheric readability may consume wake state |
| 0523D PATCH_REQUIRED | 0523F | Continuity density may depend on wake density behavior |
| ISSUE-0523A-001 + ISSUE-0523D-003 | 0523A verification, 0523D verification | Shared root-cause enum collision |
| ISSUE-0523D-002 | wake runtime verification | AIS wakes must not be suppressed by synthetic budget saturation |
| ISSUE-0523D-001 | wake runtime verification | parentEvicted schema mutability conflict |

---

# 13. Constitutional Dependency Records

Constitutional doctrine specs do not directly own runtime systems.

Therefore:

```yaml
runtime_owner: null
```

is canonical for 0522O, 0522P, and 0522Q.

Their rules are enforced by downstream runtime systems.

## Constitutional Transitivity Note

All maritime runtime specs inherit constitutional doctrine transitively.

The downstream lists below identify first-order consumers only unless otherwise stated.

If any 0522 constitutional spec later receives:

```text
PATCH_REQUIRED
BLOCKED
REJECTED
```

then all downstream 0523 maritime specs must be reviewed for compatibility before further BUILD advancement.

---

# 14. Canonical Maritime Records

## 0523D — Maritime Wake Authority

```yaml
spec_id: "0523D_WOS_MaritimeWakeAuthority"
version: "1.1.0"
stage: "[REVIEW]"
freeze_decision: "REVIEW"
implementation_status: "PATCH_REQUIRED"

parentSpecs:
  - "0522O_WOS_MaritimeMotionAuthority"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523B_WOS_MaritimePopulationHierarchy"
  - "0523C_WOS_MaritimeSpawnEcology"
```

---

# 15. Full Runtime Authority Registry

| Runtime Owner | Owns | May Not Own |
|---|---|---|
| AISRuntime | AIS truth, vessel state, lifecycle truth | renderer styling, wake visuals |
| MaritimeTaxonomyProfiles | vessel identity profiles | lifecycle mutation |
| MaritimePopulationHierarchy | observability tiers | AIS lifecycle |
| MaritimeSpawnEcology | probabilistic presence requests | vessel motion |
| MaritimeWakeAuthority | wake memory and provenance | vessel lifecycle |
| MarineRenderer | presentation | runtime truth |
| AtmosphericReadability | visibility interpretation | continuity truth |
| ContinuityDensity | density interpretation | vessel identity |

---

# 16. Future Spec Guardrails

See Section 12 for the full dependency block table.

## 16.1 0523E Atmospheric Readability

Blocked from BUILD until:

- 0523D patch state is resolved
- wakeClass mismatch is closed
- wake authority state contract is stable

## 16.2 0523F Continuity Density

Blocked from BUILD until:

- 0523D patch state is resolved
- wake density semantics are stable
- continuity/wake interaction remains advisory only

---

# 17. Validation Checklist

- [ ] One canonical version per spec family
- [ ] Superseded versions explicit
- [ ] Stage and freeze decision separated
- [ ] Implementation status separated from freeze state
- [ ] Constitutional dependencies tracked
- [ ] Constitutional doctrine specs use runtime_owner: null
- [ ] NOT_STARTED records use lastBuildDate: null
- [ ] lastBuildDate semantics explicitly defined
- [ ] RESOLVED vs VERIFIED semantics explicitly defined
- [ ] Parent dependencies declared
- [ ] Downstream dependencies declared
- [ ] Blocking issues visible
- [ ] Cross-spec issues linked
- [ ] Shared root-cause issues coordinated
- [ ] Runtime authority table complete
- [ ] Registry update cadence defined
- [ ] Verification criteria complete
- [ ] Anti-automation doctrine included
- [ ] Registry remains administrative only
- [ ] No runtime orchestration authority exists

---

# 18. Non-Goals

This registry does NOT:

- replace full specs
- replace source-code review
- replace runtime tests
- generate code
- trigger builds automatically
- deploy systems
- define renderer behavior
- define simulation behavior
- infer undocumented authority
- orchestrate runtime systems

---

# 19. Implementation Guide

- **Where this goes:** `docs/_specs/wos/0523R_WOS_InfrastructureRegistry_v1.2.2.md`
- **What to run:** use this registry as the canonical administrative ledger for all maritime governance tracking and dependency validation.
- **What to expect:** freeze-grade governance visibility, dependency coherence, issue lifecycle precision, and protection against governance drift.
