# 0602C_WOS_VehicleLayerEnableTruthAudit_v1.0.0_BUILD

## Build Status

[BUILD]

## Purpose

Add debug-only instrumentation to determine why `WorldSpaceVehicleLayer` becomes disabled while `HeroVehicleRuntime` remains alive.

This patch must establish authoritative enable/render truth before continuing work on hero heading, underpasses, traffic behavior, collision, or grade separation.

---

## Problem

Current diagnostics show contradictory state:

```txt
HeroVehicleRuntime.getEntity() returns a valid hero entity.

But WorldSpaceVehicleLayer reports:

active: true
enabled: false
layerAdded: true
mounted: true
renderReady: false
vehicleCount: 0
heroRuntime: false
renderPasses: 25
earlyReturn: layer disabled
```

This means:

```txt
Hero runtime appears alive.
WorldSpaceVehicleLayer is mounted.
The custom layer render callback is firing.
The layer is intentionally refusing to render because enabled=false.
```

Before fixing hero visibility, heading, traffic, underpasses, or collision, we need to know:

```txt
Who disabled the layer?
When did it happen?
Why did it happen?
```

---

## Scope

This is a forensic instrumentation patch only.

Do not change runtime behavior.
Do not auto-enable anything.
Do not rebuild the hero.
Do not change rendering, transforms, camera, traffic, or grade logic.

---

## Environmental Assumptions

- `worldSpaceVehicleLayer.js` owns the `_enabled` state and render callback early returns.
- `worldSpaceVehicleDebug.js` owns `_wos.debug.worldVehicles.*` console commands.
- `HeroVehicleRuntime.getEntity()` may be available even when `WorldSpaceVehicleLayer` reports `heroRuntime: false`.
- The custom Mapbox layer may be mounted while internally disabled.
- This patch is intended for local browser console validation.

---

# Required Changes

## A — Add Enable/Disable Audit State

In `worldSpaceVehicleLayer.js`, add internal audit state:

```js
var _lastEnableTime = null;
var _lastDisableTime = null;
var _lastEnableCaller = null;
var _lastDisableCaller = null;
var _enableCount = 0;
var _disableCount = 0;

var _earlyReturnCount = 0;
var _lastEarlyReturnReason = null;
var _lastEarlyReturnAt = null;
```

Add helper:

```js
function _captureStack(label) {
  try {
    return new Error(label || 'WorldSpaceVehicleLayer audit').stack || null;
  } catch (e) {
    return null;
  }
}
```

---

## B — Instrument `setEnabled(value)`

Update `setEnabled(value)` so every state transition is recorded.

Required behavior:

```js
function setEnabled(value) {
  var next = !!value;
  var previous = _enabled;

  _enabled = next;

  if (next !== previous) {
    if (next) {
      _enableCount += 1;
      _lastEnableTime = Date.now();
      _lastEnableCaller = _captureStack('WorldSpaceVehicleLayer enabled');
    } else {
      _disableCount += 1;
      _lastDisableTime = Date.now();
      _lastDisableCaller = _captureStack('WorldSpaceVehicleLayer disabled');
    }
  }

  // Preserve existing visibility/repaint behavior exactly as currently implemented.
}
```

Important:

Do not alter current enable/disable behavior beyond audit capture.

---

## C — Instrument Render Early Returns

Where the render callback exits early, record:

```js
function _recordEarlyReturn(reason) {
  _earlyReturnCount += 1;
  _lastEarlyReturnReason = reason || 'unknown';
  _lastEarlyReturnAt = Date.now();
}
```

Every early return must call `_recordEarlyReturn(reason)` before returning.

Expected reasons should include, where applicable:

```txt
layer_disabled
map_unavailable
three_unavailable
matrix_unavailable
renderer_or_camera_missing
not_mounted
registry_unavailable
no_vehicle_scenes
unknown
```

Do not change the early-return conditions.

Only record them.

---

## D — Add Runtime Detection Helper

Add a helper that checks the actual runtime, not only cached debug state:

```js
function _detectHeroRuntime() {
  try {
    return !!(
      global.SBE &&
      global.SBE.HeroVehicleRuntime &&
      typeof global.SBE.HeroVehicleRuntime.getEntity === 'function' &&
      global.SBE.HeroVehicleRuntime.getEntity()
    );
  } catch (e) {
    return false;
  }
}
```

Add equivalent traffic detector if a known traffic runtime exists:

```js
function _detectTrafficRuntime() {
  try {
    return !!(
      global.SBE &&
      global.SBE.TrafficRuntime &&
      typeof global.SBE.TrafficRuntime.getState === 'function'
    );
  } catch (e) {
    return false;
  }
}
```

If no canonical traffic runtime exists, return `false` and do not guess.

---

## E — Add Public Audit Accessors

Export these from `SBE.WorldSpaceVehicleLayer`:

```js
getEnableAudit: function () {
  return {
    active: _active,
    enabled: _enabled,
    layerAdded: _layerAdded,
    layerMounted: _isLayerMounted(),
    renderReady: !!(_renderer && _camera && _scene),
    vehicleCount: Object.keys(_vehicles || {}).length,
    meshCount: Object.keys(_meshes || {}).length,
    sceneCount: Object.keys(_scenes || {}).length,
    heroRuntimeDetected: _detectHeroRuntime(),
    trafficRuntimeDetected: _detectTrafficRuntime(),
    lastEarlyReturnReason: _lastEarlyReturnReason,
    lastEarlyReturnAt: _lastEarlyReturnAt,
    earlyReturnCount: _earlyReturnCount,
    renderPassCount: _renderPassCount || 0,
    renderCount: _renderCount || 0
  };
},

getEnableHistory: function () {
  return {
    enableCount: _enableCount,
    disableCount: _disableCount,
    lastEnableTime: _lastEnableTime,
    lastDisableTime: _lastDisableTime,
    lastEnableCaller: _lastEnableCaller,
    lastDisableCaller: _lastDisableCaller
  };
},

getRenderAudit: function () {
  return {
    renderPassCount: _renderPassCount || 0,
    renderCount: _renderCount || 0,
    earlyReturnCount: _earlyReturnCount,
    lastEarlyReturnReason: _lastEarlyReturnReason,
    lastEarlyReturnAt: _lastEarlyReturnAt,
    lastRenderPassAt: _lastRenderPassAt || null,
    lastRenderAt: _lastRenderAt || null,
    lastRenderObjectCount: _lastRenderObjectCount || 0,
    lastRenderSkippedCount: _lastRenderSkippedCount || 0
  };
}
```

Use existing variable names where they already exist. Do not rename existing state.

---

## F — Add Debug Console Commands

In `worldSpaceVehicleDebug.js`, add:

```js
_wos.debug.worldVehicles.enableAudit()
_wos.debug.worldVehicles.enableHistory()
_wos.debug.worldVehicles.renderAudit()
```

Each command should:

1. Resolve `SBE.WorldSpaceVehicleLayer` safely.
2. Warn clearly if unavailable.
3. Print a grouped console report.
4. Return the raw object.

Example implementation pattern:

```js
enableAudit: function () {
  var wsl = _wsl();
  if (!wsl || typeof wsl.getEnableAudit !== 'function') {
    console.warn('[worldVehicles] enableAudit unavailable');
    return null;
  }

  var s = wsl.getEnableAudit();

  console.group('[worldVehicles] enableAudit');
  console.log('active          :', s.active);
  console.log('enabled         :', s.enabled);
  console.log('layerAdded      :', s.layerAdded);
  console.log('mounted         :', s.layerMounted);
  console.log('renderReady     :', s.renderReady);
  console.log('vehicleCount    :', s.vehicleCount);
  console.log('meshCount       :', s.meshCount);
  console.log('sceneCount      :', s.sceneCount);
  console.log('heroRuntime     :', s.heroRuntimeDetected);
  console.log('trafficRuntime  :', s.trafficRuntimeDetected);
  console.log('renderPasses    :', s.renderPassCount);
  console.log('renderCount     :', s.renderCount);
  console.log('earlyReturns    :', s.earlyReturnCount);
  console.log('lastEarlyReturn :', s.lastEarlyReturnReason, s.lastEarlyReturnAt ? new Date(s.lastEarlyReturnAt).toLocaleTimeString() : '-');
  console.groupEnd();

  return s;
}
```

---

## G — Do Not Add `forceEnable()` Yet

Do not implement automatic or manual force-enable in this patch.

Reason:

We need the disable caller first. A force-enable command could mask the actual source of the bug.

---

# Test Procedure

Run:

```js
SBE.HeroVehicleRuntime?.getEntity?.()
_wos.debug.worldVehicles.state()
_wos.debug.worldVehicles.enableAudit()
_wos.debug.worldVehicles.enableHistory()
_wos.debug.worldVehicles.renderAudit()
```

Then launch Drive and run again:

```js
_wos.debug.worldVehicles.enableAudit()
_wos.debug.worldVehicles.enableHistory()
_wos.debug.worldVehicles.renderAudit()
```

---

# Expected Output

## Case A — Layer Disabled By Known Caller

```txt
enabled: false
heroRuntimeDetected: true
lastEarlyReturnReason: layer_disabled
disableCount: 1
lastDisableCaller: <stack trace showing caller>
```

This identifies the actual source of the disable call.

---

## Case B — Layer Never Enabled

```txt
enabled: false
enableCount: 0
disableCount: 0
heroRuntimeDetected: true
lastEarlyReturnReason: layer_disabled
```

This means the start/drive flow never called the enable path.

---

## Case C — Stale Debug State

```txt
heroRuntimeDetected: true
state().heroRuntime: false
```

This confirms the existing state output is using stale or incorrect runtime detection.

---

# Acceptance Criteria

## Pass

The audit identifies one of the following:

```txt
who disabled the layer
or
that the layer was never enabled
or
that state() runtime detection is stale
```

## Failure

The audit still only reports:

```txt
enabled=false
layer disabled
no hero state
```

without caller, transition, or runtime-detection detail.

---

# Explicit Non-Goals

Do not fix:

```txt
hero visibility
hero heading
underpasses
grade separation
traffic behavior
traffic collision
road sampling
camera behavior
Mapbox style
custom-layer remount
modelMatrix transform
```

This patch is only for enable-state truth.

---

# Implementation Guide

- **Where**: Add audit state and accessors in `worldSpaceVehicleLayer.js` near existing enabled/render audit state; add console commands in `worldSpaceVehicleDebug.js` near existing `state()` / `renderPassState()` commands.
- **What**: Run `node --check worldSpaceVehicleLayer.js` and `node --check worldSpaceVehicleDebug.js`, then test the console commands listed above.
- **Expect**: Console output identifies whether WSL was disabled by a specific caller, never enabled, or reporting stale runtime detection while `HeroVehicleRuntime` remains alive.
