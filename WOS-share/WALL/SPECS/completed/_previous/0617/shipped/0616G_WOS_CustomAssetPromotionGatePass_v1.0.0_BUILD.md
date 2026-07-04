# 0616G_WOS_CustomAssetPromotionGatePass_v1.0.0_BUILD

**Status:** BUILD SPEC  
**Date:** 2026-06-16  
**Scope:** Studio-only promotion governance  
**Depends on:** 0616A, 0616B, 0616C, 0616D, 0616E, 0616F  
**Primary goal:** add promotion-gate validation for actors using custom Studio assets, proving that saved `shapeRecipe` and `materialRecipe` records are safe, bounded, registry-resolved, and actor-manifest-clean before promotion.

---

## 1. Purpose

0616D–0616F created the custom asset loop:

```txt
shape draft
→ material draft
→ save custom asset
→ place custom asset
→ reopen / update / fork custom asset
```

0616G adds the governance layer:

```txt
custom Studio asset actor
→ Submit for Promotion
→ validate asset exists
→ validate custom asset recipe integrity
→ block malformed custom assets
→ keep actor manifest assetId-only
→ no Wall / publish changes
```

This pass does **not** publish custom assets to Wall. It only ensures that a promoted actor cannot reference a broken, malformed, removed, or governance-invalid custom asset.

---

## 2. Architectural boundary

Custom asset recipes are allowed on **asset records** only:

```txt
ActorAssetLibraryAuthority asset record
  shapeRecipe
  materialRecipe
  source: studio-custom
```

Actor manifests must continue to store only:

```txt
assetId: "studio.custom.prop.boxStack.001"
```

0616G validates the asset behind that `assetId`. It must not copy `shapeRecipe`, `materialRecipe`, material slots, shape params, or authoring-only fields onto actor manifests.

---

## 3. Files in scope

Expected files:

```txt
studio/actors/promotionGateController.js
studio/actors/customStudioAssetStore.js
studio/actors/assetResolver.js
studio/studioShell.js
studio/styles.css
```

Optional helper file if useful:

```txt
studio/actors/customAssetGovernanceValidator.js
```

Out of scope:

```txt
wall/**
studio/systems/publish/**
wall/data/wos-wall-runtime-bundle.json
studio/actors/actorManifestStore.js
```

---

## 4. Hard constraints

0616G must not introduce:

- Wall runtime changes
- publish bundle schema changes
- actor manifest schema changes
- GLB import
- mesh upload validation
- runtime rendering of custom recipes in Wall
- promotion of raw recipe fields into actor manifests
- new lifecycle states
- silent auto-fixes during promotion

Promotion validation may **read** resolved asset records. It may not mutate custom assets unless the user explicitly presses a repair/update action outside the gate.

---

## 5. Required validation groups

### 5.1 Asset resolution checks

For every actor submitted to promotion:

```txt
actor.assetId exists
→ WOSAssetResolver.resolve(actor.assetId)
→ resolved.asset exists
→ resolved.placeholder === false
→ asset is not _customAssetRemoved
```

Failure examples:

```txt
asset_missing
asset_unresolved
asset_removed
asset_placeholder_only
```

### 5.2 Custom asset checks

Only run these if:

```txt
asset.source === "studio-custom"
```

Required checks:

```txt
asset.id matches actor.assetId
asset.editable is boolean
asset.category exists
asset.variants exists
asset.defaultVariant exists
asset.defaultVariant exists inside variants
asset.authoring exists
asset.authoring.createdAt exists
asset.authoring.updatedAt exists
```

### 5.3 Shape recipe checks

For custom assets:

```txt
shapeRecipe exists
shapeRecipe.template exists
shapeRecipe.params exists
shapeRecipe.template is known by WOSActorProxyGeometryFactory
all required params for template are present
all params are finite numbers
all params are inside allowed bounds
no unknown dangerous keys
```

Use the same template authority already established by 0616B:

```txt
WOSActorProxyGeometryFactory.paramKeysFor(template)
WOSActorProxyGeometryFactory.defaultParamsFor(template)
```

A custom asset may include optional known params, but it must not include arbitrary executable data, paths, URLs, scripts, functions, or nested objects inside `shapeRecipe.params`.

Allowed param value type:

```txt
number
```

Forbidden param value types:

```txt
string
object
array
function
boolean
null
undefined
```

### 5.4 Material recipe checks

For custom assets:

```txt
materialRecipe exists
materialRecipe.slots exists
slot keys are recognized
slot colors are valid #RGB or #RRGGBB
materialClass is null or allowed value
roughness is null or 0..1
metalness is null or 0..1
opacity is null or 0..1
```

Allowed slot keys:

```txt
body
roof
glass
accent
edge
emissive
```

Allowed material classes:

```txt
null
lambert
standard
emissive
```

### 5.5 Actor/category compatibility checks

Validate that the custom asset can legally represent the actor category:

```txt
actor.actorCategory
→ asset.category
→ WOSAssetResolver.resolvePlacementDefaults(asset.id)
→ actorCategory / actorType
```

Required behavior:

```txt
resolved placement actorCategory should match actor.actorCategory
```

If it does not match, gate should produce a blocking failure unless a future explicit override system exists. For this pass, do not add overrides.

### 5.6 Manifest cleanliness checks

Before promotion passes, assert that the actor manifest does **not** contain custom recipe fields.

Forbidden actor manifest fields:

```txt
shapeRecipe
materialRecipe
shapeDraft
materialDraft
materialSlots
slotColors
roughnessPreview
metalnessPreview
opacityPreview
customAssetRecipe
customAssetSource
studioCustomAsset
proxyParams
parametricTemplate
```

The actor manifest may only reference the asset by `assetId`.

---

## 6. Promotion gate integration

0616G should extend the existing `WOSPromotionGateController` checks, not replace the gate.

Expected pattern:

```txt
existing Group A checks
+ custom asset governance checks
→ gate result shown in Inspector
→ promotion blocked on Group A failures
```

New check IDs should be stable and grep-friendly.

Recommended check IDs:

```txt
A_CUSTOM_ASSET_RESOLVES
A_CUSTOM_ASSET_NOT_REMOVED
A_CUSTOM_ASSET_SHAPE_RECIPE_VALID
A_CUSTOM_ASSET_MATERIAL_RECIPE_VALID
A_CUSTOM_ASSET_CATEGORY_COMPATIBLE
A_CUSTOM_ASSET_MANIFEST_CLEAN
```

Optional warning IDs:

```txt
B_CUSTOM_ASSET_NO_LABEL
B_CUSTOM_ASSET_NO_UPDATED_TIMESTAMP
B_CUSTOM_ASSET_UNUSED_VARIANTS
```

Blocking failures must be Group A.

---

## 7. Inspector UX

When a Draft actor using a custom asset is selected, the Inspector should show a small governance status inside the Custom Asset section or lifecycle section.

Required display fields:

```txt
Custom Asset Governance
assetId
source
shapeRecipe: pass/fail
materialRecipe: pass/fail
category compatibility: pass/fail
manifest cleanliness: pass/fail
promotion ready: yes/no
```

When promotion is blocked, the existing gate result display must list the custom asset failures with readable messages.

Example messages:

```txt
Custom asset shapeRecipe is missing required param lengthM.
Custom asset materialRecipe slot glass is not a valid hex color.
Actor manifest contains forbidden field shapeRecipe; recipes must live on the asset record only.
Custom asset category resolves to prop but actor category is structure.
```

---

## 8. Debug API

Add:

```js
_wos.debug.studio.customAssetGovernance()
_wos.debug.studio.validateSelectedCustomAsset()
_wos.debug.studio.validateCustomAsset(assetId)
```

Required snapshot shape:

```js
{
  enabled: true,
  selectedObjectId: string | null,
  selectedActorAssetId: string | null,
  selectedActorIsCustom: boolean,
  selectedLifecycleState: string | null,
  selectedCanPromote: boolean,
  checks: [
    {
      id: string,
      group: "A" | "B",
      result: "pass" | "fail" | "warned",
      message: string
    }
  ],
  failureCount: number,
  warningCount: number,
  lastError: string | null
}
```

`validateCustomAsset(assetId)` should validate the asset record directly even when no actor is selected. Actor/category/manifest checks may return `skipped_no_actor` in that path.

---

## 9. Required acceptance tests

### AC1 — parse checks

```bash
node --check studio/actors/promotionGateController.js
node --check studio/actors/customStudioAssetStore.js
node --check studio/actors/assetResolver.js
node --check studio/studioShell.js
```

If a new helper file is added:

```bash
node --check studio/actors/customAssetGovernanceValidator.js
```

### AC2 — valid custom asset promotes

Given:

```txt
Draft actor
assetId = valid studio.custom.* asset
shapeRecipe valid
materialRecipe valid
manifest clean
```

Expected:

```txt
Submit for Promotion passes custom asset Group A checks.
Promotion remains governed by existing non-custom checks.
```

### AC3 — missing custom asset blocks promotion

Given:

```txt
actor.assetId = studio.custom.prop.deleted.999
resolver cannot resolve asset
```

Expected:

```txt
A_CUSTOM_ASSET_RESOLVES = fail
Promote button blocked
```

### AC4 — removed custom asset blocks promotion

Given:

```txt
asset._customAssetRemoved === true
```

Expected:

```txt
A_CUSTOM_ASSET_NOT_REMOVED = fail
```

### AC5 — malformed shape recipe blocks promotion

Examples:

```txt
missing shapeRecipe
unknown template
missing required param
param value is string
param value is Infinity / NaN
param outside bounds
```

Expected:

```txt
A_CUSTOM_ASSET_SHAPE_RECIPE_VALID = fail
```

### AC6 — malformed material recipe blocks promotion

Examples:

```txt
slot color = "red"
slot color = "#GGGGGG"
materialClass = "shader"
roughness = 2
opacity = -1
```

Expected:

```txt
A_CUSTOM_ASSET_MATERIAL_RECIPE_VALID = fail
```

### AC7 — category mismatch blocks promotion

Given:

```txt
actor.actorCategory = structure
asset.category resolves to prop
```

Expected:

```txt
A_CUSTOM_ASSET_CATEGORY_COMPATIBLE = fail
```

### AC8 — manifest recipe leakage blocks promotion

Given actor manifest includes any forbidden recipe field:

```txt
shapeRecipe
materialRecipe
shapeDraft
materialDraft
```

Expected:

```txt
A_CUSTOM_ASSET_MANIFEST_CLEAN = fail
```

### AC9 — non-custom assets unaffected

Given starter-pack asset from 0616A:

```txt
asset.source !== studio-custom
```

Expected:

```txt
custom asset recipe checks skipped or pass-neutral
existing promotion behavior unchanged
```

### AC10 — debug commands return expected snapshots

Run:

```js
_wos.debug.studio.customAssetGovernance()
_wos.debug.studio.validateSelectedCustomAsset()
_wos.debug.studio.validateCustomAsset("studio.custom.prop.boxStack.001")
```

Expected:

```txt
No throw
structured check list
failure/warning counts correct
```

### AC11 — no forbidden manifest/publish leakage

```bash
grep -R "shapeRecipe\|materialRecipe\|shapeDraft\|materialDraft\|materialSlots\|slotColors\|customAssetRecipe\|proxyParams\|parametricTemplate" \
  studio/actors/actorManifestStore.js \
  studio/systems/publish \
  wall/data \
  wall 2>/dev/null
```

Expected:

```txt
No 0616G-introduced matches in actor manifests, publish pipeline, Wall runtime, or wall data.
```

Comment-only mentions inside 0616G validation code are acceptable only if they are not in manifest/publish/Wall paths.

### AC12 — no Wall diff

```bash
git diff -- wall/
git diff -- studio/systems/publish/
```

Expected:

```txt
No 0616G changes.
```

---

## 10. Failure model

0616G should fail closed.

If a validator cannot access a required authority:

```txt
WOSAssetResolver unavailable
WOSActorProxyGeometryFactory unavailable
WOSCustomStudioAssetStore unavailable
```

Then custom asset validation should return a blocking failure for custom assets, not a silent pass.

Non-custom starter-pack assets should continue through the existing gate without requiring custom validators.

---

## 11. Completion definition

0616G is complete when:

```txt
custom assets can be saved / placed / edited
AND promotion checks validate custom asset integrity
AND malformed custom assets are blocked
AND actor manifests remain assetId-only
AND no Wall or publish files are touched
```

At that point, custom Studio assets are governance-safe for Studio promotion, but still not Wall-published as recipes. Wall runtime support remains deferred to 0616H.

---

## 12. Next build

```txt
0616H_WOS_CustomAssetPublishRuntimePass_v1.0.0_BUILD
```

Purpose:

```txt
promoted actor references custom assetId
→ publisher includes safe custom asset records
→ Wall runtime loads shapeRecipe/materialRecipe
→ Wall renders custom asset safely
→ diagnostics report missing/malformed custom assets
```
