# 0609U_WOS_BuildingReplacementProjection_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Extend the Studio Map Lab → Wall projection pipeline from building color edits into **building replacement intent**.

This build does **not** perform final mesh replacement. It creates the first safe projection layer for marking buildings as future replacement targets.

Current:

```txt
Studio Map Lab → color building → persist edit
Wall → read manifest → project color
```

New:

```txt
Studio Map Lab → assign replacement archetype → persist edit
Wall → read manifest → project replacement cue
```

---

## Core Principle

Studio authors replacement intent.

Wall displays replacement intent.

Wall does not edit, mutate, or author replacement data.

---

## Non-Negotiable Constraint

Do **not** remove or rewrite Mapbox building geometry in this build.

No GLB insertion.

No Three.js replacement.

No terrain carving.

No Mapbox source mutation.

This is a visual-projection build only.

---

## Replacement Manifest Model

Add an optional field to each building edit:

```json
{
  "replacement": {
    "enabled": true,
    "archetype": "warehouse",
    "label": "Warehouse",
    "style": "industrial",
    "scale": 1,
    "heightMode": "inherit"
  }
}
```

This is backward compatible with the existing `wos.maplab.buildings` manifest.

---

## Supported Archetypes

Minimum supported set:

- warehouse
- skyscraper
- apartment
- radio-tower
- pagoda
- civic-block
- industrial-stack
- custom-placeholder

Invalid archetypes must normalize to:

```txt
custom-placeholder
```

---

## Studio Map Lab Requirements

### Inspector Controls

Add a Replacement section to the selected building inspector:

- Enable Replacement
- Archetype
- Style
- Scale
- Height Mode

### Height Modes

- inherit
- low
- medium
- tall
- hero

### Persistence

On any replacement field change:

```txt
registry.set(buildingKey, { replacement: ... })
```

Save immediately.

### Studio Visual Cue

Replacement-enabled buildings should receive a clear but simple visual cue inside Map Lab.

Minimum acceptable cue:

```txt
replacement-enabled building receives distinct outline or marker
```

Do not overbuild.

---

## Wall Projection Requirements

Update:

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

Wall projection must read replacement metadata and apply a non-destructive visual cue.

### Archetype Projection Colors

| Archetype | Color |
|---|---|
| warehouse | #f2a23c |
| skyscraper | #3dd8c5 |
| apartment | #a7c7e7 |
| radio-tower | #ff4b4b |
| pagoda | #d85cff |
| civic-block | #f5d76e |
| industrial-stack | #8d6e63 |
| custom-placeholder | #ffffff |

### Projection Behavior

If replacement is enabled, Wall should visually mark the building using the archetype color.

Existing simple color edits must continue working for buildings without replacement metadata.

Replacement cue may override simple color edit only when `replacement.enabled === true`.

---

## Hidden Interaction

If a building is hidden and replacement is enabled:

Preferred:

```txt
dim original building while replacement cue remains visible
```

Fallback:

```txt
hidden wins and building becomes transparent
```

Do not crash.

---

## Registry Changes

Modify:

```txt
studio/mapLab/buildingEditRegistry.js
```

Add normalization/validation for:

- replacement.enabled
- replacement.archetype
- replacement.label
- replacement.style
- replacement.scale
- replacement.heightMode

---

## Adapter Changes

Modify:

```txt
studio/mapLab/mapboxAdapter.js
```

Responsibilities:

- apply replacement cues in Studio Map Lab
- restore replacement cues after reload/style load
- preserve existing color edits
- preserve selected building highlight

---

## Inspector Changes

Modify:

```txt
studio/mapLab/mapInspector.js
```

Add Replacement section.

Add callback:

```txt
onReplacementChange
```

---

## View Changes

Modify:

```txt
studio/mapLab/mapLabView.js
```

Responsibilities:

- load saved replacement state on selection
- write replacement changes to registry
- reapply replacement cues after style load
- preserve export/import compatibility

---

## Wall Runtime Changes

Modify:

```txt
wall/systems/presentation/buildingEditProjectionRuntime.js
```

Add replacement projection behavior.

Add debug status fields:

```txt
replacementCount
replacementArchetypes
```

Example:

```json
{
  "loaded": true,
  "editCount": 4,
  "projectedColorCount": 3,
  "replacementCount": 2,
  "replacementArchetypes": {
    "warehouse": 1,
    "skyscraper": 1
  },
  "buildingLayerCount": 2,
  "layerIds": ["building", "maplab-buildings-3d"],
  "lastAppliedAt": 1710000000000,
  "lastError": null
}
```

---

## Debug API

Existing Studio methods must continue working:

```js
window.WOSMapLab.exportEdits()
window.WOSMapLab.importEdits(json)
window.WOSMapLab.clearEdits()
```

Add if low-risk:

```js
window.WOSMapLab.debugReplacements()
```

Wall debug remains:

```js
_wos.debug.buildingEdits.status()
_wos.debug.buildingEdits.reload()
_wos.debug.buildingEdits.apply()
_wos.debug.buildingEdits.clearProjection()
```

---

## Safety Rules

- Do not mutate Mapbox source data.
- Do not delete Mapbox layers.
- Do not add Wall editing UI.
- Do not add Canvas or Glyph changes.
- Do not change Wall controls.
- Do not break existing color persistence.
- Do not break 0609T projection.
- Do not require Studio to be open for Wall projection.

---

## Acceptance Tests

### T1 — Existing Color Persistence Still Works

Select building → change color → reload Studio.

Expected:

```txt
Color persists
```

### T2 — Replacement Metadata Persists

Select building → enable Replacement → choose Warehouse → reload Studio.

Expected:

```txt
Replacement enabled remains checked
Archetype remains Warehouse
```

### T3 — Export Includes Replacement

Export manifest.

Expected:

```json
"replacement": {
  "enabled": true,
  "archetype": "warehouse"
}
```

### T4 — Import Restores Replacement

Clear edits → import exported manifest.

Expected:

```txt
Replacement metadata restored
Replacement cue visible
```

### T5 — Wall Projects Replacement Cue

Create replacement in Studio → reload Wall or run:

```js
_wos.debug.buildingEdits.reload()
```

Expected:

```txt
Wall visually marks replacement-enabled building
```

### T6 — Multiple Archetypes Project

Assign different archetypes to multiple buildings.

Expected:

```txt
Wall shows distinct archetype colors
```

### T7 — Existing Color Edits Still Project

Buildings without replacement metadata still show 0609T color edits.

### T8 — Corrupt Manifest Safe

Corrupt localStorage manifest.

Expected:

```txt
Studio does not crash
Wall does not crash
Projection disabled with console warning
```

### T9 — No Wall Editing UI

Expected:

```txt
No new Wall buttons
No Wall inspector
No Wall replacement dropdown
```

### T10 — No Canvas/Glyph Changes

Expected:

```txt
No files under Canvas or Glyph changed
```

---

## Required Report

Claude/Codex must report:

- files changed
- registry schema changes
- replacement fields added
- Studio inspector controls added
- Studio replacement persistence behavior
- Wall projection behavior
- debug API output
- acceptance test results

---

## Files

### Modified

```txt
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapboxAdapter.js
studio/mapLab/mapInspector.js
studio/mapLab/mapLabView.js
wall/systems/presentation/buildingEditProjectionRuntime.js
```

### Do Not Modify

```txt
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

unless absolutely required.

---

## Success Criteria

A user can select a building in Studio Map Lab, assign it a replacement archetype, reload, and see Wall visually indicate that the building is marked for replacement.

This establishes:

```txt
building selection
→ building edit persistence
→ Wall projection
→ replacement intent
```

without attempting final 3D replacement yet.

---

## Implementation Guide

- **Where:** Add replacement fields in `studio/mapLab/buildingEditRegistry.js`; add inspector controls in `studio/mapLab/mapInspector.js`; wire persistence through `studio/mapLab/mapLabView.js`; update Wall projection logic in `wall/systems/presentation/buildingEditProjectionRuntime.js`.
- **What:** Run the existing local server, open Studio Map Lab, assign replacement archetypes to selected buildings, then reload Wall or call `_wos.debug.buildingEdits.reload()`.
- **Expect:** Studio persists replacement metadata, and Wall shows replacement-enabled buildings with archetype-specific visual cues while retaining broadcast-only separation.
