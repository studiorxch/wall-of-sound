---
layout: spec
title: "Transit Camera Targeting"
date: 2026-06-05
doc_id: "0605F_WOS_TransitCameraTargeting_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "transit_camera_targeting"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Adds a camera-targeting layer for live transit actors, allowing WOS to follow assigned/selected buses while respecting bus-specific stop/start telemetry, stale states, and jump correction."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth remains real"
  - "Assignment creates intent"
  - "Camera follows presentation targets, not truth mutations"
  - "Bus follow is not car follow"

depends_on:
  - "0604H_WOS_MTABusRealtimeAdapter_v1.0.0"
  - "0604I_WOS_MTABusActorBridge_v1.0.0"
  - "0604K_WOS_BusPresentationSelector_v1.0.0"
  - "0604M_WOS_BusAssetPack_v1.0.0"
  - "0605A_WOS_TransitPresencePass_v1.0.0"
  - "0605B_WOS_BusMotionSmoothing_v1.0.0"
  - "0605C_WOS_TransitLiveryHooks_v1.0.0"
  - "0605D_WOS_CruiseMovementField_v1.0.0"
  - "0605E_WOS_TransitAssignmentAuthority_v1.0.0"

enables:
  - "0605G_WOS_ArticulatedBusPresentationPass_v1.0.0"
  - "0605H_WOS_TransitStopDwellCuePass_v1.0.0"
  - "0605I_WOS_HeroTransitShotPresets_v1.0.0"
  - "0605J_WOS_TransitEventBlockPartyPrototype_v1.0.0"

tags:
  - "transit"
  - "bus"
  - "camera"
  - "targeting"
  - "hero-bus"
  - "assignment"
  - "presentation"
---

# 0605F_WOS_TransitCameraTargeting_v1.0.0_BUILD

## PURPOSE

Create the first camera-targeting layer for live transit actors.

0605E made it possible to say:

```text
this bus matters
```

0605F makes it possible for the camera to care.

The purpose is to let WOS follow, frame, jump to, and inspect assigned buses while preserving the fact that buses are not hero cars.

A car can feel continuous.

A bus is telemetry-driven.

A bus can:

```text
stop
dwell
pause
jump between feed updates
become stale
disappear from the feed
reappear later
```

The camera must respect those behaviors instead of treating a bus like a constantly moving player vehicle.

---

# CURRENT BUILD CONTEXT

Current transit stack:

```text
0604G Feed Inventory          ✅
0604H Realtime Adapter        ✅
0604I Actor Bridge            ✅
0604J Fallback Renderer       ✅
0604K Presentation Selector   ✅
0604L Debug Labels            ✅
0604M Bus Asset Pack          ✅
0605A Transit Presence        ✅
0605B Bus Motion Smoothing    ✅
0605C Transit Livery Hooks    ✅
0605D Cruise Movement Field   ✅
0605E Assignment Authority    ✅
```

Current capability:

```text
real live buses
→ classified
→ visible
→ smooth
→ present
→ skinnable
→ assignable
```

Missing capability:

```text
camera-targetable
```

0605F adds:

```text
assigned bus
→ target
→ camera request
```

without creating:

```text
truth mutation
camera ownership takeover
route simulation
bus driving physics
```

---

# CORE DECISION

Transit camera targeting is not hero-car runtime.

It is a presentation camera request layer.

Canonical split:

```text
TruthActorRuntime owns bus truth.
BusMotionSmoothing owns presentation position.
TransitAssignmentAuthority owns intent.
TransitCameraTargeting owns target resolution and camera requests.
Viewport/Camera runtime owns actual camera execution.
```

0605F must not become a new camera engine.

It should submit safe camera requests into existing WOS camera/viewport authority where available, and otherwise expose resolved target data for debug and future camera integration.

---

# BUS-SPECIFIC CAMERA RULE

A bus follow is not a car follow.

Car follow assumption:

```text
target is continuously moving
```

Bus follow assumption:

```text
target may stop for valid reasons
```

Therefore:

```text
if bus moves → camera follows smoothly
if bus stops → camera holds composition
if bus dwells → camera remains stable
if bus jumps → camera eases correction
if bus goes stale → camera freezes briefly, then releases or degrades
if bus disappears → camera reports lost target and stops follow safely
```

No panic moves.

No fast camera snaps unless explicitly requested by `jumpToTarget()`.

---

# AUTHORITY BOUNDARIES

## This spec owns

- transit camera target resolution
- hero bus target selection
- vehicle target selection
- route target selection
- current target state
- target lost/stale/degraded state
- presentation target coordinate resolution
- camera request payload formation
- debug camera targeting commands

## This spec may read

- `SBE.TransitAssignmentAuthority`
- `SBE.TruthActorRuntime`
- `SBE.BusMotionSmoothing`
- `SBE.BusPresentationSelector`
- `SBE.MapboxViewportRuntime`
- selected bus actor metadata
- bus routeId / vehicleId / actorId
- smoothed presentation position
- current map zoom / pitch / bearing

## This spec may write

- its own targeting state
- camera request calls only, if a camera/viewport authority exists
- debug logs when enabled

## This spec must not write

- TruthActorRuntime
- actor metadata
- MTABusRealtimeAdapter rows
- MTABusActorBridge rows
- BusPresentationSelector state
- BusMotionSmoothing cache, except normal `observe(actor)` if required to obtain presentation position
- BusAssetResolver state
- TransitLiveryHooks assignments
- TransitAssignmentAuthority assignments
- TransitPresencePass state
- CruiseMovementField state
- WorldSpaceVehicleLayer payloads
- Mapbox sources
- Mapbox layers
- Studio
- maritime/AIS systems
- Citi Bike/subway systems

---

# NEW FILE

```text
wall/systems/transit/transitCameraTargeting.js
```

Register in:

```text
wall/index.html
```

after:

```text
wall/systems/transit/transitAssignmentAuthority.js
wall/systems/transit/busMotionSmoothing.js
```

before debug tooling.

---

# PUBLIC API

Expose:

```js
SBE.TransitCameraTargeting
```

Frozen API:

```js
start()
stop()
isActive()

followHeroBus()
followVehicle(vehicleId)
followRoute(routeId)
followActor(actorId)

jumpToTarget()
orbitTarget()
frameTarget()

clearTarget()

getTarget()
getTargetActor()
getTargetPosition()

renderOnce()
tick()

getState()
getStats()

setEnabled(enabled)
setDebug(enabled)
setMode(mode)
setDwellHoldMs(ms)
setStaleHoldMs(ms)
setCorrectionEase(value)
```

---

# TARGET MODES

Supported modes:

```js
"off"
"follow"
"frame"
"orbit"
"inspect"
```

## off

No camera requests.

## follow

Camera follows a target with smooth correction.

## frame

Camera positions to keep the target visible without aggressive tracking.

## orbit

Camera requests a slow orbit-style view around the bus target if camera runtime supports it.

If orbit support is unavailable, degrade to `frame`.

## inspect

Debug/authoring mode.

Keeps target centered enough for inspection and label/livery verification.

---

# TARGET TYPES

Supported target types:

```js
"hero_bus"
"vehicle"
"route"
"actor"
```

## hero_bus

Resolved from:

```js
SBE.TransitAssignmentAuthority.getHeroBus()
```

## vehicle

Resolved by exact vehicle id.

## route

Resolved by route id.

Route targeting should choose one bus on the route using deterministic priority:

```text
visible selected bus on route
→ nearest route bus to viewport center
→ freshest route bus
→ deterministic actorId
```

## actor

Resolved by exact actor id.

---

# TARGET STATE MODEL

```js
type TransitCameraTarget = {
  targetType: "hero_bus" | "vehicle" | "route" | "actor"
  targetKey: string | null

  actorId: string | null
  vehicleId: string | null
  routeId: string | null

  label: string | null
  assignmentId: string | null
  assignmentType: string | null

  status:
    | "none"
    | "resolved"
    | "following"
    | "stopped"
    | "dwelling"
    | "stale_hold"
    | "lost"
    | "camera_unavailable"

  lng: number | null
  lat: number | null
  presentationLng: number | null
  presentationLat: number | null

  speedMps: number | null
  headingDeg: number | null
  freshnessMs: number | null

  lastResolvedAt: number | null
  lastCameraRequestAt: number | null
}
```

---

# CAMERA REQUEST MODEL

0605F should form a camera request object.

```js
type TransitCameraRequest = {
  source: "transit-camera-targeting"
  targetType: string
  targetKey: string | null

  lng: number
  lat: number
  headingDeg: number | null

  mode: "follow" | "frame" | "orbit" | "inspect"

  zoom: number | null
  pitch: number | null
  bearing: number | null

  easeMs: number
  reason: string
}
```

This request may be submitted to an available camera/viewport runtime.

Allowed targets, in priority order if present:

```js
SBE.ViewportAuthority
SBE.AttentionGeography
SBE.MapboxViewportRuntime
```

If no supported camera target API exists:

```text
do not throw
store request in state
return camera_unavailable
```

---

# CAMERA EXECUTION POLICY

0605F may only call existing safe camera APIs.

It may not directly create Mapbox layers or mutate map style.

If using Mapbox fallback, allowed calls are limited to viewport movement calls such as:

```js
map.easeTo()
map.flyTo()
```

only when explicitly available and only in response to:

```text
jumpToTarget()
follow tick
frameTarget()
orbitTarget()
```

No direct style/source/layer mutation.

---

# BUS STOP / DWELL BEHAVIOR

Buses stop.

The camera must not treat a stopped bus as broken.

Define stopped when:

```js
speedMps === 0
or speedMps < 0.5
```

If stopped for less than:

```js
DEFAULT_DWELL_HOLD_MS = 90000
```

target status:

```text
dwelling
```

Camera behavior:

```text
hold composition
do not search for replacement
do not clear target
do not panic snap
```

If stopped longer than dwell hold:

```text
status remains dwelling
camera requests may reduce cadence
```

This is still valid bus behavior.

Do not clear a bus because it stopped.

---

# STALE TARGET BEHAVIOR

Default stale threshold:

```js
TARGET_STALE_MS = SBE.MTABusFeedConfig.MTA_BUS_STALE_AFTER_MS || 45000
```

When target stale:

```text
0–15s after stale threshold:
  status = stale_hold
  hold last known presentation coordinate

after staleHoldMs:
  status = lost
  stop follow unless mode is inspect
```

Default:

```js
DEFAULT_STALE_HOLD_MS = 15000
```

---

# TELEMETRY JUMP BEHAVIOR

If the target position jumps more than:

```js
JUMP_DISTANCE_M = 120
```

between ticks:

```text
do not snap camera immediately in follow mode
ease correction over longer duration
```

Default correction:

```js
JUMP_CORRECTION_EASE_MS = 1800
```

Manual `jumpToTarget()` may snap/ease aggressively.

---

# PRESENTATION POSITION RESOLUTION

The camera should prefer smoothed presentation position:

```js
SBE.BusMotionSmoothing.getPresentationPosition(actorId)
```

Flow:

```text
actor truth position
→ observe actor in BusMotionSmoothing if available
→ read presentation position
→ fall back to truth position
```

Truth actor coordinates are never modified.

---

# ROUTE TARGET RESOLUTION

`followRoute(routeId)` is not a route camera system.

It picks one representative bus on that route.

Priority:

```text
1. If BusPresentationSelector selected a bus on route, use the highest-ranked selected actor.
2. Else choose route bus nearest viewport center.
3. Else choose freshest route bus.
4. Tie-break actorId ascending.
```

Route follow may re-resolve periodically if the selected route actor disappears or becomes stale.

It should not rapidly jump between buses.

Default route retarget delay:

```js
ROUTE_RETARGET_MIN_MS = 30000
```

---

# HERO BUS TARGET RESOLUTION

`followHeroBus()` resolves from:

```js
SBE.TransitAssignmentAuthority.getHeroBus()
```

If no hero bus exists:

```text
return ok:false
lastError:'no_hero_bus'
```

Do not assign a hero bus automatically.

Hero assignment belongs to 0605E.

---

# ARTICULATED BUS CONSIDERATION

0605F does not implement articulated segment following.

However, camera targeting must be ready for articulated buses.

For articulated buses:

```text
camera target remains the lead/front actor position
```

Future:

```text
0605G_WOS_ArticulatedBusPresentationPass_v1.0.0_BUILD
```

may expose a front/rear/joint presentation envelope.

0605F should not attempt to solve bus articulation.

---

# STATE MODEL

```js
type TransitCameraTargetingState = {
  version: "1.0.0"
  active: boolean
  enabled: boolean
  debug: boolean

  mode: "off" | "follow" | "frame" | "orbit" | "inspect"

  targetType: string | null
  targetKey: string | null
  targetStatus: string

  targetActorId: string | null
  targetVehicleId: string | null
  targetRouteId: string | null

  lastTargetResolvedAt: number | null
  lastCameraRequestAt: number | null
  lastTickAt: number | null

  dwellHoldMs: number
  staleHoldMs: number
  correctionEase: number

  lastError: string | null
}
```

---

# STATS MODEL

```js
type TransitCameraTargetingStats = {
  resolves: number
  successfulResolves: number
  failedResolves: number

  cameraRequests: number
  cameraUnavailable: number

  staleHolds: number
  lostTargets: number
  dwellDetections: number
  jumpCorrections: number

  followHeroCalls: number
  followVehicleCalls: number
  followRouteCalls: number
  followActorCalls: number
}
```

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.transit
```

Required:

```js
transitCameraStart()
transitCameraStop()
transitCameraState()
transitCameraStats()

followHeroBus()
followBusVehicle(vehicleId)
followBusRoute(routeId)
followBusActor(actorId)

jumpToTransitTarget()
frameTransitTarget()
orbitTransitTarget()
clearTransitCameraTarget()

getTransitCameraTarget()
getTransitCameraPosition()

transitCameraMode(mode)
transitCameraDebug(on)
```

Optional aliases under:

```js
_wos.debug.worldActors
```

Allowed:

```js
followHeroBus()
followBusVehicle(vehicleId)
followBusRoute(routeId)
clearBusFollowCamera()
```

Avoid conflicting with 0604L label follow helpers.

If names conflict, prefix camera aliases with:

```text
cameraFollow...
```

---

# EXAMPLES

## Follow assigned hero bus

```js
_wos.debug.transit.assignHeroBus("7564", "Night Owl")
_wos.debug.transit.followHeroBus()
```

## Follow exact vehicle

```js
_wos.debug.transit.followBusVehicle("7564")
```

## Follow route

```js
_wos.debug.transit.followBusRoute("M15")
```

## Jump to current target

```js
_wos.debug.transit.jumpToTransitTarget()
```

## Clear camera target

```js
_wos.debug.transit.clearTransitCameraTarget()
```

---

# EXECUTION FLOW

Follow hero bus:

```text
debug command
→ TransitCameraTargeting.followHeroBus()
→ TransitAssignmentAuthority.getHeroBus()
→ find matching truth actor
→ observe/read BusMotionSmoothing presentation position
→ create TransitCameraTarget
→ create camera request
→ submit to camera authority if available
→ store state
```

Follow route:

```text
debug command
→ TransitCameraTargeting.followRoute(routeId)
→ resolve route candidates
→ prefer selector-selected candidate
→ fall back to nearest/freshest candidate
→ create target
→ submit camera request
```

Follow tick:

```text
tick()
→ re-resolve current target
→ classify status moving/stopped/dwelling/stale/lost
→ update presentation position
→ submit low-frequency follow camera request
```

---

# CADENCE POLICY

0605F should not run at render-frame cadence.

Default:

```js
FOLLOW_TICK_MS = 1000
```

Reason:

```text
bus telemetry is low cadence
camera requests should be stable
```

Manual calls may update immediately.

---

# PERFORMANCE REQUIREMENTS

```text
no full actor scan per animation frame
scan cap 6000
cache current target
route retarget no faster than 30s
no DOM creation
no Mapbox layer/source creation
no WSL calls
no per-frame allocation storms
```

---

# ZERO / FAILURE REASONS

Use explicit vocabulary:

```js
type TransitCameraTargetFailureReason =
  | "disabled"
  | "assignment_authority_unavailable"
  | "actor_runtime_unavailable"
  | "map_unavailable"
  | "camera_authority_unavailable"
  | "no_hero_bus"
  | "vehicle_not_found"
  | "route_not_found"
  | "actor_not_found"
  | "invalid_target"
  | "target_stale"
  | "target_lost"
  | "unknown";
```

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.TransitCameraTargeting exists
no actors required
no map required
no crash
```

## T2 — Lifecycle

Expected:

```text
start() active true
stop() active false
```

## T3 — Follow hero bus

Given 0605E hero assignment:

```text
followHeroBus() resolves hero vehicle
targetType:'hero_bus'
targetStatus:'resolved' or 'following'
```

## T4 — No hero bus

Expected:

```text
followHeroBus() ok:false
lastError:'no_hero_bus'
```

## T5 — Follow vehicle

Given matching vehicle id:

```text
followVehicle(vehicleId) resolves exact bus actor
```

## T6 — Vehicle missing

Expected:

```text
ok:false
lastError:'vehicle_not_found'
```

## T7 — Follow route

Given route buses:

```text
followRoute(routeId) resolves one representative bus
```

## T8 — Route target deterministic

Given equal route candidates:

```text
same actor selected across repeated calls
```

## T9 — Follow actor

Given actor id:

```text
followActor(actorId) resolves exact actor
```

## T10 — Presentation position preferred

Given BusMotionSmoothing available:

```text
getTargetPosition() returns smoothed coordinates
```

## T11 — Truth fallback

Given smoothing absent/disabled:

```text
getTargetPosition() returns truth coordinates
```

## T12 — Bus stop/dwell handling

Given speed <0.5:

```text
targetStatus:'dwelling'
target is not cleared
camera does not panic snap
```

## T13 — Stale hold

Given stale target:

```text
targetStatus:'stale_hold'
last known position retained
```

## T14 — Lost target

Given stale beyond staleHoldMs or disappeared:

```text
targetStatus:'lost'
follow stops safely
```

## T15 — Jump correction

Given large telemetry jump:

```text
jumpCorrections increments
camera request uses correctionEase
```

## T16 — Camera unavailable

Given no camera authority:

```text
target still resolves
lastError:'camera_authority_unavailable'
no throw
```

## T17 — Jump to target

Expected:

```text
jumpToTarget() emits immediate camera request
```

## T18 — Frame target

Expected:

```text
frameTarget() emits frame-mode camera request
```

## T19 — Orbit target fallback

If orbit unsupported:

```text
orbitTarget() degrades to frame
```

## T20 — No truth mutation

Expected:

```text
actor object unchanged
TruthActorRuntime unchanged
```

## T21 — No assignment mutation

Expected:

```text
TransitAssignmentAuthority assignments unchanged
```

## T22 — No selector mutation

Expected:

```text
BusPresentationSelector state unchanged
```

## T23 — No smoothing mutation beyond observe/read

Expected:

```text
No external smoothing records written except normal observe(actor)
```

## T24 — No WSL mutation

Expected:

```text
no upsertVehicle/removeVehicle calls
```

## T25 — No Mapbox mutation

Expected:

```text
no new sources
no new layers
```

## T26 — Debug commands work

Expected:

```text
transitCameraState()
followHeroBus()
followBusVehicle()
followBusRoute()
jumpToTransitTarget()
clearTransitCameraTarget()
```

return structured data without throwing.

---

# NON-GOALS

This spec does not create:

```text
articulated bus bending
bus stop rendering
bus stop arrivals UI
route schedule UI
passenger simulation
graffiti system
sponsored wraps
subway graffiti
Citi Bike rendering
new camera engine
new Mapbox style
gameplay driving controls
```

---

# DEFERRED SYSTEMS

## 0605G — Articulated Bus Presentation Pass

Front/rear segment and joint behavior for two-piece buses.

## 0605H — Transit Stop / Dwell Cue Pass

Visual stop/dwell cues, door-light hints, pause state readability.

## 0605I — Hero Transit Shot Presets

Reusable cinematic views for assigned transit actors.

## 0605J — Event Block Party Prototype

Compressed Hero Location / pop-up event prototype.

---

# NEXT SPEC

Recommended next:

```text
0605G_WOS_ArticulatedBusPresentationPass_v1.0.0_BUILD
```

Reason:

```text
camera targeting can follow buses now
but articulated buses need proper visual body behavior before close shots look correct
```

Alternative:

```text
0605H_WOS_TransitStopDwellCuePass_v1.0.0_BUILD
```

if stop/pause readability feels more urgent than articulated bus modeling.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/transit/transitCameraTargeting.js`; register it in `wall/index.html` after `transitAssignmentAuthority.js` and `busMotionSmoothing.js`; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/transit/transitCameraTargeting.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: WOS can follow a hero bus, exact bus vehicle, route representative, or bus actor; stopped buses hold composition instead of being treated as broken; stale/lost targets degrade safely; no truth, assignment, selector, smoothing, WSL, or Mapbox style mutation occurs.
