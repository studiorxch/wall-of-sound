---
layout: spec
title: "MTA Bus Feed Source Inventory"
date: 2026-06-04
doc_id: "0604G_WOS_MTABusFeedSourceInventory_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "runtime"
component: "mtaBusFeedSourceInventory"
type: "system-spec"
status: "approved"
priority: "high"
risk: "medium"
classification: "support-system"
summary: "Defines the authoritative source inventory for bringing live MTA bus vehicle positions into WOS without yet mutating ActorRuntime, rendering, Studio assignments, or map style."
doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
depends_on:
  - "ActorRuntime"
  - "ActorSourceRegistry"
  - "MapboxViewportRuntime"
  - "WorldSpaceVehicleLayer"
enables:
  - "0604H_WOS_MTABusRealtimeAdapter_v1.0.0"
  - "0604I_WOS_MTABusMetadataNormalization_v1.0.0"
  - "0604J_WOS_MTABusActorBridge_v1.0.0"
tags:
  - "mta"
  - "bus"
  - "gtfs-realtime"
  - "feed-inventory"
  - "road-pivot"
---

# 0604G_WOS_MTABusFeedSourceInventory_v1.0.0_BUILD

## Build Status

[BUILD]

## Purpose

Define the exact live bus data sources WOS will use to place real MTA buses on the Wall.

This spec exists to prevent another open-ended architecture detour. It does not build buses, render buses, classify buses, or edit buses. It only defines the source contract required by the next adapter spec.

The first visible goal enabled by this sequence is:

```text
Live MTA bus positions appear on Wall.
```

## Environmental Assumptions

- WOS runs in browser JavaScript under the existing `wall/` application.
- `SBE.ActorRuntime` or equivalent truth actor infrastructure already exists.
- `SBE.ActorSourceRegistry` or equivalent source registration infrastructure already exists.
- MTA Bus Time developer access is required.
- The developer must provide an MTA Bus Time API key.
- Feed parsing for GTFS-Realtime Protocol Buffers may require a browser-safe parser or a backend/proxy depending on current project constraints.
- This spec does not require Studio UI changes.
- This spec does not require rendering changes.

## Source Inventory

### Primary Source

```text
Name: MTA Bus Time GTFS-Realtime Vehicle Positions
Format: GTFS-Realtime Protocol Buffer
Purpose: live vehicle location source
Endpoint: https://gtfsrt.prod.obanyc.com/vehiclePositions?key=<YOUR_KEY>
Auth: MTA Bus Time developer API key
```

Official MTA documentation states that Bus Time supports GTFS-Realtime and exposes `TripUpdates`, `VehiclePositions`, and `Alerts`; the Vehicle Positions endpoint is the primary source for placing live buses on the map. MTA also states that Bus Time APIs require an account and API key. Sources: MTA Developer Resources and MTA Bus Time GTFS-Realtime documentation.

### Supporting Source

```text
Name: MTA Bus Time GTFS-Realtime Trip Updates
Format: GTFS-Realtime Protocol Buffer
Purpose: later schedule/delay/trip context
Endpoint: https://gtfsrt.prod.obanyc.com/tripUpdates?key=<YOUR_KEY>
Auth: MTA Bus Time developer API key
Status: deferred until after visible bus positions exist
```

### Deferred Source

```text
Name: MTA Bus Time GTFS-Realtime Alerts
Format: GTFS-Realtime Protocol Buffer
Purpose: service-alert overlays and route disruption state
Endpoint: https://gtfsrt.prod.obanyc.com/alerts?key=<YOUR_KEY>
Auth: MTA Bus Time developer API key
Status: deferred
```

### Legacy / Alternate Source

```text
Name: MTA Bus Time SIRI API
Purpose: fallback or future stop-monitoring workflows
Status: not used for first live map placement
```

SIRI remains useful for stop monitoring and richer bus-time query workflows, but it is not the first source for drawing live buses. The first implementation should use GTFS-Realtime Vehicle Positions.

## Non-Negotiable Scope Boundary

This spec only defines source discovery and inventory.

It must not:

- fetch live data
- parse Protocol Buffers
- normalize bus metadata
- create actors
- render buses
- create Studio controls
- add Mapbox sources or layers
- mutate map style
- mutate `ActorRuntime`
- mutate asset assignments
- create fake buses
- add maritime work

## Required Feed Capabilities

The selected source must support these fields either directly or through GTFS-Realtime standard vehicle payloads:

```ts
type RequiredBusFeedFields = {
  vehicleId: string;
  routeId: string | null;
  tripId: string | null;
  latitude: number;
  longitude: number;
  bearingDeg: number | null;
  timestampSec: number | null;
  currentStopSequence: number | null;
  stopId: string | null;
};
```

Minimum viable live bus placement requires:

```text
vehicleId
latitude
longitude
timestampSec
```

Route-readable live bus placement requires:

```text
vehicleId
routeId
latitude
longitude
bearingDeg
timestampSec
```

## Source Registry Contract

Add a source registry entry, but do not fetch data yet.

```js
{
  id: 'mta_bus_gtfs_rt_vehicle_positions',
  label: 'MTA Bus GTFS-RT Vehicle Positions',
  actorTypes: ['vehicle.bus'],
  truthLevel: 'live_external',
  updateMode: 'polling',
  defaultTtlMs: 90000,
  endpointKind: 'gtfs_realtime_vehicle_positions',
  requiresApiKey: true,
  authority: 'mta_bus_time',
  status: 'inventory_only'
}
```

## Configuration Contract

The next adapter must read configuration from one bounded location.

```js
SBE.MTABusFeedConfig = Object.freeze({
  vehiclePositionsUrl: 'https://gtfsrt.prod.obanyc.com/vehiclePositions',
  tripUpdatesUrl: 'https://gtfsrt.prod.obanyc.com/tripUpdates',
  alertsUrl: 'https://gtfsrt.prod.obanyc.com/alerts',
  apiKeyStorageKey: 'wos.mtaBusTime.apiKey',
  defaultRefreshMs: 15000,
  minimumRefreshMs: 10000,
  staleAfterMs: 90000,
  requestTimeoutMs: 10000,
});
```

API key handling must avoid hardcoding secrets into committed source files.

Allowed local development options:

```text
localStorage key: wos.mtaBusTime.apiKey
runtime debug setter
local uncommitted config file
backend environment variable if proxy is used
```

Forbidden:

```text
committed API key
hardcoded personal key
embedding key in generated spec text beyond placeholder
```

## Recommended File Targets

```text
wall/systems/transit/mtaBusFeedSourceInventory.js
wall/systems/transit/mtaBusFeedConfig.js
wall/systems/transit/README.md
wall/index.html
```

If `wall/systems/transit/` does not exist, create it.

## Load Order

```html
<script src="systems/transit/mtaBusFeedConfig.js"></script>
<script src="systems/transit/mtaBusFeedSourceInventory.js"></script>
```

Load after base registries and before the future live adapter.

Expected future order:

```text
ActorSourceRegistry
→ mtaBusFeedConfig
→ mtaBusFeedSourceInventory
→ mtaBusRealtimeAdapter
→ mtaBusMetadataNormalization
→ mtaBusActorBridge
→ BusVisualFallbackRenderer
```

## Public API

```ts
type MTABusFeedSourceInventoryState = {
  version: string;
  active: boolean;
  registered: boolean;
  primarySourceId: string;
  sourceCount: number;
  requiresApiKey: boolean;
  hasApiKey: boolean;
  vehiclePositionsConfigured: boolean;
  tripUpdatesConfigured: boolean;
  alertsConfigured: boolean;
  lastError: string | null;
};
```

```ts
type MTABusFeedSourceInventoryApi = {
  VERSION: string;
  start(): boolean;
  stop(): boolean;
  getState(): MTABusFeedSourceInventoryState;
  getSources(): MTABusSourceDefinition[];
  getPrimarySource(): MTABusSourceDefinition;
  hasApiKey(): boolean;
  setApiKey(key: string): boolean;
  clearApiKey(): boolean;
};
```

## Source Definitions

```ts
type MTABusSourceDefinition = {
  id: string;
  label: string;
  format: 'gtfs_realtime_protobuf' | 'siri_json' | 'siri_xml';
  endpoint: string;
  purpose: 'vehicle_positions' | 'trip_updates' | 'alerts' | 'stop_monitoring';
  requiredForFirstMap: boolean;
  requiresApiKey: boolean;
  status: 'primary' | 'supporting' | 'deferred' | 'fallback';
};
```

## Source List

```js
const MTA_BUS_SOURCES = Object.freeze([
  {
    id: 'mta_bus_gtfs_rt_vehicle_positions',
    label: 'MTA Bus GTFS-RT Vehicle Positions',
    format: 'gtfs_realtime_protobuf',
    endpoint: 'https://gtfsrt.prod.obanyc.com/vehiclePositions',
    purpose: 'vehicle_positions',
    requiredForFirstMap: true,
    requiresApiKey: true,
    status: 'primary',
  },
  {
    id: 'mta_bus_gtfs_rt_trip_updates',
    label: 'MTA Bus GTFS-RT Trip Updates',
    format: 'gtfs_realtime_protobuf',
    endpoint: 'https://gtfsrt.prod.obanyc.com/tripUpdates',
    purpose: 'trip_updates',
    requiredForFirstMap: false,
    requiresApiKey: true,
    status: 'supporting',
  },
  {
    id: 'mta_bus_gtfs_rt_alerts',
    label: 'MTA Bus GTFS-RT Alerts',
    format: 'gtfs_realtime_protobuf',
    endpoint: 'https://gtfsrt.prod.obanyc.com/alerts',
    purpose: 'alerts',
    requiredForFirstMap: false,
    requiresApiKey: true,
    status: 'deferred',
  },
]);
```

## Debug API

Add under the existing world actor debug namespace if available.

```js
_wos.debug.worldActors.mtaBusFeedInventoryState()
_wos.debug.worldActors.mtaBusFeedSources()
_wos.debug.worldActors.mtaBusSetApiKey('<key>')
_wos.debug.worldActors.mtaBusClearApiKey()
```

Do not print the full API key back to the console.

Allowed masked output:

```text
mtaBusApiKey: set ****abcd
```

## Validation Checklist

- [ ] Source inventory loads without a map.
- [ ] Source inventory loads without an API key.
- [ ] Missing API key reports `hasApiKey:false` without throwing.
- [ ] Primary Vehicle Positions source is present.
- [ ] Trip Updates source is present but not required for first map placement.
- [ ] Alerts source is present but deferred.
- [ ] No feed fetch occurs in this spec.
- [ ] No actors are created.
- [ ] No Mapbox sources or layers are added.
- [ ] No asset assignment is changed.
- [ ] No maritime module is touched.
- [ ] Debug API masks API key output.
- [ ] `node --check` passes for new JavaScript files.

## Acceptance Tests

### T1 — Inventory Loads Safely

Expected:

```js
SBE.MTABusFeedSourceInventory.getState().registered === true
```

### T2 — Primary Source Exists

Expected:

```js
SBE.MTABusFeedSourceInventory.getPrimarySource().id === 'mta_bus_gtfs_rt_vehicle_positions'
```

### T3 — API Key Missing Is Safe

Expected:

```js
SBE.MTABusFeedSourceInventory.hasApiKey() === false
```

No crash.

### T4 — API Key Can Be Stored Locally

Expected:

```js
SBE.MTABusFeedSourceInventory.setApiKey('test_key') === true
SBE.MTABusFeedSourceInventory.hasApiKey() === true
```

### T5 — No Runtime Mutation

Expected:

```text
Actor count unchanged.
Mapbox source count unchanged.
Mapbox layer count unchanged.
Asset assignments unchanged.
```

### T6 — Debug Namespace Works

Expected:

```js
_wos.debug.worldActors.mtaBusFeedInventoryState()
_wos.debug.worldActors.mtaBusFeedSources()
```

Both return data without fetching live feed data.

## Non-Goals

This spec does not implement:

- bus rendering
- live polling
- Protocol Buffer parsing
- GTFS static route matching
- trip delay calculation
- stop arrival prediction
- Studio editing
- route filtering
- route labels
- motion smoothing
- Citi Bike
- maritime lights
- harbor atmosphere

## Deferred Specs

```text
0604H_WOS_MTABusRealtimeAdapter_v1.0.0_BUILD
0604I_WOS_MTABusMetadataNormalization_v1.0.0_BUILD
0604J_WOS_MTABusActorBridge_v1.0.0_BUILD
0604K_WOS_BusVisualFallbackRenderer_v1.0.0_BUILD
0604L_WOS_BusRouteLabelPass_v1.0.0_BUILD
```

## Canonical References

- WOS Naming Doctrine
- WOS Surface / Channel Doctrine
- WOS Constitutional Spec Template
- Actor Infrastructure migration notes
- MTA Developer Resources
- MTA Bus Time GTFS-Realtime documentation
- GTFS-Realtime reference

## Implementation Guide

- **Where:** Create `wall/systems/transit/mtaBusFeedConfig.js` and `wall/systems/transit/mtaBusFeedSourceInventory.js`; register both in `wall/index.html` after source registries and before future bus adapter files.
- **What:** Run `node --check wall/systems/transit/mtaBusFeedConfig.js && node --check wall/systems/transit/mtaBusFeedSourceInventory.js`, then open Wall and call `_wos.debug.worldActors.mtaBusFeedInventoryState()`.
- **Expect:** Source inventory reports the GTFS-Realtime Vehicle Positions source as primary, no live fetch occurs, no actors are created, and missing API key is reported safely as `hasApiKey:false`.
