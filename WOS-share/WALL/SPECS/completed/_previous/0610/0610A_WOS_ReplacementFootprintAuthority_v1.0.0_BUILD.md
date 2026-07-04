# 0610A_WOS_ReplacementFootprintAuthority_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Upgrade Building Replacement Runtime from **centroid marker objects** into **footprint-authoritative replacement geometry**.

0609V proved:

```txt
replacement metadata → visible runtime actor
```

0609W proved:

```txt
replacement actor → multi-part archetype geometry
```

However the current replacement geometry is still too small because it uses fixed metre dimensions around the building centroid.

Current failure:

```txt
large building footprint → tiny replacement object at center
```

Target behavior:

```txt
large building footprint → replacement owns the full building footprint
```

This build makes the selected Mapbox building footprint the dimensional authority for replacement geometry.

---

## Core Principle

A replacement is not decoration.

A replacement replaces the building volume.

The replacement must inherit the selected building’s footprint, orientation, and approximate footprint scale.

---

## Scope

### In Scope

- Extract footprint polygon from selected Mapbox building feature.
- Store footprint geometry on replacement actor.
- Compute footprint metrics:
  - centroid
  - bounding box
  - width
  - depth
  - approximate heading
  - footprint area
- Generate replacement geometry using footprint-aware dimensions.
- Ensure each archetype visually fills or meaningfully occupies the source footprint.
- Preserve existing replacement manifest schema.
- Preserve existing Studio UI.
- Preserve existing Wall projection behavior.
- Preserve existing debug API, extending only if useful.

### Out of Scope

- No new Studio UI.
- No Canvas work.
- No Glyph work.
- No imported models.
- No GLTF.
- No texture system.
- No final art pass.
- No Mapbox source mutation.
- No building deletion from composite source.

---

## Files

### Modify

```txt
wall/systems/runtime/buildingReplacementRuntime.js
```

### Do Not Modify Unless Absolutely Required

```txt
studio/mapLab/*
wall/systems/presentation/buildingEditProjectionRuntime.js
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

---

## Required Data Additions

Actor records should add:

```js
{
  footprint: {
    coordinates,
    centroid,
    bounds,
    widthM,
    depthM,
    areaM2,
    heading
  }
}
```

Existing actor fields remain:

```js
{
  id,
  buildingKey,
  archetype,
  lng,
  lat,
  height,
  inheritedHeight,
  scale,
  heightMode,
  geometryKind
}
```

---

## Footprint Extraction

Use the actual Mapbox building feature geometry.

Source:

```js
map.querySourceFeatures(source, {
  sourceLayer,
  filter: ["==", ["id"], featureId]
})
```

Supported geometry:

```txt
Polygon
MultiPolygon
```

If MultiPolygon:

```txt
use largest polygon by area
```

If geometry cannot be resolved:

```txt
fallback to existing centroid fixed-size behavior
```

Do not crash.

---

## Footprint Metrics

Add helpers:

```js
_extractFootprint(feature)
_polygonAreaM2(ring, lat)
_boundsForRing(ring)
_dimensionsFromBounds(bounds, lat)
_headingFromLongestEdge(ring, lat)
_centroidForRing(ring)
```

Approximation is acceptable.

Do not introduce heavy geometry libraries.

---

## Geometry Generation Strategy

Current archetype generators receive:

```js
(lng, lat, W, D, H, color, actorId)
```

Replace with footprint-aware input:

```js
(actor)
```

or:

```js
(lng, lat, footprint, W, D, H, color, actorId)
```

where:

```txt
W = footprint width half-size
D = footprint depth half-size
```

---

## Footprint-Aware Sizing Rules

### Minimum Occupancy

Replacement body must occupy at least:

```txt
70% of source footprint width
70% of source footprint depth
```

unless archetype intentionally uses narrow vertical structure.

### Archetype Rules

#### Warehouse

```txt
width = 95% footprint width
depth = 85% footprint depth
height = lower, broad mass
```

#### Skyscraper

```txt
base podium = 70% footprint width/depth
tower = 35–50% footprint width/depth
```

#### Apartment

```txt
body = 80% footprint width/depth
water tower offset on roof
```

#### Radio Tower

```txt
base pad = 45% footprint width/depth
tower shaft = narrow center
beacon = visible top cap
```

#### Pagoda

```txt
lowest tier = 80% footprint width/depth
upper tiers step inward
eaves extend outward slightly
```

#### Civic Block

```txt
foundation = 90% footprint width/depth
dome centered
```

#### Industrial Stack

```txt
factory = 85% footprint width/depth
stack offset but inside footprint
```

#### Custom Placeholder

```txt
body = 75% footprint width/depth
```

---

## Orientation

Preferred:

```txt
align replacement rectangle with longest footprint edge
```

Fallback:

```txt
axis-aligned north/south rectangle
```

If rotation is too risky in Mapbox polygon generation, preserve heading in debug but keep geometry axis-aligned.

---

## Polygon Generation

Upgrade:

```js
_rectPolygon(lng, lat, hw, hd, offXM, offYM, heading)
```

If heading is provided:

```txt
rotate local x/y offsets before lng/lat conversion
```

If rotation causes instability, keep heading calculated but unused.

---

## Layer Behavior

Continue using:

```txt
GeoJSON source: wos-replacement-markers
Layer: wos-replacement-layer
Type: fill-extrusion
```

Continue using per-feature:

```txt
color
base
height
```

No additional layers required.

---

## Debug API

Extend:

```js
_wos.debug.buildingReplacement.list()
```

Each actor should include:

```js
{
  footprintArea,
  footprintWidthM,
  footprintDepthM,
  heading,
  footprintResolved
}
```

Extend:

```js
_wos.debug.buildingReplacement.status()
```

Add:

```js
{
  footprintResolvedCount,
  fallbackCount
}
```

---

## Error Handling

Required try/catch around:

```txt
querySourceFeatures
footprint extraction
area calculation
geometry generation
setData
style reload
```

Any single bad building must not break all replacements.

---

## Acceptance Tests

### T1 — Large Building Uses Large Footprint

Assign replacement to a large warehouse/pier building.

Expected:

```txt
replacement occupies most of the selected building footprint
```

### T2 — Small Building Remains Small

Assign replacement to a small building.

Expected:

```txt
replacement scales down with footprint
```

### T3 — Warehouse Reads as Warehouse

Expected:

```txt
broad low building occupying footprint
```

### T4 — Skyscraper Reads as Tower + Podium

Expected:

```txt
tower core positioned on source footprint
```

### T5 — Industrial Stack Reads as Facility

Expected:

```txt
factory body fills footprint; stack is visibly attached
```

### T6 — Pagoda Reads as Tiered Landmark

Expected:

```txt
lowest tier uses footprint scale; upper tiers step inward
```

### T7 — Runtime Fallback Safe

If footprint cannot resolve:

Expected:

```txt
old fixed-size behavior still renders actor
no crash
```

### T8 — Manifest Schema Unchanged

Expected:

```txt
no new required manifest fields
old manifests still work
```

### T9 — Cross-Tab Sync Unchanged

Changing replacement in Studio updates Wall.

### T10 — Style Reload Recovery Unchanged

Replacement geometry reappears after style reload.

### T11 — Mapbox Source Untouched

Expected:

```txt
composite source unchanged
replacement source remains separate
```

### T12 — No Studio UI Changes

Expected:

```txt
no Studio files modified
```

### T13 — No Canvas/Glyph Changes

Expected:

```txt
no Canvas/Glyph files modified
```

---

## Required Report

Claude/Codex must report:

```txt
files changed
footprint extraction method
metric helpers added
geometry generator changes
fallback behavior
debug API output
before/after sizing behavior
acceptance test results
```

---

## Success Criteria

Replacement actors stop reading as small markers and begin reading as footprint-scale architecture.

The user should see:

```txt
selected building footprint → transformed into replacement building
```

rather than:

```txt
selected building → tiny colored object placed on top
```

---

## Implementation Guide

- **Where:** Modify `wall/systems/runtime/buildingReplacementRuntime.js` only unless absolutely required.
- **What:** Add footprint extraction from Mapbox building features, compute footprint metrics, and feed footprint-aware dimensions into the existing archetype shape generators.
- **Expect:** Replacement geometry scales to the selected building footprint, preserving existing manifest persistence, Wall projection, and Studio authoring workflow.
