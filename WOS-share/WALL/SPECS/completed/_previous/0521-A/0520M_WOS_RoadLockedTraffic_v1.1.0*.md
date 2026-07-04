---
Generated:
System: WOS
Domain:
Component:
Version: 1.0.0
Summary:
Description:
Tags:
Status:
---
# Discovery

---
# Spec
```
#

## Purpose

Stabilize WOS traffic into a topology-constrained, geographically legal circulation system.

This revision upgrades v1.0.0 by introducing:

- arc-length traversal
- bridge elevation continuity
- heading inertia filtering
- projection recovery safeguards
- LOD hysteresis stabilization

The objective is to eliminate:

- water drift
- spline overshoot
- tangent chatter
- projection popping
- zoom flicker

while preserving:

```
continuous infrastructural motion
```

---

# Core Doctrine

## OLD

```
vehicles animate along artistic splines
```

## NEW

```
vehicles traverse legal infrastructure topology
```

Traffic is no longer:

- decorative
- atmospheric
- particle-like

Traffic is now:

```
world-space infrastructure motion
```

---

# v1.1.0 Additions

|Feature|Purpose|
|---|---|
|Arc-Length Traversal|Uniform motion across uneven segments|
|Explicit Bridge Elevation|Prevent water-level bridge collapse|
|Heading Inertia Filter|Eliminate tangent chatter|
|Snap-to-Safety Recovery|Prevent visible pop-outs|
|LOD Hysteresis|Prevent zoom flicker|

---

# 1. Arc-Length Traversal Doctrine

## Problem

Piecewise linear interpolation can still produce:

- speed stutter
- inconsistent motion
- segment snapping

when segment lengths differ.

---

# Required Traversal Model

Vehicles must NOT track:

```
segmentIndex + localT
```

Vehicles must track:

```
distanceTraveledMeters
```

---

# Canonical Vehicle State

```
{  corridorId: "fdr_northbound",  distanceTraveledMeters: 1242.8,  speedMetersPerSecond: 13.4}
```

---

# Corridor Preprocessing

Every corridor must precompute:

```
{  cumulativeDistances: [    0,    5.2,    11.8,    19.3  ]}
```

---

# Sampling Algorithm

## Required Flow

```
distanceTraveledMeters        ↓binary search cumulativeDistances        ↓find bounding segment        ↓linear interpolate between samples
```

---

# Traversal Rule

Vehicle speed must remain:

```
uniform in world-space
```

regardless of:

- node spacing
- curve density
- bridge geometry
- corridor complexity

---

# Forbidden

```
segment-relative speed scaling
```

---

# 2. Explicit Bridge Elevation Doctrine

## Problem

2D-only road interpolation allows:

- bridge collapse
- water-level snapping
- terrain contamination

---

# Required Node Structure

Bridge/tunnel nodes must include:

```
z
```

---

# Canonical Sample

```
{  x: 1420.5,  y: -840.2,  z: 35.0}
```

---

# Corridor Example

```
{  id: "williamsburg_bridge_eastbound",  isBridge: true,  waterExclusion: true,  samples: [...]}
```

---

# Elevation Rule

If:

```
isBridge === true
```

OR:

```
waterExclusion === true
```

the corridor MUST:

- bypass terrain snapping
- bypass sea-level resolution
- interpolate z-axis directly between legal nodes

---

# Forbidden

```
terrain-derived bridge elevation
```

---

# 3. Heading Inertia Doctrine

## Problem

Precision mode exposes:

- tangent chatter
- micro-oscillation
- directional jitter

especially:

- slow movement
- zoomed-in views
- short-segment transitions

---

# Required Heading Model

Heading may NOT directly snap to:

```
atan2()
```

every frame.

---

# Canonical Filter

```
headingRender = lerpAngle(  previousHeading,  targetHeading,  0.35);
```

---

# Minimum Tangent Threshold

If:

```
distance(current, projected) < 0.05
```

then:

```
reuse previous heading
```

---

# Goal

Traffic must feel:

```
mechanically stable
```

NOT:

```
numerically unstable
```

---

# 4. Snap-to-Safety Recovery Doctrine

## Problem

Instant vehicle destruction creates:

- visible popping
- continuity breaks
- simulation instability

---

# Required Recovery Flow

If a projected vehicle position enters:

- water
- illegal geometry
- invalid corridor space

the system must FIRST:

```
attempt local recovery
```

---

# Canonical Recovery

```
invalid projection        ↓search nearby legal samples        ↓snap to nearest valid node        ↓continue simulation
```

---

# Search Radius

```
SNAP_RADIUS_METERS = 5
```

---

# Destruction Rule

Vehicle removal is allowed ONLY if:

```
no legal sample exists inside recovery radius
```

---

# Goal

Prevent:

```
single-frame topology failures
```

from becoming:

```
visible simulation artifacts
```

---

# 5. LOD Hysteresis Doctrine

## Problem

Single-threshold LOD switching causes:

- rapid flicker
- representation instability
- zoom-edge oscillation

---

# Required Model

LOD transitions MUST use:

```
dual-threshold hysteresis
```

---

# Canonical Thresholds

|Transition|Zoom|
|---|---|
|Baseline → Precision|≤ 3.2|
|Precision → Baseline|≥ 3.5|

---

# Goal

Prevent:

```
rapid mode thrashing
```

during:

- camera drift
- smooth zooming
- floating-point fluctuation

---

# Precision Rendering Doctrine

## BASELINE MODE

Allowed:

- bloom
- quarter-resolution
- glow
- atmospheric softness

---

## PRECISION MODE

Required:

- native resolution
- crisp edges
- exact geometry
- subpixel alignment
- infrastructure readability

---

# Forbidden In Precision Mode

```
SCALE = 0.25 upscale rendering
```

---

# Required Precision Path

TrafficRenderer must render directly into:

```
full-resolution overlay buffer
```

---

# Corridor Geometry Doctrine

Corridors are:

```
piecewise infrastructure chains
```

NOT:

```
freeform cinematic curves
```

---

# Required Geometry

```
sample → sample → sample → sample
```

small legal spans only.

---

# Forbidden

```
large-span Catmull-Rom overshoot
```

---

# Water Exclusion Doctrine

Vehicles may NEVER:

- enter rivers
- cross bays illegally
- drift off bridge decks
- leave corridor bounds

---

# Required Validation

Every projected vehicle coordinate must pass:

```
isInsideCorridorBounds(position)
```

before rendering.

---

# Required Runtime Changes

# trafficFlowRuntime.js

Add:

- cumulative distance preprocessing
- z-axis node support
- bridge metadata
- recovery sample lookup
- legal corridor bounds

---

# trafficRenderer.js

Add:

- heading inertia filter
- native-resolution precision path
- hysteresis-aware LOD switching
- topology recovery rendering

---

# Debug Tools

# Corridor Samples

```
_wos.debugTrafficSamples()
```

Displays:

- legal nodes
- tangent vectors
- segment spacing
- elevation markers

---

# Invalid Projection Debugger

```
_wos.debugTrafficViolations()
```

Highlights:

- water intrusion
- illegal drift
- failed recovery snaps
- corridor escapes

---

# Success Criteria

Traffic must:

- remain road-locked
- preserve bridge legality
- maintain stable headings
- move at uniform speed
- avoid water completely
- remain crisp at all zoom levels
- switch LOD modes without flicker

---

# Failure Conditions

Immediate failure if:

- vehicles drift into water
- bridge traffic collapses to terrain
- heading jitter visible
- zoom flicker occurs
- interpolation overshoots corridors
- traffic visibly pops out of existence

---

# Architectural Principle

```
infrastructure motion must obey infrastructure law
```

This revision establishes the first:

```
topology-safe traffic foundation
```

for future:

- pedestrian systems
- delivery logistics
- transit coupling
- cinematic routing
- emergent urban behavior
- large-scale world simulation
```

---
# Review/ Refinement 

---
# Development

```

```