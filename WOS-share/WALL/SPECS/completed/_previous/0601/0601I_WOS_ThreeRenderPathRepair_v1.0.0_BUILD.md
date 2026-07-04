# 0601I_WOS_ThreeRenderPathRepair_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- `0601H_WOS_ThreePrimitiveVisibilityHarness` was implemented or partially implemented.
- `_wos.debug.threeProof.centerCube()` currently does **not** produce visible Three.js geometry.
- `WorldSpaceVehicleLayer` reports active/render-ready states, but visual proof is still absent.
- Vehicle primitive work must pause until the Three render path is proven.
- Mapbox style, vehicles, traffic, routes, camera motion, and presentation presets must not be modified by this spec.

## Purpose

Repair and prove the Three.js render path inside Mapbox custom layers.

Current failure:

```text
centerCube() does not visibly render.
```

This means the problem is below vehicle geometry.

Target result:

```text
A giant Three.js cube renders visibly at map center.
The harness can classify whether failure is scene insertion, render callback, matrix transform, scale, clipping, or layer ordering.
```

## Core Doctrine

```text
No more vehicle work until one cube renders.
```

The next useful progression is not a better car shape.

It is a deterministic render-path diagnosis and repair loop.

## Non-Goals

Do not modify:

- vehicle mesh builders
- traffic runtime
- hero runtime
- route logic
- Mapbox style presets
- presentation authority
- camera choreography
- 3D building logic

Do not continue 2.5D car polishing in this spec.

## Required Files

Inspect and patch:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/render/threePrimitiveVisibilityHarness.js
wall/systems/presentation/threePrimitiveVisibilityDebug.js
wall/systems/presentation/worldSpaceVehicleDebug.js
wall/index.html
```

If `threePrimitiveVisibilityHarness.js` does not exist yet, create it.

## Current Failure Class

Observed:

```js
_wos.debug.threeProof.centerCube()
```

Result:

```text
No visible cube.
```

Therefore one or more of the following is true:

```text
render_not_called
wrong_scene_reference
object_not_added_to_scene
matrix_mode_wrong
scale_too_small
object_behind_camera
object_under_map
layer_order_hidden
depth_test_occluded
custom_layer_not_registered
duplicate_three_instances
```

This spec must identify which one.

## Required Debug Namespace

Use:

```js
_wos.debug.threeProof
```

Required commands:

```js
_wos.debug.threeProof.centerCube()
_wos.debug.threeProof.screenCube()
_wos.debug.threeProof.rawSceneCube()
_wos.debug.threeProof.modelMatrixCube()
_wos.debug.threeProof.vehicleMatrixCube()
_wos.debug.threeProof.axisTripod()
_wos.debug.threeProof.scale(n)
_wos.debug.threeProof.mode(name)
_wos.debug.threeProof.state()
_wos.debug.threeProof.clear()
```

## Critical New Test 1 — screenCube()

Add:

```js
_wos.debug.threeProof.screenCube()
```

Purpose:

```text
Prove the Three renderer can draw anything at all.
```

Behavior:

- Renders a cube directly in clip/screen space or an orthographic mini-scene.
- Does not use Mercator coordinates.
- Does not use actor lat/lng.
- Does not use vehicle transform.
- Uses the same WebGLRenderer/context if possible.

Expected:

```text
If screenCube fails, the renderer/custom-layer draw path is broken.
If screenCube passes, rendering works and transform is the problem.
```

## Critical New Test 2 — rawSceneCube()

Add:

```js
_wos.debug.threeProof.rawSceneCube()
```

Purpose:

```text
Prove scene insertion and render callback are connected.
```

Behavior:

- Adds a cube to the active Three scene at origin.
- Uses exaggerated scale.
- Uses identity/local transform if possible.
- Records scene object count before and after.

Expected:

```text
scene child count increases
render callback timestamp updates
```

## Critical New Test 3 — modelMatrixCube()

Add:

```js
_wos.debug.threeProof.modelMatrixCube()
```

Purpose:

```text
Test canonical Mapbox custom-layer matrix path.
```

Use canonical model matrix:

```text
MercatorCoordinate.fromLngLat([lng, lat], altitude)
translate(x, y, z)
scale(meterUnit, -meterUnit, meterUnit)
rotate if needed
matrix = mapboxMatrix * modelMatrix
camera.projectionMatrix = matrix
mesh at origin
```

Expected:

```text
cube appears at map center.
```

## Critical New Test 4 — vehicleMatrixCube()

Add:

```js
_wos.debug.threeProof.vehicleMatrixCube()
```

Purpose:

```text
Test current WorldSpaceVehicleLayer transform path.
```

Use the exact current vehicle transform code path.

Expected:

```text
If modelMatrixCube works but vehicleMatrixCube fails, replace vehicle transform path.
If both fail but screenCube works, Mercator/matrix handling is wrong.
```

## Required State Output

`state()` must return:

```js
{
  ok,
  threeAvailable,
  mapAvailable,
  mapboxglAvailable,
  customLayerAdded,
  renderReady,
  rendererExists,
  cameraExists,
  sceneExists,
  sceneChildCount,
  lastRenderAt,
  lastRenderDeltaMs,
  lastCommand,
  activeMode,
  proofScale,
  objects: [
    {
      id,
      kind,
      mode,
      addedToScene,
      visible,
      frustumCulled,
      matrixAutoUpdate,
      position,
      scale,
      dimensionsMeters,
      meterScale,
      mercator,
      lastTransformAt
    }
  ],
  lastError,
  failureClass
}
```

## Failure Classifier

Implement explicit failure classification:

```text
three_not_available
map_not_available
custom_layer_missing
renderer_missing
scene_missing
render_not_called
object_not_added_to_scene
screen_render_failed
mercator_transform_failed
vehicle_transform_failed
scale_too_small
object_out_of_view
object_under_map
depth_occluded
unknown
```

## Render Callback Instrumentation

Instrument the custom layer render callback.

Required:

```js
_lastRenderAt = performance.now()
_renderCount += 1
_lastMatrixSummary = summarize(matrix)
```

Debug must report:

```text
render count
last render age
matrix first/last values
scene children count
renderer/context exists
```

If render callback does not fire after object insertion:

```text
failureClass = render_not_called
```

## Scene Insertion Proof

Every object add must log:

```text
scene children before
scene children after
object.uuid
object.visible
object.matrixWorldNeedsUpdate
```

If children count does not increase:

```text
failureClass = object_not_added_to_scene
```

## Scale Ladder

`scale(n)` must support:

```js
1
10
100
1000
10000
```

Add helper:

```js
_wos.debug.threeProof.scaleLadder()
```

Behavior:

- Creates five cubes near map center with increasing scale.
- Labels/logs each scale.
- If only very large cubes appear, scale is the issue.

Expected:

```text
At least one cube should be visible if transform is correct.
```

## Depth/Clipping Tests

Add optional flags:

```js
_wos.debug.threeProof.depthTest(false)
_wos.debug.threeProof.depthWrite(false)
_wos.debug.threeProof.altitude(0)
_wos.debug.threeProof.altitude(50)
_wos.debug.threeProof.altitude(500)
```

Default proof material:

```js
{
  depthTest: false,
  depthWrite: false,
  transparent: false
}
```

Purpose:

```text
A proof cube should not be hidden by terrain/roads/buildings while testing visibility.
```

## Layer Order Rule

The harness must insert after base map layers but before or after custom vehicle layer consistently.

State must report:

```text
custom layer id
before/after insertion target
layer order index if available
```

If the layer is absent:

```text
custom_layer_missing
```

## Duplicate Instance Check

Report instance identities:

```js
{
  harnessInstanceId,
  worldSpaceVehicleLayerInstanceId,
  threeGlobalPresent,
  rendererContextIdKnown
}
```

If harness and WSL use different scenes/renderers unintentionally, report:

```text
duplicate_or_disconnected_instance
```

## Acceptance Test A — Renderer Proof

Run:

```js
_wos.debug.threeProof.clear()
_wos.debug.threeProof.screenCube()
_wos.debug.threeProof.state()
```

Pass:

```text
screen cube visible
renderCount > 0
failureClass = null
```

If fail:

```text
fix custom-layer render callback before anything else
```

## Acceptance Test B — Scene Proof

Run:

```js
_wos.debug.threeProof.rawSceneCube()
_wos.debug.threeProof.state()
```

Pass:

```text
sceneChildCount increases
lastRenderAt updates
```

If fail:

```text
fix scene reference / scene.add / renderer scene path
```

## Acceptance Test C — Canonical Matrix Proof

Run:

```js
_wos.debug.threeProof.modelMatrixCube()
_wos.debug.threeProof.scaleLadder()
_wos.debug.threeProof.state()
```

Pass:

```text
at least one cube visible at map center
```

If fail:

```text
fix canonical matrix implementation
```

## Acceptance Test D — Vehicle Matrix Comparison

Run:

```js
_wos.debug.threeProof.vehicleMatrixCube()
_wos.debug.threeProof.state()
```

Expected:

```text
If vehicleMatrixCube fails but modelMatrixCube passes:
  migrate WSL vehicle transform to modelMatrix mode.
```

## Acceptance Test E — Return Gate

Only after:

```text
screenCube visible
rawSceneCube confirms scene insertion
modelMatrixCube visible
axisTripod visible
```

may development return to:

```text
0601G primitive 3D car/truck
```

## Required Repair Outcome

The final implementation must leave behind one known-good transform mode:

```js
_wos.debug.threeProof.mode('modelMatrix')
```

If modelMatrix works, future vehicle work must use it.

If current vehicle transform also works, report both as valid.

If neither works, do not claim vehicle 3D is ready.

## Implementation Order

1. Instrument render callback.
2. Add `screenCube()`.
3. Add `rawSceneCube()`.
4. Add state failure classifier.
5. Add `modelMatrixCube()`.
6. Add `scaleLadder()`.
7. Add `vehicleMatrixCube()`.
8. Add `axisTripod()` only after cube is visible.
9. Compare modelMatrix vs vehicleMatrix.
10. Patch WSL transform only if modelMatrix proves correct and vehicleMatrix fails.

## Implementation Guide

- **Where:** Patch/create `wall/systems/render/threePrimitiveVisibilityHarness.js`; expose `_wos.debug.threeProof` in `wall/systems/presentation/threePrimitiveVisibilityDebug.js`; only patch `worldSpaceVehicleLayer.js` if the proven transform path must be migrated.
- **What:** Run `npm run dev`, then execute `_wos.debug.threeProof.screenCube()`, `.rawSceneCube()`, `.modelMatrixCube()`, `.scaleLadder()`, and `.vehicleMatrixCube()`.
- **Expect:** The harness identifies exactly why `centerCube()` was invisible; at least one giant cube becomes visible before any more vehicle/truck/building work resumes.
