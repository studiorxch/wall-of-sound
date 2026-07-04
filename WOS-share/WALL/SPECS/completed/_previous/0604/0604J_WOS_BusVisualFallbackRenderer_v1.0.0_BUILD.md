---
layout: spec
title: "Bus Visual Fallback Renderer"
date: 2026-06-04
doc_id: "0604J_WOS_BusVisualFallbackRenderer_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "bus_visual_fallback_renderer"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Renders a bounded, altitude-aware visible subset of vehicle.bus truth actors on the Wall using simple fallback bus shapes, without asset assignment, Studio editing, route styling, or full-feed rendering."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth may be dense"
  - "Presentation must be selective"
  - "Rendering is altitude-aware"

depends_on:
  - "0604G_WOS_MTABusFeedSourceInventory_v1.0.0"
  - "0604H_WOS_MTABusRealtimeAdapter_v1.0.0"
  - "0604I_WOS_MTABusActorBridge_v1.0.0"
  - "TruthActorRuntime"
  - "ActorRenderAuthority"
  - "WorldSpaceVehicleLayer"
  - "MapboxViewportRuntime"

enables:
  - "0604K_WOS_BusPresentationSelector_v1.0.0"
  - "0604L_WOS_BusRouteLabelPass_v1.0.0"
  - "0604M_WOS_BusAssetPack_v1.0.0"

tags:
  - "mta"
  - "bus"
  - "rendering"
  - "fallback"
  - "visibility-budget"
  - "altitude-aware"
---

# 0604J_WOS_BusVisualFallbackRenderer_v1.0.0_BUILD

## PURPOSE

Render live MTA bus truth actors on the Wall for the first time.

This spec creates the first visible proof that the MTA bus pipeline works:

```text
MTA GTFS-RT
→ raw rows
→ vehicle.bus truth actors
→ bounded visible bus fallback shapes
```

This is a fallback renderer, not the final bus visual language.

It must prove:

```text
Live buses can be seen on Wall.
```

without overbuilding:

```text
bus assets
route labels
Studio editing
motion smoothing
route colors
full asset assignment
```

---

# CURRENT BUILD CONTEXT

Completed:

```text
0604G_WOS_MTABusFeedSourceInventory_v1.0.0_BUILD
0604H_WOS_MTABusRealtimeAdapter_v1.0.0_BUILD
0604I_WOS_MTABusActorBridge_v1.0.0_BUILD
```

Current data path:

```text
MTA GTFS-RT vehicle positions
→ 0604H adapter rows
→ 0604I vehicle.bus truth actors
```

Current limitation:

```text
vehicle.bus actors exist in TruthActorRuntime
but are not visible because presentation has no bus fallback profile
```

This spec creates:

```text
vehicle.bus truth actors
→ visibility selection
→ WorldSpaceVehicleLayer fallback bus render payloads
```

---

# CORE DECISION

0604J must not render all bus actors by default.

The system may know about thousands of buses, but must only present what the current camera/view needs.

Canonical rule:

```text
Truth may be dense.
Presentation must be selective.
```

First-pass target:

```text
know: 0–6000 buses
render: 50–500 buses max depending on altitude and viewport
```

---

# AUTHORITY BOUNDARIES

## This spec owns

- first-pass bus visibility budgeting
- viewport-based bus selection
- altitude-aware fallback render mode
- simple bus fallback payload construction
- WSL upsert/remove for selected bus actors only
- bus renderer debug state
- scoped cleanup of bus visual payloads

## This spec may read

- `SBE.TruthActorRuntime`
- `SBE.MTABusActorBridge`
- `SBE.MapboxViewportRuntime`
- `SBE.WorldSpaceVehicleLayer`
- `SBE.ActorRenderAuthority` if available
- current map zoom/pitch/bounds/canvas size

## This spec may write

- `vehicle.bus` render payloads into `WorldSpaceVehicleLayer`

## This spec must not mutate

- TruthActorRuntime actor truth
- MTA feed adapter rows
- MTA actor bridge rows
- Mapbox sources/layers
- Asset Assignment Layer
- ActorAssetLibraryAuthority
- Studio
- AIS/marine systems
- Citi Bike/subway systems

---

# NEW FILE

```text
wall/systems/transit/busVisualFallbackRenderer.js
```

Register in:

```text
wall/index.html
```

after:

```text
wall/systems/transit/mtaBusActorBridge.js
```

and before any future bus asset/label renderer.

---

# PUBLIC API

Expose:

```js
SBE.BusVisualFallbackRenderer
```

Frozen API:

```js
start()
stop()
isActive()

renderOnce()
clear()

setEnabled(enabled)
setDebug(enabled)

setMaxVisible(count)
setViewportPaddingPx(px)

getState()
getSelectionState()
getRenderedIds()
```

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.worldActors
```

Required:

```js
busFallbackStart()
busFallbackStop()
busFallbackRenderOnce()
busFallbackClear()
busFallbackState()
busFallbackSelection()
busFallbackMaxVisible(count)
busFallbackDebug(on)
```

Optional convenience:

```js
busLiveProof()
```

Runs:

```text
mtaBusFetchOnce()
→ mtaBusActorBridgeSync()
→ busFallbackRenderOnce()
```

and returns a combined proof report.

---

# INPUT ACTOR CONTRACT

Renderer reads truth actors with:

```js
actorType === "vehicle.bus"
```

Expected actor fields:

```js
type BusTruthActor = {
  id: string
  actorType: "vehicle.bus"
  sourceId: "mta_bus_gtfs_rt_vehicle_positions"
  sourceEntityId: string
  lat: number
  lng: number
  headingDeg: number | null
  speedMps: number | null
  timestampMs: number
  ttlMs: number
  metadata: {
    routeId: string | null
    vehicleId: string
    tripId: string | null
    truthClass: "observed"
    presentationEligible: boolean
  }
}
```

Do not require clean `mta_bus:` ids.

0604I may currently produce registry-prefixed actor ids. This renderer must accept those ids and use metadata/source fields for bus detection.

---

# VISIBILITY SELECTION

## Selection order

1. Actor is `vehicle.bus`
2. Actor has valid lat/lng
3. Actor is not stale
4. Actor is inside viewport bounds with padding
5. Actor is presentation eligible
6. Actor fits current altitude budget
7. Actor is selected for render

## Viewport padding

Default:

```js
viewportPaddingPx = 160
```

Purpose:

```text
avoid popping at screen edge
```

## Stale policy

A bus is stale when:

```js
Date.now() - actor.timestampMs > staleAfterMs
```

Default stale window:

```js
SBE.MTABusFeedConfig.MTA_BUS_STALE_AFTER_MS || 45000
```

Stale buses must not render.

---

# ALTITUDE / ZOOM POLICY

Use current Mapbox zoom as first-pass altitude proxy.

```js
type BusAltitudeProfile =
  | "low"
  | "city"
  | "regional"
  | "cruise";
```

Baseline thresholds:

```js
zoom >= 15.5 → low
zoom >= 12.0 → city
zoom >= 9.0  → regional
zoom < 9.0   → cruise
```

These are tunable baselines, not permanent doctrine.

---

# RENDER BUDGETS

Default maximum visible buses:

```js
const BUS_MAX_VISIBLE_LOW = 120;
const BUS_MAX_VISIBLE_CITY = 300;
const BUS_MAX_VISIBLE_REGIONAL = 500;
const BUS_MAX_VISIBLE_CRUISE = 0;
```

Reason:

```text
low altitude needs detailed readability
city altitude can tolerate more simplified movement
regional altitude can show tiny movement signals
cruise altitude should not draw individual buses yet
```

Cruise mode is deferred to a future aggregate movement-field renderer.

---

# FALLBACK VISUAL MODES

## Low altitude

```text
simple 2.5D bus block
heading-aware
route metadata preserved
larger readable size
```

Payload hint:

```js
actorType: "vehicle.bus"
variant: "fallback_bus_low"
```

## City altitude

```text
short capsule/block
heading-aware
no route label
```

Payload hint:

```js
variant: "fallback_bus_city"
```

## Regional altitude

```text
tiny moving dot/light
heading optional
no label
```

Payload hint:

```js
variant: "fallback_bus_dot"
```

## Cruise altitude

```text
no individual buses
```

Future:

```text
aggregate city movement field
```

---

# WORLDSPACE VEHICLE PAYLOAD

For each selected bus, upsert into WSL:

```js
{
  id: "bus_fallback:" + actor.id,
  actorId: actor.id,
  actorType: "vehicle.bus",
  variant: resolvedVariant,
  lat: actor.lat,
  lng: actor.lng,
  headingDeg: actor.headingDeg || 0,
  scale: resolvedScale,
  visible: true,
  source: "mta-bus-fallback",
  metadata: {
    routeId: actor.metadata.routeId,
    vehicleId: actor.metadata.vehicleId,
    truthClass: "observed",
    altitudeProfile: profile
  }
}
```

Renderer must track its own WSL ids so `clear()` removes only bus fallback payloads.

---

# SCALE BASELINES

```js
low      → 1.00
city     → 0.72
regional → 0.38
cruise   → 0.00
```

If WSL has existing adaptive LOD, this renderer may pass base scale and let WSL apply its own final interpretation.

Do not override global WSL scale authority.

---

# SELECTION PRIORITY

When bus count exceeds budget, choose actors in this order:

1. inside viewport center area
2. most recently updated
3. moving buses over stationary/unknown speed
4. route-bearing actors over unknown route
5. stable deterministic fallback by actor id

First-pass implementation may use:

```text
distance to viewport center
then timestamp freshness
then actor id
```

---

# PERFORMANCE RULES

0604J must remain lightweight.

Requirements:

```text
no per-frame DOM creation
no Mapbox source/layer creation
no route label canvas yet
no permanent polling required
renderOnce() is enough
clear removed actors before re-render if necessary
avoid unbounded loops over render payloads
```

Maximum actor scan:

```js
maxScanActors = 6000
```

If truth actor count exceeds this number, scan only first `maxScanActors` with deterministic ordering and report truncation.

---

# RAF / POLLING

0604J does not need continuous RAF.

Required:

```js
renderOnce()
```

Optional:

```js
start({ intervalMs })
```

If implemented, interval must default to off or be conservative:

```js
intervalMs >= 15000
```

Reason:

```text
bus feed updates are not animation frames
```

Motion smoothing belongs to a later spec.

---

# STATE MODEL

```js
type BusVisualFallbackRendererState = {
  version: "1.0.0"
  active: boolean
  enabled: boolean
  debug: boolean

  lastRenderAt: number | null
  renderCount: number
  lastError: string | null

  truthActorCount: number
  eligibleCount: number
  viewportCandidateCount: number
  selectedCount: number
  renderedCount: number
  removedCount: number

  altitudeProfile: "low" | "city" | "regional" | "cruise"
  maxVisible: number
  viewportPaddingPx: number

  wslAvailable: boolean
  actorRuntimeAvailable: boolean
  mapAvailable: boolean
}
```

---

# SELECTION STATE MODEL

```js
type BusFallbackSelectionState = {
  totalBusActors: number
  validBusActors: number
  staleRejected: number
  viewportRejected: number
  selected: number
  budget: number
  profile: string
  renderedIds: string[]
}
```

---

# EXECUTION FLOW

Manual proof path:

```text
1. _wos.debug.worldActors.mtaBusSetApiKey("<key>")
2. _wos.debug.worldActors.mtaBusFetchOnce()
3. _wos.debug.worldActors.mtaBusActorBridgeSync()
4. _wos.debug.worldActors.busFallbackStart()
5. _wos.debug.worldActors.busFallbackRenderOnce()
6. _wos.debug.worldActors.busFallbackState()
```

Expected:

```text
live MTA buses visible on Wall
```

If none are visible:

```text
state must explain why:
- no truth actors
- no map
- no WSL
- outside viewport
- stale
- budget 0 due to cruise altitude
```

---

# INTEGRATION WITH EXISTING WSL

Use existing `SBE.WorldSpaceVehicleLayer.upsertVehicle()` if available.

Do not add a new renderer unless absolutely necessary.

If WSL does not recognize `actorType: "vehicle.bus"`, this spec must add a minimal fallback profile inside the existing presentation system or WSL shape resolver.

Required fallback behavior:

```text
vehicle.bus must render as a simple bus block/capsule
```

No final asset pack required.

---

# MINIMAL BUS SHAPE REQUIREMENT

If WSL shape resolution needs a new primitive, add:

```text
vehicle.bus / fallback_bus_low
vehicle.bus / fallback_bus_city
vehicle.bus / fallback_bus_dot
```

Visual target:

```text
readable low-poly transit block
white/gray base
cyan accent optional
small light/dot form at distance
```

Do not implement:

```text
full bus models
route color skins
SBS/express variants
window detail beyond simple fallback
```

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.BusVisualFallbackRenderer exists
no API key required
no actors required
no crash
```

## T2 — No truth actors

Expected:

```text
renderOnce() returns ok:true
renderedCount:0
lastError:null
```

## T3 — Valid bus actor renders

Given one valid `vehicle.bus` truth actor in viewport:

Expected:

```text
WSL receives one upsertVehicle payload
source = mta-bus-fallback
actorType = vehicle.bus
```

## T4 — Stale actor rejected

Expected:

```text
staleRejected increments
no WSL upsert
```

## T5 — Out-of-viewport actor rejected

Expected:

```text
viewportRejected increments
no WSL upsert
```

## T6 — Budget enforced

Given more bus actors than current profile budget:

Expected:

```text
renderedCount <= maxVisible
selection state reports budget
```

## T7 — Altitude profile changes budget

Expected:

```text
low/city/regional/cruise profiles resolve from zoom
cruise renders 0 individual buses
```

## T8 — Clear removes only fallback buses

Expected:

```text
bus_fallback:* WSL payloads removed
hero/traffic/AIS/marine payloads untouched
```

## T9 — No truth mutation

Expected:

```text
TruthActorRuntime actor count unchanged
actor metadata unchanged
```

## T10 — No Mapbox mutation

Expected:

```text
no new Mapbox sources
no new Mapbox layers
```

## T11 — No asset/studio mutation

Expected:

```text
AssetAssignment unchanged
ActorAssetLibrary unchanged
Studio untouched
```

## T12 — Debug commands work

Expected:

```text
busFallbackState()
busFallbackSelection()
busFallbackRenderOnce()
busFallbackClear()
```

return structured data without throwing.

---

# NON-GOALS

This spec does not create:

- final bus asset pack
- route badges
- route-color styling
- SBS/express variants
- Studio bus editor
- bus inspector
- motion smoothing
- interpolation
- route filtering UI
- Citi Bike rendering
- subway rendering
- synthetic trucks
- aggregate cruise movement field
- marble/hero location systems

---

# DEFERRED SYSTEMS

## 0604K — Bus Presentation Selector

Refine visibility budget, route focus, viewport priority, altitude policy, and future spatial buffering.

## 0604L — Bus Route Label Pass

Optional route labels/badges for close/city altitude.

## 0604M — Bus Asset Pack

Replace fallback shapes with authored bus forms.

## Future — City Movement Field

At cruise altitude, show citywide movement as aggregate light patterns instead of individual buses.

---

# NEXT SPEC

```text
0604K_WOS_BusPresentationSelector_v1.0.0_BUILD
```

Only after 0604J proves visible buses.

If 0604J exposes serious WSL shape limitations, insert:

```text
0604K_WOS_BusFallbackShapeResolver_v1.0.0_BUILD
```

before selector refinement.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/transit/busVisualFallbackRenderer.js`; register it in `wall/index.html` after `mtaBusActorBridge.js`; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`; add minimal `vehicle.bus` fallback shape handling inside the existing WSL/presentation shape resolver if needed.
- **What**: Run `node --check wall/systems/transit/busVisualFallbackRenderer.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: After `mtaBusFetchOnce()`, `mtaBusActorBridgeSync()`, and `busFallbackRenderOnce()`, a bounded number of live MTA buses appear on Wall, with no Mapbox sources/layers and no truth mutation.
