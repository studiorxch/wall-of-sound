# 0522_COLORLAB_PaletteCleanup_v1.0.0.md

Version: v1.0.0  
Date: 2026-05-22  
System: COLORLAB  
Domain: Refinement  
Component: Palette Cleanup Pipeline  
Status: Draft

---

# Purpose

Define the canonical cleanup and refinement stage for Colorlab palette processing.

This system transforms:
# raw extraction candidates

into:
# structured, usable palettes

The cleanup stage is responsible for:
- removing redundant colors
- improving perceptual separation
- preserving emotional identity
- establishing tonal hierarchy
- preparing palettes for editing and metadata stages

---

# Core Philosophy

Cleanup is NOT:
- aesthetic sterilization
- aggressive minimization
- automatic “beautification”

Cleanup IS:
# perceptual organization

The goal is:
- preserve emotional character
- reduce noise
- improve readability
- strengthen palette structure

without destroying source atmosphere.

---

# Primary Goals

1. Remove perceptual duplicates
2. Eliminate low-information colors
3. Improve tonal separation
4. Preserve emotional identity
5. Produce structurally usable palettes
6. Maintain deterministic outputs

---

# Non-Goals

This system will NOT:
- assign moods
- infer environment types
- perform cinematic grading
- create runtime variants
- apply WOS environmental logic
- override authorial intent

Those belong to downstream systems.

---

# Pipeline Overview

```txt
Raw Candidate Pool
    ↓
LAB Conversion
    ↓
Similarity Analysis
    ↓
Duplicate Suppression
    ↓
Noise Removal
    ↓
Tonal Analysis
    ↓
Palette Structuring
    ↓
Role Assignment
    ↓
Curated Palette Output
```

# Cleanup Philosophy

CRITICAL:

# dominant colors are not always important colors

Human perception prioritizes:

- contrast
- focal accents
- rarity
- emotional punctuation
- temperature balance

NOT pure pixel frequency.

Cleanup systems must reflect this.

---

# Input Requirements

## Canonical Input

Extraction payload from:

```
0522_COLORLAB_ExtractionPipeline_v1.0.0.md
```

---

# Required Input Data

```
{  "candidateColors": [],  "lab": [],  "frequency": [],  "saturation": [],  "luminance": []}
```

---

# Working Color Space

## Mandatory Requirement

All cleanup operations MUST use:

# LAB color space

Reason:  
RGB similarity does not align with human perception.

---

# Similarity Analysis

## Purpose

Identify:

- near duplicates
- visually redundant tones
- clustered perceptual regions

---

# Required Metric

## Delta-E

Canonical perceptual distance metric.

---

# Initial Thresholds

|Threshold|Meaning|
|---|---|
|ΔE < 4|near identical|
|ΔE < 8|visually similar|
|ΔE < 15|related cluster|

Thresholds should remain configurable.

---

# Duplicate Suppression

## Purpose

Prevent palettes from containing:

- repeated neutrals
- repeated saturation levels
- indistinguishable tones

---

# Rules

If:

```
Delta-E < threshold
```

Then:

- preserve stronger candidate
- remove weaker candidate

---

# Candidate Priority Weighting

## Weight Formula

```
importance =frequency+ saturation influence+ contrast contribution+ rarity weighting
```

---

# Emotional Preservation Rule

Cleanup must NOT:

- flatten unique accents
- eliminate unusual puncture colors
- remove atmospheric tension

Example:  
A rare neon pink may be emotionally critical even if low-frequency.

---

# Noise Removal

## Purpose

Remove:

- compression artifacts
- muddy transitional tones
- accidental low-information colors

---

# Common Noise Types

|Type|Example|
|---|---|
|compression mud|JPEG artifacts|
|tonal sludge|near-identical browns|
|low-saturation fog|accidental neutrals|
|dead midtones|low-contrast fillers|

---

# Removal Rules

Noise candidates may be removed when:

- low saturation
- low frequency
- low contrast contribution
- high redundancy

---

# Tonal Analysis

## Purpose

Ensure palettes maintain:

- depth
- readability
- hierarchy

---

# Required Tonal Layers

A valid curated palette should preferably contain:

|Layer|Purpose|
|---|---|
|dark anchor|structure|
|midtone|environment|
|light tone|breathing space|
|accent|emotional identity|

---

# Tonal Failure Conditions

## Weak Palette Symptoms

|Problem|Cause|
|---|---|
|muddy palette|compressed luminance|
|flat palette|no tonal spread|
|chaotic palette|equal-priority accents|
|sterile palette|over-cleaning|

---

# Saturation Balancing

## Purpose

Prevent:

- oversaturation collapse
- emotional monotony
- visual fatigue

---

# Balancing Rules

Palettes should preserve:

- saturation variation
- neutral breathing room
- emotional accents

NOT:

- max saturation everywhere

---

# Accent Preservation

CRITICAL:

# rare colors may carry emotional identity

Cleanup must protect:

- isolated accents
- puncture colors
- neon signatures
- atmospheric highlights

even at low frequency.

---

# Palette Structuring

## Purpose

Convert:

# unordered candidate pools

into:

# intentional visual systems

---

# Canonical Structure

|Role|Purpose|
|---|---|
|base_dark|environmental anchor|
|base_light|contrast support|
|structure|architectural tone|
|accent_primary|emotional identity|
|accent_secondary|supporting energy|
|atmospheric|fog/light influence|
|signal|UI/transit/highlight|

---

# Role Assignment

## Initial Assignment Strategy

Assign roles using:

- luminance
- saturation
- contrast contribution
- hue uniqueness

---

# Example Output

```
{  "roles": {    "base_dark": "#1A1D22",    "base_light": "#D7D3C8",    "accent_primary": "#F04A3A",    "accent_secondary": "#58C2E8",    "signal": "#D8FF00"  }}
```

---

# Palette Size Targets

|Tier|Color Count|
|---|---|
|compact|5|
|standard|8|
|extended|12|

Default:

```
8-color curated palette
```

---

# Cleanup Modes

## Phase 1 Modes

### Balanced

General-purpose cleanup.

---

### Cinematic

Preserve contrast and atmospheric depth.

---

### Neon

Protect saturation and accents.

---

### Lo-Fi

Favor muted warmth and tonal softness.

---

### Infrastructure

Favor restrained neutrals plus signal accents.

---

# Deterministic Requirement

Given:

- same input
- same thresholds
- same cleanup mode

the system MUST produce:

# identical curated palettes

This is critical for:

- reproducibility
- lineage tracking
- palette versioning
- debugging

---

# Cleanup Payload

## Canonical Output

```
{  "paletteId": "",  "cleanupMode": "balanced",  "sourceExtractionId": "",  "curatedColors": [],  "removedColors": [],  "roles": {},  "metrics": {    "contrast": 0,    "warmth": 0,    "saturation": 0,    "energy": 0  }}
```

---

# Metrics Generation

## Derived Metrics

|Metric|Purpose|
|---|---|
|warmth|emotional tone|
|saturation|intensity|
|contrast|readability|
|density|visual pressure|
|harmony|cohesion|
|energy|pacing|

These are NOT final mood systems.

They are structural signals.

---

# UI Requirements

## Cleanup View

Must display:

- before/after comparison
- removed colors
- role assignments
- tonal spread
- saturation distribution

---

# Required User Controls

|Control|Purpose|
|---|---|
|regenerate|rerun cleanup|
|threshold slider|duplicate sensitivity|
|preserve color|lock candidate|
|remove color|manual deletion|
|mode selector|cleanup profile|
|compare versions|iterative refinement|

---

# Comparison Mode

Cleanup system should support:

# A/B palette comparison

Purpose:

- iterative refinement
- atmospheric testing
- cinematic tuning

---

# Data Ownership

|System|Ownership|
|---|---|
|Extraction Pipeline|raw candidates|
|Cleanup Pipeline|structural refinement|
|Metadata System|semantic annotation|
|Runtime System|environmental behavior|

Cleanup must remain isolated from:

- world simulation
- weather systems
- district logic
- cinematic runtime grading

---

# Future Compatibility

Cleanup system must support:

- realtime environmental palettes
- district-derived palette refinement
- weather-sensitive cleanup
- video-frame extraction
- stream palette harvesting
- generative palette mutation

without architectural rewrite.

---

# Failure Conditions

## Cleanup Collapse

Occurs when:

- too many colors removed
- all accents neutralized
- luminance compressed
- emotional identity erased

---

# Over-Curation

System must avoid:

# algorithmic sterilization

Palettes should retain:

- texture
- tension
- asymmetry
- personality

Perfect balance is NOT always desirable.

---

# Immediate Implementation Priorities

## Priority 1

LAB + Delta-E infrastructure.

---

## Priority 2

Duplicate suppression.

---

## Priority 3

Noise filtering.

---

## Priority 4

Role assignment.

---

## Priority 5

Before/after comparison UI.

---

# Recommended File Structure

```
/src/core/cleanup//src/core/color//src/features/cleanup//src/utils/color/
```

---

# Recommended Modules

```
deltaE.tssimilarityAnalyzer.tsduplicateSuppressor.tsnoiseFilter.tspaletteBalancer.tsroleAssigner.tscleanupMetrics.ts
```

---

# Expected Result

Colorlab transforms:

# raw visual extraction

into:

# emotionally coherent palette systems

while preserving:

- atmosphere
- distinction
- tonal hierarchy
- cinematic identity
- future environmental compatibility