# 0429_WOS_GroupSelection_InspectorUndoPatch_v1.0.0

We are fixing the remaining group/selection/inspector/undo issues.

## Current confirmed status

PASS:

- Shift + Mop straight lines works
- Select All + temporary multi-select move works
- Group transform works
- Group duplicate chain now works
- Group duplicate via UI works

FAIL:

- Group creation does not instantly enter true group selection state
- Group inspector is missing useful controls
- Group style propagation fails for color / width / visibility
- Mixed group + stroke selection creates broken states
- Ungroup does not exist
- Undo after grouping creates stale/unmovable ghost segments

---

# 1. Group creation must immediately select the group

After `createGroup(ids)` creates the group, it must clear stroke selection and set group selection.

Patch inside `createGroup()` after group is stored:

```js
state.selection.groupId = group.id;
state.selection.strokeId = null;
state.selection.strokeIds.clear();
state.multiSelection = [{ type: "group", id: group.id }];

syncLegacySelection();
syncSelectionPanel();
renderFrame();
```

Validation:

- Select 3 strokes → group
- Immediately shows group bounding box
- Inspector is in group mode
- Clicking/moving uses group, not individual stroke

---

# 2. Enforce selection priority

Never allow hybrid group + stroke selection.

Add helper:

```js
function selectGroupOnly(groupId) {
  state.selection.groupId = groupId;
  state.selection.strokeId = null;
  state.selection.strokeIds.clear();
  state.multiSelection = [{ type: "group", id: groupId }];

  syncLegacySelection();
  syncSelectionPanel();
  renderFrame();
}
```

Add helper:

```js
function selectStrokesOnly(ids) {
  state.selection.groupId = null;
  state.selection.strokeId = ids.length === 1 ? ids[0] : null;
  state.selection.strokeIds = new Set(ids);
  state.multiSelection = ids.map((id) => ({ type: "stroke", id }));

  syncLegacySelection();
  syncSelectionPanel();
  renderFrame();
}
```

Rules:

- Selecting a group clears all stroke selection.
- Shift-selecting a stroke while group is selected should either:
  - replace group with that stroke selection, OR
  - do nothing.

- Do NOT allow group + stroke hybrid state.

Recommended behavior:

```js
if (state.selection.groupId && hit.type === "stroke") {
  selectStrokesOnly([hit.id]);
  return;
}
```

---

# 3. Group inspector must show group-safe controls

In `controls.js`, group case should show only safe shared controls:

```js
case "group":
  return {
    mode: "group",
    show: {
      outline: true,
      behavior: false,
      mechanic: false,
      motion: false,
      emitter: false,
      text: false,
      behaviorPanel: false,
      groupPanel: true
    }
  };
```

If `groupPanel` is not currently rendered anywhere, do not build a big panel yet. Minimum acceptable:

- Outline section visible
- color visible
- stroke width visible
- visibility toggle visible
- no legacy motion / behavior / emitter panels

---

# 4. Fix group style propagation

Upgrade `applyStyleToSelection(style)` so it resolves every actual stroke target.

```js
function getSelectedStrokeTargets() {
  if (state.selection.groupId) {
    return getGroupChildrenDeep(state.selection.groupId)
      .map(getStrokeById)
      .filter(Boolean);
  }

  if (state.selection.strokeIds && state.selection.strokeIds.size > 0) {
    return Array.from(state.selection.strokeIds)
      .map(getStrokeById)
      .filter(Boolean);
  }

  if (state.selection.strokeId) {
    var s = getStrokeById(state.selection.strokeId);
    return s ? [s] : [];
  }

  return [];
}
```

Then:

```js
function applyStyleToSelection(style) {
  var targets = getSelectedStrokeTargets();

  targets.forEach(function (s) {
    Object.assign(s, style);
    applyStrokeUpdates(s);
  });

  renderFrame();
}
```

Use `applyStyleToSelection()` for:

- outline color
- stroke width
- visibility toggle

Validation:

- Select group → change color → all children update
- Select group → change width → all children update
- Select group → visibility toggle → all children hide/show

---

# 5. Ensure stroke width controls stay visible for group/multi-select

The inspector currently hides stroke width when there is no single `target`.

Patch visibility logic:

```js
var hasStrokeTargets = getSelectedStrokeTargets().length > 0;
```

Use this instead of only checking `target.type === "stroke"`.

Validation:

- Select group → width slider visible
- Select multi-strokes → width slider visible
- Select single stroke → width slider visible

---

# 6. Add Ungroup

Add function:

```js
function ungroupSelected() {
  var groupId = state.selection.groupId;
  if (!groupId || !state.groups[groupId]) return;

  var childIds = getGroupChildrenDeep(groupId);

  delete state.groups[groupId];

  selectStrokesOnly(childIds);
  renderFrame();
}
```

Add shortcut:

```js
if (
  (event.metaKey || event.ctrlKey) &&
  event.shiftKey &&
  event.key.toLowerCase() === "g"
) {
  event.preventDefault();
  ungroupSelected();
  return;
}
```

Optional UI button can wait.

Validation:

- Select group → Cmd+Shift+G
- Group removed
- Children remain selected as multi-select
- Move works as temporary group

---

# 7. Fix undo stale segment / ghost geometry

Undo currently restores state but leaves derived geometry/proxies/caches stale.

Add centralized rebuild helper:

```js
function rebuildDerivedState() {
  state.lines = [];

  state.strokes.forEach(function (s) {
    strokeToLines(s);
  });

  state.walkers.forEach(function (w) {
    if (w.strokeId && w.path && w.path.type === "stroke") {
      var stroke = getStrokeById(w.strokeId);
      if (stroke) {
        w.path.points = stroke.points;
        w.path.closed = isStrokeClosed(stroke);
      }
    }
  });

  renderFrame();
}
```

Then call after undo/redo restore:

```js
rebuildDerivedState();
syncLegacySelection();
syncSelectionPanel();
renderFrame();
```

If undo restores groups too, ensure `state.groups` is restored before `rebuildDerivedState()`.

Validation:

- Create group
- Undo
- Move resulting object/stroke
- No stale unmovable duplicate segments remain

---

# 8. Rebuild after load/open too

After loading a scene:

```js
rebuildDerivedState();
syncLegacySelection();
syncSelectionPanel();
renderFrame();
```

Validation:

- Save scene with groups/walkers
- Reload/open
- Move/group/duplicate still works

---

# Final test list

1. Group creation instantly selects group.
2. Group color applies to all child strokes.
3. Group width applies to all child strokes.
4. Group visibility applies to all child strokes.
5. Multi-select still moves without grouping.
6. Cmd+Shift+G ungroups selected group.
7. Undo after group creation does not leave ghost/unmovable segments.
8. Group duplicate still chains with offset.
9. No legacy Motion panel appears for groups.

Implementation Guide:

- `main.js`: selection helpers, style target resolver, ungroup, undo rebuild
- `controls.js`: group inspector case + stroke controls visibility
- no redesign; keep patch surgical
