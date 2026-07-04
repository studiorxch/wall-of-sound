# 0530G_WOS_HeroVehicleTier1Cleanup_v1.0.0_BUILD

## Build Status

[BUILD]

## Purpose

Clean up the first Hero Vehicle prototype by protecting the already-working drive experience.

This pass is strictly Tier 1 polish:

- remove visible hero-car jitter
- update locality/weather location as the actor moves
- suppress GPS-style directional road arrows
- preserve the current relaxing drive feel

Do not add new transport modes, traffic, clouds, minimap, camera grids, or new UI systems.

---

## Current Proven Experience

The drive prototype is now watchable for long-form playback.

The environment works:

- roads create rhythm
- city grids create pattern
- parks, water, highways, and buildings create visual variation
- low-altitude camera modes expose useful detail
- destination still sells the experience, while the route sustains it

The main immersion breakers are now small but important.

---

# Tier 1 Fixes

## 1. Hero Car Motion Smoothing

### Problem

The car jitters visibly, especially at low altitude / high zoom.

The world motion is mostly smooth, but the visible car marker breaks the scene.

### Required Change

Smooth the hero vehicle actor position, heading, and marker rendering.

Patch likely files:

```text
systems/world/heroVehicleRuntime.js
systems/render/heroVehicleRenderer.js
```

### Requirements

- Move actor updates onto `requestAnimationFrame`, not a coarse interval.
- Interpolate by distance along route polyline, not by raw vertex stepping.
- Smooth heading changes with shortest-angle interpolation.
- Prevent marker heading flips at low speeds or tiny route bends.
- Keep `setSpeed()` live and non-restarting.
- Camera follow must track the smoothed actor, not unsmoothed route points.

### Suggested Runtime State

```js
{
  rawPosition,
  smoothedPosition,
  rawHeadingDeg,
  smoothedHeadingDeg,
  progressPct,
  speedMultiplier,
  routeSource
}
```

### Acceptance

At these altitudes, car marker must appear glued to the road:

```text
Drone / 25 ft
Low Drone / 50 ft
Urban / 100 ft
Rooftop / 250 ft
```

No visible jump/jitter should appear at:

```text
0.10x
0.25x
1x
5x
```

---

## 2. Dynamic Locality / Weather Location

### Problem

The weather/location overlay often remains stuck on:

```text
New York, NY
```

until arrival or major endpoint change.

This breaks the feeling of travel through districts and neighborhoods.

### Required Change

Add locality updates based on the moving actor/camera position.

Patch likely files:

```text
viewportLocationAuthority.js
weather/location presentation module
heroVehicleRuntime.js or traversal nav bridge
```

### Requirements

- During drive mode, location authority should read hero vehicle position first.
- During flight mode, location authority should read aircraft/current camera position.
- Update displayed locality periodically while moving.
- Do not wait until destination arrival.
- Avoid excessive API calls.

### Update Cadence

Use throttled updates:

```text
locality label: every 30–90 seconds or after meaningful distance change
weather cell: slower, only when region/cell changes
```

### Display Hierarchy

Prefer:

```text
Neighborhood / District
Borough / City
Region / State
```

Example:

```text
Williamsburg
Brooklyn, NY
```

Fallback:

```text
Brooklyn, NY
```

Fallback if resolver fails:

```text
Current Route
```

### Acceptance

A long drive from NYC toward Boston should not keep reading `New York, NY` indefinitely.

The overlay should begin reflecting movement through changing places when available.

---

## 3. Suppress GPS-Style Direction Arrows

### Problem

Repeated road arrows read as UI/navigation symbols.

They make the world feel like a GPS map instead of an environment.

### Rule

Direction should be shown by motion, not symbols.

### Required Change

Suppress map-style layers that render repeated directional arrows, turn arrows, or route-guidance symbols.

Patch likely files:

```text
map style authority
presentation/style runtime
Mapbox layer filtering utilities
```

### Remove / Hide

```text
road direction arrows
turn arrows used as map UI
route guidance arrows
repeated wayfinding glyphs
GPS-style instructional overlays
```

### Keep

```text
lane dividers
road edges
crosswalks
curbs
intersections
medians
rail lines
realistic markings when they are part of the road texture/style
```

### Implementation Guidance

Search active Mapbox layers for symbol layers whose IDs or layout include arrow-like markers.

Likely patterns:

```text
arrow
turn
direction
oneway
road-label-arrow
```

Then set visibility to `none` for those layers only.

Do not globally remove road labels unless explicitly needed later.

### Acceptance

The car remains visible and implies direction.

Road arrows no longer dominate the surface or read as navigation UI.

---

# Non-Goals

Do not add:

- traffic
- additional vehicles
- walk mode
- bike mode
- transit mode
- clouds
- minimap
- PIP map
- director monitor
- camera grid
- graffiti
- advertising systems
- new transport planner UI

---

# Debug Requirements

Add or preserve:

```js
_wos.debug.heroVehicle.state()
_wos.debug.heroVehicle.camera()
_wos.debug.heroVehicle.route()
```

Add:

```js
_wos.debug.heroVehicle.smoothing()
```

Expected output:

```js
{
  updateMode: 'raf',
  rawHeadingDeg,
  smoothedHeadingDeg,
  headingDeltaDeg,
  rawPosition,
  smoothedPosition,
  smoothingEnabled: true
}
```

Add location debug:

```js
_wos.debug.location.state()
```

Expected output:

```js
{
  source: 'heroVehicle' | 'flight' | 'camera' | 'fallback',
  label,
  region,
  lastUpdateMs,
  lat,
  lng
}
```

Add style debug:

```js
_wos.debug.mapStyle.navigationSymbols()
```

Expected output:

```js
{
  hiddenLayers: [],
  candidateLayers: [],
  active: true
}
```

---

# Acceptance Tests

## Test 1 — Car Jitter

Launch Drive from current NYC position to Boston.

Set:

```text
ALT: Drone
SPEED: 0.25x
```

Expected:

```text
Car appears stable and smoothly heading-aligned.
No visible jitter.
```

## Test 2 — Low Altitude Stability

Change altitude live:

```text
Drone → Low Drone → Urban → Rooftop
```

Expected:

```text
No restart.
No marker jump.
Camera remains smooth.
```

## Test 3 — Speed Stability

Change speed live:

```text
0.10x → 0.25x → 1x → 5x
```

Expected:

```text
No restart.
Car remains smooth.
Heading does not flip.
```

## Test 4 — Location Updates

Drive for several minutes.

Expected:

```text
Location/weather label should not remain frozen on New York, NY when the actor has clearly moved into another locality.
```

## Test 5 — GPS Arrow Suppression

Inspect roads at Drone / Urban altitude.

Expected:

```text
Directional road arrows are hidden or reduced.
Roads still read clearly.
Car and future traffic imply direction through motion.
```

---

## Implementation Guide

- **Where:** `systems/world/heroVehicleRuntime.js`, `systems/render/heroVehicleRenderer.js`, `traversalHUD.js`, location/weather authority files, and Mapbox presentation/style filtering utilities.
- **What:** Move hero vehicle updates to rAF smoothing, update locality from live actor position, and suppress GPS-style directional arrow layers without removing real road structure.
- **Expect:** A smoother long-form drive experience where the car no longer jitters, the place label follows the journey, and the map reads more like a cinematic world than a GPS interface.
