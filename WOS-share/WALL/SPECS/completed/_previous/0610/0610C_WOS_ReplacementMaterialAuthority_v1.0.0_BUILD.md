# 0610C_WOS_ReplacementMaterialAuthority_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Make replacement actors read as **solid world objects**, not translucent projection overlays.

0610A made replacements footprint-aware.

0610B suppressed the original Mapbox building beneath replacement actors.

Current visual failure:

```txt
replacement actor is visible
but still reads ghosted / translucent / projection-like
```

Target behavior:

```txt
replacement actor reads as solid architecture
```

This build establishes material authority for replacement actors.

---

## Core Principle

Replacement actors are world geometry.

They must use their own material rules, independent of source-building suppression.

The source building can be hidden or dimmed.

The replacement actor must remain solid, readable, and visually dominant.

---

## Scope

### In Scope

- Increase replacement actor opacity.
- Separate replacement material rules from building suppression rules.
- Add basic material roles:
  - body
  - roof
  - accent
  - beacon
  - stack
  - foundation
- Add per-part material metadata to generated features.
- Apply color variation by material role through Mapbox expressions.
- Preserve replacement geometry and footprint logic.
- Preserve manifest schema.
- Preserve Studio UI.
- Preserve Wall projection behavior.

### Out of Scope

- No texture system.
- No imported models.
- No GLTF.
- No PBR.
- No shader work.
- No outline pass.
- No hand-drawn treatment.
- No new archetypes.
- No Studio UI changes.
- No Canvas/Glyph changes.

---

## Files

### Modify

```txt
wall/systems/runtime/buildingReplacementRuntime.js
```

### Do Not Modify Unless Absolutely Required

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
studio/mapLab/*
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

---

## Required Material Model

Each replacement part feature should include:

```js
properties: {
  color,
  materialColor,
  materialRole,
  base,
  height
}
```

Supported `materialRole` values:

```txt
body
roof
accent
beacon
stack
foundation
```

---

## Material Authority

Add a material palette per archetype.

Example:

```js
var ARCHETYPE_MATERIALS = {
  warehouse: {
    body: "#d8c6a1",
    roof: "#f2a23c",
    accent: "#9c7b4c"
  },
  skyscraper: {
    body: "#9fb6c8",
    roof: "#3dd8c5",
    accent: "#d9eef7"
  }
}
```

The current archetype color remains the fallback, but should not be the only material source.

---

## Opacity

Replacement actor opacity should default to:

```txt
0.96
```

Minimum acceptable:

```txt
0.90
```

Do not use opacity values that make replacement actors feel ghosted.

---

## Layer Paint Rules

Current:

```js
"fill-extrusion-color": ["get", "color"]
```

Required:

```js
"fill-extrusion-color": [
  "coalesce",
  ["get", "materialColor"],
  ["get", "color"]
]
```

Keep:

```js
"fill-extrusion-height": ["get", "height"]
"fill-extrusion-base": ["get", "base"]
```

Update:

```js
"fill-extrusion-opacity": 0.96
```

---

## Feature Generation

Update `_p()` or part descriptor logic to include:

```js
materialRole
```

Example:

```js
_p(W, D, 0, H * 0.56, 0, 0, "body")
_p(W * 0.50, D, H * 0.56, H * 0.76, 0, 0, "roof")
```

Update `_partsToFeatures()` to emit:

```js
properties.materialRole
properties.materialColor
```

---

## Archetype Material Rules

### Warehouse

```txt
body = warm concrete
roof = orange / rust
accent = dark trim
```

### Skyscraper

```txt
body = cool glass gray-blue
roof = teal crown
accent = pale highlight
```

### Apartment

```txt
body = muted residential blue-gray
roof = dark roof
accent = rooftop water tower color
```

### Radio Tower

```txt
body = dark infrastructure base
stack/shaft = red
beacon = bright cap
```

### Pagoda

```txt
body = magenta / warm wall
roof = deeper tier color
accent = bright spire
```

### Civic Block

```txt
body = stone / cream
roof = gold dome
accent = pale trim
```

### Industrial Stack

```txt
body = industrial ochre
stack = dark rust
accent = smoke-cap color
```

### Custom Placeholder

```txt
body = white
roof/accent = light gray
```

---

## Debug

Extend:

```js
_wos.debug.buildingReplacement.list()
```

Each actor should include:

```js
materialProfile
```

Add if low-risk:

```js
_wos.debug.buildingReplacement.materials()
```

Returns:

```js
ARCHETYPE_MATERIALS
```

---

## Safety Rules

- Do not change manifest schema.
- Do not change Studio controls.
- Do not change replacement placement.
- Do not change original suppression.
- Do not touch Mapbox composite source.
- Do not make actors translucent.
- Do not remove existing archetype color fallback.

---

## Acceptance Tests

### T1 — Replacement Actor Looks Solid

Expected:

```txt
replacement actor opacity reads solid at close and medium zoom
```

### T2 — Source Suppression Still Works

Expected:

```txt
original Mapbox building remains suppressed
replacement actor remains visible
```

### T3 — Warehouse Has Body/Roof Difference

Expected:

```txt
warehouse body and roof use distinct material colors
```

### T4 — Industrial Stack Has Stack Material

Expected:

```txt
stack reads distinct from factory body
```

### T5 — Radio Tower Has Beacon Material

Expected:

```txt
beacon/top cap reads distinct
```

### T6 — Pagoda Has Tier Material Variation

Expected:

```txt
pagoda tiers read as intentional stacked architecture
```

### T7 — Existing Footprint Authority Unchanged

Expected:

```txt
replacement still uses source building footprint
```

### T8 — Manifest Schema Unchanged

Expected:

```txt
existing saved replacements still work
```

### T9 — Cross-Tab Sync Unchanged

Expected:

```txt
Studio replacement changes still update Wall
```

### T10 — No Studio UI Changes

Expected:

```txt
no Studio files modified
```

### T11 — No Canvas/Glyph Changes

Expected:

```txt
no Canvas/Glyph files modified
```

---

## Required Report

Claude/Codex must report:

```txt
files changed
material model added
material roles added
opacity before/after
layer paint changes
archetype material profiles
debug API output
acceptance test results
```

---

## Success Criteria

Replacement actors stop reading as translucent overlays and begin reading as solid, authored architectural objects.

The user should see:

```txt
suppressed source building
+
solid replacement architecture
```

not:

```txt
ghosted colored projection
```

---

## Implementation Guide

- **Where:** Modify `wall/systems/runtime/buildingReplacementRuntime.js`.
- **What:** Add material-role metadata to replacement geometry parts, generate material colors per archetype, and raise replacement fill-extrusion opacity to solid values.
- **Expect:** Replacement actors appear visually solid with simple body/roof/accent material separation while retaining footprint authority and suppression behavior.
