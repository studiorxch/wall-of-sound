# 0601J_WOS_WorldSpaceTransformMigration_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- `0601I_WOS_ThreeRenderPathRepair` exists or has been implemented.
- `_wos.debug.threeProof.modelMatrixCube()` is the known-good or best-candidate transform path.
- `_wos.debug.threeProof.vehicleMatrixCube()` represents the older `WorldSpaceVehicleLayer` transform path and is suspicious.
- `WorldSpaceVehicleLayer` currently owns hero/traffic world-space vehicle rendering.
- Vehicle primitive/3D work must remain paused until transform migration is validated.
- Mapbox style, presentation authority, routes, traffic spawn rules, camera motion, and presentation presets must not be changed by this spec.

## Purpose

Migrate `WorldSpaceVehicleLayer` from the older vehicle-matrix transform path to the canonical Mapbox model-matrix transform path proven by the Three proof harness.

Current problem:

```text
World-space vehicle records exist, but readable Three geometry is not reliably visible.
```

Target result:

```text
WorldSpaceVehicleLayer uses the same transform strategy as the working threeProof modelMatrix path.
A simple cube/cuboid, primitive car, and primitive truck render visibly through the production world vehicle layer.
```

## Core Doctrine

```text
One proven transform path.
No parallel mystery math.
```

The layer must stop maintaining a vehicle-specific transform if the proof harness has identified the canonical model-matrix path as the reliable one.

## Non-Goals

Do not modify:

- Mapbox style presets
- presentation authority
- route logic
- hero runtime progress
- traffic spawning rules
- camera choreography
- vehicle visual registry
- 3D building actors
- bridge actors
- drone/fish actors
- audio/weather modulation

Do not add final vehicle art.

## Required Files

Patch:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Reference but do not duplicate unnecessarily:

```text
wall/systems/render/threePrimitiveVisibilityHarness.js
wall/systems/presentation/threePrimitiveVisibilityDebug.js
```

## Migration Rule

`WorldSpaceVehicleLayer` must support transform modes:

```js
setTransformMode('modelMatrix')
setTransformMode('vehicleMatrix')
getTransformMode()
```

Default after this spec:

```text
modelMatrix
```

The old path must remain temporarily available for comparison, but must no longer be the production default.

## Canonical Model-Matrix Path

For each actor:

```text
1. Convert actor lng/lat/altitude to MercatorCoordinate.
2. Build a model matrix:
   translate(mercator.x, mercator.y, mercator.z)
   rotate around Z for heading
   scale(meterUnit * finalScale, -meterUnit * finalScale, meterUnit * finalScale)
3. Set mesh at local origin.
4. Set camera.projectionMatrix = mapboxMatrix × modelMatrix.
5. Render that object/scene.
```

The key property:

```text
mesh geometry stays local;
world placement lives in the model matrix.
```

Do not mix `mesh.position = mercator` with `camera.projectionMatrix = mapboxMatrix × modelMatrix` in the same mode.

## Per-Object Scene Rule

If the canonical model-matrix implementation requires each object to have its own scene/projection matrix, use per-object rendering.

Allowed object record:

```js
{
  mesh,
  scene,
  modelMatrix,
  lastTransform
}
```

Render loop:

```text
for each object:
  camera.projectionMatrix = mapboxMatrix × object.modelMatrix
  renderer.render(object.scene, camera)
```

Default preference:

```text
per-object scene, because it mirrors the proven threeProof modelMatrix harness.
```

## Heading Rotation

Preserve existing heading convention only after validating it.

Required debug constant:

```js
VEHICLE_HEADING_OFFSET_DEG
```

State must report:

```text
headingDeg
headingOffsetDeg
appliedHeadingDeg
```

If heading appears rotated 90/180 degrees, update the explicit heading offset only. Do not bury the fix inside geometry.

## Scale Migration

`_resolveVehicleScale()` remains the scale authority.

The model-matrix path must apply:

```text
finalScale = resolved.finalScale * debugScale
```

using:

```text
meterUnit * finalScale
```

Depth multiplier must affect only vertical/Z:

```js
scaleX = meterUnit * finalScale
scaleY = -meterUnit * finalScale
scaleZ = meterUnit * finalScale * depthMultiplier
```

Do not double-apply `shapeScale`, `debugScale`, or `depthMultiplier`.

## Mesh Rebuild Rule

Transform migration must not cause per-frame mesh rebuilds.

Mesh rebuild key remains:

```text
shapeMode
primitive3dEnabled
actorType
variant
lodTier
depthEnabled
```

Transform mode changes may invalidate transforms, not mesh geometry.

## Object Record Requirements

Each WSL object record must include:

```js
{
  id,
  actorType,
  variant,
  source,
  mesh,
  scene,
  transformMode,
  modelMatrix,
  mercator,
  meterUnit,
  finalScale,
  depthMultiplier,
  headingDeg,
  appliedHeadingDeg,
  lastTransformAt,
  lastRenderAt,
  visible
}
```

## State Output Requirements

`_wos.debug.worldVehicles.state()` must report:

```js
{
  transformMode,
  transformValid,
  vehicleCount,
  renderReady,
  lastTransformMode,
  lastTransform,
  lastTransformError,
  vehicles: [
    {
      id,
      actorType,
      variant,
      source,
      transformMode,
      lodTier,
      finalScale,
      depthMultiplier,
      headingDeg,
      appliedHeadingDeg,
      meterUnit,
      mercator,
      visible,
      lastTransformAt
    }
  ]
}
```

## New Debug API

Add:

```js
_wos.debug.worldVehicles.transformMode()
_wos.debug.worldVehicles.transformMode('modelMatrix')
_wos.debug.worldVehicles.transformMode('vehicleMatrix')
_wos.debug.worldVehicles.transformState()
_wos.debug.worldVehicles.transformCompare()
```

### transformState()

Returns:

```js
{
  mode,
  vehicleCount,
  modelMatrixCount,
  vehicleMatrixCount,
  lastTransform,
  lastTransformError,
  renderCount,
  lastRenderAt
}
```

### transformCompare()

Runs a controlled comparison:

```text
1. clear test objects
2. add one modelMatrix cube/vehicle
3. add one vehicleMatrix cube/vehicle offset nearby
4. report which path is visible/valid
```

Expected return:

```js
{
  modelMatrixAdded,
  vehicleMatrixAdded,
  modelMatrixVisible,
  vehicleMatrixVisible,
  recommendation
}
```

Recommendation values:

```text
use_modelMatrix
use_vehicleMatrix
both_valid
neither_valid
```

## Primitive Proof Integration

After migration, this must work:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.transformMode('modelMatrix')
_wos.debug.worldVehicles.primitive3d(true)
_wos.debug.worldVehicles.primitive3dForceNear(true)
_wos.debug.worldVehicles.testPrimitive3D()
```

Expected:

```text
visible chunky car
visible chunky truck
not just DOM/SVG markers
not just map-layer geometry
```

## Live Hero Integration

This must work:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.transformMode('modelMatrix')
_wos.debug.worldVehicles.primitive3d(true)
_wos.debug.worldVehicles.liveHero()
```

Expected:

```text
hero primitive follows route
no freeze
no per-frame rebuild
DOM hides only after successful world upsert
```

## Traffic Integration

This must work:

```js
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
_wos.debug.worldVehicles.transformMode('modelMatrix')
_wos.debug.worldVehicles.primitive3d(true)
```

Expected:

```text
traffic cars render as 3D primitives
box trucks render taller/larger
worldActorCount > 0
domFallbackCount = 0 when render ready
```

## Failure Handling

If model-matrix transform fails:

```text
record transform_failed
keep DOM fallback
do not throw into RAF
do not silently switch back to old path
```

If scene creation fails:

```text
record scene_missing or scene_create_failed
keep DOM fallback
```

If render path does not fire:

```text
record render_not_called
```

If both transform modes fail:

```text
leave WSL enabled but keep DOM fallback visible
report neither_valid
```

## Acceptance Test A — Transform Mode State

Run:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.transformMode('modelMatrix')
_wos.debug.worldVehicles.transformState()
```

Expected:

```text
mode = modelMatrix
renderReady = true
lastTransformError = null or explicit guarded failure
```

## Acceptance Test B — Static Primitive Through WSL

Run:

```js
_wos.debug.worldVehicles.primitive3d(true)
_wos.debug.worldVehicles.primitive3dForceNear(true)
_wos.debug.worldVehicles.testPrimitive3D()
_wos.debug.worldVehicles.state()
```

Expected:

```text
vehicleCount >= 2
transformMode = modelMatrix
car and truck visible
```

## Acceptance Test C — Live Hero Through WSL

Run Drive, then:

```js
_wos.debug.worldVehicles.liveHero()
```

Expected:

```text
hero object uses transformMode modelMatrix
hero follows route
lastTransformAt updates continuously
```

## Acceptance Test D — Traffic Through WSL

Run:

```js
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
_wos.debug.traffic.worldState()
_wos.debug.worldVehicles.state()
```

Expected:

```text
traffic worldActorCount > 0
WSL vehicleCount includes traffic
traffic objects use modelMatrix
DOM hidden only after successful upsert
```

## Acceptance Test E — Transform Compare

Run:

```js
_wos.debug.worldVehicles.transformCompare()
```

Expected:

```text
recommendation = use_modelMatrix or both_valid
```

If recommendation is `neither_valid`, stop and return to 0601I.

## Regression Rules

Must not break:

```text
DOM fallback
session rebind
LOD scale authority
primitive3d toggle
depth toggle
traffic world binding
hero live binding
```

## Implementation Order

1. Add transform mode state.
2. Extract existing transform into `_applyVehicleMatrixTransform()`.
3. Implement `_applyModelMatrixTransform()` from threeProof modelMatrix logic.
4. Add per-object scene support if required.
5. Route `_applyTransform()` through selected mode.
6. Add transform debug API.
7. Add transform state reporting.
8. Test static primitive car/truck.
9. Test live hero.
10. Test traffic.
11. Keep old path available for comparison only.

## Implementation Guide

- **Where:** Patch transform logic and object records in `wall/systems/render/worldSpaceVehicleLayer.js`; expose transform commands in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What:** Run `npm run dev`, then execute `_wos.debug.worldVehicles.enable()`, `_wos.debug.worldVehicles.transformMode('modelMatrix')`, `_wos.debug.worldVehicles.primitive3d(true)`, `_wos.debug.worldVehicles.testPrimitive3D()`, and `_wos.debug.worldVehicles.transformCompare()`.
- **Expect:** WorldSpaceVehicleLayer uses the canonical model-matrix path; primitive car/truck become visible through the production layer; old vehicleMatrix remains available only for comparison and fallback diagnosis.
