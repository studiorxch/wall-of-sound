# 0602G_WOS_TrafficLODOrientationUnification_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Target:** `wall/systems/render/worldSpaceVehicleLayer.js`  
**Current baseline:** `WorldSpaceVehicleLayer v1.19.0`  
**Purpose:** Unify traffic vehicle orientation across all LOD mesh builders so near, mid, far, tiny, and truck token geometry all share the same visual-front convention.

---

## Problem

0602F corrected the active hero near-tier vehicle mesh by making **local +Y the visual front** inside `_buildVehicleMesh()`.

The remaining simplified LOD builders still use the older **local -Y front** convention:

- `_buildVehicleMeshMid()`
- `_buildVehicleFar()`
- `_buildVehicleTiny()`
- `_buildTruckToken()`

This can make traffic actors appear reversed or visually flip when LOD changes across zoom/camera distance.

---

## Doctrine

```text
Heading math is stable.
Geometry must conform to heading.
Do not fix visual direction by changing runtime heading.
```

The canonical visual convention is now:

```text
local +Y = vehicle front / travel-facing visual nose
local -Y = vehicle rear / trailing end
```

This spec only changes simplified LOD geometry placement. It must not change route logic, transform math, traffic sampling, camera behavior, Mapbox style, remount behavior, or hero runtime behavior.

---

## Environmental Assumptions

- `THREE` is available before `worldSpaceVehicleLayer.js` loads.
- `WorldSpaceVehicleLayer` is currently at or near `v1.19.0`.
- `_buildVehicleMesh()` already uses local `+Y` as the front after 0602F.
- Hero is pinned to near LOD, but traffic actors can use mid/far/tiny LOD tiers.
- Existing heading math remains:

```js
mesh.rotation.z = -hdg * Math.PI / 180;
```

- Existing model-matrix transform remains:

```js
.scale(new THREE.Vector3(meterScale, -meterScale, meterScale * depthMult));
```

---

## Scope

### In Scope

- Flip simplified traffic LOD visual cues so local `+Y` is front.
- Update comments that still claim nose/front is `-Y` where directly touched.
- Ensure taxi sign forward face follows the new convention where applicable.
- Keep geometry readable at mid/far/tiny distances.
- Bump layer version.
- Run syntax validation.

### Out of Scope

- No heading offset changes.
- No route/runtime changes.
- No hero runtime changes.
- No Mapbox style changes.
- No custom-layer lifecycle/remount changes.
- No traffic law/collision simulation.
- No grade-separation logic.
- No replacement asset system.

---

## Required Version Bump

In `worldSpaceVehicleLayer.js`:

```js
var VERSION = '1.20.0';
```

---

## Required Edits

## 1. Update Orientation Comments

Find comments near the mesh builder section that still say:

```js
// Nose points in −Y
```

Replace with:

```js
// Vehicle visual convention: local +Y is the front / travel-facing nose.
// Heading math remains unchanged; geometry conforms to the heading system.
```

Do not rewrite unrelated doctrine comments unless they are directly misleading.

---

## 2. Patch `_buildVehicleMeshMid()`

Replace the nose cue block with:

```js
// Heading cue — accent cone at nose tip (+Y, travel-forward)
var noseCue = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 4), _matBasic(0xffd34d));
noseCue.rotation.x = -Math.PI / 2;
noseCue.position.set(0, (L * 0.5 + 0.2), 0.45);
g.add(noseCue);
```

No required taxi-sign geometry change unless the sign has a forward-facing detail. If a sign face is later added to mid LOD, its visible/front face must bias toward `+Y`.

---

## 3. Patch `_buildVehicleFar()`

Replace the nose cue block with:

```js
var noseCue = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 4), _matBasic(0xffd34d));
noseCue.rotation.x = -Math.PI / 2;
noseCue.position.set(0, (L * 0.5 + 0.1), 0.5);
g.add(noseCue);
```

---

## 4. Patch `_buildVehicleTiny()`

Replace the cue block with:

```js
var cue = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 3), _matBasic(0xffd34d));
cue.rotation.x = -Math.PI / 2;
cue.position.set(0, (L * 0.5), 0.4);
g.add(cue);
```

---

## 5. Patch `_buildTruckToken()`

Replace the cue block with:

```js
var cue = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 3), _matBasic(0xffffff));
cue.rotation.x = -Math.PI / 2;
cue.position.set(0, (L * 0.5), 0.7);
g.add(cue);
```

---

## 6. Do Not Change Heading Math

These lines must remain unchanged:

```js
var hdg = (v.headingDeg || 0) + VEHICLE_HEADING_OFFSET_DEG;
var hdgRad = -hdg * Math.PI / 180;
```

These transform lines must remain unchanged:

```js
mesh.rotation.set(0, 0, hdgRad);
```

```js
.scale(new THREE.Vector3(meterScale, -meterScale, meterScale * depthMult));
```

This patch is geometry-only.

---

## Acceptance Tests

Run after patch:

```js
_wos.debug.worldVehicles.setHeadingOffset(0)
_wos.debug.worldVehicles.heroHeadingAudit()
```

Expected:

```text
aligned: true
angleDiffDeg: near 0
```

Then test traffic across zoom levels:

```js
_wos.debug.worldVehicles.clearTrafficMotionShowcase()
_wos.debug.worldVehicles.trafficDisciplineShowcase(40)
```

Zoom out and in through mid/far/tiny ranges.

Expected:

```text
Traffic direction cues do not flip when LOD changes.
Traffic nose cues face travel direction.
Taxi/truck simplified LOD tokens do not appear backward.
Hero remains unchanged.
```

Optional inspection:

```js
_wos.debug.worldVehicles.scaleState()
```

Expected:

```text
traffic actors may change lodTier, but visual front remains consistent.
```

---

## Regression Guard

After patch, confirm:

```js
_wos.debug.worldVehicles.enableAudit()
_wos.debug.worldVehicles.renderAudit()
_wos.debug.worldVehicles.meshAudit('hero')
```

Expected:

```text
enabled: true after Drive launch
lastEarlyReturnReason is not layer_disabled during active drive
hero mesh exists
hero remains visible without altitude toggling
```

---

## Files Changed

```text
wall/systems/render/worldSpaceVehicleLayer.js
```

No other files should be required.

---

## Non-Goals

This patch will not solve:

- cars driving on rooftops
- traffic following short loops
- traffic collision/spacing beyond current debug discipline mode
- traffic obeying traffic lights/signals
- bridge grade-selection for traffic
- high-fidelity real vehicle art

Those require separate specs.

---

## Implementation Guide

- **Where:** Edit `wall/systems/render/worldSpaceVehicleLayer.js`; update `VERSION` near the top, then patch `_buildVehicleMeshMid()`, `_buildVehicleFar()`, `_buildVehicleTiny()`, and `_buildTruckToken()` cue placement blocks.
- **What:** Run `node --check wall/systems/render/worldSpaceVehicleLayer.js`, then launch WOS and run `_wos.debug.worldVehicles.trafficDisciplineShowcase(40)`.
- **Expect:** Syntax passes, hero direction stays correct, and traffic LOD nose cues no longer flip or face backward when zooming between near/mid/far/tiny tiers.
