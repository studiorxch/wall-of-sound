# 🚦 SPEC STAGE

Stage: REVIEW  
Freeze Decision: REVIEW  
Action: Clarify traversal actor, camera, POV, speed, altitude, and cloud authority before expanding Drive/Walk/Bike.

# 0529_WOS_ActorPOVTraversalDoctrine_v1.0.0

## Purpose

Define the next traversal architecture review pass for WOS.

Current Flight traversal is finally useful enough to observe, but several concepts are still blurred:

```text
Is the user watching a plane?
Is the user riding a camera?
Is the camera itself an actor?
Can any actor become a POV?
How do hero vehicles fit into traversal?
```

This spec does not implement Drive, Walk, Bike, Clouds, or new observer modes yet.

It defines the conceptual boundary needed before those systems are added.

---

# Core Doctrine

## Actor and POV Must Be Separated

A traversal actor is the thing moving through the world.

A POV is the camera interpretation of that actor.

They are related, but not the same system.

```text
Actor = moving world entity
POV   = camera/viewpoint attached to or observing an actor
```

A plane may have a POV.
A car may have a POV.
A bird may have a POV.
A balloon may have a POV.
A camera drone may itself be an actor.

The camera is not always the actor.

But any actor may become a camera source.

---

# Required Vocabulary

Use WOS naming doctrine boundaries.

Preferred terms:

```text
Actor
Route
POV
Observer
Traversal
Camera
```

Avoid overloading:

```text
Mode
Preset
Tour
Chip
View
```

unless the UI truly requires them.

The user-facing UI may say simple words like Flight, Drive, Walk, Bike.
The internal architecture must remain explicit.

---

# Current State

The current navigation system uses:

```text
FROM = current map center
TO = typed destination
Launch = generated route
```

This is correct and must remain the active direction.

Current Flight is useful but still unclear because the experience can read as either:

```text
plane traversal
```

or:

```text
moving camera traversal
```

This ambiguity should be resolved through Actor + POV structure.

---

# Actor Model

Each moving hero entity should eventually resolve to:

```js
type TraversalActor = {
  id: string;
  actorType: 'aircraft' | 'car' | 'drone' | 'bird' | 'balloon' | 'pedestrian' | 'bicycle';
  routeId: string;
  currentPosition: { lat: number; lng: number; altitudeFt?: number };
  speedModel: TraversalSpeedModel;
  altitudeModel?: TraversalAltitudeModel;
  povProfiles: TraversalPOVProfile[];
}
```

Actor examples:

```text
Aircraft
Hero Car
Camera Drone
Bird
Balloon House
Pedestrian
Bicycle
```

---

# POV Model

A POV is a camera interpretation of an actor.

```js
type TraversalPOVProfile = {
  id: string;
  label: string;
  actorId: string;
  povType: 'forward' | 'rear' | 'side' | 'chase' | 'orbit' | 'drift' | 'overhead';
  offsetMeters?: { x: number; y: number; z: number };
  lookTarget?: 'actor' | 'route' | 'destination' | 'world_feature';
  smoothing: number;
}
```

Examples:

```text
Aircraft + Forward POV
Aircraft + Rear POV
Aircraft + Side POV
Car + Chase POV
Bird + Drift POV
Balloon + Overhead Drift POV
```

This lets WOS test new observer behaviors without confusing the transport system.

---

# Camera Doctrine

Camera systems are observability infrastructure.

They interpret traversal.

They do not define traversal truth.

Canonical rule:

```text
Actor owns movement truth.
POV owns camera interpretation.
```

The camera may observe an actor, follow an actor, ride an actor, or become an actor only when explicitly modeled as a camera-drone actor.

---

# Speed Authority

Current speed presets are too compressed for video use.

Current values:

```text
Slow   = 20x
Normal = 40x
Fast   = 80x
```

These are developer/test speeds, not viewer speeds.

New doctrine:

```text
1x = world truth / realtime
<1x = cinematic slow observation
>1x = time compression
```

Required control behavior:

```text
Speed [-] [current value] [+]
```

No cumbersome slider.

Suggested testing ladder:

```text
0.25x
0.5x
1x
2x
5x
10x
20x
40x
80x
```

UI may label these later, but HUD must expose exact values.

---

# Altitude Authority

Altitude must become explicit.

Current zoom-only thinking is insufficient.

HUD must expose:

```text
Altitude ft
Zoom
Pitch
Bearing
```

User-facing altitude control should be stepped:

```text
Altitude [-] [current ft / zoom] [+]
```

No freeform slider for this pass.

## Zoom Ceiling

For normal Flight traversal:

```text
maximum zoom-out ceiling = zoom 11
```

Anything lower than zoom 11 reads too much like satellite/space travel and weakens motion inertia.

Exception:

```text
Satellite / orbital presentation modes
```

These are not part of this pass.

---

# Altitude ↔ Zoom Mapping Investigation

Claude should report the current actual mapping between:

```text
altitudeFt
zoom
pitch
visual feel
```

Initial target references:

```text
Ground / approach:  zoom 15
Low flight:         zoom 14
City / helicopter:  zoom 13
Regional flight:    zoom 12
Airline cruise:     zoom 11
```

These are not final constants.
They are observation anchors.

---

# HUD Updates Required

The Traversal HUD should add readouts for:

```text
REAL TIME elapsed
SIM TIME elapsed
speed multiplier
altitude ft
zoom
pitch
bearing
actor type
POV type
```

Current HUD already exposes progress, elapsed, remaining, distance, speed, phase, zoom, pitch, and bearing.

Update it so elapsed time is not misleading.

Use:

```text
REAL  2m 13s
SIM   86m 03s
```

instead of only simulated elapsed.

---

# Cloud Authority Direction

Clouds should follow Reality-Anchored Interpretation.

Meaning:

```text
Real weather determines whether clouds exist.
WOS determines how those clouds are interpreted visually.
```

This is effectively real weather plus stylized presentation.

No fake cloud fill if the weather is clear.

If true weather says:

```text
clear sky
```

WOS renders clear sky.

If true weather says:

```text
scattered clouds
```

WOS renders stylized scattered cloud layers.

If true weather says:

```text
overcast
```

WOS renders a stylized overcast deck.

## Cloud Investigation Required

Do not implement clouds yet.

Investigate whether WOS can access:

```text
cloud cover percentage
cloud ceiling
cloud layer altitude
visibility
weather condition
```

for:

```text
current actor position
destination
route midpoint
```

---

# Drive / Hero Vehicle Direction

Do not implement full Drive yet.

Drive feasibility appears high because Flight has validated:

```text
route traversal
camera movement
world observation
HUD telemetry
actor rendering pattern
```

The first useful Drive test does not need full traffic simulation.

It needs:

```text
one hero car
```

A hero car should be treated as:

```text
Actor + Route + POV
```

not as traffic ecology.

Future Drive route should use road-aware route geometry.

Traffic can come later.

---

# Transport Status

Current visible transport statuses:

| Transport | Status |
|---|---|
| Flight | Active |
| Drive | Candidate / Experimental |
| Walk | Candidate / Experimental |
| Bike | Candidate / Experimental |
| Transit | Disabled |

Transit remains disabled because it requires schedule/GTFS-style routing rather than simple spatial routing.

Drive, Walk, and Bike should not silently divert to Flight.

If unavailable, they should clearly say unavailable.

---

# Required Claude Tasks

## Task 1 — Add stepped speed control

Add small step controls near navigation:

```text
Speed [-] [1x] [+]
```

Values:

```text
0.25x, 0.5x, 1x, 2x, 5x, 10x, 20x, 40x, 80x
```

Current 20x / 40x / 80x may remain available, but they should no longer define Slow / Normal / Fast.

---

## Task 2 — Add stepped altitude control

Add:

```text
Altitude [-] [current ft / zoom] [+]
```

Cap normal Flight zoom-out at:

```text
zoom 11
```

---

## Task 3 — Update HUD

Add:

```text
REAL elapsed
SIM elapsed
altitude ft
actor type
POV type
```

Keep existing:

```text
progress
remaining
distance
speed
phase
zoom
pitch
bearing
```

---

## Task 4 — Add actor/POV debug snapshot

Expose:

```js
_wos.debug.traversalDeck.actor()
_wos.debug.hud.snapshot()
```

Actor snapshot should return:

```js
{
  actorType: 'aircraft',
  povType: 'forward',
  speedMultiplier: 1,
  altitudeFt: 35000,
  zoom: 11,
  pitch: 45,
  routeDistanceKm: 9842
}
```

---

## Task 5 — Cloud feasibility note

Add code comments or debug report documenting available path for reality-anchored clouds.

No cloud rendering implementation in this patch.

---

## Task 6 — Hero vehicle feasibility note

Add comments or debug report documenting how a future hero car would fit:

```text
Actor = car
Route = road-aware geometry
POV = chase / rear / side / overhead
```

Do not build Drive yet.

---

# Success Criteria

User can launch a Flight route and adjust:

```text
speed
altitude
```

with simple step controls.

HUD shows enough information to determine:

```text
what feels too fast
what feels too high
what zoom feels watchable
what altitude corresponds to that view
```

No new dead controls.

No fake Drive.

No fake Clouds.

No new observer presets beyond documenting the Actor + POV model.

---

# Non-Goals

This patch does NOT:

```text
implement Drive
implement Walk
implement Bike
implement Transit
render clouds
add bird mode
add balloon mode
add observer mode selector
add presets/chips/tours
```

This patch exists to stabilize the traversal foundation before expansion.

---

# Implementation Guide

- **Where**: `wall/systems/presentation/traversalControlDeck.js`, `wall/systems/presentation/traversalHUD.js`, and any active flight camera/runtime file that currently owns zoom/pitch/speed application.
- **What**: Add stepped Speed and Altitude controls, expose actor/POV telemetry, split REAL vs SIM time in HUD, cap normal Flight zoom-out at `11`, and document cloud + hero vehicle feasibility without implementing them.
- **Expect**: User launches a Flight route, then adjusts speed and altitude live while HUD displays exact speed, altitude, zoom, pitch, bearing, actor type, POV type, real time, and sim time.
