---
title: "COLORLAB Palette Runtime Profile Export"
filename: "0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0.md"
version: "1.0.0"
date: "2026-05-24"
system: "COLORLAB"
module: "Palette Runtime Profile Export"
type: "export-spec"
status: "[REVIEW]"
build_readiness: "[REVIEW]"
owner: "StudioRich / WOS"
parent_spec:
  - "0524_COLORLAB_ProjectionOutputGovernance_v1.3.0.md"
  - "0524_COLORLAB_ProjectionLabDoctrine_v1.0.0.md"
related_specs:
  - "0524_WOS_ColorRuntimeProfileImport_v1.0.0.md"
  - "0524_COLORLAB_SourceBiasSchema_v1.0.0.md"
  - "0524_COLORLAB_ApprovalGovernance_v1.0.0.md"
---

# 0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0

## Build Readiness

**Status:** `[REVIEW]`

This specification defines the COLORLAB-side export contract for `PALETTE_RUNTIME_PROFILE` artifacts.

It governs how Colorlab serializes palette projection recommendations into advisory runtime profile payloads for downstream WOS review.

This specification does not define WOS runtime intake behavior. WOS import, quarantine, activation, and runtime enforcement are owned by:

`0524_WOS_ColorRuntimeProfileImport_v1.0.0.md`

---

# 1. Purpose

The Palette Runtime Profile Export system converts governed Projection Lab evaluation results into exportable advisory payloads.

It exists to answer:

> How does Colorlab safely package palette runtime suitability guidance without creating runtime authority?

The export system must preserve:
- advisory-only semantics
- lineage
- revision binding
- source bias
- stale-state visibility
- approval status
- intake intent
- mode declarations
- runtime role recommendations

The export system must never create direct runtime authority.

---

# 2. Core Doctrine

Colorlab exports advisory profiles.

Colorlab does not activate runtime behavior.

A `PALETTE_RUNTIME_PROFILE` is:

```text
advisory runtime suitability payload
```

It is NOT:
- a runtime command
- an approval token
- an activation request by default
- a WOS state mutation
- a geographic truth claim
- a deployment package

---

# 3. Authority Boundary

| Layer | Authority |
|---|---|
| Colorlab Projection Lab | generates evaluation results |
| Palette Runtime Profile Export | serializes advisory payloads |
| Approval Governance | records governed authorization |
| WOS Import | validates and enforces runtime intake |
| WOS Runtime | owns final runtime behavior |

Colorlab export may declare:

```yaml
intake_intent: "review"
```

Colorlab export may only declare:

```yaml
intake_intent: "activate"
```

when a valid approval authorization payload exists.

Even then, WOS retains final runtime authority.

---

# 4. Export Artifact

The export artifact class is:

```text
PALETTE_RUNTIME_PROFILE
```

This artifact must conform to the governance requirements established in:

`0524_COLORLAB_ProjectionOutputGovernance_v1.3.0.md`

---

# 5. Required Export Payload

Every exported runtime profile must include:

- `artifactClassification`
- `persistenceClass`
- `intakeIntent`
- `revisionBinding`
- `runtimeRoleRecommendation`
- `modeContext`
- `sourceBias`
- `staleState`
- `exportGovernance`
- `approvalAuthorization`
- `lineage`

Any profile missing these blocks is invalid.

---

# 6. Intake Intent Export Rules

## 6.1 Default Intent

If no intake intent is explicitly requested, Colorlab must export:

```yaml
intakeIntent: "review"
```

This is the default and safest export posture.

## 6.2 Review Intent

`review` means:

- advisory intake only
- no runtime activation
- approval token not required
- WOS may inspect but not activate directly

## 6.3 Activate Intent

`activate` means:

- activation requested
- approval token required
- approval scope required
- approval status must equal `approved`
- WOS still validates and may reject

Colorlab may not export `activate` if:

- approval token is missing
- approval status is not `approved`
- approval scope is absent
- stale state is blocking
- required Fiction/Truth declarations are missing

---

# 7. Runtime Role Recommendation Vocabulary

Runtime role recommendations must use canonical role keys.

## 7.1 Canonical Role Keys

| Role | Meaning |
|---|---|
| base | primary canvas, land, water, or major map surface |
| accent | highlights, signage, route emphasis, visual spikes |
| atmosphere | haze, fog, glow, lighting wash |
| route | path lines, navigation traces, motion corridors |
| ui | panels, labels, cards, control overlays |
| event | temporary event-level visual treatment |
| weather | weather-response layer |
| time | time-of-day modifier |
| reference_overlay | cultural or media reference layer |
| fiction_override | declared stylized world overlay |
| audio_hint | advisory sonic association only |

## 7.2 Recommendation Values

| Value | Meaning |
|---|---|
| high | strong suitability signal |
| medium | moderate suitability signal |
| low | weak or conflicting suitability signal |
| blocked | known unsafe or invalid role use |
| unknown | insufficient evidence |

Recommendation values are advisory only.

No recommendation value authorizes runtime activation.

---

# 8. Mode Context Export Rules

Every export must declare its mode context.

Supported modes:

- truth
- mood
- reference
- fiction

## 8.1 Truth Mode Export

Truth-mode exports must include:

```yaml
modeContext:
  evaluationMode: "truth"
  authorityClass: "plausibility_assessment"
  geographicAuthenticityCertified: false
  culturalAuthorityClaimed: false
```

Truth-mode exports may not claim geographic certification.

## 8.2 Fiction Mode Export

Fiction-mode exports must include:

```yaml
modeContext:
  evaluationMode: "fiction"
  authorityClass: "transient_stylization_overlay"
  fictionModeActive: true
```

Fiction-mode declarations must survive all export paths.

## 8.3 Mood Mode Export

Mood-mode exports must include:

```yaml
modeContext:
  evaluationMode: "mood"
  authorityClass: "emotional_atmosphere_assessment"
  geographicAuthenticityCertified: false
  culturalAuthorityClaimed: false
```

Mood-mode exports may influence recommendations but may not assert truth.

## 8.4 Reference Mode Export

Reference-mode exports must include:

```yaml
modeContext:
  evaluationMode: "reference"
  authorityClass: "cultural_reference_assessment"
  geographicAuthenticityCertified: false
  culturalAuthorityClaimed: false
```

Reference-mode exports may cite source style but may not claim cultural authority.

---

# 9. Source Bias Preservation

Source bias must remain machine-readable in every export.

The export system may not compress away provenance.

Required payload:

```yaml
sourceBias:
  sampleCount: 1
  sourceType: "single_image"
  extractionContext:
    timeOfDay: "night"
    weather: "rain"
    sourceMedium: "found_photo"
  sourceDiversity:
    level: "low"
  knownBiases:
    - "commercial_styling"
    - "compression_artifacts"
  limitationStatement: "single signage extraction only"
```

Low-diversity or high-bias source profiles must remain visible downstream.

---

# 10. Revision Binding Preservation

Exports must preserve complete revision binding.

Required payload:

```yaml
revisionBinding:
  paletteId: "pal_0892"
  revisionId: "rev_0003"
  revisionHash: "sha256..."
  rendererSignature: "renderer_v1.4.0"
  shaderSignature: "shader_v1.2.0"
  stageTemplateRef: "projection_stage_template_v1.0.0"
  deterministicParameterHash: "sha256..."
```

Exports may not use floating references to current palette state.

---

# 11. Stale State Export Rules

Exports must include stale-state visibility.

Required payload:

```yaml
staleState:
  isStale: false
  staleReason: null
  staleDetectedAt: null
```

If a profile is stale, export behavior depends on intake intent:

| Intake Intent | Stale Export Behavior |
|---|---|
| review | allowed with visible stale flag |
| activate | blocked unless governed override exists |

---

# 12. Approval Authorization Export Rules

Approval authorization must be preserved, not invented.

Required payload:

```yaml
approvalAuthorization:
  governedAuthorizationToken: null
  approvedBy: null
  approvalTimestamp: null
  approvalScope: null
  approvalStatus: "unapproved"
```

Colorlab export may not fabricate:
- approval token
- approver identity
- approval timestamp
- approval scope

Activation-intent export requires a real governed approval payload.

---

# 13. Lineage Preservation

Every exported runtime profile must include lineage metadata.

Required payload:

```yaml
lineage:
  parentArtifactId: "projection-report-id"
  parentValid: true
  derivedFromClass: "SAVED_PROJECTION_REPORT"
  sourceCandidatesRef: "sc_0001"
```

If no parent artifact exists, profile must mark itself as root:

```yaml
lineage:
  parentArtifactId: null
  parentValid: true
  derivedFromClass: null
  sourceCandidatesRef: "sc_0001"
```

Invalid parent references must:
- preserve export
- set `parentValid: false`
- expose diagnostics
- not block review-intent export

Invalid parent references must block activate-intent export.

---

# 14. Export Governance Block

Every export must include:

```yaml
exportGovernance:
  authorityLevel: "advisory_only"
  wosRetainsFinalAuthority: true
  requiresWosReview: true
  notARuntimeCommand: true
```

These fields are invariant.

They may not be disabled, omitted, or overridden.

---

# 15. Export Validation Rules

Before export, Colorlab must validate:

- artifact class is `PALETTE_RUNTIME_PROFILE`
- persistence class is `archival`
- intake intent exists or defaults to `review`
- revision binding is complete
- runtime role recommendation uses canonical role keys
- recommendation values use canonical recommendation values
- mode context exists
- Truth/Fiction declarations are present when required
- source bias payload exists
- stale state exists
- export governance block matches invariant values
- approval authorization payload exists
- lineage payload exists

Failure should block export unless the failure is explicitly allowed for review-intent payloads.

---

# 16. Export Blocking Rules

Colorlab must block export when:

- required export governance fields are missing
- `notARuntimeCommand` is false
- `wosRetainsFinalAuthority` is false
- `requiresWosReview` is false
- activation is requested without approval token
- activation is requested with stale blocking state
- activation scope is absent
- Fiction mode declaration is missing
- Truth non-certification fields are missing
- source bias payload is missing
- lineage payload is missing for activation

---

# 17. Canonical Export Schema

```json
{
  "artifactClassification": "PALETTE_RUNTIME_PROFILE",
  "persistenceClass": "archival",
  "intakeIntent": "review",
  "revisionBinding": {
    "paletteId": "pal_0892",
    "revisionId": "rev_0003",
    "revisionHash": "sha256...",
    "rendererSignature": "renderer_v1.4.0",
    "shaderSignature": "shader_v1.2.0",
    "stageTemplateRef": "projection_stage_template_v1.0.0",
    "deterministicParameterHash": "sha256..."
  },
  "runtimeRoleRecommendation": {
    "base": "low",
    "accent": "high",
    "atmosphere": "high",
    "route": "medium",
    "ui": "medium",
    "event": "unknown",
    "weather": "medium",
    "time": "medium",
    "reference_overlay": "unknown",
    "fiction_override": "low",
    "audio_hint": "unknown"
  },
  "modeContext": {
    "evaluationMode": "truth",
    "authorityClass": "plausibility_assessment",
    "geographicAuthenticityCertified": false,
    "culturalAuthorityClaimed": false
  },
  "sourceBias": {
    "sampleCount": 1,
    "sourceType": "single_image",
    "extractionContext": {
      "timeOfDay": "night",
      "weather": "rain",
      "sourceMedium": "found_photo"
    },
    "sourceDiversity": {
      "level": "low"
    },
    "knownBiases": [
      "commercial_styling",
      "compression_artifacts"
    ],
    "limitationStatement": "single signage extraction only"
  },
  "staleState": {
    "isStale": false,
    "staleReason": null,
    "staleDetectedAt": null
  },
  "exportGovernance": {
    "authorityLevel": "advisory_only",
    "wosRetainsFinalAuthority": true,
    "requiresWosReview": true,
    "notARuntimeCommand": true
  },
  "approvalAuthorization": {
    "governedAuthorizationToken": null,
    "approvedBy": null,
    "approvalTimestamp": null,
    "approvalScope": null,
    "approvalStatus": "unapproved"
  },
  "lineage": {
    "parentArtifactId": "projection-report-id",
    "parentValid": true,
    "derivedFromClass": "SAVED_PROJECTION_REPORT",
    "sourceCandidatesRef": "sc_0001"
  }
}
```

---

# 18. Relationship to Existing Export System

This spec extends Colorlab export behavior with projection-specific governance.

It does not replace all existing export systems.

If `wos_palette_package` exists in the broader Export System, `PALETTE_RUNTIME_PROFILE` should be treated as:

```text
projection-governed advisory runtime profile payload
```

not as a replacement for generic palette export packages.

---

# 19. Non-Goals

This specification does not:
- define WOS import behavior
- define WOS activation behavior
- mutate runtime state
- approve runtime profiles
- certify geography
- define UI for export review
- define approval token generation
- define source-bias scoring algorithms

---

# 20. Acceptance Criteria

This specification is accepted when:

- exported profiles include complete canonical schema
- export governance invariant cannot be disabled
- review intent defaults safely
- activate intent requires approval payload
- runtime role vocabulary is canonical
- recommendation values are advisory-only
- source bias survives export
- stale state survives export
- lineage survives export
- Truth mode non-certification survives export
- Fiction mode declaration survives export
- Colorlab never exports runtime commands

---

# 21. Review Status

**Status:** `[REVIEW]`

This spec should be reviewed specifically for:
- export schema completeness
- advisory/runtime separation
- role vocabulary stability
- source-bias preservation
- interaction with WOS import spec

---

# 22. Implementation Guide

- **Where this goes:** `docs/_specs/colorlab/0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0.md`
- **What to run:** implement export serialization against the canonical `PALETTE_RUNTIME_PROFILE` schema.
- **What to expect:** Colorlab can safely produce advisory runtime profiles without granting runtime authority.
