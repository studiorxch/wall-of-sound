---
layout: spec
title: "Internal POV Camera Projection Repair"
date: 2026-06-05
doc_id: "0605P_WOS_InternalPOVCameraProjectionRepair_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "camera"
component: "internal_pov_camera_projection_repair"

type: "implementation-spec"
status: "approved"

priority: "critical"
risk: "medium"

classification: "presentation-camera-runtime-repair"

summary: "Repairs internal POV projection by treating the occupant anchor as the physical camera eye, computing a forward look target, using Mapbox FreeCamera when available, and hiding the occupied actor mesh while internal POV is active."

doctrine:
  - "Internal POV means occupying the actor"
  - "External camera means filming the actor"
  - "Mapbox center is a look-at target, not the camera eye"
  - "The occupied actor must not render as a full exterior object in internal POV"
  - "Do not fix projection failure with lens tuning"
  - "No actor truth mutation"
  - "No Mapbox style mutation"

depends_on:
  - "0605L_WOS_OccupantPOVCameraFramework_v1.0.0"
  - "0605N_WOS_TransportScopedPOVAuthority_v1.0.0"
  - "0605O_WOS_CameraLensControlPass_v1.0.0"
  - "occupantCameraModes.js"

enables:
  - "Future Foreground Anchor Pass"
  - "Future External Camera Rig Pass"
  - "Future Mirror Camera Layer"
  - "Future Camera Motion Texture Pass"

tags:
  - "camera"
  - "pov"
  - "internal"
  - "projection"
  - "freecamera"
  - "actor-hide"
  - "repair"
---

# 0605P_WOS_InternalPOVCameraProjectionRepair_v1.0.0_BUILD

## Purpose

Repair the difference between true internal POV and external camera framing.

The previous stack correctly separated:

```text
transport mode
occupant anchor
look direction
lens
terrain
```

but the final projection was still wrong.

The system used:

```text
Mapbox center = occupant anchor
```

That is incorrect.

In Mapbox, `center` is the look-at target, not the physical camera eye.

So the camera was still looking at/orbiting the actor instead of occupying the actor.

0605P fixes that.

---

## Core Problem

Internal POV should mean:

```text
viewer is inside or attached to the actor
```

External camera should mean:

```text
viewer is outside the actor, filming it
```

If Driver / Passenger / Rear Seat shows the full exterior car, then it is not internal POV.

It is still external observation.

---

## Critical Distinction

### Internal POV

```text
camera eye = occupant anchor
look target = point ahead of the anchor
actor mesh = hidden/suppressed
```

### External Camera

```text
camera position = outside actor
look target = actor or road context
actor mesh = visible
```

These must never be treated as the same projection path.

---

## Files Modified

Primary file:

```text
wall/systems/camera/occupantCameraModes.js
```

Documentation:

```text
README.md
```

No new UI layer is required.

No new lens profiles are required.

No new dropdowns are required.

---

## Implementation Summary

### 1. Mark Internal POV Requests

Internal requests must carry explicit markers:

```js
{
  pov: true,
  povInternal: true,
  eyeLng,
  eyeLat,
  eyeHeightM,
  lookTargetLng,
  lookTargetLat
}
```

The occupant anchor is treated as the eye, not the viewport center.

---

### 2. Compute Look Target

For internal POV, compute a look target ahead of the eye.

Required helper behavior:

```text
eye point + bearing + distanceM -> look target
```

Suggested distances:

```text
primary center/look target: 60-100m ahead
FreeCamera lookAtPoint: ~1000m ahead
```

The short target gives practical map-centering fallback.

The long target gives near-horizon forward gaze for FreeCamera.

---

### 3. Use FreeCamera When Available

If Mapbox supports FreeCamera:

```js
map.getFreeCameraOptions()
map.setFreeCameraOptions()
```

then internal POV should use it.

Required behavior:

```text
camera position = eyeLng / eyeLat / terrain + eyeHeightM
lookAtPoint = point far ahead of eye using view bearing
```

This is the true internal POV projection path.

---

### 4. Safe Fallback When FreeCamera Is Unavailable

If FreeCamera is unavailable, fallback must still not use center=anchor.

Fallback behavior:

```text
center = look target ahead of eye
bearing = view bearing
pitch = internal POV pitch
zoom = lens-adjusted zoom
```

This is not as correct as FreeCamera, but it is better than orbiting the actor.

---

### 5. Hide Occupied Actor Mesh

When internal POV engages:

```text
HeroVehicleRenderer.setHidden(true)
```

When internal POV disengages or switches to external:

```text
HeroVehicleRenderer.setHidden(false)
```

The occupied actor should not render as a full exterior car during internal POV.

This is required for:

```text
driver
passenger
rear seat
bus front
bus passenger
walker head
bike rider
ferry passenger
```

where a corresponding visible actor exists.

---

## Required Behavioral Rules

### Rule 1 — Internal POV never centers on the anchor

Do not submit:

```js
center: [anchor.lng, anchor.lat]
```

for internal POV.

That recreates the bug.

### Rule 2 — Internal POV hides the occupied actor

If the camera occupies the actor, the full exterior actor should not be visible.

Foreground silhouettes such as dashboard, handlebars, railing, or window frames are deferred to a later pass.

### Rule 3 — External cameras remain unchanged

External follow/lead/side/high must still show the actor.

Do not hide the actor for external views.

### Rule 4 — Lens control must not mask projection errors

Lens profiles may adjust zoom/pitch/bearing, but they must not compensate for the camera being physically outside the vehicle.

Projection is solved before lens tuning.

### Rule 5 — No truth mutation

Actor coordinates, headings, speed, routes, and source data are read-only.

---

## Projection Contract

Input:

```js
{
  lng,
  lat,
  bearing,
  pitch,
  zoom,
  eyeLng,
  eyeLat,
  eyeHeightM,
  povInternal: true
}
```

Output behavior:

```text
FreeCamera path:
  camera eye uses eyeLng/eyeLat/elevation
  lookAtPoint uses projected target ahead

Fallback path:
  center uses projected target ahead
  bearing uses request bearing
  actor remains hidden
```

---

## Integration Points

### OccupantCameraModes

Modify internal compose path only.

Internal flow:

```text
resolve actor
-> resolve occupant anchor
-> build eye request
-> apply lens
-> apply terrain
-> submit internal projection
-> hide occupied actor
```

External flow:

```text
legacy/external preset
-> actor visible
```

---

## Debug / State Requirements

`OccupantCameraModes.getState()` should expose enough to verify:

```js
{
  active,
  kind,
  lastRequest: {
    povInternal,
    eyeLng,
    eyeLat,
    lookTargetLng,
    lookTargetLat,
    lensApplied,
    terrainAware
  },
  actorHidden,
  projectionPath
}
```

Accepted projection path values:

```text
freecamera
fallback_center_ahead
external_legacy
```

---

## Acceptance Tests

### T1 — Internal driver front hides actor

Expected:

```text
Driver / Internal / Front
actor hidden
povInternal:true
```

The full exterior car should not be visible.

### T2 — Internal front uses eye anchor

Expected:

```text
eyeLng/eyeLat equal occupant anchor world position
center/look target is ahead of eye
center is not equal to eye
```

### T3 — Internal left preserves same seat

Expected:

```text
Driver / Left
same eye anchor
bearing = heading - 90°
look target changes left
```

### T4 — Internal rear preserves same seat

Expected:

```text
Driver / Rear
same eye anchor
bearing = heading + 180°
look target changes rear
```

### T5 — FreeCamera path works

Expected when FreeCamera exists:

```text
projectionPath:"freecamera"
camera eye set at terrain + eyeHeightM
lookAtPoint ahead of eye
```

### T6 — Fallback path does not regress

Expected when FreeCamera does not exist:

```text
projectionPath:"fallback_center_ahead"
center uses look target ahead
center does not equal eye
```

### T7 — External follow shows actor

Expected:

```text
External / Follow
actor hidden = false
povInternal:false
```

### T8 — Internal ↔ External toggles actor visibility

Expected:

```text
Internal selected -> actor hidden
External selected -> actor visible
```

### T9 — Lens still applies

Expected:

```text
internal request carries lensApplied:true
lens profile still selected/suggested normally
```

### T10 — Terrain still applies

Expected:

```text
internal request carries terrainAware:true when terrain module available
```

### T11 — No actor truth mutation

Expected:

```text
actor lng/lat/heading/speed unchanged
```

### T12 — No anchor mutation

Expected:

```text
OccupantPOVCameraFramework anchor definitions unchanged
```

### T13 — No transport-selection mutation

Expected:

```text
TransportScopedPOVAuthority state unchanged except selected camera state
```

### T14 — No Mapbox style mutation

Expected:

```text
no new sources
no new layers
no style edits
```

### T15 — Debug/state structured

Expected:

```text
getState()
getStats()
debug helpers
return structured objects without throwing
```

---

## Non-Goals

This repair does not create:

```text
dashboard mesh
windshield frame
mirror rendering
steering wheel
bike handlebars
bus poles
ferry railing
camera bob
camera shake
external cinematic rigs
new lens profiles
new UI dropdowns
```

---

## Deferred Systems

### Foreground Anchor Pass

Adds simple visible context:

```text
dashboard silhouette
windshield frame
rearview mirror frame
bike handlebars
bus pole
ferry railing
```

### External Camera Rig Pass

Creates true external camera rigs:

```text
chase
front track
side track
rear chase
orbit
roadside
intersection
helicopter
```

### Camera Motion Texture Pass

Adds subtle movement:

```text
road vibration
body sway
bike lean
walking bob
boat drift
```

---

## Implementation Guide

- **Where**: Patch `wall/systems/camera/occupantCameraModes.js`; add internal-POV request markers, FreeCamera projection submit path, center-ahead fallback, and actor hide/show handoff. Update `README.md`.
- **What**: Run `node --check wall/systems/camera/occupantCameraModes.js`; then test Driver/Front, Driver/Left, Driver/Rear, External/Follow, and Internal↔External switching.
- **Expect**: Internal POV no longer shows the full exterior car; the eye is at the occupant anchor, the look target is ahead of the eye, FreeCamera is used when available, fallback never centers on the anchor, external cameras still show the actor, and no actor truth, anchor definitions, transport state, WSL payloads, or Mapbox style are mutated.
