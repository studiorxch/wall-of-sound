# 0611Q_WOS_HostOwnedBuildingLayerAuthority_v1.0.0_BUILD

## Purpose

Create a host-owned WOS building layer so WOS stops relying on non-queryable Mapbox Standard imported 3D buildings for editing, hiding, and replacement authority.

This build establishes a reachable building-rendering path where WOS owns the active editable building layer in `map.getStyle().layers`, while Mapbox Standard remains responsible for land, roads, water, labels, lighting, and trees.

## Problem

Current audits confirm that Mapbox Standard imported basemap buildings are not usable as WOS editing authority:

- Imported Standard building layers are not exposed through the host `map.getStyle().layers` list.
- `queryRenderedFeatures()` does not reliably return imported basemap building features.
- `map.setConfigProperty('basemap', 'show3dBuildings', false)` and related keys do not control the visible imported buildings.
- Per-feature suppression cannot be applied to imported basemap internals.
- Existing height/base suppression logic works only when the building layer is host-owned and discoverable.

## Goal

Add a WOS-owned `fill-extrusion` building layer that is:

- present in host `map.getStyle().layers`
- queryable through `queryRenderedFeatures()`
- suppressible through `fill-extrusion-height` / `fill-extrusion-base`
- compatible with existing replacement actors
- shared between Studio preview and Wall runtime behavior

## Non-Goals

- Do not rewrite the entire Mapbox style.
- Do not remove Mapbox Standard as the visual basemap.
- Do not modify Canvas, Glyph, Actor Library, Asset Library, or unrelated runtime systems.
- Do not add new manifest schema fields unless absolutely required.
- Do not depend on Mapbox Standard import internals for per-building suppression.

## Files to Modify

Primary target:

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

Likely related targets if needed:

```txt
studio/mapLab/mapboxAdapter.js
studio/mapLab/buildingPreviewRuntime.js
wall/systems/runtime/buildingReplacementRuntime.js
```

Do not modify unrelated modules.

## Required Architecture

### 1. Add host-owned building authority layer

Create a new WOS-owned building layer:

```txt
wos-host-buildings-3d
```

It must be a host `fill-extrusion` layer using a reachable source/source-layer pair.

Preferred source path:

```txt
source: composite
source-layer: building
```

Fallback source path:

If `composite` is not available in `map.getStyle().sources`, inspect `map.getStyle().imports[0].data.sources` and add the required source to the host style using `map.addSource()`.

### 2. Keep Mapbox Standard for non-building basemap

Mapbox Standard import should remain responsible for:

```txt
land
water
roads
labels
trees
lighting
terrain/fog if present
```

Do not remove or replace the whole import in this patch.

### 3. Make WOS layer discoverable

Update layer discovery so this layer is always accepted:

```js
id === 'wos-host-buildings-3d'
type === 'fill-extrusion'
```

It must populate the same internal layer structure used by suppression:

```js
{
  id,
  type: 'fill-extrusion',
  source,
  sourceLayer,
  colorProp: 'fill-extrusion-color',
  originalColor,
  originalHeight,
  originalBase,
}
```

### 4. Suppression must use existing height/base authority

Hidden and replacement-enabled source buildings must collapse by ID:

```js
fill-extrusion-height: ['match', ['id'], hiddenId, 0, ..., originalHeight]
fill-extrusion-base:   ['match', ['id'], hiddenId, 0, ..., originalBase]
```

Do not use `fill-extrusion-opacity` for per-feature suppression.
Do not use transparent `fill-extrusion-color` for per-feature suppression.

### 5. Replacement layer dominance

`wos-replacement-layer` must remain above:

```txt
wos-host-buildings-3d
all imported basemap building visuals if reachable
all other source building layers
```

Add or reuse a repair path that ensures final order:

```txt
basemap layers
wos-host-buildings-3d
wos-replacement-layer
```

### 6. Imported Standard buildings

Because imported Standard buildings may remain visible underneath, this patch must detect and report the state clearly.

Try these in order:

1. If Standard import exposes reachable building layer IDs in host `getStyle().layers`, hide those layers.
2. If Standard config actually exposes a working building visibility key, use it.
3. If neither is possible, report that imported buildings remain non-suppressible and mark WOS host authority as active but visually contaminated.

Do not pretend this is fixed if imported Standard buildings still render underneath.

## Public Debug API

Add:

```js
_wos.debug.buildingEdits.hostBuildingAuthorityStatus()
SBE.BuildingEditProjectionRuntime.hostBuildingAuthorityStatus()
```

Return shape:

```js
{
  version,
  hostAuthorityEnabled,
  hostLayerId: 'wos-host-buildings-3d',
  hostLayerPresent,
  hostLayerIndex,
  hostSourceId,
  hostSourceLayer,
  hostSourceAccessible,
  hostFeatureQueryCount,
  discoveredByProjectionRuntime,
  suppressionStrategy,
  suppressionLayerCount,
  replacementLayerIndex,
  replacementAboveHostLayer,
  importedBasemapPresent,
  importedBuildingLayerReachable,
  importedBuildingSuppressionStrategy,
  importedBuildingStillVisible,
  visualAuthorityState,
  lastError
}
```

Allowed `visualAuthorityState` values:

```txt
HOST_AUTHORITY_CLEAN
HOST_AUTHORITY_ACTIVE_IMPORTED_CONTAMINATION
HOST_AUTHORITY_UNAVAILABLE
ERROR
```

## Implementation Details

### Helper: `_ensureHostBuildingLayer(map)`

Responsibilities:

1. Confirm map/style readiness.
2. Resolve accessible building source:
   - first `composite/building`
   - then imported source copied into host style
3. Add source if missing and possible.
4. Add `wos-host-buildings-3d` if missing.
5. Set paint properties:

```js
'fill-extrusion-color': '#d8dee8'
'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'height']]
'fill-extrusion-base': ['case', ['has', 'min_height'], ['get', 'min_height'], 0]
'fill-extrusion-opacity': 1
```

6. Return a status object. Never throw.

### Helper: `_discoverHostSource(map)`

Return:

```js
{
  ok,
  sourceId,
  sourceLayer,
  sourceDefinition,
  sourceOrigin: 'host' | 'import-data' | 'none',
  error
}
```

### Helper: `_queryHostBuildingFeatureCount(map)`

Run a small center/bbox query against only `wos-host-buildings-3d` and return feature count.

This proves the host-owned layer is queryable.

### Helper: `_ensureReplacementAboveHostLayer(map)`

Ensure replacement layers sit above the host building layer.

Do not crash if replacement layer does not yet exist.

## Required Wiring

Call `_ensureHostBuildingLayer(map)` from these convergence points:

```txt
init/style ready
reload()
apply()
storage event re-apply path
```

Order must be:

```txt
_loadManifest()
_ensureHostBuildingLayer(map)
_discoverLayers(map)
_apply(map)
_ensureReplacementAboveHostLayer(map)
```

## Studio Parity

Studio Map Lab must not continue relying on imported Standard building visuals for authoring.

If Studio already creates a fallback `maplab-buildings-3d`, align it with the new Wall authority:

```txt
source: composite
source-layer: building
layer type: fill-extrusion
same height/base/color defaults
same suppression strategy
```

Studio and Wall do not need identical colors, but they must share the same ownership model:

```txt
host-owned layer → queryable → suppressible → replacement-dominant
```

## Acceptance Tests

### T1 — Host layer exists

Run:

```js
map.getStyle().layers.find(l => l.id === 'wos-host-buildings-3d')
```

Expected:

```txt
layer exists, type === 'fill-extrusion'
```

### T2 — Host source is queryable

Run:

```js
_wos.debug.buildingEdits.hostBuildingAuthorityStatus()
```

Expected:

```txt
hostLayerPresent: true
hostFeatureQueryCount > 0
hostSourceAccessible: true
```

### T3 — Projection runtime discovers host layer

Expected:

```txt
discoveredByProjectionRuntime: true
suppressionStrategy: extrusion-height-suppression
```

### T4 — Hide Source Building works on host layer

Steps:

1. Select a building.
2. Click `Hide Source Building`.
3. Run `hostBuildingAuthorityStatus()`.

Expected:

```txt
hidden source collapses from WOS host layer
suppressionLayerCount >= 1
```

### T5 — Replacement actor dominates

Steps:

1. Enable replacement on selected building.
2. Switch to Preview.
3. Compare Wall.

Expected:

```txt
replacementAboveHostLayer: true
replacement actor visible above host building layer
```

### T6 — Imported basemap contamination is not hidden

If imported Standard buildings are still visible, status must explicitly report:

```txt
visualAuthorityState: HOST_AUTHORITY_ACTIVE_IMPORTED_CONTAMINATION
importedBuildingStillVisible: true
```

This is acceptable for this patch only if clearly reported.

### T7 — No unrelated edits

Expected:

```txt
Canvas unchanged
Glyph unchanged
Actor Library unchanged
Asset Library unchanged
manifest schema unchanged
```

## Failure Handling

If no accessible building source can be found:

- Do not crash.
- Leave Mapbox Standard visible.
- Return:

```txt
visualAuthorityState: HOST_AUTHORITY_UNAVAILABLE
hostAuthorityEnabled: false
lastError: reason
```

## Build Notes

This patch is not a visual polish pass. It is an authority pass.

The purpose is to make building edits technically controllable. After this lands, later passes can refine:

```txt
building material palette
Moebius outline treatment
texture variation
day/night color grading
compound building UI
```

## Expected Result

WOS should gain a reachable, host-owned building layer. Existing source-hide and replacement logic should finally operate against a layer WOS controls, rather than against the sealed Mapbox Standard import.

If imported Standard buildings still appear underneath, the system must report that honestly and prepare the next patch to fully disable or replace the Standard imported building path.
