---
title: 0616I_WOS_StudioObjectLibraryManagementPass_v1.0.0_BUILD
date: 2026-06-16
project: Wall of Sound
system: WOS
component: Studio 3D Canvas / Custom Object Library
status: BUILD
classification: studio-authoring-ux / custom-asset-library-management
phase: post-0616H
---

# 0616I_WOS_StudioObjectLibraryManagementPass_v1.0.0_BUILD

## Purpose

Add a dedicated Studio-side management surface for reusable custom Studio assets created through the 0616B–0616H object pipeline.

This pass does **not** add new rendering authority. It makes existing custom assets easier to find, inspect, export, import, archive, and protect from accidental deletion.

```txt
custom Studio assets
→ manage library lifecycle
→ search / filter / inspect / export / import / remove
→ protect in-use assets
→ keep Wall publish path stable
```

## Current foundation

The custom asset pipeline is now operational:

```txt
0616A Studio Asset Pack Authoring: PASS
0616B Proxy Shape Editor: PASS
0616C Object Color / Material Authoring: PASS
0616D Custom Studio Asset Save: PASS
0616E Custom Asset Placement: PASS
0616F Custom Asset Inspector Edit: PASS
0616G Custom Asset Promotion Gate: PASS
0616H Custom Asset Publish Runtime: PASS
```

Studio can now create, save, edit, place, promote, and publish custom assets safely. The missing piece is Library management.

## Build target

Create a management layer for custom assets in Studio that supports:

- custom asset search
- custom-only filter
- category filter
- usage count display
- governance status display
- export single asset
- export all custom assets
- import custom assets
- remove unused custom assets
- block removal of assets currently used by actors
- refresh all relevant Library / Inspector / 3D Canvas state after mutation

## Authority boundary

### This build owns

```txt
Studio custom asset library management UX
Studio custom asset listing/filtering
Studio custom asset import/export controls
Studio custom asset removal guardrails
Studio custom asset usage summaries
Studio debug snapshots for library management
```

### This build may mutate

```txt
WOSCustomStudioAssetStore records
localStorage key: wos.studio.customAssets.v1
Studio Library selection state
Studio Inspector display state
```

### This build must not mutate

```txt
actor manifest schema
promoted actor records
wall runtime files, unless only prior accepted 0616H files are untouched
publish bundle schema
PromotionGateController validation rules
Wall custom asset registry behavior
Phase 7 materialOverride behavior
0616B shape preview state
0616C material preview state
```

## Files in scope

Primary:

```txt
studio/studioShell.js
studio/styles.css
studio/actors/customStudioAssetStore.js
studio/actors/assetResolver.js
```

Optional new file:

```txt
studio/views/customObjectLibraryManagementController.js
```

Out of scope:

```txt
wall/**
studio/systems/publish/**
studio/actors/promotionGateController.js
studio/actors/customAssetGovernanceValidator.js
studio/views/actorObjectRenderLayer.js
```

## Required UX

### 1. Custom Object Library section

Add a Studio Library section or collapsible block labeled:

```txt
Custom Objects
```

It should appear near the existing Library asset list, not as a new primary nav tab.

Minimum display per custom asset:

```txt
label
assetId
category
usage count
shapeRecipe present/missing
materialRecipe present/missing
governance ready/failing
last updated
```

### 2. Filters

Required filters:

```txt
All Custom Objects
In Use
Unused
Needs Review
By Category: structure / vehicle / maritime / aircraft / prop
```

Search must match:

```txt
label
assetId
category
template
actorTypes
tags
```

### 3. Usage count

Use existing 0616D/0616F store behavior:

```js
WOSCustomStudioAssetStore.actorsUsing(assetId)
```

Display:

```txt
0 actors
1 actor
N actors
```

If in use, removal must be blocked.

### 4. Governance status

For each custom asset, call:

```js
WOSCustomAssetGovernanceValidator.validateAssetById(assetId)
```

Display summary:

```txt
Ready
Warnings
Blocked
Unknown
```

Rules:

```txt
fail count > 0       → Blocked
warned count > 0     → Warnings
all pass             → Ready
validator unavailable → Unknown
```

### 5. Export controls

Required actions:

```txt
Export Selected Custom Asset
Export All Custom Assets
```

Output format should use the existing store export shape where possible:

```js
WOSCustomStudioAssetStore.exportJSON()
```

For single export, emit a compatible payload containing only the selected custom asset.

Suggested single export structure:

```js
{
  schema: 'wos.studio.customAssets',
  version: '1.0.0',
  exportedAt: new Date().toISOString(),
  assets: {
    [assetId]: assetRecord
  }
}
```

### 6. Import controls

Required action:

```txt
Import Custom Assets
```

Allowed implementation:

```txt
textarea paste JSON
or file picker JSON
```

Use:

```js
WOSCustomStudioAssetStore.importJSON(payload)
```

After import:

```txt
register imported assets through existing ALA path
refresh Library rows
refresh active asset dropdown
show imported count
show rejected/invalid count if available
```

### 7. Remove controls

Required action:

```txt
Remove Custom Asset
```

Guardrails:

```txt
If usageCount > 0, block removal.
If asset is selected by any actor, block removal.
If asset is referenced by any DRAFT/GATE_PENDING/PROMOTED actor, block removal.
If asset has been published previously, do not special-case yet; 0616I remains Studio-local.
```

Implementation may use existing soft removal:

```js
WOSCustomStudioAssetStore.remove(assetId)
```

Expected behavior:

```txt
removed asset disappears from Library
removed asset disappears from toolbar dropdown
removed asset no longer resolves through assetResolver
actor manifests are not mutated
Wall bundle is not touched
```

## Custom asset store extensions

Extend `customStudioAssetStore.js` only if needed.

Suggested additions:

```js
function usageSummary(assetId) {
  var actors = actorsUsing(assetId);
  return {
    assetId,
    actorCount: actors.length,
    objectIds: actors.map(a => a.objectId),
    lifecycleCounts: {
      draft: ...,
      gatePending: ...,
      promoted: ...,
      retired: ...
    }
  };
}

function exportOne(assetId) {
  var asset = get(assetId);
  if (!asset) return { ok: false, reason: 'asset_not_found' };
  return {
    ok: true,
    payload: {
      schema: 'wos.studio.customAssets',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      assets: { [assetId]: asset }
    }
  };
}
```

Do **not** add a parallel registry.

The existing source of truth remains:

```txt
WOSCustomStudioAssetStore
→ ActorAssetLibraryAuthority.registerAsset()
→ WOSAssetResolver
→ Studio Library
```

## Inspector integration

When a custom asset row is selected, Inspector should show:

```txt
Custom Object
assetId
label
category
source
editable
shapeRecipe template
shapeRecipe param count
materialRecipe slot count
usage count
governance status
createdAt
updatedAt
```

Optional advanced section:

```txt
Used By Actors
- objectId
- lifecycleState
- displayLabel
- lat/lon
```

Each used-by row may include:

```txt
Select Actor
Focus Actor
```

## Debug API

Add:

```js
_wos.debug.studio.customObjectLibrary()
_wos.debug.studio.customObject(assetId)
_wos.debug.studio.exportCustomObject(assetId)
_wos.debug.studio.exportCustomObjects()
_wos.debug.studio.removeCustomObject(assetId)
```

Snapshot shape:

```js
{
  enabled: true,
  customAssetCount,
  visibleCustomAssetCount,
  selectedCustomAssetId,
  activeFilters,
  searchQuery,
  assets: [
    {
      assetId,
      label,
      category,
      source,
      usageCount,
      governanceStatus,
      hasShapeRecipe,
      hasMaterialRecipe,
      updatedAt
    }
  ],
  lastImportResult,
  lastExportAssetId,
  lastRemovedAssetId,
  lastError
}
```

## Acceptance checks

### AC1 — Custom object list exists

Studio shows a Custom Objects management area listing saved custom assets.

### AC2 — Search works

Search matches custom asset label, assetId, category, template, tags, and actorTypes.

### AC3 — Filters work

All required filters function:

```txt
All Custom Objects
In Use
Unused
Needs Review
By Category
```

### AC4 — Usage count is accurate

Usage count equals:

```js
WOSCustomStudioAssetStore.actorsUsing(assetId).length
```

### AC5 — In-use remove is blocked

Trying to remove a custom asset used by any actor returns a visible failure and does not mutate the asset store.

### AC6 — Unused remove succeeds

Unused custom asset removal succeeds, disappears from Library, disappears from toolbar asset dropdown, and no actor manifests are changed.

### AC7 — Export all works

Export All returns a valid `wos.studio.customAssets` payload containing all current custom assets.

### AC8 — Export one works

Export selected returns a valid `wos.studio.customAssets` payload containing only the selected asset.

### AC9 — Import works

Import rehydrates custom assets, registers them through ALA, and makes them visible in the Library without reload.

### AC10 — Governance summaries display

Each custom asset row shows Ready / Warnings / Blocked / Unknown based on validator checks.

### AC11 — No actor manifest leakage

No recipe or management-only fields appear in actor manifests:

```bash
grep -R "shapeRecipe\|materialRecipe\|shapeDraft\|materialDraft\|customAssetRecipe\|customAssetSource\|studioCustomAsset\|proxyParams\|parametricTemplate\|customObjectLibrary" studio/actors wall/data 2>/dev/null
```

Expected:

```txt
No actor manifest/store/publish leakage beyond customStudioAssetStore asset records.
```

If grep hits `customStudioAssetStore.js`, that is acceptable because asset records own recipes.

### AC12 — No Wall diff

```bash
git diff --name-only | grep '^wall/'
```

Expected:

```txt
No new wall files touched by 0616I.
```

0616H already established the Wall runtime path. 0616I is Studio-side library management only.

### AC13 — Publish path unchanged

No changes to:

```txt
studio/systems/publish/studioPublisher.js
wall/systems/runtime/wallRuntimeCustomAssetRegistry.js
wall/systems/runtime/wallRuntimeBundleLoader.js
wall/systems/runtime/wallRuntimeActorFilter.js
```

## Ship gate

```txt
Studio can manage custom object assets as reusable Library entries — search, filter,
inspect, export, import, and safely remove unused assets — without altering actor
manifest schema, Wall runtime, or publish bundle contracts.
```

## Next build

```txt
0616J_WOS_GLBImportBridgePass_v1.0.0_BUILD
```

Purpose:

```txt
controlled GLB import
→ validate scale / origin / bounds / file size
→ register imported GLB as Studio asset
→ preserve parametric recipe pipeline as primary
→ keep Wall runtime gated until explicit publish support
```
