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

Canonical administrative governance registry for WOS maritime infrastructure.

This registry governs:

- canonical spec visibility
- freeze-state visibility
- implementation-state visibility
- dependency topology
- issue propagation
- cross-spec coordination
- constitutional inheritance
- runtime ownership boundaries
- governance survivability

This registry is administrative infrastructure only.

It is NOT:
- runtime orchestration
- deployment infrastructure
- renderer authority
- simulation authority
- lifecycle authority

Core doctrine:

```text
Administrative truth
NOT runtime truth
```

---

# 1. Registry Doctrine

## 1.1 Administrative Scope

The registry may declare:

- canonical versions
- supersession state
- freeze state
- build readiness
- verification state
- dependency relationships
- runtime ownership visibility
- issue coordination state
- downstream blocking state

The registry may NOT:

- mutate runtime systems
- trigger builds automatically
- activate deployments
- gate runtime execution
- configure renderer behavior
- configure simulation behavior
- assign continuity authority
- alter AIS truth
- orchestrate runtime systems

---

## 1.2 Anti-Automation Doctrine

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

Automation may NOT use registry state as runtime authority.

---

# 2. Stage and Freeze Decision

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

Examples:

```text
Stage: [REVIEW]
Freeze Decision: REVIEW
```

```text
Stage: [BUILD]
Freeze Decision: GO
```

```text
Stage: [REVIEW]
Freeze Decision: STOP
```

Important:

```text
Stage: [BUILD]
Freeze Decision: GO
```

does NOT imply:
- implementation started
- implementation verified
- deployment complete
- downstream compatibility guaranteed

That is tracked separately through implementation lifecycle state.

---

# 3. Implementation Status

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

## 3.1 Status Semantics

### NOT_STARTED

No implementation work exists.

### READY_TO_BUILD

Freeze-state approved.
Implementation not started.

### IN_PROGRESS

Implementation underway.

### BUILT_UNVERIFIED

Implementation returned.
Architectural verification incomplete.

### BUILT_VERIFIED

Implementation verified against governance contracts.

### PATCH_REQUIRED

Blocking correction required before downstream reliance.

### BLOCKED

Implementation progression halted by upstream dependency.

---

## 3.2 Status / Date Coherence Rule

If:

```yaml
implementation_status: "NOT_STARTED"
```

then:

```yaml
lastBuildDate: null
```

is mandatory.

---

## 3.3 lastBuildDate Semantics

`lastBuildDate` records:

```text
the most recent implementation code return
```

It is NOT updated by:
- spec review
- freeze-state changes
- registry maintenance
- patch planning
- issue lifecycle changes

It updates ONLY when implementation code is returned for review.

---

# 4. BUILT_VERIFIED Criteria

`BUILT_VERIFIED` requires:

- authority boundaries preserved
- runtime ownership correct
- forbidden mutations absent
- deterministic constraints preserved
- dependency contracts validated
- debug APIs safe
- initialization order reviewed
- script order reviewed
- cross-spec interfaces validated
- no unresolved BLOCKING issues remain

Verification records should include:
- reviewer
- date
- version
- affected files
- caveats

---

# 5. Registry Update Cadence

Registry updates required whenever:

- stage changes
- freeze decision changes
- implementation status changes
- canonical version changes
- supersession occurs
- blocking issue appears
- dependency topology changes
- runtime ownership changes
- downstream compatibility changes

Expected update cadence:

```text
within 1 business day
```

of governance state change.

---

# 6. Registry Record Schema

```ts
type WOSInfrastructureRegistryRecord = {
  specId: string;
  filename: string;
  title: string;
  version: string;

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

  parentSpecs: string[];
  downstreamSpecs: string[];

  buildScope: string[];
  doNotBuild: string[];

  lastReviewDate: string | null;
  lastBuildDate: string | null;

  openIssues: RegistryIssue[];
};
```

---

# 7. Registry Issue Schema

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

## 7.1 Issue Lifecycle Semantics

```text
RESOLVED
```

means:

```text
fix applied
```

through:
- implementation return
- patch revision
- corrected contract

```text
VERIFIED
```

means:

```text
architectural review confirmed correctness
```

and:
- dependency integrity restored
- contracts validated
- downstream compatibility restored

---

# 8. Registry Format Versioning

`registry_format_version` increments when:
- schema changes
- enum changes
- required fields change
- semantic meaning changes
- lifecycle semantics change

It does NOT increment for:
- status updates
- issue resolution
- stage updates
- freeze updates

---

# 9. Issue Coordination Rules

## 9.1 Shared Root-Cause Issues

Example:

```text
ISSUE-0523A-001
ISSUE-0523D-003
```

describe the same wakeClass mismatch from opposite sides.

These issues must resolve together unless explicitly split.

---

## 9.2 Escalation Rules

If a BLOCKING issue remains OPEN for:

```text
14 days
```

then:
- registry review required
- downstream review required

If unresolved after:

```text
30 days
```

then:
- affected specs should become BLOCKED
- or superseded

---

# 10. Current Canonical Maritime Snapshot

| Spec | Version | Stage | Freeze | Implementation | Status |
|---|---|---|---|---|---|
| 0522O | v1.0.0 | [BUILD] | GO | NOT_STARTED | CANONICAL |
| 0522P | v1.0.0 | [BUILD] | GO | NOT_STARTED | CANONICAL |
| 0522Q | v1.0.0 | [BUILD] | GO | NOT_STARTED | CANONICAL |
| 0523A | v1.2.1 | [BUILD] | GO | PATCH_REQUIRED | CANONICAL |
| 0523B | v1.1.0 | [BUILD] | GO | BUILT_VERIFIED | CANONICAL |
| 0523C | v1.2.1 | [BUILD] | GO | BUILT_UNVERIFIED | CANONICAL |
| 0523D | v1.1.0 | [REVIEW] | REVIEW | PATCH_REQUIRED | CANONICAL |
| 0523R | v1.2.2 | [BUILD] | GO | READY_TO_BUILD | CANONICAL |
| 0523E | — | [REVIEW] | REVIEW | NOT_STARTED | PLANNED |
| 0523F | — | [REVIEW] | REVIEW | NOT_STARTED | PLANNED |

---

# 11. Dependency Block Table

| Blocking Source | Blocks | Reason |
|---|---|---|
| 0523A PATCH_REQUIRED | wake consumers | wakeClass mismatch |
| 0523D PATCH_REQUIRED | 0523E | unstable wake contracts |
| 0523D PATCH_REQUIRED | 0523F | unstable wake-density contracts |
| ISSUE-0523A-001 | 0523D verification | shared wakeClass mismatch |
| ISSUE-0523D-003 | 0523A verification | shared wakeClass mismatch |

---

# 12. Constitutional Dependency Records

Constitutional doctrine specs use:

```yaml
runtime_owner: null
```

because doctrine specs do not directly own runtime execution.

---

## 12.1 0522O — Maritime Motion Authority

```yaml
spec_id: "0522O_WOS_MaritimeMotionAuthority"
version: "1.0.0"
stage: "[BUILD]"
freeze_decision: "GO"
implementation_status: "NOT_STARTED"

runtime_owner: null

lastBuildDate: null
lastReviewDate: "2026-05-24"

parentSpecs: []

downstreamSpecs:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523C_WOS_MaritimeSpawnEcology"
  - "0523D_WOS_MaritimeWakeAuthority"

openIssues: []
```

---

## 12.2 0522P — AIS Runtime Continuity

```yaml
spec_id: "0522P_WOS_AISRuntimeContinuity"
version: "1.0.0"
stage: "[BUILD]"
freeze_decision: "GO"
implementation_status: "NOT_STARTED"

runtime_owner: null

lastBuildDate: null
lastReviewDate: "2026-05-24"

parentSpecs: []

downstreamSpecs:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523C_WOS_MaritimeSpawnEcology"
  - "0523D_WOS_MaritimeWakeAuthority"
  - "0523F_WOS_MaritimeContinuityDensity"

openIssues: []
```

---

## 12.3 0522Q — Maritime Continuity Doctrine

```yaml
spec_id: "0522Q_WOS_MaritimeContinuityDoctrine"
version: "1.0.0"
stage: "[BUILD]"
freeze_decision: "GO"
implementation_status: "NOT_STARTED"

runtime_owner: null

lastBuildDate: null
lastReviewDate: "2026-05-24"

parentSpecs: []

downstreamSpecs:
  - "0523B_WOS_MaritimePopulationHierarchy"
  - "0523C_WOS_MaritimeSpawnEcology"
  - "0523D_WOS_MaritimeWakeAuthority"
  - "0523F_WOS_MaritimeContinuityDensity"

openIssues: []
```

---

# 13. Canonical Maritime Records

## 13.1 0523A — Maritime Vessel Taxonomy Profiles

```yaml
spec_id: "0523A_WOS_MaritimeVesselTaxonomyProfiles"
version: "1.2.1"

stage: "[BUILD]"
freeze_decision: "GO"

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

openIssues:
  - issueId: "ISSUE-0523A-001"
    severity: "BLOCKING"
    status: "OPEN"
    summary: "wakeClass enum mismatch"
    linkedIssues:
      - "ISSUE-0523D-003"
```

---

## 13.2 0523B — Maritime Population Hierarchy

```yaml
spec_id: "0523B_WOS_MaritimePopulationHierarchy"
version: "1.1.0"

stage: "[BUILD]"
freeze_decision: "GO"

implementation_status: "BUILT_VERIFIED"

runtime_owner: "MaritimePopulationHierarchy"

parentSpecs:
  - "0522Q_WOS_MaritimeContinuityDoctrine"

downstreamSpecs:
  - "0523C_WOS_MaritimeSpawnEcology"
  - "0523D_WOS_MaritimeWakeAuthority"

openIssues: []
```

---

## 13.3 0523C — Maritime Spawn Ecology

```yaml
spec_id: "0523C_WOS_MaritimeSpawnEcology"
version: "1.2.1"

stage: "[BUILD]"
freeze_decision: "GO"

implementation_status: "BUILT_UNVERIFIED"

runtime_owner: "MaritimeSpawnEcology"

parentSpecs:
  - "0522O_WOS_MaritimeMotionAuthority"
  - "0522P_WOS_AISRuntimeContinuity"
  - "0522Q_WOS_MaritimeContinuityDoctrine"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523B_WOS_MaritimePopulationHierarchy"

downstreamSpecs:
  - "0523D_WOS_MaritimeWakeAuthority"
  - "0523E_WOS_MaritimeAtmosphericReadability"

openIssues:
  - issueId: "ISSUE-0523C-001"
    severity: "WATCH"
    status: "OPEN"
    summary: "Source audit required before BUILT_VERIFIED."
```

---

## 13.4 0523D — Maritime Wake Authority

```yaml
spec_id: "0523D_WOS_MaritimeWakeAuthority"
version: "1.1.0"

stage: "[REVIEW]"
freeze_decision: "REVIEW"

implementation_status: "PATCH_REQUIRED"

runtime_owner: "MaritimeWakeAuthority"

parentSpecs:
  - "0522O_WOS_MaritimeMotionAuthority"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles"
  - "0523B_WOS_MaritimePopulationHierarchy"
  - "0523C_WOS_MaritimeSpawnEcology"

downstreamSpecs:
  - "0523E_WOS_MaritimeAtmosphericReadability"
  - "0523F_WOS_MaritimeContinuityDensity"

openIssues:
  - issueId: "ISSUE-0523D-001"
    severity: "BLOCKING"
    status: "OPEN"
    summary: "parentEvicted mutability conflict"

  - issueId: "ISSUE-0523D-002"
    severity: "BLOCKING"
    status: "OPEN"
    summary: "Emission step 4 not provenance-aware"

  - issueId: "ISSUE-0523D-003"
    severity: "BLOCKING"
    status: "OPEN"
    summary: "wakeClass enum divergence"
    linkedIssues:
      - "ISSUE-0523A-001"
```

---

# 14. Runtime Authority Registry

| Runtime Owner | Owns | May Not Own |
|---|---|---|
| AISRuntime | AIS truth | renderer styling |
| MaritimeTaxonomyProfiles | vessel identity | lifecycle mutation |
| MaritimePopulationHierarchy | observability tiers | AIS lifecycle |
| MaritimeSpawnEcology | ecology requests | vessel motion |
| MaritimeWakeAuthority | wake memory | lifecycle authority |
| MarineRenderer | presentation | runtime truth |
| AtmosphericReadability | visibility interpretation | continuity truth |
| ContinuityDensity | density interpretation | vessel identity |

---

# 15. Future Spec Guardrails

## 15.1 0523E Atmospheric Readability

Blocked from BUILD until:
- 0523D stabilized
- wake contracts stabilized
- wakeClass mismatch resolved

---

## 15.2 0523F Continuity Density

Blocked from BUILD until:
- 0523D stabilized
- wake density semantics stabilized
- continuity/wake contracts stabilized

---

# 16. Canonical Artifact Rule

Every canonical version must be:

```text
standalone
complete
reconstructable
self-sufficient
```

Patch versions are still:
```text
full canonical artifacts
```

Canonical versions may NOT:
- silently omit prior canonical sections
- rely on implied inheritance
- behave like patch diffs

If a previously canonical section disappears:

```text
that omission is a structural governance fault
```

unless explicitly documented.

---

# 17. Artifact Integrity Validation

Canonical governance artifacts should validate:

- section continuity
- canonical record continuity
- authority table continuity
- dependency table continuity
- issue table continuity
- schema continuity
- no silent omission

---

# 18. Validation Checklist

- [ ] one canonical version per family
- [ ] superseded versions explicit
- [ ] stage and freeze separated
- [ ] implementation lifecycle explicit
- [ ] constitutional dependencies tracked
- [ ] runtime ownership explicit
- [ ] issue coordination explicit
- [ ] anti-automation doctrine preserved
- [ ] canonical records complete
- [ ] no silent omissions
- [ ] artifact reconstructable

---

# 19. Non-Goals

This registry does NOT:
- generate code
- trigger builds
- deploy systems
- orchestrate runtime
- define renderer behavior
- replace source review
- replace runtime testing

---

# 20. Implementation Guide

- **Where this goes:** `docs/_specs/wos/0523R_WOS_InfrastructureRegistry_v1.2.2.md`
- **What to run:** use as the canonical governance ledger for maritime infrastructure.
- **What to expect:** stable dependency governance, freeze-state visibility, issue coordination, and artifact integrity protection.
