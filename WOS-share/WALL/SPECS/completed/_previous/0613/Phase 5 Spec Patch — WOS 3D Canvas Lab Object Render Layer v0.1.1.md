# Phase 5 Spec Patch — WOS 3D Canvas Lab Object Render Layer v0.1.1

## Context

We are updating:

```txt
WOS 3D Canvas Lab — Phase 5 Specification: 3D Actor Object Render Layer
```

Current source file:

```txt
WOS-3DLAB-P5-v0.1
```

Goal:

Patch the Phase 5 spec before BUILD conversion.

Do **not** rewrite the architecture. This is a clarification patch only.

The current spec is structurally correct, but the constitutional review flagged governance precision issues:

1. Selection authority ambiguity.
    
2. Scene Object3D truth vs manifest truth not explicitly locked.
    
3. Metre-to-scene scale authority undefined.
    
4. Ground ring bounding box sizing authority undefined.
    
5. Render-layer authority accumulation risk.
    
6. Appendix B is too implementation-specific.
    

After this patch, the spec should become:

```txt
WOS-3DLAB-P5-v0.1.1
```

Then ready for BUILD conversion as:

```txt
0613_WOS_3DCanvasLabPhase5ObjectRenderLayer_v1.0.0_BUILD.md
```

---

# Required Patch 1 — Fix malformed MercatorCoordinate snippet

## Section to patch

```txt
7.1 Position mapping
```

## Replace current broken snippet with:

```js
const mercator = mapboxgl.MercatorCoordinate.fromLngLat(
  { lng: actor.anchor.lon, lat: actor.anchor.lat },
  actor.anchor.altM
);

object3D.position.set(
  mercator.x,
  mercator.y,
  mercator.z
);
```

---

# Required Patch 2 — Add Metre Scale Authority

## Add under Section 7

````md
### 7.4 Metre Scale Authority

Proxy geometry and GLB dimensions are treated as metres.

Inside the Mapbox custom layer, metre dimensions MUST be converted to Mercator coordinate units using the actor anchor’s local Mercator scale.

```js
const mercator = mapboxgl.MercatorCoordinate.fromLngLat(
  { lng: actor.anchor.lon, lat: actor.anchor.lat },
  actor.anchor.altM
);

const meterScale = mercator.meterInMercatorCoordinateUnits();

object3D.scale.set(
  meterScale,
  meterScale,
  meterScale
);
````

ActorProxyGeometryFactory creates geometry in metre units.

ActorObjectRenderLayer owns conversion from metre-authored geometry to Mapbox custom-layer scene units.

No manifest field stores this scale conversion.

The conversion is render-time presentation state only.

````

---

# Required Patch 3 — Add Scene Projection Truth

## Add under Section 3

```md
### 3.3 Scene Projection Truth

Object3D instances are disposable visual projections of WOSActorManifest truth.

The manifest remains canonical.

The render layer may reconstruct, remove, replace, or reload Object3D instances at any time from manifest state.

No Object3D transform is authoritative unless it has been committed back through the existing manifest write path.

During gizmo drag, Object3D position and heading may preview transient state.

On gizmo release, the committed anchor.lat, anchor.lon, anchor.altM, and anchor.headingDeg in WOSActorManifest become the only persistent truth.

Selection state is authoring session state only.

Selection MUST NOT be written to WOSActorManifest or wos-registry.json.
````

---

# Required Patch 4 — Add Selection Authority Clarification

## Add under Section 5

````md
### 5.4 Selection Authority

ActorObjectRenderLayer MAY expose pick targets for Object3D instances.

ActorObjectRenderLayer MUST NOT determine or persist selected actor identity.

All selection changes MUST route through:

```js
WOSActorPlacementController.select(objectId)
````

WOSActorPlacementController remains the sole selection authority for Phase 5.

ActorObjectRenderLayer only observes the resulting selection event and updates the visual highlight.

Clicking a visible Object3D may initiate a pick request, but the render layer must forward the resolved objectId to WOSActorPlacementController rather than directly setting selection state internally.

````

---

# Required Patch 5 — Add Ground Ring Sizing Authority

## Add under Section 5.3

```md
### Ground Ring Sizing Authority

Ground ring radius MUST be computed from the selected Object3D world-space bounding box after all object transforms and metre-to-Mercator scaling are applied.

Use:

```js
const box = new THREE.Box3().setFromObject(object3D);
````

The render layer computes:

```txt
width  = box.max.x - box.min.x
depth  = box.max.z - box.min.z
radius = max(width, depth) / 2 + margin
```

The margin MUST equal:

```js
0.5 * meterScale
```

The ring is a visual selection affordance only.

The ring radius is not persisted.

The ring MUST be rebuilt or resized whenever the selected Object3D is replaced, including proxy-to-GLB replacement after asynchronous GLB load.

````

---

# Required Patch 6 — Add Render Layer Governance Note

## Add under Section 3 or Section 8.1

```md
### Render Layer Governance Note

ActorObjectRenderLayer is a Phase 5 coordination layer.

It coordinates:

- actor Object3D lifecycle
- asset/proxy resolution
- selection highlight rendering
- gizmo preview updates
- store-to-scene synchronization

It MUST NOT become the long-term owner of:

- asset loading policy
- material override policy
- animation policy
- runtime feed motion
- governance lifecycle
- production publish behavior
- Wall runtime rendering behavior
- building surface editing
- LOD switching policy

Future expansion must split those concerns into dedicated systems rather than expanding ActorObjectRenderLayer into a God layer.
````

---

# Required Patch 7 — Normalize Appendix B

## Current issue

Appendix B locks `EffectComposer` / `OutlinePass` too tightly.

The spec should lock the visual result, not force one implementation.

## Replace Appendix B with:

````md
## Appendix B: Selection Highlight Implementation Note

The locked Phase 5 visual contract is:

```txt
selected actor = cyan object outline + cyan ground ring
````

The preferred implementation MAY use Three.js EffectComposer and OutlinePass.

However, the governance contract is the visual outcome, not the post-processing implementation.

Any implementation is acceptable if it satisfies:

1. Only the selected Object3D is outlined.
    
2. The outline colour is #00CED1.
    
3. The outline is visually readable at normal authoring zoom.
    
4. No material properties on the actor Object3D or child meshes are mutated.
    
5. Deselecting removes the outline immediately.
    
6. The ground ring remains separate from LOD preview rings.
    
7. No second renderer or WebGL context is created.
    

If OutlinePass is used, it must operate within the existing 3D Canvas Mapbox custom layer rendering path.

````

---

# Required Patch 8 — Fix Controller Summary

## Section to patch

```txt
12. Controller updates summary
````

## Replace current GizmoController row with:

```txt
GizmoController
Phase 3–4
Unchanged. Render layer subscribes to move / commit / rotate / rotate-commit events for transient preview and final transform sync.
```

## Confirm WOSActorPlacementController row says:

```txt
WOSActorPlacementController
Phase 1–4
Unchanged. Render layer subscribes to its selection events and forwards Object3D pick results through select(objectId).
```

---

# Required Patch 9 — Vocabulary Cleanup

Normalize these terms across the document:

## Use

```txt
WOSActorManifestStore
WOSActorPlacementController
Object3D
resolved GLB instance
loaded asset instance
proxy geometry
```

## Avoid

```txt
Actor Manifest Store
ActorManifestStore
real 3D object
```

Replace “real 3D object” with:

```txt
loaded asset instance or proxy Object3D
```

---

# Acceptance Criteria for This Patch

After patching, confirm:

1. Spec version is updated from `v0.1` to `v0.1.1`.
    
2. Position mapping snippet is valid JavaScript.
    
3. Metre-to-Mercator scale conversion is explicitly defined.
    
4. Scene Object3D state is declared disposable projection state.
    
5. Manifest truth remains canonical.
    
6. Selection authority remains with WOSActorPlacementController.
    
7. ActorObjectRenderLayer does not persist selection.
    
8. Ground ring sizing uses world-space bounding box after transforms.
    
9. Appendix B no longer hard-requires OutlinePass.
    
10. Controller summary correctly describes GizmoController events.
    
11. No architecture rewrite was introduced.
    
12. New BUILD filename remains:
    

```txt
0613_WOS_3DCanvasLabPhase5ObjectRenderLayer_v1.0.0_BUILD.md
```

---

# Output

Return:

- Sections changed.
    
- Exact text added or replaced.
    
- Confirmation that architecture did not change.
    
- Confirmation that Phase 5 is ready for BUILD conversion.