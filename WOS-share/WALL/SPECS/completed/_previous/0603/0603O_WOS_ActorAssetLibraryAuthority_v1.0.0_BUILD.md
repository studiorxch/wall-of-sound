---
layout: spec
title: "Actor Asset Library Authority"
date: 2026-06-03
doc_id: "0603_WOS_ActorAssetLibraryAuthority_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "actors"
component: "actor_asset_library_authority"
type: "system-spec"
status: "approved"
priority: "high"
risk: "medium"
classification: "asset-authority"
summary: "Introduces a reusable actor asset library layer that maps actor visual identities to editable asset definitions, variants, LOD references, palettes, glyphs, and future mesh/SVG/WebP sources without mutating truth runtimes or renderer logic."
depends_on:
  - "0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0"
  - "0603I_WOS_ActorVisualIdentityAuthority_v1.0.0"
  - "0603J_WOS_Actor2_5DPresentationPass_v1.0.0"
  - "0603N_WOS_WallStudioWorkspaceSplit_v1.0.0"
enables:
  - "editable actor assets"
  - "asset assignment from Studio"
  - "library-backed actor replacement"
  - "marine vessel taxonomy assets"
  - "MTA bus asset variants"
tags:
  - "wos"
  - "actor"
  - "asset-library"
  - "studio"
  - "editable-library"
---

# 0603O_WOS_ActorAssetLibraryAuthority_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Create the Actor Asset Library Authority.

Studio now displays actor identities, palettes, and proof-stage data. WOS still lacks the editable layer that defines what an actor should look like as a reusable asset.

0603O introduces:

```text
Actor Identity
→ Asset
→ Variant
→ Renderable presentation
```

The goal is to move WOS away from:

```text
silhouetteClass → hardcoded builder
```

toward:

```text
visualIdentityKey → asset library entry → variant / LOD / palette / glyph → renderer
```

This is the bridge between current actor infrastructure and the future editable visual library.

---

# Target Pipeline

```text
Truth Actor
→ Actor Identity
→ Actor Asset Library
→ Actor Render Authority
→ WSL
```

Example:

```text
vehicle.bus
→ mta.bus
→ asset://road/mta_bus_standard
→ bus_lowpoly / bus_icon / bus_dot
→ WSL render payload
```

---

# Authority Boundary

## Owns

- asset records
- asset categories
- asset assignment by `visualIdentityKey`
- variant records
- LOD asset references
- default palette/glyph bindings
- authoring metadata
- safe fallback assets

## Does Not Own

- truth position
- source feed state
- actor identity generation
- camera
- route behavior
- physics
- collision
- Mapbox style
- WSL transforms
- mesh construction internals

---

# Required Module

Create:

```text
wall/systems/actors/actorAssetLibraryAuthority.js
```

Export:

```js
SBE.ActorAssetLibraryAuthority
```

Load after:

```text
actorVisualIdentityAuthority.js
actorPresentationPaletteRegistry.js
```

and before:

```text
actorRenderAuthority.js
```

if possible. If load order is constrained, `ActorRenderAuthority` must guard safely when the asset authority is unavailable.

---

# Public API

```js
SBE.ActorAssetLibraryAuthority = Object.freeze({
  VERSION,
  resolveAsset,
  getAsset,
  listAssets,
  listByCategory,
  listAssignments,
  registerAsset,
  assignIdentity,
  getState,
  setEnabled,
  setDebug
});
```

---

# Canonical Asset Record

```js
{
  id: "asset://road/mta_bus_standard",
  key: "mta_bus_standard",
  category: "road",
  label: "MTA Bus Standard",
  actorTypes: ["vehicle.bus"],
  identityKeys: ["mta.bus", "generic.bus"],
  silhouetteClass: "city-bus",

  defaultVariant: "lowpoly",
  variants: {
    dot: { kind: "procedural", renderVariant: "bus_dot", minZoom: 8, maxZoom: 12 },
    icon: { kind: "procedural", renderVariant: "bus_icon", minZoom: 12, maxZoom: 14 },
    lowpoly: { kind: "procedural", renderVariant: "bus_lowpoly", minZoom: 14, maxZoom: 20 },
    hero: { kind: "future-asset", uri: null, minZoom: 16, maxZoom: 22 }
  },

  paletteRef: "mta.bus.blue-white",
  glyphRef: "bus",
  materialClass: "transit-plastic",
  lightClass: "head-tail",
  scaleClass: "large-road-vehicle",
  priorityClass: "public-transit",

  editable: true,
  source: "system",
  tags: ["road", "transit", "bus", "mta"],
  files: { svg: null, glb: null, webp: null, thumbnail: null },
  authoring: { editable: true, locked: false, version: "1.0.0", createdAt: null, updatedAt: null },
  metadata: {}
}
```

---

# Asset Categories

Minimum categories:

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

---

# Required Default Assets

## Road

```text
asset://road/mta_bus_standard
asset://road/dot_utility_truck
asset://road/synthetic_ambient_car
```

## Civic

```text
asset://civic/citibike_station_node
asset://civic/incident_marker
```

## Marine

```text
asset://marine/vessel_generic
asset://marine/passenger_ferry
asset://marine/cargo_small
asset://marine/tug_boat
```

## Aircraft

```text
asset://aircraft/aircraft_light
asset://aircraft/regional_jet
```

## Transit

```text
asset://transit/subway_train_basic
```

## World

```text
asset://world/prop_generic
asset://world/building_marker
```

## Debug

```text
asset://debug/proof_actor_marker
```

---

# Default Identity Assignments

```js
{
  "mta.bus": "asset://road/mta_bus_standard",
  "generic.bus": "asset://road/mta_bus_standard",

  "dot.utility": "asset://road/dot_utility_truck",
  "generic.utility": "asset://road/dot_utility_truck",

  "synthetic.vehicle": "asset://road/synthetic_ambient_car",

  "citibike.station": "asset://civic/citibike_station_node",
  "generic.station": "asset://civic/citibike_station_node",

  "ais.vessel": "asset://marine/vessel_generic",
  "generic.vessel": "asset://marine/vessel_generic",

  "nyc.ferry": "asset://marine/passenger_ferry",
  "generic.ferry": "asset://marine/passenger_ferry",

  "aircraft.truth": "asset://aircraft/aircraft_light",
  "generic.aircraft": "asset://aircraft/aircraft_light",

  "mta.subway.train": "asset://transit/subway_train_basic",
  "generic.train": "asset://transit/subway_train_basic",

  "generic.incident": "asset://civic/incident_marker",
  "generic.prop": "asset://world/prop_generic"
}
```

---

# `resolveAsset(actor, renderPayload)` Behavior

Inputs:

```js
actor
renderPayload
```

Use:

```js
renderPayload.visualIdentityKey
renderPayload.actorType
renderPayload.silhouetteClass
renderPayload.lodTier
```

Resolution order:

1. assignment by `visualIdentityKey`
2. assignment by actorType fallback
3. assignment by silhouetteClass fallback
4. generic asset fallback

Return:

```js
{
  assetId,
  assetKey,
  assetCategory,
  assetLabel,
  assetSource,
  assetEditable,

  variantKey,
  renderVariant,
  silhouetteClass,

  paletteRef,
  glyphRef,
  materialClass,
  lightClass,
  scaleClass,
  priorityClass,

  tags,
  metadata
}
```

Never mutate actor truth.

---

# Variant Resolution

Choose variant from existing LOD tier when available:

```text
hidden → null
dot    → dot
node   → icon or lowpoly depending asset support
icon   → icon
model  → lowpoly
hero   → hero if available, else lowpoly
```

If requested variant is missing, use `defaultVariant`.

If default variant is missing, use first available variant.

No throw.

---

# Actor Render Authority Integration

Modify:

```text
wall/systems/actors/actorRenderAuthority.js
```

After identity is resolved and before final payload return:

```js
var asset = SBE.ActorAssetLibraryAuthority.resolveAsset(actor, payload);
```

Merge into payload:

```js
payload.assetId = asset.assetId;
payload.assetKey = asset.assetKey;
payload.assetCategory = asset.assetCategory;
payload.assetLabel = asset.assetLabel;
payload.assetEditable = asset.assetEditable;

payload.renderVariant = asset.renderVariant || payload.renderVariant;
payload.silhouetteClass = asset.silhouetteClass || payload.silhouetteClass;

payload.paletteRef = asset.paletteRef || payload.paletteRef;
payload.glyphRef = asset.glyphRef || payload.glyphRef;
payload.materialClass = asset.materialClass || payload.materialClass;
payload.lightClass = asset.lightClass || payload.lightClass;
payload.scaleClass = asset.scaleClass || payload.scaleClass;
payload.priorityClass = asset.priorityClass || payload.priorityClass;

payload.assetTags = asset.tags;
payload.assetMetadata = asset.metadata;
```

Do not remove existing fields.

Do not break current render behavior.

---

# WSL Integration

WSL may stamp:

```js
mesh._assetId
mesh._assetKey
mesh._assetCategory
mesh._assetLabel
mesh._renderVariant
```

WSL must not resolve asset assignments.

WSL only receives resolved payload instructions.

---

# Studio Integration

Modify:

```text
studio/studioShell.js
```

Add a Studio mode:

```text
asset-library
```

Top navigation should become:

```text
Asset Library
Actor Library
Glyph Lab
Palette Lab
Proof Stage
```

Asset Library v1 must:

- list assets by category
- click asset to inspect fields
- show assignment map
- show variant table
- show palette swatches when palette registry exists

No editing required in v1.

Read-only first.

---

# Debug API

Add under:

```js
_wos.debug.worldActors
```

Commands:

```js
assetLibraryState()
assetLibraryList()
assetLibraryAssignments()
assetLibraryResolve(actorId)
assetLibraryByCategory(category)
```

## assetLibraryState()

Return:

```js
{
  enabled,
  assetCount,
  assignmentCount,
  fallbackCount,
  resolvedCount,
  lastResolvedAt,
  lastError
}
```

## assetLibraryList()

Console table:

```text
assetId
label
category
silhouetteClass
paletteRef
defaultVariant
editable
```

## assetLibraryAssignments()

Console table:

```text
visualIdentityKey
assetId
```

---

# Required State

```js
{
  version,
  enabled,
  debug,
  assetCount,
  assignmentCount,
  resolvedCount,
  fallbackCount,
  registerCount,
  assignmentUpdateCount,
  lastResolvedAt,
  lastError
}
```

---

# No Editing Yet

This spec creates the authority and Studio read-only view.

It does not yet:

- persist edits
- write JSON files
- import SVG
- import GLB
- import WebP
- replace mesh builders
- build an asset editor

It prepares those later specs.

---

# Acceptance Tests

## Test 1: Asset Registry Loads

Run:

```js
_wos.debug.worldActors.assetLibraryState()
_wos.debug.worldActors.assetLibraryList()
```

Expected:

```text
assetCount >= 13
assignmentCount >= 12
no errors
```

## Test 2: Existing Actors Resolve

Run:

```js
_wos.debug.worldActors.testBus()
_wos.debug.worldActors.testUtility()
_wos.debug.worldActors.assetLibraryResolve("vehicle:mta_bus_gtfs_rt:debug_bus_001")
_wos.debug.worldActors.assetLibraryResolve("vehicle:nyc_dot_events:debug_utility_001")
```

Expected:

```text
mta.bus → asset://road/mta_bus_standard
dot.utility → asset://road/dot_utility_truck
```

## Test 3: Citi Bike Resolves

Run:

```js
_wos.debug.worldActors.citibikeStart()
setTimeout(()=>_wos.debug.worldActors.visualIdentitySample(), 5000)
```

Pick one Citi Bike actor ID, then:

```js
_wos.debug.worldActors.assetLibraryResolve(actorId)
```

Expected:

```text
citibike.station → asset://civic/citibike_station_node
```

## Test 4: Studio Shows Assets

Open:

```text
studio/index.html#asset-library
```

Expected:

```text
Asset Library tab visible
assets grouped by category
variants visible in inspector
assignment map visible or accessible
```

## Test 5: No Visual Regression

Run:

```js
_wos.debug.worldActors.visualProofStage()
```

Expected:

```text
7 proof actors still render
payloads include assetId / assetKey
bus / utility / vessel / ferry / aircraft / station remain visible
```

---

# Failure Conditions

This build fails if:

- actor IDs change
- truth metadata is mutated
- ActorVisualIdentityAuthority is bypassed
- ActorRenderAuthority stops rendering existing actors
- WSL resolves asset assignment itself
- Studio auto-starts live feeds
- Studio breaks Actor Library / Palette Lab
- proof stage stops working
- unknown asset crashes rendering
- missing palette crashes rendering
- Drive breaks
- Mapbox style mutates

---

# Performance Guardrails

- Asset lookup must be O(1) by id/key.
- Assignment lookup must be O(1).
- No per-frame asset library scans.
- Resolve during payload creation.
- Cache only when safe:

```js
actor._assetId
actor._assetKey
```

Cache must invalidate if `visualIdentityKey` changes.

---

# Future Fields

Asset records should support future optional fields:

```js
files: {
  svg: null,
  glb: null,
  webp: null,
  thumbnail: null
}
```

```js
authoring: {
  editable: true,
  locked: false,
  version: "1.0.0",
  createdAt: null,
  updatedAt: null
}
```

```js
lod: {
  dot: {},
  icon: {},
  lowpoly: {},
  hero: {}
}
```

---

# Relationship to Future Specs

0603O enables:

```text
0603P_WOS_EditableGlyphLibraryStudio_v1.0.0_BUILD
0603Q_WOS_EditablePaletteLibraryStudio_v1.0.0_BUILD
0603R_WOS_ActorAssetAssignmentStudio_v1.0.0_BUILD
0603S_WOS_MarineVesselAssetTaxonomy_v1.0.0_BUILD
0603T_WOS_MTABusAssetPack_v1.0.0_BUILD
```

This is the permanent replacement path for hardcoded actor visuals.

---

# Implementation Guide

- **Where**: Create `wall/systems/actors/actorAssetLibraryAuthority.js`; register it before `actorRenderAuthority.js` where possible; modify `wall/systems/actors/actorRenderAuthority.js` to merge resolved asset fields; optionally stamp asset metadata in `wall/systems/render/worldSpaceVehicleLayer.js`; extend `studio/studioShell.js` with an `asset-library` mode; add debug commands in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/actors/actorAssetLibraryAuthority.js`, `node --check wall/systems/actors/actorRenderAuthority.js`, `node --check wall/systems/render/worldSpaceVehicleLayer.js`, `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`, and `node --check studio/studioShell.js`.
- **Expect**: Existing actors render as before, but render payloads now include asset IDs, asset categories, asset labels, variant keys, and library metadata; Studio gains a read-only Asset Library view; no truth, feed, hero, Drive, or Mapbox behavior changes.
