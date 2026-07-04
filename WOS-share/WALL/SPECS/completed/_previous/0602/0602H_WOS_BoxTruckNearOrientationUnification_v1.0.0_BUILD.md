# [BUILD] 0602H_WOS_BoxTruckNearOrientationUnification_v1.0.0

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.  
**Scope:** Surgical orientation fix for near-tier box trucks only.

---

## Purpose

Unify the **near-tier box truck visual orientation** with the WOS vehicle heading convention established by the recent hero/car orientation fixes.

Current convention:

```text
local +Y = visual front / travel-forward nose
```

The hero car, passenger vehicle near mesh, simplified car LODs, and truck token LOD now follow this convention.

However, `_buildTruckMesh()` still builds its cab, windshield, heading cue, and front/rear logic using the older convention:

```text
local -Y = visual front
```

This causes near-tier box trucks to appear reversed relative to heading, lane direction, and the other vehicle meshes.

This spec flips `_buildTruckMesh()` only.

---

## Environmental Assumptions

- File target:

```text
wall/systems/render/worldSpaceVehicleLayer.js
```

- Current layer version is expected to be:

```text
1.20.0
```

- `_buildTruckToken()` already uses the corrected `+Y` front convention.
- `_buildVehicleMesh()`, `_buildVehicleMeshMid()`, `_buildVehicleFar()`, and `_buildVehicleTiny()` already use the corrected `+Y` front convention.
- `mesh.rotation.z`, `VEHICLE_HEADING_OFFSET_DEG`, `_applyTransform()`, and the Mapbox `modelMatrix` transform path are already correct and must not be changed.

---

## Non-Goals

Do **not** change:

- heading math
- `mesh.rotation.z`
- `VEHICLE_HEADING_OFFSET_DEG`
- `_applyTransform()`
- `modelMatrix` / `vehicleMatrix`
- route runtime
- hero runtime
- traffic sampling
- traffic speed
- traffic collision rules
- camera presets
- Mapbox style
- custom-layer remount logic
- `styledata` / `style.load` remount behavior
- car mesh builders already fixed by 0602E / 0602F / 0602G

---

## Required Change

### 1. Update `_buildTruckMesh(variant)`

Change the truck near-tier mesh from:

```text
nose/front/cab at -Y
rear/cargo tail at +Y
```

to:

```text
nose/front/cab at +Y
rear/cargo tail at -Y
```

The full near-tier truck must follow the same visual convention as every other vehicle:

```text
local +Y = front
local -Y = rear
```

---

## Exact Geometry Corrections

Inside `_buildTruckMesh(variant)`:

### A. Reverse Cab and Cargo Placement

Current layout describes:

```text
Nose at -L/2
Tail at +L/2
Cab occupies front (-Y)
Cargo occupies rear (+Y)
```

Replace with:

```text
Nose at +L/2
Tail at -L/2
Cab occupies front (+Y)
Cargo occupies rear (-Y)
```

Required coordinate logic:

```js
var cabCentreY = (L / 2) - CL / 2;
var boxCentreY = (L / 2) - CL - boxL / 2;
```

Why: the cab is the truck’s front volume and must lead travel at `+Y`.

---

### B. Move Rear Door to `-Y`

Current rear door is placed at:

```js
rearDoor.position.set(0, (L / 2) - 0.05, H * 0.45);
```

Change to:

```js
rearDoor.position.set(0, -(L / 2) + 0.05, H * 0.45);
```

Why: rear cargo door must trail at `-Y`.

---

### C. Move Cab-Cargo Seam

Current seam sits at the old cab/cargo boundary:

```js
seam.position.set(0, -(L / 2) + CL, H / 2);
```

Change to:

```js
seam.position.set(0, (L / 2) - CL, H / 2);
```

Why: the seam must separate the front cab from rear cargo under the `+Y` front convention.

---

### D. Move Windshield to `+Y`

Current windshield sits at the old nose:

```js
wind.rotation.x = -0.28;
wind.position.set(0, -(L / 2 - 0.15), cabH * 0.78);
```

Change to:

```js
wind.rotation.x = 0.28;
wind.position.set(0, (L / 2 - 0.15), cabH * 0.78);
```

Why: windshield must face the visual front and tilt back from the truck nose.

---

### E. Move Heading Cue to `+Y`

Current heading cue sits at old front:

```js
cue.rotation.x = Math.PI / 2;
cue.position.set(0, -(L / 2 + 0.08), cabH * 0.55);
```

Change to:

```js
cue.rotation.x = -Math.PI / 2;
cue.position.set(0, (L / 2 + 0.08), cabH * 0.55);
```

Why: heading cue must point forward along local `+Y`.

---

### F. Update Wheel Anchor Logic

Current wheel placement assumes the old cab/cargo orientation:

```js
[
  [ W * 0.5 + wT * 0.5, cabCentreY + CL * 0.25,  0 ],
  [-W * 0.5 - wT * 0.5, cabCentreY + CL * 0.25,  0 ],
  [ W * 0.5 + wT * 0.5, boxCentreY - boxL * 0.27, 0 ],
  [-W * 0.5 - wT * 0.5, boxCentreY - boxL * 0.27, 0 ],
  [ W * 0.5 + wT * 0.5, boxCentreY + boxL * 0.27, 0 ],
  [-W * 0.5 - wT * 0.5, boxCentreY + boxL * 0.27, 0 ],
]
```

Replace with orientation-neutral front/rear axle intent:

```js
[
  [ W * 0.5 + wT * 0.5, cabCentreY - CL * 0.20,  0 ],
  [-W * 0.5 - wT * 0.5, cabCentreY - CL * 0.20,  0 ],
  [ W * 0.5 + wT * 0.5, boxCentreY - boxL * 0.27, 0 ],
  [-W * 0.5 - wT * 0.5, boxCentreY - boxL * 0.27, 0 ],
  [ W * 0.5 + wT * 0.5, boxCentreY + boxL * 0.27, 0 ],
  [-W * 0.5 - wT * 0.5, boxCentreY + boxL * 0.27, 0 ],
]
```

Why: the steer axle should remain near the cab, while drive axles remain under the cargo box.

---

### G. Update Comments

Replace obsolete comments that claim:

```text
Nose at -Y
front (-Y)
rear (+Y)
```

with:

```text
Truck visual convention: local +Y is front / travel-forward.
Cab occupies the +Y front.
Cargo and rear door trail toward -Y.
Heading math remains unchanged.
```

Do not leave contradictory comments in `_buildTruckMesh()`.

---

## Version Bump

Update:

```js
var VERSION = '1.20.0';
```

to:

```js
var VERSION = '1.21.0';
```

---

## Validation Commands

Run:

```bash
node --check wall/systems/render/worldSpaceVehicleLayer.js
```

Then in browser console:

```js
_wos.debug.worldVehicles.clearTrafficMotionShowcase()
_wos.debug.worldVehicles.trafficDisciplineShowcase(40)
```

Optional stronger visual test:

```js
_wos.debug.worldVehicles.trafficBeaconMode(false)
_wos.debug.worldVehicles.visibilityBoost(true)
_wos.debug.worldVehicles.clearTrafficMotionShowcase()
_wos.debug.worldVehicles.trafficDisciplineShowcase(40)
```

---

## Acceptance Criteria

- Near-tier box trucks visually face the same travel-forward direction as:
  - hero car
  - traffic cars
  - mid/far/tiny vehicle LODs
  - truck token LODs
- Truck cab leads travel direction.
- Truck windshield faces forward.
- Truck cargo rear door trails.
- Truck heading cue points forward.
- No heading offset changes are required.
- No transform changes are required.
- No route/camera/runtime behavior changes.
- `node --check` passes.

---

## Regression Checks

### Hero

Run:

```js
_wos.debug.worldVehicles.heroHeadingAudit()
```

Expected:

```text
aligned: true
angleDiffDeg: ~0
```

Hero orientation must remain unchanged.

### Traffic

Run:

```js
_wos.debug.worldVehicles.trafficDisciplineShowcase(40)
```

Expected:

```text
Cars and trucks face the same road-flow direction at near and far zoom levels.
```

### Underpasses

Drive through the known successful 3D underpass section.

Expected:

```text
Hero still passes under 3D underpasses.
```

---

## Implementation Guide

- **Where:** `wall/systems/render/worldSpaceVehicleLayer.js`; edit only `_buildTruckMesh(variant)` and the top-level `VERSION` string.
- **What:** Run `node --check wall/systems/render/worldSpaceVehicleLayer.js`, then test with `_wos.debug.worldVehicles.trafficDisciplineShowcase(40)`.
- **Expect:** Near-tier box trucks no longer render backward; cab/windshield/head cue lead travel, rear cargo door trails, and all existing hero/traffic transform behavior remains unchanged.
