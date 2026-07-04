
# 🚦 SPEC STAGE

Stage: BUILD

Freeze Decision: ACTIVE

Action: Repair host-owned building authority layer boot sequence and establish deterministic building authority visibility.

---

layout: spec

title: "Host Building Layer Boot Repair"  
date: 2026-06-12  
doc_id: "0612A_WOS_HostBuildingLayerBootRepair_v1.0.0_BUILD"  
version: "1.0.0"

project: "Wall of Sound"  
system: "WOS"

domain: "rendering"  
component: "HostBuildingLayer"

type: "runtime-spec"  
status: "active"

priority: "high"  
risk: "medium"

classification: "runtime-authority"

summary: "Repairs host-owned building layer initialization and establishes deterministic observability for building authority infrastructure."

doctrine:

- "2D owns truth"
    
- "2.5D owns presentation"
    

depends_on:

- "BuildingAuthorityRuntime"
    
- "BuildingEditProjectionRuntime"
    

enables:

- "EditableBuildingAuthority"
    
- "BuildingReplacementPipeline"
    
- "BuildingVisualOverrides"
    

tags:

- "building"
    
- "authority"
    
- "mapbox"
    
- "host-layer"
    
- "observability"
    

---

# 🎯 PURPOSE

Repair the Host Building Layer boot sequence.

Current investigation has demonstrated that imported Mapbox Standard buildings are not authoritative building data for WOS.

The purpose of this spec is to establish:

```text
Host-Owned Building Authority
```

as the canonical building authority layer.

This spec exists to answer one question:

```text
Does a valid host-owned building layer exist?
```

Before additional building editing, replacement, stylization, projection, or suppression systems proceed.

---

# 🧠 CORE PRINCIPLES

### Authority Before Styling

Building authority must exist before visual customization occurs.

### Observability Before Mutation

The runtime must expose diagnostics before attempting corrective actions.

### Deterministic Discovery

Layer existence must be verifiable through runtime inspection.

### Imported Buildings Are Non-Authoritative

Imported Standard buildings may render visually but must not be treated as editable building authority.

### Recovery Before Expansion

No new building features may be added until host layer boot succeeds.

---

# 🏛️ AUTHORITY BOUNDARIES

This spec governs:

- host building source creation
    
- host building layer creation
    
- source-layer validation
    
- feature transfer validation
    
- building authority observability
    

This spec may mutate:

- host building source registration
    
- host building layer registration
    
- building authority diagnostics
    

This spec may observe:

- Mapbox style state
    
- imported source definitions
    
- layer topology
    
- source-layer metadata
    

This spec does NOT govern:

- building styling
    
- building replacement
    
- building editing UI
    
- building projection rendering
    
- building textures
    
- building atmosphere systems
    

---

# 🌊 CONTINUITY ROLE

This system establishes continuity ownership for future building systems.

Without a functioning host authority layer:

```text
Editable Buildings
Building Overrides
Building Replacement
Building Stylization
```

cannot operate deterministically.

This spec establishes the minimum continuity requirement:

```text
Host Building Layer Exists
```

---

# 🧭 INTERPRETATION SEPARATION

Canonical doctrine:

```text
2D owns truth
2.5D owns presentation
```

Host building authority is:

```text
runtime truth
```

Building meshes, projection geometry, outlines, textures, atmospheric overlays, and future stylization systems are:

```text
presentation interpretation
```

Interpretation systems may observe host building authority.

Interpretation systems may not create authority.

---

# 📦 DATA MODEL

```js
type HostBuildingLayerReport = {
  sourceExists: boolean
  sourceLayerExists: boolean
  layerExists: boolean

  sourceId: string | null
  sourceLayerId: string | null
  layerId: string | null

  featureCount: number

  bootClassification:
    | 'READY'
    | 'SOURCE_MISSING'
    | 'SOURCE_LAYER_MISSING'
    | 'LAYER_MISSING'
    | 'NO_FEATURES'
}
```

---

# ⚙️ SYSTEM CONSTANTS

```js
const HOST_BUILDING_SOURCE_ID =
  'wos-host-buildings';

const HOST_BUILDING_LAYER_ID =
  'wos-host-building-layer';

const MIN_EXPECTED_FEATURES = 1;
```

---

# 🔧 CORE FUNCTIONS

```js
function _ensureHostBuildingLayer() {}

function _resolveHostBuildingSource() {}

function _resolveHostBuildingSourceLayer() {}

function _validateHostBuildingFeatures() {}

function debugHostBuildingLayer() {}

function classifyHostBuildingBootState() {}
```

### Required Public Debug API

```js
_wos.debug.buildings.debugHostBuildingLayer()

SBE.BuildingAuthorityRuntime
  .debugHostBuildingLayer()
```

---

# 🔄 EXECUTION FLOW

```text
Map Load
    ↓
Imported Style Inspection
    ↓
Host Source Discovery
    ↓
Host Source Creation
    ↓
Source-Layer Validation
    ↓
Host Layer Creation
    ↓
Feature Validation
    ↓
Boot Classification
    ↓
Debug Report Exposure
```

No downstream building systems may execute before successful boot classification.

---

# 🛰️ OBSERVABILITY IMPACT

This system exposes:

- host layer existence
    
- source existence
    
- source-layer existence
    
- feature counts
    
- boot failure reasons
    

This system does not control:

- renderer appearance
    
- building colors
    
- building outlines
    
- atmospheric effects
    
- geometry projection
    

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- Mapbox Style Runtime
    
- Imported Building Sources
    
- BuildingAuthorityRuntime
    

## Writes To

- HostBuildingLayer
    
- HostBuildingDiagnostics
    

## Observed By

- BuildingEditProjectionRuntime
    
- EditableBuildingMode
    
- Future Building Replacement Runtime
    

## Forbidden Mutations

- projection meshes
    
- style tokens
    
- atmosphere systems
    
- overlay grammar
    
- camera systems
    

---

# 🎼 ORCHESTRATION NOTES

This system does not orchestrate building behavior.

This system only establishes authority infrastructure.

Downstream systems may consume successful boot state.

They may not participate in boot creation.

---

# 🧪 VALIDATION CHECKLIST

## T1 Source Exists

```js
debugHostBuildingLayer()
```

returns:

```js
sourceExists === true
```

---

## T2 Source Layer Exists

```js
sourceLayerExists === true
```

---

## T3 Layer Exists

```js
layerExists === true
```

---

## T4 Features Present

```js
featureCount > 0
```

---

## T5 Classification

Expected:

```js
bootClassification === 'READY'
```

---

## T6 Queryability

```js
queryRenderedFeatures(...)
```

returns host-owned building features.

---

## T7 Authority Ready

Host layer available for future editable building authority workflows.

---

# 🚫 NON-GOALS

This spec does not implement:

- building replacement
    
- building suppression
    
- building editing
    
- building projection
    
- building outlines
    
- building texture systems
    
- building color systems
    
- stylized building rendering
    

---

# ⏸️ DEFERRED SYSTEMS

Deferred until successful boot repair:

- Editable Building Runtime
    
- Building Replacement Runtime
    
- Building Stylization Runtime
    
- Building Texture Runtime
    
- Building Outline Runtime
    
- Building Projection Authority Runtime
    

---

# 📚 CANONICAL REFERENCES

- WOS Naming Doctrine
    
- Surface Channel Doctrine
    
- WOS Constitutional Spec Template
    
- 0611Q_WOS_HostOwnedBuildingLayerAuthority
    
- 0611R_WOS_ImportedBasemapContaminationExitStrategy
    
- 0611S_WOS_EditableBuildingModeImportBypass
    
- 0611T_WOS_EditableModeVisualIsolation
    
- 0611U_WOS_EditableModeVisualIsolationResolution
    

---

# 💬 IMPLEMENTATION NOTES

Current evidence suggests the highest-probability failures are:

```text
source-layer mismatch
```

or

```text
feature transfer failure
```

or

```text
host layer registration failure
```

Current evidence does NOT suggest suppression logic failure because authority infrastructure never became active.

Success criteria for this build:

```text
Host Building Layer Exists = TRUE
```

All future building authority work is blocked until this condition is achieved.