# 0615D_WOS_3DAssetVisualAuthoringPass_v1.0.0_BUILD

## Status

BUILD

## Classification

```txt
studio-authoring-ux
3d-canvas
asset-visual-authoring
actor-render-readability
post-0615C
```

## Purpose

Turn the Studio 3D Canvas from a marker-first placement surface into a usable 3D object authoring surface.

The user must be able to place an actor and immediately understand:

```txt
what object was placed
where the object is
how large it is
which object is selected
how the object is oriented
whether the object is a proxy, lowpoly, or hero preview
```

This pass does **not** create the full GLB asset pipeline. It makes the existing Phase 5 render layer visually useful enough for authoring.

---

# Problem Statement

Current Studio can now:

```txt
place actors
save actors
inspect actors
promote actors
publish actors
resolve rough location
switch map looks
```

But the visual authoring experience is still weak:

```txt
actors read as dots first
3D proxies are too easy to miss
scale is not authoring-friendly
selection is not visually dominant
orientation feedback is weak
asset preview and placed object do not feel connected
```

The next requirement is direct visual confidence:

```txt
I placed a vessel / car / prop / building marker,
and I can see it as a 3D object in the map.
```

---

# Architectural Lock

0615D must preserve the already accepted architecture:

```txt
Actor manifest stores truth.
AssetResolver resolves asset metadata.
ActorObjectRenderLayer owns 3D object presentation.
ActorProxyGeometryFactory creates fallback/proxy geometry.
ThreeDCanvasView owns Studio map interaction.
MapLookController owns map look state.
Promotion / publish contracts remain unchanged.
Wall runtime remains untouched.
```

This pass is **Studio visual authoring only**.

---

# Non-Goals

Do not implement:

```txt
full GLB loader pipeline
texture/UV authoring
per-face material editing
Wall runtime visual rendering changes
new actor manifest schema
new publish bundle fields
new promotion gate rules
building replacement UX redesign
Mapbox reverse geocoding
raw Mapbox style editor
```

---

# Files

## Primary files

```txt
studio/views/actorObjectRenderLayer.js
studio/views/actorProxyGeometryFactory.js
studio/views/threeDCanvasView.js
studio/styles.css
```

## Optional new file

```txt
studio/views/actorVisualAuthoringController.js
```

Use the optional controller only if it keeps `threeDCanvasView.js` from growing too large.

---

# Required Features

## 1. Authoring-scale proxy visibility

Placed actors need an authoring-visible scale independent of runtime/broadcast scale.

Add a Studio-only visual scale multiplier:

```js
studioVisualScaleMultiplier
```

Default targets:

```txt
prop       2.0x
vehicle    1.8x
marine     2.2x
aircraft   2.4x
structure  1.0x
```

Rules:

```txt
Applies only inside Studio 3D Canvas.
Does not write to actor manifests.
Does not publish to Wall.
Does not change runtime scale truth.
Can be disabled by debug flag if needed.
```

Suggested debug state:

```js
_wos.debug.studio.visualAuthoring()
```

---

## 2. Selected object outline / base ring

Selected actor must be visually unmistakable.

Add selection presentation to the 3D object layer:

```txt
base ring under selected object
soft vertical selection beam or halo
stronger emissive/edge outline if supported
selected marker remains visible
```

Minimum acceptable result:

```txt
selected object has a clear cyan base ring
selected object is visible even when partially hidden by building/water context
```

This should be handled in `actorObjectRenderLayer.js`, not only CSS marker styling.

---

## 3. Orientation arrow

Every selected actor needs visible heading feedback.

Add a small direction arrow or forward marker to selected proxies:

```txt
vehicle: front direction
marine: bow direction
aircraft: nose direction
prop: generic forward arrow
structure: optional / disabled by default
```

Rules:

```txt
Arrow is Studio-only.
Arrow follows headingDeg.
Arrow updates during rotate preview.
Arrow hides when actor is deselected.
```

---

## 4. Proxy detail tiers

Add Studio proxy detail modes:

```txt
simple
readable
hero-preview
```

Default:

```txt
readable
```

Behavior:

```txt
simple       = current basic proxy shapes
readable     = stronger shape silhouette + selected ring + heading marker
hero-preview = larger object, stronger edges, optional extra category details
```

Do not load external GLB files in this pass.

---

## 5. Category-specific proxy improvements

Improve proxy readability by category.

### Marine

Must read as a boat/vessel, not a generic rectangle.

```txt
hull wedge
bow point
cabin block
stern block for cargo/tanker/container variants
waterline shadow/base
```

### Vehicle

Must read as road vehicle.

```txt
rectangular body
front marker
roof/cabin block
wheel hints optional
```

### Aircraft

Must read as aircraft.

```txt
fuselage
wings
tail plane
nose direction marker
```

### Prop

Must read as placed object, not only a dot.

```txt
cube/cylinder/sphere fallback
base ring
strong silhouette
```

### Structure

Must remain stable and not over-scaled.

```txt
building-like mass
base footprint
optional roof marker
```

---

## 6. Asset preview → placed object connection

When an asset is selected in Library and armed for placement, the 3D Canvas should show the intended asset family clearly.

Minimum behavior:

```txt
active asset name remains visible in toolbar
placing actor creates a 3D proxy matching asset category/silhouette
selected actor label uses displayLabel or asset name
```

Preferred behavior:

```txt
hover/armed ghost preview follows cursor before placement
```

Ghost preview is optional for this pass. Do not block on it.

---

## 7. Visual authoring debug snapshot

Expose debug snapshot:

```js
_wos.debug.studio.visualAuthoring()
```

Suggested output:

```js
{
  enabled: true,
  selectedObjectId: "...",
  objectCount: 5,
  visibleObjectCount: 5,
  proxyDetailMode: "readable",
  studioScaleEnabled: true,
  selectedHasBaseRing: true,
  selectedHasHeadingArrow: true,
  categories: {
    marine: 2,
    vehicle: 1,
    prop: 1,
    structure: 1
  }
}
```

---

# UI Requirements

## Toolbar controls

Add compact controls to the 3D Canvas toolbar:

```txt
Visual: Simple / Readable / Hero
Scale: Authoring / True
```

Minimum acceptable:

```txt
Visual dropdown only
```

Rules:

```txt
Controls are Studio-only.
Do not write to manifest.
Do not affect publish bundle.
Persist only as optional localStorage preference.
```

Optional localStorage keys:

```txt
wos.studio.proxyDetailMode
wos.studio.authoringScale
```

---

# Data Rules

0615D must not add these to manifests:

```txt
studioVisualScaleMultiplier
proxyDetailMode
authoringScaleEnabled
selectedVisualState
baseRing
headingArrow
```

These are presentation/session preferences only.

---

# Acceptance Criteria

## AC1 — Object is visible after placement

```txt
Place a Generic Vessel.
Expected: a visible 3D vessel-like proxy appears on the map, not only a marker dot.
```

## AC2 — Selected object is unmistakable

```txt
Select the actor.
Expected: selected 3D object shows a clear base ring / selection halo.
```

## AC3 — Heading is visible

```txt
Rotate actor using existing rotation control.
Expected: heading arrow / bow marker follows heading preview and committed heading.
```

## AC4 — Category shapes are distinct

```txt
Place one marine, one vehicle, one aircraft, one prop, one structure.
Expected: each category has a visibly different 3D proxy silhouette.
```

## AC5 — Visual mode changes proxy presentation only

```txt
Switch Visual mode from Simple → Readable → Hero.
Expected: visual readability changes.
Expected: actor manifest does not mutate.
```

## AC6 — Authoring scale does not publish

```txt
Enable Authoring Scale.
Publish promoted actor.
Expected: wall/data/wos-wall-runtime-bundle.json does not contain studioVisualScaleMultiplier or authoringScaleEnabled.
```

## AC7 — Phase 8 publish still passes

```bash
grep -R "assetPath\|assetUrl\|glbPath\|previewAnchor\|previewHeading\|inspectorDraft\|studioVisualScaleMultiplier\|authoringScaleEnabled\|proxyDetailMode" wall/data/wos-wall-runtime-bundle.json
```

Expected:

```txt
no output
```

## AC8 — Map look system remains stable

```js
_wos.debug.studio.setMapLook('tron')
_wos.debug.studio.setMapLook('illustration')
```

Expected:

```txt
No Style is not done loading error.
3D proxies remain mounted or remount correctly.
```

## AC9 — No Wall runtime files touched

```bash
git diff --name-only | grep '^wall/systems/runtime/'
```

Expected:

```txt
no files from 0615D
```

## AC10 — Debug snapshot exists

```js
_wos.debug.studio.visualAuthoring()
```

Expected:

```txt
returns object with proxy detail mode, authoring scale state, selected object state, and category counts
```

---

# Implementation Notes

## ActorObjectRenderLayer

Likely changes:

```txt
add proxy detail mode state
add authoring scale state
add selected base ring mesh
add heading arrow mesh
update selection renderer
update preview heading handling
resync object visuals when mode changes
```

Suggested public methods:

```js
setProxyDetailMode(mode)
getProxyDetailMode()
setAuthoringScaleEnabled(enabled)
getAuthoringScaleEnabled()
getVisualAuthoringSnapshot()
```

## ActorProxyGeometryFactory

Likely changes:

```txt
improve category geometry groups
add readable/hero variants
add direction marker geometry helpers
add base ring helper geometry or leave ring to render layer
```

## ThreeDCanvasView

Likely changes:

```txt
add Visual dropdown
wire mode to ActorObjectRenderLayer
persist optional localStorage preference
expose debug snapshot through Studio shell or global debug namespace
```

## StudioShell

Only touch if needed for debug namespace:

```js
_wos.debug.studio.visualAuthoring = function () { ... }
```

---

# Manual Test Plan

```txt
1. Hard reload Studio at #3d-canvas.
2. Confirm mapLook ready:true.
3. Select Generic Vessel.
4. Place actor on water.
5. Confirm 3D vessel proxy appears.
6. Select actor.
7. Confirm selection base ring appears.
8. Rotate actor.
9. Confirm heading arrow follows rotation.
10. Place vehicle, aircraft, prop, structure.
11. Confirm category silhouettes differ.
12. Toggle Visual mode.
13. Confirm manifests do not mutate.
14. Promote one actor.
15. Publish actor bundle.
16. Run forbidden grep.
17. Confirm Wall runtime files untouched.
```

---

# Ship Gate

0615D is complete only when this statement is true:

```txt
A placed actor is visibly present as a 3D object in Studio, not merely represented by a marker dot.
```

Minimum acceptable screenshot:

```txt
Studio 3D Canvas visible
one selected actor
3D proxy object visible
selection base ring visible
heading direction visible
map look controls still functional
```

---

# Next Pass After 0615D

```txt
0615E_WOS_BuildingAuthoringUXPass_v1.0.0_BUILD
```

Purpose:

```txt
Make real Mapbox building selection, replacement, restore, and linked actor editing visually direct and understandable.
```
