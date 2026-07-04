# 0612T_WOS_OrganicBuildingSurfacePatternRuntime_v1.0.0_BUILD

## Status

BUILD

---

# Purpose

Create the first visible organic surface-pattern runtime for WOS buildings.

0612R and 0612S confirmed that Mapbox `fill-extrusion` styling is not enough. Those passes can produce outlines, color bands, and footprint effects, but they cannot place meaningful organic borders on visible building faces.

This build targets the actual visible WOS building surfaces.

The required result is:

```text
large irregular patch regions
thin organic internal border lines
surface speckles
weathered color variation
visible on walls and roofs from the camera
```

This is a visual-material runtime only.

---

# Problem Statement

Current result:

```text
outline visible
organic borders missing
surface texture mostly invisible
building still reads as plain block
```

The current implementation is still too close to:

```text
Mapbox extrusion styling
```

The target is:

```text
illustrated architecture
```

The next pass must stop trying to solve this through Mapbox footprint layers.

---

# Target Visual Language

Reference direction:

```text
Moebius / French sci-fi illustration
Syd Mead-style material clarity
architectural concept art
weathered painted concrete
map-like territorial boundaries
geological crack regions
paper-grain surface texture
```

The visible building surface should contain:

```text
organic countries-on-a-map patches
thin internal ink lines
subtle speckles
subtle color wear
```

Not:

```text
random scratches
mud splatter
cartoon outlines
noisy grunge
TV static
uniform checkerboard
```

---

# Required File

Create:

```text
wall/systems/presentation/organicBuildingSurfacePatternRuntime.js
```

Version:

```text
v1.0.0
```

Add script tags to:

```text
wall/index.html
studio/index.html
```

Load after:

```text
buildingMaterialIllustrationRuntime.js
```

---

# Critical Scope Boundary

This build must target WOS-controlled building geometry/materials.

Primary targets:

```text
BuildingReplacementRuntime meshes
BuildingPreviewRuntime meshes
custom WOS replacement buildings
WOS-authored building materials
```

Secondary targets only if feasible:

```text
Mapbox fill-extrusion top/roof layers
```

Do not rely on Mapbox footprint-only overlays for the core visual result.

---

# Architecture Rule

Do not create another building authority.

This runtime is a material/pattern runtime.

It may attach generated textures/materials to WOS building objects.

It may not change:

```text
building selection
building suppression
building replacement registry
publish authority
map style authority
density authority
zero-state proof
camera logic
Studio UI
Canvas
Color Lab
Palette Lab
Glyph Lab
```

---

# Visual Requirements

## V1 — Organic Patch Map

Generate deterministic organic regions per building.

Required traits:

```text
large irregular shapes
non-repeating
stable between reloads
different per building
visible at camera distance
```

Patch boundaries should look like:

```text
country borders
weathered paint islands
geological plates
dried lake-bed outlines
```

---

## V2 — Thin Internal Boundary Lines

Patch borders must be line-drawn.

Target:

```text
0.5px to 1.5px perceived line width
dark muted line
not neon
not thick cartoon
```

The line should remain readable on:

```text
roof surfaces
front-facing wall surfaces
side wall surfaces
```

---

## V3 — Speckle / Grain

Add micro surface breakup.

Target:

```text
low-opacity dots
paper grain
aged concrete
dust
```

Grain must be subtle.

Strong mode may exaggerate grain only for proof.

---

## V4 — Weathered Patch Color

Patch regions should have slight color variation.

Target:

```text
base color
patch color
weather color
edge dirt tone
```

Variation should be visible but restrained.

---

## V5 — Roof and Wall Visibility

The effect must be visible on at least:

```text
roof/top face
one major side wall
one front wall or visible facade
```

If only the roof changes, this build fails.

If only ground footprints change, this build fails.

---

# Implementation Strategy

Preferred implementation:

```text
procedural canvas texture
assigned to WOS building mesh materials
UV-scaled by building dimensions
deterministic seed from building key / feature id
```

Acceptable alternatives:

```text
THREE.CanvasTexture
custom shader material
mesh face material arrays
procedural SVG texture converted to canvas
```

Avoid:

```text
Mapbox fill-pattern footprint only
screen-space overlays
random per-frame noise
non-deterministic texture generation
```

---

# Required Pattern Generator

Create a small deterministic generator.

Required functions:

```js
createSeedFromBuildingKey(buildingKey)
generatePatchCells(seed, width, height, options)
drawPatchTexture(canvas, cells, options)
createBuildingSurfaceTexture(buildingKey, materialProfile, options)
```

The generator should be reusable.

No external dependency.

No network dependency.

No image assets required.

---

# Material Profiles

Include at least four profiles:

```text
warmConcrete
paintedConcrete
industrialGreen
signalOrange
```

Each profile defines:

```js
{
  base: string,
  patch: string,
  weather: string,
  line: string,
  grain: string
}
```

---

# Runtime API

Expose:

```js
SBE.OrganicBuildingSurfacePatternRuntime.enable()
SBE.OrganicBuildingSurfacePatternRuntime.disable()
SBE.OrganicBuildingSurfacePatternRuntime.report()
SBE.OrganicBuildingSurfacePatternRuntime.setIntensity(value)
SBE.OrganicBuildingSurfacePatternRuntime.setProfile(profileId)
SBE.OrganicBuildingSurfacePatternRuntime.regenerate()
```

Mirror under:

```js
_wos.debug.organicBuildingSurface.*
```

---

# Intensity Modes

## Subtle

Default.

```text
visible but restrained
thin borders
low grain
soft patch variation
```

## Strong

Proof mode.

```text
obvious organic borders
stronger patch contrast
clear speckles
```

Strong mode exists only to verify the system works.

---

# Required Report

`report()` must return:

```js
{
  ok: true,
  version: "1.0.0",
  enabled: true,
  profile: "warmConcrete",
  intensity: 1,
  targetRuntimeFound: true,
  targetMeshCount: 0,
  texturedMeshCount: 0,
  skippedMeshCount: 0,
  generatedTextureCount: 0,
  wallSupported: true,
  studioSupported: true,
  lastError: null
}
```

---

# Studio / Wall Parity

The same generated pattern must appear in:

```text
Studio Map Lab Preview
Wall broadcast/main view
```

Allowed difference:

```text
Wall may include weather/time overlays.
```

Forbidden difference:

```text
different pattern seed
different color profile
pattern visible in one view but absent in the other
```

---

# Acceptance Tests

## T1 — Runtime Loads

Console:

```js
typeof SBE.OrganicBuildingSurfacePatternRuntime.enable
```

Expected:

```text
"function"
```

## T2 — Enable

Console:

```js
_wos.debug.organicBuildingSurface.enable()
```

Expected:

```text
ok:true
visible organic patches on WOS building surfaces
```

## T3 — Strong Mode Proof

Console:

```js
_wos.debug.organicBuildingSurface.setIntensity(2)
```

Expected:

```text
organic borders clearly visible on building surfaces
```

## T4 — Roof + Wall Proof

Visual confirmation required:

```text
roof pattern visible
side wall pattern visible
front/major facade pattern visible
```

## T5 — Disable

Console:

```js
_wos.debug.organicBuildingSurface.disable()
```

Expected:

```text
building returns to previous material
```

## T6 — Deterministic Regeneration

Console:

```js
_wos.debug.organicBuildingSurface.regenerate()
```

Expected:

```text
same building receives same pattern
no flicker
no random redesign
```

## T7 — No New UI

Expected:

```text
no new tabs
no new panels
no inspector controls
no library controls
```

## T8 — No Authority Drift

Expected:

```text
no changes to publish authority
no changes to map style authority
no changes to density authority
no changes to zero-state proof
no changes to replacement registry schema
```

---

# Visual Verification Requirement

Claude/Codex must return screenshot descriptions:

```text
Before:
plain WOS building material

After subtle:
organic patch borders visible but restrained

After strong:
clear map-like organic borders and speckles on roof and walls
```

Console-only pass is not acceptable.

---

# Failure Conditions

This build fails if:

```text
only outlines change
only footprint/ground plane changes
only color bands change
organic borders are not visible
walls do not receive pattern
Studio and Wall diverge
new UI is added
```

---

# Explicit Non-Goals

Do not build:

```text
new Color Lab
new Palette Lab
new Glyph Lab
new Canvas feature
new building authoring workflow
new density filter
new skyline filter
new publish workflow
new replacement workflow
new inspector controls
```

---

# Claude Instruction

Keep the build narrow.

The problem is not another authority.

The problem is visible surface material.

Do not add UI.

Do not invent new workflows.

Do not leave failed Mapbox overlay experiments in the code.

If the texture approach cannot attach to existing WOS meshes, report that honestly and stop.

Do not fake success with footprint layers.

---

# Deliverables

Return:

```text
1. Files changed
2. Exact load order
3. Public API proof
4. Debug API proof
5. Target runtime / mesh discovery report
6. Before screenshot description
7. After subtle screenshot description
8. After strong screenshot description
9. Roof + wall visibility proof
10. Studio/Wall parity result
11. Remaining limitations
```

---

# Success Definition

This build succeeds when the WOS replacement building visibly contains organic, map-like surface borders and speckles on actual building faces.

A viewer should be able to see the difference immediately without reading the console.
