# 0610F_WOS_ReplacementLayerDominance_v1.0.0_BUILD

## Purpose

Make replacement buildings visually dominate the original Mapbox building geometry.

The current replacement system works, but it can still read like an overlay because the original building and replacement actor can both remain visible, reload order can re-expose source buildings, and the replacement layer may not consistently sit above every relevant building layer after style reloads.

This build establishes replacement dominance:

```text
Mapbox source building = suppressed visual substrate
WOS replacement actor = visible building authority
```

## Assumptions

- Wall runtime owns the broadcast map.
- Studio writes replacement edits to `localStorage["wos.maplab.buildings"]`.
- Mapbox composite source remains read-only.
- No Studio UI changes are required.
- No Canvas or Glyph changes are allowed.
- Existing replacement actor generation from `buildingReplacementRuntime.js` must remain intact.

## Files

### Modify

```text
wall/systems/presentation/buildingEditProjectionRuntime.js
wall/systems/runtime/buildingReplacementRuntime.js
```

### Do Not Modify

```text
studio/**
wall/main.js
wall/index.html
wall/systems/runtime/buildingStyleKit.js
canvas/**
glyph/**
```

## Required Behavior

### 1. Original Building Suppression Must Win

For every building with:

```js
edit.replacement.enabled === true
```

the source building must be visually suppressed on all discovered building layers.

Suppression must run:

- after manifest load
- after style load
- after `styledata`
- after replacement runtime sync
- after cross-tab storage updates
- after `buildingReplacement.reload()`

The source building must not reappear after panning, zooming, or style reload.

### 2. Replacement Layer Must Stay Above Building Layers

`wos-replacement-layer` must always render above:

- native building fill layers
- native fill-extrusion building layers
- custom MapLab building layers
- source building outline layers

Add a layer-order repair function:

```js
function _ensureReplacementLayerDominance(map) {}
```

It should:

1. Verify `wos-replacement-layer` exists.
2. Find the highest relevant building/source/outline layer.
3. Move `wos-replacement-layer` above it when needed.
4. Never move unrelated WOS actor/vehicle layers unless required for replacement visibility.
5. Catch Mapbox errors without crashing.

### 3. Suppression + Replacement Must Be Sequenced

The final visual order should be:

```text
1. Mapbox base map
2. Native source buildings, with replaced IDs suppressed
3. Replacement actor layer
4. HUD / overlays / vehicles / runtime annotations
```

If suppression and replacement compete, replacement wins.

### 4. Original Building Must Not Be Used as the Visible Replacement

Do not rely on recoloring the source building as the final replacement. Source building recolor is acceptable only inside Studio Map Lab as editing feedback.

Wall runtime must use:

```text
suppressed source building + replacement actor geometry
```

not:

```text
recolored source building pretending to be replacement
```

### 5. Add Dominance Debug API

Extend:

```js
_wos.debug.buildingReplacement
```

with:

```js
dominanceStatus()
repairDominance()
```

`dominanceStatus()` must return:

```js
{
  replacementLayerPresent: true,
  replacementLayerIndex: 42,
  highestBuildingLayerIndex: 38,
  replacementAboveBuildings: true,
  suppressedReplacementCount: 3,
  visibleReplacementCount: 3,
  unsuppressedReplacementIds: [],
  layerOrder: [
    { id: "building", type: "fill-extrusion", index: 22 },
    { id: "maplab-buildings-3d", type: "fill-extrusion", index: 23 },
    { id: "wos-replacement-layer", type: "fill-extrusion", index: 42 }
  ],
  lastDominanceRepairAt: 1710000000000,
  lastError: null
}
```

`repairDominance()` must:

1. Re-read manifest.
2. Re-apply source suppression.
3. Rebuild replacement actor source if needed.
4. Move replacement layer above building layers.
5. Return `dominanceStatus()`.

## Implementation Notes

### In `buildingEditProjectionRuntime.js`

Add or strengthen:

```js
function _collectReplacementSuppressionIds(manifest) {}
function _applySuppression(map, suppressedIdsBySourceLayer) {}
function suppressionStatus() {}
```

Rules:

- Replacement-enabled buildings are always suppression candidates.
- Hidden buildings are also suppression candidates.
- Replacement-enabled + hidden still suppresses the original, but does not hide the replacement actor.
- Color-only edits must not suppress unless `hidden === true`.

### In `buildingReplacementRuntime.js`

Add:

```js
var _lastDominanceRepairAt = null;

function _discoverDominanceLayers(map) {}
function _ensureReplacementLayerDominance(map) {}
function _repairDominance(map) {}
function dominanceStatus() {}
function repairDominance() {}
```

Call `_repairDominance(map)` after:

- `_pushToMap(map)`
- `_sync(map)`
- `_onStyleReady()`
- `_onStorageEvent()`
- `reload()`

Guard against recursive loops.

Use:

```js
map.moveLayer('wos-replacement-layer')
```

or, when a known overlay anchor exists:

```js
map.moveLayer('wos-replacement-layer', beforeId)
```

Choose the safest ordering based on current layer list. If no reliable `beforeId` exists, move to top.

## Acceptance Tests

| ID | Test | Expected |
|---|---|---|
| T1 | Enable replacement in Studio | Original source building disappears on Wall |
| T2 | Replacement actor visible | Actor remains visible after suppression |
| T3 | Pan/zoom | Original building does not reappear |
| T4 | Reload Wall | Replacement actor restores and original remains suppressed |
| T5 | Change archetype | Actor updates, original remains suppressed |
| T6 | Disable replacement | Actor despawns and original building restores |
| T7 | Color-only edit | Source building can still show color edit if no replacement |
| T8 | Hidden-only edit | Source building becomes hidden |
| T9 | Hidden + replacement | Original hidden, replacement still visible |
| T10 | Style reload | Layer order repaired automatically |
| T11 | Debug API | `dominanceStatus().replacementAboveBuildings === true` |
| T12 | No Studio changes | `studio/**` untouched |
| T13 | No Canvas/Glyph changes | Canvas/Glyph untouched |

## Manual Browser Test

```js
_wos.debug.buildingReplacement.dominanceStatus()
_wos.debug.buildingReplacement.repairDominance()
_wos.debug.buildingEdits.suppressionStatus()
```

Expected:

```js
replacementAboveBuildings: true
suppressedReplacementCount >= visibleReplacementCount
unsuppressedReplacementIds: []
lastError: null
```

## Failure Conditions

Reject the build if:

- replacement appears as a translucent overlay over the original building
- original source building returns after style reload
- source building color cue appears on Wall as the replacement
- disabling replacement fails to restore the original building
- `wos-replacement-layer` is below any building layer
- Studio files are modified
- Canvas or Glyph files are modified

## Implementation Guide

- **Where**: Update `wall/systems/presentation/buildingEditProjectionRuntime.js` suppression logic and `wall/systems/runtime/buildingReplacementRuntime.js` layer-order/runtime repair logic.
- **What**: Run local server, open Wall + Studio, enable one replacement, then test `_wos.debug.buildingReplacement.repairDominance()` in Wall console.
- **Expect**: Original building is fully suppressed, replacement actor remains visible, and `dominanceStatus().replacementAboveBuildings` returns `true`.
