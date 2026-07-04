# 0612B_WOS_BuildingReplacementMinimumVisibleResult_v1.0.0_BUILD

```yaml
layout: spec
title: "Building Replacement Minimum Visible Result"
date: 2026-06-12
doc_id: "0612B_WOS_BuildingReplacementMinimumVisibleResult_v1.0.0_BUILD"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "BuildingReplacementMinimumVisibleResult"

type: "runtime-spec"
status: "active"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Establishes the smallest visible building replacement path: click/select a building target, create a WOS-owned replacement object, render it visibly, and expose deterministic debug proof."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"

depends_on:
  - "BuildingAuthorityRuntime"
  - "BuildingEditProjectionRuntime"
  - "MapboxViewportRuntime"

enables:
  - "BuildingReplacementRuntime"
  - "BuildingStylizationRuntime"
  - "BuildingTextureRuntime"
  - "BuildingOutlineRuntime"

tags:
  - "building"
  - "replacement"
  - "visible-result"
  - "map-lab"
  - "runtime-authority"
```

---

# 🎯 PURPOSE

Create the minimum visible proof that WOS can replace a selected building with a WOS-owned building object.

This spec does not attempt to perfectly suppress imported Mapbox Standard buildings.

This spec exists to produce one visible result:

```text
Click/select building target
→ create WOS replacement object
→ render replacement geometry visibly
→ inspector/debug confirms selected replacement
```

The goal is to exit invisible infrastructure work and prove the replacement pipeline on screen.

---

# ASSUMPTIONS

- Runtime is browser-based JavaScript.
- Mapbox GL JS map instance is available through `SBE.MapboxViewportRuntime.getMap()`.
- `SBE.BuildingAuthorityRuntime` from `0612A` is loaded before this runtime.
- `SBE.BuildingEditProjectionRuntime` may exist, but this patch must not depend on it being fully successful.
- Imported Mapbox Standard buildings remain non-authoritative backdrop geometry.
- Replacement geometry may be approximate if the selected feature footprint cannot be fully resolved.
- Visible proof is more important than perfect footprint fidelity in this build.

---

# 🧠 CORE PRINCIPLES

## Visible Result First

The system must create an obvious visual result before continuing deep authority work.

## Replacement Owns Presentation

WOS replacement objects are presentation geometry backed by WOS-owned runtime state.

## Imported Buildings Are Backdrop

Imported Mapbox buildings may remain visible beneath or behind replacement objects.

## Approximation Is Allowed

If an authoritative footprint is unavailable, the runtime must create a fallback replacement prism at the clicked coordinate.

## Debug Proof Is Required

Every replacement attempt must return a deterministic report describing what was created, rendered, or blocked.

---

# 🏛️ AUTHORITY BOUNDARIES

This spec governs:

- building click target capture
- WOS replacement object creation
- minimum replacement geometry generation
- replacement layer/source creation
- visible replacement rendering
- replacement debug reports

This spec may mutate:

- `wos-building-replacements` GeoJSON source
- `wos-building-replacement-layer` fill-extrusion layer
- in-memory replacement registry
- selected replacement state
- Map Lab Inspector replacement state

This spec may observe:

- `BuildingAuthorityRuntime` boot classification
- rendered features from `wos-host-building-layer`
- clicked Mapbox feature properties
- map center/click coordinates

This spec must not mutate:

- imported Mapbox Standard style internals
- Mapbox import config
- replacement suppression expressions from prior patches
- camera systems
- atmosphere systems
- overlay grammar
- audio systems

---

# 🌊 CONTINUITY ROLE

This system creates the first persistent bridge between:

```text
Map click target
→ WOS-owned building replacement object
→ visible world geometry
```

The replacement object must remain stable across map movement, zoom, pitch, and style redraws while the active runtime session remains open.

Persistence beyond session memory is deferred.

---

# 🧭 INTERPRETATION SEPARATION

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

For this build:

- The 2D truth is the WOS replacement object record.
- The 2.5D presentation is the fill-extrusion replacement layer.
- Imported Mapbox buildings are not edited.
- Imported Mapbox buildings are not treated as WOS truth.

---

# 📦 DATA MODEL

```js
type BuildingReplacementObject = {
  id: string;
  sourceFeatureId: string | number | null;
  createdAt: number;
  selected: boolean;
  geometryKind: 'footprint' | 'fallback-prism';
  heightMeters: number;
  baseMeters: number;
  color: string;
  opacity: number;
  outlineEnabled: boolean;
  source: {
    layerId: string | null;
    sourceId: string | null;
    sourceLayerId: string | null;
  };
  geometry: GeoJSON.Polygon;
  properties: Record<string, unknown>;
};
```

```js
type BuildingReplacementReport = {
  ok: boolean;
  replacementId: string | null;
  targetFound: boolean;
  targetSource: 'host-building-layer' | 'rendered-feature' | 'click-coordinate' | 'none';
  geometryKind: 'footprint' | 'fallback-prism' | null;
  sourceExists: boolean;
  layerExists: boolean;
  renderedFeatureCount: number;
  registryCount: number;
  lastError: string | null;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```js
const REPLACEMENT_SOURCE_ID = 'wos-building-replacements';
const REPLACEMENT_LAYER_ID = 'wos-building-replacement-layer';
const REPLACEMENT_OUTLINE_LAYER_ID = 'wos-building-replacement-outline-layer';

const DEFAULT_REPLACEMENT_HEIGHT_METERS = 42;
const DEFAULT_REPLACEMENT_BASE_METERS = 0;
const DEFAULT_REPLACEMENT_COLOR = '#66e3ff';
const DEFAULT_REPLACEMENT_OPACITY = 0.92;
const DEFAULT_FALLBACK_HALF_SIZE_METERS = 18;
```

Constants are implementation baselines and may be tuned after visible proof succeeds.

---

# 🔧 CORE FUNCTIONS

## `init()`

Initializes replacement runtime and registers debug surfaces.

## `ensureReplacementSource(map)`

Creates or reuses the GeoJSON source:

```js
'wos-building-replacements'
```

The source must always contain a valid FeatureCollection.

## `ensureReplacementLayers(map)`

Creates:

```js
'wos-building-replacement-layer'
'wos-building-replacement-outline-layer'
```

The replacement layer must render above host buildings and imported basemap buildings where possible.

## `createReplacementFromClick(point, lngLat)`

Attempts target selection in this order:

1. Query `wos-host-building-layer` at click point.
2. Query general rendered features at click point and select the first building-like feature.
3. Create fallback prism at click coordinate.

This function must always return a `BuildingReplacementReport`.

## `createReplacementFromFeature(feature, lngLat)`

Creates a replacement from a rendered feature.

If feature geometry is polygonal and usable, preserve footprint.

If not, create fallback prism at `lngLat`.

## `createFallbackPrism(lngLat, halfSizeMeters)`

Creates an approximate square polygon around the clicked coordinate.

This is required to guarantee a visible result even when imported features are not queryable.

## `upsertReplacementObject(replacementObject)`

Adds or replaces a replacement object in the runtime registry.

## `renderReplacementObjects()`

Writes the registry to the GeoJSON source.

## `selectReplacementObject(id)`

Marks a replacement object as selected and updates Inspector state.

## `debugBuildingReplacements()`

Returns current replacement state and render diagnostics.

---

# 🔄 EXECUTION FLOW

```text
Map Lab Author Mode Active
    ↓
User Clicks Building / Map Target
    ↓
Query Host Building Layer
    ↓
If Host Feature Found: Create Replacement From Feature
    ↓
If No Host Feature: Query General Rendered Features
    ↓
If Building-Like Feature Found: Create Replacement From Feature
    ↓
If No Feature: Create Fallback Prism At Click Coordinate
    ↓
Upsert Replacement Object
    ↓
Render Replacement GeoJSON Source
    ↓
Select Replacement Object
    ↓
Inspector Displays Replacement State
    ↓
Debug Report Confirms Visible Result
```

---

# 🛰️ OBSERVABILITY IMPACT

This patch must expose:

```js
_wos.debug.buildings.createReplacementAtCenter()
_wos.debug.buildings.debugBuildingReplacements()
_wos.debug.buildings.clearBuildingReplacements()
SBE.BuildingReplacementMinimumVisibleResult.createReplacementAtCenter()
SBE.BuildingReplacementMinimumVisibleResult.debugBuildingReplacements()
```

Expected debug proof:

```js
{
  ok: true,
  replacementId: 'wos-building-replacement-0001',
  targetFound: true,
  targetSource: 'host-building-layer',
  geometryKind: 'footprint',
  sourceExists: true,
  layerExists: true,
  renderedFeatureCount: 1,
  registryCount: 1,
  lastError: null
}
```

Fallback success is also acceptable:

```js
{
  ok: true,
  replacementId: 'wos-building-replacement-0001',
  targetFound: false,
  targetSource: 'click-coordinate',
  geometryKind: 'fallback-prism',
  sourceExists: true,
  layerExists: true,
  renderedFeatureCount: 1,
  registryCount: 1,
  lastError: null
}
```

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- `SBE.MapboxViewportRuntime`
- `SBE.BuildingAuthorityRuntime`
- `wos-host-building-layer`
- Mapbox rendered feature queries

## Writes To

- `wos-building-replacements` source
- `wos-building-replacement-layer`
- `wos-building-replacement-outline-layer`
- `BuildingReplacementRegistry`
- Map Lab Inspector selected replacement state

## Observed By

- Building stylization runtime
- Building texture runtime
- Building outline runtime
- Building replacement inspector
- Future persistence layer

## Forbidden Mutations

- imported Mapbox Standard source data
- imported Mapbox Standard layer internals
- camera systems
- atmosphere systems
- audio systems
- overlay grammar
- global map style tokens

---

# 🎼 ORCHESTRATION NOTES

This system does not orchestrate global building behavior.

It only provides a minimum replacement path.

It may be called by Map Lab Author Mode, debug surfaces, or future replacement tools.

It must not block on imported building suppression.

---

# 🧪 VALIDATION CHECKLIST

## T1 Runtime Loads

```js
SBE.BuildingReplacementMinimumVisibleResult.VERSION
```

Expected:

```js
'1.0.0'
```

## T2 Debug Surface Exists

```js
_wos.debug.buildings.debugBuildingReplacements
```

Expected:

```js
typeof _wos.debug.buildings.debugBuildingReplacements === 'function'
```

## T3 Replacement Source Exists

After first creation:

```js
map.getSource('wos-building-replacements')
```

Expected:

```js
truthy
```

## T4 Replacement Layer Exists

```js
map.getLayer('wos-building-replacement-layer')
```

Expected:

```js
truthy
```

## T5 Center Creation Works

```js
_wos.debug.buildings.createReplacementAtCenter()
```

Expected:

```js
ok === true
registryCount >= 1
```

## T6 Click Creation Works

In Map Lab Author Mode:

```text
click visible building or map target
```

Expected:

```text
visible WOS replacement geometry appears
```

## T7 Inspector Updates

After replacement creation:

```text
Inspector shows selected replacement id, geometry kind, height, and source target.
```

## T8 Fallback Still Produces Visible Result

When no building feature is found:

```js
targetSource === 'click-coordinate'
geometryKind === 'fallback-prism'
ok === true
```

## T9 Imported Suppression Is Not Required

Expected:

```text
Replacement visible even if imported Mapbox building remains visible.
```

---

# 🚫 NON-GOALS

This spec does not implement:

- perfect imported building hiding
- per-building Mapbox Standard suppression
- permanent storage
- advanced mesh generation
- texture systems
- Moebius/country-patch stylization
- global outline pass
- procedural building packs
- multiplayer editing
- undo/redo history

---

# ⏸️ DEFERRED SYSTEMS

Deferred until visible replacement proof succeeds:

- BuildingReplacementPersistence
- BuildingReplacementUndoHistory
- BuildingStylizationRuntime
- BuildingTextureRuntime
- BuildingOutlineRuntime
- BuildingSuppressionCompatibilityRuntime
- BuildingPackRuntime

---

# 📚 CANONICAL REFERENCES

- `0612A_WOS_HostBuildingLayerBootRepair_v1.0.0_BUILD`
- `WOS_Naming_Doctrine_v1.1.0`
- `0522_WOS_SurfaceChannelDoctrine_v1.1.0`
- `WOS_ConstitutionalSpecTemplate_v2.0.1`

---

# 💬 IMPLEMENTATION NOTES

The patch must prioritize visible proof over ideal correctness.

If `wos-host-building-layer` works, use it.

If it does not work, do not stall.

The runtime must fall back to a visible WOS-owned prism at the clicked coordinate.

This fallback is not a failure. It is the safety path that proves WOS can create and render replacement building objects independently from imported Mapbox authority.

---

# IMPLEMENTATION GUIDE

## Where

- Create: `wall/systems/presentation/buildingReplacementMinimumVisibleResult.js`
- Load after: `wall/systems/presentation/buildingAuthorityRuntime.js`
- Load before or alongside: `wall/systems/presentation/buildingEditProjectionRuntime.js`
- Wire click handler in Map Lab Author Mode where building selection currently occurs.

## What

```bash
# Add runtime file
$EDITOR wall/systems/presentation/buildingReplacementMinimumVisibleResult.js

# Add script tag after buildingAuthorityRuntime.js
$EDITOR wall/studio/index.html

# Run local studio
npm run dev
```

## Expect

```text
Click building or run _wos.debug.buildings.createReplacementAtCenter()
→ visible cyan WOS replacement building appears
→ _wos.debug.buildings.debugBuildingReplacements().registryCount >= 1
→ imported Mapbox building suppression is not required for this test
```
