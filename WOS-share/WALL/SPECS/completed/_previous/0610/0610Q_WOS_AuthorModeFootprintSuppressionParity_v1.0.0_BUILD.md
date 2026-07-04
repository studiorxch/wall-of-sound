---
layout: spec

title: "Author Mode Footprint Suppression Parity"
date: 2026-06-10
doc_id: "0610Q_WOS_AuthorModeFootprintSuppressionParity_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "geography"
component: "MapLab"

type: "runtime-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "runtime-authority"

summary: "Author mode source-building suppression must match Preview and Wall suppression behavior by using footprint-aware, group-aware, and compound-aware suppression instead of feature-ID-only suppression."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Mapbox source geometry is immutable"
  - "Author mode may suppress source visibility, but may not recolor source buildings"

depends_on:
  - "0610P_WOS_AuthorModeSourceSuppressionOnly_v1.0.0_BUILD"
  - "0610M_WOS_SourceBuildingHideAuthority_v1.0.0_BUILD"
  - "0610J_WOS_ReplacementBuildingGroupAuthority_v1.0.0_BUILD"
  - "0610K_WOS_CompoundBuildingAuthority_v1.0.0_BUILD"
  - "0610I_WOS_ReplacementSourceBuildingSuppressionAudit_v1.0.0_BUILD"

enables:
  - "Stable MapLab source hiding"
  - "Reliable compound/group authoring"
  - "Studio-to-Wall visual parity"

tags:
  - "maplab"
  - "source-building"
  - "suppression"
  - "author-mode"
  - "footprint"
  - "parity"
---

# 0610Q_WOS_AuthorModeFootprintSuppressionParity_v1.0.0_BUILD

## Purpose

Fix Author mode source-building hiding so it matches Preview and Wall behavior.

Current issue:

```txt
Author mode hide uses feature-id-only suppression.
Preview and Wall use footprint-aware suppression.
```

This causes visible failures when a Mapbox building is represented by:

```txt
multiple rendered features
building:part features
duplicate tile features
multi-block structures
group members
compound members
```

The result:

```txt
Hide Source Building
```

may only hide one visible piece while other source pieces remain.

This spec upgrades Author mode to use the same suppression authority as Preview and Wall.

---

## Current Failure

`mapboxAdapter.js` currently extracts the final segment of:

```txt
source:sourceLayer:featureId
```

and applies:

```js
['match', ['id'], id, 0, originalOpacity]
```

That is insufficient.

A selected visual building may represent:

```txt
feature A
feature B
building:part C
tile duplicate D
```

but Author mode only suppresses:

```txt
feature A
```

Preview/Wall already moved toward footprint queries. Author mode must now match that behavior.

---

## Core Rule

Author mode may suppress source-building visibility.

Author mode may not:

```txt
recolor source buildings
project replacement archetype color cues
spawn replacement actors
mutate Mapbox source data
change Mapbox Studio style defaults
```

Author mode may only:

```txt
restore original Mapbox paint
apply hidden-source opacity suppression
show outline/DOM author cue
```

---

## Scope

### In Scope

- Replace feature-ID-only hidden suppression in `mapboxAdapter.js`.
- Add footprint-query suppression using saved registry geometry.
- Include group and compound members in Author mode suppression.
- Preserve color/replacement cue isolation from 0610O/0610P.
- Restore original opacity correctly when hiding is removed.
- Add debug APIs for suppression parity.

### Out of Scope

- No Mapbox source deletion.
- No Wall replacement geometry changes.
- No Preview runtime redesign.
- No new archetypes.
- No material changes.
- No Canvas changes.
- No Glyph changes.
- No Mapbox Studio style edits.

---

## Files

### Primary Modify

```txt
studio/mapLab/mapboxAdapter.js
```

### Likely Modify

```txt
studio/mapLab/mapLabView.js
```

only if additional registry context must be passed into the adapter.

### Read / Reference Only

```txt
studio/mapLab/buildingEditRegistry.js
studio/mapLab/buildingPreviewRuntime.js
wall/systems/presentation/buildingEditProjectionRuntime.js
```

### Do Not Modify

```txt
wall/systems/runtime/buildingReplacementRuntime.js
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

---

## Required Behavior

### Author Mode Hidden Suppression

When a building edit has:

```js
hidden: true
```

Author mode must suppress:

```txt
the selected source feature id
all rendered building features inside the saved footprint bbox
all related rendered building:part features inside the saved footprint bbox
all grouped member source ids
all compound member source ids
```

### Hidden-Only Entry

If an edit is only:

```js
{ hidden: true }
```

Expected:

```txt
source building suppressed in Author mode
no replacement actor appears
no color projection occurs
```

### Hidden + Replacement

If an edit has:

```js
{
  hidden: true,
  replacement: { enabled: true }
}
```

Author mode expected:

```txt
source building suppressed
replacement actor does not render in Author mode
author badge shows replacement state
Preview mode renders replacement actor
Wall renders replacement actor
```

---

## Suppression Strategy

### Phase 1 — Direct Hidden Keys

Collect direct building keys from:

```txt
manifest.buildings
```

where:

```js
edit.hidden === true
```

Extract feature IDs from keys.

### Phase 2 — Footprint Query Expansion

For every hidden edit with saved geometry:

```js
edit.geometry
```

query rendered features inside the geometry bbox:

```js
queryRenderedFeatures([[minX, minY], [maxX, maxY]], {
  layers: discoveredBuildingLayerIds
})
```

Then add each returned feature id to suppression sets.

### Phase 3 — Group Member Expansion

For every group where any member is hidden, or where the group-level replacement requires suppression:

```txt
include every group member key
include group geometry bbox query ids
```

### Phase 4 — Compound Member Expansion

For every compound where any direct member or nested group member is hidden:

```txt
include every compound member key
expand nested group members
include compound geometry bbox query ids
```

### Phase 5 — Apply Per-Layer Opacity

Apply one match expression per building layer:

```js
['match', ['id'], id1, 0, id2, 0, ..., originalOpacity]
```

Never mutate color unless opacity fails.

### Phase 6 — Fallback Color Transparency

Only if opacity fails:

```js
['match', ['id'], id1, 'rgba(0,0,0,0)', ..., originalColor]
```

This must be logged and reported.

---

## Geometry Requirements

Use saved registry geometry first.

Expected geometry shape:

```js
{
  centroid: { lng, lat },
  bounds: { minLng, maxLng, minLat, maxLat },
  widthM: number,
  depthM: number,
  areaM2: number,
  heading: number
}
```

If geometry is missing:

```txt
fall back to direct feature id only
log as geometryMissing
do not crash
```

---

## Layer Requirements

The adapter must only target Mapbox building layers:

```txt
fill-extrusion layers
fill layers with source-layer building
building:part layers if rendered/discovered
```

It must not target:

```txt
wos-preview-replacements
wos-replacement-layer
maplab-building-outline
symbol layers
road layers
water layers
land layers
```

---

## Adapter API Changes

Add or replace internal helpers in `mapboxAdapter.js`:

```js
_collectAuthorHiddenSuppressionTargets(manifest)
_queryFootprintFeatureIds(map, geometry, layerIds)
_expandGroupHiddenTargets(manifest, suppressionState)
_expandCompoundHiddenTargets(manifest, suppressionState)
_applyAuthorHiddenSuppression(manifest)
_restoreOriginalBuildingPaint()
```

### Public Debug API

Add:

```js
authorSuppressionStatus()
```

Expose as:

```js
WOSMapLab.authorSuppressionStatus()
WOSMapLab.MapboxAdapter.authorSuppressionStatus()
```

Return:

```js
{
  mode: "author",
  hiddenSourceCount: 2,
  directIdCount: 2,
  footprintExpandedIdCount: 8,
  groupExpandedIdCount: 3,
  compoundExpandedIdCount: 4,
  suppressedLayerCount: 2,
  fallbackLayerCount: 0,
  geometryMissingCount: 0,
  colorProjectionEnabled: false,
  replacementProjectionEnabled: false,
  sourcePaintMutationType: "opacity-only",
  lastError: null
}
```

---

## Registry Input

`applyRegistryEdits()` currently receives:

```js
registry.getAll()
```

That only includes building edits.

For group/compound parity, it may need the full manifest.

Preferred compatibility:

```js
function applyRegistryEdits(edits, context) {
  var manifest = {
    buildings: edits || {},
    groups: context && context.groups || {},
    compounds: context && context.compounds || {},
  };
}
```

Then update MapLabView call sites to pass groups/compounds where available.

---

## MapLabView Requirements

Every Author-mode call currently doing:

```js
adapter.applyRegistryEdits(registry.getAll())
```

must become:

```js
adapter.applyRegistryEdits(registry.getAll(), {
  groups: registry.getGroups ? registry.getGroups() : {},
  compounds: registry.getCompounds ? registry.getCompounds() : {},
})
```

Call sites include:

```txt
_setMapMode('author')
_refreshAfterChange()
_onHiddenChange()
_refreshAfterHideRestore()
_onReplacementChange() when not preview
_onReset() when not preview
_onDeleteSelected()
importEdits()
_restoreEdits()
```

Create a local helper:

```js
_applyAuthorRegistryState(adapter, registry)
```

so this does not duplicate.

---

## Paint Restoration Requirements

Before applying hidden suppression:

```txt
restore original Mapbox paint snapshots
clear fallback color transparency
clear old hidden opacity match expressions
```

Then apply the new hidden suppression expression.

When hidden entries become zero:

```txt
all building layers return exactly to original Mapbox Studio paint
```

No lingering opacity match expressions.

---

## Debug Verification Commands

### Studio

```js
WOSMapLab.authorSuppressionStatus()
WOSMapLab.styleParityStatus()
WOSMapLab.sourceHideStatus()
```

### Expected after hiding one compound/group building

```js
{
  hiddenSourceCount: 1,
  directIdCount: 1,
  footprintExpandedIdCount: ">1 likely",
  suppressedLayerCount: ">0",
  colorProjectionEnabled: false,
  replacementProjectionEnabled: false
}
```

---

## Acceptance Tests

### T1 — Direct Hidden Building

Select a single untouched source building.

Click:

```txt
Hide Source Building
```

Expected:

```txt
building disappears in Author mode
author badge shows Source Hidden
no replacement actor appears
```

### T2 — Multi-Part Building

Select a building that visually contains multiple blocks.

Hide source.

Expected:

```txt
all parts inside selected footprint suppress
no beige/original leftover
```

### T3 — Group Member Suppression

Create group from two building parts.

Hide or replace group.

Expected in Author mode:

```txt
all group source members suppressed
no partial source leftovers
```

### T4 — Compound Member Suppression

Create compound from building/group members.

Hide or replace compound.

Expected:

```txt
all compound source members suppressed
nested group members included
```

### T5 — Restore Source Building

Click:

```txt
Restore Source Building
```

Expected:

```txt
all suppressed features restore
original opacity returns
no transparent color fallback remains
```

### T6 — No Color Projection Regression

Set replacement archetype/color.

Stay in Author mode.

Expected:

```txt
source buildings are not recolored by replacement archetype
only hidden suppression and outline/badge appear
```

### T7 — Preview Still Owns Replacement Visuals

Switch to Preview.

Expected:

```txt
preview actor appears
source originals suppressed by preview runtime
```

### T8 — Wall Still Owns Runtime Replacement Visuals

Open Wall.

Expected:

```txt
Wall replacement actor appears
source originals suppressed by Wall projection runtime
```

### T9 — Missing Geometry Safe

Remove geometry from one hidden record.

Expected:

```txt
direct ID suppression still works
geometryMissingCount increments
no crash
```

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
new/changed adapter helpers
all MapLabView applyRegistryEdits call sites updated
whether full manifest context is passed
direct id count
footprint expansion count
group expansion support
compound expansion support
paint restoration behavior
debug API output
acceptance test results
```

---

## Success Criteria

Author mode hide becomes visually reliable.

Expected final behavior:

```txt
Select existing Mapbox building
→ Hide Source Building
→ every visible source part disappears in Author mode
→ no source recoloring occurs
→ Preview/Wall still show replacement systems
→ Restore Source Building returns original Mapbox style exactly
```

---

## Implementation Guide

- **Where:** Update `studio/mapLab/mapboxAdapter.js` suppression collection/query logic and centralize MapLabView registry application calls in `studio/mapLab/mapLabView.js`.
- **What:** Replace feature-ID-only Author hide suppression with footprint-expanded, group-aware, compound-aware opacity suppression while keeping color/replacement projection disabled.
- **Expect:** Source hiding works consistently across single buildings, multi-part buildings, groups, and compounds without altering Mapbox Studio colors.
