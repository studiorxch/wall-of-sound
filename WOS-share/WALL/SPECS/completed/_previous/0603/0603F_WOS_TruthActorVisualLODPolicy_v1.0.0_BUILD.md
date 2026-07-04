---
layout: spec
title: "Truth Actor Visual LOD Policy"
date: 2026-06-03
doc_id: "0603_WOS_TruthActorVisualLODPolicy_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "runtime"
component: "truth_actor_visual_lod_policy"

type: "runtime-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-authority"

summary: "Defines a shared visual LOD and presentation gate for truth-backed actors so dense public-feed layers can remain useful without flooding the renderer."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth records must persist even when presentation is suppressed"
  - "Synthetic actors are supplements, not the primary world layer"

depends_on:
  - "0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0"
  - "0603B_WOS_PublicFeedSourceInventory_v1.0.0"
  - "0603C_WOS_CitiBikeGBFSStationRuntime_v1.0.0"
  - "0603D_WOS_CitiBikeStationVisualProfile_v1.0.0"
  - "0603E_WOS_CitiBikeStationRenderBridge_v1.0.0"

enables:
  - "safe dense truth layers"
  - "shared actor presentation gating"
  - "future MTA bus rendering"
  - "future subway station / train LOD"
  - "future ferry, DOT, utility, prop actor display"

tags:
  - "wos"
  - "truth-infrastructure"
  - "actor-runtime"
  - "lod"
  - "presentation"
  - "density"
---

# 0603F_WOS_TruthActorVisualLODPolicy_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Create a shared visual LOD policy for truth-backed actors.

0603E proved that Citi Bike stations can move through the full chain:

```text
GBFS truth
→ actor identity
→ visual state
→ rendered station node
```

The next general problem is not Citi Bike-specific:

```text
2410 truth actors
≠
2410 things that should render at every zoom
```

0603F centralizes presentation gating so every future truth layer does not invent its own visibility, density, scale, and viewport rules.

---

# Core Principle

Truth must remain complete.

Presentation may be selective.

```text
TruthActorRuntime stores what exists.
TruthActorVisualLODPolicy decides what should be shown.
WorldSpaceVehicleLayer renders only what presentation allows.
```

---

# Current Problem

Without shared LOD policy:

```text
Citi Bike stations need viewport filters.
MTA buses will need density caps.
Subway stations will need zoom thresholds.
Ferries need persistent visibility.
DOT incidents need priority overrides.
Utility vehicles need rare/high-priority treatment.
```

If each feed builds its own rules, WOS will drift into duplicated, conflicting presentation logic.

---

# Scope

0603F creates:

```js
SBE.TruthActorVisualLODPolicy
```

A shared policy module that resolves whether a truth actor should render, and how strongly it should render, based on:

```text
actor type
source
zoom
viewport
priority
distance from camera / hero
density caps
visual state
```

This is a presentation authority only.

---

# Non-Goals

This spec does not build:

- MTA bus runtime
- feed fetching
- clustering
- heatmaps
- labels
- route lines
- subway runtime
- collision
- synthetic traffic
- camera changes
- Mapbox style changes
- new ColorRegistry
- new GlyphRegistry
- UI inspector

---

# Authority Boundaries

## Owns

0603F owns:

- truth actor render eligibility
- zoom-level visibility thresholds
- per-type visual density caps
- per-type scale multiplier policy
- per-source priority ordering
- presentation suppression reasons
- debug reporting for rendered vs suppressed actors

## May Read

0603F may read:

- `SBE.TruthActorRuntime`
- `SBE.ActorTypes`
- `SBE.ActorSourceRegistry`
- `SBE.CitiBikeStationVisualProfile`
- `SBE.MapboxViewportRuntime`
- current map zoom / bounds / screen size
- actor metadata

## May Mutate

0603F may mutate only:

- render payload presentation fields before WSL upsert
- render eligibility decision
- debug/reporting state

## Must Not Mutate

0603F must not mutate:

- source feed data
- actor identity
- actor truth records
- actor metadata truth
- station availability
- AIS runtime
- aircraft runtime
- hero runtime
- ambient traffic runtime
- Mapbox style
- polling cadence
- route/camera behavior

---

# Required Module

Create:

```text
wall/systems/actors/truthActorVisualLODPolicy.js
```

Load after:

```text
actorVisualRegistry.js
citibikeStationVisualProfile.js
```

and before or alongside:

```text
truthActorRuntime.js
```

Recommended `index.html` order:

```html
<script src="./systems/actors/actorTypes.js"></script>
<script src="./systems/actors/actorSourceRegistry.js"></script>
<script src="./systems/actors/publicFeedSourceInventory.js"></script>
<script src="./systems/actors/actorIdentityRegistry.js"></script>
<script src="./systems/actors/actorVisualRegistry.js"></script>
<script src="./systems/actors/truthActorVisualLODPolicy.js"></script>
<script src="./systems/actors/truthActorRuntime.js"></script>
```

If `truthActorRuntime.js` already loads before this, the runtime must guard for missing policy and use a safe fallback.

No crash.

---

# Public API

```js
SBE.TruthActorVisualLODPolicy = Object.freeze({
  VERSION,
  resolvePresentation,
  getState,
  setEnabled,
  setDebug,
  setProfile,
  getProfile,
});
```

## `resolvePresentation(actor, visual, context)`

Input:

```js
{
  actor,
  visual,
  context
}
```

Output:

```js
{
  render: boolean,
  reason: string,
  lodTier: "hidden" | "dot" | "node" | "icon" | "model",
  scaleMultiplier: number,
  opacityMultiplier: number,
  priority: number,
  maxVisibleForType: number,
  metadata: {
    zoom,
    actorType,
    sourceId,
    screenX,
    screenY,
    inViewport,
    distanceFromCenterPx
  }
}
```

---

# Context Model

Policy must compute context safely.

```js
type TruthActorLODContext = {
  zoom: number | null
  pitch: number | null
  bounds: object | null
  viewportWidth: number
  viewportHeight: number
  screenX: number | null
  screenY: number | null
  inViewport: boolean
  distanceFromCenterPx: number | null
}
```

If map context is unavailable:

```text
do not throw
render sparse high-priority actors only
reason = "map_context_missing"
```

---

# Default Actor LOD Profiles

Create internal default profiles:

```js
const DEFAULT_LOD_PROFILE = {
  "bike.station": {
    minZoom: 13.0,
    dotZoom: 13.0,
    nodeZoom: 14.5,
    iconZoom: 16.0,
    maxVisible: 600,
    basePriority: 20,
    scaleMultiplier: 1.0,
    opacityMultiplier: 1.0,
    viewportPaddingPx: 240
  },

  "vehicle.bus": {
    minZoom: 10.5,
    dotZoom: 10.5,
    nodeZoom: 12.5,
    iconZoom: 14.0,
    modelZoom: 15.5,
    maxVisible: 180,
    basePriority: 70,
    scaleMultiplier: 1.0,
    opacityMultiplier: 1.0,
    viewportPaddingPx: 320
  },

  "vehicle.utility": {
    minZoom: 10.0,
    dotZoom: 10.0,
    nodeZoom: 12.0,
    iconZoom: 14.0,
    modelZoom: 15.0,
    maxVisible: 80,
    basePriority: 85,
    scaleMultiplier: 1.1,
    opacityMultiplier: 1.0,
    viewportPaddingPx: 360
  },

  "transit.train": {
    minZoom: 9.5,
    dotZoom: 9.5,
    nodeZoom: 11.5,
    iconZoom: 13.5,
    modelZoom: 15.0,
    maxVisible: 250,
    basePriority: 75,
    scaleMultiplier: 1.0,
    opacityMultiplier: 1.0,
    viewportPaddingPx: 360
  },

  "marine.vessel": {
    minZoom: 8.5,
    dotZoom: 8.5,
    nodeZoom: 10.5,
    iconZoom: 12.0,
    modelZoom: 13.5,
    maxVisible: 300,
    basePriority: 80,
    scaleMultiplier: 1.0,
    opacityMultiplier: 1.0,
    viewportPaddingPx: 420
  },

  "aircraft.plane": {
    minZoom: 7.0,
    dotZoom: 7.0,
    nodeZoom: 9.0,
    iconZoom: 11.0,
    modelZoom: 12.5,
    maxVisible: 200,
    basePriority: 75,
    scaleMultiplier: 1.0,
    opacityMultiplier: 1.0,
    viewportPaddingPx: 500
  },

  "civic.incident": {
    minZoom: 8.0,
    dotZoom: 8.0,
    nodeZoom: 10.0,
    iconZoom: 12.0,
    maxVisible: 120,
    basePriority: 95,
    scaleMultiplier: 1.2,
    opacityMultiplier: 1.0,
    viewportPaddingPx: 480
  },

  "world.prop": {
    minZoom: 14.0,
    dotZoom: 14.0,
    nodeZoom: 15.0,
    iconZoom: 16.0,
    modelZoom: 16.5,
    maxVisible: 300,
    basePriority: 40,
    scaleMultiplier: 1.0,
    opacityMultiplier: 1.0,
    viewportPaddingPx: 200
  }
};
```

Synthetic actors should default lower:

```js
"vehicle.synthetic": {
  minZoom: 15.0,
  maxVisible: 24,
  basePriority: 10
}
```

---

# LOD Tier Rules

Resolve tier by zoom:

```text
zoom < minZoom     → hidden
zoom >= dotZoom    → dot
zoom >= nodeZoom   → node
zoom >= iconZoom   → icon
zoom >= modelZoom  → model
```

If `modelZoom` is absent, highest tier is `icon`.

For `bike.station`, highest required tier for now is:

```text
node
```

because stations should not become vehicle meshes.

---

# Priority Rules

Priority score should combine:

```text
profile basePriority
+ visual priority
+ source truth priority
+ rare/alert boost
- distance penalty
```

## Visual Priority

If `visual.priority` exists, add it.

Citi Bike states from 0603D currently prioritize:

```text
offline > empty > stale > low > full > balanced
```

## Source Truth Priority

Truth-backed sources receive a boost:

```js
truth-backed: +10
synthetic: +0
```

## Alert Boost

If metadata indicates:

```text
offline
incident
emergency
maintenance
delay
closure
```

add:

```js
+20
```

## Distance Penalty

Actors farther from viewport center receive a small penalty.

Do not overdo this.

```js
distancePenalty = clamp(distanceFromCenterPx / 900, 0, 12)
```

---

# Density Gate

The policy must support dense layers without deleting truth.

For each actor type:

```text
sort candidates by priority descending
render first maxVisible
suppress the rest
```

Suppression reason:

```text
density_cap
```

This can be implemented in either:

1. `TruthActorRuntime` batch render step, or
2. simple per-upsert policy with runtime counts.

Preferred:

```text
TruthActorRuntime tracks presentation decisions per actor
```

and recomputes when actors refresh.

If a full batch recompute is too large for this build, implement the minimal per-upsert version now and expose that limitation honestly in debug state.

---

# Viewport Gate

An actor may render if:

```text
in viewport
or within viewportPaddingPx
```

Suppression reason:

```text
outside_viewport`
```

Viewport gate must not delete truth records.

---

# Render Payload Integration

Modify:

```text
wall/systems/actors/truthActorRuntime.js
```

Before WSL upsert:

```js
var presentation = SBE.TruthActorVisualLODPolicy.resolvePresentation(record, visual, context)
```

If:

```js
presentation.render === false
```

then:

```js
record._presentation = presentation
record._rendered = false
remove/hide existing rendered mesh if present
return true
```

Do not delete actor truth.

If render is true:

```js
payload.scale *= presentation.scaleMultiplier
payload.opacity *= presentation.opacityMultiplier
payload.lodTier = presentation.lodTier
payload.presentationReason = presentation.reason
payload.presentationPriority = presentation.priority
```

---

# Mesh Removal on Suppression

If an actor was previously rendered and now becomes suppressed, remove its mesh from WSL:

```js
SBE.WorldSpaceVehicleLayer.removeVehicle(actorId)
```

but keep the truth actor record.

This prevents old actors from persisting visually after zooming out or moving away.

---

# State Reporting

Policy must expose:

```js
{
  version,
  enabled,
  debug,
  profileName,
  lastContext,
  actorTypeCounts,
  renderedCounts,
  suppressedCounts,
  suppressionReasons,
  maxVisibleByType,
  lastError
}
```

`TruthActorRuntime.getState()` should optionally include:

```js
presentationCounts: {
  rendered,
  suppressed,
  byReason,
  byActorType
}
```

---

# Debug API

Add under:

```js
_wos.debug.worldActors
```

Commands:

```js
truthLODState()
truthLODSample()
truthLODEnable(on)
truthLODDebug(on)
truthLODProfile(profileName)
```

## `truthLODState()`

Prints:

```text
enabled
profileName
rendered count
suppressed count
suppression reasons
actor type counts
max visible by type
lastError
```

## `truthLODSample()`

Prints first 20 truth actors:

```text
actorId
actorType
sourceId
rendered
lodTier
reason
priority
scaleMultiplier
opacityMultiplier
```

---

# Citi Bike Expected Behavior

With Citi Bike stations loaded:

```js
_wos.debug.worldActors.citibikeStart()
setTimeout(()=>_wos.debug.worldActors.truthLODState(), 5000)
```

Expected:

```text
bike.station truth count can remain 2410
rendered bike.station count stays viewport/cap limited
suppressed stations report outside_viewport, below_min_zoom, or density_cap
station nodes still use visual state from 0603D/E
```

At neighborhood zoom:

```text
visible Citi Bike stations render as station nodes
```

At city-wide zoom:

```text
most stations suppress or downgrade to dot-level presentation
```

---

# Performance Guardrails

- no per-frame full actor sort
- no network fetches
- no Mapbox style mutation
- no tight-loop rebuilds
- no repeated WSL remove/upsert churn for unchanged decisions

Cache last decision per actor:

```js
record._presentationKey
```

Only remove/re-upsert when:

```text
render flag changes
lodTier changes
variant changes
scale bucket changes
opacity bucket changes
```

This avoids 2410 stations constantly rebuilding.

---

# Minimal Acceptable Implementation

If full density sorting is too large for this pass, implement:

```text
zoom gate
viewport gate
type maxVisible soft counter
presentation state reporting
mesh removal on suppression
```

and defer true priority sorting to 0603F.1.

But do not skip:

```text
truth preserved
presentation suppressed
debug reports why
```

---

# Validation Checklist

- [ ] `SBE.TruthActorVisualLODPolicy` exists
- [ ] module loads without throwing
- [ ] `resolvePresentation()` returns deterministic decisions
- [ ] `bike.station` has minZoom and maxVisible policy
- [ ] suppressed actors remain in `TruthActorRuntime`
- [ ] suppressed actors are removed from WSL presentation
- [ ] actor truth counts and rendered counts differ correctly
- [ ] Citi Bike stations still render as station nodes when eligible
- [ ] no station truth is deleted by LOD
- [ ] no feed runtime changes
- [ ] no moving bikes created
- [ ] no hero / AIS / aircraft / ambient mutation
- [ ] debug reports suppression reasons
- [ ] no app freeze with 2410 Citi Bike stations

---

# Acceptance Test

Run:

```js
_wos.debug.worldActors.citibikeStart()
setTimeout(()=>_wos.debug.worldActors.citibikeState(), 4000)
setTimeout(()=>_wos.debug.worldActors.citibikeRenderBridgeState(), 5000)
setTimeout(()=>_wos.debug.worldActors.truthLODState(), 6000)
setTimeout(()=>_wos.debug.worldActors.truthLODSample(), 7000)
```

Expected:

```text
Citi Bike station truth count remains full or viewport-managed by runtime.
Rendered station count is presentation-limited.
Suppression reasons are visible.
Eligible station actors render as station nodes.
No moving bikes.
No synthetic trips.
No freezes.
```

---

# Failure Conditions

This build fails if:

- truth actors are deleted because they are visually suppressed
- WSL keeps showing suppressed actors after zoom/pan
- visual LOD mutates station availability metadata
- visual LOD changes feed polling cadence
- visual LOD creates moving bikes
- visual LOD creates synthetic actors
- hero Drive behavior changes
- AIS / aircraft behavior changes
- Mapbox style is mutated
- 2410 actors cause repeated mesh rebuild churn
- debug cannot explain why actors are hidden

---

# Deferred

Deferred to later specs:

- priority-sorted batch renderer if minimal implementation is used
- actor clustering
- station heatmap
- subway station LOD
- bus model LOD
- DOT incident flashing markers
- rare-vehicle highlight rules
- user-facing layer toggles
- LOD editor UI

---

# Implementation Guide

- **Where**: Create `wall/systems/actors/truthActorVisualLODPolicy.js`; register it in `index.html` after `actorVisualRegistry.js` and before/with `truthActorRuntime.js`; modify `wall/systems/actors/truthActorRuntime.js` to consult the policy before WSL upsert; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/actors/truthActorVisualLODPolicy.js`, `node --check wall/systems/actors/truthActorRuntime.js`, and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; then run Citi Bike startup plus `truthLODState()` and `truthLODSample()` in browser.
- **Expect**: Truth actors remain stored, rendered actors are presentation-gated by zoom/viewport/type cap, station nodes remain visible when eligible, and suppression reasons are reported without deleting source truth.
