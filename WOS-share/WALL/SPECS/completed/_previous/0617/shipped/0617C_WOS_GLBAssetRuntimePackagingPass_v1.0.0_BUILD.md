# 0617C_WOS_GLBAssetRuntimePackagingPass_v1.0.0_BUILD

```txt
Status: [BUILD]
Build Target: WOS Studio + Broadcast Runtime
Build Type: Asset Runtime Packaging / GLB Publish Bridge
Version: v1.0.0
Date: 2026-06-17
```

## 1. Purpose

0617C converts imported Studio GLBs from session-local authoring assets into publishable, runtime-loadable Broadcast assets.

Current Studio can import `.glb` files, validate them, register them as assets, place them on Map, and track broadcast readiness. However, imported GLBs still depend on browser object URLs and local re-attachment. That is acceptable for Studio preview, but not acceptable for Broadcast.

This pass creates the missing bridge:

```txt
Imported Studio GLB
→ packaged local runtime file
→ stable package reference
→ sanitized bundle record
→ Broadcast runtime loads GLB from approved package path
→ fallback proxy if unavailable / over budget / blocked
```

## 2. Classification

```txt
System Layer: Studio Asset Pipeline + Broadcast Runtime Asset Loading
Authority Class: Asset Packaging Authority
Build Readiness: BUILD
User-Facing: Yes
Wall/Broadcast Runtime Touch: Yes, bounded
Actor Manifest Schema Change: No
```

## 3. Non-Goals

Do **not** build any of the following in this pass:

```txt
native 3D modeling editor
full Canvas staging editor
mesh editing
UV editor
texture painting system
AI 3D generator
remote cloud hosting
asset marketplace
animation runtime
physics runtime
composition publish changes
building texture package system
```

0617C is only the bridge from **local imported GLB** to **safe Broadcast-loadable packaged GLB**.

## 4. Architectural Rule

Actor manifests remain clean.

A placed actor may reference only:

```txt
assetId
actorCategory
actorType
anchor
lod
liveTracking
structure/material override fields already approved by prior passes
meta
```

A placed actor must **not** contain:

```txt
objectUrl
file
blob
arrayBuffer
base64
localPath
glbBinary
glbScene
glbRuntimeUrl
glbPackagePath
glbPackageRecord
meshCount
materialCount
textureCount
boundsM
sourceFileName
```

The GLB package belongs to asset authority, not actor authority.

## 5. Current State

The existing system supports:

```txt
Studio .glb import
file validation
scene validation
object URL preview
metadata persistence
assetId registration
Map placement
broadcast readiness analysis
publish blocking for BLOCK assets
fallback proxy diagnostics
```

But the actual GLB binary is not yet published to Broadcast.

The problem:

```txt
objectUrl = browser session only
metadata = persistent
Broadcast = cannot load actual model after publish
```

0617C fixes that by creating a local package output path and a sanitized runtime record.

## 6. Target Outcome

After 0617C:

```txt
1. User imports a .glb into Studio.
2. Studio stores/re-attaches it in the GLB Import Bridge.
3. User packages the imported GLB for Broadcast.
4. Studio writes the .glb into an approved local runtime asset directory.
5. The imported asset record receives a stable package reference.
6. Published bundle includes a sanitized glbAssets block.
7. Broadcast runtime loads the packaged .glb by assetId.
8. If the package is missing, blocked, or unsafe, Broadcast renders fallback proxy.
```

## 7. File / Directory Targets

### New files

```txt
studio/actors/glbRuntimePackageStore.js
wall/systems/runtime/wallRuntimeGlbAssetRegistry.js
```

### Modified files

```txt
studio/actors/glbImportStore.js
studio/views/glbImportController.js
studio/views/actorObjectRenderLayer.js
studio/systems/publish/studioPublisher.js
studio/studioShell.js
studio/index.html
studio/styles.css
wall/index.html
wall/systems/runtime/wallRuntimeBundleLoader.js
wall/systems/runtime/wallRuntimeDiagnostics.js
wall/systems/runtime/wallRuntimeActorFilter.js
wall/systems/runtime/wallRuntimeCustomAssetRegistry.js
```

### Optional local server modification

```txt
studio/systems/publish/localPublishServer.js
```

Only modify `localPublishServer.js` if the current server is the correct authority for writing packaged asset files.

## 8. Runtime Asset Package Location

Packaged GLBs must be written under a stable Broadcast-readable path:

```txt
wall/assets/glb/
```

Package filename format:

```txt
<safeAssetSlug>__<shortHash>.glb
```

Example:

```txt
wall/assets/glb/studio_import_glb_vehicle_delivery_van__a91c33.glb
```

Runtime URL stored in bundle:

```txt
./assets/glb/studio_import_glb_vehicle_delivery_van__a91c33.glb
```

No absolute local filesystem paths may enter the bundle.

No browser object URLs may enter the bundle.

## 9. New Module: `glbRuntimePackageStore.js`

Create `studio/actors/glbRuntimePackageStore.js`.

Responsibilities:

```txt
track packaged GLB records
calculate stable package ids
sanitize package metadata
record package status
link imported assetId → package record
expose snapshot/debug data
```

Storage key:

```txt
wos.studio.glbRuntimePackages.v1
```

Package record shape:

```js
{
  packageId: "glb.pkg.<slug>.<hash>",
  assetId: "studio.import.glb.vehicle.delivery_van.001",
  source: "studio-glb-runtime-package",
  status: "packaged" | "missing-file" | "stale" | "blocked" | "error",
  fileName: "delivery_van.glb",
  packageFileName: "studio_import_glb_vehicle_delivery_van__a91c33.glb",
  runtimeUrl: "./assets/glb/studio_import_glb_vehicle_delivery_van__a91c33.glb",
  fileSizeBytes: 123456,
  contentHash: "a91c33...",
  packagedAt: "ISO_DATE",
  validatedAt: "ISO_DATE",
  broadcastReadiness: "READY" | "WARN" | "DEGRADE" | "BLOCK" | "UNKNOWN",
  metadata: {
    meshCount: 0,
    materialCount: 0,
    textureWarningCount: 0,
    animationWarningCount: 0,
    skinningWarningCount: 0,
    boundsM: { x: 0, y: 0, z: 0 },
    scaleToMeters: 1
  }
}
```

Forbidden in package records:

```txt
File
Blob
ArrayBuffer
objectUrl
localPath
absolutePath
base64
glbScene
threeObject
```

## 10. Packaging Flow

Add package action to imported GLB detail UI.

User-facing button:

```txt
Package for Broadcast
```

Flow:

```txt
1. Require imported GLB asset exists.
2. Require objectUrl / attached file is currently available.
3. Require broadcast readiness is not BLOCK.
4. Send binary file to local package writer.
5. Write to wall/assets/glb/<packageFileName>.glb.
6. Create or update glbRuntimePackageStore record.
7. Mark imported asset as packaged.
8. Refresh GLB import row with package status badge.
```

If file is not attached:

```txt
status: missing-file
message: Re-attach GLB before packaging for Broadcast.
```

If readiness is BLOCK:

```txt
status: blocked
message: Cannot package BLOCK asset. Fix GLB or reduce complexity.
```

## 11. Local Package Writer

Preferred approach:

Use existing local publish server if available.

Add endpoint:

```txt
POST /wos/package-glb
```

Expected request:

```txt
multipart/form-data
- assetId
- packageFileName
- file
- metadata JSON
```

Expected response:

```js
{
  ok: true,
  packageId: "glb.pkg.<slug>.<hash>",
  runtimeUrl: "./assets/glb/<file>.glb",
  fileSizeBytes: 123456,
  contentHash: "..."
}
```

If the local server is not running:

```txt
UI must show: Local package server unavailable.
No fake success.
No bundle record.
```

## 12. Publish Bundle Extension

Add sanitized `glbAssets` block to published bundle.

Bundle shape:

```js
{
  glbAssets: {
    schema: "wos.glbRuntimeAssets.v1",
    generatedAt: "ISO_DATE",
    assets: [
      {
        assetId: "studio.import.glb.vehicle.delivery_van.001",
        packageId: "glb.pkg.delivery_van.a91c33",
        source: "studio-glb-runtime-package",
        runtimeUrl: "./assets/glb/delivery_van__a91c33.glb",
        fileSizeBytes: 123456,
        contentHash: "a91c33...",
        broadcastReadiness: "READY",
        boundsM: { x: 1.2, y: 0.9, z: 2.1 },
        scaleToMeters: 1,
        meshCount: 4,
        materialCount: 3
      }
    ]
  }
}
```

Do not include:

```txt
objectUrl
localPath
absolutePath
file handles
binary payloads
base64
validation warnings containing local paths
raw imported store records
```

## 13. Publish Blocking Rules

Publishing must fail closed if a promoted actor references an imported GLB asset and:

```txt
package record missing
package status is missing-file
package status is blocked
runtimeUrl missing
broadcast readiness is BLOCK
```

Publishing may warn but continue if:

```txt
readiness is WARN
readiness is DEGRADE
package status is packaged
runtimeUrl exists
```

In WARN/DEGRADE cases, Broadcast runtime may render fallback depending on readiness policy.

## 14. Wall Runtime Module: `wallRuntimeGlbAssetRegistry.js`

Create `wall/systems/runtime/wallRuntimeGlbAssetRegistry.js`.

Responsibilities:

```txt
activate(bundle.glbAssets)
validate records
store assetId → glb runtime record
expose get(assetId)
expose has(assetId)
expose list()
expose clear()
expose getSnapshot()
```

It must be read-only.

It must not fetch Studio localStorage.

It must not read Studio import records.

It must only consume the published bundle.

Debug surface:

```js
_wos.debug.wall.glbAssets()
_wos.debug.wall.glbAsset(assetId)
```

## 15. Wall Render Integration

Update Broadcast actor rendering so imported GLB assets can resolve:

```txt
actor.assetId
→ wallRuntimeGlbAssetRegistry.get(assetId)
→ runtimeUrl
→ GLB load
→ render model
```

If load fails:

```txt
render fallback proxy
increment diagnostics.glbAssetLoadErrorCount
increment diagnostics.broadcastFallbackRenderCount
```

If readiness is DEGRADE/BLOCK:

```txt
render fallback proxy unless explicitly allowed by readiness policy
increment diagnostics.glbAssetDegradedCount or glbAssetBlockedCount
```

## 16. Diagnostics

Extend Wall diagnostics counters:

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

Studio debug:

```js
_wos.debug.studio.glbRuntimePackages()
_wos.debug.studio.glbRuntimePackage(assetId)
_wos.debug.studio.packageImportedGlb(assetId)
```

Wall debug:

```js
_wos.debug.wall.glbAssets()
_wos.debug.wall.glbAsset(assetId)
```

## 17. UI Changes

### GLB Import row badges

Add package status badge:

```txt
unpackaged
packaged
missing-file
stale
blocked
error
```

### Imported GLB detail panel

Add fields:

```txt
Package Status
Package ID
Runtime URL
Packaged At
Content Hash
File Size
```

Add actions:

```txt
Package for Broadcast
Re-package
Re-attach File
Remove
```

Only show `Re-package` after an existing package record exists.

## 18. Actor Manifest Filter

Extend forbidden fields in `wallRuntimeActorFilter.js`:

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

These fields are allowed only in `bundle.glbAssets.assets[]`, not in actor manifests.

## 19. Acceptance Criteria

### AC1 — Packaging module exists

`glbRuntimePackageStore.js` exists and manages package records by `assetId`.

### AC2 — Package action exists

Imported GLB detail UI exposes `Package for Broadcast`.

### AC3 — Missing file blocks packaging

If imported GLB file is not attached, packaging fails with a clear `missing-file` message.

### AC4 — BLOCK readiness blocks packaging

A GLB with broadcast readiness `BLOCK` cannot be packaged.

### AC5 — Package file is written

A successful package writes a `.glb` file under:

```txt
wall/assets/glb/
```

### AC6 — Runtime URL is relative

Stored runtime URL is relative and Broadcast-safe:

```txt
./assets/glb/<file>.glb
```

### AC7 — Bundle includes sanitized glbAssets block

Published bundle contains:

```txt
bundle.glbAssets.schema = wos.glbRuntimeAssets.v1
bundle.glbAssets.assets[]
```

### AC8 — Bundle contains no forbidden local handles

`bundle.glbAssets` contains no:

```txt
objectUrl
File
Blob
localPath
absolutePath
base64
```

### AC9 — Actor manifests remain assetId-only

Promoted actors referencing imported GLBs still contain only `assetId`.

### AC10 — Publish fails closed for unpackaged promoted GLB actors

If a promoted actor uses an imported GLB with no package record, publish fails.

### AC11 — Wall registry activates

`wallRuntimeGlbAssetRegistry.js` loads records from `bundle.glbAssets`.

### AC12 — Broadcast can resolve GLB by assetId

Broadcast actor render path can resolve:

```txt
actor.assetId → glbAssets runtimeUrl
```

### AC13 — Broadcast fallback works

If GLB load fails, fallback proxy renders and diagnostics increment.

### AC14 — Diagnostics update

Wall diagnostics include GLB package counters.

### AC15 — No Canvas editor work

This pass does not implement blank Canvas editing/staging.

### AC16 — No building texture work

This pass does not implement building texture packages.

## 20. Manual Test Plan

### Test 1 — Package normal GLB

```txt
1. Import small .glb in Studio.
2. Confirm it appears as imported GLB asset.
3. Click Package for Broadcast.
4. Confirm package status = packaged.
5. Confirm file exists in wall/assets/glb/.
6. Place asset on Map.
7. Promote actor.
8. Publish.
9. Open Broadcast.
10. Confirm GLB renders or fallback proxy renders with no crash.
```

### Test 2 — Missing file

```txt
1. Reload Studio after importing GLB.
2. Do not re-attach file.
3. Try Package for Broadcast.
4. Confirm packaging is blocked with missing-file.
```

### Test 3 — BLOCK asset

```txt
1. Import or simulate over-budget GLB.
2. Confirm broadcast readiness BLOCK.
3. Try Package for Broadcast.
4. Confirm packaging blocked.
```

### Test 4 — Publish fail-closed

```txt
1. Place imported GLB actor.
2. Promote it without packaging.
3. Publish.
4. Confirm publish fails with unpackaged GLB asset message.
```

### Test 5 — Sanitization

```txt
1. Publish packaged GLB actor.
2. Inspect bundle.
3. Confirm actor only has assetId.
4. Confirm glbAssets block has runtimeUrl.
5. Confirm no objectUrl/localPath/base64 exists anywhere in actor manifests.
```

## 21. Implementation Notes

The package writer may be local-only for now.

Do not overbuild cloud hosting. The immediate requirement is local Broadcast reliability.

The system should support future replacement of local runtime URL with CDN/hosted URL, but that is not required here.

## 22. Completion Definition

0617C is complete when:

```txt
Imported GLB can be packaged into a Broadcast-readable runtime file.
Published bundle includes sanitized glbAssets records.
Broadcast resolves packaged GLB assets by assetId.
Unpackaged promoted GLB actors fail publish.
Runtime fallback remains safe.
Actor manifests remain clean.
```

## 23. Next Candidate Pass

After 0617C closes, the next likely pass is:

```txt
0617D_WOS_CanvasStagingSurfacePass_v1.0.0_BUILD
```

Purpose:

```txt
blank Canvas staging
→ preview selected GLB/custom object
→ scale/orientation/material inspection
→ stage before Map placement
```

Do not start 0617D until GLB runtime packaging is accepted.
