---
layout: spec
title: "Citi Bike Station Visual Profile"
date: 2026-06-03
doc_id: "0603_WOS_CitiBikeStationVisualProfile_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "runtime"
component: "citibike_station_visual_profile"

type: "runtime-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Defines the visual profile layer for truth-backed Citi Bike station actors. This spec turns GBFS station availability into readable curb-pressure nodes without creating moving bikes, fake trips, or synthetic traffic."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth sources precede synthetic supplements"

depends_on:
  - "0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0"
  - "0603B_WOS_PublicFeedSourceInventory_v1.0.0"
  - "0603C_WOS_CitiBikeGBFSStationRuntime_v1.0.0"

enables:
  - "Citi Bike curb-pressure visualization"
  - "future feed-aware actor visual profiles"
  - "future station density / neighborhood pressure interpretation"

tags:
  - "wos"
  - "truth-infrastructure"
  - "citibike"
  - "gbfs"
  - "actor-visuals"
  - "curb-pressure"
---

# 0603D_WOS_CitiBikeStationVisualProfile_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Create a dedicated visual profile layer for Citi Bike station actors.

0603C proved that Citi Bike GBFS station data can be fetched in-browser and normalized into `bike.station` truth actors. 0603D makes those actors visually meaningful by mapping station availability into readable curb-pressure nodes.

This spec does **not** create moving bikes.

This spec does **not** infer trips.

This spec does **not** simulate motion.

It only interprets known station truth:

```text
station location
station capacity
bikes available
docks available
renting / returning status
status freshness
```

into a visual profile that WOS can display safely.

---

# Core Principle

Citi Bike stations are not traffic.

They are curb infrastructure.

The visual goal is:

```text
show where bike pressure exists
```

not:

```text
animate individual bikes
```

---

# Current Proven State

0603C currently provides:

```js
SBE.CitiBikeStationRuntime
```

with:

```js
stationCount: 2410
actorCount: 2410
lastError: null
sourceId: "citibike_gbfs"
actorType: "bike.station"
```

Each station actor includes metadata:

```js
{
  stationId,
  capacity,
  numBikesAvailable,
  numDocksAvailable,
  numEbikesAvailable,
  isInstalled,
  isRenting,
  isReturning,
  lastReported,
  statusStale,
  pressureRatio
}
```

0603D consumes that metadata passively.

---

# Authority Boundaries

## Owns

0603D owns:

- Citi Bike station visual classification
- station visual state labels
- station visual scale rules
- station palette / glyph resolution
- station viewport safety rules
- station debug visibility reporting

## May Read

0603D may read:

- `SBE.TruthActorRuntime`
- `SBE.ActorVisualRegistry`
- `SBE.ColorRegistry`
- `SBE.GlyphRegistry`
- Citi Bike station actor metadata
- Mapbox viewport state for viewport filtering

## May Mutate

0603D may mutate only:

- visual profile registration for `bike.station`
- optional station actor presentation metadata
- optional viewport filter setting on `SBE.CitiBikeStationRuntime`

## Must Not Mutate

0603D must not mutate:

- GBFS fetched station truth
- station availability values
- station IDs
- actor identity
- hero runtime
- AIS runtime
- aircraft runtime
- ambient traffic runtime
- Mapbox style
- route/camera state
- feed polling cadence
- truth actor lifecycle

---

# Non-Goals

This spec does not build:

- moving Citi Bike actors
- trip inference
- bike path routing
- demand prediction
- station animation
- heatmap rendering
- clustering
- station labels
- neighborhood scoring
- dashboard UI
- API proxying
- server cache
- GTFS / MTA integration

---

# Visual State Model

Each station resolves to one visual state.

```js
type CitiBikeStationVisualState =
  | "offline"
  | "stale"
  | "empty"
  | "low"
  | "balanced"
  | "full";
```

## Resolution Order

State resolution must be deterministic:

```text
1. offline
2. stale
3. empty
4. low
5. full
6. balanced
```

### offline

A station is offline when:

```js
isInstalled === false || (isRenting === false && isReturning === false)
```

### stale

A station is stale when:

```js
statusStale === true
```

Only applies if the station is not offline.

### empty

A station is empty when:

```js
numBikesAvailable === 0
```

Only applies if the station is not offline or stale.

### low

A station is low when:

```js
pressureRatio > 0 && pressureRatio < 0.25
```

### full

A station is full when:

```js
pressureRatio > 0.75
```

### balanced

Fallback healthy state:

```js
pressureRatio >= 0.25 && pressureRatio <= 0.75
```

---

# Visual Profile Model

Create:

```js
SBE.CitiBikeStationVisualProfile
```

Public API:

```js
SBE.CitiBikeStationVisualProfile = Object.freeze({
  VERSION,
  resolveStationState,
  resolveStationVisual,
  registerActorVisualProfile,
  getState,
  setEnabled,
  setDebug,
});
```

## `resolveStationState(metadata)`

Input:

```js
type CitiBikeStationMetadata = {
  capacity?: number
  numBikesAvailable?: number
  numDocksAvailable?: number
  numEbikesAvailable?: number
  isInstalled?: boolean
  isRenting?: boolean
  isReturning?: boolean
  statusStale?: boolean
  pressureRatio?: number
}
```

Output:

```js
{
  state: CitiBikeStationVisualState,
  reason: string
}
```

## `resolveStationVisual(actor)`

Input:

```js
type TruthActor = {
  actorId: string
  actorType: "bike.station"
  metadata: CitiBikeStationMetadata
}
```

Output:

```js
{
  state: CitiBikeStationVisualState,
  shape: "station_node",
  variant: string,
  scale: number,
  paletteRef: string,
  glyphRef: string,
  opacity: number,
  priority: number,
  metadata: {
    pressureRatio: number,
    bikes: number,
    docks: number,
    capacity: number
  }
}
```

---

# Station Visual States

## Palette References

Use existing color infrastructure if available.

Required palette refs:

```js
{
  empty: "citibike.station.empty",
  low: "citibike.station.low",
  balanced: "citibike.station.balanced",
  full: "citibike.station.full",
  stale: "citibike.station.stale",
  offline: "citibike.station.offline"
}
```

If `SBE.ColorRegistry` does not exist, profile must safely return the paletteRef string and allow downstream fallback colors.

No hard crash.

## Glyph References

Use existing glyph infrastructure if available.

Required glyph refs:

```js
{
  station: "glyph.bike.station",
  ebike: "glyph.bike.ebike",
  warning: "glyph.status.warning",
  offline: "glyph.status.offline"
}
```

If `SBE.GlyphRegistry` does not exist, return the glyphRef string only.

No hard crash.

---

# Scale Rules

Station nodes must be smaller than vehicles.

They are infrastructure points, not cars.

```js
const STATION_SCALE = {
  empty: 0.52,
  low: 0.62,
  balanced: 0.72,
  full: 0.84,
  stale: 0.55,
  offline: 0.48,
};
```

Capacity may influence scale only slightly:

```js
capacityBoost = clamp(capacity / 120, 0, 0.18)
```

Final scale:

```js
finalScale = STATION_SCALE[state] + capacityBoost
```

Hard clamp:

```js
0.45 <= finalScale <= 1.0
```

---

# Opacity Rules

```js
const STATION_OPACITY = {
  empty: 0.88,
  low: 0.92,
  balanced: 1.0,
  full: 1.0,
  stale: 0.45,
  offline: 0.30,
};
```

No fade-in / fade-out lifecycle.

Stations are truth-backed fixed infrastructure.

They should appear stable.

---

# Rendering Strategy

0603D should **not** require a new renderer yet.

Use the existing actor visual pipeline:

```text
CitiBikeStationRuntime
→ TruthActorRuntime
→ ActorVisualRegistry
→ WorldSpaceVehicleLayer
```

Register a `bike.station` profile in `ActorVisualRegistry`.

Initial render mapping may use a small existing mesh shape if necessary.

Preferred mapping:

```js
{
  actorType: "bike.station",
  shape: "station_node",
  variant: "citibike_station_node",
  scale: 0.72,
  paletteRef: "citibike.station.balanced",
  glyphRef: "glyph.bike.station",
  depthPolicy: "road"
}
```

If `WorldSpaceVehicleLayer` cannot render `station_node`, use a small `traffic_car` or `world.prop` fallback temporarily, but isolate the fallback in the visual profile.

Do not hardcode fallback behavior inside `CitiBikeStationRuntime`.

---

# Viewport Safety

2410 stations loaded successfully.

Rendering all stations at once may be too dense.

0603D must set viewport safety by default.

Recommended behavior:

```js
SBE.CitiBikeStationRuntime.setViewportFilter(true)
```

when visual profile is enabled.

The runtime already supports viewport filtering without deleting station records.

## Visual Cap

Add a soft cap in visual state reporting:

```js
MAX_VISIBLE_STATION_ACTORS = 600
```

If more than 600 station actors are within viewport, visual profile should prefer:

```text
truth exists
visuals may be suppressed
state reports capped=true
```

Do not delete station truth.

Do not mutate station truth.

---

# Data Flow

```text
GBFS station_information
+ GBFS station_status
→ CitiBikeStationRuntime
→ bike.station truth actors
→ CitiBikeStationVisualProfile
→ ActorVisualRegistry profile
→ WorldSpaceVehicleLayer
```

---

# Execution Flow

```text
App load
→ Actor registries load
→ CitiBikeStationRuntime loads
→ CitiBikeStationVisualProfile loads
→ profile registers bike.station visual
→ citibikeStart fetches stations
→ TruthActorRuntime stores station actors
→ visual profile resolves each station state
→ renderer receives stable station-node presentation
```

---

# Required File

Create:

```text
wall/systems/feeds/citibikeStationVisualProfile.js
```

Load after:

```text
wall/systems/feeds/citibikeStationRuntime.js
```

and before presentation debug is used.

Recommended `index.html` order:

```html
<script src="./systems/feeds/citibikeStationRuntime.js"></script>
<script src="./systems/feeds/citibikeStationVisualProfile.js"></script>
```

---

# Required Debug API

Add to:

```js
_wos.debug.worldActors
```

Commands:

```js
citibikeVisualState()
citibikeVisualSample()
citibikeVisualEnable(on)
citibikeVisualDebug(on)
```

## `citibikeVisualState()`

Returns:

```js
{
  version,
  enabled,
  debug,
  registered,
  viewportFilterEnabled,
  stationCount,
  visibleCandidateCount,
  capped,
  stateCounts,
  lastError
}
```

## `citibikeVisualSample()`

Prints first 10 stations with:

```js
stationId
name
state
bikes
docks
capacity
pressureRatio
scale
paletteRef
glyphRef
opacity
```

---

# Validation Checklist

- [ ] `citibikeStationVisualProfile.js` loads without throwing
- [ ] `SBE.CitiBikeStationVisualProfile` exists
- [ ] `resolveStationState()` returns deterministic state labels
- [ ] `resolveStationVisual()` returns paletteRef / glyphRef safely
- [ ] `bike.station` profile registers with `SBE.ActorVisualRegistry`
- [ ] `ColorRegistry` absence does not crash
- [ ] `GlyphRegistry` absence does not crash
- [ ] viewport filter defaults on when visual profile is enabled
- [ ] no station truth is deleted by visual suppression
- [ ] no moving bikes are created
- [ ] no synthetic trips are inferred
- [ ] no direct Mapbox style mutation
- [ ] no direct hero / AIS / aircraft / ambient runtime mutation
- [ ] `citibikeVisualState()` reports state counts
- [ ] `citibikeVisualSample()` shows station visual resolution

---

# Acceptance Test

Run:

```js
_wos.debug.worldActors.citibikeStart()
setTimeout(()=>_wos.debug.worldActors.citibikeState(), 4000)
setTimeout(()=>_wos.debug.worldActors.citibikeVisualState(), 5000)
setTimeout(()=>_wos.debug.worldActors.citibikeVisualSample(), 6000)
```

Expected:

```text
stationCount > 0
actorCount > 0
visual profile registered
stateCounts include empty / low / balanced / full / stale
viewportFilterEnabled true
lastError null
```

---

# Failure Conditions

This build fails if:

- moving bike actors are created
- station truth is altered to match visuals
- 2410 station records are deleted for visual performance
- `ColorRegistry` absence crashes the app
- `GlyphRegistry` absence crashes the app
- visual profile mutates Mapbox style
- visual profile mutates hero / traffic / AIS / aircraft runtime
- visual profile fetches GBFS directly
- visual profile changes polling cadence
- visual profile creates synthetic motion
- visual cap deletes actors instead of suppressing presentation

---

# Deferred Systems

Deferred:

- Citi Bike heatmap
- Citi Bike neighborhood pressure zones
- e-bike-specific station rendering
- station labels
- zoom-dependent clustering
- animated station pulses
- moving bike inference
- synthetic bike trips
- user-facing station inspector panel
- route-to-nearest-bike tools

---

# Canonical References

- `0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0`
- `0603B_WOS_PublicFeedSourceInventory_v1.0.0`
- `0603C_WOS_CitiBikeGBFSStationRuntime_v1.0.0`
- `wall/systems/feeds/citibikeStationRuntime.js`
- `wall/systems/actors/truthActorRuntime.js`
- `wall/systems/actors/actorVisualRegistry.js`
- `wall/systems/presentation/worldSpaceVehicleDebug.js`

---

# Implementation Guide

- **Where**: Add `wall/systems/feeds/citibikeStationVisualProfile.js`; register it in `index.html` immediately after `citibikeStationRuntime.js`; add debug commands inside `_wos.debug.worldActors` in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/feeds/citibikeStationVisualProfile.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`, then test in browser with `citibikeStart()`, `citibikeVisualState()`, and `citibikeVisualSample()`.
- **Expect**: Citi Bike stations remain truth-backed and stationary, viewport filtering is enabled, visual states resolve from availability metadata, and no moving bikes or synthetic trips are created.
