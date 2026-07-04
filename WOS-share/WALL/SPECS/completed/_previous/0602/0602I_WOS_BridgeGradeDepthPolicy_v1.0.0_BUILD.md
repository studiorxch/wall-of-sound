# 0602I_WOS_BridgeGradeDepthPolicy_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Target:** Claude / Codex  
**Project:** WOS — WorldSpace Vehicle / Bridge Grade Rendering  
**File Scope:** `wall/systems/render/worldSpaceVehicleLayer.js`, optional debug helper additions in `wall/systems/debug/worldSpaceVehicleDebug.js`

---

## Purpose

Create a controlled bridge / underpass grade policy for world-space vehicles now that the vehicle orientation chain is unified.

The hero car can now successfully pass under valid 3D underpasses, but grade behavior is still fragile because all actors currently share broad depth behavior and showcase traffic can use debug depth overrides. This spec separates **production grade behavior** from **debug visibility behavior** so vehicles can respect 3D structures without disappearing unpredictably or floating above geometry.

This spec does **not** solve full navigation-grade routing. It only establishes render-layer draw policy.

---

## Current Confirmed State

- Hero orientation is correct.
- Near car mesh, car LODs, truck token LODs, and near truck mesh now share the same convention:

```text
local +Y = visual front / travel-forward
```

- Hero Drive launch now auto-enables `WorldSpaceVehicleLayer`.
- Hero can pass under some 3D overpasses in `heroGradeMode('road')`.
- `alwaysOn` mode is useful only as a debug override.
- Traffic showcase actors still need better grade policy before becoming production-facing.

---

## Problem

The render layer currently mixes three different concerns:

1. **Road truth**
   - Vehicles should be occluded by true 3D bridge decks, buildings, and overpasses when they pass underneath.

2. **Readability**
   - Small vehicles still need to remain visible enough for testing and presentation.

3. **Debug proof**
   - Beacon / showcase actors may intentionally disable depth testing to prove placement.

These concerns must be separated.

Without separation, fixes for one problem break another:

```text
depthTest=false fixes visibility
but breaks underpass truth
```

```text
depthTest=true restores underpass truth
but can expose disappearing vehicles
```

---

## Required Behavior

### 1. Add Actor Depth Policy

Create one central function:

```js
function _resolveActorDepthPolicy(v) {
  return {
    mode,
    depthTest,
    depthWrite,
    renderOrder,
    frustumCulled,
    localZLift
  };
}
```

Supported modes:

```text
road
visual
alwaysOn
debugBeacon
```

### 2. Policy Rules

#### hero-live

Default:

```text
mode: road
depthTest: true
depthWrite: true
renderOrder: 0
frustumCulled: true
localZLift: 0
```

When `heroGradeMode('visual')`:

```text
mode: visual
depthTest: true
depthWrite: true
renderOrder: 0
frustumCulled: true
localZLift: HERO_VISUAL_LIFT
```

When `heroGradeMode('alwaysOn')`:

```text
mode: alwaysOn
depthTest: false
depthWrite: false
renderOrder: 1000
frustumCulled: false
localZLift: 0
```

#### showcase-road

Default:

```text
mode: road
depthTest: true
depthWrite: true
renderOrder: 0
frustumCulled: true
localZLift: 0
```

When traffic beacon mode is active:

```text
mode: debugBeacon
depthTest: false
depthWrite: false
renderOrder: 999
frustumCulled: false
localZLift: 0
```

#### test / calibration actors

Block, slab, wedge, primitive proof, and explicit test sources may use debug depth policies, but must never mutate the production default.

---

## Implementation Requirements

### A. Replace Scattered Depth Overrides

Find all direct depth overrides such as:

```js
_setMeshDepthTest(mesh, false);
_applyHeroAlwaysOn(mesh);
_applyHeroRoadMode(mesh);
```

Route them through the new actor depth policy resolver.

Keep compatibility wrappers if needed:

```js
function _applyHeroAlwaysOn(mesh) {
  _applyDepthPolicyToMesh(mesh, {
    mode: 'alwaysOn',
    depthTest: false,
    depthWrite: false,
    renderOrder: 1000,
    frustumCulled: false,
    localZLift: 0
  });
}
```

But new logic must prefer:

```js
_applyDepthPolicyToMesh(mesh, policy);
```

### B. Add `_applyDepthPolicyToMesh`

```js
function _applyDepthPolicyToMesh(mesh, policy) {
  if (!mesh || !policy) return;

  _setMeshDepthTest(mesh, !!policy.depthTest);

  mesh.renderOrder = policy.renderOrder || 0;
  mesh.frustumCulled = policy.frustumCulled !== false;
  mesh.position.z = policy.localZLift || 0;

  if (mesh.traverse) {
    mesh.traverse(function (child) {
      child.renderOrder = policy.renderOrder || 0;
      child.frustumCulled = policy.frustumCulled !== false;
    });
  }
}
```

### C. Apply Policy on Mesh Build

Inside the `needNew` branch of `upsertVehicle`:

```js
var policy = _resolveActorDepthPolicy(v);
_applyDepthPolicyToMesh(mesh, policy);
mesh._depthPolicyMode = policy.mode;
```

This replaces source-specific hardcoding.

### D. Reapply Policy on Runtime Grade Changes

Update:

```js
setHeroGradeMode(mode)
setTrafficBeaconMode(on)
```

So each one re-applies depth policy to affected actors without requiring a full mesh rebuild unless geometry actually changes.

### E. Add Grade Policy State

Add exported accessor:

```js
getActorDepthPolicyState()
```

Expected output:

```js
{
  heroGradeMode,
  trafficBeaconMode,
  actors: [
    {
      id,
      source,
      actorType,
      depthPolicyMode,
      depthTest,
      depthWrite,
      renderOrder,
      frustumCulled,
      localZLift
    }
  ]
}
```

### F. Add Debug Command

In `worldSpaceVehicleDebug.js`, add:

```js
_wos.debug.worldVehicles.depthPolicyState()
```

It should print a grouped report and return the raw state.

---

## Guardrails

Do not change:

- heading math
- `VEHICLE_HEADING_OFFSET_DEG`
- mesh geometry
- route runtime
- camera presets
- Mapbox style
- remount logic
- traffic sampling
- traffic speed
- traffic collision behavior
- modelMatrix transform math

This is a render-depth policy pass only.

---

## Acceptance Tests

### Test 1 — Hero Road Truth

Run:

```js
_wos.debug.worldVehicles.heroGradeMode('road')
_wos.debug.worldVehicles.depthPolicyState()
```

Expected:

```text
hero depthTest true
hero depthWrite true
hero renderOrder 0
hero localZLift 0
```

Hero should pass under valid 3D overpasses and be occluded when the deck is physically above it.

### Test 2 — Hero Visual Lift

Run:

```js
_wos.debug.worldVehicles.heroGradeMode('visual')
_wos.debug.worldVehicles.depthPolicyState()
```

Expected:

```text
hero depthTest true
hero depthWrite true
hero renderOrder 0
hero localZLift HERO_VISUAL_LIFT
```

Hero should remain slightly easier to read but still respect 3D occlusion.

### Test 3 — Debug Always-On

Run:

```js
_wos.debug.worldVehicles.heroGradeMode('alwaysOn')
_wos.debug.worldVehicles.depthPolicyState()
```

Expected:

```text
hero depthTest false
hero depthWrite false
hero renderOrder 1000
hero frustumCulled false
```

Hero should draw above bridge decks. This is debug-only and should not be default.

### Test 4 — Traffic Beacon Separation

Run:

```js
_wos.debug.worldVehicles.trafficBeaconMode(true)
_wos.debug.worldVehicles.depthPolicyState()
```

Expected:

```text
showcase-road beacon actors use debugBeacon policy
hero remains road or visual unless explicitly changed
```

### Test 5 — No Forced Reversal

Run:

```js
_wos.debug.worldVehicles.heroHeadingAudit()
```

Expected:

```text
aligned true
angleDiffDeg approximately 0
```

No heading / orientation regression.

---

## Failure Conditions

Reject the build if:

- `heroGradeMode('road')` still applies `depthTest=false`.
- traffic beacon mode changes hero depth policy.
- `showcase-road` default vehicles are forced always-on.
- mesh geometry changes.
- heading offset changes.
- underpass behavior regresses from 0602H.
- `node --check` fails.

---

## Version Target

Update:

```js
var VERSION = '1.22.0';
```

---

## Implementation Guide

- **Where:** `wall/systems/render/worldSpaceVehicleLayer.js` near existing hero grade policy helpers; optional command in `wall/systems/debug/worldSpaceVehicleDebug.js`.
- **What:** Run `node --check wall/systems/render/worldSpaceVehicleLayer.js` and `node --check wall/systems/debug/worldSpaceVehicleDebug.js`.
- **Expect:** Hero and traffic depth behavior is policy-driven, inspectable, and separated from debug visibility overrides.
