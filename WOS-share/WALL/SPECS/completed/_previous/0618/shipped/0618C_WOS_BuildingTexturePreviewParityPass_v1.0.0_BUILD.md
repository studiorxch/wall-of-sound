# 0618C_WOS_BuildingTexturePreviewParityPass_v1.0.0_BUILD

## Build Status

```txt
BUILD_READY
```

## Purpose

0618C closes the authoring feedback gap created by 0618B.

0618B makes building texture packages importable, packageable, assignable, publishable, and loadable by Broadcast. 0618C makes those assignments visibly previewable in Studio before publish, with the same fallback truth Broadcast will use.

The goal is not final texture art quality. The goal is authoring parity:

```txt
Select building
→ assign packaged texture
→ Studio immediately previews the assignment when possible
→ Studio explicitly reports fallback when direct preview is unavailable
→ Preview truth matches Broadcast behavior
```

## Product Requirement

A user must be able to select a building in Map, assign a packaged texture, and immediately understand one of three outcomes:

```txt
APPLIED   — Studio can preview the texture on the selected replacement/building object
FALLBACK  — Studio cannot apply the texture directly and is showing fallback material/state
MISSING   — package, assignment, runtime URL, or selected building reference is invalid
```

The authoring surface must not claim visual success when the runtime cannot apply the texture.

## Background

0618B is closed with this chain:

```txt
Import image texture
→ validate png/jpg/webp
→ package for Broadcast
→ write wall/assets/textures/buildings/*
→ assign package to selected building slot
→ preview/publish validates all assignments
→ bundle.buildingTextures emitted
→ Wall activates texture registry
→ Wall applicator loads texture
→ texture applies when object/UV path exists
→ explicit fallback diagnostic when unavailable
```

Remaining gap:

```txt
Studio assignment exists, but authoring preview is not yet visibly authoritative.
```

0618C adds that preview layer without changing the 0618B publish/runtime contract.

---

# Non-Negotiable Boundaries

## 1. No Actor Manifest Mutation

Building texture preview must never write texture package state into actor manifests.

Forbidden actor fields remain forbidden:

```txt
buildingTexturePackageId
buildingTextureAssignment
buildingTexture
texturePackage
textureRuntimeUrl
textureObjectUrl
textureBitmap
textureCanvas
textureBase64
textureLocalPath
```

Assignments remain building-scoped via:

```txt
WOSBuildingTextureAssignmentController
```

Package metadata remains package-scoped via:

```txt
WOSBuildingTexturePackageStore
```

## 2. Studio Preview Is Diagnostic + Visual, Not Authority

Studio preview can:

```txt
load packaged runtime texture
apply it to available Studio-side Three.js object/material when possible
show fallback swatch/material/overlay when not possible
emit preview diagnostics
```

Studio preview cannot:

```txt
write to actor manifests
write to bundle.buildingTextures
mutate Wall runtime state
mutate Mapbox base style permanently
create new package schema
invent texture art
```

## 3. 0618B Bundle Contract Stays Fixed

No bundle schema change unless absolutely required.

Expected existing block remains:

```js
bundle.buildingTextures = {
  schema: "wos.wall.buildingTextures",
  version: "1.0.0",
  generatedAt,
  packages: [],
  assignments: []
}
```

0618C should preview the same package/assignment model, not add a second preview-only assignment model.

## 4. Fallback Is First-Class

If Studio cannot apply texture to the selected building because there is no direct Three.js building object, no UVs, no replacement mesh, no packaged runtime URL, or no accessible texture loader, the UI must show fallback explicitly.

Do not silently fail.

Do not display “applied” unless the texture was actually applied to a material slot.

---

# Required Files

Expected new file:

```txt
studio/buildings/buildingTexturePreviewController.js
```

Expected modified files:

```txt
studio/index.html
studio/studioShell.js
studio/styles.css
studio/views/threeDCanvasView.js
```

Optional, only if needed:

```txt
studio/actors/actorObjectRenderLayer.js
wall/systems/runtime/wallRuntimeBuildingTextureApplicator.js
```

Wall runtime modification should be avoided unless a tiny shared helper is needed. 0618C is primarily Studio preview parity.

---

# Required Module: buildingTexturePreviewController.js

Create:

```txt
studio/buildings/buildingTexturePreviewController.js
```

Global export:

```js
window.WOSBuildingTexturePreviewController
```

## Responsibilities

```txt
- resolve current selected building assignment
- resolve assigned texture package records
- load packaged runtime texture from safe runtimeUrl
- apply texture to Studio-side preview object if available
- report fallback if object/material/UV path unavailable
- clear preview state when selection changes
- expose debug snapshot
```

## Required API

```js
WOSBuildingTexturePreviewController.previewBuilding(selection, options, callback)
WOSBuildingTexturePreviewController.clearPreview(selectionOrKey)
WOSBuildingTexturePreviewController.clearAll()
WOSBuildingTexturePreviewController.getSnapshot()
WOSBuildingTexturePreviewController.getPreviewState(buildingKey)
```

### previewBuilding(selection, options, callback)

Input:

```js
selection = {
  featureId,
  sourceId,
  sourceLayer,
  layerId,
  centroid,
  properties
}

options = {
  slotName?: "facade" | "roof" | "base" | "accent",
  forceReload?: boolean,
  renderFallback?: boolean
}
```

Return/callback result:

```js
{
  ok: true,
  buildingKey,
  status: "APPLIED" | "FALLBACK" | "MISSING",
  slotName,
  packageId,
  reason?: string,
  appliedObjectId?: string,
  runtimeUrl?: string
}
```

Failure should return structured status, not throw into the UI.

---

# Preview Resolution Logic

## Step 1 — Resolve Building Key

Use existing assignment controller helper:

```js
var key = WOSBuildingTextureAssignmentController.buildingKey(selection)
```

If missing:

```txt
status = MISSING
reason = invalid_selection
```

## Step 2 — Resolve Assignment

```js
var assignment = WOSBuildingTextureAssignmentController.getForBuilding(selection)
```

If absent:

```txt
status = MISSING
reason = no_assignment
```

## Step 3 — Resolve Slot

Default priority:

```txt
facade → first available slot
```

If selected slot has no package:

```txt
status = MISSING
reason = slot_no_package
```

## Step 4 — Resolve Package

```js
var pkg = WOSBuildingTexturePackageStore.get(packageId)
```

Required package conditions:

```txt
pkg exists
pkg.status === "packaged"
pkg.runtimeUrl exists
runtimeUrl is relative and safe
mimeType is image/png, image/jpeg, or image/webp
```

If not:

```txt
status = MISSING
reason = package_not_ready | unsafe_runtime_url | unsupported_mime
```

## Step 5 — Locate Preview Object

Try in this order:

```txt
1. selected replacement actor object bound to the building
2. Studio actor object render layer object3D
3. ThreeDCanvasView building preview object if exposed
4. BuildingReplacementLayer preview object if exposed
5. fallback visual only
```

Recommended helper in `threeDCanvasView.js`:

```js
getBuildingPreviewObject3D(selectionOrBuildingKey)
```

If direct object is unavailable:

```txt
status = FALLBACK
reason = no_preview_object3d
```

## Step 6 — Apply Texture

Use `THREE.TextureLoader` in Studio.

Texture settings should mirror 0618B assignment slot metadata:

```txt
repeat.x
repeat.y
rotationDeg
opacity
blendMode
textureRole
```

Minimum required application:

```js
material.map = texture
material.needsUpdate = true
```

If material/UV path is unavailable:

```txt
status = FALLBACK
reason = uv_or_material_slot_unavailable
```

---

# Studio UI Requirements

## Selected Building Inspector

In the existing selected-building Inspector texture subsection, add a preview status block.

Required display:

```txt
Building Textures
Current Assignment
- facade → <package label> [Preview: APPLIED/FALLBACK/MISSING]

Actions:
Preview Texture
Clear Preview
Remove
Clear Building Textures
```

When assignment changes successfully, Studio should automatically attempt preview:

```txt
Assign → previewBuilding(selection)
```

Manual preview is still required:

```txt
Preview Texture
```

## Status Labels

Use plain visible labels:

```txt
Preview: Applied
Preview: Fallback
Preview: Missing
Preview: Not Run
```

Include the reason string in smaller text:

```txt
no_preview_object3d
uv_or_material_slot_unavailable
package_not_ready
```

## Library Texture Rows

No major UI expansion. Texture package rows may optionally show:

```txt
Used by N building(s)
```

This is optional for 0618C. Do not bloat Library.

---

# Map Preview Behavior

## When Direct Preview Is Possible

If selected building has a replacement actor or Studio-side preview mesh:

```txt
apply actual texture to preview object
mark preview state APPLIED
```

## When Direct Preview Is Not Possible

If selected building is still a Mapbox basemap extrusion or has no editable Three.js preview object:

```txt
show fallback material/tint/outline/overlay on selected building
mark preview state FALLBACK
reason = no_preview_object3d
```

Fallback can be implemented as any of:

```txt
- selected building outline pulse
- material color tint using existing material override path
- inspector-only preview swatch with explicit fallback message
```

But it must be explicit.

## Do Not Fake Success

This is invalid:

```txt
assign texture → show package label only → user assumes it worked
```

This is valid:

```txt
assign texture → Preview: Fallback — no editable 3D building object available
```

---

# Diagnostics

Add Studio-side debug surface:

```js
_wos.debug.studio.buildingTexturePreview()
_wos.debug.studio.buildingTexturePreview(buildingKey)
```

Expected snapshot:

```js
{
  enabled: true,
  previewCount: 0,
  appliedCount: 0,
  fallbackCount: 0,
  missingCount: 0,
  states: {
    "composite|building|123": {
      status: "FALLBACK",
      packageId: "building.tex.pkg...",
      slotName: "facade",
      reason: "no_preview_object3d",
      updatedAt: "..."
    }
  },
  lastError: null
}
```

Do not add Wall counters unless Wall behavior changes. 0618B already owns Wall texture diagnostics.

---

# CSS Requirements

Add compact styles only.

Expected selectors:

```css
.btex-preview-state
.btex-preview-state--applied
.btex-preview-state--fallback
.btex-preview-state--missing
.btex-preview-reason
.btex-preview-actions
.btex-preview-swatch
```

UI should remain dense and inspector-native.

---

# Acceptance Criteria

## AC1 — Preview Controller Exists

```txt
WOSBuildingTexturePreviewController exists and exposes required API.
```

## AC2 — Selection Assignment Preview

Given a selected building with a packaged texture assignment:

```txt
click Preview Texture
→ previewBuilding(selection) runs
→ preview state updates in Inspector
```

## AC3 — Auto Preview After Assign

Given a user assigns a packaged texture to a building slot:

```txt
assignment saved
→ preview runs automatically
→ status shown without requiring publish
```

## AC4 — Fallback Truth

Given selected building has no editable Three.js object:

```txt
Preview: Fallback
reason: no_preview_object3d
```

No success claim is shown.

## AC5 — Applied Truth

Given selected building has an editable preview object/material slot:

```txt
Preview: Applied
texture appears on object/material
```

## AC6 — Missing Package Truth

Given assignment references missing/draft/unpackaged package:

```txt
Preview: Missing
reason: package_not_ready or package_not_found
```

## AC7 — Clear Preview

```txt
Clear Preview removes Studio preview material/overlay state for selected building.
```

It must not remove assignment.

## AC8 — Remove Assignment Still Works

Existing 0618B Remove Slot and Clear Building Textures continue to work.

## AC9 — Publish Contract Unchanged

0618C must not alter:

```txt
bundle.buildingTextures schema
buildingTexture package record shape
buildingTexture assignment record shape
actor manifest schema
Wall actor filter forbidden fields
```

## AC10 — Debug Snapshot Works

```js
_wos.debug.studio.buildingTexturePreview()
```

returns live preview state.

## AC11 — No Wall Runtime Regression

Broadcast still boots and applies/fallbacks exactly as 0618B defined.

## AC12 — JS Parse Clean

All modified JS files parse clean.

---

# Manual Test Plan

## Test 1 — Assign + Fallback Preview

```txt
1. Open Studio → Map.
2. Select a Mapbox building with no replacement actor.
3. Import and package a texture.
4. Assign texture to facade.
5. Confirm Inspector says Preview: Fallback.
6. Confirm reason is no_preview_object3d or equivalent.
```

Expected:

```txt
No crash.
No fake Applied state.
Assignment remains saved.
```

## Test 2 — Replacement Actor Preview

```txt
1. Select a building.
2. Create Structure Replacement.
3. Assign packaged texture to facade.
4. Run Preview Texture.
```

Expected:

```txt
If replacement object exposes material.map:
Preview: Applied
Texture visible on replacement object
```

If not:

```txt
Preview: Fallback
reason: uv_or_material_slot_unavailable
```

## Test 3 — Missing Package Preview

```txt
1. Create assignment to a package.
2. Remove package or force package status draft/missing-file.
3. Select building.
4. Run preview.
```

Expected:

```txt
Preview: Missing
Publish still blocks via 0618B gate
```

## Test 4 — Clear Preview

```txt
1. Apply or fallback-preview a building texture.
2. Click Clear Preview.
```

Expected:

```txt
Preview state removed.
Assignment remains in Current Assignment.
```

## Test 5 — Publish Parity

```txt
1. Preview assignment in Studio.
2. Publish.
3. Open Broadcast.
4. Compare Wall debug:
   _wos.debug.wall.buildingTextures()
```

Expected:

```txt
Studio preview status and Broadcast result agree in applied/fallback/missing truth category.
```

---

# Implementation Notes

## Safe Runtime URL Check

Use same rule as Wall registry:

```js
function isSafeRuntimeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.indexOf('blob:') === 0) return false;
  if (url.indexOf('file:') === 0) return false;
  if (url.indexOf('http://') === 0) return false;
  if (url.indexOf('https://') === 0) return false;
  return true;
}
```

## Texture Cache

Studio preview may cache loaded textures by packageId, but must dispose on `clearAll()` if texture has `dispose()`.

## Material Restore

If direct preview replaces `material.map`, preserve prior map if practical:

```js
_prevMaterials[buildingKey] = [{ mesh, material, previousMap }]
```

Then `clearPreview()` can restore previous map.

If restore is too risky, clear only preview state and document that direct preview is temporary until object refresh.

## Selected Building Refresh

After assign/remove/clear, re-render Inspector:

```js
_renderSelectedActorInspector(_byId('studio-inspector-body'))
```

Existing 0618B uses this pattern. Preserve it.

---

# Completion Definition

0618C is complete when this product loop works:

```txt
I select a building.
I assign a packaged texture.
Studio immediately tells me whether that texture can actually be previewed.
If it can, I see it.
If it cannot, I see an explicit fallback reason.
Publishing still uses the 0618B governed bundle path.
```

## Final Expected Roadmap State

```txt
0617C GLB Asset Runtime Packaging: CLOSED
0618A Broadcast GLB Render Pass: CLOSED
0618B Building Texture Package Authoring: CLOSED
0618C Building Texture Preview Parity: READY FOR BUILD
```
