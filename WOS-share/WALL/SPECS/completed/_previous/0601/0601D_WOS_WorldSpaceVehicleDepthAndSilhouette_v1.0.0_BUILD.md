# 0601D_WOS_WorldSpaceVehicleDepthAndSilhouette_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- `WorldSpaceVehicleLayer` is active and render-ready.
- Hero and traffic actors bind correctly into world space.
- `VehicleVisualRegistry` is loaded before `WorldSpaceVehicleLayer`.
- `shapeMode('vehicle')` renders world-space cars and trucks.
- Current vehicles are world-bound but still read as flat tokens from camera views.
- Map surface/style corruption is a separate issue and must not be addressed in this spec.

## Purpose

Improve vehicle depth, silhouette, and 2.5D readability so world-space vehicles no longer appear as flat markers.

Current state:

```text
Vehicles are correctly positioned in world space.
Vehicles are visually too flat.
```

Target state:

```text
Vehicles read as small 2.5D objects with clear body volume, cabin volume, front/back cues, and actor-specific silhouettes.
```

This is a visual presentation pass only.

## Core Doctrine

```text
World-space binding proves location.
Depth and silhouette prove objecthood.
```

Vehicles must feel attached to the world surface while still having enough height, side-face contrast, and silhouette information to read as physical objects.

## Non-Goals

Do not modify:

- routing
- traffic spawn behavior
- hero camera logic
- vehicle session rebind
- adaptive LOD thresholds
- Mapbox style layers
- bridge visibility
- weather/location logic
- GLB loading

Do not introduce external assets.

## Required Files

Update:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/render/vehicleVisualRegistry.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional only if needed:

```text
wall/systems/render/trafficOccupancyRenderer.js
wall/systems/render/heroVehicleRenderer.js
```

## Visual Problem

Current vehicles have correct actor identity but insufficient depth cues:

```text
top face dominates
side faces too weak
cabins too shallow
wheels do not anchor the body
trucks read as flat rectangles
cars read like UI tokens
```

The visual language must shift from:

```text
flat map marker
```

to:

```text
low-poly 2.5D vehicle object
```

## Depth Strategy

Use simple geometry only:

- `BoxGeometry`
- `PlaneGeometry`
- `CylinderGeometry` only if already safe
- no loaded models
- no textures
- no physics

Depth should come from:

```text
raised chassis
raised cabin
side-face contrast
front/rear cue planes
wheel/contact shadows
roof/glass separation
cargo volume for trucks
```

## Vehicle Height Rules

Define central dimensions per class.

Suggested base dimensions:

```js
hero_car: {
  width: 3.4,
  length: 6.8,
  chassisHeight: 0.75,
  cabinHeight: 1.25,
  cabinZ: 1.15
}

traffic_car: {
  width: 3.0,
  length: 6.2,
  chassisHeight: 0.65,
  cabinHeight: 1.05,
  cabinZ: 1.00
}

box_truck: {
  width: 3.8,
  length: 9.5,
  cabHeight: 1.7,
  cargoHeight: 2.4,
  cargoZ: 1.45
}
```

Exact values may be tuned, but they must be centralized.

## Camera Profile Depth Exaggeration

Add depth exaggeration by camera profile.

Suggested defaults:

```text
Low      = 1.00
Drone    = 1.10
Urban    = 1.20
Rooftop  = 1.35
Regional = 1.50
Cruise   = 1.65
```

If profile unavailable:

```text
1.0
```

Apply to vertical dimensions only, not footprint width/length.

Purpose:

```text
higher camera = stronger vertical readability
```

## Side-Face Contrast

Vehicle visuals must resolve side materials from the registry.

Add optional registry fields:

```js
side
roof
glass
shadow
front
rear
```

If missing, derive safely from existing colors.

No mesh builder may hardcode per-variant colors.

## Hero Car Requirements

Hero must gain:

```text
raised chassis
larger cabin volume
front windshield plane
rear windshield plane
side glass suggestion
headlight cue
taillight cue
stronger contact shadow
```

Hero should read as more prominent than traffic cars from the same zoom/profile.

## Traffic Car Requirements

Traffic cars must gain:

```text
raised chassis
smaller cabin volume than hero
front/rear glass cues
minimal side contrast
contact shadow
```

Traffic cars should read as secondary but still physical.

## Taxi Requirements

Taxi must retain:

```text
yellow body
roof sign
black/dark beltline
dark glass
```

Roof sign should be slightly raised above cabin and remain visible at near/mid LOD.

## Box Truck Requirements

Box trucks must gain:

```text
separate cab volume
separate cargo volume
cargo side panel
rear door cue
windshield cue
stronger contact shadow
larger footprint than cars
```

Truck height must be visually obvious.

## Graffiti Truck Requirements

Graffiti treatment must remain on the cargo side.

Rules:

```text
truck silhouette first
graffiti second
no silhouette distortion
no route/actor mutation
```

At near LOD, show multiple side panels.

At mid LOD, show simplified color blocks.

At far/tiny LOD, graffiti may collapse to a single accent stripe.

## LOD Depth Behavior

### Near

Full depth:

```text
raised chassis
raised cabin/cargo
windows
lights
side contrast
shadow
```

### Mid

Reduced detail, preserved volume:

```text
raised body
raised cabin/cargo
front cue
shadow
```

### Far

Silhouette-first:

```text
low raised slab
strong color
front/rear cue
shadow
```

### Tiny

Token with minimal thickness:

```text
slightly raised slab
heading cue
shadow optional
```

## Mesh Rebuild Rule

Mesh rebuild definition remains:

```text
shapeMode
actorType
variant
lodTier
```

Depth exaggeration must not cause per-frame rebuild loops.

If camera profile changes and depth profile requires different geometry, it may set a dirty flag once.

Do not rebuild from lat/lng/heading/speed.

## Transform Rule

Depth changes must not affect world position.

Vehicle origin must remain centered at actor lat/lng.

The bottom of the vehicle should sit at road surface:

```text
z >= 0
```

Never place the mesh below the map surface.

## Debug API Additions

Add:

```js
_wos.debug.worldVehicles.depth()
_wos.debug.worldVehicles.depth(true)
_wos.debug.worldVehicles.depth(false)
```

Behavior:

- no arg: print depth system status
- true: enable depth-enhanced vehicle meshes
- false: use previous flatter vehicle meshes

Add:

```js
_wos.debug.worldVehicles.depthState()
```

Expected output:

```js
{
  depthEnabled: true,
  cameraProfile: 'Rooftop',
  depthMultiplier: 1.35,
  vehicles: [
    {
      id,
      actorType,
      variant,
      lodTier,
      dimensions,
      finalScale,
      depthMultiplier,
      meshProfile
    }
  ]
}
```

## Acceptance Test A — Hero Depth

Run:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.liveHero()
_wos.debug.worldVehicles.shapeMode('vehicle')
_wos.debug.worldVehicles.depth(true)
_wos.debug.worldVehicles.depthState()
```

Expected:

```text
hero reads as raised 2.5D vehicle
body is not flat
cabin volume is visible
contact shadow anchors vehicle
```

## Acceptance Test B — Traffic Depth

Run:

```js
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
_wos.debug.worldVehicles.depthState()
```

Expected:

```text
traffic cars read as cars
taxis read as taxis
trucks read taller and longer than cars
graffiti truck still has cargo-side art
DOM markers remain hidden in vehicle mode
```

## Acceptance Test C — Camera Profiles

Cycle:

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
vehicles retain depth readability
no vehicles become absurdly tall
no vehicles sink below road surface
no per-frame rebuild loop
```

## Acceptance Test D — LOD Transition

Move through zoom ranges:

```text
near
mid
far
tiny
```

Expected:

```text
depth simplifies smoothly
silhouette remains readable
identity does not collapse
```

## Failure Handling

Depth builder must never throw into RAF.

If depth mesh build fails:

```text
record mesh_build_failed
fallback to previous flat vehicle mesh
DOM fallback remains available
warn once per actor/reason per 2s
```

## Implementation Order

1. Add central vehicle dimension table.
2. Add depth profile resolver.
3. Add debug state.
4. Add depth-enhanced hero/car/truck mesh builders.
5. Apply depth mesh only when `depthEnabled === true`.
6. Validate with hero only.
7. Validate with traffic.
8. Tune camera-profile exaggeration.

## Implementation Guide

- **Where:** Add depth dimensions, profile resolver, and mesh builder updates in `wall/systems/render/worldSpaceVehicleLayer.js`; add optional color fields in `wall/systems/render/vehicleVisualRegistry.js`; add `depth()` and `depthState()` in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What:** Run Drive, enable world vehicles, enable `shapeMode('vehicle')`, enable `depth(true)`, spawn visible traffic, then test camera profiles.
- **Expect:** Vehicles remain world-bound but now read as low-poly 2.5D objects with clear body volume, cabin/cargo volume, side contrast, and actor-specific silhouettes.
