---
title: "WOS Color Runtime Profile Import"
filename: "0524D_WOS_ColorRuntimeProfileImport_v1.0.1.md"
version: "1.0.1"
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
  - "0524D_WOS_ColorRuntimeProfileImport_v1.0.0.md"
---

# 0524D_WOS_ColorRuntimeProfileImport_v1.0.1

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

Valid runtime profiles must originate from:

```text
0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0.md
```

Manually constructed or third-party runtime profiles are unsupported.

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

All imported profiles must pass through the following lifecycle:

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

Only the following transitions are permitted:

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
| all others | — | forbidden |

Lifecycle transitions may not be implementation-defined.

---

# 5. Canonical Import Target

The canonical intake artifact is:

```text
PALETTE_RUNTIME_PROFILE
```

Import systems may not reinterpret artifact class meaning.

---

# 6. Relationship to 0522J Runtime Intake

`0522J_WOS_ColorRuntimeIntegration_v1.0.0.md` governs:

```text
wos_palette_package
```

runtime integration.

This specification governs:

```text
PALETTE_RUNTIME_PROFILE
```

runtime intake.

Both systems coexist.

Precedence rules:

| Condition | Governing Intake Model |
|---|---|
| projection-governed runtime profile exists | this specification |
| no projection-governed runtime profile exists | `0522J` |

When a `PALETTE_RUNTIME_PROFILE` exists for a given `paletteId`, this specification takes precedence.

---

# 7. Intake Validation Doctrine

Every imported profile must undergo complete validation before runtime admission.

Validation must include:
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

## 8.1 review Intent

Profiles declaring:

```yaml
intakeIntent: "review"
```

may:
- enter review systems
- appear in tooling
- support comparison workflows
- support sandbox simulation

Profiles with `review` intent may NOT:
- activate runtime behavior
- mutate live runtime state
- bypass governance review

---

## 8.2 activate Intent

Profiles declaring:

```yaml
intakeIntent: "activate"
```

require:
- valid approval authorization
- non-stale status
- lineage validation
- successful governance validation
- runtime compatibility validation

Activation remains optional even after validation success.

WOS may still reject activation.

---

# 9. Review Stage Authority

The `reviewed` stage requires:
- human reviewer with WOS intake authority
- explicit approval to advance to `approved`
- optional review notes
- append-only review audit entry

Review may not be automated.

Profiles intended only for review may remain indefinitely in the `reviewed` stage.

---

# 10. Export Governance Enforcement

Imported profiles must contain invariant export governance fields:

```yaml
exportGovernance:
  authorityLevel: "advisory_only"
  wosRetainsFinalAuthority: true
  requiresWosReview: true
  notARuntimeCommand: true
```

If any invariant field:
- is missing
- differs
- is weakened
- is overridden

then intake must:
- fail closed
- quarantine artifact
- generate diagnostics

---

# 11. Revision Binding Validation

Imported profiles must validate complete revision binding integrity.

Required fields:

```yaml
revisionBinding:
  paletteId
  revisionId
  revisionHash
  rendererSignature
  shaderSignature
  stageTemplateRef
  deterministicParameterHash
```

Validation failures must:
- block activation
- quarantine artifact
- preserve diagnostics

---

# 12. Stale-State Enforcement

Profiles declaring:

```yaml
staleState:
  isStale: true
```

must follow intake restrictions.

| Intent | Allowed Behavior |
|---|---|
| review | allowed with warning |
| activate | blocked unless governed override exists |

---

## 12.1 Governed Override Requirements

Governed overrides require:
- explicit operator action
- override reason
- operator identity
- append-only audit entry
- expiration timestamp
- scope visibility

Maximum override duration:

```text
7 days
```

Overrides may bypass stale blocking.

Overrides may NOT:
- clear stale status
- modify lineage
- suppress diagnostics
- bypass approval validation

Overrides are exceptional, not routine.

---

# 13. Approval Validation Doctrine

Activation-intent imports require valid approval authorization.

Required payload:

```yaml
approvalAuthorization:
  governedAuthorizationToken
  approvedBy
  approvalTimestamp
  approvalScope
  approvalStatus
```

Validation must confirm:
- token exists
- token valid
- approval active
- approval not revoked
- approval scope compatible
- approval status = approved

Any failure must block activation.

---

# 14. Approval Scope Enforcement

Approval scope must match requested activation scope.

| Scope | Meaning |
|---|---|
| profile | full profile activation |
| mode | specific projection mode |
| condition | environmental condition |
| district | district-limited activation |
| session | temporary session activation |

Scope escalation is prohibited.

Example:

```text
district approval
≠
global profile activation
```

Scope mismatch must:
- fail closed
- quarantine request
- preserve runtime state

---

# 15. Lineage Validation Doctrine

Imported profiles must validate lineage integrity.

Required payload:

```yaml
lineage:
  parentArtifactId
  parentValid
  derivedFromClass
  sourceCandidatesRef
```

If:

```yaml
parentValid: false
```

then:
- review-intent import allowed with warning
- activate-intent import blocked

WOS may not silently repair lineage.

---

# 16. Source Bias Preservation

Source bias must remain visible inside WOS.

Import systems may not:
- strip provenance
- compress bias visibility
- erase limitations
- upgrade authenticity confidence

Low-diversity profiles may not silently gain authority during import.

---

# 17. Truth/Fiction Enforcement

## 17.1 Truth Mode

Truth-mode imports must preserve:

```yaml
geographicAuthenticityCertified: false
culturalAuthorityClaimed: false
```

WOS may not reinterpret plausibility as authenticity.

---

## 17.2 Fiction Mode

Fiction-mode imports must preserve:

```yaml
fictionModeActive: true
```

WOS runtime must visibly surface:

```text
FICTION MODE ACTIVE
```

when fiction overlays influence runtime presentation.

Missing Fiction declarations must block activation.

---

# 18. Runtime Compatibility Validation

Import systems must validate runtime compatibility before activation.

Validation includes:
- renderer compatibility
- shader compatibility
- runtime profile compatibility
- stage compatibility
- environment compatibility

Compatibility mismatch must:
- block activation
- preserve diagnostics
- prevent partial runtime mutation

---

# 19. Quarantine Doctrine

Invalid imports must enter quarantine.

Quarantine exists to:
- isolate invalid profiles
- preserve runtime safety
- preserve diagnostics
- preserve review survivability

Quarantine may not mutate live runtime state.

---

## 19.1 Quarantine Triggers

Quarantine triggers include:
- invalid schema
- stale activation request
- invalid approval
- scope mismatch
- missing lineage
- invalid export governance
- missing Fiction declaration
- invalid revision binding

---

## 19.2 Quarantine Persistence

Quarantined artifacts must preserve:
- original payload
- validation diagnostics
- failure reasons
- intake timestamp
- review lineage

---

## 19.3 Quarantine Remediation

Release from quarantine requires:
- authorized operator review
- remediation notes
- append-only audit entry

Released artifacts must re-enter intake at:

```text
received
```

for complete re-validation.

Quarantine release may not bypass validation stages.

If remediation is impossible:
- a new export must be generated
- original quarantined artifact remains archived

---

# 20. Runtime Cache Validation

Runtime cache entries must continuously validate authorization status.

Validation required:
- on activation
- on reconnect
- on cache refresh
- on runtime reload

Hash validity alone is insufficient.

Authorization validity must remain active.

---

# 21. Revocation Propagation Doctrine

Revocation must propagate into runtime state.

If approval is revoked:
- runtime cache invalidates
- affected profiles deactivate
- runtime reverts safely
- revocation event appends into lineage
- diagnostics generate

Revoked profiles may not remain silently active.

---

## 21.1 Revocation Communication Methods

Supported revocation detection methods:
- polling
- callback events
- TTL-based revalidation
- reconnect-cycle verification

Minimum required runtime revalidation interval:

```text
24 hours
```

If revocation communication fails:
- runtime must assume authorization may be stale
- runtime must trigger revalidation
- runtime may downgrade activation to review-only state

---

# 22. Runtime Rollback Doctrine

If runtime activation becomes invalid:
- rollback must restore verified baseline state
- rollback may not leave partial activation residue
- rollback must preserve diagnostics

Rollback safety takes priority over visual continuity.

---

## 22.1 Rollback Baseline Definition

Verified baseline state is:

```text
last successfully activated
non-revoked runtime profile
for the affected activation scope
```

If no valid prior activation exists:
- rollback restores default runtime state

Rollback scope must match revoked activation scope.

Examples:
- district revocation → district rollback only
- mode revocation → mode rollback only
- global profile revocation → global rollback

---

# 23. Partial Activation Prohibition

Profiles may not partially activate.

Example prohibited behavior:

```text
atmosphere layer activates
while lineage validation failed
```

Activation is atomic.

Either:
- validation passes completely
or:
- activation fails completely

---

# 24. Runtime Mutation Restrictions

Import systems may not:
- rewrite exported profiles
- mutate lineage
- alter source bias
- alter revision binding
- alter approval payloads

WOS may attach:
- diagnostics
- quarantine metadata
- runtime-local validation metadata

without mutating canonical export data.

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

Diagnostics must be:
- machine-readable
- human-readable
- exportable
- append-only

Minimum retention period:

```text
90 days
```

---

# 28. Acceptance Criteria

This specification is accepted only when:
- intake fails closed
- runtime sovereignty remains protected
- approval scope escalation is impossible
- stale activation requests block safely
- revocation propagates into runtime state
- runtime rollback remains safe
- quarantine preserves diagnostics
- Fiction declarations survive intake
- Truth disclaimers survive intake
- partial activation is impossible
- imported profiles remain advisory until activated

---

# 29. Non-Goals

This specification does not:
- define Projection Lab behavior
- define export serialization
- generate approval tokens
- certify geographic authenticity
- define renderer implementation
- define UI review systems
- define playlist or audio engines

---

# 30. Freeze Status

**Status:** `[FREEZE — GO]`

WOS Color Runtime Profile Import is now considered:
- constitutionally stable
- rollback-safe
- quarantine-safe
- runtime-contained
- implementation-ready

Further revisions should prioritize:
- subsystem decomposition
- runtime optimization
- telemetry tooling
- replay interoperability

rather than expanding governance density.

---

# 31. Implementation Guide

- **Where this goes:** `docs/_specs/wos/0524D_WOS_ColorRuntimeProfileImport_v1.0.1.md`
- **What to run:** implement fail-closed runtime intake validation and quarantine-safe activation against canonical `PALETTE_RUNTIME_PROFILE` artifacts.
- **What to expect:** WOS safely ingests advisory runtime profiles while preserving runtime sovereignty, rollback safety, and revocation-aware authorization governance.

