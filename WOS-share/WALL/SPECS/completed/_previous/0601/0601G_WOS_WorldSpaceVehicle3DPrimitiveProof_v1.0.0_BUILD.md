# 0601G_WOS_WorldSpaceVehicle3DPrimitiveProof_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- `WorldSpaceVehicleLayer` exists and is render-ready.
- Hero and traffic actors can already bind into world space.
- Existing vehicle mesh work has proved position, heading, LOD, visual registry, depth toggles, and session rebind.
- Existing vehicles still read too flat from WOS camera profiles.
- Current Mapbox styling work is handled separately and must not be modified by this spec.
- This spec is a 3D primitive proof, not a final vehicle art pass.

## Purpose

Prove that WOS can render one unmistakably 3D car and one unmistakably 3D truck inside Mapbox world space.

Current state:

```text
Vehicles are world-bound but still read like flat markers.
```

Target state:

```text
A simple car and simple truck read as physical 3D objects from Rooftop, Low Drone, Urban, and Side camera angles.
```

This spec opens the technical 3D door for:

```text
side cameras
trucks
3D buildings
future world props
```

## Core Doctrine

```text
Do not polish a flat token.
First prove physical volume.
```

This pass must prioritize unmistakable dimensional readability over beauty.

## Non-Goals

Do not modify:

- Mapbox style presets
- runtime style patching
- route logic
- traffic spawning rules
- session rebind logic
- audio/weather systems
- vehicle visual registry beyond temporary proof colors
- GLB loading
- external model loading
- 3D building implementation

Do not add decals, graffiti, or final vehicle art.

## Required Files

Patch:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional only if needed:

```text
wall/systems/render/heroVehicleRenderer.js
wall/systems/render/trafficOccupancyRenderer.js
```

## Problem Statement

The current vehicle layer has too little perceptual depth.

Symptoms:

```text
car reads as a flat marker
truck reads as a flat rectangle
roof/side/front are not sufficiently separated
side camera exposes the illusion
camera profiles cannot validate dimensionality
```

This means the system has not yet proven the core 2.5D/3D technique.

## Proof Strategy

Add a separate proof mode that bypasses current stylized vehicle builders.

The proof mode must render deliberately chunky primitives:

```text
simple 3D car
simple 3D truck
```

These are not final meshes.

They are diagnostic primitives designed to answer one question:

```text
Can WOS render physical 3D vehicles convincingly in Mapbox world space?
```

## New Shape Mode

Add:

```js
_wos.debug.worldVehicles.primitive3d(true)
_wos.debug.worldVehicles.primitive3d(false)
_wos.debug.worldVehicles.primitive3d()
```

Behavior:

- `true` enables primitive proof meshes.
- `false` returns to normal vehicle mode.
- no argument prints status.

When enabled:

```text
hero_car uses primitive 3D car
traffic_car uses primitive 3D car
box_truck uses primitive 3D truck
```

This must not replace existing `shapeMode()` behavior.

It is a separate proof toggle.

## Primitive Car Requirements

The car must be unmistakably 3D.

Minimum geometry:

```text
raised chassis box
hood box or sloped hood approximation
rear body box
raised cabin box
front windshield plane
rear windshield plane
left/right side glass planes
front face
rear face
four wheel blocks or cylinders
contact shadow
heading/nose cue
```

Suggested dimensions:

```js
{
  width: 3.2,
  length: 6.4,
  chassisHeight: 0.9,
  cabinWidth: 2.2,
  cabinLength: 2.8,
  cabinHeight: 1.5,
  roofZ: 2.1
}
```

## Primitive Truck Requirements

The truck must be unmistakably larger and taller than the car.

Minimum geometry:

```text
cab box
cargo box
cargo roof
cargo side face
rear door face
front windshield plane
side window planes
wheel blocks or cylinders
contact shadow
heading/nose cue
```

Suggested dimensions:

```js
{
  width: 3.8,
  length: 10.5,
  cabLength: 3.0,
  cargoLength: 6.8,
  cabHeight: 2.0,
  cargoHeight: 3.0,
  cargoZ: 1.5
}
```

## Visual Readability Rules

Use high-contrast temporary proof materials.

Suggested colors:

```text
top face: lighter body color
side faces: darker body color
front face: distinct darker face
rear face: distinct darkest face
glass: dark blue/black
shadow: translucent black
wheels: black/dark gray
heading cue: warm yellow or white
```

These colors are diagnostic.

They do not need to match the final visual registry.

## Lighting Rule

Use `MeshBasicMaterial` for proof geometry unless current lighting is already reliable.

Purpose:

```text
If primitive is invisible, failure is transform/geometry/camera.
If primitive is visible but flat, failure is mesh design.
```

Do not introduce lighting as a new unknown in this proof.

## Height and Grounding

All primitive meshes must sit above the map plane.

Rules:

```text
bottom z >= 0
origin stays actor lat/lng
shadow sits at z = 0.02
body sits above shadow
no part sinks below road
```

## Camera Survival Requirement

Primitive proof must be tested in:

```text
Low Drone
Urban
Rooftop
Side
Follow
Lead
```

The car and truck must remain readable from each.

If `side` camera is still equivalent to follow, this spec must at minimum document that side camera cannot be validated yet.

Do not fix camera side mode inside this spec unless the fix is trivial and isolated.

## Debug Test Actors

Add:

```js
_wos.debug.worldVehicles.testPrimitive3D()
```

It should create:

```text
1 primitive car at map center
1 primitive truck offset nearby
```

without needing Drive mode.

Expected output:

```js
{
  added: true,
  carId: 'primitive3d_car_test',
  truckId: 'primitive3d_truck_test',
  primitive3d: true
}
```

Add cleanup:

```js
_wos.debug.worldVehicles.clearPrimitive3D()
```

## Live Hero Test

Add or confirm:

```js
_wos.debug.worldVehicles.liveHero()
```

Then test:

```js
_wos.debug.worldVehicles.primitive3d(true)
_wos.debug.worldVehicles.liveHero()
```

Expected:

```text
hero follows live route as a primitive 3D car
DOM marker hides only when world mesh succeeds
```

## Traffic Test

Run:

```js
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
_wos.debug.worldVehicles.primitive3d(true)
```

Expected:

```text
traffic cars render as primitive 3D cars
box trucks render as primitive 3D trucks
DOM markers hidden in vehicle mode only after upsert succeeds
```

## Transform Integrity

Do not change the proven Mapbox transform path unless absolutely required.

The primitive proof must use the same transform path as current world vehicles:

```text
actor lat/lng
actor heading
Mercator coordinate conversion
Mapbox custom layer render matrix
```

If transform changes are required, isolate them behind explicit debug comparison.

## Mesh Rebuild Rule

Primitive proof must not rebuild every frame.

Definition changes only when:

```text
primitive3d enabled/disabled
actorType changes
variant changes
lodTier changes
shapeMode changes
```

Position, heading, speed, camera motion, and route progress must never trigger rebuilds.

## LOD Rule

Primitive proof can temporarily force near-tier geometry for all zooms.

This is allowed because the purpose is volume proof.

Add explicit debug flag:

```js
_wos.debug.worldVehicles.primitive3dForceNear(true)
```

Default:

```text
true
```

Future LOD can be added only after primitive volume is proven.

## Acceptance Test A — Static Primitive Proof

Run:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.primitive3d(true)
_wos.debug.worldVehicles.testPrimitive3D()
```

Expected:

```text
one obvious 3D car
one obvious 3D truck
roof visible
side faces visible
front/rear faces visible
shadows visible
```

## Acceptance Test B — Hero Route Proof

Run:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.primitive3d(true)
_wos.debug.worldVehicles.liveHero()
```

Expected:

```text
hero car follows route
car reads as 3D
no freeze
no rebuild loop
DOM fallback remains safe
```

## Acceptance Test C — Traffic Truck Proof

Run:

```js
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
_wos.debug.worldVehicles.primitive3d(true)
```

Expected:

```text
box trucks are visibly taller and longer than cars
traffic cars are visibly 3D
worldActorCount > 0
domFallbackCount = 0 when WSL ready
```

## Acceptance Test D — Camera Proof

Cycle:

```text
Follow
Lead
Side
Low Drone
Urban
Rooftop
```

Expected:

```text
at least one camera profile clearly shows roof + side + height
side camera limitations are reported if unresolved
```

## Acceptance Test E — Building Implication

After static proof:

```text
truck volume should imply building feasibility
```

If truck cannot read as 3D:

```text
do not start building work
```

If truck reads clearly:

```text
next building proof can use similar box/extrusion logic
```

## Failure Handling

All new debug commands must be guarded.

If Three.js unavailable:

```js
{ ok:false, reason:'three_not_available' }
```

If WSL not ready:

```js
{ ok:false, reason:'world_layer_not_ready' }
```

If mesh build fails:

```text
record mesh_build_failed
keep DOM fallback
do not throw into RAF
```

If transform fails:

```text
record transform_failed
keep DOM fallback
do not throw into RAF
```

## Reporting Requirements

Add debug output:

```js
_wos.debug.worldVehicles.primitiveState()
```

Expected:

```js
{
  primitive3dEnabled,
  forceNear,
  vehicleCount,
  primitiveCount,
  carPrimitiveCount,
  truckPrimitiveCount,
  lastPrimitiveBuild,
  lastPrimitiveError
}
```

## Implementation Order

1. Add primitive3d state flags.
2. Add primitive car builder.
3. Add primitive truck builder.
4. Route actorType selection through primitive builder only when enabled.
5. Add static test actor command.
6. Add cleanup command.
7. Add primitive state debug.
8. Test static primitive car/truck.
9. Test live hero.
10. Test traffic trucks.
11. Test camera profiles.
12. Do not proceed to buildings until truck reads as 3D.

## Implementation Guide

- **Where:** Add primitive proof state, builders, and rebuild keys in `wall/systems/render/worldSpaceVehicleLayer.js`; add debug commands in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What:** Run `npm run dev`, then execute `_wos.debug.worldVehicles.enable()`, `_wos.debug.worldVehicles.primitive3d(true)`, `_wos.debug.worldVehicles.testPrimitive3D()`, and then live hero/traffic tests.
- **Expect:** A deliberately chunky primitive 3D car and box truck appear in world space, survive camera pitch/bearing, follow actor positions, and prove whether WOS can support trucks/buildings through the same 3D primitive pathway.
