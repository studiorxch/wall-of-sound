# 0616F_WOS_CustomAssetInspectorEditPass_v1.0.0_BUILD

**Status:** BUILD SPEC  
**Date:** 2026-06-16  
**Scope:** Studio-only  
**Depends on:** 0616A, 0616B, 0616C, 0616D, 0616E  
**Primary goal:** make placed custom-asset actors fully reopenable and editable from the Inspector, with safe Update/Fork flows that refresh every actor using the edited custom asset while keeping actor manifests `assetId`-only.

---

## 1. Purpose

0616D created reusable custom Studio assets. 0616E made those assets reliably placeable.

0616F must make custom assets **editable after placement**:

```txt
select placed custom-asset actor
→ Inspector loads saved shapeRecipe + materialRecipe
→ edit shape/material from saved baseline
→ update existing custom asset OR fork a new custom asset
→ refresh all actors using affected assetId
→ keep actor manifests clean
```

This is the pass where custom assets stop being one-shot saves and become a real editable Studio object system.

---

## 2. Non-goals

0616F must not introduce:

- Wall runtime changes
- publish pipeline changes
- actor manifest schema changes
- promotion gate changes
- GLB import
- mesh editing
- texture painting
- multi-object compositions
- asset bundle publishing
- new lifecycle states
- direct editing of Promoted actor manifests
- recipe fields on actor manifests

---

## 3. Existing contract to preserve

Actor manifests continue to store only the selected asset reference:

```json
{
  "objectId": "actor_001",
  "assetId": "studio.custom.prop.boxstack.001",
  "actorCategory": "prop",
  "actorType": "custom"
}
```

Editable object design data stays on the custom asset record:

```json
{
  "id": "studio.custom.prop.boxstack.001",
  "source": "studio-custom",
  "editable": true,
  "shapeRecipe": { "template": "prop.boxStack", "params": {} },
  "materialRecipe": { "slots": {}, "materialClass": "standard" }
}
```

Forbidden actor/publish fields remain forbidden:

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
customAssetVersion
customAssetForkOf
```

Allowed locations:

```txt
studio/actors/customStudioAssetStore.js
custom asset records in localStorage
Studio-only controller draft maps
Studio-only render-layer preview maps
comments/spec files
```

---

## 4. Files in scope

Expected files:

```txt
studio/studioShell.js
studio/actors/customStudioAssetStore.js
studio/views/proxyShapeEditorController.js
studio/views/objectMaterialAuthoringController.js
studio/views/actorObjectRenderLayer.js
studio/actors/assetResolver.js
studio/views/threeDCanvasView.js
studio/styles.css
```

Optional new file only if needed:

```txt
studio/views/customAssetInspectorEditController.js
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

### 5.1 Detect editable custom asset

When an actor is selected, Inspector must resolve:

```txt
actor.assetId
→ WOSAssetResolver.resolve(assetId)
→ asset.source === 'studio-custom'
→ asset.editable === true
```

If true, the Inspector should clearly show:

```txt
Custom Asset: editable
assetId
label
source
shapeRecipe present
materialRecipe present
actors using this asset
last updated
```

---

### 5.2 Reopen saved shape recipe

Selecting a custom-asset actor must seed Shape Editor from the saved asset recipe:

```txt
asset.shapeRecipe.template
asset.shapeRecipe.params
```

Required:

- no blank default when saved recipe exists
- no silent preview mutation on select
- live preview only begins after edit/preview action
- Reset Shape returns to saved recipe baseline

---

### 5.3 Reopen saved material recipe

Selecting a custom-asset actor must seed Object Material Editor from:

```txt
asset.materialRecipe.slots
asset.materialRecipe.materialClass
asset.materialRecipe.roughness
asset.materialRecipe.metalness
asset.materialRecipe.opacity
```

Required:

- Reset Material returns to saved recipe baseline
- live preview remains Studio-only
- Phase 7 Material Override remains separate
- saved materialRecipe remains below Phase 7 override and below live 0616C preview

Material order remains:

```txt
saved materialRecipe
→ Phase 7 materialOverride
→ live 0616C material preview
```

---

### 5.4 Update existing custom asset

Inspector must support updating the selected custom asset from current Shape/Material drafts.

```txt
edit shape/material
→ Update Custom Asset
→ customStore.update(assetId, patch)
→ refresh all actors using assetId
→ keep same assetId
```

Required:

- update only if asset is `source: studio-custom` and `editable: true`
- update `authoring.updatedAt`
- do not create a new asset record
- do not mutate actor manifests beyond normal actor edit fields
- refresh every visible actor using the updated assetId

---

### 5.5 Fork custom asset from Inspector

Inspector must support forking a selected custom asset:

```txt
edit shape/material
→ Fork Custom Asset
→ new studio.custom.* assetId
→ optionally apply fork to selected actor
```

Required fork paths:

```txt
Fork Only
Fork + Apply to Selected Actor
```

Behavior:

- original asset remains unchanged
- new custom asset contains edited shape/material recipes
- selected actor changes only `assetId` if user chooses Apply
- other actors using original asset remain unchanged
- Library refreshes and shows new custom asset

---

### 5.6 Refresh all actors using asset

After `Update Custom Asset`, every actor using the same custom `assetId` must visually refresh.

Required helper, if not already present:

```js
WOSThreeDCanvasView.refreshActorsByAsset(assetId)
```

or equivalent loop:

```js
store.list()
  .filter(actor => actor.assetId === assetId)
  .forEach(actor => refreshActor(actor.objectId))
```

This must refresh:

- placed actor proxies
- duplicated actors using same assetId
- selected actor editor baseline
- Library/Inspector metadata

---

### 5.7 Dirty-state clarity

Inspector must distinguish:

```txt
saved custom asset baseline
live Shape Editor preview
live Object Material preview
unsaved changes since saved asset
```

Visible status should include:

```txt
Saved baseline loaded
Preview active
Unsaved custom asset edits
Update will affect N actors
Fork will create new asset
```

---

### 5.8 Non-custom actor behavior

For starter-pack or system assets:

- Shape Editor may still preview shape drafts
- Object Material Editor may still preview material drafts
- Save as Custom Asset remains available for Draft actors
- Update Existing Custom Asset must be hidden/disabled
- Fork Existing Custom Asset must be hidden/disabled

---

### 5.9 Promoted actor safety

If selected actor is not Draft:

- custom asset editing controls must not directly mutate the actor
- Shape/Material live editors remain hidden per prior rules
- message should direct user to Fork Actor first
- custom asset record may not be updated through a Promoted actor selection

---

## 6. Implementation notes

### 6.1 `customStudioAssetStore.js`

Add or verify update/fork helpers that accept explicit recipes:

```js
update(assetId, {
  label,
  shapeRecipe,
  materialRecipe
})

fork(assetId, {
  label,
  shapeRecipe,
  materialRecipe
})
```

If existing `fork()` only clones source asset, extend it so Inspector can fork from edited drafts without first updating the original.

Add helper if useful:

```js
actorsUsing(assetId)
```

or keep actor usage counting in `studioShell.js`.

---

### 6.2 `proxyShapeEditorController.js`

Verify:

```js
selectActor(actor)
resetShape(objectId)
getDraft(objectId)
hasDraft(objectId)
isDirty(objectId)
```

Required behavior:

- saved custom recipe seeds draft
- reset returns to saved custom recipe
- preview remains session-only
- no actor manifest write

---

### 6.3 `objectMaterialAuthoringController.js`

Verify:

```js
selectActor(actor)
resetMaterial(objectId)
getDraft(objectId)
hasDraft(objectId)
isDirty(objectId)
```

Required behavior:

- saved custom recipe seeds draft
- reset returns to saved custom recipe
- preview remains session-only
- no actor manifest write

---

### 6.4 `actorObjectRenderLayer.js`

Rendering priority remains unchanged:

```txt
live 0616B shape preview
→ saved custom asset shapeRecipe
→ default category proxy
```

Material priority remains unchanged:

```txt
saved custom asset materialRecipe
→ Phase 7 materialOverride
→ live 0616C material preview
```

Add no Wall dependencies.

---

### 6.5 `threeDCanvasView.js`

Add helper if absent:

```js
refreshActorsByAsset(assetId)
```

Required behavior:

- does not mutate manifests
- rebuilds all matching actor object render entries
- keeps selected actor selected
- refreshes markers only if needed

---

### 6.6 `studioShell.js`

Extend the Custom Asset Inspector section.

Suggested controls:

```txt
Custom Asset
- assetId
- label
- source
- editable
- shapeRecipe: present / missing
- materialRecipe: present / missing
- actors using this asset: N

Buttons:
- Update Custom Asset
- Fork Custom Asset
- Fork + Apply to Actor
- Reset Editors to Saved Asset
```

Button visibility:

```txt
Update Custom Asset: only custom + editable + Draft actor
Fork Custom Asset: only custom + Draft actor
Fork + Apply: only custom + Draft actor
Save as Custom Asset: Draft actor, any asset source
```

---

## 7. Debug API

Add or verify:

```js
_wos.debug.studio.customAssetEdit()
_wos.debug.studio.updateSelectedCustomAsset()
_wos.debug.studio.forkSelectedCustomAsset(label, apply)
_wos.debug.studio.refreshActorsByAsset(assetId)
```

Suggested `customAssetEdit()` snapshot:

```js
{
  enabled: true,
  selectedObjectId: string | null,
  selectedActorAssetId: string | null,
  selectedActorIsDraft: boolean,
  selectedAssetIsCustom: boolean,
  selectedAssetEditable: boolean,
  selectedAssetLabel: string | null,
  selectedHasSavedShapeRecipe: boolean,
  selectedHasSavedMaterialRecipe: boolean,
  selectedShapeDraftDirty: boolean,
  selectedMaterialDraftDirty: boolean,
  selectedShapePreviewActive: boolean,
  selectedMaterialPreviewActive: boolean,
  actorUsageCount: number,
  lastUpdatedAssetId: string | null,
  lastForkedAssetId: string | null,
  lastError: string | null
}
```

---

## 8. Acceptance criteria

### AC1 — Custom asset actor opens from saved recipe

Given an actor using a custom asset:

- Shape Editor shows saved template/params
- Object Material Editor shows saved slots/scalars
- neither editor writes to actor manifest on select
- preview is inactive until edit/preview

---

### AC2 — Reset returns to saved custom baseline

After modifying shape/material preview:

- Reset Shape restores saved `shapeRecipe`
- Reset Material restores saved `materialRecipe`
- rendered object matches saved custom asset again
- actor manifest remains clean

---

### AC3 — Update existing custom asset

After editing a custom asset actor:

- `Update Custom Asset` updates the existing asset record
- assetId remains unchanged
- `authoring.updatedAt` changes
- all actors using that asset visually refresh
- no new custom asset record is created

---

### AC4 — Update affects duplicates

Given two actors sharing the same custom assetId:

- update custom asset from one actor
- both actors refresh to the new saved recipe
- both manifests still store only the shared assetId

---

### AC5 — Fork without apply

After editing a custom asset actor:

- `Fork Custom Asset` creates a new asset record
- selected actor remains on original assetId
- original asset remains unchanged
- Library shows the forked asset

---

### AC6 — Fork + Apply

After editing a custom asset actor:

- `Fork + Apply to Actor` creates a new asset record
- selected actor updates only its `assetId`
- other actors remain on original assetId
- selected actor renders forked recipe

---

### AC7 — Non-custom assets cannot be updated in place

For starter-pack/system assets:

- `Update Custom Asset` is hidden or disabled
- `Fork Existing Custom Asset` is hidden or disabled
- `Save as Custom Asset` remains available for Draft actors

---

### AC8 — Promoted actor safety

For Promoted / Gate Pending / Retired actors:

- custom edit buttons are hidden/disabled
- no custom asset update/fork is triggered from that actor context
- user must fork actor first

---

### AC9 — Debug snapshot complete

`_wos.debug.studio.customAssetEdit()` returns the snapshot in §7 with correct values for:

```txt
selected asset custom/editable state
saved shape/material presence
draft dirty state
preview active state
actor usage count
last updated/forked/error fields
```

---

### AC10 — Reload survival

After updating or forking a custom asset:

- reload Studio
- custom asset store rehydrates from localStorage
- Library shows edited/forked assets
- actors render saved recipes
- Shape/Material editors seed from saved recipe

---

### AC11 — No Wall / publish changes

No files under these paths are modified:

```txt
wall/**
studio/systems/publish/**
wall/data/**
```

---

### AC12 — No manifest schema leakage

Forbidden fields must not appear in actor manifests, manifest store persistence, publish bundle generation, or `wall/data`:

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
customAssetVersion
customAssetForkOf
```

---

## 9. Validation commands

Recommended parse checks:

```bash
node --check studio/actors/customStudioAssetStore.js
node --check studio/views/proxyShapeEditorController.js
node --check studio/views/objectMaterialAuthoringController.js
node --check studio/views/actorObjectRenderLayer.js
node --check studio/views/threeDCanvasView.js
node --check studio/studioShell.js
node --check studio/actors/assetResolver.js
```

Forbidden field grep:

```bash
grep -R "shapeRecipe\|materialRecipe\|shapeDraft\|materialDraft\|materialSlots\|slotColors\|customAssetRecipe\|studioCustomAsset\|customAssetRecord\|customAssetVersion\|customAssetForkOf" \
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
no actor manifest schema leakage
```

---

## 10. Completion statement

0616F is complete when a saved custom asset can be placed, reopened, edited, updated in place, forked into a new asset, and refreshed across all using actors — while actor manifests remain clean and Wall/publish remain untouched.
