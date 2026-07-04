# 0615F_WOS_3DAssetPlacementLibraryPass_v1.0.0_BUILD

## Status

```txt
BUILD
```

## Classification

```txt
studio-authoring-ux
3d-asset-placement
asset-library-authoring
post-0615E-building-ux
studio-only
no-wall-runtime-change
no-publish-contract-change
no-manifest-schema-change
```

## Purpose

0615F makes the Studio Library act like a usable 3D placement source.

The current system can place actors, display readable 3D proxies, select buildings, and create structure replacements. The remaining gap is that the asset library still does not feel like the source of what gets placed or swapped.

This pass connects the asset library, placement workflow, selected actor, and 3D proxy render layer into one clear authoring loop:

```txt
select asset
→ preview asset intent
→ place actor using that asset
→ see correct category proxy immediately
→ swap selected actor asset
→ update 3D visual without breaking manifest truth
```

## Problem Statement

Studio now has the technical parts:

```txt
actor manifests
assetId field
proxy render layer
category silhouettes
building replacement UX
publish pipeline
```

But the authoring experience is still weak because the user cannot confidently answer:

```txt
Which asset am I about to place?
What category will it become?
What will it look like in 3D?
Can I swap this actor to another asset?
Did the visual update correctly?
```

0615F solves this by turning the Library into the placement authority for 3D Canvas.

## Non-Goals

Do not add:

```txt
GLB import pipeline
new asset file upload
Wall runtime changes
publish bundle schema changes
actor manifest schema changes
new lifecycle states
new material system
per-mesh editing
texture painting
Mapbox style publishing
building facade generation
```

Existing Phase 5 `_tryGLB` behavior may remain untouched if already present, but this pass must not expand GLB support.

## Prior Accepted Dependencies

```txt
Phase 8 — Studio → Wall publish pipeline: PASS
0615B — Actor Location Intelligence: PASS
0615C — Studio Map Look Authoring Surface: PASS
0615D — 3D Asset Visual Authoring: PASS
0615E — Building Authoring UX: PASS
```

0615F must preserve all prior acceptance conditions.

## Files In Scope

Likely files:

```txt
studio/views/libraryController.js
studio/views/threeDCanvasView.js
studio/studioShell.js
studio/views/actorObjectRenderLayer.js
studio/actors/assetResolver.js
studio/styles.css
```

Optional new file if useful:

```txt
studio/views/assetPlacementPreviewController.js
```

Files explicitly out of scope:

```txt
wall/**
studio/systems/publish/**
studio/actors/actorManifestStore.js
wall/data/wos-wall-runtime-bundle.json
```

`actorManifestStore.js` may be read, but should not gain 0615F-only fields.

## Required UX Outcome

Studio Library must support this loop:

```txt
1. Click asset row
2. Asset row becomes selected
3. 3D Canvas toolbar shows the active asset
4. Asset preview explains category/type/silhouette
5. Click Place in 3D Canvas or drag asset onto map
6. Actor is created with correct assetId/category/type defaults
7. 3D proxy appears immediately using correct category visual
8. Select actor
9. Swap asset from Library or Inspector
10. Proxy updates immediately
```

## Core Rule

The Library chooses `assetId`.

The actor manifest stores only canonical actor fields that already exist:

```txt
assetId
actorCategory
actorType
anchor
meta
structure?
vehicle?
maritime?
```

0615F must not store temporary visual authoring fields in the manifest.

Forbidden manifest fields:

```txt
studioVisualScaleMultiplier
authoringScaleEnabled
proxyDetailMode
baseRing
headingArrow
placementPreview
assetPreviewState
selectedLibraryAsset
hoveredAsset
```

## Asset Placement Defaults

When placing from an asset row, the actor should receive reasonable defaults from the selected asset entry.

Example mapping:

```js
{
  assetId: asset.assetId || asset.id,
  actorCategory: asset.category || inferredCategory,
  actorType: asset.actorType || asset.defaultActorType || 'custom'
}
```

If the asset does not declare category/type, use safe inference:

```txt
marine / maritime assets → maritime or marine
vehicle / road assets → vehicle
aircraft assets → aircraft
structure / building assets → structure
prop / world assets → prop
unknown → prop
```

Do not block placement when category inference is imperfect. Instead, use `prop` fallback and surface a small warning in the Library/Inspector.

## Library Requirements

### 1. Rich asset rows

Asset rows should display:

```txt
asset label
assetId
category
silhouetteClass / proxy kind
placement readiness
```

Suggested row states:

```txt
selected
placeable
unresolved
experimental
```

### 2. Active asset indicator

The Library should show which asset is currently armed for placement.

Example:

```txt
Active Placement Asset
wos_placeholder_cube · structure/building
```

### 3. Place action

Each asset row should support:

```txt
Place in 3D Canvas
```

Behavior:

```txt
if already in 3D Canvas:
  set active asset
  arm placement mode

if in Library or Inspector:
  switch to 3D Canvas
  set active asset
  arm placement mode after view enter settles
```

### 4. Drag placement

Existing drag/drop should remain supported.

Drag from Library asset row to 3D Canvas map should create actor with the dragged `assetId` and derived category/type defaults.

### 5. Search compatibility

Library search should continue to find assets by:

```txt
label
assetId
category
silhouetteClass
keywords/tags if available
```

Do not regress 0615B actor location search.

## 3D Canvas Requirements

### 1. Active asset reflected in toolbar

The 3D Canvas toolbar asset selector must stay synchronized with Library selection.

```txt
Library selected asset ↔ 3D Canvas active asset selector
```

### 2. Placement uses active asset defaults

`+ Place Actor` must use the active asset and apply inferred category/type defaults.

### 3. Visual proxy updates immediately

After placement:

```txt
actor appears as category-correct 3D proxy
selected actor uses 0615D visual authoring cues
heading arrow/base ring remain functional
```

### 4. Refresh after asset swap

If selected actor changes `assetId`, render layer must refresh/rebuild proxy immediately.

## Inspector Requirements

### 1. Asset swap clarity

The Actor Inspector already has an `assetId` dropdown. 0615F should make the result visually obvious:

```txt
Change assetId
→ Save or apply draft according to existing inspector rules
→ 3D proxy refreshes
→ category/type warning if mismatch exists
```

### 2. Optional asset compatibility note

When selected asset category does not match actor category, show a warning:

```txt
Asset category differs from actor category. Proxy may use actor category until saved.
```

Do not block save unless existing validation already blocks it.

### 3. No schema mutation

Do not add asset-preview-specific data to manifest.

## Render Layer Requirements

### 1. Asset/category visual consistency

`actorObjectRenderLayer` should choose proxy visuals from actor category/type and/or resolved asset metadata in a predictable order:

Recommended order:

```txt
actor.actorCategory
→ resolved asset.category
→ inferred asset category
→ prop fallback
```

### 2. Proxy rebuild on asset change

When `refreshActor(objectId)` or `onActorUpdated(actor)` runs, the render layer should rebuild or update the proxy if the asset/category/type changed.

### 3. Preserve 0615D controls

Do not regress:

```txt
Visual: Simple / Readable / Hero
Auth Scale toggle
base ring
heading arrow
category silhouettes
debug snapshot
```

## Building Replacement Compatibility

0615F must work with 0615E:

```txt
Select Building
→ Create Structure Replacement
→ structure actor uses active/default structure asset if available
→ replacement appears as structure proxy
→ Focus Actor / Select Actor still work
```

Preferred behavior:

```txt
If active asset category === structure:
  Create Structure Replacement uses active structure asset
else:
  fallback to wos_placeholder_cube
```

This is allowed only if it does not break Phase 6/0615E behavior.

## Persistence Rules

Allowed localStorage keys:

```txt
wos.studio.activeAssetId
wos.studio.lastPlacementCategory
```

Forbidden persistence:

```txt
No placement preview state in manifests
No 0615F fields in publish bundle
No Wall-side state
```

## Debug API

Add or extend:

```js
_wos.debug.studio.assetPlacement()
```

Expected snapshot:

```js
{
  activeAssetId: "...",
  activeAssetCategory: "structure|vehicle|maritime|aircraft|prop|unknown",
  activeAssetResolved: true,
  armedPlacement: true,
  selectedActorId: "...",
  selectedActorAssetId: "...",
  selectedActorCategory: "...",
  lastPlacementResult: "ok|error|null",
  lastError: null
}
```

Do not expose internal object references that mutate state unexpectedly.

## Acceptance Criteria

### AC1 — Active asset from Library

```txt
Click an asset row
→ row becomes selected
→ 3D Canvas toolbar active asset changes
→ _wos.debug.studio.assetPlacement().activeAssetId matches
```

### AC2 — Place selected asset

```txt
Click Place in 3D Canvas from asset row
→ Studio switches to 3D Canvas if needed
→ placement mode arms
→ click map
→ actor created with selected assetId
```

### AC3 — Category defaults

```txt
Place marine asset
→ actorCategory resolves marine/maritime
→ proxy silhouette is maritime-like

Place vehicle asset
→ actorCategory resolves vehicle
→ proxy silhouette is vehicle-like

Place structure asset
→ actorCategory resolves structure
→ proxy silhouette is structure-like
```

### AC4 — Drag placement

```txt
Drag asset row onto map
→ actor created at drop point
→ actor.assetId equals dragged assetId
→ proxy visible immediately
```

### AC5 — Asset swap refresh

```txt
Select existing actor
→ change assetId in Inspector or Library-supported swap action
→ save/apply using existing inspector path
→ proxy refreshes without reload
```

### AC6 — 0615D visuals preserved

```txt
Visual dropdown still works
Auth Scale still works
Heading arrow still works
Base ring still works
Debug visualAuthoring snapshot still works
```

### AC7 — 0615E building flow preserved

```txt
Select Building
→ Create Structure Replacement
→ replacement actor appears
→ original building suppresses
→ Restore Original Building works
```

### AC8 — No manifest leakage

Run:

```bash
grep -R "studioVisualScaleMultiplier\|authoringScaleEnabled\|proxyDetailMode\|baseRing\|headingArrow\|placementPreview\|assetPreviewState\|selectedLibraryAsset\|hoveredAsset" \
  studio/actors/actorManifestStore.js \
  studio/systems/publish \
  wall/data/wos-wall-runtime-bundle.json
```

Expected:

```txt
no output
```

### AC9 — No Wall changes

Run:

```bash
grep -R "0615F\|assetPlacement\|placementPreview\|selectedLibraryAsset\|hoveredAsset" wall/
```

Expected:

```txt
no output
```

### AC10 — Existing publish still passes

```txt
Promote actor
→ Publish Actors
→ bundle writes
→ forbidden field grep remains empty
```

## Manual Test Script

```txt
1. Hard reload Studio at #3d-canvas.
2. Open Library.
3. Click a marine/vehicle/structure asset row.
4. Confirm toolbar active asset updates.
5. Click Place in 3D Canvas.
6. Click map.
7. Confirm actor appears as category-specific 3D proxy.
8. Select actor.
9. Toggle Visual simple/readable/hero.
10. Toggle Auth Scale.
11. Change selected actor assetId in Inspector.
12. Save.
13. Confirm proxy refreshes.
14. Select Building.
15. Create Structure Replacement.
16. Confirm building suppresses and actor appears.
17. Run debug snapshots.
18. Run grep checks.
```

## Debug Commands

```js
_wos.debug.studio.assetPlacement()
_wos.debug.studio.visualAuthoring()
_wos.debug.studio.buildingAuthoring()
_wos.debug.studio.mapLook()
WOSActorManifestStore.list().map(a => ({ id:a.objectId, assetId:a.assetId, cat:a.actorCategory, type:a.actorType }))
```

## Ship Gate

0615F is complete only when:

```txt
Library asset selection controls placement
placement creates actor with correct assetId
category defaults produce correct proxy family
asset swap refreshes visible proxy
0615D visual controls still work
0615E building replacement still works
no 0615F-only fields leak into manifests/publish/Wall
```

## Final Lock

```txt
Studio Library becomes the 3D placement source.
3D Canvas becomes the placement surface.
Inspector remains the actor truth editor.
Wall receives only promoted canonical actors through the existing Phase 8 publish pipeline.
```
