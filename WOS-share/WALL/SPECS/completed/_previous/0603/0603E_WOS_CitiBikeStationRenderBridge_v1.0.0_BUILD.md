---
layout: spec
title: "Citi Bike Station Render Bridge"
date: 2026-06-03
doc_id: "0603_WOS_CitiBikeStationRenderBridge_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "runtime"
component: "citibike_station_render_bridge"

type: "runtime-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "truth-actor-render-bridge"

summary: "Wires Citi Bike station visual-state resolution into rendered truth actors so station availability affects actual world-space scale, opacity, and station-node presentation."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth actors must render through shared actor authority"
  - "Visual interpretation must not mutate source truth"

depends_on:
  - "0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0"
  - "0603B_WOS_PublicFeedSourceInventory_v1.0.0"
  - "0603C_WOS_CitiBikeGBFSStationRuntime_v1.0.0"
  - "0603D_WOS_CitiBikeStationVisualProfile_v1.0.0"

enables:
  - "visible Citi Bike station infrastructure"
  - "truth actor visual-profile consumption"
  - "future actor render bridge for buses, ferries, trains, utility actors"

tags:
  - "wos"
  - "truth-infrastructure"
  - "citibike"
  - "actor-runtime"
  - "render-bridge"
  - "station-node"
---

# 0603E_WOS_CitiBikeStationRenderBridge_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Wire the completed Citi Bike station visual profile into rendered world actors.

0603C proved the live GBFS feed works.

0603D proved station state classification works.

0603E makes the classification visible in the world.

The current gap is:

```text
visual state exists
but rendered actor does not consume it
```

This spec closes that gap.

---

# Current Baseline

0603D created:

```js
SBE.CitiBikeStationVisualProfile
```

with:

```js
resolveStationState(metadata)
resolveStationVisual(actor)
registerActorVisualProfile()
getState()
setEnabled()
setDebug()
```

The uploaded `citibikeStationVisualProfile.js` currently resolves station states and registers a `bike.station` profile with a temporary WSL fallback:

```js
shape: "station_node"
wslShape: "traffic_car"
variant: "sedan_light"
scale: 0.72
```

The uploaded `worldSpaceVehicleDebug.js` already exposes:

```js
_wos.debug.worldActors.citibikeVisualState()
_wos.debug.worldActors.citibikeVisualSample()
_wos.debug.worldActors.citibikeVisualEnable(on)
_wos.debug.worldActors.citibikeVisualDebug(on)
```

0603E should extend this system, not replace it.

---

# Core Principle

Do not make Citi Bike stations look like cars.

Stations are fixed curb infrastructure.

They should render as:

```text
small readable station nodes
```

not:

```text
tiny traffic vehicles
```

---

# Problem Statement

Today:

```text
GBFS truth exists
station visual state resolves
ActorVisualRegistry has a generic bike.station profile
TruthActorRuntime upserts actors
WorldSpaceVehicleLayer receives mostly generic shape/variant/scale data
```

But per-station visual fields are not being consumed.

So:

```text
empty
low
balanced
full
stale
offline
```

exist as data, but are not yet reflected in actual rendered station actors.

---

# Authority Boundaries

## Owns

0603E owns:

- applying per-station visual profile output to the render payload
- passing station-specific scale into WSL
- passing station-specific opacity into WSL
- passing station-specific variant into WSL
- providing a minimal non-car station-node render path
- debug reporting for rendered station bridge state

## May Read

0603E may read:

- `SBE.CitiBikeStationVisualProfile`
- `SBE.TruthActorRuntime`
- `SBE.ActorVisualRegistry`
- `SBE.WorldSpaceVehicleLayer`
- actor metadata supplied by `CitiBikeStationRuntime`

## May Mutate

0603E may mutate:

- `TruthActorRuntime` render payload construction
- `WorldSpaceVehicleLayer` mesh build dispatch for `station_node`
- `WorldSpaceVehicleLayer` opacity application for station actors
- debug reporting

## Must Not Mutate

0603E must not mutate:

- GBFS source data
- station availability metadata
- `CitiBikeStationRuntime` polling cadence
- station IDs
- actor identity
- actor source IDs
- hero route / camera / speed
- AIS runtime
- aircraft runtime
- ambient traffic runtime
- Mapbox style
- ColorRegistry source values
- GlyphRegistry source values

---

# Non-Goals

This spec does not build:

- moving bikes
- inferred bike trips
- station heatmaps
- clustering
- station labels
- neighborhood analytics
- station inspector UI
- route-to-bike tools
- timeline/history playback
- server proxy/cache
- map style mutation
- animated pulses

---

# Required Result

After this build, Citi Bike station actors should visibly differ by station state.

Example:

```text
empty       → small dim/alert node
low         → small active node
balanced    → normal node
full        → larger active node
stale       → dim warning node
offline     → very dim disabled node
```

At minimum, differences must be visible through:

```text
scale
opacity
variant
```

Palette/glyph may remain pass-through references until the renderer has deeper color/glyph authority.

---

# Render Bridge Model

Add a visual bridge inside `TruthActorRuntime`.

When `upsertActor(actor)` receives:

```js
actor.actorType === "bike.station"
```

it should:

```js
var visual = SBE.CitiBikeStationVisualProfile.resolveStationVisual(actor)
```

and merge that result into the WSL payload.

## Required Payload Fields to WSL

```js
{
  id: actor.actorId,
  actorType: "bike.station",
  variant: visual.variant,
  lat: actor.lat,
  lng: actor.lng,
  headingDeg: actor.headingDeg || 0,
  scale: visual.scale,
  visible: true,
  source: actor.sourceId,
  opacity: visual.opacity,
  paletteRef: visual.paletteRef,
  glyphRef: visual.glyphRef,
  visualState: visual.state,
  visualPriority: visual.priority,
  metadata: actor.metadata
}
```

## Fallback

If `SBE.CitiBikeStationVisualProfile` is missing:

```js
scale: actor.visualProfile.scale || 0.72
variant: actor.visualProfile.variant || "citibike_station_balanced"
opacity: 1
visualState: "unknown"
```

No throw.

No failed actor upsert.

---

# ActorVisualRegistry Role

`ActorVisualRegistry` remains the default profile registry.

0603E must not make Citi Bike visual logic generic by accident.

Use this decision boundary:

```text
ActorVisualRegistry
→ type-level defaults

CitiBikeStationVisualProfile
→ per-station resolved presentation
```

So:

```js
bike.station
```

gets a default render profile from `ActorVisualRegistry`, while each station's metadata overrides:

```text
state
variant
scale
opacity
paletteRef
glyphRef
priority
```

---

# Minimal Station Node Mesh

Add a minimal station-node path to `WorldSpaceVehicleLayer`.

## Required Shape

```js
shape: "station_node"
```

or payload:

```js
actorType: "bike.station"
```

must build a station mesh instead of a car.

## Geometry

Build as a small vertical marker / puck:

```text
base cylinder / puck
thin vertical pin
small top cap
optional tiny directionless halo
```

Suggested dimensions before scale:

```js
radiusM: 1.4
heightM: 0.45
pinHeightM: 2.4
capRadiusM: 0.9
```

This is intentionally not a vehicle.

## Orientation

Station nodes are directionless.

Ignore heading cues.

Do not add wheels.

Do not add headlights.

Do not use car/truck geometry.

## Materials

Initial material strategy:

```text
MeshBasicMaterial or MeshLambertMaterial
```

Use existing renderer-safe pattern.

Must support opacity:

```js
transparent = opacity < 1
opacity = payload.opacity
```

Palette refs may be stored on mesh for future color authority:

```js
mesh._paletteRef = payload.paletteRef
mesh._glyphRef = payload.glyphRef
mesh._visualState = payload.visualState
```

Actual color fallback may be simple and local.

Recommended fallback colors:

```js
empty:    "#ff4d4d"
low:      "#ffb84d"
balanced: "#37d67a"
full:     "#4da3ff"
stale:    "#9aa0a6"
offline:  "#555555"
unknown:  "#ffffff"
```

If existing color authority has a resolver, use it. If not, fallback locally.

No crash.

---

# Opacity Bridge

The uploaded system already has `setActorOpacity(id, opacity)` from prior builds.

0603E should not depend only on post-upsert opacity if the station mesh is newly built.

Opacity must be applied during mesh build and also safely after upsert.

Required behavior:

```text
upsert station actor
→ build or update station mesh
→ apply opacity immediately
→ store opacity in state/debug
```

If `WorldSpaceVehicleLayer.setActorOpacity` exists, use it as a post-upsert reinforcement.

If it does not exist, mesh build must still honor opacity.

---

# Scale Bridge

Station scale must come from:

```js
visual.scale
```

not generic `bike.station` default scale.

A full station at high capacity should visibly read larger than an offline or empty station.

Hard clamp from 0603D remains:

```text
0.45 <= scale <= 1.0
```

0603E must not introduce new scale formulas.

It consumes 0603D output.

---

# Variant Bridge

Use state-specific variants:

```js
citibike_station_empty
citibike_station_low
citibike_station_balanced
citibike_station_full
citibike_station_stale
citibike_station_offline
```

This lets WSL rebuild only when the state class changes.

A station changing from:

```text
balanced → full
```

may rebuild its mesh.

A station whose counts change but state stays balanced should not require a mesh rebuild.

---

# Lifecycle

Stations are truth-backed static actors.

No fade lifecycle.

No recycle lifecycle.

No synthetic entrance behavior.

No offscreen despawn.

Viewport filtering may limit presentation, but station truth remains in `CitiBikeStationRuntime`.

---

# Viewport Safety

0603D already enables:

```js
SBE.CitiBikeStationRuntime.setViewportFilter(true)
```

0603E should preserve this.

Do not render all 2410 stations if the viewport filter is enabled.

If current viewport actor count exceeds the cap, report it.

Do not delete full station truth.

---

# Required Files to Modify

## 1. `wall/systems/actors/truthActorRuntime.js`

Add per-actor visual override resolution before WSL upsert.

Required helper:

```js
function _resolveActorRenderPayload(actor, visualProfile) {}
```

or equivalent.

For `bike.station`, call:

```js
SBE.CitiBikeStationVisualProfile.resolveStationVisual(actor)
```

Merge into payload.

## 2. `wall/systems/render/worldSpaceVehicleLayer.js`

Add support for station-node rendering.

Required:

```js
function _buildStationNodeMesh(payload) {}
```

Dispatch when:

```js
payload.actorType === "bike.station"
```

or:

```js
payload.shape === "station_node"
```

Apply:

```js
payload.opacity
payload.paletteRef
payload.glyphRef
payload.visualState
```

## 3. `wall/systems/presentation/worldSpaceVehicleDebug.js`

Add debug commands under:

```js
_wos.debug.worldActors
```

Commands:

```js
citibikeRenderBridgeState()
citibikeRenderBridgeSample()
```

---

# Required Debug API

## `citibikeRenderBridgeState()`

Returns:

```js
{
  version,
  stationActorsInTruthRuntime,
  stationActorsRendered,
  stationActorsWithVisualState,
  stationActorsWithOpacity,
  stationActorsUsingStationNode,
  stateCounts,
  lastError
}
```

## `citibikeRenderBridgeSample()`

Prints first 10 rendered station actors:

```js
actorId
stationId
label
visualState
variant
scale
opacity
paletteRef
glyphRef
rendered
shape
```

---

# Recommended Runtime State Additions

In `TruthActorRuntime.getState()` optionally add:

```js
renderBridgeCounts: {
  bikeStationVisualized,
  bikeStationFallback,
  bikeStationErrors
}
```

Do not make this required for acceptance if debug commands can compute it from actors + WSL state.

---

# Testing Commands

Run:

```js
_wos.debug.worldActors.citibikeStart()
setTimeout(()=>_wos.debug.worldActors.citibikeState(), 4000)
setTimeout(()=>_wos.debug.worldActors.citibikeVisualState(), 5000)
setTimeout(()=>_wos.debug.worldActors.citibikeRenderBridgeState(), 6000)
setTimeout(()=>_wos.debug.worldActors.citibikeRenderBridgeSample(), 7000)
```

Expected:

```text
stationCount > 0
actorCount > 0
visual profile registered
stationActorsRendered > 0
stationActorsWithVisualState > 0
stationActorsUsingStationNode > 0
stateCounts populated
```

---

# Acceptance Criteria

- [ ] `bike.station` actors consume `CitiBikeStationVisualProfile.resolveStationVisual()`
- [ ] station `scale` in WSL payload equals resolved visual scale
- [ ] station `opacity` in WSL payload equals resolved visual opacity
- [ ] station `variant` is state-specific
- [ ] WSL builds `station_node` mesh for `bike.station`
- [ ] station nodes do not use car/truck geometry
- [ ] station nodes are directionless
- [ ] station nodes can render stale/offline with lower opacity
- [ ] debug can show rendered station sample
- [ ] viewport filter remains enabled by default
- [ ] full station truth remains intact
- [ ] no moving bike actors are created
- [ ] no synthetic trips are inferred
- [ ] no GBFS fetches are added to visual/render bridge
- [ ] no hero/AIS/aircraft/ambient mutation
- [ ] no Mapbox style mutation
- [ ] no renderer crash when visual profile is missing

---

# Failure Conditions

This build fails if:

- Citi Bike stations still render as cars
- station visual state remains debug-only
- station opacity is ignored
- station scale is generic instead of station-state-specific
- station identity is regenerated
- station truth is deleted for performance
- any moving Citi Bike actor is created
- any trip inference is added
- the visual profile performs network fetches
- WSL hardcodes Citi Bike feed logic outside station-node rendering
- missing ColorRegistry/GlyphRegistry causes crash
- hero Drive behavior changes

---

# Guardrail

This is a render bridge, not a new data layer.

The correct chain is:

```text
CitiBikeStationRuntime
  owns truth

CitiBikeStationVisualProfile
  owns interpretation

TruthActorRuntime
  bridges actor truth to render payload

WorldSpaceVehicleLayer
  owns mesh construction
```

No layer should take over another layer's authority.

---

# Deferred

Deferred to later specs:

- station clustering
- station labels
- station glyph drawing
- e-bike-specific node shape
- active station pulse
- neighborhood pressure heatmap
- empty/full station alert rings
- route-to-nearest-bike utility
- station inspector UI
- moving bike inference
- trip/path estimation

---

# Implementation Guide

- **Where**: Modify `wall/systems/actors/truthActorRuntime.js` to merge `CitiBikeStationVisualProfile.resolveStationVisual()` into `bike.station` render payloads; modify `wall/systems/render/worldSpaceVehicleLayer.js` to add `_buildStationNodeMesh()` and dispatch `bike.station` / `station_node`; modify `wall/systems/presentation/worldSpaceVehicleDebug.js` to add `citibikeRenderBridgeState()` and `citibikeRenderBridgeSample()`.
- **What**: Run `node --check wall/systems/actors/truthActorRuntime.js`, `node --check wall/systems/render/worldSpaceVehicleLayer.js`, and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; in browser run `citibikeStart()`, then `citibikeVisualState()`, `citibikeRenderBridgeState()`, and `citibikeRenderBridgeSample()`.
- **Expect**: Citi Bike stations render as small station nodes, not cars; per-station visual state drives scale/opacity/variant; viewport filtering remains enabled; no moving bikes or synthetic trips are created.
