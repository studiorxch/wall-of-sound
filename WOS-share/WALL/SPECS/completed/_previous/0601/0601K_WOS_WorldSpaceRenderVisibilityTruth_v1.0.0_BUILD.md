# 0601K_WOS_WorldSpaceRenderVisibilityTruth_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- `0601J_WOS_WorldSpaceTransformMigration` has been implemented.
- `WorldSpaceVehicleLayer` now defaults to `transformMode: modelMatrix`.
- `transformCompare()` currently reports `modelMatrixVisible` / `vehicleMatrixVisible` using `lastTransformAt`.
- `lastTransformAt` proves transform execution only; it does **not** prove render visibility.
- Current next risk is false confidence: debug output may say “visible” when the mesh was only transformed.
- Vehicle art, buildings, bridges, drones, fish, props, and actor expansion must remain paused until render truth is corrected.

## Purpose

Correct the debug truth model for world-space vehicle rendering.

Current problem:

```text
transformCompare() uses transform success as visibility success.
```

Required distinction:

```text
transformed ≠ rendered ≠ visible
```

Target result:

```text
WorldSpaceVehicleLayer reports transform success, render pass success, projection success, and visibility confidence separately.
```

## Core Doctrine

```text
Never call something visible unless visibility was actually proven.
```

## Non-Goals

Do not modify:

- Mapbox style
- presentation authority
- route logic
- traffic spawn rules
- hero runtime
- camera choreography
- vehicle geometry
- actor architecture
- bridges/buildings/props
- Three proof harness except for optional reference

Do not add new vehicle art.

## Required Files

Patch:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Reference:

```text
wall/systems/render/threePrimitiveVisibilityHarness.js
```

## Definitions

### Transform Success

```text
The mesh received a valid Mercator/model matrix update.
```

Proof field:

```js
mesh._lastTransformAt
```

### Render Pass Success

```text
The custom-layer render callback attempted to render that mesh/scene.
```

Proof field:

```js
mesh._lastRenderAt
```

### Projection Success

```text
The actor projects to a reasonable screen-space coordinate within or near the viewport.
```

Proof field:

```js
screenPosition = map.project([lng, lat])
```

### Visibility Confidence

Allowed confidence values:

```text
none
transform_only
rendered_unconfirmed
projected_on_screen
visual_confirmed
```

Do not use `visible: true` to mean actual human-visible proof. `visible` may only mean the mesh/DOM flag.

## Rename Misleading Fields

In `transformCompare()`, replace:

```js
modelMatrixVisible
vehicleMatrixVisible
```

with:

```js
modelMatrixTransformed
vehicleMatrixTransformed
modelMatrixRendered
vehicleMatrixRendered
modelMatrixProjectedOnScreen
vehicleMatrixProjectedOnScreen
modelMatrixVisibilityConfidence
vehicleMatrixVisibilityConfidence
```

If backwards compatibility is needed, keep deprecated aliases:

```js
modelMatrixVisibleDeprecated
vehicleMatrixVisibleDeprecated
```

These aliases must map to rendered/projection truth, not `lastTransformAt`.

## Required State Fields

Each vehicle state object must include:

```js
{
  id,
  transformMode,
  transformed,
  rendered,
  projectedOnScreen,
  visibilityConfidence,
  lastTransformAt,
  lastRenderAt,
  lastProjectedAt,
  screenPosition: {
    x,
    y,
    inViewport,
    distanceFromViewportPx
  }
}
```

Layer state must include:

```js
{
  renderCount,
  lastRenderAt,
  lastRenderedVehicleId,
  lastRenderObjectCount,
  lastRenderSkippedCount,
  transformTruthSummary: {
    vehicleCount,
    transformedCount,
    renderedCount,
    projectedOnScreenCount,
    visualConfirmedCount
  }
}
```

## Render Callback Instrumentation

Inside `WorldSpaceVehicleLayer.render()`:

For each mesh render attempt, stamp **only after** `renderer.render(scene, camera)` is called for that mesh:

```js
mesh._lastRenderAt = Date.now()
mesh._renderCount = (mesh._renderCount || 0) + 1
mesh._lastRenderMode = _transformMode
mesh._lastRenderProjectionMode = 'modelMatrix' | 'vehicleMatrix'
```

Also track:

```js
_lastRenderedVehicleId
_lastRenderObjectCount
_lastRenderSkippedCount
```

Do not stamp `mesh._lastRenderAt` merely because the layer render callback fired.

## Screen Projection Test

Add:

```js
_projectVehicleToScreen(v)
```

Behavior:

- Use current Mapbox map.
- Call:

```js
map.project([v.lng, v.lat])
```

- Compare against map canvas width/height.
- Use a 200px margin.

Return:

```js
{
  x,
  y,
  inViewport,
  distanceFromViewportPx
}
```

If map/project is unavailable, return `null`.

## Visibility Confidence Resolver

Add:

```js
_resolveVisibilityConfidence(mesh, vehicle)
```

Rules:

```text
no mesh → none
mesh._lastTransformAt but no _lastRenderAt → transform_only
mesh._lastRenderAt but no projectedOnScreen → rendered_unconfirmed
mesh._lastRenderAt + projectedOnScreen → projected_on_screen
manual confirmation flag → visual_confirmed
```

## Optional Manual Confirmation API

Add:

```js
_wos.debug.worldVehicles.confirmVisible(id)
_wos.debug.worldVehicles.clearVisibilityConfirm(id)
```

Behavior:

```text
confirmVisible(id) marks mesh._visualConfirmed = true.
clearVisibilityConfirm(id) clears it.
```

This lets the user mark what was visually seen without corrupting automated truth.

## New Debug API

Add:

```js
_wos.debug.worldVehicles.renderTruth()
_wos.debug.worldVehicles.visibilityTruth()
_wos.debug.worldVehicles.confirmVisible(id)
_wos.debug.worldVehicles.clearVisibilityConfirm(id)
```

### renderTruth()

Returns:

```js
{
  vehicleCount,
  transformedCount,
  renderedCount,
  projectedOnScreenCount,
  visualConfirmedCount,
  renderCount,
  lastRenderAt,
  lastRenderedVehicleId,
  vehicles: [...]
}
```

Console output must clearly say:

```text
transformed: yes/no
rendered: yes/no
projected: yes/no
confidence: projected_on_screen
```

Do not print “visible” unless confidence is `visual_confirmed`.

## transformCompare() Correction

Update `transformCompare()` to return:

```js
{
  modelMatrixAdded,
  vehicleMatrixAdded,

  modelMatrixTransformed,
  vehicleMatrixTransformed,

  modelMatrixRendered,
  vehicleMatrixRendered,

  modelMatrixProjectedOnScreen,
  vehicleMatrixProjectedOnScreen,

  modelMatrixVisibilityConfidence,
  vehicleMatrixVisibilityConfidence,

  recommendation
}
```

Recommendation logic:

```text
if model rendered/projected and vehicle not → use_modelMatrix
if vehicle rendered/projected and model not → use_vehicleMatrix
if both rendered/projected → both_valid
if neither rendered/projected but one transformed → render_unproven
if neither transformed → neither_valid
```

Allowed recommendation values:

```text
use_modelMatrix
use_vehicleMatrix
both_valid
render_unproven
neither_valid
```

Print this warning when appropriate:

```text
transformed does not mean visible
```

## Acceptance Test A — Truth Separation

Run:

```js
_wos.debug.worldVehicles.transformCompare()
```

Expected:

```text
Output separates transformed/rendered/projected/confidence.
No field claims visibility from lastTransformAt alone.
```

## Acceptance Test B — Render Stamp

Run:

```js
_wos.debug.worldVehicles.renderTruth()
```

Expected:

```text
Each object reports transformed/rendered/projected separately.
rendered=true only after renderer.render() was called for that object.
```

## Acceptance Test C — Projection Sanity

Move camera away from test object, then run:

```js
_wos.debug.worldVehicles.renderTruth()
```

Expected:

```text
rendered may remain true.
projectedOnScreen becomes false if off-screen.
confidence does not exceed rendered_unconfirmed.
```

## Acceptance Test D — Manual Confirmation

Run:

```js
_wos.debug.worldVehicles.confirmVisible('transformcmp_model')
_wos.debug.worldVehicles.renderTruth()
```

Expected:

```text
transformcmp_model confidence = visual_confirmed
```

Then:

```js
_wos.debug.worldVehicles.clearVisibilityConfirm('transformcmp_model')
```

Expected:

```text
confidence falls back to projected_on_screen or rendered_unconfirmed
```

## Acceptance Test E — Return Gate

Before returning to primitive cars/trucks/buildings/bridges:

```text
renderTruth() must show at least one object with:
transformed = true
rendered = true
projectedOnScreen = true
```

If not:

```text
return to 0601I / 0601J diagnostics
```

## Regression Rules

Must not break:

```text
modelMatrix transform
vehicleMatrix comparison path
primitive3d toggle
DOM fallback
session rebind
traffic binding
hero live binding
LOD/depth
```

## Implementation Order

1. Add per-mesh render stamps inside the `renderer.render()` loop.
2. Add screen projection helper.
3. Add visibility confidence resolver.
4. Extend vehicle state output.
5. Add render truth summary.
6. Patch `transformCompare()` naming and recommendation logic.
7. Add manual confirmation API.
8. Validate primitive test objects.
9. Validate live hero.
10. Validate traffic actors.

## Implementation Guide

- **Where:** Patch render instrumentation and state in `wall/systems/render/worldSpaceVehicleLayer.js`; patch debug commands and `transformCompare()` output in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What:** Run `npm run dev`, then execute `_wos.debug.worldVehicles.transformCompare()`, `_wos.debug.worldVehicles.renderTruth()`, and optionally `_wos.debug.worldVehicles.confirmVisible('transformcmp_model')`.
- **Expect:** Debug output clearly separates transformed, rendered, projected, and visually confirmed states; no command claims true visibility from transform success alone.
