# 0617B_WOS_StudioMapToolbarSimplificationPass_v1.0.0_BUILD

```txt
Status: [BUILD]
Build Readiness: BUILD_READY
Spec Version: v1.0.0
Date: 2026-06-17
Project: WOS Studio
Layer: Studio UX / Surface Navigation / Map Authoring
Depends On:
  - 0617A_WOS_StudioSurfaceSimplificationPass_v1.0.0_BUILD
  - 0616L_WOS_BroadcastReadyCustomObjectPass_v1.0.0_BUILD
```

---

## 1. Purpose

0617B simplifies the **Map surface toolbar** and finalizes the Studio top-level navigation model.

The current Map toolbar still exposes internal engineering controls:

```txt
+ Place Actor
asset dropdown
Duplicate
Delete
Select Building
Visual
Auth Scale
Look
Labels
Buildings
Actors
Show
instruction text
```

This creates confusion because Studio already has the correct task model:

```txt
Library chooses.
Map receives placement and selection.
Canvas stages objects in blank space.
Inspector edits the selected thing.
Broadcast shows the live output.
Publish sends safe Studio changes to Broadcast.
```

0617B removes toolbar clutter and moves controls to the correct authority surface.

---

## 2. Classification

```txt
Type: UX simplification / navigation cleanup
Authority: Studio shell only
Runtime Risk: Low
Wall Runtime Changes: None, except Broadcast nav opening existing wall route
Actor Manifest Changes: None
Publish Bundle Changes: None
Schema Changes: None
```

This pass must not add new rendering, GLB packaging, actor schema, bundle schema, or Wall runtime features.

---

## 3. Locked Surface Model

Studio has four top-level surfaces:

```txt
Library | Map | Canvas | Broadcast
```

### Surface meanings

| Surface | Meaning |
|---|---|
| `Library` | Choose, import, and manage assets/actors. |
| `Map` | Place assets into world coordinates and select existing world things. |
| `Canvas` | Blank staging surface for object preview/kit assembly. |
| `Broadcast` | Live output/runtime surface. |

### Non-surface editor

```txt
Inspector is not a surface.
Inspector is the persistent right-side editor for the current selection.
```

---

## 4. Required Topbar Change

### Current target after 0617A

```txt
WOS Studio     Library     Map     Canvas          Published     Broadcast     Publish
```

### 0617B target

```txt
WOS Studio     Library     Map     Canvas     Broadcast          Published     Publish
```

`Broadcast` must move into the surface navigation group.

The right side must contain only publish state and publish action:

```txt
Published     Publish
Draft Changes Publish
Publish Failed Publish
```

### Rules

1. `Broadcast` must appear visually alongside `Library`, `Map`, and `Canvas`.
2. `Broadcast` may open the existing `../wall/index.html` route.
3. `Broadcast` should open the runtime surface in a new browser tab/window if possible.
4. `Broadcast` must not be styled as a publish action.
5. `Publish` remains the only write/action button on the right side.
6. The status chip remains non-interactive.
7. No duplicate publish dropdown may appear.

---

## 5. Map Toolbar Simplification

### Current toolbar clutter

```txt
+ Place Actor
asset dropdown
Duplicate
Delete
Select Building
Visual dropdown
Auth Scale
Look dropdown
Labels
Buildings
Actors
Show dropdown
instruction text
```

### Required default Map toolbar

The default Map header must be minimal:

```txt
MAP                                      View Options
```

When an asset is selected in Library:

```txt
MAP                                      Selected: <asset label>     Place on Map     View Options
```

### Required visible controls

| Control | Default visibility | Notes |
|---|---:|---|
| `Selected: <asset>` | Only when asset selected | Read-only label. |
| `Place on Map` | Only when asset selected | Arms placement for selected asset. |
| `View Options` | Always | Opens/collapses secondary view controls. |

### Required removed from default toolbar

| Current control | New authority |
|---|---|
| Asset dropdown | Library only |
| Duplicate | Inspector selected actor actions |
| Delete | Inspector selected actor actions |
| Select Building | Click-based map selection / View Options fallback only |
| Visual | View Options |
| Auth Scale | View Options or debug-only |
| Look | View Options |
| Labels | View Options |
| Buildings | View Options |
| Actors | View Options |
| Show | View Options or Library actor filter |
| Instruction text | Remove |

---

## 6. View Options

Add a compact collapsible control named:

```txt
View Options
```

When closed, only the button is visible.

When open, it may contain:

```txt
View mode: Readable / Broadcast / Debug
Look: Illustration / Readable / Night / Tron / etc.
Show labels: on/off
Show actors: on/off
Show buildings: on/off
Actor filter: All / Draft / Promoted / Retired / etc.
Auth scale: on/off
```

### Rules

1. View Options are display controls only.
2. View Options must not write actor manifests.
3. View Options must not publish map style changes.
4. View Options may update Studio-local session view state.
5. Existing controller APIs may be reused.
6. All advanced view controls must be hidden by default.

---

## 7. Building Selection Behavior

Remove `Select Building` as a primary Map toolbar button.

Default behavior should move toward:

```txt
Click actor    → Actor Inspector
Click building → Building Inspector
Click empty map while placement armed → Place selected asset
```

If there is still a technical collision between actor selection and building selection, expose the fallback under `View Options`, not the primary toolbar:

```txt
View Options
  Selection Target: Auto / Actors / Buildings
```

### Acceptance rule

No primary toolbar button named `Select Building` may remain.

---

## 8. Placement Flow

Placement must remain simple:

```txt
Library asset selected
→ Map shows Selected: <asset label>
→ user clicks Place on Map
→ user clicks map
→ actor is placed
→ Inspector edits actor
```

The Library row may still expose:

```txt
Place on Map
Place on Canvas
```

If `Place on Canvas` is not yet implemented, it must be hidden or disabled with a clear `coming next` state. It must not pretend to work.

---

## 9. Inspector Authority

Move selected-object actions out of the Map toolbar.

### Actor selected

Inspector owns:

```txt
Duplicate
Delete / Remove Actor
Position
Asset
Material
Lifecycle
Promotion
Broadcast readiness
```

### Building selected

Inspector owns:

```txt
Replace
Restore
Color
Texture future hook
Linked actor actions
```

### Asset selected

Inspector may show:

```txt
Asset identity
Place on Map
Place on Canvas
Preview
Readiness
```

Do not duplicate these controls in the Map toolbar except for the minimal `Place on Map` shortcut.

---

## 10. Non-Goals

0617B must not implement:

```txt
GLB runtime packaging
hosted GLB upload
new Wall renderer
new Canvas editor
building texture import
new actor schema fields
new publish bundle schema fields
new material system
new composition behavior
```

This is cleanup only.

---

## 11. Required Files

Expected files:

```txt
studio/index.html
studio/studioShell.js
studio/styles.css
studio/views/threeDCanvasView.js   // only if toolbar rendering lives here
```

Do not modify Wall runtime modules for this pass unless strictly necessary to make the Broadcast nav open the existing wall page.

---

## 12. Implementation Notes

### 12.1 Broadcast nav

Preferred behavior:

```js
<a data-mode="broadcast" target="_blank" rel="noopener" href="../wall/index.html">Broadcast</a>
```

Or if the nav system requires buttons:

```js
<button data-mode="broadcast">Broadcast</button>
```

The button may call:

```js
window.open('../wall/index.html', 'wos-broadcast');
```

But it must remain visually grouped with the surface nav.

### 12.2 Map toolbar rendering

If toolbar is owned by `threeDCanvasView.js`, reduce it there.

If toolbar is partially assembled in `studioShell.js`, reduce it there.

No hidden old toolbar should remain in DOM unless functionally inaccessible and visually hidden.

### 12.3 Legacy debug controls

Advanced controls may remain accessible through debug namespace or View Options.

Do not delete controller capabilities. Delete only their primary visual exposure.

---

## 13. Acceptance Criteria

### AC1 — Nav surfaces

Top nav is exactly:

```txt
Library | Map | Canvas | Broadcast
```

### AC2 — Publish corner

Top-right is exactly:

```txt
Published/Draft Changes/Publish Failed + Publish
```

No Broadcast link appears in the publish corner.

### AC3 — No duplicate Published dropdown

There is no second Published dropdown or status selector.

### AC4 — Minimal Map toolbar

Map toolbar does not expose:

```txt
asset dropdown
Duplicate
Delete
Select Building
Visual dropdown
Auth Scale
Look dropdown
Labels button
Buildings button
Actors button
Show dropdown
instruction text
```

### AC5 — View Options contains secondary controls

Secondary view controls, if retained, are inside a collapsed `View Options` section.

### AC6 — Library remains source of asset choice

The active placement asset comes from Library, not from a duplicate Map toolbar dropdown.

### AC7 — Placement still works

Selecting an asset in Library and choosing `Place on Map` arms placement and allows the next map click to place an actor.

### AC8 — Building selection is no longer a primary toolbar button

Building selection is click-based or exposed under View Options only.

### AC9 — Inspector remains persistent

Inspector remains the right-side panel and updates based on selected actor/building/asset/composition.

### AC10 — No schema or Wall runtime change

Actor manifests and publish bundle schemas are unchanged.

### AC11 — No regression to 3d-canvas naming

No user-facing label may say:

```txt
3D Canvas
Place in 3D Canvas
Open 3D Canvas
```

Allowed internal filenames may still contain `threeDCanvasView.js`.

### AC12 — Parse clean

All modified JS files must parse cleanly.

---

## 14. Manual Test Plan

1. Load Studio at:

```txt
/studio/index.html#map
```

2. Confirm top nav:

```txt
Library | Map | Canvas | Broadcast
```

3. Confirm right side:

```txt
Published     Publish
```

4. Confirm no duplicate Published dropdown.

5. Confirm Map toolbar is minimal.

6. Select an asset in Library.

7. Confirm Map shows selected asset context and `Place on Map`.

8. Click `Place on Map`, then click map.

9. Confirm actor appears and Inspector updates.

10. Click a building.

11. Confirm Building Inspector opens without needing a primary `Select Building` button.

12. Open `View Options`.

13. Confirm advanced view controls are there if retained.

14. Click Broadcast.

15. Confirm Broadcast opens existing Wall/runtime surface.

16. Click Publish.

17. Confirm modal says `Publish to Broadcast`.

---

## 15. Debug Checks

Recommended console checks:

```js
_wos.debug.studio.state()
_wos.debug.studio.assetPlacement()
_wos.debug.studio.broadcastReadiness()
```

Expected:

```txt
mode: map
selectedAssetId: <asset id or null>
no errors from missing 3d-canvas mode
```

---

## 16. Completion Definition

0617B is complete when the Map surface no longer feels like an engineering control panel.

Target author experience:

```txt
I pick an object in Library.
I place it on Map.
I edit it in Inspector.
I publish to Broadcast.
```

No extra toolbar explanation should be needed.
