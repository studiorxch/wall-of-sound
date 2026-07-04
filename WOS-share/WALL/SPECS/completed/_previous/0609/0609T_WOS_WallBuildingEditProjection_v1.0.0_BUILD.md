# 0609T_WOS_WallBuildingEditProjection_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Project Studio Map Lab building edits into the Wall runtime as a read-only visual layer.

0609S confirmed:

```txt
Studio Map Lab
→ select building
→ color building
→ notes/tags persist
→ reload Studio
→ edits restore
```

However Wall does not yet consume those edits.

This build connects:

```txt
Studio-authored Building Manifest
→ Wall map presentation
```

without making Wall an editor.

---

## Core Principle

Wall remains the broadcast surface.

Studio remains the creator/editor environment.

Wall may display building edits, but Wall must not author or mutate them.

---

## Current State

Studio Map Lab persists building edits to:

```txt
localStorage key: wos.maplab.buildings
```

Manifest format:

```json
{
  "version": "1.0.0",
  "buildings": {
    "composite:building:248143639": {
      "color": "#55e0d5",
      "hidden": false,
      "tags": ["hero", "tower"],
      "notes": "candidate replacement site"
    }
  }
}
```

Studio currently applies these edits through:

```txt
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapboxAdapter.js
studio/mapLab/mapLabView.js
```

Wall does not load this registry or apply the manifest.

---

## Objective

Add a Wall-side projection system that:

```txt
loads persisted building edits
discovers Wall building layers
applies color overrides
optionally applies hidden state
updates when edits change
never exposes editing controls
```

---

## Scope

### In Scope

- Add read-only Wall runtime for building edit projection.
- Read `localStorage["wos.maplab.buildings"]`.
- Apply color edits to Wall Mapbox building layers.
- Support both `fill` and `fill-extrusion` building layers.
- Reapply edits after Wall style reloads.
- Add debug API for projection status.
- Preserve Wall UI.

### Out of Scope

- No Wall inspector.
- No Wall editing controls.
- No Wall color picker.
- No Studio UI changes.
- No Canvas changes.
- No Glyph changes.
- No object replacement.
- No asset assignment.
- No persistence schema changes.

---

## New Module

Create:

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

Classification:

```txt
presentation-runtime
read-only
wall-safe
```

---

## Runtime Responsibilities

`BuildingEditProjectionRuntime` must:

1. Load the Studio Map Lab manifest from localStorage.
2. Parse building edit keys.
3. Discover building layers in the active Wall Mapbox style.
4. Apply per-building color overrides.
5. Optionally apply hidden-state opacity.
6. Reapply edits after style changes.
7. Expose debug status.

---

## Data Contract

### Storage Key

```txt
wos.maplab.buildings
```

### Building Key Format

```txt
source:sourceLayer:featureId
```

Example:

```txt
composite:building:248143639
```

### Supported Fields

```txt
color
hidden
tags
notes
```

### Wall Projection Behavior

| Field | Wall Behavior |
|---|---|
| color | Apply visual override |
| hidden | Apply opacity 0 if feasible |
| tags | Read-only metadata, no visual effect yet |
| notes | Read-only metadata, no visual effect yet |

---

## Layer Discovery

Runtime must detect building layers dynamically.

Candidate layers:

```txt
fill-extrusion layers
fill layers with source-layer containing "building"
layers with id containing "building"
```

The runtime must not assume a fixed layer ID.

---

## Paint Strategy

### For `fill-extrusion`

Apply:

```txt
fill-extrusion-color
```

Do not rely on data-driven opacity expressions if Mapbox GL v3 rejects them.

### For `fill`

Apply:

```txt
fill-color
fill-opacity
```

### Color Override Expression

Use a `match` expression against feature id.

Conceptual:

```js
[
  "match",
  ["id"],
  248143639, "#55e0d5",
  249848431, "#f2a23c",
  defaultColor
]
```

---

## Hidden State

Hidden is supported as a stored field.

For this build:

```txt
hidden=true
```

should attempt to render the building with opacity `0`.

If Mapbox GL rejects the expression for a layer type, log a warning and continue.

Do not crash.

---

## Style Reload Handling

Wall style may reload or change.

Projection runtime must reapply after:

```txt
map load
styledata
style.load
```

Use guards to avoid double-applying in unstable style states.

---

## Integration Point

Modify Wall runtime boot only enough to initialize the projection runtime once the Mapbox map exists.

Likely integration points:

```txt
wall/index.html
wall/main.js
wall/runtimes/mapboxViewportRuntime.js
```

Preferred minimal path:

1. Add script tag in `wall/index.html`.
2. Initialize after MapboxViewportRuntime exposes a ready map.
3. If map is not ready, retry safely.

Do not alter Wall UI.

---

## Public Debug API

Expose:

```js
_wos.debug.buildingEdits
```

Required methods:

```js
status()
reload()
apply()
clearProjection()
```

### status()

Returns:

```js
{
  loaded: true,
  editCount: 3,
  projectedColorCount: 3,
  hiddenCount: 0,
  buildingLayerCount: 2,
  layerIds: ["building", "maplab-buildings-3d"],
  lastAppliedAt: 1710000000000,
  lastError: null
}
```

### reload()

Reload manifest from localStorage and reapply.

### apply()

Apply currently loaded edits to current map style.

### clearProjection()

Remove projection paint overrides and restore defaults if feasible.

Does not delete localStorage.

---

## Safety Rules

- Never mutate the manifest from Wall.
- Never write to localStorage from Wall.
- Never add visible Wall UI.
- Never block Wall map rendering.
- Never crash if manifest is missing or corrupt.
- Never assume Studio is open.

---

## Error Handling

Required `try/catch` around:

```txt
localStorage parse
map.getStyle()
map.setPaintProperty()
map.addLayer()
style reload hooks
```

If manifest is corrupt:

```txt
projection disabled
warning logged
Wall continues normally
```

---

## Acceptance Tests

### T1 — Wall Loads Normally

Open Wall.

Expected:

```txt
Wall map renders normally.
No new visible UI.
```

---

### T2 — Studio Edit Appears on Wall

In Studio Map Lab:

```txt
select building
change color
reload Wall
```

Expected:

```txt
same building appears with edited color on Wall
```

---

### T3 — Multiple Buildings Project

Color multiple buildings in Studio.

Reload Wall.

Expected:

```txt
all edited buildings display their saved colors
```

---

### T4 — Wall Does Not Edit

Expected:

```txt
Wall has no color picker
Wall has no building inspector
Wall has no new buttons
Wall does not modify localStorage
```

---

### T5 — Missing Manifest Safe

Clear localStorage key:

```txt
wos.maplab.buildings
```

Reload Wall.

Expected:

```txt
Wall renders normally
No projection errors
```

---

### T6 — Corrupt Manifest Safe

Set invalid JSON in localStorage.

Reload Wall.

Expected:

```txt
Wall renders normally
Projection warning appears in console
No crash
```

---

### T7 — Style Reload Reapplies

Trigger Wall style reload or mode change.

Expected:

```txt
building edits reapply after style settles
```

---

### T8 — Debug API Works

Run:

```js
_wos.debug.buildingEdits.status()
```

Expected:

```txt
valid status object
```

---

## Required Report

Claude/Codex must report:

```txt
files changed
new runtime created
integration point used
manifest read count
building layers discovered
colors projected
hidden states projected
debug API output
acceptance test results
```

---

## Files

### New

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

### Modified

Likely:

```txt
wall/index.html
wall/main.js
```

Modify only what is necessary.

---

## Success Criteria

Wall displays Studio-authored building color edits without becoming an editor.

Final architecture:

```txt
Studio Map Lab
→ author building edits
→ persist manifest

Wall
→ read manifest
→ project edits visually
→ broadcast only
```

---

## Implementation Guide

- **Where:** Add `wall/systems/presentation/buildingEditProjectionRuntime.js`; load it from `wall/index.html`; initialize from `wall/main.js` or a safe Mapbox-ready hook.
- **What:** Run the existing local server, create color edits in Studio Map Lab, then reload Wall.
- **Expect:** Wall renders the same buildings with Studio-authored colors, without adding any new visible Wall controls.
