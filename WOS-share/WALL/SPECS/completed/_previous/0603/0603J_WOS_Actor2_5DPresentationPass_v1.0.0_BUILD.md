---
layout: spec
title: "Actor 2.5D Presentation Pass"
date: 2026-06-03
doc_id: "0603_WOS_Actor2_5DPresentationPass_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "actor_2_5d_presentation_pass"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-pass"

summary: "Consumes actor visual identity fields and converts them into visible 2.5D presentation: low-poly silhouettes, contact shadows, identity colors, light cues, scale classes, and readable actor differentiation."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Visual identity is interpretation"
  - "Renderer builds geometry from resolved presentation instructions"
  - "Do not mutate truth to improve appearance"

depends_on:
  - "0603G_WOS_ActorRenderAuthority_v1.0.0"
  - "0603H_WOS_MapStyleRecoveryAuthority_v1.0.0"
  - "0603I_WOS_ActorVisualIdentityAuthority_v1.0.0"

enables:
  - "visible actor differentiation"
  - "recognizable public-feed actors"
  - "low-poly bus and utility forms"
  - "usable palette tokens"
  - "future harbor atmosphere"
  - "future glyph/decal rendering"

tags:
  - "wos"
  - "2.5d"
  - "actor"
  - "presentation"
  - "visual-identity"
  - "low-poly"
  - "renderer"
---

# 0603J_WOS_Actor2_5DPresentationPass_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Convert actor identity metadata into visible 2.5D presentation.

0603I successfully gives actors canonical identity fields:

```text
visualIdentityKey
silhouetteClass
paletteRef
glyphRef
materialClass
lightClass
decalClass
scaleClass
priorityClass
```

But those are still mostly strings.

0603J makes those strings visible.

The goal is immediate screenshot improvement:

```text
generic actor markers
```

become:

```text
recognizable civic/transit/marine/world objects
```

without changing truth, feed data, camera behavior, or route logic.

---

# Core Problem

Current state:

```text
Actor truth is strong.
Actor identity metadata is strong.
Visual output is still weak.
```

The renderer receives identity instructions, but most of them are not consumed.

So:

```text
vehicle.bus → mta.bus → city-bus
```

still may look like:

```text
generic box truck
```

0603J closes that gap.

---

# Doctrine

## 2.5D Is Presentation, Not Simulation

This pass is allowed to improve readability through:

- low-poly forms
- contact shadows
- symbolic lights
- stronger silhouettes
- material classes
- palette classes
- scale classes

It must not simulate physics.

It must not infer truth.

It must not alter actor positions.

---

## Truth Must Stay Untouched

Correct:

```text
actor says: vehicle.bus
identity says: silhouetteClass city-bus
renderer builds: city-bus mesh
```

Incorrect:

```text
renderer changes actor type to bus
renderer edits metadata
renderer changes sourceId
renderer changes feed truth
```

---

# Required Target Files

Modify:

```text
wall/systems/render/worldSpaceVehicleLayer.js
```

Create:

```text
wall/systems/actors/actorPresentationPaletteRegistry.js
```

Modify:

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional, only if needed:

```text
wall/systems/actors/actorRenderAuthority.js
```

Do not modify:

```text
truthActorRuntime.js
citibikeStationRuntime.js
heroVehicleRuntime.js
heroVehicleRenderer.js
mapStyleRecoveryAuthority.js
```

unless an integration bug prevents payload fields from reaching WSL.

---

# New Module: Actor Presentation Palette Registry

Create:

```text
wall/systems/actors/actorPresentationPaletteRegistry.js
```

Export:

```js
SBE.ActorPresentationPaletteRegistry
```

Public API:

```js
SBE.ActorPresentationPaletteRegistry = Object.freeze({
  VERSION,
  resolvePalette,
  registerPalette,
  listPalettes,
  getState
});
```

---

# Palette Resolution

`resolvePalette(paletteRef)` returns:

```js
{
  key,
  body,
  roof,
  side,
  glass,
  accent,
  light,
  shadow,
  stroke,
  opacity
}
```

All colors should be numeric Three.js hex values.

If paletteRef is unknown, return:

```js
generic.actor
```

Never throw.

---

# Required Palette Tokens

Implement these minimum palettes:

```js
citibike.cyan
mta.bus.blue-white
dot.yellow-orange
synthetic.muted-road
marine.truth-blue
nyc.ferry.blue-white
aircraft.cool-white
mta.subway.line-color
traffic.generic
civic.generic
actor.generic
```

Suggested values:

```js
citibike.cyan:
  body:   0x20c7d8
  roof:   0x55e6f2
  side:   0x128c9a
  glass:  0x063840
  accent: 0xffffff
  light:  0x7fffff
  shadow: 0x000000

mta.bus.blue-white:
  body:   0x1f5fa8
  roof:   0xf4f7fb
  side:   0x174073
  glass:  0x101820
  accent: 0xffffff
  light:  0xfff4c2
  shadow: 0x000000

dot.yellow-orange:
  body:   0xf5b21b
  roof:   0xffd35a
  side:   0xa86400
  glass:  0x1c1c1c
  accent: 0xff6a00
  light:  0xffc400
  shadow: 0x000000

synthetic.muted-road:
  body:   0x45515c
  roof:   0x66717b
  side:   0x252d34
  glass:  0x111820
  accent: 0x9aa8b4
  light:  0xbddcff
  shadow: 0x000000

marine.truth-blue:
  body:   0x2a78a8
  roof:   0xe9f2f7
  side:   0x15445f
  glass:  0x0b1c24
  accent: 0x8fdcff
  light:  0xffffff
  shadow: 0x000000
```

---

# WSL Consumption Requirements

WorldSpaceVehicleLayer must consume these payload fields:

```js
visualIdentityKey
silhouetteClass
paletteRef
glyphRef
accentRef
materialClass
lightClass
decalClass
scaleClass
priorityClass
```

WSL must not resolve source/feed truth.

It may resolve palette tokens through:

```js
SBE.ActorPresentationPaletteRegistry.resolvePalette(payload.paletteRef)
```

---

# New Mesh Builder Dispatch

Add a silhouette-based mesh dispatch before generic vehicle fallback.

Pseudo:

```js
function _buildIdentityMesh(actorType, variant, lodTier, visualState, payload) {
  switch (payload.silhouetteClass) {
    case "city-bus":
      return _buildCityBusMesh(payload, lodTier);
    case "utility-truck":
      return _buildUtilityTruckMesh(payload, lodTier);
    case "station-node":
      return _buildStationMesh(...);
    case "ambient-car":
      return _buildVehicleLOD(...);
    case "vessel-generic":
      return _buildVesselMesh(payload, lodTier);
    case "passenger-ferry":
      return _buildFerryMesh(payload, lodTier);
    case "aircraft-light":
      return _buildAircraftTokenMesh(payload, lodTier);
    default:
      return existing fallback;
  }
}
```

Do not delete existing builders.

Do not break hero car.

---

# Minimum Visible Builders

## 1. City Bus Mesh

Triggered by:

```text
silhouetteClass: city-bus
```

Requirements:

- long rectangular bus body
- white roof
- blue body side
- dark glass strip
- front/rear light cues
- slightly taller than car
- longer than box truck cabin but not taller than utility truck
- direction follows existing +Y front convention

Minimum dimensions:

```js
width: 3.2
length: 11.5
height: 2.8
```

Visual cues:

```text
large roof plane
side window strip
front windshield
small route-strip accent
```

No text route rendering in v1.

---

## 2. Utility Truck Mesh

Triggered by:

```text
silhouetteClass: utility-truck
```

Requirements:

- chunky civic service vehicle
- yellow/orange body
- raised rear box or equipment block
- amber light bar
- hazard stripe cue
- heavier silhouette than bus/car
- direction follows existing +Y front convention

Minimum dimensions:

```js
width: 3.4
length: 8.8
height: 3.2
```

Visual cues:

```text
cab front
equipment block
amber beacon
rear service box
side stripe
```

No animated flashing in v1.

---

## 3. Station Node Mesh Upgrade

Triggered by:

```text
silhouetteClass: station-node
```

Use existing station mesh, but consume:

```js
paletteRef
visualState
priorityClass
```

Rules:

- base hue from palette token
- state hue may override accent only
- no car geometry
- no heading cue
- no wheels

Station should read as civic infrastructure, not a vehicle.

---

## 4. Vessel Generic Mesh

Triggered by:

```text
silhouetteClass: vessel-generic
```

Requirements:

- elongated hull
- cabin block
- bow cue
- marine blue/white palette
- no road wheels
- direction follows existing heading convention

Minimum dimensions:

```js
width: 5.0
length: 18.0
height: 2.5
```

This does not replace AIS renderer unless the actor pipeline uses this actor type.

---

## 5. Passenger Ferry Mesh

Triggered by:

```text
silhouetteClass: passenger-ferry
```

Requirements:

- wider, cleaner hull than generic vessel
- white deck/cabin
- blue hull/accent
- longer than generic utility actors
- no wake animation in v1

Minimum dimensions:

```js
width: 6.0
length: 22.0
height: 3.2
```

---

## 6. Aircraft Light Token

Triggered by:

```text
silhouetteClass: aircraft-light
```

Requirements:

- small low-poly aircraft token
- high-altitude cool-white palette
- wing bar
- fuselage bar
- tail cue
- no full aircraft renderer rewrite

---

# Scale Class Handling

Add scale-class multipliers at WSL build/resolve level.

```js
SCALE_CLASS_MULTIPLIER = {
  "micro-infrastructure": 0.75,
  "micro-vehicle": 0.65,
  "small-road-vehicle": 1.0,
  "large-road-vehicle": 1.35,
  "medium-heavy-vehicle": 1.45,
  "large-marine": 1.8,
  "marine-variable": 1.5,
  "rail-long": 1.8,
  "sky-variable": 1.2,
  "marker": 0.9,
  "prop": 1.0,
  "standard": 1.0
}
```

Important:

Do not apply this multiplier twice.

It should be recorded in mesh debug state.

---

# Contact Shadows

Every identity mesh must include a contact shadow plane unless inappropriate.

Shadow rules:

```js
shadow opacity:
  background/synthetic: 0.18
  civic-utility: 0.24
  public-transit: 0.28
  civic-service: 0.30
  harbor-truth: 0.26
  airspace-truth: 0.10
```

Use MeshBasicMaterial.

Do not enable shadow maps.

---

# Light Classes

Consume `lightClass` symbolically.

Minimum v1 mapping:

```js
none          → no lights
minimal       → subtle front/rear cues
head-tail     → headlights + taillights
amber-flash   → static amber beacon/light bar
navigation    → red/green/white nav dots
nav-strobe    → cool-white tiny light dots
interior-strip → small window strip glow
alert-flash   → static alert ring/accent
```

No animation in v1.

---

# Material Classes

Consume `materialClass` as color/opacity behavior only.

Minimum v1 mapping:

```js
flat-emissive    → brighter body/accent
transit-plastic  → clean saturated color
industrial       → darker side panels, strong accent
marine-matte     → muted hull, brighter cabin
marine-clean     → clean white cabin / blue hull
high-altitude    → low opacity, cool light
low-priority     → muted opacity
standard         → existing behavior
```

No shader system in v1.

---

# Mesh Metadata Stamping

Every mesh built by this pass must stamp:

```js
mesh._visualIdentityKey
mesh._silhouetteClass
mesh._paletteRef
mesh._scaleClass
mesh._priorityClass
mesh._materialClass
mesh._lightClass
mesh._presentationMeshKind
mesh._presentationPaletteKey
mesh._presentationScaleMultiplier
```

---

# Debug API

Add under:

```js
_wos.debug.worldActors
```

Commands:

```js
actor2D5State()
actor2D5Sample()
actor2D5Resolve(actorId)
actorPaletteList()
```

## actor2D5State()

Print:

```text
enabled
paletteCount
identityMeshCount
fallbackMeshCount
lastMeshKind
lastPaletteRef
lastError
```

## actor2D5Sample()

Show first 20 rendered actor meshes:

```text
actorId
actorType
visualIdentityKey
silhouetteClass
paletteRef
scaleClass
presentationMeshKind
paletteKey
scaleMultiplier
```

## actor2D5Resolve(actorId)

Show the actor payload + mesh presentation metadata for one actor.

---

# Acceptance Tests

## Test 1: Debug Actors

Run:

```js
_wos.debug.worldActors.testBus()
_wos.debug.worldActors.testUtility()
setTimeout(()=>_wos.debug.worldActors.actor2D5Sample(), 1000)
```

Expected:

```text
MTA Bus → city-bus mesh, mta.bus.blue-white palette
DOT Utility → utility-truck mesh, dot.yellow-orange palette
```

They should visibly differ.

---

## Test 2: Citi Bike Stations

Run:

```js
_wos.debug.worldActors.citibikeStart()
setTimeout(()=>_wos.debug.worldActors.actor2D5Sample(), 6000)
```

Expected:

```text
Citi Bike stations → station-node mesh, citibike.cyan palette
```

They should not look like cars.

---

## Test 3: No Hero Regression

Launch Drive.

Expected:

```text
hero still moves
hero heading unchanged
hero underpass behavior unchanged
hero camera unchanged
```

Run:

```js
_wos.debug.worldVehicles.heroHeadingAudit()
_wos.debug.worldVehicles.depthPolicyState()
```

Expected:

```text
aligned:true
hero depth policy unchanged
```

---

# Failure Conditions

This build fails if:

- hero vehicle changes behavior
- actor truth is mutated
- actor IDs change
- feed metadata is mutated
- ActorRenderAuthority is bypassed
- WSL resolves feed source truth directly
- station nodes become car meshes
- MTA bus and DOT utility still look identical
- palette token failure crashes rendering
- unknown palette crashes rendering
- scale class is applied twice
- Drive freezes
- Mapbox style is mutated
- Citi Bike polling cadence changes

---

# Implementation Notes

## Keep the Renderer Dumb

WSL may choose geometry from:

```text
silhouetteClass
```

but it must not inspect:

```text
sourceId
station_id
route_id
feed URL
GTFS
GBFS
AIS
```

## Keep Presentation Reusable

The same `utility-truck` builder should support:

```text
DOT trucks
maintenance vehicles
authored service props
future emergency vehicles
```

Do not create source-specific builders like:

```text
_buildNYCDOTTruckOnly()
```

Use:

```text
_buildUtilityTruckMesh()
```

## Prefer Low-Poly Over Detail

The pass should be immediately readable, not photoreal.

Good:

```text
strong block silhouette
clear palette
clear contact shadow
simple lights
```

Bad:

```text
many tiny details
slow geometry
source-specific decals
```

---

# Relationship to Future Specs

0603J should make screenshots stronger immediately.

Later specs may add:

```text
0603K_WOS_HarborAtmosphereVisibilityPass_v1.0.0_BUILD
0603L_WOS_MTABusTruthRuntime_v1.0.0_BUILD
0603M_WOS_UtilityVehicleVisualPass_v1.0.0_BUILD
0603N_WOS_ActorGlyphDecalPass_v1.0.0_BUILD
0603O_WOS_ActorLightAnimationPass_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Create `wall/systems/actors/actorPresentationPaletteRegistry.js`; modify `wall/systems/render/worldSpaceVehicleLayer.js` to consume identity fields and build low-poly identity meshes; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`; register the new palette registry in `index.html` before `actorRenderAuthority.js` or before the WSL layer.
- **What**: Run `node --check wall/systems/actors/actorPresentationPaletteRegistry.js`, `node --check wall/systems/render/worldSpaceVehicleLayer.js`, and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; then run `_wos.debug.worldActors.testBus()`, `_wos.debug.worldActors.testUtility()`, and `_wos.debug.worldActors.actor2D5Sample()`.
- **Expect**: Buses, utility trucks, stations, vessels, ferries, and aircraft tokens resolve to visibly different low-poly 2.5D forms using palette and identity classes, while hero movement, feed truth, Mapbox style, and actor IDs remain unchanged.
