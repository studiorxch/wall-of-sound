# 🚦 SPEC STAGE

Stage: BUILD  
Freeze Decision: ACTIVE  
Action: Disable Mapbox Standard 3D model buildings globally during editable/replacement workflows and render only WOS-authored selected buildings.

---

layout: spec

title: "Selected Buildings Only Mode"
date: 2026-06-12
doc_id: "0612D_WOS_SelectedBuildingsOnlyMode_v1.0.0_BUILD"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "SelectedBuildingsOnlyMode"

type: "runtime-spec"
status: "active"

priority: "high"
risk: "medium"

classification: "runtime-authority"

summary: "Defines the selected-buildings-only rendering mode for Map Lab/editable building workflows by disabling Mapbox Standard 3D model buildings globally and rendering only WOS-owned selected replacement buildings."

doctrine:

- "2D owns truth"
- "2.5D owns presentation"

depends_on:

- "BuildingReplacementRuntime"
- "BuildingEditRegistry"
- "BuildingEditProjectionRuntime"
- "MapboxViewportRuntime"

enables:

- "BuildingReplacementAuthority"
- "BuildingStylizationRuntime"
- "BuildingOutlineRuntime"
- "BuildingTextureRuntime"

tags:

- "buildings"
- "replacement"
- "mapbox-standard"
- "editable-mode"
- "selected-only"

---

# 🎯 PURPOSE

Create a deterministic editable building mode where only WOS-authored selected buildings render as 3D objects.

This spec resolves the confirmed Mapbox Standard limitation:

```text
Mapbox Standard model buildings cannot be suppressed per feature using fill-extrusion-height.
```

Therefore, WOS must stop trying to remove individual Standard model buildings.

Instead:

```text
Mapbox Standard 3D buildings: OFF globally
WOS selected replacement buildings: ON individually
```

The goal is visible, controllable building authorship.

---

# 🧠 CORE PRINCIPLES

## Selected Buildings Only

Only buildings selected, authored, or replaced through WOS should appear as 3D editable buildings.

## No Per-Feature Standard Suppression

Do not attempt per-building removal of Mapbox Standard `model` layers.

## WOS Owns Editable Geometry

All editable buildings must render through WOS-owned sources and layers.

## Backdrop Is Not Authority

Mapbox Standard may provide geographic context, roads, water, land, labels, and flat map styling, but not editable 3D building authority.

## Visual Result Over Theoretical Completeness

Success is defined by the old Standard model building disappearing and the WOS replacement remaining visible.

---

# 🏛️ AUTHORITY BOUNDARIES

This spec governs:

- editable-mode Standard 3D building visibility
- selected-only building rendering state
- global Standard building disable behavior
- WOS replacement layer preservation
- debug visibility state

This spec may mutate:

- Mapbox Standard basemap config for global 3D building visibility
- WOS selected-building-only runtime state
- WOS replacement runtime reload/repair calls

This spec may observe:

- Mapbox basemap config
- `wos-replacement-markers`
- `wos-replacement-layer`
- replacement manifest state
- editable mode state

This spec must not mutate:

- imported Standard model layer internals
- per-feature Standard model geometry
- replacement manifest contents
- building archetype data
- camera systems
- atmosphere systems
- audio systems
- overlay grammar

---

# 🌊 CONTINUITY ROLE

Selected Buildings Only Mode creates a reliable authoring state for WOS building replacement.

When active:

```text
Standard 3D building world disappears.
WOS-authored selected buildings remain.
```

This mode is not the default broadcast world.

It is an editable/replacement authoring mode designed to remove ambiguity during visual building work.

---

# 🧭 INTERPRETATION SEPARATION

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

Runtime truth:

```text
BuildingEditRegistry manifest
BuildingReplacementRuntime actor registry
```

Presentation:

```text
wos-replacement-layer
wos-replacement-markers
fill-extrusion replacement geometry
```

Mapbox Standard model buildings are not editable truth.

They are background presentation and must be globally disabled during selected-only authoring.

---

# 📦 DATA MODEL

```js
type SelectedBuildingsOnlyModeState = {
  enabled: boolean
  standard3dBuildingsDisabled: boolean
  replacementSourceExists: boolean
  replacementLayerExists: boolean
  activeReplacementCount: number
  lastAppliedAt: number | null
  lastError: string | null
}
```

---

# ⚙️ SYSTEM CONSTANTS

```js
const STANDARD_BASEMAP_CONFIG_ID = 'basemap';
const STANDARD_3D_BUILDINGS_CONFIG_KEY = 'show3dBuildings';

const REPLACEMENT_SOURCE_ID = 'wos-replacement-markers';
const REPLACEMENT_LAYER_ID = 'wos-replacement-layer';
```

---

# 🔧 CORE FUNCTIONS

```js
function enableSelectedBuildingsOnlyMode() {}

function disableSelectedBuildingsOnlyMode() {}

function applySelectedBuildingsOnlyMode() {}

function restoreStandard3dBuildings() {}

function getSelectedBuildingsOnlyModeState() {}

function debugSelectedBuildingsOnlyMode() {}
```

---

# 🔄 EXECUTION FLOW

```text
Editable Mode Enabled
    ↓
SelectedBuildingsOnlyMode.enable()
    ↓
map.setConfigProperty('basemap', 'show3dBuildings', false)
    ↓
BuildingReplacementRuntime.reload()
    ↓
BuildingReplacementRuntime.repairDominance()
    ↓
BuildingEditProjectionRuntime.apply()
    ↓
Debug state confirms:
    Standard 3D buildings disabled
    WOS replacement layer present
    Active replacements visible
```

---

# 🛰️ OBSERVABILITY IMPACT

Expose a debug surface:

```js
_wos.debug.buildings.enableSelectedBuildingsOnlyMode()
_wos.debug.buildings.disableSelectedBuildingsOnlyMode()
_wos.debug.buildings.debugSelectedBuildingsOnlyMode()

SBE.SelectedBuildingsOnlyMode.enable()
SBE.SelectedBuildingsOnlyMode.disable()
SBE.SelectedBuildingsOnlyMode.debug()
```

Debug result must report:

```js
{
  enabled: true,
  standard3dBuildingsDisabled: true,
  replacementSourceExists: true,
  replacementLayerExists: true,
  activeReplacementCount: 1,
  lastError: null
}
```

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- MapboxViewportRuntime
- BuildingReplacementRuntime
- BuildingEditRegistry
- editable mode state

## Writes To

- Mapbox Standard basemap config
- SelectedBuildingsOnlyMode runtime state

## Observed By

- Map Lab Inspector
- BuildingReplacementRuntime
- BuildingEditProjectionRuntime
- future BuildingStylizationRuntime

## Forbidden Mutations

- imported Standard model feature geometry
- per-feature Standard model filters
- replacement manifest data
- source building IDs
- camera systems
- atmosphere systems
- audio systems

---

# 🎼 ORCHESTRATION NOTES

This system should activate only during editable/replacement workflows.

It should not become the default broadcast presentation unless explicitly enabled by a future Surface/Channel profile.

Suggested mode behavior:

```text
Map Lab / Editable Mode: selected buildings only
Broadcast Mode: configurable
```

---

# 🧪 VALIDATION CHECKLIST

## T1 Standard 3D Buildings Disable

Run:

```js
_wos.debug.buildings.enableSelectedBuildingsOnlyMode()
```

Expected:

```text
All Mapbox Standard 3D model buildings disappear.
```

---

## T2 Replacement Layer Survives

Expected:

```js
map.getSource('wos-replacement-markers') !== undefined
map.getLayer('wos-replacement-layer') !== undefined
```

---

## T3 Selected Replacement Visible

Expected:

```text
Selected WOS replacement building remains visible after Standard buildings disappear.
```

---

## T4 Unselected Buildings Not 3D

Expected:

```text
Unselected Standard buildings do not render as 3D model buildings.
```

---

## T5 No Per-Feature Suppression Claims

Expected:

```text
Runtime does not claim individual Standard model buildings were suppressed.
```

---

## T6 Restore Path

Run:

```js
_wos.debug.buildings.disableSelectedBuildingsOnlyMode()
```

Expected:

```text
Mapbox Standard 3D buildings return globally.
```

---

# 🚫 NON-GOALS

This spec does not implement:

- per-feature Standard model building suppression
- custom Mapbox Standard model filters
- building texture systems
- building outline systems
- Moebius stylization
- replacement archetype redesign
- inspector redesign
- new replacement source/layer names

---

# ⏸️ DEFERRED SYSTEMS

Deferred until selected-only mode is stable:

- Building outline rendering
- Building color differentiation
- Building texture patches
- Building stylization passes
- custom city-wide WOS building generation
- broadcast-mode selected-building blending

---

# 📚 CANONICAL REFERENCES

- 0610M_WOS_SourceBuildingHideAuthority_v1.0.0_BUILD
- 0611A_WOS_HiddenSourceSuppressionResolutionAudit_v1.0.0_BUILD
- 0611Q_WOS_HostOwnedBuildingLayerAuthority_v1.0.0_BUILD
- 0611U_WOS_EditableModeVisualIsolationResolution_v1.0.0_BUILD
- 0612A_WOS_HostBuildingLayerBootRepair_v1.0.0_BUILD
- 0612C_WOS_ExistingReplacementRuntimeSyncRepair_v1.0.0_BUILD

---

# 💬 IMPLEMENTATION NOTES

The confirmed root cause is not replacement runtime failure.

The visible source building survives because it is rendered by a Mapbox Standard `model` layer.

WOS suppression currently works by applying:

```js
fill-extrusion-height = 0
```

to WOS-owned or host-owned `fill-extrusion` layers.

That cannot remove a Mapbox Standard `model` building.

Therefore this build must not attempt another per-feature suppression repair.

It must implement a global Standard 3D building disable path for editable/replacement mode.

---

# ✅ SUCCESS DEFINITION

Success is not:

```text
Replacement runtime active.
Source Hidden: Yes.
Suppression IDs present.
```

Success is:

```text
The old Standard 3D model building is gone.
The selected WOS replacement building remains.
```
