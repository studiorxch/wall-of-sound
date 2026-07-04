---
updated: 2026-06-19
---

# README — WOS Studio

Separate authoring shell for Wall of Sound.

**Broadcast / Wall** remains the live product/world viewer.
**Studio** is the full-page authoring workspace for assets, actors, map placement, canvas staging, imports, and publish preparation.

```txt
WOS
├─ Broadcast / Wall   (wall/index.html)
│  └─ live world view, camera modes, Drive, feeds, actors, music, OBS output
│
└─ Studio             (studio/index.html)
   └─ Library, Map, Canvas, Import tools, Publish tools, Inspector
```

## Purpose

Studio exists to prepare content safely before it reaches Broadcast.

It is where creative assets are imported, organized, placed, previewed, inspected, and published. This includes 3D objects, vehicles, structures, actors, texture packages, GLB assets, canvas creations, and authored map objects.

Broadcast exists to present the live world.

It is the OBS-facing presentation window. It currently features a live map and will support camera modes based on vehicles and movement systems such as cars, planes, boats, bikes, trains, and character walkers.

## Run

Open `studio/index.html` through the same local dev server that serves `wall/`.

Studio loads shared WOS/SBE actor, visual, palette, style, and runtime-authority modules from `../wall/systems/...`.

```txt
No duplicated registries.
No forked actor authority.
No Studio-only truth model.
```

## Studio Product Model

Studio should stay organized around a small number of visible concepts.

```txt
Modes: Library | Map | Canvas | Broadcast
Tools: Publish | Import
Layout: Left Panel | Center Surface | Right Panel
```

### Modes

#### Library

Asset and actor access.

The Library should provide focused access to available assets, imported objects, saved actors, and reusable packages. It should not become a dumping ground for every internal tool or debug system.

Recommended Library sections:

```txt
Assets
  Structure
  Road
  Marine
  Aircraft
  Props

Actors
  Draft
  Promoted
  Retired

Imports
  GLB Assets
  Texture Packages
  Custom Objects
```

Sections should use toggles/collapsible groups so the user can focus on one asset class at a time.

#### Map

World placement and building selection.

Map is where assets are placed into the world, actors are positioned, buildings are selected, replacements are authored, and placement feedback is verified.

Required Map behavior:

```txt
Choose asset
→ Place on Map
→ Click map
→ Actor appears visibly
```

If placement fails, Studio must show the reason in the UI instead of requiring DevTools.

#### Canvas

Blank staging space.

Canvas is for previewing, staging, composing, inspecting, and preparing objects away from the live map. It should remain separate from Map so the user can work in a clean authoring space.

#### Broadcast

Live presentation output.

Broadcast opens the Wall presentation view used for OBS and live world playback. It should stay separate from Studio editing tools.

### Tools

#### Publish

Publish is a tool, not a mode.

It sends safe, validated Studio changes into the Broadcast/runtime bundle. Publish should remain visible but should not dominate the Library or Inspector.

#### Import

Import is a tool cluster, not a Library category dump.

Import actions should be grouped together in a dedicated Import tool/panel or compact dropdown.

Recommended import cluster:

```txt
Import GLB
Import Texture
Import Package
```

Import controls should not crowd the main Library asset list.

## Layout

Studio uses a three-panel layout.

```txt
Left Panel     → mode-specific navigation and lists
Center Surface → active authoring surface
Right Panel    → Inspector for selected item
```

### Left Panel

Mode-specific browsing.

Examples:

```txt
Library mode → asset groups and actor groups
Map mode     → selected asset, map tools, placement state
Canvas mode  → canvas objects and staging controls
```

### Center Surface

The active work area.

Examples:

```txt
Library mode → asset preview / library detail
Map mode     → map authoring surface
Canvas mode  → blank 3D staging surface
Broadcast    → external Wall window
```

### Right Panel

Inspector.

The Inspector should show properties and actions for the selected asset, actor, building, or object. It should not be a permanent dumping ground for unrelated tools.

## Safety Rules

### Studio vs Broadcast

Studio may create, import, assign, package, preview, and prepare content.

Broadcast presents the live world and should not be polluted by draft authoring state.

```txt
Studio drafts do not become Broadcast truth until Publish.
Actor manifests remain governed.
Runtime bundles remain sanitized.
Debug-only state stays out of published contracts.
```

### No Garbage Dump Rule

Studio surfaces must stay focused.

```txt
Library gives access.
Map places in the world.
Canvas stages in blank space.
Inspector edits selected things.
Import brings assets in.
Publish sends safe changes out.
Broadcast presents the live world.
```

If a control does not belong to one of those jobs, it should be collapsed under an advanced section, moved into an import/publish tool panel, or removed from the startup surface.

## Debug

```js
_wos.debug.studio.state();
_wos.debug.studio.mode(name);
_wos.debug.studio.refresh();
_wos.debug.studio.selectActor(key);
_wos.debug.studio.mapSurface();
```

Useful Map validation:

```js
_wos.debug.studio.mapSurface();
```

Expected healthy Map state:

```js
{
  mapboxAccessStatus: "ready",
  tokenSource: "SBE.MapboxToken",
  mapMounted: true,
  toolbarMounted: true,
  mapboxMapReady: true,
  styleLoaded: true,
  buildingSelectionReady: true,
  actorRenderLayerReady: true,
  layerCount: 1
}
```

## Hash Routing

Current Studio routes:

```txt
studio/index.html#library
studio/index.html#map
studio/index.html#canvas
```

Broadcast opens as:

```txt
wall/index.html
```

Legacy or debug-only routes should remain hidden from primary navigation unless they are actively supported product surfaces.

## Log

### 2026-06-19

Studio product model clarified.

Required visible structure:

```txt
Modes: Library | Map | Canvas | Broadcast
Tools: Publish | Import
Layout: Left Panel | Center Surface | Right Panel
```

Library must use focused, collapsible sections.

Studio must stop acting as a garbage dump for every internal tool. Import controls, package tools, debug systems, custom object management, and advanced authoring utilities must be clustered into their own tool areas or collapsed by default.

Primary recovery goals:

```txt
1. Clean startup UI.
2. Focused collapsible Library sections.
3. Import clustered as a tool.
4. Publish kept as a tool.
5. Map placement works visibly.
6. Placement failure explains itself in the UI.
7. Building selection and texture proof remain reachable.
```
