---
layout: spec
title: "WorldSpace Vehicle Session Rebind"
date: 2026-06-01
doc_id: "0601B_WOS_WorldSpaceVehicleSessionRebind_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "rendering"
component: "WorldSpaceVehicleLayer"
type: "interpretation-spec"
status: "approved"
priority: "high"
risk: "medium"
classification: "interpretation-layer"
summary: "Defines session rebind continuity for WorldSpaceVehicleLayer so world-space hero and traffic vehicle meshes survive Drive relaunches, runtime restarts, and registry clearing without mutating route or actor truth."
doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
depends_on:
  - "HeroVehicleRuntime"
  - "HeroVehicleRenderer"
  - "TrafficOccupancyRuntime"
  - "TrafficOccupancyRenderer"
  - "WorldSpaceVehicleLayer"
enables:
  - "WorldSpaceTrafficVehicleBinding"
  - "WorldSpaceVehicleLODAndScale"
  - "PersistentTraversalPresentation"
tags:
  - "world-space"
  - "vehicles"
  - "session-rebind"
  - "registry-continuity"
  - "drive-runtime"
---

# 0601B_WOS_WorldSpaceVehicleSessionRebind_v1.0.0 [BUILD]

## Purpose

Preserve WorldSpaceVehicleLayer continuity across Drive session restarts.

This spec closes the gap where:

```text
Layer is active.
Runtime is active.
Renderer is active.
Vehicle registry is empty.
```

That failure makes the world-space layer look broken even when the actual issue is lost registration continuity after a route launch, runtime restart, renderer stop/start, or traffic actor rebuild.

The goal is not to create new vehicle rendering. The goal is to make the existing world-space vehicle system recover its actor registrations deterministically.

---

# Core Problem

WorldSpaceVehicleLayer persists across runtime sessions, but its internal mesh registry can be cleared or fall out of sync when Drive restarts.

Observed failure pattern:

```text
Drive Launch
→ HeroVehicleRuntime starts
→ HeroVehicleRenderer restarts
→ WorldSpaceVehicleLayer remains enabled
→ _vehicles contains zero active entries
→ scaleState() reports no vehicles
```

This is a continuity failure, not a mesh failure.

---

# Core Doctrine

```text
Runtime owns truth.
WorldSpaceVehicleLayer owns presentation continuity.
```

WorldSpaceVehicleLayer may recover missing mesh registrations from live runtime state.

WorldSpaceVehicleLayer must never:

- create actor truth
- advance routes
- mutate route progress
- mutate runtime state
- control the camera
- invent traffic actors

It may only re-register world-space mesh representations for actors that already exist.

---

# Authority Boundaries

## This Spec Governs

- world-space vehicle registry validation
- missing mesh registration detection
- session rebind recovery
- debug recovery commands
- idempotent registry healing

## This Spec Does Not Govern

- vehicle mesh geometry
- LOD scale math
- actor spawning rules
- route fetching
- hero movement
- traffic movement
- camera follow logic
- Mapbox style layers

---

# Required Persistent State

The following WorldSpaceVehicleLayer configuration must survive runtime restart:

```js
_enabled
_adaptiveLOD
_shapeScale
_visMode
_debugScale
```

These values must not reset when:

- Drive restarts
- HeroVehicleRuntime stops
- HeroVehicleRenderer stops
- Traffic actors are cleared
- mesh registry is emptied

Only explicit debug/user commands may mutate them.

---

# Required API

## WorldSpaceVehicleLayer.attemptSessionRebind()

```js
attemptSessionRebind(): {
  heroRecovered: boolean,
  trafficRecovered: boolean,
  vehiclesBefore: number,
  vehiclesAfter: number
}
```

Responsibilities:

1. Check live HeroVehicleRuntime state.
2. Check live TrafficOccupancyRuntime state.
3. If hero runtime is active and `hero` is missing, re-register the hero mesh from `HeroVehicleRuntime.getEntity()`.
4. If traffic runtime is active and no traffic vehicles are registered, request `TrafficOccupancyRenderer.rebindWorld()`.
5. Return recovery counts and flags.
6. Never throw into RAF or render loops.

Rules:

```text
Repeated calls must converge.
No duplicate vehicles.
No route mutation.
No actor mutation.
```

---

## WorldSpaceVehicleLayer.validateVehicleRegistry()

```js
validateVehicleRegistry(): {
  heroPresent: boolean,
  trafficCount: number,
  meshCount: number,
  runtimeActive: boolean,
  trafficRuntimeActive: boolean,
  trafficRuntimeCount: number
}
```

Responsibilities:

- compare runtime truth against world-space registry state
- expose whether active actors are missing from the layer
- support debug and one-shot recovery checks

This function is diagnostic and must not mutate state.

---

## TrafficOccupancyRenderer.rebindWorld()

```js
rebindWorld(): number
```

Responsibilities:

- iterate over current traffic marker entries
- read each entry’s `lastActor` snapshot
- call `updateActor(lastActor)`
- allow normal world-space upsert path to handle DOM/world fallback
- return number of actor snapshots re-emitted

This preserves authority boundaries because TrafficOccupancyRenderer owns the last-known rendered traffic actor snapshot.

WorldSpaceVehicleLayer does not directly inspect or mutate traffic actors.

---

# Required Trigger Points

## 1. HeroVehicleRuntime.startRoute()

After successful route setup:

```js
WorldSpaceVehicleLayer.attemptSessionRebind()
```

Purpose:

- recover world-space vehicle registry after a new Drive launch
- preserve existing world-space layer configuration

---

## 2. HeroVehicleRenderer.update()

On first successful `hero-live` payload per session:

```js
WorldSpaceVehicleLayer.validateVehicleRegistry()

if traffic runtime is active but traffic registry is empty:
  WorldSpaceVehicleLayer.attemptSessionRebind()
```

Purpose:

- recover traffic if hero reconnects first
- prevent traffic from disappearing after renderer/runtime ordering changes

---

## 3. TrafficOccupancyRuntime spawn completion

After traffic actors spawn:

```js
setTimeout(WorldSpaceVehicleLayer.attemptSessionRebind, 250)
```

Purpose:

- allow async traffic spawn/route creation to settle
- re-register spawned actors into WSL if world binding is active

---

# Registry Health Logic

Registry is healthy when:

```text
Hero runtime inactive OR hero mesh registered.
Traffic runtime inactive OR at least one traffic mesh registered.
```

Registry is unhealthy when:

```text
Hero runtime active AND hero mesh missing.
```

or:

```text
Traffic runtime active AND traffic runtime count > 0 AND traffic mesh count = 0.
```

Expose this as:

```js
registrationHealthy: boolean
```

inside `WorldSpaceVehicleLayer.getState()`.

---

# Mesh Recovery Logic

## Hero Recovery

If:

```js
HeroVehicleRuntime.getEntity().active === true
```

and:

```js
_vehicles.hero is missing
```

then call:

```js
upsertVehicle({
  id: "hero",
  actorType: "hero_car",
  variant: "sedan_red",
  lat,
  lng,
  headingDeg,
  scale: 1,
  visible: true,
  source: "hero-live"
})
```

Only execute if:

```js
_enabled === true
isRenderReady() === true
```

---

## Traffic Recovery

If:

```js
TrafficOccupancyRuntime.getState().active === true
TrafficOccupancyRuntime.getState().count > 0
```

then delegate:

```js
TrafficOccupancyRenderer.rebindWorld()
```

The renderer must re-emit current actor snapshots through the existing `updateActor()` path.

---

# Debug API

Add:

```js
_wos.debug.worldVehicles.rebind()
```

Expected console output:

```text
[worldVehicles] rebind()
heroRecovered    : true | false
trafficRecovered : true | false
vehiclesBefore   : number
vehiclesAfter    : number
```

Add to `state()`:

```text
heroRuntime    : true | false
trafficRuntime : true | false
regHealthy     : true | false
```

If registry is unhealthy:

```text
⚠ runtime active but registry unhealthy — run _wos.debug.worldVehicles.rebind()
```

---

# Execution Flow

```text
Drive Launch
→ HeroVehicleRuntime.startRoute()
→ HeroVehicleRenderer.start()
→ WorldSpaceVehicleLayer.attemptSessionRebind()
→ HeroVehicleRenderer.update(hero-live)
→ validateVehicleRegistry()
→ TrafficOccupancyRenderer.rebindWorld() when needed
→ WorldSpaceVehicleLayer registry restored
→ World-space rendering resumes
```

---

# Data Model

## Rebind Result

```js
type VehicleSessionRebindResult = {
  heroRecovered: boolean
  trafficRecovered: boolean
  vehiclesBefore: number
  vehiclesAfter: number
}
```

## Registry Validation

```js
type VehicleRegistryValidation = {
  heroPresent: boolean
  trafficCount: number
  meshCount: number
  runtimeActive: boolean
  trafficRuntimeActive: boolean
  trafficRuntimeCount: number
}
```

---

# Failure Handling

All rebind paths must be non-throwing.

Failures may log warnings, but must not:

- interrupt RAF
- stop Drive
- clear routes
- disable world-space rendering
- disable DOM fallback

If recovery fails, DOM fallback remains valid.

---

# Observability Impact

This spec improves observability by distinguishing:

```text
render failure
```

from:

```text
registry continuity failure
```

After implementation, `state()` must expose whether actors exist in runtime but are missing from the world-space registry.

This prevents false conclusions like:

```text
Three.js is broken.
```

when the actual issue is:

```text
World-space registry was not rebound after session restart.
```

---

# Authority Relationships

## Reads From

- `HeroVehicleRuntime.getEntity()`
- `HeroVehicleRuntime.getState()`
- `TrafficOccupancyRuntime.getState()`
- `TrafficOccupancyRenderer.rebindWorld()`
- `WorldSpaceVehicleLayer.getState()`

## Writes To

- `WorldSpaceVehicleLayer._vehicles`
- `WorldSpaceVehicleLayer._meshes`

Only through existing `upsertVehicle()` and `removeVehicle()` pathways.

## Observed By

- `WorldSpaceVehicleDebug`
- `HeroVehicleRenderer`
- `TrafficOccupancyRenderer`
- future vehicle presentation diagnostics

## Forbidden Mutations

- route progress
- actor speed
- actor lifecycle
- camera state
- Mapbox route source
- traffic spawn rules
- world atmosphere state

---

# Validation Checklist

- [ ] Drive restart preserves `_enabled`
- [ ] Drive restart preserves `_adaptiveLOD`
- [ ] Drive restart preserves `_shapeScale`
- [ ] Drive restart preserves `_visMode`
- [ ] Drive restart preserves `_debugScale`
- [ ] Hero re-registers after runtime restart
- [ ] Traffic re-registers after spawn completion
- [ ] `rebind()` is idempotent
- [ ] `scaleState()` no longer reports zero vehicles while runtimes are active
- [ ] DOM fallback remains available
- [ ] No route ownership leakage occurs
- [ ] No actor lifecycle ownership leakage occurs
- [ ] No RAF exceptions occur from recovery logic

---

# Manual Test Sequence

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.shapeMode('vehicle')
_wos.debug.worldVehicles.lod(true)

Launch Drive.

_wos.debug.worldVehicles.state()
_wos.debug.worldVehicles.scaleState()
```

Expected:

```text
vehicleCount > 0
heroRuntime: true
regHealthy: true
scaleState reports hero
```

Traffic test:

```js
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
_wos.debug.worldVehicles.rebind()
_wos.debug.traffic.worldState()
_wos.debug.worldVehicles.state()
```

Expected:

```text
traffic worldActorCount > 0
vehicleCount includes hero + traffic
domFallbackCount = 0 when vehicle mode is active
```

Restart test:

```js
Launch Drive again.
_wos.debug.worldVehicles.state()
_wos.debug.worldVehicles.scaleState()
```

Expected:

```text
vehicle registry recovers automatically
shapeMode persists
adaptiveLOD persists
scaleState does not return "no vehicles to report"
```

---

# Non-Goals

This spec does not introduce:

- new vehicle meshes
- new road logic
- new traffic spawning
- new Mapbox styling
- new LOD thresholds
- new camera behavior
- new actor systems
- new atmospheric behavior

---

# Deferred Systems

- lane-aware traffic
- route-relative traffic density
- vehicle occlusion against buildings
- bridge elevation correction
- world-space vessel binding
- world-space aircraft binding
- traffic sound events
- traffic-to-audio propagation

---

# Implementation Guide

- **Where**: `wall/systems/render/worldSpaceVehicleLayer.js` after `clear()` and before accessors; `wall/systems/render/trafficOccupancyRenderer.js` inside world-space binding section; `wall/systems/world/heroVehicleRuntime.js` after route startup; `wall/systems/render/heroVehicleRenderer.js` inside first `hero-live` update path; `wall/systems/world/trafficOccupancyRuntime.js` after traffic spawn completion.
- **What**: Run the local app, launch Drive, then execute `_wos.debug.worldVehicles.state()`, `_wos.debug.worldVehicles.scaleState()`, `_wos.debug.worldVehicles.rebind()`, and `_wos.debug.traffic.worldState()` in DevTools.
- **Expect**: `registrationHealthy: true`, `vehicleCount > 0`, `scaleState()` listing live hero/traffic vehicles, and automatic recovery after Drive relaunch without resetting LOD, shape mode, or shape scale.
