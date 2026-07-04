# 0619G_WOS_StudioLibraryAndPlacementUXRecoveryPatch_v1.0.0_BUILD

## Status

```txt
BUILD SPEC
```

## Purpose

Recover the Studio authoring surface from tool sprawl and make the primary workflow obvious again.

The current Studio shell has the correct technical systems, but the UI is acting like a garbage dump: asset library, imports, custom object tools, debug surfaces, placement controls, package controls, and hidden authoring states are competing inside the same left panel.

This pass restores the basic product model:

```txt
Modes: Library | Map | Canvas | Broadcast
Tools: Publish | Import
Layout: Left Panel | Center | Right Panel
```

## Core Rule

```txt
Studio is an authoring tool, not a dumping ground.
Every visible surface must have one job.
```

## Current Problem

The user-facing Studio startup state is overloaded:

```txt
Library column contains:
- asset categories
- active placement state
- search
- import buttons
- custom object filters
- imported asset tools
- packaging state
- tool internals
- placement buttons
```

This makes basic authoring harder than it should be.

The essential workflow should be:

```txt
Choose asset
→ Map
→ Place on Map
→ click map
→ see placed actor
→ inspect/edit on right
```

Right now that path is visually crowded and behaviorally under-instrumented.

## Required Product Model

### Top Modes

The main navigation must be exactly:

```txt
Library | Map | Canvas | Broadcast
```

Definitions:

```txt
Library   = browse/select/import/manage available assets and actors
Map       = place/select/edit world objects on the map
Canvas    = blank staging/proof space for objects outside the world map
Broadcast = live Wall output / OBS target
```

Broadcast may remain visually styled as a nav item/link, but it must be treated as a mode-level destination, not a random utility link.

### Tools

Tools are not modes.

Top-level tools must be clustered separately:

```txt
Publish
Import
```

Definitions:

```txt
Publish = send governed Studio state to Broadcast/Wall
Import  = bring new assets/packages into Studio
```

Import must become its own tool panel/dropdown/drawer, not a permanent block inside the asset browsing column.

Import cluster should contain:

```txt
Import GLB
Import Texture
Import Custom Object / Package
```

Only show deeper import/package management after the user opens Import.

### Layout

Studio must keep the three-panel contract:

```txt
Left Panel  | Center Surface | Right Panel
```

Responsibilities:

```txt
Left Panel  = focused lists: Library sections, actors, imports only when requested
Center      = current mode surface: Map, Canvas, Library detail, Broadcast preview/link
Right Panel = Inspector for the selected thing
```

## Required UI Simplification

### Left Panel Sections

Use collapsible toggles for focused sections.

Default startup state:

```txt
Assets: open
Actors: collapsed
Imports: collapsed
Advanced: collapsed
```

Within Assets:

```txt
Structure: open if active asset is structure, otherwise collapsed
Road: collapsed
Marine: collapsed
Aircraft: collapsed
Props: collapsed
```

Each section must remember its collapsed/open state in localStorage:

```txt
wos.studio.library.sectionState
```

### Asset Section Behavior

Each asset row should show:

```txt
Label
small category/type hint
Place on Map button only on hover or selected row
```

Do not show package internals, governance internals, debug fields, or imported object plumbing in the default asset list.

### Actors Section Behavior

Actors section should list placed actors only.

Subsections:

```txt
Draft
Promoted
Retired / Hidden
```

Default collapsed unless an actor is selected or search targets actors.

### Imports Section Behavior

Imports section should not dominate startup.

When collapsed, show only:

```txt
Imports  [count]
```

When open, show grouped import records:

```txt
GLB Assets
Building Textures
Custom Objects
```

Each group can have its own mini-toggle.

Import actions themselves should live in the top Tools cluster, not as large permanent buttons in the Library column.

### Advanced Section Behavior

Advanced must be collapsed by default.

Move these into Advanced:

```txt
Custom object filters
Broadcast readiness internals
Package debug rows
Governance debug actions
Raw import details
Experimental tools
Any debug-only command surface
```

## Placement Recovery

Map placement must provide explicit truth feedback.

When `Place on Map` is armed and the user clicks the map, the UI must report:

```txt
Placement armed: true
Clicked at: lat/lon
Asset: assetId
Result: ok | error
Reason: reason code if failed
Created objectId: objectId if created
Marker visible: true | false
Proxy visible: true | false
```

Add a visible Map toolbar status strip:

```txt
Placement: Ready
Placement: Armed — click map
Placement: Placed <asset label>
Placement failed — <reason>
```

Add debug command:

```js
_wos.debug.studio.placement()
```

Expected shape:

```js
{
  armed: true,
  activeAssetId: 'structure.block.midrise',
  activeAssetCategory: 'structure',
  lastClick: { lat, lon },
  lastResult: 'ok',
  lastError: null,
  createdObjectId: '...',
  markerAdded: true,
  proxyAdded: true
}
```

## Map Click Acceptance

The map is not considered recovered unless placement visibly works.

Required behavior:

```txt
1. Select Midrise Block.
2. Click Place on Map.
3. Click visible map.
4. A visible actor marker/proxy appears.
5. Right Inspector switches to Inspecting: Actor.
6. Debug placement snapshot reports ok.
```

If placement fails, the user must see why without opening DevTools.

## Building Selection Preservation

Do not remove or bury the building workflow.

View Options must still contain:

```txt
Select target → Buildings
```

After selecting Buildings and clicking a visible building:

```txt
Right Inspector → Building inspector
Apply Test Texture button reachable
```

This keeps 0618D testability alive.

## Non-Goals

```txt
Do not create new actor systems.
Do not alter actor manifest schema.
Do not alter publish bundle contracts.
Do not change GLB runtime rendering.
Do not change texture package/rendering logic.
Do not add new Mapbox styles.
Do not redesign visual branding.
```

## Files Expected

Likely files:

```txt
studio/index.html
studio/styles.css
studio/studioShell.js
studio/views/libraryController.js
studio/views/threeDCanvasView.js
studio/actors/assetResolver.js
possibly new: studio/views/importToolPanelController.js
possibly new: studio/views/studioPlacementDiagnostics.js
```

## Acceptance Criteria

### AC1 — Mode bar is clean

Top modes are visually and structurally:

```txt
Library | Map | Canvas | Broadcast
```

No Inspector tab. No debug/internal mode tabs.

### AC2 — Tools are separate

Publish and Import appear as clustered tools, not as mode tabs and not buried in the asset list.

### AC3 — Import is clustered

Import cluster exposes:

```txt
Import GLB
Import Texture
Import Custom Object / Package
```

Default Studio startup does not show large permanent import blocks inside the Library list.

### AC4 — Left panel has focused toggles

Left panel sections are collapsible:

```txt
Assets
Actors
Imports
Advanced
```

### AC5 — Asset categories are collapsible

Asset subsections are independently collapsible:

```txt
Structure
Road
Marine
Aircraft
Props
```

### AC6 — Startup is not a garbage dump

On first load, visible Library column shows primarily:

```txt
Search
Assets section
focused/open category
```

No custom object filter wall, no package internals, no debug blocks, no duplicate import controls.

### AC7 — Placement works visibly

Clicking `Place on Map` then the map creates visible output.

### AC8 — Placement failure is visible

If placement fails, the toolbar/status strip shows a reason.

### AC9 — Placement debug exists

`_wos.debug.studio.placement()` reports last placement attempt truth.

### AC10 — Map tools remain reachable

`View Options` remains visible and usable.

### AC11 — Building selection remains reachable

`View Options → Select target → Buildings` remains reachable.

### AC12 — 0618D remains testable

After selecting a building, right Inspector still exposes `Apply Test Texture`.

### AC13 — Publish remains unchanged

Publish chip/button behavior remains intact.

### AC14 — No Wall regression

No Wall/Broadcast runtime changes unless strictly necessary for shared UI labels. Broadcast must still open and render.

## Smoke Test

```txt
1. Hard reload Studio.
2. Confirm top modes: Library | Map | Canvas | Broadcast.
3. Confirm tools: Import | Published/Pending chip | Publish.
4. Confirm Library left panel shows clean sections.
5. Collapse/open Structure, Road, Marine, Aircraft, Props.
6. Select Midrise Block.
7. Go to Map.
8. Click Place on Map.
9. Click the visible map.
10. Confirm actor marker/proxy appears.
11. Confirm Inspector switches to Actor.
12. Run _wos.debug.studio.placement().
13. Open View Options.
14. Select target → Buildings.
15. Click visible building.
16. Confirm Building Inspector opens.
17. Confirm Apply Test Texture is reachable.
```

## Closure Rule

```txt
0619G closes only when the Studio startup UI is clean and the basic place-on-map workflow visibly works.
```

## Expected Final State

```txt
Studio has four modes.
Studio has clustered tools.
The left panel is focused and collapsible.
The Map can place actors visibly.
Failures explain themselves.
0618D can resume without fighting the UI.
```
