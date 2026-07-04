---
title: "3D Building Continuity and Prewarm"
filename: "0528W_WOS_3DBuildingContinuityAndPrewarm_v1.0.0_BUILD.md"
version: "1.0.0"
date: "2026-05-28"
system: "WOS"
module: "Mapbox Building Continuity"
type: "runtime-build-spec"
status: "[BUILD]"
build_readiness: "[BUILD]"
owner: "StudioRich / WOS"
depends_on:
  - "0528U_WOS_MapTilePreloadAndContinuityPass_v1.0.0"
  - "0528V_WOS_TraversalControlDeck_v1.0.0"
  - "0528T_WOS_SurfaceGlideWatchabilityProfile_v1.0.0"
---

# 0528W_WOS_3DBuildingContinuityAndPrewarm_v1.0.0_BUILD

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Reduce visible late-loading 3D building extrusion pop-in during surface-glide and broadcast traversal sessions.

---

# Purpose

Surface-glide watchability testing revealed that WOS can sustain calm traversal, but the illusion breaks when Mapbox 3D buildings appear late on screen.

The current failure is:

```text
3D buildings pop into view after the camera has already arrived
```

This creates the feeling of:

```text
a streamed digital map loading late
```

instead of:

```text
a continuous real world being filmed
```

This spec defines a dedicated 3D building continuity system focused on:

- detecting building layer readiness
- prewarming building geometry ahead of the camera
- reducing aggressive route movement through unloaded dense zones
- delaying / easing building extrusion visibility where needed
- masking unavoidable pop-in with atmosphere
- exposing audit/debug tools for watchability testing

This spec is narrower than general map tile continuity.

It specifically targets:

```text
3D building extrusion continuity
```

---

# Core Doctrine

## Building Pop-In Is A Broadcast Break

A late-appearing building is more damaging than a late road or terrain tile because it visibly changes the dimensional structure of the world.

For WOS, a building should feel like:

```text
existing before the camera sees it
```

not:

```text
materializing because a tile finished loading
```

---

## Prewarm Before Reveal

Dense building zones must be prepared before they enter the viewer's emotional focus.

The continuity system should prefer:

- ahead-of-camera tile warmup
- hidden readiness probes
- slower traversal through cold dense zones
- atmospheric concealment
- soft extrusion fade-in

over visible sudden pop-in.

---

## No Renderer Truth Mutation

This system may influence presentation readiness and traversal pacing.

It must not fabricate geography, rewrite route truth, or mutate building data as runtime truth.

Mapbox remains the geographic source.

WOS continuity interprets and protects reveal timing.

---

# Scope

This spec includes:

- Mapbox building-layer readiness monitoring
- building source / layer discovery
- ahead-of-camera prewarm probes
- route-ahead dense-zone prewarm scheduling
- optional extrusion opacity fade strategy
- optional pitch/zoom gating when building readiness is low
- continuity veil escalation
- debug/audit commands

This spec does NOT include:

- replacing Mapbox buildings
- custom 3D mesh generation
- offline vector tile cache
- server-side tile hosting
- photorealistic building rendering
- procedural building generation
- building ownership / virtual land systems
- route planner redesign
- bird/fish anchor systems

---

# New System

## Preferred File

```text
wall/systems/presentation/buildingContinuityRuntime.js
```

## Optional Debug Companion

```text
wall/systems/presentation/buildingContinuityDebug.js
```

## Classification

```text
presentation-continuity-runtime
```

## Load Order

```text
AFTER mapboxViewportRuntime.js
AFTER mapStyleAuthority.js
AFTER mapContinuityRuntime.js
AFTER regionalFlightCameraRig.js
BEFORE traversalControlDeck.js
```

If `mapContinuityRuntime.js` is not yet implemented, this system should still load and degrade gracefully.

---

# Runtime Authority

## BuildingContinuityRuntime OWNS

- building continuity readiness snapshot
- building layer detection
- dense-zone cold-start risk scoring
- building prewarm queue
- building reveal-risk scalar
- optional extrusion fade policy
- debug/audit reporting

## BuildingContinuityRuntime READS

- Mapbox GL map instance
- active map style/layers
- active route/trip state
- active camera center/bearing/pitch/zoom
- MapContinuityRuntime readiness if available
- RegionalFlightCameraRig state if available
- presentation mode state

## BuildingContinuityRuntime MAY REQUEST

- preload / prewarm probes
- temporary traversal gating hints
- temporary atmospheric veil scalar
- optional building-opacity fade values

## BuildingContinuityRuntime MUST NOT

- own route truth
- mutate aircraft/fish/bird entity truth
- fabricate building geometry
- directly control camera every frame
- rewrite Mapbox style authority
- reload the entire map style during traversal
- create visible camera jumps
- degrade normal editor mode behavior

---

# Building Layer Detection

The runtime must detect likely 3D building layers from the active Mapbox style.

Common layer characteristics:

```js
layer.type === 'fill-extrusion'
```

Likely source layers:

```text
building
building-3d
building_extrusion
composite/building
```

The runtime should not assume a single layer ID.

Implement:

```js
_findBuildingExtrusionLayers(map)
```

Returns:

```js
[
  {
    id,
    source,
    sourceLayer,
    minzoom,
    paint,
    layout
  }
]
```

If no building layer is found, audit should report:

```text
building extrusion layer not found
```

and fail gracefully.

---

# Readiness State Model

Maintain:

```js
buildingContinuityState = {
  enabled,
  mapReady,
  styleReady,
  buildingLayersFound,
  buildingLayerIds,
  tilesLoaded,
  lastIdleMs,
  lastSourceDataMs,
  cameraZoom,
  cameraPitch,
  visibleFeatureCount,
  aheadFeatureCount,
  readinessScalar,
  popInRiskScalar,
  denseZoneRiskScalar,
  prewarmQueueLength,
  fadePolicyActive,
  gatingRecommended,
  veilRecommended
}
```

Where:

```text
readinessScalar = 1.0 means building continuity is safe
popInRiskScalar = 1.0 means high visible pop-in risk
```

---

# Prewarm Strategy

## 1. Current View Probe

At a low cadence, query building features in the current viewport.

Preferred:

```js
map.queryRenderedFeatures({ layers: buildingLayerIds })
```

Use sparingly.

Suggested cadence:

```text
2–4 Hz
```

Not every frame.

---

## 2. Ahead-of-Camera Probe

Project sample points ahead of the camera based on:

- center
- bearing
- zoom
- route direction if active
- surface_glide profile

Sample distances:

```text
150m
300m
600m
1000m
```

Surface glide should emphasize:

```text
150m / 300m / 600m
```

because close terrain exposes buildings quickly.

---

## 3. Route-Ahead Probe

If a regional trip or planned route is active, sample future route coordinates:

```js
progress + 0.003
progress + 0.006
progress + 0.012
progress + 0.024
```

Use smaller increments than aircraft cruise because surface-glide exposes nearby buildings.

---

## 4. Dense Urban Risk

If ahead probes find many building features but tile readiness is unsettled, mark:

```js
denseZoneRiskScalar = high
```

This should trigger:

- continuity veil recommendation
- optional auto-gating
- optional route speed easing
- optional building fade-in policy

---

# Prewarm Mechanics

Mapbox does not expose a universal public API that guarantees future tile decoding without camera movement.

Therefore this build must use layered tactics.

## Tactic A — Query Warmup

Perform controlled `queryRenderedFeatures` calls at points/bounds near upcoming screen regions.

This may encourage tile/source readiness where already near viewport.

Do not over-query.

## Tactic B — Padding / Prefetch Adjustment

If supported by current Mapbox setup, widen render/cache bounds using safe padding-like behavior.

Do not visibly alter map framing.

## Tactic C — Conservative Speed Gating

When building readiness is cold, recommend slowing traversal.

If auto-gate is enabled:

```js
effectiveSpeed = max(0.25, currentSpeed * 0.8)
```

Restore gradually when readiness improves.

No speed snapping.

## Tactic D — Atmospheric Masking

When pop-in risk is high:

- increase haze veil
- increase distance fog
- soften contrast
- allow cloud/fog layer to hide transitions

This must feel like weather, not a loading screen.

## Tactic E — Extrusion Fade-In

If layer paint mutation is safe and does not violate MapStyleAuthority:

- temporarily reduce fill-extrusion-opacity on cold reveal
- fade back to configured opacity over 800–1800ms

This must be optional.

Default:

```js
fadePolicyActive = false
```

until verified safe.

---

# MapStyleAuthority Boundary

This system must not permanently own building style.

If it changes building layer paint values, it must:

1. read original values
2. apply temporary presentation-only fade
3. restore target values
4. avoid fighting MapStyleAuthority

Preferred:

```js
SBE.MapStyleAuthority.requestTemporaryPresentationOverride(...)
```

If that API does not exist, do NOT implement permanent style mutation.

Use veil/gating instead.

---

# Traversal Deck Integration

The existing Traversal Control Deck already exposes:

```text
Cont
Veil
```

This build should add or support:

```text
Buildings
```

Optional future deck controls:

```text
Bldg
Prewarm
Auto Gate
```

For v1.0.0, minimum requirement:

- deck launch should call building continuity prewarm if available
- missing building continuity must warn but not fail

Suggested deck launch additions:

```js
_debug('buildingContinuity', 'enabled', [true])
_debug('buildingContinuity', 'prewarmAhead')
_debug('buildingContinuity', 'audit')
```

---

# Debug API

Expose:

```js
SBE.BuildingContinuityRuntime = {
  VERSION,
  start,
  stop,
  setEnabled,
  getEnabled,
  setAutoGate,
  getAutoGate,
  setVeil,
  getVeil,
  setFadePolicy,
  getFadePolicy,
  detectLayers,
  prewarmAhead,
  getState
}
```

---

# Debug Commands

Bind under:

```js
_wos.debug.buildingContinuity
```

Required:

```js
audit()
enabled(bool)
autoGate(bool)
veil(bool)
fade(bool)
detectLayers()
prewarmAhead()
readiness()
```

Example:

```js
_wos.debug.buildingContinuity.audit()
_wos.debug.buildingContinuity.detectLayers()
_wos.debug.buildingContinuity.prewarmAhead()
_wos.debug.buildingContinuity.autoGate(true)
```

---

# Launch Test Flow

After implementation:

```js
_wos.presentationMode(false)
_wos.debug.traversalDeck.show()
```

Select:

```text
FROM: JFK
TO: BOS
MODE: Surface Glide
CHANNEL: Aquarium Network
```

Enable:

```text
Cont: ON
Veil: ON
Buildings: ON
```

Then:

```text
Launch Drift
```

Console audit:

```js
_wos.debug.buildingContinuity.audit()
_wos.debug.buildingContinuity.readiness()
```

---

# Manual Console Test

If deck wiring is not complete:

```js
_wos.presentationMode(true)

_wos.debug.regionalFlight.stop()
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.profile('surface_glide')
_wos.debug.regionalFlight.speed(0.55)
_wos.debug.regionalFlight.cameraRig(true)
_wos.debug.regionalFlight.cameraSmooth(0.75)

_wos.debug.atmosphere.preset('harbor_fog')
_wos.debug.atmosphere.pressure(0.22)
_wos.debug.atmosphere.silence(0.78)

_wos.debug.aircraftResidue.contrails(false)
_wos.debug.aircraftResidue.lights(true)

_wos.debug.buildingContinuity.enabled(true)
_wos.debug.buildingContinuity.veil(true)
_wos.debug.buildingContinuity.autoGate(true)
_wos.debug.buildingContinuity.prewarmAhead()
_wos.debug.buildingContinuity.audit()
```

---

# Success Criteria

This build succeeds if:

- building extrusion layers are detected reliably
- visible building pop-in is reduced during surface-glide traversal
- dense urban areas feel more continuous
- unavoidable loading is softened by atmosphere or speed patience
- traversal does not stutter aggressively
- deck launch can trigger building prewarm
- missing APIs fail gracefully
- MapStyleAuthority is not corrupted
- presentation mode remains clean
- runtime truth remains untouched

---

# Failure Conditions

This build fails if:

- buildings still frequently pop in directly in front of camera
- map visibly jumps during prewarm
- speed gating causes obvious hiccups
- atmosphere veil looks like a loading overlay
- Mapbox style reloads during traversal
- building layer paint is permanently altered
- MapStyleAuthority fights the override
- FPS drops below watchable smoothness
- console fills with noisy warnings

---

# Performance Constraints

Do not query rendered features every frame.

Recommended cadence:

```text
2–4 Hz for normal monitoring
1 Hz for expensive audits
```

Avoid:

- large viewport-wide queries at high frequency
- duplicate Mapbox instances
- style reloads
- recursive setPaintProperty loops
- per-frame opacity mutations across many layers

---

# Watchability Notes

The desired emotional result is:

```text
the city already exists before the camera arrives
```

NOT:

```text
the city downloads as we fly through it
```

This is especially important for:

- Surface Glide
- Aquarium Network
- Sounds Fishy
- Wet Dreams — After Hours
- future bird/fish traversal anchors

Once building continuity improves, WOS can begin testing stronger moving anchors:

```text
birds
fish
red car
signal organisms
```

---

# Implementation Guide

- Add `buildingContinuityRuntime.js` and optional `buildingContinuityDebug.js` under `wall/systems/presentation/`.
- Detect Mapbox fill-extrusion building layers, monitor readiness, and prewarm route/camera-ahead areas at low cadence.
- Wire Traversal Control Deck launch to call `buildingContinuity.enabled(true)` and `buildingContinuity.prewarmAhead()` when available.
