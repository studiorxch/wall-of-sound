# 0616L_WOS_BroadcastReadyCustomObjectPass_v1.0.0_BUILD

```txt
STATUS: [BUILD]
BUILD_READY: YES
SPEC_ID: 0616L_WOS_BroadcastReadyCustomObjectPass_v1.0.0_BUILD
DATE: 2026-06-16
SYSTEM: WOS Studio / Wall Runtime / 3D Canvas Lab
PASS: Broadcast Ready Custom Object
```

## 1. Purpose

This pass makes the custom-object pipeline broadcast-safe.

By 0616K, Studio can create reusable parametric custom assets, import controlled GLB assets, manage custom object libraries, publish custom asset records to Wall, and group placed objects into Studio-only compositions.

0616L adds the missing stability layer:

```txt
custom objects + imported GLBs + compositions
→ enforce broadcast-safe budgets
→ expose object complexity diagnostics
→ degrade unsafe visuals gracefully
→ preserve actor assetId authority
→ protect Wall / OBS runtime stability
```

This is a hardening pass, not a new creative feature pass.

## 2. Classification

```txt
LAYER: Studio + Wall runtime safety layer
AUTHORITY: Broadcast readiness / diagnostics / budget enforcement
RUNTIME IMPACT: controlled Wall diagnostics + degradation only
PUBLISH IMPACT: additive safe metadata only
MANIFEST IMPACT: no actor schema change
```

## 3. Current State

The pipeline now supports:

```txt
0616A starter asset pack
0616B parametric proxy shape editor
0616C object material authoring
0616D custom Studio asset save
0616E custom asset placement
0616F custom asset edit / fork / update
0616G custom asset governance gate
0616H custom asset publish runtime
0616I custom object library management
0616J GLB import bridge
0616K Studio map object compositions
```

The remaining risk is broadcast stability:

```txt
too many visible custom actors
large imported GLBs
high mesh/material count
missing GLB object URLs
unbounded composition expansion
visual detail too high for OBS capture
runtime failures from bad custom asset records
```

## 4. Target Outcome

After 0616L:

```txt
Studio can show whether custom objects are broadcast-safe
Publish can include sanitized broadcast readiness summaries
Wall can count custom/imported actors and degrade unsafe visuals
Diagnostics expose budget pressure and failure modes
No actor manifests gain recipe, GLB, composition, or budget fields
```

## 5. Non-Goals

This pass must not:

```txt
change actor manifest schema
publish compositions as Wall runtime entities
add nested compositions
add GLB binary/file publishing
serialize GLB object URLs
add texture baking
add real LOD mesh generation for imported GLBs
create a new actor lifecycle state
replace PromotionGateController
change custom asset recipe formats
change composition recipe formats
```

## 6. Architectural Rule

Broadcast readiness is an assessment layer.

It must not become actor authority.

```txt
actor manifest = identity + anchor + assetId
custom asset record = reusable visual recipe
composition = Studio placement recipe
broadcast readiness = diagnostic / budget / degradation metadata
```

No actor manifest may contain:

```txt
broadcastReady
broadcastBudget
renderBudget
lodProfile
meshCount
materialCount
glbComplexity
compositionComplexity
customAssetBudget
objectComplexityScore
```

## 7. Broadcast Readiness Levels

Use these readiness states:

```txt
READY
WARN
DEGRADE
BLOCK
UNKNOWN
```

Meaning:

| State | Meaning |
|---|---|
| READY | Safe for broadcast under current limits |
| WARN | Usable, but near limits |
| DEGRADE | Must render with fallback / lower detail |
| BLOCK | Must not publish or render as rich custom object |
| UNKNOWN | Missing analyzer or insufficient data |

## 8. Budget Model

Create a small budget model with conservative defaults.

```js
{
  maxCustomAssetActorsVisible: 250,
  maxImportedGlbActorsVisible: 40,
  maxImportedGlbFileSizeBytes: 10 * 1024 * 1024,
  maxImportedGlbMeshCount: 50,
  maxImportedGlbMaterialCount: 20,
  maxCompositionChildrenPerPlacement: 100,
  maxCompositionBoundsM: 1000,
  maxCustomAssetRecipeParams: 32,
  maxMaterialSlots: 12
}
```

Budgets may be constants in this pass. No UI tuning panel is required.

## 9. New Module — Studio Analyzer

Create:

```txt
studio/actors/broadcastReadinessAnalyzer.js
```

This module evaluates assets, actors, imported GLBs, and compositions for broadcast readiness.

### 9.1 Required API

```js
WOSBroadcastReadinessAnalyzer = {
  analyzeAsset(assetId),
  analyzeActor(actor),
  analyzeCustomAsset(asset),
  analyzeImportedGlbAsset(asset),
  analyzeComposition(composition),
  analyzeAll(),
  getBudget(),
  getSnapshot()
}
```

### 9.2 Result Shape

```js
{
  id: 'studio.custom.prop.stage.001',
  kind: 'custom-asset' | 'glb-import' | 'composition' | 'actor',
  readiness: 'READY' | 'WARN' | 'DEGRADE' | 'BLOCK' | 'UNKNOWN',
  score: 0,
  checks: [
    { id: 'BROADCAST_ASSET_RESOLVES', result: 'pass', message: 'asset resolves' }
  ],
  diagnostics: {
    meshCount: 0,
    materialCount: 0,
    fileSizeBytes: 0,
    childCount: 0,
    boundsM: null,
    hasMissingFile: false
  }
}
```

## 10. Studio UI Requirements

Add broadcast readiness display to relevant Studio surfaces.

### 10.1 Custom Object Library

Each custom object row should show:

```txt
broadcast badge: READY / WARN / DEGRADE / BLOCK / UNKNOWN
```

Detail panel should show:

```txt
readiness
score
blocking checks
warning checks
budget notes
```

### 10.2 GLB Import Bridge

Imported GLB rows should show readiness based on:

```txt
file size
mesh count
material count
bounds
missing-file status
textures/animations/skinning warnings
```

Missing-file imported GLBs should normally be:

```txt
DEGRADE
```

Not BLOCK, because Studio proxy fallback is valid.

### 10.3 Compositions Section

Composition rows should show readiness based on:

```txt
child count
bounds
child asset readiness
unresolved children
missing GLB children
```

A composition with one degraded child may be WARN or DEGRADE, depending on severity.

A composition with unresolved children must be BLOCK.

## 11. Publish Integration

Modify:

```txt
studio/systems/publish/studioPublisher.js
```

Publish must include a sanitized additive broadcast summary block.

Allowed bundle field:

```js
bundle.broadcastReadiness = {
  version: '1.0.0',
  generatedAt: '<iso>',
  budget: { ... },
  summary: {
    actorCount: 0,
    customAssetActorCount: 0,
    importedGlbActorCount: 0,
    readyCount: 0,
    warnCount: 0,
    degradeCount: 0,
    blockCount: 0,
    unknownCount: 0
  },
  assets: {
    '<assetId>': {
      readiness: 'READY',
      kind: 'custom-asset',
      score: 0,
      checks: []
    }
  }
}
```

Forbidden in publish bundle:

```txt
glb objectUrl
raw GLB binary
local file handles
composition childObjectIds history
actor shapeRecipe/materialRecipe
actor compositionRecipe
```

### 11.1 Publish Blocking Rule

If an exported promoted actor uses an asset with readiness:

```txt
BLOCK
```

then publish preview should report the blocking asset and skip or reject depending on current publisher convention.

Recommended:

```txt
previewBundle(): include block diagnostics, do not write file
publish(): fail closed if BLOCK assets are referenced by promoted actors
```

## 12. Wall Runtime Integration

Create or modify Wall-side runtime safely.

Expected new file:

```txt
wall/systems/runtime/wallRuntimeBroadcastReadiness.js
```

### 12.1 Required API

```js
WOSWallRuntimeBroadcastReadiness = {
  activate(bundleBroadcastReadiness),
  readinessForAsset(assetId),
  shouldDegradeAsset(assetId),
  getSnapshot(),
  clear()
}
```

### 12.2 Runtime Behavior

Wall runtime must:

```txt
read bundle.broadcastReadiness
never fetch external GLB files
never read Studio localStorage
never mutate actor manifests
return DEGRADE for missing/unsafe rich custom object assets
fall back to existing proxy rendering if available
```

If runtime does not yet have a rich GLB renderer, degradation should be diagnostic-only and must not crash.

## 13. Wall Diagnostics

Modify:

```txt
wall/systems/runtime/wallRuntimeDiagnostics.js
```

Add counters:

```js
broadcastReadyActorCount
broadcastWarnActorCount
broadcastDegradedActorCount
broadcastBlockedActorCount
broadcastUnknownActorCount
broadcastReadinessReady
broadcastBudgetExceededCount
broadcastFallbackRenderCount
```

`getSnapshot()` must include these counters.

## 14. Wall Bundle Loader

Modify:

```txt
wall/systems/runtime/wallRuntimeBundleLoader.js
```

During activation:

```txt
clear previous broadcast readiness state
activate bundle.broadcastReadiness if present
count actor readiness by assetId
set diagnostics counters
continue loading safe actors
fail gracefully if readiness module missing
```

## 15. Wall Actor Filter

Modify only if needed:

```txt
wall/systems/runtime/wallRuntimeActorFilter.js
```

Actor filter must continue rejecting forbidden actor fields.

Add forbidden actor fields if missing:

```txt
broadcastReady
broadcastBudget
renderBudget
lodProfile
meshCount
materialCount
glbComplexity
compositionComplexity
customAssetBudget
objectComplexityScore
```

## 16. Render Degradation Rule

Where Wall render layer resolves visual assets, it must be able to ask:

```js
WOSWallRuntimeBroadcastReadiness.shouldDegradeAsset(assetId)
```

If true:

```txt
use existing proxy / placeholder / low-detail representation
increment broadcastFallbackRenderCount
continue rendering
```

No crash, no asset fetch, no missing object exception.

## 17. Files In Scope

Expected Studio files:

```txt
studio/actors/broadcastReadinessAnalyzer.js        NEW
studio/studioShell.js                              MODIFY
studio/styles.css                                  MODIFY
studio/index.html                                  MODIFY
studio/systems/publish/studioPublisher.js          MODIFY
```

Expected Wall files:

```txt
wall/systems/runtime/wallRuntimeBroadcastReadiness.js   NEW
wall/systems/runtime/wallRuntimeBundleLoader.js         MODIFY
wall/systems/runtime/wallRuntimeDiagnostics.js          MODIFY
wall/systems/runtime/wallRuntimeActorFilter.js          MODIFY if needed
wall/index.html                                         MODIFY
```

Out of scope:

```txt
studio/actors/actorManifestStore.js
studio/actors/customStudioAssetStore.js unless analyzer requires read helper only
studio/actors/compositionStore.js unless analyzer requires read helper only
wall/data/wos-wall-runtime-bundle.json
wall/data/wos-wall-runtime-bundle.previous.json
```

## 18. Script Load Order

Studio:

```html
<script src="./actors/broadcastReadinessAnalyzer.js"></script>
```

Required order:

```txt
assetResolver.js
customStudioAssetStore.js
glbImportStore.js
compositionStore.js
broadcastReadinessAnalyzer.js
...
studioPublisher.js
studioShell.js
```

Wall:

```html
<script src="./systems/runtime/wallRuntimeBroadcastReadiness.js"></script>
```

Required order:

```txt
wallRuntimeDiagnostics.js
wallRuntimeCustomAssetRegistry.js
wallRuntimeBroadcastReadiness.js
wallRuntimeActorFilter.js
wallRuntimeBundleLoader.js
```

## 19. Debug Surface

Add Studio debug commands:

```js
_wos.debug.studio.broadcastReadiness()
_wos.debug.studio.analyzeAsset(assetId)
_wos.debug.studio.analyzeSelectedActorBroadcast()
```

Add Wall debug commands:

```js
_wos.debug.wall.broadcastReadiness()
_wos.debug.wall.broadcastAsset(assetId)
```

## 20. Acceptance Criteria

### AC1 — Studio Analyzer Exists

`studio/actors/broadcastReadinessAnalyzer.js` exists and exposes `WOSBroadcastReadinessAnalyzer`.

### AC2 — Analyzer Covers Required Asset Types

Analyzer supports:

```txt
starter/system assets
studio-custom assets
studio-glb-import assets
studio-composition recipes
actors referencing those assets
```

### AC3 — UI Badges Present

Custom Objects, GLB Import Bridge, and Compositions surfaces show broadcast readiness state.

### AC4 — Publish Bundle Has Sanitized Summary

`previewBundle()` and `publish()` include sanitized `bundle.broadcastReadiness` with no local file data or actor schema leakage.

### AC5 — Publish Blocks BLOCK Assets

Publishing fails closed when promoted actors reference `BLOCK` readiness assets.

### AC6 — Wall Runtime Readiness Module Exists

`wallRuntimeBroadcastReadiness.js` exists and safely activates from bundle metadata.

### AC7 — Wall Diagnostics Counters Exist

Diagnostics snapshot includes broadcast readiness counters.

### AC8 — Wall Loader Activates Readiness

Bundle loader activates readiness state and counts actor readiness without crashing if the block is absent.

### AC9 — Fallback / Degrade Safe

Assets marked `DEGRADE` use fallback rendering or diagnostic-only degradation and never crash Wall.

### AC10 — Actor Manifests Stay Clean

No actor manifest contains broadcast readiness, budget, composition, GLB, or recipe fields.

### AC11 — Forbidden Field Scan

Scan actor manifests and publish output for:

```txt
broadcastReady
broadcastBudget
renderBudget
lodProfile
meshCount
materialCount
glbComplexity
compositionComplexity
customAssetBudget
objectComplexityScore
compositionRecipe
compositionChildren
shapeRecipe
materialRecipe
objectUrl
glbPath
assetPath
```

Expected: none in actors.

### AC12 — Parse Clean

All modified JS files parse cleanly.

### AC13 — Wall Diff Controlled

Wall changes are limited to:

```txt
wallRuntimeBroadcastReadiness.js
wallRuntimeBundleLoader.js
wallRuntimeDiagnostics.js
wallRuntimeActorFilter.js if needed
wall/index.html
```

### AC14 — No Data Bundle Mutation During Build

Do not hand-edit:

```txt
wall/data/wos-wall-runtime-bundle.json
wall/data/wos-wall-runtime-bundle.previous.json
```

## 21. Manual Test Plan

### T1 — Custom Asset Readiness

```txt
create custom asset
open Custom Objects
verify broadcast badge appears
inspect details
```

### T2 — Imported GLB Readiness

```txt
import GLB under budget
verify READY or WARN
reload Studio
verify missing-file becomes DEGRADE not crash
re-attach file
verify readiness updates
```

### T3 — Composition Readiness

```txt
create composition with several children
verify composition readiness row
add unresolved child via import test if possible
verify BLOCK
```

### T4 — Publish Summary

```txt
promote actor using custom asset
preview publish
verify bundle.broadcastReadiness exists
verify no actor recipe/budget fields
```

### T5 — Publish Block

```txt
force a BLOCK asset state
attempt publish
verify publish fails closed with reason
```

### T6 — Wall Runtime Activation

```txt
open Wall
verify _wos.debug.wall.broadcastReadiness()
verify diagnostics counters include broadcast readiness values
```

### T7 — Degrade Safe

```txt
use asset marked DEGRADE
verify Wall does not crash
verify fallback/proxy path is used or diagnostic-only degradation recorded
```

## 22. Build Notes

This pass should be conservative.

Do not attempt visual optimization beyond fallback/degrade flags.

The important contract is:

```txt
broadcast readiness protects runtime stability
it does not become actor truth
it does not authorize new manifest fields
it does not serialize local files
```

## 23. Next Pass

After 0616L, the custom-object creation pipeline reaches its first stable closure.

Next direction should be selected from:

```txt
0617A_WOS_CustomObjectThumbnailPreviewPass_v1.0.0_BUILD
0617A_WOS_CompositionPlacementUXPatch_v1.0.0_BUILD
0617A_WOS_WallCustomObjectVisualPolishPass_v1.0.0_BUILD
```
