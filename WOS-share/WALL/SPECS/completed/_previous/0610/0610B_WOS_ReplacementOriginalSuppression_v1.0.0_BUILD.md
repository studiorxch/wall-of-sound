# 0610B_WOS_ReplacementOriginalSuppression_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Make building replacements read as true replacements by suppressing the original Mapbox building underneath the replacement actor.

0610A proved:

```txt
replacement actor → inherits building footprint
```

Current visual failure:

```txt
original Mapbox building + replacement actor overlay
```

Target behavior:

```txt
replacement actor visually owns the building footprint
```

This build suppresses or dims the original Mapbox building when `replacement.enabled === true`.

---

## Core Principle

Do not delete Mapbox truth.

Do not mutate the composite source.

Suppress the original building only at the presentation layer.

---

## Current Problem

Replacement actors are now footprint-aware, but the source Mapbox building is still visible underneath or beside the replacement geometry.

This causes:

```txt
double buildings
visual clutter
replacement reads as overlay
selected building still looks like original structure
```

The replacement cannot read as replacement until the original building is visually reduced.

---

## Scope

### In Scope

- Suppress original Mapbox building rendering for replacement-enabled buildings.
- Prefer non-destructive opacity/color expressions.
- Preserve replacement actor visibility.
- Preserve existing color edit projection.
- Preserve hidden behavior.
- Preserve existing manifests.
- Add debug reporting.

### Out of Scope

- No Mapbox source mutation.
- No building deletion.
- No mesh carving.
- No GLTF.
- No Canvas work.
- No Glyph work.
- No new Studio UI.
- No replacement geometry changes.
- No archetype changes.

---

## Files

### Primary Modify

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

### Possibly Modify

```txt
studio/mapLab/mapboxAdapter.js
```

Only if Studio Map Lab needs the same suppression behavior while editing.

### Do Not Modify

```txt
wall/systems/runtime/buildingReplacementRuntime.js
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapInspector.js
studio/mapLab/mapLabView.js
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

unless absolutely required.

---

## Required Behavior

For each building edit:

```json
{
  "replacement": {
    "enabled": true
  }
}
```

the original Mapbox building should be visually suppressed.

Minimum:

```txt
opacity reduced to 0.08–0.18
```

Preferred:

```txt
opacity reduced to 0
```

if safe.

---

## Important Distinction

This build suppresses the **original Mapbox building**.

It must not suppress:

```txt
wos-replacement-markers
wos-replacement-layer
replacement actors
selection outline
hover outline
```

---

## Paint Strategy

### For `fill-extrusion` building layers

Apply a match expression to:

```txt
fill-extrusion-opacity
```

Conceptual:

```js
[
  "match",
  ["id"],
  replacementFeatureId1, 0.08,
  replacementFeatureId2, 0.08,
  defaultOpacity
]
```

If Mapbox GL v3 rejects per-feature extrusion opacity, fallback to color dimming.

Fallback:

```txt
fill-extrusion-color
```

with suppressed buildings mapped to transparent or dark desaturated gray.

### For `fill` building layers

Apply match expression to:

```txt
fill-opacity
```

Fallback to:

```txt
fill-color
```

---

## Replacement + Color Interaction

Priority order:

1. `hidden === true`
2. `replacement.enabled === true`
3. `edit.color`
4. default building style

Rules:

### hidden=true

Original building should be fully suppressed.

### replacement.enabled=true

Original building should be suppressed/dimmed.

Replacement actor remains visible.

### edit.color only

Original building receives color projection as in 0609T.

No suppression.

---

## Replacement + Hidden Interaction

If both are true:

```json
{
  "hidden": true,
  "replacement": {
    "enabled": true
  }
}
```

Original building should be suppressed.

Replacement actor should remain visible.

---

## Layer Discovery

Reuse existing building layer discovery from `buildingEditProjectionRuntime.js`.

Do not hardcode only one layer.

Candidate building layers:

```txt
fill-extrusion
fill with source-layer building
layer id containing building
```

---

## Original Paint Preservation

Before applying suppression expressions, runtime must preserve original paint values per layer:

```txt
fill-extrusion-color
fill-extrusion-opacity
fill-color
fill-opacity
```

`clearProjection()` must restore original paint values when feasible.

---

## Style Reload Handling

On style reload:

```txt
rediscover building layers
restore original paint cache if needed
reapply color edits
reapply suppression
```

Replacement suppression must survive:

```txt
map style reload
Wall reload
Studio manifest edits
cross-tab storage event
```

---

## Debug API

Extend:

```js
_wos.debug.buildingEdits.status()
```

Add:

```js
{
  replacementSuppressionCount: 3,
  suppressionStrategy: "opacity-match",
  suppressionLayerCount: 2,
  suppressionFallbackCount: 0
}
```

Also add if low-risk:

```js
_wos.debug.buildingEdits.suppressionStatus()
```

Returns detailed layer-level state:

```js
{
  layers: [
    {
      id: "building",
      type: "fill",
      strategy: "fill-opacity",
      suppressedCount: 3,
      fallback: false
    }
  ]
}
```

---

## Studio Map Lab Behavior

Studio Map Lab should preferably show the same result:

```txt
replacement-enabled building original dims
replacement cue/actor remains obvious
```

If Studio suppression is risky, leave Studio unchanged and apply suppression only on Wall.

Do not block Wall success on Studio parity.

---

## Error Handling

Required try/catch around:

```txt
map.getStyle()
map.getPaintProperty()
map.setPaintProperty()
expression construction
style reload hooks
manifest parsing
```

If suppression fails on one layer:

```txt
log warning
continue other layers
replacement actor still renders
```

No crash.

---

## Acceptance Tests

### T1 — Replacement Suppresses Original

Enable replacement on a building.

Expected:

```txt
original Mapbox building is hidden or visibly dimmed
replacement actor remains visible
```

### T2 — Color-Only Building Still Works

Set color without replacement.

Expected:

```txt
building color projection still works
no suppression
```

### T3 — Hidden Building Still Works

Set hidden true.

Expected:

```txt
original building suppressed
```

### T4 — Hidden + Replacement

Set hidden true and replacement enabled.

Expected:

```txt
original building suppressed
replacement actor remains visible
```

### T5 — Multiple Replacements

Enable replacements on multiple buildings.

Expected:

```txt
all original source buildings suppressed
all replacement actors visible
```

### T6 — Clear Projection Restores

Run:

```js
_wos.debug.buildingEdits.clearProjection()
```

Expected:

```txt
original building paint restored
replacement runtime not deleted
localStorage not modified
```

### T7 — Reload Persists

Reload Wall.

Expected:

```txt
suppression reapplies
replacement actors reappear
```

### T8 — Style Reload Recovery

Trigger style reload.

Expected:

```txt
suppression reapplies after style settles
```

### T9 — No Source Mutation

Expected:

```txt
composite source unchanged
```

### T10 — No Canvas/Glyph Changes

Expected:

```txt
no Canvas/Glyph files modified
```

### T11 — No Studio UI Changes

Expected:

```txt
no new Studio controls
```

---

## Required Report

Claude/Codex must report:

```txt
files changed
suppression strategy used
layers discovered
suppressed building count
fallback behavior
clearProjection restore behavior
debug API output
acceptance test results
```

---

## Success Criteria

Replacement actors no longer look like decorations sitting on top of Mapbox buildings.

The user should see:

```txt
original building disappears/dims
replacement architecture owns footprint
```

without modifying Mapbox source data.

---

## Implementation Guide

- **Where:** Start in `wall/systems/presentation/buildingEditProjectionRuntime.js`; optionally add Studio parity in `studio/mapLab/mapboxAdapter.js` only if low-risk.
- **What:** Extend existing projection expressions so replacement-enabled source buildings are opacity-suppressed while replacement actors remain visible.
- **Expect:** Wall shows replacement actors without the original Mapbox building competing underneath them.
