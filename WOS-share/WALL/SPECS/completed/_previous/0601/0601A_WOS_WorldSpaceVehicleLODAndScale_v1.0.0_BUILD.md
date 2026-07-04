# 0601A_WOS_WorldSpaceVehicleLODAndScale_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- `WorldSpaceVehicleLayer` is stable and render-ready.
- Hero vehicle and traffic actors now bind into `WorldSpaceVehicleLayer`.
- `vehicleCount` correctly reflects hero + world-space traffic actors.
- DOM fallback remains operational.
- `shapeMode('vehicle')` works.
- This pass focuses on visual readability, not routing or traffic behavior.

## Purpose

Establish vehicle LOD and scale authority for world-space vehicles.

Current state:

```text
World-space vehicles render correctly.
```

Next required state:

```text
World-space vehicles remain readable, proportional, and map-native across altitude/camera profiles.
```

This spec prevents vehicles from becoming:

- too tiny at Rooftop/Urban views
- absurdly large at Low/Drone views
- visually identical across actor types
- unreadable compared with buildings/roads
- detached from the map surface

## Core Doctrine

```text
Visibility is not realism.
Readability is the first production goal.
```

Vehicles should feel like WOS map-native actors, not full-simulation car models.

## Non-Goals

Do not modify:

- routing
- traffic spawn rules
- hero camera follow
- weather/location systems
- Mapbox style layers
- bridge/overpass handling
- arrow suppression
- GLB loading

Do not introduce external assets.

## Required Files

Update:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional if needed:

```text
wall/systems/render/heroVehicleRenderer.js
wall/systems/render/trafficOccupancyRenderer.js
```

## Scale Authority

Add a central scale resolver:

```js
_resolveVehicleScale(actorType, variant, zoom, pitch, cameraProfile)
```

It must return a final multiplier applied after Mercator metres conversion.

Inputs:

- actor type
- variant
- map zoom
- map pitch
- camera profile if available
- global `shapeScale`

Output:

```js
{
  baseScale,
  zoomScale,
  typeScale,
  profileScale,
  finalScale,
  lodTier
}
```

## LOD Tiers

Define tiers:

```text
near
mid
far
tiny
```

Suggested thresholds:

```text
near: zoom >= 16.5
mid:  14.5 <= zoom < 16.5
far:  12.5 <= zoom < 14.5
tiny: zoom < 12.5
```

These may be tuned but must remain centralized.

## Actor Scale Rules

Default proportional rules:

```text
hero_car      = 1.25x
traffic_car   = 1.00x
box_truck     = 1.45x
```

Hero should remain slightly more readable than traffic.

Trucks must read larger than cars.

## Camera Profile Multipliers

Suggested defaults:

```text
Low      = 0.85
Drone    = 1.00
Urban    = 1.20
Rooftop  = 1.45
Regional = 2.00
Cruise   = 2.50
```

If camera profile is unavailable, default to `1.0`.

## Zoom Scale Defaults

Suggested defaults:

```text
near = 1.00
mid  = 1.35
far  = 2.20
tiny = 3.50
```

These multipliers are readability compensation, not physical simulation.

## Maximum / Minimum Clamp

Add final clamping:

```text
min finalScale: 0.65
max finalScale: 8.0
```

Debug overrides may exceed this only if explicitly requested.

## Geometry Simplification by LOD

Vehicle meshes should simplify as zoom decreases.

### near

Use full 2.5D vehicle mesh:

- chassis
- cabin
- windshield
- rear window
- wheel/contact marks
- contact shadow
- truck graffiti panels

### mid

Use simplified vehicle mesh:

- chassis
- cabin
- nose cue
- contact shadow
- no wheel marks required

### far

Use readable capsule/slab mesh:

- elongated footprint
- actor color
- nose cue
- no cabin detail

### tiny

Use simple world-space token:

- small slab or lozenge
- clear heading cue
- no details

Important:

```text
LOD changes must not cause mesh flicker.
```

Mesh rebuilds are allowed only when `lodTier` changes, not every frame.

## Mesh Identity Rule

Existing constitutional rule still applies:

```text
A mesh may only rebuild when its actor definition changes.
```

Actor definition now includes:

```text
shapeMode
actorType
variant
lodTier
```

It does NOT include:

```text
lat
lng
heading
speed
camera movement
```

## Debug API

Add:

```js
_wos.debug.worldVehicles.lod()
_wos.debug.worldVehicles.lod(true)
_wos.debug.worldVehicles.lod(false)
```

Behavior:

- no arg: print LOD state
- true: enable adaptive LOD
- false: disable adaptive LOD and use current `shapeScale`

Add:

```js
_wos.debug.worldVehicles.scaleState()
```

Expected output:

```js
{
  adaptiveLOD: true,
  shapeScale: 1,
  zoom: 15.8,
  pitch: 38,
  cameraProfile: 'Urban',
  vehicles: [
    {
      id,
      actorType,
      variant,
      lodTier,
      baseScale,
      zoomScale,
      typeScale,
      profileScale,
      finalScale
    }
  ]
}
```

## State Requirements

Extend `getState()` with:

```js
adaptiveLOD
lastScaleResolve
lodCounts
```

Example:

```js
lodCounts: {
  near: 1,
  mid: 4,
  far: 0,
  tiny: 0
}
```

## Acceptance Test A — Hero Readability

Run:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.liveHero()
_wos.debug.worldVehicles.shapeMode('vehicle')
_wos.debug.worldVehicles.lod(true)
_wos.debug.worldVehicles.scaleState()
```

Expected:

```text
hero visible
hero not gigantic
hero remains seated on road
scaleState shows hero finalScale
```

## Acceptance Test B — Traffic Readability

Run:

```js
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
_wos.debug.worldVehicles.scaleState()
```

Expected:

```text
traffic cars visible
trucks visibly larger than cars
graffiti truck side still readable at near/mid
DOM markers hidden in vehicle mode
```

## Acceptance Test C — Altitude Switching

Cycle camera/altitude profiles:

```text
Low
Drone
Urban
Rooftop
Regional
Cruise
```

Expected:

```text
vehicles remain visible across all profiles
vehicles do not become absurdly large
LOD tier changes are smooth
no per-frame rebuild loop
```

## Acceptance Test D — Fallback

Run:

```js
_wos.debug.worldVehicles.lod(false)
_wos.debug.worldVehicles.shapeScale(1)
_wos.debug.worldVehicles.state()
```

Expected:

```text
adaptiveLOD: false
manual shapeScale still works
existing rendering preserved
```

## Failure Handling

LOD resolver must never throw into RAF.

If scale resolution fails:

```text
fall back to finalScale = shapeScale
warn once
continue rendering
```

## Implementation Notes

Recommended order:

1. Add LOD state + scale resolver.
2. Add debug output.
3. Apply scale resolver inside `_applyTransform()`.
4. Add mesh rebuild condition for `lodTier`.
5. Simplify geometry per LOD tier only after scale works.

Do not do geometry simplification before scale is observable.

## Implementation Guide

- **Where:** Add `_resolveVehicleScale()` and LOD state in `wall/systems/render/worldSpaceVehicleLayer.js`; add `lod()` and `scaleState()` commands in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What:** Run Drive, enable world vehicles, spawn traffic, enable adaptive LOD, and test Low/Drone/Urban/Rooftop altitude profiles.
- **Expect:** Hero and traffic vehicles stay readable and proportional across camera altitudes, with trucks larger than cars and no per-frame mesh rebuilds.
