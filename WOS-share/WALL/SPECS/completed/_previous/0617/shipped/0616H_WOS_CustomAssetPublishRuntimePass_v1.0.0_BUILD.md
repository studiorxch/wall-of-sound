# 0616H_WOS_CustomAssetPublishRuntimePass_v1.0.0_BUILD

```txt
Status: BUILD SPEC
Date: 2026-06-16
Scope: Studio publish pipeline + Wall runtime custom asset consumption
Target: Publish/render custom Studio assets without actor manifest drift
```

## Purpose

0616H moves custom Studio assets from **Studio-only authoring** into the **Wall runtime bundle** safely.

The core requirement is:

```txt
promoted actor uses custom assetId
→ Studio publisher includes custom asset recipe payload
→ Wall bundle loads custom asset recipes
→ Wall renders the actor from assetId
→ actor manifest remains clean and canonical
```

This is the first pass where custom asset recipes cross the Studio → Wall boundary.

## Build Target

Add publish/runtime support for custom Studio assets created by:

```txt
0616D Custom Studio Asset Save
0616E Custom Asset Placement
0616F Custom Asset Inspector Edit
0616G Custom Asset Promotion Gate
```

Custom assets may contain:

```js
type CustomStudioAssetRecord = {
  id: string,
  source: 'studio-custom',
  editable: true,
  category: string,
  label: string,
  shapeRecipe: {
    template: string,
    params: Record<string, number>
  },
  materialRecipe: {
    slots: Record<string, string | null>,
    materialClass: 'lambert' | 'standard' | 'emissive' | null,
    roughness: number | null,
    metalness: number | null,
    opacity: number | null
  },
  variants: object,
  authoring: object
}
```

These recipes must be published as **asset records**, not actor fields.

## Hard Constraints

Do **not** change actor manifest schema.

Do **not** write any of these fields onto actors:

```txt
shapeRecipe
materialRecipe
shapeDraft
materialDraft
materialSlots
slotColors
roughnessPreview
metalnessPreview
opacityPreview
customAssetRecipe
customAssetSource
studioCustomAsset
proxyParams
parametricTemplate
```

Do **not** weaken 0616G governance.

Do **not** publish unpromoted actors.

Do **not** publish removed custom assets.

Do **not** require GLB import.

Do **not** require external asset files.

Do **not** change Phase 8’s core actor filter contract.

## Files In Scope

Expected files:

```txt
studio/systems/publish/studioPublisher.js
studio/actors/customStudioAssetStore.js
studio/actors/customAssetGovernanceValidator.js
wall/systems/presentation/wallRuntimeBundleLoader.js
wall/systems/presentation/wallRuntimeActorFilter.js
wall/systems/presentation/wallRuntimeDiagnostics.js
wall/systems/presentation/wallRuntimeActorRenderLayer.js
```

If the current Wall actor renderer is not named `wallRuntimeActorRenderLayer.js`, patch the existing Wall custom actor render module instead.

Optional new file:

```txt
wall/systems/presentation/wallRuntimeCustomAssetRegistry.js
```

Out of scope:

```txt
studio/views/proxyShapeEditorController.js
studio/views/objectMaterialAuthoringController.js
studio/views/actorObjectRenderLayer.js
studio/views/actorProxyGeometryFactory.js
studio/views/threeDCanvasView.js
wall/assets/**
wall/models/**
```

Studio preview systems should not be copied into Wall. Wall must consume sanitized custom asset recipes from the published bundle.

## Bundle Schema Addition

Extend the Phase 8 bundle with a top-level custom asset section.

```js
type WOSWallRuntimeBundle = {
  schema: 'wos.wall.runtimeBundle',
  bundleVersion: string,
  publishedAt: string,
  actors: WOSActorManifest[],
  structureReplacements?: object[],
  materialOverrides?: object[],

  // 0616H
  customAssets?: {
    schema: 'wos.wall.customAssets',
    version: '1.0.0',
    assets: CustomWallAssetRecord[]
  }
}
```

Custom wall asset record:

```js
type CustomWallAssetRecord = {
  assetId: string,
  label: string,
  source: 'studio-custom',
  category: string,
  actorTypes: string[],
  defaultVariant: string,
  variants: object,
  shapeRecipe: {
    template: string,
    params: Record<string, number>
  },
  materialRecipe: {
    slots: Record<string, string | null>,
    materialClass: 'lambert' | 'standard' | 'emissive' | null,
    roughness: number | null,
    metalness: number | null,
    opacity: number | null
  },
  authoring: {
    version: string,
    createdAt: string,
    updatedAt: string
  }
}
```

Important:

```txt
customAssets.assets[*].shapeRecipe is allowed
actors[*].shapeRecipe is forbidden
```

## Publisher Behavior

`studioPublisher.js` must collect custom assets only when they are referenced by promoted actors included in the bundle.

Flow:

```txt
collect promoted actors
→ extract actor.assetId values
→ resolve each assetId
→ if asset.source === 'studio-custom'
→ validate via WOSCustomAssetGovernanceValidator
→ include sanitized custom asset record in bundle.customAssets.assets
→ reject actor if required custom asset fails validation
```

Rules:

1. Only include custom assets referenced by exported actors.
2. Deduplicate by `assetId`.
3. Block removed custom assets.
4. Block missing recipes.
5. Block malformed recipes.
6. Never include custom assets that are not used by the exported actor set.
7. Never include localStorage-only draft state.
8. Never include preview maps from 0616B/0616C.

## Actor Filter Behavior

`wallRuntimeActorFilter.js` must continue to reject forbidden actor fields.

Add or verify:

```js
const FORBIDDEN_ACTOR_FIELDS = [
  'shapeRecipe',
  'materialRecipe',
  'shapeDraft',
  'materialDraft',
  'materialSlots',
  'slotColors',
  'roughnessPreview',
  'metalnessPreview',
  'opacityPreview',
  'customAssetRecipe',
  'customAssetSource',
  'studioCustomAsset',
  'proxyParams',
  'parametricTemplate',
];
```

This filter applies only to `bundle.actors[*]`, not `bundle.customAssets.assets[*]`.

## Wall Runtime Loader Behavior

`wallRuntimeBundleLoader.js` must parse and expose `bundle.customAssets`.

Required behavior:

```txt
load bundle
→ validate customAssets block shape
→ register custom asset records into Wall custom asset registry
→ expose diagnostics counters
→ actors continue loading by assetId
```

If a custom asset block is missing:

```txt
customAssetCount = 0
missingCustomAssetCount = 0 unless actors reference custom ids
```

If actors reference custom asset IDs that are missing from `customAssets.assets`:

```txt
actor is degraded or rejected according to existing actor-filter severity
missingCustomAssetCount increments
```

## Wall Custom Asset Registry

Add a Wall-side read-only registry if needed:

```js
WOSWallRuntimeCustomAssetRegistry = {
  registerAll(records),
  get(assetId),
  has(assetId),
  list(),
  clear(),
  getSnapshot(),
}
```

This registry is runtime-read-only.

It must not:

```txt
mutate actor manifests
write localStorage
call Studio APIs
import Studio controllers
load files from wall/assets
```

## Wall Rendering Behavior

When Wall renders an actor:

```txt
actor.assetId
→ normal asset resolver lookup
→ if standard asset: existing behavior
→ if studio-custom asset: read custom asset registry
→ build proxy from shapeRecipe
→ apply materialRecipe
→ apply any actor-level Phase 7 materialOverride after saved materialRecipe
```

Required material order:

```txt
base/custom shape
→ custom asset materialRecipe
→ actor materialOverride
```

Do not include 0616C live preview state in Wall.

## Diagnostics

Extend Wall runtime diagnostics with:

```js
{
  customAssetCount: number,
  customAssetActorCount: number,
  missingCustomAssetCount: number,
  rejectedCustomAssetCount: number,
  degradedCustomAssetActorCount: number,
  customAssetRecipeErrorCount: number,
  customAssetRegistryReady: boolean
}
```

Debug surface:

```js
_wos.debug.wall.customAssets()
```

Expected snapshot:

```js
{
  enabled: true,
  registryReady: true,
  customAssetCount: 0,
  customAssetActorCount: 0,
  missingCustomAssetCount: 0,
  rejectedCustomAssetCount: 0,
  ids: [],
  lastError: null
}
```

Optional:

```js
_wos.debug.wall.customAsset(assetId)
```

## Studio Debug Surface

Add or extend:

```js
_wos.debug.studio.customAssetPublish()
```

Expected snapshot:

```js
{
  enabled: true,
  promotedActorCount: number,
  customAssetActorCount: number,
  publishableCustomAssetCount: number,
  rejectedCustomAssetCount: number,
  customAssetIds: string[],
  rejected: [
    { assetId: string, reason: string }
  ],
  lastBundleCustomAssetCount: number,
  lastError: string | null
}
```

## Acceptance Checks

### AC1 — Parse checks

```bash
node --check studio/systems/publish/studioPublisher.js
node --check studio/actors/customStudioAssetStore.js
node --check studio/actors/customAssetGovernanceValidator.js
node --check wall/systems/presentation/wallRuntimeBundleLoader.js
node --check wall/systems/presentation/wallRuntimeActorFilter.js
node --check wall/systems/presentation/wallRuntimeDiagnostics.js
```

Also parse the new registry if created:

```bash
node --check wall/systems/presentation/wallRuntimeCustomAssetRegistry.js
```

### AC2 — Custom asset actor publishes with assetId-only actor

Create a custom asset, apply to a Draft actor, promote the actor, publish.

Expected actor in bundle:

```js
{
  objectId: '...',
  assetId: 'studio.custom.prop.boxStack.001'
}
```

Forbidden on actor:

```txt
shapeRecipe
materialRecipe
shapeDraft
materialDraft
slotColors
materialSlots
```

### AC3 — Custom asset record appears in bundle.customAssets

Expected:

```js
bundle.customAssets.assets.some(a => a.assetId === actor.assetId) === true
```

### AC4 — Only referenced custom assets publish

Create two custom assets. Promote one actor using only one asset.

Expected:

```txt
bundle.customAssets.assets.length === 1
```

### AC5 — Removed custom asset blocked

Soft-remove a custom asset referenced by an actor.

Expected:

```txt
actor fails gate or publish reject path
removed custom asset not included in bundle
```

### AC6 — Malformed custom asset blocked

Inject invalid recipe:

```js
shapeRecipe.params.heightM = Infinity
```

Expected:

```txt
publish rejects custom asset
actor not exported or exported as rejected/degraded according to existing policy
customAssetRecipeErrorCount increments
```

### AC7 — Wall loader registers custom assets

Load a bundle with one custom asset.

Expected:

```js
_wos.debug.wall.customAssets().customAssetCount === 1
_wos.debug.wall.customAssets().ids.includes(assetId) === true
```

### AC8 — Wall renders custom asset from recipe

A promoted actor using a custom asset renders in Wall without requiring Studio controllers.

Expected:

```txt
actor appears using saved shapeRecipe + materialRecipe
no dependency on proxyShapeEditorController.js
no dependency on objectMaterialAuthoringController.js
```

### AC9 — Material order is deterministic

Custom asset has body color red. Actor has Phase 7 materialOverride blue.

Expected:

```txt
Wall actor resolves to actor materialOverride after custom asset materialRecipe
```

Order:

```txt
custom asset materialRecipe
→ actor materialOverride
```

### AC10 — Missing custom asset is degraded/rejected

Actor references `studio.custom.prop.missing.999`, but bundle has no matching custom asset.

Expected:

```txt
missingCustomAssetCount increments
actor does not silently render as placeholder without diagnostic
```

### AC11 — Forbidden actor-field grep

```bash
grep -R "shapeRecipe\|materialRecipe\|shapeDraft\|materialDraft\|slotColors\|materialSlots\|roughnessPreview\|metalnessPreview\|opacityPreview\|customAssetRecipe\|customAssetSource\|studioCustomAsset\|proxyParams\|parametricTemplate" studio/actors/actorManifestStore.js studio/systems/publish wall/data || true
```

Expected:

```txt
No actor manifest or publish leakage.
Matches inside custom asset bundle handling are acceptable only outside actors[*].
```

### AC12 — Existing non-custom publish still works

Publish with only starter-pack assets.

Expected:

```txt
bundle.customAssets.assets is empty or omitted
standard actor rendering unchanged
existing diagnostics unchanged except zero-valued custom asset counters
```

## Completion Definition

0616H is complete when:

```txt
custom Studio asset
→ promoted actor references it by assetId
→ publish includes one sanitized custom asset record
→ actor manifest remains clean
→ Wall loads custom asset registry
→ Wall renders from custom asset recipe
→ diagnostics expose custom asset status
```

## Non-Goals

This pass does not add:

```txt
GLB import
texture upload
thumbnail generation
asset pack export/import UI
custom asset deletion in Wall
runtime editing
multi-user asset sync
remote asset hosting
procedural mesh editor in Wall
```

## Next Build

```txt
0616I_WOS_StudioObjectLibraryManagementPass_v1.0.0_BUILD
```

Purpose:

```txt
custom assets in Library
→ search / filter / archive / inspect usage
→ manage saved objects cleanly
→ prepare for larger object library growth
```
