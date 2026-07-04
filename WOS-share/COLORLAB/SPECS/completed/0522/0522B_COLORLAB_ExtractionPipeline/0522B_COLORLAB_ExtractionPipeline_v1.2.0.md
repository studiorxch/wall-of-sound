# 0522B_COLORLAB_ExtractionPipeline_v1.2.0.md

Version: v1.2.0
Date: 2026-05-22
System: COLORLAB
Domain: Extraction
Component: Extraction Pipeline
Status: Governance-Aligned Extraction Infrastructure

---

# Purpose

Define the canonical extraction pipeline responsible for producing:
# SOURCE_CANDIDATES

records for Colorlab.

This specification governs:
- image ingestion
- normalization
- deterministic extraction
- candidate generation
- provenance telemetry
- archival payload creation
- reproducibility guarantees
- content identity anchoring

This document defines:
# extraction infrastructure

NOT:
- cleanup workflows
- palette editing
- metadata systems
- visualization behavior
- runtime interpretation

Those belong to downstream systems.

---

# Governance Dependency

This specification depends on:

```txt
0522A_COLORLAB_PaletteGovernance_v1.4.0.md
```

Extraction infrastructure must comply with:
- append-only archival doctrine
- provenance propagation rules
- SOURCE_CANDIDATES invariants
- lineage continuity
- downstream authority containment

---

# Core Philosophy

Extraction is:
# signal acquisition
NOT interpretation

The extraction pipeline exists to:
- preserve visual telemetry
- maximize future reprocessability
- maintain deterministic reproducibility
- avoid destructive reduction

Extraction systems do NOT:
- curate palettes
- rank aesthetics
- determine moods
- perform atmospheric interpretation

Those belong to downstream systems.

---

# Foundational Doctrine

CRITICAL:
# extraction produces immutable telemetry

NOT:
- editable palettes
- interpreted color sets
- curated outputs

Extraction outputs are:
# sealed SOURCE_CANDIDATES records

---

# Deterministic Doctrine

Given:
- identical source image content
- identical extraction settings
- identical normalization rules
- identical engine version
- identical deterministic seed

the extraction pipeline MUST produce:
# identical extraction payloads

Determinism is required for:
- archival reproducibility
- governance integrity
- debugging
- migration safety
- lineage verification

---

# Extraction Lifecycle Position

Extraction infrastructure is responsible for creating:
# SOURCE_CANDIDATES

records only.

Extraction does NOT create:
- CURATED_PALETTE
- ARCHIVAL_PALETTE
- DERIVED_VARIANT

Those are downstream lifecycle states governed elsewhere.

---

# Extraction Workflow

Canonical extraction flow:

```txt
Import Image
    ↓
Generate Content Hash
    ↓
Normalize Source
    ↓
Generate Working Buffer
    ↓
Run Deterministic Extraction
    ↓
Generate Candidate Set
    ↓
Generate Provenance Telemetry
    ↓
Create SOURCE_CANDIDATES Record
    ↓
Seal Record
    ↓
Emit Downstream Reference
```

---

# Import Requirements

Supported source inputs:
- PNG
- JPG / JPEG
- WEBP
- GIF (first frame only)
- TIFF

Unsupported inputs:
- vector graphics
- layered PSD files
- live video streams
- procedural runtime textures

Unsupported sources must fail explicitly.

---

# Original Preservation Doctrine

CRITICAL:
# original source files must remain untouched

Extraction infrastructure may:
- generate working buffers
- normalize temporary copies
- derive sampling representations

Extraction infrastructure may NEVER:
- overwrite original files
- recompress originals
- mutate imported assets

---

# Content Identity Doctrine

CRITICAL:
# source identity is content-based

NOT filename-based.

Every imported source must generate:
# a cryptographic content hash

before extraction begins.

Canonical hashing algorithm:

```txt
SHA-256
```

Filename changes do NOT:
- create new source identity
- alter provenance
- affect deduplication

Content identity is determined exclusively through:
# source image content hash

---

# Normalization Pipeline

Normalization exists to:
# stabilize deterministic extraction inputs

Normalization stages:
- color space normalization
- alpha normalization
- bit-depth normalization
- dimension normalization

---

# Canonical Normalization Rules

## Color Space

All working buffers convert to:

```txt
RGBA 8-bit
```

---

## Dimension Target

Largest dimension normalized to:

```txt
1024px
```

while preserving aspect ratio.

---

## Alpha Handling Doctrine

CRITICAL:
# transparent pixels are excluded from extraction sampling

Pixels with:

```txt
alpha < 1
```

must NOT participate in:
- sampling
- frequency calculations
- candidate generation

This prevents:
- transparency telemetry noise
- anti-alias contamination
- inconsistent extraction behavior

Alpha exclusion behavior is:
# deterministic extraction infrastructure

NOT optional sampling behavior.

---

# Normalization Determinism

CRITICAL:
# normalization behavior is part of extraction truth

Normalization parameters must remain:
- deterministic
- version-locked
- provenance-tracked

If normalization behavior changes:
# extraction engine version must change

because extraction outputs may differ.

---

# Working Buffer Doctrine

The normalized working buffer is:
# derived extraction infrastructure

NOT archival truth.

Archival truth remains:
- original imported source
- extraction telemetry
- SOURCE_CANDIDATES payload

---

# Extraction Methods

Supported extraction methods:

| Method | Purpose |
|---|---|
| dominant_cluster | major tonal grouping |
| uniform_grid | spatially distributed sampling |
| weighted_frequency | frequency-balanced extraction |
| edge_bias | contrast-sensitive extraction |
| luminance_stratified | tonal-range preservation |

Extraction methods are:
# telemetry acquisition strategies

NOT interpretation systems.

---

# Candidate Generation

Candidate generation must preserve:
- tonal diversity
- luminance distribution
- saturation variance
- frequency visibility

Candidate generation may NEVER:
- aesthetically rank colors
- suppress "ugly" colors
- reinterpret source meaning
- perform cinematic grading

---

# Candidate Count Tiers

Supported extraction tiers:

| Tier | Candidates |
|---|---|
| small | 32 |
| medium | 64 |
| large | 128 |

Candidate counts are:
# bounded extraction telemetry sets

NOT curated palettes.

---

# Canonical SOURCE_CANDIDATES Payload

```json
{
  "id": "sc_0001",
  "source_candidates_ref": "sc_0001",
  "lifecycleState": "SOURCE_CANDIDATES",

  "sourceImage": {
    "filename": "image.jpg",
    "width": 2048,
    "height": 1536,
    "mimeType": "image/jpeg",
    "contentHash": "sha256:3b7f8f4d..."
  },

  "provenance": {
    "extractedAt": "2026-05-22T00:00:00Z",

    "engine": {
      "version": "1.2.0",
      "hashAlgorithm": "sha256"
    },

    "deterministicSeed": 42,

    "normalization": {
      "targetResolution": 1024,
      "colorSpace": "RGBA_8BIT",
      "alphaHandling": "EXCLUDE_ALPHA_LT_1"
    },

    "sampling": {
      "samplingMode": "uniform_grid",
      "samplingCount": 50000
    }
  },

  "extraction": {
    "method": "dominant_cluster",
    "candidateCount": 64
  },

  "candidateColors": [
    {
      "hex": "#AABBCC",

      "rgb": {
        "r": 170,
        "g": 187,
        "b": 204
      },

      "lab": {
        "l": 72.1,
        "a": -2.3,
        "b": -11.7
      },

      "frequency": 0.084
    }
  ]
}
```

---

# Payload Governance Rules

SOURCE_CANDIDATES payloads must:
- remain immutable
- remain append-preserved
- remain provenance-linked
- remain lineage-addressable

SOURCE_CANDIDATES payloads may NEVER:
- mutate
- collapse candidate telemetry
- rewrite frequencies
- accept downstream annotations
- accept metadata overlays

---

# SOURCE_CANDIDATES Self-Reference Rule

CRITICAL:
# source_candidates_ref resolves to self

for SOURCE_CANDIDATES records.

This preserves:
- lineage invariants
- traversal continuity
- governance consistency

without nullable exceptions.

---

# Provenance Requirements

Every SOURCE_CANDIDATES payload must preserve:
- extraction timestamp
- engine version
- deterministic seed
- normalization parameters
- sampling strategy
- source image content hash

These fields are:
# mandatory provenance telemetry

NOT optional metadata.

---

# Extraction Record Creation

CRITICAL:
# extraction completion automatically creates a SOURCE_CANDIDATES record

Extraction is:
# governance-producing infrastructure

NOT optional save-state generation.

Every completed extraction is preserved.

---

# Deduplication Doctrine

CRITICAL:
# deduplication is content-based and deterministic

Canonical deduplication key:

```txt
hash(source_image_content)
+ extraction_settings
+ engine_version
+ deterministic_seed
```

Filename is NOT part of deduplication identity.

If:
- source image content
- extraction settings
- normalization rules
- deterministic seed
- engine version

are identical,
the system should:
# reuse the existing SOURCE_CANDIDATES payload

rather than generate duplicate archival records.

---

# Regeneration Doctrine

CRITICAL:
# regeneration creates a new SOURCE_CANDIDATES record

Regeneration may NEVER:
- overwrite prior records
- mutate existing telemetry
- replace archival history

---

# Extraction Isolation Rules

Downstream systems may:
- reference extraction records
- query extraction telemetry
- derive interpretations

Downstream systems may NEVER:
- mutate extraction payloads
- annotate extraction telemetry
- reinterpret frequencies
- rewrite provenance

All downstream interpretation must exist as:
# linked external records

NOT inline extraction mutation.

---

# Color Representation Doctrine

Canonical archival color spaces:

| Space | Purpose |
|---|---|
| RGB | display reference |
| LAB | perceptual reference |

HSL is intentionally excluded from archival payloads because:
# HSL is interaction-oriented representation

NOT archival truth representation.

---

# Engine Versioning Doctrine

CRITICAL:
# engine versions must increment whenever extraction output may change

Version increments are required for:
- normalization behavior changes
- sampling logic changes
- clustering logic changes
- dependency updates affecting numerical output
- floating-point precision changes
- extraction algorithm changes

Versioning semantics:

| Version Type | Meaning |
|---|---|
| patch | non-output-affecting internal changes |
| minor | output-affecting archival-compatible changes |
| major | breaking extraction lineage changes |

---

# Extraction Failure Conditions

## Archive Corruption

Occurs when:
- extraction telemetry mutates
- provenance detaches
- candidate frequencies rewrite
- payload lineage breaks

---

## Reproducibility Failure

Occurs when:
- normalization changes silently
- deterministic seeds drift
- engine versions mismatch
- extraction methods mutate behavior
- content hashes mismatch

---

## Governance Leakage

Occurs when:
- downstream systems mutate extraction records
- metadata overlays attach to SOURCE_CANDIDATES
- interpretation rewrites telemetry

This is forbidden.

---

# Performance Philosophy

Performance optimization may NEVER compromise:
- determinism
- provenance integrity
- archival preservation
- extraction reproducibility

Performance is:
# subordinate to archival correctness

---

# Future Compatibility

This extraction pipeline may later support:
- video frame extraction
- batch archival ingestion
- temporal frame sampling
- multi-frame cinematic extraction
- animated image extraction

These remain:
# image-derived telemetry systems

Non-image synthesis systems:
- weather generation
- district synthesis
- runtime environmental blending

remain:
# out of scope

for this specification.

---

# Immediate Extraction Priorities

## Priority 1
Deterministic extraction stability.

---

## Priority 2
Governance-compliant payload creation.

---

## Priority 3
Immutable SOURCE_CANDIDATES records.

---

## Priority 4
Provenance telemetry completeness.

---

## Priority 5
Downstream mutation containment.

---

# Expected Result

Colorlab gains:
# reproducibility-grade extraction infrastructure

capable of supporting:
- deterministic archival telemetry
- provenance-safe lineage systems
- future reprocessing
- scalable atmospheric interpretation
- downstream palette refinement
- WOS environmental integration

without:
- extraction mutation
- provenance loss
- lifecycle ambiguity
- downstream authority leakage
- archival instability
