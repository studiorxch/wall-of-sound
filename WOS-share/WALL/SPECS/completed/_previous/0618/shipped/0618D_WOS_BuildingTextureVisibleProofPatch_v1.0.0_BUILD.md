# 0618D_WOS_BuildingTextureVisibleProofPatch_v1.0.0_BUILD

## Status

```txt
READY FOR BUILD
```

## Purpose

0618D is a visible-proof patch for the building texture pipeline.

0618B and 0618C created the governed texture package + assignment + preview-truth infrastructure, but they still allow the system to report correct fallback states without producing an obvious visual result. This pass forces a direct, visible proof path so the author can confirm the full loop on screen.

```txt
selected building
→ create / find texture-ready structure replacement actor
→ apply obvious test texture
→ visibly change mesh material
→ report APPLIED only when mesh actually changes
```

## Problem Being Solved

Current texture behavior can be technically correct while still feeling like nothing happened.

Known causes:

1. The selected building may be a Mapbox extrusion, not a Studio-owned Three.js object.
2. `getBuildingPreviewObject3D(selection)` can return null when no replacement actor is bound.
3. Existing proxy materials may not expose a useful `mat.map` texture slot.
4. Imported texture art may be too subtle to prove success.
5. The UI can show package/assignment plumbing without a clear visual smoke test.

0618D exists to remove ambiguity.

## Non-Goals

This pass does **not** create the final building texture art system.

It does not own:

- procedural texture generation
- advanced UV mapping
- facade segmentation
- global Moebius / illustrated surface doctrine
- production texture atlas design
- Broadcast visual polish
- replacing all Mapbox buildings with textured meshes

This is a proof patch only.

## Locked Rules

```txt
APPLIED means the user can visibly see a texture/material change on a Studio-owned object.
FALLBACK means the assignment is valid but there is no texture-ready object path.
MISSING means the assignment/package/runtime reference is invalid or absent.
```

```txt
Do not claim success because an assignment exists.
Do not claim success because a texture package exists.
Do not claim success because TextureLoader loaded an image.
Only claim APPLIED after a mesh material is actually modified.
```

## Build Targets

### 1. Texture-ready proof material path

Ensure structure replacement actors created from selected buildings receive a texture-ready Three.js material.

Required behavior:

```txt
Create Structure Replacement
→ actor object exists in ActorObjectRenderLayer
→ object has mesh material with map-compatible slot
→ BuildingTexturePreviewController can apply texture
```

Implementation options:

#### Preferred

Patch `actorObjectRenderLayer.js` or the proxy factory path so structure/building actors use a `THREE.MeshStandardMaterial` or equivalent material with `map` supported.

#### Acceptable fallback

Add a specific method exposed by the render layer:

```js
ensureTextureReadyObject(objectId)
```

It should:

- find the object by `objectId`
- traverse meshes
- replace or normalize incompatible materials
- preserve base color
- set `material.map = null` if needed
- set `material.needsUpdate = true`
- return `{ ok, objectId, meshCount, textureReadyCount, reason? }`

### 2. One-click visible test texture

Add a direct visible proof action to the selected building inspector.

UI label:

```txt
Apply Test Texture
```

This should appear in the selected-building texture section when a building is selected.

The test texture must be deliberately obvious:

```txt
high-contrast checker
or vertical stripes
or diagonal hazard pattern
```

The point is proof, not beauty.

### 3. Studio-generated test texture package

Create or expose a Studio-side helper that generates a small canvas texture package without requiring manual file import.

Suggested module:

```txt
studio/buildings/buildingTextureProofController.js
```

Responsibilities:

- generate a 512×512 visible checker/stripe texture from canvas
- package it through the existing 0618B texture package store path, or create a package-compatible proof record
- assign it to selected building `facade`
- call preview controller
- return truth result

Preferred behavior:

```txt
Apply Test Texture
→ create proof texture record if missing
→ package for Broadcast if not packaged
→ assign to selected building facade
→ previewBuilding(selection, { slotName: 'facade' })
→ show APPLIED / FALLBACK / MISSING
```

### 4. Force object path before preview

If the selected building has no structure replacement actor, the proof action should offer or perform a direct proof path.

Acceptable options:

#### Option A — guided

```txt
No texture-ready replacement exists.
Create Structure Replacement first.
```

#### Option B — better

```txt
Apply Test Texture
→ if no bound structure replacement exists, create one
→ suppress original building
→ refresh actor object
→ apply test texture
```

Option B is preferred for proof speed.

### 5. Explicit proof status panel

The Inspector should show a visible proof result:

```txt
Texture Proof: APPLIED
Texture Proof: FALLBACK — no_preview_object3d
Texture Proof: FALLBACK — uv_or_material_slot_unavailable
Texture Proof: MISSING — package_not_ready
```

Include:

- status
- reason
- buildingKey
- packageId
- slotName
- appliedObjectId if available
- timestamp

### 6. Debug surface

Add / extend debug command:

```js
_wos.debug.studio.buildingTextureProof()
```

Expected return:

```js
{
  enabled: true,
  lastProof: {
    status: 'APPLIED' | 'FALLBACK' | 'MISSING',
    reason: string | null,
    buildingKey: string,
    packageId: string,
    slotName: 'facade',
    appliedObjectId: string | null,
    textureReady: true | false,
    meshCount: number,
    textureReadyCount: number,
    updatedAt: string
  },
  previewSnapshot: WOSBuildingTexturePreviewController.getSnapshot()
}
```

## Required File Changes

Likely files:

```txt
studio/buildings/buildingTextureProofController.js          NEW
studio/buildings/buildingTexturePreviewController.js        PATCH
studio/views/actorObjectRenderLayer.js                      PATCH
studio/views/actorProxyGeometryFactory.js                   PATCH if material path lives there
studio/views/threeDCanvasView.js                            PATCH if auto-create/focus path needed
studio/studioShell.js                                       PATCH Inspector proof controls
studio/index.html                                           ADD script tag
studio/styles.css                                           ADD proof status styles
```

Only patch Wall files if absolutely required. 0618D is primarily Studio visible proof.

## Implementation Notes

### Proof texture generation

Canvas-generated proof image is sufficient.

Suggested pattern:

```txt
512×512
alternating cyan / magenta / black / white blocks
large enough to read at map zoom
```

Do not make the test subtle.

### Texture package handling

Use the existing 0618B store when possible:

```txt
WOSBuildingTexturePackageStore.importTexture(...)
WOSBuildingTexturePackageStore.packageTexture(...)
```

If browser `File` construction from canvas blob is used, ensure the result follows the same governance path as imported textures.

### Preview truth

The final proof result should be copied from `WOSBuildingTexturePreviewController.previewBuilding(...)`, not invented separately.

### Object readiness

Before previewing, call the texture-ready object helper if available.

Pseudo-flow:

```js
function applyVisibleProof(selection) {
  var objectResult = ensureOrCreateTextureReadyReplacement(selection);
  var packageResult = ensureProofTexturePackage();
  var assignResult = WOSBuildingTextureAssignmentController.assign(
    selection,
    'facade',
    packageResult.packageId,
    { repeat: { x: 1, y: 1 }, opacity: 1, blendMode: 'normal' }
  );
  return WOSBuildingTexturePreviewController.previewBuilding(
    selection,
    { slotName: 'facade' },
    callback
  );
}
```

## Acceptance Criteria

### AC1 — parse clean

All touched JS files parse clean.

### AC2 — test action visible

When a building is selected, Inspector shows:

```txt
Apply Test Texture
Clear Preview
Texture Proof: <state>
```

### AC3 — no-object case is explicit

If no structure replacement object exists and the patch does not auto-create one, the result must be:

```txt
FALLBACK — no_preview_object3d
```

No silent failure.

### AC4 — preferred proof path creates visible result

Preferred path:

```txt
Select building
→ Apply Test Texture
→ replacement actor exists / is created
→ texture-ready material exists
→ visible checker/stripe appears
→ proof status = APPLIED
```

### AC5 — APPLIED requires material mutation

`APPLIED` may only be returned when at least one mesh material receives the proof texture.

### AC6 — fallback is truthful

If material has no texture slot, result must be:

```txt
FALLBACK — uv_or_material_slot_unavailable
```

### AC7 — clear restores material

`Clear Preview` restores previous material maps using the 0618C restore path.

### AC8 — no actor manifest mutation

No proof-only fields are written into actor manifests.

Forbidden actor fields include:

```txt
buildingTextureProof
textureProofState
previewTexturePackage
proofTextureRuntimeUrl
```

### AC9 — publish contract unchanged

0618B publish remains the governed path:

```txt
bundle.buildingTextures
```

0618D must not bypass publish validation.

### AC10 — debug command works

`_wos.debug.studio.buildingTextureProof()` returns the last proof result and preview snapshot.

## Manual Smoke Test

```txt
1. Open Studio.
2. Go to Map.
3. Open View Options.
4. Enable Select target → Buildings.
5. Click a visible building.
6. In Inspector, click Apply Test Texture.
7. Confirm one of these truth states:
   - APPLIED: visible checker/stripe appears on replacement object
   - FALLBACK: reason shown
   - MISSING: package/assignment problem shown
8. If APPLIED, click Clear Preview.
9. Confirm material restores.
10. Publish should still use normal 0618B validation.
```

## Expected Result

The user should finally see a visible, unmistakable material change during authoring.

```txt
This patch is successful only when the screen changes.
```

## Closure Rule

0618D can close only after a screenshot or direct report confirms one of:

```txt
A. APPLIED with visible checker/stripe texture on a selected building replacement
B. FALLBACK with exact reason proving the missing object/material path
C. MISSING with exact package/assignment reason
```

Do not close on “files parse clean” alone.
