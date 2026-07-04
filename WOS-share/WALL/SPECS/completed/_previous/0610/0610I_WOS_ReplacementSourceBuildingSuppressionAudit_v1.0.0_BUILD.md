# 0610I_WOS_ReplacementSourceBuildingSuppressionAudit_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Fix the unresolved beige/original Mapbox building that remains visible underneath or beside Studio/Wall replacement actors.

0610H established single visual authority:

```txt
Author = editable cue
Preview = Wall-like output
```

but the source building can still remain visible because suppression currently targets only one saved feature ID.

Current failure:

```txt
replacement actor visible
+
original beige Mapbox building still visible
```

Target behavior:

```txt
replacement actor visible
+
all original source building geometry occupying that footprint suppressed
```

---

## Core Problem

Current suppression logic relies on the feature ID parsed from the registry key:

```js
var numId = Number(bKey.slice(second + 1));
```

Then it applies:

```js
["match", ["id"], numId, 0, defaultOpacity]
```

This is insufficient because Mapbox can render the same physical building through:

```txt
multiple tile feature copies
different rendered layers
different source-layer feature IDs
clipped tile geometry
related building:part features
3D extrusion layers plus 2D fill layers
```

A selected Studio feature may not be the only source feature visually occupying the same footprint.

---

## Goal

Suppress every rendered/source building feature that overlaps the replacement footprint, not only the single saved feature ID.

The suppression authority should become:

```txt
replacement manifest geometry
→ identify all source building features intersecting/near that geometry
→ suppress all matching source feature IDs
```

---

## Scope

### In Scope

- Audit unsuppressed source buildings around replacement footprints.
- Expand suppression ID collection using manifest geometry.
- Suppress duplicate tile feature IDs and building-part features.
- Add debug API for remaining visible source buildings.
- Apply to Studio Preview.
- Apply to Wall runtime suppression.
- Preserve existing single visual authority.
- Preserve existing replacement actors.
- Preserve existing manifest schema.

### Out of Scope

- No geometry redesign.
- No archetype changes.
- No material changes.
- No Studio UI changes.
- No Canvas work.
- No Glyph work.
- No Mapbox source mutation.
- No deletion of composite source data.

---

## Files

### Primary Modify

```txt
studio/mapLab/buildingPreviewRuntime.js
wall/systems/presentation/buildingEditProjectionRuntime.js
```

### Possibly Modify

```txt
studio/mapLab/mapboxAdapter.js
```

Only if a shared query helper is useful.

### Do Not Modify

```txt
wall/systems/runtime/buildingReplacementRuntime.js
wall/systems/runtime/buildingStyleKit.js
studio/mapLab/mapLabView.js
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapInspector.js
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

unless absolutely required.

---

## Current Suppression Sources

### Studio Preview

```txt
studio/mapLab/buildingPreviewRuntime.js
```

Current function:

```js
_suppressOriginals(map)
```

Issue:

```txt
builds suppression only from manifest key feature ID
```

### Wall Projection

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

Current function family:

```js
_collectReplacementSuppressionIds(manifest)
_apply()
```

Issue:

```txt
suppression IDs are registry-key-derived, not footprint-derived
```

---

## Required Suppression Strategy

### Phase 1 — Existing ID Suppression

Keep current behavior:

```txt
registry key feature ID → suppress
```

This remains the base path.

### Phase 2 — Footprint Query Suppression

For each replacement-enabled or hidden building edit with `geometry`:

1. Read manifest geometry ring.
2. Compute:
   - centroid
   - bounds
   - radius or query box
3. Query rendered/source features near that footprint.
4. Filter candidates to building layers only.
5. Add all candidate feature IDs to the suppression set.

### Phase 3 — Building Part Expansion

If candidates include:

```txt
building
building:part
extruded building pieces
```

include all their IDs.

Do not assume sourceLayer is only `building`.

---

## Query Methods

Use the safest available approach per runtime.

### Studio Preview

Use:

```js
map.queryRenderedFeatures(bbox, { layers })
```

where `bbox` is a screen-space box around the manifest geometry.

Steps:

```js
var projected = ring.map(coord => map.project(coord));
var bbox = boundsFromProjectedPoints(projected).pad(8);
var features = map.queryRenderedFeatures([[minX,minY], [maxX,maxY]], { layers });
```

### Wall Projection

Preferred if map camera can project:

```js
map.queryRenderedFeatures(bbox, { layers })
```

Fallback:

```js
map.querySourceFeatures(source, { sourceLayer })
```

and filter by geometry centroid/bounds proximity.

---

## Geometry Matching Rules

Candidate feature should be suppressed if any rule passes:

### Rule A — Same Feature ID

```txt
candidate.id === manifestFeatureId
```

### Rule B — Candidate Centroid Inside Manifest Bounds

```txt
candidate centroid falls inside manifest geometry bounds
```

### Rule C — Candidate Bounds Intersect Manifest Bounds

```txt
candidate bbox intersects manifest bbox
```

### Rule D — Candidate Point Near Manifest Centroid

```txt
distance(candidate centroid, manifest centroid) <= max(widthM, depthM) * 0.75
```

Use simple approximations.

No heavy geometry library.

---

## Building Layer Discovery

Suppression audit must inspect:

```txt
fill-extrusion building layers
fill building layers
layers with source-layer containing "building"
layers with id containing "building"
```

Must exclude:

```txt
wos-replacement-layer
wos-preview-layer
wos-* replacement/debug layers
maplab-building-outline if it only draws outlines
```

---

## Suppression Set Format

Build a per-source-layer suppression set:

```js
{
  building: [278053568, 278053569, 12345],
  "building:part": [9981, 9982]
}
```

or, if sourceLayer is unreliable, maintain per-layer suppression:

```js
{
  layerId: {
    ids: [278053568, 278053569],
    sourceLayer: "building",
    source: "composite"
  }
}
```

Choose the implementation that fits existing projection runtime with least risk.

---

## Preview Runtime Behavior

In Preview mode:

```txt
author cue is cleared
preview actor is visible
all source building features overlapping replacement geometry are suppressed
```

`visualAuthorityStatus()` should add:

```js
{
  suppressionIdCount: 4,
  footprintSuppressionCount: 3,
  unsuppressedSourceCount: 0
}
```

---

## Wall Projection Behavior

Wall should apply the same expanded suppression ID set.

`_wos.debug.buildingEdits.status()` should add:

```js
{
  suppressionIdCount: 4,
  footprintSuppressionCount: 3,
  unsuppressedSourceCount: 0
}
```

---

## New Debug APIs

### Studio

Add:

```js
window.WOSMapLab.unsuppressedSourceBuildings()
```

Returns:

```js
[
  {
    replacementKey: "composite:building:278053568",
    candidateId: 278053569,
    layerId: "maplab-buildings-3d",
    sourceLayer: "building",
    reason: "bounds-intersect",
    suppressed: false
  }
]
```

### Wall

Add:

```js
_wos.debug.buildingEdits.unsuppressedSourceBuildings()
```

Same shape if possible.

---

## Audit Overlay

Optional, low-risk only:

```js
window.WOSMapLab.showSuppressionAudit(true)
window.WOSMapLab.showSuppressionAudit(false)
```

or Wall equivalent.

Do not add UI buttons.

Overlay intent:

```txt
red = source building candidate still visible
green/cyan = replacement manifest footprint
```

This is optional and must not block the main fix.

---

## Error Handling

Required try/catch around:

```txt
map.project
queryRenderedFeatures
querySourceFeatures
feature geometry normalization
bounds computation
setPaintProperty
debug API
```

Failure on one replacement must not stop suppression for others.

---

## Acceptance Tests

### T1 — Beige Original Suppressed

Enable Preview mode on the current failing building.

Expected:

```txt
beige/original Mapbox building disappears or becomes fully transparent
replacement actor remains visible
```

---

### T2 — Wall Suppression Matches Preview

Open Wall.

Expected:

```txt
same source building is suppressed
replacement actor remains visible
```

---

### T3 — Duplicate Feature IDs Suppressed

If Mapbox returns multiple candidate features near the footprint:

Expected:

```txt
all candidate feature IDs are added to suppression
```

---

### T4 — Building Parts Suppressed

If candidate sourceLayer includes `building:part` or related part features:

Expected:

```txt
parts are suppressed too
```

---

### T5 — Color-Only Buildings Unchanged

Buildings with color edits but no replacement stay visible and colored.

---

### T6 — Hidden Buildings Still Suppressed

Hidden buildings remain fully suppressed.

---

### T7 — Author Mode Unchanged

Author mode still shows editable cue and original building.

---

### T8 — Preview Mode Has No Triple Overlay

Expected:

```txt
preview actor visible
author cue hidden
source building suppressed
```

---

### T9 — Debug Reports Zero Unsuppressed

Run:

```js
window.WOSMapLab.unsuppressedSourceBuildings()
```

Expected for the fixed case:

```txt
[]
```

or entries marked:

```txt
suppressed: true
```

---

### T10 — No Manifest Schema Change

Expected:

```txt
existing manifests remain valid
```

---

### T11 — No Canvas/Glyph Changes

Expected:

```txt
no Canvas/Glyph files modified
```

---

## Required Report

Claude/Codex must report:

```txt
files changed
old suppression method
new footprint suppression method
candidate query method
suppression ID counts before/after
whether building:part was found
debug API output
acceptance test results
```

---

## Success Criteria

The user should no longer see:

```txt
replacement actor
+
beige original source building
```

occupying the same space.

Instead:

```txt
Author mode = editable source/cue
Preview/Wall = replacement only
```

This is the blocker fix before any additional visual polish.

---

## Implementation Guide

- **Where:** Update `studio/mapLab/buildingPreviewRuntime.js` and `wall/systems/presentation/buildingEditProjectionRuntime.js`.
- **What:** Expand suppression from single saved feature ID to all rendered/source building features overlapping manifest replacement geometry.
- **Expect:** The remaining beige/original Mapbox building disappears in Preview and Wall while replacement actors stay visible.
