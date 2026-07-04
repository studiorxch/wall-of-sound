# [BUILD] 0602J_WOS_TrafficOpposingFlowRuntime_v1.0.0

## Build Readiness

Status: `[BUILD]`

This spec is ready to send to Claude/Codex.

---

## Purpose

Create reliable moving traffic around the hero car without requiring collision intelligence yet.

The current debug traffic system proves that vehicles can:

- spawn
- render
- move along road polylines
- respect centralized depth policy
- face the correct direction

However, it is still debug traffic. It can interfere with the hero lane, create unwanted near-collisions, and force future logic before the system is ready.

This patch establishes a safer traffic rule:

```text
Opposing-flow traffic only.
```

Traffic should create life around the hero while preserving a clear forward path for the Drive camera.

---

## Core Doctrine

```text
The hero owns the forward lane.

Traffic may surround the hero.
Traffic may pass beside the hero.
Traffic may move against the hero.
Traffic must not block the hero.
```

This avoids needing collision, braking, lane changes, or traffic-law intelligence immediately.

---

## Current Context

Existing working systems:

- `WorldSpaceVehicleLayer`
- `HeroVehicleRuntime`
- `HeroVehicleRenderer`
- debug road traffic motion
- traffic discipline showcase
- centralized actor depth policy from `0602I`
- unified vehicle orientation from `0602F`, `0602G`, and `0602H`

Known current problems:

- debug traffic can still appear in unsafe hero path zones
- same-direction traffic creates immediate collision/camera problems
- crisscross traffic will require traffic rules later
- hero should not need to slow, pause, or change lanes yet

---

## Target Files

Primary expected file:

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional, only if strictly necessary:

```text
wall/systems/render/worldSpaceVehicleLayer.js
```

Prefer keeping this patch debug/runtime-side. Do not modify mesh builders unless absolutely required.

---

## Required API

Add:

```js
_wos.debug.worldVehicles.trafficOpposingFlow(count)
```

Default:

```js
count = 40
```

Add:

```js
_wos.debug.worldVehicles.trafficSafetyAudit()
```

Optional convenience alias:

```js
_wos.debug.worldVehicles.safeTraffic(count)
```

---

## Hero Forward Safety Corridor

Define a protected corridor ahead of the hero.

Default values:

```js
HERO_CORRIDOR_FORWARD_M = 60;
HERO_CORRIDOR_BACK_M = 8;
HERO_CORRIDOR_HALF_WIDTH_M = 8;
HERO_DIRECTION_REJECT_DEG = 45;
```

Meaning:

```text
Reject traffic that is:
- 0–60m ahead of hero
- within ±8m lateral lane width
- moving same/similar direction as hero
```

Traffic can exist behind the hero or off to the side, but should not occupy the forward camera path.

---

## Allowed Traffic Patterns

### Allowed Now

```text
opposing-flow traffic
parallel but offset traffic
background side traffic
```

### Explicitly Avoid For Now

```text
same-lane traffic ahead of hero
same-direction traffic directly in front of hero
intersection crisscross traffic near hero
traffic spawning under the camera nose
traffic forcing hero braking/collision logic
```

---

## Required Logic

### 1. Hero State Resolver

Add helper:

```js
_getHeroTrafficContext()
```

Returns:

```js
{
  active: boolean,
  lat: number,
  lng: number,
  headingDeg: number
}
```

Read from:

```js
SBE.HeroVehicleRuntime.getEntity()
```

If no active hero exists, fallback behavior may use map center but must report:

```text
heroActive: false
```

---

### 2. Corridor Math

Add helper:

```js
_projectRelativeToHero(hero, point)
```

Returns approximate metre-space coordinates relative to hero heading:

```js
{
  forwardM: number,
  lateralM: number,
  distanceM: number,
  bearingDeg: number,
  relativeHeadingDeg: number
}
```

Interpretation:

```text
forwardM > 0 = ahead of hero
forwardM < 0 = behind hero
lateralM = side offset from hero direction
```

Use simple local metre conversion. Full geodesic accuracy is not required for this debug runtime.

---

### 3. Traffic Rejection Rule

Add helper:

```js
_isInsideHeroForwardCorridor(hero, actorPoint, actorHeadingDeg)
```

Reject if:

```js
forwardM >= -HERO_CORRIDOR_BACK_M
forwardM <= HERO_CORRIDOR_FORWARD_M
Math.abs(lateralM) <= HERO_CORRIDOR_HALF_WIDTH_M
sameDirection === true
```

Where:

```js
sameDirection = angleDiff(hero.headingDeg, actorHeadingDeg) <= HERO_DIRECTION_REJECT_DEG
```

---

### 4. Opposing Flow Preference

When selecting road polylines and actor direction:

Prefer actors whose movement heading is roughly opposite the hero heading.

Define:

```js
opposingScore = angleDiff(hero.headingDeg, actorHeadingDeg)
```

Ideal:

```text
135°–225° relative to hero heading
```

Actors outside this range may still be used if they are safely outside the hero corridor.

---

### 5. Spawn Filter

When creating traffic actors:

Reject any actor whose starting position violates the hero forward corridor.

Reject any actor whose first 2 seconds of motion would enter the corridor.

Approximate future position using:

```js
futureDist = currentDist + speedMps * 2
```

This does not need full simulation. It only prevents obvious camera-path interference.

---

### 6. Runtime Safety Filter

During each RAF motion tick:

If an actor enters the hero forward corridor:

Preferred behavior:

```text
despawn and respawn elsewhere later
```

Simpler acceptable behavior:

```text
hide/remove actor immediately
```

Do not slow or move the hero.

Do not trigger collision logic.

The hero remains authoritative.

---

## Debug Report

`trafficOpposingFlow(count)` must print:

```text
requested
placed
heroActive
roadsUsed
opposingActors
sideActors
rejectedHeroCorridor
rejectedSameDirection
rejectedBuilding
removedDuringRuntime
```

`trafficSafetyAudit()` must print current safety state:

```text
heroActive
heroHeading
showcaseActorCount
actorsInsideForwardCorridor
sameDirectionAheadCount
safeActorCount
removedDuringRuntime
```

---

## Acceptance

Run:

```js
_wos.debug.worldVehicles.clearTrafficMotionShowcase()
_wos.debug.worldVehicles.trafficOpposingFlow(40)
_wos.debug.worldVehicles.trafficSafetyAudit()
```

Expected:

```text
Traffic moves visibly around the hero.
Hero lane ahead remains clear.
No same-direction traffic directly blocks hero.
Most nearby traffic moves opposite or offset from hero.
Traffic may be fewer than 40 if safety filters reject unsafe actors.
Hero does not need to slow, pause, or change lane.
No remount spam.
No render-path changes.
```

---

## Failure Conditions

Fail if:

```text
hero disappears
hero is forced to brake
hero drives through showcase traffic directly ahead
traffic spawns in front of hero in same lane
traffic becomes static again
trafficBeaconMode is required for normal traffic visibility
renderPassCount drops or remount spam returns
```

---

## Do Not Touch

Do not modify:

```text
WorldSpaceVehicleLayer remount logic
styledata debounce
modelMatrix transform
hero route
hero camera presets
hero speed/yield logic
vehicle mesh geometry
vehicle orientation
bridge/grade logic
Mapbox style
ActorDepthPolicy
```

---

## Relationship To Next Milestone

This spec creates the first reliable traffic runtime behavior.

The next milestone should be:

```text
0602K_WOS_ActorCreationAuthority_v1.0.0_BUILD
```

Purpose:

```text
Create a global registry/tool for authoring custom world actors.
```

That later supports:

- custom cars
- trucks
- bridge decks
- props
- billboards
- world fixtures
- manually placed WOS-owned structures

Do not combine `0602J` and `0602K`. Traffic reliability comes first. Actor authoring follows.

---

## Implementation Guide

- **Where**: Add debug/runtime logic to `wall/systems/presentation/worldSpaceVehicleDebug.js`, near the existing traffic motion helpers and `trafficDisciplineShowcase()` implementation.
- **What**: Run `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; if `worldSpaceVehicleLayer.js` is touched, also run `node --check wall/systems/render/worldSpaceVehicleLayer.js`.
- **Expect**: `_wos.debug.worldVehicles.trafficOpposingFlow(40)` produces moving nearby traffic that avoids the hero’s forward lane and does not require collision, braking, or hero camera intervention.
