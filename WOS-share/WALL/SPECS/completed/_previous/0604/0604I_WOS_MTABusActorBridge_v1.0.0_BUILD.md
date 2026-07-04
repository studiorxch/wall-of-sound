---
layout: spec
title: "MTA Bus Actor Bridge"
date: 2026-06-04
doc_id: "0604I_WOS_MTABusActorBridge_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "runtime"
component: "mta_bus_actor_bridge"

type: "runtime-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "runtime-authority"

summary: "Converts decoded MTA bus realtime rows from the 0604H adapter into vehicle.bus actors in ActorRuntime without rendering, styling, route labels, or asset assignment."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth is global"
  - "Presentation is local"
  - "Actor bridge before renderer"

depends_on:
  - "0604G_WOS_MTABusFeedSourceInventory_v1.0.0"
  - "0604H_WOS_MTABusRealtimeAdapter_v1.0.0"
  - "ActorRuntime"
  - "ActorSourceRegistry"

enables:
  - "0604J_WOS_BusVisualFallbackRenderer_v1.0.0"
  - "0604K_WOS_BusPresentationSelector_v1.0.0"
  - "0604L_WOS_BusMotionSmoothing_v1.0.0"

tags:
  - "mta"
  - "bus"
  - "actor-runtime"
  - "gtfs-realtime"
  - "nyc-transit"
---

# 0604I_WOS_MTABusActorBridge_v1.0.0_BUILD

## PURPOSE

Bridge decoded MTA bus realtime rows into `ActorRuntime` as canonical `vehicle.bus` actors.

This spec is the first point where live MTA bus data becomes WOS world truth.

It does **not** render buses.

It does **not** create Mapbox layers.

It does **not** assign visual assets.

It does **not** create Studio controls.

It only performs:

```text
MTA Bus Realtime Adapter rows
→ validation
→ actor identity resolution
→ ActorRuntime upsert
```

The goal is to make live buses exist as WOS actors before any visual presentation is added.

---

# CURRENT BUILD CONTEXT

Completed:

```text
0604G_WOS_MTABusFeedSourceInventory_v1.0.0_BUILD
0604H_WOS_MTABusRealtimeAdapter_v1.0.0_BUILD
```

Current data path:

```text
MTA GTFS-RT Vehicle Positions
→ 0604H adapter
→ raw bus rows
```

This spec creates:

```text
raw bus rows
→ vehicle.bus actors
```

Next spec creates:

```text
vehicle.bus actors
→ visible bus fallback renderer
```

---

# CORE DECISION

The bridge should convert live bus rows into actors immediately, but downstream renderers must remain selective.

WOS must be able to know about thousands of buses without attempting to render every bus.

Canonical rule:

```text
Truth may be dense.
Presentation must be selective.
```

This spec may upsert all valid bus actors into `ActorRuntime`.

This spec must not force all actors to render.

---

# AUTHORITY BOUNDARIES

## This spec owns

- bus row validation before actor upsert
- bus actor identity generation
- bus actor metadata shape
- actor TTL and lifecycle handoff
- bridge state/debug reporting
- actor count and rejection statistics

## This spec may read

- `SBE.MTABusRealtimeAdapter`
- `SBE.MTABusFeedConfig`
- `SBE.MTABusFeedSourceInventory`
- current canonical truth actor runtime
- current timestamp

## This spec may write

- `vehicle.bus` actors into ActorRuntime only

## This spec must not write

- Mapbox sources
- Mapbox layers
- WorldSpaceVehicleLayer render payloads
- visual assets
- route label overlays
- Studio assignments
- AIS/marine state
- Citi Bike state
- subway state
- weather state

---

# NEW FILE

```text
wall/systems/transit/mtaBusActorBridge.js
```

Load order:

```text
mtaBusFeedConfig.js
mtaBusFeedSourceInventory.js
mtaBusRealtimeAdapter.js
mtaBusActorBridge.js
worldSpaceVehicleDebug.js
```

Register in:

```text
wall/index.html
```

after:

```text
wall/systems/transit/mtaBusRealtimeAdapter.js
```

before any future bus renderer.

---

# PUBLIC API

Expose:

```js
SBE.MTABusActorBridge
```

Frozen API:

```js
start()
stop()
isActive()

syncFromAdapter()
syncRows(rows)

getState()
getStats()
getActorIds()
clearBusActors()

setEnabled(enabled)
setDebug(enabled)
```

---

# INPUT ROW CONTRACT

Consumes rows from:

```js
SBE.MTABusRealtimeAdapter.getRows()
```

Expected row shape:

```js
type MtaBusRealtimeRow = {
  sourceId: "mta_bus_gtfs_rt_vehicle_positions"
  vehicleId: string
  tripId: string | null
  routeId: string | null
  latitude: number
  longitude: number
  bearing: number | null
  speedMps: number | null
  timestampUtcMs: number
  occupancyStatus: string | null
  rawEntityId: string
}
```

If the 0604H adapter uses `lat/lng` instead of `latitude/longitude`, the bridge may accept both forms for resilience, but it must write canonical actor fields as `lat` and `lng`.

---

# ACTOR IDENTITY

Actor identity must be deterministic:

```js
actorId = "mta_bus:" + vehicleId
```

Source fields:

```js
sourceId = "mta_bus_gtfs_rt_vehicle_positions"
sourceEntityId = vehicleId
actorType = "vehicle.bus"
```

Do not use route ID as actor identity.

Reason:

```text
vehicleId is the moving physical object.
routeId is presentation/metadata.
```

---

# ACTOR UPSERT SHAPE

Bridge writes actors using the canonical runtime upsert method available in the current codebase.

Expected actor payload:

```js
{
  sourceId: "mta_bus_gtfs_rt_vehicle_positions",
  sourceEntityId: row.vehicleId,
  actorType: "vehicle.bus",
  label: "MTA Bus " + routeId,
  lng: row.longitude,
  lat: row.latitude,
  headingDeg: row.bearing,
  speedMps: row.speedMps,
  timestampMs: row.timestampUtcMs,
  ttlMs: MTA_BUS_STALE_AFTER_MS,
  metadata: {
    system: "mta",
    mode: "bus",
    routeId: row.routeId,
    tripId: row.tripId,
    vehicleId: row.vehicleId,
    occupancyStatus: row.occupancyStatus,
    rawEntityId: row.rawEntityId,
    sourceRowTimestampMs: row.timestampUtcMs,
    truthClass: "observed",
    presentationEligible: true
  }
}
```

Label fallback:

```js
row.routeId ? "MTA Bus " + row.routeId : "MTA Bus"
```

---

# VALIDATION RULES

Reject row when:

```text
missing vehicleId
missing coordinates
invalid latitude
invalid longitude
latitude outside -90..90
longitude outside -180..180
timestamp missing or invalid
sourceId does not match mta_bus_gtfs_rt_vehicle_positions
```

Do not reject solely because:

```text
routeId missing
tripId missing
bearing missing
speed missing
occupancy missing
```

Those fields may be null.

---

# TTL / STALENESS

Use baseline:

```js
SBE.MTABusFeedConfig.MTA_BUS_STALE_AFTER_MS
```

Fallback:

```js
45000
```

Actor TTL must be short enough that stale buses disappear from truth after feed interruption, but long enough to survive one missed refresh.

Default:

```text
45 seconds
```

---

# BRIDGE STATE

```js
type MTABusActorBridgeState = {
  version: "1.0.0"
  active: boolean
  enabled: boolean
  sourceId: "mta_bus_gtfs_rt_vehicle_positions"

  lastSyncAt: number | null
  lastSuccessAt: number | null
  lastError: string | null

  syncCount: number
  upsertCount: number
  rejectedCount: number
  actorCount: number

  lastRowCount: number
  lastAcceptedCount: number
  lastRejectedCount: number

  adapterAvailable: boolean
  actorRuntimeAvailable: boolean
}
```

---

# REJECTION REASONS

Use bridge-local rejection vocabulary:

```js
type MTABusActorBridgeRejectReason =
  | "missing_vehicle_id"
  | "missing_coordinates"
  | "invalid_coordinates"
  | "invalid_timestamp"
  | "wrong_source_id"
  | "actor_runtime_unavailable"
  | "adapter_unavailable"
  | "upsert_failed"
  | "disabled";
```

These are bridge rejection reasons, not feed fetch failure reasons.

Do not mix these with `MTABusFeedConfig.FAILURE_REASONS`.

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.worldActors
```

Required:

```js
mtaBusActorBridgeState()
mtaBusActorBridgeSync()
mtaBusActorBridgeStats()
mtaBusActorBridgeActors()
mtaBusActorBridgeClear()
mtaBusActorBridgeEnable(on)
```

Expected behavior:

```js
_wos.debug.worldActors.mtaBusActorBridgeSync()
```

runs:

```text
adapter rows
→ bridge validation
→ ActorRuntime upsert
```

and returns:

```js
{
  ok: true,
  rows: number,
  accepted: number,
  rejected: number,
  actorCount: number
}
```

---

# EXECUTION FLOW

Manual proof flow:

```text
1. _wos.debug.worldActors.mtaBusSetApiKey("<key>")
2. _wos.debug.worldActors.mtaBusFetchOnce()
3. _wos.debug.worldActors.mtaBusRows()
4. _wos.debug.worldActors.mtaBusActorBridgeSync()
5. _wos.debug.worldActors.mtaBusActorBridgeState()
6. _wos.debug.worldActors.list()
```

Expected result:

```text
vehicle.bus actors exist in ActorRuntime
```

No visible buses yet.

---

# PERFORMANCE RULE

The bridge may create thousands of truth actors.

The bridge must not create render pressure.

Hard rule:

```text
ActorRuntime truth count is not renderer count.
```

If the adapter returns 5,000 rows:

```text
ActorRuntime may know 5,000.
Renderer must later select only what matters.
```

This means 0604J or 0604K must introduce presentation selection before rendering full feed scale.

---

# ALTITUDE-AWARE HANDOFF

This bridge does not implement altitude filtering.

However, it must preserve enough metadata for future presentation policy:

```js
metadata: {
  routeId,
  vehicleId,
  tripId,
  truthClass: "observed",
  presentationEligible: true
}
```

Future render policy may decide:

```text
low altitude     → detailed bus actors
city altitude    → simplified bus blocks
regional altitude→ tiny moving dots
cruise altitude  → aggregate movement field
```

---

# HARD BOUNDARY

0604I SHALL NOT:

```text
render buses
draw dots
draw labels
create Mapbox layers
create Mapbox sources
modify WSL directly
assign bus assets
style route colors
filter by camera
smooth motion
create Studio controls
create synthetic trucks
create Citi Bike actors
create subway actors
touch maritime systems
```

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.MTABusActorBridge exists
no API key required
no adapter rows required
no crash
```

## T2 — Sync with no adapter

Expected:

```text
returns ok:false
lastError = adapter_unavailable
no actor mutation
```

## T3 — Sync with empty rows

Expected:

```text
ok:true
rows:0
accepted:0
rejected:0
actorCount unchanged
```

## T4 — Valid row upserts bus actor

Input:

```js
{
  sourceId: "mta_bus_gtfs_rt_vehicle_positions",
  vehicleId: "bus_123",
  routeId: "B41",
  latitude: 40.6501,
  longitude: -73.9496,
  bearing: 90,
  speedMps: 8,
  timestampUtcMs: Date.now(),
  rawEntityId: "entity_123"
}
```

Expected actor:

```text
sourceEntityId = bus_123
actorType = vehicle.bus
metadata.routeId = B41
metadata.truthClass = observed
```

## T5 — Invalid coordinates rejected

Expected:

```text
accepted:0
rejected:1
reason invalid_coordinates
no actor upsert
```

## T6 — Missing route accepted

Expected:

```text
actor created
metadata.routeId = null
label = MTA Bus
```

## T7 — No renderer mutation

Expected:

```text
WorldSpaceVehicleLayer vehicle count unchanged
no Mapbox source added
no Mapbox layer added
```

## T8 — No maritime mutation

Expected:

```text
AIS runtime unchanged
marine taxonomy unchanged
marine asset bridge unchanged
```

## T9 — Debug commands work

Expected:

```text
mtaBusActorBridgeState()
mtaBusActorBridgeSync()
mtaBusActorBridgeStats()
mtaBusActorBridgeActors()
mtaBusActorBridgeClear()
```

all return structured data without throwing.

## T10 — Clear removes only bus actors created by bridge

Expected:

```text
vehicle.bus actors from source mta_bus_gtfs_rt_vehicle_positions removed
AIS / Citi Bike / debug actors untouched
```

---

# NON-GOALS

This spec does not create:

- visible buses
- route badges
- bus models
- bus light cues
- Studio bus controls
- route filtering
- viewport filtering
- spatial buffering
- motion smoothing
- static GTFS schedule parsing
- subway feeds
- Citi Bike feeds
- synthetic truck actors

---

# NEXT SPEC

```text
0604J_WOS_BusVisualFallbackRenderer_v1.0.0_BUILD
```

Purpose:

```text
select a bounded subset of vehicle.bus actors
render simple visible bus fallback shapes on Wall
prove live buses can be seen
```

0604J must not render all bus actors by default.

It must include first-pass visibility budgeting.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/transit/mtaBusActorBridge.js`; register it in `wall/index.html` after `mtaBusRealtimeAdapter.js`; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/transit/mtaBusActorBridge.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: After `mtaBusFetchOnce()` and `mtaBusActorBridgeSync()`, `vehicle.bus` actors exist in ActorRuntime, but no buses are visible yet.
