[BUILD]

# 0531I_WOS_TrafficOccupancy_v1.0.0

## Purpose

Add the first visible traffic occupancy layer to WOS Drive mode so the current prototype becomes more video-worthy immediately.

This is not a full traffic simulation. This is a controlled visual test:

- upgrade the hero vehicle from SVG token toward model-ready actor logic
- add a tiny number of road-following traffic actors
- create a procedural low-poly box truck if no truck model is available
- support white truck / graffiti truck visual variants
- keep the system stable enough for long ambient drive recordings

The goal is to make the world feel inhabited without building traffic AI.

---

# Build Readiness

Status: [BUILD]

Use this as an immediate implementation patch for Claude/Codex.

---

# Assumptions

- Drive mode already works through `HeroVehicleRuntime`.
- Car jitter has been fixed through RAF smoothing and `map.jumpTo()` camera follow.
- The current red SVG vehicle is still used as the visible actor.
- A Ford Focus GLB exists locally and may be tested as the hero vehicle.
- A low-poly truck model may not be available yet.
- Mapbox Directions API is already being used for hero vehicle routing.
- This pass prioritizes video usefulness over simulation completeness.

---

# Non-Negotiables

## Do Not Regress Drive Stability

Do not change:

- hero route resolution
- hero smoothing
- hero speed stepping
- hero altitude stepping
- existing launch flow
- existing destination resolver
- flight runtime
- maritime runtime
- cloud runtime

## No Full Traffic Simulation

Do not build:

- lane-changing AI
- traffic lights
- collision avoidance
- intersection rules
- parking logic
- pedestrian systems
- transit systems

This is visual occupancy only.

## Keep Counts Low

Default active traffic count:

```text
3–5 actors
```

Hard cap for this pass:

```text
10 actors
```

---

# Part 1 — Traffic Occupancy Runtime

## New File

```text
wall/systems/world/trafficOccupancyRuntime.js
```

## Responsibility

Own non-hero traffic actors.

Each traffic actor must have:

```js
{
  id,
  type,
  variant,
  route,
  progress,
  speedMultiplier,
  lat,
  lng,
  headingDeg,
  active
}
```

## Required Behavior

Traffic actors should:

- spawn near the hero vehicle or along the current drive route
- follow simple route polylines
- update on `requestAnimationFrame`
- use the same distance-along-route interpolation pattern as the hero vehicle
- despawn when route completes or actor gets too far away
- never control the camera
- never affect the hero vehicle

## Route Source

For this pass, traffic route source can be simple:

1. Prefer short Mapbox Directions route near current hero/camera position.
2. If unavailable, use a short fallback segment.
3. Do not block hero drive if traffic route fails.

## Spawn Rules

Default spawn pool:

```text
2 compact cars
2 white box trucks
1 taxi or color-variant car
```

Spawn distance target:

```text
300m–1500m from hero vehicle
```

If route generation fails, skip that actor silently except for one console warning.

---

# Part 2 — Traffic Renderer

## New File

```text
wall/systems/render/trafficOccupancyRenderer.js
```

## Responsibility

Render traffic actors.

Initial renderer may use Mapbox DOM markers for speed, but must be isolated so it can later migrate to symbol/model/custom layers.

## Required Visual Classes

```text
compact_car
box_truck
box_truck_graffiti
box_truck_clean
```

## Renderer Requirements

Traffic vehicles must:

- be smaller than hero vehicle
- rotate with road heading
- use map-space rotation
- scale by zoom
- not use large drop shadows
- not jitter independently of runtime smoothing

## Actor Priority

Hero vehicle remains visually dominant.

Traffic should feel like environment:

```text
visible but not loud
alive but not distracting
```

---

# Part 3 — Procedural Low-Poly Box Truck

## Why

A downloaded truck model is not currently available, but the box truck idea is too valuable to wait on.

Claude should create a procedural low-poly box truck in code for this test.

## Implementation Options

Preferred fast path:

```text
Three.js procedural geometry exported/instanced at runtime
```

Fallback acceptable path:

```text
SVG / DOM marker approximating a 2.5D box truck
```

## Truck Shape

Procedural truck should include:

```text
cab block
cargo box block
windshield plane
front bumper
4–6 wheels
side panel material area
subtle contact shadow
```

## Triangle Budget

Target:

```text
200–800 triangles
```

Hard upper bound:

```text
1500 triangles
```

## Visual Style

The truck should match the WOS map-world style:

- low-poly
- simple geometry
- soft colors
- readable from above
- not realistic
- not cartoon toy

## Debug

Add:

```js
_wos.debug.traffic.truckPreview()
```

Expected:

```js
{
  generated: true,
  triangleEstimate: 300,
  variants: ['clean_white', 'graffiti_01']
}
```

---

# Part 4 — Graffiti / Artwork Truck Variant

## Purpose

Use trucks as moving culture surfaces.

White box trucks are valuable because they are:

```text
traffic
blank walls
urban artifacts
moving advertisements
moving graffiti canvases
```

## Required Variant Support

Add at least two truck visual variants:

```text
clean_white
sticker_graffiti_test
```

## Artwork Source

For this pass, do not build a full artwork library.

Use one of these simple approaches:

### Option A — Procedural Test Markings

Add fake graffiti-like color marks using simple shapes.

### Option B — Static Texture Slot

Support a texture URL/path, but use a placeholder if no image is supplied.

## Required API

```js
SBE.TrafficOccupancyRuntime.spawnTruck({
  variant: 'sticker_graffiti_test'
})
```

## Guardrail

Do not scrape external artwork.
Do not build upload UI.
Do not build marketplace/advertising logic.

This is only visual proof that a truck side can carry art.

---

# Part 5 — Hero Vehicle Model Readiness

## Purpose

Prepare the hero vehicle to upgrade from SVG token to GLB model.

## Existing Candidate

```text
ford_focus_low_poly.glb
```

## Required Work

Add a model-loader path behind a feature flag.

```js
USE_HERO_MODEL = false
```

When enabled, the renderer should attempt to use the GLB model.

If loading fails:

```text
fallback to current flat SVG token
```

## Model Requirements

The model renderer must support:

- position update from hero runtime
- heading rotation
- zoom-aware scale
- shadow/contact grounding
- body color override if material structure allows it

## Do Not Require This To Be Perfect

This pass should not get blocked on perfect GLB rendering.

Acceptance for this part:

```text
feature flag exists
fallback works
model path can be tested
```

---

# Part 6 — Debug API

Add:

```js
_wos.debug.traffic.state()
_wos.debug.traffic.spawn()
_wos.debug.traffic.clear()
_wos.debug.traffic.setCount(5)
_wos.debug.traffic.spawnTruck('clean_white')
_wos.debug.traffic.spawnTruck('sticker_graffiti_test')
_wos.debug.traffic.truckPreview()
```

Expected `state()` shape:

```js
{
  active: true,
  count: 5,
  maxCount: 10,
  actors: [
    {
      id: 'traffic_001',
      type: 'box_truck',
      variant: 'sticker_graffiti_test',
      routeSource: 'mapbox-directions',
      progressPct: 18.4
    }
  ]
}
```

---

# Part 7 — UI Rules

No new large UI.

For this pass, traffic can be debug-only.

Optional compact UI only if trivial:

```text
TRAFFIC  off / low
```

Default should be off until tested.

Do not add drawers, panels, inspectors, or advanced controls.

---

# Acceptance Tests

## Test 1 — Traffic Spawn

Run:

```js
_wos.debug.traffic.spawn()
_wos.debug.traffic.state()
```

Expected:

```text
3–5 traffic actors appear near drive route
actors move independently
hero route continues
camera remains hero-controlled
```

## Test 2 — Clean Truck

Run:

```js
_wos.debug.traffic.spawnTruck('clean_white')
```

Expected:

```text
white box truck appears and moves
truck reads as low-poly urban vehicle
```

## Test 3 — Graffiti Truck

Run:

```js
_wos.debug.traffic.spawnTruck('sticker_graffiti_test')
```

Expected:

```text
truck appears with visible side-panel artwork/marking
art reads as lived-in surface, not UI overlay
```

## Test 4 — Traffic Clear

Run:

```js
_wos.debug.traffic.clear()
```

Expected:

```text
all traffic vehicles removed
hero vehicle remains active
no camera reset
```

## Test 5 — Long Drive Stability

Let Drive run for 20 minutes with 3–5 traffic actors.

Expected:

```text
no major frame collapse
no hero jitter regression
traffic actors despawn/respawn safely
no unbounded DOM growth
```

## Test 6 — Hero Model Flag

Enable hero model flag if implementation is ready.

Expected:

```text
Ford Focus model attempts to load
if model fails, SVG token still renders
route does not fail
```

---

# Files To Create

```text
wall/systems/world/trafficOccupancyRuntime.js
wall/systems/render/trafficOccupancyRenderer.js
wall/systems/presentation/trafficOccupancyDebug.js
```

# Files To Modify

```text
wall/index.html
wall/systems/render/heroVehicleRenderer.js
wall/systems/presentation/heroVehicleDebug.js
```

Modify only as needed.

---

# Out of Scope

Do not build:

```text
traffic lights
intersection intelligence
lane changing
collision avoidance
pedestrians
bike traffic
bus systems
train systems
truck artwork library UI
ad marketplace
route-event camera curiosity
```

---

# Implementation Guide

- **Where**: Add `trafficOccupancyRuntime.js`, `trafficOccupancyRenderer.js`, and `trafficOccupancyDebug.js`; wire them in `wall/index.html` after hero vehicle runtime/renderer; add optional hero GLB feature flag in `heroVehicleRenderer.js`.
- **What**: Launch Drive mode, then run `_wos.debug.traffic.spawn()`, `_wos.debug.traffic.spawnTruck('clean_white')`, and `_wos.debug.traffic.spawnTruck('sticker_graffiti_test')` from the browser console.
- **Expect**: The drive remains smooth while 3–5 simple vehicles occupy the road world; at least one white box truck and one graffiti/art truck can appear as moving culture surfaces without breaking hero camera follow.
