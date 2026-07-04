# 🚦 SPEC STAGE

Stage: BUILD  
Freeze Decision: ACTIVE  
Action: Replace Mapbox Standard imported 3D building dependency in editable Map Lab workflows with a non-Standard editable basemap authority.

---

layout: spec

title: "Non-Standard Editable Basemap Authority"
date: 2026-06-12
doc_id: "0612E_WOS_NonStandardEditableBasemapAuthority_v1.0.0_BUILD"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "EditableBasemapAuthority"

type: "runtime-spec"
status: "active"

priority: "high"
risk: "medium"

classification: "runtime-authority"

summary: "Defines the editable Map Lab basemap authority that must not load Mapbox Standard imported 3D buildings, allowing WOS-owned replacement buildings to become the only 3D editable building presentation."

doctrine:

- "2D owns truth"
- "2.5D owns presentation"

depends_on:

- "MapboxViewportRuntime"
- "BuildingReplacementRuntime"
- "BuildingEditRegistry"
- "BuildingEditProjectionRuntime"

enables:

- "SelectedBuildingAuthoring"
- "BuildingStylizationRuntime"
- "BuildingOutlineRuntime"
- "BuildingTextureRuntime"
- "MoebiusBuildingTreatment"

tags:

- "mapbox"
- "basemap"
- "editable-mode"
- "building-authority"
- "non-standard-style"

---

# 🎯 PURPOSE

Stop relying on Mapbox Standard imported 3D buildings for editable building workflows.

The confirmed result of the 0611–0612 investigation:

```text
Mapbox Standard imported 3D buildings cannot be reliably removed:
- not per feature
- not globally through the tested runtime config path
```

Therefore, editable Map Lab cannot use a basemap that loads Standard 3D buildings.

This spec establishes a new rule:

```text
Editable Map Lab uses a non-Standard basemap with no imported Standard 3D building system.
```

WOS replacement buildings then become the only 3D building objects in editable mode.

---

# 🧠 CORE PRINCIPLES

## No Imported 3D Building Authority

Editable building workflows must not load Mapbox Standard imported 3D buildings.

## WOS Buildings Only

All visible 3D buildings in editable mode must come from WOS-owned sources and layers.

## Style Authority Before Runtime Repair

If the basemap imports an uncontrollable building renderer, runtime suppression is not an acceptable solution.

## Preserve Geographic Context

The editable basemap must still show:

- land
- water
- roads
- labels
- tunnels
- parks
- coastline
- transit context

It must not show imported 3D building geometry.

## Do Not Reopen Failed Suppression Work

Do not attempt further per-feature suppression against Mapbox Standard model/import layers.

---

# 🏛️ AUTHORITY BOUNDARIES

This spec governs:

- editable Map Lab basemap selection
- non-Standard editable style loading
- prevention of Standard 3D building imports in editable workflows
- verification that WOS replacement buildings are the only 3D building layer

This spec may mutate:

- Mapbox style URL / style object used by editable Map Lab
- editable-mode map style selection
- style-load routing for Map Lab

This spec may observe:

- `map.getStyle().imports`
- `map.getStyle().layers`
- WOS replacement source/layer state
- BuildingReplacementRuntime status

This spec must not mutate:

- replacement manifest data
- source building edit records
- actor archetype definitions
- suppression ID lists
- atmosphere systems
- camera systems
- audio systems
- overlay grammar

---

# 🌊 CONTINUITY ROLE

This system creates a clean editable authoring context.

The broadcast world may continue to use richer basemaps later.

Editable Map Lab must prioritize deterministic authoring:

```text
Editable mode = clean basemap + WOS-owned 3D buildings only
```

This prevents invisible platform limitations from blocking visible WOS building work.

---

# 🧭 INTERPRETATION SEPARATION

Runtime truth:

```text
BuildingEditRegistry
BuildingReplacementRuntime actors
```

Editable presentation:

```text
wos-replacement-markers
wos-replacement-layer
future WOS building outline/texture layers
```

Basemap presentation:

```text
non-authoritative geographic context only
```

Mapbox Standard imported 3D buildings are explicitly excluded from editable presentation.

---

# 📦 DATA MODEL

```js
type EditableBasemapAuthorityState = {
  activeStyleId: string
  activeStyleUrl: string | null
  standardImportsPresent: boolean
  standard3dBuildingLayersPresent: boolean
  wosReplacementSourceExists: boolean
  wosReplacementLayerExists: boolean
  activeReplacementCount: number
  authorityClassification:
    | 'READY'
    | 'STANDARD_IMPORT_PRESENT'
    | 'STANDARD_3D_BUILDINGS_PRESENT'
    | 'WOS_REPLACEMENT_LAYER_MISSING'
    | 'MAP_NOT_READY'
}
```

---

# ⚙️ SYSTEM CONSTANTS

```js
const EDITABLE_BASEMAP_STYLE_ID = 'wos-editable-flat';
const EDITABLE_BASEMAP_STYLE_URL = '<NON_STANDARD_STYLE_URL_OR_STYLE_OBJECT>';

const REPLACEMENT_SOURCE_ID = 'wos-replacement-markers';
const REPLACEMENT_LAYER_ID = 'wos-replacement-layer';
```

Implementation may use either:

```text
1. a Mapbox Studio style URL with 3D buildings removed
2. a local style object
3. a style assembled from non-Standard sources/layers
```

The key requirement is:

```text
No Mapbox Standard import with active 3D building renderers.
```

---

# 🔧 CORE FUNCTIONS

```js
function activateEditableBasemapAuthority() {}

function restoreBroadcastBasemapAuthority() {}

function verifyEditableBasemapAuthority() {}

function detectStandardImports() {}

function detectStandardBuildingLayers() {}

function debugEditableBasemapAuthority() {}
```

---

# 🔄 EXECUTION FLOW

```text
Enter Map Lab Editable Mode
    ↓
activateEditableBasemapAuthority()
    ↓
Load non-Standard editable basemap
    ↓
Verify no Standard imports
    ↓
Verify no Standard 3D building/model layers
    ↓
BuildingReplacementRuntime.reload()
    ↓
BuildingReplacementRuntime.repairDominance()
    ↓
Confirm WOS replacement layer exists
    ↓
Editable building work begins
```

---

# 🛰️ OBSERVABILITY IMPACT

Expose debug methods:

```js
_wos.debug.buildings.activateEditableBasemapAuthority()
_wos.debug.buildings.verifyEditableBasemapAuthority()
_wos.debug.buildings.debugEditableBasemapAuthority()

SBE.EditableBasemapAuthority.activate()
SBE.EditableBasemapAuthority.verify()
SBE.EditableBasemapAuthority.debug()
```

Required debug output:

```js
{
  activeStyleId: 'wos-editable-flat',
  standardImportsPresent: false,
  standard3dBuildingLayersPresent: false,
  wosReplacementSourceExists: true,
  wosReplacementLayerExists: true,
  activeReplacementCount: 1,
  authorityClassification: 'READY'
}
```

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- MapboxViewportRuntime
- BuildingReplacementRuntime
- BuildingEditRegistry

## Writes To

- editable Mapbox style selection
- editable basemap authority state

## Observed By

- Map Lab
- Map Inspector
- BuildingReplacementRuntime
- BuildingStylizationRuntime
- future BuildingOutlineRuntime

## Forbidden Mutations

- Standard imported 3D model layers
- per-feature Standard building suppression
- replacement manifest data
- actor archetype definitions
- atmosphere systems
- camera systems
- audio systems

---

# 🎼 ORCHESTRATION NOTES

This is an editable-mode basemap authority.

It should not automatically alter all WOS broadcast modes.

Recommended routing:

```text
Map Lab Author Mode:
  use editable non-Standard basemap

Preview / Broadcast Mode:
  later configurable by Surface/Channel profile
```

---

# 🧪 VALIDATION CHECKLIST

## T1 Non-Standard Basemap Loads

Expected:

```js
map.getStyle().imports
```

returns either:

```js
[]
```

or no import that references:

```text
mapbox://styles/mapbox/standard
```

---

## T2 No Standard 3D Building Layers

Expected:

```text
No imported Standard model/fill-extrusion building layers render.
```

---

## T3 WOS Replacement Layer Exists

Expected:

```js
map.getSource('wos-replacement-markers') !== undefined
map.getLayer('wos-replacement-layer') !== undefined
```

---

## T4 Selected Replacement Visible

Expected:

```text
Selected WOS replacement building remains visible.
```

---

## T5 Old Standard Building Gone

Expected:

```text
The old Mapbox Standard 3D building is not visible because it was never loaded.
```

---

## T6 Unselected Buildings Are Flat/Absent

Expected:

```text
Unselected buildings do not appear as 3D objects in editable mode.
```

---

## T7 Authority Classification

Expected:

```js
authorityClassification === 'READY'
```

---

# 🚫 NON-GOALS

This spec does not implement:

- per-feature Mapbox Standard building suppression
- global Standard config suppression
- new replacement runtime
- new replacement source names
- new inspector controls
- building texture systems
- building outline systems
- broadcast style redesign

---

# ⏸️ DEFERRED SYSTEMS

Deferred until editable basemap authority is stable:

- city-wide WOS building generation
- Moebius building treatment
- organic texture patches
- global outline rendering
- broadcast-mode building blending
- Surface-specific map style profiles

---

# 📚 CANONICAL REFERENCES

- 0611A_WOS_HiddenSourceSuppressionResolutionAudit_v1.0.0_BUILD
- 0611Q_WOS_HostOwnedBuildingLayerAuthority_v1.0.0_BUILD
- 0611U_WOS_EditableModeVisualIsolationResolution_v1.0.0_BUILD
- 0612A_WOS_HostBuildingLayerBootRepair_v1.0.0_BUILD
- 0612C_WOS_ExistingReplacementRuntimeSyncRepair_v1.0.0_BUILD
- 0612D_WOS_SelectedBuildingsOnlyMode_v1.0.0_BUILD

---

# 💬 IMPLEMENTATION NOTES

The 0612D repair failed.

The confirmed result:

```text
show3dBuildings=false
show3dFacades=false
show3dLandmarks=false
```

did not remove the visible Standard 3D buildings.

`showBuildingExtrusions=false` also failed after verification; the earlier audit result was a false positive caused by sampling a non-building pixel.

Therefore:

```text
Runtime config suppression is not the solution.
```

The editable map must use a basemap where Standard 3D buildings are not loaded.

Implementation should prioritize speed:

```text
Use an existing non-Standard/flat Mapbox style if available.
Otherwise create a minimal editable style without 3D building layers.
```

---

# ✅ SUCCESS DEFINITION

Success is not:

```text
Config writes accepted.
Source Hidden: Yes.
Suppression IDs present.
Replacement runtime active.
```

Success is:

```text
Map Lab editable mode shows no old Standard 3D buildings.
Selected WOS replacement buildings remain visible.
```
