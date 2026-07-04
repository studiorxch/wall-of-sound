---
layout: spec
title: "Transport-Scoped POV Authority"
date: 2026-06-05
doc_id: "0605N_WOS_TransportScopedPOVAuthority_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "camera"
component: "transport_scoped_pov_authority"

type: "implementation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-camera-ui-runtime"

summary: "Untangles transportation mode, actor traits, internal POVs, external cameras, and look direction so each transport mode exposes only valid viewpoint options while sharing canonical front/side/rear view directions."

doctrine:
  - "Transportation mode selects the actor family"
  - "Actor class owns available seats and speeds"
  - "POV mode owns inside vs outside"
  - "Look direction is shared: front, left, right, rear"
  - "UI must not expose impossible views"
  - "No actor truth mutation"
  - "No Mapbox style mutation"

depends_on:
  - "0605L_WOS_OccupantPOVCameraFramework_v1.0.0"
  - "0605M_WOS_OccupantCameraModes_v1.0.0"
  - "0605K_WOS_TerrainAwareActorCamera_v1.0.0"
  - "traversalControlDeck.js"

enables:
  - "0605O_WOS_CameraLensControlPass_v1.0.0"
  - "Future Foreground Anchor Pass"
  - "Future External Camera Rig Pass"
  - "Future Vehicle-Specific POV Tuning"

tags:
  - "camera"
  - "pov"
  - "transport"
  - "ui"
  - "drive"
  - "walk"
  - "bike"
  - "transit"
  - "ferry"
---

# 0605N_WOS_TransportScopedPOVAuthority_v1.0.0_BUILD

## PURPOSE

Separate transportation mode from POV selection.

The current CAM dropdown mixes unrelated concepts:

```text
transport mode
seat position
look direction
external camera
legacy camera preset
```

This creates impossible combinations such as:

```text
Drive → Bus Passenger
Drive → Ferry Passenger
Drive → Bike Rider
```

0605N fixes that by making the selected transportation mode control the available viewpoints.

---

# CORE DECISION

The hierarchy is:

```text
Transport Mode
  ↓
Actor Class
  ↓
View Family
  ↓
Anchor / External Rig
  ↓
Look Direction
```

Not:

```text
one global dropdown containing every possible camera idea
```

---

# CANONICAL VIEW FAMILIES

## Internal POV

The viewer is inside or attached to the actor.

Examples:

```text
driver seat
bus front
walker head
bike rider
ferry passenger
```

## External Camera

The viewer is outside the actor, filming it.

Examples:

```text
follow
lead
side
rear chase
orbit
drone
roadside
intersection
```

Internal and external views must not share the same option list.

---

# CANONICAL LOOK DIRECTIONS

All transport modes share the same simple direction vocabulary:

```text
front
left
right
rear
```

Meaning:

```text
front = actor heading
left  = actor heading - 90°
right = actor heading + 90°
rear  = actor heading + 180°
```

The selected actor class may disable directions that do not make sense.

---

# TRANSPORT MODES

Existing transport mode buttons remain the first-level selector:

```text
Flight
Drive
Walk
Bike
Transit
```

Add future support for:

```text
Ferry
Boat
```

The selected transport mode determines:

```text
actor class
default speed profile
default visual profile
available internal anchors
available external camera rigs
available look directions
```

---

# ACTOR-SPECIFIC SPEED + LOOK

Each actor type owns its movement character.

Examples:

| Transport | Actor Class | Speed Character | Visual Character |
|---|---|---|---|
| Drive | car | road-fast | hood/road/city |
| Transit | bus | road-heavy, stop/dwell | tall windshield, slow turns |
| Walk | walker | slow, body-height | human eye level |
| Bike | bike | medium, agile | handlebar/lean feel |
| Ferry | ferry | slow, water-wide | deck horizon |
| Flight | aircraft | high-speed, aerial | sky/terrain |

Speed belongs to transport/actor.

Look direction belongs to POV.

Lens belongs to future 0605O.

---

# REQUIRED NEW FILE

Preferred:

```text
wall/systems/camera/transportScopedPOVAuthority.js
```

Expose:

```js
SBE.TransportScopedPOVAuthority
```

Register after:

```text
occupantCameraModes.js
```

before UI/debug bindings.

---

# PUBLIC API

```js
setTransportMode(modeId)
getTransportMode()

setViewFamily(family)        // "internal" | "external"
getViewFamily()

setLookDirection(direction)  // "front" | "left" | "right" | "rear"
getLookDirection()

setInternalView(viewId)
getInternalView()

setExternalView(viewId)
getExternalView()

getAvailableInternalViews(modeId?)
getAvailableExternalViews(modeId?)
getAvailableLookDirections(modeId?, family?)

applyCurrentView()
applyView({ transportMode, family, internalViewId, externalViewId, lookDirection })

getState()
getStats()
setEnabled(on)
setDebug(on)
```

---

# TRANSPORT PROFILE REGISTRY

Required profile structure:

```js
{
  id: "drive",
  label: "Drive",
  actorClass: "car",
  defaultInternalView: "driver",
  defaultExternalView: "follow",
  defaultLookDirection: "front",
  speedProfile: {
    id: "road_fast",
    defaultSpeedMult: 0.5,
    minSpeedMult: 0.05,
    maxSpeedMult: 10
  },
  internalViews: [...],
  externalViews: [...],
  lookDirections: ["front", "left", "right", "rear"]
}
```

---

# REQUIRED TRANSPORT PROFILES

## Drive

```js
{
  id: "drive",
  actorClass: "car",
  defaultInternalView: "driver",
  defaultExternalView: "follow",
  internalViews: ["driver", "passenger", "rear_seat"],
  externalViews: ["follow", "lead", "side", "rear_chase", "drone"],
  lookDirections: ["front", "left", "right", "rear"]
}
```

## Transit

```js
{
  id: "transit",
  actorClass: "bus",
  defaultInternalView: "bus_front",
  defaultExternalView: "follow",
  internalViews: ["bus_front", "bus_passenger"],
  externalViews: ["follow", "lead", "side", "rear_chase", "drone"],
  lookDirections: ["front", "left", "right", "rear"]
}
```

## Walk

```js
{
  id: "walk",
  actorClass: "walker",
  defaultInternalView: "walker_head",
  defaultExternalView: "follow",
  internalViews: ["walker_head"],
  externalViews: ["follow", "lead", "side", "drone"],
  lookDirections: ["front", "left", "right", "rear"]
}
```

## Bike

```js
{
  id: "bike",
  actorClass: "bike",
  defaultInternalView: "bike_rider",
  defaultExternalView: "follow",
  internalViews: ["bike_rider"],
  externalViews: ["follow", "lead", "side", "rear_chase", "drone"],
  lookDirections: ["front", "left", "right", "rear"]
}
```

## Ferry

```js
{
  id: "ferry",
  actorClass: "ferry",
  defaultInternalView: "ferry_passenger",
  defaultExternalView: "follow",
  internalViews: ["ferry_passenger"],
  externalViews: ["follow", "lead", "side", "rear_chase", "drone"],
  lookDirections: ["front", "left", "right", "rear"]
}
```

## Flight

```js
{
  id: "flight",
  actorClass: "aircraft",
  defaultInternalView: "cockpit",
  defaultExternalView: "follow",
  internalViews: ["cockpit"],
  externalViews: ["follow", "lead", "side", "rear_chase", "drone", "orbit"],
  lookDirections: ["front", "left", "right", "rear"]
}
```

If cockpit anchor does not exist yet:

```text
hide cockpit from UI until supported
or return unsupported_internal_view
```

---

# INTERNAL VIEW COMPOSITION

Internal view = anchor + look direction.

Example:

```text
Drive
Internal
Driver
Front
```

resolves to:

```text
anchor: driver_seat
bearing: actor heading
```

Example:

```text
Drive
Internal
Driver
Left
```

resolves to:

```text
anchor: driver_seat
bearing: actor heading - 90°
```

Example:

```text
Transit
Internal
Bus Passenger
Right
```

resolves to:

```text
anchor: bus_passenger
bearing: actor heading + 90°
```

This replaces the current flat global modes:

```text
left_window
right_window
rear_window
```

as primary UI concepts.

Those can remain as compatibility aliases but should no longer drive the main UI.

---

# EXTERNAL VIEW COMPOSITION

External view = rig around actor + optional look direction.

Examples:

```text
Drive
External
Follow
```

```text
Drive
External
Side
```

```text
Transit
External
Drone
```

External views should not use occupant anchors.

They should use actor-relative external camera rigs.

If true external rigs do not exist yet:

```text
keep existing follow/lead/side/high behavior
but classify it explicitly as external legacy
```

Do not pretend they are internal POV.

---

# UI CHANGE

Replace the flat CAM dropdown with scoped controls.

Minimum viable UI:

```text
[Transport buttons stay unchanged]

CAM:
  Family: Internal | External

If Internal:
  POV: options from selected transport profile
  Look: Front | Left | Right | Rear

If External:
  Camera: options from selected transport profile
```

If only one internal option exists, auto-select it and hide the POV selector if needed.

---

# UI RULES

## Rule 1

Never show impossible options.

If `Drive` is selected, do not show:

```text
Bus Passenger
Bike Rider
Ferry Passenger
Walker Head
```

## Rule 2

Changing transport mode resets invalid camera selections to defaults.

Example:

```text
Transit → Bus Passenger
switch to Drive
→ Driver / Front
```

## Rule 3

Look direction persists when valid.

Example:

```text
Drive / Driver / Left
switch to Bike
→ Bike Rider / Left
```

## Rule 4

External and internal state are remembered separately.

Example:

```text
Internal: Driver / Front
External: Drone
```

Switching family should restore the last selection for that family.

---

# OCCUPANT CAMERA MODE INTEGRATION

0605M should become an implementation detail, not the main UI vocabulary.

When current family is internal:

```js
SBE.OccupantCameraModes.applyView({
  internalViewId,
  lookDirection,
  transportMode
})
```

If `applyView` does not exist, 0605N may translate to existing `applyMode` ids temporarily.

Temporary mapping:

```text
drive + driver + front              → driver
drive + passenger + front           → passenger
drive + rear_seat + front           → rear_seat
drive + driver + left               → left_window fallback
drive + driver + right              → right_window fallback
drive + driver + rear               → rear_window fallback
transit + bus_front + front         → bus_front
transit + bus_passenger + front     → bus_passenger
walk + walker_head + front          → walker_head
bike + bike_rider + front           → bike_rider
ferry + ferry_passenger + front     → ferry_passenger
```

But this fallback is limited.

Preferred implementation should extend 0605M to support:

```js
applyInternalView(anchorId, lookDirection)
```

so every internal seat can look front/left/right/rear.

---

# EXTERNAL CAMERA INTEGRATION

External family should call legacy camera paths for now:

```js
HeroVehicleRuntime.setCameraPreset("follow")
HeroVehicleRuntime.setCameraPreset("lead")
HeroVehicleRuntime.setCameraPreset("side")
HeroVehicleRuntime.setCameraPreset("high")
```

If a real external camera rig exists, use it.

If not:

```text
label these as External Legacy
not POV
```

This avoids the current confusion.

---

# DEBUG COMMANDS

Add:

```js
_wos.debug.camera.transportPOVState()
_wos.debug.camera.transportPOVProfiles()
_wos.debug.camera.transportPOVSetTransport(mode)
_wos.debug.camera.transportPOVSetFamily(family)
_wos.debug.camera.transportPOVSetInternal(viewId)
_wos.debug.camera.transportPOVSetExternal(viewId)
_wos.debug.camera.transportPOVSetLook(direction)
_wos.debug.camera.transportPOVApply()
```

Proof helpers:

```js
drivePOVProof()
transitPOVProof()
walkPOVProof()
bikePOVProof()
ferryPOVProof()
externalCameraProof()
```

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.TransportScopedPOVAuthority exists
no crash
```

## T2 — Transport profiles exist

Expected profiles:

```text
flight
drive
walk
bike
transit
ferry
```

## T3 — Drive only exposes drive POVs

Expected:

```text
driver
passenger
rear_seat
```

Not expected:

```text
bus_front
bike_rider
ferry_passenger
walker_head
```

## T4 — Transit only exposes transit POVs

Expected:

```text
bus_front
bus_passenger
```

## T5 — Walk only exposes walker POVs

Expected:

```text
walker_head
```

## T6 — Bike only exposes bike POVs

Expected:

```text
bike_rider
```

## T7 — Ferry only exposes ferry POVs

Expected:

```text
ferry_passenger
```

## T8 — Shared look directions

Expected all supported modes expose:

```text
front
left
right
rear
```

unless explicitly disabled.

## T9 — Internal mode uses occupant anchors

Expected:

```text
Drive / Internal / Driver / Front
→ driver_seat anchor
```

## T10 — Internal left uses same anchor, changed bearing

Expected:

```text
Drive / Internal / Driver / Left
→ driver_seat anchor
→ bearing offset -90
```

## T11 — Internal rear uses same anchor, changed bearing

Expected:

```text
Drive / Internal / Driver / Rear
→ driver_seat anchor
→ bearing offset 180
```

## T12 — Transport switch resets invalid view

Expected:

```text
Transit / Bus Passenger
switch to Drive
→ Driver or last valid Drive POV
```

## T13 — Look persists across compatible transport switch

Expected:

```text
Drive / Left
switch to Bike
→ Bike Rider / Left
```

## T14 — External mode does not use occupant anchors

Expected:

```text
External / Follow
does not call OccupantPOVCameraFramework.resolveAnchor
```

## T15 — Internal/external state remembered separately

Expected:

```text
Internal Driver/Left
External Drone
switch back Internal
→ Driver/Left restored
```

## T16 — UI dropdowns are scoped

Expected:

```text
Drive UI does not show Bus Passenger, Bike Rider, Ferry Passenger, Walker Head
```

## T17 — Legacy CAM options no longer mixed with internal POV list

Expected:

```text
follow/lead/side/high only appear under External
```

## T18 — No actor truth mutation

Expected actor object unchanged.

## T19 — No anchor mutation

Expected 0605L anchor definitions unchanged.

## T20 — No camera style mutation

Expected no Mapbox source/layer/style edits.

## T21 — Debug commands work

Expected all `transportPOV*` commands return structured data without throwing.

---

# NON-GOALS

This spec does not create:

```text
new lens/FOV controls
dashboard overlays
window frames
mirror rendering
new vehicle meshes
new actor truth
new transport simulation
new bus/ferry feeds
new external cinematic rig math
```

---

# DEFERRED SYSTEMS

## 0605O — Camera Lens Control Pass

Controls:

```text
FOV
zoom
pitch trim
bearing trim
roll
composition bias
wide/normal/telephoto
```

## 0605P — External Camera Rig Pass

Creates real external cameras:

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

## Future — Foreground Anchor Pass

Adds:

```text
dashboard
windshield frame
bus pole
bike handlebars
ferry railing
```

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/camera/transportScopedPOVAuthority.js`; patch `traversalControlDeck.js` to replace the flat CAM dropdown with transport-scoped `Family / POV / Look` controls; update camera debug bindings.
- **What**: Run `node --check wall/systems/camera/transportScopedPOVAuthority.js` plus every touched JS file. Test Drive, Transit, Walk, Bike, and Ferry profile scoping from the UI.
- **Expect**: Transportation mode controls available POVs; internal/external views are separated; front/left/right/rear become shared look directions; impossible options disappear; no actor truth, anchor definitions, WSL payloads, or Mapbox style are mutated.
