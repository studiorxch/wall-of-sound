---
title: 0616J_WOS_GLBImportBridgePass_v1.0.0_BUILD
date: 2026-06-16
project: Wall of Sound
system: WOS
classification: studio-authoring-ux
status: BUILD
scope: Studio-only GLB import bridge
version: 1.0.0
---

# 0616J_WOS_GLBImportBridgePass_v1.0.0_BUILD

```txt
Status: BUILD
Readiness: send to build
Target: controlled Studio GLB import bridge
Boundary: Studio-only; no uncontrolled Wall asset loading
```

## 1. Purpose

0616J adds a controlled GLB import bridge for Studio custom assets.

The goal is **not** to replace the parametric custom object pipeline. The goal is to allow Studio to ingest a local `.glb` file, validate it, generate a safe Studio-local custom asset record, preview it in 3D Canvas, and prepare it for future controlled publishing without leaking raw file paths, oversized geometry, or authoring-only fields into actor manifests or Wall runtime.

```txt
local .glb file
→ validate file / scene / bounds / origin / scale
→ create Studio-local imported custom asset
→ register through existing asset authority
→ place by assetId
→ actor manifests stay assetId-only
```

## 2. Build Classification

```txt
studio-authoring-ux
custom-asset-pipeline
controlled-import-bridge
post-0616I
pre-runtime-hardening
```

## 3. Canonical Position

Parametric custom assets remain the primary WOS object authoring path.

GLB import is a **bridge**, not the default object model.

```txt
Primary path:
shapeRecipe + materialRecipe

Bridge path:
glbImportRecord + validated local preview object
```

0616J must treat imported GLB assets as Studio-local controlled assets until a later runtime pass explicitly defines safe Wall-side delivery.

## 4. Non-Goals

0616J must not add:

```txt
Wall-side GLB loading
publish bundle GLB binary transport
remote URL model loading
unvalidated asset paths
actor manifest GLB fields
texture upload pipeline
material editing for imported GLBs
mesh editing
animation playback
skeletal animation
LOD generation
asset compression
DRACO/KTX processing
CDN upload
```

## 5. Files In Scope

Expected new files:

```txt
studio/actors/glbImportStore.js
studio/views/glbImportController.js
```

Expected modified files:

```txt
studio/index.html
studio/studioShell.js
studio/styles.css
studio/actors/assetResolver.js
studio/views/actorObjectRenderLayer.js
studio/views/threeDCanvasView.js
```

Optional if needed:

```txt
studio/actors/customStudioAssetStore.js
studio/views/libraryController.js
```

Forbidden files for this pass:

```txt
wall/**
studio/systems/publish/**
wall/data/**
studio/actors/actorManifestStore.js
studio/actors/promotionGateController.js
```

## 6. Required New Store

Create:

```txt
studio/actors/glbImportStore.js
```

It owns Studio-local imported GLB metadata and object URLs.

### Storage Model

0616J may persist metadata in localStorage, but it must not assume browser object URLs survive reload.

```js
type WOSImportedGlbAsset = {
  id: string,
  key: string,
  label: string,
  source: 'studio-glb-import',
  editable: true,
  category: string,
  actorTypes: string[],
  tags: string[],
  defaultVariant: 'glb-preview',
  variants: {
    'glb-preview': {
      kind: 'glb-import-preview',
      renderVariant: string,
      minZoom: number,
      maxZoom: number
    }
  },
  glbImport: {
    importId: string,
    fileName: string,
    fileSizeBytes: number,
    mimeType: string,
    objectUrl: string | null,
    boundsM: {
      x: number,
      y: number,
      z: number
    },
    centerOffsetM: {
      x: number,
      y: number,
      z: number
    },
    scaleToMeters: number,
    normalized: boolean,
    validatedAt: string,
    status: 'ready' | 'missing-file' | 'invalid'
  },
  authoring: {
    editable: true,
    locked: false,
    version: '1.0.0',
    createdAt: string,
    updatedAt: string
  }
}
```

### Store API

```js
WOSGlbImportStore = {
  importFile(file, options),
  get(assetId),
  list(),
  remove(assetId),
  refreshObjectUrl(assetId, file),
  getObjectUrl(assetId),
  validateFile(file),
  validateScene(gltfScene),
  getSnapshot()
}
```

### ID Format

Imported GLB assets must use a distinct ID prefix:

```txt
studio.import.glb.<category>.<slug>.<nnn>
```

Examples:

```txt
studio.import.glb.prop.speaker-stack.001
studio.import.glb.vehicle.taxi-lowpoly.001
studio.import.glb.structure.rooftop-kioMAPBOX_SECRET_TOKEN_REMOVED
```

Do not reuse `studio.custom.*`. That prefix remains reserved for parametric custom assets from 0616D–0616I.

## 7. Import Validation Rules

### File Validation

Reject files when:

```txt
extension is not .glb
file is empty
file exceeds MAX_GLB_FILE_BYTES
file cannot be parsed by GLTFLoader
```

Required baseline constants:

```js
const MAX_GLB_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BOUNDS_M = 200;
const MIN_BOUNDS_M = 0.01;
const DEFAULT_SCALE_TO_METERS = 1;
```

### Scene Validation

After parse, traverse the loaded scene and validate:

```txt
at least one mesh exists
bounds are finite
bounds are not zero
bounds do not exceed MAX_BOUNDS_M after normalization
scene center can be calculated
no NaN transforms
no infinite transforms
```

Reject if bounds are invalid.

Warn, but do not necessarily reject:

```txt
too many meshes
too many materials
textures present
animations present
skinning present
```

This pass may ignore animations and skins.

## 8. Normalization Contract

Imported GLB preview objects must be normalized in Studio before placement.

Normalization must:

```txt
center object around local origin
place base near z=0 when possible
apply scaleToMeters
preserve visible orientation unless explicit rotation is needed
store calculated bounds in glbImport.boundsM
```

The object must render at the actor anchor without drifting due to model offset.

## 9. Library Integration

Imported GLB assets must register through the existing `ActorAssetLibraryAuthority.registerAsset()` path.

No parallel library list is allowed.

Asset rows must show a distinct badge:

```txt
Imported GLB
```

Imported GLB assets must be searchable through existing Library search by:

```txt
label
assetId
category
fileName
tags
```

0616I Custom Objects management may optionally display imported GLB assets in a separate section, but it must not merge them into `WOSCustomStudioAssetStore` parametric custom assets.

## 10. Inspector UI

Add a Studio-only import section in the Library/Inspector surface.

Minimum UI:

```txt
Import GLB button / file input
label input
category dropdown
scaleToMeters field
status summary
bounds summary
warnings list
Create Imported Asset
```

Recommended section title:

```txt
GLB Import Bridge
```

After import succeeds, show:

```txt
assetId
fileName
fileSizeBytes
boundsM
centerOffsetM
scaleToMeters
status
warnings
```

## 11. Render Integration

`actorObjectRenderLayer.js` must support rendering imported GLB assets in Studio preview.

Priority order:

```txt
live shape preview
→ saved parametric shapeRecipe
→ imported GLB objectUrl preview
→ category proxy default
```

For imported GLB assets:

```txt
resolve actor.assetId
if asset.source === 'studio-glb-import'
  load glbImport.objectUrl with GLTFLoader
  normalize clone/group
  attach to actor Object3D
else
  existing path
```

If objectUrl is missing after reload, render a clear fallback proxy and mark the asset as missing-file in debug/state.

Do not store objectUrl in actor manifest.

## 12. Placement Contract

Imported GLB assets must place exactly like other assets:

```txt
select imported GLB asset
→ arm placement
→ click map
→ actor manifest stores assetId only
→ render layer resolves imported GLB preview object
```

Actor manifest must not gain:

```txt
glbPath
glbUrl
glbObjectUrl
fileName
fileSizeBytes
glbImport
glbImportRecord
localFilePath
meshBounds
meshScale
```

All imported GLB details live on the imported asset record only.

## 13. Governance Boundary

0616J does not make imported GLB assets promotion-ready.

Promotion behavior for imported GLB actors should be conservative:

```txt
DRAFT placement: allowed
GATE_PENDING / PROMOTED: blocked unless later governance pass permits
```

If an imported GLB actor is submitted to the existing promotion gate, the current behavior must fail or warn closed until a later GLB governance pass defines the safe path.

0616J must not loosen 0616G custom asset promotion rules.

## 14. Debug Surface

Add:

```js
_wos.debug.studio.glbImport()
_wos.debug.studio.importedGlbAssets()
_wos.debug.studio.importedGlbAsset(assetId)
```

Expected snapshot:

```js
{
  enabled: true,
  importedAssetCount,
  readyCount,
  missingFileCount,
  invalidCount,
  selectedImportedAssetId,
  lastImportAssetId,
  lastImportStatus,
  lastImportWarnings,
  lastError
}
```

## 15. Acceptance Criteria

### AC1 — GLB file input exists

A Studio user can choose a local `.glb` file from the Library/Inspector UI.

### AC2 — Invalid files are rejected

Non-GLB, empty, oversized, or parse-failing files are rejected with visible status.

### AC3 — Valid GLB creates imported asset

A valid GLB creates an asset record with:

```txt
source: studio-glb-import
id prefix: studio.import.glb.
glbImport metadata
```

### AC4 — Existing asset authority is used

Imported assets appear in the existing Library through `ActorAssetLibraryAuthority.registerAsset()`.

No parallel asset list is introduced.

### AC5 — Imported GLB places by assetId only

Placed actors using imported GLB assets store only `assetId` in actor manifests.

### AC6 — Studio render layer previews imported GLB

A placed imported GLB actor renders the loaded model in 3D Canvas.

### AC7 — Reload-safe degradation

If Studio reloads and objectUrl is gone, imported GLB actors degrade to a clear proxy/missing-file state instead of crashing.

### AC8 — No Wall or publish changes

This pass must not touch:

```txt
wall/**
studio/systems/publish/**
wall/data/**
```

### AC9 — No actor manifest leakage

The following grep must return no matches in actor manifests or publish code touched by 0616J:

```bash
grep -R "glbPath\|glbUrl\|glbObjectUrl\|glbImport\|glbImportRecord\|localFilePath\|meshBounds\|meshScale\|fileSizeBytes" studio/actors wall/data studio/systems/publish 2>/dev/null
```

Exception: `glbImportStore.js` may contain these terms because imported GLB metadata belongs to the asset store.

### AC10 — Debug snapshot exists

```js
_wos.debug.studio.glbImport()
```

returns a usable snapshot.

### AC11 — Parametric custom path remains primary

Existing `studio.custom.*` assets continue to save, edit, place, promote, and publish as before.

### AC12 — No promotion loosening

Imported GLB actors are not silently allowed through the custom asset promotion path.

## 16. Suggested Implementation Notes

Use `THREE.GLTFLoader` if already available. If not available, add a Studio-local script dependency only in `studio/index.html`.

Do not add GLTFLoader to Wall in 0616J.

Normalize imported model inside a wrapper group:

```js
var wrapper = new THREE.Group();
wrapper.name = 'ImportedGLBPreview:' + assetId;
wrapper.add(scene);
```

Keep the original parsed scene separate from actor manifests. Cloning for multiple actors is allowed if safe.

## 17. Forbidden Output

0616J must not create actor manifests like:

```json
{
  "assetId": "studio.import.glb.prop.speaker-stack.001",
  "glbPath": "./local/file.glb",
  "glbImport": { "fileName": "speaker.glb" }
}
```

Correct actor manifest shape:

```json
{
  "assetId": "studio.import.glb.prop.speaker-stack.001"
}
```

## 18. Ship Gate

```txt
A local GLB can be imported into Studio as a controlled imported asset, selected from the existing Library, placed on the 3D Canvas, and preview-rendered by assetId, without leaking file/model metadata into actor manifests, publish bundles, or Wall runtime.
```

## 19. Next Build

```txt
0616K_WOS_MapObjectCompositionPass_v1.0.0_BUILD
```

Purpose:

```txt
custom/imported objects
→ group into reusable map compositions
→ place kits such as rooftop sets, stages, kiosks, docks, signage clusters
→ preserve assetId-only actor manifests
```
