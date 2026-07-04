# 0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0_BUILD

Status: [BUILD]

## Purpose

Create the shared WOS actor authority for real-world public-feed entities.

This spec moves WOS away from synthetic traffic as the default world-filling strategy and toward truth-driven infrastructure actors:

```text
Feed → Actor → Visual → Runtime
```

Synthetic actors remain allowed only as a fallback or creative supplement after truth-feed actors are exhausted.

## Environmental Assumptions

- Existing WOS browser runtime is loaded from `wall/index.html`.
- Existing vehicle layer supports world-space actor rendering through `SBE.WorldSpaceVehicleLayer.upsertVehicle()`.
- Existing glyph and color registries are available and should be reused when present.
- Existing AIS and aircraft systems may remain separate for now, but this authority must be compatible with them.
- No live external feed integration is required in this spec.

## Core Doctrine

```text
Truth actors come from declared external signals.
Synthetic actors only fill silence.
```

The actor system must separate:

- source truth
- actor identity
- visual presentation
- runtime behavior
- render-layer implementation

No feed parser should directly create meshes.
No renderer should own feed truth.
No debug showcase should become production actor logic.

## Target Actor Categories

| Category | Example Source | Initial Role |
|---|---|---|
| vessel | AIS | harbor motion |
| aircraft | ADS-B / existing aircraft runtime | sky motion |
| bus | GTFS-RT | street truth |
| train | GTFS-RT | transit pulse |
| bike_station | GBFS | curb/station presence |
| bike | GBFS / future inferred trips | micro-mobility |
| ferry | AIS / GTFS-RT | water/transit bridge |
| utility | DOT / incident feeds | civic presence |
| incident | NYC DOT / alerts | disruption marker |
| prop | authored registry | static world object |
| synthetic_vehicle | internal fallback | low-priority ambient filler |

## Files To Create

```text
wall/systems/actors/actorTypes.js
wall/systems/actors/actorSourceRegistry.js
wall/systems/actors/actorIdentityRegistry.js
wall/systems/actors/actorVisualRegistry.js
wall/systems/actors/truthActorRuntime.js
```

## Files To Modify

```text
wall/index.html
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional only if needed:

```text
wall/systems/render/worldSpaceVehicleLayer.js
```

Do not modify hero routing, camera presets, modelMatrix transform math, Mapbox style, or existing AIS/aircraft runtime behavior.

## Build Order

### 1. Data Layer

Create actor type constants and registries.

### 2. Logic Layer

Create the truth actor runtime that accepts normalized actor payloads.

### 3. Interface Layer

Add debug commands for audit, registry inspection, and test actor injection.

## Data Layer

### `actorTypes.js`

Export `SBE.ActorTypes` with canonical string constants:

```js
vehicle.bus
vehicle.utility
vehicle.synthetic
bike.station
bike.vehicle
transit.train
marine.vessel
marine.ferry
aircraft.plane
civic.incident
world.prop
```

Also export helpers:

```js
SBE.ActorTypes.isVehicle(type)
SBE.ActorTypes.isTruthBacked(type)
SBE.ActorTypes.toCategory(type)
```

Rules:

- Use plain browser-safe JavaScript.
- No imports.
- Attach to `global.SBE`.
- Freeze exported objects.

### `actorSourceRegistry.js`

Create `SBE.ActorSourceRegistry`.

Each source entry must include:

```js
{
  id: 'mta_bus_gtfs_rt',
  label: 'MTA Bus GTFS-RT',
  truthLevel: 'live' | 'scheduled' | 'static' | 'synthetic',
  actorTypes: ['vehicle.bus'],
  updateMode: 'poll' | 'stream' | 'manual',
  defaultTtlMs: 30000,
  enabledByDefault: false
}
```

Initial registered sources:

- `ais_runtime`
- `aircraft_runtime`
- `mta_bus_gtfs_rt`
- `mta_subway_gtfs_rt`
- `citibike_gbfs`
- `nyc_dot_events`
- `authored_world_props`
- `synthetic_ambient`

Expose:

```js
getSource(id)
listSources()
isTruthSource(id)
```

### `actorIdentityRegistry.js`

Create `SBE.ActorIdentityRegistry`.

Purpose: stable identity mapping across feeds.

Canonical identity shape:

```js
{
  actorId: 'bus:mta:1234',
  sourceId: 'mta_bus_gtfs_rt',
  sourceEntityId: '1234',
  actorType: 'vehicle.bus',
  label: 'MTA Bus 1234',
  firstSeenAt: 0,
  lastSeenAt: 0,
  ttlMs: 30000,
  tags: ['truth', 'transit']
}
```

Expose:

```js
resolveIdentity(input)
getIdentity(actorId)
listIdentities()
pruneExpired(nowMs)
```

`resolveIdentity(input)` must accept:

```js
{
  sourceId,
  sourceEntityId,
  actorType,
  label,
  ttlMs,
  tags
}
```

Guardrails:

- Do not generate random actor IDs for truth-backed sources.
- Actor IDs must be deterministic: `${category}:${sourceId}:${sourceEntityId}`.
- Synthetic actors may use generated IDs, but must be prefixed `synthetic:`.

### `actorVisualRegistry.js`

Create `SBE.ActorVisualRegistry`.

Purpose: map actor types and identities to render profiles without hardcoding visuals in feed runtimes.

Visual profile shape:

```js
{
  visualId: 'mta_bus_default',
  actorType: 'vehicle.bus',
  renderer: 'worldSpaceVehicleLayer',
  shape: 'box_truck',
  paletteRef: 'transit.bus.mta',
  glyphRef: 'transit.bus',
  scale: 1.9,
  detailTier: 'auto',
  depthPolicy: 'road',
  tags: ['truth', 'transit']
}
```

Initial profiles:

| Actor Type | Shape | Scale | Palette Intent |
|---|---:|---:|---|
| vehicle.bus | box_truck | 1.9 | MTA blue/white |
| vehicle.utility | box_truck | 1.9 | DOT yellow / hazard |
| vehicle.synthetic | traffic_car | 1.75 | muted traffic |
| bike.vehicle | traffic_car | 0.75 | Citi Bike blue / Tron cycle placeholder |
| bike.station | prop | 1.0 | dock marker |
| transit.train | box_truck | 2.2 | subway route color placeholder |
| civic.incident | prop | 1.0 | alert/hazard |
| world.prop | prop | 1.0 | authored |

Expose:

```js
getVisualProfile(actor)
registerVisualProfile(profile)
listVisualProfiles()
```

The registry must attempt to reuse existing color/glyph libraries when present:

```js
SBE.ColorRegistry
SBE.GlyphRegistry
```

If unavailable, fall back safely without throwing.

## Logic Layer

### `truthActorRuntime.js`

Create `SBE.TruthActorRuntime`.

Responsibilities:

- Accept normalized actor updates from future feeds.
- Resolve identity.
- Resolve visual profile.
- Maintain live actor state.
- Upsert renderable actors into the existing world-space layer.
- Prune stale actors.
- Provide audit/debug snapshots.

Normalized actor update:

```js
{
  sourceId: 'mta_bus_gtfs_rt',
  sourceEntityId: '1234',
  actorType: 'vehicle.bus',
  label: 'MTA Bus 1234',
  lng: -73.985,
  lat: 40.758,
  headingDeg: 180,
  speedMps: 8,
  timestampMs: Date.now(),
  ttlMs: 30000,
  metadata: {
    routeId: 'M15',
    tripId: '...',
    occupancy: null
  }
}
```

Runtime state shape:

```js
{
  active: true,
  actorCount: 0,
  sourceCounts: {},
  typeCounts: {},
  lastUpdateAt: 0,
  lastPruneAt: 0,
  lastError: null
}
```

Expose:

```js
start()
stop()
clear()
upsertActor(update)
removeActor(actorId)
getActor(actorId)
getState()
listActors()
prune(nowMs)
```

### Render Adapter

For this first build, only support `renderer: 'worldSpaceVehicleLayer'`.

Map actor update to `SBE.WorldSpaceVehicleLayer.upsertVehicle()`:

```js
{
  id: actorId,
  lat,
  lng,
  headingDeg,
  actorType,
  source: sourceId,
  label,
  scale: visualProfile.scale,
  variant: visualProfile.shape,
  metadata
}
```

Rules:

- Do not call render-layer private functions.
- If WSL is missing, store actor state but do not throw.
- If WSL is disabled and supports `setEnabled(true)`, enable it only when runtime starts.
- Never mutate hero actor behavior.
- Do not route, fake, or interpolate truth actors in this spec.

### Stale Actor Pruning

Every actor must expire based on TTL.

Prune rule:

```text
if nowMs - lastSeenAt > ttlMs → remove actor from runtime and render layer
```

If render layer removal fails, runtime still removes local state and records `lastError`.

## Interface Layer

### Debug Commands

Add to `_wos.debug.worldActors` if available; otherwise create it.

Commands:

```js
_wos.debug.worldActors.state()
_wos.debug.worldActors.list()
_wos.debug.worldActors.sources()
_wos.debug.worldActors.visuals()
_wos.debug.worldActors.identities()
_wos.debug.worldActors.clear()
_wos.debug.worldActors.testBus()
_wos.debug.worldActors.testUtility()
_wos.debug.worldActors.testBike()
_wos.debug.worldActors.prune()
```

Test actors must use deterministic sample IDs and truth-like source IDs:

```js
testBus → sourceId: 'mta_bus_gtfs_rt', sourceEntityId: 'debug_bus_001'
testUtility → sourceId: 'nyc_dot_events', sourceEntityId: 'debug_utility_001'
testBike → sourceId: 'citibike_gbfs', sourceEntityId: 'debug_bike_001'
```

Test actors should spawn near the current map center, not near the hero path by default.

## Index Registration

Add scripts to `wall/index.html` in this order:

```html
<script src="systems/actors/actorTypes.js"></script>
<script src="systems/actors/actorSourceRegistry.js"></script>
<script src="systems/actors/actorIdentityRegistry.js"></script>
<script src="systems/actors/actorVisualRegistry.js"></script>
<script src="systems/actors/truthActorRuntime.js"></script>
```

Place them after existing base registries, color/glyph registries, and before future feed runtimes.

## Acceptance Tests

Run:

```bash
node --check wall/systems/actors/actorTypes.js
node --check wall/systems/actors/actorSourceRegistry.js
node --check wall/systems/actors/actorIdentityRegistry.js
node --check wall/systems/actors/actorVisualRegistry.js
node --check wall/systems/actors/truthActorRuntime.js
node --check wall/systems/presentation/worldSpaceVehicleDebug.js
```

Browser tests:

```js
_wos.debug.worldActors.sources()
_wos.debug.worldActors.visuals()
_wos.debug.worldActors.testBus()
_wos.debug.worldActors.testUtility()
_wos.debug.worldActors.testBike()
_wos.debug.worldActors.state()
_wos.debug.worldActors.list()
```

Expected:

- Sources table lists AIS, aircraft, MTA, Citi Bike, DOT, authored props, synthetic.
- Test bus appears as a larger vehicle actor.
- Test utility appears as a utility-style vehicle placeholder.
- Test bike appears smaller than the bus but must be visible.
- `state().actorCount >= 3` after the three test commands.
- Re-running `testBus()` updates the same actor ID, not a duplicate.
- `clear()` removes all truth actors created by this runtime without touching hero, AIS, aircraft, or existing manually spawned showcase actors.

## Non-Goals

Do not implement live GTFS-RT, GBFS, DOT, or MTA API fetching in this spec.
Do not replace AIS or aircraft systems.
Do not solve traffic intelligence, collision, route planning, or lane law.
Do not modify hero route/camera/speed/underpass behavior.
Do not create a full editor UI yet.
Do not create synthetic ambient traffic changes.

## Failure Conditions

Reject the build if:

- Feed truth is encoded directly into a renderer.
- Actor identity is random for truth-backed sources.
- Test actor creation touches hero state.
- Existing AIS or aircraft runtime behavior changes.
- Existing glyph/color registries are ignored when available.
- Synthetic actors are treated as equal priority to truth actors.
- Actor runtime creates permanent actors with no TTL.

## Implementation Guide

- **Where**: Create `wall/systems/actors/*.js`; update `wall/index.html` script order; add debug commands in `wall/systems/presentation/worldSpaceVehicleDebug.js` near existing `_wos.debug` registration.
- **What**: Run the six `node --check` commands above, then test `_wos.debug.worldActors.testBus()`, `.testUtility()`, `.testBike()`, `.state()`, and `.list()` in DevTools.
- **Expect**: Three deterministic truth-style actors render through the existing world-space layer, update without duplication, audit cleanly, and clear without touching hero/AIS/aircraft/showcase actors.
