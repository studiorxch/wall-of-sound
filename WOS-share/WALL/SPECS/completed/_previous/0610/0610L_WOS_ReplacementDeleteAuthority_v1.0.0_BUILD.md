# 0610L_WOS_ReplacementDeleteAuthority_v1.0.0_BUILD

## Purpose

Add a direct **Delete / Remove** action for selected MapLab building targets so Studio can cleanly remove replacement edits without needing to understand the full compound/group/standalone hierarchy.

This is an authoring-safety pass. It does not delete Mapbox source data. It only removes WOS-authored replacement/edit records from `localStorage['wos.maplab.buildings']` and refreshes Studio + Wall projection runtimes.

## Problem

Current controls expose several overlapping concepts:

- Reset Building
- Ungroup
- Ungroup Compound
- replacement enable/disable
- hidden/source suppression
- preview mode vs author mode

The user needs one simpler operation:

> Select the thing I am looking at, then delete its authored WOS replacement/edit state.

## Files To Change

| File | Required Change |
|---|---|
| `studio/mapLab/buildingEditRegistry.js` | Add hierarchy-aware deletion helpers |
| `studio/mapLab/mapInspector.js` | Add visible `Delete Selected` button |
| `studio/mapLab/mapLabView.js` | Wire delete callback and refresh visual state |
| `studio/mapLab/buildingPreviewRuntime.js` | No structural change expected; must refresh after delete |
| `wall/systems/runtime/buildingReplacementRuntime.js` | No structural change expected; storage event should despawn deleted actors |
| `wall/systems/presentation/buildingEditProjectionRuntime.js` | No structural change expected; storage event should restore suppressed source buildings |

## Definitions

### Delete Selected

Deletes the highest active authored target containing the selected feature:

```text
compound > group > standalone building edit
```

### Reset Building

Keeps existing behavior: remove only the selected standalone building edit.

### Ungroup

Keeps existing behavior: remove only group structure.

### Delete Selected vs Hidden

`hidden` means hide/suppress while preserving the author record.

`delete` means remove the author record from the manifest.

## Required Behavior

### R1 — Selection-aware delete priority

When a building is selected:

1. If selected building belongs to a compound, delete the compound.
2. Else if selected building belongs to a group, delete the group.
3. Else delete the standalone building edit.

This prevents the user from needing to know which mode owns the current object.

### R2 — Confirm destructive compound/group deletion

For groups/compounds only, use `window.confirm()` before deletion.

Copy:

```text
Delete this compound and return its parts to normal building edits?
```

```text
Delete this group and return its parts to standalone building edits?
```

Standalone building delete does not require confirmation.

### R3 — Registry helper

Add to `buildingEditRegistry.js`:

```js
function deleteSelectedTarget(buildingKey) {
  // returns { ok, type, id, removedCount, reason }
}
```

Rules:

- `type: 'compound'` when a compound was deleted
- `type: 'group'` when a group was deleted
- `type: 'building'` when a standalone edit was removed
- `type: 'none'` when there was nothing to delete
- never throws
- always saves after mutation

### R4 — UI control

In `mapInspector.js`, add a button under the Edit section:

```text
Delete Selected
```

Button style should be stronger than `Reset Building`, but still Studio-safe:

- red border
- red text
- dark transparent background
- monospace 10px

Tooltip:

```text
Delete the active replacement/group/compound authoring record. Source map data is not deleted.
```

### R5 — View wiring

In `mapLabView.js`, add callback:

```js
onDeleteSelected: function () { _onDeleteSelected(); }
```

`_onDeleteSelected()` must:

1. Get current selection.
2. Resolve building key.
3. Ask registry `deleteSelectedTarget(key)`.
4. Clear selection highlight if deletion succeeds.
5. Refresh preview if Preview mode is active.
6. Re-apply author registry edits if Author mode is active.
7. Re-render inspector empty state.
8. Update status bar.

### R6 — Cross-tab Wall behavior

No direct Wall code should be required if existing storage event listeners are correct.

After delete:

- replacement actor despawns on Wall
- source building suppression clears on Wall
- author cue clears in Studio
- preview actor clears in Studio

### R7 — Debug API

Expose:

```js
window.WOSMapLab.deleteSelectedTarget()
```

It should perform the same action as the button and return the registry result object.

## Implementation Notes

### Registry helper outline

```js
function deleteSelectedTarget(buildingKey) {
  try {
    if (!buildingKey) return { ok: false, type: 'none', reason: 'missing_key' };

    var compoundId = findCompoundByMember(buildingKey);
    if (!compoundId) {
      var groupIdForCompound = findGroupByMember(buildingKey);
      if (groupIdForCompound) compoundId = findCompoundByMember(groupIdForCompound);
    }

    if (compoundId && _data.compounds && _data.compounds[compoundId]) {
      var compoundMembers = (_data.compounds[compoundId].members || []).length;
      delete _data.compounds[compoundId];
      save();
      return { ok: true, type: 'compound', id: compoundId, removedCount: compoundMembers };
    }

    var groupId = findGroupByMember(buildingKey);
    if (groupId && _data.groups && _data.groups[groupId]) {
      var groupMembers = (_data.groups[groupId].members || []).length;
      delete _data.groups[groupId];
      save();
      return { ok: true, type: 'group', id: groupId, removedCount: groupMembers };
    }

    if (_data.buildings && _data.buildings[buildingKey]) {
      delete _data.buildings[buildingKey];
      save();
      return { ok: true, type: 'building', id: buildingKey, removedCount: 1 };
    }

    return { ok: false, type: 'none', reason: 'not_found' };
  } catch (e) {
    return { ok: false, type: 'none', reason: String(e && e.message || e) };
  }
}
```

### Inspector wiring outline

```js
if (typeof opts.onDeleteSelected === 'function') {
  var deleteBtn = _el('button', null, 'Delete Selected');
  deleteBtn.title = 'Delete the active replacement/group/compound authoring record. Source map data is not deleted.';
  deleteBtn.addEventListener('click', function () { opts.onDeleteSelected(); });
}
```

### View callback outline

```js
function _onDeleteSelected() {
  var sel = selection.getSelection();
  if (!sel) return { ok: false, reason: 'no_selection' };

  var registry = _registry();
  if (!registry) return { ok: false, reason: 'registry_missing' };

  var key = registry.buildingKey(sel);
  if (!key) return { ok: false, reason: 'missing_key' };

  var compoundState = _computeCompoundState(key);
  var groupState = _computeGroupState(key);

  if (compoundState.state === 'member') {
    if (!global.confirm('Delete this compound and return its parts to normal building edits?')) {
      return { ok: false, reason: 'cancelled' };
    }
  } else if (groupState.state === 'member') {
    if (!global.confirm('Delete this group and return its parts to standalone building edits?')) {
      return { ok: false, reason: 'cancelled' };
    }
  }

  var result = registry.deleteSelectedTarget(key);
  if (!result || !result.ok) return result;

  adapter.clearHighlight();
  adapter.clearSelectionColor();
  selection.clear();

  if (_isPreviewMode()) {
    var pr = _preview();
    if (pr && typeof pr.refresh === 'function') pr.refresh();
  } else {
    adapter.applyRegistryEdits(registry.getAll());
  }

  if (inspector) inspector.renderEmpty(INSPECTOR_ID, 'Click a building to select it.');
  _updateStatus();
  return result;
}
```

## Acceptance Tests

| ID | Test | Expected |
|---|---|---|
| T1 | Select standalone replacement → Delete Selected | Building edit removed; actor/cue disappears |
| T2 | Select group member → Delete Selected | Confirmation appears; group deleted; members revert to standalone state |
| T3 | Select compound member → Delete Selected | Confirmation appears; compound deleted; groups/buildings revert to lower authority |
| T4 | Delete in Preview mode | Preview layer refreshes immediately |
| T5 | Delete in Author mode | Author cues refresh immediately |
| T6 | Wall tab open during delete | Wall actor despawns via storage event |
| T7 | Source building data | Mapbox source data remains untouched |
| T8 | Cancel confirm | No manifest mutation |
| T9 | No selection | No crash; returns `{ ok:false }` |
| T10 | Corrupt/partial manifest | No crash; returns safe error object |

## Non-goals

- Do not permanently delete Mapbox buildings.
- Do not alter composite source data.
- Do not remove Canvas or Glyph features.
- Do not redesign group/compound workflow.

## Implementation Guide

- **Where**: Add registry helper in `studio/mapLab/buildingEditRegistry.js` near Group/Compound CRUD exports; add Inspector button in `studio/mapLab/mapInspector.js` Edit section; add `_onDeleteSelected()` and callback export in `studio/mapLab/mapLabView.js`.
- **What**: Run local server, open Studio + Wall, create standalone/group/compound replacement targets, then press `Delete Selected` in Author and Preview modes.
- **Expect**: Selected WOS-authored replacement target disappears immediately in Studio and Wall; original Mapbox building returns; no source data is deleted.
