---
title: "Aircraft Contrail and Nav Lighting"
filename: "0528R_WOS_AircraftContrailAndNavLighting_v1.0.0_BUILD.md"
version: "1.0.0"
date: "2026-05-28"
system: "WOS"
module: "Regional Flight"
type: "presentation-build-spec"
status: "[BUILD]"
build_readiness: "[BUILD]"
owner: "StudioRich / WOS"
depends_on:
  - "0528N_WOS_RegionalFlightPresencePass_v1.0.0"
  - "0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0"
  - "0528Q_WOS_CloudAtmosphereTransitionSmoothing_v1.0.0"
---

# 0528R_WOS_AircraftContrailAndNavLighting_v1.0.0_BUILD

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Make aircraft visibly alter atmosphere through persistent vapor memory, restrained navigation lighting, and future-ready sky residue hooks.

---

# Purpose

Regional flight now supports planner-generated routes, cinematic camera smoothing, atmospheric continuity, pressure/bloom/recovery cycles, and basic aircraft presence.

This spec upgrades aircraft from:

```text
objects moving through atmosphere
```

to:

```text
objects leaving memory inside atmosphere
```

The goal is to make aircraft traversal visibly affect the sky through:

- contrail persistence
- vapor scars
- distance-scaled navigation lights
- fog-diffused blink behavior
- atmospheric residue
- future skywriting / glyph residue hooks

This is a presentation-layer pass. It must remain restrained, atmospheric, temporary, stream-safe, non-combat, and non-arcade.

---

# Core Doctrine

## Contrails Are Atmospheric Memory

A contrail is not just a line.

A contrail is:

```text
temporary sky memory
```

It reveals direction, altitude, cold air, pressure, elapsed time, and environmental persistence.

Contrails make the sky feel inhabited rather than empty.

---

## Aircraft Alter Atmosphere

Aircraft should not feel pasted above the map.

Aircraft should:

- cut through haze
- leave faint vapor scars
- blink through fog
- dissolve into atmosphere
- imply pressure displacement

The viewer should feel that the aircraft has physical presence in the sky.

---

## Navigation Lights Are Loneliness Signals

Navigation lights should feel distant, fragile, infrastructural, fog-softened, rhythmic, and calm.

They should NOT feel sci-fi, arcade-like, aggressively blinking, weaponized, or over-saturated.

The emotional goal:

```text
a lonely moving signal inside atmosphere
```

---

## Skywriting Is Future Sky Residue

Traditional skywriting is literal message-making.

WOS skywriting should become:

```text
intentional atmospheric residue
```

Future skywriting should behave more like vapor calligraphy, sky glyphs, pressure ornaments, atmospheric blessings, drifting symbolic memory, and resonance trails.

NOT permanent text overlays.

The sky should sometimes feel like:

```text
the city is dreaming in vapor
```

---

# Scope

This spec includes:

- persistent contrail state
- contrail aging and fadeout
- contrail drift
- humidity/fog/altitude-sensitive contrail visibility
- restrained navigation light improvements
- distance twinkle behavior
- atmospheric diffusion
- debug toggles
- sky residue hooks for later GlyphLab integration

This spec does NOT include:

- full skywriting authoring UI
- GlyphLab integration
- readable typography system
- heavy particle simulation
- volumetric cloud physics
- combat trails
- missile effects
- permanent sky marks
- advertising systems

---

# Runtime Architecture

## Existing Authority Remains

This spec does NOT replace:

| System | Responsibility |
|---|---|
| AircraftRuntime | aircraft entity state |
| AircraftRenderer | aircraft body rendering |
| AtmosphericContinuityRuntime | atmospheric pressure/continuity |
| CloudAtmosphereLayer | cloud rendering |
| RegionalFlightTripRuntime | trip lifecycle |
| RegionalFlightCameraRig | camera framing |

This spec introduces:

```text
aircraft sky residue presentation
```

ONLY.

---

# New System

## Preferred File

```text
wall/systems/presentation/aircraftSkyResidueRenderer.js
```

## Classification

```text
presentation-runtime
```

## Load Order

```text
AFTER aircraftRenderer.js
AFTER atmosphericContinuityRuntime.js
BEFORE regionalFlightTripDebug.js
```

---

# Runtime Authority

## AircraftSkyResidueRenderer OWNS

- contrail segments
- vapor residue aging
- contrail drift offsets
- residue opacity
- skywriting-ready residue metadata
- nav-light atmospheric diffusion helpers

## AircraftSkyResidueRenderer READS

- AircraftRuntime active aircraft
- AtmosphericContinuityRuntime state
- CloudAtmosphereLayer current preset
- MapboxViewportRuntime projection
- aircraft altitude scalar
- aircraft heading
- aircraft speed/lifecycle

## AircraftSkyResidueRenderer MUST NOT MUTATE

- aircraft entity state
- trip route state
- planner route state
- atmospheric truth
- cloud preset truth
- map style
- ObjectProfileRegistry

---

# Contrail Model

## Contrail Segment

Each frame may append a contrail segment when conditions are valid.

```js
contrailSegment = {
  id,
  aircraftId,
  lat,
  lng,
  headingDeg,
  altitudeScalar,
  createdAtMs,
  ageMs,
  lifeMs,
  opacity,
  widthScalar,
  driftLat,
  driftLng,
  residueType
}
```

These segments are presentation-only, temporary, safe to discard, and not serialized by default.

---

# Contrail Eligibility

Contrails should appear only when conditions support them.

Initial rules:

```js
altitudeScalar >= 0.62
lifecycleState === 'CRUISE' || lifecycleState === 'DESCENT'
```

Optional atmospheric boost:

```js
fogDensity > 0.20 || hazeDensity > 0.15
```

Contrails should be weakest during takeoff, ground taxi, and low altitude arrival.

---

# Contrail Lifespan

Recommended defaults:

```js
lifeMs = 22000 to 45000
```

Suggested mapping:

| Atmosphere | Lifespan |
|---|---|
| clear | 22s |
| thin | 30s |
| harbor_fog | 38s |
| storm_shelf | 45s |

Fog/haze makes residue linger longer.

---

# Contrail Visual Behavior

Contrails should be:

- thin
- soft
- broken
- drifting
- semi-transparent
- atmospheric

They should NOT be hard white lines, missile trails, permanent strokes, UI paths, or dense smoke tubes.

Preferred visual language:

```text
fragile vapor memory
```

---

# Contrail Drift

Contrails should drift slowly over time.

Initial simple model:

```js
driftLng += windScalar * ageT * 0.00005
driftLat += thermalLiftScalar * ageT * 0.000025
```

This is not meteorology. This is perceptual atmospheric drift.

---

# Contrail Fade Curve

Use non-linear fade:

```js
opacity = baseOpacity * (1 - smoothstep(ageT))
```

Early life: visible but subtle.  
Middle: soft memory trail.  
Late: broken vapor residue.  
End: fully dissolved.

---

# Atmospheric Modulation

Contrails should respond to atmospheric continuity.

## Pressure

Higher pressure increases shimmer, thickness, slight brightness, and instability.

## Silence

Higher silence increases softness, fade speed, muted opacity, and slow drift.

## Electrical Bloom

Electrical bloom may briefly make contrails glow faintly, pulse internally, and pick up blue-white edges.

## Thermal Bloom

Thermal bloom may warp contrail edges, increase drift, and make residue appear melted.

All effects must remain restrained.

---

# Navigation Lighting

## Current Problem

Existing nav-light behavior is useful but limited.

After this pass, lights should feel more atmospheric and less marker-like.

---

## Light Types

Support:

```js
navLightState = {
  beacon,
  wingtipLeft,
  wingtipRight,
  tail,
  diffusionRadius,
  blinkPhase,
  atmosphericAlpha
}
```

---

## Distance Scaling

Lights should become more important as aircraft body detail becomes less readable.

| Detail Tier | Light Role |
|---|---|
| hero | physical dots on aircraft |
| near | subtle wing/tail hints |
| mid | visible blink identity |
| far | primary readability signal |

---

## Fog Diffusion

Fog and haze should increase light diffusion radius but reduce sharpness.

```text
more fog = softer wider light
```

NOT:

```text
more fog = brighter LED
```

---

## Blink Cadence

Default:

```js
periodMs = 1200
onWindow = 0.30 to 0.38
```

Blink should feel infrastructural, calm, distant, and rhythmic.

NOT urgent.

---

# Sky Residue Hooks

This build should prepare for future skywriting without implementing full skywriting.

## Residue Type

Contrail segments may include:

```js
residueType:
  'contrail'
  'vapor'
  'glyph_seed'
  'pressure_trace'
```

For now, only:

```text
contrail
vapor
```

are active.

Future systems may convert residue paths into glyph hints, symbolic curves, atmospheric calligraphy, sky blessings, and vapor ornaments.

---

# Future GlyphLab Integration

Later, GlyphLab may emit:

```js
SkyResiduePath = {
  points,
  glyphId,
  decayMs,
  driftMode,
  resonanceMode,
  style
}
```

This spec does not build that system.

It only leaves enough architecture so contrail residue can become a future input.

---

# Debug API

Expose:

```js
SBE.AircraftSkyResidueRenderer = {
  VERSION,
  start,
  stop,
  setEnabled,
  getEnabled,
  setContrails,
  getContrails,
  setNavLights,
  getNavLights,
  clearResidue,
  getState
}
```

---

# Debug Commands

Bind under:

```js
_wos.debug.aircraftResidue
```

Required:

```js
audit()
contrails(bool)
lights(bool)
clear()
density(v)
lifespan(ms)
glyphSeed(bool)
```

Example:

```js
_wos.debug.aircraftResidue.audit()
_wos.debug.aircraftResidue.contrails(true)
_wos.debug.aircraftResidue.lights(true)
_wos.debug.aircraftResidue.clear()
```

---

# Testing Flow

## Canonical Flight

```js
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.cameraRig(true)
_wos.debug.regionalFlight.jump(0.5)
_wos.debug.aircraftResidue.audit()
```

## Planner Flight

```js
_wos.debug.regionalFlight.origin('JFK')
_wos.debug.regionalFlight.destination('PHL')
_wos.debug.regionalFlight.profile('scenic_coastal')
_wos.debug.regionalFlight.plan()
_wos.debug.regionalFlight.startPlan()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.cameraRig(true)
```

## Atmospheric Bloom Test

```js
_wos.debug.atmosphere.pressure(0.9)
_wos.debug.atmosphere.bloom('electrical')
```

Expected:

- contrails remain subtle
- nav lights diffuse through haze
- residue may briefly glow
- skyline readability remains intact

---

# Success Criteria

This build succeeds if:

- aircraft leave visible but restrained contrail memory
- contrails fade naturally
- contrails drift subtly
- contrails respond to fog/haze/pressure
- nav lights improve far-distance readability
- lights feel atmospheric, not arcade-like
- night/fog aircraft presence improves
- no route truth is mutated
- no aircraft entity truth is mutated
- performance remains stream-safe

---

# Failure Conditions

This build fails if:

- trails look like missiles
- sky becomes visually cluttered
- lights become too bright
- blink cadence feels urgent/combat-like
- contrails are permanent
- residue dominates skyline composition
- skywriting feels like UI text
- performance degrades
- renderer mutates aircraft state

---

# Performance Doctrine

## Residue Must Remain Cheap

Avoid:

- thousands of particles
- volumetric tubes
- per-pixel fluid simulation
- expensive blur passes

Prefer:

- projected path segments
- alpha fades
- low segment count
- capped residue pools
- simple drift offsets

Recommended caps:

```js
maxSegmentsPerAircraft = 80
maxTotalSegments = 600
```

Older segments should be discarded first.

---

# Visual Restraint Rules

Contrails should feel:

```text
half remembered
```

Not fully drawn.

Skywriting should eventually feel:

```text
dreamed by the atmosphere
```

Not typed onto the sky.

Navigation lights should feel:

```text
lonely inside weather
```

Not decorative LEDs.

---

# Future Extensions

Not this build:

- full SkyResidueAuthority
- AtmosphericGlyphTraversal
- GlyphLab skywriting tools
- user-authored vapor text
- drone calligraphy
- atmospheric message scheduling
- district-level sky ornaments
- persistent sky property marks

---

# Final Principle

Aircraft should not only cross the sky.

They should leave:

```text
temporary emotional evidence
```

The sky remembers movement.

Then the memory dissolves.

---

# Implementation Guide

- Add `wall/systems/presentation/aircraftSkyResidueRenderer.js` after aircraft and atmosphere systems.
- Keep contrails temporary, capped, drifted, and presentation-only.
- Test cruise, fog, bloom, and recovery states to confirm aircraft feel embedded inside a living sky.
