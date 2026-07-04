# 0616B_WOS_ProxyShapeEditorPass_v1.0.0_BUILD

## Status

```txt
BUILD SPEC
Date: 2026-06-16
Scope: Studio-only
Target: Parametric proxy shape authoring
```

## Purpose

0616B creates the first real object-form authoring surface inside Studio.

The goal is not GLB import, Blender-level modeling, or Wall runtime publishing. The goal is to let Studio edit simple parametric proxy shapes for WOS assets and preview those shape changes live in the 3D Canvas.

```txt
select asset
→ open shape editor
→ edit simple form parameters
→ preview live proxy shape
→ keep changes Studio-only
```

This is the first pass where “create a 3D object” starts to become true inside Studio.

## Build Target

Add a Studio-only Shape Editor that can edit parametric recipes for proxy objects across these categories:

```txt
structure
vehicle
maritime
aircraft
prop
```

The editor should produce a temporary `shapeRecipe`-like draft object internally, but must not publish or inject that recipe into actor manifests yet.

0616B is an authoring preview pass, not a persistence/publish pass.

## Hard Constraints

Do not modify Wall runtime.

Do not modify publish pipeline.

Do not change actor manifest schema.

Do not add GLB import.

Do not add asset-publish support.

Do not persist `shapeRecipe` into actor manifests.

Do not persist `materialRecipe` into actor manifests.

Do not write custom assets to Wall bundles.

Do not change Phase 8 bundle rules.

Do not break 0615D visual controls, 0615E building replacement, 0615F placement, or 0616A asset pack behavior.

## Files Likely Changed

```txt
studio/views/actorProxyGeometryFactory.js
studio/views/actorObjectRenderLayer.js
studio/studioShell.js
studio/styles.css
```

Optional new file:

```txt
studio/views/proxyShapeEditorController.js
```

Only touch additional Studio files if needed for clean state wiring or debug exposure.

## Core Concept

A proxy shape recipe is a Studio-only description of editable dimensions for a procedural object.

Example internal draft shape:

```js
{
  assetId: "prop.kioMAPBOX_SECRET_TOKEN_REMOVED",
  template: "prop.boxStack",
  params: {
    lengthM: 4,
    widthM: 3,
    heightM: 3,
    roofHeightM: 0.5,
    taper: 0,
    cabinHeightM: 0,
    mastHeightM: 0,
    wingSpanM: 0
  }
}
```

In 0616B this object is preview/session state only.

Persistence belongs to 0616D.

## Shape Templates

Support at least these templates:

```txt
structure.block
structure.tower
vehicle.body
maritime.hull
aircraft.fuselage
prop.boxStack
```

Each template must map to an existing proxy category where possible.

### structure.block

Editable controls:

```txt
lengthM
widthM
heightM
roofHeightM
setbackM
```

Expected visual:

```txt
box mass
optional roof/setback marker
footprint/base ring remains available from 0615D selection logic
```

### structure.tower

Editable controls:

```txt
baseLengthM
baseWidthM
heightM
shaftScale
roofHeightM
```

Expected visual:

```txt
vertical tower mass
smaller shaft or top volume if supported
```

### vehicle.body

Editable controls:

```txt
lengthM
widthM
heightM
roofHeightM
frontSlope
rearSlope
```

Expected visual:

```txt
vehicle body
roof/cabin marker
front direction still readable through 0615D arrow
```

### maritime.hull

Editable controls:

```txt
lengthM
widthM
heightM
bowTaper
sternTaper
cabinHeightM
```

Expected visual:

```txt
hull wedge
bow readable
optional cabin block
waterline/shadow if already supported
```

### aircraft.fuselage

Editable controls:

```txt
lengthM
bodyWidthM
bodyHeightM
wingSpanM
tailSpanM
noseTaper
```

Expected visual:

```txt
fuselage
wings
tail
nose direction readable
```

### prop.boxStack

Editable controls:

```txt
lengthM
widthM
heightM
baseHeightM
topHeightM
```

Expected visual:

```txt
simple prop mass
optional top cap or stacked volume
```

## UI Requirements

Add a Shape Editor section in Inspector when a Draft actor is selected.

Minimum UI:

```txt
Shape Editor
Template dropdown
Parameter sliders / number inputs
Reset Shape
Preview Shape
```

Preferred UI:

```txt
Shape Editor
Template: [structure.block]
Length
Width
Height
Secondary parameter fields based on template
[Reset]
[Apply Preview]
```

The UI should only appear for editable Draft actors.

Promoted/Retired actors must not expose editable shape controls unless the user forks first.

## Preview Behavior

Shape edits must update the selected actor's Studio proxy preview immediately or after an explicit Preview button.

Allowed:

```txt
live update on input
explicit Preview Shape button
```

Preferred:

```txt
live update on input with safe debouncing
```

The render layer must be able to rebuild the selected actor proxy from the current draft shape recipe without requiring page reload.

## Data Rules

0616B may use session-only state:

```txt
proxyShapeDraft
shapeEditorDraft
selectedShapeTemplate
shapeParams
```

0616B may use localStorage only for editor UI preference if needed:

```txt
wos.studio.shapeEditorOpen
wos.studio.lastShapeTemplate
```

0616B must not write any of these to:

```txt
actor manifest
published Wall bundle
wall runtime files
promotion gate canonical fields
```

The following strings must not appear in actor manifest JSON or Wall bundles after this pass:

```txt
shapeRecipe
materialRecipe
proxyShapeDraft
shapeEditorDraft
selectedShapeTemplate
shapeParams
```

## Render Layer Requirements

`ActorObjectRenderLayer` should support a Studio-only shape override for previewing the selected actor.

Suggested methods:

```js
setShapePreview(objectId, shapeDraft)
clearShapePreview(objectId)
getShapePreview(objectId)
getShapeEditorSnapshot()
```

The layer must preserve:

```txt
selection ring
heading arrow
authoring scale toggle
visual detail mode
material override preview
map look remount behavior
```

If a shape preview exists, it should override the default proxy geometry for that actor only in Studio.

## Proxy Geometry Factory Requirements

`actorProxyGeometryFactory.js` should add a parametric creation path.

Suggested API:

```js
createFromShapeRecipe(category, actorType, detailMode, shapeDraft)
```

or:

```js
create(category, actorType, detailMode, options)
```

Where `options.shapeDraft` is optional.

If no shape draft exists, existing 0615D proxy behavior must remain unchanged.

## Shape Parameter Defaults

Provide defaults per category/template.

Suggested defaults:

```js
structure.block: {
  lengthM: 12,
  widthM: 10,
  heightM: 24,
  roofHeightM: 2,
  setbackM: 0
}

vehicle.body: {
  lengthM: 5,
  widthM: 2.2,
  heightM: 1.8,
  roofHeightM: 0.6,
  frontSlope: 0.2,
  rearSlope: 0.1
}

maritime.hull: {
  lengthM: 14,
  widthM: 4,
  heightM: 2,
  bowTaper: 0.6,
  sternTaper: 0.25,
  cabinHeightM: 1.6
}

aircraft.fuselage: {
  lengthM: 12,
  bodyWidthM: 1.8,
  bodyHeightM: 1.8,
  wingSpanM: 12,
  tailSpanM: 4,
  noseTaper: 0.5
}

prop.boxStack: {
  lengthM: 3,
  widthM: 3,
  heightM: 3,
  baseHeightM: 0.3,
  topHeightM: 0.5
}
```

Values may be adjusted if the existing proxy scale convention requires it.

## Debug Requirements

Add:

```js
_wos.debug.studio.shapeEditor()
```

Required snapshot:

```js
{
  enabled: true,
  selectedObjectId: string | null,
  selectedAssetId: string | null,
  selectedActorCategory: string | null,
  template: string | null,
  hasDraft: boolean,
  draftParams: object | null,
  previewActive: boolean,
  dirty: boolean,
  lastError: string | null
}
```

Also useful:

```js
_wos.debug.studio.previewShape({ template, params })
_wos.debug.studio.clearShapePreview()
```

These optional debug helpers should remain Studio-only.

## Acceptance Tests

### AC1 — JavaScript parses

All edited JS files parse cleanly.

```bash
node --check studio/views/actorProxyGeometryFactory.js
node --check studio/views/actorObjectRenderLayer.js
node --check studio/studioShell.js
```

Add optional controller file if created:

```bash
node --check studio/views/proxyShapeEditorController.js
```

### AC2 — Shape editor appears for Draft actor

In Studio:

```txt
place prop.kioMAPBOX_SECRET_TOKEN_REMOVED
select actor
open Inspector
```

Expected:

```txt
Shape Editor section visible
Template dropdown visible
parameter controls visible
```

### AC3 — Shape editor hidden/protected for promoted actors

Promote or simulate promoted actor.

Expected:

```txt
no direct editable shape controls
fork/edit path remains governance-controlled
```

### AC4 — Prop shape preview works

```txt
select prop.kioMAPBOX_SECRET_TOKEN_REMOVED
change heightM
```

Expected:

```txt
selected proxy changes height in 3D Canvas
selection ring remains visible
heading arrow behavior unchanged
actor manifest remains clean
```

### AC5 — Structure shape preview works

```txt
select structure.block.lowrise
change heightM / roofHeightM
```

Expected:

```txt
structure proxy updates
building replacement binding, if present, is not broken
```

### AC6 — Maritime shape preview works

```txt
select maritime.tug.generic
change lengthM / bowTaper / cabinHeightM
```

Expected:

```txt
hull reads differently
bow direction remains readable
heading arrow remains correct
```

### AC7 — Vehicle shape preview works

```txt
select vehicle.bus.city
change lengthM / widthM / roofHeightM
```

Expected:

```txt
vehicle silhouette updates
front direction remains readable
```

### AC8 — Aircraft shape preview works

```txt
select aircraft.light.plane
change wingSpanM / lengthM
```

Expected:

```txt
aircraft silhouette updates
wing span visibly changes
```

### AC9 — Visual controls still work

After editing a shape:

```txt
change Visual: Simple / Readable / Hero
change Auth Scale on/off
```

Expected:

```txt
shape preview survives or cleanly rebuilds
no stale object
no selection loss
```

### AC10 — Map look switch still works

After editing a shape:

```js
_wos.debug.studio.setMapLook('tron')
_wos.debug.studio.setMapLook('illustration')
```

Expected:

```txt
no style-loading error
custom shape preview remounts or clears safely
no crash
```

### AC11 — No forbidden manifest/publish fields

After previewing several shapes, inspect actor manifest and published bundle.

```bash
grep -R "shapeRecipe\|materialRecipe\|proxyShapeDraft\|shapeEditorDraft\|selectedShapeTemplate\|shapeParams" studio/data wall/data || true
```

Expected:

```txt
no actor manifest or Wall bundle leakage
```

Existing source-code references inside Studio editor files are allowed only if they are clearly session/editor state.

### AC12 — Wall untouched

```bash
git diff -- wall
```

Expected:

```txt
no wall runtime changes from 0616B
```

## Non-Goals

Do not save custom assets yet.

Do not add object color/material recipe authoring yet.

Do not publish custom shapes.

Do not modify Wall runtime.

Do not import GLB.

Do not add complex mesh editing.

Do not add freeform vertex editing.

Do not build a Blender clone.

## Completion Definition

0616B is complete when a selected Draft actor can have its simple 3D proxy form edited through Studio Inspector controls, and the result is previewed live on the 3D Canvas without changing actor manifests, publish bundles, or Wall runtime.

```txt
asset exists
→ actor placed
→ actor selected
→ shape parameters edited
→ proxy form changes visibly
→ manifest remains canonical
```

## Next Pass

```txt
0616C_WOS_ObjectColorMaterialAuthoringPass_v1.0.0_BUILD
```

Purpose:

```txt
shape editor exists
→ add object color/material controls
→ preview form + color together
→ still Studio-only
```
