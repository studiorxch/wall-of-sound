# 0612M_WOS_BuildingZeroStateProof_v1.0.0_BUILD

## Status

BUILD

## Purpose

Create a binary proof state that removes all non-WOS building geometry from the active map.

This build exists to stop the ambiguity around whether WOS actually controls building visibility.

Before skyline filters, landmark keep-rules, ghost footprints, or single-building replacement can be trusted, WOS must prove:

```text
All real buildings OFF.
WOS replacement layer ON.
```

---

## Problem

Recent builds reported successful building filtering, but the visible map still appeared dense.

This means the system may be modifying one layer while another layer continues rendering the visible buildings.

That makes every future result unreliable.

The next step must be a hard visual proof:

```text
No Mapbox buildings.
No host buildings.
No Standard buildings.
No dark-v11 building extrusions.
Only WOS-owned replacement objects.
```

---

## Core Rule

This is not a filter build.

This is a zero-state proof build.

The system must prove that every non-WOS building source can be visually removed from the active view.

---

## Required Command

Add:

```js
_wos.debug.buildings.zeroState()
```

and:

```js
SBE.BuildingZeroStateProof.zeroState()
```

Optional restore command:

```js
_wos.debug.buildings.restoreBuildings()
SBE.BuildingZeroStateProof.restore()
```

---

## Required New System

Suggested file:

```text
wall/systems/presentation/buildingZeroStateProof.js
```

Version:

```text
v1.0.0
```

Classification:

```text
diagnostic-proof
building-visibility-authority-test
```

This system must not become the long-term density authority.

It is a proof tool.

---

## Required Behavior

### B1 — Detect all visible building layers

Audit every active style layer:

```js
map.getStyle().layers
```

Classify layers as:

```text
WOS replacement layer
WOS preview layer
WOS host/query layer
Mapbox fill-extrusion building layer
Mapbox model building layer
unknown building-like layer
non-building layer
```

---

### B2 — Hide all non-WOS building layers

Zero-state mode must hide or visually eliminate every building layer except:

```text
wos-replacement-layer
wos-preview-*
```

Allowed methods:

```text
setLayoutProperty(layerId, "visibility", "none")
setPaintProperty(layerId, "fill-extrusion-opacity", 0)
setFilter(layerId, ["==", ["id"], "__NO_MATCH__"])
```

Use the safest method per layer type.

---

### B3 — Preserve WOS replacement layer

Never hide:

```text
wos-replacement-layer
wos-replacement-markers
wos-preview-*
```

Replacement objects must remain visible.

---

### B4 — Return exact proof report

Return:

```js
{
  ok: true,
  zeroStateActive: true,
  hiddenLayerCount: 0,
  preservedWosLayerCount: 0,
  modelLayerCount: 0,
  fillExtrusionLayerCount: 0,
  renderedBuildingFeatureCountBefore: 0,
  renderedBuildingFeatureCountAfter: 0,
  wosReplacementLayerPresent: true,
  duplicateReplacementLayersPresent: false,
  layers: []
}
```

Each layer entry:

```js
{
  id,
  type,
  source,
  sourceLayer,
  classification,
  action,
  success,
  error
}
```

---

### B5 — Visual proof

After `zeroState()`:

Expected visible result:

```text
roads remain
water remains
labels remain
all non-WOS buildings gone
WOS replacement remains visible
```

---

### B6 — Restore path

`restore()` must restore all original layer visibility, filters, and opacity values touched by zero-state mode.

Do not permanently mutate style configuration.

---

## Debug API

Expose:

```js
_wos.debug.buildings.zeroState()
_wos.debug.buildings.restoreBuildings()
_wos.debug.buildings.zeroStateReport()
```

Also expose:

```js
SBE.BuildingZeroStateProof.zeroState()
SBE.BuildingZeroStateProof.restore()
SBE.BuildingZeroStateProof.report()
```

---

## Validation Checklist

### T1 — Command exists

Run:

```js
typeof _wos.debug.buildings.zeroState
```

Expected:

```text
"function"
```

---

### T2 — Zero state removes all non-WOS buildings

Run:

```js
_wos.debug.buildings.zeroState()
```

Expected:

```text
No non-WOS 3D building geometry visible.
```

---

### T3 — WOS replacement survives

Expected:

```js
map.getLayer("wos-replacement-layer") !== undefined
```

and visually:

```text
WOS replacement remains visible.
```

---

### T4 — Duplicate replacement layers absent

Expected:

```js
map.getLayer("wos-building-replacement-layer") === undefined
map.getSource("wos-building-replacements") === undefined
```

---

### T5 — Report identifies every touched layer

Expected:

```text
Every building-like layer is listed with classification and action.
```

---

### T6 — Restore works

Run:

```js
_wos.debug.buildings.restoreBuildings()
```

Expected:

```text
Original building visibility returns.
```

---

### T7 — Screenshot proof

Provide before/after screenshots:

```text
Before: buildings visible
After: all non-WOS buildings gone, WOS replacement remains
```

---

## Non-Goals

Do not implement:

```text
skyline-only keep rules
landmark registry
ghost footprints
canvas surfaces
city interest graph
event scoring
single-building replacement workflow
new replacement runtime
new map renderer
new style authority
```

---

## Claude Instruction

Do not report success based only on console values.

This build requires visual proof.

If any non-WOS building remains visible, return:

```text
FAIL_VISIBLE_BUILDINGS_REMAIN
```

and identify the rendering layer if possible.

Do not continue to skyline filtering until zero-state passes.

---

## Deliverables

Claude/Codex must return:

```text
1. Exact diff
2. Files changed
3. New debug commands
4. Layer audit report
5. Before/after screenshot description
6. WOS replacement survival proof
7. Restore proof
8. Any visible remaining buildings
9. Remaining blockers
```

---

## Success Definition

Success is:

```text
One command removes every non-WOS building from the active view while preserving WOS replacement objects.
```

This becomes the hard baseline for every future building-density or skyline-authoring build.
