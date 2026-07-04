---
layout: spec
title: "Terrain-Aware Actor Camera"
date: 2026-06-05
doc_id: "0605K_WOS_TerrainAwareActorCamera_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "camera"
component: "terrain_aware_actor_camera"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Adds terrain-aware camera elevation and grade handling to actor-mounted camera shots so windshield, side, rear, roof, and POV views ride Mapbox terrain instead of behaving like flat-world camera offsets."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Camera must ride the world"
  - "Terrain changes camera context, not actor truth"
  - "Travel experience before event systems"
  - "No Mapbox style mutation"

depends_on:
  - "0605F_WOS_TransitCameraTargeting_v1.0.0"
  - "0605I_WOS_ActorCameraShotPresets_v1.0.0"
  - "MapboxViewportRuntime"
  - "ActorCameraShotPresets"

enables:
  - "0605L_WOS_EventBlockPrototype_v1.0.0"
  - "Future Walker Terrain Camera"
  - "Future Bike Terrain Camera"
  - "Future Maritime Horizon Camera"

tags:
  - "camera"
  - "terrain"
  - "actor"
  - "pov"
  - "windshield"
  - "world-travel"
  - "presentation"
---

# 0605K_WOS_TerrainAwareActorCamera_v1.0.0_BUILD

## PURPOSE

Make actor-mounted cameras ride the terrain.

0605I created the shot vocabulary:

```text
windshield
left_window
right_window
rear_window
roof_mount
bus_front_window
street_level
```

But terrain introduces a new question:

```text
Does the camera move through the world,
or does it float above a flat abstraction?
```

0605K makes actor camera requests terrain-aware without changing actor truth, route truth, transit truth, or Mapbox style.

---

# CORE PROBLEM

With 3D terrain and terrain exaggeration enabled, actor cameras can fail in several ways:

```text
camera clips below terrain
camera floats above road
camera ignores hill crests
camera misses skyline reveals
camera side views feel detached
rear views do not follow grade
```

The camera must understand terrain elevation around the target.

---

# CORE DECISION

Terrain is presentation context.

It does not mutate actor truth.

Canonical split:

```text
Actor truth:
  lng / lat / heading / speed

Shot preset:
  virtual offset / pitch / bearing

Terrain camera layer:
  elevation sampling / grade smoothing / clearance

Camera authority:
  actual viewport movement
```

0605K should patch the camera request pipeline, not the actor pipeline.

---

# PRIMARY GOAL

Prove that WOS can create convincing moving views through terrain-heavy city streets.

Success moment:

```text
cameraFollowVehicle()
setShot("windshield")

vehicle approaches hill
camera rises with grade
horizon shifts
sky appears
city reveals itself
```

---

# AUTHORITY BOUNDARIES

## This spec owns

- terrain elevation sampling for camera requests
- target-ground elevation estimates
- camera clearance above terrain
- grade-aware pitch adjustment
- hill crest / valley smoothing
- terrain-aware camera debug output

## This spec reads

- `SBE.ActorCameraShotPresets`
- `SBE.TransitCameraTargeting`
- `SBE.MapboxViewportRuntime`
- Mapbox terrain APIs when available
- actor target position
- shot request position
- current pitch / zoom / bearing
- terrain exaggeration state when available

## This spec may write

- camera request altitude/elevation fields
- camera request pitch adjustment
- its own terrain camera cache/state
- debug counters

## This spec must not write

- TruthActorRuntime
- actor metadata
- BusMotionSmoothing
- TransitCameraTargeting target state
- ActorCameraShotPresets shot definitions
- WorldSpaceVehicleLayer payloads
- Mapbox sources
- Mapbox layers
- Mapbox style
- terrain source/style configuration
- Studio
- maritime/AIS systems
- Citi Bike/subway systems

---

# NEW FILE

Preferred:

```text
wall/systems/camera/terrainAwareActorCamera.js
```

Register in:

```text
wall/index.html
```

after:

```text
wall/systems/camera/actorCameraShotPresets.js
```

before debug tooling.

---

# PUBLIC API

Expose:

```js
SBE.TerrainAwareActorCamera
```

Frozen API:

```js
start()
stop()
isActive()

enhanceRequest(request)
sampleTerrain(lng, lat)
sampleGrade(lng, lat, headingDeg)

setEnabled(enabled)
setDebug(enabled)

setMinClearanceMeters(value)
setGradeSmoothing(value)
setPitchCompensation(value)

getState()
getStats()
clearCache()
```

---

# INTEGRATION MODEL

0605K should integrate with 0605I by allowing `ActorCameraShotPresets.applyShot()` to call:

```js
SBE.TerrainAwareActorCamera.enhanceRequest(request)
```

before submitting the camera request.

If 0605K is absent:

```text
0605I works exactly as before
```

If terrain APIs are unavailable:

```text
enhanceRequest returns the original request
with terrainAvailable:false
no throw
```

---

# REQUEST EXTENSION

Input request from 0605I:

```js
type ActorCameraRequest = {
  lng: number
  lat: number
  bearing: number
  pitch: number
  zoom: number | null
  shotId: string
  offsetZ: number
}
```

Enhanced request:

```js
type TerrainAwareCameraRequest = ActorCameraRequest & {
  terrainAware: true
  terrainAvailable: boolean

  terrainElevationM: number | null
  targetElevationM: number | null
  cameraElevationM: number | null

  gradeDeg: number | null
  pitchCompensated: boolean
  originalPitch: number
}
```

---

# TERRAIN SAMPLING

Use Mapbox terrain APIs when available.

Preferred:

```js
map.queryTerrainElevation([lng, lat], { exaggerated: true })
```

Fallback:

```js
map.queryTerrainElevation([lng, lat])
```

If unavailable:

```text
terrainAvailable:false
```

Do not create terrain.

Do not configure terrain.

Do not change style.

---

# CLEARANCE POLICY

Default minimum camera clearance:

```js
MIN_CAMERA_CLEARANCE_M = 1.5
```

For POV shots:

```text
camera should never be below sampled terrain + clearance
```

For roof/high shots:

```text
respect shot offsetZ
but still clamp above terrain
```

Formula:

```js
cameraElevationM = max(
  sampledTerrainElevationM + MIN_CAMERA_CLEARANCE_M,
  targetTerrainElevationM + shot.offsetZ
)
```

---

# GRADE SAMPLING

Sample terrain at three points:

```text
behind target
target
ahead of target
```

Suggested distance:

```js
GRADE_SAMPLE_DISTANCE_M = 12
```

Compute grade:

```text
ahead elevation - behind elevation
over sample distance
```

Convert to angle:

```js
gradeDeg = atan2(deltaElevation, distanceMeters * 2)
```

Use grade only for pitch compensation.

Do not mutate actor heading.

---

# PITCH COMPENSATION

Windshield / POV shots should respond subtly to grade.

Uphill:

```text
slightly raise pitch / horizon
```

Downhill:

```text
slightly lower pitch / horizon
```

Default:

```js
PITCH_COMPENSATION_FACTOR = 0.35
MAX_PITCH_COMPENSATION_DEG = 8
```

Apply only to shot families:

```text
pov
transit
walker
```

Avoid overcorrecting external cinematic shots.

---

# SMOOTHING

Terrain sampling can be noisy.

Maintain a per-target or per-shot smoothing cache:

```js
smoothedElevationM
smoothedGradeDeg
```

Default:

```js
GRADE_SMOOTHING = 0.18
ELEVATION_SMOOTHING = 0.22
```

No per-frame allocation storms.

Cache cap:

```js
CACHE_LIMIT = 1000
```

---

# SHOT-SPECIFIC RULES

## windshield / bus_front_window / actor_pov

```text
strong terrain awareness
grade pitch compensation enabled
clearance enforced
```

## left_window / right_window / bus_side_window

```text
terrain elevation enabled
grade compensation reduced
side view should not roll or tilt aggressively
```

## rear_window / bus_rear_window / bumper_rear

```text
terrain elevation enabled
grade compensation inverted or reduced
rear departure view remains stable
```

## roof_mount / bus_roof

```text
terrain elevation enabled
minimal pitch compensation
```

## top_down / high_civic

```text
terrain elevation optional
no grade compensation
```

## walker street_level / head_pov

```text
high terrain sensitivity
low clearance
smooth heavily
```

---

# TERRAIN EXAGGERATION COMPATIBILITY

If Mapbox returns exaggerated terrain elevation:

```text
use exaggerated elevation
```

because the rendered world is exaggerated.

If only non-exaggerated terrain is returned:

```text
use it safely
but report terrainExaggerated:false
```

No attempt to infer or modify the map's terrain exaggeration.

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.camera
```

Required:

```js
terrainCameraState()
terrainCameraStats()
terrainCameraSample(lng, lat)
terrainCameraGrade(lng, lat, headingDeg)

terrainCameraEnable(on)
terrainCameraDebug(on)

terrainCameraClearCache()
```

Optional proof helper:

```js
terrainCameraProof()
```

which runs:

```text
cameraShotState()
terrainCameraState()
sample current target
```

if target exists.

---

# STATE MODEL

```js
type TerrainAwareActorCameraState = {
  version: "1.0.0"
  active: boolean
  enabled: boolean
  debug: boolean

  terrainAvailable: boolean
  lastTerrainError: string | null

  minClearanceMeters: number
  gradeSmoothing: number
  pitchCompensation: number

  cacheSize: number

  lastSample: {
    lng: number
    lat: number
    elevationM: number | null
    timestamp: number
  } | null

  lastEnhancedRequest: object | null
}
```

---

# STATS MODEL

```js
type TerrainAwareActorCameraStats = {
  enhancedRequests: number
  terrainSamples: number
  terrainUnavailable: number
  gradeSamples: number
  pitchCompensations: number
  clearanceClamps: number
  cacheHits: number
  cacheEvictions: number
}
```

---

# EXECUTION FLOW

```text
ActorCameraShotPresets.applyShot(id)
→ resolve current target
→ form shot camera request
→ TerrainAwareActorCamera.enhanceRequest(request)
→ camera request submitted to existing camera authority
```

---

# FAILURE BEHAVIOR

If terrain sampling fails:

```text
return original request
terrainAvailable:false
lastTerrainError set
no throw
```

If request invalid:

```text
return original request
lastTerrainError:'invalid_request'
no throw
```

If map unavailable:

```text
return original request
lastTerrainError:'map_unavailable'
no throw
```

---

# PERFORMANCE REQUIREMENTS

- no RAF required
- no new camera engine
- no full actor scan
- no DOM creation
- no Mapbox source/layer/style mutation
- cache terrain samples
- clamp cache to 1000
- never throw from public calls
- one request in, one enhanced request out
- do not submit camera requests itself unless explicitly needed for debug proof

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.TerrainAwareActorCamera exists
no map required
no crash
```

## T2 — Disabled passthrough

Given enabled false:

```text
enhanceRequest(request) returns request with no terrain mutation
```

## T3 — Terrain unavailable passthrough

Given no map terrain API:

```text
terrainAvailable:false
original lng/lat preserved
no throw
```

## T4 — Terrain sample succeeds

Given queryTerrainElevation available:

```text
sampleTerrain() returns elevationM
terrainSamples increments
```

## T5 — Enhanced request includes terrain fields

Expected:

```text
terrainAware:true
terrainElevationM set
cameraElevationM set
```

## T6 — Clearance clamp

Given camera below terrain:

```text
cameraElevationM >= terrainElevationM + minClearanceMeters
clearanceClamps increments
```

## T7 — Grade sample succeeds

Expected:

```text
sampleGrade() returns gradeDeg
gradeSamples increments
```

## T8 — Windshield pitch compensated

Given grade:

```text
shotId:'windshield'
pitch changes within max compensation
pitchCompensations increments
```

## T9 — Side window reduced compensation

Given side shot:

```text
pitch compensation lower than windshield
```

## T10 — Rear window stable

Expected:

```text
rear_window does not overcorrect
```

## T11 — Roof shot minimal compensation

Expected:

```text
bus_roof / roof_mount keeps stable pitch
```

## T12 — High civic no grade compensation

Expected:

```text
high_civic pitch unchanged
```

## T13 — Smoothing works

Given repeated noisy grade samples:

```text
smoothed grade changes gradually
```

## T14 — Cache cap enforced

Given >1000 samples:

```text
cacheSize <= 1000
cacheEvictions increments
```

## T15 — ActorCameraShotPresets integration

Expected:

```text
applyShot() request includes terrainAware fields when 0605K loaded
```

## T16 — No truth mutation

Expected:

```text
actor object unchanged
TruthActorRuntime unchanged
```

## T17 — No camera target mutation

Expected:

```text
TransitCameraTargeting target unchanged
```

## T18 — No shot definition mutation

Expected:

```text
ActorCameraShotPresets shot definitions frozen/unchanged
```

## T19 — No WSL mutation

Expected:

```text
no upsertVehicle/removeVehicle calls
```

## T20 — No Mapbox style mutation

Expected:

```text
no new sources
no new layers
no terrain/style edits
```

## T21 — Debug commands work

Expected:

```text
terrainCameraState()
terrainCameraStats()
terrainCameraSample()
terrainCameraGrade()
terrainCameraProof()
```

return structured data without throwing.

---

# NON-GOALS

This spec does not create:

```text
new camera presets
new actor types
new events
route following
road snapping
vehicle physics
suspension
collision
terrain editing
Mapbox style changes
3D interiors
mirror cameras
hood rendering
block party prototype
```

---

# DEFERRED SYSTEMS

## 0605L — Event Block Prototype

First discoverable WOS destination.

## Future — Foreground Anchor Pass

Hood, dashboard, handlebars, railing, mirror, window frame overlays.

## Future — Mirror Camera Layer

Secondary reflected viewport / rearview mirror compositions.

## Future — Road Surface Contact Pass

Actor mesh tires/wheels respond visually to terrain/grade.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/camera/terrainAwareActorCamera.js`; register it in `wall/index.html` after `actorCameraShotPresets.js`; patch `actorCameraShotPresets.js` to call `SBE.TerrainAwareActorCamera.enhanceRequest(request)` before camera submission; add debug commands to the camera debug namespace.
- **What**: Run `node --check wall/systems/camera/terrainAwareActorCamera.js` and `node --check wall/systems/camera/actorCameraShotPresets.js`.
- **Expect**: Actor POV and camera shots ride Mapbox terrain elevation safely, clamp above the rendered ground, compensate subtly for hills/valleys, preserve all actor/camera/shot truth, and make windshield/side/rear views usable for terrain-heavy city travel.
