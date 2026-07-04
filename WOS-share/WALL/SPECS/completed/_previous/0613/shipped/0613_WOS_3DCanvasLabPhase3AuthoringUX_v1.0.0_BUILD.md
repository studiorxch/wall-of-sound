---
layout: spec
title: "WOS 3D Canvas Lab — Phase 3 Authoring UX"
date: 2026-06-13
doc_id: "0613_WOS_3DCanvasLabPhase3AuthoringUX_v1.0.0_BUILD"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "interaction"
component: "3DCanvasLab"
type: "system-spec"
status: "approved"
priority: "high"
risk: "medium"
classification: "interpretation-layer"
summary: "Defines Phase 3 authoring UX for WOS 3D Canvas Lab: Library drag/drop placement, translate-gizmo movement, LOD preview rings, actor duplication/deletion, undo/redo, Library search, read-only actor status badges, and Inspector empty state."
doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Manifest store owns persistence"
  - "Canvas previews movement; manifest commits final truth"
depends_on:
  - "WOS-3DLAB-P1-v0.1"
  - "WOS-3DLAB-P2-v0.1"
  - "0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0_BUILD"
enables:
  - "WOS 3D Canvas Lab Phase 4 Governance"
tags:
  - "wos"
  - "3d-canvas-lab"
  - "authoring-ux"
  - "manifest-store"
  - "library"
  - "gizmo"
---

# WOS 3D Canvas Lab — Phase 3 Specification: Authoring UX

| Field | Value |
|---|---|
| Spec ID | `WOS-3DLAB-P3-v1.0.0` |
| Status | `BUILD` |
| Authors | WOS Core Team |
| Date | 2026-06-13 |
| Depends on | `WOS-3DLAB-P1-v0.1`, `WOS-3DLAB-P2-v0.1`, `0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0_BUILD` |
| Requires | Phase 2 ship gate passed before Phase 3 implementation begins |
| Ship gate | An author can drag an asset from Library, place it in 3D Canvas, move it with the translate gizmo, and the result persists across reload without a single coordinate typed manually. |

---

## 1. Purpose and Scope

Phase 3 makes placement fast, visible, and usable.

Phases 1 and 2 gave authors the ability to place and configure actors. Phase 3 gives them the speed and spatial feedback to do it fluently:

1. Drag from Library.
2. Drop into 3D Canvas.
3. Move with translate gizmo.
4. Preview LOD rings.
5. Undo mistakes.
6. Duplicate and delete draft actors.
7. Manage authored actor inventory.

Phase 3 does **not** introduce governance, feed binding, rotation gizmos, scale gizmos, snapping, or direct mesh dragging. It completes the authoring UX layer so Phase 4 governance has real, well-authored content to promote.

### Ship Gate

Phase 3 is complete only when all of the following are true:

1. An author can drag an asset from the Library and drop it into the 3D Canvas to place an actor.
2. A placed actor can be moved using the translate gizmo.
3. `anchor.lat` and `anchor.lon` update correctly after translate-gizmo movement.
4. LOD preview rings are visible around the selected actor at the correct threshold distances.
5. Duplicate and delete work correctly and persist across reload.
6. Undo and redo work across placement, move, duplicate, draft delete, and Inspector save actions.
7. The Library shows both assets and actors with read-only Draft / Promoted badges on actors.
8. The Inspector displays an empty state when no actor is selected.

---

## 2. Locked Phase 3 Decisions

The following decisions were resolved before spec work began and are normative in this document. They are not open for re-debate during Phase 3 implementation.

| Question | Decision |
|---|---|
| Actor movement UX | Translate gizmo only. Direct mesh dragging deferred. |
| Object snapping | Out. Deferred to a future placement-assist spec. |
| Inspector empty state | Inspector stays mounted. Shows empty state copy. |
| Promoted actor visual distinction | Yes. Read-only Draft / Promoted badge in Library. No governance controls. |

---

## 3. Normative Dependencies

| Dependency | Type | Description |
|---|---|---|
| `WOS-3DLAB-P1-v0.1` | Phase 1 spec | Manifest schema, store write contract, placement rules, reload contract, architecture constraints. All still apply. |
| `WOS-3DLAB-P2-v0.1` | Phase 2 spec | Inspector field contract, validation rules, save sequence, `assetId` dropdown, `displayLabel`. |
| `0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0_BUILD` | Architecture doc | Phase 3 allowed systems, Studio nav lock, non-goals, Library / 3D Canvas / Inspector authority split. |
| `ActorManifestStore` | Phase 1 controller | Undo/redo command stack writes through this boundary only. |
| `ActorSelectionController` | Phase 1 controller | Gizmo and Inspector subscribe to selection events from this controller. |
| `InspectorController` | Phase 2 controller | Observes `anchor.lat/lon` updates from gizmo. Does not edit them directly. |
| `AssetResolver` | Phase 1/2 contract | `list()` used by Library asset browser. `resolve()` used by Canvas on drop. |

---

## 4. WOS Library — Full Specification

The Library is the unified inventory surface. It shows both assets and actors in one panel. It is the drag source for placement into the 3D Canvas.

### 4.1 Library Structure

The Library presents two sections in a single panel.

How the sections are visually separated is a UI implementation decision deferred per architecture doc `§13.1`. Acceptable future options include tabs, segmented control, filter toggle, or stacked headings. Phase 3 requires only that both sections are accessible without leaving the Library panel.

#### Assets Section

1. Lists all entries returned by `AssetResolver.list()`.
2. Each asset shows:
   - thumbnail or generic icon,
   - asset name,
   - `assetId`.
3. Assets are the drag source for new actor placement.
4. Dragging an asset into the 3D Canvas initiates placement.
5. Assets do not show Draft / Promoted status badges. Assets are infrastructure, not authored manifests.
6. Unresolved asset warning is shown if an asset entry in the registry has no resolvable glTF file.
7. `wos_placeholder_cube` is always shown as the first asset entry regardless of sort order.

#### Actors Section

1. Lists all actors in the manifest store: `wos-actors.json`.
2. Each actor shows:
   - `meta.displayLabel`, or `objectId` if no label exists,
   - `actorCategory`,
   - `actorType`,
   - status badge.
3. Status badge values:
   - `Draft` when `meta.promoted = false`,
   - `Promoted` when `meta.promoted = true`.
4. Badges are read-only.
5. No promotion controls, demotion controls, or governance actions are available in Phase 3.
6. Clicking an actor in the Library selects it in the 3D Canvas and opens it in the Inspector.
7. Unresolved asset warning is shown on actors whose `assetId` does not resolve.

### 4.2 Library Status Badges

#### Badge Rules

1. Draft badge is shown when `meta.promoted = false`.
2. Draft badge style: neutral background, muted text.
3. Promoted badge is shown when `meta.promoted = true`.
4. Promoted badge style: info background, info text.
5. Promoted badge visual language must match the future ContractGovernance status language, but it must not expose governance actions.
6. The Library must not show governance controls, promotion buttons, approval actions, demotion actions, or change history in Phase 3.
7. Badge state is read directly from `meta.promoted` in the in-memory manifest.
8. No separate status fetch is permitted.

### 4.3 Library Search and Filter

1. A search input filters both assets and actors simultaneously.
2. Search targets:
   - asset name,
   - `meta.displayLabel`,
   - `assetId`,
   - `actorType`.
3. Search is client-side against the in-memory asset list and manifest store.
4. No network call occurs on keystroke.
5. Clearing the search restores the full list.
6. No pagination in Phase 3.
7. No sort controls in Phase 3.
8. Default sort:
   - assets alphabetical by name,
   - actors by `meta.authoredAt` descending, newest first.

### 4.4 Library Thumbnail Generation

Thumbnail generation must not create an additional live WebGL context during Phase 3 operation. Creating a second WebGL context violates the renderer architecture constraint established in Phase 1.

The offscreen Three.js render approach is deferred to a future Library Thumbnail Pipeline spec.

#### Allowed Phase 3 Thumbnail Behavior

1. Use existing cached thumbnail data if available from a prior session or pre-baked asset registry entry.
2. If no cached thumbnail exists, display a generic asset icon.
3. Generic icons should be category-appropriate where possible, such as a building silhouette for structure assets.
4. Generic icons must not require a glTF load or WebGL render.
5. The Library must not block mount or asset list render waiting for thumbnails.
6. Icons load immediately.
7. Thumbnails are progressive enhancement only.
8. Offscreen Three.js rendering for thumbnail generation is deferred to the Library Thumbnail Pipeline spec.
9. Phase 3 does not implement thumbnail rendering.
10. The `wos_placeholder_cube` asset always uses the generic placeholder icon regardless of thumbnail pipeline state.

#### Thumbnail Constraints

1. Thumbnail handling must not block Library render.
2. Thumbnail generation must not create an additional live WebGL context.
3. No thumbnail pipeline is implemented in Phase 3.
4. No image management system is implemented in Phase 3.
5. No CDN upload is implemented in Phase 3.
6. Session-only cache is allowed if thumbnail data already exists.

---

## 5. Drag and Drop — Library to 3D Canvas

Dragging an asset from the Library to the 3D Canvas is the primary placement path in Phase 3. It replaces the Phase 1 click-to-place flow as the default authoring action.

### 5.1 Drag Initiation

1. Author clicks and holds on an asset entry in the Library.
2. After a short hold threshold, drag begins.
3. Recommended hold threshold: `150ms`.
4. The asset entry shows a drag preview:
   - thumbnail or generic icon,
   - asset name.
5. The 3D Canvas highlights as an active drop target while dragging.

### 5.2 Drop and Placement Sequence

1. Author drops the asset onto the 3D Canvas.
2. The Canvas raycasts the drop position to lat/lon using the MarineRenderer projection math.
3. The same projection path from Phase 1 click-to-place is used.
4. A new `WOSActorManifest` is created with:
   - dropped `assetId`,
   - computed `anchor.lat`,
   - computed `anchor.lon`,
   - Phase 1 default values.
5. The manifest is written to the store atomically before the actor appears in the scene.
6. No optimistic placement is allowed.
7. The actor appears in the 3D Canvas at the drop position after the manifest write succeeds.
8. The actor is selected immediately after placement.
9. The Inspector opens with the new actor's properties.
10. The drop action is added to the undo stack as a single undoable operation.

#### No Optimistic Placement — Inherited from Phase 1

1. The actor must not appear in the viewport before the manifest write completes.
2. If the manifest write fails, no actor is placed.
3. If the manifest write fails, the error is surfaced to the author.
4. This rule carries forward from Phase 1 and is not relaxed in Phase 3.

### 5.3 Drop Outside Canvas

1. If the author drops outside the 3D Canvas boundary, the drag is cancelled.
2. No actor is placed.
3. No error is shown.
4. If the raycast misses the ground plane, the drag is cancelled.
5. A sky drop is treated as a raycast miss.
6. A raycast miss creates no actor and no manifest write.

### 5.4 Phase 1 Click-to-Place

1. Click-to-place from Phase 1 remains available as a secondary placement path.
2. Click-to-place is not removed in Phase 3.
3. Authors may use either drag/drop or click-to-place.
4. Drag/drop is the primary authoring path.

---

## 6. Translate Gizmo — Full Specification

The translate gizmo is the only actor movement mechanism in Phase 3. Direct mesh dragging is explicitly prohibited.

### 6.1 Locked Decision Rationale

Translate gizmo only was chosen over direct mesh dragging because:

1. It eliminates accidental movement when an author intends to select.
2. It gives a clear visual affordance that movement is in progress.
3. It keeps selection and movement as distinct intentional gestures.

Direct mesh dragging is deferred to a future spec.

### 6.2 Gizmo Appearance and Activation

1. The translate gizmo appears on the selected actor immediately after selection.
2. The gizmo renders as two handles:
   - X-axis handle for east/west movement,
   - Y-axis handle for north/south movement.
3. The axes are world-space axes.
4. No Z-axis handle exists in Phase 3.
5. Altitude is edited via the Inspector `anchor.altM` field from Phase 2.
6. The gizmo is rendered by the 3D Canvas layer, not by actor geometry.
7. When no actor is selected, no gizmo is rendered.

### 6.3 Gizmo Drag Behavior

1. Author clicks a gizmo handle.
2. Movement mode begins.
3. Author drags the handle.
4. The actor moves in the corresponding world-space axis.
5. The Canvas maintains a transient preview anchor derived from the gizmo position.
6. The transient preview anchor is used for actor mesh positioning and LOD ring placement only.
7. The persisted `WOSActorManifest.anchor.lat` and `WOSActorManifest.anchor.lon` must not be written during drag.
8. The Inspector observes the transient preview anchor from the `GizmoController` in real time.
9. The Inspector lat/lon display updates live during drag.
10. The Inspector does not read from or write to the manifest during drag.
11. On drag release, the final transient preview anchor is committed to `ActorManifestStore` as a single atomic update.
12. The drag release is the only manifest write in the move flow.
13. The move operation is added to the undo stack as a single undoable operation.
14. Intermediate positions during drag are not individually undoable.

#### No Snapping — Locked Decision

1. All actor movement writes the exact translated `anchor.lat` and `anchor.lon` produced by the gizmo movement controller.
2. Snapping is explicitly prohibited in Phase 3.
3. Grid alignment is explicitly prohibited in Phase 3.
4. Road attachment is explicitly prohibited in Phase 3.
5. Building attachment is explicitly prohibited in Phase 3.
6. Nearest-feature placement is explicitly prohibited in Phase 3.
7. Any form of coordinate coercion during gizmo movement is a Phase 3 defect regardless of intent.
8. Snapping is deferred to a future placement-assist spec.

### 6.4 Precision Requirement

1. `anchor.lat` and `anchor.lon` are written to float64 precision.
2. No storage rounding occurs during gizmo movement.
3. This requirement is inherited from Phase 1 and is not relaxed.
4. The Inspector displays lat/lon to six decimal places.
5. Display rounding is acceptable.
6. Storage rounding is not acceptable.

### 6.5 Actor Mesh Is Selectable, Not Draggable

1. Clicking the actor mesh selects the actor.
2. Selecting the actor causes the translate gizmo to appear.
3. Dragging the actor mesh directly does not move it.
4. The mesh is a selection target only.
5. Movement occurs only through the active translate gizmo handle.
6. This distinction must be enforced in `ActorPlacementController` pointer event handling.

---

## 7. Actor Actions — Duplicate and Delete

### 7.1 Duplicate

1. Author triggers duplicate on a selected actor.
2. The exact UI trigger is an implementation decision.
3. Acceptable triggers include keyboard shortcut, context menu, or toolbar button.
4. A new `WOSActorManifest` is created as a copy of the selected actor.
5. The duplicate receives a new UUID v4 `objectId`.
6. All other fields are copied from the source actor unless explicitly overridden below.
7. The duplicate is offset slightly from the original so it is visually distinguishable.
8. Recommended offset: `+0.0001° lat`, `+0.0001° lon`, approximately `+10m` northeast.
9. The manifest is written to the store atomically.
10. The duplicate appears in the scene after the store write succeeds.
11. The duplicate is selected immediately.
12. The original is deselected.
13. `meta.authoredAt` is set to the current timestamp on the duplicate.
14. `meta.promoted` is always set to `false` on the duplicate.
15. The duplicate action is added to the undo stack as a single undoable operation.

### 7.2 Delete

1. Author triggers delete on a selected actor.
2. The exact UI trigger is an implementation decision.
3. Acceptable triggers include keyboard shortcut, context menu, or toolbar button.
4. If the actor `meta.promoted = false`, the actor is a Draft actor.
5. Draft actors are deleted immediately without confirmation.
6. Draft actor deletion removes the manifest from the in-memory store.
7. Draft actor deletion flushes the store to disk atomically.
8. Draft actor deletion removes the actor from the 3D Canvas scene.
9. Draft actor deletion clears the Inspector to empty state.
10. Draft actor deletion is added to the undo stack.
11. If the actor `meta.promoted = true`, the actor is a Promoted actor.
12. Promoted actors must not be deleted in Phase 3.
13. Attempting to delete a Promoted actor displays the block message below and performs no delete.

```txt
This actor is promoted and cannot be deleted in Phase 3. Use the Phase 4 governance flow.
```

14. No confirmation dialog is shown for Promoted actor deletion in Phase 3.
15. No delete occurs for Promoted actors in Phase 3.
16. No undo entry is created for a blocked Promoted actor delete attempt.

#### Promoted Actors Are Not Deletable in Phase 3

1. Promoted actor deletion is a governance mutation.
2. Governance mutation belongs to Phase 4.
3. Phase 3 has read-only visibility into Promoted status only.
4. Phase 3 must not mutate promoted canonical state.
5. Draft actor deletion remains immediate and undoable.
6. Only Draft actors may be deleted in Phase 3.

---

## 8. Undo and Redo — Full Specification

Undo and redo operate over the command stack. The command stack records manifest mutations only. Viewport state is derived from the manifest and is not independently undoable.

### 8.1 Undoable Actions in Phase 3

| Action | Undo behavior |
|---|---|
| Place by drag/drop | Remove manifest entry. Actor disappears from scene. |
| Place by click-to-place | Remove manifest entry. Actor disappears from scene. |
| Move by translate gizmo | Restore previous `anchor.lat/lon`. Actor returns to prior position. |
| Duplicate | Remove the duplicate manifest entry. Duplicate disappears. |
| Delete of Draft actor | Re-insert manifest entry. Actor reappears at its last position. |
| Inspector save | Restore previous manifest field values. Scene updates accordingly. |

### 8.2 Non-Undoable Actions

1. Blocked delete attempt on a Promoted actor.
2. Manifest store flush to disk as an isolated implementation event.
3. Session startup manifest load.
4. Selection changes that do not mutate the manifest.
5. Library search/filter state.
6. Inspector empty state transitions.

Promoted actor deletion is not a non-undoable Phase 3 action because Promoted actors cannot be deleted in Phase 3.

### 8.3 Command Stack Rules

1. The command stack holds a maximum of 50 operations.
2. Oldest operations are dropped when the limit is reached.
3. Every undoable action is stored as a complete before/after manifest snapshot for the affected actor or actors.
4. Partial state patches are not allowed in the undo stack.
5. Undo triggers an atomic manifest store write.
6. Redo triggers an atomic manifest store write.
7. Disk state always reflects the current undo stack position.
8. Redo stack is cleared when a new action is taken after an undo.
9. Standard linear undo model applies.
10. The command stack is in-memory only.
11. The command stack is not persisted across sessions.
12. Keyboard shortcuts:
    - `Ctrl+Z` / `Cmd+Z` for undo,
    - `Ctrl+Shift+Z` / `Cmd+Shift+Z` for redo.

---

## 9. LOD Preview Rings

LOD preview rings give the author spatial feedback on how the selected actor's LOD thresholds map to distances in the world. They are a visual overlay only and have no effect on the manifest.

### 9.1 Ring Specification

1. Four concentric circles are drawn in the 3D Canvas around the selected actor.
2. Ring distances:
   - `highM`,
   - `medM`,
   - `lowM`,
   - `billboardM`.
3. Ring colors are distinct but not semantic:
   - `highM`: green,
   - `medM`: amber,
   - `lowM`: coral,
   - `billboardM`: gray.
4. Each ring is labelled with threshold name and distance value.
5. Example label: `High 500m`.
6. Labels are placed at the north intersection of each ring.
7. Rings are drawn on the ground plane at `anchor.altM`.
8. Rings are not spheres.
9. Rings are visible regardless of camera angle.
10. Rings do not occlude actor geometry.
11. Rings disappear when the actor is deselected.

### 9.2 Rings Follow the Gizmo

1. When the author drags the translate gizmo, the LOD rings move with the actor in real time.
2. Ring positions are recalculated on every frame during gizmo drag.
3. Rings read from the transient preview anchor during drag.
4. Rings do not update `anchor.lat/lon` themselves.
5. Rings are observers only.

### 9.3 Rings Are Not Editable

1. LOD rings are visual preview only.
2. The author cannot drag a ring to change a threshold.
3. LOD threshold editing is Phase 4.
4. Clicking a ring does nothing.
5. Clicking a ring does not select the ring.
6. Clicking a ring does not open a threshold editor.

---

## 10. Inspector Empty State

Per the locked Phase 3 decision, the Inspector remains mounted and visible when no actor is selected. It shows an empty state rather than hiding.

### 10.1 Empty State Specification

1. Empty state copy:

```txt
Select an actor to edit its properties.
```

2. No fields are displayed.
3. No stale values from the previously selected actor are shown.
4. The empty state is centered in the Inspector panel.
5. A secondary affordance is permitted but not required.
6. Permitted secondary hint:

```txt
Or drag an asset from the Library to place a new actor.
```

7. The secondary hint is a UX implementation decision.

#### Inspector Clear Rules

1. When selection is cleared, the Inspector clears to empty state immediately.
2. Selection clear events include:
   - actor deselected,
   - actor deleted,
   - click on empty canvas.
3. No animation is required.
4. No fade is required.
5. No delay is allowed.
6. The fields disappear instantly when selection is cleared.
7. The Inspector must not show fields from the previously selected actor after selection changes.

### 10.2 Inspector with Actor Selected — Unchanged from Phase 2

When an actor is selected, the Inspector shows all Phase 2 fields exactly as specified in `WOS-3DLAB-P2-v0.1`.

Phase 3 adds no new editable Inspector fields.

The only Phase 3 changes to the Inspector are:

1. live lat/lon display update during gizmo drag,
2. empty state behavior when no actor is selected.

---

## 11. New and Updated Controllers — Phase 3

| Controller | Type | Description |
|---|---|---|
| `ActorManifestStore` | Phase 1+2 updated | Adds `remove(objectId)` for Draft delete. Adds `duplicate(objectId)`. Undo/redo routes through this boundary. |
| `ActorPlacementController` | Phase 1 updated | Handles drag/drop initiation from Library, drop raycast, and gizmo drag. Enforces no-direct-mesh-drag rule. |
| `ActorSelectionController` | Phase 1 unchanged | Gizmo, LOD rings, and Inspector subscribe to selection events from this controller. |
| `InspectorController` | Phase 2 updated | Observes transient preview `anchor.lat/lon` updates from gizmo during drag. Clears to empty state on deselect. |
| `UndoRedoController` | Phase 3 new | Owns command stack. Wraps `ActorManifestStore` mutations in before/after snapshots. Enforces 50-operation limit. |
| `GizmoController` | Phase 3 new | Owns translate gizmo render and pointer event handling. Publishes transient preview anchors to `ActorPlacementController`. |
| `LODRingController` | Phase 3 new | Owns LOD ring render. Reads thresholds from selected actor manifest. Follows transient preview anchor during drag. |
| `LibraryController` | Phase 3 new | Owns Library panel state: asset list, actor list, search filter, thumbnail/icon cache, drag initiation. |

---

## 12. Explicitly Out of Scope in Phase 3

Do not build the following in Phase 3:

1. Object snapping of any kind.
2. Grid snapping.
3. Road snapping.
4. Building snapping.
5. Nearest-feature snapping.
6. Direct mesh dragging for actor movement.
7. Rotate gizmo.
8. Scale gizmo.
9. LOD threshold editing via ring drag.
10. LOD threshold editing via Inspector.
11. Continuity scalar editing.
12. Feed binding.
13. `liveTracking` editing.
14. GTFS-RT binding.
15. GBFS binding.
16. Governance promotion controls.
17. Governance demotion controls.
18. Promoted actor deletion.
19. Batch editing across multiple selected actors.
20. Multi-actor selection.
21. Actor grouping.
22. Animation graph fields.
23. Import / export of actor manifests.
24. Keyboard nudge for actor movement.
25. Offscreen Three.js thumbnail generation.
26. Thumbnail image management pipeline.

---

## 13. Acceptance Criteria

### 13.1 Library

1. Assets section lists all entries from `AssetResolver.list()`.
2. `wos_placeholder_cube` is always first.
3. Actors section lists all actors from the manifest store.
4. Actors show correct Draft / Promoted badges.
5. Search filters both assets and actors simultaneously.
6. Clearing search restores full list.
7. Clicking an actor in the Library selects it in the 3D Canvas.
8. Clicking an actor in the Library opens it in the Inspector.
9. Generic icons are shown where no pre-baked thumbnail exists.
10. Library thumbnail/icon behavior does not create an additional WebGL context.
11. No promotion controls or governance actions are exposed in the Library.

### 13.2 Drag and Drop

1. Dragging an asset from Library and dropping on 3D Canvas creates a new actor at the drop position.
2. The new actor manifest is written to `wos-actors.json` before the actor appears in the scene.
3. The new actor is selected after placement.
4. The Inspector opens after placement.
5. Dropping outside the Canvas cancels the drag with no side effect.
6. Dropping where raycast misses the ground plane cancels the drag with no side effect.
7. The drop action is undoable.

### 13.3 Translate Gizmo

1. The gizmo appears on the selected actor.
2. The gizmo disappears when the actor is deselected.
3. Dragging a gizmo handle moves the actor.
4. Dragging a gizmo handle updates the transient preview anchor during drag.
5. Dragging the actor mesh directly does not move it.
6. The Inspector lat/lon display updates live during gizmo drag.
7. No manifest write occurs during gizmo drag.
8. On drag release, the final preview anchor is committed to `wos-actors.json` as a single atomic write.
9. No snapping occurs during gizmo movement.
10. No coordinate coercion occurs during gizmo movement.
11. Move is undoable as a single operation from start position to end position.

### 13.4 LOD Preview Rings

1. Four rings appear around the selected actor.
2. Rings use `highM`, `medM`, `lowM`, and `billboardM` distances.
3. Ring colors and labels match Section 9.1.
4. Rings move with the actor during gizmo drag.
5. Rings disappear on deselect.
6. Rings do not respond to clicks.
7. Rings do not mutate the manifest.

### 13.5 Duplicate and Delete

1. Duplicate creates a new actor with a new `objectId`.
2. Duplicate is offset `+0.0001° lat/lon` from the original unless implementation chooses an equivalent small visual offset.
3. Duplicate is selected after creation.
4. Original is deselected after duplicate creation.
5. Delete of a Draft actor removes it immediately.
6. Delete of a Draft actor requires no confirmation.
7. Delete of a Draft actor is undoable.
8. Attempting to delete a Promoted actor shows the block message.
9. Attempting to delete a Promoted actor does not delete the actor.
10. Promoted actors cannot be deleted in Phase 3.
11. Delete is only available on Draft actors in Phase 3.

### 13.6 Undo / Redo

1. `Ctrl+Z` / `Cmd+Z` undoes the last undoable operation.
2. `Ctrl+Shift+Z` / `Cmd+Shift+Z` redoes the last undone operation.
3. Undo supports:
   - place,
   - move,
   - duplicate,
   - Draft delete,
   - Inspector save.
4. Redo stack clears after a new action following an undo.
5. Undo stack limit of 50 is enforced.
6. Undo stack is empty on session start.
7. Undo and redo write the full manifest store atomically.

### 13.7 Inspector Empty State

1. The text `Select an actor to edit its properties.` is shown when no actor is selected.
2. No stale fields from the previously selected actor are visible.
3. Inspector remains mounted when selection is cleared.
4. Inspector is not hidden when selection is cleared.
5. Inspector clears immediately on deselect.

### 13.8 Architecture Constraints

1. No snapping or coordinate coercion exists in any movement path.
2. No second WebGL context is created by Phase 3 additions.
3. Thumbnail behavior does not create an additional WebGL context.
4. Generic icons are shown where no pre-baked thumbnail exists.
5. All manifest mutations route through `ActorManifestStore`.
6. No UI code edits `wos-actors.json` directly.
7. `GizmoController` publishes transient preview anchors during drag.
8. `GizmoController` does not write to `ActorManifestStore` during drag.
9. The single atomic manifest write for movement occurs only on drag release.
10. Inspector observes transient preview anchor during drag but does not mutate manifest truth.

---

## 14. Deferred Questions — Carried to Phase 4

### 14.1 Library Section Separator UX

Tabs, filter toggle, segmented control, or stacked headings remain undecided.

This does not affect Phase 4 governance spec but must be decided before Phase 3 ships.

### 14.2 Keyboard Nudge

Arrow keys to nudge actor by a fixed delta are deferred.

Reason: keyboard nudge requires defining a nudge delta unit and interacts with the undo stack.

Revisit after gizmo ships.

### 14.3 Multi-Actor Selection

Shift-click to select multiple actors, then bulk move or delete, is deferred.

Reason: multi-actor selection doubles gizmo and undo complexity.

### 14.4 Rotate and Scale Gizmos

Rotate and scale gizmos are deferred to Phase 4.

The manifest needs a `headingDeg` write path from the rotate gizmo. Current `headingDeg` editing is Inspector-only. Confirm Phase 4 gizmo behavior before Phase 4 spec is written.

### 14.5 Placement Assist and Snapping

Placement-assist behavior, including snapping, road attachment, building attachment, and nearest-feature positioning, is deferred to a later placement-assist spec.

Phase 3 intentionally writes exact author movement only.

### 14.6 Library Thumbnail Pipeline

Offscreen Three.js thumbnail generation is deferred to a future Library Thumbnail Pipeline spec.

Phase 3 uses existing cached thumbnails or generic icons only.

---

## 15. Data Model Examples

### 15.1 Phase 3 Manifest Example

A manifest after a Phase 3 drag/drop placement and gizmo move:

```json
{
  "objectId": "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6",
  "actorCategory": "structure",
  "actorType": "building",
  "assetId": "sr_flatiron_building_001",
  "anchor": {
    "lat": 40.741061,
    "lon": -73.989699,
    "altM": 0,
    "headingDeg": 27
  },
  "lod": {
    "highM": 500,
    "medM": 2000,
    "lowM": 8000,
    "billboardM": 20000
  },
  "scalars": {
    "continuityAlpha": null,
    "deadReckoningWeight": 0,
    "coastAlpha": null,
    "staleWeight": null,
    "interpolationWeight": null
  },
  "liveTracking": null,
  "meta": {
    "specVersion": "1.0.0",
    "authoredAt": "2026-06-13T15:10:00Z",
    "authoredBy": null,
    "promoted": false,
    "promotedAt": null,
    "changeReason": null,
    "displayLabel": "Flatiron Building"
  }
}
```

### 15.2 Transient Preview Anchor

During gizmo drag, the runtime may hold a transient preview anchor outside the persisted manifest.

```ts
type TransientPreviewAnchor = {
  objectId: string;
  anchor: {
    lat: number;
    lon: number;
    altM: number;
    headingDeg: number;
  };
  source: "gizmo_drag";
};
```

Rules:

1. `TransientPreviewAnchor` is not persisted.
2. `TransientPreviewAnchor` is not written to `wos-actors.json`.
3. `TransientPreviewAnchor` exists only during active gizmo drag.
4. On drag release, its final anchor is committed to the manifest store.

---

## 16. Controller Interaction Summary

### 16.1 Primary Move Flow

```txt
Author drags gizmo handle
  -> GizmoController captures pointer events
  -> GizmoController computes world-space delta
  -> GizmoController publishes transient preview anchor to ActorPlacementController
  -> ActorPlacementController updates actor mesh position in scene
  -> LODRingController reads transient preview anchor and redraws rings each frame
  -> InspectorController observes transient preview anchor and updates lat/lon display
```

No manifest write occurs during drag.

```txt
Author releases gizmo handle
  -> GizmoController publishes final transient preview anchor
  -> ActorPlacementController commits preview anchor
  -> ActorPlacementController calls ActorManifestStore.update(objectId, { anchor })
  -> UndoRedoController records before/after snapshot as one undo operation
  -> ActorManifestStore writes full manifest array atomically to disk
  -> Canvas scene remains aligned with committed manifest truth
```

### 16.2 Drag/Drop Placement Flow

```txt
Author drags asset from Library
  -> LibraryController starts drag payload with assetId
  -> 3D Canvas becomes active drop target
  -> Author drops on Canvas
  -> ActorPlacementController raycasts drop position to lat/lon
  -> ActorPlacementController creates WOSActorManifest
  -> ActorManifestStore.add writes manifest atomically
  -> Canvas loads actor from committed manifest
  -> ActorSelectionController selects new actor
  -> InspectorController displays new actor properties
  -> UndoRedoController records place command
```

---

## 17. Authority Relationships

### Reads From

- `AssetResolver`
- `ActorManifestStore`
- `ActorSelectionController`
- `GizmoController` transient preview stream

### Writes To

- `ActorManifestStore`

### Observed By

- `3D Canvas`
- `InspectorController`
- `LODRingController`
- `LibraryController`

### Forbidden Mutations

- Direct JSON file mutation from UI components
- Direct Three.js scene mutation from Inspector
- Manifest writes during active gizmo drag
- Promoted actor deletion
- Governance state mutation
- `assetPath` writes
- Snapping or coordinate coercion
- Additional live WebGL context creation for thumbnails

---

## 18. Validation Checklist

- [ ] Library lists assets and actors in one panel.
- [ ] `wos_placeholder_cube` appears first in asset list.
- [ ] Actor badges are read-only Draft / Promoted labels.
- [ ] No governance controls appear in Phase 3.
- [ ] Drag/drop placement writes manifest before actor appears.
- [ ] Translate gizmo is the only movement mechanism.
- [ ] Direct mesh dragging does not move actors.
- [ ] No snapping exists.
- [ ] No coordinate coercion exists.
- [ ] Manifest anchor is not written during drag.
- [ ] Final preview anchor commits only on drag release.
- [ ] Inspector lat/lon updates live during drag from transient preview anchor.
- [ ] LOD rings follow transient preview anchor.
- [ ] LOD rings are not editable.
- [ ] Draft delete is immediate and undoable.
- [ ] Promoted delete is blocked.
- [ ] Undo/redo supports place, move, duplicate, Draft delete, and Inspector save.
- [ ] Undo stack clears on session start.
- [ ] Inspector empty state appears immediately on deselect.
- [ ] No second WebGL context is created for thumbnails.
- [ ] Generic icons appear when no pre-baked thumbnails exist.

---

## 19. Non-Goals

WOS 3D Canvas Lab Phase 3 is not responsible for:

1. Governance promotion.
2. Governance demotion.
3. Promoted actor retirement.
4. Feed subscription binding.
5. GTFS-RT runtime binding.
6. GBFS runtime binding.
7. Live tracking configuration.
8. Road or building snapping.
9. Placement assist intelligence.
10. Mesh editing.
11. Modeling tools.
12. Material editing.
13. Animation graph editing.
14. Full thumbnail generation pipeline.
15. CDN or asset publishing pipeline.
16. Multi-user collaboration.
17. Broadcast scheduling.
18. Runtime feed freshness policy.

---

## 20. Canonical References

- `WOS-3DLAB-P1-v0.1`
- `WOS-3DLAB-P2-v0.1`
- `0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0_BUILD`
- `WOSActorManifest`
- `ActorManifestStore`
- `AssetResolver`
- `ContractGovernance`
- `WOS Naming Doctrine`
- `WOS Surface Channel Doctrine`

---

## 21. Revision History

| Version | Date | Notes |
|---|---|---|
| `v1.0.0_BUILD` | 2026-06-13 | BUILD conversion from updated Phase 3 draft. Promoted deletion blocked, thumbnail WebGL pipeline deferred, transient preview anchor clarified, and contradictory delete/undo language normalized. |
