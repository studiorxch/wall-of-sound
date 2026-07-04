# 0601L_WOS_RenderPassAuditPatch_v1.0.0_BUILD

Status: [BUILD]  
Project: Wall of Sound  
Target: `wall/systems/render/worldSpaceVehicleLayer.js`  
Purpose: Prove whether the Mapbox custom-layer render callback is firing, whether meshes are being skipped, or whether render bookkeeping is attached to the wrong object.

---

## Environmental Assumptions

- `worldSpaceVehicleLayer.js` is currently at or near `VERSION = '1.7.0'`.
- `WorldSpaceVehicleDebug` already exposes:
  - `_wos.debug.worldVehicles.state()`
  - `_wos.debug.worldVehicles.transformCompare()`
  - `_wos.debug.worldVehicles.renderTruth()`
- The current known truth state is:
  - `active=true`
  - `enabled=true`
  - `layerAdded=true`
  - `renderReady=true`
  - `vehicleCount > 0`
  - `transformed=true`
  - `projected=true`
  - `rendered=false`

---

# Patch A — Add Render Pass Audit State

## File

`wall/systems/render/worldSpaceVehicleLayer.js`

## Location

Near the existing render state block:

```js
var _renderCount        = 0;
var _lastRenderAt       = 0;
```

## Add

```js
// ── Render pass audit (0601L) ─────────────────────────────────────────────────
// Tracks whether Mapbox is actually invoking the custom layer render callback,
// even when the callback exits early before per-mesh rendering.
var _renderPassCount          = 0;
var _lastRenderPassAt         = 0;
var _renderEarlyReturnReason  = null;
var _lastRenderAuditSnapshot  = null;
```

---

# Patch B — Instrument the Render Callback Before Early Returns

## File

`wall/systems/render/worldSpaceVehicleLayer.js`

## Location

Inside:

```js
render: function (gl, matrix) {
```

## Replace the first guard block

Find:

```js
render: function (gl, matrix) {
  if (!_enabled || !_renderer || !_camera) return;
  var THREE = global.THREE;
  if (!THREE || !matrix) return;

  _renderCount += 1;
  _lastRenderAt = Date.now();
```

Replace with:

```js
render: function (gl, matrix) {
  _renderPassCount += 1;
  _lastRenderPassAt = Date.now();

  if (!_enabled) {
    _renderEarlyReturnReason = 'layer_disabled';
    _lastRenderAuditSnapshot = {
      timestamp: _lastRenderPassAt,
      reason: _renderEarlyReturnReason,
      enabled: _enabled,
      hasRenderer: !!_renderer,
      hasCamera: !!_camera,
      hasThree: !!global.THREE,
      hasMatrix: !!matrix,
      meshCount: Object.keys(_meshes).length,
      sceneCount: Object.keys(_scenes).length,
    };
    return;
  }

  if (!_renderer || !_camera) {
    _renderEarlyReturnReason = 'renderer_or_camera_missing';
    _lastRenderAuditSnapshot = {
      timestamp: _lastRenderPassAt,
      reason: _renderEarlyReturnReason,
      enabled: _enabled,
      hasRenderer: !!_renderer,
      hasCamera: !!_camera,
      hasThree: !!global.THREE,
      hasMatrix: !!matrix,
      meshCount: Object.keys(_meshes).length,
      sceneCount: Object.keys(_scenes).length,
    };
    return;
  }

  var THREE = global.THREE;
  if (!THREE || !matrix) {
    _renderEarlyReturnReason = 'three_or_matrix_missing';
    _lastRenderAuditSnapshot = {
      timestamp: _lastRenderPassAt,
      reason: _renderEarlyReturnReason,
      enabled: _enabled,
      hasRenderer: !!_renderer,
      hasCamera: !!_camera,
      hasThree: !!THREE,
      hasMatrix: !!matrix,
      meshCount: Object.keys(_meshes).length,
      sceneCount: Object.keys(_scenes).length,
    };
    return;
  }

  _renderEarlyReturnReason = null;
  _lastRenderAuditSnapshot = {
    timestamp: _lastRenderPassAt,
    reason: null,
    enabled: _enabled,
    hasRenderer: !!_renderer,
    hasCamera: !!_camera,
    hasThree: !!THREE,
    hasMatrix: !!matrix,
    meshCount: Object.keys(_meshes).length,
    sceneCount: Object.keys(_scenes).length,
  };

  _renderCount += 1;
  _lastRenderAt = Date.now();
```

---

# Patch C — Add Render Audit Accessor

## File

`wall/systems/render/worldSpaceVehicleLayer.js`

## Location

Near `getTransformState()` or before `getRenderTruth()`.

## Add

```js
function getRenderPassState() {
  return {
    renderPassCount: _renderPassCount,
    lastRenderPassAt: _lastRenderPassAt,
    renderCount: _renderCount,
    lastRenderAt: _lastRenderAt,
    renderEarlyReturnReason: _renderEarlyReturnReason,
    lastRenderAuditSnapshot: _lastRenderAuditSnapshot,
    lastRenderObjectCount: _lastRenderObjectCount,
    lastRenderSkippedCount: _lastRenderSkippedCount,
    lastRenderedVehicleId: _lastRenderedVehicleId,
    meshCount: Object.keys(_meshes).length,
    sceneCount: Object.keys(_scenes).length,
  };
}
```

---

# Patch D — Expose Render Audit in State

## File

`wall/systems/render/worldSpaceVehicleLayer.js`

## Location

Inside `getTransformState()` return object.

## Add

```js
renderPassCount:          _renderPassCount,
lastRenderPassAt:         _lastRenderPassAt,
renderEarlyReturnReason:  _renderEarlyReturnReason,
lastRenderAuditSnapshot:  _lastRenderAuditSnapshot,
```

Recommended nearby placement:

```js
renderCount:        _renderCount,
lastRenderAt:       _lastRenderAt,
renderPassCount:          _renderPassCount,
lastRenderPassAt:         _lastRenderPassAt,
renderEarlyReturnReason:  _renderEarlyReturnReason,
lastRenderAuditSnapshot:  _lastRenderAuditSnapshot,
lastRenderedVehicleId:  _lastRenderedVehicleId,
```

---

## Location

Inside `getState()` return object.

## Add

```js
renderPassCount:          _renderPassCount,
lastRenderPassAt:         _lastRenderPassAt,
renderEarlyReturnReason:  _renderEarlyReturnReason,
lastRenderAuditSnapshot:  _lastRenderAuditSnapshot,
```

Recommended nearby placement:

```js
renderCount:    _renderCount,
lastRenderAt:           _lastRenderAt,
renderPassCount:          _renderPassCount,
lastRenderPassAt:         _lastRenderPassAt,
renderEarlyReturnReason:  _renderEarlyReturnReason,
lastRenderAuditSnapshot:  _lastRenderAuditSnapshot,
lastRenderedVehicleId:  _lastRenderedVehicleId,
```

---

# Patch E — Export the Accessor

## File

`wall/systems/render/worldSpaceVehicleLayer.js`

## Location

Inside `SBE.WorldSpaceVehicleLayer = Object.freeze({ ... })`

## Add

```js
getRenderPassState:      getRenderPassState,
```

Recommended nearby placement:

```js
getTransformState:       getTransformState,
getRenderPassState:      getRenderPassState,
getRenderTruth:          getRenderTruth,
```

---

# Patch F — Add Debug Console API

## File

`wall/systems/presentation/worldSpaceVehicleDebug.js`

## Location

Inside `_debugObj`, near `transformState()` or before `renderTruth()`.

## Add

```js
renderPassState: function () {
  var wsl = _wsl();
  if (!wsl || typeof wsl.getRenderPassState !== 'function') {
    console.warn('[worldVehicles] renderPassState unavailable'); return null;
  }

  var s = wsl.getRenderPassState();
  console.group('[worldVehicles] renderPassState()');
  console.log('renderPassCount         :', s.renderPassCount);
  console.log('lastRenderPassAt        :', s.lastRenderPassAt ? new Date(s.lastRenderPassAt).toLocaleTimeString() : '—');
  console.log('renderCount             :', s.renderCount);
  console.log('lastRenderAt            :', s.lastRenderAt ? new Date(s.lastRenderAt).toLocaleTimeString() : '—');
  console.log('renderEarlyReturnReason :', s.renderEarlyReturnReason || '—');
  console.log('meshCount               :', s.meshCount);
  console.log('sceneCount              :', s.sceneCount);
  console.log('lastRenderObjectCount   :', s.lastRenderObjectCount);
  console.log('lastRenderSkippedCount  :', s.lastRenderSkippedCount);
  console.log('lastRenderedVehicleId   :', s.lastRenderedVehicleId || '—');
  if (s.lastRenderAuditSnapshot) console.log('auditSnapshot           :', s.lastRenderAuditSnapshot);
  console.groupEnd();

  return s;
},
```

---

# Patch G — Optional State Output Convenience

## File

`wall/systems/presentation/worldSpaceVehicleDebug.js`

## Location

Inside `state()` after:

```js
console.log('transformMode  :', s.transformMode, '| valid:', s.transformValid, '| renders:', s.renderCount);
```

## Add

```js
console.log('renderPasses   :', s.renderPassCount || 0,
  '| earlyReturn:', s.renderEarlyReturnReason || '—');
```

---

# Patch H — Version Bump

## File

`wall/systems/render/worldSpaceVehicleLayer.js`

Replace:

```js
var VERSION = '1.7.0';
```

With:

```js
var VERSION = '1.8.0';
```

---

# Validation Commands

Run in browser console after reload:

```js
_wos.debug.worldVehicles.transformCompare()

setTimeout(() => {
  _wos.debug.worldVehicles.state()
  _wos.debug.worldVehicles.renderPassState()
  _wos.debug.worldVehicles.renderTruth()
}, 1000)
```

---

# Decision Table

## Case 1

```txt
renderPassCount = 0
```

Meaning:

```txt
Mapbox custom layer render callback is not firing.
```

Next action:

```txt
Inspect layer registration, addLayer timing, style reload behavior, and Mapbox custom layer lifecycle.
```

---

## Case 2

```txt
renderPassCount > 0
renderCount = 0
renderEarlyReturnReason != null
```

Meaning:

```txt
Mapbox calls render, but WSL exits before render work begins.
```

Next action:

```txt
Fix the reported early return reason.
```

---

## Case 3

```txt
renderPassCount > 0
renderCount > 0
lastRenderObjectCount = 0
lastRenderSkippedCount > 0
```

Meaning:

```txt
Render callback runs, but every mesh is skipped.
```

Next action:

```txt
Audit mesh.visible, scene existence, and per-object scene attachment.
```

---

## Case 4

```txt
renderPassCount > 0
renderCount > 0
lastRenderObjectCount > 0
rendered=false
```

Meaning:

```txt
renderer.render(scene, camera) is running, but render truth stamping is inspecting the wrong object or overwritten mesh reference.
```

Next action:

```txt
Audit _meshes[id], _scenes[id], scene.children, mesh replacement, and stamp location.
```

---

## Case 5

```txt
renderPassCount > 0
renderCount > 0
lastRenderObjectCount > 0
rendered=true
projected=true
```

Meaning:

```txt
Render truth is proven enough to return to visible cube / primitive vehicle proof.
```

Next action:

```txt
Proceed to visible cube confirmation before buildings.
```

---

# Implementation Guide

- **Where**: Apply patches in `wall/systems/render/worldSpaceVehicleLayer.js` around the render state block, custom layer `render()` callback, `getTransformState()`, `getState()`, and export object; apply debug patch in `wall/systems/presentation/worldSpaceVehicleDebug.js` inside `_debugObj`.
- **What**: Reload the browser, then run `_wos.debug.worldVehicles.transformCompare(); setTimeout(() => { _wos.debug.worldVehicles.state(); _wos.debug.worldVehicles.renderPassState(); _wos.debug.worldVehicles.renderTruth(); }, 1000);`
- **Expect**: One of five outcomes: render callback not firing, early return, skipped meshes, wrong render stamp target, or successful render truth.
