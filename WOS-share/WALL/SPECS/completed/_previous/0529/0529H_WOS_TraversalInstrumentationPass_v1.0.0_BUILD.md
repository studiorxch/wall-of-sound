---
layout: spec
title: "Traversal Instrumentation Pass"
date: 2026-05-29
doc_id: "0529H_WOS_TraversalInstrumentationPass_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "observability"
component: "traversal_instrumentation"
type: "runtime-spec"
status: "active"
stage: "[BUILD]"
freeze_decision: "GO"
build_scope: "speed-altitude-hud-actor-pov-telemetry"
priority: "high"
risk: "medium"
classification: "support-system"
summary: "Add runtime visibility and deterministic stepped controls for traversal speed, altitude, actor identity, POV identity, real/sim time, and future cloud feasibility without adding new traversal architecture."
doctrine:
  - "Measure first. Preset later."
  - "Actor owns movement truth. POV owns camera interpretation."
  - "1x equals world-time reference."
  - "No fake weather truth. WOS may interpret real weather, not fabricate it."
depends_on:
  - "0529_WOS_ActorPOVTraversalDoctrine_v1.0.0"
  - "traversalControlDeck.js"
  - "traversalHUD.js"
  - "regionalFlightTripRuntime.js"
  - "regionalFlightCameraRig.js"
enables:
  - "CloudAuthorityInvestigation"
  - "HeroVehicleRoadRouting"
  - "TransportModeExpansion"
tags:
  - "traversal"
  - "hud"
  - "speed"
  - "altitude"
  - "actor-pov"
---

# 0529H_WOS_TraversalInstrumentationPass_v1.0.0_BUILD

## Purpose

Flight traversal is finally producing useful observations.

This patch adds the missing visibility and small deterministic controls needed to tune traversal from real use instead of guesswork.

This patch must answer:

```text
How fast are we moving?
How high are we?
What actor are we observing?
What POV is active?
What does zoom mean in altitude terms?
What values feel good?
```

This patch does **not** add Drive, Walk, Bike, Transit, cloud rendering, bird mode, balloon mode, or observer-mode expansion.

---

# Core Doctrine

## Measure First

Do not freeze speed defaults, altitude defaults, cloud behavior, or new transport behavior until the HUD exposes usable telemetry.

```text
Measure first.
Preset later.
```

## Actor / POV Separation

```text
Actor = movement truth.
POV = camera interpretation.
```

A camera may observe an actor.
A camera may attach to an actor.
A camera may be represented by a CameraDrone actor later.

But camera interpretation must not overwrite actor movement truth.

## Speed Truth

```text
1x = world-time reference.
```

Any value above `1x` is time compression.
Any value below `1x` is slow-motion / observation pacing.

The label `Slow` must not mean faster than real time.

---

# Required Files

Update:

```text
wall/systems/presentation/traversalControlDeck.js
wall/systems/presentation/traversalHUD.js
wall/systems/presentation/regionalFlightCameraRig.js
wall/systems/world/regionalFlightTripRuntime.js
```

Only touch other files if required to expose read-only telemetry safely.

---

# Part 1 — Replace Speed Presets With Stepped Controls

Remove the current speed presets:

```js
Slow   = 20x
Normal = 40x
Fast   = 80x
```

They are all too fast for normal viewing and should no longer be treated as primary speed modes.

Add deterministic stepped controls:

```text
Speed [-] [1x] [+]
```

Use this initial ladder:

```js
const TRAVERSAL_SPEED_STEPS = [
  0.25,
  0.5,
  1,
  2,
  5,
  10,
  20,
  40,
  80
];
```

Default:

```js
1
```

Rules:

- `0.25x` and `0.5x` represent observation / drone / slow-motion pacing.
- `1x` represents real-time world reference.
- `2x–10x` represent watchable compression.
- `20x` represents fast video compression.
- `40x–80x` are debug/turbo values but may remain reachable while tuning.
- No slider.
- No arbitrary numeric input.
- Step buttons only.

Expected UI:

```text
Speed  [-]  1x  [+]
```

---

# Part 2 — Add Stepped Altitude / Zoom Controls

Add deterministic altitude controls:

```text
Altitude [-] [35,000 ft / Z11] [+]
```

No slider.

Use a provisional mapping for investigation:

```js
const FLIGHT_ALTITUDE_STEPS = [
  { id: 'ground',   label: 'Ground',   altitudeFt: 500,   zoom: 15.0, pitch: 42 },
  { id: 'low',      label: 'Low',      altitudeFt: 1500,  zoom: 14.0, pitch: 44 },
  { id: 'city',     label: 'City',     altitudeFt: 5000,  zoom: 13.0, pitch: 46 },
  { id: 'regional', label: 'Regional', altitudeFt: 12000, zoom: 12.0, pitch: 48 },
  { id: 'cruise',   label: 'Cruise',   altitudeFt: 35000, zoom: 11.0, pitch: 50 }
];
```

Default:

```js
cruise
```

Important:

```text
For normal Flight, zoom must not go wider than 11.0.
```

That means:

```js
zoom >= 11.0
```

Do not allow normal Flight to drift into zoom `10`, `9`, `8`, or `7` unless a later explicit Satellite / World View mode exists.

Reason:

```text
Zoom 7–8 reads as abstract map movement, not travel.
```

---

# Part 3 — Separate Actor Altitude, POV Altitude, and Zoom

Add explicit terminology in code comments and state exports:

```text
actorAltitudeFt = movement truth altitude
povAltitudeOffsetFt = camera offset relative to actor
zoom = presentation scale
```

Do not collapse these values into one field.

If only one true altitude exists today, expose it as:

```js
actorAltitudeFt
```

and expose the others as:

```js
povAltitudeOffsetFt: 0
zoom: map.getZoom()
```

This prevents future coupling.

---

# Part 4 — Improve HUD Time Readouts

Current HUD elapsed time is misleading because it shows simulated elapsed time as if it were real elapsed time.

Replace:

```text
ELAPSED
```

with:

```text
REAL
SIM
```

Example:

```text
REAL      2m 13s
SIM       86m 03s
REMAIN    1m 24s real
```

Rules:

- `REAL` = actual wall-clock time since launch.
- `SIM` = world/trip elapsed time after multiplier.
- `REMAIN` = remaining wall-clock time at current speed.
- HUD must make speed compression obvious.

---

# Part 5 — Add Actor / POV HUD Readouts

Add read-only HUD fields:

```text
ACTOR     aircraft
POV       forward
ALT       35,000 ft
ZOOM      11.0
PITCH     50°
BEARING   218°
SPEED     1x
```

If actor / POV are unknown, show:

```text
ACTOR     unknown
POV       unknown
```

Do not hide missing telemetry.

Missing telemetry is useful during testing.

---

# Part 6 — Add Debug Snapshot

Add:

```js
_wos.debug.traversalDeck.actor()
```

Returns:

```js
{
  actorType: 'aircraft',
  transportState: 'flight',
  povType: 'forward',
  speedMultiplier: 1,
  actorAltitudeFt: 35000,
  povAltitudeOffsetFt: 0,
  zoom: 11,
  pitch: 50,
  bearing: 218,
  routeDistanceKm: 9842,
  progressPct: 37.2,
  phase: 'CRUISE'
}
```

Add:

```js
_wos.debug.hud.snapshot()
```

Ensure it includes the same actor / POV / altitude / time fields.

Debug methods are read-only except the explicit step controls.

---

# Part 7 — Add Debug Step Commands

Add:

```js
_wos.debug.traversalDeck.speedDown()
_wos.debug.traversalDeck.speedUp()
_wos.debug.traversalDeck.altitudeDown()
_wos.debug.traversalDeck.altitudeUp()
```

Each returns the new applied state.

Example:

```js
_wos.debug.traversalDeck.speedDown()
// { speedMultiplier: 0.5, label: '0.5x' }
```

```js
_wos.debug.traversalDeck.altitudeUp()
// { altitudeFt: 35000, zoom: 11, pitch: 50, label: 'Cruise' }
```

These must call the same internal functions as the UI buttons.

No duplicated logic.

---

# Part 8 — Cloud Feasibility Placeholder

Do not render clouds in this patch.

Add a read-only feasibility report:

```js
_wos.debug.traversalDeck.cloudFeasibility()
```

Returns:

```js
{
  doctrine: 'Real weather determines cloud truth. WOS determines visual interpretation.',
  requiredFields: [
    'cloudCoverPct',
    'cloudCeilingFt',
    'cloudLayerAltitudeFt',
    'visibilityMeters',
    'weatherConditionRaw'
  ],
  availableNow: {},
  missing: [],
  status: 'investigation-only'
}
```

This patch must not fabricate weather.

Rule:

```text
If real weather says clear sky, WOS may render clear sky.
No fake clouds just to make the shot pretty.
```

Future WOS may stylize real cloud truth.

---

# Part 9 — Hero Vehicle Feasibility Placeholder

Do not build Drive yet.

Add a read-only feasibility report:

```js
_wos.debug.traversalDeck.heroVehicleFeasibility()
```

Returns:

```js
{
  actorType: 'car',
  requiredRouteAuthority: 'road-network-polyline',
  requiredDataSource: 'Mapbox Directions API or equivalent',
  trafficRequiredForPrototype: false,
  firstPrototype: 'single hero car',
  recommendedPOV: ['chase', 'side', 'overhead'],
  status: 'high-feasibility-investigation-only'
}
```

Important:

```text
Hero car does not require traffic simulation.
```

One actor following one road-aware route is enough for the first Drive prototype.

---

# Part 10 — Transport Mode Guardrails

Transportation buttons may remain visible only if their status is honest.

Current status:

```text
Flight  active
Drive   experimental / investigation
Walk    experimental / investigation
Bike    experimental / investigation
Transit disabled
```

Rules:

- Drive / Walk / Bike must not silently fall back to Flight.
- Transit remains disabled.
- Clicking unavailable modes must clearly say not implemented.
- No fake behavior.

---

# UI Requirements

Primary nav remains simple.

Allowed visible controls:

```text
Transport
Destination
Speed stepper
Altitude stepper
Launch
```

Do not reintroduce:

```text
quick chips
route modes
preset menus
ADV panels
warmup toggles
continuity toggles
veil toggles
building toggles
camera mode selectors
```

---

# Acceptance Tests

## Test 1 — Speed Truth

Launch a flight.

Expected:

```text
Speed default is 1x.
Slow values below 1x are possible.
20x is no longer labeled Slow.
```

## Test 2 — Altitude Cap

Step altitude upward.

Expected:

```text
Normal Flight stops at zoom 11.0.
It does not drift to zoom 10, 9, 8, or 7.
```

## Test 3 — HUD Time Clarity

Launch a high-speed trip.

Expected:

```text
HUD shows REAL and SIM separately.
The user can tell whether 86m is simulated or real elapsed time.
```

## Test 4 — Actor / POV Visibility

Run:

```js
_wos.debug.traversalDeck.actor()
```

Expected:

```text
actorType, transportState, povType, altitude, zoom, pitch, bearing, speed are visible.
```

## Test 5 — No Transport Fakes

Click Drive / Walk / Bike / Transit.

Expected:

```text
Unavailable modes do not launch Flight.
Unavailable modes clearly report status.
```

---

# Non-Goals

This patch does NOT:

```text
implement Drive
implement Walk
implement Bike
implement Transit
render clouds
add observer modes
add hero car
add traffic
add AI agents
create entity doctrine
create actor spawning systems
```

Those are future systems.

This patch gives WOS the instrumentation to make those future systems safer.

---

# Implementation Guide

- **Where**: Update `wall/systems/presentation/traversalControlDeck.js`, `wall/systems/presentation/traversalHUD.js`, and only the camera/runtime files required to expose actor, POV, speed, and altitude telemetry.
- **What**: Replace Slow/Normal/Fast internals with speed step buttons, add altitude step buttons, split HUD `REAL` and `SIM` time, expose `_wos.debug.traversalDeck.actor()`, `speedUp()`, `speedDown()`, `altitudeUp()`, `altitudeDown()`, `cloudFeasibility()`, and `heroVehicleFeasibility()`.
- **Expect**: User can launch Flight, step speed/altitude live, see actor/POV/altitude/zoom/pitch/bearing/REAL/SIM time in HUD, and gather tuning data without new traversal systems or fake transport behavior.
