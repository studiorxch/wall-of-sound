---
layout: spec
title: "0619E WOS Map Authoring Surface Recovery Patch"
date: 2026-06-19
doc_id: "0619E_WOS_MapAuthoringSurfaceRecoveryPatch_v1.0.0_BUILD"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "authoring"
component: "studio_map_authoring_surface"
type: "recovery-spec"
status: "active"
priority: "high"
risk: "medium"
classification: "support-system"
summary: "Recover the Studio Map authoring surface so building selection, View Options, and 0618D texture proof can be reached and verified."
---

# 0619E_WOS_MapAuthoringSurfaceRecoveryPatch_v1.0.0_BUILD

## Purpose

Recover the Studio Map authoring surface after the 0618D texture proof chain became blocked by a missing or hidden Map toolbar, missing View Options, and no visible building-selection entry point.

This patch exists to restore the minimum authoring path required to test building replacement and texture proof:

```txt
Map
→ visible toolbar
→ View Options
→ Select target: Buildings
→ click building
→ Building inspector
→ Apply Test Texture
→ visible checker proof
```

## Problem Statement

0618D delivered the texture proof controller, texture-ready material normalization, and inspector proof actions, but the user cannot test it because the Studio Map surface currently shows:

```txt
Map tab active
Mapbox canvas present
Mapbox controls/logo present
No visible toolbar
No View Options button
No Select target: Buildings control
Inspector remains on Asset context
No path to selected-building inspector
```

Therefore 0618D must remain:

```txt
CODE PASS / VISUAL PROOF BLOCKED
```

until 0619E restores the Map authoring surface.

## Core Rule

```txt
This patch is successful only when the Map authoring controls are visible and building selection is reachable.
```

Parse-clean is not enough.

## Authority Boundary

### 0619E Owns

- Studio Map toolbar visibility.
- View Options visibility and mounting.
- Building selection control reachability.
- Map surface diagnostic visibility.
- Fallback state if Mapbox/style/bootstrap fails.
- Debug snapshot for Map authoring readiness.

### 0619E Does Not Own

- Building texture package governance.
- Building texture assignment records.
- Texture preview material mutation.
- Broadcast runtime texture application.
- Mapbox style design/aesthetic overhaul.
- Wall/Broadcast renderer behavior.

## Required User-Facing Result

The Studio Map tab must visibly show:

```txt
Selected: <asset label>
Place on Map
View Options ▼
```

When View Options opens, it must show:

```txt
Look
Labels
Buildings
Actors
Show actors
Proxy detail
Auth scale
Select target: Buildings
```

## Implementation Targets

Likely files:

```txt
studio/views/threeDCanvasView.js
studio/studioShell.js
studio/styles.css
studio/index.html
```

Optional if needed:

```txt
studio/views/buildingSelectionController.js
studio/views/mapLookController.js
```

## Implementation Requirements

### 1. Toolbar Must Always Mount

`WOSThreeDCanvasView.enter(stageBody)` must always call and complete:

```txt
_buildToolbar(wrap)
_buildMapContainer(wrap)
```

The toolbar must not depend on Mapbox style load success.

If Mapbox fails, the toolbar still renders.

### 2. Toolbar Must Not Be Covered by Map Canvas

Ensure layout order and CSS guarantee:

```txt
#tdcv-wrap
  #tdcv-toolbar
  #tdcv-viewopt-panel? optional
  #tdcv-map
```

Required CSS behavior:

```txt
#tdcv-toolbar { flex-shrink: 0; z-index: above map; position: relative; }
#tdcv-viewopt-panel { flex-shrink: 0; z-index: above map; position: relative; }
#tdcv-map { flex: 1; min-height: 0; position: relative; }
```

No Mapbox canvas child may overlay the toolbar.

### 3. View Options Must Be Reachable

`#tdcv-viewopt-btn` must be visible on every Map entry.

Clicking it must create or remove:

```txt
#tdcv-viewopt-panel
```

The panel must not render behind the map.

### 4. Building Selection Must Be Reachable

View Options must include a visible control:

```txt
Select target: Buildings
```

Clicking it must activate building selection mode and update button active state.

### 5. Building Click Must Open Building Inspector

When building selection mode is active and the user clicks a building:

```txt
BuildingSelectionController.handleMapClick(...)
→ document.dispatchEvent('wos:building-selected', { detail: selection })
→ studioShell selectedBuilding state updates
→ inspector renders Building Replacement / Building Texture Proof sections
```

### 6. Map Surface Diagnostic Strip

Add a small visible diagnostic strip when something is missing.

Suggested content:

```txt
Map Surface: toolbar mounted · mapbox loaded · style loading · building selection ready · render layer ready
```

When all ready, the strip may collapse or remain subtle.

When broken, it must be visible enough to diagnose the failure.

### 7. Debug Snapshot

Expose:

```js
_wos.debug.studio.mapSurface()
```

Expected shape:

```js
{
  enabled: true,
  mode: 'map',
  mapMounted: true,
  toolbarMounted: true,
  viewOptionsButtonMounted: true,
  viewOptionsPanelMounted: false,
  mapboxAvailable: true,
  mapboxMapReady: true,
  styleLoaded: true,
  buildingSelectionReady: true,
  buildingSelectionActive: false,
  actorRenderLayerReady: true,
  selectedBuilding: null,
  lastError: null
}
```

## Recovery Behavior

If Mapbox is unavailable:

```txt
Show toolbar.
Show visible map unavailable fallback.
Expose mapboxAvailable: false.
Do not crash Studio shell.
```

If style fails:

```txt
Show toolbar.
Show visible style failure banner.
Keep building selection unavailable unless layers exist.
Expose styleLoaded: false and lastError.
```

If BuildingSelectionController is unavailable:

```txt
Show View Options.
Disable Select target: Buildings.
Show reason: building selection unavailable.
```

If ActorObjectRenderLayer is unavailable:

```txt
Show View Options.
Keep building selection usable if possible.
Expose actorRenderLayerReady: false.
0618D may still fail later with no_preview_object3d.
```

## Acceptance Criteria

### AC1 — Toolbar Visible

Open:

```txt
/studio/index.html#map
```

Expected:

```txt
#tdcv-toolbar is visible at the top of the Map stage.
```

### AC2 — View Options Visible

Click:

```txt
View Options ▼
```

Expected:

```txt
#tdcv-viewopt-panel appears below toolbar, above map canvas.
```

### AC3 — Building Selection Visible

Expected View Options contains:

```txt
Select target: Buildings
```

### AC4 — Building Selection Activates

Click:

```txt
Buildings
```

Expected:

```txt
button active state changes
map cursor/selection mode activates
```

### AC5 — Building Inspector Opens

Click a building.

Expected:

```txt
Inspector context changes from Asset/Actor to Building Replacement.
```

### AC6 — 0618D Entry Point Reachable

Selected-building inspector shows:

```txt
Apply Test Texture
Clear Proof
```

### AC7 — 0618D Smoke Test Can Run

Click:

```txt
Apply Test Texture
```

Expected one of:

```txt
Texture Proof: APPLIED
Texture Proof: FALLBACK — <truthful reason>
Texture Proof: MISSING — <truthful reason>
```

No silent failure.

### AC8 — Debug Snapshot Works

Console:

```js
_wos.debug.studio.mapSurface()
```

Expected:

```txt
returns mounted/ready state object, not undefined.
```

## Manual Smoke Test

```txt
1. Load Studio.
2. Open Map tab.
3. Confirm toolbar exists.
4. Click View Options.
5. Confirm Select target → Buildings exists.
6. Activate Buildings.
7. Click building.
8. Confirm Building inspector appears.
9. Click Apply Test Texture.
10. Confirm 0618D returns APPLIED/FALLBACK/MISSING visibly.
```

## Closure Rule

0619E may close only when:

```txt
Map toolbar is visible.
View Options opens.
Building selection is reachable.
Selected-building inspector appears after building click.
Apply Test Texture button is reachable.
```

0618D may close only after 0619E makes this path testable and the checker proof visibly applies.

## Non-Goals

- Do not redesign Studio layout.
- Do not rename Map/Canvas/Library/Broadcast.
- Do not add new texture systems.
- Do not change publish governance.
- Do not modify Wall runtime.
- Do not hide errors behind debug-only commands.

## Final Build Instruction

```txt
Recover the Map authoring surface first.
Do not continue texture work until the 0618D visible proof can be tested from the UI.
```
