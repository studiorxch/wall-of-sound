```
# 0613 Phase 4 UX Patch — Make Actor Creation Real## ProblemWOS 3D Canvas Lab technically supports actor creation through:1. `+ Place Actor` → click map2. Drag Library asset → drop on mapBut the actual authoring UX is broken.When an author selects an asset in the Library, that selected asset is not connected to the 3D Canvas placement flow. The toolbar still uses the Placeholder dropdown value, so there is no clear way to create the selected asset.This violates the locked goal:```txtCanvas Lab → 3D Canvas LabDragDropMovePlaceSave
```

The author must be able to select an asset and place it.

## Task

Patch the 3D Canvas authoring flow so selecting an asset in the Library sets the active placement asset.

## Files to edit

```
studio/studioShell.jsstudio/views/threeDCanvasView.jsstudio/actors/actorPlacementController.jsstudio/styles.css
```

## Required behavior

### 1. Library asset click selects active placement asset

When the user clicks an asset row in the Library:

```
Generic VesselMTA Bus StandardPlaceholder Cubeetc.
```

the selected asset must become the active placement asset for the 3D Canvas.

Do not route selected assets through legacy `asset-library` mode.

Do not call:

```
setMode('asset-library')
```

because `asset-library` is not a primary Studio mode anymore.

Instead:

```
selectedAssetId = assetIdWOSThreeDCanvasView.setActiveAsset(assetId)toolbar dropdown updates to assetIdLibrary row highlights selected asset
```

### 2. `+ Place Actor` must place selected asset

When `+ Place Actor` is active and the author clicks the map:

```
actor.assetId = selected Library assetId
```

If no asset is selected, fallback to:

```
wos_placeholder_cube
```

### 3. Add visible Library action

Add a small action button or hint for selected assets:

```
Place in 3D Canvas
```

Behavior:

```
Click "Place in 3D Canvas"→ switches to 3D Canvas if needed→ arms placement mode→ next map click places selected asset
```

### 4. Double-click shortcut

Double-clicking an asset row should also arm placement:

```
Double-click asset row→ switch to 3D Canvas→ set active asset→ placement mode ON
```

### 5. Keep drag/drop path

Do not remove drag/drop.

Drag/drop should still use:

```
application/wos-asset-id
```

and place the dropped asset at the map drop coordinate.

### 6. Toolbar dropdown sync

The 3D Canvas toolbar asset dropdown must reflect the selected Library asset.

Add public API to `WOSThreeDCanvasView`:

```
setActiveAsset(assetId)getActiveAsset()armPlacement(assetId)
```

Expected behavior:

```
WOSThreeDCanvasView.setActiveAsset('asset://marine/vessel_generic')WOSThreeDCanvasView.getActiveAsset()// returns 'asset://marine/vessel_generic'
```

If the toolbar exists, `setActiveAsset()` updates its selected option.

### 7. Placeholder fallback cleanup

In `actorPlacementController.js`, patch the old fallback:

```
var assetId = opts.assetId || (resolver ? resolver.placeholderAssetId() : 'sr_placeholder_cube_001');
```

Replace with:

```
var assetId = opts.assetId || (resolver ? resolver.placeholderAssetId() : 'wos_placeholder_cube');
```

## Constraints

- Do not add a new primary tab.
- Do not restore Asset Library / Actor Library.
- Do not restore Proof Stage.
- Do not expose `assetPath`.
- Do not bypass `ActorManifestStore`.
- Do not add another renderer.
- Do not change Phase 4 governance lifecycle rules.
- Do not make promoted actors directly editable.
- Do not make retired actors placeable.
- Keep drag/drop working.

## Acceptance checks

### A. Select asset → toolbar sync

1. Open Studio.
2. Click `Generic Vessel` in Library.
3. Check toolbar dropdown.

Expected:

```
toolbar selected asset = Generic Vessel / asset://marine/vessel_generic
```

### B. Place selected asset

1. Click `Generic Vessel`.
2. Click `+ Place Actor`.
3. Click map.

Expected manifest:

```
WOSActorManifestStore.list().at(-1).assetId
```

Expected result:

```
asset://marine/vessel_generic
```

or the exact Generic Vessel asset id used by `ActorAssetLibraryAuthority`.

### C. Placeholder fallback

1. Clear selected asset.
2. Click `+ Place Actor`.
3. Click map.

Expected:

```
wos_placeholder_cube
```

### D. Drag/drop still works

1. Drag `MTA Bus Standard` from Library.
2. Drop on map.

Expected:

```
new actor assetId = selected dragged asset id
```

### E. Inspector opens after placement

After placing an actor:

```
actor selectedInspector shows actor propertiesLibrary actor list refreshes
```

### F. No forbidden manifest path

Run:

```
JSON.stringify(WOSActorManifestStore.load()).includes("assetPath")
```

Expected:

```
false
```

## Output report

Return:

- files changed
- exact behavior added
- selected asset → placement verification
- drag/drop verification
- placeholder fallback verification
- no `assetPath` verification

```
## Verdict```txtPhase 4 cannot be accepted until actor creation is obvious.
```

The next patch should prioritize this over deeper governance work. The Lab must first let you **select an asset and place it** without guessing.