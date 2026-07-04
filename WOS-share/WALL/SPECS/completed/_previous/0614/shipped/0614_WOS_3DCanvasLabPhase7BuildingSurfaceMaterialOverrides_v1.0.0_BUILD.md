---
layout: spec
title: "WOS 3D Canvas Lab Phase 7 Building Surface Material Overrides"
date: 2026-06-14
doc_id: "0614_WOS_3DCanvasLabPhase7BuildingSurfaceMaterialOverrides_v1.0.0_BUILD"
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
summary: "Phase 7: Building Surface and Material Override Authoring. Authors apply colour and material class overrides to structure actors via a WOS palette picker or free hex input. Roughness and metalness available for PBR (MeshStandardMaterial) actors. Overrides stored in manifest.materialOverride, validated by Phase 4 gate, promoted with actor. Single flat colour per actor. Per-mesh, UV, texture, and batch tools explicitly out of scope."
spec_version: "WOS-3DLAB-P7-v1.0.0"
depends_on:
  - "WOS-3DLAB-P6-v1.0.0"
  - "Three.js"
  - "Mapbox GL JS"
enables:
  - "MaterialOverrideController"
  - "WOSPalette"
  - "StructureActorSurfaceAuthoring"
new_files:
  - "studio/views/materialOverrideController.js"
  - "studio/data/wosPalette.js"
updated_files:
  - "studio/views/actorObjectRenderLayer.js"
  - "studio/views/threeDCanvasView.js"
  - "studio/index.html"
  - "studio/styles.css"
doctrine:
  - "Single flat color per actor in Phase 7 — per-mesh deferred"
  - "Palette is primary — free hex is override"
  - "Preview is immediate, save is explicit"
  - "Material cloning is mandatory before mutation"
  - "paletteRef takes precedence over color"
  - "Lambert actors ignore roughness and metalness silently"
  - "materialOverride travels through Phase 4 promotion gate"
  - "Reset restores base GLB material or proxy factory colour"
palette:
  - name: concrete
    hex: "#8C8C88"
    class: lambert
  - name: glass
    hex: "#A8C8D8"
    class: standard
  - name: steel
    hex: "#7A8A96"
    class: standard
  - name: terracotta
    hex: "#C17A5A"
    class: lambert
  - name: stone
    hex: "#A09880"
    class: lambert
  - name: copper
    hex: "#8C6040"
    class: standard
  - name: matte_white
    hex: "#E8E6E0"
    class: lambert
  - name: matte_black
    hex: "#2A2A2A"
    class: lambert
tags:
  - "wos"
  - "3d-canvas-lab"
  - "material-override"
  - "wos-palette"
  - "surface-authoring"
  - "three-js-material"
  - "phase-4-gate"
---

# WOS 3D Canvas Lab — Phase 7: Building Surface / Material Override Authoring

WOS 3D Canvas Lab
Phase 7: Building Surface / Material Override Authoring

---

**Doc ID:** Version
**Status:** Date
**Spec ref:** Depends on
**Requires:** New files
**Updated files:** Ship gate

---


## 1. Purpose and scope

Phase 6 let authors select and replace Mapbox buildings with WOS actors. Phase 7 lets authors change how those actors look. Authors can override the surface colour and material class of any structure actor, choosing from the WOS palette or entering a free hex value. Roughness and metalness scalars are available when the actor uses a PBR-capable material. All overrides are stored in the manifest and travel through the Phase 4 promotion gate.
Phase 7 is a surface authoring pass only. UV editing, texture painting, per-face editing, procedural textures, mesh deformation, and multi-building batch tools are explicitly out of scope.

> **Ship gateAuthor selects a structure actor with an assigned building replacement (Phase 6).Author applies a material override: palette colour, free hex, material class, roughness, or metalness.The 3D Canvas updates the actor material in real time. No save required to preview.Author saves. The override is written to the manifest under materialOverride.*.Actor is promoted through the Phase 4 gate. materialOverride fields are present in the promoted manifest.Reload restores the override exactly. Actor renders with the saved material.Author resets to default. Override fields are cleared. Actor returns to its base material.**


## 2. Locked Phase 7 decisions


| Decision | Locked answer |
| --- | --- |
| Material classes | MeshLambertMaterial for proxy geometry · MeshStandardMaterial for loaded GLB assets |
| Color override scope | Single flat colour per actor. Per-mesh colour deferred. |
| Color input | WOS palette picker (primary) + free hex input (override). Both active. |
| Roughness / metalness | Available on MeshStandardMaterial actors only. Hidden for Lambert proxies. |
| Manifest storage | materialOverride block in WOSActorManifest. Travels through Phase 4 gate. |
| Promotion gate | Yes — materialOverride fields are validated by the gate and stored in the registry. |
| Reset to default | Clearing materialOverride restores the actor’s base GLB material or proxy colour. |
| Per-face / UV / batch | Out of scope in Phase 7. |


## 3. Manifest extension — materialOverride

Phase 7 introduces the materialOverride block in WOSActorManifest. This block is optional and may appear on any actor, but is primarily meaningful on structure actors. Non-structure actors may carry materialOverride but the render layer applies it identically.

### 3.1 Extension interface

```js
// WOSActorManifest — Phase 7 additioninterface WOSMaterialOverride {  // Color override — applied to all meshes in the actor Object3D  color: string | null;  // Hex string: "#RRGGBB" or "#RGB". null = use base material color.  paletteRef: string | null;  // WOS palette name (e.g. "concrete", "glass", "steel").  // When non-null, color is derived from the palette at render time.  // paletteRef takes precedence over color if both are set.  materialClass: "lambert" | "standard" | null;  // null = use asset default (GLB material or proxy default).  // "lambert" = MeshLambertMaterial (no PBR).  // "standard" = MeshStandardMaterial (PBR, roughness + metalness available).  roughness: number | null;  // [0, 1]. Only applied when materialClass = "standard" or asset is GLB.  // null = use material default.  metalness: number | null;  // [0, 1]. Only applied when materialClass = "standard" or asset is GLB.  // null = use material default.}// In WOSActorManifest:materialOverride?: WOSMaterialOverride | null;// null or absent = no override. Actor renders with base material.
```


### 3.2 Extension rules

```js
materialOverride contractmaterialOverride is optional. Absent or null means no override — actor renders with its base GLB material or proxy colour.paletteRef takes precedence over color. If both are non-null, paletteRef is used. The MaterialOverrideController resolves paletteRef to a hex string at render time using wosPalette.js.roughness and metalness are ignored when the resolved material class is lambert. They are not validated or stored as errors — they are silently skipped.color must be a valid CSS hex string (#RRGGBB or #RGB). Invalid hex is rejected by the Inspector with an inline error.All materialOverride fields are optional independently. An actor may have only a color override with no material class change.The Phase 4 gate validates materialOverride fields as part of Group A schema checks.
```


### 3.3 Example manifest with material override

```js
{  "objectId":      "d4e5f6a7-b8c9-4d0e-1f2a-b3c4d5e6f7a8",  "actorCategory": "structure",  "actorType":     "building",  "assetId":       "sr_glass_tower_001",  "anchor": { "lat": 40.7580, "lon": -73.9855, "altM": 0, "headingDeg": 15 },  "structure": {    "mapboxFeatureId":   9876543,    "mapboxSourceId":    "composite",    "mapboxSourceLayer": "building",    "mapboxLayerId":     "3d-buildings"  },  "materialOverride": {    "color":         null,    "paletteRef":    "glass",    "materialClass": "standard",    "roughness":     0.05,    "metalness":     0.1  },  "meta": {    "specVersion":  "1.0.0",    "authoredAt":   "2026-06-14T11:00:00Z",    "promoted":      false,    "displayLabel": "Glass Tower — Midtown"  }}
```


## 4. WOS palette — wosPalette.js

The WOS palette is a locked set of named material presets. Each entry defines a colour hex, a material class, and default roughness and metalness values. The palette is the primary authoring surface in Phase 7 — free hex input is the secondary override.

### 4.1 Locked Phase 7 palette entries


| Palette name | Hex | Material class | Roughness | Metalness |
| --- | --- | --- | --- | --- |
| concrete | #8C8C88 | lambert | — (Lambert) | — (Lambert) |
| glass | #A8C8D8 | standard | 0.05 | 0.1 |
| steel | #7A8A96 | standard | 0.3 | 0.8 |
| terracotta | #C17A5A | lambert | — (Lambert) | — (Lambert) |
| stone | #A09880 | lambert | — (Lambert) | — (Lambert) |
| copper | #8C6040 | standard | 0.4 | 0.9 |
| matte_white | #E8E6E0 | lambert | — (Lambert) | — (Lambert) |
| matte_black | #2A2A2A | lambert | — (Lambert) | — (Lambert) |


### 4.2 Palette file interface

```js
// studio/data/wosPalette.jsexport const WOS_PALETTE = {  concrete:    { color: "#8C8C88", materialClass: "lambert", roughness: null, metalness: null },  glass:       { color: "#A8C8D8", materialClass: "standard", roughness: 0.05, metalness: 0.1  },  steel:       { color: "#7A8A96", materialClass: "standard", roughness: 0.3,  metalness: 0.8  },  terracotta:  { color: "#C17A5A", materialClass: "lambert",  roughness: null, metalness: null },  stone:       { color: "#A09880", materialClass: "lambert",  roughness: null, metalness: null },  copper:      { color: "#8C6040", materialClass: "standard", roughness: 0.4,  metalness: 0.9  },  matte_white: { color: "#E8E6E0", materialClass: "lambert",  roughness: null, metalness: null },  matte_black: { color: "#2A2A2A", materialClass: "lambert",  roughness: null, metalness: null },};export function resolvePaletteEntry(paletteRef) {  return WOS_PALETTE[paletteRef] ?? null;}
```


> **Palette is additiveNew palette entries may be added in future phases without breaking existing manifests.Removing or renaming a palette entry is a breaking change and requires a ContractGovernance artifact.The palette is not user-editable in Phase 7. Custom palette entries are deferred.**


## 5. MaterialOverrideController


### 5.1 Responsibilities

1. Reads materialOverride from the selected actor manifest.
1. Resolves paletteRef to hex + material class + scalars via wosPalette.js.
1. Applies the resolved override to the actor’s Object3D in the Three.js scene.
1. Provides real-time preview: override applied immediately on author input, before save.
1. Writes the materialOverride block back to the manifest via WOSActorManifestStore on save.
1. Handles reset: clears materialOverride and restores the base material.


### 5.2 Does NOT own

1. Actor Object3D creation or lifecycle — ActorObjectRenderLayer (Phase 5).
1. Selection state — WOSActorPlacementController (Phase 1–5).
1. Manifest writes other than materialOverride — InspectorController (Phase 2).
1. Promotion gate checks — PromotionGateController (Phase 4).
1. The Three.js scene graph — read-only access to traverse meshes.


### 5.3 Controller interface

```js
class MaterialOverrideController {  constructor(scene, manifestStore, selectionController)  // Apply override to the selected actor’s Object3D (live preview, no save)  applyPreview(actorObjectId: string, override: WOSMaterialOverride): void  // Commit override to manifest store (triggers manifest write)  save(actorObjectId: string, override: WOSMaterialOverride): Promise<void>  // Clear override and restore base material  reset(actorObjectId: string): Promise<void>  // Resolve current override state for an actor (reads manifest)  getOverride(actorObjectId: string): WOSMaterialOverride | null}
```


## 6. Material application — runtime behaviour


### 6.1 Material class resolution

The material applied to an actor Object3D is determined by the following priority order:
paletteRef present: resolve palette entry → use palette materialClass, color, roughness, metalness. Ignore materialOverride.color.
color present (no paletteRef): use materialOverride.color as hex. Use materialOverride.materialClass if set, otherwise infer from asset type (lambert for proxy, standard for GLB).
materialClass only (no color, no paletteRef): change material class but keep existing color.
roughness / metalness only: apply scalars to existing material if it is MeshStandardMaterial. No-op if material is MeshLambertMaterial.
materialOverride is null or absent: actor renders with its base GLB material or proxy colour. No override applied.


### 6.2 Applying overrides to Object3D

```js
function applyMaterialOverride(object3D, override, isProxy) {  if (!override) return; // no override — base material unchanged  // Resolve color and material class  let color = override.color;  let matClass = override.materialClass;  let roughness = override.roughness;  let metalness = override.metalness;  if (override.paletteRef) {    const entry = resolvePaletteEntry(override.paletteRef);    if (entry) {      color    = entry.color;      matClass = entry.materialClass;      roughness = entry.roughness;      metalness = entry.metalness;    }  }  // Walk all meshes in the Object3D  object3D.traverse(child => {    if (!child.isMesh) return;    const needsStandard = matClass === "standard";    const isStandard = child.material instanceof THREE.MeshStandardMaterial;    const isLambert  = child.material instanceof THREE.MeshLambertMaterial;    // Clone material to avoid shared-material mutation across instances    if (!child.material._wosCloned) {      child.material = child.material.clone();      child.material._wosCloned = true;    }    // Upgrade or downgrade material class if requested    if (needsStandard && isLambert) {      const std = new THREE.MeshStandardMaterial({ color: child.material.color });      std._wosCloned = true;      child.material = std;    } else if (!needsStandard && isStandard && isProxy) {      // Downgrade proxy to Lambert only (never downgrade loaded GLB)      const lmb = new THREE.MeshLambertMaterial({ color: child.material.color });      lmb._wosCloned = true;      child.material = lmb;    }    if (color) child.material.color.set(color);    if (child.material instanceof THREE.MeshStandardMaterial) {      if (roughness !== null && roughness !== undefined)        child.material.roughness = roughness;      if (metalness !== null && metalness !== undefined)        child.material.metalness = metalness;    }    child.material.needsUpdate = true;  });}
```


> **Material cloning is mandatoryBefore modifying any material property, the mesh material MUST be cloned if it has not been cloned already.This prevents shared-material mutation: two actors using the same assetId share a GLB, and their Three.js materials may be the same object by reference.The _wosCloned flag is a runtime marker on the material object. It is not persisted to the manifest.On reset, the cloned material is discarded and the original material is restored from the base GLB or proxy factory.**


### 6.3 Proxy vs GLB behaviour


| Condition | materialClass result | roughness / metalness |
| --- | --- | --- |
| Proxy, no override | MeshLambertMaterial (proxy default) | Not applicable |
| Proxy, paletteRef = "concrete" | MeshLambertMaterial (palette lambert) | Not applicable |
| Proxy, paletteRef = "glass" | MeshStandardMaterial (palette standard) | roughness: 0.05, metalness: 0.1 |
| Proxy, materialClass = "standard" | MeshStandardMaterial | Applied if set |
| GLB, no override | GLB original material (unchanged) | GLB original values |
| GLB, paletteRef = "steel" | MeshStandardMaterial (palette standard) | roughness: 0.3, metalness: 0.8 |
| GLB, color only | GLB material class preserved, color overridden | GLB original values |
| Any, materialClass = "lambert" | MeshLambertMaterial | roughness/metalness ignored |


### 6.4 Reset behaviour

```js
function resetMaterialOverride(object3D, actorManifest, proxyFactory) {  object3D.traverse(child => {    if (!child.isMesh) return;    if (!child.material._wosCloned) return; // no override was applied    // Restore: re-request proxy or reload GLB material    if (actorManifest.assetId === "wos_placeholder_cube" || isProxyActor(actorManifest)) {      // Re-create proxy material from factory      const proxy = proxyFactory.create(        actorManifest.actorCategory,        actorManifest.actorType      );      proxy.traverse(p => {        if (p.isMesh) child.material = p.material;      });    } else {      // Reload GLB material from original (un-cloned) asset cache      // GLB loader cache provides the original material by assetId key      const originalMat = glbMaterialCache.get(child.uuid);      if (originalMat) child.material = originalMat;    }  });}
```


## 7. Inspector — Material Override section

Phase 7 adds a Material Override section to the Inspector. It is visible for all actors but most meaningful on structure actors. The section is always shown — not hidden behind a category check — so non-structure actors can also receive overrides.

### 7.1 Inspector fields


| Field | Control | Behaviour |
| --- | --- | --- |
| Palette picker | Swatch grid | 8 named swatches from WOS_PALETTE. Selected swatch shows name + hex. Clicking sets paletteRef and updates materialClass, roughness, metalness from palette. |
| Free hex input | Text input | #RRGGBB. Validated on blur. Non-null hex clears paletteRef. Live preview on valid hex. |
| Material class | Dropdown | lambert · standard · (asset default). Changing to lambert hides roughness/metalness. Changing to standard shows them. |
| Roughness | Slider [0,1] | Shown only when materialClass = "standard" or GLB asset. null = "Asset default" state. Drag to set value. |
| Metalness | Slider [0,1] | Same conditions as roughness. null = "Asset default" state. |
| Reset to default | Button | Clears materialOverride. Restores base material. Writes null to manifest. |
| Save | Button | Writes materialOverride to manifest. Same 500ms write requirement as Phase 2. |


### 7.2 Live preview contract


> **Preview is immediate, save is explicitMaterialOverrideController.applyPreview() is called on every Inspector field change. The 3D Canvas updates without a save.applyPreview() does NOT write to the manifest store. It mutates the Three.js material only.If the author closes the Inspector or deselects the actor without saving, the preview is discarded and the actor reverts to its last saved material state.Save explicitly commits the override to the manifest store. Only then does the change persist across reload.**


### 7.3 Hex input validation

1. #RRGGBB and #RGB are both valid. Three.js accepts both.
1. Hex strings without the leading # are rejected with inline error: "Color must start with #."
1. Invalid hex characters are rejected: "Invalid hex color."
1. Empty string is treated as no color override (equivalent to null). No error shown.
1. Live preview fires only on valid hex. Invalid input does not trigger applyPreview().


## 8. Promotion gate integration — Phase 4

Material override fields travel through the Phase 4 promotion gate. The gate validates the materialOverride block as part of Group A schema checks. No new gate UI is added — the existing Phase 4 gate handles the new fields.

### 8.1 New Group A blocking checks


| Check | Failure condition | Error |
| --- | --- | --- |
| materialOverride.color is valid hex | Non-null color that fails hex validation | materialOverride.color is not a valid hex string. |
| materialOverride.paletteRef is known | Non-null paletteRef not in WOS_PALETTE | materialOverride.paletteRef is not a recognised palette name. |
| materialOverride.roughness in [0,1] | Non-null roughness outside [0,1] | materialOverride.roughness must be between 0 and 1. |
| materialOverride.metalness in [0,1] | Non-null metalness outside [0,1] | materialOverride.metalness must be between 0 and 1. |
| materialClass is valid enum | Non-null materialClass not lambert or standard | materialOverride.materialClass must be "lambert" or "standard". |


### 8.2 Group B warning

1. If roughness or metalness is non-null and materialClass is "lambert" (or resolves to lambert via paletteRef): gate shows Group B warning "roughness/metalness set but material class is Lambert — PBR scalars will be ignored at runtime."
1. This is a warning only, not a blocker. Author may acknowledge and promote.


### 8.3 Registry entry

On promotion, materialOverride fields are present in the canonical manifest in wos-actors.json. The registry entry in wos-registry.json does not store materialOverride fields directly — it records the objectId and specVersion as usual. The promoted manifest in wos-actors.json is the source of truth for override values.


## 9. File specifications


### 9.1 materialOverrideController.js — new file


| Field | Type | Description |
| --- | --- | --- |
| Location | string | studio/views/materialOverrideController.js |
| Purpose | string | Owns real-time material override preview, manifest save, and reset for all actors |
| Depends on | string | Three.js, WOSActorManifestStore, ActorObjectRenderLayer (scene access), wosPalette.js |
| Does NOT own | string | Object3D lifecycle, selection state, promotion gate, manifest fields outside materialOverride |


### 9.2 wosPalette.js — new file


| Field | Type | Description |
| --- | --- | --- |
| Location | string | studio/data/wosPalette.js |
| Purpose | string | Locked palette definitions. Single source of truth for palette names, colors, and material defaults. |
| Exports | string | WOS_PALETTE (const object) · resolvePaletteEntry(paletteRef: string) |
| Does NOT own | string | Inspector rendering, material application, manifest writes |


### 9.3 actorObjectRenderLayer.js — updated

1. On actor load (mount, onActorAdded, onActorUpdated): after Object3D is placed in scene, check manifest for materialOverride. If present and non-null, call MaterialOverrideController.applyPreview().
1. On actor reset: call MaterialOverrideController.reset() before removing or replacing the Object3D.
1. Expose scene traversal access to MaterialOverrideController. The render layer does not apply overrides directly — it delegates to MaterialOverrideController.


### 9.4 threeDCanvasView.js — updated

1. Instantiate MaterialOverrideController on init.
1. Pass MaterialOverrideController reference to Inspector via dependency injection.


## 10. Controller summary — Phase 7


| Field | Type | Description |
| --- | --- | --- |
| MaterialOverrideController | NEW (Phase 7) | Real-time override preview, manifest save, reset, palette resolution. |
| ActorObjectRenderLayer | Phase 5–7 | Updated: applies materialOverride on actor load. Delegates override logic to MaterialOverrideController. |
| InspectorController | Phase 2–4 | Extended with Material Override section. Routes field changes to MaterialOverrideController.applyPreview(). |
| PromotionGateController | Phase 4 | Updated: validates materialOverride fields as new Group A checks. |
| WOSActorManifestStore | Phase 1–6 | Unchanged. MaterialOverrideController writes materialOverride block via existing update() method. |
| WOSActorPlacementController | Phase 1–6 | Unchanged. MaterialOverrideController subscribes to selection events to know which actor is active. |


## 11. Explicitly out of scope in Phase 7


> **Do not build in Phase 7UV editing or texture coordinate modification.Texture painting or image-based material authoring.Per-face or per-mesh color editing. Single flat color per actor only.Procedural texture authoring (noise, gradients, patterns).Mesh deformation or geometry modification of any kind.Multi-building batch material application.Custom palette entries or user-defined palette names.Opacity or transparency override. Alpha materials deferred.Emissive color override. Deferred.Normal map or displacement map assignment. Deferred.Material override for vehicle, maritime, or prop actors in the Phase 7 Inspector UI — the block is available in the manifest for all actors, but the Inspector surface in Phase 7 is optimised for structure actors only.**


## 12. Acceptance criteria


### AC1 — Palette picker

1. All 8 palette swatches are shown in the Inspector Material Override section.
1. Clicking a swatch sets paletteRef and updates the actor material in the 3D Canvas immediately.
1. Swatch shows name and hex. Selected swatch is visually highlighted.


### AC2 — Free hex input

1. Author types a valid hex (#RRGGBB or #RGB). Actor material color updates in real time.
1. Setting a hex clears paletteRef in the in-memory override state.
1. Invalid hex shows inline error. No preview fires on invalid input.


### AC3 — Material class

1. Switching to "standard" shows roughness and metalness sliders.
1. Switching to "lambert" hides roughness and metalness sliders.
1. Material class change is reflected in the 3D Canvas immediately.


### AC4 — Roughness and metalness

1. Sliders visible only when materialClass = "standard" or actor has a loaded GLB with MeshStandardMaterial.
1. Dragging roughness or metalness slider updates the actor material in real time.
1. "Asset default" state (null) shown as a distinct visual toggle, not as 0.


### AC5 — Save and reload

1. Pressing Save writes materialOverride to wos-actors.json within 500ms.
1. Reload restores the override exactly. Actor renders with the saved palette, color, class, roughness, and metalness.
1. Closing Inspector without saving discards the preview. Actor reverts to last saved material.


### AC6 — Reset to default

1. Pressing Reset clears materialOverride. Writes null to manifest.
1. Actor material returns to its base GLB material or proxy colour.
1. Reset is immediate in the 3D Canvas. No reload required.


### AC7 — Promotion gate

1. An actor with a valid materialOverride passes the Phase 4 gate.
1. An actor with an invalid hex in color is blocked by the gate with the correct error.
1. An actor with an unrecognised paletteRef is blocked by the gate with the correct error.
1. Group B warning fires for PBR scalars on a Lambert material. Author can acknowledge and promote.


### AC8 — Material cloning

1. Modifying one actor’s material does not affect another actor that shares the same assetId.
1. After reset, the shared material is unaffected. Other actors with the same assetId render with their original materials.


### AC9 — Architecture constraints

1. MaterialOverrideController does not create new Three.js scenes or renderers.
1. No second WebGL context created by Phase 7.
1. applyPreview() does not write to WOSActorManifestStore. Only save() and reset() write.


## Appendix A: Material resolution reference

Full priority order for material application, for implementer reference.
```js
// Priority order (highest to lowest)//// 1. paletteRef present//    color     = WOS_PALETTE[paletteRef].color//    matClass  = WOS_PALETTE[paletteRef].materialClass//    roughness = WOS_PALETTE[paletteRef].roughness//    metalness = WOS_PALETTE[paletteRef].metalness//// 2. color present (paletteRef null)//    color    = materialOverride.color//    matClass = materialOverride.materialClass ?? inferFromAsset()//    roughness/metalness from materialOverride if standard//// 3. materialClass only (color null, paletteRef null)//    matClass = materialOverride.materialClass//    keep existing mesh color//// 4. roughness/metalness only//    apply to existing material if MeshStandardMaterial, else no-op//// 5. materialOverride null/absent//    base GLB material or proxy factory colour unchangedfunction inferFromAsset(manifest) {  // GLB with standard material → "standard"  // GLB with lambert material → "lambert"  // Proxy geometry → "lambert"  return manifest.assetId !== "wos_placeholder_cube"    ? "standard"   // assume GLB has PBR unless overridden    : "lambert";}
```


## Appendix B: Doctrine notes

```js
Override does not replace asset fidelity — it adds authoring controlA loaded GLB asset may already have carefully authored PBR materials. materialOverride should be used intentionally, not applied by default.The palette provides WOS-standard material presets that are designed to work well in the Mapbox 3D environment. They are the recommended starting point.Free hex input is for cases where the palette does not provide the needed color. It does not change material class unless the author explicitly sets one.
```

> **Phase 7 scope ceiling — single flat color onlyPer-mesh color, UV editing, texture painting, and procedural materials are not part of Phase 7.The single-flat-color model is intentional. It covers the primary authoring use case (building surface tinting for world-building) without creating a material editor.Expanding Phase 7 scope requires a new spec revision, not a Phase 7 implementation decision.**


## Appendix C: Spec revision history


| Version | Date | Notes |
| --- | --- | --- |
| v1.0.0 | 2026-06-14 | Initial BUILD. Both material classes, single flat color, palette + hex, Phase 4 gate integration, MaterialOverrideController, WOS palette with 8 entries. |
