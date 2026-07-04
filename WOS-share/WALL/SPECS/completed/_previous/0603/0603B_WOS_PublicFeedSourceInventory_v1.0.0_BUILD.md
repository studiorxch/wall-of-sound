# 0603B_WOS_PublicFeedSourceInventory_v1.0.0_BUILD

Status: [BUILD]

## Purpose

Define the authoritative public-feed inventory for WOS Truth Infrastructure.

This spec does **not** implement live fetching. It ranks, classifies, and normalizes the public feed sources that future runtimes will adapt into `SBE.TruthActorRuntime`.

The goal is to prevent another synthetic-traffic loop by establishing:

```text
Public Feed → Source Inventory → Feed Adapter → Truth Actor Runtime → Visual Registry → Renderer
```

## Environmental Assumptions

- `0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0_BUILD` is complete.
- `SBE.ActorTypes` exists.
- `SBE.ActorSourceRegistry` exists.
- `SBE.ActorIdentityRegistry` exists.
- `SBE.ActorVisualRegistry` exists.
- `SBE.TruthActorRuntime` exists.
- Existing AIS and aircraft systems may remain separate until intentionally bridged.
- No external API keys should be hardcoded.
- Browser-side fetch may be blocked by CORS for some feeds; this inventory must record access risk.

## Core Doctrine

```text
Truth first.
Synthetic last.
```

WOS should prefer live or public infrastructure signals before inventing actors.

Synthetic actors remain useful only as:

- atmosphere filler
- creative supplement
- silence patch
- debug proof

They must not become the primary city-life system while public truth feeds exist.

## Feed Priority Stack

### Tier 1 — Build First

| Feed | Actor Types | Reason |
|---|---|---|
| Citi Bike GBFS | `bike.station`, future `bike.vehicle` | easiest public JSON, high density, useful to locals/tourists |
| MTA Bus GTFS-RT | `vehicle.bus` | strong real street motion, high utility, visible city pulse |

### Tier 2 — Build After First Success

| Feed | Actor Types | Reason |
|---|---|---|
| NYC DOT / 511NY events | `civic.incident`, `vehicle.utility` proxies | disruption layer, maintenance/incident storytelling |
| NYC Ferry / ferry sources | `marine.ferry` | transit-water bridge, useful and cinematic |

### Tier 3 — Larger Systems

| Feed | Actor Types | Reason |
|---|---|---|
| MTA Subway GTFS-RT | `transit.train` | city-scale circulation, huge WOS value, more route/station logic |
| Access-A-Ride / paratransit if accessible | `vehicle.utility` or future `vehicle.paratransit` | useful but access uncertainty |
| 311 / alerts | `civic.incident` | civic noise layer, needs filtering |

### Tier 4 — Existing / Bridge Later

| Feed | Actor Types | Reason |
|---|---|---|
| AIS | `marine.vessel`, `marine.ferry` | already validated separately |
| Aircraft | `aircraft.plane` | already partly validated separately |
| Weather | non-actor environmental source | atmosphere, not actor inventory |

## Inventory Data Model

Create a public-feed inventory as data, not runtime logic.

Recommended file:

```text
wall/systems/actors/publicFeedSourceInventory.js
```

Expose:

```js
SBE.PublicFeedSourceInventory
```

Each feed entry must use this shape:

```js
{
  id: 'citibike_gbfs_station_status',
  sourceId: 'citibike_gbfs',
  label: 'Citi Bike Station Status',
  provider: 'Lyft / Citi Bike',
  accessMethod: 'public_json',
  updateMode: 'poll',
  expectedCadenceMs: 30000,
  actorTypes: ['bike.station'],
  truthLevel: 'live',
  priority: 1,
  buildOrder: 1,
  accessRisk: 'low',
  corsRisk: 'low|medium|high|unknown',
  dataShape: 'gbfs_json',
  positionFields: ['lat', 'lon'],
  identityFields: ['station_id'],
  ttlMs: 45000,
  enabledByDefault: false,
  adapterTarget: 'SBE.TruthActorRuntime.upsertActor',
  notes: 'Station inventory and dock/bike availability.'
}
```

## Initial Feed Entries

### 1. Citi Bike GBFS — Station Information

```js
{
  id: 'citibike_gbfs_station_information',
  sourceId: 'citibike_gbfs',
  label: 'Citi Bike Station Information',
  provider: 'Lyft / Citi Bike',
  accessMethod: 'public_json',
  updateMode: 'poll',
  expectedCadenceMs: 300000,
  actorTypes: ['bike.station'],
  truthLevel: 'live',
  priority: 1,
  buildOrder: 1,
  accessRisk: 'low',
  corsRisk: 'unknown',
  dataShape: 'gbfs_json',
  positionFields: ['lat', 'lon'],
  identityFields: ['station_id'],
  ttlMs: 3600000,
  enabledByDefault: false,
  adapterTarget: 'SBE.TruthActorRuntime.upsertActor',
  notes: 'Static station locations. Best first adapter target.'
}
```

### 2. Citi Bike GBFS — Station Status

```js
{
  id: 'citibike_gbfs_station_status',
  sourceId: 'citibike_gbfs',
  label: 'Citi Bike Station Status',
  provider: 'Lyft / Citi Bike',
  accessMethod: 'public_json',
  updateMode: 'poll',
  expectedCadenceMs: 30000,
  actorTypes: ['bike.station'],
  truthLevel: 'live',
  priority: 1,
  buildOrder: 2,
  accessRisk: 'low',
  corsRisk: 'unknown',
  dataShape: 'gbfs_json',
  positionFields: [],
  identityFields: ['station_id'],
  ttlMs: 90000,
  enabledByDefault: false,
  adapterTarget: 'station_state_merge',
  notes: 'Availability state merged onto station actors. Does not create moving bikes.'
}
```

### 3. MTA Bus GTFS-RT — Vehicle Positions

```js
{
  id: 'mta_bus_gtfs_rt_vehicle_positions',
  sourceId: 'mta_bus_gtfs_rt',
  label: 'MTA Bus Vehicle Positions',
  provider: 'MTA',
  accessMethod: 'gtfs_rt_protobuf',
  updateMode: 'poll',
  expectedCadenceMs: 15000,
  actorTypes: ['vehicle.bus'],
  truthLevel: 'live',
  priority: 1,
  buildOrder: 3,
  accessRisk: 'medium',
  corsRisk: 'unknown',
  dataShape: 'gtfs_realtime_vehicle_positions',
  positionFields: ['position.latitude', 'position.longitude'],
  identityFields: ['vehicle.id', 'trip.trip_id'],
  ttlMs: 45000,
  enabledByDefault: false,
  adapterTarget: 'SBE.TruthActorRuntime.upsertActor',
  notes: 'Primary live street actor feed. Requires GTFS-RT parsing strategy.'
}
```

### 4. MTA Subway GTFS-RT — Trip Updates / Vehicle Positions

```js
{
  id: 'mta_subway_gtfs_rt',
  sourceId: 'mta_subway_gtfs_rt',
  label: 'MTA Subway GTFS-RT',
  provider: 'MTA',
  accessMethod: 'gtfs_rt_protobuf',
  updateMode: 'poll',
  expectedCadenceMs: 30000,
  actorTypes: ['transit.train'],
  truthLevel: 'live',
  priority: 3,
  buildOrder: 6,
  accessRisk: 'medium',
  corsRisk: 'unknown',
  dataShape: 'gtfs_realtime_subway',
  positionFields: ['derived_from_stop_sequence'],
  identityFields: ['trip.trip_id'],
  ttlMs: 60000,
  enabledByDefault: false,
  adapterTarget: 'derived_train_actor_runtime',
  notes: 'High-value but requires station/route interpolation. Do not build before simpler feeds.'
}
```

### 5. NYC DOT / 511NY Events

```js
{
  id: 'nyc_dot_traffic_events',
  sourceId: 'nyc_dot_events',
  label: 'NYC DOT Traffic Events',
  provider: 'NYC DOT / 511NY',
  accessMethod: 'public_json_or_feed',
  updateMode: 'poll',
  expectedCadenceMs: 60000,
  actorTypes: ['civic.incident', 'vehicle.utility'],
  truthLevel: 'live',
  priority: 2,
  buildOrder: 4,
  accessRisk: 'medium',
  corsRisk: 'unknown',
  dataShape: 'incident_event_feed',
  positionFields: ['lat', 'lng', 'geometry'],
  identityFields: ['event_id'],
  ttlMs: 180000,
  enabledByDefault: false,
  adapterTarget: 'SBE.TruthActorRuntime.upsertActor',
  notes: 'Use as disruption markers first. Utility trucks may be visual proxies, not guaranteed actual vehicles.'
}
```

### 6. NYC Ferry / Ferry Transit Feed

```js
{
  id: 'nyc_ferry_feed',
  sourceId: 'ais_runtime',
  label: 'NYC Ferry Feed',
  provider: 'NYC Ferry / AIS / GTFS if available',
  accessMethod: 'mixed',
  updateMode: 'poll_or_stream',
  expectedCadenceMs: 30000,
  actorTypes: ['marine.ferry'],
  truthLevel: 'live',
  priority: 2,
  buildOrder: 5,
  accessRisk: 'medium',
  corsRisk: 'unknown',
  dataShape: 'mixed_ferry_position_or_schedule',
  positionFields: ['lat', 'lng'],
  identityFields: ['vessel_id', 'trip_id'],
  ttlMs: 60000,
  enabledByDefault: false,
  adapterTarget: 'SBE.TruthActorRuntime.upsertActor',
  notes: 'Bridge between transit and maritime. May already overlap AIS.'
}
```

## Source Inventory API

`SBE.PublicFeedSourceInventory` must expose:

```js
listFeeds()
getFeed(id)
listByPriority(priority)
listBySource(sourceId)
listBuildOrder()
listEnabledCandidates()
```

All functions must return copies, not direct mutable registry objects.

## Debug Commands

Add under `_wos.debug.worldActors`:

```js
_wos.debug.worldActors.feedInventory()
_wos.debug.worldActors.feedBuildOrder()
_wos.debug.worldActors.feedBySource(sourceId)
_wos.debug.worldActors.feedPriority(priority)
```

Expected debug behavior:

- Print compact console tables.
- Do not fetch external URLs.
- Do not start feed adapters.
- Do not mutate actors.

## Files To Create

```text
wall/systems/actors/publicFeedSourceInventory.js
```

## Files To Modify

```text
wall/index.html
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Register the inventory script after `actorSourceRegistry.js` and before future feed runtimes:

```html
<script src="systems/actors/publicFeedSourceInventory.js"></script>
```

Recommended order:

```html
<script src="systems/actors/actorTypes.js"></script>
<script src="systems/actors/actorSourceRegistry.js"></script>
<script src="systems/actors/publicFeedSourceInventory.js"></script>
<script src="systems/actors/actorIdentityRegistry.js"></script>
<script src="systems/actors/actorVisualRegistry.js"></script>
<script src="systems/actors/truthActorRuntime.js"></script>
```

## Non-Goals

Do not fetch any feed data.
Do not implement GTFS-RT parsing.
Do not implement GBFS parsing.
Do not create bus, subway, ferry, or bike actors.
Do not modify `TruthActorRuntime`.
Do not modify `WorldSpaceVehicleLayer`.
Do not alter hero, AIS, aircraft, or ambient traffic behavior.
Do not introduce synthetic traffic changes.

## Acceptance Tests

Run:

```bash
node --check wall/systems/actors/publicFeedSourceInventory.js
node --check wall/systems/presentation/worldSpaceVehicleDebug.js
```

Browser tests:

```js
_wos.debug.worldActors.feedInventory()
_wos.debug.worldActors.feedBuildOrder()
_wos.debug.worldActors.feedBySource('citibike_gbfs')
_wos.debug.worldActors.feedPriority(1)
```

Expected:

- Inventory lists Citi Bike, MTA Bus, Subway, DOT, Ferry candidates.
- Build order places Citi Bike before MTA Bus, and both before Subway.
- No network requests occur.
- No actors are spawned.
- No runtime behavior changes.
- Source IDs match existing `SBE.ActorSourceRegistry` source IDs.

## Failure Conditions

Reject the build if:

- Any external feed is fetched.
- Any actor is spawned.
- Synthetic actors are prioritized above public truth feeds.
- Inventory source IDs do not match `SBE.ActorSourceRegistry`.
- Debug commands mutate runtime state.
- The inventory directly references renderer internals.
- The build hardcodes API keys or secrets.

## Next Build Recommendation

After 0603B, build:

```text
0603C_WOS_CitiBikeGBFSStationRuntime_v1.0.0_BUILD
```

Reason:

```text
Citi Bike GBFS station data is the simplest real public-feed path into TruthActorRuntime.
```

This proves:

```text
Public JSON → Adapter → TruthActorRuntime → ActorVisualRegistry → WorldSpaceVehicleLayer
```

before taking on GTFS-RT protobuf complexity.

## Implementation Guide

- **Where**: Create `wall/systems/actors/publicFeedSourceInventory.js`; register it in `wall/index.html`; add inventory debug commands inside `wall/systems/presentation/worldSpaceVehicleDebug.js` under `_wos.debug.worldActors`.
- **What**: Run `node --check wall/systems/actors/publicFeedSourceInventory.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`, then test `_wos.debug.worldActors.feedInventory()` in DevTools.
- **Expect**: A passive public-feed inventory table appears, ranked by build order, with no network requests, no actors spawned, and no changes to hero/AIS/aircraft/ambient runtime behavior.
