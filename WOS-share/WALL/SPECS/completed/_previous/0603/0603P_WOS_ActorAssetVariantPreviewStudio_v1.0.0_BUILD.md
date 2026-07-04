---
layout: spec
title: "Actor Asset Variant Preview Studio"
date: 2026-06-03
doc_id: "0603_WOS_ActorAssetVariantPreviewStudio_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "studio"
component: "actor_asset_variant_preview"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "studio-preview-authority"

summary: "Adds a Studio-side asset variant preview workflow so Actor Asset Library entries can be inspected by variant, LOD tier, palette, identity metadata, and future file references before editable replacement lands."

doctrine:
  - "Studio previews assets"
  - "Wall renders the live world"
  - "Asset records define replaceable visual options"
  - "Preview must not mutate truth"
  - "Preview must not start live feeds"
  - "Variant inspection comes before variant editing"

depends_on:
  - "0603N_WOS_WallStudioWorkspaceSplit_v1.0.0"
  - "0603O_WOS_ActorAssetLibraryAuthority_v1.0.0"

enables:
  - "asset variant selector"
  - "read-only asset preview stage"
  - "variant metadata inspection"
  - "future SVG/WebP/GLB preview"
  - "future editable asset replacement"

tags:
  - "wos"
  - "studio"
  - "asset-library"
  - "variant-preview"
  - "actor-assets"
  - "authoring"
---

# 0603P_WOS_ActorAssetVariantPreviewStudio_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Add a proper asset variant preview workflow to Studio.

0603O created the Actor Asset Library Authority.

Studio can now list asset records, assignments, and variants, but the experience is still mostly metadata.

0603P upgrades Studio so selecting an asset shows:

```text
Asset
→ Variant Selector
→ Preview Stage
→ Variant Details
→ Palette / Glyph / File Metadata
```

This is the step before editable asset replacement.

---

# Core Problem

The current Asset Library view confirms that assets exist, but it does not yet make assets feel like replaceable visual objects.

Current:

```text
Asset row
Variant table
Inspector fields
```

Needed:

```text
Asset card
Variant selector
Visual preview
LOD/variant metadata
Palette swatches
Future file slots
```

This lets WOS evaluate whether an asset is ready to become editable.

---

# Scope

This spec is Studio-only.

It must not modify:

- TruthActorRuntime
- ActorRenderAuthority
- WorldSpaceVehicleLayer
- live feed runtimes
- hero runtime
- Drive
- Mapbox style
- actor IDs

It may read:

```js
SBE.ActorAssetLibraryAuthority
SBE.ActorPresentationPaletteRegistry
SBE.ActorVisualIdentityAuthority
```

---

# Files To Modify

Modify:

```text
studio/studioShell.js
studio/styles.css
```

Optionally modify:

```text
studio/index.html
```

Only if a new DOM hook is necessary.

Do not modify Wall runtime code.

---

# Studio UX Goal

When user opens:

```text
studio/index.html#asset-library
```

The center panel should show:

```text
Asset Library
├─ grouped asset list
├─ selected asset preview card
├─ variant selector
├─ visual preview box
├─ variant metadata table
└─ assignment map
```

The right inspector should show full selected asset details.

---

# Required State Additions

Extend Studio shell state:

```js
_state = {
  active: true,
  mode: "asset-library",
  selectedActorId: null,
  selectedAssetId: null,
  selectedVariantKey: null,
  lastError: null
}
```

---

# Asset Selection Behavior

When an asset is clicked:

1. set `_state.selectedAssetId`
2. choose variant:

```text
asset.defaultVariant if available
else first variant key
else null
```

3. update center preview card
4. update right inspector
5. highlight selected asset row

No page reload.

No hash mutation required for asset selection.

---

# Variant Selection Behavior

Variant selector should display one button per variant key:

```text
dot
icon
lowpoly
hero
```

Clicking a variant:

1. sets `_state.selectedVariantKey`
2. refreshes preview card
3. refreshes inspector variant section

No actor runtime calls.

No WSL calls.

No proof-stage calls.

---

# Preview Card

Create a preview section in the center panel:

```text
┌─────────────────────────────────────┐
│ MTA Bus Standard                    │
│ asset://road/mta_bus_standard       │
│                                     │
│          [symbolic visual]          │
│                                     │
│ Variant: lowpoly                    │
│ Render Variant: bus_lowpoly         │
│ Silhouette: city-bus                │
└─────────────────────────────────────┘
```

The preview can be DOM/CSS only.

No Three.js required.

---

# Symbolic Visual Preview

Use pure HTML/CSS shape blocks for v1.

Map silhouette class to preview type:

```js
city-bus        → long bus rectangle
utility-truck   → cab + service box
station-node    → puck + pin/cap
vessel-generic  → hull wedge
passenger-ferry → long ferry hull + cabin
aircraft-light  → wing/cross token
subway-train    → long rail cars
ambient-car     → small road car
alert-marker    → marker diamond
world-prop      → generic cube
generic-actor   → generic dot
```

No canvas required.

No WebGL required.

No external libraries.

---

# Preview Color

Use palette registry if available:

```js
SBE.ActorPresentationPaletteRegistry.resolvePalette(asset.paletteRef)
```

Apply to CSS custom properties:

```css
--asset-body
--asset-roof
--asset-side
--asset-glass
--asset-accent
--asset-light
```

If palette is missing:

```text
fallback to neutral gray/cyan Studio colors
```

No crash.

---

# Required DOM Structure

For preview card:

```html
<div class="asset-preview-card">
  <div class="asset-preview-head">
    <div class="asset-preview-title"></div>
    <div class="asset-preview-id"></div>
  </div>

  <div class="asset-variant-tabs"></div>

  <div class="asset-preview-stage">
    <div class="asset-preview-shape asset-preview-shape--city-bus"></div>
  </div>

  <div class="asset-preview-meta"></div>
</div>
```

Class names may vary, but the structure should remain clear.

---

# Preview Shape Requirements

## Bus

Readable long rectangle with:

- body
- roof strip
- window strip
- front accent

## Utility Truck

Readable cab + rear equipment block with:

- yellow/orange body
- box rear
- amber light cue

## Station Node

Readable vertical marker with:

- base puck
- pin
- cap

## Vessel

Readable hull with:

- tapered bow
- cabin
- accent/nav cue

## Aircraft

Readable cross shape with:

- fuselage
- wings
- tail

## Train

Readable long segmented rail object.

## Generic

Readable dot or cube.

---

# Variant Metadata Panel

Show selected variant fields:

```text
variantKey
kind
renderVariant
uri
minZoom
maxZoom
```

Also show asset-level fields:

```text
silhouetteClass
paletteRef
glyphRef
materialClass
lightClass
scaleClass
priorityClass
editable
source
```

---

# File Slot Display

Show future file slots:

```text
SVG       empty / present
GLB       empty / present
WebP      empty / present
Thumbnail empty / present
```

This is read-only.

Use asset.files if present.

---

# Assignment Map

Keep existing assignment map, but make it collapsible or visually secondary.

The main focus should become selected asset preview.

Do not let assignment table dominate the stage.

---

# Inspector Behavior

Right inspector should display:

1. asset fields
2. selected variant fields
3. file slots
4. tags
5. palette swatches

If no asset selected:

```text
Select an asset to inspect.
```

---

# Debug API

Extend:

```js
_wos.debug.studio
```

Add:

```js
selectedAsset()
selectAsset(assetId)
selectVariant(variantKey)
assetPreviewState()
```

## selectedAsset()

Return:

```js
{
  selectedAssetId,
  selectedVariantKey,
  asset,
  variant
}
```

## selectAsset(assetId)

Selects asset in Studio UI.

Returns:

```js
true | false
```

## selectVariant(variantKey)

Selects variant for selected asset.

Returns:

```js
true | false
```

## assetPreviewState()

Return:

```js
{
  active,
  mode,
  selectedAssetId,
  selectedVariantKey,
  assetCount,
  lastError
}
```

---

# Startup Behavior

On Studio load:

- mode defaults to `asset-library`
- if assets exist, auto-select the first asset only
- do not auto-spawn proof actors
- do not start feeds
- do not start Drive
- do not create map
- do not mutate Wall

---

# Styling Requirements

Add CSS for:

```css
.asset-preview-card
.asset-preview-head
.asset-variant-tabs
.asset-variant-tab
.asset-preview-stage
.asset-preview-shape
.asset-preview-meta
.asset-file-slots
.asset-mini-table
```

Preview should fill visible center space better than the current table-only layout.

The preview should still work on narrower screens without breaking the three-panel grid.

---

# Accessibility / Readability

Variant buttons must have readable text.

Selected variant should be visibly active.

Preview card should not rely on color only; shape/silhouette must differ.

Text should remain readable on dark background.

---

# Acceptance Tests

## Test 1: Studio Loads Asset Preview

Open:

```text
studio/index.html#asset-library
```

Expected:

```text
Asset Library tab active
first asset selected automatically
center panel shows preview card
right inspector shows selected asset
no console errors
```

## Test 2: Select MTA Bus

Click:

```text
MTA Bus Standard
```

Expected:

```text
preview shape changes to bus silhouette
variant selector shows dot / icon / lowpoly / hero
default selected variant is lowpoly
palette swatches use mta.bus.blue-white
```

## Test 3: Select Utility Truck

Click:

```text
DOT Utility Truck
```

Expected:

```text
preview shape changes to utility truck
yellow/orange palette visible
variant metadata updates
inspector updates
```

## Test 4: Select Citi Bike Station

Click:

```text
Citi Bike Station Node
```

Expected:

```text
preview shape changes to station-node
station preview is not car-shaped
variant renderVariant shows station_node for lowpoly/hero
```

## Test 5: Variant Switching

Click:

```text
dot
icon
lowpoly
hero
```

Expected:

```text
selected variant button changes
variant metadata updates
preview remains stable
no runtime actors spawned
```

## Test 6: Debug API

Run:

```js
_wos.debug.studio.assetPreviewState()
_wos.debug.studio.selectedAsset()
_wos.debug.studio.selectAsset("asset://road/mta_bus_standard")
_wos.debug.studio.selectVariant("icon")
```

Expected:

```text
state updates
selectedAssetId changes
selectedVariantKey changes
UI refreshes
```

---

# Failure Conditions

This build fails if:

- Studio auto-starts live feeds
- Studio starts Drive
- Studio requires Mapbox
- Studio requires Three.js
- Studio mutates actor truth
- Studio mutates asset records while previewing
- Wall breaks
- Actor Library mode breaks
- Palette Lab mode breaks
- Proof Stage mode breaks
- selected asset crashes when missing variants
- missing palette crashes preview
- variant switching calls WSL
- assignment map dominates preview again

---

# Implementation Notes

## Keep It DOM-Based

This is not the final asset renderer.

This is a Studio preview language.

Use symbolic DOM previews now so the library becomes usable immediately.

Future specs can replace the preview card with:

```text
SVG preview
WebP preview
GLB preview
Three.js mini-stage
```

## Do Not Overbuild

Correct v1:

```text
select asset
select variant
show symbolic preview
show metadata
show palette
show file slots
```

Incorrect v1:

```text
drag/drop import
file persistence
mesh editing
live map preview
actor assignment editing
```

---

# Future Follow-Ups

0603P enables:

```text
0603Q_WOS_EditablePaletteLibraryStudio_v1.0.0_BUILD
0603R_WOS_ActorAssetAssignmentStudio_v1.0.0_BUILD
0603S_WOS_MarineVesselAssetTaxonomy_v1.0.0_BUILD
0603T_WOS_MTABusAssetPack_v1.0.0_BUILD
0603U_WOS_AssetImportManifest_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Modify `studio/studioShell.js` to add selected asset/variant state, asset preview rendering, variant buttons, inspector updates, and `_wos.debug.studio` preview commands; modify `studio/styles.css` to add preview-card and symbolic-shape styling.
- **What**: Run `node --check studio/studioShell.js`, open `studio/index.html#asset-library`, click MTA Bus Standard, DOT Utility Truck, Citi Bike Station Node, and switch dot/icon/lowpoly/hero variants.
- **Expect**: Studio becomes a visual asset browser instead of a table-only registry view; selected assets show symbolic previews, variant metadata, palette swatches, and future file slots without starting feeds, Drive, Mapbox, Three.js, or mutating truth.
