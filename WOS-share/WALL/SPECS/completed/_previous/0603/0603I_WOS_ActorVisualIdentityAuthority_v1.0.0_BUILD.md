---
layout: spec
title: "Actor Visual Identity Authority"
date: 2026-06-03
doc_id: "0603_WOS_ActorVisualIdentityAuthority_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "actor_visual_identity_authority"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-authority"

summary: "Centralizes actor silhouette, palette, glyph, and identity rules so truth-backed actors become visually recognizable without mutating feed truth or renderer geometry logic."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Actors are governed world objects"
  - "Visual identity is interpretation, not truth"
  - "Renderer builds geometry; authority chooses identity"

depends_on:
  - "0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0"
  - "0603G_WOS_ActorRenderAuthority_v1.0.0"
  - "0603H_WOS_MapStyleRecoveryAuthority_v1.0.0"

enables:
  - "recognizable public-feed actors"
  - "MTA bus visual identity"
  - "Citi Bike station identity"
  - "DOT utility vehicle identity"
  - "ferry / AIS vessel taxonomy"
  - "actor 2.5D presentation pass"

tags:
  - "wos"
  - "actor"
  - "visual-identity"
  - "presentation"
  - "palette"
  - "glyph"
  - "silhouette"
---

# 0603I_WOS_ActorVisualIdentityAuthority_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Create a centralized Actor Visual Identity Authority.

0603G established:

```text
Truth Actor Runtime
→ Visual Profile
→ LOD Policy
→ Actor Render Authority
→ WSL
```

0603I adds the missing identity layer:

```text
actor type
+ source
+ role
+ state
→ silhouette
+ palette
+ glyph
+ identity class
```

The goal is to make actors recognizable at a glance.

Not simply present.

Recognizable.

---

# Core Problem

Current actors render, but many still read as generic:

```text
generic car
generic box truck
generic station marker
generic vessel
generic aircraft
```

WOS needs actor identity.

Examples:

```text
MTA bus        → blue civic transit block
DOT truck      → yellow/orange utility vehicle with flash cue
Citi station   → cyan station node / availability state
Ferry          → large white/blue vessel silhouette
AIS cargo      → long industrial hull
Aircraft       → light high-altitude shape
Incident       → high-priority alert marker
Synthetic car  → low-priority muted traffic
```

Without a central authority, each actor type will keep adding one-off rules to renderers and runtimes.

---

# Doctrine

## Visual Identity Is Presentation

Feed data tells WOS:

```text
what exists
where it is
what state it is in
```

Visual Identity tells WOS:

```text
how that thing should read in the world
```

Visual identity must never mutate feed truth.

---

## One Actor Pipeline, Many Identities

All actor types should share the same pipeline:

```text
Truth
→ Identity
→ Visual Identity
→ Render Authority
→ Renderer
```

But not the same look.

```text
bus ≠ bike station ≠ ferry ≠ plane ≠ prop
```

---

# Required Module

Create:

```text
wall/systems/actors/actorVisualIdentityAuthority.js
```

Export:

```js
SBE.ActorVisualIdentityAuthority
```

Load after:

```text
actorTypes.js
actorSourceRegistry.js
actorVisualRegistry.js
actorRenderAuthority.js
```

Recommended `index.html` order:

```html
<script src="./systems/actors/actorTypes.js"></script>
<script src="./systems/actors/actorSourceRegistry.js"></script>
<script src="./systems/actors/actorIdentityRegistry.js"></script>
<script src="./systems/actors/actorVisualRegistry.js"></script>
<script src="./systems/actors/truthActorVisualLODPolicy.js"></script>
<script src="./systems/actors/actorRenderAuthority.js"></script>
<script src="./systems/actors/actorVisualIdentityAuthority.js"></script>
<script src="./systems/actors/truthActorRuntime.js"></script>
```

If load order requires Render Authority to consume this module, it must guard safely when unavailable.

No crash.

---

# Public API

```js
SBE.ActorVisualIdentityAuthority = Object.freeze({
  VERSION,
  resolveIdentity,
  registerIdentityProfile,
  getIdentityProfile,
  listIdentityProfiles,
  getState,
  setEnabled,
  setDebug
});
```

---

# Canonical Identity Output

`resolveIdentity(actor, renderPayload)` returns:

```js
{
  visualIdentityKey,
  silhouetteClass,
  paletteRef,
  glyphRef,
  accentRef,
  materialClass,
  lightClass,
  decalClass,
  scaleClass,
  priorityClass,
  readableName,
  tags,
  metadata
}
```

No geometry is built here.

No mesh is created here.

---

# Identity Profiles

Create default identity profiles keyed by actor type and optional source.

## Citi Bike Station

```js
{
  key: "citibike.station",
  actorType: "bike.station",
  sourceId: "citibike_gbfs",
  silhouetteClass: "station-node",
  paletteRef: "citibike.cyan",
  glyphRef: "bike.station",
  accentRef: "availability-state",
  materialClass: "flat-emissive",
  lightClass: "none",
  decalClass: "none",
  scaleClass: "micro-infrastructure",
  priorityClass: "civic-utility"
}
```

## MTA Bus

```js
{
  key: "mta.bus",
  actorType: "vehicle.bus",
  sourceId: "mta_bus_gtfs_rt",
  silhouetteClass: "city-bus",
  paletteRef: "mta.bus.blue-white",
  glyphRef: "bus",
  accentRef: "route-strip",
  materialClass: "transit-plastic",
  lightClass: "head-tail",
  decalClass: "route-number",
  scaleClass: "large-road-vehicle",
  priorityClass: "public-transit"
}
```

## DOT / Utility Vehicle

```js
{
  key: "dot.utility",
  actorType: "vehicle.utility",
  sourceId: "nyc_dot_events",
  silhouetteClass: "utility-truck",
  paletteRef: "dot.yellow-orange",
  glyphRef: "utility",
  accentRef: "hazard-stripe",
  materialClass: "industrial",
  lightClass: "amber-flash",
  decalClass: "agency-mark",
  scaleClass: "medium-heavy-vehicle",
  priorityClass: "civic-service"
}
```

## Synthetic Vehicle

```js
{
  key: "synthetic.vehicle",
  actorType: "vehicle.synthetic",
  sourceId: "synthetic_ambient",
  silhouetteClass: "ambient-car",
  paletteRef: "synthetic.muted-road",
  glyphRef: "none",
  accentRef: "none",
  materialClass: "low-priority",
  lightClass: "minimal",
  decalClass: "none",
  scaleClass: "small-road-vehicle",
  priorityClass: "background"
}
```

## AIS Vessel

```js
{
  key: "ais.vessel",
  actorType: "marine.vessel",
  sourceId: "ais_runtime",
  silhouetteClass: "vessel-generic",
  paletteRef: "marine.truth-blue",
  glyphRef: "vessel",
  accentRef: "heading-wake-minimal",
  materialClass: "marine-matte",
  lightClass: "navigation",
  decalClass: "none",
  scaleClass: "marine-variable",
  priorityClass: "harbor-truth"
}
```

## NYC Ferry

```js
{
  key: "nyc.ferry",
  actorType: "marine.ferry",
  sourceId: "nyc_ferry_feed",
  silhouetteClass: "passenger-ferry",
  paletteRef: "nyc.ferry.blue-white",
  glyphRef: "ferry",
  accentRef: "terminal-route",
  materialClass: "marine-clean",
  lightClass: "navigation",
  decalClass: "route-color",
  scaleClass: "large-marine",
  priorityClass: "public-transit"
}
```

## Aircraft

```js
{
  key: "aircraft.truth",
  actorType: "aircraft.plane",
  sourceId: "aircraft_runtime",
  silhouetteClass: "aircraft-light",
  paletteRef: "aircraft.cool-white",
  glyphRef: "aircraft",
  accentRef: "altitude-tier",
  materialClass: "high-altitude",
  lightClass: "nav-strobe",
  decalClass: "none",
  scaleClass: "sky-variable",
  priorityClass: "airspace-truth"
}
```

## Subway Train

```js
{
  key: "mta.subway.train",
  actorType: "transit.train",
  sourceId: "mta_subway_gtfs_rt",
  silhouetteClass: "subway-train",
  paletteRef: "mta.subway.line-color",
  glyphRef: "subway",
  accentRef: "route-bullet",
  materialClass: "rail-metal",
  lightClass: "interior-strip",
  decalClass: "route-bullet",
  scaleClass: "rail-long",
  priorityClass: "public-transit"
}
```

---

# Resolution Order

`resolveIdentity(actor, renderPayload)` must resolve in this order:

1. exact source + actorType profile
2. actorType-only profile
3. actor category fallback
4. generic actor fallback

Example:

```text
vehicle.bus + mta_bus_gtfs_rt → mta.bus
vehicle.bus + unknown_source  → generic.bus
vehicle.unknown              → generic.vehicle
unknown                      → generic.actor
```

---

# Registry Integration

Actor Visual Identity Authority may reuse:

```js
SBE.ActorVisualRegistry
SBE.ColorRegistry
SBE.GlyphRegistry
```

But must not require them.

If missing:

```text
return refs as strings
do not throw
```

---

# Actor Render Authority Integration

Modify:

```text
wall/systems/actors/actorRenderAuthority.js
```

Before final payload return:

```js
var identity = SBE.ActorVisualIdentityAuthority.resolveIdentity(actor, payload)
```

Merge into payload:

```js
payload.visualIdentityKey = identity.visualIdentityKey
payload.silhouetteClass = identity.silhouetteClass
payload.paletteRef = identity.paletteRef || payload.paletteRef
payload.glyphRef = identity.glyphRef || payload.glyphRef
payload.accentRef = identity.accentRef
payload.materialClass = identity.materialClass
payload.lightClass = identity.lightClass
payload.decalClass = identity.decalClass
payload.scaleClass = identity.scaleClass
payload.priorityClass = identity.priorityClass
payload.readableName = identity.readableName
payload.identityTags = identity.tags
```

Do not remove existing payload fields.

---

# WSL Integration

`WorldSpaceVehicleLayer` may stamp identity fields onto meshes:

```js
mesh._visualIdentityKey
mesh._silhouetteClass
mesh._paletteRef
mesh._glyphRef
mesh._materialClass
mesh._lightClass
mesh._decalClass
```

But WSL must not resolve identity.

It only receives and stores identity instructions.

---

# Debug API

Add under:

```js
_wos.debug.worldActors
```

Commands:

```js
visualIdentityState()
visualIdentityProfiles()
visualIdentitySample()
visualIdentityResolve(actorId)
```

## `visualIdentityState()`

Print:

```text
enabled
profileCount
resolvedCount
fallbackCount
lastError
```

## `visualIdentityProfiles()`

Console table:

```text
key
actorType
sourceId
silhouetteClass
paletteRef
glyphRef
scaleClass
priorityClass
```

## `visualIdentitySample()`

Print first 20 actors with:

```text
actorId
actorType
sourceId
visualIdentityKey
silhouetteClass
paletteRef
glyphRef
scaleClass
priorityClass
```

## `visualIdentityResolve(actorId)`

Print exact identity result for one actor.

---

# Required State

```js
{
  version,
  enabled,
  debug,
  profileCount,
  resolvedCount,
  fallbackCount,
  exactMatchCount,
  actorTypeMatchCount,
  categoryFallbackCount,
  genericFallbackCount,
  lastResolvedAt,
  lastError
}
```

---

# No Visual Mutation Yet

This spec is allowed to attach identity fields to render payloads and meshes.

It must not yet redesign geometry.

For example:

Correct:

```text
bus actor receives silhouetteClass: city-bus
```

Deferred:

```text
build real city-bus mesh
```

Correct:

```text
utility vehicle receives lightClass: amber-flash
```

Deferred:

```text
animate flashing lights
```

Correct:

```text
Citi Bike station receives paletteRef: citibike.cyan
```

Deferred:

```text
full ColorRegistry material system
```

---

# Acceptance Test

Run:

```js
_wos.debug.worldActors.sources()
_wos.debug.worldActors.visualIdentityProfiles()
_wos.debug.worldActors.testBus()
_wos.debug.worldActors.testUtility()
_wos.debug.worldActors.citibikeStart()
setTimeout(()=>_wos.debug.worldActors.visualIdentitySample(), 5000)
```

Expected:

```text
testBus → visualIdentityKey mta.bus
testUtility → visualIdentityKey dot.utility
Citi Bike stations → visualIdentityKey citibike.station
synthetic actors → synthetic.vehicle
unknown actor types → generic fallback
```

No crashes if ColorRegistry or GlyphRegistry are absent.

---

# Failure Conditions

This build fails if:

- identity resolution mutates actor truth
- identity resolution mutates feed metadata
- WSL decides actor identity itself
- ActorRenderAuthority bypasses identity authority
- missing ColorRegistry/GlyphRegistry crashes
- hero vehicle behavior changes
- AIS / aircraft runtimes change
- Citi Bike polling changes
- Mapbox style changes
- station rendering stops
- actor IDs change
- feed source IDs change

---

# Performance Guardrails

- Identity resolution must be cheap.
- No per-frame full actor scan.
- Resolve identity during render payload creation.
- Cache on actor record if useful:

```js
actor._visualIdentityKey
```

But do not rely on cache if actor type/source changes.

---

# Relationship to Later Specs

0603I does not make visuals beautiful by itself.

It creates the authority needed for:

```text
0603J_WOS_Actor2_5DPresentationPass_v1.0.0_BUILD
0603K_WOS_HarborAtmosphereVisibilityPass_v1.0.0_BUILD
0603L_WOS_MTABusTruthRuntime_v1.0.0_BUILD
0603M_WOS_UtilityVehicleVisualPass_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Create `wall/systems/actors/actorVisualIdentityAuthority.js`; register it in `index.html`; modify `wall/systems/actors/actorRenderAuthority.js` to merge identity fields into render payloads; optionally stamp identity fields in `wall/systems/render/worldSpaceVehicleLayer.js`; add debug commands in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/actors/actorVisualIdentityAuthority.js`, `node --check wall/systems/actors/actorRenderAuthority.js`, `node --check wall/systems/render/worldSpaceVehicleLayer.js`, and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: Actors keep the same truth IDs and render behavior, but payloads now carry canonical visual identity fields that future presentation passes can consume without adding new renderer-specific actor decisions.
