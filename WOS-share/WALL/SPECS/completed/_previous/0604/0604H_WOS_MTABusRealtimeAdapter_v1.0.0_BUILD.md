---
layout: spec
title: "MTA Bus Realtime Adapter"
date: 2026-06-04
doc_id: "0604H_WOS_MTABusRealtimeAdapter_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "runtime"
component: "mta_bus_realtime_adapter"

type: "runtime-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "runtime-authority"

summary: "Fetches and decodes MTA Bus GTFS-Realtime vehicle positions into raw bus rows without mutating ActorRuntime, rendering, or touching Mapbox."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Adapter before actor bridge"
  - "Fetch/decode before render"

depends_on:
  - "0604G_WOS_MTABusFeedSourceInventory_v1.0.0"
  - "SBE.MTABusFeedConfig"
  - "SBE.MTABusFeedSourceInventory"

enables:
  - "0604I_WOS_MTABusActorBridge_v1.0.0"
  - "0604J_WOS_BusVisualFallbackRenderer_v1.0.0"

tags:
  - "mta"
  - "bus"
  - "gtfs-realtime"
  - "vehicle-positions"
  - "nyc-transit"
---

# 0604H_WOS_MTABusRealtimeAdapter_v1.0.0_BUILD

## PURPOSE

Implement the first live MTA Bus GTFS-Realtime adapter.

This adapter reads the 0604G inventory/config, fetches the vehicle positions feed, decodes GTFS-Realtime protobuf data, and exposes raw bus rows for the next bridge layer.

It must not create actors.

It must not render buses.

It must not mutate Mapbox, WSL, Studio, AIS, Citi Bike, or maritime systems.

Core flow:

```text
SBE.MTABusFeedSourceInventory
→ readiness gate
→ fetch vehicle positions
→ decode GTFS-Realtime
→ raw bus rows
```

---

# CURRENT CONTEXT

Completed:

```text
0604G_WOS_MTABusFeedSourceInventory_v1.0.0_BUILD
```

0604G provides:

```text
SBE.MTABusFeedConfig
SBE.MTABusFeedSourceInventory
source id: mta_bus_gtfs_rt_vehicle_positions
API key plumbing
readiness gate
failure vocabulary
```

This spec creates:

```text
SBE.MTABusRealtimeAdapter
```

---

# HARD BOUNDARY

0604H is an adapter only.

It SHALL NOT:

```text
create actors
upsert ActorRuntime
touch TruthActorRuntime
touch WorldSpaceVehicleLayer
touch Mapbox sources
touch Mapbox layers
render dots
render labels
assign assets
style buses
smooth motion
filter by viewport
touch AIS/marine systems
touch Citi Bike systems
touch subway systems
```

---

# NEW FILES

```text
wall/systems/transit/mtaBusRealtimeAdapter.js
wall/systems/transit/vendor/gtfsRealtimeBindings.js
```

Update:

```text
wall/systems/transit/README.md
wall/index.html
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Load order:

```text
mtaBusFeedConfig.js
mtaBusFeedSourceInventory.js
vendor/gtfsRealtimeBindings.js
mtaBusRealtimeAdapter.js
```

---

# PUBLIC API

Expose:

```js
SBE.MTABusRealtimeAdapter
```

Frozen API:

```js
start()
stop()
isRunning()

fetchOnce()
getState()
getRows()
getStats()
clearRows()

setDebug(enabled)
```

---

# READINESS GATE

Before every fetch:

```js
const readiness = SBE.MTABusFeedSourceInventory.getReadiness();
```

Required:

```js
readiness.canAttemptFetch === true
```

If false:

```js
return {
  ok: false,
  failureReason: "not_configured"
}
```

or, when specifically missing key:

```js
failureReason: "api_key_missing"
```

Failure strings must come from:

```js
SBE.MTABusFeedConfig.FAILURE_REASONS
```

No adapter-specific fetch failure strings.

---

# SOURCE ID

Canonical source id:

```text
mta_bus_gtfs_rt_vehicle_positions
```

Do not use:

```text
mta_bus_gtfs_rt
```

The adapter output rows must include:

```js
sourceId: "mta_bus_gtfs_rt_vehicle_positions"
```

---

# FETCH REQUIREMENTS

Read endpoint only from:

```js
SBE.MTABusFeedConfig.vehiclePositionsUrl
```

Read timeout from:

```js
SBE.MTABusFeedConfig.requestTimeoutMs
```

Read API key from:

```js
SBE.MTABusFeedSourceInventory
```

Do not duplicate, hardcode, or log the full API key.

Expected HTTP:

```js
GET vehiclePositionsUrl
```

API key may be passed according to the existing MTA Bus Time requirement already proven in 0604G implementation.

Acceptable implementation options:

```text
query parameter key=<apiKey>
or required request header
```

Use the method that matches the current working MTA endpoint. Keep it centralized and documented.

---

# GTFS-REALTIME DECODE

Use:

```js
SBE.GTFSRealtimeBindings
```

or equivalent namespaced binding exposed by:

```text
wall/systems/transit/vendor/gtfsRealtimeBindings.js
```

Required decode target:

```js
transit_realtime.FeedMessage
```

Decode only:

```text
vehicle positions
```

Ignore:

```text
trip updates
alerts
```

---

# RAW ROW CONTRACT

Adapter outputs rows:

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

Rows must not contain WOS actor IDs.

Rows must not contain rendering payloads.

Rows must not contain asset IDs.

---

# ROW EXTRACTION RULES

From each GTFS entity:

Required:

```text
entity.id
vehicle.position.latitude
vehicle.position.longitude
```

Vehicle ID preference:

```text
vehicle.vehicle.id
→ vehicle.vehicle.label
→ entity.id
```

Trip fields:

```text
vehicle.trip.trip_id → tripId
vehicle.trip.route_id → routeId
```

Position fields:

```text
vehicle.position.latitude → latitude
vehicle.position.longitude → longitude
vehicle.position.bearing → bearing
vehicle.position.speed → speedMps
```

Timestamp:

```text
vehicle.timestamp seconds → timestampUtcMs milliseconds
```

Fallback timestamp:

```text
Date.now()
```

only if vehicle timestamp is unavailable.

---

# VALIDATION RULES

Reject entity when:

```text
missing vehicle payload
missing position
missing latitude
missing longitude
invalid latitude
invalid longitude
latitude outside -90..90
longitude outside -180..180
missing vehicle id after fallback
```

Do not reject solely because:

```text
missing routeId
missing tripId
missing bearing
missing speed
missing occupancy
missing timestamp
```

---

# STATE MODEL

```js
type MTABusRealtimeAdapterState = {
  version: "1.0.0"
  running: boolean
  debug: boolean

  sourceId: "mta_bus_gtfs_rt_vehicle_positions"

  lastFetchAt: number | null
  lastSuccessAt: number | null
  lastFailureAt: number | null
  lastFailureReason: string | null

  fetchCount: number
  successCount: number
  failureCount: number

  decodedEntityCount: number
  rejectedEntityCount: number
  rowCount: number

  readiness: object | null
}
```

---

# STATS MODEL

```js
type MTABusRealtimeAdapterStats = {
  fetchCount: number
  successCount: number
  failureCount: number
  decodedEntityCount: number
  rejectedEntityCount: number
  rowCount: number
  successRate: number
}
```

---

# POLLING

0604H must support:

```js
fetchOnce()
```

Polling may be implemented by `start()` only if it is safe, disabled by default, and uses:

```js
SBE.MTABusFeedConfig.refreshCadenceMs
```

Preferred first build:

```text
manual fetchOnce only
```

Reason:

```text
lower risk
easier debugging
no hidden request pressure
no accidental quota use
```

---

# FAILURE HANDLING

All fetch/decode failures must be caught.

No thrown errors may escape public API calls.

Use only known feed failure reasons:

```js
SBE.MTABusFeedConfig.FAILURE_REASONS
```

Required mappings:

```text
readiness false          → not_configured or api_key_missing
fetch/network exception  → network_error
non-2xx response         → http_error
decode exception         → decode_failed
zero feed entities       → empty_feed
entity missing vehicle   → missing_vehicle_position
entity missing coords    → missing_coordinates
row missing routeId      → missing_route_id only as warning/rejection count, not full fetch failure
old feed timestamp       → stale_feed
429 response             → rate_limited
fallback                 → unknown_error
```

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.worldActors
```

Required commands:

```js
mtaBusAdapterState()
mtaBusFetchOnce()
mtaBusRows(limit)
mtaBusStats()
mtaBusClearRows()
```

Expected:

```js
_wos.debug.worldActors.mtaBusFetchOnce()
```

returns:

```js
{
  ok: boolean,
  rowsAdded: number,
  failureReason: string | null,
  decodedEntityCount: number,
  rejectedEntityCount: number
}
```

Rows debug should never print API key.

---

# EXECUTION FLOW

Manual proof:

```text
1. _wos.debug.worldActors.mtaBusSetApiKey("<key>")
2. _wos.debug.worldActors.mtaBusFeedReadiness()
3. _wos.debug.worldActors.mtaBusFetchOnce()
4. _wos.debug.worldActors.mtaBusRows(10)
5. _wos.debug.worldActors.mtaBusStats()
```

Expected result:

```text
raw live MTA bus rows exist
no actors created
no buses visible yet
```

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.MTABusRealtimeAdapter exists
no API key required at load
no fetch on load
no crash
```

## T2 — No key blocks fetch

Expected:

```text
mtaBusFetchOnce()
→ ok:false
→ failureReason api_key_missing or not_configured
→ rowCount unchanged
```

## T3 — Valid key attempts fetch

Expected:

```text
HTTP request issued only after readiness.canAttemptFetch === true
```

## T4 — Decode succeeds

Expected:

```text
FeedMessage decoded
decodedEntityCount > 0 when feed has entities
```

## T5 — Rows extracted

Expected row includes:

```text
sourceId
vehicleId
latitude
longitude
timestampUtcMs
rawEntityId
```

## T6 — Bad entities rejected

Expected:

```text
invalid entities rejected
adapter does not throw
rejectedEntityCount increments
```

## T7 — No ActorRuntime mutation

Expected:

```text
ActorRuntime / TruthActorRuntime actor count unchanged
```

## T8 — No renderer mutation

Expected:

```text
WorldSpaceVehicleLayer vehicle count unchanged
no Mapbox source added
no Mapbox layer added
```

## T9 — No maritime mutation

Expected:

```text
AIS runtime unchanged
marine taxonomy unchanged
marine asset bridge unchanged
```

## T10 — Debug commands function

Expected:

```text
mtaBusAdapterState()
mtaBusFetchOnce()
mtaBusRows()
mtaBusStats()
mtaBusClearRows()
```

return structured data without throwing.

---

# NON-GOALS

This spec does not create:

- `vehicle.bus` actors
- bus rendering
- route labels
- route color styling
- bus assets
- Studio bus controls
- viewport filtering
- spatial buffers
- motion smoothing
- Citi Bike runtime
- subway runtime
- freight train runtime
- synthetic trucks

---

# NEXT SPEC

```text
0604I_WOS_MTABusActorBridge_v1.0.0_BUILD
```

Purpose:

```text
raw bus rows
→ vehicle.bus actors
```

0604I must not render buses.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/transit/mtaBusRealtimeAdapter.js`; add/confirm `wall/systems/transit/vendor/gtfsRealtimeBindings.js`; register both in `wall/index.html` after `mtaBusFeedSourceInventory.js`; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/transit/mtaBusRealtimeAdapter.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: After setting an API key and running `mtaBusFetchOnce()`, raw bus rows are available through `mtaBusRows()`, with no actor creation and no visible buses.
