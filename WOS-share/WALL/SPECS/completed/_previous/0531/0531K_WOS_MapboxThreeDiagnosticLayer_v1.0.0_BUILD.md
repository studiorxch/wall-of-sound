# [BUILD] 0531K_WOS_MapboxThreeDiagnosticLayer_v1.0.0

## Purpose

Create a minimal diagnostic layer that proves whether Three.js can render fixed world-space objects inside the current Mapbox scene.

This is not a vehicle patch.

This is a transform proof.

## Problem

`WorldSpaceVehicleLayer` reports:

```text
renderReady: true
beaconActive: true
```

But the 20m × 20m × 100m red beacon does not appear.

That means the failure is likely in the Mapbox → Three.js transform path, not vehicle geometry, route logic, or DOM fallback.

## Build Status

```text
[BUILD]
```

Ready for Claude/Codex implementation.

---

# Scope

## Add

```text
wall/systems/debug/mapboxThreeDiagnosticLayer.js
```

## Update

```text
wall/index.html
```

Load the diagnostic file after Three.js and after the Mapbox map exists.

---

# Requirements

## 1. Diagnostic layer must be isolated

Do not depend on:

- HeroVehicleRuntime
- HeroVehicleRenderer
- TrafficOccupancyRuntime
- TrafficOccupancyRenderer
- WorldSpaceVehicleLayer
- RegionalFlightTripRuntime

The diagnostic layer may only depend on:

```text
mapboxgl
THREE
SBE.map or global map reference
```

## 2. Render three fixed cubes

Create three bright cubes near the current map center:

```text
Cube A: map center
Cube B: 100m east of map center
Cube C: 100m north of map center
```

Cube dimensions:

```text
50m × 50m × 50m
```

Colors:

```text
A = red
B = green
C = blue
```

Use `MeshBasicMaterial` so lighting cannot hide the result.

## 3. Use canonical Mapbox custom-layer matrix flow

The render path must use the Mapbox-provided projection matrix and a per-object model transform.

Use this conceptual structure:

```js
const merc = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitudeMeters);
const scale = merc.meterInMercatorCoordinateUnits();

const modelMatrix = new THREE.Matrix4()
  .makeTranslation(merc.x, merc.y, merc.z)
  .scale(new THREE.Vector3(scale, -scale, scale));

camera.projectionMatrix = new THREE.Matrix4()
  .fromArray(mapboxMatrix)
  .multiply(modelMatrix);
```

Important:

```text
Do not rely only on mesh.position = mercator x/y/z.
```

That appears to be the current failure path.

## 4. Provide two render modes

Add a mode toggle:

```js
_wos.debug.threeDiag.mode('model-matrix')
_wos.debug.threeDiag.mode('mesh-position')
```

Default:

```text
model-matrix
```

Purpose:

```text
model-matrix  = canonical expected Mapbox custom-layer path
mesh-position = current suspected-broken path for comparison
```

## 5. Debug API

Expose:

```js
_wos.debug.threeDiag.start()
_wos.debug.threeDiag.stop()
_wos.debug.threeDiag.state()
_wos.debug.threeDiag.mode()
_wos.debug.threeDiag.mode('model-matrix')
_wos.debug.threeDiag.mode('mesh-position')
```

## 6. State output

`state()` must return:

```js
{
  active: boolean,
  layerAdded: boolean,
  threeAvailable: boolean,
  mapAvailable: boolean,
  mode: 'model-matrix' | 'mesh-position',
  center: { lat, lng },
  cubes: [
    { id, color, lat, lng, altitudeM, sizeM }
  ]
}
```

## 7. Visual acceptance test

Run:

```js
_wos.debug.threeDiag.start()
_wos.debug.threeDiag.state()
```

Expected visual result:

```text
Three large colored cubes appear near the current map center.
```

Expected debug result:

```text
active: true
layerAdded: true
threeAvailable: true
mapAvailable: true
mode: model-matrix
cubes.length: 3
```

## 8. Failure interpretation

If cubes appear in `model-matrix` mode:

```text
Mapbox ↔ Three transform works.
WorldSpaceVehicleLayer should be refactored to use this transform path.
```

If cubes do not appear in `model-matrix` mode:

```text
Custom layer registration, render order, GL context, or Mapbox matrix handling is still wrong.
```

If cubes appear only in `mesh-position` mode:

```text
Document that current assumptions were inverted and preserve the working mode.
```

If cubes appear in neither mode:

```text
Do not continue vehicle work. Fix diagnostic layer first.
```

---

# Implementation Notes

## Cube placement helper

Add meters-to-lng/lat offset helpers:

```js
function offsetLngLat(lng, lat, eastM, northM) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = Math.cos(lat * Math.PI / 180) * 111320;

  return {
    lng: lng + eastM / metersPerDegLng,
    lat: lat + northM / metersPerDegLat,
  };
}
```

## Layer ID

Use:

```text
wos-three-diagnostic-layer
```

## Render order

Add layer above base map but do not reorder existing WOS layers unless required.

If supported, call:

```js
map.addLayer(customLayer);
```

Do not pass an arbitrary before-layer until diagnostics prove rendering works.

## Cleanup

`stop()` must:

- remove the custom layer if present
- dispose geometries and materials
- clear scene children
- reset state

## Guard clauses

Every public command must handle:

- missing map
- missing THREE
- layer already started
- layer not started
- style not loaded yet

No uncaught exceptions.

---

# Non-Goals

Do not:

- redesign vehicle meshes
- modify hero runtime
- modify traffic runtime
- hide DOM markers
- touch camera follow behavior
- touch speed or altitude controls
- add GLTF loading
- solve bridge rendering

This is only a Mapbox/Three coordinate diagnostic.

---

# Acceptance Checklist

- [ ] `_wos.debug.threeDiag.start()` starts without errors.
- [ ] `_wos.debug.threeDiag.state()` reports `layerAdded: true`.
- [ ] Three cubes appear near the map center in `model-matrix` mode.
- [ ] Switching to `mesh-position` mode does not crash.
- [ ] `_wos.debug.threeDiag.stop()` removes all diagnostic geometry.
- [ ] Existing DOM hero car remains visible and unaffected.
- [ ] Existing drive route continues unaffected.

---

# Implementation Guide

- **Where**: Add `wall/systems/debug/mapboxThreeDiagnosticLayer.js`; load it in `wall/index.html` after Three.js and after Mapbox initialization scripts.
- **What**: Run the app, start a drive, then execute `_wos.debug.threeDiag.start()` and `_wos.debug.threeDiag.state()` in DevTools.
- **Expect**: Three large red/green/blue cubes near the current map center; if no cubes appear, stop all vehicle work and fix the Mapbox/Three transform path first.
