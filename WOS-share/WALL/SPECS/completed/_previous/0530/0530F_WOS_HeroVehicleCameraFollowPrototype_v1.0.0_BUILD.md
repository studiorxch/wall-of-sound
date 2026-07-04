# [BUILD] 0530F_WOS_HeroVehicleCameraFollowPrototype_v1.0.0

## Build Readiness

**Status:** [BUILD]

## Purpose

Create the first ground actor prototype:

```text
Current location → GPS-style road route → visible hero car → flying camera follows car
```

This pass validates that WOS traversal can follow a grounded actor without building traffic, full Drive mode, or a transport ecosystem.

## Assumptions

- Mapbox map runtime is already active.
- Current location is read from the visible map center.
- Flight/drone camera controls already exist and should remain working.
- Existing destination resolver supports city/IATA/coordinate lookup.
- Address-level routing may require Mapbox Geocoding and Directions API access.
- This is a prototype for one hero car only.

## Non-Goals

Do **not** build:

- traffic simulation
- parked cars
- NPC drivers
- full Drive UI
- walking / biking / transit
- minimap / PIP
- clouds
- joystick support
- road law simulation beyond Mapbox route geometry

## Required System Model

```text
Route Authority → Hero Car Actor → Flying Camera POV
```

### Route Authority

Owns:

```text
where the car is allowed to drive
```

Must use road-aware routing when available:

```text
Mapbox Directions API
profile: mapbox/driving
```

### Hero Car Actor

Owns:

```text
position
heading
route progress
speed
visible representation
```

### Flying Camera POV

Owns:

```text
how the car is observed
```

The camera follows the car actor, not the abstract route.

## Required Files

Create or update only the smallest useful set:

```text
wall/systems/world/heroVehicleRuntime.js
wall/systems/render/heroVehicleRenderer.js
wall/systems/presentation/heroVehicleDebug.js
wall/systems/presentation/traversalControlDeck.js
wall/systems/presentation/traversalHUD.js
```

Do not modify unrelated maritime, aircraft, cloud, or atmosphere systems unless required for safe integration.

## Data Layer

### Destination Input

The prototype must support:

```text
current map center → destination
```

Destination should eventually support:

```text
address
city
landmark
coordinates
```

Initial fallback is acceptable:

```text
existing DESTINATIONS resolver
```

But the code must be structured so Mapbox Geocoding can be added without rewriting the actor/camera system.

### Road Route Shape

The route should resolve to a polyline-like coordinate sequence:

```ts
type RoutePoint = {
  lat: number;
  lng: number;
};
```

Required route object:

```ts
type HeroVehicleRoute = {
  id: string;
  source: 'mapbox-directions' | 'destination-table-fallback';
  profile: 'driving';
  origin: RoutePoint;
  destination: RoutePoint;
  points: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
};
```

If Mapbox Directions is unavailable, use a clearly labeled fallback route and warn in console:

```text
[HeroVehicleRuntime] Directions unavailable — using fallback straight route.
```

Fallback must not pretend to be road-aware.

## Logic Layer

## HeroVehicleRuntime

Create:

```js
SBE.HeroVehicleRuntime
```

Required API:

```js
startRoute(options)
stop()
pause()
resume()
setSpeed(multiplier)
setRoute(route)
getState()
```

### startRoute(options)

Input:

```js
{
  from: { lat, lng, label },
  to: { lat, lng, label },
  destinationText: string,
  speedMultiplier: number,
  routeSource?: 'mapbox-directions' | 'fallback'
}
```

Behavior:

1. Resolve road route.
2. Create hero car actor.
3. Start route progression.
4. Expose actor state for renderer and camera.
5. Do not modify flight runtime.

### Actor State

Runtime state must include:

```js
{
  active: boolean,
  paused: boolean,
  actorType: 'hero_car',
  transportState: 'drive',
  routeSource: string,
  lat: number,
  lng: number,
  headingDeg: number,
  speedMultiplier: number,
  progressPct: number,
  distanceRemainingMeters: number,
  routePointCount: number
}
```

## Hero Vehicle Motion

The car should move along route geometry using distance-weighted interpolation.

Required:

- heading follows route segment direction
- progress increases smoothly
- speed changes do not restart route
- stop removes the actor cleanly

## Renderer Layer

## HeroVehicleRenderer

Create:

```js
SBE.HeroVehicleRenderer
```

Required visual:

```text
small low-poly car marker
heading-aligned
scale-aware
visible at drone / rooftop / urban altitude
```

Minimum viable shape:

- body rectangle / capsule
- windshield or front marker
- heading direction cue
- subtle shadow

Do not use a generic dot.

The car must be visually readable as a vehicle.

## Camera Follow

Add camera mode:

```text
drone_follow_vehicle
```

Behavior:

```text
Hero car position → camera follows from above/behind → forward cinematic framing
```

Initial camera profile:

```js
{
  altitudeLabel: 'Drone' | 'Low Drone' | 'Urban' | 'Rooftop',
  zoom: 16.5,
  pitch: 35,
  followBehindMeters: 35,
  lateralOffsetMeters: 0,
  smoothing: 0.75
}
```

Camera must remain separate from the car actor.

The car moves.
The camera observes.

## UI Layer

Do not add a complex Drive UI.

Add only a clean experimental trigger:

```text
Drive tab → enabled as prototype
```

When Drive is selected:

```text
FROM Current location
TO destination input
Speed stepper
Altitude stepper
Launch
```

Same UI shape as Flight.

Do not add route mode selectors, presets, advanced panels, or extra buttons.

## HUD

Update HUD to show:

```text
DRIVE › destination
ACTOR      hero_car
POV        drone_follow
ROUTE      driving / fallback
PROG       xx.x%
DIST       x.x km
SPEED      1x
ZOOM       xx.x
PITCH      xx.x°
```

If route is fallback:

```text
ROUTE fallback
```

Do not hide the fallback status.

## Debug API

Create:

```js
_wos.debug.heroVehicle
```

Required methods:

```js
state()
start(to)
stop()
speed(multiplier)
route()
camera()
```

Example:

```js
_wos.debug.heroVehicle.start('Los Angeles')
_wos.debug.heroVehicle.state()
```

## Error Handling

Required guards:

- map not ready
- destination not found
- Directions API unavailable
- route has fewer than 2 points
- renderer canvas unavailable
- camera rig unavailable

All errors must fail visibly but safely.

No silent fallback except explicitly labeled route fallback.

## Acceptance Tests

### Test 1 — Drive tab launches prototype

```text
Select Drive
Enter Los Angeles
Launch
```

Expected:

```text
hero car appears
HUD says DRIVE
actor is hero_car
route starts
```

### Test 2 — Car is visible

Expected:

```text
visible low-poly car
heading-aligned
not a dot
not invisible camera-only motion
```

### Test 3 — Camera follows car

Expected:

```text
camera follows the car actor
car remains in frame
camera does not follow abstract route independently
```

### Test 4 — Speed changes live

Expected:

```text
speed stepper changes car speed
route does not restart
car remains visible
```

### Test 5 — Altitude changes live

Expected:

```text
altitude stepper changes camera height/framing
car route does not restart
car remains visible
```

### Test 6 — Route source visible

Expected:

```text
HUD/debug clearly says mapbox-directions or fallback
```

### Test 7 — No traffic

Expected:

```text
only one hero car appears
no traffic system added
```

## Build Notes

This is not full Drive mode.

This is:

```text
Hero Vehicle Camera Follow Prototype
```

The goal is to validate:

- grounded actor routing
- visible actor scale
- drone follow camera
- road-aware route feasibility
- future Drive architecture

## Implementation Guide

- **Where:** Add `heroVehicleRuntime.js`, `heroVehicleRenderer.js`, `heroVehicleDebug.js`; minimally update `traversalControlDeck.js` and `traversalHUD.js` to support Drive prototype routing and telemetry.
- **What:** Implement one visible hero car actor that follows a road-aware Mapbox Directions route when available, with labeled fallback routing when not available; camera follows the car using a drone-style POV.
- **Expect:** Selecting Drive and launching a destination creates a visible car moving along a route, with the flying camera following it and HUD/debug clearly reporting actor, POV, speed, progress, and route source.
