---
layout: spec
title: "Actor Camera Shot Presets"
date: 2026-06-05
doc_id: "0605I_WOS_ActorCameraShotPresets_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "camera"
component: "actor_camera_shot_presets"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Creates reusable camera shot presets that can attach to any targetable actor including cars, buses, boats, bikes, walkers, and future transit systems."

depends_on:
  - "0605F_WOS_TransitCameraTargeting_v1.0.0"
  - "0605G_WOS_ArticulatedBusPresentationPass_v1.0.0"
  - "0605H_WOS_TransitStopDwellCuePass_v1.0.0"

enables:
  - "0605J_WOS_TransitEventBlockPartyPrototype_v1.0.0"
  - "Future Walker POV Systems"
  - "Future Maritime POV Systems"
---

# 0605I_WOS_ActorCameraShotPresets_v1.0.0_BUILD

## PURPOSE

Create reusable camera language.

Current system:

```text
camera follows actor
```

Desired system:

```text
camera follows actor
through a selected shot preset
```

This creates a cinematic vocabulary that works across the entire WOS ecosystem.

Not just buses.

Not just cars.

Any actor.

---

# CORE IDEA

Camera targeting answers:

```text
WHAT are we following?
```

Shot presets answer:

```text
HOW are we viewing it?
```

---

# FUTURE COMPATIBILITY

Must support:

```text
cars
buses
boats
bikes
walkers
subway trains
future creatures
```

No actor-specific assumptions.

---

# CAMERA FAMILY

## External

```text
external_follow
front_lead
rear_chase
left_side
right_side
top_down
high_civic
orbit_inspect
```

## Actor POV

```text
actor_pov
windshield
left_window
right_window
rear_window
roof_mount
bumper_front
bumper_rear
```

## Transit

```text
bus_front_window
bus_side_window
bus_rear_window
bus_door_side
bus_roof
articulated_joint_view
```

---

# WALKER COMPATIBILITY

A future walker should automatically inherit:

```text
head_pov
left_shoulder
right_shoulder
rear_follow
street_level
```

without changing the camera framework.

This is a major architectural requirement.

---

# AUTHORITY BOUNDARIES

## Owns

- camera shot definitions
- camera offsets
- camera framing presets
- shot switching
- shot metadata

## Reads

- TransitCameraTargeting
- actor presentation position
- actor heading
- actor velocity
- actor class

## Writes

- camera request payloads

## Forbidden

- actor mutation
- transit truth mutation
- selector mutation
- smoothing mutation
- Mapbox style mutation

---

# SHOT DEFINITION

```js
type CameraShotPreset = {
  id: string

  offsetX: number
  offsetY: number
  offsetZ: number

  lookAheadDistance: number

  pitch: number
  bearingOffset: number

  followStrength: number
}
```

---

# CAMERA GROUPS

## Cinematic

```text
smooth
slow
atmospheric
```

## Documentary

```text
stable
informational
```

## Inspection

```text
close
technical
```

---

# BUS SPECIFIC SHOTS

### Windshield

```text
inside front window
forward city view
```

### Left Window

```text
urban scenery
```

### Right Window

```text
curbside activity
```

### Rear Window

```text
city trailing behind
```

### Door Side

```text
stop arrival readability
```

### Articulated Joint

```text
view through bend section
```

---

# POV REQUIREMENTS

POV must never require:

```text
interior geometry
passengers
cockpits
```

Initial implementation:

```text
virtual camera anchor only
```

Future interiors can arrive later.

---

# PUBLIC API

```js
SBE.ActorCameraShotPresets

setShot(id)
getShot()

nextShot()
previousShot()

listShots()

applyShot(id)

getState()
getStats()

setEnabled()
setDebug()
```

---

# DEBUG COMMANDS

```js
_wos.debug.camera.listShots()

_wos.debug.camera.setShot(id)

_wos.debug.camera.nextShot()

_wos.debug.camera.previousShot()

_wos.debug.camera.cameraShotState()
```

---

# ACCEPTANCE TESTS

## T1

Loads safely.

## T2

Shots register.

## T3

External follow works.

## T4

Rear chase works.

## T5

Windshield works.

## T6

Left window works.

## T7

Right window works.

## T8

Rear window works.

## T9

Bus roof works.

## T10

Articulated joint works.

## T11

Shot switching deterministic.

## T12

Walker-compatible shots accepted.

## T13

No truth mutation.

## T14

No selector mutation.

## T15

No smoothing mutation.

## T16

No camera targeting mutation.

## T17

No Mapbox style mutation.

## T18

Debug commands work.

---

# NON-GOALS

This spec does not create:

```text
vehicle interiors
passengers
VR mode
driver simulation
subway interiors
boat interiors
walking simulation
```

---

# NEXT SPEC

```text
0605J_WOS_TransitEventBlockPartyPrototype_v1.0.0_BUILD
```

Purpose:

```text
compress meaningful activity
into a discoverable hero location
that can become a future real-world event.
```

---

# IMPLEMENTATION GUIDE

- Where: `wall/systems/camera/actorCameraShotPresets.js`
- What: `node --check wall/systems/camera/actorCameraShotPresets.js`
- Expect: Any targetable actor can be viewed through reusable cinematic and POV camera presets, including future walkers, boats, and transit vehicles.
