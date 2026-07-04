# 0602K_WOS_AmbientTrafficRuntime_v1.0.0_BUILD

Status: [BUILD]

## Purpose

Create a persistent low-density ambient traffic runtime that starts naturally with Drive mode and keeps the world alive without creating collision, lane-blocking, or visual clutter.

This replaces the one-time console-only traffic showcase with a runtime-managed ambient traffic layer.

The goal is not traffic simulation yet.

The goal is:

```text
1–3 visible traffic actors near the hero, entering and leaving the scene naturally.
```

## Assumptions

- `SBE.WorldSpaceVehicleLayer` already supports multi-actor upserts and removals.
- `HeroVehicleRuntime.getEntity()` exposes the live hero position and heading.
- Debug traffic actors currently use `source: 'showcase-road'`.
- `trafficOpposingFlow()` proved visible traffic works.
- `WorldSpaceVehicleLayer` depth policy is centralized as of `0602I`.
- Hero vehicle rendering and underpass behavior are currently acceptable.

## Non-Goals

Do not build collision response.

Do not build lane-changing intelligence.

Do not alter the hero route.

Do not alter camera presets.

Do not alter Mapbox style.

Do not alter world-space transforms.

Do not spawn dense traffic clusters.

Do not require console commands for normal startup.

---

# Core Doctrine

Ambient traffic is atmospheric life, not a navigation authority.

It may:

- appear near the hero
- move along sampled road polylines
- recycle as the hero travels
- avoid the hero forward corridor
- avoid actor overlap at spawn time

It may not:

- block the hero lane
- force the hero to brake
- modify hero movement
- create traffic-law authority
- pretend to solve intersections
- generate dense simulation traffic

---

# Runtime Behavior

## Startup

Ambient traffic must start naturally when Drive mode starts.

Implementation target:

```text
heroVehicleRenderer.start()
```

After the WorldSpaceVehicleLayer is started/enabled, call:

```js
SBE.AmbientTrafficRuntime.start()
```

This call must be guarded and idempotent.

Example:

```js
var ambient = global.SBE && SBE.AmbientTrafficRuntime;
if (ambient && typeof ambient.start === 'function') {
  ambient.start();
}
```

When Drive stops, call:

```js
SBE.AmbientTrafficRuntime.stop()
```

Actors may be removed on stop.

---

# Actor Density

Ambient traffic must keep traffic intentionally sparse.

Canonical defaults:

```js
MAX_VISIBLE_ACTORS = 3;
MIN_VISIBLE_ACTORS = 1;
TARGET_VISIBLE_ACTORS = 2;
```

The runtime should attempt to maintain 1–3 actors visible near the hero.

No more than 3 ambient actors may be active at once unless debug options override this.

Actor IDs must use a dedicated prefix:

```text
ambient_traffic_001
ambient_traffic_002
ambient_traffic_003
```

Do not reuse `showcase_` IDs for production ambient traffic.

---

# Spawn Rules

## Hero Corridor Exclusion

Never spawn inside the hero forward corridor.

Use the existing corridor logic from `trafficOpposingFlow` as the basis:

```js
HERO_CORRIDOR_FORWARD_M = 60;
HERO_CORRIDOR_BACK_M = 8;
HERO_CORRIDOR_HALF_WIDTH_M = 8;
HERO_DIRECTION_REJECT_DEG = 45;
```

Reject any spawn that is:

- ahead of the hero within the corridor
- same-direction within the reject angle
- close enough to become a hero blocker within the next short motion window

Opposing and side traffic are preferred.

## Spawn Distance From Hero

Actors should enter the hero scene naturally.

Preferred spawn band:

```js
SPAWN_MIN_DISTANCE_M = 45;
SPAWN_MAX_DISTANCE_M = 140;
```

Do not spawn directly beside the hero unless no other point is available.

## Actor Separation

Reject any spawn within:

```js
MIN_ACTOR_SEPARATION_M = 28;
```

This is not collision. This is spawn hygiene.

No overlapping actors at creation.

## Building Rejection

Reuse existing building-hit checks.

Reject spawn points that query against:

- fill-extrusion layers
- building layers
- obvious non-road layers

---

# Entry / Exit Presentation

## No Hard Pop-In

Actors must not appear suddenly in the center of the scene.

Each actor should enter through a short fade-in / scale-in window.

Recommended lifecycle states:

```text
spawning → active → fadingOut → removed
```

Default timing:

```js
FADE_IN_MS = 1200;
FADE_OUT_MS = 800;
```

During `spawning`:

- opacity ramps from 0 to 1
- optional scale multiplier ramps from 0.85 to 1.0
- actor is already moving

During `fadingOut`:

- opacity ramps from 1 to 0
- actor continues moving
- actor is removed after fade completes

## Material Opacity Support

Add a helper in `WorldSpaceVehicleLayer` if needed:

```js
setActorOpacity(id, opacity)
```

It must:

- walk mesh children
- set material.transparent = true when opacity < 1
- set material.opacity
- preserve existing material color/depth policy
- avoid replacing materials

This helper must be optional-safe.

If opacity support becomes too invasive, defer opacity and use distance-only entry for v1.0.0. But the preferred path is opacity fade.

---

# Motion Rules

Ambient actors move along quality road polylines.

Use the existing quality road sampler from `trafficDisciplineShowcase` / `trafficOpposingFlow` as the source.

Default speed:

```js
AMBIENT_SPEED_MPS_MIN = 5;
AMBIENT_SPEED_MPS_MAX = 9;
```

Actors should loop or recycle at route end.

Preferred behavior:

- actor follows a polyline segment or short polyline path
- when leaving the hero scene, fade out
- recycle to a new valid spawn point

Do not ping-pong in normal ambient mode.

One-way looping only.

---

# Recycle Rules

Recycle an actor when any condition is true:

- actor is more than `DESPAWN_DISTANCE_M = 180` from hero
- actor leaves the viewport for more than `OFFSCREEN_GRACE_MS = 2500`
- actor enters the hero forward corridor
- actor comes within `MIN_ACTOR_SEPARATION_M` of another ambient actor
- actor path becomes invalid

Recycling means:

```text
fadeOut current actor → removeVehicle(id) → find new spawn → fadeIn new actor
```

Do not instantly teleport visible actors.

---

# API

Create:

```text
wall/systems/traffic/ambientTrafficRuntime.js
```

Expose:

```js
SBE.AmbientTrafficRuntime = {
  start,
  stop,
  restart,
  getState,
  setEnabled,
  setDensity,
  clear
};
```

## start()

Starts the runtime loop.

Must be idempotent.

## stop()

Stops the RAF loop and removes ambient actors unless called with `{ preserveActors: true }`.

## restart()

Stops and starts cleanly.

## getState()

Returns:

```js
{
  active,
  enabled,
  actorCount,
  targetCount,
  maxVisibleActors,
  heroDetected,
  lastSpawnAt,
  lastRecycleAt,
  spawnAttempts,
  spawnRejects,
  recycleCount,
  actors: []
}
```

## setDensity(count)

Clamp count between 0 and 3 by default.

Debug override may allow higher counts but must not run by default.

---

# Debug Commands

Add under:

```js
_wos.debug.worldVehicles
```

Commands:

```js
ambientTrafficStart()
ambientTrafficStop()
ambientTrafficRestart()
ambientTrafficState()
ambientTrafficDensity(count)
ambientTrafficClear()
```

Optional:

```js
ambientTrafficDebug(true|false)
```

Debug output must be grouped and concise.

No frame-by-frame console spam.

---

# Integration

## Script Loading

Register `ambientTrafficRuntime.js` in the same boot sequence as other traffic/world vehicle systems.

It must load after:

- `worldSpaceVehicleLayer.js`
- `heroVehicleRuntime.js`

It may load before or after debug helpers.

## Drive Start

Patch `heroVehicleRenderer.js`:

After WSL start/enable logic from `0602D`, call ambient traffic start.

## Drive Stop

When hero rendering stops, call ambient traffic stop.

---

# Error Handling

Runtime must fail quietly and safely when dependencies are missing.

Guard:

```js
if (!global.SBE) return false;
if (!SBE.WorldSpaceVehicleLayer) return false;
if (!SBE.HeroVehicleRuntime) return false;
```

If hero is missing:

- runtime stays active
- actor spawning pauses
- existing actors fade out or clear

If map is missing:

- spawn attempts are skipped
- state records `lastError: 'map_missing'`

If no valid roads are found:

- do not use grid fallback in production ambient mode
- leave actor count lower
- state records `lastError: 'no_valid_roads'`

No thrown errors in normal runtime.

---

# Acceptance Criteria

## Startup

After clicking Drive:

```js
_wos.debug.worldVehicles.ambientTrafficState()
```

Expected:

```js
active: true
heroDetected: true
actorCount: 1..3
```

No manual console call should be required to see traffic.

## Visual Density

At normal rooftop / drone view:

```text
1–3 traffic actors visible near the hero.
```

No clusters.

No wall of traffic.

No debug beacon blocks.

## Hero Safety

Traffic must not spawn in front of the hero in the same lane.

Expected:

```text
hero forward corridor stays clear.
```

## Entry Quality

Traffic should not pop into existence in the center of the frame.

Expected:

```text
actors appear from scene edges, side roads, or distance with fade-in.
```

## Recycling

As the hero travels:

```text
old traffic exits / fades out
new traffic appears naturally
actor count remains 1–3
```

## Console

No frame-by-frame logs.

No repeated spam.

Debug logs only when explicitly requested.

---

# Implementation Guide

- **Where**: Add `wall/systems/traffic/ambientTrafficRuntime.js`; patch `heroVehicleRenderer.js` Drive start/stop; optionally add `setActorOpacity(id, opacity)` to `wall/systems/render/worldSpaceVehicleLayer.js`; add debug commands in `wall/systems/render/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/traffic/ambientTrafficRuntime.js`, `node --check wall/systems/render/worldSpaceVehicleLayer.js`, `node --check wall/systems/render/worldSpaceVehicleDebug.js`, and `node --check wall/systems/render/heroVehicleRenderer.js`.
- **Expect**: Launching Drive starts ambient traffic automatically; 1–3 cars remain visible near the hero, fade/recycle naturally, avoid the hero forward corridor, avoid spawn overlap, and produce no console spam.
