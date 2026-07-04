---
layout: spec
title: "Cruise Movement Field"
date: 2026-06-05
doc_id: "0605D_WOS_CruiseMovementField_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "cruise_movement_field"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Creates a far-altitude aggregate movement field from live transit truth so cruise/regional views show city-scale movement without rendering individual buses."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth may be dense"
  - "Presentation must be selective"
  - "Cruise shows aggregate movement, not individual vehicles"
  - "Atmosphere is presentation-only"

depends_on:
  - "0604H_WOS_MTABusRealtimeAdapter_v1.0.0"
  - "0604I_WOS_MTABusActorBridge_v1.0.0"
  - "0604K_WOS_BusPresentationSelector_v1.0.0"
  - "0605A_WOS_TransitPresencePass_v1.0.0"
  - "0605B_WOS_BusMotionSmoothing_v1.0.0"
  - "0605C_WOS_TransitLiveryHooks_v1.0.0"
  - "TruthActorRuntime"
  - "MapboxViewportRuntime"

enables:
  - "0605E_WOS_HeroTransitTargeting_v1.0.0"
  - "0605F_WOS_TransitSponsoredWrapPass_v1.0.0"
  - "0605G_WOS_GraffitiTransitWrapPass_v1.0.0"
  - "0605H_WOS_StudioTransitAssignmentPanel_v1.0.0"

tags:
  - "transit"
  - "bus"
  - "cruise"
  - "aggregate"
  - "movement-field"
  - "far-altitude"
  - "presentation"
---

# 0605D_WOS_CruiseMovementField_v1.0.0_BUILD

## PURPOSE

Make the city feel alive from far altitude.

0604J/0604K intentionally disable individual bus rendering at cruise altitude.

That was correct.

But the result is a visual gap:

```text
WOS knows live bus truth
but cruise altitude shows no transit motion
```

0605D solves that gap with an aggregate movement field:

```text
dense live bus truth
→ spatial aggregation
→ tiny moving civic light pulses
→ city-scale transit activity
```

This is not a vehicle renderer.

This is not a map layer.

This is a presentation-only far-view atmospheric field.

---

# CURRENT BUILD CONTEXT

Current transit stack:

```text
0604G Feed Inventory          ✅
0604H Realtime Adapter        ✅
0604I Actor Bridge            ✅
0604J Fallback Renderer       ✅
0604K Presentation Selector   ✅
0604L Debug Labels            ✅
0604M Bus Asset Pack          ✅
0605A Transit Presence        ✅
0605B Motion Smoothing        ✅
0605C Livery Hooks            ✅
```

Current rule:

```text
low/city/regional may show selected individual buses
cruise shows zero individual buses
```

0605D adds:

```text
cruise/regional aggregate movement field
```

without violating:

```text
no individual bus drawing at cruise
```

---

# CORE DECISION

Cruise altitude should not render individual buses.

It should render:

```text
aggregate movement energy
```

This keeps the far view:

```text
lightweight
atmospheric
truth-derived
cinematic
```

without turning the Wall into:

```text
5,000 tiny vehicle sprites
```

Canonical split:

```text
TruthActorRuntime knows buses.
BusPresentationSelector chooses visible individual buses.
CruiseMovementField summarizes dense movement.
```

---

# AUTHORITY BOUNDARIES

## This spec owns

- far-altitude transit aggregation
- grid/bin movement summaries
- screen-space movement pulse drawing
- cruise/regional field presets
- aggregate debug state
- zero-field explanations

## This spec may read

- `SBE.TruthActorRuntime`
- `SBE.BusPresentationSelector`
- `SBE.BusMotionSmoothing`
- `SBE.MapboxViewportRuntime`
- bus truth actor metadata
- bus routeId / vehicleId / speed / heading / freshness
- current zoom/profile/bounds

## This spec may write

- its own canvas overlay only
- its own aggregate state only

## This spec must not write

- TruthActorRuntime
- actor metadata
- MTA adapter rows
- MTA actor bridge rows
- BusPresentationSelector state
- BusVisualFallbackRenderer payloads
- BusMotionSmoothing cache
- TransitPresencePass state
- Mapbox sources/layers
- WorldSpaceVehicleLayer
- Studio
- maritime/AIS systems
- Citi Bike/subway systems

---

# NEW FILE

```text
wall/systems/transit/cruiseMovementField.js
```

Register in:

```text
wall/index.html
```

after:

```text
wall/systems/transit/busMotionSmoothing.js
wall/systems/transit/transitPresencePass.js
```

and before debug tooling.

---

# PUBLIC API

Expose:

```js
SBE.CruiseMovementField
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
setPreset(presetName)
getPreset()

setIntensity(value)
setMaxCells(count)
setCellSizePx(px)

getState()
getCells()
getRenderedPulses()
```

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.worldActors
```

Required:

```js
cruiseFieldStart()
cruiseFieldStop()
cruiseFieldRenderOnce()
cruiseFieldClear()
cruiseFieldState()
cruiseFieldCells()
cruiseFieldPulses()
cruiseFieldPreset(name)
cruiseFieldIntensity(value)
cruiseFieldMaxCells(count)
cruiseFieldCellSize(px)
cruiseFieldDebug(on)
```

Optional convenience:

```js
cruiseTransitProof()
```

Runs:

```text
busLiveProof()
→ cruiseFieldRenderOnce()
```

and returns a combined report.

---

# RENDERING STRATEGY

Use a single transparent 2D canvas overlay.

Requirements:

```text
pointer-events: none
position: absolute
inset: 0
z-index above Mapbox canvas
below UI panels
mix-blend-mode: screen
no DOM element per bus
no Mapbox source/layer creation
no WSL payloads
```

If no map/container exists:

```text
return ok:false
lastError:'map_unavailable'
never throw
```

---

# INPUT ACTOR SOURCE

Unlike 0605A, the field may scan bus truth directly.

Reason:

```text
The selector intentionally returns zero individual buses at cruise.
The aggregate field needs dense truth, not selected individual render candidates.
```

Allowed source:

```js
SBE.TruthActorRuntime.listActors()
```

Filter:

```text
actorType === vehicle.bus
or sourceId === mta_bus_gtfs_rt_vehicle_positions
```

Do not use WSL rendered vehicles as source.

---

# AGGREGATION MODEL

Project valid bus actors to screen space.

Group them into screen cells:

```js
cellSizePx = 96
```

Each cell stores:

```js
type CruiseMovementCell = {
  cellId: string
  x: number
  y: number

  busCount: number
  movingCount: number
  avgSpeedMps: number
  avgHeadingX: number
  avgHeadingY: number

  routeSample: string[]
  newestTimestampMs: number
  freshnessMs: number

  intensity: number
}
```

Cell coordinate:

```js
cellX = Math.floor(screenX / cellSizePx)
cellY = Math.floor(screenY / cellSizePx)
cellId = cellX + ":" + cellY
```

---

# VALID BUS FILTER

Include bus when:

```text
valid lat/lng
not stale
inside screen bounds with padding
presentationEligible !== false
```

Stale threshold:

```js
SBE.MTABusFeedConfig.MTA_BUS_STALE_AFTER_MS || 45000
```

Viewport padding:

```js
fieldPaddingPx = 240
```

Do not include stale buses.

Do not include buses without valid coordinates.

---

# ALTITUDE POLICY

0605D draws at:

```text
regional
cruise
```

It does not draw at:

```text
low
city
```

Reason:

```text
low/city already have individual buses and presence cues
```

Baseline zoom policy:

```js
zoom >= 12.0 → off
zoom >= 9.0  → regional aggregate
zoom < 9.0   → cruise aggregate
```

Regional mode may show both:

```text
tiny individual selected buses
and
very subtle aggregate field
```

Cruise mode shows:

```text
aggregate only
```

---

# CELL BUDGETS

Default maximum cells:

```js
regional → 80
cruise   → 160
low/city → 0
```

If cells exceed budget:

```text
keep strongest intensity cells
then newest cells
then deterministic cellId
```

---

# FIELD PRESETS

Required presets:

```js
"clean"
"night_grid"
"cyan_infra"
"debug_heat"
"off"
```

## clean

```text
minimal faint movement hints
```

## night_grid

Default.

```text
soft civic light clusters
tiny pulses
slight directional drift
```

## cyan_infra

```text
cool WOS/StudioRich movement energy
cyan transit field
```

## debug_heat

```text
strong diagnostic field
cell density clearly visible
not for stream output
```

## off

```text
enabled false
renderOnce ok:true pulseCount:0
```

---

# VISUAL CUE TYPES

## Density pulse

Draw a small soft dot at cell center.

Strength:

```text
busCount + movingCount + freshness
```

## Direction tick

Draw a tiny line in average heading direction.

Only when:

```text
movingCount > 0
```

Allowed:

```text
debug_heat
night_grid
cyan_infra
```

## Cluster shimmer

A low-frequency alpha pulse per cell.

Seed by:

```text
cellId hash
```

Never allocate new random values per frame.

---

# INTENSITY MODEL

Cell intensity:

```text
density component
+ moving component
+ freshness component
```

Baseline:

```js
density = min(busCount / 8, 1) * 0.45
movement = min(movingCount / 5, 1) * 0.35
freshness = max(0, 1 - freshnessMs / 45000) * 0.20
intensity = density + movement + freshness
```

Clamp:

```js
0..1
```

---

# PERFORMANCE REQUIREMENTS

0605D must remain lightweight.

Requirements:

```text
single canvas
no DOM-per-bus
no Mapbox sources/layers
no WSL calls
no Three.js geometry
scan cap 6000 buses
cell budget enforced
deterministic cell ordering
no continuous RAF by default
optional interval >= 15000ms
no per-frame random allocation
```

Default:

```text
manual renderOnce()
```

---

# STATE MODEL

```js
type CruiseMovementFieldState = {
  version: "1.0.0"
  active: boolean
  enabled: boolean
  debug: boolean

  preset: string
  intensity: number

  lastRenderAt: number | null
  renderCount: number
  lastError: string | null

  profile: "low" | "city" | "regional" | "cruise"
  busActorCount: number
  validBusCount: number
  staleRejected: number
  viewportRejected: number
  cellCount: number
  renderedPulseCount: number
  budgetRejected: number

  cellSizePx: number
  maxCells: number | null

  canvasAttached: boolean
  canvasSize: {
    width: number
    height: number
    dpr: number
  }

  zeroFieldReason: string | null
}
```

---

# ZERO FIELD REASONS

Use explicit vocabulary:

```js
type CruiseFieldZeroReason =
  | "disabled"
  | "off_profile_low_city"
  | "map_unavailable"
  | "actor_runtime_unavailable"
  | "no_bus_truth"
  | "no_valid_bus_coordinates"
  | "all_buses_stale"
  | "all_buses_outside_viewport"
  | "no_cells_after_budget"
  | "unknown";
```

Every zero-pulse output must explain why.

---

# RENDERED PULSE MODEL

```js
type CruiseMovementPulse = {
  cellId: string
  screenX: number
  screenY: number

  busCount: number
  movingCount: number
  avgSpeedMps: number
  intensity: number

  routeSample: string[]
}
```

`getRenderedPulses()` returns these lightweight debug objects.

---

# EXECUTION FLOW

Manual proof:

```text
1. _wos.debug.worldActors.mtaBusSetApiKey("<key>")
2. _wos.debug.worldActors.busLiveProof()
3. zoom to regional/cruise altitude
4. _wos.debug.worldActors.cruiseFieldStart()
5. _wos.debug.worldActors.cruiseFieldPreset("night_grid")
6. _wos.debug.worldActors.cruiseFieldRenderOnce()
7. _wos.debug.worldActors.cruiseFieldState()
```

Expected:

```text
far city view shows subtle aggregate movement pulses
no individual cruise buses are drawn
truth remains unchanged
Mapbox remains unchanged
WSL remains unchanged
```

---

# VISUAL TARGET

The field should read as:

```text
citywide transit pulse
tiny civic movement
far-away moving infrastructure
night city activity
```

not:

```text
particle explosion
heatmap dashboard
neon confetti
debug noise
```

Default must be subtle.

`debug_heat` may be loud.

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.CruiseMovementField exists
no key required
no actors required
no crash
```

## T2 — Starts safely

Expected:

```text
start() attaches one canvas when map container exists
active:true
canvasAttached:true
```

## T3 — Stops safely

Expected:

```text
stop() active:false
canvas hidden or cleared
no RAF leak
```

## T4 — Low/city draws zero

At low or city profile:

```text
renderedPulseCount:0
zeroFieldReason:'off_profile_low_city'
```

## T5 — Regional draws aggregate cells

Given valid regional bus truth:

```text
cellCount > 0
renderedPulseCount > 0
```

## T6 — Cruise draws aggregate cells

Given valid cruise bus truth:

```text
cellCount > 0
renderedPulseCount > 0
```

## T7 — Stale buses rejected

Expected:

```text
staleRejected increments
stale buses do not contribute to cells
```

## T8 — Invalid coordinates rejected

Expected:

```text
validBusCount excludes invalid actors
no throw
```

## T9 — Cell aggregation works

Given multiple buses in same screen cell:

```text
one cell produced
busCount equals grouped actor count
```

## T10 — Moving count works

Given speedMps > 0.5:

```text
movingCount increments
avgSpeedMps computed
```

## T11 — Budget enforced

Given cells above max:

```text
renderedPulseCount <= maxCells
budgetRejected increments
```

## T12 — Presets apply safely

Expected:

```text
clean/night_grid/cyan_infra/debug_heat/off valid
invalid preset returns false and leaves current preset unchanged
```

## T13 — Intensity clamps

Expected:

```text
setIntensity(-1) → 0
setIntensity(2) → 1
```

## T14 — No truth mutation

Expected:

```text
TruthActorRuntime actor count unchanged
actor metadata unchanged
```

## T15 — No WSL mutation

Expected:

```text
no upsertVehicle/removeVehicle calls
```

## T16 — No Mapbox mutation

Expected:

```text
no new sources
no new layers
```

## T17 — Debug commands work

Expected:

```text
cruiseFieldState()
cruiseFieldCells()
cruiseFieldPulses()
cruiseFieldRenderOnce()
cruiseFieldPreset()
```

return structured data without throwing.

---

# NON-GOALS

This spec does not create:

```text
individual cruise bus rendering
bus labels
route labels
route heatmap UI
public transit dashboard
bus ads
graffiti wraps
camera follow
hero targeting
subway movement field
Citi Bike movement field
Mapbox layer styling
Studio controls
```

---

# DEFERRED SYSTEMS

## 0605E — Hero Transit Targeting

Follow/select one route or bus for camera/world moments.

## 0605F — Transit Sponsored Wrap Pass

Actual ad panel/wrap rendering.

## 0605G — Graffiti Transit Wrap Pass

Actual graffiti/wildstyle wrap rendering.

## 0605H — Studio Transit Assignment Panel

Authoring interface for assigning liveries.

## Future — Multi-Modal Movement Field

Aggregate buses, subway, bikes, ferries, aircraft into one far-view city pulse.

---

# NEXT SPEC

Recommended next:

```text
0605E_WOS_HeroTransitTargeting_v1.0.0_BUILD
```

Reason:

```text
buses are now real, visible, smooth, present, skinnable, and visible at far altitude
next value is picking/following meaningful buses or routes for cinematic moments
```

Alternative:

```text
0605H_WOS_StudioTransitAssignmentPanel_v1.0.0_BUILD
```

if the immediate need is assigning liveries without console commands.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/transit/cruiseMovementField.js`; register it in `wall/index.html` after `transitPresencePass.js`; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/transit/cruiseMovementField.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: At regional/cruise zoom, live bus truth is aggregated into subtle screen-space movement pulses; no individual cruise buses render; truth, WSL, Mapbox, selector, smoothing, livery, and presence systems remain unchanged.
