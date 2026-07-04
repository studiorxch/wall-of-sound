---
bridges:
  - Workspace documents
  - live map systems
  - editable route infrastructure
  - route persistence
  - future passenger simulation
establishes: behavioral document ownership
goal: "Introduce the first fully stateful document runtime:"
Success Condition:
  - create route documents
  - create/edit routes
  - move waypoints
  - compute metrics
  - serialize routes
  - attach runtime to documents
  - switch tabs safely
  - maintain independent route states
  - expose camera targets
built:
  - wall/runtimes/routePlannerRuntime.js
changes:
  - wall/engine/workspace.js
  - wall/render/workspaceUI.js
  - wall/index.html
Issues: UI drift
Next: 0518D_WOS_RuntimeViewportRouting_v1.0.0

---
![[Pasted image 20260517183347.png]]

| Layer                          | Status |
| ------------------------------ | ------ |
| Workspace OS                   | ✓      |
| Document System                | ✓      |
| Runtime Ownership              | ✓      |
| Viewport Delegation            | ✓      |
| Presentation vs Operator split | ✓      |
| Runtime Event Infrastructure   | ✓      |
| Route Runtime                  | ✓      |
| Runtime-specific rendering     | ✓      |
renderOperatorOverlay()
renderPresentationLayer()


---
# 0518C_WOS_RoutePlannerRuntime_v1.0.0

## Goal

Introduce the first fully stateful document runtime:

```
RoutePlannerRuntime
```

A runtime responsible for:

- route geometry
- waypoint editing
- route metrics
- camera targets
- route serialization
- operator interactions

This runtime becomes the canonical infrastructure layer for:

- passenger simulation
- camera movement
- actor traffic
- future GPS ingestion
- cinematic sequencing
- world traversal

---

# Core Principle

A route is NOT:

```
a rendered line
```

A route IS:

```
an editable world-space infrastructure object
```

Rendering is secondary.

The runtime owns:

- state
- geometry
- metrics
- behaviors

---

# Runtime Ownership

## New File

```
wall/runtimes/routePlannerRuntime.js
```

Registers itself through:

```
SBE.RuntimeRegistry.register(...)
```

NOT directly through Workspace.

Workspace only ATTACHES runtimes.

---

# Runtime Shape

```
{  id,  type: "routePlanner",  activeDocumentId,  routes: [],  activeRouteId,  createRoute(),  deleteRoute(),  duplicateRoute(),  addWaypoint(),  moveWaypoint(),  removeWaypoint(),  computeMetrics(),  serialize(),  deserialize(),  renderOperatorOverlay(),}
```

---

# Route Object Shape

```
{  id,  name,  waypoints: [],  metrics: {    distanceKm,    estimatedMinutes,    waypointCount,  },  style: {    color,    width,    opacity,  },  camera: {    followEnabled,    smoothing,    zoom,  },  meta: {    createdAt,    modifiedAt,  }}
```

---

# Waypoint Shape

```
{  id,  x,  y,  type: "stop", // stop | checkpoint | origin | destination  label: "",}
```

Keep coordinates INTERNAL for now.

DO NOT introduce:

- lat/lng
- map projections
- geojson
- GIS transforms

yet.

Those come later.

---

# Operator Overlay

## Purpose

The operator overlay is:

```
editing infrastructure
```

NOT cinematic presentation.

---

# Overlay Responsibilities

Visible ONLY in:

```
Operator View
```

Includes:

- waypoint handles
- route lines
- labels
- route direction arrows
- distance previews
- selection state

---

# Presentation Layer Restriction

Presentation view:

- MUST NOT show handles
- MUST NOT show labels
- MUST NOT show debug overlays

Only:

```
final cinematic interpretation
```

---

# Route Planner Sidebar

## New Sidebar Context

Add:

```
routes
```

to Workspace sidebar contexts.

Current:

```
worldlayerssequencesassetssettingshelp
```

New:

```
routes
```

Preferably near top.

---

# Route Sidebar Responsibilities

Displays:

- active route
- saved routes
- waypoint count
- total distance
- ETA
- route visibility
- route color

Actions:

- New Route
- Duplicate
- Reverse
- Delete
- Focus Camera

---

# Metrics System

## Initial Metrics

Keep SIMPLE.

NO GIS.

Use:

```
euclidean distance accumulation
```

between waypoints.

---

# Metric Fields

```
distanceKmestimatedMinutesavgSegmentLengthwaypointCount
```

Use fake travel speed:

```
40 km/h default
```

for now.

---

# Camera Integration

## Required

The runtime MUST expose:

```
getCameraTargets()
```

Returns:

```
[  {    x,    y,    importance,    type,  }]
```

This becomes the future bridge for:

- curiosity camera
- passenger mode
- cinematic cuts
- emergent focus systems

Critical architecture point.

---

# Rendering Separation

## MUST Split

Two renderer layers:

### Operator Renderer

```
renderOperatorOverlay()
```

### Presentation Renderer

```
renderPresentationLayer()
```

Even if presentation initially renders nothing.

This separation MUST begin now.

---

# Serialization

Route documents serialize:

```
{  version: "0518C.1",  routes: [],  activeRouteId,}
```

Stored INSIDE:

```
document.meta.runtimeState
```

NOT globally.

Critical.

Documents own runtime state.

---

# Event Bus Integration

Emit:

```
route:createdroute:deletedroute:selectedroute:modifiedroute:waypointAddedroute:waypointMovedroute:metricsUpdated
```

Payloads MUST include:

```
documentIdrouteIdtimestamp
```

---

# Input Scope

Route editing ONLY active when:

```
active document.type === "route"
```

Do NOT leak route editing into:

- canvas docs
- soundscape docs
- world docs

This matters enormously later.

---

# Explicit Non-Goals

DO NOT:

- integrate Mapbox yet
- ingest real GPS yet
- add traffic APIs
- add road snapping
- add pathfinding
- add geojson
- add routing engines

This spec is:

```
runtime architecture only
```

---

# Success Condition

By end of 0518C:

You can:

- create route documents
- create/edit routes
- move waypoints
- compute metrics
- serialize routes
- attach runtime to documents
- switch tabs safely
- maintain independent route states
- expose camera targets

without:

- touching simulation code
- touching render pipelines
- touching main.js architecture

---

# Implementation Guide

- Create `routePlannerRuntime.js` and register through `RuntimeRegistry`
- Store runtime state inside `document.meta.runtimeState`
- Render operator overlays separately from presentation rendering layers

next: [[0518D_WOS_RuntimeViewportRouting_v1.0.0]]