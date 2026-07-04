# 0618B_WOS_BuildingTexturePackageAuthoringPass_v1.0.0_BUILD

## Status

```txt
BUILD SPEC / READY FOR IMPLEMENTATION
```

## Purpose

0618B adds a governed texture-package authoring path for WOS buildings.

The goal is **not** to generate textures inside WOS. The goal is to let externally created image textures become Studio-managed, publish-safe building surface packages that can be assigned to selected buildings and applied in Broadcast.

```txt
external texture images
→ Studio texture package records
→ assign to building/material slots
→ publish-safe bundle texture block
→ Broadcast loads approved texture files
→ building surface runtime applies texture package
```

## Locked product rule

```txt
WOS does not create final texture art.
WOS imports, packages, assigns, governs, publishes, and applies texture packages.
```

## Scope

### In scope

- Import image textures in Studio.
- Package image texture files for Broadcast runtime.
- Create metadata-only Studio texture package records.
- Assign texture packages to selected buildings.
- Support material slot mapping.
- Publish sanitized building texture package records.
- Wall/Broadcast runtime registry for approved building textures.
- Apply approved texture packages to selected/replaced/overridden buildings.
- Fallback to existing color/material override when texture cannot load.
- Diagnostics and debug surfaces.

### Out of scope

- AI texture generation.
- Procedural texture synthesis.
- Full UV editing.
- Texture painting in Studio.
- General object/GLB texturing.
- Terrain, roads, water, labels, or map-wide raster styling.
- Any mutation of actor manifests.

## Architecture boundary

0618B belongs to the **building/material package lane**, not actor placement.

```txt
Building authoring selection
→ Building texture package store
→ Building material assignment
→ Studio publish bundle
→ Wall texture registry
→ Building surface application runtime
```

Actor manifests remain untouched.

```txt
Actors = assetId-only manifests.
Buildings = building replacement/material/texture authority.
Textures = package records, never actor fields.
```

## Required files

### New Studio files

```txt
studio/buildings/buildingTexturePackageStore.js
studio/buildings/buildingTextureAssignmentController.js
```

### New Wall files

```txt
wall/systems/runtime/wallRuntimeBuildingTextureRegistry.js
wall/systems/runtime/wallRuntimeBuildingTextureApplicator.js
```

### Modified files

```txt
studio/systems/publish/localPublishServer.js
studio/systems/publish/studioPublisher.js
studio/studioShell.js
studio/index.html
studio/styles.css
wall/index.html
wall/systems/runtime/wallRuntimeBundleLoader.js
wall/systems/runtime/wallRuntimeDiagnostics.js
wall/systems/runtime/wallRuntimeActorFilter.js
```

## Data model

### Studio texture package record

```js
{
  packageId: 'building.tex.pkg.<slug>.<hash>',
  label: 'Concrete Organic Patch 01',
  source: 'studio-building-texture-package',
  status: 'packaged',

  // package metadata
  imageFileName: 'concrete_patch_01.png',
  packageFileName: 'building_tex_concrete_patch_01__a1b2c3.png',
  runtimeUrl: './assets/textures/buildings/building_tex_concrete_patch_01__a1b2c3.png',
  contentHash: '<sha256>',
  fileSizeBytes: 123456,
  mimeType: 'image/png',
  width: 1024,
  height: 1024,

  // authoring metadata
  materialClass: 'facade',
  textureRole: 'baseColor',
  repeat: { x: 1, y: 1 },
  rotationDeg: 0,
  opacity: 1,
  blendMode: 'multiply',
  colorTint: null,

  createdAt: '<iso>',
  updatedAt: '<iso>'
}
```

### Building texture assignment record

Assignments are building-scoped, not actor-scoped.

```js
{
  assignmentId: 'building.texture.assign.<buildingKey>.<packageId>',
  buildingKey: '<sourceId>|<sourceLayer>|<featureId>',
  packageId: 'building.tex.pkg.<slug>.<hash>',

  target: {
    sourceId: 'composite',
    sourceLayer: 'building',
    featureId: '<feature id>',
    centroid: { lat: 40.712, lon: -74.006 }
  },

  slots: {
    facade: {
      packageId: 'building.tex.pkg.<slug>.<hash>',
      textureRole: 'baseColor',
      repeat: { x: 1, y: 1 },
      rotationDeg: 0,
      opacity: 1,
      blendMode: 'multiply'
    }
  },

  authoredAt: '<iso>',
  updatedAt: '<iso>'
}
```

### Published bundle block

```js
{
  buildingTextures: {
    schema: 'wos.wall.buildingTextures',
    version: '1.0.0',
    generatedAt: '<iso>',
    packages: [
      {
        packageId: 'building.tex.pkg.<slug>.<hash>',
        source: 'studio-building-texture-package',
        runtimeUrl: './assets/textures/buildings/<file>.png',
        contentHash: '<sha256>',
        fileSizeBytes: 123456,
        mimeType: 'image/png',
        width: 1024,
        height: 1024,
        materialClass: 'facade',
        textureRole: 'baseColor'
      }
    ],
    assignments: [
      {
        buildingKey: '<sourceId>|<sourceLayer>|<featureId>',
        target: {
          sourceId: 'composite',
          sourceLayer: 'building',
          featureId: '<feature id>',
          centroid: { lat: 40.712, lon: -74.006 }
        },
        slots: {
          facade: {
            packageId: 'building.tex.pkg.<slug>.<hash>',
            textureRole: 'baseColor',
            repeat: { x: 1, y: 1 },
            rotationDeg: 0,
            opacity: 1,
            blendMode: 'multiply'
          }
        }
      }
    ]
  }
}
```

## Accepted image formats

Minimum supported formats:

```txt
.png
.jpg
.jpeg
.webp
```

Recommended constraints:

```txt
max file size: 8 MB
max dimensions: 4096 × 4096
preferred: 1024 or 2048 square textures
```

Reject:

```txt
svg
pdf
gif animation
video
blob-only records
external URLs
absolute paths
base64 persistence
```

## Local package endpoint

Extend `localPublishServer.js` with:

```txt
POST /wos/package-building-texture
```

Headers:

```txt
X-Package-Filename
X-Metadata
Content-Type: application/octet-stream
```

Write target:

```txt
wall/assets/textures/buildings/
```

Filename rule:

```txt
building_tex_<slug>__<hash>.<ext>
```

Required server behavior:

- Validate filename format.
- Validate extension allowlist.
- Reject empty body.
- Create directory if missing.
- Compute SHA-256 content hash.
- Write atomically through temp file then rename.
- Return `runtimeUrl`, `fileSizeBytes`, `contentHash`, `packageFileName`.

## Studio UI

### Library surface

Add a collapsed section under Library:

```txt
Building Textures
```

Controls:

```txt
Import Texture
Package for Broadcast
Re-package
Remove
```

Rows show:

```txt
label
status: draft / packaged / missing-file / blocked
dimensions
file size
material class
package id
```

### Inspector surface

When a building is selected, show:

```txt
Building Texture
- Assigned Package
- Slot: Facade
- Repeat X/Y
- Rotation
- Opacity
- Blend Mode
- Apply Package
- Reset Texture
```

The building inspector should remain the main editing place. Do not add a large toolbar.

## Assignment behavior

Default behavior:

```txt
Click building
→ Inspector shows building
→ choose texture package
→ Apply
```

No separate “Select Building” primary toolbar button.

Selection stays cursor-based from existing building selection controller.

## Publisher requirements

`studioPublisher.js` must collect only used texture packages.

A package is publish-eligible when:

```txt
status === 'packaged'
runtimeUrl is relative
contentHash exists
mimeType is allowed
width/height within budget
```

Fail closed when:

```txt
assignment references missing package
assignment references unpackaged package
runtimeUrl is blob:/file:/http:/https:
package record contains binary/base64/objectUrl/local path
image dimensions exceed budget
```

Publish must sanitize records.

Forbidden fields:

```txt
objectUrl
blob
file
File
Blob
ArrayBuffer
base64
localPath
absolutePath
sourceFile
imageElement
canvas
bitmap
```

## Wall runtime registry

`wallRuntimeBuildingTextureRegistry.js` should:

- Consume `bundle.buildingTextures` only.
- Store package records by `packageId`.
- Store assignment records by `buildingKey`.
- Reject unsafe runtime URLs.
- Reject unsupported MIME types.
- Never read Studio localStorage.
- Never mutate bundle records.
- Expose debug methods.

Debug:

```js
_wos.debug.wall.buildingTextures()
_wos.debug.wall.buildingTexture(packageId)
_wos.debug.wall.buildingTextureAssignment(buildingKey)
```

## Wall runtime applicator

`wallRuntimeBuildingTextureApplicator.js` should:

- Load approved runtime textures.
- Apply textures to selected building replacements/material overrides where possible.
- Fall back to existing material/color override if texture load fails.
- Never block Wall boot.
- Cache loaded textures by `packageId`.
- Dispose old texture resources on clear/reload.

Minimum application target:

```txt
Studio-authored building replacements / texture-aware building material runtime
```

If direct Mapbox building UV assignment is unavailable, the applicator must degrade safely and report diagnostics rather than claiming success.

## Diagnostics

Extend `wallRuntimeDiagnostics.js` with:

```txt
buildingTexturePackageCount
buildingTextureAssignmentCount
buildingTextureLoadedCount
buildingTextureLoadErrorCount
buildingTextureFallbackCount
buildingTextureRejectedCount
buildingTextureRegistryReady
```

Reset and snapshot all counters.

## Acceptance criteria

### AC1 — Import texture

A user can import a supported texture image in Studio and see it as a Building Texture package row.

### AC2 — Package texture

A user can package the texture for Broadcast; the binary is written to:

```txt
wall/assets/textures/buildings/
```

### AC3 — Metadata-only persistence

Studio localStorage/package records must never persist binary, base64, object URLs, or File/Blob objects.

### AC4 — Building assignment

A selected building can receive a texture package assignment through Inspector.

### AC5 — Bundle emission

Publishing emits a sanitized `bundle.buildingTextures` block containing only used eligible packages and assignments.

### AC6 — Fail closed

Publish blocks when a building assignment references an unpackaged/missing/unsafe texture package.

### AC7 — Wall registry

Wall activates the texture registry from `bundle.buildingTextures` and exposes debug state.

### AC8 — Runtime application

Wall attempts to apply approved texture packages to building surfaces or texture-aware replacements.

### AC9 — Safe fallback

Texture load failure does not break Wall boot or building rendering; fallback material/color remains visible.

### AC10 — Diagnostics

Wall diagnostics expose package count, assignment count, load count, error count, fallback count, rejected count, and registry-ready state.

### AC11 — No actor mutation

No building texture package fields appear on actor manifests.

### AC12 — No external URL loading

Wall rejects `blob:`, `file:`, `http://`, and `https://` runtime URLs for texture packages.

### AC13 — No toolbar regression

Do not reintroduce Map toolbar clutter. Building texture assignment belongs in Inspector.

### AC14 — Broadcast-first proof

At least one selected/replaced building can show either:

```txt
approved texture applied
```

or explicit diagnostic fallback:

```txt
texture application unavailable, fallback material used
```

No silent fake success.

## Debug checklist

In Studio console:

```js
_wos.debug.studio && _wos.debug.studio.buildingTextures && _wos.debug.studio.buildingTextures()
```

In Wall console:

```js
_wos.debug.wall.buildingTextures()
WOSWallDiagnostics.snapshot()
```

Expected fields:

```txt
buildingTexturePackageCount
buildingTextureAssignmentCount
buildingTextureLoadedCount
buildingTextureLoadErrorCount
buildingTextureFallbackCount
buildingTextureRejectedCount
buildingTextureRegistryReady
```

## Implementation notes

### Texture package store

Use the GLB packaging pattern from 0617C, but do not reuse GLB naming. Texture packages are separate authority.

```txt
WOSGlbRuntimePackageStore ≠ WOSBuildingTexturePackageStore
```

### Building assignment authority

Use the existing building selection/replacement/material override path. Do not create an actor to represent a building texture.

### Rendering reality

Mapbox building layers may not expose usable UVs. The first valid runtime target can be texture-aware building replacement meshes or generated building surface meshes. If direct basemap texture application is impossible, record explicit fallback diagnostics.

## Non-goals reminder

```txt
Do not build a texture generator.
Do not build a Photoshop clone.
Do not expose raw JSON by default.
Do not mutate actors.
Do not publish object URLs.
Do not load remote texture URLs.
Do not add another Map toolbar.
```

## Close condition

0618B closes only when this chain is proven:

```txt
Import texture
→ Package for Broadcast
→ Assign to selected building
→ Publish bundle.buildingTextures
→ Wall activates registry
→ Wall applies texture or emits explicit fallback diagnostic
```
