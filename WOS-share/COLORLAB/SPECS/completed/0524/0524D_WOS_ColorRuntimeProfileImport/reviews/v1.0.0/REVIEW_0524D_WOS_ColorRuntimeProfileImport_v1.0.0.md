# REVIEW: 0524D_WOS_ColorRuntimeProfileImport_v1.0.0

Reviewed against: `0524_COLORLAB_ProjectionOutputGovernance_v1.3.0`, `0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0`, `0522J_WOS_ColorRuntimeIntegration_v1.0.0`
Review date: 2026-05-24
Reviewer: Claude

---

## Overall Assessment

The most precise intake governance spec in the stack. Atomic activation, partial activation prohibition, scope escalation prohibition, and continuous authorization validation are all correctly stated and enforceable. The intake lifecycle state machine is the right model and the stage-skipping prohibition is the right constraint. Issues are few and concentrated in structural completeness gaps rather than conceptual problems.

---

## Issues

### 1. Intake Lifecycle Has No Transition Rules

Eight stages are defined. "Profiles may not skip stages" is stated. Which transitions are permitted is undefined — the same gap that existed in the core governance spec until v1.3.0 resolved it with a transition matrix.

Missing answers: Can a `quarantined` profile return to `validated` or must it restart at `received`? Can `approved` transition to `archived` without `activated`? Can `revoked` transition to anything?

**Recommendation:** Add a transition matrix:

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

---

### 2. Canonical Intake Result Is a Snapshot, Not a Schema

The example is a valid failure case but missing fields required for governance completeness:
- No `intakeId` — no stable identity for audit trail reference
- No `profileRef` — no reference to which profile was imported
- No `timestamp` — no provenance anchor for the intake event
- No `intakeStage` — current lifecycle stage not recorded
- No `validationDetails` — which step failed is implied, not structured

**Recommendation:** Define a complete intake result schema: `intakeId`, `profileRef`, `timestamp`, `intakeStage`, `intakeAccepted`, `activationGranted`, `quarantined`, `quarantineReason`, `runtimeStateMutated`, `validationDetails`.

---

### 3. Relationship to `0522J` Runtime Cache Model Unresolved

`0522J` defined a `runtimeIntakeId` and cache record for `wos_palette_package` intake. This spec defines a new lifecycle and result structure for `PALETTE_RUNTIME_PROFILE` intake. Both govern WOS intake of Colorlab color data. Without reconciliation, WOS implementations will have two competing intake models.

The `0522J` `authorityClass: "runtime_local_interpretation"` field has no equivalent here.

**Recommendation:** Add a relationship section: this spec governs Projection Lab-evaluated palette intake. `0522J` governs generic `wos_palette_package` intake. Both coexist. When a `PALETTE_RUNTIME_PROFILE` exists for a given `paletteId`, this spec's intake rules take precedence for that palette. For palettes without projection evaluation, `0522J` applies.

---

### 4. Rollback Baseline Undefined

"Rollback must restore verified baseline state" — the spec does not define what baseline means:
- State before current activation?
- Last approved non-revoked activation for this scope?
- Empty/default state if no prior activation exists?
- Scoped to the approval scope of the revoked profile?

Without definition, rollback behavior is implementation-dependent.

**Recommendation:** Define the baseline: the verified baseline is the last successfully `activated` and non-revoked profile state for the affected runtime scope. If no prior activation exists, rollback produces an empty/default state. Rollback scope matches the approval scope of the revoked profile — a district-scoped revocation rolls back the district, not the global runtime.

---

### 5. Quarantine Remediation Path Absent

The spec places profiles in quarantine but defines no path out. Who may release a quarantined profile? What corrective action is required? Does the original profile re-enter at `received` or must a new export be generated? Is there a retention limit before archival?

**Recommendation:** Add a quarantine remediation clause: release requires authorized operator review. Release returns the profile to `received` for re-validation. If the original profile cannot be remediated, a new export must be generated. Profiles not remediated within an implementation-defined retention period must transition to `archived`.

---

## Minor Notes

**Partial Activation Prohibition** — "activation is atomic" is precisely stated. No issues.

**Source Bias Preservation** — "import systems may not upgrade authenticity confidence" is the right constraint, well-held.

**`audio_hint`** — this spec correctly makes no reference to audio. If `audio_hint` is removed from the export schema, no change needed here.

**Runtime compatibility validation** — listed but not expanded. A future note: minor vs. major renderer version mismatch semantics would benefit from explicit severity rules.

---

## Summary

| Issue | Risk | Type |
|---|---|---|
| Lifecycle transition rules undefined — "no skipping" unenforceable | High | Governance gap |
| Canonical intake result missing identity, reference, timestamp, stage fields | Medium | Provenance gap |
| Relationship to `0522J` intake model unresolved | Medium | Interoperability gap |
| Rollback baseline undefined | Medium | Enforcement gap |
| Quarantine remediation path absent | Medium | Lifecycle completeness |

---

## Overall

The foundational doctrine is the best in the WOS-side specs: atomic activation, continuous authorization validation, scope escalation prohibition, and runtime sovereignty are all precisely held. The lifecycle transition matrix is the highest-priority fix — it makes every other lifecycle rule enforceable. The intake result schema and `0522J` reconciliation are the next priorities before WOS intake adapter implementation begins.
