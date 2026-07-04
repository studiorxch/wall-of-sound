---

layout: spec 
title: "WOS 3D Canvas Lab Phase 5 Object Render Layer" 
date: 2026-06-13 
doc_id: "0613_WOS_3DCanvasLabPhase5ObjectRenderLayer_v1.0.0_BUILD" 
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

summary: "Phase 5 3D Actor Object Render Layer. Adds ActorObjectRenderLayer and ActorProxyGeometryFactory. Actors appear as loaded GLB instances or deterministic proxy Object3Ds in the 3D Canvas Mapbox custom layer. Cyan outline + ground ring selection. Translate and rotate gizmo sync. Reload persistence. No manifest schema changes. No governance lifecycle changes." 

spec_version: "WOS-3DLAB-P5-v0.1.1" 
depends_on:

- "WOS-3DLAB-P1-v0.1 through WOS-3DLAB-P4-v0.1"
- "Mapbox GL JS"
- "Three.js" 

enables:
- "3DActorObjectRenderLayer"
- "ActorProxyGeometryFactory"
- "SelectionHighlightSystem"
- "GizmoTransformSync" 
- new_files:
- "studio/views/actorObjectRenderLayer.js"
- "studio/views/actorProxyGeometryFactory.js" 
updated_files:
- "studio/views/threeDCanvasView.js"
- "studio/index.html"
- "studio/styles.css" 
tags:
- "wos"
- "3d-canvas-lab"
- "actor-render"
- "proxy-geometry"
- "selection-highlight"
- "mapbox-custom-layer"
- "three-js"

---

# WOS 3D Canvas Lab — Phase 5: 3D Actor Object Render Layer

WOS 3D Canvas Lab Phase 5 Specification: 3D Actor Object Render Layer

---

**Spec ID:** Status **Authors:** Date **Depends on:** Requires **New files:** Updated files

---

## 1. Purpose and scope

Phases 1–4 built the authoring infrastructure: place, configure, govern. Phase 5 makes authoring visible. Actors placed in the 3D Canvas must now appear as loaded asset instances or proxy Object3Ds — not Mapbox markers, not invisible points, not placeholder cubes indistinguishable from one another. Phase 5 introduces two new modules — the Actor Object Render Layer and the Proxy Geometry Factory — and connects them to the existing 3D Canvas, manifest store, and asset resolver. No governance rules change. No manifest schema changes. The goal is visibility, selection, transform sync, and reload correctness.

> **Ship gatePlace a Generic Vessel actor. It appears as a visible 3D or proxy object on the map.Select the actor. A cyan outline and cyan ground ring appear. No other actor is highlighted.Move the actor with the translate gizmo. The 3D or proxy object moves with it in real time.Rotate the actor with the rotate gizmo. The visible heading updates correctly.Reload the session. The object reappears at its saved position and heading.The manifest still stores assetId only. assetPath does not appear anywhere in wos-actors.json.No governance lifecycle rules are changed by Phase 5.**

## 2. Locked Phase 5 decisions

|Decision|Locked answer|
|---|---|
|Proxy geometry when GLB unavailable|Deterministic low-poly shape per actorCategory. Shape map locked in §4.|
|Selection highlight visual contract|Cyan outline on object + cyan ground ring. No material colour mutation. No wireframe.|
|Mapbox role|Ground truth for geographic positioning. Phase 5 does not replace or fork it.|
|Marker fallback|Mapbox markers remain available as debug/fallback only. Not the primary render path.|
|assetPath in manifest|Never stored. assetId is the only asset reference. AssetResolver owns path resolution.|
|Governance impact|Zero. Phase 5 adds no new governance checks, states, or registry entries.|

## 3. Architecture — new layer, existing boundaries

Phase 5 inserts the Actor Object Render Layer between the manifest store and the Three.js scene. All existing controller boundaries from Phases 1–4 remain unchanged.

> **WOSActorManifestStore ↓ (read actors on load, subscribe to mutations)ActorObjectRenderLayer ← NEW (actorObjectRenderLayer.js) ↓ (resolve assetId)WOSAssetResolver ↓ (load GLB or request proxy)ActorProxyGeometryFactory ← NEW (actorProxyGeometryFactory.js) ↓ (produce Three.js Object3D)ThreeDCanvasView ← UPDATED (mounts render layer, routes gizmo events) ↓ (renders to)Three.js scene owned by the 3D Canvas Mapbox custom layer**

### 3.1 Actor Object Render Layer responsibilities

1. actorObjectRenderLayer.js owns:
2. Reading the full actor list from WOSActorManifestStore on mount.
3. Subscribing to store mutations (add, update, remove) and syncing the scene.
4. Calling WOSAssetResolver.resolve(assetId) to get the GLB URL or path.
5. Loading GLB via Three.js GLTFLoader when resolved.
6. Requesting a proxy from ActorProxyGeometryFactory when GLB is unavailable.
7. Positioning each Object3D at anchor.lat, anchor.lon, anchor.altM using Mapbox MercatorCoordinate projection inside the 3D Canvas custom layer.
8. Applying anchor.headingDeg as a Y-axis rotation on the Object3D.
9. Managing the selection highlight state — outline and ground ring — in response to WOSActorPlacementController selection events.
10. Updating Object3D position and heading in real time during gizmo drag (from GizmoController transient preview).

### 3.2 Actor Object Render Layer does NOT own

1. Manifest reads or writes — those route through ActorManifestStore.
2. Coordinate projection math — uses Mapbox MercatorCoordinate inside the 3D Canvas custom layer. Does not reimplement.
3. Gizmo interaction — GizmoController publishes position updates; the render layer consumes them.
4. Selection logic — WOSActorPlacementController owns what is selected; the render layer renders the highlight.
5. Asset path resolution — WOSAssetResolver owns this. The render layer only calls resolve().
6. A second WebGL context — uses the shared Three.js scene. No new renderer.

> **No second renderer — carried from Phase 1The Actor Object Render Layer adds Object3D instances to the existing Three.js scene.It does not create a new WebGL context, a new Three.js renderer, or a new scene graph.Violation of this constraint is a blocking defect regardless of phase.Verified at acceptance time by confirming document.querySelectorAll("canvas").length is unchanged after render layer mount.**

### 3.3 Scene Projection Truth

Object3D instances are disposable visual projections of WOSActorManifest truth. The manifest remains canonical. The render layer may reconstruct, remove, replace, or reload Object3D instances at any time from manifest state. No Object3D transform is authoritative unless it has been committed back through the existing manifest write path. During gizmo drag, Object3D position and heading may preview transient state. On gizmo release, the committed anchor.lat, anchor.lon, anchor.altM, and anchor.headingDeg in WOSActorManifest become the only persistent truth.

> **Selection state is authoring session state onlySelection MUST NOT be written to WOSActorManifest or wos-registry.json.Selection is cleared on session reload. It is not part of the manifest contract.The render layer reads selection state from WOSActorPlacementController. It never writes it back to the store.**

### 3.4 Render Layer Governance Note

ActorObjectRenderLayer is a Phase 5 coordination layer. It coordinates actor Object3D lifecycle, asset and proxy resolution, selection highlight rendering, gizmo preview updates, and store-to-scene synchronisation.

> **ActorObjectRenderLayer must not become a God layerAsset loading policy — future asset pipeline spec.Material override policy — Phase 7.Animation policy — not in current manifest contract.Runtime feed motion (AIS, GTFS-RT, GBFS) — AISRuntime concern.Governance lifecycle — Phase 4 is complete and unchanged.Production publish behaviour — Phase 8.Wall runtime rendering behaviour — Wall Runtime Architecture spec.Building surface editing — Phase 7.LOD switching policy — future rendering phase.**

Future expansion must split those concerns into dedicated systems rather than expanding ActorObjectRenderLayer.

## 4. Actor Proxy Geometry Factory

When WOSAssetResolver cannot resolve an assetId to a GLB, the render layer requests a proxy from ActorProxyGeometryFactory. The factory returns a deterministic Three.js Object3D based on actorCategory and actorType.

### 4.1 Locked proxy shape map

Proxy geometry must communicate category at a glance. It does not need final art fidelity. These shapes are locked for Phase 5 and may only be changed by a new spec.

|actorCategory|actorType examples|Proxy geometry|Approximate dimensions|
|---|---|---|---|
|prop|static_marker, signage, custom|Unit cube|1m × 1m × 1m|
|structure|building, bridge, tower, facility|Extruded box — taller than wide|8m × 8m × 16m|
|maritime|vessel, buoy, beacon, mooring|Hull wedge — tapered bow, flat stern|20m × 6m × 4m|
|vehicle|land_vehicle, rail, emergency|Rectangular vehicle body|4m × 2m × 1.5m|
|vehicle|aircraft|Fuselage cylinder + wing cross planes|30m span × 4m fuselage|

### 4.2 Proxy colour coding

Each actorCategory receives a distinct proxy material colour so authors can identify category at a glance even before GLB assets are loaded. Colours are muted, not saturated — they must not be mistaken for selection highlights.

|actorCategory|Proxy material colour|Hex|
|---|---|---|
|prop|warm grey|#8B8680|
|structure|stone beige|#A89880|
|maritime|ocean blue|#4A7FA5|
|vehicle|slate green|#5A7A6A|
|aircraft|sky silver|#9AAAB8|

### 4.3 Factory interface

```js
interface ActorProxyGeometryFactory {  /**   * Returns a Three.js Object3D sized and coloured for the given actor.   * Object is centred at origin. Caller positions it in world space.   * Returned object is NOT shared — each call produces a new instance.   */  create(    actorCategory: ActorCategory,    actorType:     ActorType  ): THREE.Object3D}
```

> **Proxy geometry rulesProxy geometry is produced only when WOSAssetResolver.resolve() fails or returns null.The proxy is a Three.js Object3D created with BufferGeometry and MeshLambertMaterial. No PBR materials on proxies.Each call to create() returns a new instance. Proxies are not shared or cached by the factory.The factory does not read from the manifest store directly. actorCategory and actorType are passed in by the render layer.Proxy dimensions are in world metres. The render layer applies no additional scale transform.If actorType is "aircraft" within category "vehicle", the aircraft proxy is used. All other vehicle types receive the rectangular body proxy.**

## 5. Selection highlight — cyan outline + ground ring

Per the locked Phase 5 decision: selection highlight is a cyan outline on the selected object plus a thin cyan ground ring. No material colour mutation. No wireframe overlay.

### 5.1 Rationale

1. Material colour swap corrupts the intended palette of any loaded GLB asset. Rejected.
2. Wireframe overlay makes proxy geometry visually noisy and is not meaningful on low-poly shapes. Rejected.
3. Outline + ground ring is non-destructive, readable at any camera angle, and consistent with selection models in professional 3D tools.

### 5.2 Outline specification

1. Method: Post-processing outline pass (recommended: Three.js OutlinePass / EffectComposer). Implementation may vary provided the visual outcome contract in Appendix B is met.
2. Colour: #00CED1 (dark turquoise / cyan). Hex locked. Not configurable by author in Phase 5.
3. Thickness: 3px at default viewport scale. Does not scale with camera distance.
4. Scope: Applied to the entire selected Object3D including all child meshes. Not per-mesh.
5. Exclusivity: Only the currently selected actor receives the outline. Deselecting removes it immediately.

### 5.3 Ground ring specification

1. Shape: Flat circle in the XZ plane (horizontal ground plane) centred at the actor anchor position.
2. Radius: Computed from the bounding box of the actor Object3D. Ring radius = max(boundingBox.x, boundingBox.z) / 2 + 0.5m margin.
3. Colour: #00CED1 — matches outline. Opacity: 0.6.
4. Line width: 2px. Rendered with Three.js Line / LineLoop at ground level (y = anchor.altM).
5. LOD ring relationship: The ground ring is a selection indicator only. It is separate from and must not be confused with the LOD preview rings (Phase 3). LOD rings appear at highM, medM, lowM distances. The selection ground ring is actor-sized.
6. Gizmo follow: The ground ring updates position during translate gizmo drag, in sync with the actor mesh. Reads from the GizmoController move event, not the manifest.

#### Ground Ring Sizing Authority

Ground ring radius MUST be computed from the selected Object3D world-space bounding box after all object transforms and metre-to-Mercator scaling are applied.

```js
const box = new THREE.Box3().setFromObject(object3D);const width  = box.max.x - box.min.x;const depth  = box.max.z - box.min.z;const radius = Math.max(width, depth) / 2 + (0.5 * meterScale);
```

1. The ring is a visual selection affordance only. The ring radius is not persisted to the manifest.
2. The ring MUST be rebuilt or resized whenever the selected Object3D is replaced, including proxy-to-GLB replacement after asynchronous GLB load.

### 5.4 Selection Authority

ActorObjectRenderLayer MAY expose pick targets for Object3D instances in the scene. It MUST NOT determine or persist selected actor identity.

> **All selection changes MUST route through WOSActorPlacementControllerWOSActorPlacementController.select(objectId) is the sole selection authority for Phase 5.ActorObjectRenderLayer only observes the resulting selection event and updates the visual highlight.Clicking a visible Object3D may initiate a pick request. The render layer resolves the objectId and forwards it to WOSActorPlacementController.select() — it does not set selection state internally.Selection state must never be stored inside ActorObjectRenderLayer as authoritative state.**

## 6. GLB loading via WOSAssetResolver

### 6.1 Resolution sequence

ActorObjectRenderLayer calls WOSAssetResolver.resolve(actor.assetId). If resolve() returns a URL or path: load GLB using Three.js GLTFLoader. If resolve() returns null or throws: request proxy from ActorProxyGeometryFactory. Place the resulting Object3D in the scene at the actor anchor coordinates. Store a reference to the Object3D keyed by actor objectId for later mutation.

### 6.2 GLB loading rules

1. GLTFLoader loads the GLB asynchronously. The actor position is placed immediately on load completion.
2. While the GLB is loading, show the proxy geometry at the actor anchor as a placeholder. Replace with the GLB on load completion.
3. If GLB load fails after resolve() returned a URL, fall back to proxy geometry. Log the failure. Do not surface an error to the author unless they inspect the actor.
4. Instancing: When multiple actors share the same assetId, the render layer loads the GLB once and produces separate Object3D instances via scene.clone() or SkinnedMesh cloning. One network request per unique assetId, N scene instances.

### 6.3 assetPath is never written

> **assetPath prohibition — carried from Phase 1The render layer calls WOSAssetResolver.resolve(assetId) to get a URL or path.That resolved URL or path is used only to load the GLB. It is never written to the actor manifest.The actor manifest stores assetId only. wos-actors.json must never contain assetPath, assetUrl, gltfPath, glbPath, or any equivalent field.This is a Phase 1 invariant. Phase 5 does not relax it.**

## 7. Coordinate mapping — lat/lon to Three.js world space

The render layer uses Mapbox MercatorCoordinate projection inside the 3D Canvas custom layer to convert actor anchor.lat and anchor.lon to Three.js world-space coordinates. It does not depend on Wall MarineRenderer. No second Mapbox map is created.

### 7.1 Position mapping

```js
// Mapbox MercatorCoordinate projection inside 3D Canvas custom layerconst mercator = mapboxgl.MercatorCoordinate.fromLngLat(  { lng: actor.anchor.lon, lat: actor.anchor.lat },  actor.anchor.altM);object3D.position.set(  mercator.x,  mercator.y,  mercator.z);
```

### 7.2 Heading mapping

```js
// headingDeg is nautical/compass heading: 0 = north, 90 = east// Three.js Y-axis rotation: 0 = positive Z, positive rotation = counter-clockwise// Conversion: negate and convert to radiansobject3D.rotation.y = -THREE.MathUtils.degToRad(actor.anchor.headingDeg);
```

### 7.3 Gizmo drag update

During translate gizmo drag, the GizmoController emits move and rotate events for transient preview state. The render layer subscribes to these updates and moves the Object3D to the preview position on every frame. The manifest is not read during drag. On drag release, the manifest is updated and the render layer re-syncs from the store.

```js
// GizmoController event during draggizmoController.on("move", ({ lat, lon }) => {  const mercator = mapboxgl.MercatorCoordinate.fromLngLat({ lng, lat }, altM);  actorObject3D.position.set(mercator.x, mercator.y, mercator.z);  selectionGroundRing.position.set(mercator.x, mercator.y, mercator.z);});
```

### 7.4 Metre Scale Authority

Proxy geometry and GLB dimensions are treated as metres. Inside the Mapbox custom layer, metre dimensions MUST be converted to Mercator coordinate units using the actor anchor’s local Mercator scale.

```js
const mercator = mapboxgl.MercatorCoordinate.fromLngLat(  { lng: actor.anchor.lon, lat: actor.anchor.lat },  actor.anchor.altM);const meterScale = mercator.meterInMercatorCoordinateUnits();object3D.scale.set(  meterScale,  meterScale,  meterScale);
```

1. ActorProxyGeometryFactory creates geometry in metre units.
2. ActorObjectRenderLayer owns conversion from metre-authored geometry to Mapbox custom-layer scene units.
3. No manifest field stores this scale conversion. The conversion is render-time presentation state only.

## 8. File specifications

### 8.1 actorObjectRenderLayer.js — new file

|Field|Type|Description|
|---|---|---|
|Location|string|studio/views/actorObjectRenderLayer.js|
|Purpose|string|Owns the full lifecycle of actor Object3D instances in the Three.js scene|
|Exports|string|ActorObjectRenderLayer class|
|Depends on|string|WOSActorManifestStore, WOSAssetResolver, ActorProxyGeometryFactory, WOSActorPlacementController, GizmoController, Mapbox MercatorCoordinate (via 3D Canvas custom layer)|
|Does NOT depend on|string|InspectorController, UndoRedoController, LibraryController, PromotionGateController|

Required public API:

```js
class ActorObjectRenderLayer {  constructor(scene: THREE.Scene, dependencies: {...})  // Called by ThreeDCanvasView on mount  mount(): Promise<void>    // Loads all actors from store, builds Object3D for each  // Called by ThreeDCanvasView on unmount  unmount(): void    // Removes all Object3D instances from scene  // Called by WOSActorPlacementController on selection change  setSelection(objectId: string | null): void    // Applies/removes outline + ground ring  // Called by GizmoController during drag  setPreviewAnchor(objectId: string, lat: number, lon: number): void    // Moves Object3D to preview position without manifest write  // Called by WOSActorManifestStore on mutation  onActorAdded(manifest: WOSActorManifest): Promise<void>  onActorUpdated(manifest: WOSActorManifest): Promise<void>  onActorRemoved(objectId: string): void}
```

### 8.2 actorProxyGeometryFactory.js — new file

|Field|Type|Description|
|---|---|---|
|Location|string|studio/views/actorProxyGeometryFactory.js|
|Purpose|string|Produces deterministic Three.js Object3D proxy instances per actorCategory / actorType|
|Exports|string|ActorProxyGeometryFactory class|
|Depends on|string|Three.js (BufferGeometry, MeshLambertMaterial, Mesh)|
|Does NOT depend on|string|WOSActorManifestStore, WOSAssetResolver — no other controllers|

### 8.3 threeDCanvasView.js — updated

1. Mount ActorObjectRenderLayer after scene initialisation.
2. Pass scene reference, Mapbox MercatorCoordinate projection context, and controller dependencies to the render layer constructor.
3. Route GizmoController move events to ActorObjectRenderLayer.setPreviewAnchor(). Route GizmoController rotate events to ActorObjectRenderLayer heading update.
4. Route WOSActorPlacementController selection events to ActorObjectRenderLayer.setSelection().
5. Route WOSActorManifestStore mutation events to the render layer onActor* methods.
6. Unmount ActorObjectRenderLayer cleanly when ThreeDCanvasView unmounts.

### 8.4 studio/index.html — updated

1. Import actorObjectRenderLayer.js and actorProxyGeometryFactory.js as modules.
2. No new DOM elements required. The render layer operates inside the existing Three.js canvas.

### 8.5 studio/styles.css — updated

1. No structural layout changes required.
2. If the selection highlight requires any DOM overlay (e.g. a CSS ring element as fallback), styles go here. Preferred implementation is Three.js LineLoop — no CSS required.

## 9. Scene load sequence on startup

ThreeDCanvasView initialises the Three.js scene (existing behaviour). ThreeDCanvasView calls actorObjectRenderLayer.mount(). Render layer reads all actors from WOSActorManifestStore. For each actor: calls WOSAssetResolver.resolve(actor.assetId). If resolved: begins GLB load. Shows proxy at anchor position immediately while loading. If not resolved: shows proxy at anchor position. No error shown to author. On GLB load completion: replaces proxy with loaded GLB Object3D at same position. Render layer subscribes to store mutations for subsequent add/update/remove events. Render layer subscribes to GizmoController move and rotate events for real-time drag updates. Render layer subscribes to WOSActorPlacementController selection events.

> **Load order is not guaranteedMultiple actors load concurrently. Object3D instances appear in the scene as each GLB load completes.This is acceptable and intentional. The author sees actors appear progressively on startup.Proxy geometry ensures no actor is ever invisible — even if its GLB has not yet loaded.**

## 10. Explicitly out of scope in Phase 5

> **Do not build in Phase 5LOD switching per viewer distance. Phase 5 renders the full GLB or proxy regardless of distance. LOD switching is a future rendering phase concern.Shadow casting or receiving. No lighting changes in Phase 5.Animation or skinned mesh playback. Static placement only.Per-face or per-mesh material overrides. Phase 7.Building selection from Mapbox feature pick. Phase 6.Live feed position updates (AIS, GTFS-RT, GBFS). Feed runtime is a separate concern from the Lab render layer.Batch actor instancing optimisation beyond the single-GLB-per-assetId rule.Actor visibility culling or frustum culling beyond Three.js defaults.Asset registry enumeration changes. Phase 3 Library owns this.Any governance lifecycle changes. Phase 4 is complete and unchanged.**

## 11. Acceptance criteria

These map directly to the eight acceptance criteria in the Phase 5 implementation brief, with implementation detail added.

### AC1 — Place Generic Vessel

1. Author places an actor with actorCategory: "maritime", actorType: "vessel".
2. If no GLB is assigned: a hull wedge proxy appears at the placement position in the correct orientation.
3. If a GLB is assigned: the GLB appears at the placement position after load.

### AC2 — Actor appears as visible 3D or proxy object on the map

1. Every actor in the manifest store has a corresponding visible Object3D in the Three.js scene after render layer mount.
2. No actor is invisible, missing, or represented only by a Mapbox marker after Phase 5.
3. Proxy geometry colour and shape match the locked shape map in §4.

### AC3 — Selecting actor highlights the 3D or proxy object

1. Clicking a visible actor Object3D initiates a pick. The render layer forwards the resolved objectId to WOSActorPlacementController.select().
2. The selected actor receives a cyan outline (colour #00CED1, thickness 3px).
3. The selected actor receives a cyan ground ring (colour #00CED1, opacity 0.6).
4. No other actor in the scene has an outline or ring when one actor is selected.
5. Deselecting (clicking empty canvas) removes both outline and ring immediately.
6. Selection does not modify any material property on the Object3D.

### AC4 — Moving actor with translate gizmo moves the 3D or proxy object

1. Dragging the translate gizmo handle moves the Object3D in real time.
2. The ground ring moves with the Object3D during drag.
3. On gizmo release, the final position is written to the manifest store and the Object3D is repositioned from the updated manifest.
4. The Object3D position after reload matches the manifest anchor.lat / anchor.lon.

### AC5 — Rotating actor with rotate gizmo updates visible heading

1. Dragging the rotate gizmo arc handle rotates the Object3D around its Y axis.
2. The visual rotation matches anchor.headingDeg using the heading conversion formula in §7.2.
3. Heading wraps correctly at 0° and 360°.
4. On gizmo release, the final headingDeg is written to the manifest store.

### AC6 — Reload restores object position, heading, and selection behaviour

1. After a full page reload, all actors appear at their saved anchor.lat, anchor.lon, anchor.altM positions.
2. Saved anchor.headingDeg is applied as a Y rotation on reload.
3. Selection (click → outline + ring) works correctly after reload.
4. No actor reverts to a different position or heading on reload.

### AC7 — Manifest stores assetId, never assetPath

1. After any Phase 5 operation (place, move, rotate, reload), wos-actors.json contains assetId for each actor.
2. wos-actors.json does not contain assetPath, assetUrl, gltfPath, glbPath, or any path-like field on any actor.
3. Automated test: JSON.parse(wos-actors.json).actors.forEach(a => assert(!a.assetPath && !a.assetUrl)).

### AC8 — No governance lifecycle rules changed

1. The promotion gate checklist (Phase 4 §6) is unchanged.
2. The canonical actor registry (wos-registry.json) is not modified by any Phase 5 code path.
3. meta.promoted values in wos-actors.json are not altered by the render layer.
4. No new gate checks, new state machine states, or new registry fields are introduced.

### AC9 — Architecture constraint

1. document.querySelectorAll("canvas").length is identical before and after ActorObjectRenderLayer.mount(). Verified in browser DevTools.
2. ActorObjectRenderLayer does not import or instantiate a second THREE.WebGLRenderer.

## 12. Controller updates summary

|Field|Type|Description|
|---|---|---|
|ActorObjectRenderLayer|NEW (Phase 5)|Full lifecycle of actor Object3D instances. Selection highlight. Gizmo preview sync.|
|ActorProxyGeometryFactory|NEW (Phase 5)|Produces deterministic proxy Object3D per actorCategory / actorType.|
|ThreeDCanvasView|UPDATED|Mounts render layer. Routes selection, gizmo, and store events to render layer.|
|WOSActorManifestStore|Phase 1–4|Unchanged. Render layer subscribes to its mutation events.|
|WOSActorPlacementController|Phase 1–4|Unchanged. Render layer subscribes to its selection events and forwards Object3D pick results through WOSActorPlacementController.select(objectId).|
|GizmoController|Phase 3–4|Unchanged. Render layer subscribes to move / commit / rotate / rotate-commit events for transient preview and final transform sync.|
|WOSAssetResolver|Phase 1–2|Unchanged. Render layer calls resolve() only.|

## Appendix A: Proxy geometry reference

Visual reference descriptions for the five proxy shapes. These are low-poly Three.js geometries, not concept art.

|Category|Geometry primitives|Notes|
|---|---|---|
|prop|BoxGeometry(1, 1, 1)|Unit cube. Centred at origin. No modification.|
|structure|BoxGeometry(8, 16, 8)|Tall box. Origin at base centre. Simulates building mass.|
|maritime|Custom BufferGeometry — tapered front, flat rear, low profile|Four vertices at hull corners, tapered to a bow point at +Z. 4m tall max. Represents hull plan.|
|vehicle|BoxGeometry(4, 1.5, 2)|Flat rectangular body. Origin at base centre. Represents vehicle footprint.|
|aircraft|CylinderGeometry(0.5, 0.5, 30) + two PlaneGeometry(15, 1) wings|Long fuselage cylinder. Two flat wing planes crossing at 90° at midpoint. Wings in XZ plane.|

## Appendix B: Selection Highlight Implementation Note

The locked Phase 5 visual contract is: selected actor = cyan object outline (#00CED1) + cyan ground ring (#00CED1). The governance contract is the visual outcome, not the post-processing implementation. The preferred implementation MAY use Three.js EffectComposer and OutlinePass, but any implementation is acceptable provided it satisfies all conditions below. Only the selected Object3D is outlined. No other actor receives an outline. The outline colour is #00CED1. The outline is visually readable at normal authoring zoom levels. No material properties on the actor Object3D or child meshes are mutated. Deselecting removes the outline immediately. The ground ring remains visually and logically separate from LOD preview rings. No second renderer or WebGL context is created. If OutlinePass is used, it must operate within the existing 3D Canvas Mapbox custom layer rendering path, not in a standalone renderer.

## Appendix C: Spec revision history

|Version|Date|Notes|
|---|---|---|
|v0.1.1|2026-06-13|v0.1: Initial draft. v0.1.1: Metre scale authority (§7.4), scene projection truth (§3.3), selection authority (§5.4), ground ring sizing authority (§5.3), render layer governance note (§3.4), Appendix B normalised, controller summary corrected, vocabulary cleaned.|