# 0610H_WOS_ReplacementSingleVisualAuthority_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Establish one visual authority for replacement buildings in Studio Map Lab.

Current issue:

```txt
Studio Author cue
+
Studio Preview replacement
+
Original Mapbox building
```

can all appear to occupy the same space.

This creates confusion because the user cannot tell which object is:

```txt
editable cue
preview output
original source building
final Wall replacement
```

0610H separates these states cleanly.

---

## Core Rule

Only one replacement visual system may be active at a time.

```txt
Author Mode  = edit overlays only
Preview Mode = final replacement output only
```

Never both.

---

## Current Problem

The uploaded code shows three active visual systems:

### 1. Author cue

`mapLabView.js` calls:

```js
adapter.applyRegistryEdits(registry.getAll())
```

after replacement changes.

This projects author colors / cues into Studio Map Lab.

### 2. Preview layer

`buildingPreviewRuntime.js` creates:

```txt
wos-preview-replacements
wos-preview-layer
```

and renders replacement actors.

### 3. Original Mapbox building

Original building layers remain visible unless Preview mode suppresses them.

Result:

```txt
old cue
new preview actor
original building
```

can overlap.

---

## Goal

Create a single mode authority:

```txt
Author mode:
  - original building visible
  - author cue visible
  - preview actor hidden
  - preview suppression disabled

Preview mode:
  - original building suppressed
  - author cue hidden
  - preview actor visible
  - final material/geometry shown
```

---

## Scope

### In Scope

- Add explicit visual authority state to Map Lab.
- Prevent author cue projection while Preview mode is active.
- Clear author cue projection when switching to Preview mode.
- Restore author cue projection when switching back to Author mode.
- Ensure Preview mode renders only preview replacement actors.
- Ensure Preview mode suppresses original Mapbox building.
- Ensure Author mode clears preview actor layer and restores original Mapbox building opacity.
- Add debug status for active visual authority.

### Out of Scope

- No new archetypes.
- No geometry redesign.
- No material palette redesign.
- No Wall runtime behavior changes unless required for shared authority.
- No Canvas changes.
- No Glyph changes.
- No new manifest schema fields.
- No localStorage mode persistence.

---

## Files

### Modify

```txt
studio/mapLab/mapLabView.js
studio/mapLab/buildingPreviewRuntime.js
studio/mapLab/mapboxAdapter.js
```

### Possibly Modify

```txt
wall/systems/runtime/buildingStyleKit.js
wall/systems/runtime/buildingReplacementRuntime.js
```

Only if exposing shared material/style authority is needed.

### Do Not Modify

```txt
studio/index.html
studio/styles.css
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapInspector.js
wall/systems/presentation/buildingEditProjectionRuntime.js
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

unless absolutely required.

---

## Required Authority Model

Add a single internal state:

```js
_visualMode = "author" | "preview"
```

Authority table:

| Mode | Author Cue | Preview Layer | Original Building | Selection UI |
|---|---:|---:|---:|---:|
| author | visible | hidden | visible | visible |
| preview | hidden | visible | suppressed | optional/hidden |

---

## Required Public Debug API

Add:

```js
window.WOSMapLab.visualAuthorityStatus()
```

Returns:

```js
{
  mode: "author",
  authorCueActive: true,
  previewLayerActive: false,
  originalSuppressed: false,
  replacementCount: 2,
  lastModeChangeAt: 1710000000000,
  lastError: null
}
```

---

## Author Cue Rules

### In Author mode

`adapter.applyRegistryEdits(registry.getAll())` may run.

Author cue remains useful for selecting/editing.

### In Preview mode

`adapter.applyRegistryEdits(registry.getAll())` must not run.

If registry changes while Preview is active:

```txt
refresh preview actor only
do not re-apply author cue
```

Add a guard:

```js
if (_visualMode === "preview") {
  preview.refresh();
} else {
  adapter.applyRegistryEdits(registry.getAll());
}
```

---

## Preview Entry Behavior

When switching Author → Preview:

1. Clear author cue projection.
2. Clear hover/selection color projection if needed.
3. Suppress original Mapbox source building.
4. Push preview replacement actor GeoJSON.
5. Move preview layer above building layers.
6. Set mode buttons correctly.

Pseudo:

```js
function enterPreviewMode() {
  adapter.clearRegistryProjection();
  preview.setMode("preview");
}
```

If `clearRegistryProjection()` does not exist, add it to `mapboxAdapter.js`.

---

## Preview Exit Behavior

When switching Preview → Author:

1. Clear preview actor layer data.
2. Restore original Mapbox building opacity.
3. Restore author cue projection from registry.
4. Restore selection/hover behavior.
5. Set mode buttons correctly.

Pseudo:

```js
function enterAuthorMode() {
  preview.setMode("author");
  adapter.applyRegistryEdits(registry.getAll());
}
```

---

## Required Adapter Additions

Add to `mapboxAdapter.js`:

```js
clearRegistryProjection()
```

Purpose:

```txt
remove Studio author cue paint without clearing localStorage
```

It should restore or reset:

```txt
selection color matches
replacement cue colors
hidden cue opacity
hover state if needed
```

It must not clear:

```txt
BuildingEditRegistry
current selected object
manifest data
```

---

## Preview Runtime Corrections

`buildingPreviewRuntime.js` currently duplicates constants from Wall runtime.

This is acceptable as a temporary implementation, but 0610H must reduce drift risk.

Required:

```txt
Prefer SBE.BuildingStyleKit.getParts() for geometry.
Expose/call a shared material resolver if available.
If no shared resolver exists, isolate duplicated material table behind one function and document as parity copy.
```

Do not spread copied material constants into multiple places.

---

## Registry Change Behavior

When selected building changes:

### Author mode

```txt
selection works normally
author cue updates
inspector updates
```

### Preview mode

```txt
inspector can still update
preview layer refreshes
author cue does not reappear
```

---

## Selection Behavior

Preview mode may keep the selected inspector active, but selection visuals must not dominate.

Allowed:

```txt
small outline
inspector selection data
```

Not allowed:

```txt
large colored source-building cue
duplicated source + preview
```

---

## Error Handling

Required try/catch around:

```txt
mode switch
clearRegistryProjection
preview refresh
suppression restore
author cue restore
map.setPaintProperty
map.getPaintProperty
map.getStyle
```

If mode switch partially fails:

```txt
record lastError
do not crash
return visualAuthorityStatus()
```

---

## Acceptance Tests

### T1 — Author Mode Has Only Author Cue

Expected:

```txt
original building visible
author cue visible
preview layer empty/hidden
```

---

### T2 — Preview Mode Has Only Preview Replacement

Expected:

```txt
original building suppressed
author cue hidden
preview actor visible
```

---

### T3 — No Triple Overlay

Expected:

```txt
old cue + new preview + original never appear together
```

---

### T4 — Registry Change In Preview Does Not Reapply Author Cue

Change archetype, scale, height mode while Preview is active.

Expected:

```txt
preview actor updates
author cue does not return
```

---

### T5 — Return To Author Restores Editing Cue

Switch Preview → Author.

Expected:

```txt
preview actor clears
original building restored
author cue returns
```

---

### T6 — Wall Output Unchanged

Expected:

```txt
Wall replacement runtime behavior unchanged
```

---

### T7 — Manifest Unchanged

Expected:

```txt
no new manifest fields
existing saved edits remain valid
```

---

### T8 — Cross-Tab Sync Unchanged

Expected:

```txt
Studio edits still update Wall through existing localStorage path
```

---

### T9 — Debug Status Accurate

Run:

```js
window.WOSMapLab.visualAuthorityStatus()
```

Expected fields:

```txt
mode
authorCueActive
previewLayerActive
originalSuppressed
replacementCount
lastModeChangeAt
lastError
```

---

### T10 — No Canvas/Glyph Changes

Expected:

```txt
no Canvas/Glyph files modified
```

---

## Required Report

Claude/Codex must report:

```txt
files changed
authority mode implementation
adapter clearRegistryProjection behavior
preview enter/exit behavior
registry-change behavior by mode
debug API output
acceptance test results
```

---

## Success Criteria

Studio Map Lab has one clean visual truth at a time.

The user should never see:

```txt
original source building
+
old author cue
+
new preview replacement
```

all competing in the same footprint.

The final result should be:

```txt
Author = editable cue
Preview = Wall-like output
```

---

## Implementation Guide

- **Where:** Update `studio/mapLab/mapLabView.js`, `studio/mapLab/buildingPreviewRuntime.js`, and `studio/mapLab/mapboxAdapter.js`.
- **What:** Add a visual authority state that gates author cue projection versus preview replacement rendering.
- **Expect:** Switching Author/Preview cleanly swaps visual systems without localStorage or Wall runtime changes.
