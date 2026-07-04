# 0616K_WOS_MapObjectCompositionPass_v1.0.0_BUILD

```txt
STATUS: [BUILD]
BUILD_READY: YES
SPEC_ID: 0616K_WOS_MapObjectCompositionPass_v1.0.0_BUILD
DATE: 2026-06-16
SYSTEM: WOS Studio / 3D Canvas Lab
PASS: Map Object Composition
```

## 1. Purpose

This pass adds a Studio-only composition layer for grouping multiple placed objects into reusable map object kits.

The goal is to let authored objects become reusable arrangements without corrupting actor authority, custom asset authority, or Wall runtime publish contracts.

```txt
multiple placed objects
→ select / capture as composition
→ save relative layout recipe
→ register composition in Studio Library
→ place composition as a kit
→ create normal actor manifests per child object
→ keep every child assetId-only
→ no uncontrolled Wall runtime changes
```

This is the first pass where Studio can turn several placed assets into a reusable object cluster: rooftop kits, dock kits, stage kits, street-market kits, event booths, signage clusters, transit props, carnival sets, and similar map-scale arrangements.

## 2. Classification

```txt
LAYER: Studio authoring layer
AUTHORITY: Studio-local composition recipe authority
RUNTIME IMPACT: Studio only
WALL IMPACT: none in this pass
PUBLISH IMPACT: none in this pass
MANIFEST IMPACT: no schema change
```

This pass creates reusable composition recipes. It does **not** create a new actor type and does **not** make compositions authoritative runtime entities.

A composition is a Studio recipe that places multiple normal actors.

## 3. Current State

By 0616J, Studio can:

```txt
place starter assets
edit proxy shape
edit material slots
save reusable custom Studio assets
place custom assets
edit / fork custom assets
govern custom assets
publish custom asset records to Wall
manage custom object library
import controlled GLB assets into Studio
place imported GLB assets by assetId
```

The missing layer is object composition:

```txt
one object = supported
multiple objects as a reusable kit = not yet supported
```

## 4. Target Outcome

After 0616K, the user can:

```txt
select multiple Draft actors
save them as a named composition
see composition in Studio Library
inspect composition metadata
place the composition on the map
have Studio create one normal actor per composition child
preserve relative offsets, headings, altitude offsets, and assetIds
remove unused compositions
export/import composition recipes
```

## 5. Non-Goals

This pass must **not** do any of the following:

```txt
change actor manifest schema
write compositionRecipe to actors
write child recipe data to actors
publish compositions to Wall as a new runtime primitive
create a Wall composition renderer
create nested composition support
merge multiple actors into one actor
serialize GLB object URLs
serialize custom shape/material recipes into actor manifests
change promotion lifecycle states
change 0616H customAssets publish bundle behavior
```

Wall runtime support for composition bundles, if needed, must come later and only after this Studio authoring layer is stable.

## 6. Architectural Rule

A composition is **not** an actor.

A composition is a reusable placement recipe that creates actors.

```txt
composition asset
→ expands into child actor manifests
→ each child actor keeps its own objectId
→ each child actor keeps its own assetId
→ each child actor uses existing governance/promotion rules
```

No actor manifest may contain:

```txt
compositionRecipe
compositionChildren
compositionAssetId
compositionSource
childOffsets
kitRecipe
groupRecipe
```

The only permitted trace on child actors is optional display metadata inside `meta.displayLabel`, and even that should be human-readable only, not machine-authoritative.

## 7. New Module

Create:

```txt
studio/actors/compositionStore.js
```

This module owns Studio-local composition recipes.

### 7.1 Storage

Persist to:

```txt
localStorage key: wos.studio.compositions.v1
```

Storage is Studio-only. It is not actor manifest storage and not Wall runtime storage.

### 7.2 Composition ID Format

Composition IDs must use:

```txt
studio.composition.<category>.<slug>.<nnn>
```

Examples:

```txt
studio.composition.rooftop.antenna-kit.001
studio.composition.dock.ferry-terminal-kit.001
studio.composition.event.night-market-booth.001
studio.composition.street.signage-cluster.001
studio.composition.carnival.ring-toss-kit.001
```

### 7.3 Composition Record Shape

```js
{
  id: 'studio.composition.event.stage-kit.001',
  key: 'studio.composition.event.stage-kit.001',
  label: 'Stage Kit 001',
  source: 'studio-composition',
  editable: true,
  category: 'event',
  tags: ['composition', 'studio', 'event'],

  composition: {
    version: '1.0.0',
    anchorMode: 'centroid',
    childCount: 4,
    boundsM: { widthM: 20, depthM: 12, heightM: 5 },
    children: [
      {
        childId: 'child_001',
        assetId: 'studio.custom.prop.stage.001',
        actorCategory: 'prop',
        actorType: 'custom',
        displayLabel: 'Stage Base',
        offsetM: { x: 0, y: 0, z: 0 },
        headingOffsetDeg: 0,
        scaleHint: 1
      }
    ]
  },

  authoring: {
    editable: true,
    locked: false,
    version: '1.0.0',
    createdAt: '<iso>',
    updatedAt: '<iso>'
  },

  metadata: {}
}
```

### 7.4 Required Store API

```js
WOSCompositionStore = {
  list(),
  get(compositionId),
  createFromActors(actors, options),
  placeComposition(compositionId, anchor, options),
  update(compositionId, patch),
  fork(compositionId, options),
  remove(compositionId),
  exportOne(compositionId),
  exportJSON(),
  importJSON(payload),
  usageSummary(compositionId),
  getSnapshot()
}
```

## 8. Composition Capture Rules

### 8.1 Eligible Actors

Only Draft actors may be captured into a new composition.

Allowed:

```txt
DRAFT actors
assetId-resolved actors
actors with valid anchors
actors using starter assets
actors using custom assets
actors using GLB-import assets with ready or missing-file status
```

Blocked:

```txt
PROMOTED actors
GATE_PENDING actors
RETIRED actors
actors without assetId
actors with invalid anchor
actors whose assetId no longer resolves
actors carrying forbidden preview/recipe fields
```

### 8.2 Multi-Selection Source

Use the existing placement/controller/store surfaces where possible. If no formal multi-select exists yet, this pass may implement a minimal composition selection buffer.

Acceptable implementation:

```js
WOSCompositionController = {
  addActor(objectId),
  removeActor(objectId),
  clearSelection(),
  selectedObjectIds(),
  createCompositionFromSelection(options),
  placeSelectedComposition(compositionId),
  getSnapshot()
}
```

If created, place this at:

```txt
studio/views/compositionController.js
```

### 8.3 Anchor Calculation

Default anchor mode:

```txt
centroid
```

Use all selected actors' anchors to compute the composition center.

Each child stores relative offsets in meters from the composition anchor:

```txt
offsetM.x = east/west offset in meters
offsetM.y = north/south offset in meters
offsetM.z = altitude offset in meters
```

Heading rule:

```txt
child headingOffsetDeg = child.headingDeg - compositionHeadingDeg
```

Initial composition heading may be `0` unless placement UI supports rotation.

## 9. Placement Rules

Placing a composition creates normal actor manifests by calling the existing placement controller for each child.

The composition store must not write directly to actor manifest internals except through existing placement/update APIs.

Required behavior:

```txt
select composition
→ click map anchor
→ compute child lat/lon from offsetM
→ create child actors
→ assign each child assetId
→ assign each child actorCategory/actorType
→ apply relative heading
→ apply relative altitude
→ select/focus first child or group summary
```

### 9.1 Actor Manifest Output

Each child actor must remain normal:

```js
{
  objectId: '...',
  actorCategory: 'prop',
  actorType: 'custom',
  assetId: 'studio.custom.prop.stage.001',
  anchor: {
    lat: 40.7,
    lon: -74.0,
    altM: 0,
    headingDeg: 90
  },
  meta: { ... }
}
```

Forbidden:

```js
{
  compositionRecipe: {...},
  compositionChildren: [...],
  groupRecipe: {...},
  childOffsets: {...}
}
```

## 10. Library UI

Add a Studio Library section:

```txt
Compositions
```

This section should appear near Custom Objects / GLB Import Bridge but remain distinct.

Required UI:

```txt
collapsible section header
live count badge
search input
filter pills: All / In Use / Unused / Needs Review / by category
composition rows
selected composition detail panel
Create From Selected Actors
Place Composition
Export Selected
Export All
Import JSON
Remove Selected
```

### 10.1 Composition Row Fields

Each row should show:

```txt
label
category
compositionId
child count
bounds summary
usage count
last updated date
status badge
```

### 10.2 Detail Panel Fields

The selected composition detail panel should show:

```txt
compositionId
label
category
source
editable
child count
boundsM
anchorMode
createdAt
updatedAt
child assetId list
child actorCategory/type list
```

## 11. Use / Usage Tracking

`usageSummary(compositionId)` must report at minimum:

```js
{
  compositionId,
  placedCount,
  lastPlacedAt,
  childCount,
  // optional if placement batches are tracked
  placementBatchIds: []
}
```

Because child actor manifests must not carry composition authority fields, usage tracking may be Store-local only.

Allowed Studio-local placement history:

```js
{
  compositionId,
  placedAt,
  childObjectIds: ['...', '...']
}
```

Persisting this history in `wos.studio.compositions.v1` is allowed because it is Studio-local, not actor-manifest state.

## 12. Validation Rules

Composition validation must fail closed.

Required checks:

```txt
composition id valid
source === studio-composition
children array exists
childCount matches children.length
childCount >= 1
childCount <= 100
all child assetIds resolve
all child actorCategory values are known
all child actorType values are allowed for category or custom fallback
all offsets finite
bounds finite
bounds <= 1000m max dimension
no child contains shapeRecipe/materialRecipe/glbPath/objectUrl/assetPath
no nested composition child in this pass
```

A failed composition must not be placeable.

## 13. GLB and Custom Asset Interaction

A composition may reference:

```txt
starter assetId
studio-custom assetId
studio-glb-import assetId
```

But the composition itself must never copy:

```txt
shapeRecipe
materialRecipe
objectUrl
glbImport objectUrl
glb binary data
```

It only stores child `assetId` references.

If a GLB import is `missing-file`, composition placement is allowed, but Studio render should fall back to proxy for that child until the GLB file is re-attached, matching 0616J behavior.

## 14. Governance / Lifecycle

This pass does not add a new promotion lifecycle for compositions.

Composition-created child actors are Draft actors and must pass existing promotion rules individually.

```txt
composition recipe = Studio authoring convenience
child actor = promotion/governance unit
```

No composition should bypass:

```txt
PromotionGateController
CustomAssetGovernanceValidator
ActorManifestStore validation
Wall actor filter
```

## 15. Files In Scope

Expected files:

```txt
studio/actors/compositionStore.js                     NEW
studio/views/compositionController.js                 NEW optional but recommended
studio/studioShell.js                                 MODIFY
studio/styles.css                                     MODIFY
studio/index.html                                     MODIFY
studio/views/threeDCanvasView.js                      MODIFY if placement mode needs composition arm/click
studio/actors/assetResolver.js                        MODIFY only if composition pseudo-assets need filtering/list badge support
```

## 16. Files Out of Scope

Do not modify:

```txt
wall/**
studio/systems/publish/**
studio/actors/actorManifestStore.js
wall/data/wos-wall-runtime-bundle.json
wall/data/wos-wall-runtime-bundle.previous.json
```

If a small integration touch to `actorManifestStore.js` appears necessary, stop and report. This spec intends composition placement to use existing placement/update APIs only.

## 17. Script Load Order

If adding both store and controller:

```html
<script src="./actors/compositionStore.js"></script>
<script src="./views/compositionController.js"></script>
```

Required order:

```txt
assetResolver.js
customStudioAssetStore.js
glbImportStore.js
compositionStore.js
actorPlacementController.js
...
actorObjectRenderLayer.js
compositionController.js
...
threeDCanvasView.js
studioShell.js
```

`compositionStore.js` must load before `studioShell.js` and before any controller that calls it.

## 18. Debug Surface

Add:

```js
_wos.debug.studio.compositions()
_wos.debug.studio.composition(compositionId)
_wos.debug.studio.createCompositionFromSelection(label)
_wos.debug.studio.placeComposition(compositionId)
_wos.debug.studio.exportComposition(compositionId)
_wos.debug.studio.exportCompositions()
```

Snapshot must include:

```js
{
  enabled: true,
  compositionCount,
  selectedCompositionId,
  selectedObjectIds,
  lastCreatedCompositionId,
  lastPlacedCompositionId,
  lastPlacedChildObjectIds,
  lastImportResult,
  lastError
}
```

## 19. Acceptance Criteria

### AC1 — Composition Store Exists

`studio/actors/compositionStore.js` exists and exposes `WOSCompositionStore` with the required API.

### AC2 — Studio-Local Persistence

Composition data persists only to:

```txt
wos.studio.compositions.v1
```

No actor manifest schema changes occur.

### AC3 — Capture Draft Actors

Studio can capture multiple eligible Draft actors into a composition recipe.

### AC4 — Block Ineligible Actors

Promoted, gate-pending, retired, unresolved, invalid-anchor, or dirty-manifest actors are blocked from capture.

### AC5 — Relative Layout Preserved

Composition children store relative meter offsets and heading offsets from a composition anchor.

### AC6 — Place Composition

Placing a composition creates normal child actor manifests through existing placement/update APIs.

### AC7 — Child Actors AssetId-Only

Every placed child actor contains only normal actor fields and `assetId`. No composition recipe or child offset fields are written to actor manifests.

### AC8 — Custom / GLB Assets Supported by Reference

Composition children may reference `studio-custom` and `studio-glb-import` assets by `assetId`, without copying recipes or object URLs.

### AC9 — Library Management UI

Studio Library shows a Compositions section with search/filter/detail/export/import/remove actions.

### AC10 — Remove Protection

Removing a composition is blocked if active Studio placement history says placed children still exist and the design chooses strict usage protection. If strict protection is not used, removal must only remove the reusable recipe, never child actors.

The chosen behavior must be explicit in UI/status text.

### AC11 — Debug Commands

All required debug commands exist and return stable snapshots.

### AC12 — No Wall / Publish Changes

No files under `wall/**` or `studio/systems/publish/**` are modified.

### AC13 — Forbidden Field Scan

The implementation must not add these to actor manifests:

```txt
compositionRecipe
compositionChildren
compositionAssetId
compositionSource
childOffsets
kitRecipe
groupRecipe
shapeRecipe
materialRecipe
objectUrl
glbPath
assetPath
```

### AC14 — Parse Clean

All modified JavaScript files parse cleanly.

## 20. Manual Test Plan

### T1 — Create Composition

```txt
place 3 Draft actors
select/add all 3 to composition selection
create composition labeled "Test Kit"
verify composition appears in Library
verify childCount = 3
```

### T2 — Place Composition

```txt
select Test Kit
place on map
verify 3 new child actors created
verify relative layout preserved
verify each actor has correct assetId
```

### T3 — Manifest Cleanliness

Inspect created actors. Confirm no forbidden composition fields exist.

### T4 — Custom Asset Child

```txt
create/use studio-custom asset
include it in composition
place composition
verify child renders saved shape/material recipe through existing custom asset path
```

### T5 — GLB Child

```txt
import GLB
include imported GLB actor in composition
place composition
verify imported GLB renders while objectUrl is available
reload Studio
verify missing-file proxy fallback does not crash
re-attach file
verify GLB preview returns
```

### T6 — Export / Import

```txt
export one composition
remove it if allowed
import JSON
verify composition returns
place imported composition
```

### T7 — No Wall Diff

```bash
git diff -- wall/
git diff -- studio/systems/publish/
```

Expected: no 0616K changes.

## 21. Build Notes

Keep this pass small and Studio-only.

The important architectural lock is:

```txt
composition = reusable placement recipe
actor = runtime/promotable unit
assetId = only child asset authority
```

Do not introduce composition runtime semantics yet.

## 22. Next Pass

After 0616K, next planned pass:

```txt
0616L_WOS_BroadcastReadyCustomObjectPass_v1.0.0_BUILD
```

Purpose:

```txt
custom objects + imported objects + compositions
→ optimize for broadcast stability
→ LOD / diagnostics / object budgets
→ prepare safe Wall display constraints
```
