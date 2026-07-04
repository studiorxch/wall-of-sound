---
title: "Regional Flight Presence Pass"
filename: "0528N_WOS_RegionalFlightPresencePass_v1.0.0_BUILD.md"
version: "1.0.0"
date: "2026-05-28"
system: "WOS"
module: "Regional Flight"
type: "presentation-build-spec"
status: "[BUILD]"
build_readiness: "[BUILD]"
owner: "StudioRich / WOS"
depends_on:
  - "0528K_WOS_RegionalFlightTripRuntime_v1.0.0"
---

# 0528N_WOS_RegionalFlightPresencePass_v1.0.0_BUILD

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Transform regional aircraft from technical route actors into atmospheric cinematic world-presence actors.

---

# Purpose

This spec defines the first cinematic presence pass for:

```text
RegionalFlightTripRuntime
```

The runtime currently functions correctly at the:

- routing
- lifecycle
- interpolation
- atmospheric trigger
- camera orchestration

level.

However, aircraft currently risk reading as:

```text
map symbols moving through geography
```

instead of:

```text
living atmospheric actors embedded in world space
```

This pass exists to improve:

- readability
- silhouette identity
- atmospheric integration
- cruise presence
- cinematic visibility
- observer experience

WITHOUT:

- introducing aviation simulation complexity
- expanding route count
- adding airline systems
- building airport infrastructure
- overcomplicating runtime authority

This is an:

- emotional
- atmospheric
- cinematic
- presentation-focused

pass.

---

# Core Doctrine

## Aircraft Are Skyline Actors

Regional aircraft are not:

- GPS indicators
- minimap entities
- symbolic transport markers

Aircraft are:

```text
moving atmospheric actors
```

inside:

- weather
- cloud layers
- skyline compositions
- cinematic travel sequences
- speculative infrastructure narratives

The viewer should:

- feel their movement
- track their silhouette
- understand their altitude
- sense their relationship to atmosphere

even at long distance.

---

## Presence Over Simulation

This pass prioritizes:

```text
emotional readability
```

over:

- engineering realism
- airline simulation
- FAA procedural fidelity

Aircraft should:

- feel believable
- feel cinematic
- feel geographically embedded

without requiring simulator-grade complexity.

---

## Cruise Is Not Dead Time

Mid-cruise is part of the emotional experience.

Cruise should support:

- skyline observation
- atmosphere
- weather immersion
- distance
- scale
- contemplative pacing

The world should feel:

- inhabited
- alive
- layered

even when nothing dramatic is occurring.

---

# Scope

This spec includes:

- aircraft visual readability improvements
- altitude-aware presence scaling
- atmospheric integration
- contrail/vapor hints
- navigation lighting
- distance readability
- cloud interaction polish
- cruise visibility improvements
- camera readability support

This spec does NOT include:

- additional routes
- airport systems
- ATC systems
- AI traffic simulation
- airline branding systems
- procedural weather systems
- flight scheduling systems

---

# Runtime Architecture

## Existing Runtime Ownership Remains Intact

This spec does NOT replace:

| System | Responsibility |
|---|---|
| AircraftRuntime | actor continuity |
| RegionalFlightTripRuntime | route/lifecycle orchestration |
| AircraftRenderer | base aircraft rendering |
| CloudAtmosphereLayer | atmosphere rendering |
| Camera profiles | observer framing |

This spec introduces:

```text
presentation-layer enhancements
```

ONLY.

---

# Presence Layer

## Presence State

Aircraft should maintain a presentation-only presence state:

```js
presenceState = {
  visibilityScalar,
  altitudeScalar,
  atmosphericScalar,
  distanceScalar,
  silhouetteScalar,
  lightVisibilityScalar
}
```

These values are:

- presentation-only
- derived at runtime
- non-authoritative
- safe to recompute per frame

They must not mutate route truth, aircraft lifecycle truth, or geographic truth.

---

# Aircraft Readability

## Altitude-Aware Scale Tuning

Aircraft currently risk:

- disappearing too quickly
- flattening visually
- losing silhouette identity

Aircraft scale should:

- compress more slowly at altitude
- preserve visual readability
- remain subtle
- avoid oversized arcade scaling

Goal:

```text
small but intentional
```

NOT:

```text
oversized cinematic hero aircraft
```

---

## Silhouette Preservation

Aircraft should preserve:

- heading readability
- wing orientation
- directional clarity
- movement comprehension

at:

- harbor scale
- skyline scale
- cruise scale

Low-poly aircraft should prioritize:

- clean shape readability
- motion identity
- directional interpretation

over mesh complexity.

---

# Atmospheric Presence

## Contrail / Vapor Hinting

Aircraft may emit:

- subtle vapor trails
- altitude haze residue
- atmospheric streaking

Contrails should:

- remain sparse
- dissolve naturally
- avoid arcade exaggeration
- support skyline composition

Contrails should feel:

```text
observational
```

NOT:

```text
action cinematic
```

---

## Cloud Penetration Behavior

Aircraft entering:

- fog
- cloud bands
- harbor haze

should partially:

- diffuse
- soften
- emerge

rather than abruptly clipping visibility.

Goal:

```text
the aircraft should feel embedded in atmosphere
```

---

## Atmospheric Fade Logic

Distance fade should account for:

- fog density
- altitude
- haze
- time of day
- cloud preset

NOT distance alone.

---

# Navigation Lighting

## Distance Twinkle

At medium/far distance, aircraft may display:

- subtle anti-collision blink
- warm/cool navigation lights
- atmospheric light shimmer

Lighting should:

- aid visibility
- support emotional mood
- improve night readability

Lighting should NOT:

- dominate composition
- become noisy
- resemble arcade effects

---

## Night Flight Identity

Night flights should:

- preserve aircraft readability
- support skyline atmosphere
- create subtle movement across darkness

Future night routes should feel:

```text
lonely,
beautiful,
and infrastructural
```

rather than:

```text
combat-oriented
```

---

# Cruise Presence

## Mid-Cruise Atmosphere

Cruise sequences should support:

- contemplation
- skyline viewing
- cloud observation
- atmospheric pacing
- regional geography

Cruise should NEVER feel like:

```text
empty runtime padding
```

---

## Skyline Emergence

Aircraft should occasionally:

- emerge from fog
- silhouette against atmosphere
- pass through light bands
- intersect weather layers

to reinforce:

- scale
- distance
- movement continuity

---

# Camera Presence Support

## Camera Coordination

This spec may introduce:

- smoothing hooks
- visibility framing hints
- silhouette preservation bias

BUT camera ownership remains external.

This pass may expose:

- recommended zoom ranges
- preferred framing distances
- visibility weighting hints

for future camera systems.

---

# Cloud Integration

## Cloud Transition Awareness

Aircraft presentation should react to:

- cloud preset
- fog density
- weather visibility

Aircraft should not:

- disappear unpredictably
- become unreadable during cruise
- fight atmospheric readability

---

# Performance Doctrine

## Presence Must Remain Cheap

All additions must remain:

- lightweight
- scalable
- stream-safe

Avoid:

- heavy particle systems
- dense contrail simulation
- volumetric dependency
- expensive lighting systems

Priority:

```text
illusion over simulation
```

---

# Future Integration Direction

This pass prepares aircraft for future:

```text
RegionalFlightPlanner infrastructure
```

Future planners may eventually support:

- airport selection
- destination selection
- atmosphere scouting
- sunrise/sunset routes
- harbor flyovers
- New New York future corridors

This spec intentionally avoids hardcoded route assumptions and instead improves:

```text
general aircraft world presence
```

for all future route systems.

---

# Debug Requirements

Add or expose:

```js
_wos.debug.regionalFlight.presence(bool)
_wos.debug.regionalFlight.contrails(bool)
_wos.debug.regionalFlight.lights(bool)
_wos.debug.regionalFlight.visibility()
```

Audit should report:

- active presence profile
- atmospheric visibility scalar
- contrail state
- light state
- cruise readability state

---

# Success Criteria

This pass succeeds if watching a regional flight feels:

- atmospheric
- geographically believable
- emotionally readable
- cinematic
- relaxing

even when:

- nothing dramatic occurs
- the aircraft is distant
- the aircraft is cruising slowly

---

# Failure Conditions

This pass fails if aircraft become:

- oversized
- arcade-like
- noisy
- overly bright
- simulation-heavy
- visually cluttered
- distracting from geography

The skyline must remain:

- readable
- atmospheric
- restrained

Aircraft are:

```text
part of the composition,
not the entire composition
```

---

# Build Priority

## Priority 1 — Aircraft Readability

Make aircraft visually trackable without inflating them into hero objects.

---

## Priority 2 — Atmospheric Integration

Embed aircraft into haze, cloud, distance, and light conditions.

---

## Priority 3 — Night Visibility

Support low-light visibility through subtle navigation lights and distance twinkle.

---

## Priority 4 — Cruise Emotional Pacing

Prevent mid-cruise from reading as empty runtime traversal.

---

## Priority 5 — Contrail Polish

Add atmospheric residue only if it remains subtle and cheap.

---

# Implementation Notes

Prefer:

- opacity modulation
- silhouette enhancement
- atmospheric interpolation
- lightweight visual layering
- presentation-only derived values

Avoid:

- physics-heavy simulation
- complex particle ownership
- expensive volumetrics
- airline-system creep
- route-planner scope creep

---

# Final Principle

Regional aircraft should feel like:

```text
quiet moving infrastructure
crossing an atmospheric civilization
```

NOT:

```text
game units traversing a map
```

---

# Implementation Guide

- Put presentation-only aircraft presence logic near the aircraft rendering layer, not inside route truth.
- Run the existing NYC → Boston route at `speed(60)` and review takeoff, cruise, descent, and arrival.
- Expect better aircraft readability, subtle atmospheric presence, and no new route-planner behavior in this build.
