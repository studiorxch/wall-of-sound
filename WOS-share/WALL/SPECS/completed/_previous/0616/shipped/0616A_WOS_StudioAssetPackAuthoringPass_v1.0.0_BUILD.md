# 0616A_WOS_StudioAssetPackAuthoringPass_v1.0.0_BUILD

## Status

```txt
BUILD SPEC
Date: 2026-06-16
Scope: Studio-only
Target: Asset Library authoring inventory
```

## Purpose

0616A creates the first useful Studio asset pack so the new 0615F placement loop no longer depends on placeholder-heavy inventory.

The goal is not custom 3D object design yet. The goal is to seed clean, placeable, category-aware assets that make the Library → 3D Canvas → Inspector loop feel intentional.

```txt
clean asset registry
→ useful asset rows
→ correct placement defaults
→ correct proxy silhouettes
→ better building replacement choices
```

## Build Target

Create a usable starter asset inventory for these categories:

```txt
structure
vehicle
maritime
aircraft
prop
```

Each asset must have enough metadata to drive:

```txt
Library display
placement defaults
proxy category inference
readiness state
Inspector asset dropdown
future custom asset authoring
```

## Hard Constraints

Do not modify Wall runtime.

Do not modify publish pipeline.

Do not change actor manifest schema.

Do not add GLB import.

Do not add custom shape editor yet.

Do not introduce `assetPath`, `assetUrl`, `glbPath`, `studioVisualScaleMultiplier`, `authoringScaleEnabled`, `proxyDetailMode`, `shapeRecipe`, or `materialRecipe` into actor manifests or publish bundles.

Do not move asset authority into Wall.

This is a Studio asset-pack and metadata pass only.

## Files Likely Changed

```txt
studio/actors/assetResolver.js
studio/actors/actorAssetLibraryAuthority.js OR equivalent asset registry source
studio/views/libraryController.js
studio/studioShell.js
studio/styles.css
```

Only touch additional Studio files if required for clean Library display or debug exposure.

## Asset Pack Requirements

### Structure Assets

Seed at least 6 structure assets:

```txt
structure.block.lowrise
structure.block.midrise
structure.block.tower
structure.rooftop.kiosk
structure.rooftop.antenna
structure.landmark.placeholder
```

Required metadata:

```txt
category: structure-compatible source category or building-tagged source category
tags: ["structure", "building"] where appropriate
label
silhouetteClass
paletteRef or visual token
placement readiness: placeable
```

### Vehicle Assets

Seed at least 6 vehicle assets:

```txt
vehicle.car.compact
vehicle.van.delivery
vehicle.bus.city
vehicle.truck.box
vehicle.taxi.generic
vehicle.service.utility
```

Required metadata:

```txt
category: road or transit
actorCategory default resolves to vehicle
actorType safe fallback custom unless existing valid type is known
silhouetteClass readable in proxy layer
tags for search
```

### Maritime Assets

Seed at least 6 maritime assets:

```txt
maritime.boat.service
maritime.ferry.small
maritime.tug.generic
maritime.barge.flat
maritime.sailboat.simple
maritime.cargo.small
```

Required metadata:

```txt
category: marine
actorCategory default resolves to maritime
actorType vessel when valid
tags include maritime/marine/vessel/boat as applicable
silhouetteClass maps to existing proxy family
```

### Aircraft Assets

Seed at least 4 aircraft assets:

```txt
aircraft.light.plane
aircraft.helicopter.placeholder
aircraft.regional.jet
aircraft.drone.placeholder
```

Required metadata:

```txt
category: aircraft
actorCategory default resolves to vehicle under current 0615F mapping unless valid aircraft category exists in Inspector
actorType safe fallback custom unless valid type exists
silhouetteClass aircraft-readable
```

### Prop Assets

Seed at least 8 prop assets:

```txt
prop.kioMAPBOX_SECRET_TOKEN_REMOVED
prop.billboard.standard
prop.sign.tall
prop.stage.block
prop.crate.stack
prop.light.tower
prop.marker.event
prop.rooftop.box
```

Required metadata:

```txt
category: prop/world/civic/system-compatible as appropriate
actorCategory default resolves to prop
actorType custom
search tags
readable label
```

## Metadata Contract

Each seeded asset must support this minimum shape:

```js
{
  id: "prop.kioMAPBOX_SECRET_TOKEN_REMOVED",
  label: "Small Kiosk",
  category: "world",
  silhouetteClass: "world-prop",
  tags: ["prop", "kiosk", "street"],
  paletteRef: "...",          // optional but preferred
  defaultVariant: "proxy",    // if variants exist
  variants: { ... }            // existing registry pattern only
}
```

Use the existing asset registry pattern. Do not invent a new registry system if one already exists.

## Placement Compatibility

0616A must preserve the 0615F placement logic:

```txt
asset.category/tags
→ WOSAssetResolver.resolvePlacementDefaults(assetId)
→ actorCategory / actorType
→ WOSActorPlacementController.place(...)
→ ActorObjectRenderLayer proxy category
```

After this pass, selecting assets from each category should produce useful actor defaults.

Expected defaults:

```txt
building-tagged structure assets → actorCategory: structure, actorType: building
road/transit assets → actorCategory: vehicle, actorType: custom
marine assets → actorCategory: maritime, actorType: vessel or custom
aircraft assets → actorCategory: vehicle or valid aircraft category, actorType: custom/aircraft if valid
prop/world/civic/system assets → actorCategory: prop, actorType: custom
```

Do not force invalid actorType values. Use `custom` when uncertain.

## Library UX Requirements

The Library must clearly show:

```txt
asset label
asset category
readiness tag when unresolved/experimental
active placement asset
category group
searchable tags/label/id
```

Add only lightweight UI if needed:

```txt
category badge
placement default hint
asset count per category
```

No modal editor yet.

## Inspector Requirements

The Actor Inspector should continue to show:

```txt
assetId dropdown
asset/category mismatch note
save refreshes proxy
```

0616A may add a display-only asset metadata block, but it must not block saves.

Suggested display-only fields:

```txt
Resolved asset category
Placement actorCategory
Placement actorType
Readiness
Tags
```

## Debug Requirements

Extend `_wos.debug.studio.assetPlacement()` or add `_wos.debug.studio.assetPack()`.

Required debug snapshot:

```js
{
  assetCount: number,
  categories: {
    structure: number,
    road: number,
    marine: number,
    aircraft: number,
    prop: number,
    system: number,
    unknown: number
  },
  placeableCount: number,
  unresolvedCount: number,
  experimentalCount: number,
  activeAssetId: string | null,
  activeAssetCategory: string,
  lastError: string | null
}
```

## Acceptance Tests

### AC1 — Registry parses

All edited JavaScript files parse cleanly.

```bash
node --check studio/actors/assetResolver.js
node --check studio/views/libraryController.js
node --check studio/studioShell.js
```

Adjust file list to actual edited files.

### AC2 — Asset inventory exists

Debug snapshot returns nonzero counts:

```js
_wos.debug.studio.assetPack()
```

Expected:

```txt
assetCount >= 30
structure >= 6
vehicle/road/transit >= 6
marine >= 6
aircraft >= 4
prop/world/civic/system >= 8
```

### AC3 — Placement defaults resolve

Run representative assets:

```js
WOSAssetResolver.resolvePlacementDefaults('structure.block.lowrise')
WOSAssetResolver.resolvePlacementDefaults('vehicle.bus.city')
WOSAssetResolver.resolvePlacementDefaults('maritime.tug.generic')
WOSAssetResolver.resolvePlacementDefaults('aircraft.light.plane')
WOSAssetResolver.resolvePlacementDefaults('prop.kioMAPBOX_SECRET_TOKEN_REMOVED')
```

Expected:

```txt
no invalid actorType
no undefined actorCategory
resolved true for seeded assets
```

### AC4 — Library selection drives placement

In Studio:

```txt
select prop.kioMAPBOX_SECRET_TOKEN_REMOVED
click Place in 3D Canvas
click map
```

Expected:

```txt
actor appears
assetId = prop.kioMAPBOX_SECRET_TOKEN_REMOVED
actorCategory = prop
proxy appears immediately
```

Repeat for structure, vehicle, maritime, aircraft representative assets.

### AC5 — Building replacement asset path

Select a structure asset, then select a building and click Create Structure Replacement.

Expected:

```txt
new structure actor uses active structure asset
building suppresses
replacement actor appears
Inspector binding is correct
```

If active asset is not structure-compatible, fallback remains `wos_placeholder_cube`.

### AC6 — Search works

Library search should find assets by:

```txt
id
label
category
tag
```

Examples:

```txt
kiosk
bus
ferry
antenna
billboard
```

### AC7 — Existing behavior preserved

These must still work:

```txt
0615D visual dropdown
0615D authoring scale toggle
0615E building selection/replacement
0615F active asset placement
Phase 8 publish preview
```

### AC8 — No forbidden manifest fields

```bash
grep -R "shapeRecipe\|materialRecipe\|assetPath\|assetUrl\|glbPath\|studioVisualScaleMultiplier\|authoringScaleEnabled\|proxyDetailMode" studio wall/data wall/systems || true
```

Expected:

```txt
no new manifest/publish/runtime leakage
```

Existing pre-0616 references must be explicitly identified if present.

### AC9 — Wall untouched

```bash
git diff -- wall
```

Expected:

```txt
no wall runtime changes from 0616A
```

## Non-Goals

Do not create editable object forms.

Do not add object color editor.

Do not save custom assets yet.

Do not publish custom asset recipes.

Do not import GLB.

Do not change Wall renderer.

## Completion Definition

0616A is complete when Studio has a useful, searchable, category-aware asset pack and the existing 0615F Library → placement → proxy loop works across structure, vehicle, maritime, aircraft, and prop examples.

