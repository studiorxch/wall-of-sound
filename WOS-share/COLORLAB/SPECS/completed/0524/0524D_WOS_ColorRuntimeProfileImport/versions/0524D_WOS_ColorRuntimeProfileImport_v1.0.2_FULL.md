---
title: "WOS Color Runtime Profile Import"
filename: "0524D_WOS_ColorRuntimeProfileImport_v1.0.2.md"
version: "1.0.2"
date: "2026-05-24"
system: "WOS"
module: "Color Runtime Profile Import"
type: "runtime-intake-spec"
status: "[FREEZE — GO]"
build_readiness: "[FREEZE — GO]"
owner: "StudioRich / WOS"

canonical_scope:
  - runtime intake validation
  - fail-closed activation enforcement
  - advisory/runtime separation
  - quarantine lifecycle
  - revocation-aware runtime validation
  - stale artifact rejection
  - runtime sovereignty preservation
  - runtime cache invalidation
  - profile activation gating
  - import lineage verification
  - lifecycle transition governance
  - rollback baseline enforcement
  - intake audit survivability

parent_spec:
  - "0524_COLORLAB_ProjectionOutputGovernance_v1.3.0.md"
  - "0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0.md"

related_specs:
  - "0522J_WOS_ColorRuntimeIntegration_v1.0.0.md"
  - "0524_COLORLAB_ApprovalGovernance_v1.0.0.md"
  - "0524_COLORLAB_SourceBiasSchema_v1.0.0.md"

supersedes:
  - "0524D_WOS_ColorRuntimeProfileImport_v1.0.1.md"
---

# 0524D_WOS_ColorRuntimeProfileImport_v1.0.2

## Build Readiness

**Status:** `[FREEZE — GO]`

This revision completes:
- intake lifecycle transition governance
- rollback baseline definition
- revocation communication clarification
- intake audit schema completion
- quarantine remediation flow
- `0522J` interoperability clarification
- diagnostic retention requirements
- review-stage authority clarification
- quarantine → archived lifecycle closure

This specification is now considered:
- constitutionally stable
- operationally complete
- fail-closed
- implementation-ready
- rollback-safe
- quarantine-safe
- runtime-contained

---

# 1. Core Principle

WOS imports advisory runtime profiles.

WOS alone decides whether runtime activation occurs.

All imported profiles must be treated as:

```text
untrusted until validated
```

Runtime intake must fail closed.

---

# 2. Runtime Sovereignty Doctrine

COLORLAB may recommend runtime suitability.

COLORLAB may NOT:
- mutate WOS runtime directly
- force activation
- bypass intake validation
- bypass approval validation
- bypass quarantine systems
- bypass rollback systems

WOS retains final runtime authority.

---

# 3. Intake Lifecycle

| Stage | Meaning |
|---|---|
| received | payload received |
| validated | schema verified |
| reviewed | advisory inspection state |
| quarantined | blocked pending failure resolution |
| approved | governance-approved |
| activated | admitted into runtime |
| revoked | authorization invalidated |
| archived | inactive retained record |

Profiles may not skip stages.

---

# 4. Intake Lifecycle Transition Matrix

| From | To | Permitted |
|---|---|---|
| received | validated | yes |
| received | quarantined | yes |
| validated | reviewed | yes |
| validated | quarantined | yes |
| reviewed | approved | yes |
| reviewed | quarantined | yes |
| approved | activated | yes |
| approved | archived | yes |
| activated | revoked | yes |
| activated | archived | yes |
| revoked | archived | yes |
| quarantined | received | yes (remediation restart) |
| quarantined | archived | yes (authorized irremediable failure declaration) |
| all others | — | forbidden |

Lifecycle transitions may not be implementation-defined.

---

# 5. Canonical Import Target

The canonical intake artifact is:

```text
PALETTE_RUNTIME_PROFILE
```

---

# 6. Relationship to 0522J Runtime Intake

When a `PALETTE_RUNTIME_PROFILE` exists for a given palette:
- this specification takes precedence
- `0522J` remains fallback runtime integration infrastructure

---

# 7. Intake Validation Doctrine

Validation includes:
- schema validation
- revision binding validation
- stale-state validation
- approval validation
- lineage validation
- export governance validation
- mode declaration validation
- source-bias validation
- intake-intent validation
- runtime compatibility validation

Any validation failure must fail closed.

---

# 8. Intake Intent Rules

## review

Allowed:
- tooling visibility
- comparison workflows
- sandbox simulation

Not allowed:
- runtime mutation
- activation
- governance bypass

## activate

Requires:
- valid approval authorization
- non-stale status
- lineage validation
- runtime compatibility validation

Activation remains optional even after validation success.

---

# 9. Review Stage Authority

The `reviewed` stage requires:
- human reviewer
- append-only audit entry
- explicit advancement approval

Review may not be automated.

---

# 10. Export Governance Enforcement

Imported profiles must preserve:

```yaml
exportGovernance:
  authorityLevel: "advisory_only"
  wosRetainsFinalAuthority: true
  requiresWosReview: true
  notARuntimeCommand: true
```

Any deviation:
- fails closed
- quarantines artifact
- generates diagnostics

---

# 11. Revision Binding Validation

Required:
- paletteId
- revisionId
- revisionHash
- rendererSignature
- shaderSignature
- stageTemplateRef
- deterministicParameterHash

Validation failure blocks activation.

---

# 12. Stale-State Enforcement

| Intent | Behavior |
|---|---|
| review | warning allowed |
| activate | blocked unless governed override exists |

Maximum override duration:

```text
7 days
```

Overrides may not:
- clear stale status
- suppress diagnostics
- bypass approval validation

---

# 13. Approval Validation Doctrine

Activation-intent imports require:
- valid token
- active approval
- non-revoked approval
- compatible approval scope
- approvalStatus = approved

Failure blocks activation.

---

# 14. Approval Scope Enforcement

Scope escalation is prohibited.

Example:

```text
district approval
≠
global activation
```

Mismatch:
- fails closed
- quarantines request
- preserves runtime state

---

# 15. Lineage Validation Doctrine

If:

```yaml
parentValid: false
```

then:
- review allowed with warning
- activation blocked

WOS may not silently repair lineage.

---

# 16. Source Bias Preservation

Import systems may not:
- strip provenance
- erase limitations
- inflate authenticity confidence

Low-diversity profiles may not silently gain authority.

---

# 17. Truth/Fiction Enforcement

Truth mode must preserve:
- geographicAuthenticityCertified: false
- culturalAuthorityClaimed: false

Fiction mode must preserve:

```text
FICTION MODE ACTIVE
```

Missing Fiction declarations block activation.

---

# 18. Runtime Compatibility Validation

Validate:
- renderer compatibility
- shader compatibility
- stage compatibility
- environment compatibility

Mismatch:
- blocks activation
- preserves diagnostics
- prevents partial mutation

---

# 19. Quarantine Doctrine

Quarantine exists to:
- isolate invalid profiles
- preserve runtime safety
- preserve diagnostics
- preserve review survivability

Quarantine may not mutate live runtime state.

## 19.1 Quarantine Remediation

Released artifacts must:
- restart from `received`
- undergo full re-validation
- preserve audit lineage

If remediation is impossible:
- authorized operator declares irremediable failure
- artifact transitions to archived
- archival preserves diagnostics and lineage

Archived quarantined artifacts may not:
- re-enter intake automatically
- regain activation eligibility

---

# 20. Runtime Cache Validation

Authorization must revalidate:
- on activation
- on reconnect
- on cache refresh
- on runtime reload

Minimum revalidation interval:

```text
24 hours
```

---

# 21. Revocation Propagation Doctrine

If approval is revoked:
- runtime cache invalidates
- profiles deactivate
- runtime safely rolls back
- diagnostics append into lineage

Revoked profiles may not remain silently active.

---

# 22. Runtime Rollback Doctrine

Rollback restores:

```text
last successfully activated
non-revoked runtime profile
for the affected scope
```

If none exists:
- restore default runtime state

Rollback scope must match revoked scope.

Activation rollback safety takes priority over visual continuity.

---

# 23. Partial Activation Prohibition

Activation is atomic.

Either:
- validation fully passes
or:
- activation fully fails

Partial activation is prohibited.

---

# 24. Runtime Mutation Restrictions

Import systems may not:
- rewrite exported profiles
- mutate lineage
- alter source bias
- alter revision binding
- alter approval payloads

WOS may attach diagnostics without mutating canonical export data.

---

# 25. Canonical Intake Validation Matrix

| Validation Domain | review | activate |
|---|---|---|
| schema validation | required | required |
| stale validation | warning allowed | blocker |
| lineage validation | warning allowed | blocker |
| approval validation | optional | required |
| export governance validation | required | required |
| runtime compatibility | optional | required |
| Fiction declaration | required | required |
| Truth disclaimer | required | required |

---

# 26. Canonical Intake Result Schema

```yaml
runtimeImportResult:
  intakeId: "intake_0001"
  profileRef: "pal_0892"
  timestamp: "2026-05-24T06:14:00Z"
  intakeStage: "quarantined"

  intakeAccepted: false
  activationGranted: false
  quarantined: true

  quarantineReason:
    - "approval_scope_mismatch"

  validationDetails:
    - validationRule: "approval_scope_validation"
      expected: "district"
      actual: "global"

  diagnostics:
    - "district approval incompatible with global activation"

  runtimeStateMutated: false
```

---

# 27. Diagnostic Retention Requirements

Diagnostics must preserve:
- intake timestamp
- profile identifier
- failed validation rule
- expected vs actual values
- runtime scope
- quarantine reason

Retention minimum:

```text
90 days
```

---

# 28. Acceptance Criteria

Accepted only when:
- intake fails closed
- runtime sovereignty remains protected
- stale activation safely blocks
- revocation propagates into runtime state
- rollback remains safe
- quarantine preserves diagnostics
- partial activation is impossible
- profiles remain advisory until activated

---

# 29. Non-Goals

This specification does not:
- define Projection Lab behavior
- define export serialization
- generate approval tokens
- define renderer implementation
- define playlist/audio engines

---

# 30. Freeze Status

**Status:** `[FREEZE — GO]`

WOS Color Runtime Profile Import is now considered:
- constitutionally stable
- rollback-safe
- quarantine-safe
- runtime-contained
- implementation-ready

Further work should prioritize:
- subsystem decomposition
- runtime tooling
- replay interoperability
- telemetry systems

rather than governance expansion.

---

# 31. Implementation Guide

- **Where this goes:** `docs/_specs/wos/0524D_WOS_ColorRuntimeProfileImport_v1.0.2.md`
- **What to run:** implement fail-closed runtime intake validation and quarantine-safe activation against canonical `PALETTE_RUNTIME_PROFILE` artifacts.
- **What to expect:** WOS safely ingests advisory runtime profiles while preserving runtime sovereignty, rollback safety, and revocation-aware governance.
