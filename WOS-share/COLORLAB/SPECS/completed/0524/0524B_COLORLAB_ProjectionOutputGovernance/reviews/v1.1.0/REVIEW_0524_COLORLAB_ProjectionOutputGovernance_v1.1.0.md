# REVIEW: 0524_COLORLAB_ProjectionOutputGovernance_v1.1.0

Reviewed against: Full Colorlab governance stack, `0524_COLORLAB_ProjectionLabDoctrine_v1.0.0`
Prior review: `0524_COLORLAB_ProjectionOutputGovernance_v1.0.0`
Review date: 2026-05-24
Reviewer: Claude

---

## Delta Assessment vs v1.0.0

Every issue from the prior review resolved:

| Prior Issue | v1.1.0 Resolution |
|---|---|
| Artifact classes named but not defined | Full definitions with required fields, allowed/forbidden systems, may/may never constraints |
| Revision staleness no detection or handling | Section 6: full stale conditions, severity rules, export restrictions |
| Approval path undefined | Sections 7.2–7.5: approval path, artifact requirements, prohibition on automated approval |
| Truth/Fiction mode governance single sentences | Sections 8 and 9: required payloads, artifact restrictions, runtime visibility requirements |
| Source bias no payload definition | Section 10: full source_bias block with vocabulary, diversity, limitation statement |
| Export payload undefined | Section 12: export governance block, fail-closed intake validation |
| Acceptance criteria not linked to rules | Section 18: expanded criteria referencing specific field requirements |

This is a complete constitutional document. The pattern of required fields + may/may never constraints applied consistently across all four artifact classes is governance infrastructure, not governance intent.

---

## Remaining Issues

### 1. `PALETTE_RUNTIME_PROFILE` Approval Gate Has a Timing Gap

Section 7.4 defines the approval artifact with `approval_status: "approved"`. Section 3.3 shows the `PALETTE_RUNTIME_PROFILE` with `governed_authorization_token: null` and `approval_status` absent from the required fields. A profile can be created and exported without an approval token — the approval fields are nullable by default.

The fail-closed intake validation (Section 12.3) requires an "approval token missing for activation" to block — but the trigger is *activation*, not *export*. A `PALETTE_RUNTIME_PROFILE` with null approval fields can be exported and enter the WOS intake queue in an unapproved state. The distinction between "exported for review" and "exported for activation" is not defined in the intake payload.

**Recommendation:** Add an `intake_intent` field to the `PALETTE_RUNTIME_PROFILE` with values `review` and `activate`. Intake validation checks approval token only when `intake_intent: activate`. This makes the two-phase flow (export for review → approve → export for activation) explicit in the payload rather than implicit in process.

---

### 2. Approval Scope Is Defined But Not Enforced at Intake

Section 7.4 defines `approval_scope` with values `profile | mode | condition | district | session`. A narrow approval (e.g., `mode: fiction` for a specific district) could be structurally indistinguishable from a broad approval (`profile`) in the payload as written — both produce the same approval artifact structure, just with different scope values.

If a system reads an approval token and doesn't validate scope, a district-scoped approval silently becomes a profile-wide approval. The fail-closed intake requires the approval token to exist but doesn't require scope validation.

**Recommendation:** Add to the intake validation checklist: approval scope must match the requested activation scope. An approval scoped to `district: "midtown"` must block activation for `district: "downtown"` even if the token is valid.

---

### 3. `REPLAY_SNAPSHOT` Lineage Participation Is "Yes" But No Lineage Fields Are Defined

Three artifact classes declare `Lineage Participation: Yes` — `SAVED_PROJECTION_REPORT`, `PALETTE_RUNTIME_PROFILE`, and `REPLAY_SNAPSHOT`. But none of their required field schemas include a `parentArtifactId`, `source_report_ref`, or equivalent lineage field.

The governance stack consistently uses `source_candidates_ref` and `parentRevisionId` to make lineage traversable. Projection artifacts declaring lineage participation without lineage fields cannot participate in lineage traversal — the declaration is aspirational.

**Recommendation:** Add a `lineage` block to the required fields for each artifact that declares lineage participation:

```yaml
lineage:
  parent_artifact_id: "projection-report-id or null"
  derived_from_class: "SAVED_PROJECTION_REPORT | PALETTE_RUNTIME_PROFILE | null"
  source_candidates_ref: "sc_0001"
```

---

### 4. Canonical Output Schema Is a `SAVED_PROJECTION_REPORT` — `PALETTE_RUNTIME_PROFILE` Has No Example

Section 17 provides a canonical JSON schema for `SAVED_PROJECTION_REPORT`. This is the most complete payload example in any spec in the stack — the `modeContext`, `sourceBias`, `exportGovernance`, and `approvalAuthorization` blocks are all governance-complete.

`PALETTE_RUNTIME_PROFILE` has no canonical schema. It is the export artifact that WOS actually consumes — the one with the highest governance risk and the most downstream consequences. Without a canonical schema, WOS intake adapter implementation will be defined by whatever the first implementer produces.

**Recommendation:** Add a second canonical schema for `PALETTE_RUNTIME_PROFILE`, specifically including the runtime role recommendations from the Projection Lab Doctrine (Section 9 of that spec) and showing how they are marked advisory within the payload.

---

### 5. Approval Revocation Has No Defined WOS Cache Effect

Section 15.2 states approval revocation appends a revocation record and marks the profile inactive. What happens in WOS if a revoked profile is already active in a runtime cache?

The WOS integration spec defines cache invalidation as a required behavior when content hashes change. Approval revocation is a different trigger — the content hash may be identical but the authorization is withdrawn. WOS runtime caches don't currently have an authorization validity check, only a hash validity check.

**Recommendation:** Add a clause: approval revocation must produce a revocation event that WOS intake is required to propagate to active caches. A cache entry associated with a revoked approval must be marked invalid and not served as an active palette source, even if the content hash is still valid.

---

### 6. Canonical Governance Vocabulary Has No Cross-Reference Guard

Section 16 defines the canonical governance vocabulary and states "downstream systems may not redefine these terms." This is the right constraint. But there is no mechanism for detecting redefinition — if a downstream spec uses "recommendation" to mean something different, this section cannot enforce consistency.

**Recommendation:** Each downstream spec listed in Section 20 should include a statement that it adopts this vocabulary without redefinition, and should cross-reference Section 16 explicitly.

---

## Minor Notes

**`session_scoped` persistence class** — defined in the persistence classes table but no artifact class uses it. Either define which artifact class may use `session_scoped` persistence, or note it as a reserved class for future use.

**Section 14 Runtime Security Constraints** — "Projection systems may not possess metadata write credentials" is a deployment constraint, not a spec constraint. It belongs in an operational security or deployment guide rather than a governance spec. Harmless but slightly outside scope.

**`plausibilityIndex: 0.78`** in the canonical schema — a numeric float appears without a defined scale. The intelligence spec used ordinal labels (low/medium/high). Define the numeric scale or align with the ordinal system used elsewhere in the stack.

---

## Summary

| Issue | Risk | Type |
|---|---|---|
| Approval gate enforced at activation not export — review/activate phases undefined in payload | Medium | Authority boundary |
| Approval scope not validated at intake — narrow approval silently broadens | Medium | Enforcement gap |
| Lineage participation declared but no lineage fields in required schemas | Medium | Lineage integrity |
| `PALETTE_RUNTIME_PROFILE` has no canonical schema | Medium | Implementation clarity |
| Approval revocation has no defined WOS cache effect | Medium | Runtime enforcement |
| Governance vocabulary has no cross-reference guard | Low | Semantic consistency |
| `session_scoped` class unused — no artifact owner | Low | Schema completeness |
| `plausibilityIndex` scale undefined | Low | Semantic clarity |

---

## Overall

v1.1.0 is the most complete governance spec in the Projection Lab series. The four artifact classes are fully defined with required fields, constraint pairs, and allowed/forbidden system lists — this is the enforcement infrastructure that v1.0.0 lacked entirely. The approval lineage doctrine, stale severity matrix, and Fiction mode declaration requirements are all implementation-ready. The remaining issues are boundary refinements rather than structural gaps: the approval timing gap (Issue 1) and the missing `PALETTE_RUNTIME_PROFILE` schema (Issue 4) are the two worth closing before downstream specs are written against this document.
