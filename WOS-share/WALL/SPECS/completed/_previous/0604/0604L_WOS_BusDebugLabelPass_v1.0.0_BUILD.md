# 0604L_WOS_BusDebugLabelPass_v1.0.0_BUILD

## Purpose

Provide a debug-only label system for live MTA buses.

This system exists to improve observability, diagnostics, camera targeting, and future bus-follow workflows.

This is **not** a public-facing route label system.

This is **not** a transit information UI.

This is a development and inspection tool.

---

## Current Build Context

Completed:

```text
0604G Feed Source Inventory
0604H Realtime Adapter
0604I Actor Bridge
0604J Bus Visual Fallback Renderer
0604K Bus Presentation Selector
```

Current live path:

```text
MTA GTFS-RT
→ Raw Rows
→ vehicle.bus Truth Actors
→ Presentation Selection
→ Visible Bus Blocks
```

Missing:

```text
Which bus is which?
```

0604L solves:

```text
visible bus
→ optional debug label
```

---

## Core Doctrine

Labels are:

```text
Debug Infrastructure
```

Not:

```text
Presentation Infrastructure
```

Labels must never be required to understand the world.

The world must remain readable with labels disabled.

---

## New File

```text
wall/systems/transit/busDebugLabelPass.js
```

Register after:

```text
busPresentationSelector.js
busVisualFallbackRenderer.js
```

---

## Public API

Expose:

```js
SBE.BusDebugLabelPass
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

setMode(mode)

setMaxLabels(count)

getState()
getVisibleLabels()
```

---

## Label Modes

Supported modes:

```js
"off"
"route"
"vehicle"
"route_vehicle"
"technical"
```

### route

Example:

```text
M15
B41
Q58
```

### vehicle

Example:

```text
7564
8210
```

### route_vehicle

Example:

```text
M15 • 7564
B41 • 8210
```

### technical

Example:

```text
M15
7564
12.4 m/s
age: 4s
```

---

## Altitude Rules

Labels only appear at:

```text
low altitude
city altitude
```

Never:

```text
regional
cruise
```

Reason:

```text
visual clutter
```

---

## Budget Rules

Maximum labels:

```js
const LOW_LABEL_BUDGET = 40;
const CITY_LABEL_BUDGET = 20;
const REGIONAL_LABEL_BUDGET = 0;
const CRUISE_LABEL_BUDGET = 0;
```

Labels follow selector ordering.

Labels never exceed visible bus count.

---

## Selection Source

Labels may only attach to:

```text
selectedActors
```

from:

```js
SBE.BusPresentationSelector.select()
```

Labels must never run their own actor scan.

---

## Follow Bus Helpers

Add debug helpers:

```js
followBusRoute(routeId)
followBusVehicle(vehicleId)
clearBusFollow()
```

Examples:

```js
_wos.debug.worldActors.followBusRoute("M15")
_wos.debug.worldActors.followBusVehicle("7564")
```

Initial behavior:

```text
highlight label
report coordinates
report route
```

Camera control is deferred.

---

## Future Uses

0604L intentionally unlocks:

```text
Hero Buses
Graffiti Buses
Sponsored Buses
Campaign Buses
Event Buses
```

Because buses become individually addressable.

Example:

```text
Vehicle 7564
→ StudioRich Livery
→ Graffiti Wrap
→ Event Promotion
```

while preserving:

```text
real route
real movement
real telemetry
```

---

## Rendering

Implementation may use:

```text
Canvas overlay
or
Mapbox marker layer
or
existing HUD text system
```

Requirements:

```text
no Mapbox source creation
no Mapbox layer creation
no DOM element per bus
```

Single-pass overlay preferred.

---

## State Model

```js
{
  active: boolean,
  enabled: boolean,
  mode: string,

  visibleLabels: number,
  labelBudget: number,

  profile: string,

  followedRoute: string|null,
  followedVehicle: string|null,

  lastRenderAt: number|null,
  renderCount: number,

  lastError: string|null
}
```

---

## Acceptance Tests

### T1

Loads safely.

```text
exists
no crash
```

### T2

Mode off.

```text
0 labels rendered
```

### T3

Route mode.

```text
M15 visible
```

### T4

Vehicle mode.

```text
7564 visible
```

### T5

Route+vehicle mode.

```text
M15 • 7564
```

### T6

Technical mode.

```text
speed
age
route
vehicle
```

### T7

Budget enforced.

```text
labels <= budget
```

### T8

Regional altitude.

```text
0 labels
```

### T9

Cruise altitude.

```text
0 labels
```

### T10

Follow route.

```text
route highlighted
```

### T11

Follow vehicle.

```text
vehicle highlighted
```

### T12

No truth mutation.

```text
TruthActorRuntime unchanged
```

### T13

No selector mutation.

```text
BusPresentationSelector unchanged
```

### T14

No renderer mutation.

```text
BusVisualFallbackRenderer unchanged
```

---

## Non-Goals

This spec does not create:

```text
camera follow
route badges
passenger counts
bus asset packs
motion smoothing
advertising system
graffiti system
Studio editor
public transit UI
```

---

## Deferred

```text
0604M_WOS_BusAssetPack_v1.0.0_BUILD
0604N_WOS_BusMotionSmoothing_v1.0.0_BUILD
0604O_WOS_CruiseMovementField_v1.0.0_BUILD
```

---

## Recommendation

After 0604L:

```text
0604M_WOS_BusAssetPack_v1.0.0_BUILD
```

The buses are now:

```text
Real
Visible
Selectable
Identifiable
```

The next major visual win is making them look less like generic transit blocks and more like distinct bus classes.

---

## Implementation Guide

- **Where**: Add `wall/systems/transit/busDebugLabelPass.js`; register after `busVisualFallbackRenderer.js`; add follow-bus debug commands in `worldSpaceVehicleDebug.js`.
    
- **What**: Run `node --check wall/systems/transit/busDebugLabelPass.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
    
- **Expect**: Selected buses can display route IDs and vehicle IDs on demand, labels remain altitude-limited and budgeted, and no truth/render authority is modified.