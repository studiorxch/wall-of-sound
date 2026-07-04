# 0616D_WOS_CustomStudioAssetSavePass_v1.0.0_BUILD

**Status:** BUILD  
**Date:** 2026-06-16  
**Classification:** studio-authoring, custom-assets, recipe-save, parametric-objects  
**Scope:** Studio-only custom asset save pipeline

---

## 1. Purpose

0616D turns the current **session-only object edits** from 0616B and 0616C into reusable Studio assets.

Current state:

```txt
0616A gives Studio a useful starter asset pack
0616B lets a Draft actor preview a custom parametric shape
0616C lets a Draft actor preview slot-based object colors/materials
```

0616D adds the missing save layer:

```txt
selected Draft actor
→ active shape preview
→ active object material preview
→ Save as Custom Studio Asset
→ reusable asset appears in Library
→ actor can use the saved assetId
```

This pass does **not** publish custom assets to Wall yet. It only creates a Studio-local custom asset registry and connects it to the existing Library/placement/edit loop.

---

## 2. Hard Boundaries

### Must remain Studio-only

0616D may touch:

```txt
studio/actors/**
studio/views/**
studio/studioShell.js
studio/index.html
studio/styles.css
```

0616D must not touch:

```txt
wall/**
studio/systems/publish/**
studio/actors/actorManifestStore.js unless only reading existing actor fields is impossible
studio/actors/promotionGateController.js
shared/data/wosPalette.js
```

### Must not change actor manifest schema

Do **not** write these fields to actor manifests:

```txt
shapeRecipe
materialRecipe
shapeDraft
materialDraft
customAssetRecipe
customAssetDefinition
materialSlots
slotColors
roughness
metalness
opacity
```

Actor manifests should continue to store only the normal actor reference:

```txt
assetId
actorCategory
actorType
anchor
meta
structure?
liveTracking?
materialOverride?   // existing Phase 7 only
```

### Must not publish to Wall

No bundle schema changes. No Wall runtime recipe loading. No `wall/data/wos-wall-runtime-bundle.json` changes.

---

## 3. New Concept

### Custom Studio Asset

A Custom Studio Asset is a reusable Studio-local asset generated from saved preview recipes.

It should register through the existing asset-library path so 0615F placement keeps working.

Example shape:

```json
{
  "id": "studio.custom.prop.kioMAPBOX_SECRET_TOKEN_REMOVED",
  "key": "studio.custom.prop.kioMAPBOX_SECRET_TOKEN_REMOVED",
  "label": "Custom Kiosk 001",
  "category": "prop",
  "source": "studio-custom",
  "editable": true,
  "silhouetteClass": "world-prop",
  "actorTypes": ["world.prop"],
  "tags": ["custom", "studio", "prop"],
  "defaultVariant": "lowpoly",
  "variants": {
    "dot": { "kind": "procedural", "renderVariant": "studio.custom.prop.kioMAPBOX_SECRET_TOKEN_REMOVED", "minZoom": 8, "maxZoom": 12 },
    "icon": { "kind": "procedural", "renderVariant": "studio.custom.prop.kioMAPBOX_SECRET_TOKEN_REMOVED", "minZoom": 12, "maxZoom": 14 },
    "lowpoly": { "kind": "procedural", "renderVariant": "studio.custom.prop.kioMAPBOX_SECRET_TOKEN_REMOVED", "minZoom": 14, "maxZoom": 20 }
  },
  "shapeRecipe": {
    "template": "prop.boxStack",
    "params": {
      "lengthM": 3,
      "widthM": 3,
      "heightM": 4,
      "baseHeightM": 0.3,
      "topHeightM": 0.5
    }
  },
  "materialRecipe": {
    "slots": {
      "body": "#A89880",
      "roof": "#9A8870",
      "glass": "#203848",
      "accent": "#00CED1"
    },
    "materialClass": "standard",
    "roughness": 0.55,
    "metalness": 0,
    "opacity": 1
  },
  "authoring": {
    "editable": true,
    "locked": false,
    "version": "1.0.0",
    "createdAt": "ISO timestamp",
    "updatedAt": "ISO timestamp"
  }
}
```

Important distinction:

```txt
shapeRecipe/materialRecipe live on custom asset records, not actor manifests.
```

---

## 4. Required New File

### `studio/actors/customStudioAssetStore.js`

Create a Studio-local custom asset store.

Responsibilities:

```txt
list custom assets
get custom asset by id
create custom asset from selected actor previews
update custom asset recipe
fork custom asset
delete custom asset if unused
export custom assets as JSON
import custom assets from JSON later-ready, optional for this pass
register custom assets into ActorAssetLibraryAuthority
persist to localStorage for now
```

Allowed localStorage key:

```txt
wos.studio.customAssets.v1
```

This is Studio asset persistence only. It is not actor manifest persistence.

Public API:

```js
WOSCustomStudioAssetStore.list()
WOSCustomStudioAssetStore.get(assetId)
WOSCustomStudioAssetStore.createFromActor(actor, options)
WOSCustomStudioAssetStore.update(assetId, patch)
WOSCustomStudioAssetStore.fork(assetId, options)
WOSCustomStudioAssetStore.remove(assetId)
WOSCustomStudioAssetStore.registerAll()
WOSCustomStudioAssetStore.exportJSON()
WOSCustomStudioAssetStore.importJSON(payload)
WOSCustomStudioAssetStore.getSnapshot()
```

Minimum snapshot:

```js
{
  enabled: true,
  customAssetCount: 0,
  registeredCount: 0,
  storageKey: 'wos.studio.customAssets.v1',
  lastCreatedAssetId: null,
  lastError: null
}
```

---

## 5. Recipe Source Rules

### Shape recipe source

Read from 0616B preview state:

```txt
WOSProxyShapeEditorControllerInstance.getDraft(objectId)
```

If no shape draft exists, seed from factory defaults:

```txt
WOSActorProxyGeometryFactory.defaultTemplateFor(actor.actorCategory, actor.actorType)
WOSActorProxyGeometryFactory.defaultParamsFor(template)
```

### Material recipe source

Read from 0616C preview state:

```txt
WOSObjectMaterialAuthoringControllerInstance.getDraft(objectId)
```

If no material draft exists, use empty inherited recipe:

```json
{
  "slots": {},
  "materialClass": null,
  "roughness": null,
  "metalness": null,
  "opacity": null
}
```

### Category source

Use actor truth first:

```txt
actor.actorCategory
actor.actorType
```

Then derive asset category fields compatible with 0615F/0616A:

```txt
structure → category: structure, actorTypes: [structure.building]
vehicle   → category: road, actorTypes: [vehicle.car] unless actorType is more specific
maritime  → category: marine, actorTypes: [marine.vessel]
aircraft  → category: aircraft, actorTypes: [aircraft.plane]
prop      → category: prop, actorTypes: [world.prop]
```

Do not invent invalid `actorType` values. Use the same safe approach as 0615F.

---

## 6. Asset ID Rules

Generated IDs must be stable, readable, and collision-safe.

Format:

```txt
studio.custom.<category>.<slug>.<nnn>
```

Examples:

```txt
studio.custom.prop.kioMAPBOX_SECRET_TOKEN_REMOVED
studio.custom.structure.tower.001
studio.custom.maritime.hull.001
studio.custom.vehicle.body.001
studio.custom.aircraft.fuselage.001
```

If label is blank, generate:

```txt
Custom Prop 001
Custom Structure 001
Custom Vehicle 001
Custom Maritime 001
Custom Aircraft 001
```

---

## 7. Library Integration

Custom assets must appear in the existing Library asset list without a new Library mode.

Required behavior:

```txt
source: studio-custom
readiness: placeable
category group renders correctly
row label uses custom asset label
row tag indicates Custom
asset can be selected
asset can be armed for placement
asset can be drag/dropped onto the map
```

Do this by registering saved custom assets through:

```txt
SBE.ActorAssetLibraryAuthority.registerAsset(customAsset)
```

Do **not** create a parallel library list.

---

## 8. Actor Integration

After saving a custom asset from a selected Draft actor, provide two options:

```txt
Save as Custom Asset
Save as Custom Asset + Apply to Actor
```

### Save as Custom Asset

Creates the custom asset and registers it.

Does not mutate the actor.

### Save as Custom Asset + Apply to Actor

Creates the custom asset, registers it, then updates only:

```json
{
  "assetId": "studio.custom..."
}
```

Then refreshes the actor proxy.

Do not write the recipes into the actor.

---

## 9. Render Integration

0616D must make saved custom assets render from their saved recipes.

Update `actorObjectRenderLayer.js` and/or `assetResolver.js` only as needed so that:

```txt
actor.assetId points to studio.custom.*
→ resolver finds custom asset
→ render layer detects asset.shapeRecipe/materialRecipe
→ proxy factory renders shapeRecipe
→ render layer applies materialRecipe
```

Required order:

```txt
base proxy or custom shapeRecipe
→ saved custom materialRecipe
→ Phase 7 materialOverride if actor has one
→ 0616C live material preview if active
```

Important:

0616C live preview still wins visually while editing.

---

## 10. Inspector UI

Add a small section near Shape Editor/Object Material Editor:

```txt
Custom Asset
```

Controls:

```txt
Asset Label input
Save as Custom Asset
Save + Apply to Actor
Fork Existing Custom Asset if current asset source is studio-custom
Update Custom Asset if current asset source is studio-custom and editable
```

Rules:

```txt
Show only for Draft actors
Hide for Promoted/Gate Pending/Retired actors
Never block normal actor Save
Never mutate promoted actors
```

Display fields:

```txt
Current asset source
Current custom asset id if applicable
Shape draft active: yes/no
Material draft active: yes/no
Will save shapeRecipe: yes/no
Will save materialRecipe: yes/no
```

---

## 11. Validation

Validate before saving custom asset:

```txt
actor exists
actor lifecycle is DRAFT
category is recognized
shape template is known
shape params are finite numbers
shape params are within safe bounds
slot colors are valid hex
roughness/metalness/opacity are null or 0..1
asset id is unique
label length <= 80
```

Safe bounds:

```txt
length/width/bodyWidth/bodyHeight/baseLength/baseWidth: 0.1..500
height/roofHeight/cabinHeight/baseHeight/topHeight/mast/wing/tail: 0..1000
scale/taper/slope/opacity/roughness/metalness: 0..1 unless existing param uses larger unit semantics
```

If invalid:

```txt
show status message in Inspector
set store lastError
create no asset
change no actor
```

---

## 12. Debug

Add:

```js
_wos.debug.studio.customAssets()
```

Snapshot should include:

```js
{
  enabled: true,
  customAssetCount,
  registeredCount,
  selectedObjectId,
  selectedActorAssetId,
  selectedActorIsCustomAsset,
  selectedShapeDraftActive,
  selectedMaterialDraftActive,
  lastCreatedAssetId,
  lastError
}
```

Optional helpers:

```js
_wos.debug.studio.saveSelectedAsCustomAsset(label)
_wos.debug.studio.applyCustomAsset(assetId)
```

---

## 13. Acceptance Criteria

### AC1 — Custom asset store loads

Reload Studio. Confirm:

```js
_wos.debug.studio.customAssets().enabled === true
```

### AC2 — Save custom asset from Draft actor

Place a Draft actor, edit shape, edit material, click `Save as Custom Asset`.

Expected:

```txt
new custom asset created
custom asset appears in Library
actor unchanged unless Save + Apply was used
```

### AC3 — Save + Apply updates only actor.assetId

Click `Save + Apply to Actor`.

Expected actor diff:

```txt
assetId changed to studio.custom.*
no shapeRecipe on actor
no materialRecipe on actor
no materialDraft on actor
no shapeDraft on actor
```

### AC4 — Custom asset renders saved shape

Reload Studio and place/select actor using saved custom asset.

Expected:

```txt
shapeRecipe renders without needing 0616B preview state
```

### AC5 — Custom asset renders saved material

Reload Studio and place/select actor using saved custom asset.

Expected:

```txt
materialRecipe colors apply without needing 0616C preview state
```

### AC6 — Live preview still wins

Select actor using custom asset, change Object Material Editor preview.

Expected:

```txt
0616C live preview visually overrides saved materialRecipe
Reset Material returns to saved materialRecipe
```

### AC7 — Library placement works

Select saved custom asset in Library and place on map.

Expected:

```txt
new actor uses custom assetId
correct category/type defaults
custom shape/material visible
```

### AC8 — Fork custom asset

Use `Fork Existing Custom Asset`.

Expected:

```txt
new studio.custom.* asset created
original custom asset unchanged
fork appears in Library
```

### AC9 — Update custom asset

Use `Update Custom Asset` on editable custom asset.

Expected:

```txt
custom asset recipe updates
actors using that asset refresh when selected/refreshed
no actor manifest schema change
```

### AC10 — Draft-only gating

Promote or use non-Draft actor.

Expected:

```txt
Custom Asset save/update controls hidden or disabled
no mutation route available
```

### AC11 — Forbidden field grep

Run grep across actor manifests and publish bundle outputs.

Expected zero new actor/bundle fields:

```txt
shapeRecipe
materialRecipe
shapeDraft
materialDraft
customAssetRecipe
customAssetDefinition
slotColors
```

Recipes may exist only in:

```txt
customStudioAssetStore.js localStorage payload
custom asset records registered into ALA
```

### AC12 — No Wall changes

Expected:

```txt
wall/ diff unchanged from baseline
```

### AC13 — Parse checks

All touched JS files parse clean.

---

## 14. Recommended Files

Likely touched:

```txt
studio/actors/customStudioAssetStore.js
studio/actors/assetResolver.js
studio/views/actorObjectRenderLayer.js
studio/views/objectMaterialAuthoringController.js
studio/views/proxyShapeEditorController.js
studio/studioShell.js
studio/index.html
studio/styles.css
```

Avoid touching:

```txt
wall/**
studio/systems/publish/**
studio/actors/actorManifestStore.js
studio/actors/promotionGateController.js
```

---

## 15. Definition of Done

0616D is done when Studio can:

```txt
edit shape
edit material
save as reusable custom Studio asset
see it in Library
apply it to actor by assetId only
reload Studio
see saved custom asset still render its saved form/color
place the saved custom asset again
```

This closes the first complete local object-authoring loop:

```txt
create form
color it
save it
reuse it
place it on map
```

Still not included:

```txt
publish custom assets to Wall
GLB import
custom asset thumbnails
asset pack export/import UI polish
multi-object compositions
```

