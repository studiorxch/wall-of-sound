# 0618A_WOS_BroadcastGLBRenderPass_v1.0.0_BUILD

**Status:** BUILD  
**Date:** 2026-06-18  
**Project:** WOS / StudioRich  
**Area:** Broadcast Runtime / GLB Rendering  
**Depends on:** `0617C_WOS_GLBAssetRuntimePackagingPass_v1.0.0_BUILD`  
**Classification:** Runtime rendering bridge / fail-safe GLB display

---

## 1. Purpose

0618A turns the packaged GLB bridge from 0617C into visible Broadcast runtime rendering.

0617C completed:

```txt
Imported Studio GLB
→ packaged local runtime file
→ stable package reference
→ sanitized bundle.glbAssets block
→ Wall/Broadcast GLB registry
→ diagnostics
```

0618A adds the missing render path:

```txt
actor.assetId
→ WOSWallRuntimeGlbAssetRegistry
→ runtimeUrl
→ GLTFLoader
→ GLB scene object
→ actor anchor transform
→ Broadcast render layer
→ fallback proxy on failure / unsafe readiness
```

This pass makes packaged GLBs actually appear in the Broadcast window.

---

## 2. Non-goals

0618A must **not** become a new authoring system.

Do **not** add:

```txt
new Studio GLB import UX
new Studio asset editor
new GLB packaging endpoint
new package record schema
new actor manifest fields
new mesh editing
new material editing
new animation editing
new Canvas editor
new building texture system
```

0618A is only the Broadcast render bridge for already-packaged GLB assets.

---

## 3. Locked architecture

### 3.1 Actor manifest remains assetId-only

Actors must continue to carry only the approved actor contract.

Allowed actor reference:

```json
{
  "assetId": "studio.import.glb.vehicle.delivery_van.001"
}
```

Forbidden on actors:

```txt
glbRuntimeUrl
glbPackageId
glbPackagePath
glbPackageRecord
glbRuntimeRecord
glbFileName
glbFileSizeBytes
glbContentHash
glbObjectUrl
glbLocalPath
glbBinary
glbBase64
glbScene
glbMeshCount
glbMaterialCount
```

These were blocked in 0617C and must remain blocked.

### 3.2 GLB runtime data belongs to registry

The only Broadcast-side source of GLB runtime data is:

```txt
WOSWallRuntimeGlbAssetRegistry
```

The render layer must resolve GLB assets using:

```js
WOSWallRuntimeGlbAssetRegistry.get(actor.assetId)
```

It must **not** read:

```txt
Studio localStorage
WOSGlbImportStore
WOSGlbRuntimePackageStore
objectUrl
blob:
file://
absolute local paths
```

### 3.3 Broadcast loads from approved runtimeUrl only

Valid runtime URL shape:

```txt
./assets/glb/<safe-package-name>.glb
```

Reject or fallback for:

```txt
blob:
file:
http://
https://
absolute paths
missing runtimeUrl
```

---

## 4. Required files

### 4.1 New file

Create:

```txt
wall/systems/runtime/wallRuntimeGlbRenderLayer.js
```

Purpose:

```txt
Read accepted Broadcast actors
resolve packaged GLB records
load GLB files with GLTFLoader
instantiate and place GLB scene objects at actor anchors
track load/fallback/error diagnostics
```

### 4.2 Modified files

Modify:

```txt
wall/index.html
wall/systems/runtime/wallRuntimeBundleLoader.js
wall/systems/runtime/wallRuntimeDiagnostics.js
```

Modify only if needed:

```txt
wall/systems/runtime/wallRuntimeActorFilter.js
```

ActorFilter should already include 0617C forbidden fields. Only touch if a missing field is discovered.

---

## 5. Script loading

`wall/index.html` must load runtime GLB support in this order:

```txt
THREE.js
GLTFLoader
wallRuntimeGlbAssetRegistry.js
wallRuntimeGlbRenderLayer.js
wallRuntimeBundleLoader.js
```

If THREE already exists in Wall, reuse it. If GLTFLoader is not present, add the loader script using the same Three.js version family already used by Wall.

Required guard:

```txt
If THREE or GLTFLoader is unavailable, do not crash Broadcast.
Fallback all GLB actors to proxy rendering and increment diagnostics.
```

---

## 6. Runtime render layer API

`wallRuntimeGlbRenderLayer.js` must expose:

```js
window.WOSWallRuntimeGlbRenderLayer = {
  activate: activate,
  clear: clear,
  renderActor: renderActor,
  removeActor: removeActor,
  hasObject: hasObject,
  getObject3D: getObject3D,
  getSnapshot: getSnapshot
};
```

### 6.1 `activate(options)`

Suggested signature:

```js
activate({
  map: mapboxMap,
  mapboxgl: mapboxgl,
  actors: acceptedActors,
  fallbackRenderer: optionalFallback
})
```

Responsibilities:

```txt
initialize render layer state
load/render eligible GLB actors
clear prior GLB objects before new bundle activation
return summary counters
```

Return shape:

```js
{
  ok: true,
  attempted: 0,
  loaded: 0,
  fallback: 0,
  skipped: 0,
  errors: 0
}
```

### 6.2 `renderActor(actor)`

Given an accepted actor:

```txt
if actor.assetId is not studio.import.glb.* → skip
if registry missing record → fallback
if readiness is DEGRADE or BLOCK → fallback
if runtimeUrl invalid → fallback
else load GLB and place at actor anchor
```

### 6.3 `clear()`

Remove all GLB objects/scenes/layers created by this pass.

Must be called on bundle reload before activating the next bundle.

### 6.4 `getObject3D(objectId)`

Return the loaded Three.js object for material override / diagnostics integration.

If unavailable:

```js
return null;
```

---

## 7. GLB render eligibility

A Broadcast actor is GLB-render eligible only when all are true:

```txt
actor.assetId starts with studio.import.glb.
actor passed WOSWallActorFilter
WOSWallRuntimeGlbAssetRegistry.has(actor.assetId) is true
registry record has valid runtimeUrl
registry record broadcastReadiness is READY or WARN
THREE and GLTFLoader are available
```

Fallback when any are false.

---

## 8. Fallback rules

Fallback is not an error by itself. It is the safe display mode.

Fallback cases:

| Case | Action |
|---|---|
| missing registry record | proxy fallback |
| invalid runtimeUrl | proxy fallback + error diagnostic |
| runtimeUrl load failure | proxy fallback + error diagnostic |
| GLTF parse error | proxy fallback + error diagnostic |
| readiness `DEGRADE` | proxy fallback |
| readiness `BLOCK` | proxy fallback |
| loader unavailable | proxy fallback |
| actor transform invalid | actor should already be rejected by ActorFilter |

Fallback must increment:

```txt
glbAssetFallbackRenderCount
```

Load errors must increment:

```txt
glbAssetLoadErrorCount
```

---

## 9. Transform contract

GLB placement must use the actor anchor.

Input:

```js
actor.anchor.lat
actor.anchor.lon
actor.anchor.altM
actor.anchor.headingDeg
```

The GLB object must be positioned at the same world anchor as proxy actors.

Required behavior:

```txt
lat/lon → Mapbox Mercator coordinate
altM → altitude / z offset
headingDeg → rotation around vertical axis
scaleToMeters from registry record → object scale
```

Do not mutate the actor anchor.

Do not write preview transforms back to actor manifests.

---

## 10. Scale contract

Use registry record:

```js
record.scaleToMeters
```

Rules:

```txt
if missing → 1
if non-finite → fallback to 1 and warn
if <= 0 → fallback to 1 and warn
if too large for broadcast safety → fallback proxy or clamp, but do not mutate record
```

Recommended safety clamp:

```txt
minimum scale: 0.001
maximum scale: 1000
```

---

## 11. Material and animation contract

0618A does **not** author materials.

Allowed:

```txt
render GLB with embedded materials
respect static material data from GLB file
```

Not allowed:

```txt
material editor
texture import UI
runtime material mutation beyond existing Wall material override applicator
animation playback system
skinning system
```

If GLB contains animations or skinning, ignore them unless the existing loader automatically preserves static mesh display. Do not create animation runtime in this pass.

---

## 12. Diagnostics additions

0617C already added these counters:

```txt
glbAssetCount
glbAssetActorCount
glbAssetReadyCount
glbAssetWarnCount
glbAssetDegradeCount
glbAssetBlockedCount
glbAssetMissingPackageCount
glbAssetLoadErrorCount
glbAssetFallbackRenderCount
glbAssetRegistryReady
```

0618A must add or confirm render-specific counters:

```txt
glbAssetRenderAttemptCount
glbAssetRenderLoadedCount
glbAssetRenderSkippedCount
```

If adding new counters is too invasive, include these values inside `WOSWallRuntimeGlbRenderLayer.getSnapshot()` at minimum.

Do not remove existing 0617C counters.

---

## 13. Debug surface

Extend:

```js
_wos.debug.wall.glbAssets()
```

To include render summary:

```js
{
  registryReady: true,
  glbAssetCount: 0,
  glbAssetActorCount: 0,
  glbAssetRenderAttemptCount: 0,
  glbAssetRenderLoadedCount: 0,
  glbAssetFallbackRenderCount: 0,
  glbAssetLoadErrorCount: 0,
  loadedObjectIds: [],
  fallbackObjectIds: [],
  lastError: null
}
```

Add:

```js
_wos.debug.wall.glbObject(objectId)
```

Return:

```js
{
  found: true,
  objectId: "...",
  assetId: "...",
  runtimeUrl: "./assets/glb/...glb",
  loaded: true,
  fallback: false,
  reason: null
}
```

---

## 14. Bundle loader integration

In `wallRuntimeBundleLoader.js`, after:

```txt
custom asset registry activation
broadcast readiness activation
GLB asset registry activation
```

Call the GLB render layer:

```js
var glbRender = global.WOSWallRuntimeGlbRenderLayer;
if (glbRender) {
  var result = glbRender.activate({ actors: actors });
  diagnostics counters update from result
}
```

If the existing Wall render infrastructure requires map/context injection, use the existing runtime-ready Mapbox map reference pattern already used elsewhere in Wall.

Do not block bundle activation because one GLB fails.

Bundle activation should still complete with fallback diagnostics.

---

## 15. Interaction with fallback proxy renderer

If the Wall already has a generic actor/proxy renderer, GLB fallback should allow that existing renderer to handle the actor.

If the GLB render layer owns fallback directly, use the same proxy geometry as the existing actor render path.

Do not create a new duplicate proxy taxonomy if one already exists.

Recommended contract:

```txt
GLB layer renders only successful GLB actors.
Failed/degraded GLB actors remain available to existing proxy render path.
```

If both renderers show the same actor, add a suppression/ownership flag inside the render layer only, not inside the actor manifest.

---

## 16. Acceptance criteria

### AC1 — Packaged GLB renders in Broadcast

Given:

```txt
promoted actor references studio.import.glb.* assetId
asset has packaged runtime record
bundle.glbAssets includes matching assetId
```

Then:

```txt
Broadcast loads and displays GLB object from runtimeUrl.
```

### AC2 — Actor manifest remains clean

Published actor must not contain:

```txt
glbRuntimeUrl
glbPackageId
glbPackagePath
glbObjectUrl
glbBinary
glbBase64
glbScene
glbMeshCount
glbMaterialCount
```

### AC3 — Wall reads registry only

Broadcast GLB render layer must resolve data from:

```txt
WOSWallRuntimeGlbAssetRegistry
```

It must not read any Studio store.

### AC4 — Missing package falls back

If actor references imported GLB but registry has no record:

```txt
no crash
proxy/fallback remains visible
glbAssetFallbackRenderCount increments
```

### AC5 — Load failure falls back

If runtimeUrl 404s or GLTF parse fails:

```txt
no crash
fallback visible
glbAssetLoadErrorCount increments
diagnostic event emitted
```

### AC6 — DEGRADE/BLOCK do not GLB-render

If registry record readiness is:

```txt
DEGRADE
BLOCK
```

Then:

```txt
GLB loader does not render it
fallback path used
fallback diagnostic count increments
```

### AC7 — READY/WARN render

If readiness is:

```txt
READY
WARN
```

Then:

```txt
GLB render is attempted.
```

WARN may render but should still be visible in diagnostics.

### AC8 — Bundle reload clears old GLBs

Publishing/loading a new bundle must remove stale GLB objects from the previous bundle.

### AC9 — Debug surface works

These commands must return useful state:

```js
_wos.debug.wall.glbAssets()
_wos.debug.wall.glbAsset(assetId)
_wos.debug.wall.glbObject(objectId)
```

### AC10 — No new Studio complexity

Studio UI should not gain new editor panels in this pass.

### AC11 — No new package schema unless required

Do not change the 0617C `bundle.glbAssets` schema unless a bug requires it.

### AC12 — Parse clean

All changed JS files must parse.

### AC13 — Wall scope bounded

Allowed Wall files:

```txt
wall/index.html
wall/systems/runtime/wallRuntimeGlbRenderLayer.js
wall/systems/runtime/wallRuntimeBundleLoader.js
wall/systems/runtime/wallRuntimeDiagnostics.js
```

Only touch other Wall files if strictly necessary and document why.

---

## 17. Manual test plan

### Test 1 — happy path

```txt
1. Import small GLB in Studio.
2. Package for Broadcast.
3. Place on Map.
4. Promote actor.
5. Publish.
6. Open Broadcast.
7. Confirm GLB appears.
8. Run _wos.debug.wall.glbAssets().
```

Expected:

```txt
glbAssetRenderLoadedCount >= 1
fallback count unchanged for this actor
no actor manifest GLB runtime fields
```

### Test 2 — missing package

```txt
1. Use imported GLB actor without package record.
2. Try publish.
```

Expected:

```txt
StudioPublisher blocks publish before Broadcast.
```

If a bundle is manually corrupted to omit the GLB record:

```txt
Broadcast falls back, no crash.
```

### Test 3 — bad runtimeUrl

```txt
1. Corrupt bundle.glbAssets runtimeUrl to missing file.
2. Load Broadcast.
```

Expected:

```txt
fallback render
load error diagnostic
glbAssetLoadErrorCount increments
```

### Test 4 — BLOCK readiness

```txt
1. Mark or simulate GLB readiness BLOCK.
2. Load Broadcast.
```

Expected:

```txt
GLB render skipped
fallback count increments
no GLTFLoader request needed
```

### Test 5 — bundle reload

```txt
1. Publish GLB actor A.
2. Confirm visible.
3. Publish bundle without actor A.
4. Confirm actor A GLB object removed.
```

---

## 18. Completion statement

When complete, the system should truthfully support:

```txt
Free / Blender / externally generated GLB
→ import to Studio
→ package for Broadcast
→ place on Map
→ promote
→ publish
→ render as GLB in Broadcast
```

This is the first complete GLB-to-Broadcast path.

---

## 19. Next pass after 0618A

If 0618A passes, the next likely pass is:

```txt
0618B_WOS_GLBScaleAndOrientationAuthoringPass_v1.0.0_BUILD
```

Purpose:

```txt
per-asset GLB scale/orientation correction
axis normalization
origin/grounding controls
safe Studio preview parity with Broadcast
```

Do not start that inside 0618A.
