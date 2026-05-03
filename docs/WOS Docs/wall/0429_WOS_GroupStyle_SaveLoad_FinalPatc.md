# 0429_WOS_GroupStyle_SaveLoad_FinalPatch_v1.2.0

Current failures:

1. Group selected → changing color only affects one child stroke.
2. Multi-select bounding box appears, but rotate/scale handles still belong to one stroke only.
3. Save → load imports nothing.
4. Saved color/style/visibility is not preserved.

Root causes likely:

- Group selection still leaves `state.selection.strokeId` or single-stroke handles active.
- `selectObject("stroke", hit.id)` is being called even when a stroke belongs to a group.
- Save path relies on `SBE.SceneManager.downloadScene(state)` and likely drops `strokes/groups/walkers`.

Do not redesign. Patch selection routing and scene export.

---

## 1. Fix group hit selection leak

In `onMopDown`, find the normal click block where:

```js
var grp = getGroupForStroke(hit);
state.selection.strokeIds.clear();

if (grp) {
  state.selection.groupId = grp.id;
  state.selection.strokeId = null;
} else {
  state.selection.strokeId = hit.id;
  state.selection.strokeIds.add(hit.id);
  state.selection.groupId = null;
}

state.transform.active = true;
state.transform.start = rawPt;
state.transform.targetId = hit.id;
selectObject("stroke", hit.id);
...
```

Replace the group branch with a hard group-only path:

```js
var grp = getGroupForStroke(hit);

if (grp) {
  selectGroupOnly(grp.id);

  state.transform.active = true;
  state.transform.type = "move";
  state.transform.start = rawPt;
  state.transform.targetId = grp.id;

  canvas.setPointerCapture(e.pointerId);
  e.stopPropagation();
  renderFrame();
  return;
}
```

Then keep the non-group stroke path separate:

```js
selectStrokesOnly([hit.id]);

state.transform.active = true;
state.transform.type = "move";
state.transform.start = rawPt;
state.transform.targetId = hit.id;

canvas.setPointerCapture(e.pointerId);
e.stopPropagation();
renderFrame();
return;
```

Important:

- Do NOT call `selectObject("stroke", hit.id)` when selecting a group.
- Group selection must leave:
  - `state.selection.groupId = grp.id`
  - `state.selection.strokeId = null`
  - `state.selection.strokeIds.size === 0`

---

## 2. Prevent single-stroke handles during group or multi-select

In `renderStrokes`, single-stroke handles currently draw whenever `state.selection.strokeId` exists.

Patch:

```js
var shouldDrawSingleStrokeHandles =
  state.selection.strokeId &&
  !state.selection.groupId &&
  (!state.selection.strokeIds || state.selection.strokeIds.size <= 1);
```

Then replace:

```js
if (selId) {
```

with:

```js
if (shouldDrawSingleStrokeHandles) {
```

Expected:

- Group selected → only teal group bounding box and group handles.
- Multi-select selected → only multi-select bounding box.
- Single stroke selected → single stroke handles.

---

## 3. Make multi-select rotate/scale act like temporary group

Current multi-select move works, but rotate/scale still targets one stroke.

In handle hit-test, add multi-select handle support before single-stroke handles.

If:

```js
state.selection.strokeIds.size > 1 && !state.selection.groupId;
```

compute bounds with `computeStrokeSetBounds(Array.from(state.selection.strokeIds))`.

Draw handles already exists for multi-select box; if handles do not exist yet, add them using same group handle logic but target type `"multi"`:

```js
state.transform.active = true;
state.transform.type = gh.type;
state.transform.start = rawPt;
state.transform.targetId = "__multi__";
state.transform.origin = gh.type === "rotate" ? multiPivot : gh.anchor;
```

Then in pointermove transform block:

```js
if (state.transform.targetId === "__multi__") {
  var ids = Array.from(state.selection.strokeIds || []);
  if (state.transform.type === "move") {
    ids.forEach((id) => {
      var s = getStrokeById(id);
      if (s) moveStroke(s, dx, dy);
    });
  }

  if (state.transform.type === "scale") {
    ids.forEach((id) => {
      var s = getStrokeById(id);
      if (s) scaleStroke(s, state.transform.origin, factor);
    });
  }

  if (state.transform.type === "rotate") {
    ids.forEach((id) => {
      var s = getStrokeById(id);
      if (s)
        rotateStroke(
          s,
          state.transform.origin.x,
          state.transform.origin.y,
          dAngle,
        );
    });
  }

  renderFrame();
  return;
}
```

Expected:

- Shift-select 3 strokes → one temp bounding box.
- Drag corner → all scale.
- Drag rotate handle → all rotate.
- No persistent group is created.

---

## 4. Fix group color propagation after selection leak fix

After patch #1, group color may already work. Still confirm the handler uses full targets:

```js
elements.lineColor.addEventListener("input", function syncDisplayColor() {
  var color = elements.lineColor.value;
  var targets = getSelectedStrokeTargets();

  if (targets.length > 0) {
    targets.forEach(function (s) {
      s.color = color;
      applyStrokeUpdates(s);
    });
    renderFrame();
    return;
  }

  state.defaults.color = color;
});
```

Validation:

- Create group of 3 different strokes.
- Select group.
- Change outline color.
- All 3 strokes change.

---

## 5. Fix save/export: build explicit WOS scene object

Current save likely drops the new stroke layer. Replace save handler with explicit scene object.

Find:

```js
elements.saveScene.addEventListener("click", function saveScene() {
  var saveState = Object.assign({}, state, {
    lines: ...
  });
  SBE.SceneManager.downloadScene(saveState, "sbe-scene");
});
```

Replace with:

```js
elements.saveScene.addEventListener("click", function saveScene() {
  var scene = {
    version: "wos-scene-v2",

    canvas: clone(state.canvas),
    swarm: clone(state.swarm),
    balls: clone(state.balls || []),
    shapes: clone(state.shapes || []),
    textObjects: clone(state.textObjects || []),
    background: state.backgroundDataUrl || null,

    // Legacy non-derived lines only
    lines: clone(
      (state.lines || []).filter(function (l) {
        return !isDerivedStrokeLine(l);
      }),
    ),

    // WOS object layer
    strokes: clone(state.strokes || []),
    groups: clone(state.groups || {}),
    walkers: clone(state.walkers || []),
  };

  SBE.SceneManager.downloadScene(scene, "wos-scene");
});
```

If `clone()` is unavailable in this scope, use:

```js
JSON.parse(JSON.stringify(value));
```

Expected:

- Save file contains `"strokes"`.
- Save file contains `"groups"`.
- Save file contains `"walkers"`.

---

## 6. Fix load/applyScene defensively

In `applyScene(scene)`, after restoring:

```js
state.strokes = Array.isArray(scene.strokes) ? scene.strokes : [];
state.groups =
  scene.groups &&
  typeof scene.groups === "object" &&
  !Array.isArray(scene.groups)
    ? scene.groups
    : {};
state.walkers = Array.isArray(scene.walkers) ? scene.walkers : [];
```

Then call:

```js
rebuildDerivedState();
clearSelection();
syncLegacySelection();
syncSelectionPanel();
renderFrame();
```

Important:

- If `scene.strokes` exists, it must render even if `scene.lines` is empty.
- Do not rely on derived `lines` to display mop strokes.

---

## 7. Add quick save debug log

Inside save handler, before download:

```js
console.log("[save]", {
  strokes: scene.strokes.length,
  groups: Object.keys(scene.groups || {}).length,
  walkers: scene.walkers.length,
  lines: scene.lines.length,
});
```

Inside applyScene after restore:

```js
console.log("[load]", {
  strokes: state.strokes.length,
  groups: Object.keys(state.groups || {}).length,
  walkers: state.walkers.length,
  lines: state.lines.length,
});
```

This confirms whether save/load is data failure or render failure.

---

# Final validation

1. Draw 3 strokes → group → change color.
   Expected: all 3 change.

2. Group selected.
   Expected: no single-stroke white handles. Only group teal handles.

3. Shift-select 3 strokes.
   Expected: one temp bbox. Rotate/scale applies to all.

4. Save 3 strokes.
   Expected console: `[save] strokes: 3`.

5. Load file.
   Expected console: `[load] strokes: 3`, strokes appear.

6. Save group with colors/width/visibility.
   Load.
   Expected: exact visual state restored.

Implementation Guide:

- `main.js`: group selection routing, single-handle guard, temp multi transform, explicit scene export
- `controls.js`: no change unless inspector state regresses
- Keep patch surgical; do not rebuild UI
