---
title: "0620A_WOS_BuildingTextureVisibleProofPatch_v1.0.0_BUILD"
date: 2026-06-20
doc_id: "0620A_WOS_BuildingTextureVisibleProofPatch_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "rendering"
component: "Studio Building Texture Proof"
type: "system-spec"
status: "build"
priority: "high"
risk: "medium"
classification: "interpretation-layer"
summary: "Restores the selected-building texture proof workflow in WOS Studio after 0619G placement recovery. This patch proves that a visible building can be selected from the Map and receive an obvious test texture through the Building Inspector without changing publish contracts or actor placement behavior."

supersedes:
  - "0618D_BuildingTextureVisibleProofPatch"

depends_on:
  - "0619G_WOS_StudioLibraryAndPlacementUXRecoveryPatch_v1.0.0_BUILD"
  - "0619G_WOS_StudioLibraryAndPlacementUXRecoveryPatch_v1.0.1_BUILD"

enables:
  - "Building texture package authoring"
  - "Visible facade material proofing"
  - "Map-based building replacement / texture workflows"

tags:
  - "wos"
  - "studio"
  - "map"
  - "buildings"
  - "textures"
  - "proof"
---

# 0620A_WOS_BuildingTextureVisibleProofPatch_v1.0.0_BUILD

## Status

```txt
BUILD SPEC
```

## Purpose

Recover the visible building texture proof workflow now that 0619G has stabilized the primary Studio placement loop.

The goal is narrow:

```txt
View Options
→ Select target: Buildings
→ click visible building
→ Right Inspector: Building
→ Apply Test Texture
→ selected building visibly changes on the map
```

This patch proves that Studio can select a real Mapbox building and apply an obvious texture/material override without breaking actor placement, Library cleanup, Import dropdown behavior, or Publish contracts.

## Current Baseline

0619G is closed.

Confirmed shipped behavior:

```txt
- Library starts clean
- Import exists as a topbar dropdown
- Placement status strip works
- Placement flash/toast works
- Placed actor is selected and pulsed
- Inspector updates after placement
- _wos.debug.studio.placement() returns diagnostics
```

0620A must start from this state and avoid reopening 0619G.

## Core Rule

```txt
Building texture proof is a Map/Inspector workflow, not a Library workflow.
```

The user should not need DevTools to verify whether a building texture operation worked.

## Scope

### In Scope

```txt
- Preserve View Options → Select target → Buildings
- Click a visible Mapbox building
- Populate Right Inspector with selected building data
- Show Apply Test Texture action
- Apply an obvious visible test material/texture state
- Provide success/failure feedback in the Inspector or Map toolbar
- Expose debug snapshot for selected building texture proof
```

### Out of Scope

```txt
- Actor placement changes
- Library restructuring
- Import dropdown restructuring
- Publish contract changes
- Actor manifest schema changes
- GLB runtime rendering changes
- New Mapbox token/style authority
- Full texture package production pipeline
- Multi-building batch editing
- Final facade art direction
```

## Files Expected

Likely files:

```txt
studio/views/threeDCanvasView.js
studio/studioShell.js
studio/styles.css
studio/mapLab/buildingEditRegistry.js
studio/mapLab/buildingPreviewRuntime.js
studio/mapLab/mapInspector.js
studio/mapLab/mapSelection.js
```

Possible supporting files if already part of the existing texture flow:

```txt
studio/actors/inspectorController.js
wall/systems/presentation/buildingEditProjectionRuntime.js
wall/systems/presentation/buildingMaterialIllustrationRuntime.js
wall/systems/presentation/organicBuildingSurfacePatternRuntime.js
```

Do not create new systems unless the existing building texture path has no stable debug/feedback surface.

## Required Product Behavior

### 1. Building selection remains reachable

In Map mode:

```txt
View Options
→ Select target
→ Buildings
```

When Building target mode is active:

```txt
- placement mode must turn off
- cursor should indicate selection mode
- map click should query visible building features
- clicked building should become selected if a feature is found
```

If no building is found under click:

```txt
- show visible message: No building selected
- keep Buildings selection mode active
- do not clear current actor data unless required
```

### 2. Building Inspector opens on selection

After selecting a building, the Right Inspector must switch to building context.

Inspector should display at minimum:

```txt
Inspecting: Building
featureId
sourceId
sourceLayer
lat/lon or centroid
height if available
selected state
texture proof state
```

If these fields are unavailable, show `—` instead of failing.

### 3. Apply Test Texture is visible

The Building Inspector must expose:

```txt
Apply Test Texture
Reset Texture Proof
```

Button behavior:

```txt
Apply Test Texture = applies obvious visual proof to selected building
Reset Texture Proof = removes proof override for selected building
```

The test texture does not need to be final art. It must be visually unmistakable.

Recommended proof appearance:

```txt
- high-contrast facade tint
- visible line/pattern effect if supported
- roof/base distinction if supported
- selected outline or selection halo preserved
```

### 4. Visible map result is mandatory

The building is not considered textured unless the user can see an obvious result on the map.

Acceptable visible proof methods:

```txt
- Mapbox feature-state paint override
- existing building preview runtime overlay
- existing building material illustration runtime
- selected-building replacement preview layer
```

Unacceptable proof methods:

```txt
- console-only result
- data-only registry update
- inspector-only state label
- hidden draft with no visual change
```

### 5. Feedback is required

After applying test texture:

```txt
Success: Test texture applied to selected building
Failure: Texture proof failed — <reason>
```

Feedback may appear in:

```txt
- Building Inspector status row
- Map toolbar status strip
- temporary map flash/toast
```

Do not require DevTools for normal failure visibility.

## Debug Contract

Add or confirm:

```js
_wos.debug.studio.buildingTextureProof()
```

Expected shape:

```js
{
  selectionModeActive: true,
  selectedBuilding: {
    featureId: "...",
    sourceId: "...",
    sourceLayer: "...",
    centroid: { lat: 40.0, lon: -73.0 },
    height: 42
  },
  lastClick: { lat: 40.0, lon: -73.0 },
  lastResult: "ok",
  lastError: null,
  proofApplied: true,
  proofMode: "test-texture",
  visualLayerUpdated: true
}
```

If no building is selected:

```js
{
  selectionModeActive: false,
  selectedBuilding: null,
  lastClick: null,
  lastResult: null,
  lastError: null,
  proofApplied: false,
  proofMode: null,
  visualLayerUpdated: false
}
```

## Data Rules

### Allowed state

This patch may store local Studio proof state in existing building edit/preview registries.

Allowed state examples:

```js
{
  featureId: "...",
  sourceId: "composite",
  sourceLayer: "building",
  proofMode: "test-texture",
  materialClass: "facade-test",
  updatedAt: "2026-06-20T...Z"
}
```

### Forbidden state

Do not write these proof-only values into actor manifests:

```txt
placement diagnostics
map flash state
temporary proof UI state
lastClick diagnostics
Inspector-only status strings
```

Do not alter publish bundle contracts in this patch.

## Authority Boundaries

### This patch owns

```txt
- Studio building selection proof flow
- Building Inspector proof action visibility
- temporary selected-building visual proof
- user-facing proof feedback
- debug snapshot for selected-building texture proof
```

### This patch may observe

```txt
- Mapbox building features
- current map style/layers
- existing building edit registry
- selected building state
- imported texture package availability if already exposed
```

### This patch must not control

```txt
- Mapbox token authority
- global style authority
- actor placement controller
- actor manifests
- Wall publish bundle schema
- GLB packaging pipeline
```

## Execution Flow

```txt
User opens Map
→ View Options opens
→ Select target: Buildings
→ Building selection mode activates
→ User clicks visible building
→ Map query resolves building feature
→ Studio stores selected building reference
→ Right Inspector renders Building context
→ User clicks Apply Test Texture
→ Existing building preview/material runtime applies visible proof
→ Inspector shows success/failure
→ Debug snapshot updates
```

## Required Implementation Details

### 1. Preserve placement/building target separation

When Building selection mode activates:

```txt
- turn off actor placement mode
- do not arm Place on Map
- do not create actor manifests
- do not call actor placement controller
```

### 2. Preserve selected actor behavior

If an actor was selected before selecting a building:

```txt
- building selection may replace Inspector context
- actor manifest must remain unchanged
- actor marker must remain on map
```

### 3. Feature selection must be tolerant

Different styles may use different building layer/source names.

Implementation should try available known building layers rather than hardcoding one brittle layer if existing code already exposes layer discovery.

Recommended tolerated fields:

```txt
feature.id
feature.properties.id
feature.properties.height
feature.properties.render_height
source
sourceLayer
layer.id
```

### 4. Visual proof must survive brief map style repaint

If Mapbox style reloads or View Options toggles Buildings:

```txt
- selected building proof should be reapplied if selected building still exists
- failure should be visible if the feature/layer is unavailable
```

Do not require full persistence across browser reload for v1.0.0 unless already supported by existing registry behavior.

## Styling Requirements

Add minimal styles only if missing:

```txt
- Building Inspector status success
- Building Inspector status error
- Apply Test Texture primary button
- Reset Texture Proof secondary button
- selected building/proof labels
```

Keep styling consistent with existing Studio dark UI.

## Acceptance Criteria

### AC1 — Building target reachable

```txt
View Options → Select target → Buildings is visible and clickable.
```

### AC2 — Building click selects building

```txt
Clicking a visible building opens Right Inspector → Inspecting: Building.
```

### AC3 — Inspector contains building identity

```txt
Inspector shows feature/source/layer/centroid or safe fallback fields.
```

### AC4 — Apply Test Texture is visible

```txt
Apply Test Texture button is reachable without DevTools.
```

### AC5 — Texture proof is visible

```txt
Clicking Apply Test Texture visibly changes the selected building on the map.
```

### AC6 — Reset works

```txt
Clicking Reset Texture Proof removes the visible proof result.
```

### AC7 — Failure is visible

```txt
If no building is selected or texture proof fails, Inspector/status shows reason.
```

### AC8 — Placement is not regressed

```txt
Actor placement from 0619G still works after this patch.
```

### AC9 — Library is not regressed

```txt
Library still starts compact and section state still persists.
```

### AC10 — Import dropdown is not regressed

```txt
Import ▾ still exposes GLB / Texture / Custom Object.
```

### AC11 — Publish is unchanged

```txt
Publish chip/button behavior remains unchanged.
```

### AC12 — Debug snapshot exists

```txt
_wos.debug.studio.buildingTextureProof() returns the expected diagnostic object.
```

## Smoke Test

```txt
1. Hard reload Studio.
2. Open Map.
3. Confirm actor placement status shows Ready.
4. Open View Options.
5. Select target → Buildings.
6. Click a visible building.
7. Confirm Right Inspector says Inspecting: Building.
8. Confirm building feature/source/layer values are shown.
9. Click Apply Test Texture.
10. Confirm selected building visibly changes.
11. Run _wos.debug.studio.buildingTextureProof().
12. Confirm lastResult is ok and proofApplied is true.
13. Click Reset Texture Proof.
14. Confirm visible proof is removed.
15. Place a normal actor using 0619G placement flow.
16. Confirm actor placement still works.
```

## Closure Rule

```txt
0620A closes only when a selected visible building can receive and reset an obvious test texture from the Building Inspector.
```

## Expected Final State

```txt
Studio can select buildings from the Map.
Building Inspector opens reliably.
Apply Test Texture produces visible proof.
Reset Texture Proof removes visible proof.
0619G placement and Library behavior remain intact.
Building texture production work can proceed from a proven visible loop.
```

## Implementation Guide

- **Where:** Patch `studio/views/threeDCanvasView.js`, existing building selection/preview/inspector modules, and `studio/styles.css` only where necessary.
- **What:** Start from closed 0619G state, then implement the selected-building proof loop: select building, inspect building, apply/reset test texture, expose debug snapshot.
- **Expect:** A visible selected building changes when `Apply Test Texture` is clicked, resets when requested, and actor placement remains untouched.
