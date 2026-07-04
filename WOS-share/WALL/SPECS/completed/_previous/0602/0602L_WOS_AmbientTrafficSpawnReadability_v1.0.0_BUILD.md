# 0602L_WOS_AmbientTrafficSpawnReadability_v1.0.0_BUILD

Status: [BUILD]

## Purpose

Fix the first ambient-traffic runtime pass so traffic reads as believable background life instead of tiny ghost actors appearing too close to the hero.

This patch keeps the system sparse. It does not add collision, traffic intelligence, intersections, or hero yielding.

The goal is:

```text
1–3 readable vehicles enter from outside the hero scene,
match the hero’s visual scale,
avoid the hero corridor,
and recycle quietly without visible pop-in.
```

---

## Environmental Assumptions

- Existing runtime files are present:
  - `wall/systems/traffic/ambientTrafficRuntime.js`
  - `wall/systems/render/worldSpaceVehicleLayer.js`
  - `wall/systems/render/heroVehicleRenderer.js`
  - `wall/systems/presentation/worldSpaceVehicleDebug.js`
- `SBE.WorldSpaceVehicleLayer.upsertVehicle()` supports `scale`.
- `SBE.WorldSpaceVehicleLayer.setActorOpacity()` exists from `0602K`.
- Ambient actors use `source: 'showcase-road'` and inherit the actor depth policy from `0602I`.
- Hero remains authoritative. Ambient traffic must never slow, move, block, or reroute the hero.

---

## Current Problems

### 1. Traffic scale mismatch

Ambient traffic currently spawns with:

```js
scale: 1
```

That makes nearby traffic visually smaller than the hero. Traffic should sit in the same readable scale family as the hero, with only minor variant differences.

### 2. Ghost fade-in

Actors are currently upserted directly inside the visible scene at opacity `0`, then fade in.

That creates the feeling of cars materializing into existence.

Correct behavior:

```text
actors should enter from just outside the active screen / hero scene,
then become visible naturally as they move into view.
```

### 3. Spawn too close to hero

Some actors appear under, beside, or very near the hero because the current spawn band is too close and only checks the forward corridor, not a full hero exclusion bubble.

### 4. Clusters and overlap

The runtime allows actors to spawn too close together or on visually similar road segments. With only 1–3 cars, overlap is unacceptable.

---

# Build Scope

## Files to Modify

```text
wall/systems/traffic/ambientTrafficRuntime.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

## Files Not to Modify

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/render/heroVehicleRenderer.js
wall/index.html
```

No render-layer changes unless `setActorOpacity()` is missing or broken.

---

# Required Behavior

## A. Ambient traffic visual scale authority

Add scale constants to `ambientTrafficRuntime.js`:

```js
var AMBIENT_CAR_SCALE = 1.75;
var AMBIENT_TRUCK_SCALE = 1.85;
var AMBIENT_SCALE_VARIANCE = 0.08;
```

Add helper:

```js
function _resolveActorScale(actorType) {
  var base = actorType === 'box_truck' ? AMBIENT_TRUCK_SCALE : AMBIENT_CAR_SCALE;
  return base + _rand(-AMBIENT_SCALE_VARIANCE, AMBIENT_SCALE_VARIANCE);
}
```

Store resolved scale on actor at spawn:

```js
scale: _resolveActorScale(spec.actorType)
```

Use it in `_renderActor()`:

```js
scale: actor.scale
```

### Acceptance

- Ambient cars read close to hero-car scale.
- Trucks are slightly larger than cars, not gigantic.
- No actor uses raw `scale: 1` unless explicitly debug-forced.

---

## B. Offscreen entry spawn

Replace visible-scene fade-in as the primary entry method.

Add spawn bands:

```js
var SPAWN_ENTRY_MIN_SCREEN_MARGIN_PX = 80;
var SPAWN_ENTRY_MAX_SCREEN_MARGIN_PX = 260;
var SPAWN_ENTRY_MIN_HERO_DISTANCE_M = 90;
var SPAWN_ENTRY_MAX_HERO_DISTANCE_M = 220;
var HERO_EXCLUSION_RADIUS_M = 42;
```

Add helper:

```js
function _screenEntryBand(map, lng, lat) {
  // returns true only when projected point is outside the viewport,
  // but within the entry margin band.
}
```

Rules:

- Prefer spawn points just outside viewport bounds.
- Accept points inside viewport only as fallback when `allowVisibleFallback` is true and actor is at least `140m` from hero.
- Default production behavior must avoid visible fallback.

### Required projection logic

```text
inside viewport             → reject for normal spawn
outside by 0–80px           → reject, too close to edge / likely pop-in
outside by 80–260px         → accept, natural entry zone
outside beyond 260px        → reject, too far / may waste actor budget
```

### Acceptance

- Cars do not fade into existence in the center of the screen.
- Cars enter from map edges or just outside the camera scene.
- No actor appears underneath or next to the hero on spawn.

---

## C. Hero exclusion bubble

Add a full exclusion radius around the hero, separate from the forward corridor:

```js
function _isInsideHeroExclusion(hero, lat, lng) {
  return hero.active && _haversineM(hero.lat, hero.lng, lat, lng) < HERO_EXCLUSION_RADIUS_M;
}
```

Reject spawn if true.

Runtime recycle if true.

This is not collision. This is spawn hygiene.

### Acceptance

- No ambient actor spawns under or beside the hero.
- If camera/route motion causes an actor to drift too near the hero, it fades out.

---

## D. Stronger actor separation

Replace the single `MIN_ACTOR_SEPARATION_M = 28` with:

```js
var MIN_ACTOR_SEPARATION_M = 42;
var MIN_SAME_ROAD_SEPARATION_M = 70;
```

Store `roadKey` on each actor:

```js
roadKey: road.layerId + ':' + road.index
```

Reject a spawn when:

- any actor is within `42m`
- same-road actor is within `70m`

Runtime recycle when actors drift within `28m` of each other.

### Acceptance

- With density 2–3, cars rarely overlap visually.
- No clustered stack of ambient vehicles.
- Sparse traffic remains the default.

---

## E. Reduce default density pressure

Change defaults:

```js
var MAX_VISIBLE_ACTORS = 3;
var MIN_VISIBLE_ACTORS = 0;
var TARGET_VISIBLE_ACTORS = 2;
```

Runtime should not force a car when no clean spawn exists.

Correct behavior:

```text
0 clean actors is better than 1 bad actor.
```

### Acceptance

- Runtime may temporarily show 0 cars in tunnels, sparse roads, or unsuitable camera views.
- It should recover when a safe road entry becomes available.

---

## F. Fade only as edge blend, not teleport cover

Keep fade-in, but use it only for actors entering from outside the scene.

Reduce fade timing:

```js
var FADE_IN_MS = 500;
var FADE_OUT_MS = 600;
```

Add rule:

```text
opacity should already be near 1 by the time the actor is meaningfully visible.
```

Implementation detail:

- If actor is offscreen, allow opacity to advance normally.
- If actor becomes onscreen and opacity is below `0.65`, immediately clamp it to `0.65`.
- This prevents ghost cars in the visible road scene.

### Acceptance

- No translucent ghost vehicles crawling through the scene.
- Entry feels like an object crossing the camera boundary.

---

## G. Ambient traffic state diagnostics

Extend `getState()` actor records:

```js
{
  id,
  actorType,
  variant,
  state,
  lat,
  lng,
  flowSign,
  scale,
  roadKey,
  opacity,
  heroDistanceM,
  onScreen
}
```

Add debug command:

```js
_wos.debug.worldVehicles.ambientTrafficAudit()
```

It should print:

```text
active
heroDetected
actorCount
activeCount
targetCount
lastError
spawnAttempts
spawnRejects
recycleCount
actors: id / scale / opacity / heroDistanceM / onScreen / state
```

### Acceptance

- Debug output makes scale, opacity, and spawn distance visible.
- No frame-spam logs.

---

# Guardrails

Do not change:

- hero runtime
- hero route
- hero camera
- hero speed
- world-space transform math
- heading offset math
- vehicle mesh geometry
- Mapbox style
- actor depth policy
- traffic beacon mode
- manual `trafficOpposingFlow()` showcase

Ambient traffic is visual life only.

---

# Failure Conditions

Patch fails if:

- Ambient cars still spawn visibly beside or under the hero.
- Ambient cars remain much smaller than hero car.
- Cars fade in translucently inside the center of the screen.
- Actor count forces bad placements just to maintain density.
- Hero speed, route, heading, or camera changes.
- Console logs spam every frame.

---

# Verification Commands

```bash
node --check wall/systems/traffic/ambientTrafficRuntime.js
node --check wall/systems/presentation/worldSpaceVehicleDebug.js
```

Browser:

```js
_wos.debug.worldVehicles.ambientTrafficRestart()
_wos.debug.worldVehicles.ambientTrafficAudit()
_wos.debug.worldVehicles.ambientTrafficDensity(2)
```

Expected:

```text
actorCount: 0–3
scale: roughly 1.67–1.93
heroDistanceM: usually > 90m at spawn
opacity: near 1 once onscreen
no cars inside hero exclusion bubble
no obvious ghost fade-in in center of screen
```

---

# Implementation Guide

- **Where**: Edit `wall/systems/traffic/ambientTrafficRuntime.js` constants, spawn validation, actor records, `_renderActor()`, `_shouldRecycle()`, and `getState()`; edit `wall/systems/presentation/worldSpaceVehicleDebug.js` to add `ambientTrafficAudit()` near the existing ambient debug commands.
- **What**: Run `node --check wall/systems/traffic/ambientTrafficRuntime.js && node --check wall/systems/presentation/worldSpaceVehicleDebug.js`, then reload WOS and launch Drive.
- **Expect**: Ambient traffic starts naturally, keeps 0–3 readable cars near the journey, enters from offscreen/edge zones, avoids the hero bubble, and no longer appears as tiny ghost cars materializing nearby.
