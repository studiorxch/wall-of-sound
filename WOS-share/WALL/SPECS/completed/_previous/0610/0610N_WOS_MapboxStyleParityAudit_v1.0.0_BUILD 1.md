# 0610N_WOS_MapboxStyleParityAudit_v1.0.0_BUILD

## Purpose

Audit and correct the WOS Mapbox style pipeline so Mapbox Studio style output is the visual source of truth.

This build exists because WOS currently appears to override Mapbox Studio decisions at runtime. Buildings, background, opacity, color, and source-layer visibility can differ between Mapbox Studio, Studio Map Lab, and Wall. The result is that hiding or styling buildings in Mapbox Studio may not match WOS.

## Stage

[BUILD]

## Environmental Assumptions

- App runs locally at `127.0.0.1:5501`.
- Mapbox GL JS is already loaded by Studio and Wall.
- WOS uses a Mapbox Studio style URL for the Wall presentation map.
- Existing localStorage manifest key remains:

```txt
wos.maplab.buildings
```

- This spec must not remove the replacement system.
- This spec must separate base Mapbox style rendering from WOS-authored overlays.

## Problem

WOS currently has multiple visual authorities touching buildings:

1. **Mapbox Studio style**
   - Intended source of truth for base map colors, land, water, roads, 3D buildings, and style-layer visibility.

2. **Studio Map Lab runtime**
   - Adds or modifies building extrusion layers.
   - Applies default building colors and selection expressions.
   - May create `maplab-buildings-3d` even when the style already contains building layers.

3. **Wall projection runtime**
   - Applies runtime color and opacity edits onto source building layers.
   - Suppresses source buildings for replacements and hidden entries.

4. **Replacement runtime**
   - Adds WOS-authored replacement actors.

5. **Preview runtime**
   - Adds Studio preview actors and suppresses originals.

The failure mode: base Mapbox buildings remain visible, incorrectly colored, or differently styled even when Mapbox Studio settings suggest they should be hidden or styled differently.

## Build Goal

Create a style parity audit and enforce clean visual authority rules:

```txt
Mapbox Studio style owns base map visuals.
WOS runtime owns only WOS-authored overlays and explicit edit/suppression states.
```

## Non-Goals

- Do not redesign replacement archetypes.
- Do not remove grouping, compounds, deletion, or hide metadata.
- Do not modify Canvas or Glyph systems.
- Do not change manifest schema unless absolutely required.
- Do not hardcode a new Mapbox style URL in multiple places.

## Visual Authority Rules

### Rule 1 — Base style is read-only by default

WOS must not rewrite building color, building opacity, land color, road color, water color, or background color during normal map initialization.

Runtime paint edits are allowed only when one of these is true:

- user is actively selecting/hovering in Studio Author mode
- user has authored a color edit
- user has authored `hidden: true`
- user has authored `replacement.enabled: true`
- Studio is in Preview mode
- Wall is projecting replacement suppression

### Rule 2 — No forced fallback 3D layer unless missing

`maplab-buildings-3d` may be created only if no usable building extrusion layer exists in the active Mapbox style.

If the Mapbox Studio style already contains a building / building-model / fill-extrusion layer, WOS must not add duplicate 3D building layers.

### Rule 3 — Author mode must show base style + author cues only

Studio Author mode may show:

- original Mapbox buildings exactly as styled by Mapbox Studio
- hover outline
- selected outline
- optional authored color cue only for selected/edited buildings

Studio Author mode must not show:

- Wall replacement actors
- Preview replacement actors
- source building suppression unless `hidden: true` is explicitly enabled

### Rule 4 — Preview mode must show output truth

Studio Preview mode may show:

- WOS replacement actors
- suppressed source buildings for replaced/hidden entries
- same geometry/material rendering path as Wall

Preview mode must not also show:

- author color cue layer
- duplicate source building extrusion
- unsuppressed original under a replacement

### Rule 5 — Wall mode must not inherit Studio author cues

Wall must project only production-facing visual edits:

- hidden source suppression
- replacement source suppression
- replacement actors
- intentional production color edits, if still supported

Wall must not inherit temporary Studio selection/hover/author cues.

## Required Audit Targets

### 1. `studio/mapLab/mapLabView.js`

Audit these areas:

- `_addBuildingLayer(map)`
- `_defaultColorExpr()`
- `_applySelectionPaint(map, layerId)`
- `_restoreEdits(adapter)`
- `_setMapMode(mode)`

Required changes:

- Rename `_addBuildingLayer` to `_ensureSelectableBuildingLayer` only if it still needs to create fallback layers.
- Before adding `maplab-buildings-3d`, inspect active style layers.
- Do not overwrite existing Mapbox style building paint on load.
- Selection/hover should be handled with separate highlight/outline layers where possible, not by mutating base building color globally.
- Add diagnostics for whether WOS is using:

```txt
style-owned-building-layer
wos-fallback-building-layer
preview-replacement-layer
wall-replacement-layer
```

### 2. `studio/mapLab/mapboxAdapter.js`

Audit these areas:

- building layer discovery
- `applyRegistryEdits(edits)`
- `clearRegistryProjection()`
- selection color expressions
- opacity expressions

Required changes:

- Snapshot original paint expressions per layer before any edit.
- Restore exact original expressions when clearing projection.
- Do not replace base style paint with WOS defaults unless the layer is WOS-created.
- Add `styleParityStatus()` returning:

```js
{
  activeStyleUrl,
  styleLoaded,
  buildingLayerCount,
  fallbackLayerPresent,
  wosMutatedLayerCount,
  mutatedLayers,
  originalPaintSnapshots,
  lastParityError
}
```

### 3. `studio/mapLab/buildingPreviewRuntime.js`

Audit these areas:

- `_findSuppressibleLayers(map)`
- `_suppressOriginals(map)`
- `_restoreOriginals(map)`
- `_ensurePreviewLayer(map)`

Required changes:

- Suppression is allowed only in Preview mode.
- Original opacity must be restored exactly on return to Author mode.
- Preview layer must be clearly named and excluded from base-style discovery.
- Add debug output:

```js
WOSMapLab.previewStyleParityStatus()
```

with:

```js
{
  mode,
  previewLayerPresent,
  suppressedLayerCount,
  restoredLayerCount,
  originalOpacitySnapshotCount,
  unsuppressedSourceCount,
  lastError
}
```

### 4. `wall/systems/presentation/buildingEditProjectionRuntime.js`

Audit these areas:

- `_discoverLayers(map)`
- `_apply(map)`
- `_clearPaintOverrides(map)`

Required changes:

- Projection runtime must not discover or modify non-building style layers.
- Projection runtime must never modify `wos-replacement-*` layers.
- Projection runtime must restore exact original paint values on clear.
- Add `styleParityStatus()` to `_wos.debug.buildingEdits`.

### 5. `wall/systems/runtime/buildingReplacementRuntime.js`

Audit these areas:

- replacement layer insertion order
- dominance repair
- actor source/layer naming

Required changes:

- Replacement actors should sit above source buildings only when replacement is enabled.
- Replacement actor layer must not become part of building-source suppression discovery.
- Add status fields:

```js
{
  replacementLayerPresent,
  replacementAboveSourceBuildings,
  sourceBuildingSuppressionActive,
  styleOwnedBuildingLayerCount,
  wosReplacementActorCount
}
```

## Implementation Plan

### Phase 1 — Inventory active style layers

Add a shared helper or duplicated minimal helper in Studio and Wall runtimes:

```js
function classifyMapLayers(map) {
  return {
    buildingFillLayers: [],
    buildingExtrusionLayers: [],
    buildingModelLayers: [],
    wosRuntimeLayers: [],
    landLayers: [],
    roadLayers: [],
    backgroundLayers: []
  };
}
```

Use this to report what exists before WOS mutates anything.

### Phase 2 — Snapshot original paint

Before any runtime calls `setPaintProperty`, capture:

```js
{
  layerId,
  type,
  colorProp,
  opacityProp,
  originalColor,
  originalOpacity,
  capturedAt
}
```

Snapshots must be per runtime and must not overwrite each other after mutation.

### Phase 3 — Stop default mutation

Remove or gate any startup behavior that forces these defaults onto Mapbox style-owned layers:

```js
fill-extrusion-color
fill-extrusion-opacity
fill-color
fill-opacity
background-color
```

Allowed exception: WOS-created fallback layers only.

### Phase 4 — Explicit suppression only

Suppression should activate only for:

- replacement-enabled entries
- hidden source entries
- preview output mode

Never suppress because a building is merely selected.

### Phase 5 — Diagnostics

Expose these debug calls:

```js
WOSMapLab.styleParityStatus()
WOSMapLab.previewStyleParityStatus()
_wos.debug.buildingEdits.styleParityStatus()
_wos.debug.buildingReplacement.styleParityStatus()
```

Each must return plain JSON and must not mutate the map.

## Expected Debug Output

### Studio Author mode

```js
WOSMapLab.styleParityStatus()
```

Expected:

```js
{
  mode: "author",
  baseStyleAuthority: "mapbox-studio",
  fallbackLayerPresent: false,
  previewLayerPresent: false,
  sourceSuppressionActive: false,
  wosMutatedLayerCount: 0,
  parityOk: true
}
```

### Studio Preview mode

```js
WOSMapLab.previewStyleParityStatus()
```

Expected:

```js
{
  mode: "preview",
  previewLayerPresent: true,
  sourceSuppressionActive: true,
  authorCueActive: false,
  parityOk: true
}
```

### Wall

```js
_wos.debug.buildingReplacement.styleParityStatus()
```

Expected:

```js
{
  baseStyleAuthority: "mapbox-studio",
  replacementLayerPresent: true,
  replacementAboveSourceBuildings: true,
  sourceBuildingSuppressionActive: true,
  parityOk: true
}
```

## Acceptance Tests

| Test | Expected |
|---|---|
| T1 — Mapbox Studio building visibility | If Mapbox Studio hides 3D buildings, WOS must not recreate them unless fallback mode is explicitly enabled. |
| T2 — Mapbox Studio building color | WOS Author mode must preserve Mapbox Studio building color on load. |
| T3 — No forced white/beige buildings | WOS must not repaint source buildings white/beige/brown unless that comes from the Mapbox style itself. |
| T4 — Author mode no suppression | Source buildings remain visible in Author mode unless `hidden: true` is active. |
| T5 — Preview mode suppression | Source buildings are suppressed only for hidden/replacement targets. |
| T6 — Wall suppression | Wall suppresses only hidden/replacement source buildings. |
| T7 — Restore exact paint | Returning Preview → Author restores original paint expressions exactly. |
| T8 — No duplicate 3D layer | If style already has a building extrusion/model layer, `maplab-buildings-3d` is not added. |
| T9 — Diagnostics | All parity status methods return JSON and no errors. |
| T10 — No Canvas/Glyph changes | Canvas and Glyph systems remain untouched. |

## Regression Checks

Run in browser console after build.

### Studio Author mode

```js
WOSMapLab.styleParityStatus()
WOSMapLab.previewStatus()
WOSMapLab.sourceHideStatus()
```

Expected:

```txt
parityOk true
preview mode author
source suppression inactive unless selected building hidden true
```

### Studio Preview mode

```js
WOSMapLab.previewStyleParityStatus()
WOSMapLab.unsuppressedSourceBuildings()
```

Expected:

```txt
previewLayerPresent true
unsuppressedSourceBuildings returns [] for replaced/hidden targets
```

### Wall

```js
_wos.debug.buildingEdits.styleParityStatus()
_wos.debug.buildingReplacement.styleParityStatus()
_wos.debug.buildingReplacement.dominanceStatus()
```

Expected:

```txt
replacementAboveSourceBuildings true
source suppression active only when replacement/hidden edits exist
no WOS runtime layers included in source building discovery
```

## Failure Conditions

Build fails if any of these remain true:

- WOS shows 3D source buildings after Mapbox Studio disables 3D buildings, without explicit fallback mode.
- WOS repaints all source buildings on startup.
- Author mode shows replacement actor and source building and author cue simultaneously.
- Preview mode fails to restore original source style when returning to Author.
- Wall runtime modifies land, road, water, background, or replacement actor layers during building suppression.

## Files Allowed To Change

```txt
studio/mapLab/mapLabView.js
studio/mapLab/mapboxAdapter.js
studio/mapLab/buildingPreviewRuntime.js
wall/systems/presentation/buildingEditProjectionRuntime.js
wall/systems/runtime/buildingReplacementRuntime.js
```

## Files Not Allowed To Change

```txt
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapInspector.js
studio/index.html
wall/index.html
wall/main.js
canvas/*
glyph/*
```

## Implementation Guide

- **Where:** Update the five allowed runtime files listed above. Start with layer classification and paint snapshot helpers before changing behavior.
- **What:** Run `npm run dev` or your current local static server, then test Studio Map Lab and Wall at `127.0.0.1:5501`.
- **Expect:** Mapbox Studio visual settings match WOS base map visuals; WOS only diverges when explicit hidden/replacement/preview logic is active.
