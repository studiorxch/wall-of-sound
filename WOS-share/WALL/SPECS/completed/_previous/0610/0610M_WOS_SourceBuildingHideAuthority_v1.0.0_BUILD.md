# 0610M_WOS_SourceBuildingHideAuthority_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Add a clear way to hide original Mapbox source buildings that were not created by WOS.

Current issue:

```txt
Delete Selected
```

only removes authored WOS records:

```txt
compound
group
standalone replacement/edit
```

It does **not** hide an untouched Mapbox source building, because Mapbox vector-tile source data cannot be deleted locally.

This spec adds explicit source-building suppression:

```txt
Hide Source Building
→ create registry edit { hidden: true }
→ suppress original building in Studio Preview + Wall
```

---

## Core Rule

WOS cannot delete Mapbox source geometry.

WOS can only:

```txt
hide/suppress source feature visually
restore source feature visually
delete authored WOS edits
```

These actions must be separated in the UI and code.

---

## Current Problem

The current `Delete Selected` button is hierarchy-aware, but registry-only:

```txt
compound → delete compound record
group → delete group record
building edit → delete building edit
untouched source building → not_found
```

That is correct technically, but confusing in practice.

The user expects:

```txt
select existing building
delete/hide it
```

But the current function only deletes WOS-authored metadata.

---

## Required UI Language

Replace ambiguous wording.

### Current

```txt
Reset Building
Delete Selected
```

### New

```txt
Reset Edit
Delete Authored Edit
Hide Source Building
Restore Source Building
```

Behavior:

| Button | Meaning |
|---|---|
| Reset Edit | Remove color/notes/tags/replacement metadata for this building only |
| Delete Authored Edit | Delete active compound/group/replacement/edit record |
| Hide Source Building | Create or update registry entry with `hidden: true` |
| Restore Source Building | Remove `hidden: true`; keep other edit metadata unless user resets/deletes |

---

## Scope

### In Scope

- Add source-building hide/restore controls.
- Persist `hidden: true` for untouched source buildings.
- Make hidden source buildings suppress in Studio Preview.
- Make hidden source buildings suppress on Wall.
- Rename delete/reset UI for clarity.
- Preserve existing delete-authored behavior.
- Add debug/status output.

### Out of Scope

- No actual Mapbox source deletion.
- No geometry mutation.
- No new replacement archetypes.
- No material changes.
- No Canvas changes.
- No Glyph changes.
- No compound/group redesign.

---

## Files

### Primary Modify

```txt
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapInspector.js
studio/mapLab/mapLabView.js
studio/mapLab/buildingPreviewRuntime.js
wall/systems/presentation/buildingEditProjectionRuntime.js
```

### Likely No Change

```txt
wall/systems/runtime/buildingReplacementRuntime.js
```

unless its debug/status needs awareness of source-hidden records.

### Do Not Modify

```txt
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

---

## Registry Requirements

Add explicit helper functions:

```js
hideSourceBuilding(buildingKey)
restoreSourceBuilding(buildingKey)
isSourceHidden(buildingKey)
getHiddenKeys()
```

### `hideSourceBuilding(buildingKey)`

Must:

```txt
create registry entry if missing
set hidden: true
preserve existing color/notes/tags/replacement/geometry
save manifest
```

Returns:

```js
{ ok: true, key, hidden: true }
```

or:

```js
{ ok: false, reason }
```

### `restoreSourceBuilding(buildingKey)`

Must:

```txt
set hidden: false
preserve other authored metadata
auto-clean entry only if now empty and no geometry/replacement/color/notes/tags remain
save manifest
```

Returns:

```js
{ ok: true, key, hidden: false }
```

### `isSourceHidden(buildingKey)`

Returns boolean.

---

## Important Distinction

Do not route `Hide Source Building` through `deleteSelectedTarget()`.

These are separate actions:

```txt
deleteSelectedTarget()
→ delete authored WOS record

hideSourceBuilding()
→ suppress source Mapbox building
```

---

## Map Inspector UI

In the Edit section:

```txt
Color
Hidden [checkbox]
Notes
Tags

[Reset Edit]
[Delete Authored Edit]
[Hide Source Building] OR [Restore Source Building]
```

Recommended label logic:

```txt
if hidden === true:
  show [Restore Source Building]
else:
  show [Hide Source Building]
```

Button colors:

```txt
Reset Edit              = muted red / low danger
Delete Authored Edit    = strong red / destructive
Hide Source Building    = amber / visibility suppression
Restore Source Building = teal / recovery
```

Tooltip copy:

```txt
Delete Authored Edit:
"Deletes WOS-authored replacement/group/compound data. Does not delete Mapbox source geometry."

Hide Source Building:
"Suppresses the original Mapbox source building by creating a hidden edit record."

Restore Source Building:
"Restores the original Mapbox source building by removing the hidden flag."
```

---

## MapLabView Requirements

Add callbacks:

```js
_onHideSourceBuilding()
_onRestoreSourceBuilding()
```

Wire into inspector as:

```js
onHideSourceBuilding
onRestoreSourceBuilding
```

Behavior after hide/restore:

```txt
persist registry update
refresh Studio Preview if preview mode
otherwise re-apply author registry cues
re-render inspector for current selection
update status bar
```

Do not clear selection after hide/restore.

---

## Preview Runtime Requirements

Studio Preview already suppresses:

```txt
replacement.enabled
hidden === true
```

Verify and patch if needed.

Required:

```txt
hidden-only edits suppress original buildings
hidden-only edits do not spawn replacement actors
hidden + replacement.enabled suppresses original and shows replacement
```

---

## Wall Projection Runtime Requirements

Wall projection must suppress hidden-only entries.

Required behavior:

```txt
edit.hidden === true
→ source building suppressed
→ no replacement actor spawned unless replacement.enabled
```

Existing replacement suppression should remain unchanged.

---

## Author Mode Behavior

Author mode should remain useful for editing.

Recommended:

```txt
hidden source building may still show an author cue/selection highlight in Studio
```

But Preview mode and Wall must show the hidden result.

This prevents losing the ability to select/restore a hidden source while authoring.

---

## Debug APIs

### Studio

Add:

```js
window.WOSMapLab.sourceHideStatus()
```

Returns:

```js
{
  hiddenSourceCount: 3,
  selectedHidden: true,
  lastAction: "hide",
  lastError: null
}
```

### Registry

```js
BuildingEditRegistry.getHiddenKeys()
```

Returns:

```js
["composite:building:123", "composite:building:456"]
```

### Wall

Extend existing:

```js
_wos.debug.buildingEdits.status()
```

with:

```js
hiddenOnlyCount
sourceHiddenCount
```

---

## Manifest Example

Before:

```json
{
  "version": "1.0.0",
  "buildings": {}
}
```

After hiding one untouched source building:

```json
{
  "version": "1.0.0",
  "buildings": {
    "composite:building:992329309": {
      "color": null,
      "hidden": true,
      "tags": [],
      "notes": "",
      "replacement": null,
      "geometry": {
        "centroid": { "lng": -74.013919, "lat": 40.701039 }
      }
    }
  }
}
```

---

## Acceptance Tests

### T1 — Hide Untouched Source Building

Select a Mapbox building with no authored edit.

Click:

```txt
Hide Source Building
```

Expected:

```txt
registry entry created
hidden: true
```

### T2 — Preview Suppresses Hidden Building

Switch to Preview.

Expected:

```txt
source building is visually suppressed
no replacement actor appears
```

### T3 — Wall Suppresses Hidden Building

Open/refresh Wall.

Expected:

```txt
same source building is visually suppressed
```

### T4 — Restore Source Building

Click:

```txt
Restore Source Building
```

Expected:

```txt
hidden: false
building visible again in Preview and Wall
```

### T5 — Delete Authored Edit Does Not Hide Untouched Source

Select untouched source building.

Click:

```txt
Delete Authored Edit
```

Expected:

```txt
no crash
returns not_found or no authored record
source building remains visible
```

### T6 — Hidden + Replacement

Hide building, then enable replacement.

Expected:

```txt
original suppressed
replacement actor visible
```

### T7 — Hidden-Only Does Not Spawn Actor

Expected:

```txt
replacement actor count unchanged
```

### T8 — Existing Delete Authority Preserved

For compound/group/replacement records:

```txt
Delete Authored Edit
```

still removes the active authored record.

### T9 — Cross-Tab Sync

Hide in Studio.

Expected:

```txt
Wall updates through localStorage storage event
```

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
UI labels changed
registry hide/restore API added
source hidden manifest shape
Studio Preview hidden behavior
Wall hidden behavior
delete authored behavior preserved
debug API output
acceptance test results
```

---

## Success Criteria

The user can select an existing Mapbox building that was not created by WOS and hide it visually.

The UI must make this distinction clear:

```txt
Delete Authored Edit
≠
Hide Source Building
```

Expected result:

```txt
select existing source building
→ Hide Source Building
→ original disappears in Preview and Wall
→ Restore Source Building brings it back
```

---

## Implementation Guide

- **Where:** Add hide/restore helpers in `studio/mapLab/buildingEditRegistry.js`; add buttons/callbacks in `mapInspector.js` and `mapLabView.js`; ensure hidden-only suppression in `buildingPreviewRuntime.js` and `buildingEditProjectionRuntime.js`.
- **What:** Rename destructive controls, create `hidden: true` records for untouched Mapbox buildings, and suppress those records in Preview/Wall without spawning replacement actors.
- **Expect:** Existing source buildings can be hidden/restored visually, while authored WOS edits can still be deleted separately.
