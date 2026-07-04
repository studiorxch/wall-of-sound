# 0609W_WOS_ReplacementVisualKit_v1.0.0_BUILD

# Purpose

Convert Building Replacement Runtime validation cubes into recognizable low-poly architectural forms.

This build introduces the first visible architectural replacement layer for WOS.

The objective is not realism.

The objective is immediate visual differentiation at all zoom levels.

Users should be able to identify replacement types from silhouette alone.

---

# Goals

Transform:

```text
Colored Validation Cube
```

into:

```text
Recognizable Architectural Archetype
```

without changing:

- replacement manifest format
    
- building selection workflow
    
- replacement runtime ownership
    
- Mapbox building source
    
- Studio editing tools
    

---

# User Problem

Current replacement actors prove that placement works.

However:

- all replacements feel identical
    
- silhouettes are indistinguishable
    
- city identity remains unchanged
    
- replacement system appears unfinished
    
- architectural experimentation cannot be evaluated
    

The runtime successfully validates position.

The runtime does not yet validate appearance.

---

# Success Criteria

At city scale:

```text
Warehouse
≠
Skyscraper
≠
Apartment
≠
Pagoda
≠
Radio Tower
```

using silhouette alone.

No inspector interaction required.

No debug labels required.

---

# Architectural Direction

WOS uses:

```text
Low Poly
Readable
Stylized
Map-Friendly
```

forms.

Avoid:

```text
Photoreal
High Polygon
Detailed Meshes
```

---

# Phase 1 Archetype Kit

## Warehouse

Characteristics:

- wide footprint
    
- low height
    
- pitched roof
    

Silhouette:

```text
 _______
/_______\
|       |
|_______|
```

Visual Identity:

- industrial
    
- logistics
    
- harbor use
    

---

## Skyscraper

Characteristics:

- tall
    
- stepped crown
    
- narrow footprint
    

Silhouette:

```text
   __
  |  |
  |  |
 _|  |_
|      |
|______|
```

Visual Identity:

- financial district
    
- downtown core
    

---

## Apartment

Characteristics:

- medium height
    
- rooftop water tower
    
- rectangular body
    

Silhouette:

```text
   []
 ______
|      |
|      |
|______|
```

Visual Identity:

- residential
    
- Brooklyn
    
- Queens
    

---

## Radio Tower

Characteristics:

- extreme height
    
- narrow body
    
- beacon top
    

Silhouette:

```text
   *
   |
  /|\
 /_|_\
   |
```

Visual Identity:

- communications
    
- infrastructure
    

---

## Pagoda

Characteristics:

- stacked roofs
    
- tiered silhouette
    

Silhouette:

```text
  /\
 /__\
/____\
|____|
```

Visual Identity:

- cultural landmark
    
- destination
    

---

## Civic Block

Characteristics:

- wide footprint
    
- shallow dome
    
- public architecture
    

Silhouette:

```text
  ___
 /   \
|_____|
```

Visual Identity:

- museums
    
- city halls
    
- institutions
    

---

## Industrial Stack

Characteristics:

- factory base
    
- smokestack
    

Silhouette:

```text
   |
   |
 __|__
|     |
|_____|
```

Visual Identity:

- ports
    
- utilities
    
- manufacturing
    

---

## Custom Placeholder

Characteristics:

- white cube
    

Purpose:

Fallback when archetype unresolved.

---

# Rendering Rules

## Rule 1

Archetypes remain color driven.

Current replacement colors remain authoritative.

No palette changes.

---

## Rule 2

Silhouette must remain readable at:

```text
Far Zoom
Medium Zoom
Close Zoom
```

---

## Rule 3

Forms generated procedurally.

No external model assets.

No GLTF.

No mesh downloads.

---

## Rule 4

Height system remains unchanged.

Current formula remains authoritative:

```text
finalHeight =
inheritedHeight
× heightModeMultiplier
× scale
× archetypeHeightMul
```

---

# Runtime Architecture

Current:

```text
Replacement Runtime
→ GeoJSON Cube
→ Fill Extrusion
```

Target:

```text
Replacement Runtime
→ Archetype Shape Generator
→ Multi-Part Geometry
→ Fill Extrusion
```

---

# Shape Generator

Create:

```javascript
_generateWarehouse()
_generateSkyscraper()
_generateApartment()
_generateRadioTower()
_generatePagoda()
_generateCivicBlock()
_generateIndustrialStack()
_generatePlaceholder()
```

Each returns:

```javascript
Feature[]
```

allowing multi-part extrusion assemblies.

---

# Debug

```javascript
_wos.debug.buildingReplacement.list()
```

must include:

```javascript
geometryKind
```

Example:

```javascript
{
  id: 10455,
  archetype: "warehouse",
  geometryKind: "warehouse"
}
```

---

# Acceptance Tests

## T1

Warehouse renders pitched roof silhouette.

## T2

Skyscraper renders stepped crown silhouette.

## T3

Apartment renders rooftop tower.

## T4

Radio tower renders narrow vertical form.

## T5

Pagoda renders tiered profile.

## T6

Civic block renders dome profile.

## T7

Industrial stack renders smokestack profile.

## T8

Archetypes visually distinguishable at medium zoom.

## T9

Replacement height system unchanged.

## T10

Manifest format unchanged.

## T11

Cross-tab sync unchanged.

## T12

Style reload recovery unchanged.

## T13

Building selection workflow unchanged.

## T14

Mapbox building source untouched.

## T15

No Studio UI modifications.

---

# Out of Scope

Not included:

- texture painting
    
- outline rendering
    
- hand-drawn treatment
    
- neighborhood color systems
    
- Moebius shading
    
- custom imported meshes
    
- landmark libraries
    
- procedural city generation
    

Those belong to:

```text
0609X_WOS_GlobalIllustrationPass_v1.0.0_BUILD
```

---

# Expected Outcome

The city immediately gains recognizable architectural diversity.

Replacement actors stop reading as debug geometry and begin reading as intentional world infrastructure.

This establishes the visual foundation required for future illustration, texture, and atmospheric passes.