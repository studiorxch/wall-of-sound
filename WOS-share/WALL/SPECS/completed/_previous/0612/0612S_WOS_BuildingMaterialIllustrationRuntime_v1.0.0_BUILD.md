# 0612S_WOS_BuildingMaterialIllustrationRuntime_v1.0.0_BUILD

## Status

BUILD

---

# Purpose

Establish the first true building illustration system for WOS.

0612R proved that simple outlines and speckle overlays are insufficient to materially change the visual character of the city.

This build introduces a dedicated Building Material Illustration Runtime capable of transforming Mapbox-derived buildings into stylized illustrated architecture inspired by:

- Moebius
    
- Syd Mead
    
- French sci-fi illustration
    
- Architectural concept rendering
    
- Graphic novel environments
    

This build is visual-only.

No building geometry authority changes are authorized.

No density authority changes are authorized.

No replacement authority changes are authorized.

This build exists purely to establish material language.

---

# Problem Statement

Current buildings still read as:

Mapbox Buildings + Color Adjustments

rather than:

Illustrated Buildings

The visual difference is currently too subtle.

Viewers should immediately recognize:

before = generic GIS buildings

after = illustrated WOS architecture

without requiring explanation.

---

# Design Goal

Buildings should feel authored.

Not realistic.

Not photorealistic.

Not game-engine generic.

The visual target is:

architecture as illustration

rather than:

architecture as simulation

---

# Reference Characteristics

## A — Line Authority

Inspired by:

- Moebius
    
- French sci-fi illustration
    
- Architectural ink drawings
    

Buildings receive:

- edge definition
    
- silhouette definition
    
- roof separation
    
- material boundary lines
    

Lines should remain thin.

Never comic-book heavy.

---

## B — Territorial Surface Patches

Inspired by:

- weathered concrete
    
- paint erosion
    
- topographic regions
    
- country-border maps
    

Buildings should contain:

large irregular regions

rather than:

uniform flat fills

Examples:

- 20–40m patch regions
    
- organic borders
    
- non-repeating shapes
    

---

## C — Surface Grain

Inspired by:

- paper texture
    
- architectural rendering
    
- aged paint
    

Add:

- micro speckle
    
- micro grain
    

Only visible when zoomed.

Never noisy.

---

## D — Material Families

Buildings should not all share the same material.

Introduce:

- concrete
    
- painted concrete
    
- aged stone
    
- industrial metal
    
- glass-heavy
    
- utility structure
    
- civic structure
    

---

# Runtime Architecture

Create:

wall/systems/presentation/buildingMaterialIllustrationRuntime.js

---

# Layer Responsibilities

## Layer 1

Silhouette Layer

Responsible for:

- building outline
    
- roof edge definition
    
- major form separation
    

---

## Layer 2

Patch Layer

Responsible for:

- territorial regions
    
- organic material variation
    

---

## Layer 3

Grain Layer

Responsible for:

- micro texture
    
- surface breakup
    

---

## Layer 4

Material Classification Layer

Responsible for:

- building family assignment
    
- palette assignment
    

---

# Material Registry

Create:

BuildingMaterialRegistry

Example:

```js
{
  concrete: {},
  paintedConcrete: {},
  industrialMetal: {},
  glassTower: {},
  civicStone: {},
  utilityStructure: {}
}
```

Assignment may be:

- deterministic
    
- height-based
    
- feature-id-based
    

v1.0 does not require manual authoring.

---

# Geographic Patch Generation

Introduce deterministic patch generation.

Example:

same building = same patches every session

No random flicker.

No runtime instability.

Acceptable methods:

- feature-id hash
    
- building-id hash
    
- footprint hash
    

---

# Intensity Controls

Required:

```js
setOutlineIntensity(value)
setPatchIntensity(value)
setGrainIntensity(value)
setMaterialVariation(value)
```

Range:

0.0 → 2.0

---

# Studio / Wall Parity

Must operate identically in:

- Studio
    
- Wall
    

No separate implementations.

One runtime.

One authority.

---

# Debug Commands

```js
SBE.BuildingMaterialIllustrationRuntime.enable()
SBE.BuildingMaterialIllustrationRuntime.disable()
SBE.BuildingMaterialIllustrationRuntime.report()
SBE.BuildingMaterialIllustrationRuntime.setOutlineIntensity(v)
SBE.BuildingMaterialIllustrationRuntime.setPatchIntensity(v)
SBE.BuildingMaterialIllustrationRuntime.setGrainIntensity(v)
SBE.BuildingMaterialIllustrationRuntime.setMaterialVariation(v)
```

Mirror under:

```js
_wos.debug.buildingMaterialIllustration.*
```

---

# Explicit Non-Goals

This build does NOT:

- change building density
    
- change building replacement
    
- change publish authority
    
- change city authority
    
- change skyline authority
    
- change building geometry
    

Visual treatment only.

---

# Acceptance Tests

## T1

Enable runtime.

Visual difference immediately visible.

---

## T2

Buildings no longer read as flat GIS extrusions.

---

## T3

Material families visibly differ.

---

## T4

Patch regions visible.

No repetitive checkerboarding.

---

## T5

Outlines visible.

No heavy comic-book appearance.

---

## T6

Studio and Wall visually match.

---

## T7

Performance remains stable.

No measurable frame collapse.

---

## T8

All effects fully reversible.

```js
disable()
```

returns buildings to baseline appearance.

---

# Success Criteria

A screenshot should immediately communicate:

"This is a stylized illustrated city."

without explanation.

The city should begin moving visually toward:

- Moebius
    
- Syd Mead
    
- Architectural Concept Art
    
- StudioRich Worldbuilding
    

while preserving all existing building authorities and runtime systems.