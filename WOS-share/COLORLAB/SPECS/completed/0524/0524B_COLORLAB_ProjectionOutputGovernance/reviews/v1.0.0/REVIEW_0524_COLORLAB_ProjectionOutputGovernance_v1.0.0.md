# REVIEW: 0524_COLORLAB_ProjectionOutputGovernance_v1.0.0

Reviewed against: `0524_COLORLAB_ProjectionLabDoctrine_v1.0.0`, full Colorlab governance stack (`0522A` through `0522J`)
Review date: 2026-05-24
Reviewer: Claude

---

## Overall Assessment

This document correctly identifies the right governance territory — the gap between Projection Lab interpretation and WOS runtime authority. The core principle ("Projection Lab may recommend. Projection Lab may not approve.") is precise and the right load-bearing statement for this layer. However, the document is currently an outline, not a specification. Every section states a conclusion without defining the rules that enforce it. As written, it provides governance intent but not governance infrastructure.

---

## Issues

### 1. Artifact Classes Are Named But Not Defined

The four artifact classes — `TRANSIENT_PROJECTION`, `SAVED_PROJECTION_REPORT`, `PALETTE_RUNTIME_PROFILE`, `REPLAY_SNAPSHOT` — are listed without definition. For each, the spec needs to declare:

- What fields are required
- What persistence class it must carry
- What systems may read it
- What systems may not write to it
- Whether it participates in lineage

Without definitions, implementers will construct these artifact classes independently. The classes will diverge and cross-contaminate — `SAVED_PROJECTION_REPORT` records will acquire runtime authority through informal use, `PALETTE_RUNTIME_PROFILE` payloads will be treated as approvals.

**Recommendation:** Each artifact class requires a minimum schema and a "may / may never" constraint pair, following the pattern established across the prior specs. The detailed version shared in the conversation contained these definitions — they should be incorporated as the normative content of this spec.

---

### 2. Revision Binding States Requirements Without Enforcement Rules

The Revision Binding section correctly requires outputs to bind to palette revision, renderer version, shader version, and parameter hash. But it does not state:

- What happens when a bound revision is superseded
- Whether stale projection outputs must be flagged or quarantined
- Whether a `PALETTE_RUNTIME_PROFILE` bound to a retired revision can still be exported

The Acceptance Criteria states "stale outputs are detectable" — but the spec provides no mechanism for detection or handling. Without staleness rules, bound revisions become decorative metadata rather than enforced constraints.

**Recommendation:** Add a staleness doctrine: a projection artifact is stale when its bound `revision_id` no longer refers to an active revision. Stale artifacts must surface an explicit indicator. `PALETTE_RUNTIME_PROFILE` exports from stale artifacts must be blocked or require explicit override with audit trail.

---

### 3. Recommendation vs Approval Has No Approval Path Defined

The distinction between recommendation and approval is the most important governance boundary in this spec. The section states approval requires "human review, audit trail, governed authorization" — but does not define:

- What system performs approval
- Where the audit trail is stored
- What constitutes "governed authorization" in the Colorlab model
- Whether approval produces a new artifact type or modifies an existing one

Without a defined approval path, the recommendation/approval distinction will collapse in practice. Systems that want to act on projection outputs will find no governed approval mechanism and route around it.

**Recommendation:** Define the approval mechanism explicitly: approval is a governed metadata action performed through the Metadata System (or a future dedicated approval system), producing a versioned approval record linked to the `PALETTE_RUNTIME_PROFILE`. Until an approval record exists, WOS must treat all projection outputs as unapproved advisory signals.

---

### 4. Truth Mode and Fiction Mode Governance Are Single Sentences

Both Truth mode governance ("Truth mode evaluates plausibility only. Truth mode does not certify geographic authenticity.") and Fiction mode governance ("Fiction mode must remain visibly declared.") are correct but unenforceable as stated.

Truth mode governance needs: who evaluates plausibility, what outputs a Truth evaluation produces, and what prevents a high-plausibility score from being treated as certification.

Fiction mode governance needs: where the declaration is stored, what field carries it, and what blocks Fiction-mode activation in WOS when the declaration is absent.

These were the two most critical issues in the Projection Lab Doctrine review. This spec was written to address them — but the current content defers them rather than resolving them.

**Recommendation:** Incorporate the enforcement mechanisms from the detailed version: `projectionMode: "fiction"` as a required payload field, Truth mode output typed as `SAVED_PROJECTION_REPORT` (advisory) not `PALETTE_RUNTIME_PROFILE` (exportable), and explicit validation requirements that block export when these fields are absent.

---

### 5. Source Bias Doctrine Has No Payload Definition

"Source bias must be machine-readable" is the correct requirement. The field definition is absent. Without a `sourceBias` block in the artifact schema, this requirement cannot be implemented or validated.

**Recommendation:** Define the minimum `sourceBias` block as part of the `SAVED_PROJECTION_REPORT` and `PALETTE_RUNTIME_PROFILE` schemas:

```yaml
source_bias:
  sample_count: 1
  extraction_context:
    time_of_day: "night"
    weather: "unknown"
  bias_confidence: low | medium | high
  bias_flags:
    - single_image_source
    - commercial_styling
```

---

### 6. Export Authority Section Does Not Define Export Payload

"Projection exports are advisory payloads only. WOS retains final runtime authority." — correct doctrine, no payload definition. The Export System spec's `wos_palette_package` is the existing export mechanism. This spec should define whether `PALETTE_RUNTIME_PROFILE` exports extend, replace, or wrap that package type, and what fields are required for WOS intake validation.

---

### 7. Acceptance Criteria Are Not Linked to Enforceable Rules

The Acceptance Criteria list six conditions. None of them are linked to validation rules, payload fields, or system behaviors defined in this document. Acceptance criteria that exist without corresponding enforcement mechanisms are aspirational statements, not governance.

**Recommendation:** Each acceptance criterion should reference a specific section, field, or validation rule in this spec. If the rule doesn't exist yet, the criterion is a gap indicator, not a satisfied condition.

---

## Summary

| Issue | Risk | Type |
|---|---|---|
| Artifact classes named but not defined | High | Governance infrastructure |
| Revision staleness has no detection or handling rules | High | Enforcement gap |
| Approval path undefined — recommendation/approval distinction collapses | High | Authority boundary |
| Truth mode and Fiction mode governance remain single sentences | High | Enforcement gap |
| Source bias doctrine has no payload definition | Medium | Provenance gap |
| Export payload not defined | Medium | Implementation clarity |
| Acceptance criteria not linked to enforceable rules | Medium | Validation gap |

---

## Overall

This spec is a correct outline of the right governance territory. The core principle is sound, the artifact classification is the right model, and the acceptance criteria identify the right conditions. What's missing is the normative content that turns each section header into enforceable infrastructure. The detailed version shared in the conversation contains that content — the path to `[BUILD]` status is incorporating those definitions into this document as the canonical spec body. Until then, this is governance intent without governance mechanism.
