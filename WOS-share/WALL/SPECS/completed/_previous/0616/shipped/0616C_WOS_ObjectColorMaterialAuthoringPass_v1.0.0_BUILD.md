# 0616C_WOS_ObjectColorMaterialAuthoringPass_v1.0.0_BUILD

## Status

BUILD

## Classification

```txt
studio-authoring-ux
3d-canvas
object-material-authoring
parametric-object-preview
post-0616B
```

## Purpose

0616C adds Studio-only object color and material authoring for placed Draft actors, continuing directly from 0616B's parametric Shape Editor.

The authoring loop becomes:

```txt
place asset
→ select Draft actor
→ edit parametric shape
→ edit object color/material slots
→ preview live in 3D Canvas
→ keep manifests, publish bundle, and Wall runtime unchanged
```

0616C is **not** the custom asset save pass. It previews object material decisions only. Persistence into reusable custom assets belongs to 0616D.

---

## Required definition: parametric template

A **parametric template** is a procedural 3D shape recipe made from named numeric controls instead of a hand-authored mesh file.

Example:

```txt
template: vehicle.body
params:
  lengthM: 5
  widthM: 2.2
  heightM: 1.8
  roofHeightM: 0.6
  frontSlope: 0.2
  rearSlope: 0.1
```

The template defines the object family and construction rules. The params define the actual proportions.

In WOS terms:

```txt
parametric template = reusable procedural shape type
params = editable numbers that change its dimensions
shape draft = Studio-only current edit state for one actor
shape recipe = future saved version of that shape draft
```

This is why 0616B can make a vehicle longer, a tower taller, a hull wider, or a prop stack higher without importing a GLB.

---

## Non-goals

0616C must not add:

```txt
Wall runtime material recipe loading
publish bundle schema changes
actor manifest schema changes
custom asset persistence
GLB material editing
texture/UV editing
per-face mesh editing
lighting engine changes
new palette authority
new registry authority
```

---

## Primary files

```txt
studio/views/objectMaterialAuthoringController.js   NEW
studio/views/actorProxyGeometryFactory.js
studio/views/actorObjectRenderLayer.js
studio/views/threeDCanvasView.js
studio/studioShell.js
studio/styles.css
studio/index.html
```

Optional, only if needed:

```txt
studio/actors/assetResolver.js
```

---

## Existing systems to preserve

0616C must preserve:

```txt
0615D visual controls
0615E building replacement workflow
0615F asset placement loop
0616A Studio asset pack
0616B Shape Editor preview flow
Phase 7 MaterialOverrideController behavior
Phase 8 publish cleanup behavior
```

0616C may extend Phase 7 behavior, but must not break it.

---

## Required behavior

### 1. Object material draft controller

Create:

```txt
studio/views/objectMaterialAuthoringController.js
```

It owns Studio-only material draft state:

```js
objectId → {
  slots: {
    body: '#A89880',
    roof: '#9A8870',
    glass: '#203848',
    accent: '#00CED1',
    edge: '#111111',
    emissive: '#000000'
  },
  materialClass: 'lambert' | 'standard' | 'emissive',
  roughness: number,
  metalness: number,
  opacity: number,
  dirty: boolean
}
```

The controller must expose:

```js
selectActor(actor)
getDraft(objectId)
setSlot(objectId, slot, hex)
setMaterialClass(objectId, materialClass)
setScalar(objectId, key, value)
previewMaterial(objectId)
resetMaterial(objectId)
clearPreview(objectId)
discardDraft(objectId)
previewActive(objectId)
getSnapshot(objectId, actor)
```

Rules:

```txt
Draft state is in-memory only.
No materialRecipe is saved in 0616C.
Selecting an actor may seed defaults but must not mutate the actor.
Changing a value previews immediately.
Reset returns to default proxy material appearance.
```

---

### 2. Proxy factory material slot support

Extend `actorProxyGeometryFactory.js` so parametric and default proxy meshes can carry stable semantic material slots.

Minimum slots:

```txt
body
roof
glass
accent
edge
emissive
```

Implementation may use `mesh.userData.materialSlot`.

Example:

```js
mesh.userData.materialSlot = 'body';
```

Required slot mapping:

| Category | Required slots |
|---|---|
| structure | body, roof, edge, accent |
| vehicle | body, roof, glass, accent |
| maritime | body, cabin/roof, accent |
| aircraft | body, accent, edge |
| prop | body, accent |

If a mesh has no explicit slot, it must default to `body`.

---

### 3. Render layer preview application

Extend `actorObjectRenderLayer.js` with material preview support:

```js
setMaterialPreview(objectId, materialDraft)
clearMaterialPreview(objectId)
getMaterialPreview(objectId)
getObjectMaterialSnapshot()
```

Behavior:

```txt
Preview applies to the actor's current Object3D.
Preview survives shape preview rebuilds.
Preview survives Visual/Auth Scale resync.
Preview survives map-look remount.
Preview is cleared when actor is removed.
Preview does not write actor manifests.
```

Important: when 0616B shape preview rebuilds the proxy, the material preview must reapply afterward.

---

### 4. Inspector Object Material Editor

Add an Inspector section for Draft actors:

```txt
Object Material Editor
```

Controls:

```txt
body color
roof color
glass color
accent color
edge color
emissive color
materialClass dropdown
roughness slider/number
metalness slider/number
opacity slider/number
Reset Material
Preview Material
```

Minimum acceptable first UI:

```txt
body color
roof color
accent color
materialClass
Reset Material
```

Gating:

```txt
DRAFT actor: editor visible
GATE_PENDING actor: editor hidden or read-only
PROMOTED actor: editor hidden; fork required
RETIRED actor: hidden
```

---

### 5. Preserve existing Phase 7 material override

0616C must not delete or break:

```txt
WOSMaterialOverrideController
Material Override Inspector section
materialOverrideController.js
wosPalette.js
Phase 8 draft-discard before publish
```

0616C is a broader object-material preview layer for shape-authored objects. Phase 7 remains the existing actor material override path.

If both systems are active, the order must be deterministic:

```txt
base proxy material
→ Phase 7 material override, if committed/previewing
→ 0616C object material preview, if active
```

0616C preview wins visually in Studio only.

---

### 6. Debug API

Add:

```js
_wos.debug.studio.objectMaterial()
_wos.debug.studio.previewObjectMaterial(objectId, draft)
_wos.debug.studio.clearObjectMaterialPreview(objectId)
```

Snapshot shape:

```js
{
  enabled: true,
  selectedObjectId,
  selectedAssetId,
  selectedActorCategory,
  hasDraft,
  previewActive,
  dirty,
  slots,
  materialClass,
  roughness,
  metalness,
  opacity,
  previewCount,
  lastError
}
```

---

## Data contract

0616C must not write any of these fields to actor manifests:

```txt
materialRecipe
materialDraft
objectMaterialDraft
objectMaterialPreview
materialSlots
slotColors
emissiveColor
roughness
metalness
opacity
```

These become eligible for persistence later in 0616D, but not here.

---

## Acceptance tests

### AC1 — Draft actor shows Object Material Editor

```txt
Place actor
Select actor
Open Inspector
```

Expected:

```txt
Object Material Editor visible for DRAFT actor.
```

---

### AC2 — Color preview applies live

Change body color.

Expected:

```txt
Selected 3D proxy changes body color immediately.
No Save required.
```

---

### AC3 — Slot-specific preview works

Change at least two slots, for example:

```txt
body = red
roof/accent = cyan
```

Expected:

```txt
Different object parts show different colors when those slots exist.
Meshes without explicit slots fall back to body color.
```

---

### AC4 — Shape rebuild keeps material preview

With a material preview active:

```txt
change a 0616B shape parameter
or switch Visual Simple/Readable/Hero
or toggle Auth Scale
```

Expected:

```txt
Shape updates.
Material preview remains applied.
```

---

### AC5 — Map look remount keeps material preview

With a material preview active:

```txt
switch Look: tron → illustration → authoring
```

Expected:

```txt
Object remounts.
Material preview remains applied.
No style-loading errors introduced.
```

---

### AC6 — Reset clears preview

Click `Reset Material`.

Expected:

```txt
Object returns to default proxy/override material appearance.
Preview is inactive.
Draft dirty state clears.
```

---

### AC7 — Promoted actor is protected

Promote actor or select promoted actor.

Expected:

```txt
Object Material Editor does not allow direct editing.
User must fork actor first.
```

---

### AC8 — Existing Phase 7 still works

Use existing Material Override controls.

Expected:

```txt
Existing Phase 7 material override still previews/saves/resets as before.
```

---

### AC9 — Debug snapshot exists

Run:

```js
_wos.debug.studio.objectMaterial()
```

Expected:

```txt
enabled: true
selectedObjectId present when actor selected
previewActive reflects current state
slots object present
```

---

### AC10 — Manifest leak check

Run against Studio actor manifest storage/export/publish bundle paths:

```bash
grep -R "materialRecipe\|materialDraft\|objectMaterialDraft\|objectMaterialPreview\|materialSlots\|slotColors\|emissiveColor\|roughness\|metalness\|opacity" studio/actors wall/data 2>/dev/null
```

Expected:

```txt
No manifest or publish bundle leakage.
Comment-only mentions in 0616C source are acceptable only if not in persisted JSON paths.
```

---

### AC11 — Wall diff check

```bash
git diff --name-only | grep '^wall/'
```

Expected:

```txt
No new Wall runtime files touched by 0616C.
```

Existing pre-session Wall diffs, if any, must be identified separately and not attributed to 0616C.

---

## Suggested implementation notes

### `actorProxyGeometryFactory.js`

Add helper:

```js
function _slot(mesh, slot) {
  mesh.userData.materialSlot = slot || 'body';
  return mesh;
}
```

Use it when creating meshes:

```js
_slot(body, 'body')
_slot(roof, 'roof')
_slot(windowMesh, 'glass')
_slot(noseMarker, 'accent')
```

### `actorObjectRenderLayer.js`

Store previews:

```js
this._materialPreviews = {};
```

After `_buildEntry(actor)` creates the object:

```js
if (this._matCtrl) this._matCtrl.applyFromManifest(actor.objectId);
this._applyMaterialPreview(actor.objectId);
```

### `objectMaterialAuthoringController.js`

Mirror 0616B controller shape:

```txt
lazy draft seed
immediate preview
reset
clear
snapshot
```

Do not create a commit/save method in 0616C.

---

## Ship gate

0616C is accepted only when this is true:

```txt
A placed Draft actor can have its visible proxy colors/materials edited live in Studio, without saving any material recipe into manifests, publish bundles, or Wall runtime.
```

---

## Next pass

```txt
0616D_WOS_CustomStudioAssetSavePass_v1.0.0_BUILD
```

Purpose:

```txt
shape draft
+ material draft
→ saved reusable custom Studio asset
→ clean asset registry entry
→ still no Wall runtime publish until 0616H
```
