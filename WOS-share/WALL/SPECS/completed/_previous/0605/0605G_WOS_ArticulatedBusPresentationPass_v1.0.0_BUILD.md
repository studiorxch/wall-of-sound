---
layout: spec
title: "Articulated Bus Presentation Pass"
date: 2026-06-05
doc_id: "0605G_WOS_ArticulatedBusPresentationPass_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "articulated_bus_presentation"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Adds visual articulation behavior for two-piece buses while preserving existing transit truth, selection, smoothing, and assignment authorities."
---

# 0605G_WOS_ArticulatedBusPresentationPass_v1.0.0_BUILD

## PURPOSE

Replace rigid articulated-bus rendering with a believable two-segment presentation model.

Current state:

```text
articulated route
→ articulated silhouette
→ single rigid motion
```

Target state:

```text
articulated route
→ front section
→ accordion joint
→ rear section
→ visual bend
```

This is a presentation-only pass.

No transit truth changes.

---

# CORE PRINCIPLES

- 2D owns truth
- 2.5D owns presentation
- buses are infrastructure
- readability over realism
- articulation is visual, not simulated
- continuity over twitch response

---

# AUTHORITY BOUNDARIES

## Owns

- articulated bus presentation state
- rear segment visual positioning
- accordion bend computation
- articulation debug metrics

## Reads

- BusAssetResolver
- BusMotionSmoothing
- TruthActorRuntime
- TransitAssignmentAuthority
- vehicle.bus actors

## Writes

- presentation payload metadata only

## Forbidden

- actor mutation
- route mutation
- feed mutation
- selector mutation
- camera mutation
- Mapbox source/layer mutation

---

# ELIGIBILITY

Applies only when:

```text
busAssetClass == articulated
```

Examples:

```text
M15+
B44 SBS
M34A-SBS
```

Standard, shuttle, express:

```text
no articulation pass
```

---

# PRESENTATION MODEL

Front segment:

```text
truth anchor
heading authority
```

Rear segment:

```text
derived presentation position
```

Joint:

```text
derived visual connector
```

No independent physics.

---

# DATA MODEL

```js
type ArticulatedPresentationState = {
  actorId: string
  frontLng: number
  frontLat: number

  rearLng: number
  rearLat: number

  bendAngleDeg: number

  lastUpdateMs: number
}
```

---

# CONSTANTS

```js
ARTICULATED_SEGMENT_LENGTH_M = 18
MAX_BEND_DEG = 32
BEND_SMOOTHING_FACTOR = 0.15
CACHE_LIMIT = 2000
```

---

# PUBLIC API

```js
SBE.ArticulatedBusPresentationPass

start()
stop()
isActive()

observe(actor)
getPresentationState(actorId)

clear()
getState()
getStats()

setEnabled()
setDebug()
```

---

# EXECUTION FLOW

```text
bus actor
→ smoothing position
→ heading history
→ bend estimate
→ rear segment projection
→ joint projection
→ renderer consumes result
```

---

# BEND ESTIMATION

Use heading history.

Not route geometry.

Not map matching.

```text
current heading
vs
recent heading trend
```

produces:

```text
bendAngleDeg
```

Clamp:

```js
±32°
```

---

# RENDERER INTEGRATION

WorldSpaceVehicleLayer gains:

```text
bus-articulated-front
bus-articulated-joint
bus-articulated-rear
```

Visual result:

```text
front box
accordion section
rear box
```

at close zooms.

Regional/cruise may simplify.

---

# ALTITUDE POLICY

Low:

```text
full articulation
```

City:

```text
full articulation
reduced detail
```

Regional:

```text
single articulated silhouette
```

Cruise:

```text
aggregate transit field only
```

---

# DEBUG COMMANDS

```js
_wos.debug.transit.articulatedState(actorId)
_wos.debug.transit.articulatedStats()
_wos.debug.transit.articulatedEnable(true)
```

---

# ACCEPTANCE TESTS

## T1

Loads safely.

## T2

Inactive by default.

## T3

Standard bus ignored.

## T4

Articulated bus accepted.

## T5

Rear segment generated.

## T6

Joint generated.

## T7

Bend clamped.

## T8

No actor mutation.

## T9

No selector mutation.

## T10

No smoothing mutation.

## T11

No assignment mutation.

## T12

No camera mutation.

## T13

No Mapbox mutation.

## T14

Regional simplifies.

## T15

Cruise disabled.

## T16

Debug commands return structured data.

---

# NON-GOALS

- bus stop behavior
- passenger simulation
- route prediction
- wheel animation
- suspension physics
- door animation
- camera targeting
- graffiti rendering
- ad rendering

---

# DEFERRED

```text
0605H_WOS_TransitStopDwellCuePass_v1.0.0_BUILD
0605I_WOS_HeroTransitShotPresets_v1.0.0_BUILD
0605J_WOS_TransitEventBlockPartyPrototype_v1.0.0_BUILD
```

---

# IMPLEMENTATION GUIDE

- Where: `wall/systems/transit/articulatedBusPresentationPass.js` plus additive integration inside `worldSpaceVehicleLayer.js`.
- What: `node --check wall/systems/transit/articulatedBusPresentationPass.js`
- Expect: articulated buses visually bend as two connected vehicle sections while all transit truth remains unchanged.
