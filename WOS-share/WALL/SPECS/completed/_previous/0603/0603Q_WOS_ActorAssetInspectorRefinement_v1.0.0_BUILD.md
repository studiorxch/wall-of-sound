---
layout: spec
title: "Actor Asset Inspector Refinement"
date: 2026-06-03
doc_id: "0603_WOS_ActorAssetInspectorRefinement_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "studio"
component: "actor_asset_inspector_refinement"

type: "system-spec"
status: "approved"

priority: "high"
risk: "low"

classification: "studio-ui-refinement"

summary: "Refines Studio selection and inspector behavior so Actor Library, Asset Library, and Variant Preview no longer show mixed context. Studio explicitly tracks selectedIdentity, selectedAsset, and selectedVariant."

depends_on:
  - "0603N_WOS_WallStudioWorkspaceSplit_v1.0.0"
  - "0603O_WOS_ActorAssetLibraryAuthority_v1.0.0"
  - "0603P_WOS_ActorAssetVariantPreviewStudio_v1.0.0"

enables:
  - "clear Studio selection model"
  - "asset-focused inspector"
  - "identity-to-asset context"
  - "variant inspection without mixed state"
  - "future asset assignment editing"

tags:
  - "wos"
  - "studio"
  - "asset-library"
  - "inspector"
  - "selection-state"
  - "ui-refinement"
---

# 0603Q_WOS_ActorAssetInspectorRefinement_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Fix Studio's mixed-selection context.

0603P successfully added a visual asset preview card. However, the left Library panel can still show/select an identity while the center Asset Preview shows a different asset.

This creates ambiguous UI:

```text
Left panel: citibike.station
Center panel: MTA Bus Standard
Right inspector: unclear source of truth
```

0603Q establishes a clear Studio selection model:

```text
selectedIdentity
selectedAsset
selectedVariant
```

and makes the inspector explicitly show which context is active.

---

# Core Problem

Studio currently has overlapping concepts:

```js
selectedActorId
selectedAssetId
selectedVariantKey
```

But `selectedActorId` is actually an identity key, not a runtime actor ID.

This creates naming confusion and UI ambiguity.

Studio needs to distinguish:

```text
identity profile selection
asset selection
variant selection
```

---

# Target Selection Model

Replace or deprecate the ambiguous field:

```js
selectedActorId
```

with:

```js
selectedIdentityKey
selectedAssetId
selectedVariantKey
selectedInspectorContext
```

Recommended state:

```js
_state = {
  active: true,
  mode: "asset-library",

  selectedIdentityKey: null,
  selectedAssetId: null,
  selectedVariantKey: null,

  selectedInspectorContext: "asset",

  lastError: null
}
```

Valid inspector contexts:

```text
asset
identity
palette
proof
empty
```

---

# Required Files

Modify:

```text
studio/studioShell.js
studio/styles.css
```

Do not modify:

```text
wall/index.html
wall/systems/actors/*
wall/systems/render/*
wall/systems/presentation/worldSpaceVehicleDebug.js
```

unless a bug blocks Studio from reading existing registries.

This is a Studio-only refinement.

---

# Required UI Behavior

## Asset Library Mode

When mode is:

```text
asset-library
```

The Studio should be asset-first.

Left Library panel should either:

1. switch to asset categories, or
2. keep identity categories but visually label them as identity navigation.

Preferred v1:

```text
Left panel = asset categories when in Asset Library mode
Center panel = asset preview
Right panel = selected asset inspector
```

This removes mixed context.

---

# Left Panel Behavior

`_renderLibrary()` should become mode-aware.

If:

```js
_state.mode === "asset-library"
```

render asset groups from:

```js
SBE.ActorAssetLibraryAuthority.listAssets()
```

Grouped by:

```text
road
marine
aircraft
transit
civic
world
synthetic
debug
```

Each row shows:

```text
asset.label
asset.silhouetteClass
```

Clicking a row calls:

```js
selectAsset(asset.id)
```

and sets:

```js
selectedInspectorContext = "asset"
```

If:

```js
_state.mode === "actor-library"
```

render identity profiles as before.

Clicking an identity calls:

```js
selectIdentity(profile.key)
```

and sets:

```js
selectedInspectorContext = "identity"
```

---

# Inspector Behavior

The inspector must display the active context clearly.

Top of inspector should show:

```text
Inspecting: Asset
```

or:

```text
Inspecting: Identity
```

or:

```text
Inspecting: Palette
```

---

# Asset Inspector

When context is:

```text
asset
```

Display:

```text
asset id
asset key
category
label
silhouetteClass
paletteRef
glyphRef
materialClass
lightClass
scaleClass
priorityClass
defaultVariant
source
editable
selected variant fields
file slots
tags
palette swatches
```

Do not show unrelated identity profile fields unless explicitly linked.

---

# Identity Inspector

When context is:

```text
identity
```

Display:

```text
identity key
actorType
sourceId
silhouetteClass
paletteRef
glyphRef
accentRef
materialClass
lightClass
decalClass
scaleClass
priorityClass
readableName
tags
```

Also show resolved assigned asset, if available:

```js
SBE.ActorAssetLibraryAuthority.resolveAsset(
  { actorType: profile.actorType, sourceId: profile.sourceId, metadata: {} },
  { visualIdentityKey: profile.key, actorType: profile.actorType, silhouetteClass: profile.silhouetteClass }
)
```

Display:

```text
Assigned Asset
asset://...
```

This is read-only.

---

# Asset Preview Behavior

Selecting an asset updates:

```text
selectedAssetId
selectedVariantKey
selectedInspectorContext = "asset"
```

It must also clear active identity row highlight unless that identity directly maps to the selected asset.

Acceptable v1:

```text
asset selection and identity selection use separate highlighted row classes
```

No mixed selected state.

---

# Actor Library Behavior

When in Actor Library mode:

- center panel shows identity table
- right inspector shows selected identity
- asset preview card should not show unless explicitly linked

Selecting an identity may show:

```text
Assigned asset summary
```

but should not switch modes automatically.

---

# Palette Lab Behavior

When in Palette Lab mode:

- left panel may show palettes or remain library navigation
- selecting palette should set:

```js
selectedInspectorContext = "palette"
```

No required full palette inspector in this spec, but avoid stale asset inspector display.

---

# Proof Stage Behavior

When in Proof Stage mode:

- inspector should show proof state summary or empty helper text
- do not show stale asset inspector
- do not auto-spawn proof actors

---

# Debug API Updates

Update:

```js
_wos.debug.studio.state()
```

Return:

```js
{
  active,
  mode,
  selectedIdentityKey,
  selectedAssetId,
  selectedVariantKey,
  selectedInspectorContext,
  loadedModules,
  lastError
}
```

Add or update:

```js
selectIdentity(identityKey)
selectAsset(assetId)
selectVariant(variantKey)
selectedIdentity()
selectedAsset()
inspectorContext()
```

Keep backward compatibility:

```js
selectActor(key)
```

should call:

```js
selectIdentity(key)
```

and return the identity key.

---

# Required Function Renames / Aliases

Recommended internal functions:

```js
_selectIdentity(key)
_renderIdentityInspector(profile)
_renderAssetInspector()
_renderModeAwareLibrary()
```

Keep old function aliases only where needed to avoid breakage.

---

# CSS Refinements

Add visual clarity:

```css
.studio-context-pill
.studio-asset-row
.studio-identity-row
.studio-inspector-context
```

Selected asset rows and selected identity rows should look distinct enough to understand mode context.

Example:

```css
.studio-asset.selected {
  border-color: rgba(120, 230, 255, 0.6);
}

.studio-identity.selected {
  border-color: rgba(255, 214, 120, 0.55);
}
```

Do not over-design.

---

# Acceptance Tests

## Test 1: Asset Mode Starts Clean

Open:

```text
studio/index.html#asset-library
```

Expected:

```text
left panel lists assets, not identities
center panel shows selected asset preview
right inspector says Inspecting: Asset
selectedAssetId is set
selectedIdentityKey is null or unchanged but not visually active
```

Run:

```js
_wos.debug.studio.state()
```

Expected:

```text
mode: asset-library
selectedInspectorContext: asset
selectedAssetId: asset://...
```

---

## Test 2: Actor Library Shows Identity Context

Click:

```text
Actor Library
```

Expected:

```text
left panel lists identities
center panel shows identity table
right inspector says Inspecting: Identity after identity click
```

Run:

```js
_wos.debug.studio.selectIdentity("mta.bus")
_wos.debug.studio.state()
```

Expected:

```text
selectedIdentityKey: mta.bus
selectedInspectorContext: identity
```

---

## Test 3: Asset Selection Does Not Show Identity Inspector

In Asset Library:

Click:

```text
DOT Utility Truck
```

Expected:

```text
center preview = DOT Utility Truck
right inspector = asset fields
not citibike.station identity fields
```

---

## Test 4: Identity Shows Assigned Asset

In Actor Library:

Click:

```text
mta.bus
```

Expected:

```text
identity fields visible
Assigned Asset: asset://road/mta_bus_standard
```

---

## Test 5: Variant Switching Keeps Asset Context

In Asset Library:

Click:

```text
MTA Bus Standard → icon
```

Expected:

```text
selectedVariantKey: icon
selectedInspectorContext: asset
right inspector shows variant: icon
```

---

## Test 6: Proof Stage Does Not Show Stale Inspector

Click:

```text
Proof Stage
```

Expected:

```text
right inspector no longer shows stale asset/identity fields
proof helper or proof summary visible
```

---

# Failure Conditions

This build fails if:

- Asset Library left panel still lists identity profiles as primary rows
- right inspector shows stale identity when selecting an asset
- right inspector shows stale asset when switching to Proof Stage
- `selectedActorId` remains the primary selection concept
- `selectActor()` breaks existing debug use
- Asset Preview breaks
- Palette Lab breaks
- Proof Stage buttons break
- Studio starts live feeds
- Studio starts Drive
- Wall runtime changes
- actor asset records mutate during inspection

---

# Implementation Notes

## Do Not Rebuild Studio

This is a refinement pass.

Do not redesign the entire shell.

Target the selection model and inspector logic only.

## Keep Read-Only

No editing yet.

No persistence.

No JSON writing.

No drag/drop.

---

# Future Follow-Ups

0603Q enables:

```text
0603R_WOS_ActorAssetAssignmentStudio_v1.0.0_BUILD
0603S_WOS_MarineVesselAssetTaxonomy_v1.0.0_BUILD
0603T_WOS_MTABusAssetPack_v1.0.0_BUILD
0603U_WOS_EditablePaletteLibraryStudio_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Modify `studio/studioShell.js` to introduce `selectedIdentityKey`, `selectedInspectorContext`, mode-aware library rendering, separate asset/identity inspector rendering, and updated `_wos.debug.studio` APIs; modify `studio/styles.css` for context labels and distinct selected-row styling.
- **What**: Run `node --check studio/studioShell.js`; open `studio/index.html#asset-library`; test Asset Library, Actor Library, Palette Lab, and Proof Stage mode switches; run `_wos.debug.studio.state()`, `_wos.debug.studio.selectIdentity("mta.bus")`, `_wos.debug.studio.selectAsset("asset://road/dot_utility_truck")`, and `_wos.debug.studio.selectVariant("icon")`.
- **Expect**: Studio clearly separates selected identity, selected asset, and selected variant; Asset Library shows asset rows and asset inspector; Actor Library shows identity rows and identity inspector with assigned asset; Proof Stage no longer displays stale asset/identity context; no live runtime behavior changes.
