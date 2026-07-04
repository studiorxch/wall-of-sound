---
layout: spec
title: "Occupant Camera Modes"
date: 2026-06-05
doc_id: "0605M_WOS_OccupantCameraModes_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "camera"
component: "occupant_camera_modes"

type: "implementation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-camera-runtime"

summary: "Adds user-selectable occupant camera modes that compose the 0605L anchor resolver with the existing 0605I/0605K camera stack so WOS can switch between driver, passenger, rear-seat, bus-front, walker-head, bike-rider, and ferry-passenger POVs."

doctrine:
  - "Occupancy before lens"
  - "Anchor answers where the viewer sits"
  - "Shot preset answers how the viewer looks"
  - "Terrain answers how the world rises"
  - "Mode switching must be visible"
  - "No actor truth mutation"
  - "No Mapbox style mutation"

depends_on:
  - "0605I_WOS_ActorCameraShotPresets_v1.0.0"
  - "0605K_WOS_TerrainAwareActorCamera_v1.0.0"
  - "0605K.1_WOS_CameraShotSelectorUI_v1.0.0"
  - "0605L_WOS_OccupantPOVCameraFramework_v1.0.0"

enables:
  - "0605N_WOS_CameraLensControlPass_v1.0.0"
  - "Future Foreground Anchor Pass"
  - "Future Mirror Camera Layer"
  - "Future Ride Video Proof Run"

tags:
  - "camera"
  - "occupant"
  - "pov"
  - "driver"
  - "bus"
  - "walker"
  - "bike"
  - "ferry"
  - "runtime"
---

# 0605M_WOS_OccupantCameraModes_v1.0.0_BUILD

## PURPOSE

Make occupant POVs selectable and visible at runtime.

0605L created the anchor framework:

```text
Where is the viewer sitting?
```

0605M turns those anchors into usable camera modes:

```text
Driver Seat
Passenger Seat
Rear Seat
Bus Front
Walker Head
Bike Rider
Ferry Passenger
```

This is a runtime bridge.

It does not create new lens behavior.

It does not tune FOV.

It does not add interiors.

It composes:

```text
actor target
→ occupant anchor
→ existing shot camera request
→ terrain-aware enhancement
→ viewport
```

---

# CORE PROBLEM

The system now has proper occupant anchors, but the runtime still primarily exposes shot names such as:

```text
windshield
left_window
right_window
rear_window
bus_front_window
street_level
```

Those names are view directions, not occupant modes.

0605M adds a cleaner user-facing mode layer:

```text
I am the driver
I am the passenger
I am in the rear seat
I am at the bus front
I am walking
I am biking
I am on the ferry
```

---

# CORE DECISION

0605M owns mode selection only.

It does not own:

```text
actor truth
anchor definitions
terrain sampling
lens control
camera smoothing
vehicle rendering
Mapbox style
```

---

# NEW FILE

Preferred:

```text
wall/systems/camera/occupantCameraModes.js
```

Register in:

```text
wall/index.html
```

after:

```text
wall/systems/camera/occupantPOVCameraFramework.js
```

and before camera debug bindings when possible.

---

# PUBLIC API

Expose:

```js
SBE.OccupantCameraModes
```

Frozen API:

```js
setMode(modeId)
getMode()
listModes()
getModeDef(modeId)

applyMode(modeId)
reapply()

start()
stop()
isActive()
disengage()

setEnabled(on)
setDebug(on)

getState()
getStats()
```

---

# MODE REGISTRY

Required modes:

```js
driver
passenger
rear_seat
left_window
right_window
rear_window
bus_front
bus_passenger
walker_head
bike_rider
ferry_passenger
```

Mode definitions:

```js
{
  id: "driver",
  label: "Driver",
  actorClasses: ["car"],
  anchorId: "driver_seat",
  viewBearingOffsetDeg: 0,
  pitch: 82,
  zoom: 18,
  defaultShotId: "windshield"
}
```

Canonical mapping:

| Mode | Anchor | View Direction |
|---|---|---|
| driver | driver_seat | forward |
| passenger | front_passenger | forward |
| rear_seat | rear_seat | forward |
| left_window | left_window_view | left |
| right_window | right_window_view | right |
| rear_window | rear_window_view | rear |
| bus_front | bus_front_window | forward |
| bus_passenger | bus_passenger | side/forward |
| walker_head | walker_head | forward |
| bike_rider | bike_rider | forward |
| ferry_passenger | ferry_passenger | forward |

---

# REQUEST COMPOSITION

0605M should resolve the active target actor, then resolve an occupant anchor.

Request order:

```text
1. resolve target actor
2. resolve occupant anchor
3. form camera request from anchor world lng/lat
4. apply view direction from mode
5. terrain-enhance request through 0605K
6. submit through existing camera path
7. maintain engagement until disengaged or legacy camera mode selected
```

Use 0605L for anchor:

```js
SBE.OccupantPOVCameraFramework.resolveAnchor(actor, mode.anchorId)
```

Use 0605K when available:

```js
SBE.TerrainAwareActorCamera.enhanceRequest(request)
```

Do not modify 0605L anchors.

Do not modify 0605I shot definitions.

---

# TARGET RESOLUTION

Target resolution should mirror the repaired 0605I behavior:

1. active `TransitCameraTargeting` target
2. active `HeroVehicleRuntime` entity/state
3. future actor target hook if available

If no target:

```js
{ ok:false, reason:"no_target" }
```

No throw.

---

# CAMERA REQUEST

Suggested request shape:

```js
{
  source: "occupant-camera-modes",
  modeId,
  anchorId,
  actorId,
  actorType,
  vehicleClass,

  lng,
  lat,
  offsetZ,

  headingDeg,
  bearing,
  pitch,
  zoom,

  pov: true,
  reason: "occupant:" + modeId
}
```

Bearing rules:

```text
forward = heading
left = heading - 90
right = heading + 90
rear = heading + 180
```

Normalize bearing to 0–360.

---

# ENGAGEMENT MODEL

Like 0605K.2B, occupant modes must own the viewport while active.

Required:

```text
applyMode(mode)
→ engage occupant mode
→ per-frame re-resolve target
→ per-frame re-resolve anchor
→ per-frame submit/jump camera
```

Legacy camera modes must disengage occupant modes.

If `ActorCameraShotPresets` is engaged, occupant mode should either:

```text
disengage ActorCameraShotPresets first
```

or clearly report:

```js
reason:"shot_camera_engaged"
```

Preferred:

```text
occupant mode supersedes shot preset mode
```

because occupant modes are more specific.

---

# UI INTEGRATION

Patch existing CAM dropdown or camera selector.

Add a new group:

```text
Occupant
  Driver
  Passenger
  Rear Seat
  Left Window
  Right Window
  Rear Window
  Bus Front
  Bus Passenger
  Walker Head
  Bike Rider
  Ferry Passenger
```

Values must be canonical mode ids:

```text
driver
passenger
rear_seat
left_window
right_window
rear_window
bus_front
bus_passenger
walker_head
bike_rider
ferry_passenger
```

Legacy options remain unchanged.

Existing shot options may remain, but occupant modes are the preferred test surface for internal POV.

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.camera
```

Required:

```js
occupantModes()
occupantModeState()
occupantModeStats()
occupantMode(modeId)
occupantModeApply(modeId)
occupantModeDisengage()
occupantModeReapply()
```

Proof helpers:

```js
driverPOVProof()
passengerPOVProof()
rearSeatPOVProof()
busFrontPOVProof()
walkerPOVProof()
bikePOVProof()
ferryPOVProof()
```

---

# FAILURE VOCABULARY

Use:

```text
disabled
invalid_mode
no_target
anchor_framework_unavailable
anchor_resolve_failed
terrain_unavailable
camera_unavailable
map_unavailable
unknown
```

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.OccupantCameraModes exists
no map required
no crash
```

## T2 — Mode registry present

Expected all required modes exist:

```text
driver
passenger
rear_seat
left_window
right_window
rear_window
bus_front
bus_passenger
walker_head
bike_rider
ferry_passenger
```

## T3 — Driver mode resolves driver anchor

Expected:

```text
applyMode("driver")
uses anchorId:"driver_seat"
```

## T4 — Passenger mode resolves passenger anchor

Expected:

```text
anchorId:"front_passenger"
```

## T5 — Rear seat mode resolves rear anchor

Expected:

```text
anchorId:"rear_seat"
```

## T6 — Left/right window differ

Expected:

```text
left_window bearing differs from right_window
left/right lateral anchor positions differ
```

## T7 — Rear window faces backward

Expected:

```text
bearing differs from driver by ~180°
```

## T8 — Bus front mode resolves bus front anchor

Expected:

```text
anchorId:"bus_front_window"
vehicleClass:"bus"
```

## T9 — Walker mode resolves walker head

Expected:

```text
anchorId:"walker_head"
heightM around 1.65
```

## T10 — Bike mode resolves rider anchor

Expected:

```text
anchorId:"bike_rider"
heightM around 1.55
```

## T11 — Ferry mode resolves passenger deck

Expected:

```text
anchorId:"ferry_passenger"
heightM around 4.00
```

## T12 — Runtime engagement loop active

Expected:

```text
applyMode(mode)
isActive() true
camera follows moving actor per-frame
```

## T13 — Legacy camera mode disengages occupant mode

Expected:

```text
select follow/lead/side/high
OccupantCameraModes.isActive() false
legacy camera resumes
```

## T14 — Shot preset conflict handled

Expected:

```text
if ActorCameraShotPresets is engaged
occupant mode takes ownership or cleanly reports conflict
no camera fight
```

## T15 — Terrain integration preserved

Expected:

```text
request passes through TerrainAwareActorCamera when available
```

## T16 — No actor truth mutation

Expected actor object unchanged.

## T17 — No anchor mutation

Expected `OccupantPOVCameraFramework` anchor definitions unchanged.

## T18 — No shot definition mutation

Expected `ActorCameraShotPresets` definitions unchanged.

## T19 — No WSL mutation

Expected no vehicle upsert/remove from this system.

## T20 — No Mapbox style mutation

Expected:

```text
no new sources
no new layers
no style edits
```

## T21 — Debug commands work

Expected all `occupantMode*` commands return structured data without throwing.

---

# NON-GOALS

This spec does not create:

```text
FOV controls
lens controls
roll controls
mirror rendering
dashboard rendering
interior meshes
steering wheel
window frame
camera shake
head bob
event destinations
block party systems
pedestrian simulation
```

---

# DEFERRED SYSTEMS

## 0605N — Camera Lens Control Pass

Controls:

```text
FOV
zoom
pitch trim
bearing trim
roll
distance
composition bias
wide/normal/telephoto
```

## Future — Foreground Anchor Pass

Adds:

```text
dashboard silhouette
window frame
rearview mirror frame
bike handlebars
bus pole
boat railing
```

## Future — Mirror Camera Layer

Adds reflected/secondary camera surfaces.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/camera/occupantCameraModes.js`; register after `occupantPOVCameraFramework.js`; patch the CAM dropdown/controller to add an `Occupant` option group; update camera debug namespace with occupant mode commands.
- **What**: Run `node --check wall/systems/camera/occupantCameraModes.js` plus every touched JS file. Test `occupantModeApply("driver")`, `occupantModeApply("left_window")`, `occupantModeApply("rear_window")`, and `occupantModeApply("bus_front")`.
- **Expect**: The runtime can switch from external observation into true internal occupant POV modes, using 0605L anchors, preserving terrain awareness, disengaging cleanly back to legacy camera modes, and mutating no actor truth, shot definitions, WSL payloads, or Mapbox style.
