---
layout: spec
title: "Bus Presentation Selector"
date: 2026-06-04
doc_id: "0604K_WOS_BusPresentationSelector_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "bus_presentation_selector"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Refines live MTA bus presentation selection by separating bus truth scanning from camera-aware selection policy, with viewport priority, route focus, spatial buffering, and altitude-aware budgets."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth may be dense"
  - "Presentation must be selective"
  - "Rendering is altitude-aware"
  - "Selector before final renderer polish"

depends_on:
  - "0604G_WOS_MTABusFeedSourceInventory_v1.0.0"
  - "0604H_WOS_MTABusRealtimeAdapter_v1.0.0"
  - "0604I_WOS_MTABusActorBridge_v1.0.0"
  - "0604J_WOS_BusVisualFallbackRenderer_v1.0.0"
  - "TruthActorRuntime"
  - "MapboxViewportRuntime"
  - "WorldSpaceVehicleLayer"

enables:
  - "0604L_WOS_BusRouteLabelPass_v1.0.0"
  - "0604M_WOS_BusAssetPack_v1.0.0"
  - "0604N_WOS_BusMotionSmoothing_v1.0.0"
  - "0604O_WOS_CruiseMovementField_v1.0.0"

tags:
  - "mta"
  - "bus"
  - "presentation"
  - "selector"
  - "viewport"
  - "spatial-buffer"
  - "altitude"
---

# 0604K_WOS_BusPresentationSelector_v1.0.0_BUILD

## PURPOSE

Create a dedicated bus presentation selection authority.

0604J proved that live MTA buses can render on the Wall using fallback bus shapes.

0604K separates selection policy from rendering so the system can decide:

```text
which buses matter now
which buses should be kept ready
which buses should be ignored
which buses should never render at this altitude
```

without changing truth, feed ingestion, actor bridge behavior, or final bus visuals.

---

# CURRENT BUILD CONTEXT

Completed:

```text
0604G Feed Source Inventory
0604H Realtime Adapter
0604I Actor Bridge
0604J Visual Fallback Renderer
```

Current live path:

```text
MTA GTFS-RT
→ raw rows
→ vehicle.bus truth actors
→ bounded fallback bus render payloads
```

0604J currently performs selection inside the renderer.

0604K extracts and improves that selection logic.

---

# CORE DECISION

The selector becomes the authority for bus presentation eligibility.

The fallback renderer should ask the selector:

```text
Which bus actors should I draw right now?
```

instead of owning that decision internally.

Canonical rule:

```text
Renderer draws.
Selector chooses.
Truth runtime knows.
```

---

# AUTHORITY BOUNDARIES

## This spec owns

- bus presentation selection policy
- altitude-aware bus budgets
- viewport and padded-viewport selection
- near-future spatial readiness buffer
- route focus scoring
- camera-center priority scoring
- stale/invalid rejection accounting
- zero-render explanations
- deterministic selected actor ordering

## This spec may read

- `SBE.TruthActorRuntime`
- `SBE.MTABusActorBridge`
- `SBE.MTABusFeedConfig`
- `SBE.MapboxViewportRuntime`
- current map bounds, zoom, pitch, bearing, canvas size

## This spec may write

- selector-local state only

## This spec must not write

- TruthActorRuntime
- WorldSpaceVehicleLayer
- Mapbox sources/layers
- MTA adapter rows
- MTA actor bridge rows
- asset assignments
- Studio state
- marine/AIS state
- Citi Bike/subway state

---

# NEW FILE

```text
wall/systems/transit/busPresentationSelector.js
```

Register in:

```text
wall/index.html
```

after:

```text
wall/systems/transit/mtaBusActorBridge.js
```

and before:

```text
wall/systems/transit/busVisualFallbackRenderer.js
```

0604J should be patched to use the selector when present.

---

# PUBLIC API

Expose:

```js
SBE.BusPresentationSelector
```

Frozen API:

```js
start()
stop()
isActive()

select()
selectFromActors(actors)

getState()
getLastSelection()
getRejectSummary()

setEnabled(enabled)
setDebug(enabled)

setRouteFocus(routeIds)
clearRouteFocus()

setMaxVisible(profile, count)
setViewportPaddingPx(px)
setReadinessPaddingPx(px)
```

---

# OUTPUT CONTRACT

`select()` returns:

```js
type BusPresentationSelection = {
  ok: boolean

  profile: "low" | "city" | "regional" | "cruise"
  budget: number

  selectedActors: BusPresentationCandidate[]
  readyActors: BusPresentationCandidate[]

  counts: {
    totalBusActors: number
    scannedActors: number
    validBusActors: number
    staleRejected: number
    invalidRejected: number
    presentationRejected: number
    viewportRejected: number
    readinessOnly: number
    selected: number
    budget: number
  }

  zeroRenderReason: string | null
}
```

Candidate:

```js
type BusPresentationCandidate = {
  actor: BusTruthActor
  actorId: string
  lat: number
  lng: number
  routeId: string | null
  vehicleId: string | null
  screenX: number | null
  screenY: number | null
  distanceToViewportCenterPx: number | null
  freshnessMs: number
  score: number
  selectionReason: string
}
```

---

# ZERO-RENDER REASONS

Use explicit selector-local vocabulary:

```js
type BusZeroRenderReason =
  | "disabled"
  | "actor_runtime_unavailable"
  | "map_unavailable"
  | "no_bus_truth"
  | "no_valid_bus_coordinates"
  | "all_buses_stale"
  | "all_buses_outside_viewport"
  | "cruise_profile_individual_buses_disabled"
  | "budget_zero"
  | "unknown";
```

No vague empty states.

If zero buses render, debug must explain why.

---

# ALTITUDE POLICY

Use Mapbox zoom as the first-pass altitude proxy.

Baseline:

```js
zoom >= 15.5 → low
zoom >= 12.0 → city
zoom >= 9.0  → regional
zoom < 9.0   → cruise
```

Default budgets:

```js
low      → 120
city     → 300
regional → 500
cruise   → 0
```

Cruise remains:

```text
no individual bus actors
```

Future cruise behavior belongs to:

```text
0604O_WOS_CruiseMovementField_v1.0.0
```

---

# VIEWPORT ZONES

The selector must distinguish:

```text
visible viewport
readiness buffer
outside relevance
```

## Visible viewport

Default padding:

```js
viewportPaddingPx = 160
```

Buses inside this zone may render.

## Readiness buffer

Default padding:

```js
readinessPaddingPx = 600
```

Buses inside readiness buffer but outside visible viewport should be returned in:

```js
readyActors
```

but not selected for rendering.

Purpose:

```text
avoid sudden visual starvation during camera movement
prepare near-future candidates
make camera routes feel smoother
```

The selector does not render ready actors.

---

# ROUTE FOCUS

Support optional route focus:

```js
setRouteFocus(["M15", "B41"])
clearRouteFocus()
```

When route focus is active:

```text
focused routes receive score boost
non-focused routes are still eligible unless strict mode is added later
```

Default:

```text
soft focus only
```

No strict exclusion in 0604K.

Reason:

```text
avoid empty viewport if the focused route is temporarily absent
```

---

# SCORING POLICY

Base score:

```text
higher score = more likely to render
```

Required factors:

```text
viewport center proximity
freshness
route focus
movement status
route known
deterministic actor id fallback
```

Baseline weights:

```js
centerWeight = 0.50
freshnessWeight = 0.20
routeFocusWeight = 0.15
movementWeight = 0.10
routeKnownWeight = 0.05
```

Implementation may normalize to 0..1.

Hard requirement:

```text
selection must be deterministic for identical input
```

Tie-break:

```text
actorId ascending
```

---

# MOVEMENT STATUS

Treat moving buses as slightly higher priority than unknown/stopped buses.

Moving:

```js
speedMps > 0.5
```

Unknown speed:

```text
eligible but no movement boost
```

Do not reject stopped buses.

---

# STALE POLICY

Stale threshold:

```js
SBE.MTABusFeedConfig.MTA_BUS_STALE_AFTER_MS || 45000
```

Stale buses are not selected.

Stale buses are not readiness candidates.

---

# MAX SCAN

Default:

```js
maxScanActors = 6000
```

If truth actor count exceeds scan cap:

```text
scan deterministically
report truncated:true
```

Do not silently hide this.

---

# 0604J INTEGRATION PATCH

Patch `SBE.BusVisualFallbackRenderer.renderOnce()`:

If selector exists:

```js
const selection = SBE.BusPresentationSelector.select();
```

Then use:

```js
selection.selectedActors
```

instead of internal candidate selection.

Fallback behavior:

```text
If selector unavailable, 0604J internal selection may remain as compatibility fallback.
```

Renderer remains responsible for:

```text
WSL payload construction
upsertVehicle()
clear()
rendered id tracking
```

Selector remains responsible for:

```text
selection decision
counts
zero-render explanation
```

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.worldActors
```

Required:

```js
busSelectorStart()
busSelectorStop()
busSelectorState()
busSelectorSelect()
busSelectorLast()
busSelectorRejects()
busSelectorRouteFocus(routeIds)
busSelectorClearRouteFocus()
busSelectorViewportPadding(px)
busSelectorReadinessPadding(px)
```

Route focus examples:

```js
_wos.debug.worldActors.busSelectorRouteFocus("M15")
_wos.debug.worldActors.busSelectorRouteFocus(["M15", "B41"])
```

---

# MANUAL PROOF FLOW

```text
1. _wos.debug.worldActors.mtaBusSetApiKey("<key>")
2. _wos.debug.worldActors.busLiveProof()
3. _wos.debug.worldActors.busSelectorState()
4. _wos.debug.worldActors.busSelectorSelect()
5. _wos.debug.worldActors.busFallbackSelection()
```

Expected:

```text
selector reports selected actors
renderer uses selected actors
visible buses remain bounded
zero-render cases become explainable
```

---

# PERFORMANCE RULES

0604K must remain lightweight.

Requirements:

```text
no WSL writes
no Mapbox source/layer creation
no DOM creation
no continuous RAF
no route label rendering
no geometry-heavy path matching
no full GTFS static route processing
```

Selector may run:

```text
on renderOnce()
on debug select()
on conservative bus fallback interval
```

It must not run every animation frame.

---

# STATE MODEL

```js
type BusPresentationSelectorState = {
  version: "1.0.0"
  active: boolean
  enabled: boolean
  debug: boolean

  lastSelectAt: number | null
  selectCount: number
  lastError: string | null

  profile: "low" | "city" | "regional" | "cruise"
  budget: number

  viewportPaddingPx: number
  readinessPaddingPx: number
  maxScanActors: number
  truncated: boolean

  routeFocusActive: boolean
  routeFocus: string[]

  totalBusActors: number
  selectedCount: number
  readyCount: number
  zeroRenderReason: string | null

  mapAvailable: boolean
  actorRuntimeAvailable: boolean
}
```

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.BusPresentationSelector exists
no API key required
no actors required
no crash
```

## T2 — No actors explains empty state

Expected:

```text
select().ok === true
selectedActors.length === 0
zeroRenderReason === "no_bus_truth"
```

## T3 — Valid in-viewport bus selected

Expected:

```text
selectedActors.length === 1
selectionReason includes viewport/candidate status
```

## T4 — Stale buses rejected

Expected:

```text
staleRejected increments
selectedActors excludes stale actor
```

## T5 — Out-of-viewport buses rejected from selected

Expected:

```text
viewportRejected increments
selectedActors excludes actor
```

## T6 — Readiness buffer works

Given bus outside viewport but inside readiness padding:

Expected:

```text
readyActors includes actor
selectedActors excludes actor
readinessOnly increments
```

## T7 — Budget enforced

Given candidates exceed profile budget:

Expected:

```text
selectedActors.length <= budget
```

## T8 — Cruise disables individual buses

At zoom < 9:

Expected:

```text
profile === "cruise"
budget === 0
selectedActors.length === 0
zeroRenderReason === "cruise_profile_individual_buses_disabled"
```

## T9 — Route focus boosts selected order

Given equal buses with route focus active:

Expected:

```text
focused route ranks above non-focused route
```

## T10 — Deterministic ordering

Same input twice:

Expected:

```text
same selected actor ids in same order
```

## T11 — Renderer uses selector when present

Expected:

```text
0604J renderOnce() consumes BusPresentationSelector.select()
rendered bus ids match selected actors
```

## T12 — No renderer/truth mutation

Expected:

```text
selector alone does not call WSL
selector alone does not mutate TruthActorRuntime
selector creates no Mapbox source/layer
```

---

# NON-GOALS

This spec does not create:

- final bus shapes
- bus asset pack
- route labels
- route color badges
- SBS/express visual variants
- motion smoothing
- route-following interpolation
- static GTFS route matching
- cruise movement field
- Citi Bike rendering
- subway rendering
- synthetic trucks
- hero locations
- marble physics

---

# DEFERRED SYSTEMS

## 0604L — Bus Route Label Pass

Route labels/badges for low and city altitude.

## 0604M — Bus Asset Pack

Final authored bus visual forms.

## 0604N — Bus Motion Smoothing

Interpolation/dead-reckoning between GTFS-RT updates.

## 0604O — Cruise Movement Field

Aggregate city movement lights for far altitude.

---

# NEXT SPEC

```text
0604L_WOS_BusRouteLabelPass_v1.0.0_BUILD
```

Only after selector integration proves stable.

If 0604K reveals weak bus visual forms, insert:

```text
0604M_WOS_BusAssetPack_v1.0.0_BUILD
```

before labels.

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/transit/busPresentationSelector.js`; register it in `wall/index.html` before `busVisualFallbackRenderer.js`; patch `wall/systems/transit/busVisualFallbackRenderer.js` to consume `SBE.BusPresentationSelector.select()` when available; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/transit/busPresentationSelector.js`, `node --check wall/systems/transit/busVisualFallbackRenderer.js`, and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: `busSelectorSelect()` returns selected/ready bus candidates with zero-render explanations; `busFallbackRenderOnce()` renders the selected subset only; truth, Mapbox, assets, Studio, and maritime systems remain unchanged.
