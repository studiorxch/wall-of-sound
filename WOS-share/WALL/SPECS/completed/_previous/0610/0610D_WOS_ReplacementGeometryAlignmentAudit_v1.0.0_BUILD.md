# 0610D_WOS_ReplacementGeometryAlignmentAudit_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Audit and correct geometry alignment between Studio Map Lab building selection and Wall Building Replacement Runtime.

Current visible issue:

```txt
Studio selected building footprint
≠
Wall replacement footprint position/orientation
```

The replacement actor is now solid and footprint-aware, but it can appear offset, rotated incorrectly, or placed against a neighboring footprint. This makes the replacement system read as unstable even when persistence and rendering are functioning.

This build establishes a single geometry authority for replacement placement.

---

## Core Principle

The geometry used to author a replacement in Studio must be the same geometry used to render the replacement in Wall.

Studio selects the building.

Wall should not guess a different building geometry unless Studio geometry is unavailable.

---

## Current Problem

`buildingReplacementRuntime.js` currently resolves replacement geometry on Wall using:

```js
map.querySourceFeatures(source, {
  sourceLayer,
  filter: ["==", ["id"], featureId]
})
```

This can produce mismatch because:

```txt
Mapbox may return multiple tile copies
Wall camera/tile state may differ from Studio
feature geometry may be clipped by tile boundaries
centroid may differ between tile copies
longest-edge heading may differ
replacement rectangle rotation may exaggerate mismatch
```

Result:

```txt
replacement actor looks close but not anchored to the selected building
```

---

## Objective

Add a diagnostic-first alignment pass that:

```txt
captures Studio-selected geometry
persists normalized geometry metadata
uses manifest geometry in Wall when available
falls back to Wall query only when needed
adds debug visibility for source footprint vs replacement footprint
```

---

## Scope

### In Scope

- Audit Studio selected-feature geometry.
- Persist exact selected feature geometry metadata in the Map Lab building manifest.
- Normalize footprint data into a compact manifest-safe format.
- Update Wall replacement runtime to prefer manifest geometry.
- Add alignment diagnostics.
- Add optional debug footprint overlay.
- Preserve all existing replacement, material, suppression, and persistence behavior.

### Out of Scope

- No new archetypes.
- No material changes.
- No color palette changes.
- No Canvas work.
- No Glyph work.
- No GLTF.
- No model imports.
- No Mapbox source mutation.
- No Studio layout redesign.

---

## Files

### Primary Modify

```txt
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapSelection.js
studio/mapLab/mapLabView.js
wall/systems/runtime/buildingReplacementRuntime.js
```

### Optional Modify

```txt
studio/mapLab/mapInspector.js
```

Only if adding a small diagnostic readout is low-risk.

### Do Not Modify

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

unless absolutely required.

---

## Manifest Geometry Additions

Add optional field to each building edit:

```json
{
  "geometry": {
    "source": "studio-maplab",
    "geometryType": "Polygon",
    "coordinates": [
      [-74.014, 40.701],
      [-74.013, 40.701],
      [-74.013, 40.702],
      [-74.014, 40.702],
      [-74.014, 40.701]
    ],
    "centroid": {
      "lng": -74.0135,
      "lat": 40.7015
    },
    "bounds": {
      "minLng": -74.014,
      "maxLng": -74.013,
      "minLat": 40.701,
      "maxLat": 40.702
    },
    "widthM": 60,
    "depthM": 28,
    "areaM2": 1680,
    "heading": 72,
    "featureId": "278053488",
    "sourceLayer": "building",
    "capturedAt": 1710000000000
  }
}
```

This field is additive and backward-compatible.

Existing manifests remain valid.

---

## Geometry Capture Rules

When a building is selected in Studio Map Lab:

```txt
selection feature
→ normalize geometry
→ compute metrics
→ persist geometry under building edit
```

Persist geometry immediately on selection, not only after replacement is enabled.

Reason:

```txt
the selected feature is the most trustworthy geometry moment
```

---

## Geometry Normalization

Supported geometry:

```txt
Polygon
MultiPolygon
```

Rules:

### Polygon

Use outer ring:

```txt
geometry.coordinates[0]
```

### MultiPolygon

Use largest polygon by area.

### Invalid Geometry

Skip geometry persistence.

Do not crash.

---

## Shared Geometry Helpers

Implement equivalent or shared helper logic for:

```js
centroidForRing(ring)
boundsForRing(ring)
dimensionsFromBounds(bounds, lat)
polygonAreaM2(ring, lat)
headingFromLongestEdge(ring, lat)
normalizeFeatureGeometry(feature)
```

Keep helpers small and local if sharing would be risky.

Do not introduce a heavy geometry dependency.

---

## Wall Runtime Resolution Priority

Modify `buildingReplacementRuntime.js`.

Current:

```txt
querySourceFeatures every time
```

New priority:

```txt
1. Use edit.geometry from manifest if valid.
2. Else querySourceFeatures fallback.
3. Else fixed-size fallback.
```

Pseudo:

```js
var manifestGeometry = _geometryFromEdit(edit);
if (manifestGeometry) {
  actor.lng = manifestGeometry.centroid.lng;
  actor.lat = manifestGeometry.centroid.lat;
  actor.footprint = manifestGeometry;
  actor.geometryAuthority = "manifest";
} else {
  actor.geometryAuthority = "wall-query";
}
```

---

## Geometry Authority Field

Actor records must include:

```js
geometryAuthority
```

Values:

```txt
manifest
wall-query
fallback
```

Debug must expose this.

---

## Alignment Diagnostics

Add to:

```js
_wos.debug.buildingReplacement.list()
```

Each actor should include:

```js
{
  geometryAuthority: "manifest",
  manifestFeatureId: "278053488",
  wallFeatureId: "278053488",
  centroidDeltaM: 0,
  headingDelta: 0,
  footprintResolved: true
}
```

If both manifest geometry and Wall query geometry exist, compute:

```txt
centroidDeltaM
headingDelta
areaRatio
```

This is for debugging only.

---

## Debug Footprint Overlay

Add optional debug method:

```js
_wos.debug.buildingReplacement.showFootprints(true)
_wos.debug.buildingReplacement.showFootprints(false)
```

When enabled, render two lightweight GeoJSON line/fill overlays:

```txt
manifest footprint outline
replacement generated footprint outline
```

Suggested colors:

```txt
manifest footprint = cyan
replacement footprint = yellow
```

This overlay must be off by default.

Do not add visible UI buttons.

---

## Replacement Geometry Behavior

When manifest geometry is valid:

```txt
actor.footprint = manifest geometry
actor.lng/lat = manifest centroid
actor.heading = manifest heading
```

Archetype generators should continue using:

```txt
actor.footprint.widthM
actor.footprint.depthM
actor.footprint.heading
```

---

## Studio Inspector Optional Readout

If low-risk, add diagnostic readout in Map Lab inspector:

```txt
Geometry Authority: Studio Captured
Footprint Area: 1680m²
Heading: 72°
```

This is optional and should not block the build.

---

## Storage Safety

Geometry data can grow.

Keep persisted geometry compact:

```txt
outer ring only
no holes
no full feature.properties clone
no layer object clone
```

---

## Backward Compatibility

Manifests without `geometry` must continue to work through Wall query fallback.

Manifests with old color/replacement fields must remain valid.

No migration prompt required.

---

## Error Handling

Required `try/catch` around:

```txt
geometry normalization
localStorage write
querySourceFeatures
metric computation
debug overlay source/layer creation
GeoJSON setData
```

Bad geometry for one building must not break all replacements.

---

## Acceptance Tests

### T1 — Geometry Captured on Selection

Select a building in Studio Map Lab.

Expected:

```txt
localStorage["wos.maplab.buildings"] contains geometry for selected building
```

---

### T2 — Wall Uses Manifest Geometry

Enable replacement.

Reload Wall.

Expected:

```txt
_wos.debug.buildingReplacement.list()[key].geometryAuthority === "manifest"
```

---

### T3 — Alignment Improves

Expected:

```txt
replacement actor aligns with selected source footprint
```

---

### T4 — Wall Query Fallback Still Works

Remove geometry field from manifest.

Reload Wall.

Expected:

```txt
replacement still renders using wall-query fallback
```

---

### T5 — Fixed Fallback Still Works

If querySourceFeatures cannot resolve feature.

Expected:

```txt
replacement still renders with fallback dimensions
no crash
```

---

### T6 — Debug Overlay Works

Run:

```js
_wos.debug.buildingReplacement.showFootprints(true)
```

Expected:

```txt
footprint overlays appear
```

Run:

```js
_wos.debug.buildingReplacement.showFootprints(false)
```

Expected:

```txt
footprint overlays removed or hidden
```

---

### T7 — Existing Persistence Still Works

Color, hidden, notes, tags, and replacement metadata still persist.

---

### T8 — Existing Material Authority Still Works

Replacement actor still uses material roles and solid opacity.

---

### T9 — Existing Suppression Still Works

Original building suppression remains active.

---

### T10 — No Canvas/Glyph Changes

Expected:

```txt
no Canvas/Glyph files modified
```

---

## Required Report

Claude/Codex must report:

```txt
files changed
geometry fields added
where geometry is captured
Wall geometry resolution priority
geometryAuthority values observed
alignment diagnostic output
debug overlay status
fallback behavior
acceptance test results
```

---

## Success Criteria

Replacement actors align to the same building footprint that the user selected in Studio.

The user should see:

```txt
Studio-selected building
→ exact same footprint
→ Wall replacement actor
```

not:

```txt
Studio-selected building
→ nearby or rotated replacement approximation
```

---

## Implementation Guide

- **Where:** Capture normalized selected geometry in `studio/mapLab/mapSelection.js` / `mapLabView.js`; persist it through `buildingEditRegistry.js`; prefer it inside `wall/systems/runtime/buildingReplacementRuntime.js`.
- **What:** Select a building, enable a replacement, reload Wall, and inspect `_wos.debug.buildingReplacement.list()` for `geometryAuthority: "manifest"`.
- **Expect:** Replacement actor aligns with the Studio-selected footprint; fallback paths remain intact for old manifests.
