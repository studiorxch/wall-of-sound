---
layout: spec
title: "Marine Vessel Asset Pack"
date: 2026-06-03
doc_id: "0603_WOS_MarineVesselAssetPack_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "actors"
component: "marine_vessel_asset_pack"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "asset-pack"

summary: "Adds the first real editable marine vessel asset pack to the Actor Asset Library, expanding generic AIS vessel presentation into distinct reusable vessel assets without changing AIS truth, actor identity, or renderer behavior."

depends_on:
  - "0603O_WOS_ActorAssetLibraryAuthority_v1.0.0"
  - "0603P_WOS_ActorAssetVariantPreviewStudio_v1.0.0"
  - "0603S_WOS_AssetAssignmentPersistence_v1.0.0"

enables:
  - "marine vessel visual differentiation"
  - "editable harbor asset library"
  - "future AIS vessel taxonomy"
  - "vessel-specific asset assignments"
  - "Studio vessel preview"

tags:
  - "wos"
  - "marine"
  - "vessels"
  - "asset-pack"
  - "ais"
  - "studio"
  - "actor-assets"
---

# 0603T_WOS_MarineVesselAssetPack_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Add the first real marine vessel asset pack to WOS.

The current system has the infrastructure:

```text
Identity
→ Asset Assignment
→ Asset Library
→ Variant Selection
→ Studio Preview
→ Import / Export Persistence
```

But the marine content is still too thin:

```text
Generic Vessel
Passenger Ferry
Small Cargo Vessel
Tug Boat
```

0603T expands the library with a usable harbor vessel set.

This is the first content pass that starts solving the original visual problem:

```text
all boats look the same
```

---

# Core Goal

Add reusable marine vessel assets that can be assigned, previewed, exported, imported, and later resolved from AIS taxonomy.

This spec does not classify live AIS vessels yet.

It creates the asset pack needed before classification.

---

# Required Module Changes

Modify:

```text
wall/systems/actors/actorAssetLibraryAuthority.js
```

Optional:

```text
studio/studioShell.js
studio/styles.css
```

Only if Studio needs new symbolic preview support for added silhouettes.

Do not modify:

```text
AISRuntime
TruthActorRuntime
ActorRenderAuthority
WorldSpaceVehicleLayer
Hero runtime
Mapbox style
feed runtimes
```

unless purely metadata stamping is missing.

---

# Asset Pack Strategy

Assets should remain:

```text
procedural asset records
```

not imported files yet.

Use:

```js
kind: "procedural"
```

for `dot`, `icon`, and `lowpoly`.

Use:

```js
kind: "future-asset"
```

for `hero`.

Keep:

```js
files: { svg:null, glb:null, webp:null, thumbnail:null }
```

for future import.

---

# Required Marine Assets

Add these assets to ActorAssetLibraryAuthority.

## Working Harbor

```text
asset://marine/tug_boat
asset://marine/pilot_boat
asset://marine/service_boat
asset://marine/police_boat
asset://marine/fire_boat
```

## Commercial

```text
asset://marine/cargo_small
asset://marine/cargo_large
asset://marine/container_ship
asset://marine/tanker
asset://marine/barge
```

## Passenger / Public

```text
asset://marine/passenger_ferry
asset://marine/nyc_ferry_small
asset://marine/cruise_ship
```

## Private / Small Craft

```text
asset://marine/yacht_small
asset://marine/yacht_large
asset://marine/sailboat
asset://marine/fishing_boat
```

## Utility / Markers

```text
asset://marine/vessel_generic
asset://marine/unknown_vessel
```

Some assets already exist.

Do not duplicate IDs.

Upgrade existing records where needed.

---

# Minimum Asset Count

After 0603T, marine asset count should be at least:

```text
18
```

Total asset count should increase accordingly.

---

# Marine Silhouette Classes

Introduce or standardize these silhouette classes:

```text
vessel-generic
tug-boat
pilot-boat
service-boat
police-boat
fire-boat
cargo-ship
container-ship
tanker
barge
passenger-ferry
cruise-ship
yacht
sailboat
fishing-boat
unknown-vessel
```

These are asset metadata classes.

WSL does not need to implement every silhouette yet.

If WSL does not support a silhouette, it should still fall back safely through existing generic vessel/ferry builders.

---

# Asset Record Requirements

Each marine asset must include:

```js
{
  id,
  key,
  category: "marine",
  label,
  actorTypes: ["marine.vessel"] or ["marine.ferry"],
  identityKeys: [],
  silhouetteClass,
  defaultVariant: "lowpoly",
  variants,
  paletteRef,
  glyphRef,
  materialClass,
  lightClass,
  scaleClass,
  priorityClass,
  editable: true,
  source: "system",
  tags,
  files,
  authoring,
  metadata
}
```

---

# Variant Naming

Use predictable `renderVariant` values.

Examples:

```text
tug_dot
tug_icon
tug_lowpoly

cargo_large_dot
cargo_large_icon
cargo_large_lowpoly

sailboat_dot
sailboat_icon
sailboat_lowpoly
```

No spaces.

No mixed casing.

---

# Palette References

Use palette refs even if the palette registry does not yet define all of them.

Recommended:

```text
marine.truth-blue
marine.workboat.orange
marine.service.yellow
marine.police.blue-white
marine.fire.red-white
marine.cargo.rust
marine.container.dark
marine.tanker.black-red
marine.barge.gray
marine.ferry.blue-white
marine.cruise.white
marine.yacht.white
marine.sailboat.white
marine.fishing.green-white
marine.unknown.gray
```

Missing palettes must not crash.

Fallback palette behavior from existing systems remains acceptable.

---

# Glyph References

Recommended glyph refs:

```text
vessel
tug
pilot
service
police
fire
cargo
container
tanker
barge
ferry
cruise
yacht
sailboat
fishing
unknown
```

Missing glyphs must not crash.

---

# Scale Classes

Recommended:

```text
marine-small
marine-medium
marine-large
marine-xl
marine-long
marine-marker
```

Do not rely on these being implemented visually yet.

They are metadata for future rendering.

---

# Priority Classes

Recommended:

```text
harbor-truth
public-transit
civic-service
emergency
commercial
background
```

---

# Metadata Requirements

Each asset should include:

```js
metadata: {
  vesselRole: "...",
  expectedAISShipTypes: [],
  visualNotes: "...",
  taxonomyReady: true
}
```

Example:

```js
metadata: {
  vesselRole: "tug",
  expectedAISShipTypes: [52],
  visualNotes: "Compact high-cabin working vessel for harbor support.",
  taxonomyReady: true
}
```

Do not depend on these codes for live classification yet.

They are hints for a later taxonomy resolver.

---

# Existing Assignment Behavior

Do not change default assignment:

```text
ais.vessel → asset://marine/vessel_generic
nyc.ferry → asset://marine/passenger_ferry
generic.ferry → asset://marine/passenger_ferry
```

The new assets are available for manual assignment in Studio.

Classification comes later.

---

# Studio Requirements

The new marine assets must appear in:

```text
studio/index.html#asset-library
```

under:

```text
marine
```

Selecting each should show:

- symbolic preview
- variant tabs
- asset fields
- tags
- file slots
- palette swatches if palette exists

If symbolic preview does not understand a new silhouette, it may use generic vessel preview.

Preferred v1 improvement:

Map these new silhouettes in Studio preview:

```js
tug-boat          → vessel-generic preview with compact/tall-cabin class
pilot-boat        → vessel-generic preview
service-boat      → vessel-generic preview
police-boat       → vessel-generic preview
fire-boat         → vessel-generic preview
cargo-ship        → cargo preview
container-ship    → cargo/container preview
tanker            → long hull preview
barge             → flat rectangle preview
cruise-ship       → long passenger preview
yacht             → sleek hull preview
sailboat          → sail preview
fishing-boat      → small cabin preview
unknown-vessel    → generic vessel preview
```

This can be CSS-only.

No WebGL.

No renderer changes required.

---

# Debug API

Extend if not already covered by `assetLibraryByCategory`.

Add or verify:

```js
_wos.debug.worldActors.assetLibraryByCategory("marine")
```

or Studio equivalent:

```js
_wos.debug.studio.marineAssets()
```

Should return:

```js
{
  count,
  assets: [...]
}
```

Studio debug API preferred:

```js
_wos.debug.studio.marineAssets()
```

---

# Acceptance Tests

## Test 1: Marine Asset Count

Run:

```js
SBE.ActorAssetLibraryAuthority.listByCategory("marine").length
```

Expected:

```text
>= 18
```

---

## Test 2: No Duplicate IDs

Run:

```js
var assets = SBE.ActorAssetLibraryAuthority.listAssets();
var ids = assets.map(a => a.id);
ids.length === new Set(ids).size
```

Expected:

```text
true
```

---

## Test 3: Existing Defaults Preserved

Run:

```js
SBE.ActorAssetLibraryAuthority.getAssignment("ais.vessel").assetId
SBE.ActorAssetLibraryAuthority.getAssignment("nyc.ferry").assetId
```

Expected:

```text
asset://marine/vessel_generic
asset://marine/passenger_ferry
```

---

## Test 4: Manual Assignment Works

Run:

```js
_wos.debug.studio.assignIdentityAsset("ais.vessel", "asset://marine/tug_boat")
_wos.debug.studio.assignmentState("ais.vessel")
```

Expected:

```text
assetId: asset://marine/tug_boat
```

---

## Test 5: Export Includes Assignment

After assigning tug:

```js
_wos.debug.studio.exportAssetAssignments()
```

Expected:

```text
assignments["ais.vessel"] === "asset://marine/tug_boat"
```

---

## Test 6: Studio Displays Assets

Open:

```text
studio/index.html#asset-library
```

Expected:

```text
marine category includes at least 18 assets
selecting each marine asset does not crash
variant tabs visible
preview visible
```

---

## Test 7: No Runtime Mutation

Load Wall.

Expected:

```text
AIS still works as before
actor IDs unchanged
hero unaffected
Mapbox style unchanged
no feed changes
no automatic vessel classification
```

---

# Failure Conditions

This build fails if:

- marine asset count is below 18
- duplicate asset IDs exist
- default AIS/ferry assignment changes unexpectedly
- adding assets breaks Studio load
- adding assets breaks export/import
- missing palette crashes preview/render
- missing glyph crashes preview/render
- WSL is modified to classify AIS vessels
- AISRuntime is modified
- feed truth is mutated
- Wall Drive breaks
- actor IDs change
- assignments auto-persist without import/export

---

# Implementation Notes

## Do Not Classify Yet

This spec does not decide which live AIS vessel becomes a tug, ferry, cargo ship, etc.

That belongs to:

```text
0603U_WOS_MarineVesselTaxonomyResolver_v1.0.0_BUILD
```

## Do Not Import Files Yet

This spec does not add SVG, GLB, WebP, or thumbnails.

That belongs to:

```text
0603V_WOS_ActorAssetImportManifest_v1.0.0_BUILD
```

## Keep It Editable

Every asset should have:

```js
editable: true
authoring.editable: true
```

unless there is a clear reason to lock it.

---

# Future Follow-Ups

After this:

```text
0603U_WOS_MarineVesselTaxonomyResolver_v1.0.0_BUILD
0603V_WOS_ActorAssetImportManifest_v1.0.0_BUILD
0603W_WOS_MarineAssetPreviewShapes_v1.0.0_BUILD
0603X_WOS_MarineAssetPalettePack_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Extend `wall/systems/actors/actorAssetLibraryAuthority.js` with the new marine asset records and safe no-duplicate indexing; optionally extend `studio/studioShell.js` and `studio/styles.css` with CSS-only marine preview mappings; optionally add `_wos.debug.studio.marineAssets()`.
- **What**: Run `node --check wall/systems/actors/actorAssetLibraryAuthority.js` and `node --check studio/studioShell.js`; open `studio/index.html#asset-library`; verify marine asset count is at least 18; assign `ais.vessel` to `asset://marine/tug_boat`; export assignments.
- **Expect**: WOS gains a real editable marine vessel asset pack with at least 18 vessel assets, existing AIS/ferry defaults remain unchanged, Studio previews and assignment/export workflows continue working, and no AIS, feed, hero, Wall, Mapbox, truth, or renderer behavior changes.
