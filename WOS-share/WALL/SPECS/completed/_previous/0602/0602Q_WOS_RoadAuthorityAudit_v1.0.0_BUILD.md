---
layout: spec
title: "0602Q_WOS_RoadAuthorityAudit_v1.0.0_BUILD"
date: 2026-06-02
doc_id: "0602Q_WOS_RoadAuthorityAudit_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "runtime"
component: "AmbientTrafficRuntime / WorldSpaceVehicleDebug"
type: "runtime-spec"
status: "active"
priority: "high"
risk: "medium"
classification: "runtime-authority"
summary: "Adds road-authority diagnostics for ambient traffic so each spawned actor exposes the road class, layer source, lane side, offset, heading, route geometry, and rejection reason without changing traffic behavior."
doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
depends_on:
  - "0602P_WOS_AmbientTrafficPresenceRuntime"
  - "WorldSpaceVehicleLayer"
  - "MapboxViewportRuntime"
enables:
  - "AmbientTrafficLaneAuthority"
  - "RoadClassScaleAuthority"
  - "Future custom actor placement tools"
tags:
  - "traffic"
  - "road-authority"
  - "debug"
  - "audit"
  - "ambient-runtime"
---

# 0602Q_WOS_RoadAuthorityAudit_v1.0.0_BUILD

## Build Readiness

`[BUILD]`

This spec is ready to send to Claude/Codex.

---

# Purpose

Define a road-authority audit layer for WOS ambient traffic.

The current ambient traffic runtime is alive and persistent enough to expose the next class of problems:

- some actors follow believable roads
- some actors appear on underpass or grade-separated roads
- some actors use the wrong traffic side
- some actors sit offset from the road surface
- some actors appear scaled incorrectly for their road context
- some actors vanish because their selected road becomes invalid

This spec does **not** fix traffic behavior yet.

It adds the diagnostic truth needed to prove which road each actor is using before building lane, scale, collision, or actor-placement authority.

---

# Environmental Assumptions

- `wall/systems/traffic/ambientTrafficRuntime.js` exists and currently registers `SBE.AmbientTrafficRuntime`.
- `wall/systems/presentation/worldSpaceVehicleDebug.js` exists and currently registers `_wos.debug.worldVehicles`.
- Ambient actors use IDs beginning with `ambient_traffic_`.
- Ambient actors are inserted through `WorldSpaceVehicleLayer.upsertVehicle()` with `source: 'showcase-road'`.
- Road features are currently sampled from Mapbox rendered line layers.
- Existing Drive launch, hero runtime, render layer, depth policy, and camera behavior must remain untouched.

---

# Core Principles

## Audit Before Fix

Do not adjust lane offsets, scale, spawning, or road selection until the system can explain each actor’s road authority.

## Traffic Truth Remains Runtime-Owned

The ambient runtime owns ambient actor road selection and movement metadata.

The debug layer may observe and print that metadata, but must not mutate runtime truth.

## Sparse Debug, Not Frame Spam

Diagnostics must be callable on demand and must not log every frame.

## Road Authority Is Actor-Scoped

Every ambient actor must carry its own road-authority snapshot.

A bad actor should be diagnosable without reconstructing the entire spawn decision tree.

---

# Authority Boundaries

## This Spec Owns

- road-authority metadata stored on ambient actors
- road-class inference helpers
- road-source / layer identification
- per-actor road audit state
- debug commands for printing road authority
- optional one-shot road geometry marker objects for inspection

## This Spec May Read

- `SBE.AmbientTrafficRuntime.getState()`
- `SBE.MapboxViewportRuntime.getMap()`
- `SBE.WorldSpaceVehicleLayer`
- Mapbox rendered feature layer IDs and properties
- ambient actor internal road metadata

## This Spec May Mutate

Only debug-owned temporary audit markers with IDs prefixed:

```text
road_audit_
```

## This Spec Must Not Mutate

- hero route
- hero speed
- hero heading
- hero camera
- traffic spawn policy
- traffic lane offset policy
- traffic density
- traffic collision behavior
- Mapbox style
- render transforms
- vehicle mesh geometry
- depth policy

---

# Non-Goals

This spec does **not** implement:

- traffic collision
- traffic AI
- legal turn rules
- lane graph generation
- road snapping
- scale correction
- bridge/tunnel correction
- actor editor UI
- custom actor placement
- persistent actor registry
- road-class-based routing

Those systems depend on this audit proving the current road authority first.

---

# Data Model

Add road-authority data to each ambient actor at spawn time.

```js
type AmbientTrafficRoadAuthority = {
  roadKey: string;
  layerId: string | null;
  layerType: string | null;
  roadClass: 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'residential' | 'service' | 'local' | 'unknown';
  gradeHint: 'surface' | 'bridge' | 'tunnel' | 'ramp' | 'unknown';
  directionHint: 'oneWay' | 'twoWay' | 'unknown';
  flowSign: 1 | -1;
  baseHeadingDeg: number;
  travelHeadingDeg: number;
  laneSide: -1 | 1;
  laneOffsetM: number;
  scale: number;
  roadLengthM: number;
  spawnMode: 'edgeEntry' | 'visibleFallback';
  spawnDistanceFromHeroM: number;
  sampledPointCount: number;
  createdAtMs: number;
};
```

Extend each actor object with:

```js
actor.roadAuthority = {
  roadKey: actor.roadKey,
  layerId: road.layerId || null,
  layerType: road.layerType || null,
  roadClass: _resolveRoadClass(road.layerId, road.properties),
  gradeHint: _resolveGradeHint(road.layerId, road.properties),
  directionHint: _resolveDirectionHint(road.properties),
  flowSign: c.flowSign,
  baseHeadingDeg: c.baseHeadingDeg,
  travelHeadingDeg: c.headingDeg,
  laneSide: actor.laneSide,
  laneOffsetM: actor.laneOffsetM,
  scale: actor.scale,
  roadLengthM: actor.meta.total,
  spawnMode: actor.spawnMode,
  spawnDistanceFromHeroM: Math.round(c.heroDistanceM),
  sampledPointCount: actor.pts.length,
  createdAtMs: _now(),
};
```

---

# Required Implementation

## 1. Preserve Road Feature Metadata

File:

```text
wall/systems/traffic/ambientTrafficRuntime.js
```

In both road sampling paths, preserve useful feature metadata.

Where roads are pushed into `out`, change the object shape from:

```js
out.push({ pts: pts, meta: meta, layerId: lid });
```

to:

```js
out.push({
  pts: pts,
  meta: meta,
  layerId: lid,
  layerType: f.layer && f.layer.type ? f.layer.type : null,
  properties: f.properties || {},
});
```

Apply this in:

- `_sampleRoads(map)`
- `_sampleRoadsBudgeted(map, budgetMs, startup)`

Keep existing sorting and `road.index = i` behavior unchanged.

---

## 2. Add Road Authority Helpers

File:

```text
wall/systems/traffic/ambientTrafficRuntime.js
```

Add these helpers near the road sampling helpers.

```js
function _resolveRoadClass(layerId, properties) {
  var id = (layerId || '').toLowerCase();
  var p = properties || {};
  var cls = String(p.class || p.road_class || p.type || '').toLowerCase();
  var src = id + ' ' + cls;

  if (/motorway|freeway|expressway|interstate/.test(src)) return 'motorway';
  if (/trunk/.test(src)) return 'trunk';
  if (/primary/.test(src)) return 'primary';
  if (/secondary/.test(src)) return 'secondary';
  if (/tertiary/.test(src)) return 'tertiary';
  if (/residential/.test(src)) return 'residential';
  if (/service/.test(src)) return 'service';
  if (/street|road|local/.test(src)) return 'local';
  return 'unknown';
}

function _resolveGradeHint(layerId, properties) {
  var id = (layerId || '').toLowerCase();
  var p = properties || {};
  var src = id + ' ' + JSON.stringify(p).toLowerCase();

  if (/tunnel/.test(src)) return 'tunnel';
  if (/bridge|overpass/.test(src)) return 'bridge';
  if (/ramp|link/.test(src)) return 'ramp';
  if (/surface|street|road|primary|secondary|tertiary|residential/.test(src)) return 'surface';
  return 'unknown';
}

function _resolveDirectionHint(properties) {
  var p = properties || {};
  var oneWay = p.oneway != null ? String(p.oneway).toLowerCase() : '';
  if (oneWay === 'true' || oneWay === '1' || oneWay === 'yes') return 'oneWay';
  if (oneWay === 'false' || oneWay === '0' || oneWay === 'no') return 'twoWay';
  return 'unknown';
}
```

These helpers are diagnostic only. They must not reject or change actor behavior.

---

## 3. Attach Road Authority at Spawn

File:

```text
wall/systems/traffic/ambientTrafficRuntime.js
```

Inside `_spawnCandidate(c)`, after `actor` is built and before `_actors.push(actor)`, attach:

```js
actor.roadAuthority = {
  roadKey: actor.roadKey,
  layerId: c.road.layerId || null,
  layerType: c.road.layerType || null,
  roadClass: _resolveRoadClass(c.road.layerId, c.road.properties),
  gradeHint: _resolveGradeHint(c.road.layerId, c.road.properties),
  directionHint: _resolveDirectionHint(c.road.properties),
  flowSign: actor.flowSign,
  baseHeadingDeg: actor.baseHeadingDeg,
  travelHeadingDeg: actor.travelHeadingDeg,
  laneSide: actor.laneSide,
  laneOffsetM: actor.laneOffsetM,
  scale: actor.scale,
  roadLengthM: Math.round(actor.meta.total),
  spawnMode: actor.spawnMode,
  spawnDistanceFromHeroM: Math.round(c.heroDistanceM),
  sampledPointCount: actor.pts.length,
  createdAtMs: _now(),
};
```

---

## 4. Expose Road Authority in `getState()`

File:

```text
wall/systems/traffic/ambientTrafficRuntime.js
```

In `getState()`, extend each actor summary with:

```js
roadAuthority: actor.roadAuthority || null,
```

Do not remove existing actor fields.

---

## 5. Add Runtime Road Authority Accessor

File:

```text
wall/systems/traffic/ambientTrafficRuntime.js
```

Add a public accessor:

```js
function getRoadAuthorityState() {
  return {
    version: VERSION,
    active: _active,
    enabled: _enabled,
    actorCount: _actors.length,
    actors: _actors.map(function (actor) {
      return {
        id: actor.id,
        state: actor.state,
        variant: actor.variant,
        actorType: actor.actorType,
        lat: actor._lastLat,
        lng: actor._lastLng,
        roadAuthority: actor.roadAuthority || null,
      };
    }),
  };
}
```

Add it to the exported API:

```js
getRoadAuthorityState: getRoadAuthorityState,
```

---

## 6. Add Debug Command: `ambientTrafficRoadAudit()`

File:

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Add this command under the ambient traffic debug commands:

```js
ambientTrafficRoadAudit: function () {
  var a = global.SBE && SBE.AmbientTrafficRuntime;
  if (!a || typeof a.getRoadAuthorityState !== 'function') {
    console.warn('[worldVehicles] ambientTrafficRoadAudit unavailable');
    return null;
  }

  var s = a.getRoadAuthorityState();
  console.group('[worldVehicles] ambientTrafficRoadAudit');
  console.log('active     :', s.active, '| enabled:', s.enabled, '| actorCount:', s.actorCount);

  var rows = (s.actors || []).map(function (actor) {
    var r = actor.roadAuthority || {};
    return {
      id: actor.id,
      state: actor.state,
      type: actor.actorType,
      variant: actor.variant,
      roadKey: r.roadKey || '-',
      layerId: r.layerId || '-',
      roadClass: r.roadClass || '-',
      gradeHint: r.gradeHint || '-',
      directionHint: r.directionHint || '-',
      flowSign: r.flowSign,
      laneSide: r.laneSide,
      laneOffsetM: r.laneOffsetM,
      scale: r.scale,
      roadLengthM: r.roadLengthM,
      spawnMode: r.spawnMode,
      heroDistM: r.spawnDistanceFromHeroM,
    };
  });

  if (rows.length) console.table(rows);
  else console.warn('[worldVehicles] no ambient actors to audit');

  console.groupEnd();
  return s;
},
```

---

## 7. Add Optional Debug Marker: `ambientTrafficRoadMarker(id)`

File:

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Add an optional one-actor road marker tool.

This should:

- accept an ambient actor ID
- read that actor from `getRoadAuthorityState()`
- create 3–6 temporary `road_audit_*` vehicle markers along the actor’s polyline if `pts` are exposed later
- if polyline points are not exposed yet, print the actor authority only and return `{ markerAdded:false, reason:'polyline_not_exposed' }`

For this first build, do **not** expose full polylines unless Claude can do it cleanly without bloating state.

Initial acceptable implementation:

```js
ambientTrafficRoadMarker: function (id) {
  var a = global.SBE && SBE.AmbientTrafficRuntime;
  if (!a || typeof a.getRoadAuthorityState !== 'function') {
    console.warn('[worldVehicles] ambientTrafficRoadMarker unavailable');
    return null;
  }
  var s = a.getRoadAuthorityState();
  var actor = (s.actors || []).find(function (x) { return x.id === id; });
  if (!actor) {
    console.warn('[worldVehicles] no ambient actor found for id:', id);
    return { markerAdded: false, reason: 'actor_not_found' };
  }
  console.group('[worldVehicles] ambientTrafficRoadMarker ' + id);
  console.log(actor.roadAuthority || actor);
  console.warn('[worldVehicles] road marker geometry deferred — authority metadata available');
  console.groupEnd();
  return { markerAdded: false, reason: 'polyline_not_exposed', actor: actor };
},
```

This gives immediate value without adding a new marker-rendering system yet.

---

# Execution Flow

```text
Mapbox rendered road feature
→ road polyline extraction
→ road metadata preserved
→ spawn candidate selected
→ ambient actor created
→ roadAuthority snapshot attached
→ actor moves normally
→ debug audit reads passive metadata
→ next spec uses audit to correct road/lane/scale policy
```

---

# Validation Checklist

Run terminal checks:

```bash
node --check wall/systems/traffic/ambientTrafficRuntime.js
node --check wall/systems/presentation/worldSpaceVehicleDebug.js
```

Run browser checks after Drive launch:

```js
_wos.debug.worldVehicles.ambientTrafficPresenceAudit()
_wos.debug.worldVehicles.ambientTrafficRoadAudit()
```

Expected:

- `ambientTrafficRoadAudit()` returns an object
- console table includes actor ID, road key, layer ID, road class, grade hint, lane side, lane offset, scale, road length, and spawn mode
- no actor behavior changes
- no added frame spam
- no startup freeze regression
- no vehicle orientation regression
- no hero route/camera/speed changes

---

# Acceptance Criteria

## Required

- Ambient actors expose road-authority metadata.
- Road metadata includes `layerId`, `roadClass`, `gradeHint`, `directionHint`, `laneSide`, `laneOffsetM`, `scale`, and `roadLengthM`.
- `_wos.debug.worldVehicles.ambientTrafficRoadAudit()` prints a readable table.
- Existing ambient traffic behavior remains unchanged.
- Startup remains non-blocking.
- `node --check` passes for changed files.

## Success Example

```text
id: ambient_traffic_014
roadClass: primary
gradeHint: surface
laneSide: -1
laneOffsetM: -3.22
scale: 1.78
spawnMode: edgeEntry
```

## Failure Example This Spec Should Reveal

```text
id: ambient_traffic_021
roadClass: motorway
gradeHint: tunnel
laneSide: 1
laneOffsetM: 3.4
scale: 1.71
```

This actor may explain a vehicle that appears to use an underpass or wrong layer. The spec only reveals the problem; it does not fix it yet.

---

# Deferred Systems

- `0602R_WOS_AmbientTrafficRoadSelectionPolicy_v1.0.0_BUILD`
- `0602S_WOS_AmbientTrafficLaneAuthority_v1.0.0_BUILD`
- `0602T_WOS_RoadClassScaleAuthority_v1.0.0_BUILD`
- `0602U_WOS_CustomActorPlacementTool_v1.0.0_BUILD`
- traffic collision
- traffic intelligence
- lane graph construction
- bridge/tunnel grade resolver

---

# Implementation Notes

This spec is intentionally diagnostic.

Do not allow Claude/Codex to “fix” lane logic inside this pass. Any lane, scale, bridge, or tunnel correction added here will blur the audit and make it harder to identify which rule actually caused the visible issue.

Keep the result boring:

```text
What road did this actor choose?
What class is it?
Is it surface, bridge, tunnel, or ramp?
Which side did it offset to?
How large did it render?
```

That is the whole build.

---

# Implementation Guide

- **Where**: Update `wall/systems/traffic/ambientTrafficRuntime.js` in road sampling, `_spawnCandidate(c)`, `getState()`, and the public export object. Update `wall/systems/presentation/worldSpaceVehicleDebug.js` near the existing ambient traffic debug commands.
- **What**: Run `node --check wall/systems/traffic/ambientTrafficRuntime.js && node --check wall/systems/presentation/worldSpaceVehicleDebug.js`, then launch Drive and run `_wos.debug.worldVehicles.ambientTrafficRoadAudit()`.
- **Expect**: Drive behavior remains unchanged; audit output shows each ambient actor’s selected road layer, class, grade hint, lane side, offset, scale, road length, and spawn mode.
