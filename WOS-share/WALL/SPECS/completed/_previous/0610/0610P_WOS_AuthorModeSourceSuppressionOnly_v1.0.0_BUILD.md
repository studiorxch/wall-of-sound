# 0610P_WOS_AuthorModeSourceSuppressionOnly_v1.0.0_BUILD

## Purpose

Restore one missing author-mode behavior without reopening the full paint-projection problem:

**Author mode may suppress hidden source buildings only.**

Author mode must **not** recolor Mapbox source buildings for replacement, archetype, custom color, group, or compound cues.

This spec exists because `0610O` correctly isolated author cues to outline / badge / inspector, but it also prevented `hidden: true` from visibly affecting the Studio map. Hiding source buildings is an authoring operation, not a preview-only effect.

## Assumptions

- `studio/mapLab/mapboxAdapter.js` is currently `v1.11.0`.
- `studio/mapLab/mapLabView.js` is currently `v1.15.1`.
- `studio/mapLab/mapInspector.js` is currently `v1.9.0`.
- `BuildingEditRegistry` already stores `hidden: true` entries.
- Preview mode already suppresses originals through `buildingPreviewRuntime.js`.
- Wall mode already suppresses originals through `buildingEditProjectionRuntime.js`.
- This build modifies Studio author behavior only.

## Problem

Current author-mode logic treats all registry edits as non-visual:

```js
applyRegistryEdits(edits) {
  _selectionColorMap = {};
  _restoreOriginalBuildingPaint();
  return scanned;
}
```

That is correct for color and replacement cues, but incorrect for `hidden: true`.

Expected behavior:

| Registry State | Author Mode | Preview Mode | Wall |
|---|---|---|---|
| `color` only | Inspector/badge only | No source recolor | No source recolor unless separately projected |
| `replacement.enabled` | Inspector/badge only | Replacement actor + original suppressed | Replacement actor + original suppressed |
| `hidden: true` | **Source building suppressed** | Source building suppressed | Source building suppressed |
| `hidden: false` | Source visible | Source visible unless replacement suppresses | Source visible unless replacement suppresses |

## Build Scope

### Modify

- `studio/mapLab/mapboxAdapter.js`
- `studio/mapLab/mapLabView.js` only if needed for refresh wiring

### Do Not Modify

- Wall runtime files
- Canvas files
- Glyph files
- `buildingPreviewRuntime.js`
- `buildingEditProjectionRuntime.js`
- `buildingReplacementRuntime.js`
- Mapbox Studio style

## Required Behavior

### R1 — Author mode allows hidden-only source suppression

When `BuildingEditRegistry` contains:

```json
{
  "composite:building:278053568": {
    "hidden": true
  }
}
```

Author mode must suppress that source building on the Studio map.

Suppression should apply to discovered building layers only:

- `fill-extrusion-opacity`
- `fill-opacity`

Do **not** change source building color for hidden suppression unless opacity expression fails.

### R2 — Author mode still blocks color/replacement paint projection

These fields must not mutate Mapbox source building paint in Author mode:

- `color`
- `replacement.archetype`
- `replacement.enabled`
- `tags`
- `notes`
- group metadata
- compound metadata

Replacement metadata should still show in:

- inspector
- author badge
- Preview mode output
- Wall output

### R3 — Preserve Mapbox Studio style paint for visible buildings

For every non-hidden building:

- color must come from Mapbox Studio style
- opacity must come from Mapbox Studio style snapshot
- no WOS default color should be applied

### R4 — Restore hidden source buildings cleanly

When `hidden` changes from `true` to `false`:

- the feature should become visible again in Author mode
- original Mapbox Studio paint must be restored from snapshot
- registry cleanup behavior remains owned by `BuildingEditRegistry`

### R5 — Support multiple hidden buildings

Multiple `hidden: true` entries must produce one deduped match expression per layer.

Example opacity expression:

```js
[
  'match', ['id'],
  278053568, 0,
  992329309, 0,
  ORIGINAL_OPACITY
]
```

### R6 — Safe fallback

If opacity mutation fails on a layer:

1. log a warning
2. set transparent color for hidden IDs only
3. do not affect non-hidden buildings
4. do not crash Map Lab

### R7 — Debug status

Extend `styleParityStatus()` in `mapboxAdapter.js` with:

```js
{
  authorSourceSuppressionEnabled: true,
  hiddenSourceProjectionCount: number,
  hiddenSourceLayerCount: number,
  hiddenSourceFallbackCount: number,
  sourcePaintProjectionEnabled: false,
  colorProjectionEnabled: false,
  replacementCueProjectionEnabled: false
}
```

`sourcePaintProjectionEnabled` should remain `false` because color/replacement projection is still forbidden. Hidden suppression is separately allowed.

## Implementation Plan

## 1. `mapboxAdapter.js`

### 1.1 Add hidden suppression state

Add module state near `_selectionColorMap`:

```js
var _hiddenSourceIds = {};
var _hiddenSuppressionFallbackLayers = {};
```

Where:

```js
_hiddenSourceIds = {
  "278053568": true,
  "992329309": true
};
```

### 1.2 Add ID extraction helper

```js
function _idFromBuildingKey(key) {
  if (!key || typeof key !== 'string') return null;
  var parts = key.split(':');
  var raw = parts[parts.length - 1];
  var num = Number(raw);
  return isNaN(num) ? raw : num;
}
```

### 1.3 Add hidden collection helper

```js
function _collectHiddenSourceIds(edits) {
  var ids = {};
  if (!edits || typeof edits !== 'object') return ids;
  Object.keys(edits).forEach(function (key) {
    var edit = edits[key];
    if (!edit || edit.hidden !== true) return;
    var id = _idFromBuildingKey(key);
    if (id == null) return;
    ids[String(id)] = true;
  });
  return ids;
}
```

Important: this intentionally ignores replacement-enabled entries unless `hidden === true`.

### 1.4 Add opacity expression builder

```js
function _buildHiddenOpacityExpr(hiddenIds, originalOpacity) {
  var ids = Object.keys(hiddenIds || {});
  var fallback = originalOpacity !== null && originalOpacity !== undefined ? originalOpacity : 1;
  if (!ids.length) return fallback;

  var expr = ['match', ['id']];
  ids.forEach(function (idStr) {
    var num = Number(idStr);
    expr.push(isNaN(num) ? idStr : num);
    expr.push(0);
  });
  expr.push(fallback);
  return expr;
}
```

### 1.5 Add transparent color fallback builder

```js
function _buildHiddenColorFallbackExpr(hiddenIds, originalColor) {
  var ids = Object.keys(hiddenIds || {});
  var fallback = originalColor !== null && originalColor !== undefined ? originalColor : COL_DEFAULT;
  if (!ids.length) return fallback;

  var expr = ['match', ['id']];
  ids.forEach(function (idStr) {
    var num = Number(idStr);
    expr.push(isNaN(num) ? idStr : num);
    expr.push('rgba(0,0,0,0)');
  });
  expr.push(fallback);
  return expr;
}
```

### 1.6 Add apply helper

```js
function _applyHiddenSourceSuppression() {
  if (!_map) return;

  var hiddenIds = _hiddenSourceIds || {};
  var hiddenCount = Object.keys(hiddenIds).length;
  _hiddenSuppressionFallbackLayers = {};

  _state.buildingLayers.forEach(function (layer) {
    var snap = _originalPaintSnapshots[layer.id];
    var props = _paintProps(layer.type);
    var originalOpacity = snap ? snap.originalOpacity : null;
    var originalColor = snap ? snap.originalColor : null;

    if (!hiddenCount) {
      // No hidden source IDs: restore original paint.
      try {
        if (snap) {
          _map.setPaintProperty(layer.id, props.opacity, originalOpacity !== null ? originalOpacity : null);
          _map.setPaintProperty(layer.id, props.color, originalColor !== null ? originalColor : null);
        }
      } catch (e) {
        _lastParityError = String(e && e.message || e);
      }
      return;
    }

    try {
      _map.setPaintProperty(layer.id, props.opacity, _buildHiddenOpacityExpr(hiddenIds, originalOpacity));
    } catch (e) {
      _lastParityError = String(e && e.message || e);
      _hiddenSuppressionFallbackLayers[layer.id] = true;
      console.warn('[MapboxAdapter] hidden source opacity suppression failed on', layer.id, e.message || e);
      try {
        _map.setPaintProperty(layer.id, props.color, _buildHiddenColorFallbackExpr(hiddenIds, originalColor));
      } catch (e2) {
        _lastParityError = String(e2 && e2.message || e2);
      }
    }
  });
}
```

Do not call `_buildColorExpr()` for hidden suppression.

### 1.7 Update `applyRegistryEdits(edits)`

Replace current behavior with:

```js
function applyRegistryEdits(edits) {
  var scanned = (edits && typeof edits === 'object') ? Object.keys(edits).length : 0;

  _selectionColorMap = {};
  _hiddenSourceIds = _collectHiddenSourceIds(edits);

  _restoreOriginalBuildingPaint();
  _applyHiddenSourceSuppression();

  var hiddenCount = Object.keys(_hiddenSourceIds).length;
  console.log('[MapboxAdapter] applyRegistryEdits: scanned', scanned,
    'entry/entries — hidden source suppression:', hiddenCount,
    'color/replacement projection disabled (0610P)');

  return scanned;
}
```

### 1.8 Update `clearRegistryProjection()`

This function should clear both color projection and hidden suppression:

```js
function clearRegistryProjection() {
  if (!_map) return;
  _selectionColorMap = {};
  _hiddenSourceIds = {};
  _hiddenSuppressionFallbackLayers = {};
  _restoreOriginalBuildingPaint();
}
```

This is correct when entering Preview mode because preview runtime owns suppression there.

### 1.9 Update `clearSelectionColor()`

Do not clear hidden suppression when clearing selection.

```js
function clearSelectionColor() {
  _selectionColorMap = {};
  _restoreOriginalBuildingPaint();
  _applyHiddenSourceSuppression();
}
```

### 1.10 Update `styleParityStatus()`

Add fields:

```js
var hiddenIds = Object.keys(_hiddenSourceIds || {});
var fallbackIds = Object.keys(_hiddenSuppressionFallbackLayers || {});
```

Return:

```js
hiddenSourceProjectionCount: hiddenIds.length,
hiddenSourceLayerCount: hiddenIds.length ? _state.buildingLayers.length : 0,
hiddenSourceFallbackCount: fallbackIds.length,
authorSourceSuppressionEnabled: true,
colorProjectionEnabled: false,
replacementCueProjectionEnabled: false,
sourcePaintProjectionEnabled: false,
```

Adjust `parityOk` logic:

```js
parityOk: mutatedIds.length === 0 || hiddenIds.length > 0
```

Better: do not mark hidden opacity changes as `_wosMutatedLayers`, or track them separately, so parity remains readable.

## 2. `mapLabView.js`

### 2.1 Ensure hide/restore refresh calls `applyRegistryEdits()` in Author mode

Current `_refreshAfterHideRestore()` already does this in Author mode:

```js
adapter.applyRegistryEdits(reg.getAll());
```

Confirm it remains unchanged.

### 2.2 Ensure `_onHiddenChange()` refreshes after checkbox changes

Current checkbox handler calls registry only. That may update stored hidden state but not refresh map visibility until another path fires.

Modify `_onHiddenChange(hidden)`:

```js
function _onHiddenChange(hidden) {
  var sel = selection.getSelection();
  if (!sel) return;
  var registry = _registry();
  if (!registry) return;
  var key = registry.buildingKey(sel);
  if (!key) return;
  registry.set(key, { hidden: hidden });

  if (_isPreviewMode()) {
    var pr = _preview();
    if (pr && typeof pr.refresh === 'function') { try { pr.refresh(); } catch (e) {} }
  } else {
    try { adapter.applyRegistryEdits(registry.getAll()); } catch (e) {}
  }

  _refreshAfterHideRestore(key, sel);
}
```

This ensures the checkbox and Hide/Restore buttons behave consistently.

## Acceptance Tests

### T1 — Hide source in Author mode

1. Open Studio → Map Lab
2. Select untouched Mapbox building
3. Click **Hide Source Building**
4. Expected:
   - building disappears from Studio Author map
   - inspector changes button to **Restore Source Building**
   - no replacement actor appears in Author mode

### T2 — Restore source in Author mode

1. Select hidden building or known hidden record
2. Click **Restore Source Building**
3. Expected:
   - building becomes visible again
   - original Mapbox Studio color/opacity returns
   - registry no longer contains hidden-only entry if no other data remains

### T3 — Color does not recolor source

1. Select building
2. Change color swatch
3. Expected:
   - source building does not change color in Author mode
   - inspector/badge may show saved color
   - Preview/Wall behavior unchanged

### T4 — Replacement does not recolor source in Author mode

1. Enable replacement on selected building
2. Stay in Author mode
3. Expected:
   - original source building remains visually Mapbox Studio style unless hidden
   - badge/inspector show replacement metadata
   - no archetype color projected onto source building

### T5 — Preview owns preview suppression

1. Hide source building
2. Switch to Preview
3. Expected:
   - preview runtime suppresses source
   - no double suppression crash
   - no author paint projection remains

### T6 — Wall unchanged

1. Hidden source edit exists
2. Open Wall
3. Expected:
   - Wall suppression still works through existing projection runtime
   - no new wall changes required

### T7 — Debug status

Run:

```js
WOSMapLab.styleParityStatus()
```

Expected fields:

```js
{
  authorSourceSuppressionEnabled: true,
  hiddenSourceProjectionCount: 1,
  colorProjectionEnabled: false,
  replacementCueProjectionEnabled: false,
  sourcePaintProjectionEnabled: false
}
```

## Failure Conditions

Stop and report if:

- hiding requires changing Mapbox Studio style itself
- suppression cannot work on current layer because Mapbox rejects per-feature opacity and color fallback also fails
- source buildings still recolor from replacement archetypes in Author mode
- Preview mode shows both source and replacement actor after hide

## Implementation Guide

- **Where**:
  - `studio/mapLab/mapboxAdapter.js`: add hidden suppression helpers near paint-expression management; update `applyRegistryEdits`, `clearRegistryProjection`, `clearSelectionColor`, `styleParityStatus`.
  - `studio/mapLab/mapLabView.js`: update `_onHiddenChange()` so checkbox changes immediately refresh Author/Preview visuals.
- **What**:
  - Restart local server if needed, hard refresh Studio, then test Author hide/restore before testing Preview.
  - Console checks: `WOSMapLab.styleParityStatus()` and `WOSMapLab.sourceHideStatus()`.
- **Expect**:
  - Hidden source buildings disappear in Studio Author mode; color/replacement metadata never recolors source buildings in Author mode; Preview and Wall continue owning replacement visuals.
