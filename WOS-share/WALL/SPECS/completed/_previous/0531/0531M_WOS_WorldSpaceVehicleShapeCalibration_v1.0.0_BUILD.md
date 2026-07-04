# 0531M_WOS_WorldSpaceVehicleShapeCalibration_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- Existing `WorldSpaceVehicleLayer` is render-ready.
- `visibilityMode('block')` works and is stable.
- `HeroVehicleRenderer.update()` continuously upserts live hero payloads.
- DOM fallback remains active unless world-space vehicle mode succeeds.
- Current target is visual calibration, not new routing, traffic, or camera logic.

## Purpose

Convert the confirmed world-space diagnostic block into a readable 2.5D vehicle form.

The goal is not full 3D realism yet. The goal is a stable, map-native actor that:

- sits convincingly on the road
- reads as a vehicle from pitched and elevated camera views
- remains visible at `Drone`, `Urban`, and `Rooftop` altitude steps
- avoids DOM-marker flatness
- preserves all fallback and diagnostic systems

## Core Doctrine

```text
Block proves position.
Slab proves footprint.
Wedge proves direction.
Vehicle proves identity.
```

This spec moves from proof geometry toward usable vehicle geometry without breaking the render pipeline.

## Non-Goals

Do not modify:

- routing
- camera follow behavior
- Mapbox layer order
- weather/location systems
- traffic spawning
- bridge/overpass handling
- DOM fallback rules

Do not import GLB assets in this pass.

## Required Files

Update:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional update if needed:

```text
wall/systems/render/heroVehicleRenderer.js
```

## Shape Calibration Modes

Add a new mode API:

```js
_wos.debug.worldVehicles.shapeMode('block')
_wos.debug.worldVehicles.shapeMode('slab')
_wos.debug.worldVehicles.shapeMode('wedge')
_wos.debug.worldVehicles.shapeMode('vehicle')
_wos.debug.worldVehicles.shapeMode()
```

`visibilityMode()` may remain for backward compatibility, but `shapeMode()` becomes the clearer user-facing API.

### Mode 1 — block

Keep current diagnostic block:

```text
20m long
10m wide
8m tall
red MeshBasicMaterial
DOM marker visible
```

Purpose:

- transform proof
- visibility proof
- emergency diagnostic fallback

### Mode 2 — slab

Create a flattened car footprint:

```text
length: 8m
width: 4m
height: 1.2m
centerZ: 0.6m
material: red MeshBasicMaterial
```

Purpose:

- confirm scale reduction
- confirm road seating
- remove tower-like block behavior

The slab must be easy to see but no longer absurdly large.

### Mode 3 — wedge

Create a directional vehicle primitive:

```text
base length: 8m
base width: 4m
base height: 1.2m
nose taper: forward wedge
roof block: 3m x 2.4m x 1m
roof centerZ: 1.6m
yellow nose cue
dark windshield cue
```

Purpose:

- make direction readable
- test 2.5D vehicle language
- avoid full car complexity

### Mode 4 — vehicle

Create the first usable 2.5D hero vehicle mesh.

Required components:

```text
chassis wedge
roof/cabin block
front windshield plane
rear window plane
yellow nose cue
subtle black wheel/contact marks
low contact shadow plane
```

Target dimensions:

```text
length: 6.5m
width: 3.2m
height: 2.0m
base centerZ: 0.35m
cabin centerZ: 1.25m
```

Use simple geometry only:

- `BoxGeometry`
- `PlaneGeometry`
- optional `ConeGeometry` for nose cue
- no GLTF
- no texture loading
- no shadows requiring lights

Use `MeshBasicMaterial` or stable non-light-dependent materials for this pass.

## Orientation Requirements

The vehicle nose must align with runtime heading.

Current convention:

```text
nose faces -Y in local mesh space
mesh.rotation.z = -headingDeg * Math.PI / 180
```

If visual heading appears reversed, fix by applying one explicit constant:

```js
const VEHICLE_HEADING_OFFSET_DEG = 0;
```

Do not bury heading offsets in mesh geometry.

## Scale Requirements

Add one debug scale multiplier:

```js
_wos.debug.worldVehicles.shapeScale(1)
_wos.debug.worldVehicles.shapeScale(2)
_wos.debug.worldVehicles.shapeScale()
```

Default:

```text
shapeScale = 1
```

This must multiply final mesh group scale after Mercator conversion.

Do not modify runtime speed, camera, or actor position.

## DOM Fallback Rules

- In `block`, `slab`, and `wedge` modes, keep DOM marker visible.
- In `vehicle` mode, DOM marker may hide only after successful world-space upsert and render readiness.
- If upsert fails, DOM marker must remain visible.

## Debug State Requirements

Extend `getState()` output with:

```js
{
  shapeMode,
  shapeScale,
  lastShapeBuild,
  lastShapeBuildError
}
```

`lastShapeBuild` should include:

```js
{
  mode,
  actorType,
  variant,
  dimensionsMeters,
  timestamp
}
```

## Failure Handling

All shape build failures must route through existing failure taxonomy:

```text
mesh_build_failed
unknown_exception
```

Do not allow thrown geometry errors into the RAF loop.

## Acceptance Tests

Run in console:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.liveHero()
_wos.debug.worldVehicles.shapeMode('block')
_wos.debug.worldVehicles.state()
```

Expected:

```text
shapeMode: block
vehicleCount: 1
DOM marker visible
large block visible
```

Then:

```js
_wos.debug.worldVehicles.shapeMode('slab')
```

Expected:

```text
flat red slab follows hero
DOM marker remains visible
slab sits on road
```

Then:

```js
_wos.debug.worldVehicles.shapeMode('wedge')
```

Expected:

```text
directional wedge follows hero
nose direction matches route heading
DOM marker remains visible
```

Then:

```js
_wos.debug.worldVehicles.shapeMode('vehicle')
```

Expected:

```text
2.5D car follows hero
DOM marker hides only if world-space render succeeds
vehicle reads clearly from Urban/Rooftop
vehicle does not appear upright like old SVG capsule
```

## Regression Tests

Confirm:

```js
_wos.debug.worldVehicles.visibilityMode('block')
```

still works if legacy code calls it.

Confirm:

```js
_wos.debug.worldVehicles.trace()
```

still reports:

```text
lastUpsertSuccess.id: hero
lastUpsertFailure.reason: -
```

during successful world-space rendering.

## Implementation Guide

- **Where:** Update `wall/systems/render/worldSpaceVehicleLayer.js` shape builders and exported API; update `wall/systems/presentation/worldSpaceVehicleDebug.js` debug commands.
- **What:** Run local server, launch Drive mode, then test `shapeMode('block')`, `shapeMode('slab')`, `shapeMode('wedge')`, and `shapeMode('vehicle')` in console.
- **Expect:** A stable progression from diagnostic block to readable 2.5D car, with DOM fallback protected and no route/camera changes.
