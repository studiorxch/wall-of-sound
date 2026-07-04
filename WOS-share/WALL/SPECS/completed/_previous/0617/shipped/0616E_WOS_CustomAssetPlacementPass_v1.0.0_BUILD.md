# 0616E_WOS_CustomAssetPlacementPass_v1.0.0_BUILD

**Status:** BUILD SPEC  
**Date:** 2026-06-16  
**Scope:** Studio-only  
**Depends on:** 0616A, 0616B, 0616C, 0616D  
**Primary goal:** make saved custom Studio assets placeable, swappable, duplicable, editable, and visually reliable inside the 3D Canvas without changing Wall runtime, publish schema, or actor manifest schema.

---

## 1. Purpose

0616D made custom Studio assets reusable by saving `shapeRecipe` and `materialRecipe` onto Studio asset records and registering them through the existing `ActorAssetLibraryAuthority.registerAsset()` path.

0616E must close the next practical loop:

```txt
select saved custom asset
→ place it from Library / toolbar / drag-drop
→ render saved shapeRecipe + materialRecipe immediately
→ duplicate / focus / delete like any other Draft actor
→ reopen Inspector and edit from the saved recipe baseline
```

This pass is about **placement reliability**, not a new save format.

---

## 2. Non-goals

0616E must not introduce:

- Wall runtime changes
- publish pipeline changes
- actor manifest schema changes
- promotion gate changes
- GLB import
- file upload
- mesh editing
- texture painting
- new lifecycle states
- new custom asset storage format
- second asset registry
- asset bundle publishing

---

## 3. Existing contract to preserve

Actor manifests remain clean:

```json
{
  "objectId": "...",
  "assetId": "studio.custom.prop.boxstack.001",
  "actorCategory": "prop",
  "actorType": "custom",
  "anchor": { "lat": 0, "lon": 0, "altM": 0, "headingDeg": 0 },
  "meta": { "lifecycleState": "DRAFT" }
}
```

Custom geometry and materials stay on the **asset record**:

```json
{
  "id": "studio.custom.prop.boxstack.001",
  "source": "studio-custom",
  "shapeRecipe": { "template": "prop.boxStack", "params": {} },
  "materialRecipe": { "slots": {}, "materialClass": "standard" }
}
```

Forbidden actor-manifest fields remain forbidden:

```txt
shapeRecipe
materialRecipe
shapeDraft
materialDraft
materialSlots
slotColors
customAssetRecipe
studioCustomAsset
customAssetRecord
roughness
metalness
opacity
previewShape
previewMaterial
```

---

## 4. Files in scope

Expected files:

```txt
studio/views/threeDCanvasView.js
studio/studioShell.js
studio/views/actorObjectRenderLayer.js
studio/actors/assetResolver.js
studio/actors/customStudioAssetStore.js
studio/views/proxyShapeEditorController.js
studio/views/objectMaterialAuthoringController.js
studio/styles.css
```

Optional new file only if needed:

```txt
studio/views/customAssetPlacementController.js
```

Out of scope:

```txt
wall/**
studio/systems/publish/**
studio/actors/actorManifestStore.js
studio/actors/promotionGateController.js
wall/data/**
```

---

## 5. Required behavior

### 5.1 Custom asset Library placement

A saved custom asset must behave like any normal Library asset:

```txt
click custom asset row
→ active placement asset updates
→ toolbar select updates
→ Place Actor uses custom assetId
→ placed actor gets resolved actorCategory / actorType
→ proxy renders saved shapeRecipe + materialRecipe immediately
```

No special placement path should be required.

---

### 5.2 Toolbar placement

The 3D Canvas toolbar asset dropdown must include custom assets after reload.

Required:

- custom assets appear after `customStudioAssetStore.registerAll()`
- selecting a custom asset arms it for placement
- placing on map stores only `assetId`, `actorCategory`, `actorType`
- no custom recipe is copied to the actor manifest

---

### 5.3 Drag-drop placement

Dragging a custom asset row onto the map must:

- use the custom `assetId`
- resolve the correct actor category/type
- create a Draft actor
- render saved geometry/material immediately
- update last placement debug state

---

### 5.4 Duplicate behavior

Duplicating an actor using a custom asset must:

- copy the actor manifest normally
- keep the same `assetId`
- not duplicate the asset record
- render saved shape/material on the duplicate
- remain editable as a Draft actor

Custom asset duplication is a separate action handled by 0616D `fork()` and should not be triggered by actor duplication.

---

### 5.5 Reopen / edit baseline

Selecting an actor that uses a custom asset must seed editors from the saved asset recipe:

```txt
Shape Editor → saved shapeRecipe
Object Material Editor → saved materialRecipe
```

Editing should create live previews only.

Reset must return to the saved custom asset baseline, not to default proxy geometry.

---

### 5.6 Save + Apply safety

If a user creates a custom asset using 0616D and applies it to an actor, 0616E must guarantee:

- actor refreshes immediately
- Library row appears as custom
- toolbar can select that new asset
- further placement uses the saved custom asset
- reload restores the custom asset through localStorage + ALA registration

---

### 5.7 Soft-removed custom assets

If a custom asset is soft-removed:

- it must not appear in Library rows
- it must not appear in the placement dropdown
- `resolve(assetId)` must return placeholder for removed assets
- existing actors using the removed asset should visibly degrade to placeholder, not crash

---

## 6. Implementation notes

### 6.1 `assetResolver.js`

Confirm all public asset listing paths filter `_customAssetRemoved`:

```js
list()
listAssets()
listByCategory(category)
```

0616D already filters `list()` / `resolve()`. 0616E should close any remaining listing gap so toolbar placement cannot expose removed assets.

---

### 6.2 `threeDCanvasView.js`

Add or verify helpers:

```js
getActiveAsset()
setActiveAsset(assetId)
armPlacement(assetId)
refreshActor(objectId)
getLastPlacementResult()
```

Placement must continue using:

```js
WOSAssetResolver.resolvePlacementDefaults(assetId)
```

No custom-asset branching unless strictly necessary.

---

### 6.3 `actorObjectRenderLayer.js`

Rendering priority must remain:

```txt
live 0616B shape preview
→ saved custom asset shapeRecipe
→ default category proxy
```

Material priority must remain:

```txt
saved custom asset materialRecipe
→ Phase 7 materialOverride
→ live 0616C material preview
```

This should already exist from 0616D. 0616E validates it across placement, duplicate, reload, and drag-drop.

---

### 6.4 `studioShell.js`

Library rows should make custom assets unmistakable but not special-case the data flow.

Required visible markers:

```txt
Custom badge
source: studio-custom in inspector metadata
assetId visible
category visible
```

The row action remains the same:

```txt
Place in 3D Canvas
```

---

### 6.5 `customStudioAssetStore.js`

No storage migration unless required.

Confirm:

- `registerAll()` runs on load
- imported/local custom assets re-register into ALA
- `createFromActor()` returns asset record usable by placement immediately
- `update()` mutates the existing reference and refreshes rendering
- `fork()` generates a fresh ID
- `remove()` soft-removes without breaking ALA

---

## 7. Debug API

Extend or verify:

```js
_wos.debug.studio.customAssets()
_wos.debug.studio.assetPlacement()
_wos.debug.studio.saveSelectedAsCustomAsset(label)
_wos.debug.studio.applyCustomAsset(assetId)
```

Add if useful:

```js
_wos.debug.studio.placeCustomAsset(assetId)
_wos.debug.studio.customAssetPlacement()
```

Suggested `customAssetPlacement()` snapshot:

```js
{
  enabled: true,
  activeAssetId: string | null,
  activeAssetIsCustom: boolean,
  customAssetCount: number,
  selectedObjectId: string | null,
  selectedActorAssetId: string | null,
  selectedActorIsCustom: boolean,
  selectedHasSavedShapeRecipe: boolean,
  selectedHasSavedMaterialRecipe: boolean,
  lastPlacementResult: 'ok' | 'error' | null,
  lastError: string | null
}
```

---

## 8. Acceptance criteria

### AC1 — Custom asset visible in Library

After saving a custom asset:

- Library shows it
- row has `Custom` badge
- source resolves as `studio-custom`
- search can find it by label or assetId

---

### AC2 — Custom asset selectable

Selecting custom asset row:

- updates selected Library row
- updates active placement asset
- updates 3D Canvas toolbar select if visible
- `_wos.debug.studio.assetPlacement()` reports custom assetId

---

### AC3 — Click placement works

With custom asset armed:

- click `+ Place Actor`
- click map
- actor is created
- actor manifest contains only `assetId` + normal actor fields
- no recipe/draft fields are present on manifest
- rendered object matches saved shape/material recipe

---

### AC4 — Drag-drop placement works

Dragging custom asset onto map:

- creates Draft actor
- actor uses custom `assetId`
- render matches saved recipe
- no manifest schema drift

---

### AC5 — Duplicate keeps assetId only

Duplicating a custom-asset actor:

- duplicate actor uses same custom `assetId`
- no new custom asset record is created
- shape/material render correctly
- duplicate remains Draft editable

---

### AC6 — Reopen editor baseline

Selecting a custom-asset actor:

- Shape Editor loads saved `shapeRecipe`
- Object Material Editor loads saved `materialRecipe`
- Reset Shape returns to saved shape
- Reset Material returns to saved material

---

### AC7 — Reload survival

After browser reload:

- `customStudioAssetStore` loads localStorage
- `registerAll()` rehydrates ALA
- Library shows custom assets
- actor using custom asset renders saved recipe
- placement dropdown includes active custom assets

---

### AC8 — Soft-remove safety

After removing an unused custom asset:

- asset disappears from Library
- asset disappears from placement dropdown
- resolver does not expose it as placeable
- no crash occurs if old ID is resolved

---

### AC9 — No Wall / publish changes

No files under these paths are modified:

```txt
wall/**
studio/systems/publish/**
wall/data/**
```

---

### AC10 — No manifest schema leakage

The following must not appear in actor manifests, publish bundles, or actor manifest store persistence:

```txt
shapeRecipe
materialRecipe
shapeDraft
materialDraft
materialSlots
slotColors
customAssetRecipe
studioCustomAsset
customAssetRecord
```

Allowed locations:

```txt
studio/actors/customStudioAssetStore.js
custom asset records in localStorage
Studio-only controller/render-layer preview maps
comments/spec files
```

---

## 9. Validation commands

Recommended checks:

```bash
node --check studio/actors/customStudioAssetStore.js
node --check studio/actors/assetResolver.js
node --check studio/views/threeDCanvasView.js
node --check studio/views/actorObjectRenderLayer.js
node --check studio/studioShell.js
```

Forbidden field grep:

```bash
grep -R "shapeRecipe\|materialRecipe\|shapeDraft\|materialDraft\|materialSlots\|slotColors\|customAssetRecipe\|studioCustomAsset\|customAssetRecord" \
  studio/actors/actorManifestStore.js \
  studio/systems/publish \
  wall/data || true
```

Wall diff check:

```bash
git diff -- wall studio/systems/publish wall/data
```

Expected:

```txt
no new Wall diffs
no publish diffs
no actor manifest schema leaks
```

---

## 10. Pass definition

0616E passes when Studio can do this reliably:

```txt
create custom asset
→ see it in Library
→ select it
→ place it on map
→ duplicate it
→ reload Studio
→ place it again
→ reopen editor from saved recipe
```

And the only actor-level persistence remains:

```txt
assetId
actorCategory
actorType
anchor
lod
liveTracking/scalars where applicable
meta
```

---

## 11. Next build after 0616E

```txt
0616F_WOS_CustomAssetInspectorEditPass_v1.0.0_BUILD
```

Purpose:

```txt
reopen saved custom asset
→ edit form/material as an asset-level object
→ update/fork/version custom asset cleanly
→ refresh all placed actors using that asset
```
