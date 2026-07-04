# 0603C_WOS_CitiBikeGBFSStationRuntime_v1.0.0_BUILD

Status: [BUILD]

## Purpose

Create the first live public-feed adapter for the WOS Truth Infrastructure actor pipeline.

This spec implements Citi Bike station ingestion using GBFS public JSON and converts station truth into normalized `bike.station` actors for `SBE.TruthActorRuntime`.

This is not a synthetic motion system.

It reveals curb infrastructure density, station pressure, neighborhood mobility, and local city rhythm through live station state.

```text
GBFS station_information
+
GBFS station_status
→ CitiBikeStationRuntime
→ TruthActorRuntime
→ ActorVisualRegistry
→ WorldSpaceVehicleLayer
```

## Environmental Assumptions

- Existing WOS browser runtime loads from `wall/index.html`.
- `SBE.ActorTypes` exists from `0603A`.
- `SBE.ActorSourceRegistry` exists from `0603A`.
- `SBE.ActorIdentityRegistry` exists from `0603A`.
- `SBE.ActorVisualRegistry` exists from `0603A`.
- `SBE.TruthActorRuntime` exists from `0603A`.
- `SBE.PublicFeedSourceInventory` exists from `0603B`.
- `SBE.WorldSpaceVehicleLayer` remains the current render adapter.
- Existing glyph and color registries may exist and should be reused through `ActorVisualRegistry` only.
- Citi Bike GBFS endpoints may or may not be browser-fetchable depending on CORS. Runtime must fail safely if blocked.

## Core Doctrine

```text
Truth actors come from declared external signals.
Synthetic actors only fill silence.
```

Citi Bike stations are not decorative dots.

They are curb infrastructure signals.

They indicate:

- neighborhood activity
- commute pressure
- station imbalance
- available micromobility
- local density
- city pulse

## Authority Boundaries

This spec owns:

- Citi Bike GBFS station feed polling
- GBFS station_information parsing
- GBFS station_status parsing
- station metadata merge
- normalized `bike.station` actor updates
- polling lifecycle and safe error state
- debug/audit commands

This spec may observe:

- `SBE.PublicFeedSourceInventory`
- `SBE.TruthActorRuntime`
- `SBE.ActorSourceRegistry`
- map center / viewport only for optional local filtering

This spec must not control:

- hero route, speed, camera, or heading
- synthetic ambient traffic
- vehicle mesh geometry
- WorldSpaceVehicleLayer internals
- Mapbox style
- AIS runtime
- aircraft runtime
- subway runtime
- bus runtime

## Non-Goals

Do not implement moving Citi Bike vehicles.
Do not infer trips.
Do not animate bikes between stations.
Do not build a bike simulation.
Do not add collision.
Do not replace ActorVisualRegistry.
Do not create custom station mesh geometry in this spec.
Do not add API keys or secrets.
Do not proxy feeds in this spec.

## Why Station First

Citi Bike stations are directly truth-backed.

Moving bikes are not directly available as simple public live vehicle positions from GBFS.

Therefore:

```text
bike.station = truth-backed now
bike.vehicle = deferred until a defensible signal exists
```

Station status already gives useful live city meaning without inventing motion.

## Files To Create

```text
wall/systems/feeds/citibikeStationRuntime.js
```

## Files To Modify

```text
wall/index.html
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional only if absolutely needed:

```text
wall/systems/actors/actorVisualRegistry.js
```

Do not modify:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/render/heroVehicleRenderer.js
wall/systems/traffic/ambientTrafficRuntime.js
```

## Build Order

### 1. Data Layer

Read GBFS station information and station status into normalized internal records.

### 2. Logic Layer

Merge station information + station status by `station_id` and upsert `bike.station` actors.

### 3. Interface Layer

Expose debug commands for start, stop, state, audit, sample, clear, and local count.

## Feed Targets

Primary GBFS discovery endpoint:

```text
https://gbfs.citibikenyc.com/gbfs/gbfs.json
```

The runtime should discover feed URLs from GBFS discovery when possible.

Required feed names:

```text
station_information
station_status
```

Fallback direct URLs may be declared as constants only if discovery fails.

No private keys.
No authentication.
No server dependency in this spec.

## Runtime API

Create `SBE.CitiBikeStationRuntime`.

Expose:

```js
start(options)
stop()
restart(options)
refresh()
clear()
getState()
listStations()
getStation(stationId)
setEnabled(enabled)
setDebug(enabled)
setViewportFilter(enabled)
```

### Runtime State Shape

```js
{
  version: '1.0.0',
  active: false,
  enabled: true,
  debug: false,
  viewportFilterEnabled: false,
  stationCount: 0,
  actorCount: 0,
  informationCount: 0,
  statusCount: 0,
  lastFetchAt: 0,
  lastMergeAt: 0,
  lastUpsertAt: 0,
  lastError: null,
  fetchCount: 0,
  upsertCount: 0,
  staleCount: 0,
  feedUrls: {
    discovery: '',
    stationInformation: '',
    stationStatus: ''
  }
}
```

## System Constants

```js
const VERSION = '1.0.0';
const SOURCE_ID = 'citibike_gbfs';
const ACTOR_TYPE = 'bike.station';
const DISCOVERY_URL = 'https://gbfs.citibikenyc.com/gbfs/gbfs.json';
const POLL_INTERVAL_MS = 30000;
const STARTUP_RETRY_MS = 5000;
const STATION_TTL_MS = 3600000;
const STATUS_STALE_MS = 120000;
const MAX_ACTORS_PER_REFRESH = 2500;
const VIEWPORT_PADDING_PX = 320;
```

Constants are tunable implementation baselines, not doctrine.

## Normalized Station Record

Internal merged station shape:

```js
{
  stationId: 'string',
  name: 'string',
  lat: 40.0,
  lng: -73.0,
  capacity: 0,
  numBikesAvailable: 0,
  numDocksAvailable: 0,
  numEbikesAvailable: 0,
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  lastReported: 0,
  statusStale: false,
  pressureRatio: 0.0,
  actorId: null
}
```

## Normalized Actor Update

Each station actor must call:

```js
SBE.TruthActorRuntime.upsertActor({
  sourceId: 'citibike_gbfs',
  sourceEntityId: station.stationId,
  actorType: 'bike.station',
  label: station.name,
  lng: station.lng,
  lat: station.lat,
  headingDeg: 0,
  speedMps: 0,
  timestampMs: Date.now(),
  ttlMs: 3600000,
  metadata: {
    stationId: station.stationId,
    capacity: station.capacity,
    numBikesAvailable: station.numBikesAvailable,
    numDocksAvailable: station.numDocksAvailable,
    numEbikesAvailable: station.numEbikesAvailable,
    isInstalled: station.isInstalled,
    isRenting: station.isRenting,
    isReturning: station.isReturning,
    lastReported: station.lastReported,
    statusStale: station.statusStale,
    pressureRatio: station.pressureRatio
  }
});
```

## Station Pressure Semantics

Compute:

```js
pressureRatio = capacity > 0 ? numBikesAvailable / capacity : 0
```

Interpretation:

```text
0.00–0.15 → empty / shortage
0.16–0.70 → balanced
0.71–1.00 → full / high supply
```

This spec only stores `pressureRatio` in metadata.

Do not mutate visuals based on pressure yet.

Future specs may map pressure into color, pulse, glyph state, or audio behavior.

## Fetching Rules

### Discovery

On first refresh:

1. Fetch GBFS discovery URL.
2. Find `station_information` feed URL.
3. Find `station_status` feed URL.
4. Store resolved URLs in runtime state.

If discovery fails:

- set `lastError = 'discovery_failed:<message>'`
- do not throw
- do not start repeated tight-loop retries
- retry on next scheduled poll or manual `refresh()`

### Station Fetch

Fetch `station_information` and `station_status`.

Rules:

- Use `fetch()`.
- Use `cache: 'no-store'` when supported.
- Parse JSON defensively.
- Accept both GBFS v2-style and v3-style response envelopes if possible.
- If one feed fails, do not destroy existing station records.
- If status fails but information succeeds, stations may still render with stale status metadata.

## Merge Rules

Merge by `station_id`.

`station_information` owns:

```text
station_id
name
lat
lon
capacity
```

`station_status` owns:

```text
num_bikes_available
num_docks_available
num_ebikes_available
is_installed
is_renting
is_returning
last_reported
```

If a station lacks valid lat/lng, skip it and count it as invalid.

If station status is missing, keep the station with stale status.

## Actor Creation Rules

- Actor ID must remain deterministic through `ActorIdentityRegistry`.
- Do not create random station IDs.
- Do not create one actor per available bike.
- Do not create moving bike actors.
- Do not upsert more than `MAX_ACTORS_PER_REFRESH` actors in one refresh.
- Optional viewport filtering may reduce actor creation, but default should be full city station layer if performance is acceptable.

## Viewport Filter

`setViewportFilter(true)` may restrict upserts to stations near the current viewport.

Rules:

- Filtering must not delete station records.
- Filtering only controls which stations are rendered as actors.
- Filtering should use map projection if available.
- Include `VIEWPORT_PADDING_PX` so stations near screen edges do not flicker.
- Default: `false`.

## Lifecycle

`start()`:

1. Sets active true.
2. Starts `SBE.TruthActorRuntime` if present.
3. Runs one async `refresh()`.
4. Starts poll timer.
5. Returns immediately.

`stop()`:

1. Sets active false.
2. Clears poll timer.
3. Does not clear station actors unless `clear()` is called.

`clear()`:

1. Removes Citi Bike station actors created by this runtime.
2. Clears local station records.
3. Does not touch hero, AIS, aircraft, ambient traffic, or other truth actors.

## Debug Commands

Add under `_wos.debug.worldActors`:

```js
citibikeStart()
citibikeStop()
citibikeRestart()
citibikeRefresh()
citibikeClear()
citibikeState()
citibikeList(limit)
citibikeSample()
citibikeViewportFilter(enabled)
citibikeDebug(enabled)
```

### `citibikeState()`

Print:

```text
active
enabled
stationCount
actorCount
informationCount
statusCount
lastFetchAt
lastError
feedUrls
```

### `citibikeList(limit)`

Print a compact table:

```text
stationId
name
lat
lng
capacity
bikes
ebikes
docks
pressureRatio
statusStale
actorId
```

Default limit: `25`.

### `citibikeSample()`

Print:

- first 10 stations
- highest bike availability 10
- lowest bike availability 10
- stale status count

## Index Registration

Add after `truthActorRuntime.js` and after `publicFeedSourceInventory.js`:

```html
<script src="systems/feeds/citibikeStationRuntime.js"></script>
```

Required order:

```text
actorTypes.js
actorSourceRegistry.js
publicFeedSourceInventory.js
actorIdentityRegistry.js
actorVisualRegistry.js
truthActorRuntime.js
citibikeStationRuntime.js
worldSpaceVehicleLayer.js
worldSpaceVehicleDebug.js
```

If the actual index requires `WorldSpaceVehicleLayer` earlier for existing boot order, do not break the app. The Citi Bike runtime may load before WSL because it only talks to `TruthActorRuntime`, but debug rendering requires WSL to exist by test time.

## Acceptance Tests

Run:

```bash
node --check wall/systems/feeds/citibikeStationRuntime.js
node --check wall/systems/presentation/worldSpaceVehicleDebug.js
```

Browser tests:

```js
_wos.debug.worldActors.citibikeState()
_wos.debug.worldActors.citibikeStart()
setTimeout(() => _wos.debug.worldActors.citibikeState(), 4000)
setTimeout(() => _wos.debug.worldActors.citibikeSample(), 5000)
setTimeout(() => _wos.debug.worldActors.citibikeList(25), 6000)
_wos.debug.worldActors.state()
_wos.debug.worldActors.list()
```

Expected:

- Runtime loads without throwing.
- `citibikeStart()` returns immediately.
- If GBFS fetch succeeds, `stationCount > 0`.
- If CORS blocks fetch, `lastError` clearly reports the fetch/discovery failure.
- Station actors use deterministic IDs:

```text
bike:citibike_gbfs:<station_id>
```

- Re-running `citibikeRefresh()` updates existing station actors, not duplicates.
- `_wos.debug.worldActors.state()` shows `sourceCounts.citibike_gbfs > 0` after successful fetch.
- `citibikeClear()` removes only Citi Bike station actors created by this runtime.

## Failure Conditions

Reject the build if:

- Runtime creates moving bike actors.
- Runtime creates synthetic bikes.
- Runtime creates random IDs for stations.
- Runtime blocks Drive startup.
- Runtime throws on fetch/CORS failure.
- Runtime mutates hero, ambient traffic, AIS, aircraft, or Mapbox style.
- Runtime writes directly to WorldSpaceVehicleLayer instead of TruthActorRuntime.
- Runtime ignores `ActorSourceRegistry` source identity.
- Runtime overwrites ActorVisualRegistry profiles inline.
- Runtime deletes non-Citi-Bike actors during clear.

## Deferred Systems

- Citi Bike moving bike inference
- station pressure color styling
- station glyph state styling
- station clustering
- station audio pulse
- station demand heatmap
- trip inference
- bike lane visualization
- micromobility surface/channel programming

## Canonical References

- `0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0_BUILD`
- `0603B_WOS_PublicFeedSourceInventory_v1.0.0_BUILD`
- `SBE.ActorSourceRegistry`
- `SBE.PublicFeedSourceInventory`
- `SBE.TruthActorRuntime`
- `SBE.ActorVisualRegistry`
- WOS doctrine: `2D owns truth. 2.5D owns presentation.`

## Implementation Notes

The first build should prefer correctness and auditability over visual sophistication.

If too many station actors create visual clutter, do not patch rendering immediately. Use `setViewportFilter(true)` or defer clustering to a later spec.

If direct browser fetch fails, do not work around it inside this spec. Record the failure clearly and create a follow-up proxy/runtime access spec.

Citi Bike stations should feel like infrastructure anchors, not decorative icons. Their value comes from truth-backed location and status.

## Implementation Guide

- **Where**: Create `wall/systems/feeds/citibikeStationRuntime.js`; add its script tag to `wall/index.html`; add Citi Bike debug commands inside `_wos.debug.worldActors` in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/feeds/citibikeStationRuntime.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; in DevTools run `_wos.debug.worldActors.citibikeStart()`, then `_wos.debug.worldActors.citibikeState()` and `_wos.debug.worldActors.citibikeSample()`.
- **Expect**: Citi Bike stations load as deterministic `bike.station` truth actors when GBFS fetch succeeds; if CORS blocks fetch, the runtime fails safely with a clear `lastError` and no app freeze.
