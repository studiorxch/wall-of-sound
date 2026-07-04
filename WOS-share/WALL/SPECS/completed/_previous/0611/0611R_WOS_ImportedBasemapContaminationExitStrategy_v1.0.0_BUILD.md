# 0611R_WOS_ImportedBasemapContaminationExitStrategy_v1.0.0_BUILD

## Purpose

Resolve the remaining WOS building visual-authority problem after `0611Q_WOS_HostOwnedBuildingLayerAuthority_v1.0.0_BUILD`.

WOS can now create and suppress a host-owned building layer: `wos-host-buildings-3d`. However, Mapbox Standard imported basemap buildings may still render through an internal import pipeline that is not queryable, not directly suppressible, and not controlled by `setConfigProperty` for the building keys currently present in the project.

This build adds an explicit **building authority mode** so the system stops pretending that all visible buildings are editable when Mapbox Standard imported geometry is still visible underneath.

---

## Assumptions

- Runtime language: browser JavaScript, existing WOS module style.
- Primary file: `wall/systems/presentation/buildingEditProjectionRuntime.js`.
- Existing WOS host-owned building layer remains: `wos-host-buildings-3d`.
- Existing Mapbox Standard import may remain present.
- Existing suppression strategy for host-owned `fill-extrusion` layers remains `extrusion-height-suppression`.
- `setConfigProperty()` is not trusted for imported basemap building suppression.
- No Canvas, Glyph, actor library, or Studio UI rebuild is included in this patch.

---

## Problem

The current runtime has two building render paths:

1. **Queryable WOS host-owned path**
   - Layer: `wos-host-buildings-3d`
   - Type: `fill-extrusion`
   - Source: host-accessible vector source, usually `composite:building`
   - Suppression works through `fill-extrusion-height = 0`

2. **Imported Mapbox Standard path**
   - Rendered through `style.imports[]`, usually `basemap`
   - Internal building layers are not exposed in the host flat layer list
   - `queryRenderedFeatures()` does not reliably surface imported building features
   - `setConfigProperty()` cannot be trusted for 3D building keys in this project

Result: WOS can suppress the host-owned copy, but the imported basemap building may remain visible underneath. That means “Hide Source Building” is only truthful when WOS owns the visible building geometry.

---

## Build Goal

Add a clear runtime switch with two explicit authority modes:

```js
standard-import-mode
editable-building-mode
```

The runtime must report whether per-building suppression is truly possible in the current mode.

---

## Mode Definitions

### 1. `standard-import-mode`

This is the safe cinematic mode.

Behavior:

- Keep Mapbox Standard import active.
- Keep `wos-host-buildings-3d` available for selection, preview, and replacement alignment.
- Allow replacements to render above the host layer.
- Allow host-owned suppression to run.
- Report that imported basemap contamination may remain visible.
- Do **not** claim source-building deletion is fully possible.

This mode is acceptable for:

- cinematic map previews
- replacement drafting
- visual tests
- partial source hiding where imported buildings are not visible or not conflicting

This mode is **not** acceptable for:

- guaranteed 1:1 source-building deletion
- true replacement-only building authority

### 2. `editable-building-mode`

This is the strict authoring mode.

Behavior:

- WOS-owned host building layers become the only trusted building geometry path.
- Per-building hide/replacement suppression is considered valid only on host-owned queryable layers.
- Imported basemap contamination must be disabled, masked, or explicitly marked unresolved.
- If imported buildings remain visible, status must report the mode as invalid instead of pretending suppression is complete.

This mode is acceptable for:

- real Map Lab editing
- source building removal
- 1:1 Studio → Wall parity
- reliable replacement authority

---

## Required Public API

Add the following methods to `SBE.BuildingEditProjectionRuntime` and `_wos.debug.buildingEdits`.

```js
setBuildingAuthorityMode(mode)
getBuildingAuthorityMode()
buildingAuthorityStatus()
```

Optional global shortcuts are allowed:

```js
setBuildingAuthorityMode('editable-building-mode')
buildingAuthorityStatus()
```

---

## Data Model

Add module state:

```js
var BUILDING_AUTHORITY_MODES = Object.freeze({
  STANDARD_IMPORT: 'standard-import-mode',
  EDITABLE_BUILDING: 'editable-building-mode',
});

var _buildingAuthorityMode = BUILDING_AUTHORITY_MODES.STANDARD_IMPORT;

var _buildingAuthorityState = {
  mode: BUILDING_AUTHORITY_MODES.STANDARD_IMPORT,
  hostLayerPresent: false,
  hostLayerSuppressible: false,
  importedBasemapPresent: false,
  importedBuildingContamination: null,
  truePerBuildingSuppressionAvailable: false,
  visualAuthorityState: 'UNKNOWN',
  lastChangedAt: null,
  lastError: null,
};
```

Do not store this in localStorage for this build. Runtime-only is safer until the mode behavior is proven.

---

## Visual Authority States

`buildingAuthorityStatus()` must return one of:

```js
STANDARD_IMPORT_CONTAMINATED
STANDARD_IMPORT_PARTIAL_AUTHORITY
EDITABLE_BUILDING_CLEAN
EDITABLE_BUILDING_BLOCKED_BY_IMPORT
HOST_LAYER_UNAVAILABLE
ERROR
```

### State Rules

| State | Condition |
|---|---|
| `STANDARD_IMPORT_CONTAMINATED` | Mode is `standard-import-mode`, import exists, host layer exists, imported building contamination likely remains |
| `STANDARD_IMPORT_PARTIAL_AUTHORITY` | Mode is `standard-import-mode`, host layer suppresses correctly, but source deletion is not guaranteed |
| `EDITABLE_BUILDING_CLEAN` | Mode is `editable-building-mode`, host layer exists, suppression works, and no imported building contamination is detected |
| `EDITABLE_BUILDING_BLOCKED_BY_IMPORT` | Mode is `editable-building-mode`, but imported basemap buildings may still render |
| `HOST_LAYER_UNAVAILABLE` | `wos-host-buildings-3d` cannot be added or queried |
| `ERROR` | Runtime exception or map unavailable |

---

## Implementation Plan

### Step 1 — Add Mode Constants

Add constants near existing module constants:

```js
var BUILDING_AUTHORITY_MODES = Object.freeze({
  STANDARD_IMPORT: 'standard-import-mode',
  EDITABLE_BUILDING: 'editable-building-mode',
});
```

Default to `standard-import-mode`.

Reason: existing behavior already matches this mode. Do not break current Wall boot.

---

### Step 2 — Add Mode Setter

Add:

```js
function setBuildingAuthorityMode(mode) {
  if (mode !== BUILDING_AUTHORITY_MODES.STANDARD_IMPORT &&
      mode !== BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING) {
    return {
      ok: false,
      mode: _buildingAuthorityMode,
      error: 'invalid_building_authority_mode',
      allowed: Object.keys(BUILDING_AUTHORITY_MODES).map(function (k) {
        return BUILDING_AUTHORITY_MODES[k];
      }),
    };
  }

  _buildingAuthorityMode = mode;
  _buildingAuthorityState.mode = mode;
  _buildingAuthorityState.lastChangedAt = Date.now();
  _buildingAuthorityState.lastError = null;

  var map = _getMap();
  if (map) {
    try {
      _ensureHostBuildingLayer(map);
      _discoverLayers(map);
      _apply(map);
      _ensureReplacementAboveHostLayer(map);
    } catch (e) {
      _buildingAuthorityState.lastError = String(e && e.message || e);
    }
  }

  return buildingAuthorityStatus();
}
```

No destructive style reloads.

---

### Step 3 — Add Mode Getter

Add:

```js
function getBuildingAuthorityMode() {
  return _buildingAuthorityMode;
}
```

---

### Step 4 — Add Imported Contamination Detector

Add a helper:

```js
function _detectImportedBuildingContamination(map) {
  var result = {
    importedBasemapPresent: false,
    importedBuildingLayerReachable: false,
    contaminationLikely: false,
    reason: 'none',
  };

  if (!map || typeof map.getStyle !== 'function') {
    result.reason = 'map_unavailable';
    return result;
  }

  var style = null;
  try { style = map.getStyle(); } catch (e) {
    result.reason = 'style_unavailable';
    return result;
  }

  var imports = style && Array.isArray(style.imports) ? style.imports : [];
  result.importedBasemapPresent = imports.length > 0;

  if (!imports.length) {
    result.contaminationLikely = false;
    result.reason = 'no_imports';
    return result;
  }

  var flatLayerIds = (style.layers || []).map(function (l) { return l.id; });

  imports.forEach(function (imp) {
    if (!imp || !imp.data || !Array.isArray(imp.data.layers)) return;
    imp.data.layers.forEach(function (layer) {
      var id = layer.id || '';
      var type = layer.type || '';
      var sourceLayer = layer['source-layer'] || '';
      var isBuilding = type === 'fill-extrusion' || type === 'model' ||
        /building/i.test(id) || /building/i.test(sourceLayer);
      if (isBuilding && flatLayerIds.indexOf(id) !== -1) {
        result.importedBuildingLayerReachable = true;
      }
    });
  });

  if (result.importedBuildingLayerReachable) {
    result.contaminationLikely = true;
    result.reason = 'import_building_layer_reachable_but_not_wos_owned';
  } else {
    result.contaminationLikely = true;
    result.reason = 'import_present_internal_layers_not_queryable';
  }

  return result;
}
```

Conservative rule: if Mapbox Standard import exists and its building layers are not proven disabled, contamination is likely.

---

### Step 5 — Add Authority Status

Add:

```js
function buildingAuthorityStatus() {
  var map = _getMap();
  var result = {
    version: VERSION,
    mode: _buildingAuthorityMode,
    hostLayerId: WOS_HOST_BUILDING_LAYER_ID,
    hostLayerPresent: false,
    hostLayerSuppressible: false,
    hostFeatureQueryCount: 0,
    suppressionStrategy: _state.suppressionStrategy,
    suppressionLayerCount: _state.suppressionLayerCount,
    importedBasemapPresent: false,
    importedBuildingContamination: null,
    truePerBuildingSuppressionAvailable: false,
    visualAuthorityState: 'ERROR',
    warning: null,
    lastChangedAt: _buildingAuthorityState.lastChangedAt,
    lastError: _buildingAuthorityState.lastError,
  };

  if (!map) {
    result.lastError = 'map not available';
    return result;
  }

  try {
    var hostStatus = hostBuildingAuthorityStatus();
    var contamination = _detectImportedBuildingContamination(map);

    result.hostLayerPresent = !!hostStatus.hostLayerPresent;
    result.hostLayerSuppressible = !!hostStatus.discoveredByProjectionRuntime &&
      hostStatus.suppressionStrategy === 'extrusion-height-suppression';
    result.hostFeatureQueryCount = hostStatus.hostFeatureQueryCount;
    result.suppressionStrategy = hostStatus.suppressionStrategy;
    result.suppressionLayerCount = hostStatus.suppressionLayerCount;
    result.importedBasemapPresent = contamination.importedBasemapPresent;
    result.importedBuildingContamination = contamination;

    if (!result.hostLayerPresent) {
      result.visualAuthorityState = 'HOST_LAYER_UNAVAILABLE';
      result.truePerBuildingSuppressionAvailable = false;
      result.warning = 'Host-owned building layer is unavailable. WOS cannot guarantee building suppression.';
    } else if (_buildingAuthorityMode === BUILDING_AUTHORITY_MODES.STANDARD_IMPORT) {
      result.truePerBuildingSuppressionAvailable = false;
      result.visualAuthorityState = contamination.contaminationLikely
        ? 'STANDARD_IMPORT_CONTAMINATED'
        : 'STANDARD_IMPORT_PARTIAL_AUTHORITY';
      result.warning = 'Standard import mode keeps Mapbox Standard buildings. Hide Source Building is not guaranteed to remove imported basemap geometry.';
    } else if (_buildingAuthorityMode === BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING) {
      if (contamination.contaminationLikely) {
        result.truePerBuildingSuppressionAvailable = false;
        result.visualAuthorityState = 'EDITABLE_BUILDING_BLOCKED_BY_IMPORT';
        result.warning = 'Editable building mode requested, but imported Mapbox Standard buildings may still render. True per-building deletion is blocked.';
      } else {
        result.truePerBuildingSuppressionAvailable = result.hostLayerSuppressible;
        result.visualAuthorityState = 'EDITABLE_BUILDING_CLEAN';
        result.warning = null;
      }
    }
  } catch (e) {
    result.visualAuthorityState = 'ERROR';
    result.lastError = String(e && e.message || e);
  }

  _buildingAuthorityState.mode = result.mode;
  _buildingAuthorityState.hostLayerPresent = result.hostLayerPresent;
  _buildingAuthorityState.hostLayerSuppressible = result.hostLayerSuppressible;
  _buildingAuthorityState.importedBasemapPresent = result.importedBasemapPresent;
  _buildingAuthorityState.importedBuildingContamination = result.importedBuildingContamination;
  _buildingAuthorityState.truePerBuildingSuppressionAvailable = result.truePerBuildingSuppressionAvailable;
  _buildingAuthorityState.visualAuthorityState = result.visualAuthorityState;
  _buildingAuthorityState.lastError = result.lastError;

  console.log('[BuildingEditProjectionRuntime] buildingAuthorityStatus:', JSON.stringify(result, null, 2));
  return result;
}
```

---

### Step 6 — Wire Status into Existing Host Status

Update `hostBuildingAuthorityStatus()` to include:

```js
buildingAuthorityMode: _buildingAuthorityMode,
truePerBuildingSuppressionAvailable: buildingAuthorityStatus().truePerBuildingSuppressionAvailable,
```

Guard against recursion: if calling `buildingAuthorityStatus()` from inside `hostBuildingAuthorityStatus()` creates recursion, compute the two fields directly instead.

Recommended safer approach:

```js
result.buildingAuthorityMode = _buildingAuthorityMode;
result.truePerBuildingSuppressionAvailable =
  _buildingAuthorityMode === BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING &&
  result.hostLayerPresent &&
  result.discoveredByProjectionRuntime &&
  !result.importedBuildingStillVisible;
```

---

### Step 7 — Add Warnings to Apply Path

At the end of `apply()` and `reload()`, call:

```js
var authority = buildingAuthorityStatus();
if (!authority.truePerBuildingSuppressionAvailable) {
  console.warn('[BuildingEditProjectionRuntime] building authority warning:', authority.warning);
}
```

Do not block rendering.

---

### Step 8 — Export API

Add to frozen export:

```js
setBuildingAuthorityMode: setBuildingAuthorityMode,
getBuildingAuthorityMode: getBuildingAuthorityMode,
buildingAuthorityStatus: buildingAuthorityStatus,
```

Add debug globals:

```js
global._wos.debug.buildingEdits.setBuildingAuthorityMode = setBuildingAuthorityMode;
global._wos.debug.buildingEdits.getBuildingAuthorityMode = getBuildingAuthorityMode;
global._wos.debug.buildingEdits.buildingAuthorityStatus = buildingAuthorityStatus;
global.setBuildingAuthorityMode = setBuildingAuthorityMode;
global.buildingAuthorityStatus = buildingAuthorityStatus;
```

---

## Acceptance Tests

### T1 — Default Mode

Run:

```js
buildingAuthorityStatus()
```

Expected:

```js
{
  mode: 'standard-import-mode',
  truePerBuildingSuppressionAvailable: false,
  visualAuthorityState: 'STANDARD_IMPORT_CONTAMINATED' // or STANDARD_IMPORT_PARTIAL_AUTHORITY
}
```

### T2 — Switch to Editable Mode

Run:

```js
setBuildingAuthorityMode('editable-building-mode')
```

Expected if imported buildings remain:

```js
{
  mode: 'editable-building-mode',
  visualAuthorityState: 'EDITABLE_BUILDING_BLOCKED_BY_IMPORT',
  truePerBuildingSuppressionAvailable: false
}
```

### T3 — Host Layer Still Works

Run:

```js
_wos.debug.buildingEdits.hostBuildingAuthorityStatus()
```

Expected:

```js
{
  hostLayerPresent: true,
  discoveredByProjectionRuntime: true,
  suppressionStrategy: 'extrusion-height-suppression'
}
```

### T4 — No False Success

If imported basemap exists and cannot be disabled, no status method may return:

```js
truePerBuildingSuppressionAvailable: true
```

### T5 — Standard Mode Warning

In `standard-import-mode`, hiding a source building may still write `hidden: true`, but console warning must explain:

```text
Hide Source Building is not guaranteed to remove imported basemap geometry in standard-import-mode.
```

### T6 — No Blind Config Mutation

Search result must confirm no new calls are added that blindly use:

```js
map.setConfigProperty(importId, 'show3dBuildings', false)
map.setConfigProperty(importId, 'show3dFacades', false)
```

except existing best-effort diagnostics already present from 0611Q.

---

## Non-Goals

- Do not fetch Mapbox Standard JSON.
- Do not create a custom derivative style.
- Do not remove Mapbox Standard imports.
- Do not attempt model-layer feature-state suppression.
- Do not redesign Studio UI.
- Do not touch Canvas or Glyph systems.

---

## Success Definition

This patch succeeds when WOS stops treating imported Mapbox Standard buildings as editable geometry.

The user should always be able to tell which state they are in:

```text
Standard import mode = cinematic, not guaranteed editable.
Editable building mode = only valid when WOS owns visible building geometry.
```

Until imported contamination is removed, WOS must report the truth:

```text
HOST LAYER WORKS, BUT TRUE SOURCE-BUILDING DELETION IS BLOCKED BY IMPORTED BASEMAP GEOMETRY.
```

---

## Implementation Guide

- **Where:** `wall/systems/presentation/buildingEditProjectionRuntime.js`; add constants near `WOS_HOST_BUILDING_LAYER_ID`, helpers near the 0611Q host-authority section, exports at the bottom.
- **What:** Run `node --check wall/systems/presentation/buildingEditProjectionRuntime.js`, reload Wall, then run `buildingAuthorityStatus()` and `setBuildingAuthorityMode('editable-building-mode')` in the console.
- **Expect:** Standard mode reports imported contamination; editable mode reports blocked unless imported buildings are truly removed; host layer remains present and suppressible.
