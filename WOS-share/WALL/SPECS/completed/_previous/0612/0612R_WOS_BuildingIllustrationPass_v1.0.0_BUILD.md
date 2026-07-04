# 0612R_WOS_BuildingIllustrationPass_v1.0.0_BUILD

## Status

BUILD

---

# Purpose

Create the first WOS building illustration pass.

This build moves WOS buildings away from plain Mapbox / generic 3D blocks and toward a readable illustrated city treatment:

```text
thin outlines
surface speckles
weathered patches
geographic / territory-like contour marks
```

This is a visual presentation pass only.

It must not create a new building authority, replacement authority, map authority, publish authority, or density authority.

---

# Current Baseline

0612Q established map style sync between Studio Map Lab and Wall.

The maps now share the same WOS style authority.

The current building appearance already shows useful outlines, but the treatment is still too clean and digital.

Target direction:

```text
Moebius-inspired
technical comic illustration
thin linework
weathered surfaces
organic patches
map-like contour boundaries
worldbuilding texture
```

---

# Required Files

Create one new runtime:

```text
wall/systems/presentation/buildingIllustrationPass.js
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
wosMapStyleAuthority.js
threeViewStyleParityLock.js
```

---

# Authority Boundary

This system may control:

```text
building outline styling
building illustration texture overlays
building speckle overlays
building patch / contour visual layers
```

This system must not control:

```text
map style selection
published registry
draft registry
building replacement logic
building suppression logic
city density logic
camera logic
weather
time-of-day
actor systems
Canvas
Color Lab
Palette Lab
Glyph Lab
```

---

# Design Rule

Do not add new Studio UI controls.

Expose debug commands only.

This pass should prove the look before adding controls.

---

# Visual Targets

## T1 — Thin Building Outlines

Target:

```text
0.75px to 1.5px perceived width
distance-aware
non-dominant
readable at cinematic zoom
```

Avoid:

```text
thick cartoon stroke
neon outline
high-contrast blueprint wireframe
```

## T2 — Surface Speckles

Target:

```text
world-anchored
low opacity
irregular
paper / concrete / dust feeling
```

Avoid:

```text
screen-space noise
animated TV static
uniform dots
heavy grunge
```

## T3 — Geographic Patch Boundaries

Add large, organic patch boundaries on building surfaces.

These should feel like:

```text
map borders
weathered paint regions
geological cracks
dried lake beds
country-boundary shapes
```

They must not look like:

```text
random scratches
mud splatter
graffiti tags
damage decals only
```

## T4 — Weathered Color Variation

Allow subtle color variation on building surfaces.

Target:

```text
base tone
patch tone
weather tone
shadow tone
```

---

# Implementation Strategy

Use existing Mapbox layer/style mechanisms where possible.

Preferred order:

```text
1. Adjust existing outline layer paint
2. Add WOS-owned overlay layers only if needed
3. Use generated GeoJSON / procedural features only if needed
```

Do not mutate source building identity.

Do not duplicate building replacement data.

---

# Required Public API

Expose:

```js
SBE.BuildingIllustrationPass.enable()
SBE.BuildingIllustrationPass.disable()
SBE.BuildingIllustrationPass.report()
SBE.BuildingIllustrationPass.setIntensity(value)
```

Expose debug surface:

```js
_wos.debug.buildingIllustration.enable()
_wos.debug.buildingIllustration.disable()
_wos.debug.buildingIllustration.report()
_wos.debug.buildingIllustration.setIntensity(value)
```

---

# Required Modes

## Mode 1 — Off

No illustration pass active.

Map returns to normal building styling.

## Mode 2 — Subtle

Default.

```text
thin outline
light speckles
light patch boundaries
minimal color weathering
```

## Mode 3 — Strong

Debug only.

```text
more visible speckles
more visible contour patching
stronger weathering
```

Used only to verify that the system is actually working.

---

# Required Report

`report()` must return:

```js
{
  ok: true,
  version: "1.0.0",
  enabled: true,
  mode: "subtle",
  intensity: 1,
  mapStyleAuthorityPresent: true,
  activeStyleId: "wos.dark.cyan",
  targetLayerCount: 0,
  outlineLayerCount: 0,
  speckleLayerCount: 0,
  patchLayerCount: 0,
  affectedLayerIds: [],
  skippedLayerIds: [],
  lastError: null
}
```

---

# Acceptance Tests

## T1 — Loads in Wall

Console:

```js
typeof SBE.BuildingIllustrationPass.enable
```

Expected:

```text
"function"
```

## T2 — Loads in Studio

Console:

```js
typeof SBE.BuildingIllustrationPass.enable
```

Expected:

```text
"function"
```

## T3 — Enable

Console:

```js
_wos.debug.buildingIllustration.enable()
```

Expected:

```text
ok:true
visible building illustration treatment
```

## T4 — Disable

Console:

```js
_wos.debug.buildingIllustration.disable()
```

Expected:

```text
map returns to prior building treatment
```

## T5 — Strong Debug Mode

Console:

```js
_wos.debug.buildingIllustration.setIntensity(2)
```

Expected:

```text
speckles and geographic patch marks become visibly stronger
```

## T6 — Studio / Wall Match

With 0612Q active:

```text
Wall and Studio Map Lab should show the same illustration treatment.
```

Allowed difference:

```text
Wall may still show broadcast weather/time overlays.
```

Forbidden difference:

```text
different building colors
different outline behavior
different patch treatment
```

## T7 — No New UI

Expected:

```text
No new Studio panel
No new tab
No new inspector section
No new buttons
```

## T8 — No Authority Drift

Expected:

```text
No changes to publish authority
No changes to map style authority
No changes to building replacement authority
No changes to zero-state proof
No changes to density authority
```

---

# Visual Verification Requirement

Claude/Codex must provide screenshot descriptions:

```text
Before:
plain building treatment

After subtle:
thin outlined illustrated building treatment

After strong:
clearly visible speckles and geographic patches
```

Do not report pass from console only.

---

# Non-Goals

Do not build:

```text
new Color Lab
new Palette Lab
new Glyph Lab
new Canvas system
new building authoring system
new replacement system
new district system
new skyline filter
new density authority
new map sync authority
new UI
```

---

# Claude Instruction

Keep this pass narrow.

This is not a new system for authoring buildings.

This is an illustration layer for buildings that already render.

Do not invent new workflows.

Do not add controls.

Do not create hidden UI.

Do not leave unused code paths.

If an approach fails, remove it before trying the next approach.

---

# Deliverables

Return:

```text
1. Files changed
2. Exact load order
3. Public API proof
4. Debug API proof
5. Before screenshot description
6. After subtle screenshot description
7. After strong screenshot description
8. Studio/Wall parity result
9. Remaining visual limitations
```

---

# Success Definition

This build succeeds when:

```text
WOS buildings visibly move toward an illustrated, Moebius-like city treatment,
without adding new Studio complexity.
```
