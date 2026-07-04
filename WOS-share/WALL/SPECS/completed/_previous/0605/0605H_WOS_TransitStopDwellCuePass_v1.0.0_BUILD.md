---
layout: spec
title: "Transit Stop Dwell Cue Pass"
date: 2026-06-05
doc_id: "0605H_WOS_TransitStopDwellCuePass_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "transit_stop_dwell_cue_pass"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Adds lightweight visual cues for stopped/dwelling live buses so bus pauses read as intentional transit behavior rather than frozen telemetry."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Buses stop by design"
  - "Readability over realism"
  - "Dwell is behavior, not failure"
  - "Presentation cues must not mutate truth"

depends_on:
  - "0604K_WOS_BusPresentationSelector_v1.0.0"
  - "0604M_WOS_BusAssetPack_v1.0.0"
  - "0605A_WOS_TransitPresencePass_v1.0.0"
  - "0605B_WOS_BusMotionSmoothing_v1.0.0"
  - "0605F_WOS_TransitCameraTargeting_v1.0.0"
  - "0605G_WOS_ArticulatedBusPresentationPass_v1.0.0"
  - "0605G.1_WOS_ArticulatedBusLiveBendUpdate_v1.0.0"

enables:
  - "0605I_WOS_HeroTransitShotPresets_v1.0.0"
  - "0605J_WOS_TransitEventBlockPartyPrototype_v1.0.0"

tags:
  - "transit"
  - "bus"
  - "dwell"
  - "stop"
  - "presentation"
  - "camera"
  - "readability"
---

# 0605H_WOS_TransitStopDwellCuePass_v1.0.0_BUILD

## PURPOSE

Make stopped buses read correctly.

After 0605F, WOS can follow buses like hero vehicles.

But buses are not cars.

They stop.

They pause.

They dwell.

A stopped bus should not look broken.

It should read as:

```text
bus is stopped
bus is serving a stop
bus is waiting
bus is dwelling
```

0605H adds subtle presentation cues that make bus stops visually legible without creating route simulation, passenger simulation, or schedule UI.

---

# CORE PROBLEM

Current presentation can make a stopped bus feel like:

```text
frozen actor
stale feed
broken motion
```

But real bus behavior includes:

```text
stopping at bus stops
waiting at traffic
boarding/alighting
dwell time
route timing adjustment
```

The system needs a visual grammar for valid pause states.

---

# CORE PRINCIPLE

Dwell is not failure.

```text
moving bus → motion cues
stopped bus → dwell cues
stale bus → degraded/frozen state
lost bus → release/clear behavior
```

0605H must keep these separate.

---

# AUTHORITY BOUNDARIES

## This spec owns

- stop/dwell cue classification
- dwell presentation state
- dwell cue canvas drawing
- door-light / pause-halo / curb-side hint cues
- dwell debug output

## This spec reads

- `SBE.BusPresentationSelector`
- `SBE.TransitCameraTargeting`
- `SBE.BusMotionSmoothing`
- `SBE.BusAssetResolver`
- selected `vehicle.bus` actors
- actor speed / timestamp / route / vehicle metadata
- target status from transit camera targeting when available

## This spec writes

- dwell cue pass local state
- a transparent canvas overlay only

## This spec must not write

- TruthActorRuntime
- actor metadata
- MTABusRealtimeAdapter rows
- MTABusActorBridge rows
- BusPresentationSelector state
- BusMotionSmoothing cache beyond allowed observe/read patterns
- BusAssetResolver cache
- TransitAssignmentAuthority assignments
- TransitCameraTargeting target state
- TransitPresencePass state
- CruiseMovementField state
- WorldSpaceVehicleLayer payloads
- Mapbox sources
- Mapbox layers
- Studio

---

# NEW FILE

```text
wall/systems/transit/transitStopDwellCuePass.js
```

Register in:

```text
wall/index.html
```

after:

```text
transitPresencePass.js
transitCameraTargeting.js
articulatedBusPresentationPass.js
```

before debug-only tooling where practical.

---

# PUBLIC API

Expose:

```js
SBE.TransitStopDwellCuePass
```

Frozen API:

```js
start(options?)
stop()
isActive()

renderOnce()
clear()

setEnabled(enabled)
setDebug(enabled)

setPreset(preset)
getPreset()

setIntensity(value)
setMaxCues(count)

getState()
getRenderedCues()
getStats()
```

---

# PRESETS

Required presets:

```js
"clean"
"night_city"
"debug_bright"
"off"
```

## clean

Minimal dwell readability.

## night_city

Slightly stronger pause/door cues for night use.

## debug_bright

High visibility for validation.

## off

No cues.

---

# DWELL CLASSIFICATION

A bus is considered dwelling when:

```js
speedMps === 0
or speedMps < 0.5
```

and the actor is not stale.

Use stale threshold:

```js
SBE.MTABusFeedConfig.MTA_BUS_STALE_AFTER_MS || 45000
```

If `TransitCameraTargeting` reports the current target status as:

```text
dwelling
```

and the actor matches that target, classify it as dwelling even if speed is missing.

---

# CLASSIFICATION OUTPUT

```js
type TransitDwellCueCandidate = {
  actorId: string
  vehicleId: string | null
  routeId: string | null

  dwellState:
    | "moving"
    | "dwelling"
    | "stale"
    | "unknown"

  speedMps: number | null
  freshnessMs: number | null

  screenX: number
  screenY: number

  busAssetClass: string | null
  isCameraTarget: boolean
}
```

---

# CUE TYPES

## pause_halo

A small pulsing ring under/around a stopped bus.

Purpose:

```text
this actor is intentionally paused
```

## door_light

A small curb-side light hint.

Purpose:

```text
bus may be serving passengers
```

No passenger simulation.

No door animation.

## dwell_tick

A very small blink or marker near the bus.

Purpose:

```text
debug/legibility for stop state
```

## target_hold

Only for the current camera-followed bus.

Purpose:

```text
camera is intentionally holding composition
```

---

# ALTITUDE POLICY

| profile | behavior |
|---|---|
| low | full dwell cues |
| city | compact dwell cues |
| regional | no individual dwell cues |
| cruise | no individual dwell cues |

Regional/cruise are handled by broader transit presence / cruise field, not individual stop semantics.

---

# BUDGETS

Default cue budgets:

```js
low: 80
city: 120
regional: 0
cruise: 0
```

`setMaxCues(count)` caps further.

Never exceed selected bus count.

---

# CAMERA TARGET INTEGRATION

If the followed target from 0605F is dwelling:

```text
draw target_hold cue
do not imply movement
do not force camera update
```

The cue pass only reads targeting state.

It must not call:

```js
followHeroBus()
jumpToTarget()
frameTarget()
orbitTarget()
clearTarget()
```

---

# PRESENCE PASS RELATIONSHIP

TransitPresencePass already handles:

```text
headlight
taillight
class accent
motion streak
```

0605H handles:

```text
pause state
dwell readability
camera hold readability
```

Do not duplicate motion streaks.

If a bus is dwelling:

```text
motion streak should remain absent
dwell cue may appear
```

---

# ARTICULATED BUS RELATIONSHIP

For articulated buses:

```text
dwell cue anchors to front/lead position
```

0605H does not add door-specific segment behavior.

Future door-side detail may be added later if needed.

---

# EXECUTION FLOW

```text
renderOnce()
→ BusPresentationSelector.select()
→ selectedActors only
→ project actor/smoothed position
→ classify moving/dwelling/stale
→ budget dwell candidates
→ draw canvas cues
→ store cue data
```

No independent full-world scan.

---

# PERFORMANCE REQUIREMENTS

- no DOM-per-bus
- single transparent canvas overlay
- no Mapbox source/layer creation
- no WSL calls
- no full actor scan outside selector output
- no RAF required by default
- manual `renderOnce()` supported
- optional interval must clamp to >=1000ms
- compute cue data even if canvas unavailable
- never throw from public calls

---

# STATE MODEL

```js
type TransitStopDwellCueState = {
  version: "1.0.0"
  active: boolean
  enabled: boolean
  debug: boolean

  preset: "clean" | "night_city" | "debug_bright" | "off"
  intensity: number

  profile: "low" | "city" | "regional" | "cruise"

  selectedActorCount: number
  dwellCandidateCount: number
  renderedCueCount: number

  staleRejected: number
  movingRejected: number
  projectionRejected: number
  budgetRejected: number

  lastRenderAt: number | null
  renderCount: number
  lastError: string | null
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
transitDwellStart()
transitDwellStop()
transitDwellRenderOnce()
transitDwellClear()

transitDwellState()
transitDwellStats()
transitDwellCues()

transitDwellPreset(name)
transitDwellIntensity(value)
transitDwellDebug(on)
```

Optional convenience:

```js
busDwellProof()
```

which runs:

```text
busLiveProof()
→ transitPresenceRenderOnce()
→ transitDwellRenderOnce()
```

if those commands exist.

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.TransitStopDwellCuePass exists
no selector required at load
no crash
```

## T2 — Lifecycle

Expected:

```text
start() active true
stop() active false
```

## T3 — No selector

Expected:

```text
renderOnce() ok:false
lastError:'selector_unavailable'
```

## T4 — No selected actors

Expected:

```text
ok:true
renderedCueCount:0
```

## T5 — Moving bus rejected

Given speed >=0.5:

```text
movingRejected increments
no dwell cue
```

## T6 — Dwelling bus cue

Given speed <0.5 and fresh timestamp:

```text
dwellCandidateCount:1
renderedCueCount:1
cueTypes include pause_halo
```

## T7 — Stale bus rejected

Given stale timestamp:

```text
staleRejected increments
no dwell cue
```

## T8 — Camera target dwell cue

Given followed bus status dwelling:

```text
cueTypes include target_hold
```

## T9 — Door light cue

Given low/city dwelling bus:

```text
cueTypes may include door_light
```

## T10 — Budget enforced

Given more dwelling buses than budget:

```text
renderedCueCount <= budget
budgetRejected > 0
```

## T11 — Regional disabled

Expected:

```text
regional profile renders 0 dwell cues
```

## T12 — Cruise disabled

Expected:

```text
cruise profile renders 0 dwell cues
```

## T13 — Presets valid

Expected:

```text
clean/night_city/debug_bright/off accepted
invalid preset rejected safely
```

## T14 — Intensity clamps

Expected:

```text
setIntensity(-1) → 0
setIntensity(2) → 1
```

## T15 — No truth mutation

Expected:

```text
actor object byte-identical
TruthActorRuntime unchanged
```

## T16 — No selector mutation

Expected:

```text
BusPresentationSelector state unchanged
```

## T17 — No smoothing mutation beyond observe/read

Expected:

```text
no external smoothing changes beyond existing safe read path
```

## T18 — No camera mutation

Expected:

```text
TransitCameraTargeting state unchanged
```

## T19 — No WSL mutation

Expected:

```text
no upsertVehicle/removeVehicle calls
```

## T20 — No Mapbox mutation

Expected:

```text
no new sources
no new layers
```

## T21 — Debug commands work

Expected:

```text
transitDwellState()
transitDwellStats()
transitDwellCues()
transitDwellRenderOnce()
```

return structured data without throwing.

---

# NON-GOALS

This spec does not create:

```text
bus stop locations
scheduled arrival UI
passenger simulation
door animation
wheel animation
brake lights as physics
route prediction
camera movement
hero shot presets
graffiti rendering
sponsored wraps
subway systems
```

---

# DEFERRED SYSTEMS

## 0605I — Hero Transit Shot Presets

Camera compositions for assigned/followed buses.

## 0605J — Transit Event Block Party Prototype

Compressed Hero Location / pop-up event demo.

## Future — Bus Stop Geography

A later system may attach bus stop locations, curbside semantics, route stops, and ETA context.

0605H intentionally avoids that complexity.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/transit/transitStopDwellCuePass.js`; register it in `wall/index.html` after `transitCameraTargeting.js` and `transitPresencePass.js`; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`; document it in `wall/systems/transit/README.md`.
- **What**: Run `node --check wall/systems/transit/transitStopDwellCuePass.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: Fresh stopped buses show subtle dwell/pause cues at low/city altitude; moving/stale/regional/cruise buses do not; camera-followed dwelling buses display a target-hold cue; no truth, selector, smoothing, camera, WSL, or Mapbox style mutation occurs.
