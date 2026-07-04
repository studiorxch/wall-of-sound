---
title: "WOS Infrastructure Registry"
filename: "0523D-2_WOS_InfrastructureRegistry_v1.0.0.md"
version: "1.0.0"
date: "2026-05-24"
system: "WOS"
module: "Infrastructure Registry"
type: "governance-registry-spec"
status: "[REVIEW]"
stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "none"
owner: "StudioRich / WOS"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Review before build.

# 0523D-2_WOS_InfrastructureRegistry_v1.0.0

## Purpose

Define a canonical infrastructure registry for WOS specs, builds, dependencies, and runtime authority boundaries.

This registry prevents:

- duplicate spec builds
- stale version confusion
- accidental supersession drift
- ambiguous freeze states
- unclear build handoff
- hidden implementation gaps
- downstream specs inheriting obsolete assumptions
- runtime authority ownership confusion

Core principle:

```text
The registry is the canonical memory surface for infrastructure state.
```

---

# Core Doctrine

## Registry Is Administrative Truth, Not Runtime Truth

The registry tracks system architecture state.

It does not:

- mutate runtime systems
- own simulation behavior
- override spec content
- replace implementation tests
- certify code correctness by itself

The registry may declare:

- which spec version is canonical
- which version is superseded
- whether a spec is in `[REVIEW]` or `[BUILD]`
- whether `Freeze Decision` is `REVIEW`, `GO`, or `STOP`
- whether implementation is pending, partial, complete, or blocked

---

# Stage System

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

Correct examples:

```text
Stage: [REVIEW]
Freeze Decision: REVIEW
Action: Hold for review.
```

```text
Stage: [BUILD]
Freeze Decision: GO
Action: Send to build.
```

```text
Stage: [REVIEW]
Freeze Decision: STOP
Action: Do not proceed.
```

---

# Registry Record Schema

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

  openIssues: RegistryIssue[];
};
```

---

# Registry Issue Schema

```ts
type RegistryIssue = {
  issueId: string;
  severity: "BLOCKING" | "NON_BLOCKING" | "WATCH";
  status: "OPEN" | "RESOLVED" | "DEFERRED";

  summary: string;
  affectedSpec: string;
  owner: string | null;

  resolutionVersion: string | null;
};
```

---

# Current Canonical Maritime Registry Snapshot

| Spec | Canonical Version | Stage | Freeze Decision | Implementation Status |
|---|---:|---|---|---|
| Maritime Vessel Taxonomy Profiles | `v1.2.1` | `[BUILD]` | `GO` | `BUILT_VERIFIED` |
| Maritime Population Hierarchy | `v1.1.0` | `[BUILD]` | `GO` | `BUILT_VERIFIED` |
| Maritime Spawn Ecology | `v1.2.1` | `[BUILD]` | `GO` | `BUILT_UNVERIFIED` |
| Maritime Wake Authority | `v1.1.0` | `[BUILD]` | `GO` | `BUILT_UNVERIFIED` |
| WOS Infrastructure Registry | `v1.0.0` | `[REVIEW]` | `REVIEW` | `NOT_STARTED` |

---

# Next Maritime Specs

| Spec | Target Version | Stage | Freeze Decision | Notes |
|---|---:|---|---|---|
| Maritime Atmospheric Readability | `v1.0.0` | `[REVIEW]` | `REVIEW` | Next canonical spec after registry |
| Maritime Continuity Density | `v1.0.0` | `[REVIEW]` | `REVIEW` | Owns continuity/density pressure |
| Harbor Coverage Envelope | `v1.0.0` | `[REVIEW]` | `REVIEW` | Defines AIS observability bounds |
| Waterfront Observability Layer | `v1.0.0` | `[REVIEW]` | `REVIEW` | Public waterfront interface layer |

---

# Canonical Maritime Records

## 0523A — Maritime Vessel Taxonomy Profiles

```yaml
spec_id: "0523A_WOS_MaritimeVesselTaxonomyProfiles"
canonical_version: "1.2.1"
canonical_file: "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1.md"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "BUILT_VERIFIED"
runtime_owner: "MaritimeTaxonomyProfiles"
supersedes:
  - "0523A_WOS_MaritimeVesselTaxonomy_v1.0.0.md"
  - "0523A_WOS_MaritimeVesselTaxonomy_v1.1.0.md"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.0.md"
build_scope:
  - taxonomy profile registry
  - AIS class mapping
  - UNKNOWN fallback
  - profile validation
  - compiled runtime profile vectors
do_not_build:
  - renderer behavior
  - population behavior
  - wake rendering
  - atmosphere behavior
```

## 0523B — Maritime Population Hierarchy

```yaml
spec_id: "0523B_WOS_MaritimePopulationHierarchy"
canonical_version: "1.1.0"
canonical_file: "0523B_WOS_MaritimePopulationHierarchy_v1.1.0.md"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "BUILT_VERIFIED"
runtime_owner: "MaritimePopulationHierarchy"
supersedes:
  - "0523B_WOS_MaritimePopulationHierarchy_v1.0.0.md"
build_scope:
  - tier assignment
  - class floors and caps
  - render/update advisory
  - promotion TTL
  - zone budget telemetry
do_not_build:
  - AIS lifecycle mutation
  - renderer styling
  - wake rendering
  - ecology spawning
```

## 0523C — Maritime Spawn Ecology

```yaml
spec_id: "0523C_WOS_MaritimeSpawnEcology"
canonical_version: "1.2.1"
canonical_file: "0523C_WOS_MaritimeSpawnEcology_v1.2.1.md"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "BUILT_UNVERIFIED"
runtime_owner: "MaritimeSpawnEcology"
supersedes:
  - "0523C_WOS_MaritimeSpawnEcology_v1.0.0.md"
  - "0523C_WOS_MaritimeSpawnEcology_v1.1.0.md"
  - "0523C_WOS_MaritimeSpawnEcology_v1.2.0.md"
build_scope:
  - ecological zones
  - temporal ecology
  - synthetic spawn candidates
  - deterministic spawn timing
  - seeded RNG
  - synthetic ID namespace
  - rejection telemetry
do_not_build:
  - vessel motion
  - continuity mutation
  - renderer spawning
  - AIS ingestion
  - wake generation
```

## 0523D — Maritime Wake Authority

```yaml
spec_id: "0523D_WOS_MaritimeWakeAuthority"
canonical_version: "1.1.0"
canonical_file: "0523D_WOS_MaritimeWakeAuthority_v1.1.0.md"
stage: "[BUILD]"
freeze_decision: "GO"
canonical_status: "CANONICAL"
implementation_status: "BUILT_UNVERIFIED"
runtime_owner: "MaritimeWakeAuthority"
supersedes:
  - "0523D_WOS_MaritimeWakeAuthority_v1.0.0.md"
build_scope:
  - wake registry
  - ring buffer
  - deterministic emission ordering
  - wake decay
  - wake provenance
  - AIS gap handling
  - synthetic wake containment
do_not_build:
  - renderer shaders
  - vessel motion
  - AIS lifecycle mutation
  - atmospheric scoring
  - camera behavior
```

---

# Build Status Definitions

## NOT_STARTED

No implementation has begun.

## READY_TO_BUILD

Spec has:

```text
Stage: [BUILD]
Freeze Decision: GO
```

but code has not started.

## IN_PROGRESS

Implementation work has begun but has not been returned for review.

## BUILT_UNVERIFIED

Implementation was returned but uploaded source has not been fully audited.

## BUILT_VERIFIED

Implementation has passed architecture, authority, and interface review.

## PATCH_REQUIRED

Implementation exists but must be amended before downstream work proceeds.

## BLOCKED

Implementation cannot proceed due to unresolved upstream authority, schema, or determinism issue.

---

# Registry Update Rules

## Creating a New Spec

Add a registry record with:

```text
stage: [REVIEW]
freeze_decision: REVIEW
implementation_status: NOT_STARTED
```

## Advancing to Build

Update:

```text
stage: [BUILD]
freeze_decision: GO
implementation_status: READY_TO_BUILD
```

## Code Returned

Update:

```text
implementation_status: BUILT_UNVERIFIED
```

until source review confirms:

- authority boundaries preserved
- runtime ownership correct
- forbidden mutations absent
- debug APIs safe
- script order correct
- deterministic rules obeyed

## Patch Required

Update:

```text
implementation_status: PATCH_REQUIRED
```

and add RegistryIssue entries.

## Patch Passed

Update:

```text
implementation_status: BUILT_VERIFIED
```

only after validation confirms the patch.

---

# Supersession Rules

A new spec version supersedes an older version when it changes:

- blocking issue resolution
- canonical schema
- authority boundaries
- build readiness
- implementation contracts
- deterministic behavior

A newer version does NOT supersede an older version merely because it adds notes.

Supersession must be explicit.

---

# Dependency Rules

Downstream specs may depend only on canonical versions.

If a parent spec is `PATCH_REQUIRED`, downstream specs may continue review but may not move to `[BUILD]` unless the dependency is unaffected.

---

# Runtime Authority Registry

| Runtime Owner | Owns | May Not Own |
|---|---|---|
| AISRuntime | AIS truth, vessel state, lifecycle truth | renderer styling, wake visuals |
| MaritimeTaxonomyProfiles | vessel identity profiles | motion, lifecycle, importance |
| MaritimePopulationHierarchy | observability tiers, budgets, update advisories | AIS lifecycle state |
| MaritimeSpawnEcology | probabilistic presence requests | vessel motion, continuity state |
| MaritimeWakeAuthority | wake memory, wake decay, wake provenance | vessel motion, lifecycle state |
| MarineRenderer | presentation | runtime truth |
| AtmosphericReadability | visibility interpretation | vessel truth, wake truth |
| ContinuityDensity | density pressure interpretation | vessel identity |

---

# Current Open Issues

## ISSUE-0523D-001

```yaml
severity: "NON_BLOCKING"
status: "WATCH"
affected_spec: "0523D_WOS_MaritimeWakeAuthority_v1.1.0"
summary: "Wake implementation should be reviewed for v1.1.0 precision gaps: parentEvicted mutability, provenance-aware budget step, wakeClass enum mapping, wakeId collision resistance."
resolution_version: null
```

## ISSUE-0523C-001

```yaml
severity: "WATCH"
status: "OPEN"
affected_spec: "0523C_WOS_MaritimeSpawnEcology_v1.2.1"
summary: "SpawnEcology implementation summary appears correct; source audit still needed before BUILT_VERIFIED."
resolution_version: null
```

---

# Validation Checklist

- [ ] Registry contains one canonical version per spec family
- [ ] Superseded versions are explicitly marked
- [ ] Stage and Freeze Decision are separate fields
- [ ] Build status is not inferred from freeze language alone
- [ ] Parent dependencies are declared
- [ ] Downstream dependencies are declared
- [ ] Runtime owner is declared
- [ ] Build scope is explicit
- [ ] Do-not-build scope is explicit
- [ ] Open issues are tracked
- [ ] Implementation status distinguishes built from verified
- [ ] Registry updates after every review/build cycle

---

# Non-Goals

This registry does NOT:

- replace full specs
- replace source-code review
- replace runtime tests
- generate code
- define renderer behavior
- define simulation behavior
- certify legal/data-source coverage
- infer undocumented authority

---

# Implementation Guide

- **Where this goes:** `docs/_specs/wos/0523D-2_WOS_InfrastructureRegistry_v1.0.0.md`
- **What to run:** keep this registry updated after every spec review, build handoff, implementation return, and patch cycle.
- **What to expect:** a single canonical surface that prevents version drift, duplicate builds, and confusion over what is safe to send downstream.
