# 0531N_WOS_WorldSpaceTrafficVehicleBinding_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- `HeroVehicleRuntime.getRoute()` now exposes the active route polyline.
- `TrafficOccupancyRuntime.spawnOnHeroRoute(count)` can place traffic on the hero route.
- `WorldSpaceVehicleLayer` is stable for hero vehicle rendering.
- `WorldSpaceVehicleLayer` supports `actorType === 'box_truck'` before vehicle-mode car fallback.
- DOM traffic markers still work and must remain the fallback path.
- This pass does not redesign traffic behavior, route selection, or camera logic.

## Purpose

Bind traffic actors to `WorldSpaceVehicleLayer` so traffic can render as true world-space vehicles instead of DOM markers.

Current state:

```text
TrafficOccupancyRuntime
→ TrafficOccupancyRenderer
→ DOM Marker
```

Target state:

```text
TrafficOccupancyRuntime
→ TrafficOccupancyRenderer
→ WorldSpaceVehicleLayer.upsertVehicle()
→ DOM fallback only if world-space unavailable
```

## Core Doctrine

```text
Traffic actors are world occupants.
DOM markers are only fallback diagnostics.
```

## Non-Goals

Do not modify:

- hero routing
- traffic spawn rules
- traffic speed rules
- camera behavior
- weather/location systems
- Mapbox style layers
- road arrow suppression
- bridge visibility
- GLB loading

Do not introduce external 3D assets.

## Required Files

Update:

```text
wall/systems/render/trafficOccupancyRenderer.js
wall/systems/world/trafficOccupancyRuntime.js
wall/systems/presentation/trafficOccupancyDebug.js
wall/systems/render/worldSpaceVehicleLayer.js
```

Optional only if required:

```text
wall/systems/render/heroVehicleRenderer.js
```

## Actor Payload Contract

Every traffic actor sent to `WorldSpaceVehicleLayer.upsertVehicle()` must use this shape:

```js
{
  id: actor.id,
  actorType: actor.actorType,
  variant: actor.variant,
  lat: actor.lat,
  lng: actor.lng,
  headingDeg: actor.headingDeg,
  visible: true,
  source: actor.mode || actor.source || 'traffic'
}
```

Mapping rule:

```text
compact_car → traffic_car
box_truck   → box_truck
```

If `WorldSpaceVehicleLayer` expects `traffic_car`, normalize inside the renderer before upsert.

## Renderer Binding Rules

In `trafficOccupancyRenderer.js`, update the traffic render path:

1. Resolve `WorldSpaceVehicleLayer`.
2. Check:

```js
wsl.getEnabled()
wsl.isRenderReady()
```

3. Build traffic payload.
4. Call:

```js
wsl.upsertVehicle(payload)
```

5. If upsert succeeds:

```js
DOM marker hidden
return
```

6. If upsert fails or WSL unavailable:

```js
DOM marker visible
continue existing DOM marker update
```

## DOM Fallback Rules

DOM fallback must remain fully operational.

Rules:

- If WSL disabled → DOM visible.
- If WSL enabled but not render-ready → DOM visible.
- If traffic payload invalid → DOM visible.
- If upsert fails → DOM visible.
- If actor removed → remove both DOM marker and world-space mesh.
- If WSL upsert succeeds → DOM hidden.

## Removal Rule

When traffic actor is removed:

```js
WorldSpaceVehicleLayer.removeVehicle(actor.id)
DOM marker.remove()
delete marker reference
```

This prevents ghost world-space vehicles.

## WorldSpaceVehicleLayer Requirements

Confirm or add:

```js
removeVehicle(id)
```

Required behavior:

- removes mesh from scene
- deletes `_meshes[id]`
- deletes `_vehicles[id]`
- safe no-op if id not found
- never throws

## Shape Mode Behavior

Traffic should obey the same shape mode as hero:

```js
shapeMode('block')
shapeMode('slab')
shapeMode('wedge')
shapeMode('vehicle')
```

Calibration modes may keep DOM markers visible if useful.

Production mode:

```text
vehicle
```

should hide DOM traffic markers after successful world-space upsert.

## Traffic-Specific Geometry

In `shapeMode('vehicle')`:

```text
compact_car / traffic_car → car mesh
box_truck                 → truck mesh
```

Box truck must remain visually distinguishable from compact car.

Minimum truck requirements:

- longer rectangular cargo body
- cab block
- windshield cue
- side panel surface
- graffiti/sticker panels for `sticker_graffiti_test`
- contact shadow plane

Use simple geometry only.

## Debug API Additions

Extend `_wos.debug.traffic` with:

```js
_wos.debug.traffic.world()
_wos.debug.traffic.world(true)
_wos.debug.traffic.world(false)
```

Behavior:

- no arg: print current world-space traffic binding status
- `true`: enable WSL traffic binding if WSL exists
- `false`: force DOM-only traffic rendering

Also add:

```js
_wos.debug.traffic.worldState()
```

Expected output:

```js
{
  enabled: true,
  wslEnabled: true,
  wslRenderReady: true,
  actorCount: 4,
  worldActorCount: 4,
  domVisibleCount: 0,
  domFallbackCount: 0,
  lastWorldSuccess: { id, actorType, variant },
  lastWorldFailure: { id, reason }
}
```

## Debug Visual Output

Update `_wos.debug.traffic.visual()` to include for each actor:

```text
id
actorType
variant
mode
domAttached
domVisible
worldBound
worldVisible
lat
lng
headingDeg
scale
```

## Failure Handling

Traffic renderer must never throw into RAF.

All world-space failures should be handled as:

```text
warn once per actor per reason per 2 seconds
DOM fallback active
```

Do not spam console every frame.

## Acceptance Test A — Static Traffic

Run:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.shapeMode('vehicle')
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
_wos.debug.traffic.worldState()
```

Expected:

```text
actorCount: 4
worldActorCount: 4
domVisibleCount: 0
box_truck actors render as trucks
compact_car actors render as cars
```

## Acceptance Test B — Hero Route Traffic

Run after Drive is active and route is exposed:

```js
_wos.debug.heroVehicle.route()
_wos.debug.traffic.spawnOnHeroRoute(4)
_wos.debug.traffic.world(true)
_wos.debug.traffic.worldState()
```

Expected:

```text
hero route points > 2
traffic actors spawn on hero route
worldActorCount: 4
DOM traffic markers hidden
traffic conforms to map pitch and bearing
```

## Acceptance Test C — Fallback

Run:

```js
_wos.debug.worldVehicles.disable()
_wos.debug.traffic.worldState()
```

Expected:

```text
worldActorCount: 0
DOM markers visible
traffic still visible and moving
```

## Regression Tests

Confirm hero still works:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.liveHero()
_wos.debug.worldVehicles.shapeMode('vehicle')
_wos.debug.worldVehicles.state()
```

Expected:

```text
vehicleCount >= 1
lastSuccess.id: hero
```

Confirm traffic route still works:

```js
_wos.debug.heroVehicle.route()
```

Expected:

```text
points > 2
distance > 0
coordinates: N × [lng,lat]
```

## Implementation Notes

Important current state:

- Route exposure has been fixed.
- `spawnOnHeroRoute()` now receives a real hero route.
- Traffic DOM markers prove traffic actors are alive.
- Remaining problem is renderer binding, not traffic runtime.

Do not rework the runtime unless the actor payload is missing required fields.

## Implementation Guide

- **Where:** Add world-space bridge logic in `wall/systems/render/trafficOccupancyRenderer.js`; add debug toggles in `wall/systems/presentation/trafficOccupancyDebug.js`; confirm `removeVehicle(id)` in `wall/systems/render/worldSpaceVehicleLayer.js`.
- **What:** Run Drive, enable world vehicles, set `shapeMode('vehicle')`, spawn `spawnVisibleTest()` and `spawnOnHeroRoute(4)`, then inspect `_wos.debug.traffic.worldState()`.
- **Expect:** Traffic cars and trucks render as world-space meshes that conform to pitch/bearing, with DOM traffic markers used only as fallback.
