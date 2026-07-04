# 0611S_WOS_EditableBuildingModeImportBypass_v1.0.0_BUILD

## SPEC STAGE

Stage: `[BUILD]`  
Action: Make `editable-building-mode` operational by bypassing imported Mapbox Standard building rendering assumptions and treating `wos-host-buildings-3d` as the only editable building authority.

---

## Purpose

0611R correctly introduced explicit building-authority modes, but it still leaves `editable-building-mode` blocked whenever Mapbox Standard import contamination is detected.

0611S converts that state from diagnostic-only into an actionable runtime path:

```txt
standard-import-mode
  → cinematic basemap mode
  → imported Mapbox Standard buildings may remain
  → true source-building deletion is not guaranteed

editable-building-mode
  → WOS-owned building layer is the only editable surface
  → imported building renderer is treated as non-authoritative
  → all hide/replacement suppression targets wos-host-buildings-3d
```

This does **not** attempt per-feature suppression inside Mapbox Standard imports. That path has been proven unavailable. Instead, editable mode bypasses the import as building authority and makes WOS host-owned building layers the source of truth.

---

## Environmental Assumptions

- Current source file: `wall/systems/presentation/buildingEditProjectionRuntime.js` v1.15.0.
- Existing 0611Q host layer is present or can be created:
  - `wos-host-buildings-3d`
  - source: `composite`
  - source-layer: `building`
  - type: `fill-extrusion`
- Existing 0611R mode API exists:
  - `getBuildingAuthorityMode()`
  - `setBuildingAuthorityMode(mode)`
  - `buildingAuthorityStatus()`
  - `hostBuildingAuthorityStatus()`
- Mapbox Standard import cannot be controlled by `setConfigProperty()` for building-specific keys in this project.
- Do not mutate Studio, Canvas, Glyph, Actor Library, or replacement geometry systems.

---

## Files To Modify

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

No other files.

---

## Core Problem

Current `editable-building-mode` reports:

```txt
EDITABLE_BUILDING_BLOCKED_BY_IMPORT
truePerBuildingSuppressionAvailable: false
```

This is technically honest, but it prevents WOS from moving forward.

The imported Standard building renderer is not queryable, not suppressible, and not writable through the active config API. Therefore, editable mode must stop treating the import as an editable building participant.

---

## Required Runtime Behavior

### Mode 1 — `standard-import-mode`

Keep current behavior.

```txt
Mapbox Standard import remains visually authoritative for cinematic basemap rendering.
WOS host building layer may exist, but true deletion is not guaranteed.
Warnings remain active.
```

### Mode 2 — `editable-building-mode`

Change behavior.

```txt
WOS host-owned building layer becomes the only editable building surface.
Imported Standard buildings are considered non-authoritative contamination.
Suppression applies only to WOS-owned host layers.
Status must report whether editable mode is operational, even if imported contamination may still be visually present.
```

Editable mode does **not** claim it removed Standard imported buildings. It claims WOS has a working editable building surface and that Standard imports are bypassed as authority.

---

## Implementation Requirements

### 1. Add Editable Authority State

Add a state object near `_buildingAuthorityState`:

```js
var _editableBuildingBypassState = {
  active: false,
  hostLayerReady: false,
  hostLayerSuppressible: false,
  importBypassedAsAuthority: false,
  importedVisualContaminationLikely: false,
  lastAppliedAt: null,
  lastError: null,
};
```

---

### 2. Add Helper: `_isEditableBuildingMode()`

```js
function _isEditableBuildingMode() {
  return _buildingAuthorityMode === BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING;
}
```

---

### 3. Add Helper: `_applyEditableBuildingBypass(map)`

Purpose: explicitly mark imported Standard buildings as non-authoritative and ensure WOS host layer is ready.

Behavior:

1. Ensure `wos-host-buildings-3d` exists.
2. Discover layers.
3. Confirm `wos-host-buildings-3d` is in `_layers`.
4. Confirm suppression strategy can target `fill-extrusion-height/base`.
5. Set `_editableBuildingBypassState.importBypassedAsAuthority = true`.
6. Do **not** attempt more `setConfigProperty()` building toggles.
7. Do **not** try to mutate imported Standard internal layers.

Expected structure:

```js
function _applyEditableBuildingBypass(map) {
  var result = {
    ok: false,
    hostLayerReady: false,
    hostLayerSuppressible: false,
    importBypassedAsAuthority: false,
    importedVisualContaminationLikely: false,
    error: null,
  };

  try {
    if (!map) throw new Error('map_not_available');

    _ensureHostBuildingLayer(map);
    _discoverLayers(map);

    var hostLayer = _layers.find(function (l) {
      return l.id === WOS_HOST_BUILDING_LAYER_ID;
    });

    result.hostLayerReady = !!hostLayer;
    result.hostLayerSuppressible = !!hostLayer && hostLayer.type === 'fill-extrusion';
    result.importBypassedAsAuthority = true;

    var contamination = _detectImportedBuildingContamination(map);
    result.importedVisualContaminationLikely = !!contamination.contaminationLikely;

    result.ok = result.hostLayerReady && result.hostLayerSuppressible;
  } catch (e) {
    result.error = String(e && e.message || e);
  }

  _editableBuildingBypassState.active = _isEditableBuildingMode();
  _editableBuildingBypassState.hostLayerReady = result.hostLayerReady;
  _editableBuildingBypassState.hostLayerSuppressible = result.hostLayerSuppressible;
  _editableBuildingBypassState.importBypassedAsAuthority = result.importBypassedAsAuthority;
  _editableBuildingBypassState.importedVisualContaminationLikely = result.importedVisualContaminationLikely;
  _editableBuildingBypassState.lastAppliedAt = Date.now();
  _editableBuildingBypassState.lastError = result.error;

  return result;
}
```

Use standard function syntax for compatibility with the existing file if `.find()` support is a concern:

```js
var hostLayer = null;
for (var i = 0; i < _layers.length; i++) {
  if (_layers[i].id === WOS_HOST_BUILDING_LAYER_ID) {
    hostLayer = _layers[i];
    break;
  }
}
```

---

### 4. Patch `setBuildingAuthorityMode(mode)`

After mode assignment:

```js
if (_isEditableBuildingMode()) {
  _applyEditableBuildingBypass(map);
}
```

Then run the existing convergence chain:

```js
_ensureHostBuildingLayer(map);
_discoverLayers(map);
_apply(map);
_ensureReplacementAboveHostLayer(map);
```

Do not remove existing behavior.

---

### 5. Patch `buildingAuthorityStatus()`

Current behavior blocks editable mode when import contamination is likely.

Change the editable-mode branch:

```js
} else if (_buildingAuthorityMode === BUILDING_AUTHORITY_MODES.EDITABLE_BUILDING) {
  var bypass = _editableBuildingBypassState;

  result.truePerBuildingSuppressionAvailable =
    result.hostLayerPresent &&
    result.hostLayerSuppressible &&
    bypass.importBypassedAsAuthority;

  result.visualAuthorityState = result.truePerBuildingSuppressionAvailable
    ? 'EDITABLE_BUILDING_HOST_AUTHORITY_ACTIVE'
    : 'EDITABLE_BUILDING_HOST_AUTHORITY_UNAVAILABLE';

  result.importedVisualContaminationLikely = contamination.contaminationLikely;
  result.importedBuildingsBypassedAsAuthority = bypass.importBypassedAsAuthority;

  result.warning = contamination.contaminationLikely
    ? 'Editable building mode is using WOS host-owned buildings as authority. Imported Standard buildings may still render visually, but they are no longer treated as editable source geometry.'
    : null;
}
```

Important distinction:

```txt
truePerBuildingSuppressionAvailable
```

means suppression is available on the WOS host-owned building layer, **not** that Mapbox Standard imported geometry was per-feature suppressed.

---

### 6. Add Debug Method: `editableBuildingBypassStatus()`

Return:

```js
{
  mode,
  active,
  hostLayerReady,
  hostLayerSuppressible,
  importBypassedAsAuthority,
  importedVisualContaminationLikely,
  truePerBuildingSuppressionAvailable,
  visualAuthorityState,
  lastAppliedAt,
  lastError
}
```

Log the object and return it.

---

### 7. Export Debug Method

Add to public API object:

```js
editableBuildingBypassStatus: editableBuildingBypassStatus,
```

Add global shortcut:

```js
global.editableBuildingBypassStatus = editableBuildingBypassStatus;
```

---

### 8. Patch `apply()` and `reload()` Warnings

When editable mode is active and host suppression is available, do not keep warning that true deletion is impossible just because import contamination exists.

Replace warning logic with:

```js
if (!_applyAuthority.truePerBuildingSuppressionAvailable && _applyAuthority.warning) {
  console.warn(...);
}
```

But ensure `buildingAuthorityStatus()` no longer sets `truePerBuildingSuppressionAvailable` false only due to import contamination in editable mode.

---

## Required Status Values

### Standard Import Mode

```js
setBuildingAuthorityMode('standard-import-mode')
buildingAuthorityStatus()
```

Expected:

```json
{
  "mode": "standard-import-mode",
  "visualAuthorityState": "STANDARD_IMPORT_CONTAMINATED",
  "truePerBuildingSuppressionAvailable": false
}
```

### Editable Building Mode

```js
setBuildingAuthorityMode('editable-building-mode')
buildingAuthorityStatus()
```

Expected if host layer exists:

```json
{
  "mode": "editable-building-mode",
  "visualAuthorityState": "EDITABLE_BUILDING_HOST_AUTHORITY_ACTIVE",
  "truePerBuildingSuppressionAvailable": true,
  "importedBuildingsBypassedAsAuthority": true,
  "importedVisualContaminationLikely": true
}
```

This is valid even if imported Standard geometry remains visible, because the mode now explicitly defines WOS host buildings as the only editable surface.

---

## Acceptance Tests

| Test | Expected |
|---|---|
| T1 Default boot | `getBuildingAuthorityMode()` returns `standard-import-mode` |
| T2 Standard status | `buildingAuthorityStatus().truePerBuildingSuppressionAvailable === false` |
| T3 Switch editable | `setBuildingAuthorityMode('editable-building-mode')` returns active host authority status |
| T4 Host layer authority | `editableBuildingBypassStatus().hostLayerReady === true` |
| T5 Suppressible host | `editableBuildingBypassStatus().hostLayerSuppressible === true` |
| T6 Import bypassed | `editableBuildingBypassStatus().importBypassedAsAuthority === true` |
| T7 Editable suppression available | `buildingAuthorityStatus().truePerBuildingSuppressionAvailable === true` when host layer is present |
| T8 Replacement unaffected | `wos-replacement-layer` remains above `wos-host-buildings-3d` |
| T9 No false claim | Status still reports `importedVisualContaminationLikely` separately |
| T10 No unrelated files | No Canvas, Glyph, Studio, Actor Library, or replacement geometry changes |

---

## Non-Goals

Do not:

- Try more Mapbox Standard config keys.
- Attempt per-feature mutation of imported Standard internal layers.
- Remove the Standard import.
- Fetch or rewrite Mapbox Standard JSON.
- Change Studio UI.
- Change replacement actor geometry.
- Change Canvas or Glyph systems.

---

## Console Verification

```js
getBuildingAuthorityMode()

buildingAuthorityStatus()

setBuildingAuthorityMode('editable-building-mode')

editableBuildingBypassStatus()

_wos.debug.buildingEdits.hostBuildingAuthorityStatus()

_wos.debug.buildingEdits.verifySuppression()
```

Expected critical result:

```js
buildingAuthorityStatus().truePerBuildingSuppressionAvailable
// true in editable-building-mode when wos-host-buildings-3d is present/discovered
```

---

## Implementation Guide

- **Where:** Patch `wall/systems/presentation/buildingEditProjectionRuntime.js` near existing 0611R authority-mode state, `setBuildingAuthorityMode()`, `buildingAuthorityStatus()`, and public export block.
- **What:** Run app, open Wall console, then execute `setBuildingAuthorityMode('editable-building-mode')` and `editableBuildingBypassStatus()`.
- **Expect:** `EDITABLE_BUILDING_HOST_AUTHORITY_ACTIVE`, `importBypassedAsAuthority: true`, and `truePerBuildingSuppressionAvailable: true` when `wos-host-buildings-3d` is present.
