---
title: "Regional Flight Trip Runtime Operational Roadmap"
filename: "0528L_WOS_RegionalFlightTripRuntime_OperationalRoadmap_v1.0.0.md"
version: "1.0.0"
date: "2026-05-28"
system: "WOS"
module: "Regional Flight Trip Runtime"
type: "operational-roadmap"
status: "[REVIEW]"
build_readiness: "[REVIEW]"
owner: "StudioRich / WOS"
depends_on:
  - "0528K_WOS_RegionalFlightTripRuntime_v1.0.0"
---

# 0528L_WOS_RegionalFlightTripRuntime_OperationalRoadmap_v1.0.0

# 🚦 ROADMAP STAGE

Stage: [REVIEW]  
Build Readiness: [REVIEW]  
Action: Define the next operational steps required to test, harden, and make the Regional Flight Trip Runtime fully usable inside WOS.

---

# Purpose

The Regional Flight Trip Runtime is now complete and verified at the proof-runtime level.

This roadmap defines the next steps required to move it from:

```text
verified technical runtime
```

to:

```text
fully operational cinematic world feature
```

The goal is NOT to add many routes yet.

The goal is to confirm:

- the flight reads clearly
- the camera behaves smoothly
- the aircraft remains visible
- the trip phases feel meaningful
- cloud transitions support the route
- performance remains stable
- the feature can be used for streams and videos

---

# Current Verified Capabilities

## AircraftRuntime v1.1.0

Delivered:

- `_externalControl` skip path inside `_updateEntity`
- external aircraft remain influence-capable
- `upsertExternalAircraft(entity)`
- `removeExternalAircraft(id)`

Operational meaning:

```text
Trip runtimes can now control aircraft without fighting AircraftRuntime.
```

---

## RegionalFlightTripRuntime v1.0.0

Delivered:

- NYC → Boston preset
- 5-waypoint route
- haversine-proportional route interpolation
- bearing computation
- 28,000ft cruise altitude
- 420kt cruise speed
- eased altitude profile
- 7 trip phases
- phase-based cloud preset changes
- regional observer camera profile
- pause/resume/stop/reset
- jump(p)
- setSpeed(mult)
- getState()

Operational meaning:

```text
WOS now has a longform trip runtime capable of world-scale spatial progression.
```

---

## RegionalFlightTripDebug v1.0.0

Delivered:

- `_wos.debug.regionalFlight.start()`
- `_wos.debug.regionalFlight.stop()`
- `_wos.debug.regionalFlight.pause()`
- `_wos.debug.regionalFlight.resume()`
- `_wos.debug.regionalFlight.reset()`
- `_wos.debug.regionalFlight.speed(mult)`
- `_wos.debug.regionalFlight.status()`
- `_wos.debug.regionalFlight.camera(bool)`
- `_wos.debug.regionalFlight.preset(id)`
- `_wos.debug.regionalFlight.jump(progress)`
- `_wos.debug.regionalFlight.audit()`

Operational meaning:

```text
The feature can now be tested quickly without replaying full trip duration.
```

---

# Immediate Testing Goal

Answer one core question:

```text
Can WOS deliver a smooth, readable, emotionally useful NYC → Boston regional flight trip?
```

This means testing not only whether the runtime works, but whether it feels good.

---

# Phase 1 — Boot + Integration Verification

## Goal

Confirm all runtime parts are loaded in the correct order and exposed through debug tools.

## Test Commands

```js
_wos.debug.regionalFlight.audit()
```

Expected:

- RegionalFlightTripRuntime exists
- AircraftRuntime exists
- AircraftRenderer exists
- CloudAtmosphereLayer exists
- AltitudeAwareWorldRenderer exists, if required by current stack
- no missing dependency warnings

## Success Criteria

- audit returns clean runtime state
- no console errors on boot
- debug object is available
- existing bootstrap aircraft still work
- trip aircraft does not break ordinary AircraftRuntime aircraft

## Failure Signals

- debug object missing
- AircraftRuntime not loaded
- CloudAtmosphereLayer missing
- aircraft appears but camera cannot follow
- external aircraft updates fight with AircraftRuntime

---

# Phase 2 — Basic Trip Run

## Goal

Confirm the trip can start, progress, and stop cleanly.

## Test Commands

```js
_wos.debug.regionalFlight.start()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.status()
_wos.debug.regionalFlight.stop()
```

## Success Criteria

- one trip aircraft appears
- trip progresses through phases
- aircraft position updates along route
- altitude changes over time
- stop removes the trip aircraft cleanly
- no duplicate trip aircraft remain after repeated starts/stops

## Failure Signals

- duplicate trip aircraft
- aircraft remains after stop
- phase does not advance
- altitude remains fixed
- trip restarts from incorrect state
- status returns stale state

---

# Phase 3 — Phase Jump Testing

## Goal

Verify that every major trip phase is visually and mechanically readable.

## Test Commands

```js
_wos.debug.regionalFlight.start()
_wos.debug.regionalFlight.speed(1)

_wos.debug.regionalFlight.jump(0.00) // PREPARE
_wos.debug.regionalFlight.jump(0.09) // TAKEOFF
_wos.debug.regionalFlight.jump(0.24) // CRUISE BEGIN
_wos.debug.regionalFlight.jump(0.50) // MID-CRUISE
_wos.debug.regionalFlight.jump(0.76) // DESCENT BEGIN
_wos.debug.regionalFlight.jump(0.94) // ARRIVAL BEGIN
_wos.debug.regionalFlight.jump(1.00) // COMPLETE
```

## Success Criteria

| Progress | Expected Read |
|---|---|
| 0.00 | aircraft at origin / grounded |
| 0.09 | takeoff behavior begins |
| 0.24 | aircraft reaches cruise behavior |
| 0.50 | aircraft is over route midpoint |
| 0.76 | descent begins |
| 0.94 | arrival sequence begins |
| 1.00 | destination complete |

## Failure Signals

- jump causes camera jank
- aircraft vanishes
- altitude profile breaks
- state and position disagree
- route midpoint feels geographically wrong
- complete state fails to clean up properly

---

# Phase 4 — Camera Follow Review

## Goal

Confirm the regional observer camera feels cinematic, not robotic.

## Test Commands

```js
_wos.debug.regionalFlight.start()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.camera(true)
```

Then test:

```js
_wos.debug.regionalFlight.jump(0.10)
_wos.debug.regionalFlight.jump(0.50)
_wos.debug.regionalFlight.jump(0.90)
```

## Success Criteria

Camera should feel:

- smooth
- observant
- stable
- readable
- geographically grounded

Camera should NOT feel:

- twitchy
- lost
- too zoomed in
- too zoomed out
- overcorrected
- disconnected from the aircraft

## Specific Review Questions

- Does the aircraft stay readable at cruise?
- Does the map still feel like geography, not abstract texture?
- Does pitch increase feel cinematic?
- Does zoom pullback at altitude feel natural?
- Does the camera cadence cause visible stepping?

## Likely Fix Area

The current 1.2s cadence may need smoothing or interpolation if camera jumps feel mechanical.

---

# Phase 5 — Visual Presence Review

## Goal

Confirm the aircraft feels present in the world, not just technically located.

## Review Targets

- aircraft size by altitude
- silhouette readability
- shadow behavior
- lighting consistency
- aircraft color/palette
- distance clarity
- icon vs low-poly transition
- heading readability

## Success Criteria

The aircraft should feel:

```text
small but intentional
```

NOT:

```text
lost, flat, or map-symbolic
```

## Likely Next Feature Needs

- subtle contrail or vapor trail
- altitude-aware shadow fade polish
- aircraft light twinkle at distance
- optional route ghost line for debug only
- phase-aware aircraft presentation

---

# Phase 6 — Cloud + Atmosphere Review

## Goal

Determine whether phase-based cloud presets support the emotional trip arc.

## Current Phase Mapping

| Phase | Cloud Preset |
|---|---|
| PREPARE | clear |
| TAXI_HOLD | clear |
| TAKEOFF | thin |
| CLIMB | thin |
| CRUISE | harbor_fog |
| DESCENT | harbor_fog |
| ARRIVAL | clear |

## Success Criteria

Cloud transitions should:

- make phase changes legible
- support travel atmosphere
- not feel random
- not obscure aircraft completely
- make cruise feel different from takeoff/arrival

## Failure Signals

- cloud preset change feels abrupt
- harbor_fog overpowers the scene
- phase change is invisible
- atmosphere becomes too busy
- clouds distract from aircraft

## Likely Fix Area

Need crossfade or transition smoothing between cloud presets.

---

# Phase 7 — Performance + Stability Pass

## Goal

Confirm the feature is safe for long-running streams.

## Test Procedure

Run:

```js
_wos.debug.regionalFlight.start()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.camera(true)
```

Observe for full accelerated trip.

Then repeat:

```js
_wos.debug.regionalFlight.reset()
_wos.debug.regionalFlight.speed(120)
```

## Success Criteria

- no growing memory usage visible in browser task manager
- no duplicate timers
- no accumulating aircraft entities
- no camera timer leak
- no repeated cloud spam
- no runaway console logs
- stable frame pacing

## Failure Signals

- performance degrades after repeated starts
- trip stop does not clear camera timer
- cloud preset logs repeatedly every tick
- AircraftRuntime retains removed trip aircraft
- visual jitter increases over time

---

# Phase 8 — Stream Readiness Pass

## Goal

Determine whether the feature is ready to appear in a WOS video/stream.

## Stream Test Script

1. Start at JFK.
2. Enable camera follow.
3. Speed to 60x.
4. Watch takeoff.
5. Jump to mid-cruise.
6. Watch atmospheric segment.
7. Jump to descent.
8. Watch arrival.
9. Stop and confirm clean reset.

## Success Criteria

Feature is stream-ready if:

- viewer can understand the aircraft journey
- camera view is visually pleasant
- trip has a beginning/middle/end
- no console intervention is needed after start
- visual identity feels aligned with WOS
- atmosphere supports the journey

## Not Stream-Ready If

- aircraft is difficult to see
- camera is unpleasant
- phases are invisible
- clouds feel broken
- trip feels like a debug demo only

---

# Operational Priority Stack

## Priority 1 — Confirm Runtime Safety

Before visual polish:

- no leaks
- clean start/stop
- no duplicate actors
- stable camera timers
- stable CloudAtmosphere calls

---

## Priority 2 — Confirm Visual Readability

Before adding routes:

- aircraft visible
- phase legible
- altitude understandable
- camera pleasant

---

## Priority 3 — Add Emotional Flight Presence

Once safe/readable:

- contrail
- navigation lights
- distant twinkle
- cloud interaction
- shadow polish
- atmospheric entry/exit behavior

---

## Priority 4 — Add Additional Presets

Only after the first route feels good:

- NYC → DC
- NYC → Montreal
- NYC → Philadelphia
- NYC → Chicago
- Harbor flyover
- New New York future route

---

# Recommended Next Spec

## 0528M_WOS_RegionalFlightPresencePass_v1.0.0

Purpose:

```text
Make the regional flight trip visually and emotionally readable enough for stream/video use.
```

Scope:

- aircraft visibility
- altitude-aware presentation
- contrail/vapor hint
- distant lights
- phase-aware visual treatment
- cloud transition smoothing
- camera smoothness review

Build Readiness:

```text
[BUILD]
```

Only after Phase 1–7 testing confirms runtime safety.

---

# Risks To Watch

## 1. Over-Adding Routes Too Early

Risk:

```text
more routes without better presence
```

This creates feature breadth without emotional payoff.

---

## 2. Camera Jank

A technically working route can still feel bad if camera motion is harsh.

Camera polish is critical.

---

## 3. Cloud Preset Abruptness

Atmosphere transitions must feel cinematic, not like toggles.

---

## 4. Aircraft Symbol Problem

If aircraft looks like a map icon instead of a world actor, the feature will feel shallow.

---

## 5. Runtime Leakage

Long-running streams require clean timers and cleanup.

This must be verified before relying on the system.

---

# Definition of Fully Operational

The Regional Flight Trip Runtime becomes fully operational when:

```text
A user can start a trip,
watch it progress through phases,
follow it cinematically,
observe atmosphere changes,
stop/reset cleanly,
and use it as stream/video content without developer babysitting.
```

---

# Final Recommendation

Do NOT expand this system horizontally yet.

First make the NYC → Boston route:

```text
safe,
visible,
smooth,
cinematic,
and stream-ready.
```

Once that route feels alive, the runtime can become the foundation for:

- regional aviation cinema
- sky transit systems
- New New York travel corridors
- atmospheric journeys
- longform WOS route storytelling
