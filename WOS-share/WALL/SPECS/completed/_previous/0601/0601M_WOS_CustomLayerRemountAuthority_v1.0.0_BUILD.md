---
title: "0601M_WOS_CustomLayerRemountAuthority_v1.0.0_BUILD"
date: 2026-06-02
project: "Wall of Sound"
system: "WOS"
domain: "rendering"
component: "WorldSpaceVehicleLayer"
type: "implementation-patch"
status: "BUILD"
classification: "render-layer"
priority: "high"
risk: "medium"
summary: "Fix stale Mapbox custom-layer registration after style reloads by verifying real Mapbox layer presence instead of trusting the internal _layerAdded flag."
---

# 0601M_WOS_CustomLayerRemountAuthority_v1.0.0_BUILD

## Purpose

Fix the current 0601L diagnosis:

```txt
renderPassCount = 0
meshCount = 3
sceneCount = 3
```

This proves vehicles and scenes exist, transforms work, and screen projection works, but Mapbox is not invoking the custom layer `render()` callback.

The likely cause is stale custom-layer registration after a Mapbox style reload or style publish. Mapbox can drop custom layers while WSL still reports `_layerAdded = true`.

This patch makes custom-layer mounting authoritative by checking Mapbox directly with `map.getLayer(LAYER_ID)`.

---

# Build Status

```txt
[BUILD]
```

Send this patch to Claude/Codex.

---

# Environmental Assumptions

- File target: `wall/systems/render/worldSpaceVehicleLayer.js`
- Existing layer constant: `LAYER_ID = 'wos-world-space-vehicles'`
- Existing custom layer object: `_customLayer`
- Existing state flags: `_map`, `_layerAdded`, `_active`, `_enabled`, `_renderer`, `_camera`, `_scene`
- Mapbox runtime is accessible through `SBE.MapboxViewportRuntime.getMap()`
- 0601L render-pass audit is already installed

---

# Current Failure

0601L proved:

```txt
renderPassCount: 0
meshCount: 3
sceneCount: 3
lastRenderObjectCount: 0
```

Interpretation:

```txt
WSL objects exist.
WSL scenes exist.
Transforms exist.
Projection exists.
Mapbox is not calling custom layer render().
```

This means `_layerAdded` is no longer sufficient as truth.

---

# Patch A — Add Real Layer Mount Check

Add near the `start()` function, before `start()`:

```js
function _isLayerMounted() {
  try {
    return !!(
      _map &&
      typeof _map.getLayer === 'function' &&
      _map.getLayer(LAYER_ID)
    );
  } catch (e) {
    return false;
  }
}
```

Why:

- `_layerAdded` is internal memory.
- `map.getLayer(LAYER_ID)` is Mapbox truth.
- Style reloads can erase the custom layer without resetting `_layerAdded`.

---

# Patch B — Harden `start()` Against Stale `_layerAdded`

Replace the existing add-layer guard:

```js
if (!_layerAdded) {
  try {
    _map.addLayer(_customLayer);
  } catch (e) {
    console.warn('[WorldSpaceVehicleLayer] addLayer failed:', e.message);
    return false;
  }
}
```

with:

```js
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

Why:

- If Mapbox dropped the custom layer, WSL must re-add it.
- If Mapbox still has the custom layer, WSL should sync `_layerAdded = true`.
- This prevents stale internal state from blocking remount.

---

# Patch C — Add Style Reload Remount Handler

Add this helper near `_autoStart()`:

```js
var _styleRemountBound = false;

function _bindStyleRemount(map) {
  if (!map || _styleRemountBound || typeof map.on !== 'function') return;
  _styleRemountBound = true;

  map.on('styledata', function () {
    _layerAdded = false;
    _renderer = null;
    _camera = null;
    _scene = null;

    global.setTimeout(function () {
      if (!_active) return;
      start();
      if (_enabled && Object.keys(_meshes).length) {
        try { map.triggerRepaint(); } catch (e) {}
      }
    }, 100);
  });
}
```

Then in `start()`, after `_map` is resolved and before add-layer logic, add:

```js
_bindStyleRemount(_map);
```

Why:

- Mapbox style changes remove custom layers.
- WSL must remount itself after style data refreshes.
- `_renderer`, `_camera`, and `_scene` must be reset because `onAdd()` will recreate them with the current GL context.

---

# Patch D — Surface Mount Truth in State

Add this to `getState()`:

```js
layerMounted: _isLayerMounted(),
```

Place it near:

```js
layerAdded: _layerAdded,
```

Recommended result:

```js
layerAdded:     _layerAdded,
layerMounted:   _isLayerMounted(),
```

Also add to `getTransformState()`:

```js
layerMounted: _isLayerMounted(),
```

Why:

- `layerAdded` = internal flag.
- `layerMounted` = Mapbox truth.
- Debug output must expose both so stale-state failures are visible immediately.

---

# Patch E — Debug Output Update

In `worldSpaceVehicleDebug.js`, update `state()` to print:

```js
console.log('layerAdded     :', s.layerAdded, '| mounted:', s.layerMounted);
```

Replace the existing line:

```js
console.log('layerAdded     :', s.layerAdded);
```

Optional: update `renderPassState()` to include `layerMounted` if exposed by `getRenderPassState()`.

---

# Patch F — Optional RenderPass State Extension

In `getRenderPassState()`, add:

```js
layerAdded: _layerAdded,
layerMounted: _isLayerMounted(),
```

Then in debug `renderPassState()`, print:

```js
console.log('layerAdded             :', s.layerAdded, '| mounted:', s.layerMounted);
```

Why:

If `renderPassCount === 0`, this immediately distinguishes:

```txt
layerMounted = false → custom layer missing from Mapbox
layerMounted = true  → Mapbox has layer but is not invoking render
```

---

# Patch G — Version Bump

Update:

```js
var VERSION = '1.8.0';
```

To:

```js
var VERSION = '1.9.0';
```

---

# Validation Commands

Run in console after reload:

```js
_wos.debug.worldVehicles.transformCompare()

setTimeout(() => {
  _wos.debug.worldVehicles.renderPassState()
  _wos.debug.worldVehicles.renderTruth()
  _wos.debug.worldVehicles.state()
}, 1000)
```

---

# Expected Output

Success condition:

```txt
layerMounted: true
renderPassCount > 0
renderCount > 0
lastRenderObjectCount > 0
renderedCount > 0
```

Then render truth should move from:

```txt
3 transformed, 0 rendered, 3 projected
```

to:

```txt
3 transformed, 3 rendered, 3 projected
```

At that point, proceed to visible primitive validation.

---

# Failure Interpretation

## Case 1

```txt
layerMounted: false
renderPassCount: 0
```

Meaning:

```txt
Custom layer is still not mounted.
```

Fix:

- Audit `start()` addLayer timing.
- Confirm Mapbox style is loaded before addLayer.
- Consider using `map.once('style.load', ...)` instead of only `styledata`.

## Case 2

```txt
layerMounted: true
renderPassCount: 0
```

Meaning:

```txt
Mapbox reports layer mounted but render callback is not firing.
```

Fix:

- Confirm layer type remains `custom`.
- Confirm `renderingMode: '3d'`.
- Confirm no style reload occurs immediately after mount.
- Confirm layer is added to the live map instance, not a stale map reference.

## Case 3

```txt
renderPassCount > 0
renderCount = 0
renderEarlyReturnReason = layer_disabled
```

Meaning:

```txt
Render callback fires but WSL exits because _enabled is false.
```

Fix:

```js
_wos.debug.worldVehicles.enable()
```

## Case 4

```txt
renderPassCount > 0
renderCount > 0
lastRenderObjectCount = 0
lastRenderSkippedCount > 0
```

Meaning:

```txt
Render loop fires but all meshes are skipped.
```

Fix:

- Audit `mesh.visible`
- Audit `_scenes[id]`
- Audit scene attachment after remount

## Case 5

```txt
renderPassCount > 0
lastRenderObjectCount > 0
renderedCount > 0
```

Meaning:

```txt
Render pipeline is proven.
```

Next:

- Run primitive visual proof.
- Only then move to primitive car/truck system.

---

# Non-Goals

This patch does NOT:

- change transform math
- change vehicle geometry
- change actor runtime
- change Mapbox style rules
- create buildings
- add atmospheric systems
- change projection confidence

It only repairs custom-layer mount truth and remount lifecycle.

---

# Implementation Guide

- **Where**: `wall/systems/render/worldSpaceVehicleLayer.js` near `start()`, `_autoStart()`, `getState()`, `getTransformState()`, and `getRenderPassState()`; `wall/systems/presentation/worldSpaceVehicleDebug.js` inside `state()` and optionally `renderPassState()`.
- **What**: Apply patches A–G, then run `node --check wall/systems/render/worldSpaceVehicleLayer.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: `_wos.debug.worldVehicles.renderPassState()` reports `layerMounted: true`, `renderPassCount > 0`, `renderCount > 0`, and `renderTruth()` reports at least one `rendered: yes` object.
