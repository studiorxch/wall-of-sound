---
title: "Preflight Route Warmup Pass"
filename: "0528AA_WOS_PreflightRouteWarmupPass_v1.0.0_BUILD.md"
version: "1.0.0"
date: "2026-05-28"
system: "WOS"
module: "Mapbox Traversal Continuity"
type: "runtime-build-spec"
status: "[BUILD]"
build_readiness: "[BUILD]"
owner: "StudioRich / WOS"
depends_on:
  - "0528V_WOS_TraversalControlDeck_v1.0.0"
  - "0528W_WOS_3DBuildingContinuityAndPrewarm_v1.0.0"
  - "0528X_WOS_TraversalContinuityAuthority_v1.0.0"
  - "0528Z_WOS_PredictiveTilePreloadCamera_v1.0.0"
---

# 0528AA_WOS_PreflightRouteWarmupPass_v1.0.0_BUILD

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Add a preflight corridor warmup pass and Mapbox-specific loading optimizations to reduce late tile, vector, shoreline, and 3D building pop-in before visible traversal begins.

---

# Purpose

WOS is still experiencing late-loading geometry during traversal:

- 3D buildings appear late
- land vectors load late
- shoreline polygons resolve late
- roads and labels sometimes appear after camera arrival
- dense city geometry still pops even with rolling predictive preload

The current PredictiveTilePreloadRuntime is useful, but it only warms a small rolling set of future positions while traversal is already active.

This spec adds a preflight warmup step:

```text
Warm route corridor first.
Then launch visible traversal.
```

The goal is to make the first several kilometers of a surface-glide traversal feel pre-existing instead of streamed.

---

# Core Doctrine

## Launch Must Wait For The World

For cinematic traversal, the camera should not move before the immediate corridor is warmed.

Normal user flow should be:

```text
Choose route → Warmup ON → Launch Drift → world warms → visible traversal begins
```

The user should not need console commands.

---

## Preload Corridor, Not Entire Route

Do NOT attempt to preload the entire JFK→BOS route at high zoom.

That would be too large, slow, expensive, and may still fail due to cache eviction.

Instead, preload:

```text
first 3–5km before launch
```

Then continue:

```text
rolling 1–3km preload bubble during travel
```

---

## Use Mapbox Where It Helps

This patch should use practical Mapbox tactics:

- hidden offscreen preload map
- real dimensions, never `display:none`
- `prefetchZoomDelta`
- route-forward bearing
- surface-glide zoom lock
- Mapbox fog during cinematic traversal
- optional extrusion transition test

Skip unreliable or unclear APIs unless verified in the current Mapbox GL JS version.

Do not rely on:

```js
map.setPrefetch(true)
```

unless it is confirmed available in Mapbox GL JS v3.3.0.

---

# Scope

This patch includes:

- `preflightWarmRoute(options)` in PredictiveTilePreloadRuntime
- traversal deck Warmup toggle
- launch sequence delay until warmup resolves or times out
- `prefetchZoomDelta` on hidden preload map
- requested `prefetchZoomDelta` support for visible map constructor
- Mapbox fog helper for traversal
- optional fill-extrusion transition test
- debug state updates

This patch does NOT include:

- full offline tile cache
- service worker cache
- IndexedDB tile persistence
- custom vector tile server
- custom low-poly building proxy layer
- whole-route JFK→BOS tile prefetch
- replacing Mapbox buildings

---

# Files To Update

## Required

```text
wall/systems/presentation/predictiveTilePreloadRuntime.js
wall/systems/presentation/tilePreloadDebug.js
wall/systems/presentation/traversalControlDeck.js
```

## Likely Required

Find visible Mapbox constructor, likely:

```text
wall/runtimes/mapboxViewportRuntime.js
```

or equivalent Mapbox viewport runtime file.

Add visible map preload option there.

---

# Part 1 — PredictiveTilePreloadRuntime Additions

## Add New Public API

```js
preflightWarmRoute(options)
```

Signature:

```js
preflightWarmRoute({
  distanceAheadM: 3000,
  stepM: 150,
  maxMs: 30000,
  waitForIdle: true
})
```

Return:

```js
Promise<{
  ok: boolean,
  timedOut: boolean,
  warmedCount: number,
  distanceAheadM: number,
  elapsedMs: number
}>
```

---

# Part 2 — Corridor Sampling

The warmup should start from current route progress.

For `surface_glide`, default:

```js
distanceAheadM = 3000
stepM = 150
```

For regional mode, optional default:

```js
distanceAheadM = 12000
stepM = 750
```

For first implementation, surface-glide is the priority.

---

# Route Distance Sampling Requirement

Current route interpolation uses normalized route-T.

For better corridor warmup, implement distance-aware sampling if practical.

Required minimum:

- estimate total route distance using haversine
- convert `distanceAheadM / totalRouteM` into normalized progress delta
- sample from current progress to current progress + delta
- build queue points spaced roughly by `stepM`

If full cumulative-distance sampling is easy, use it.

If not, approximate using total route distance for v1.0.0.

---

# Part 3 — Hidden Map Warmup Behavior

For each sampled route point:

1. compute route-forward bearing
2. set hidden map center to point
3. use surface-glide zoom lock `16.2`
4. use pitch from visible map, fallback `68`
5. use `jumpTo()`
6. wait for `idle` or per-step timeout
7. mark point warmed
8. continue until corridor is complete or global `maxMs` is reached

Per-step timeout:

```js
1200ms to 2500ms
```

Global timeout:

```js
30000ms
```

If warmup times out, launch anyway with warning:

```text
PREFLIGHT WARMUP TIMEOUT — launching with partial cache
```

---

# Part 4 — Add `prefetchZoomDelta`

## Hidden Preload Map

Update hidden map constructor:

```js
_hiddenMap = new mapboxgl.Map({
  container,
  style,
  center,
  zoom,
  pitch,
  bearing,
  antialias: false,
  interactive: false,
  attributionControl: false,
  fadeDuration: 0,
  trackResize: false,
  renderWorldCopies: false,
  prefetchZoomDelta: 2
});
```

Start with:

```js
prefetchZoomDelta: 2
```

Do not jump straight to 3 unless testing proves it helps.

---

## Visible Map

Find visible Mapbox constructor and add:

```js
prefetchZoomDelta: 2
```

If the runtime already exposes a map option object, add it there.

Important:

Do not mutate this per frame.

This is a map construction option / early map configuration item.

---

# Part 5 — Mapbox Fog Helper

Add optional helper to PredictiveTilePreloadRuntime or TraversalContinuityAuthority:

```js
applyMapboxTraversalFog(mode)
clearMapboxTraversalFog()
```

Minimum behavior:

```js
map.setFog({
  range: [0.5, 10],
  color: '#d7dde6',
  'high-color': '#8fa6c9',
  'space-color': '#05070a',
  'horizon-blend': 0.04
});
```

Mode options:

```text
thin
harbor
storm
lowVisibility
```

Recommended values:

## thin

```js
{
  range: [0.8, 12],
  color: '#d7dde6',
  'high-color': '#9fb3d4',
  'space-color': '#05070a',
  'horizon-blend': 0.03
}
```

## harbor

```js
{
  range: [0.45, 7],
  color: '#c8d2dc',
  'high-color': '#7f98b6',
  'space-color': '#05070a',
  'horizon-blend': 0.06
}
```

## storm

```js
{
  range: [0.25, 5],
  color: '#9aa8b8',
  'high-color': '#536579',
  'space-color': '#030407',
  'horizon-blend': 0.10
}
```

Do not permanently overwrite user fog settings if MapStyleAuthority owns fog.

If fog authority already exists, route this through the correct presentation authority.

---

# Part 6 — Optional Extrusion Transition Test

Mapbox style transitions may soften sudden opacity changes.

Only test this if building layer detection is reliable.

For each detected `fill-extrusion` layer, test:

```js
map.setPaintProperty(layerId, 'fill-extrusion-opacity-transition', {
  duration: 500,
  delay: 0
});
```

If this property is not accepted by Mapbox GL JS, fail silently and log once.

Do NOT enable height animation by default.

Do NOT repeatedly mutate extrusion opacity per frame.

Do NOT let this fight MapStyleAuthority.

---

# Part 7 — Traversal Deck Integration

Add deck toggle:

```text
Warmup
```

Default:

```js
warmup: true
```

Persist:

```js
warmup
```

Launch behavior should become:

```js
async function launch() {
  read deck state
  save state
  presentationMode(true)

  stop existing trip
  plan/start route
  apply profile
  apply speed
  apply camera
  apply atmosphere
  enable continuity systems
  start/preinit PTPR

  if (warmup) {
    show deck launching/warming state
    await ptpr.preflightWarmRoute({
      distanceAheadM: 3000,
      stepM: 150,
      maxMs: 30000,
      waitForIdle: true
    })
  }

  start visible traversal / resume if paused
  hide deck in presentation mode
}
```

Important:

If current trip starts moving immediately on `startPlan()`, add a way to pause it before warmup:

```js
regionalFlight.pause()
```

Then after warmup:

```js
regionalFlight.resume()
```

If pause/resume debug methods already exist, use them.

If not, add safe runtime calls.

---

# Critical Launch Ordering

Visible movement should not begin before warmup.

Preferred sequence:

```text
1. build/resolve route
2. set profile
3. pause traversal
4. preflightWarmRoute()
5. resume traversal
```

If the current architecture cannot set route without starting movement, start route paused or immediately pause after start.

---

# Part 8 — Rolling Bubble Improvements

After launch, continue rolling preload.

Surface-glide lookahead should remain dense:

```js
[0.0001, 0.0002, 0.0003, 0.0005, 0.00075, 0.0010, 0.0015, 0.0025, 0.0040, 0.0060]
```

This is more coverage than the current 4-point queue.

Use this only if performance remains stable.

If hidden map causes FPS drop, fallback to:

```js
[0.0003, 0.0010, 0.0025, 0.0050]
```

---

# Part 9 — Debug API

Update:

```js
SBE.PredictiveTilePreloadRuntime
```

with:

```js
preflightWarmRoute
getState
```

`getState()` should include:

```js
preflight: {
  active,
  lastResult,
  warmedCount,
  targetDistanceM,
  stepM,
  startedAtMs,
  elapsedMs
}
```

---

# Part 10 — Debug Commands

Update:

```js
_wos.debug.tilePreload
```

Add:

```js
preflight(options)
```

Example:

```js
_wos.debug.tilePreload.preflight({
  distanceAheadM: 3000,
  stepM: 150,
  maxMs: 30000
})
```

Also include preflight state in:

```js
audit()
state()
```

---

# Success Criteria

This patch succeeds if:

- Launch Drift can warm the first route corridor before visible movement
- late buildings are reduced in the first 3–5km
- late land/shoreline vectors are reduced
- deck has Warmup toggle
- no console is required for normal testing
- hidden map does not visibly affect the map
- visible FPS remains watchable
- warmup timeout launches anyway
- Mapbox fog helps hide remaining late geometry
- `prefetchZoomDelta: 2` is applied to hidden map
- visible Mapbox map also uses `prefetchZoomDelta: 2`

---

# Failure Conditions

This patch fails if:

- warmup begins after traversal is already moving visibly
- route remains frozen forever after warmup
- warmup takes too long without timeout
- hidden map causes visible FPS collapse
- buildings still pop directly in the near foreground after warmup
- fog looks like a loading screen
- extrusion transition breaks building style
- user still needs console commands

---

# Notes

If this patch still cannot eliminate late building pop-in, Mapbox streaming is likely the ceiling for cinematic low-altitude traversal.

The next solution should not be more preload.

The next solution should be:

```text
custom low-poly proxy geometry / HLOD layer
```

WOS should then treat Mapbox as geographic substrate and render its own stylized near-field world layer above it.

---

# Implementation Guide

- Add `preflightWarmRoute()` to `predictiveTilePreloadRuntime.js`, plus `prefetchZoomDelta: 2` on hidden and visible Mapbox maps.
- Add `Warmup` toggle to `traversalControlDeck.js` and delay visible route movement until warmup completes or times out.
- Add Mapbox traversal fog helper and optional extrusion transition test, guarded behind safe runtime checks.
