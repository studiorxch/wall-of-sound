---
layout: spec
title: "WOS 3D Canvas Lab Phase 6 Building Selection Replacement Authoring"
date: 2026-06-14
doc_id: "0614_WOS_3DCanvasLabPhase6BuildingSelectionReplacementAuthoring_v1.0.0_BUILD"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "authoring"
component: "3DCanvasLab"
type: "build-spec"
status: "approved"
priority: "high"
risk: "medium"
classification: "authoring-layer"
summary: "Phase 6: Building Selection and Replacement Authoring. Author clicks a Mapbox 3D building extrusion to select it by feature ID. A WOS structure actor is assigned and auto-snapped to the building footprint centroid. The Mapbox extrusion is suppressed via feature-state. Replacement persists across reload. Introduces BuildingSelectionController, BuildingReplacementLayer, and the structure.mapboxFeatureId manifest extension."
spec_version: "WOS-3DLAB-P6-v1.0.0"
depends_on:
  - "WOS-3DLAB-P5-v0.1.1"
  - "Mapbox GL JS"
  - "Three.js"
enables:
  - "BuildingSelectionController"
  - "BuildingReplacementLayer"
  - "MapboxFeatureStateSuppression"
  - "StructureActorCentroidSnap"
new_files:
  - "studio/views/buildingSelectionController.js"
  - "studio/views/buildingReplacementLayer.js"
updated_files:
  - "studio/views/threeDCanvasView.js"
  - "studio/views/actorObjectRenderLayer.js"
  - "studio/views/actorProxyGeometryFactory.js"
  - "studio/index.html"
  - "studio/styles.css"
doctrine:
  - "WOS never modifies Mapbox source data"
  - "Feature-state is derived display state reconstructible from manifest"
  - "Suppression applies in Lab to all actors with mapboxFeatureId, regardless of promoted status"
  - "Wall runtime suppression contract defined in Phase 8"
  - "One building to one actor binding enforced"
  - "mapboxFeatureId is optional — Phase 1-5 manifests valid unchanged"
tags:
  - "wos"
  - "3d-canvas-lab"
  - "building-selection"
  - "building-replacement"
  - "mapbox-feature-state"
  - "structure-actor"
  - "centroid-snap"
---

# WOS 3D Canvas Lab — Phase 6: Building Selection + Replacement Authoring

WOS 3D Canvas Lab
Phase 6: Building Selection + Replacement Authoring

---

**Doc ID:** Version
**Status:** Date
**Spec ref:** Depends on
**Requires:** New files
**Updated files:** Ship gate

---


## 1. Purpose and scope

Phase 5 made placed actors visible as 3D objects. Phase 6 makes the existing Mapbox 3D building layer interactive. Authors can now click any Mapbox building extrusion, select it by Mapbox feature ID, assign a WOS actor to replace it, and have the original extrusion suppressed so only the WOS actor renders in its place.
This is the first phase where WOS authoring directly modifies the Mapbox layer state. The authoring contract is precise: WOS never rewrites Mapbox data — it uses Mapbox feature-state to suppress specific features and renders a WOS actor at the building footprint centroid.

> **Ship gateAuthor clicks a Mapbox 3D building extrusion. The building is highlighted with a selection outline.Author assigns a WOS structure actor to the selected building. The actor auto-snaps to the building footprint centroid.The Mapbox building extrusion is suppressed via feature-state. Only the WOS actor renders in its place.The WOS actor manifest stores mapboxFeatureId. The suppression state is derived from the manifest on reload.Reloading the session restores all replacements: extrusions suppressed, WOS actors in place.Removing the replacement restores the original Mapbox extrusion.No manifest schema breaks Phase 1–5 actors. mapboxFeatureId is an optional extension field on structure actors only.**


## 2. Locked Phase 6 decisions


| Decision | Locked answer |
| --- | --- |
| Building selection model | Model A — click Mapbox 3D building extrusion, select by feature ID |
| Original extrusion on replace | Hide — suppress via Mapbox feature-state filter. Restore on actor removal. |
| Actor anchor placement | Auto-snap — anchor.lat/lon set from building footprint centroid on click |
| Manifest extension field | structure.mapboxFeatureId (optional, structure actors only) |
| Suppression mechanism | Mapbox setPaintProperty fill-extrusion-opacity + feature-state expression (wosReplaced) |
| Phase 5 actors affected | None — mapboxFeatureId is additive. All Phase 1–5 manifests valid unchanged. |
| Mapbox source requirement | 3D buildings layer must have generateId: true or stable feature IDs available |


## 3. Manifest extension — structure.mapboxFeatureId

Phase 6 introduces the first use of the structure? extension slot defined in WOSActorManifest v0.1. The slot was reserved as Record<string, never>. Phase 6 replaces that with a typed interface.

### 3.1 Extension interface

```js
  mapboxFeatureId: string | number | null;
  // Mapbox feature ID from the 3D buildings layer.
  // null = structure actor not bound to a Mapbox building.
  // Present = Mapbox extrusion is suppressed while this actor is present.

  mapboxSourceId: string | null;
  // Mapbox source ID (the source name, e.g. "composite").
  // Required when mapboxFeatureId is non-null.

  mapboxSourceLayer: string | null;
  // Source-layer within the source (for vector tilesets).
  // Required when mapboxFeatureId is non-null.
  // For Mapbox composite tiles: commonly "building".
  // Note: mapboxSourceLayer !== mapboxLayerId. Do not conflate.

  mapboxLayerId: string | null;
  // Mapbox layer ID of the rendered extrusion layer.
  // Required when mapboxFeatureId is non-null.
  // Example: "3d-buildings" (the layer, not the source-layer)
}
```


### 3.2 Extension rules


> **mapboxFeatureId contractstructure.mapboxFeatureId is only set on actorCategory: "structure" actors.Non-structure actors (maritime, vehicle, prop) MUST NOT have a structure extension block.null mapboxFeatureId means the structure actor is a free-placement actor (Phase 5 behaviour). No suppression applied.Non-null mapboxFeatureId means the actor is bound to a Mapbox building. Suppression is active while the actor is in the manifest store.The structure block is not part of the promotion gate in Phase 6. Suppression applies to all manifest actors regardless of promoted status.mapboxSourceId, mapboxSourceLayer, and mapboxLayerId are all required when mapboxFeatureId is non-null. Missing any one is a validation error. mapboxSourceLayer and mapboxLayerId are not the same field.**


### 3.3 Example manifest — building replacement actor

```js
{  "objectId":      "c3d4e5f6-a7b8-4c9d-0e1f-a2b3c4d5e6f7",  "actorCategory": "structure",  "actorType":     "building",  "assetId":       "sr_custom_tower_001",  "anchor": {    "lat":        40.7484,    "lon":       -73.9967,    "altM":       0,    "headingDeg": 0  },  "lod": { "highM": 500, "medM": 2000, "lowM": 8000, "billboardM": 20000 },  "scalars": { "continuityAlpha": null, "deadReckoningWeight": 0, ... },  "liveTracking": null,  "structure": {    "mapboxFeatureId": 1234567,    "mapboxSourceId":  "composite",    "mapboxLayerId":   "building"  },  "meta": {    "specVersion":  "1.0.0",    "authoredAt":   "2026-06-14T10:00:00Z",    "promoted":      false,    "displayLabel": "Custom Tower — Hudson Yards"  }}
```


## 4. Building selection interaction


### 4.1 Selection mode

Phase 6 introduces a Building Selection Mode toggle in the 3D Canvas toolbar. When active, clicks on the Mapbox 3D buildings layer are intercepted for building selection rather than actor placement.
1. Building Selection Mode and Actor Placement Mode are mutually exclusive. Activating one deactivates the other.
1. Building Selection Mode is indicated by a distinct cursor and a visible mode badge in the 3D Canvas.
1. Clicking empty canvas (no building hit) in Building Selection Mode deselects any selected building. No actor is placed.


### 4.2 Click-to-select sequence

Author activates Building Selection Mode.
Author clicks on a visible Mapbox 3D building extrusion.
The map.queryRenderedFeatures() call resolves the clicked feature at the pointer position, filtered to the 3D buildings layer.
The first returned feature provides the feature ID (feature.id) and geometry (feature.geometry).
BuildingSelectionController stores the selected feature ID, source ID, and layer ID.
The selected building receives a highlight: Mapbox setFeatureState sets wosSelected: true on the feature, and a layer paint expression renders selected buildings with a distinct outline colour (#00CED1 — matching the WOS actor selection colour).
BuildingSelectionController computes the building footprint centroid as the bounding-box center of feature.geometry (fallback: exterior ring average). Result stored as anchor.lat/lon.
The Inspector opens a Building Replacement panel showing the selected feature ID and centroid coordinates.


### 4.3 Centroid computation

```js
// Preferred: bounding-box center of selected feature geometry.
// Fallback: average of exterior ring vertices if bbox fails.

function flattenCoordinates(coords) {
  if (!Array.isArray(coords[0])) return [coords];
  if (!Array.isArray(coords[0][0])) return coords;
  return coords.flatMap(flattenCoordinates);
}

function computeBboxCenter(geometry) {
  const coords = flattenCoordinates(geometry.coordinates);
  let minLng = Infinity,  minLat = Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat);
  });
  return { lon: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
}

// Fallback: average of exterior ring vertices (Polygon only)
function computeRingCentroid(coordinates) {
  const ring = coordinates[0];
  const n = ring.length - 1;
  let sumLng = 0, sumLat = 0;
  for (let i = 0; i < n; i++) { sumLng += ring[i][0]; sumLat += ring[i][1]; }
  return { lon: sumLng / n, lat: sumLat / n };
}

// Entry point used by BuildingSelectionController
function computeCentroid(geometry) {
  try { return computeBboxCenter(geometry); }
  catch { return computeRingCentroid(geometry.coordinates); }
}
```


> **Centroid is a placement seed, not a permanent truthThe auto-snapped anchor.lat/lon is written to the manifest on actor creation.The author may then move the actor with the translate gizmo (Phase 5) to adjust position.The centroid is never re-computed after placement. Moving the actor does not re-derive the centroid.The centroid computation is a UX convenience, not a binding contract.**


### 4.4 Mapbox feature ID availability

Mapbox feature IDs are only available on sources with generateId: true or on tilesets with pre-assigned IDs. If a feature has no ID (feature.id is undefined), building selection must surface an error and not proceed.

> **Feature ID requirementIf feature.id is undefined on the clicked feature, BuildingSelectionController surfaces: "This building cannot be selected — the Mapbox source does not provide stable feature IDs."Do not generate a synthetic ID. Synthetic IDs are not stable across map reloads and cannot be used for suppression.The WOS project configuration must ensure the 3D buildings source has generateId: true or uses a tileset with pre-assigned feature IDs before Phase 6 is deployed.**


## 5. Building replacement flow


### 5.1 Replacement panel

When a building is selected, the Inspector shows a Building Replacement panel. This is an extension of the Phase 2 Inspector, not a separate UI.

| Panel field | Content |
| --- | --- |
| Selected building | Mapbox feature ID + centroid lat/lon (read-only) |
| Actor to place | Dropdown of structure actors from WOSActorManifestStore. Same dropdown as Library. "Place new structure actor" option at top. |
| Auto-snap preview | Inline map pin preview showing the centroid position before placement. |
| Assign button | Creates or binds the WOS actor. Triggers suppression. Writes manifest. |
| Clear replacement | Removes the binding. Restores Mapbox extrusion. Removes actor from store. |


### 5.2 New actor assignment sequence

Author selects a building (§4.2 complete).
Author clicks "Place new structure actor" in the panel.
A new WOSActorManifest is created with:
1. actorCategory: "structure", actorType: "building"
1. anchor.lat/lon set from building centroid (auto-snap)
1. anchor.altM: 0, anchor.headingDeg: 0
1. structure.mapboxFeatureId: feature.id
1. structure.mapboxSourceId: source ID of the clicked layer
1. structure.mapboxLayerId: layer ID of the 3D buildings layer
1. assetId: "wos_placeholder_cube" (author assigns real asset via Inspector)
1. meta.promoted: false
Manifest is written to WOSActorManifestStore atomically.
BuildingReplacementLayer calls map.setFeatureState and map.setPaintProperty to suppress the Mapbox extrusion (§6).
ActorObjectRenderLayer (Phase 5) renders the WOS actor at the centroid position.
Inspector opens the full actor properties panel for the new actor.


### 5.3 Existing actor assignment

If the author selects an existing structure actor from the dropdown rather than creating a new one, the flow is:
Selected existing actor's manifest is updated: structure.mapboxFeatureId, mapboxSourceId, mapboxLayerId are written.
Actor anchor.lat/lon is updated to the building centroid (auto-snap overrides existing position).
Manifest is written atomically.
Suppression is applied. Existing Mapbox extrusion hidden.
Actor moves to centroid position in the 3D Canvas.


> **One building, one actorA Mapbox feature ID may only be bound to one WOS actor at a time.If a building already has a bound actor and the author attempts to assign a second, the panel shows: "This building is already replaced by [displayLabel]. Clear the existing replacement first."An actor may only be bound to one building at a time. Assigning an already-bound actor to a second building clears the first binding automatically and restores the first building's extrusion.**


### 5.4 Removing a replacement

Author clicks "Clear replacement" in the Building Replacement panel, or deletes the actor from the Library.
structure.mapboxFeatureId is set to null on the manifest. Manifest written atomically.
BuildingReplacementLayer calls map.removeFeatureState to clear wosReplaced; the paint expression then restores the building to its previous opacity.
If the actor was deleted (not just unbound): actor manifest is removed from the store. Extrusion restored.
If the actor was unbound (mapboxFeatureId → null): actor remains in the store as a free-placement structure actor.


## 6. Mapbox extrusion suppression

WOS suppresses the original Mapbox 3D building extrusion using Mapbox feature-state. WOS does not delete, modify, or replace Mapbox data. It only marks features with a transient state flag that a layer filter reads.

### 6.1 Suppression mechanism — paint expression

```js
// Apply suppression when WOS actor is assigned
map.setFeatureState(
  {
    source:      actor.structure.mapboxSourceId,
    sourceLayer: actor.structure.mapboxSourceLayer,
    id:          actor.structure.mapboxFeatureId
  },
  { wosReplaced: true }
);

// Paint expression: set fill-extrusion-opacity to 0 for replaced buildings.
// BuildingReplacementLayer stores prevOpacity before calling setPaintProperty.
const prevOpacity = map.getPaintProperty(
  actor.structure.mapboxLayerId, "fill-extrusion-opacity"
) ?? 1;

map.setPaintProperty(actor.structure.mapboxLayerId, "fill-extrusion-opacity", [
  "case",
  ["boolean", ["feature-state", "wosReplaced"], false],
  0,
  prevOpacity
]);

// Restore when replacement is removed
map.removeFeatureState(
  {
    source:      actor.structure.mapboxSourceId,
    sourceLayer: actor.structure.mapboxSourceLayer,
    id:          actor.structure.mapboxFeatureId
  },
  "wosReplaced"
);
// The paint expression re-evaluates to prevOpacity automatically after removal.
```


### 6.2 Suppression lifecycle

1. Suppression is applied on actor assignment (new or existing actor bound to building).
1. Suppression is applied on session reload for all manifest actors with non-null mapboxFeatureId.
1. Suppression is removed when the actor is unbound (mapboxFeatureId → null) or deleted.
1. Suppression state is derived from the manifest on every session start. Feature-state is not persisted by Mapbox across sessions — BuildingReplacementLayer must reapply it on map load.
1. If map.setFeatureState fails (feature ID not found in rendered tiles), the failure is logged and surfaced as a DEGRADED warning on the actor. The WOS actor still renders — only the suppression silently fails.


> **Feature-state is session-only in MapboxMapbox feature-state does not persist across page reloads. BuildingReplacementLayer MUST reapply all suppressions on every map load event, reading from WOSActorManifestStore.This means suppression is only active after the map has loaded and BuildingReplacementLayer.mount() has been called.There is a brief window after page load where Mapbox extrusions may be visible before suppression is reapplied. This is acceptable in Phase 6.**


### 6.3 Layer filter ownership


> **BuildingReplacementLayer owns the 3D buildings layer filterBuildingReplacementLayer stores the previous fill-extrusion-opacity value, then installs the fill-extrusion-opacity paint expression on the Mapbox buildings layer on mount.No other Phase 6 code modifies the buildings layer paint property.If the filter is already set by another system, BuildingReplacementLayer must compose the paint expression with any existing opacity logic rather than overwriting it.On unmount, BuildingReplacementLayer restores the previous fill-extrusion-opacity paint property and clears all wosReplaced feature-states.**


## 7. New files


### 7.1 buildingSelectionController.js


| Field | Type | Description |
| --- | --- | --- |
| Location | string | studio/views/buildingSelectionController.js |
| Purpose | string | Owns building selection mode, feature pick, centroid computation, and selection highlight state |
| Depends on | string | Mapbox GL JS map instance, WOSActorManifestStore, WOSActorPlacementController |
| Does NOT own | string | Suppression, actor creation, manifest writes, Inspector state |

```js
class BuildingSelectionController {  constructor(map, manifestStore, placementController)  // Toggle building selection mode on/off  activateSelectionMode(): void  deactivateSelectionMode(): void  get isSelectionModeActive(): boolean  // Called by ThreeDCanvasView on map click in selection mode  handleMapClick(point: mapboxgl.Point): BuildingSelection | null  // Clear current building selection  clearSelection(): void  // Current selection  get selectedBuilding(): BuildingSelection | null}interface BuildingSelection {  featureId:    string | number  sourceId:     string  layerId:      string  centroid:     { lat: number; lon: number }  geometry:     GeoJSON.Geometry}
```


### 7.2 buildingReplacementLayer.js


| Field | Type | Description |
| --- | --- | --- |
| Location | string | studio/views/buildingReplacementLayer.js |
| Purpose | string | Owns Mapbox feature-state suppression lifecycle and buildings layer filter |
| Depends on | string | Mapbox GL JS map instance, WOSActorManifestStore |
| Does NOT own | string | Actor Object3D rendering (Phase 5), building selection, manifest writes |

```js
class BuildingReplacementLayer {  constructor(map, manifestStore)  // Call after map.on("load"). Installs filter, reapplies all suppressions.  mount(): void  // Call on teardown. Removes filter, clears all feature-states.  unmount(): void  // Suppress a specific building feature  suppress(featureId: string | number, sourceId: string, layerId: string): void  // Restore a specific building feature  restore(featureId: string | number, sourceId: string): void  // Reapply all suppressions from manifest store (called on map reload)  reapplyAll(): void}
```


## 8. Updated files


### 8.1 threeDCanvasView.js

1. Instantiate BuildingSelectionController and BuildingReplacementLayer on init.
1. Add Building Selection Mode toggle button to the 3D Canvas toolbar.
1. Route map click events to BuildingSelectionController.handleMapClick() when selection mode is active.
1. Route map click events to ActorPlacementController when placement mode is active.
1. Call BuildingReplacementLayer.mount() after map.on("load").
1. Pass BuildingSelectionController.selectedBuilding to Inspector via event.


### 8.2 actorObjectRenderLayer.js

1. No structural changes. Phase 5 render logic unchanged.
1. Structure actors with mapboxFeatureId render at anchor.lat/lon exactly like any other actor. The render layer does not know about Mapbox suppression — that is BuildingReplacementLayer's concern.


### 8.3 actorProxyGeometryFactory.js

1. No changes. Structure actors already receive the extruded box proxy (8m × 8m × 16m).


### 8.4 studio/index.html

1. Import buildingSelectionController.js and buildingReplacementLayer.js as modules.


### 8.5 studio/styles.css

1. Add Building Selection Mode cursor style (crosshair or custom SVG).
1. Add mode badge styles for the 3D Canvas toolbar.


## 9. Inspector updates — Phase 6

Phase 6 extends the Inspector with a Building Replacement section. This section is only visible when a building is selected in Building Selection Mode.

### 9.1 Building replacement section fields


| Field | Editable | Behaviour |
| --- | --- | --- |
| structure.mapboxFeatureId | No | Read-only. Set on building click. Displayed for author reference. |
| structure.mapboxSourceId | No | Read-only. Set from clicked layer context. |
| structure.mapboxSourceLayer | No | Read-only. Set from feature.sourceLayer on click. |
| structure.mapboxLayerId | No | Read-only. Set from clicked layer context. |
| Centroid lat/lon | No | Read-only preview. Becomes anchor.lat/lon on assignment. |
| Actor assignment | Yes | Dropdown of structure actors + "Place new" option. |
| Assign button | Yes | Writes manifest, applies suppression. |
| Clear replacement button | Yes | Unbinds actor, restores extrusion. |


### 9.2 Inspector validation

1. If mapboxFeatureId is non-null but mapboxSourceId, mapboxSourceLayer, or mapboxLayerId is missing: surface inline error "Building source, source-layer, or layer ID missing. Cannot apply suppression."
1. If the same mapboxFeatureId is already bound to another actor: surface inline error "Already replaced by [displayLabel]. Clear existing replacement first."
1. The Assign button is disabled while any validation error is active.


## 10. Controller summary — Phase 6


| Field | Type | Description |
| --- | --- | --- |
| BuildingSelectionController | NEW (Phase 6) | Building selection mode, feature pick, centroid computation, selection highlight. |
| BuildingReplacementLayer | NEW (Phase 6) | Mapbox feature-state suppression, buildings layer filter, session reload reapplication. |
| WOSActorManifestStore | Phase 1–5 | Unchanged. Phase 6 writes structure extension fields via existing update() method. |
| ActorObjectRenderLayer | Phase 5 | Unchanged. Structure actors with mapboxFeatureId render identically to free-placement actors. |
| WOSActorPlacementController | Phase 1–5 | Unchanged. Building selection mode deactivates placement mode via this controller. |
| InspectorController | Phase 2–4 | Extended with Building Replacement section. Reads BuildingSelectionController.selectedBuilding. |
| ThreeDCanvasView | Phase 5–6 | Mounts new controllers, routes click events by active mode. |


## 11. Explicitly out of scope in Phase 6


> **Do not build in Phase 6Building surface colour and texture editing. Phase 7.Bulk replacement of multiple buildings in one action.Building footprint editing or geometry modification.Replacement of non-building Mapbox features (roads, water, parks).Live feed binding for structure actors. Phase 4 governance path.Building replacement governance promotion. Phase 4 rules apply unchanged.Suppression of non-Mapbox geometry.Custom building height or floor count fields. Not in current manifest contract.Building search or filter by address or name.Undo/redo for building selection (undo/redo for actor placement and manifest writes still applies from Phase 3).**


## 12. Acceptance criteria


### AC1 — Building selection

1. Author activates Building Selection Mode. Cursor and mode badge change.
1. Clicking a Mapbox 3D building extrusion selects it. Feature ID is resolved. Building receives selection highlight (#00CED1 outline).
1. Clicking empty canvas deselects. Selection highlight removed.
1. Clicking a building with no feature ID surfaces the error message from §4.4.


### AC2 — Actor assignment and auto-snap

1. Author assigns a new structure actor. Manifest is created with mapboxFeatureId, mapboxSourceId, mapboxLayerId, and anchor.lat/lon from centroid.
1. Author assigns an existing structure actor. Manifest is updated. anchor.lat/lon overwritten with centroid.
1. One building → one actor constraint enforced. Second assignment surfaces error message.
1. WOS actor is visible in the 3D Canvas at the centroid position immediately after assignment.


### AC3 — Mapbox extrusion suppression

1. After actor assignment, the Mapbox 3D building extrusion is no longer visible.
1. Only the WOS actor renders at the building position.
1. Suppression is reapplied on session reload. Extrusion not visible after reload.
1. Clearing the replacement restores the Mapbox extrusion.


### AC4 — Reload persistence

1. After a full page reload, all replacement actors render at their centroid positions.
1. All suppressed Mapbox extrusions remain suppressed after reload.
1. No manual re-assignment is needed after reload.


### AC5 — Phase 5 compatibility

1. All Phase 5 ship gate criteria still pass after Phase 6 is installed.
1. Free-placement structure actors (mapboxFeatureId: null) continue to work exactly as in Phase 5.
1. No Phase 1–4 actor manifests are modified or invalidated by Phase 6 code.


### AC6 — Architecture constraints

1. No second Mapbox map instance is created.
1. WOS does not modify Mapbox source data. Only feature-state is written.
1. BuildingReplacementLayer.unmount() restores the buildings layer to its pre-Phase-6 state.
1. No second WebGL context is created.


## Appendix A: Mapbox feature-state reference

Summary of the Mapbox GL JS feature-state API used in Phase 6 for implementer reference.
```js
// Set feature state (suppress building)
map.setFeatureState(
  { source: sourceId, sourceLayer: mapboxSourceLayer, id: featureId },
  { wosReplaced: true }
);

// Paint expression to hide replaced buildings (store prevOpacity first)
map.setPaintProperty(layerId, "fill-extrusion-opacity", [
  "case",
  ["boolean", ["feature-state", "wosReplaced"], false],
  0,
  prevOpacity
]);

// Read feature state (for debugging)
const state = map.getFeatureState(
  { source: sourceId, sourceLayer: mapboxSourceLayer, id: featureId }
);

// Remove feature state (restore building — paint expression evaluates to prevOpacity)
map.removeFeatureState(
  { source: sourceId, sourceLayer: mapboxSourceLayer, id: featureId },
  "wosReplaced"
);

// On BuildingReplacementLayer.unmount(): restore original paint property
map.setPaintProperty(layerId, "fill-extrusion-opacity", prevOpacity);

// Query rendered features for building pick
const features = map.queryRenderedFeatures(point, { layers: [layerId] });
const feature = features[0]; // closest to click point
```


## Appendix B: Phase 6 doctrine notes

```js
WOS never modifies Mapbox datafeature-state is a client-side transient annotation. It is not written to the Mapbox tileset.If the Mapbox source reloads (tile refresh), feature-state may be lost on individual tiles. BuildingReplacementLayer.reapplyAll() handles this via the map.on("sourcedata") or map.on("idle") event.The manifest is the only persistent record of which buildings are replaced. Feature-state is a derived display state, always reconstructible from the manifest.
```


> **Suppression is authoring state, not governance stateSuppression applies to all manifest actors with non-null mapboxFeatureId, regardless of meta.promoted status.An unpromoted Draft actor can suppress a Mapbox building in the Lab. This is intentional — the author needs to see the replacement during authoring.In the Wall runtime, suppression should only apply to promoted actors. Phase 8 (Production Publish) defines the runtime suppression contract. Phase 6 scope is authoring-layer only.**


## Appendix C: Spec revision history


| Version | Date | Notes |
| --- | --- | --- |
| v1.0.0 | 2026-06-14 | Initial BUILD. Model A building selection, auto-snap centroid, hide suppression via feature-state, structure.mapboxFeatureId extension, BuildingSelectionController and BuildingReplacementLayer. |
