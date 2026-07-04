---
title: "Regional Flight Camera Smoothing"
filename: "0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0_BUILD.md"
version: "1.0.0"
date: "2026-05-28"
system: "WOS"
module: "Regional Flight"
type: "camera-build-spec"
status: "[BUILD]"
build_readiness: "[BUILD]"
owner: "StudioRich / WOS"
depends_on:
  - "0528K_WOS_RegionalFlightTripRuntime_v1.0.0"
  - "0528N_WOS_RegionalFlightPresencePass_v1.0.0"
  - "0528O_WOS_RegionalFlightPlanner_v1.0.0"
---

# 0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0_BUILD

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Replace cadence-based robotic regional flight camera updates with smooth cinematic observer interpolation.

---

# Purpose

Regional flights now support:

- complete trip lifecycle
- atmospheric aircraft presence
- planner-generated routes
- route preview
- airport and coordinate destination selection

The current remaining weakness is camera behavior.

The regional observer camera currently risks reading as:

```text
map follow camera
```

instead of:

```text
cinematic geographic observer
```

This spec defines the first camera smoothing pass for regional flights.

The goal is to make aircraft following feel:

- smooth
- observational
- cinematic
- geographically grounded
- stream-safe
- emotionally pleasant

without turning WOS into a flight simulator.

---

# Core Doctrine

## Camera Is Interpretation

The camera does not own flight truth.

The camera interprets:

- position
- altitude
- route phase
- aircraft heading
- atmosphere
- destination approach

into a view that feels good to watch.

---

## Smoothness Beats Accuracy

The camera should prioritize:

```text
viewer comfort and emotional continuity
```

over exact aircraft locking.

A small delay or softened follow is preferable to:

- snapping
- twitching
- hard pivots
- abrupt zoom changes
- mechanical bearing changes

---

## Observer, Not Chase Cam

Regional flight camera should feel like:

```text
a patient aerial observer
```

NOT:

```text
a fighter-jet chase camera
```

The aircraft is part of the world composition.

It is not always the center of the universe.

---

# Scope

This spec includes:

- smoothed camera target state
- eased center interpolation
- zoom smoothing
- pitch smoothing
- bearing smoothing
- altitude-aware framing
- phase-aware camera behavior
- debug toggles
- planner-trip compatibility

This spec does NOT include:

- cinematic cutscene editor
- multi-camera sequencing
- manual camera UI
- freecam controls
- replay system
- drone camera physics
- full director mode replacement
- route planner changes

---

# New System

## File

```text
wall/systems/presentation/regionalFlightCameraRig.js
```

## Classification

```text
camera-presentation-runtime
```

## Load Order

```text
AFTER regionalFlightTripRuntime.js
AFTER regionalFlightPlanner.js
BEFORE regionalFlightTripDebug.js
```

---

# Runtime Authority

## RegionalFlightCameraRig OWNS

- smoothed camera state
- desired camera state
- interpolation parameters
- camera profile behavior
- regional flight camera loop
- camera debug snapshot

## RegionalFlightCameraRig READS

- RegionalFlightTripRuntime state
- current trip aircraft position
- trip phase
- altitude scalar
- heading
- MapboxViewportRuntime camera methods

## RegionalFlightCameraRig MUST NOT MUTATE

- aircraft entity state
- route truth
- planner state
- cloud presets
- map style
- AircraftRenderer
- AircraftRuntime internals

---

# Camera State Model

## Desired Camera State

Each update resolves:

```js
desiredCamera = {
  centerLng,
  centerLat,
  zoom,
  pitch,
  bearing,
  durationMs,
  phase,
  altitudeScalar,
  framingMode
}
```

This is computed from trip state.

---

## Smoothed Camera State

The rig maintains:

```js
smoothedCamera = {
  centerLng,
  centerLat,
  zoom,
  pitch,
  bearing,
  initialized,
  lastUpdateMs
}
```

This state is presentation-only.

It must never modify trip state.

---

# Camera Profiles

## regional_observer_smooth

Primary profile for this build.

Behavior:

- aircraft remains near center, but not hard-locked
- altitude widens zoom gradually
- pitch increases gradually during climb/cruise
- bearing follows aircraft heading with damping
- descent recenters slowly toward destination
- arrival eases inward without snapping

---

# Recommended Camera Targets

## Zoom

Current rough formula:

```js
zoom = lerp(12.8, 7.8, altitudeScalar)
```

New recommended smoothed target:

```js
targetZoom = lerp(12.5, 7.9, altitudeScalar)
```

Then interpolate over time.

## Pitch

Current rough formula:

```js
pitch = lerp(45, 62, altitudeScalar)
```

New target:

```js
targetPitch = lerp(42, 60, altitudeScalar)
```

Pitch should change slowly.

## Bearing

Current rough formula:

```js
bearing = headingDeg - 20
```

New target:

```js
targetBearing = dampedHeading(headingDeg - 18)
```

Bearing should avoid fast rotation.

---

# Interpolation Rules

## Center Smoothing

Use exponential smoothing:

```js
current += (target - current) * alpha
```

Where alpha depends on frame delta.

Recommended:

```js
centerAlpha = 0.08 → 0.18
```

Lower during cruise.

Higher during takeoff and arrival.

---

## Zoom Smoothing

Recommended:

```js
zoomAlpha = 0.04 → 0.10
```

Zoom should feel slower than center movement.

---

## Pitch Smoothing

Recommended:

```js
pitchAlpha = 0.025 → 0.08
```

Pitch should be the slowest camera component.

---

## Bearing Smoothing

Recommended:

```js
bearingAlpha = 0.035 → 0.10
```

Bearing must wrap safely across 0/360 degrees.

---

# Phase-Aware Behavior

## PREPARE

Camera should:

- frame origin airport
- remain stable
- avoid dramatic movement

## TAXI_HOLD

Camera should:

- stay near airport
- allow subtle anticipation
- not over-follow tiny ground movement

## TAKEOFF

Camera should:

- follow more actively
- retain airport/geography context
- avoid sudden zoom-out

## CLIMB

Camera should:

- widen gradually
- increase pitch slowly
- begin regional observer feel

## CRUISE

Camera should:

- move slowly
- breathe
- allow scenery to carry the shot
- avoid overcorrecting every heading change

## DESCENT

Camera should:

- slowly tighten framing
- preserve destination context
- ease bearing toward approach direction

## ARRIVAL

Camera should:

- stabilize
- reduce pitch slightly
- avoid snapping to destination
- feel like a soft landing sequence

---

# Framing Bias

## Aircraft Offset

Aircraft does not need to sit dead center.

Allow slight screen-space bias:

- ahead of aircraft direction
- toward destination during descent
- slightly lower frame position during cruise to show sky/atmosphere

This creates:

```text
observational composition
```

instead of:

```text
GPS tracking lock
```

---

# Planner Compatibility

The camera rig must work with:

- canonical NYC → BOS preset
- generated airport-to-airport plans
- coordinate-pin destinations
- scenic_coastal profile
- skyline_approach profile

It must not assume:

- JFK origin
- BOS destination
- fixed route length
- fixed cruise altitude
- fixed waypoint count

---

# Debug API

Add:

```js
SBE.RegionalFlightCameraRig = {
  VERSION,
  start,
  stop,
  setEnabled,
  getEnabled,
  setProfile,
  getProfile,
  setSmoothing,
  getSmoothing,
  snapToCurrent,
  getState
}
```

---

# Debug Commands

Bind under:

```js
_wos.debug.regionalFlight
```

Add:

```js
cameraRig(bool)
cameraRigState()
cameraSmooth(mult)
cameraSnap()
```

## Examples

```js
_wos.debug.regionalFlight.startPlan()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.cameraRig(true)
_wos.debug.regionalFlight.cameraRigState()
```

```js
_wos.debug.regionalFlight.cameraSmooth(0.5) // slower
_wos.debug.regionalFlight.cameraSmooth(1.5) // faster
_wos.debug.regionalFlight.cameraSnap()      // snap rig to current target
```

---

# Migration Requirement

RegionalFlightTripRuntime currently owns a camera timer.

This build should avoid two competing camera systems.

Preferred approach:

## Option A — Disable Existing Trip Camera Timer When Rig Active

When RegionalFlightCameraRig is enabled:

```text
RegionalFlightTripRuntime camera follow should be disabled or bypassed.
```

## Option B — Trip Runtime Delegates Camera To Rig

Trip runtime calls camera rig instead of calling MapboxViewportRuntime directly.

Preferred long-term.

---

# Success Criteria

This build succeeds if:

- regional flight camera feels smooth
- no visible 1.2s stepping remains
- camera can follow generated planner routes
- camera does not fight existing trip runtime
- zoom changes feel gradual
- pitch changes feel cinematic
- bearing changes do not whip around
- cruise feels calm
- takeoff feels active but not twitchy
- arrival feels controlled
- camera can be toggled/debugged easily

---

# Failure Conditions

This build fails if:

- camera snaps or jitters
- camera systems compete
- generated routes break framing
- camera loses aircraft completely
- pitch/zoom changes feel mechanical
- bearing spins harshly
- performance degrades
- trip runtime state is mutated
- planner state is mutated

---

# Performance Doctrine

Camera smoothing must remain cheap.

Avoid:

- physics simulation
- complex path prediction
- heavy animation libraries
- per-frame map reconfiguration beyond necessary camera updates

Prefer:

- simple exponential smoothing
- small state object
- requestAnimationFrame loop
- safe throttling if necessary

---

# Testing Flow

## Canonical Preset

```js
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.cameraRig(true)
_wos.debug.regionalFlight.jump(0.5)
```

## Planner Route

```js
_wos.debug.regionalFlight.origin('JFK')
_wos.debug.regionalFlight.destination('PHL')
_wos.debug.regionalFlight.profile('scenic_coastal')
_wos.debug.regionalFlight.plan()
_wos.debug.regionalFlight.startPlan()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.cameraRig(true)
```

## Skyline Approach

```js
_wos.debug.regionalFlight.origin('JFK')
_wos.debug.regionalFlight.pin(40.706, -74.012, 'Harbor test')
_wos.debug.regionalFlight.profile('skyline_approach')
_wos.debug.regionalFlight.plan()
_wos.debug.regionalFlight.startPlan()
_wos.debug.regionalFlight.cameraRig(true)
```

---

# Future Extensions

Not this build:

- named cinematic camera profiles
- route preview camera shots
- automatic screenshot scouting
- Director Mode handoff
- stream scene transitions
- multi-camera cuts
- camera bookmarks
- New New York fly-through presets

---

# Final Principle

The camera should feel like:

```text
a quiet observer discovering geography
```

NOT:

```text
a machine chasing coordinates
```

Regional flight becomes cinematic when the camera lets the world breathe.

---

# Implementation Guide

- Add `wall/systems/presentation/regionalFlightCameraRig.js` and wire it before `regionalFlightTripDebug.js`.
- Disable or bypass the existing RegionalFlightTripRuntime camera timer when the smoothing rig is active.
- Test canonical and planner-generated routes with `speed(60)` and verify that cruise, descent, and arrival feel smooth.
