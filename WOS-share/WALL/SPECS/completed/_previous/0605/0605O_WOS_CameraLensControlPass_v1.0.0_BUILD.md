---
layout: spec
title: "Camera Lens Control Pass"
date: 2026-06-05
doc_id: "0605O_WOS_CameraLensControlPass_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "camera"
component: "camera_lens_control_pass"
type: "implementation-spec"
status: "approved"
priority: "high"
risk: "medium"
classification: "presentation-camera-runtime"
summary: "Adds camera lens controls that adjust how a resolved internal or external camera sees the world without changing actor truth, occupant anchors, transport-scoped POV selection, terrain sampling, or Mapbox style."
---

# 0605O_WOS_CameraLensControlPass_v1.0.0_BUILD

## Purpose

Separate lens control from camera position.

0605L answered:

```text
Where is the viewer sitting?
```

0605N answered:

```text
Which transport mode is active?
Which valid POV belongs to that transport?
Which direction is the viewer looking?
```

0605O answers:

```text
How does the camera see?
```

This pass introduces lens and framing controls for internal and external camera requests.

It must not move seats, redefine anchors, or create external camera rigs.

---

## Core Decision

0605O owns lens adjustments only.

```text
input camera request
→ lens profile
→ adjusted camera request
```

It does not resolve actors.

It does not resolve anchors.

It does not submit camera requests by itself except debug proof helpers.

---

## Doctrine

- Anchor answers where the viewer sits.
- Look direction answers where the viewer faces.
- Lens answers how the viewer sees.
- Do not fix anchor problems with lens controls.
- Do not fix lens problems with anchor offsets.
- No actor truth mutation.
- No Mapbox style mutation.

---

## Depends On

- `0605K_WOS_TerrainAwareActorCamera_v1.0.0`
- `0605L_WOS_OccupantPOVCameraFramework_v1.0.0`
- `0605M_WOS_OccupantCameraModes_v1.0.0`
- `0605N_WOS_TransportScopedPOVAuthority_v1.0.0`

---

## New File

```text
wall/systems/camera/cameraLensControlPass.js
```

Expose:

```js
SBE.CameraLensControlPass
```

Register after:

```text
wall/systems/camera/transportScopedPOVAuthority.js
```

---

## Public API

```js
setLensProfile(profileId)
getLensProfile()
listLensProfiles()
getLensProfileDef(profileId)

applyLens(request)
previewLens(request, profileId)
suggestProfileForRequest(request)

setAutoProfileEnabled(on)
getAutoProfileEnabled()

setZoomTrim(value)
setPitchTrim(value)
setBearingTrim(value)
setRollTrim(value)
setCompositionBias(value)
resetTrims()

setEnabled(on)
setDebug(on)

getState()
getStats()
```

---

## Lens Profiles

Required profiles:

```text
wide
normal
telephoto
cinematic
surveillance
dashcam
helmetcam
bus_window
ferry_deck
drone_observer
```

Profile shape:

```js
{
  id: "wide",
  label: "Wide",
  zoomDelta: -0.6,
  pitchDelta: 0,
  bearingDelta: 0,
  rollDeg: 0,
  compositionBias: 0,
  fovHint: "wide",
  clamp: {
    minZoom: 10,
    maxZoom: 20,
    minPitch: 0,
    maxPitch: 85
  }
}
```

---

## Profile Intent

### wide

For walking, bike, compact streets, and interiors.

Effect:

```text
more environment
more peripheral motion
more physical proximity
```

### normal

Neutral testing profile.

### telephoto

For compressed distance, skyline, and long road perspective.

### cinematic

For composed production shots.

### surveillance

For stable observational debug/external monitoring.

### dashcam

For driver/windshield testing.

### helmetcam

For walking, biking, and future host streams.

### bus_window

For bus front/passenger views.

### ferry_deck

For water, horizon, and sky-heavy views.

### drone_observer

For external high/drone views.

---

## Request Contract

Input request may include:

```js
{
  lng,
  lat,
  bearing,
  pitch,
  zoom,
  roll,
  source,
  family,
  transportMode,
  actorType,
  vehicleClass,
  anchorId,
  lookDirection,
  modeId
}
```

Output request adds:

```js
{
  lensProfileId,
  lensApplied: true,
  originalZoom,
  originalPitch,
  originalBearing,
  originalRoll,
  zoom,
  pitch,
  bearing,
  roll,
  compositionBias,
  fovHint
}
```

---

## Auto Profile Suggestion

Add:

```js
suggestProfileForRequest(request)
```

Required mapping:

| Request Context | Profile |
|---|---|
| Drive internal | `dashcam` |
| Transit internal | `bus_window` |
| Walk internal | `helmetcam` |
| Bike internal | `helmetcam` |
| Ferry internal | `ferry_deck` |
| External drone/high | `drone_observer` |
| External follow/lead/side | `cinematic` |
| Debug/surveillance | `surveillance` |
| Unknown | `normal` |

Auto mode default:

```text
enabled
```

When enabled:

```text
applyLens(request) uses suggested profile
```

When disabled:

```text
applyLens(request) uses selected global profile
```

---

## Trims

User/runtime trims are additive on top of profile.

Required trims:

```text
zoomTrim
pitchTrim
bearingTrim
rollTrim
compositionBiasTrim
```

Suggested trim clamps:

```text
zoomTrim: -2.0 to +2.0
pitchTrim: -20 to +20
bearingTrim: -45 to +45
rollTrim: -15 to +15
compositionBiasTrim: -1 to +1
```

Final request clamps:

```text
zoom: 0–22
pitch: 0–85
bearing: normalized 0–360
roll: -45–45
compositionBias: -1–1
```

Invalid numeric values fall back safely.

---

## Integration

### OccupantCameraModes

Before submitting a camera request:

```js
if (SBE.CameraLensControlPass) {
  request = SBE.CameraLensControlPass.applyLens(request) || request;
}
```

Recommended order:

```text
occupant anchor
→ look direction
→ lens control
→ terrain enhancement
→ viewport submit
```

This keeps lens composition separate from terrain clearance/grade compensation.

### TransportScopedPOVAuthority

0605N should not duplicate lens logic.

Internal POVs route through `OccupantCameraModes`.

External legacy does not need lens until 0605P creates real external camera request objects.

---

## UI Integration

Add compact lens selector near CAM controls.

Minimum viable UI:

```text
Lens: Auto / Wide / Normal / Telephoto / Dashcam / Helmetcam / Bus / Ferry / Drone
```

Keep precise trim controls debug-first.

Do not clutter the main UI with five trim sliders yet.

---

## Debug Commands

Add to:

```js
_wos.debug.camera
```

Required:

```js
lensState()
lensStats()
lensProfiles()
lensProfile(id)
lensAuto(on)

lensZoomTrim(value)
lensPitchTrim(value)
lensBearingTrim(value)
lensRollTrim(value)
lensCompositionBias(value)
lensResetTrims()

lensPreview(profileId)
```

Proof helpers:

```js
lensDriveProof()
lensBikeProof()
lensWalkProof()
lensBusProof()
lensFerryProof()
```

---

## Failure Vocabulary

Use:

```text
disabled
invalid_profile
invalid_request
no_request
unknown
```

Never throw from public API calls.

---

## Acceptance Tests

### T1 — Loads safely

Expected:

```text
SBE.CameraLensControlPass exists
no map required
no crash
```

### T2 — Profiles registered

Expected:

```text
wide
normal
telephoto
cinematic
surveillance
dashcam
helmetcam
bus_window
ferry_deck
drone_observer
```

### T3 — Apply normal profile

Expected:

```text
lensApplied:true
lensProfileId:"normal"
originalZoom/originalPitch/originalBearing preserved
```

### T4 — Wide changes zoom

Expected:

```text
wide zoom < original zoom
```

### T5 — Telephoto changes zoom

Expected:

```text
telephoto zoom > original zoom
```

### T6 — Dashcam suggested for drive internal

Expected:

```text
suggestProfileForRequest({transportMode:"drive", family:"internal"}) === "dashcam"
```

### T7 — Helmetcam suggested for walk/bike

Expected:

```text
walk internal → helmetcam
bike internal → helmetcam
```

### T8 — Bus suggested for transit

Expected:

```text
transit internal → bus_window
```

### T9 — Ferry suggested for ferry

Expected:

```text
ferry internal → ferry_deck
```

### T10 — Drone suggested for external high/drone

Expected:

```text
external drone → drone_observer
```

### T11 — Auto profile mode works

Expected:

```text
auto enabled
applyLens(drive internal request)
uses dashcam
```

### T12 — Manual profile mode works

Expected:

```text
auto disabled
setLensProfile("wide")
applyLens(...)
uses wide
```

### T13 — Pitch trim applies and clamps

Expected:

```text
pitchTrim changes final pitch
pitch remains 0–85
```

### T14 — Bearing trim applies and normalizes

Expected:

```text
bearing remains 0–360
```

### T15 — Roll trim applies and clamps

Expected:

```text
roll remains -45–45
```

### T16 — Reset trims

Expected:

```text
all trims return to 0
```

### T17 — OccupantCameraModes integration

Expected:

```text
internal POV request carries lensApplied:true
```

### T18 — No anchor mutation

Expected:

```text
OccupantPOVCameraFramework anchors unchanged
```

### T19 — No actor truth mutation

Expected actor object unchanged.

### T20 — No Mapbox style mutation

Expected:

```text
no new sources
no new layers
no style edits
```

### T21 — Debug commands work

Expected all `lens*` commands return structured data without throwing.

---

## Non-Goals

This spec does not create:

```text
new occupant anchors
new transport profiles
new external camera rigs
new route following
new actor truth
dashboard overlays
window frames
mirror rendering
interior meshes
head bob
camera shake
vehicle visual replacement
```

---

## Deferred Systems

### 0605P — External Camera Rig Pass

Creates real external camera rigs:

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

### Future — Foreground Anchor Pass

Adds visible POV framing:

```text
dashboard silhouette
windshield frame
rearview mirror frame
bike handlebars
bus pole
ferry railing
```

### Future — Camera Motion Texture

Adds subtle body sway, head bob, road vibration, bike lean, and boat drift.

---

## Implementation Guide

- **Where**: Add `wall/systems/camera/cameraLensControlPass.js`; register after `transportScopedPOVAuthority.js`; patch `occupantCameraModes.js` so requests pass through `CameraLensControlPass.applyLens()` before terrain enhancement; add compact Lens UI and debug commands.
- **What**: Run `node --check wall/systems/camera/cameraLensControlPass.js` plus every touched JS file. Test `lensProfile("wide")`, `lensAuto(true)`, `drivePOVProof()`, `bikePOVProof()`, `busPOVProof()`, and `ferryPOVProof()`.
- **Expect**: Internal POVs become optically distinct by actor class while anchors remain fixed; drive feels like dashcam, walk/bike feel wider, transit feels higher/broader, ferry preserves horizon; no actor truth, anchors, WSL payloads, or Mapbox style are mutated.
