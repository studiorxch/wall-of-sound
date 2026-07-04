# [BUILD] 0531L_WOS_WorldSpaceVehicleUpsertTrace_v1.0.0

## Build-Readiness

[BUILD] — Ready to send to Claude/Codex.

## Purpose

Trace why `WorldSpaceVehicleLayer.upsertVehicle()` returns `false` even when the Three.js layer reports:

```text
active: true
enabled: true
threeAvailable: true
layerAdded: true
renderReady: true
visibilityMode: block
vehicleCount: 0
```

The current evidence proves the custom layer can initialize, but the live hero payload never enters the world-space vehicle scene.

This patch is diagnostic-only. It must not change geometry, camera behavior, route behavior, fallback visibility, traffic behavior, or Mapbox layer transforms.

---

## Problem

`HeroVehicleRenderer` logs:

```text
[HeroVehicleRenderer] world-space upsert failed — DOM fallback active
```

while `WorldSpaceVehicleLayer.state()` reports render readiness.

That means the failure is inside the data path:

```text
HeroVehicleRuntime
  ↓
HeroVehicleRenderer.update(state)
  ↓
WorldSpaceVehicleLayer.upsertVehicle(payload)
```

The most likely causes are:

1. `lat` / `lng` / `id` is missing or invalid in the payload.
2. `HeroVehicleRenderer` is calling a different `WorldSpaceVehicleLayer` instance than the debug API.
3. `upsertVehicle()` has an early guard returning `false` before `_vehicles[id]` is written.

---

## Scope

### Files to Modify

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/render/heroVehicleRenderer.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

### Files Not to Modify

```text
heroVehicleRuntime.js
trafficOccupancyRuntime.js
trafficOccupancyRenderer.js
regionalFlightTripRuntime.js
regionalFlightCameraRig.js
traversalControlDeck.js
Mapbox style files
```

---

## Requirements

## 1. Add WorldSpaceVehicleLayer Instance Identity

In `worldSpaceVehicleLayer.js`, add a module-level constant:

```js
var INSTANCE_ID = 'wsl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
```

Expose it through:

```js
getInstanceId()
```

Add to `getState()`:

```js
instanceId: INSTANCE_ID
```

Expected debug output:

```text
instanceId: wsl_lx9a3_p7k2q
```

---

## 2. Add Structured Upsert Trace

In `worldSpaceVehicleLayer.js`, add a throttled trace system.

### State

```js
var _upsertTraceEnabled = false;
var _lastUpsertTraceAt = 0;
var UPSERT_TRACE_INTERVAL_MS = 1000;
var _lastUpsertFailure = null;
var _lastUpsertSuccess = null;
```

### API

```js
setUpsertTraceEnabled(enabled)
getUpsertTraceState()
```

### getUpsertTraceState() returns

```js
{
  enabled: boolean,
  instanceId: string,
  lastFailure: object | null,
  lastSuccess: object | null,
  vehicleCount: number,
  renderReady: boolean
}
```

---

## 3. Instrument Every Early Return in upsertVehicle()

Inside `upsertVehicle(v)`, replace silent `return false` exits with structured failure recording.

Add helper:

```js
function _recordUpsertFailure(reason, v, extra) {
  _lastUpsertFailure = {
    reason: reason,
    instanceId: INSTANCE_ID,
    timestamp: Date.now(),
    enabled: _enabled,
    active: _active,
    threeOk: _threeOk,
    layerAdded: _layerAdded,
    renderReady: isRenderReady(),
    vehicleCount: Object.keys(_vehicles).length,
    payload: _summarizePayload(v),
    extra: extra || null
  };

  if (_upsertTraceEnabled && Date.now() - _lastUpsertTraceAt >= UPSERT_TRACE_INTERVAL_MS) {
    _lastUpsertTraceAt = Date.now();
    console.warn('[WorldSpaceVehicleLayer] upsert failed', _lastUpsertFailure);
  }
}
```

Add helper:

```js
function _recordUpsertSuccess(v) {
  _lastUpsertSuccess = {
    instanceId: INSTANCE_ID,
    timestamp: Date.now(),
    id: v && v.id,
    source: v && v.source,
    actorType: v && v.actorType,
    variant: v && v.variant,
    lat: v && v.lat,
    lng: v && v.lng,
    headingDeg: v && v.headingDeg,
    vehicleCount: Object.keys(_vehicles).length
  };

  if (_upsertTraceEnabled && Date.now() - _lastUpsertTraceAt >= UPSERT_TRACE_INTERVAL_MS) {
    _lastUpsertTraceAt = Date.now();
    console.log('[WorldSpaceVehicleLayer] upsert ok', _lastUpsertSuccess);
  }
}
```

Add helper:

```js
function _summarizePayload(v) {
  if (!v) return null;
  return {
    id: v.id,
    actorType: v.actorType,
    variant: v.variant,
    source: v.source,
    lat: v.lat,
    lng: v.lng,
    headingDeg: v.headingDeg,
    visible: v.visible,
    scale: v.scale
  };
}
```

### Required failure reasons

Use these exact reason strings:

```text
three_not_available
layer_disabled
missing_payload
missing_id
invalid_lat_lng
mesh_build_failed
transform_failed
unknown_exception
```

### Guard behavior

Existing behavior must remain the same: return `false` on failure, return `true` on success.

---

## 4. Wrap Mesh Build and Transform in try/catch

Inside `upsertVehicle(v)`, wrap mesh creation and transform application:

```js
try {
  // existing mesh create/rebuild path
} catch (err) {
  _recordUpsertFailure('mesh_build_failed', v, {
    message: err && err.message ? err.message : String(err)
  });
  return false;
}
```

```js
try {
  _applyTransform(group, v);
} catch (err) {
  _recordUpsertFailure('transform_failed', v, {
    message: err && err.message ? err.message : String(err)
  });
  return false;
}
```

On final successful write/update:

```js
_vehicles[v.id] = v;
_recordUpsertSuccess(v);
return true;
```

---

## 5. Add Hero Renderer Payload Trace

In `heroVehicleRenderer.js`, add throttled hero-to-world trace.

### State

```js
var _worldPayloadTraceEnabled = false;
var _lastWorldPayloadTraceAt = 0;
var WORLD_PAYLOAD_TRACE_INTERVAL_MS = 1000;
var _lastWorldPayload = null;
```

### API

Expose through `SBE.HeroVehicleRenderer`:

```js
setWorldPayloadTraceEnabled(enabled)
getWorldPayloadTraceState()
```

### Payload snapshot

Before calling `wsl.upsertVehicle(payload)`, store:

```js
_lastWorldPayload = {
  timestamp: Date.now(),
  wslInstanceId: typeof wsl.getInstanceId === 'function' ? wsl.getInstanceId() : null,
  wslEnabled: typeof wsl.getEnabled === 'function' ? wsl.getEnabled() : null,
  wslRenderReady: typeof wsl.isRenderReady === 'function' ? wsl.isRenderReady() : null,
  payload: {
    id: payload.id,
    actorType: payload.actorType,
    variant: payload.variant,
    lat: payload.lat,
    lng: payload.lng,
    headingDeg: payload.headingDeg,
    source: payload.source
  }
};
```

When enabled, log max once per second:

```js
console.log('[HeroVehicleRenderer] world payload', _lastWorldPayload);
```

---

## 6. Add Debug Commands

In `worldSpaceVehicleDebug.js`, add:

```js
_wos.debug.worldVehicles.trace(true)
_wos.debug.worldVehicles.trace(false)
_wos.debug.worldVehicles.trace()
```

Behavior:

```js
trace(true)
```

should enable:

```js
WorldSpaceVehicleLayer.setUpsertTraceEnabled(true)
HeroVehicleRenderer.setWorldPayloadTraceEnabled(true)
```

```js
trace(false)
```

should disable both.

```js
trace()
```

should print:

```text
WorldSpaceVehicleLayer instanceId
WorldSpaceVehicleLayer upsert trace state
HeroVehicleRenderer world payload trace state
```

Also add to `_wos.debug.worldVehicles.state()` output:

```text
instanceId
visibilityMode
lastUpsertFailure.reason
lastUpsertSuccess.id/source
```

---

## 7. Acceptance Test

Run this exact sequence after reload:

```js
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.visibilityMode('block')
_wos.debug.worldVehicles.trace(true)
_wos.debug.worldVehicles.liveHero()
_wos.debug.worldVehicles.state()
```

### Expected Console Case A — Invalid Payload

```text
[HeroVehicleRenderer] world payload
payload.lat: undefined
payload.lng: undefined

[WorldSpaceVehicleLayer] upsert failed
reason: invalid_lat_lng
```

Fix will be in HeroVehicleRenderer payload mapping.

### Expected Console Case B — Duplicate Instance

```text
HeroVehicleRenderer payload wslInstanceId: wsl_A
WorldSpaceVehicleLayer state instanceId: wsl_B
```

Fix will be script load order / duplicate module registration.

### Expected Console Case C — Mesh Build Error

```text
reason: mesh_build_failed
extra.message: ...
```

Fix will be inside `_buildMesh()` / `_buildBlockMesh()`.

### Expected Console Case D — Transform Error

```text
reason: transform_failed
extra.message: ...
```

Fix will be inside `_applyTransform()`.

### Expected Success

```text
lastUpsertSuccess.id: hero
lastUpsertSuccess.source: hero-live
vehicleCount: 1
```

The red block should follow the DOM hero car in block mode.

---

## Non-Goals

Do not:

- redesign vehicle meshes
- add traffic
- alter route generation
- alter camera behavior
- alter speed or altitude ladders
- change Mapbox style layers
- hide DOM marker in block mode
- remove fallback protections

---

## Implementation Guide

- **Where**: Modify `worldSpaceVehicleLayer.js` around `upsertVehicle()`, `getState()`, and the frozen export object; modify `heroVehicleRenderer.js` inside the world-space upsert branch; modify `worldSpaceVehicleDebug.js` where `_wos.debug.worldVehicles` commands are defined.
- **What**: Reload the app, launch Drive, then run `_wos.debug.worldVehicles.enable(); _wos.debug.worldVehicles.visibilityMode('block'); _wos.debug.worldVehicles.trace(true); _wos.debug.worldVehicles.liveHero(); _wos.debug.worldVehicles.state();`.
- **Expect**: Console identifies the exact upsert failure reason. If success, `vehicleCount: 1`, `lastUpsertSuccess.id: hero`, and the red block follows the DOM hero car.
