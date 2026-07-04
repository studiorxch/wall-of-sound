

Version: v1.0.0  
Date: 2026-05-22  
System: COLORLAB  
Domain: Extraction  
Component: Extraction Pipeline  
Status: Draft
Name: 0522_COLORLAB_ExtractionPipeline_v1.0.0.md

---

# Purpose

Define the canonical image-to-palette extraction pipeline for Colorlab.

This system is responsible for:

- importing source imagery
- extracting candidate colors
- preserving raw extraction data
- preparing palettes for cleanup and refinement
- establishing stable archival structure

This stage intentionally does NOT:
- perform final palette curation
- assign moods/tags
- perform WOS runtime integration
- apply cinematic grading logic

Those belong to downstream systems.

---

# Core Philosophy

Color extraction is NOT:
- final palette generation
- emotional interpretation
- design direction

Extraction is:
# visual signal acquisition

The goal is maximum useful information retention before refinement.

---

# Primary Goals

1. Produce stable candidate color sets
2. Preserve extraction provenance
3. Avoid destructive early reduction
4. Maintain future reprocessing capability
5. Support downstream cleanup systems
6. Remain deterministic and reproducible

---

# Non-Goals

This system will NOT:
- auto-generate moods
- infer districts
- perform palette ranking
- perform palette harmonization
- generate environmental variants
- enforce visual style

These belong to later stages.

---

# Pipeline Overview

```txt
Image Import
    ↓
Image Normalization
    ↓
Pixel Sampling
    ↓
Color Space Conversion
    ↓
Candidate Extraction
    ↓
Frequency Analysis
    ↓
Raw Candidate Preservation
    ↓
Extraction Payload Output

---

# Architecture

|Stage|Purpose|
|---|---|
|Import|Load image safely|
|Normalize|Standardize dimensions/formats|
|Sample|Gather representative pixels|
|Convert|Transform to working color spaces|
|Extract|Generate candidate pool|
|Analyze|Measure frequency/distribution|
|Preserve|Save raw extraction data|
|Output|Emit extraction payload|

---

# Supported Inputs

## Phase 1

### Accepted Formats

- JPG
- JPEG
- PNG
- WEBP

### Future

- GIF
- AVIF
- MP4 frame extraction
- SVG analysis
- live video feed extraction

---

# Import Requirements

## Input Constraints

|Property|Limit|
|---|---|
|max file size|25MB|
|max resolution|8192px|
|minimum resolution|64px|

---

# Image Normalization

## Purpose

Ensure extraction consistency across:

- formats
- dimensions
- compression conditions

---

## Required Operations

### Convert to RGBA

Canonical working buffer:

```
RGBA 8-bit
```

---

### Resize Large Images

Target working size:

```
1024px max dimension
```

Maintain aspect ratio.

---

### Preserve Original

Original source file must remain untouched.

---

# Sampling Strategy

## Purpose

Avoid:

- full-resolution processing cost
- overfitting to compression artifacts
- unnecessary duplicate pixel analysis

---

# Sampling Mode

## Initial Strategy

Uniform grid sampling.

---

## Future Strategies

|Strategy|Purpose|
|---|---|
|edge-aware|preserve focal colors|
|contrast-aware|preserve accents|
|saliency-aware|preserve emotional regions|
|weighted luminance|improve tonal balance|

---

# Candidate Pool Philosophy

CRITICAL:

# Extraction does NOT directly generate final palettes.

Instead:

- extract many candidates
- refine later

---

# Candidate Targets

|Tier|Count|
|---|---|
|minimal|32|
|standard|64|
|extended|128|

Default:

```
64 candidates
```

---

# Color Spaces

## Canonical Internal Spaces

|Space|Purpose|
|---|---|
|RGB|display|
|HSL|UI manipulation|
|LAB|perceptual comparison|

---

# LAB Requirement

All similarity operations MUST use:

# LAB color space

NOT RGB distance.

Reason:  
RGB distance poorly represents human visual perception.

---

# Candidate Extraction

## Initial Extraction Method

K-Means clustering.

---

## Initial Parameters

|Property|Value|
|---|---|
|clusters|64|
|iterations|10–20|
|deterministic seed|yes|

---

# Future Extraction Modes

|Method|Purpose|
|---|---|
|Median Cut|fast extraction|
|Octree|low-memory|
|DBSCAN|perceptual grouping|
|Neural Extraction|semantic weighting|

---

# Frequency Analysis

## Purpose

Track:

- dominance
- rarity
- distribution

without assuming dominance equals importance.

---

# Required Metrics

|Metric|Purpose|
|---|---|
|pixel frequency|raw dominance|
|luminance|tonal placement|
|saturation|emotional intensity|
|hue angle|grouping|
|LAB coordinates|perceptual mapping|

---

# Extraction Payload

## Canonical Output

```
{  "id": "",  "sourceImage": {    "filename": "",    "width": 0,    "height": 0,    "format": "",    "createdAt": ""  },  "extraction": {    "method": "kmeans",    "candidateCount": 64,    "sampleCount": 0  },  "candidateColors": [    {      "hex": "#000000",      "rgb": [0, 0, 0],      "hsl": [0, 0, 0],      "lab": [0, 0, 0],      "frequency": 0.0    }  ]}
```

---

# Preservation Rules

CRITICAL:

# Raw extraction data must NEVER be discarded.

Reason:  
Future systems may:

- improve cleanup
- improve clustering
- improve mood inference
- improve cinematic balancing
- regenerate palettes

The archive must remain reprocessable.

---

# Deterministic Requirement

Given:

- same image
- same settings
- same extraction method

the system MUST produce:

# identical extraction payloads

This is critical for:

- debugging
- reproducibility
- versioning
- palette lineage

---

# Error Handling

## Required Guards

### Invalid File

Reject unsupported formats.

---

### Corrupted Image

Fail gracefully.

---

### Empty Extraction

Abort save operation.

---

### Excessive Uniformity

If image contains:

- extremely low variance
- monochromatic regions

system should:

- warn user
- still preserve extraction

---

# Performance Targets

|Operation|Target|
|---|---|
|image import|<200ms|
|normalization|<100ms|
|extraction|<500ms|
|payload creation|<100ms|

Target:

# sub-1-second extraction pipeline

for standard images.

---

# UI Requirements

## Extraction View

Must display:

- source image preview
- candidate palette strip
- extraction count
- extraction method

---

# Required User Actions

|Action|Purpose|
|---|---|
|regenerate|rerun extraction|
|adjust candidate count|density control|
|save extraction|archive raw state|
|send to cleanup|refinement stage|

---

# Data Ownership

|System|Ownership|
|---|---|
|Extraction Pipeline|raw candidate generation|
|Cleanup Pipeline|palette refinement|
|Metadata System|annotation|
|Visualization System|relational mapping|

Extraction system must remain isolated from:

- emotional interpretation
- world assignment
- cinematic systems

---

# Future Compatibility

This system must support:

- live WOS environmental sampling
- video frame extraction
- weather-derived palettes
- district palette harvesting
- OBS stream extraction
- realtime camera feeds

without architectural rewrite.

---

# Immediate Implementation Priorities

## Priority 1

Stable image import pipeline.

---

## Priority 2

K-Means candidate extraction.

---

## Priority 3

LAB conversion infrastructure.

---

## Priority 4

Raw extraction preservation.

---

## Priority 5

Deterministic reproducibility.

---

# Implementation Guide

## Files

```
/src/core/extraction//src/core/color//src/types//src/utils/
```

---

## Initial Modules

```
imageNormalizer.tspixelSampler.tscolorConverter.tscandidateExtractor.tsextractionPayload.ts
```

---

## Expected Result

Colorlab produces:

- stable candidate pools
- preserved raw extraction data
- future-proof palette archives
- deterministic extraction outputs
- clean downstream refinement input