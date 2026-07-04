# 0617A_WOS_StudioSurfaceSimplificationPass_v1.0.0_BUILD

```txt
STATUS: [BUILD]
BUILD_READY: YES
SPEC_ID: 0617A_WOS_StudioSurfaceSimplificationPass_v1.0.0_BUILD
DATE: 2026-06-17
SYSTEM: WOS Studio / Surface UX
PASS: Studio Surface Simplification
```

## 1. Purpose

This pass cleans the WOS Studio UI after the 0616 custom-object roadmap completed.

The goal is to remove redundant controls, stop exposing implementation names, and restore a simple authoring mental model:

```txt
Import / choose from Library
→ place on Map or Canvas
→ inspect/edit selected thing
→ Publish to Broadcast
```

The UI must now support four top-level Studio surfaces:

```txt
Library | Map | Canvas | Broadcast
```

The Inspector is **not** a top-level surface. It is a persistent right-side editor for the current selection.

## 2. Classification

```txt
LAYER: Studio UI / authoring shell
AUTHORITY: Studio surface naming and layout authority
RUNTIME IMPACT: Studio only
WALL IMPACT: none, except navigation label to Broadcast if link remains
PUBLISH IMPACT: label-only, no publish contract change
MANIFEST IMPACT: none
```

This pass is a UX simplification pass. It must not introduce new object, actor, publish, Wall, GLB, or composition contracts.

## 3. Current Problem

The current Studio UI has accumulated internal architecture in the user-facing interface.

Observed confusion:

```txt
1. Two "Published" labels appear.
2. Inspector exists both as a top nav tab and as a right-side panel.
3. The map surface has been confused with "3D Canvas."
4. The blank 3D staging canvas is still needed, but is not clearly separated from Map.
5. Library is doing too much at once: import, export, filters, custom object management, GLB import, composition management, actors, and placement.
6. "Publish Actors" is no longer accurate because publish can include actors, custom asset records, material overrides, building replacements, and broadcast readiness.
7. "Open Wall" no longer matches user language. The output runtime should be called Broadcast.
```

## 4. Target Mental Model

The user-facing model must become:

```txt
Library   = choose/import/manage assets and actors
Map       = place objects into the world map
Canvas    = blank 3D staging space for objects/kits
Broadcast = live output window
Inspector = persistent right-side editor for current selection
Publish   = send safe Studio changes to Broadcast
```

Short version:

```txt
Library chooses.
Map places in the world.
Canvas stages in blank space.
Inspector edits selected things.
Broadcast shows the live output.
Publish sends safe Studio changes to Broadcast.
```

## 5. Non-Goals

This pass must not:

```txt
change actor manifest schema
change publish bundle schema
change Wall runtime behavior
change custom asset governance
change GLB import validation
change composition store contracts
add GLB runtime packaging
add building texture import
create a new 3D editor
rename internal files unless required
remove existing systems
remove the blank Canvas surface
```

Code filenames such as `threeDCanvasView.js` may remain unchanged. The user-facing label is what changes.

## 6. Top-Level Surfaces

Studio must expose exactly four primary surfaces:

```txt
Library
Map
Canvas
Broadcast
```

### 6.1 Library

Purpose:

```txt
choose/import/manage assets and actors
```

Library contains one unified source of truth, visually split into:

```txt
Assets = things that can be placed
Actors = things already placed
```

### 6.2 Map

Purpose:

```txt
world placement surface
```

Map is for:

```txt
placing actors into NYC/world coordinates
placing GLBs into the map
placing custom assets
placing compositions/kits
selecting buildings
editing building color/texture/replacement context
reviewing spatial location
```

### 6.3 Canvas

Purpose:

```txt
blank 3D staging surface
```

Canvas is for:

```txt
previewing imported GLBs
checking object scale
checking object material/shape
assembling kits in blank space
testing objects before map placement
future object-editing surface
```

Canvas must not be removed.

### 6.4 Broadcast

Purpose:

```txt
live output window
```

Broadcast replaces the current "Open Wall" label.

If Broadcast remains an external link to `../wall/index.html`, the label should still be:

```txt
Broadcast
```

not:

```txt
Open Wall
Preview Wall
Broadcast View
Home
```

## 7. Header / Top Bar

Replace current top bar behavior with:

```txt
WOS Studio     Library   Map   Canvas   Broadcast     [status chip]   Publish
```

### 7.1 Remove Inspector Tab

Remove `Inspector` from the top nav.

Inspector remains visible as the persistent right-side panel.

### 7.2 Rename Open Wall

Replace:

```txt
Open Wall →
```

with:

```txt
Broadcast
```

### 7.3 Rename Publish Actors

Replace:

```txt
Publish Actors
```

with:

```txt
Publish
```

### 7.4 Dedupe Published State

There must be only one publish state indicator.

Allowed:

```txt
Published        Publish
Draft Changes    Publish
Publishing...     Publish
Publish Failed    Publish
```

Forbidden:

```txt
Published chip + Published dropdown
Published label repeated twice
Publish Actors button
```

If an old status dropdown does not perform a real action, remove it.

## 8. Library Simplification

The Library must become easier.

Primary visible Library sections:

```txt
Search
Import
Assets
Actors
Advanced
```

### 8.1 Search

Single search input across Library rows.

### 8.2 Import

Primary import action:

```txt
Import GLB
```

This should be the only primary import button.

JSON import/export controls are not primary user actions.

### 8.3 Assets Section

Assets should include:

```txt
Built-in assets
Custom objects
Imported GLBs
Compositions / kits
```

These may be grouped or badged, but must live under the user-facing concept:

```txt
Assets
```

### 8.4 Actors Section

Actors should include placed objects.

If possible, differentiate:

```txt
Placed on Map
Placed on Canvas
```

If Canvas actor separation does not yet exist, show one Actors section and do not fake unsupported separation.

### 8.5 Advanced Section

Move these controls into a collapsed `Advanced` section:

```txt
Export Selected
Export All
Import JSON
Remove Selected
Force Remove
Custom object JSON import
Composition JSON import
Library backup export
Debug-only management actions
```

The default UI should not expose multiple JSON import/export systems.

## 9. Map Surface

Map should be a real top-level surface.

The Map center surface should show the map when active.

Map toolbar should be simplified to essentials:

```txt
Place Object
Select Building
View Options
```

Move internal or secondary controls into `View Options`:

```txt
Auth Scale
Labels
Buildings
Actors
Look: Illustration
Authoring visual mode toggles
readability toggles
```

### 9.1 Map Unavailable State

If the map cannot load, do not show an unexplained blank black surface.

Show a clear empty state:

```txt
Map unavailable
Check Mapbox token, local server, or map style.
[Retry Map]
```

## 10. Canvas Surface

Canvas is a blank 3D staging surface.

It may reuse existing `threeDCanvasView.js` internally if needed, but the visible label is:

```txt
Canvas
```

Canvas toolbar should stay simple:

```txt
Place Object
Reset View
Preview Selected
View Options
```

Canvas must support the same Library asset selection flow:

```txt
select asset in Library
→ Place on Canvas
```

If full Canvas placement cannot be completed in this pass, the button may be disabled with explicit text:

```txt
Canvas placement coming next
```

but the top-level surface must exist.

## 11. Inspector Behavior

Inspector is persistent right panel only.

It changes based on selection:

```txt
nothing selected → Select an asset, actor, building, or composition.
asset selected → Asset Inspector
actor selected → Actor Inspector
building selected → Building Inspector
composition selected → Composition Inspector
```

The top nav must not include Inspector.

## 12. Publish Behavior

The button label is:

```txt
Publish
```

Tooltip or helper text:

```txt
Publishes safe promoted Studio changes to Broadcast.
```

Publish behavior itself must not change.

This pass is label and layout simplification only unless a small integration is required to preserve existing publish behavior.

## 13. Broadcast Surface

The Broadcast surface/link opens or embeds the live output runtime.

Minimum acceptable implementation:

```txt
Broadcast top-nav item opens ../wall/index.html
```

Preferred implementation:

```txt
Broadcast top-nav item shows the Wall/Broadcast runtime inside the Studio center panel or opens it in a clean broadcast window, depending on existing architecture safety.
```

Do not call it Wall in user-facing UI.

Use:

```txt
Broadcast
```

## 14. Files In Scope

Expected files:

```txt
studio/index.html
studio/studioShell.js
studio/styles.css
studio/views/threeDCanvasView.js       only if needed for Map/Canvas surface split
studio/views/libraryController.js      only if needed for simplified Library search/grouping
```

Optional if a small new router/helper is cleaner:

```txt
studio/views/studioSurfaceController.js
```

## 15. Files Out of Scope

Do not modify:

```txt
wall/**
studio/systems/publish/**
studio/actors/actorManifestStore.js
studio/actors/customStudioAssetStore.js
studio/actors/glbImportStore.js
studio/actors/compositionStore.js
studio/actors/broadcastReadinessAnalyzer.js
```

Exception: `studio/index.html` may continue linking to `../wall/index.html`; this is a label/navigation concern only.

## 16. Required UI Label Changes

```txt
Inspector tab        → remove
Open Wall →          → Broadcast
Publish Actors       → Publish
3D Canvas as map     → Map
Blank staging area   → Canvas
```

Do not use:

```txt
Preview Wall
Broadcast View
Home
Surface
```

## 17. Acceptance Criteria

### AC1 — Four Surface Nav

Top nav contains exactly:

```txt
Library | Map | Canvas | Broadcast
```

### AC2 — No Inspector Tab

Inspector does not appear in top nav.

Inspector remains as persistent right panel.

### AC3 — Publish Button Simplified

Publish button text is exactly:

```txt
Publish
```

No `Publish Actors` label remains.

### AC4 — Publish State Deduped

Only one publish state indicator exists.

No duplicate `Published` chip/dropdown pairing remains.

### AC5 — Broadcast Label

No user-facing `Open Wall`, `Preview Wall`, or `Wall` label remains in the top bar.

The output surface is called:

```txt
Broadcast
```

### AC6 — Library Is One Library

Library remains one unified panel.

It clearly differentiates:

```txt
Assets
Actors
```

### AC7 — Single Primary Import

Primary Library import is:

```txt
Import GLB
```

JSON import/export tools are hidden under collapsed Advanced controls.

### AC8 — Map Surface Exists

Map is a top-level surface and is the world placement target.

If map is unavailable, a clear map unavailable state is shown.

### AC9 — Canvas Surface Exists

Canvas is a top-level surface and is the blank staging target.

Canvas is not removed.

### AC10 — Advanced Tools Collapsed

Export/import/remove/force/debug library management actions are not shown in the default Library view.

They are either removed from UI or moved under collapsed Advanced.

### AC11 — No Contract Changes

No actor manifest, publish bundle, Wall runtime, custom asset, GLB import, or composition contract changes occur.

### AC12 — No Wall Diff

No `wall/**` files are modified for this pass.

### AC13 — Parse Clean

All modified JavaScript files parse cleanly.

## 18. Manual Test Plan

### T1 — Top Nav

Open Studio and confirm top nav reads:

```txt
Library | Map | Canvas | Broadcast
```

### T2 — Inspector

Confirm Inspector is not a tab and remains visible as the right-side panel.

### T3 — Publish Area

Confirm only one publish state exists and button label is `Publish`.

### T4 — Broadcast

Click `Broadcast` and confirm it opens or displays the live output runtime.

### T5 — Library

Confirm Library has one clear hierarchy:

```txt
Import
Assets
Actors
Advanced
```

### T6 — Import GLB

Confirm `Import GLB` is visible as the primary import path.

### T7 — Advanced Hidden

Confirm JSON import/export/remove tools are not visible unless `Advanced` is expanded.

### T8 — Map

Confirm Map surface loads map or displays a clear unavailable message.

### T9 — Canvas

Confirm Canvas surface exists as blank staging space and is not confused with Map.

### T10 — No Contracts Changed

Run targeted diff checks:

```bash
git diff -- wall/
git diff -- studio/systems/publish/
git diff -- studio/actors/actorManifestStore.js
git diff -- studio/actors/customStudioAssetStore.js
git diff -- studio/actors/glbImportStore.js
git diff -- studio/actors/compositionStore.js
```

Expected: no 0617A changes.

## 19. Build Notes

This pass should be ruthless about removing UI noise.

Do not add new authoring features.

Do not expand advanced workflows.

Do not expose internal implementation names.

The product should now read like this:

```txt
Library | Map | Canvas | Broadcast
```

not like this:

```txt
asset library / actor library / 3D canvas / inspector / wall / publish actors / custom object management / GLB bridge / composition governance
```

## 20. Next Pass

After 0617A passes, the next feature pass should be:

```txt
0617B_WOS_GLBAssetRuntimePackagingPass_v1.0.0_BUILD
```

Purpose:

```txt
Studio imported GLB
→ package/host GLB file
→ save stable asset URL/reference
→ include safe GLB asset record in publish bundle
→ Wall loads GLB from approved path
→ fallback proxy if missing/heavy
```
