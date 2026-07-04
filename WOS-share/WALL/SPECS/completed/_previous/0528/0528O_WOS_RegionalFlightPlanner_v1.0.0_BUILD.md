---
title: "Regional Flight Planner"
filename: "0528O_WOS_RegionalFlightPlanner_v1.0.0_BUILD.md"
version: "1.0.0"
date: "2026-05-28"
system: "WOS"
module: "Regional Flight"
type: "runtime-build-spec"
status: "[BUILD]"
build_readiness: "[BUILD]"
owner: "StudioRich / WOS"
depends_on:
  - "0528K_WOS_RegionalFlightTripRuntime_v1.0.0"
  - "0528N_WOS_RegionalFlightPresencePass_v1.0.0"
---

# 0528O_WOS_RegionalFlightPlanner_v1.0.0_BUILD

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Replace single hardcoded regional route dependency with planner-driven airport selection, destination pinning, and generated test routes.

---

# Purpose

The RegionalFlightTripRuntime currently proves that WOS can run a complete longform aircraft journey.

However, it is still limited by a hardcoded route:

```text
NYC → Boston Regional Flight
```

This spec introduces the first Regional Flight Planner layer so WOS can:

- choose an origin airport
- choose or pin a destination
- generate a route from origin to destination
- test different day/night locations
- test atmospheric and camera conditions
- reuse the same Trip Runtime without hardcoding every path

This is the transition from:

```text
hardcoded demo trip
```

to:

```text
planner-driven regional travel infrastructure
```

---

# Core Doctrine

## Planner Generates Travel Intent

The planner defines:

- origin
- destination
- route shape
- trip profile
- optional scenic intent

The planner does NOT own:

- aircraft rendering
- aircraft lifecycle truth
- cloud rendering
- camera rendering
- aircraft presence effects
- map style authority

---

## Trip Runtime Executes

RegionalFlightTripRuntime remains responsible for:

- lifecycle timing
- route interpolation
- altitude profile
- active trip state
- trip aircraft registration
- camera follow hooks
- phase state

The planner produces trip inputs.

It does not replace the runtime.

---

## Presence Pass Makes Routes Worth Watching

This planner depends on the aircraft presence pass.

More routes should only scale once flights are visually readable.

---

# Scope

This spec includes:

- airport registry
- destination pinning
- route generation
- planner preset creation
- debug commands
- route preview support
- route-to-trip handoff
- basic day/night testing hooks

This spec does NOT include:

- live ADS-B ingestion
- full ATC simulation
- commercial airline schedules
- aviation regulations
- advanced weather routing
- multiplayer route sharing
- New New York sky property systems
- ownership systems

---

# New System

## File

```text
wall/systems/world/regionalFlightPlanner.js
```

## Classification

```text
planner-runtime
```

## Load Order

```text
AFTER regionalFlightTripRuntime.js
BEFORE regionalFlightTripDebug.js
```

---

# Runtime Authority

## RegionalFlightPlanner OWNS

- airport registry
- destination registry
- user-pinned destination
- generated route object
- generated preset object
- route profile selection
- planner state snapshot

## RegionalFlightPlanner READS

- RegionalFlightTripRuntime
- MapboxViewportRuntime
- current map center, when available
- optional time/environment state

## RegionalFlightPlanner MUST NOT MUTATE

- aircraft entity state directly
- AircraftRuntime internals
- AircraftRenderer internals
- map style authority
- cloud rendering truth
- AIS/vessel runtime
- ObjectProfileRegistry

---

# Airport Registry

The planner should include a small initial airport registry.

## Required Airports

```js
JFK
LGA
EWR
BOS
PHL
DCA
IAD
BDL
ALB
YUL
```

Each airport entry should include:

```js
{
  id: 'JFK',
  label: 'John F. Kennedy International Airport',
  city: 'New York',
  region: 'NYC',
  lat: 40.6413,
  lng: -73.7781,
  defaultDepartureHeadingDeg: 310,
  defaultArrivalHeadingDeg: 130,
  enabled: true
}
```

---

# Destination Modes

The planner must support three destination modes.

## 1. Airport Destination

Choose destination from airport registry.

Example:

```js
planAirportToAirport('JFK', 'BOS')
```

---

## 2. Coordinate Destination

Use explicit lat/lng.

Example:

```js
planToCoordinate('JFK', {
  lat: 40.7128,
  lng: -74.0060,
  label: 'Lower Manhattan'
})
```

---

## 3. Map Pin Destination

Use current map interaction or debug command to set a destination.

Example:

```js
pinDestination({
  lat: 40.706,
  lng: -74.012,
  label: 'Harbor approach test'
})
```

---

# Route Generation

## Route Type

Initial route generation should use:

```text
great-circle / haversine interpolation with optional scenic bend points
```

## Generated Route Shape

A generated route should output:

```js
{
  id,
  label,
  originAirportId,
  destination,
  durationMs,
  aircraftClass,
  cruiseAltitudeFt,
  cruiseSpeedKts,
  cameraProfile,
  route: [
    { lat, lng, label },
    ...
  ],
  plannerMeta: {
    profileId,
    generatedAtMs,
    distanceKm,
    routeMode,
    scenicBias
  }
}
```

---

# Route Profiles

## Required Profiles

### direct

Fastest planner mode.

- origin
- midpoint
- destination

Use for basic runtime testing.

---

### scenic_coastal

Adds one or two bend points toward water/coastline where possible.

Use for:

- harbor views
- East Coast atmosphere
- sunrise/sunset scouting

---

### skyline_approach

Designed for lower-altitude cinematic approaches near destination.

Use for:

- NYC skyline testing
- harbor arrival
- future New New York fly-bys

---

# Duration Estimation

Duration should be computed from distance.

Initial simple rule:

```text
durationMs = clamp(distanceKm / cruiseKmPerMin, 20min, 180min)
```

Where:

```text
cruiseKmPerMin ≈ 12.96
```

This approximates 420 knots.

Allow debug override.

---

# Altitude Selection

Initial altitude rules:

| Distance | Cruise Altitude |
|---|---|
| < 80km | 9000ft |
| 80–250km | 18000ft |
| 250km+ | 28000ft |

This keeps short routes from climbing unrealistically high.

---

# Planner API

Expose:

```js
SBE.RegionalFlightPlanner = {
  VERSION,
  listAirports,
  getAirport,
  setOriginAirport,
  getOriginAirport,
  pinDestination,
  clearDestination,
  getDestination,
  planAirportToAirport,
  planToCoordinate,
  setProfile,
  getProfile,
  generatePlan,
  startPlan,
  previewPlan,
  clearPreview,
  getState
}
```

---

# Trip Runtime Handoff

## Requirement

RegionalFlightTripRuntime must accept planner-generated presets.

Add or confirm:

```js
startWithPresetObject(preset)
```

or equivalent.

If current runtime only accepts preset IDs, add a safe planner handoff method:

```js
RegionalFlightTripRuntime.startGeneratedTrip(generatedPreset)
```

This must:

- validate generated preset shape
- stop existing generated trip if necessary
- register generated preset temporarily
- start trip through existing lifecycle code

---

# Route Preview

The planner should support a lightweight route preview.

## Preview Behavior

Preview should draw:

- route line
- origin marker
- destination marker
- optional midpoint markers

Preview must be:

- debug/dev only initially
- toggleable
- non-authoritative
- visually subtle

## Preferred File

```text
wall/systems/presentation/regionalFlightPlannerDebug.js
```

or extend existing debug companion if small.

---

# Debug Commands

Add to:

```js
_wos.debug.regionalFlight
```

## Required Commands

```js
planner()
airports()
origin(id)
destination(idOrLatLng)
pin(lat, lng, label)
profile(id)
plan()
preview()
clearPreview()
startPlan()
```

## Example Testing Flow

```js
_wos.debug.regionalFlight.airports()
_wos.debug.regionalFlight.origin('JFK')
_wos.debug.regionalFlight.destination('PHL')
_wos.debug.regionalFlight.profile('scenic_coastal')
_wos.debug.regionalFlight.plan()
_wos.debug.regionalFlight.preview()
_wos.debug.regionalFlight.startPlan()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.camera(true)
```

## Coordinate Destination Example

```js
_wos.debug.regionalFlight.origin('JFK')
_wos.debug.regionalFlight.pin(40.706, -74.012, 'Harbor test')
_wos.debug.regionalFlight.profile('skyline_approach')
_wos.debug.regionalFlight.plan()
_wos.debug.regionalFlight.startPlan()
```

---

# Day / Night Testing Hooks

The planner should not own time-of-day.

However, generated plans should support metadata for testing:

```js
plannerMeta: {
  suggestedTimeOfDay: 'dawn' | 'day' | 'dusk' | 'night',
  suggestedWeather: 'clear' | 'thin' | 'harbor_fog'
}
```

These are advisory only.

Future systems may read them.

---

# Validation

Planner must validate:

- origin airport exists
- destination exists
- lat/lng are valid numbers
- route has at least 2 points
- durationMs is finite
- cruiseAltitudeFt is finite
- cameraProfile exists or falls back safely
- aircraftClass is valid or defaults to regional

On validation failure:

- do not start trip
- log clear warning
- preserve previous active trip state

---

# Safety Rules

The planner must not:

- mutate AircraftRuntime directly
- call AircraftRenderer directly
- force cloud presets directly
- change map style
- auto-start routes without explicit command
- create duplicate active generated trips
- permanently inject generated routes into canonical presets unless requested

---

# Success Criteria

This build succeeds if:

- user can select origin airport
- user can select destination airport
- user can pin a coordinate destination
- planner generates valid route object
- generated route can start through RegionalFlightTripRuntime
- generated route supports speed/camera/jump controls
- route preview can be toggled
- no hardcoded NYC → BOS dependency remains for testing
- existing NYC → BOS preset still works

---

# Failure Conditions

This build fails if:

- planner bypasses Trip Runtime
- planner mutates aircraft state directly
- generated routes cannot be stopped/reset cleanly
- preview becomes visually noisy
- route generation corrupts canonical preset state
- debug commands are confusing or inconsistent
- the feature becomes an aviation sim instead of a WOS travel planner

---

# Future Extensions

## Not This Build

Future specs may add:

- route planner UI panel
- click-to-pin map interaction
- sunrise/sunset route testing
- saved route presets
- New New York sky corridors
- climate flyover routes
- maritime-to-air mixed journeys
- real airport metadata import
- route scoring by cinematic quality

---

# Final Principle

The Regional Flight Planner exists so WOS can ask:

```text
Where should the camera fly today?
```

not merely:

```text
Which hardcoded route should run?
```

It turns regional flight from a demo into a reusable cinematic travel instrument.

---

# Implementation Guide

- Add `wall/systems/world/regionalFlightPlanner.js` and wire it before the debug companion.
- Add planner debug commands under `_wos.debug.regionalFlight` without removing existing trip commands.
- Expect planner-generated trips to run through the existing RegionalFlightTripRuntime, with NYC → BOS remaining as a fallback preset.
