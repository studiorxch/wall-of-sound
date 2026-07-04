# 0611U_WOS_EditableModeVisualIsolationResolution_v1.0.0_BUILD

## Purpose

Resolve the remaining editable-mode visual contamination after `0611T`.

`0611T` correctly separated three facts:

```txt
editableDataAuthorityActive
editableVisualIsolationAchieved
truePerBuildingSuppressionAvailable
```

The current runtime can own and suppress `wos-host-buildings-3d`, but imported Mapbox Standard buildings may still render visually. This spec adds a deterministic resolution audit that attempts safe visual-isolation strategies and returns a final architecture decision.

This is not another semantic-status patch. It must either prove clean editable visual isolation or explicitly report that clean editable mode is not possible while using the current Standard import.

---

## Assumptions

- File target: `wall/systems/presentation/buildingEditProjectionRuntime.js`.
- Current baseline: `BuildingEditProjectionRuntime v1.17.0`.
- Existing public APIs remain intact:
  - `buildingAuthorityStatus()`
  - `editableVisualIsolationStatus()`
  - `hostBuildingAuthorityStatus()`
  - `setBuildingAuthorityMode(mode)`
- Existing host layer remains authoritative when available:
  - `wos-host-buildings-3d`
- Existing replacement layers remain untouched:
  - `wos-replacement-*`
- This spec does **not** modify Studio, Canvas, Glyph, Actor Library, or replacement geometry.

---

## Problem

Editable mode now reports honestly:

```txt
EDITABLE_BUILDING_AUTHORITY_ACTIVE_BUT_VISUALLY_CONTAMINATED
```

This means:

```txt
WOS host-owned buildings are editable,
but imported Standard buildings may still render visually.
```

That state is useful diagnostically, but not sufficient for production. WOS needs a runtime method that attempts visual isolation and returns a definitive answer:

```txt
Clean editable visual isolation is possible
```

or:

```txt
Clean editable visual isolation is not possible with this Standard import
```

---

## Build Scope

Modify only:

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

Add one public debug method:

```js
resolveEditableVisualIsolation(options?)
```

Expose it at all existing debug surfaces:

```js
resolveEditableVisualIsolation()
_wos.debug.buildingEdits.resolveEditableVisualIsolation()
SBE.BuildingEditProjectionRuntime.resolveEditableVisualIsolation()
```

---

## Public API

### `resolveEditableVisualIsolation(options?)`

Async function. Returns a Promise.

```js
await resolveEditableVisualIsolation()
```

Optional options:

```js
{
  testStyleReload: false,
  destructive: false,
  waitMs: 1000
}
```

Defaults:

```js
{
  testStyleReload: false,
  destructive: false,
  waitMs: 1000
}
```

### Safety Rules

- Default mode is non-destructive.
- Style reload tests run only when both are true:

```js
options.testStyleReload === true
options.destructive === true
```

- If destructive style reload is skipped, report it explicitly.
- Never mutate localStorage.
- Never modify replacement actor geometry.
- Never claim clean visual isolation unless the final status proves it.

---

## Resolution Strategies

Run strategies in order.

### Strategy A — Standard Import Config Reload Test

Purpose: test whether imported 3D buildings can be disabled by modifying the Standard import config before style reload.

Only run when:

```js
options.testStyleReload === true && options.destructive === true
```

Steps:

1. Clone `map.getStyle()` as `originalStyle`.
2. Clone again as `candidateStyle`.
3. In every `candidateStyle.imports[].config`, set known 3D/building keys false:

```js
show3dBuildings: false
show3dFacades: false
show3dObjects: false
show3dLandmarks: false
showIndoor: false
show3dTrees: false
```

4. Call `map.setStyle(candidateStyle)`.
5. Await `style.load`, then wait `options.waitMs`.
6. Re-run convergence chain:

```js
_ensureHostBuildingLayer(map)
_discoverLayers(map)
_apply(map)
_ensureReplacementAboveHostLayer(map)
```

7. Evaluate visual isolation.
8. Restore `originalStyle` unless `options.keepCandidateStyle === true`.
9. Re-run convergence chain after restore.

Pass condition:

```txt
editableVisualIsolationStatus().editableVisualIsolationAchieved === true
```

Failure classification:

```txt
STANDARD_IMPORT_CONFIG_RELOAD_INEFFECTIVE
```

---

### Strategy B — Non-3D Basemap Replacement Feasibility

Purpose: determine whether the current Standard import can be replaced with a non-3D basemap while preserving WOS host-owned buildings.

This strategy is audit-only. Do not actually switch production style unless destructive mode is enabled.

Check whether style has:

```js
style.imports[].url
style.sources
style.layers
```

Return recommendation if Standard import remains visually contaminated:

```txt
USE_NON_3D_BASEMAP_PLUS_WOS_HOST_BUILDINGS
```

Suggested candidate basemap architecture:

```txt
Basemap:
- land
- water
- roads
- labels
- atmosphere

WOS:
- host-owned fill-extrusion buildings
- replacement actors
- source suppression
```

Do not hardcode a Mapbox style URL in this patch.

---

### Strategy C — Host-Owned Building-Only Visual Mode

Purpose: validate that the WOS host building layer can provide visible building geometry without relying on imported Standard 3D geometry.

Steps:

1. Ensure `wos-host-buildings-3d` exists.
2. Ensure `_discoverLayers()` accepts it.
3. Ensure query count on host layer is non-negative and preferably greater than `0`:

```js
_queryHostBuildingFeatureCount(map)
```

4. Ensure replacement layer dominance remains true.
5. Report whether WOS can support host-owned building rendering even if imported contamination remains.

Pass condition:

```txt
host layer exists
host layer suppressible
replacement layer above host layer
```

This does **not** prove clean visual isolation. It proves host-owned building authority is operational.

Classification if host layer works but imported contamination remains:

```txt
HOST_BUILDING_AUTHORITY_READY_VISUAL_ISOLATION_BLOCKED
```

---

### Strategy D — Final Fallback

If no strategy achieves clean visual isolation, return:

```txt
VISUAL_ISOLATION_UNRESOLVABLE_WITH_STANDARD_IMPORT
```

This is not a runtime failure. It is an architecture decision:

```txt
Mapbox Standard import cannot be used as the editable-building visual base.
```

Recommended next architecture:

```txt
Replace Standard import for editable mode with a non-3D basemap or custom decomposed style.
Keep Standard import only for cinematic mode.
```

---

## Required Report Shape

`resolveEditableVisualIsolation()` must return:

```js
{
  version: '1.18.0',
  mode: 'editable-building-mode',
  destructiveAllowed: false,
  styleReloadTested: false,
  startedAt: 1710000000000,
  completedAt: 1710000001000,

  before: {
    editableVisualIsolationStatus: {},
    buildingAuthorityStatus: {},
    hostBuildingAuthorityStatus: {},
    pixelProbe: {},
    hostFeatureQueryCount: 0
  },

  strategies: [
    {
      id: 'A',
      name: 'standard-import-config-reload-test',
      attempted: false,
      skippedReason: 'destructive_mode_not_enabled',
      passed: false,
      before: {},
      after: {},
      error: null
    }
  ],

  after: {
    editableVisualIsolationStatus: {},
    buildingAuthorityStatus: {},
    hostBuildingAuthorityStatus: {},
    pixelProbe: {},
    hostFeatureQueryCount: 0
  },

  finalClassification: 'VISUAL_ISOLATION_UNRESOLVABLE_WITH_STANDARD_IMPORT',
  editableVisualIsolationAchieved: false,
  truePerBuildingSuppressionAvailable: false,
  recommendation: {
    mode: 'editable-building-mode',
    architecture: 'NON_3D_BASEMAP_PLUS_WOS_HOST_BUILDINGS',
    nextPatchId: '0611V_WOS_EditableModeNon3DBasemapAuthority_v1.0.0_BUILD',
    rationale: 'Imported Mapbox Standard buildings remain visually uncontrollable; WOS host building layer works but cannot visually isolate while Standard 3D remains.'
  },

  lastError: null
}
```

---

## Pixel Probe

Add a private helper:

```js
_sampleVisualIsolationPixel(map)
```

Use the same pattern already proven in previous audits:

```js
map.triggerRepaint()
map.once('render', function () {
  gl.readPixels(...)
})
```

Probe location priority:

1. First hidden/replacement building geometry centroid from manifest.
2. Screen center.

Return:

```js
{
  x,
  y,
  rgba: { r, g, b, a },
  allZero,
  source: 'manifest-building' | 'screen-center',
  error: null
}
```

Pixel probe is diagnostic only. It must not be the only pass/fail signal.

---

## Internal Helpers

Add:

```js
_waitMs(ms)
_waitForStyleLoad(map, timeoutMs)
_captureIsolationSnapshot(map)
_sampleVisualIsolationPixel(map)
_restoreStyleAndReapply(map, originalStyle)
```

### `_captureIsolationSnapshot(map)`

Returns:

```js
{
  editableVisualIsolationStatus: editableVisualIsolationStatus(),
  buildingAuthorityStatus: buildingAuthorityStatus(),
  hostBuildingAuthorityStatus: hostBuildingAuthorityStatus(),
  pixelProbe: await _sampleVisualIsolationPixel(map),
  hostFeatureQueryCount: _queryHostBuildingFeatureCount(map)
}
```

Because it uses pixel sampling, this helper should be async.

---

## Version Bump

Update:

```js
var VERSION = '1.18.0';
```

Header:

```js
// ── BuildingEditProjectionRuntime v1.18.0 ────────────────────────────────────
// 0611U_WOS_EditableModeVisualIsolationResolution_v1.0.0_BUILD
// Prior: 0611T_WOS_EditableModeVisualSourceIsolation_v1.0.0_BUILD
```

---

## Console Logging

At completion, log:

```txt
[BuildingEditProjectionRuntime] resolveEditableVisualIsolation CLASSIFICATION: ...
[BuildingEditProjectionRuntime] resolveEditableVisualIsolation RECOMMENDATION: ...
```

If final classification is unresolved, warn:

```txt
Editable building mode cannot achieve clean visual isolation while the current Mapbox Standard import remains active.
```

---

## Acceptance Tests

### T1 — Public API exists

```js
typeof resolveEditableVisualIsolation
// 'function'

typeof _wos.debug.buildingEdits.resolveEditableVisualIsolation
// 'function'

typeof SBE.BuildingEditProjectionRuntime.resolveEditableVisualIsolation
// 'function'
```

### T2 — Default call is safe

```js
await resolveEditableVisualIsolation()
```

Expected:

```txt
styleReloadTested: false
no map.setStyle call
no localStorage mutation
```

### T3 — Does not falsely claim clean authority

If imported contamination remains:

```txt
editableVisualIsolationAchieved: false
truePerBuildingSuppressionAvailable: false
finalClassification: VISUAL_ISOLATION_UNRESOLVABLE_WITH_STANDARD_IMPORT
```

### T4 — Host authority still works

Expected:

```txt
host layer present
host layer suppressible
replacement above host layer
```

### T5 — Destructive test is opt-in only

```js
await resolveEditableVisualIsolation({ testStyleReload: true })
```

Expected:

```txt
style reload skipped unless destructive: true is also provided
```

### T6 — Destructive style reload restores original style

```js
await resolveEditableVisualIsolation({ testStyleReload: true, destructive: true })
```

Expected:

```txt
original style restored unless keepCandidateStyle is explicitly true
host layer re-established
suppression re-applied
```

### T7 — Clean visual isolation only when proven

If a strategy works:

```txt
editableVisualIsolationStatus().visualAuthorityState === 'EDITABLE_BUILDING_VISUAL_ISOLATION_ACTIVE'
truePerBuildingSuppressionAvailable === true
```

### T8 — No unrelated systems changed

No modifications to:

```txt
Studio
Canvas
Glyph
buildingReplacementRuntime.js
buildingStyleKit.js
Actor Library
```

---

## Implementation Guide

- **Where**: Patch only `wall/systems/presentation/buildingEditProjectionRuntime.js`; add helpers near the existing 0611T editable visual isolation section and export the public method in the frozen API/global shortcut block.
- **What**: Run the Wall app, then execute `await resolveEditableVisualIsolation()` in the Wall console; optionally run `await resolveEditableVisualIsolation({ testStyleReload: true, destructive: true })` for the style-reload test.
- **Expect**: The method returns either clean `EDITABLE_BUILDING_VISUAL_ISOLATION_ACTIVE` or the explicit final classification `VISUAL_ISOLATION_UNRESOLVABLE_WITH_STANDARD_IMPORT` with next architecture recommendation.
