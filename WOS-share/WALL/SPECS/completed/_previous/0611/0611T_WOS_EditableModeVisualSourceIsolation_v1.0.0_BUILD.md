# 0611T_WOS_EditableModeVisualSourceIsolation_v1.0.0_BUILD

## SPEC STAGE

Stage: `[BUILD]`  
Action: Patch Wall building-authority status so editable mode does not claim clean visual authority while imported Mapbox Standard buildings may still be visible.

---

## Purpose

0611S created **semantic authority**: WOS can treat `wos-host-buildings-3d` as the editable building surface even when the Mapbox Standard import remains present.

That is useful, but it is not visually honest yet.

If imported Standard building geometry is still visible, then WOS cannot claim that editable mode has true visual isolation. The user may still see beige/imported buildings that cannot be hidden, selected, or replaced per feature.

This patch separates three concepts:

```txt
Data authority      → WOS host-owned building layer is the editable source of truth
Suppression ability → WOS can suppress host-owned building features
Visual isolation    → imported non-editable buildings are not visually competing
```

0611T makes the runtime report these separately and prevents `truePerBuildingSuppressionAvailable` from returning `true` when imported visual contamination is still likely.

---

## Environmental Assumptions

- File patched: `wall/systems/presentation/buildingEditProjectionRuntime.js`
- Current runtime version: `v1.16.0`
- Next runtime version: `v1.17.0`
- Existing 0611S methods remain present:
  - `getBuildingAuthorityMode()`
  - `setBuildingAuthorityMode(mode)`
  - `buildingAuthorityStatus()`
  - `editableBuildingBypassStatus()`
  - `_applyEditableBuildingBypass(map)`
  - `_detectImportedBuildingContamination(map)`
- Existing host-owned building layer remains:
  - `wos-host-buildings-3d`
- No changes to Studio, Canvas, Glyph, replacement geometry, registry schema, or Mapbox source data.

---

## Current Problem

Current 0611S logic can report:

```js
{
  mode: 'editable-building-mode',
  truePerBuildingSuppressionAvailable: true,
  visualAuthorityState: 'EDITABLE_BUILDING_HOST_AUTHORITY_ACTIVE',
  importedVisualContaminationLikely: true
}
```

That is misleading.

If `importedVisualContaminationLikely === true`, WOS may be able to suppress the **host-owned layer**, but it cannot guarantee that the visible building on screen is gone.

---

## Required Behavior

Editable mode must only claim clean visual authority when all are true:

```txt
hostLayerPresent === true
hostLayerSuppressible === true
importedBuildingsBypassedAsAuthority === true
importedVisualContaminationLikely === false
```

If the host layer works but imported contamination remains likely, report:

```txt
EDITABLE_BUILDING_AUTHORITY_ACTIVE_BUT_VISUALLY_CONTAMINATED
```

not:

```txt
EDITABLE_BUILDING_HOST_AUTHORITY_ACTIVE
```

---

## Files Changed

| File | Change |
|---|---|
| `wall/systems/presentation/buildingEditProjectionRuntime.js` | Patch status logic, add visual-isolation status method, export method aliases |

No other files should be modified.

---

## Version Header Update

Update header:

```js
// ── BuildingEditProjectionRuntime v1.17.0 ────────────────────────────────────
// 0611T_WOS_EditableModeVisualSourceIsolation_v1.0.0_BUILD
// Prior: 0611S_WOS_EditableBuildingModeImportBypass_v1.0.0_BUILD
```

Update:

```js
var VERSION = '1.17.0';
```

---

## New State Fields

Extend `_editableBuildingBypassState` or add a new state object.

Preferred minimal addition:

```js
var _editableVisualIsolationState = {
  editableDataAuthorityActive: false,
  editableVisualIsolationAchieved: false,
  importedBuildingsBypassedAsAuthority: false,
  importedVisualContaminationLikely: false,
  truePerBuildingSuppressionAvailable: false,
  visualAuthorityState: 'UNKNOWN',
  lastCheckedAt: null,
  lastError: null,
};
```

This state is runtime-only. Do not persist it to localStorage.

---

## Helper: `_computeEditableVisualIsolationStatus(map, hostStatus, contamination, bypass)`

Add one private helper to centralize the decision logic.

```js
function _computeEditableVisualIsolationStatus(map, hostStatus, contamination, bypass) {
  var result = {
    editableDataAuthorityActive: false,
    editableVisualIsolationAchieved: false,
    importedBuildingsBypassedAsAuthority: false,
    importedVisualContaminationLikely: false,
    truePerBuildingSuppressionAvailable: false,
    visualAuthorityState: 'UNKNOWN',
    warning: null,
    lastError: null,
  };

  try {
    var hostLayerPresent = !!(hostStatus && hostStatus.hostLayerPresent);
    var hostLayerSuppressible = !!(
      hostStatus &&
      hostStatus.discoveredByProjectionRuntime &&
      hostStatus.suppressionStrategy === 'extrusion-height-suppression'
    );

    var importBypassed = !!(bypass && bypass.importBypassedAsAuthority);
    var contaminationLikely = !!(contamination && contamination.contaminationLikely);

    result.editableDataAuthorityActive = hostLayerPresent && hostLayerSuppressible && importBypassed;
    result.importedBuildingsBypassedAsAuthority = importBypassed;
    result.importedVisualContaminationLikely = contaminationLikely;
    result.editableVisualIsolationAchieved = result.editableDataAuthorityActive && !contaminationLikely;

    result.truePerBuildingSuppressionAvailable = result.editableVisualIsolationAchieved;

    if (!hostLayerPresent) {
      result.visualAuthorityState = 'EDITABLE_BUILDING_HOST_LAYER_UNAVAILABLE';
      result.warning = 'Editable building mode is unavailable because the WOS host-owned building layer is missing.';
    } else if (!hostLayerSuppressible) {
      result.visualAuthorityState = 'EDITABLE_BUILDING_HOST_LAYER_NOT_SUPPRESSIBLE';
      result.warning = 'Editable building mode is unavailable because the WOS host-owned building layer is not currently suppressible.';
    } else if (!importBypassed) {
      result.visualAuthorityState = 'EDITABLE_BUILDING_IMPORT_NOT_BYPASSED_AS_AUTHORITY';
      result.warning = 'Editable building mode has not bypassed imported Standard buildings as source authority.';
    } else if (contaminationLikely) {
      result.visualAuthorityState = 'EDITABLE_BUILDING_AUTHORITY_ACTIVE_BUT_VISUALLY_CONTAMINATED';
      result.warning = 'WOS host-owned buildings are editable, but imported Standard buildings may still render visually. Hide Source Building only guarantees suppression on WOS-owned layers.';
    } else {
      result.visualAuthorityState = 'EDITABLE_BUILDING_VISUAL_ISOLATION_ACTIVE';
      result.warning = null;
    }
  } catch (e) {
    result.visualAuthorityState = 'ERROR';
    result.lastError = String(e && e.message || e);
    result.warning = 'Editable visual isolation status failed.';
  }

  return result;
}
```

---

## Patch: `buildingAuthorityStatus()`

In the editable-mode branch, replace the optimistic 0611S behavior.

### Remove this logic

```js
result.truePerBuildingSuppressionAvailable =
  result.hostLayerPresent &&
  result.hostLayerSuppressible &&
  bypass.importBypassedAsAuthority;

result.visualAuthorityState = result.truePerBuildingSuppressionAvailable
  ? 'EDITABLE_BUILDING_HOST_AUTHORITY_ACTIVE'
  : 'EDITABLE_BUILDING_HOST_AUTHORITY_UNAVAILABLE';
```

### Replace with this logic

```js
var isolation = _computeEditableVisualIsolationStatus(
  map,
  hostStatus,
  contamination,
  _editableBuildingBypassState
);

result.editableDataAuthorityActive = isolation.editableDataAuthorityActive;
result.editableVisualIsolationAchieved = isolation.editableVisualIsolationAchieved;
result.importedVisualContaminationLikely = isolation.importedVisualContaminationLikely;
result.importedBuildingsBypassedAsAuthority = isolation.importedBuildingsBypassedAsAuthority;
result.truePerBuildingSuppressionAvailable = isolation.truePerBuildingSuppressionAvailable;
result.visualAuthorityState = isolation.visualAuthorityState;
result.warning = isolation.warning;
result.lastError = isolation.lastError || result.lastError;
```

### Required rule

`truePerBuildingSuppressionAvailable` must be `false` when:

```js
importedVisualContaminationLikely === true
```

Even if the host layer is fully ready.

---

## New Public Method: `editableVisualIsolationStatus()`

Add a new public debug method.

```js
function editableVisualIsolationStatus() {
  var map = _getMap();
  var result = {
    mode: _buildingAuthorityMode,
    hostLayerPresent: false,
    hostLayerSuppressible: false,
    editableDataAuthorityActive: false,
    editableVisualIsolationAchieved: false,
    importedBuildingsBypassedAsAuthority: false,
    importedVisualContaminationLikely: false,
    truePerBuildingSuppressionAvailable: false,
    visualAuthorityState: 'ERROR',
    warning: null,
    lastCheckedAt: Date.now(),
    lastError: null,
  };

  try {
    if (!map) throw new Error('map_not_available');

    var hostStatus = hostBuildingAuthorityStatus();
    var contamination = _detectImportedBuildingContamination(map);
    var isolation = _computeEditableVisualIsolationStatus(
      map,
      hostStatus,
      contamination,
      _editableBuildingBypassState
    );

    result.hostLayerPresent = !!hostStatus.hostLayerPresent;
    result.hostLayerSuppressible = !!(
      hostStatus.discoveredByProjectionRuntime &&
      hostStatus.suppressionStrategy === 'extrusion-height-suppression'
    );
    result.editableDataAuthorityActive = isolation.editableDataAuthorityActive;
    result.editableVisualIsolationAchieved = isolation.editableVisualIsolationAchieved;
    result.importedBuildingsBypassedAsAuthority = isolation.importedBuildingsBypassedAsAuthority;
    result.importedVisualContaminationLikely = isolation.importedVisualContaminationLikely;
    result.truePerBuildingSuppressionAvailable = isolation.truePerBuildingSuppressionAvailable;
    result.visualAuthorityState = isolation.visualAuthorityState;
    result.warning = isolation.warning;
    result.lastError = isolation.lastError;
  } catch (e) {
    result.lastError = String(e && e.message || e);
    result.visualAuthorityState = 'ERROR';
    result.warning = 'Editable visual isolation status failed.';
  }

  _editableVisualIsolationState.editableDataAuthorityActive = result.editableDataAuthorityActive;
  _editableVisualIsolationState.editableVisualIsolationAchieved = result.editableVisualIsolationAchieved;
  _editableVisualIsolationState.importedBuildingsBypassedAsAuthority = result.importedBuildingsBypassedAsAuthority;
  _editableVisualIsolationState.importedVisualContaminationLikely = result.importedVisualContaminationLikely;
  _editableVisualIsolationState.truePerBuildingSuppressionAvailable = result.truePerBuildingSuppressionAvailable;
  _editableVisualIsolationState.visualAuthorityState = result.visualAuthorityState;
  _editableVisualIsolationState.lastCheckedAt = result.lastCheckedAt;
  _editableVisualIsolationState.lastError = result.lastError;

  console.log('[BuildingEditProjectionRuntime] editableVisualIsolationStatus:', JSON.stringify(result, null, 2));
  return result;
}
```

---

## Export Wiring

Add to frozen runtime export:

```js
editableVisualIsolationStatus: editableVisualIsolationStatus,
```

Add to `_wos.debug.buildingEdits`:

```js
global._wos.debug.buildingEdits.editableVisualIsolationStatus = editableVisualIsolationStatus;
```

Add global shortcut:

```js
global.editableVisualIsolationStatus = editableVisualIsolationStatus;
```

Required call forms:

```js
editableVisualIsolationStatus()
_wos.debug.buildingEdits.editableVisualIsolationStatus()
SBE.BuildingEditProjectionRuntime.editableVisualIsolationStatus()
```

---

## Status Naming Rules

### Keep

```txt
importedBuildingsBypassedAsAuthority
importedVisualContaminationLikely
```

These are different facts and must remain separate.

### Add

```txt
editableDataAuthorityActive
editableVisualIsolationAchieved
```

### Retire from editable-mode branch

Do not emit as a primary visual state anymore:

```txt
EDITABLE_BUILDING_HOST_AUTHORITY_ACTIVE
```

It is too vague and too optimistic.

---

## Visual Authority States

| State | Meaning |
|---|---|
| `EDITABLE_BUILDING_HOST_LAYER_UNAVAILABLE` | Host layer missing; editable mode cannot operate |
| `EDITABLE_BUILDING_HOST_LAYER_NOT_SUPPRESSIBLE` | Host layer exists but cannot be height/base suppressed |
| `EDITABLE_BUILDING_IMPORT_NOT_BYPASSED_AS_AUTHORITY` | Host works, but import has not been marked non-authoritative |
| `EDITABLE_BUILDING_AUTHORITY_ACTIVE_BUT_VISUALLY_CONTAMINATED` | WOS host layer is editable, but imported buildings may still show visually |
| `EDITABLE_BUILDING_VISUAL_ISOLATION_ACTIVE` | Clean editable mode: only WOS-owned building layer is visually authoritative |
| `ERROR` | Status failed |

---

## Acceptance Tests

### T1 — Standard mode remains honest

```js
setBuildingAuthorityMode('standard-import-mode')
buildingAuthorityStatus()
```

Expected:

```js
{
  mode: 'standard-import-mode',
  truePerBuildingSuppressionAvailable: false
}
```

---

### T2 — Editable mode with contamination does not claim true suppression

```js
setBuildingAuthorityMode('editable-building-mode')
editableVisualIsolationStatus()
```

If `importedVisualContaminationLikely === true`, expected:

```js
{
  editableDataAuthorityActive: true,
  editableVisualIsolationAchieved: false,
  truePerBuildingSuppressionAvailable: false,
  visualAuthorityState: 'EDITABLE_BUILDING_AUTHORITY_ACTIVE_BUT_VISUALLY_CONTAMINATED'
}
```

---

### T3 — Editable mode without contamination claims visual isolation

If runtime detects no imported contamination:

```js
editableVisualIsolationStatus()
```

Expected:

```js
{
  editableDataAuthorityActive: true,
  editableVisualIsolationAchieved: true,
  truePerBuildingSuppressionAvailable: true,
  visualAuthorityState: 'EDITABLE_BUILDING_VISUAL_ISOLATION_ACTIVE'
}
```

---

### T4 — `buildingAuthorityStatus()` mirrors isolation result

```js
var a = buildingAuthorityStatus()
var b = editableVisualIsolationStatus()
```

Expected:

```js
a.truePerBuildingSuppressionAvailable === b.truePerBuildingSuppressionAvailable
a.visualAuthorityState === b.visualAuthorityState
```

---

### T5 — Existing bypass state preserved

```js
editableBuildingBypassStatus()
```

Expected fields still exist:

```js
{
  importBypassedAsAuthority: true,
  importedVisualContaminationLikely: true | false
}
```

---

### T6 — No unrelated files modified

Expected changed file list:

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

Only one file.

---

## Non-Goals

This spec does **not** remove imported Mapbox Standard buildings.

This spec does **not** solve the final visual contamination problem.

This spec makes the runtime honest so the next architectural patch can decide whether to:

```txt
A. replace the Standard import
B. use a custom local basemap
C. create a no-building cinematic style
D. accept Standard import mode as non-editable
```

---

## Claude Implementation Notes

- Do not touch suppression expressions.
- Do not modify `_apply()` except where status needs to be recomputed.
- Do not remove 0611S bypass logic.
- Do not rename existing public functions.
- Add new status method; do not overload `editableBuildingBypassStatus()`.
- Keep warnings clear: WOS can suppress host-owned buildings, but imported Standard buildings may still visually remain.

---

## Implementation Guide

- **Where:** Patch `wall/systems/presentation/buildingEditProjectionRuntime.js`; add the helper near 0611S authority helpers, patch `buildingAuthorityStatus()`, add `editableVisualIsolationStatus()`, and wire exports near existing debug exports.
- **What:** Reload Wall, then run `setBuildingAuthorityMode('editable-building-mode')`, `buildingAuthorityStatus()`, and `editableVisualIsolationStatus()` in the console.
- **Expect:** If imported contamination is likely, status returns `EDITABLE_BUILDING_AUTHORITY_ACTIVE_BUT_VISUALLY_CONTAMINATED` and `truePerBuildingSuppressionAvailable: false`; it must not claim clean visual isolation.
