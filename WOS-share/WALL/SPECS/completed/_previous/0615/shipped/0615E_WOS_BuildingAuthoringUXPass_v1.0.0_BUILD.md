# 0615E_WOS_BuildingAuthoringUXPass_v1.0.0_BUILD

**Status:** BUILD  
**Date:** 2026-06-15  
**Project:** WOS Studio / 3D Canvas Lab  
**Classification:** studio-authoring-ux, building-selection, structure-replacement, 3d-city-editing

---

## 1. Purpose

0615E turns the existing Phase 6 building replacement logic into a usable building authoring experience.

The system already supports:

```txt
click Mapbox building
→ read feature metadata
→ assign structure actor
→ suppress original extrusion
→ render replacement actor
→ restore original on delete / clear
```

But the current UX is still too procedural. The user can technically select and assign a building, but cannot yet confidently understand:

```txt
which building is hovered
which building is selected
what feature was selected
where the replacement will appear
which actor is linked to the building
how to preview before committing
how to restore the original building
```

0615E makes building editing visually explicit.

---

## 2. Non-goals

This pass must not become a material, mesh, GLB, or Wall-runtime pass.

Do **not** add:

```txt
new actor manifest schema
new publish bundle fields
Wall runtime changes
GLB import pipeline
per-face material editing
texture painting
building mesh replacement from files
Mapbox style publishing
reverse geocoding API
new governance lifecycle states
```

0615E is Studio-only UX over already-existing building selection and replacement contracts.

---

## 3. Current foundation

0615E builds on:

```txt
Phase 6 — Building Selection + Replacement Authoring
Phase 7 — Material Override Controller
Phase 8 — Publish Pipeline
0615B — Actor Location Intelligence
0615C — Studio Map Look Authoring Surface
0615D — 3D Asset Visual Authoring Pass
```

Existing Phase 6 capabilities are preserved:

```txt
BuildingSelectionController
BuildingReplacementLayer
structure.mapboxFeatureId
structure.mapboxSourceId
structure.mapboxSourceLayer
structure.mapboxLayerId
feature-state based suppression
clear replacement restores original extrusion
```

---

## 4. Desired user experience

The target flow:

```txt
Select Building mode
→ hover over real building
→ hovered building highlights
→ click building
→ selected building highlights more strongly
→ Inspector shows building card
→ preview replacement footprint / actor position
→ assign existing structure actor or create new one
→ original building is suppressed
→ replacement actor is selected and visible
→ Inspector shows linked actor + restore controls
```

The user should be able to answer:

```txt
What building did I click?
Where will the replacement go?
What actor is connected to it?
Can I restore the original?
```

---

## 5. Files likely touched

Expected files:

```txt
studio/views/buildingSelectionController.js
studio/views/buildingReplacementLayer.js
studio/views/threeDCanvasView.js
studio/studioShell.js
studio/styles.css
```

Optional helper if implementation gets large:

```txt
studio/views/buildingAuthoringUXController.js
```

Avoid touching:

```txt
wall/**
studio/systems/publish/**
studio/actors/actorManifestStore.js
studio/actors/promotionGateController.js
```

---

## 6. Building hover highlight

### Requirement

When **Select Building** mode is active, hovering over selectable Mapbox buildings must show a lightweight hover highlight.

### Behavior

```txt
mouse moves over selectable building → hover highlight appears
mouse moves away → hover highlight clears
click building → hover becomes selected highlight
leave Select Building mode → hover highlight clears
```

### Implementation direction

Use feature-state where available:

```txt
wosBuildingHover: true
wosBuildingSelected: true
```

Do not use destructive filters. Do not modify canonical Mapbox style JSON permanently.

If layer paint mutation is required, it must be reversible.

---

## 7. Selected building highlight

### Requirement

Selected buildings need a stronger visual state than hover.

Selected building should read clearly even in:

```txt
Authoring look
Broadcast Dark look
Tron look
Illustration look
```

### Visual direction

```txt
hover building = subtle cyan/tinted outline or opacity lift
selected building = stronger cyan outline / glow / footprint emphasis
suppressed building = original extrusion hidden or transparent per existing Phase 6 path
```

### Constraint

Highlight must not fight the replacement suppression state. Once a building is replaced, selection highlight should either transfer to the linked actor or show the suppressed footprint only.

---

## 8. Building info card

### Requirement

The Inspector Building Replacement panel must become a clearer building card.

Current fields remain, but layout should become more readable.

### Required fields

```txt
Selected Building
featureId
sourceId
sourceLayer
layerId
centroid lat/lon
approx building footprint center
replacement status
linked actor id / label if present
```

### Optional fields if available from Mapbox feature properties

```txt
height
min_height
extrude
class/type
name
address/housenumber
```

Do not invent values. Show only fields that exist.

---

## 9. Replacement preview before commit

### Requirement

When a building is selected but not yet assigned, Studio must show a preview of where the replacement actor will be placed.

### Preview may include

```txt
centroid marker
footprint ring
ghost structure proxy
label: Replacement Preview
```

### Constraint

Preview state is session-only.

It must not write:

```txt
previewAnchor
replacementPreview
buildingPreview
```

into actor manifests or publish bundles.

---

## 10. Assign replacement UX

The Inspector must clearly separate two flows:

### A. Create new replacement actor

```txt
Create Structure Replacement
```

Behavior:

```txt
creates new DRAFT structure actor
anchors it to building centroid
binds structure.mapboxFeatureId/source/layer fields
suppresses original building
selects new actor
shows actor in 3D Canvas
```

### B. Assign existing structure actor

```txt
Assign Existing Structure Actor
```

Behavior:

```txt
select existing structure actor
move actor anchor to building centroid
bind actor to building feature
restore previous building if actor was bound elsewhere
suppress selected building
select actor
```

### UX requirement

The user should not have to infer what will happen. Buttons must be explicit.

Avoid generic `Assign` as the only action label.

---

## 11. Restore original building

### Requirement

When a selected building already has a replacement actor, the Inspector must provide a clear restore path.

Required button:

```txt
Restore Original Building
```

Behavior:

```txt
clear actor.structure.mapboxFeatureId/source/layer fields
restore Mapbox building extrusion
keep actor as Draft/Promoted according to governance state
refresh 3D render layer
clear building selection or transfer selection to actor
```

### Constraint

If actor is PROMOTED, direct mutation may be blocked by existing governance rules. In that case show:

```txt
Promoted actor. Fork actor to change replacement binding.
```

Do not bypass governance.

---

## 12. Linked actor visibility

### Requirement

When a building is replaced, the linked structure actor must be obvious.

Possible UI:

```txt
Inspector: Current Replacement
Actor: <label / objectId>
[Focus Actor]
[Select Actor]
[Restore Original Building]
```

The Library actor row should continue to show the structure actor. No new lifecycle states are required.

---

## 13. Map look compatibility

0615E must remain compatible with 0615C map looks:

```txt
authoring
broadcast-dark
night
tron
illustration
```

The building hover/selected state must survive style reloads. If the map style changes, building selection paint and replacement suppression must be re-applied after style readiness.

Use existing remount/reapply hooks where possible.

---

## 14. Interaction safety

### Select Building mode must not conflict with actor placement

Rules:

```txt
Activating Select Building disables Place Actor mode.
Activating Place Actor disables Select Building mode.
Leaving 3D Canvas clears transient hover/preview state.
Deleting a linked Draft actor restores the original building.
Clearing replacement restores the original building.
```

### Drag/gizmo interactions

Changing map look or visual mode should not corrupt selected building state.

---

## 15. Persistence rules

Allowed persistent data is only the existing Phase 6 structure binding:

```js
structure: {
  mapboxFeatureId,
  mapboxSourceId,
  mapboxSourceLayer,
  mapboxLayerId
}
```

Do not persist UX-only state:

```txt
hoveredBuilding
selectedBuildingVisual
replacementPreview
buildingCardOpen
buildingHoverState
buildingSelectedState
```

---

## 16. Debug API

Add or expose a debug snapshot:

```js
_wos.debug.studio.buildingAuthoring()
```

Suggested output:

```js
{
  selectionModeActive: true,
  hoveredFeatureId: "...",
  selectedFeatureId: "...",
  selectedSourceId: "...",
  selectedSourceLayer: "...",
  linkedActorId: "...",
  previewActive: true,
  suppressedCount: 1,
  lastError: null
}
```

If a standalone controller is not added, this can delegate to existing BuildingSelectionController / BuildingReplacementLayer instances.

---

## 17. Acceptance criteria

### AC1 — Hover highlight

```txt
Enable Select Building
Move cursor over a 3D building
Hovered building becomes visually distinct
Move away
Hover clears
```

### AC2 — Selected highlight

```txt
Click a building
Building remains visibly selected
Inspector shows Building Replacement card
```

### AC3 — Building info card

```txt
Inspector shows featureId/sourceId/sourceLayer/layerId/centroid
Optional existing feature properties appear only if available
```

### AC4 — Replacement preview

```txt
Before commit, selected building shows centroid/footprint/replacement preview
Preview does not write to actor manifest
```

### AC5 — Create replacement actor

```txt
Click Create Structure Replacement
DRAFT structure actor is created at building centroid
Actor is bound to selected building structure fields
Original Mapbox extrusion is suppressed
Actor becomes selected
```

### AC6 — Assign existing structure actor

```txt
Select building
Choose existing structure actor
Click Assign Existing Structure Actor
Actor moves to centroid
Actor binds to building
Original building suppresses
```

### AC7 — Restore original building

```txt
Select replaced building or linked actor
Click Restore Original Building
Mapbox extrusion returns
Actor remains in store but binding clears if governance allows
```

### AC8 — Delete linked Draft actor restores building

```txt
Create replacement actor
Delete Draft actor
Original building returns
No suppressed orphan remains
```

### AC9 — Map look compatibility

```txt
Select/replacement state survives switching Look dropdown between Authoring, Tron, Illustration
No Style is not done loading errors
```

### AC10 — No schema/publish/runtime drift

```bash
grep -R "hoveredBuilding\|selectedBuildingVisual\|replacementPreview\|buildingHoverState\|buildingSelectedState" studio/actors studio/systems/publish wall
```

Expected:

```txt
no output
```

Wall file drift check:

```bash
git diff -- wall
```

Expected:

```txt
no 0615E changes
```

---

## 18. Manual validation script

```txt
1. Open Studio → 3D Canvas
2. Select Look: Authoring
3. Click Select Building
4. Hover several buildings
5. Confirm hover highlight follows cursor
6. Click one building
7. Confirm selected highlight and Inspector card
8. Create Structure Replacement
9. Confirm actor appears visibly as structure proxy
10. Switch Look: Tron
11. Confirm replacement and selection survive
12. Switch Look: Illustration
13. Confirm replacement and selection survive
14. Restore Original Building
15. Confirm original extrusion returns
16. Publish Actors only after promoting if needed
17. Confirm no forbidden 0615E preview fields in bundle
```

---

## 19. Build constraints summary

```txt
Studio-only
UX-only over existing Phase 6 data
No Wall runtime changes
No publish schema changes
No actor manifest schema additions
No GLB import work
No material/texture system expansion
No Mapbox style hardcoding regression
```

---

## 20. Final lock

0615E is successful when building editing becomes visually understandable.

The goal is not to invent a new building system. The goal is to make the existing building selection/replacement system usable:

```txt
hover building
select building
understand building
preview replacement
commit replacement
restore original
```

