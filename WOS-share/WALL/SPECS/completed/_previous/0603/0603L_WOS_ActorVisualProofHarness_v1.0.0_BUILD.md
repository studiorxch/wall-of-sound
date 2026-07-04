---
layout: spec
title: "Actor Visual Proof Harness"
date: 2026-06-03
doc_id: "0603L_WOS_ActorVisualProofHarness_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "presentation"
component: "actor_visual_proof_harness"
type: "system-spec"
status: "approved"
classification: "debug-proof-harness"
---

# 0603L_WOS_ActorVisualProofHarness_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Create a controlled visual proof harness for actor silhouettes.

0603J and 0603K added real 2.5D actor presentation, but the live world is too noisy to judge whether the forms are visually strong.

This spec creates a debug-only lineup that spawns every major actor presentation type near the camera center in a clean formation.

Goal:

```text
prove the actor visual language before tuning the live world further
```

---

# Problem

Current debugging depends on actors appearing naturally in the map.

That makes visual review unreliable because actors may be:

- far away
- LOD-suppressed
- hidden behind buildings
- too small to judge
- mixed into road/harbor clutter
- absent because the feed has no nearby entity

We need a proof stage.

---

# Doctrine

## Proof Harness Is Debug-Only

The harness may create temporary actors.

It must not modify:

- feed truth
- real actor records
- hero runtime
- camera runtime
- map style
- live public-feed polling

## Do Not Tune Blind

Visual tuning should happen against a fixed lineup first.

Live-world tuning comes after the forms are proven.

---

# Required Files

Modify:

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional, only if needed:

```text
wall/systems/actors/truthActorRuntime.js
wall/systems/render/worldSpaceVehicleLayer.js
```

Do not modify:

```text
citibikeStationRuntime.js
actorVisualIdentityAuthority.js
actorPresentationPaletteRegistry.js
actorRenderAuthority.js
heroVehicleRuntime.js
heroVehicleRenderer.js
mapStyleRecoveryAuthority.js
```

---

# Debug Namespace

Add under:

```js
_wos.debug.worldActors
```

Commands:

```js
visualProofLineup()
clearVisualProofLineup()
visualProofState()
visualProofFocus(actorKey)
```

---

# visualProofLineup()

Creates a controlled actor lineup near map center.

It must:

- start `SBE.TruthActorRuntime` if needed
- not start feed runtimes
- create deterministic proof actors
- place actors in a clear row or grid
- use true ActorRenderAuthority pipeline
- render through WSL only via TruthActorRuntime
- set sourceId to `authored_world_props` or a dedicated debug-safe source if already declared
- use deterministic sourceEntityId values

Suggested actor IDs:

```text
visual_proof_city_bus_001
visual_proof_utility_truck_001
visual_proof_station_node_001
visual_proof_vessel_001
visual_proof_ferry_001
visual_proof_aircraft_001
visual_proof_synthetic_car_001
```

---

# Required Proof Actors

## 1. City Bus

```js
{
  actorType: 'vehicle.bus',
  sourceId: 'mta_bus_gtfs_rt',
  sourceEntityId: 'visual_proof_city_bus_001',
  label: 'MTA Bus Visual Proof'
}
```

Expected identity:

```text
visualIdentityKey: mta.bus
silhouetteClass: city-bus
paletteRef: mta.bus.blue-white
```

---

## 2. Utility Truck

```js
{
  actorType: 'vehicle.utility',
  sourceId: 'nyc_dot_events',
  sourceEntityId: 'visual_proof_utility_truck_001',
  label: 'DOT Utility Visual Proof'
}
```

Expected identity:

```text
visualIdentityKey: dot.utility
silhouetteClass: utility-truck
paletteRef: dot.yellow-orange
lightClass: amber-flash
```

---

## 3. Citi Bike Station

```js
{
  actorType: 'bike.station',
  sourceId: 'citibike_gbfs',
  sourceEntityId: 'visual_proof_station_node_001',
  label: 'Citi Bike Station Visual Proof',
  metadata: {
    capacity: 60,
    numBikesAvailable: 42,
    numDocksAvailable: 18,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
    statusStale: false
  }
}
```

Expected identity:

```text
visualIdentityKey: citibike.station
silhouetteClass: station-node
paletteRef: citibike.cyan
```

Expected visual state:

```text
balanced or full depending current visual profile thresholds
```

---

## 4. Generic Vessel

```js
{
  actorType: 'marine.vessel',
  sourceId: 'ais_runtime',
  sourceEntityId: 'visual_proof_vessel_001',
  label: 'AIS Vessel Visual Proof'
}
```

Expected identity:

```text
visualIdentityKey: ais.vessel
silhouetteClass: vessel-generic
paletteRef: marine.truth-blue
```

---

## 5. Passenger Ferry

```js
{
  actorType: 'marine.ferry',
  sourceId: 'nyc_ferry_feed',
  sourceEntityId: 'visual_proof_ferry_001',
  label: 'NYC Ferry Visual Proof'
}
```

Expected identity:

```text
visualIdentityKey: nyc.ferry
silhouetteClass: passenger-ferry
paletteRef: nyc.ferry.blue-white
```

---

## 6. Aircraft Token

```js
{
  actorType: 'aircraft.plane',
  sourceId: 'aircraft_runtime',
  sourceEntityId: 'visual_proof_aircraft_001',
  label: 'Aircraft Visual Proof'
}
```

Expected identity:

```text
visualIdentityKey: aircraft.truth
silhouetteClass: aircraft-light
paletteRef: aircraft.cool-white
```

---

## 7. Synthetic Car Control

```js
{
  actorType: 'vehicle.synthetic',
  sourceId: 'synthetic_ambient',
  sourceEntityId: 'visual_proof_synthetic_car_001',
  label: 'Synthetic Vehicle Control'
}
```

Expected identity:

```text
visualIdentityKey: synthetic.vehicle
silhouetteClass: ambient-car
paletteRef: synthetic.muted-road
```

This proves the old/ambient fallback remains available.

---

# Placement Rules

Place actors relative to the current map center.

Use metre offsets so the formation is stable:

```text
row 1: bus, utility, station
row 2: vessel, ferry, aircraft, synthetic
```

Suggested spacing:

```js
HORIZONTAL_SPACING_M = 55
VERTICAL_SPACING_M = 45
```

All actors should be inside the viewport at neighborhood zoom.

Headings:

```text
road actors: 0°
marine actors: 45°
aircraft: 90°
station: 0° but directionless
```

---

# Proof Actor Metadata

Every proof actor must include:

```js
metadata: {
  visualProof: true,
  proofHarnessVersion: '1.0.0',
  proofKey: '<stable-key>'
}
```

Do not fake external feed payloads beyond presentation-safe metadata.

---

# Cleanup Rules

`clearVisualProofLineup()` must remove only actors where:

```js
metadata.visualProof === true
```

or sourceEntityId starts with:

```text
visual_proof_
```

It must not clear Citi Bike stations, AIS vessels, aircraft, ambient traffic, hero, or live feed actors.

---

# visualProofState()

Returns and prints:

```js
{
  active,
  proofActorCount,
  renderedCount,
  suppressedCount,
  actors: [
    {
      proofKey,
      actorId,
      actorType,
      sourceId,
      visualIdentityKey,
      silhouetteClass,
      paletteRef,
      scaleClass,
      presentationMeshKind,
      lodTier,
      rendered,
      suppressionReason
    }
  ]
}
```

---

# visualProofFocus(actorKey)

Optional but useful.

If feasible, center the map near the proof actor without altering route/hero runtime.

Allowed:

```js
map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15) })
```

Only when called manually.

Never auto-focus.

---

# LOD Policy Safety

The harness should not permanently loosen LOD policy.

If proof actors are suppressed because of zoom:

- report that in `visualProofState()`
- do not silently override LOD

Manual focus can zoom closer.

---

# Debug Labels

Do not add persistent DOM labels in v1.

Instead use console tables.

Optional mesh debug marker is allowed only if implemented through WSL debug mesh metadata, not Mapbox style mutation.

---

# Acceptance Tests

## Test 1: Lineup Creation

Run:

```js
_wos.debug.worldActors.visualProofLineup()
setTimeout(()=>_wos.debug.worldActors.visualProofState(), 1000)
```

Expected:

```text
proofActorCount >= 7
actors include city-bus, utility-truck, station-node, vessel-generic, passenger-ferry, aircraft-light, ambient-car
```

---

## Test 2: Distinct Silhouettes

Run:

```js
_wos.debug.worldActors.actor2D5Sample()
```

Expected:

```text
bus and utility are not identical
ferry and vessel are not identical
station is not a vehicle
aircraft is not a vehicle
```

---

## Test 3: Cleanup

Run:

```js
_wos.debug.worldActors.clearVisualProofLineup()
_wos.debug.worldActors.visualProofState()
```

Expected:

```text
proofActorCount: 0
live actors remain untouched
hero remains untouched
```

---

# Failure Conditions

This build fails if:

- proof actors bypass TruthActorRuntime
- proof actors call WSL directly
- proof actors mutate feed runtimes
- clear removes live Citi Bike/AIS/aircraft actors
- hero changes behavior
- map style changes
- actor IDs are random
- proof actors cannot be listed by visualProofState
- bus/utility/station/vessel/ferry/aircraft all still look generic

---

# Implementation Guide

- **Where**: Add proof-harness commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`; use existing `SBE.TruthActorRuntime.upsertActor()` and existing actor identity/render authority chain; only modify WSL if proof actors cannot report mesh metadata already stamped by 0603J/0603K.
- **What**: Run `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`, then in browser run `_wos.debug.worldActors.visualProofLineup()`, `_wos.debug.worldActors.visualProofState()`, and `_wos.debug.worldActors.actor2D5Sample()`.
- **Expect**: A visible, controlled lineup of at least seven actor types near the camera center, each using its real identity pipeline and distinct 2.5D silhouette, with cleanup removing only proof actors.
