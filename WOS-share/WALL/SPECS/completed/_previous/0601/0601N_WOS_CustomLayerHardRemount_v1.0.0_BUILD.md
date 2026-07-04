---
title: "0601N_WOS_CustomLayerHardRemount_v1.0.0_BUILD"
date: 2026-06-02
project: "Wall of Sound"
system: "WOS"
domain: "rendering"
component: "WorldSpaceVehicleLayer"
type: "implementation-patch"
status: "[BUILD]"
priority: "high"
risk: "medium"
classification: "render-layer"
summary: "Hard-remount Mapbox custom vehicle layer when Mapbox reports a mounted layer but render() never fires. Adds forced repaint hooks so render-pass truth can advance from mounted-only to rendered."
---

# 0601N_WOS_CustomLayerHardRemount_v1.0.0_BUILD

## Build Status

`[BUILD]`

## Purpose

Fix the post-0601M failure state:

```txt
layerAdded: true
layerMounted: true
renderPassCount: 0
meshCount: 0
sceneCount: 0
```

0601M correctly moved mount truth from internal memory to Mapbox `map.getLayer(LAYER_ID)`, but the runtime can still land in a state where Mapbox reports the custom layer as mounted while its `render()` callback never fires.

0601N adds a hard remount path:

```txt
removeLayer → reset renderer state → addLayer → triggerRepaint
```

This forces Mapbox to execute `onAdd()` again and recreate the Three renderer, camera, and scene.

---

# Environmental Assumptions

- `worldSpaceVehicleLayer.js` is already at 0601M / v1.9.0.
- `worldSpaceVehicleDebug.js` already exposes `renderPassState()`.
- Mapbox GL JS custom layer lifecycle is active.
- `SBE.MapboxViewportRuntime.getMap()` returns the live Mapbox map.
- `global.THREE` is loaded before `worldSpaceVehicleLayer.js`.

---

# Patch Target

```txt
wall/systems/render/worldSpaceVehicleLayer.js
```

No patch is required for `worldSpaceVehicleDebug.js` unless you want an optional hard-remount console command later.

---

# Patch A — Add Hard Remount State

Place near the existing `_styleRemountBound` variable.

```js
// 0601N — hard remount audit state
var _lastHardRemountAt = 0;
var _lastHardRemountReason = null;
var _lastHardRemountResult = null;
var _hardRemountInFlight = false;
```

---

# Patch B — Add `_resetRenderLayerRuntime()`

Place near `_isLayerMounted()`.

```js
function _resetRenderLayerRuntime() {
  if (_renderer) {
    try { _renderer.dispose(); } catch (e) {}
  }

  _renderer = null;
  _camera = null;
  _scene = null;
  _layerAdded = false;

  // Preserve _meshes, _scenes, and _vehicles. Existing meshes are re-attached
  // by onAdd() when Mapbox accepts the custom layer again.
}
```

---

# Patch C — Add `_hardRemountLayer(reason)`

Place after `_resetRenderLayerRuntime()`.

```js
function _hardRemountLayer(reason) {
  if (!_map) return false;
  if (_hardRemountInFlight) return false;

  _hardRemountInFlight = true;
  _lastHardRemountAt = Date.now();
  _lastHardRemountReason = reason || 'manual';

  try {
    if (_isLayerMounted()) {
      try { _map.removeLayer(LAYER_ID); } catch (removeErr) {}
    }

    _resetRenderLayerRuntime();

    try {
      _map.addLayer(_customLayer);
      _layerAdded = true;
      _lastHardRemountResult = 'mounted';

      try { _map.triggerRepaint(); } catch (paintErr) {}

      console.log('[WorldSpaceVehicleLayer] hard remount OK — reason:', _lastHardRemountReason,
        '| layerMounted:', _isLayerMounted());

      return true;
    } catch (addErr) {
      _lastHardRemountResult = 'add_failed:' + (addErr && addErr.message ? addErr.message : String(addErr));
      console.warn('[WorldSpaceVehicleLayer] hard remount failed:', addErr && addErr.message ? addErr.message : addErr);
      return false;
    }
  } finally {
    _hardRemountInFlight = false;
  }
}
```

---

# Patch D — Replace `start()` Mount Logic

In `start()`, replace the current mount block:

```js
// Trust Mapbox, not the internal flag. If Mapbox dropped the layer, re-add it.
if (!_isLayerMounted()) {
  _layerAdded = false;
  try {
    _map.addLayer(_customLayer);
  } catch (e) {
    console.warn('[WorldSpaceVehicleLayer] addLayer failed:', e.message);
    return false;
  }
} else {
  _layerAdded = true;
}
```

with:

```js
// Trust Mapbox, not the internal flag. If Mapbox dropped the layer, hard-remount it.
if (!_isLayerMounted()) {
  if (!_hardRemountLayer('start_unmounted')) return false;
} else {
  _layerAdded = true;

  // 0601N: mounted-only is not enough. If Mapbox says the layer exists but
  // onAdd/render state is missing, force a real lifecycle rebuild.
  if (!_renderer || !_camera || !_scene) {
    if (!_hardRemountLayer('start_mounted_missing_renderer')) return false;
  }
}
```

---

# Patch E — Harden `styledata` Remount Handler

In `_bindStyleRemount(map)`, replace the current `styledata` callback body:

```js
_layerAdded = false;
_renderer   = null;
_camera     = null;
_scene      = null;
global.setTimeout(function () {
  if (!_active) return;
  start();
  if (_enabled && Object.keys(_meshes).length) {
    try { map.triggerRepaint(); } catch (e) {}
  }
}, 100);
```

with:

```js
global.setTimeout(function () {
  if (!_active) return;

  // A style publish/setStyle can leave internal state ahead of Mapbox truth.
  // Hard remount ensures onAdd() runs against the current style/GL context.
  _hardRemountLayer('styledata');

  if (_enabled && Object.keys(_meshes).length) {
    try { map.triggerRepaint(); } catch (e) {}
  }
}, 100);
```

---

# Patch F — Force Repaint When Enabled

Replace `setEnabled(v)` with:

```js
function setEnabled(v) {
  _enabled = !!v;

  if (!_enabled) {
    // Hide all meshes without removing them.
    Object.keys(_meshes).forEach(function (id) { _meshes[id].visible = false; });
    return;
  }

  if (_map) {
    try { _map.triggerRepaint(); } catch (e) {}
  }
}
```

---

# Patch G — Force Repaint After Successful Upsert

At the end of `_upsertVehicleInner(v)`, after:

```js
_recordUpsertSuccess(v);
return true;
```

replace with:

```js
_recordUpsertSuccess(v);

if (_map && _enabled) {
  try { _map.triggerRepaint(); } catch (e) {}
}

return true;
```

---

# Patch H — Add Hard Remount Fields to `getRenderPassState()`

In `getRenderPassState()`, add these fields:

```js
lastHardRemountAt:       _lastHardRemountAt,
lastHardRemountReason:   _lastHardRemountReason,
lastHardRemountResult:   _lastHardRemountResult,
hardRemountInFlight:     _hardRemountInFlight,
```

Recommended placement:

```js
return {
  layerAdded:              _layerAdded,
  layerMounted:            _isLayerMounted(),
  lastHardRemountAt:       _lastHardRemountAt,
  lastHardRemountReason:   _lastHardRemountReason,
  lastHardRemountResult:   _lastHardRemountResult,
  hardRemountInFlight:     _hardRemountInFlight,
  renderPassCount:         _renderPassCount,
  ...
};
```

---

# Patch I — Add Fields to `getState()`

In `getState()`, add:

```js
lastHardRemountAt:       _lastHardRemountAt,
lastHardRemountReason:   _lastHardRemountReason,
lastHardRemountResult:   _lastHardRemountResult,
hardRemountInFlight:     _hardRemountInFlight,
```

Place near:

```js
layerAdded:     _layerAdded,
layerMounted:   _isLayerMounted(),
```

---

# Patch J — Export Optional Hard Remount Debug Hook

In the exported `SBE.WorldSpaceVehicleLayer` object, add:

```js
hardRemountLayer: function () { return _hardRemountLayer('manual_debug'); },
```

Recommended placement near `start` / `stop`:

```js
start:          start,
stop:           stop,
hardRemountLayer: function () { return _hardRemountLayer('manual_debug'); },
```

This is optional but useful for console recovery.

---

# Patch K — Optional Debug Command

Target:

```txt
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Add to `_debugObj`:

```js
hardRemount: function () {
  var wsl = _wsl();
  if (!wsl || typeof wsl.hardRemountLayer !== 'function') {
    console.warn('[worldVehicles] hardRemount unavailable');
    return false;
  }
  var ok = wsl.hardRemountLayer();
  console.log('[worldVehicles] hardRemount() →', ok);
  return ok;
},
```

---

# Patch L — Version Bump

In `worldSpaceVehicleLayer.js`:

```js
var VERSION = '1.10.0';
```

If applying optional debug command, bump its banner/comment if desired, but not required.

---

# Validation Commands

After patch and reload:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.renderPassState()
```

If still stalled:

```js
_wos.debug.worldVehicles.hardRemount()
setTimeout(() => _wos.debug.worldVehicles.renderPassState(), 500)
```

Then spawn proof actors:

```js
_wos.debug.worldVehicles.transformCompare()
setTimeout(() => {
  _wos.debug.worldVehicles.renderPassState()
  _wos.debug.worldVehicles.renderTruth()
}, 1000)
```

---

# Expected Output

Minimum acceptable result:

```txt
layerAdded: true
mounted: true
renderPassCount: > 0
renderCount: > 0
```

Green-light result:

```txt
meshCount: > 0
sceneCount: > 0
lastRenderObjectCount: > 0
renderedCount: > 0
projectedOnScreenCount: > 0
```

If this appears:

```txt
renderPassCount > 0
renderEarlyReturnReason: layer_disabled
```

Run:

```js
_wos.debug.worldVehicles.enable()
```

If this appears:

```txt
renderPassCount > 0
lastRenderObjectCount: 0
lastRenderSkippedCount: > 0
```

Next patch is mesh visibility / scene attachment audit.

---

# Non-Goals

0601N does not:

- alter vehicle geometry
- change transform math
- start building actors/buildings
- change Mapbox styles
- replace Mapbox Studio
- mutate route/runtime truth

---

# Implementation Guide

- **Where:** `wall/systems/render/worldSpaceVehicleLayer.js` around the `start()` / `_bindStyleRemount()` / `setEnabled()` / `_upsertVehicleInner()` sections; optional command in `wall/systems/presentation/worldSpaceVehicleDebug.js` inside `_debugObj`.
- **What:** Run `node --check wall/systems/render/worldSpaceVehicleLayer.js` and, if patched, `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; then reload the app and run `_wos.debug.worldVehicles.renderPassState()`.
- **Expect:** `layerMounted: true`, `renderPassCount > 0`, then after `transformCompare()`, `lastRenderObjectCount > 0` and `renderedCount > 0` before proceeding to visible primitive car/truck proof.
