---
title: "WOS Infrastructure Registry"
filename: "0523R_WOS_InfrastructureRegistry_v1.2.1.md"
version: "1.2.1"
date: "2026-05-24"
system: "WOS"
module: "Infrastructure Registry"
type: "governance-registry-spec"

status: "[BUILD]"
stage: "[BUILD]"
freeze_decision: "GO"

build_scope: "administrative-governance-only"
owner: "StudioRich / WOS"

registry_format_version: "1.2.1"

supersedes:
  - "0523D-2_WOS_InfrastructureRegistry_v1.0.0.md"
  - "0523R_WOS_InfrastructureRegistry_v1.1.0.md"
  - "0523R_WOS_InfrastructureRegistry_v1.2.0.md"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Safe to use as canonical administrative registry.

---

# 0523R_WOS_InfrastructureRegistry_v1.2.1

## Purpose

Precision patch for `0523R_WOS_InfrastructureRegistry_v1.2.0`.

This revision resolves the final metadata-coherence issues identified during freeze review:

- constitutional doctrine specs now use `runtime_owner: null`
- `NOT_STARTED` records now use `lastBuildDate: null`
- 0523C parent dependencies now include 0522O and 0522P
- ISSUE-0523C-001 now has an owner, target resolution path, and audit criteria
- constitutional downstream lists are clarified as first-order unless otherwise stated
- future-spec guardrails now reference the dependency block table

This is not a redesign.

This is the freeze-ready precision patch.

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

This prevents registry lint failures and false build-history assumptions.

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

Closing one without closing the other is forbidden unless the registry explicitly documents why the root cause was split.

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
| 0523R Infrastructure Registry | v1.2.1 | [BUILD] | GO | READY_TO_BUILD | — |
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

## 0522O — Maritime Motion Authority

```yaml
spec_id: "0522O_WOS_MaritimeMotionAuthority"
canonical_version: "1.0.0"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "NOT_STARTED"
runtime_owner: null
parentSpecs: []
downstreamSpecs:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523C_WOS_MaritimeSpawnEcology"
  - "0523D_WOS_MaritimeWakeAuthority"
lastReviewDate: "2026-05-24"
lastBuildDate: null
openIssues: []
```

## 0522P — AIS Runtime Continuity

```yaml
spec_id: "0522P_WOS_AISRuntimeContinuity"
canonical_version: "1.0.0"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "NOT_STARTED"
runtime_owner: null
parentSpecs: []
downstreamSpecs:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523C_WOS_MaritimeSpawnEcology"
  - "0523D_WOS_MaritimeWakeAuthority"
  - "0523F_WOS_MaritimeContinuityDensity"
lastReviewDate: "2026-05-24"
lastBuildDate: null
openIssues: []
```

## 0522Q — Maritime Continuity Doctrine

```yaml
spec_id: "0522Q_WOS_MaritimeContinuityDoctrine"
canonical_version: "1.0.0"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "NOT_STARTED"
runtime_owner: null
parentSpecs: []
downstreamSpecs:
  - "0523B_WOS_MaritimePopulationHierarchy"
  - "0523C_WOS_MaritimeSpawnEcology"
  - "0523D_WOS_MaritimeWakeAuthority"
  - "0523F_WOS_MaritimeContinuityDensity"
lastReviewDate: "2026-05-24"
lastBuildDate: null
openIssues: []
```

## Constitutional Transitivity Note

All maritime runtime specs inherit constitutional doctrine transitively.

The downstream lists above identify first-order consumers only unless otherwise stated.

If any 0522 constitutional spec later receives:

```text
PATCH_REQUIRED
BLOCKED
REJECTED
```

then all downstream 0523 maritime specs must be reviewed for compatibility before further BUILD advancement.

---

# 14. Canonical Maritime Records

## 0523A — Maritime Vessel Taxonomy Profiles

```yaml
spec_id: "0523A_WOS_MaritimeVesselTaxonomyProfiles"
filename: "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1.md"
title: "Maritime Vessel Taxonomy Profiles"
version: "1.2.1"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "PATCH_REQUIRED"
runtime_owner: "MaritimeTaxonomyProfiles"
parentSpecs:
  - "0522O_WOS_MaritimeMotionAuthority"
  - "0522P_WOS_AISRuntimeContinuity"
  - "0522Q_WOS_MaritimeContinuityDoctrine"
downstreamSpecs:
  - "0523C_WOS_MaritimeSpawnEcology"
  - "0523D_WOS_MaritimeWakeAuthority"
  - "0523E_WOS_MaritimeAtmosphericReadability"
buildScope:
  - taxonomy profile registry
  - AIS class mapping
  - UNKNOWN fallback
  - profile validation
  - compiled runtime profile vectors
doNotBuild:
  - renderer behavior
  - population behavior
  - wake rendering
  - atmosphere behavior
lastReviewDate: "2026-05-24"
lastBuildDate: "2026-05-24"
openIssues:
  - issueId: "ISSUE-0523A-001"
    severity: "BLOCKING"
    status: "OPEN"
    summary: "wakeClass enum mismatch with 0523D runtime contract."
    affectedSpec: "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1"
    owner: "StudioRich / WOS"
    targetFixVersion: "0523A_v1.2.2 or 0523D_v1.2.0 coordinated patch"
    resolutionVersion: null
    resolutionDate: null
    linkedIssues:
      - "ISSUE-0523D-003"
```

---

## 0523B — Maritime Population Hierarchy

```yaml
spec_id: "0523B_WOS_MaritimePopulationHierarchy"
filename: "0523B_WOS_MaritimePopulationHierarchy_v1.1.0.md"
title: "Maritime Population Hierarchy"
version: "1.1.0"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "BUILT_VERIFIED"
runtime_owner: "MaritimePopulationHierarchy"
parentSpecs:
  - "0522Q_WOS_MaritimeContinuityDoctrine"
downstreamSpecs:
  - "0523C_WOS_MaritimeSpawnEcology"
  - "0523D_WOS_MaritimeWakeAuthority"
buildScope:
  - tier assignment
  - class floors and caps
  - render/update advisory
  - promotion TTL
  - zone budget telemetry
doNotBuild:
  - AIS lifecycle mutation
  - renderer styling
  - wake rendering
  - ecology spawning
lastReviewDate: "2026-05-24"
lastBuildDate: "2026-05-24"
openIssues: []
```

---

## 0523C — Maritime Spawn Ecology

```yaml
spec_id: "0523C_WOS_MaritimeSpawnEcology"
filename: "0523C_WOS_MaritimeSpawnEcology_v1.2.1.md"
title: "Maritime Spawn Ecology"
version: "1.2.1"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "BUILT_UNVERIFIED"
runtime_owner: "MaritimeSpawnEcology"
parentSpecs:
  - "0522O_WOS_MaritimeMotionAuthority"
  - "0522P_WOS_AISRuntimeContinuity"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523B_WOS_MaritimePopulationHierarchy"
downstreamSpecs:
  - "0523D_WOS_MaritimeWakeAuthority"
  - "0523E_WOS_MaritimeAtmosphericReadability"
buildScope:
  - ecological zones
  - temporal ecology
  - synthetic spawn candidates
  - deterministic spawn timing
  - seeded RNG
  - synthetic ID namespace
  - rejection telemetry
doNotBuild:
  - vessel motion
  - continuity mutation
  - renderer spawning
  - AIS ingestion
  - wake generation
lastReviewDate: "2026-05-24"
lastBuildDate: "2026-05-24"
openIssues:
  - issueId: "ISSUE-0523C-001"
    severity: "WATCH"
    status: "OPEN"
    summary: "Source audit required before BUILT_VERIFIED. Audit must confirm: no SpawnEcology motion mutation methods exist, no renderer-owned spawning paths exist, synthetic namespace is enforced, seeded RNG is injectable, simulation clock is respected, and per-zone interval rejection behavior is deterministic."
    affectedSpec: "0523C_WOS_MaritimeSpawnEcology_v1.2.1"
    owner: "StudioRich / WOS"
    targetFixVersion: "audit-only"
    resolutionVersion: null
    resolutionDate: null
    linkedIssues: []
```

---

## 0523D — Maritime Wake Authority

```yaml
spec_id: "0523D_WOS_MaritimeWakeAuthority"
filename: "0523D_WOS_MaritimeWakeAuthority_v1.1.0.md"
title: "Maritime Wake Authority"
version: "1.1.0"
stage: "[REVIEW]"
freeze_decision: "REVIEW"
canonical_status: "CANONICAL"
implementation_status: "PATCH_REQUIRED"
runtime_owner: "MaritimeWakeAuthority"
parentSpecs:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523B_WOS_MaritimePopulationHierarchy"
  - "0523C_WOS_MaritimeSpawnEcology"
downstreamSpecs:
  - "0523E_WOS_MaritimeAtmosphericReadability"
  - "0523F_WOS_MaritimeContinuityDensity"
buildScope:
  - wake registry
  - ring buffer
  - deterministic emission ordering
  - wake decay
  - wake provenance
  - AIS gap handling
  - synthetic wake containment
doNotBuild:
  - renderer shaders
  - vessel motion
  - AIS lifecycle mutation
  - atmospheric scoring
  - camera behavior
lastReviewDate: "2026-05-24"
lastBuildDate: "2026-05-24"
openIssues:
  - issueId: "ISSUE-0523D-001"
    severity: "BLOCKING"
    status: "OPEN"
    summary: "parentEvicted readonly mutability conflict."
    affectedSpec: "0523D_WOS_MaritimeWakeAuthority_v1.1.0"
    owner: "StudioRich / WOS"
    targetFixVersion: "0523D_v1.2.0"
    resolutionVersion: null
    resolutionDate: null
    linkedIssues: []

  - issueId: "ISSUE-0523D-002"
    severity: "BLOCKING"
    status: "OPEN"
    summary: "Emission step 4 is not provenance-aware."
    affectedSpec: "0523D_WOS_MaritimeWakeAuthority_v1.1.0"
    owner: "StudioRich / WOS"
    targetFixVersion: "0523D_v1.2.0"
    resolutionVersion: null
    resolutionDate: null
    linkedIssues: []

  - issueId: "ISSUE-0523D-003"
    severity: "BLOCKING"
    status: "OPEN"
    summary: "wakeClass enum divergence from 0523A."
    affectedSpec: "0523D_WOS_MaritimeWakeAuthority_v1.1.0"
    owner: "StudioRich / WOS"
    targetFixVersion: "0523D_v1.2.0 or 0523A_v1.2.2 coordinated patch"
    resolutionVersion: null
    resolutionDate: null
    linkedIssues:
      - "ISSUE-0523A-001"
```

---

# 15. Full Runtime Authority Registry

| Runtime Owner | Owns | May Not Own |
|---|---|---|
| AISRuntime | AIS truth, vessel state, lifecycle truth, telemetry ingestion | renderer styling, wake visuals, atmospheric interpretation |
| MaritimeMotionAuthority | motion doctrine, motion ownership boundaries | renderer projection, camera behavior, gameplay |
| MaritimeContinuityDoctrine | continuity rules, lifecycle interpretation doctrine | renderer styling, visual importance, vessel identity |
| MaritimeTaxonomyProfiles | vessel identity profiles, AIS class mapping, UNKNOWN fallback | motion, lifecycle, importance, camera targeting |
| MaritimePopulationHierarchy | observability tiers, budgets, update advisories, label eligibility | AIS lifecycle state, vessel identity, renderer styling |
| MaritimeSpawnEcology | probabilistic presence requests, ecology density suggestions, synthetic candidate generation | vessel motion, continuity state, AIS truth, renderer spawning |
| MaritimeWakeAuthority | wake memory, wake decay, wake provenance, wake registry | vessel motion, lifecycle state, population tier assignment |
| MarineRenderer | visual presentation, projection-space rendering, wake visualization | runtime truth, AIS state, wake registry mutation |
| AtmosphericReadability | visibility interpretation, fog/weather readability, atmospheric attenuation | vessel truth, wake truth, continuity truth |
| ContinuityDensity | density pressure interpretation, continuity-load analysis | vessel identity, AIS truth, renderer styling |

---

# 16. Future Spec Guardrails

See Section 12 for the full dependency block table.

## 16.1 0523E Atmospheric Readability

Blocked from BUILD until:

- 0523D patch state is resolved
- wakeClass mismatch is closed
- wake authority state contract is stable

0523E may continue REVIEW.

0523E may not consume unstable wakeClass semantics during BUILD.

## 16.2 0523F Continuity Density

Blocked from BUILD until:

- 0523D patch state is resolved
- wake density semantics are stable
- continuity/wake interaction remains advisory only

0523F may continue REVIEW.

---

# 17. Validation Checklist

- [ ] One canonical version per spec family
- [ ] Superseded versions explicit
- [ ] Stage and freeze decision separated
- [ ] Implementation status separated from freeze state
- [ ] Constitutional dependencies tracked
- [ ] Constitutional doctrine specs use `runtime_owner: null`
- [ ] NOT_STARTED records use `lastBuildDate: null`
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
- certify live data coverage
- infer undocumented authority
- orchestrate runtime systems

---

# 19. Implementation Guide

- **Where this goes:** `docs/_specs/wos/0523R_WOS_InfrastructureRegistry_v1.2.1.md`
- **What to run:** use this registry as the canonical administrative ledger before creating, reviewing, building, or patching any downstream WOS maritime spec.
- **What to expect:** stable freeze-state visibility, coherent metadata, linked blocking issues, dependency propagation clarity, and protection against governance drift.
