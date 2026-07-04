# 0615C_WOS_StudioMapLookAuthoringSurface_v1.0.0_BUILD

## Status

BUILD

---

## Classification

```txt
studio-authoring-surface
map-look-authority
visual-design-preview
post-0615B-location-intelligence
pre-3d-asset-visual-authoring
```

---

## Purpose

Turn Studio 3D Canvas into the place where WOS map looks are selected, previewed, adjusted, and prepared for later publish to Wall.

This pass is not only about making the map easier to read. It creates the first real separation between:

```txt
Authoring Mode        → clear working map
Broadcast Preview     → cinematic WOS look preview
Look Presets          → named visual treatments for future Wall publish
```

Studio must become both:

```txt
1. A practical authoring map where actors/buildings can be found.
2. A visual design surface where the next WOS map look can be explored.
```

---

## Problem Statement

The current 3D Canvas has working actor placement, persistence, lifecycle, publish, and first-pass location intelligence. However, the map surface still feels like a technical placement layer rather than a design environment.

The user cannot yet confidently answer:

```txt
Where am I on the map?
What visual mode am I designing in?
Is this the working map or the broadcast look?
Can I see actors and buildings clearly?
Can I preview the next WOS aesthetic before publishing it?
```

The existing Authoring View toggle is useful, but too narrow. Studio now needs an explicit Map Look surface.

---

## Current Foundation

Already available:

```txt
3D Canvas Mapbox instance
Actor markers
Actor focus
Actor visibility filter
Actor location summaries
Building selection/replacement layer
Material override controller
Studio → Wall publish pipeline
WOS palette registry
Wall runtime bundle authority
```

This pass builds on those systems without changing their contracts.

---

## Non-Goals

This build must not introduce:

```txt
full Mapbox JSON style editor
raw style JSON editing
shader graph
texture painting
per-building material editor
per-face editing
new actor manifest schema
new promotion lifecycle
new publish bundle schema
automatic Wall mutation
reverse geocoding
GLB import pipeline
new Wall runtime module
```

This pass is Studio-only preview and authoring state.

---

## Core Design Rule

Studio needs two separate mental modes:

```txt
Authoring Mode
Broadcast Preview Mode
```

### Authoring Mode

Authoring Mode prioritizes clarity.

```txt
roads readable
labels visible
water/parks obvious
actors easy to find
selected actor obvious
selected building obvious
building mass understandable
```

This mode may look less cinematic. That is acceptable.

### Broadcast Preview Mode

Broadcast Preview Mode prioritizes WOS mood and visual direction.

```txt
cinematic
night-capable
illustration-capable
Tron-capable
building surface capable
closer to Wall output
```

This mode is for designing the show, not for precise placement.

---

## Proposed Files

### New

```txt
studio/views/mapLookController.js
```

Optional if CSS grows large:

```txt
studio/views/mapLookPresets.js
```

### Updated

```txt
studio/views/threeDCanvasView.js
studio/studioShell.js
studio/index.html
studio/styles.css
```

### Not touched

```txt
wall/systems/runtime/*
wall/data/wos-wall-runtime-bundle.json
studio/systems/publish/*
studio/actors/actorManifestStore.js
```

---

## Map Look Controller

Create:

```txt
studio/views/mapLookController.js
```

Public API:

```js
WOSMapLookController.init(map, options)
WOSMapLookController.setLook(lookKey)
WOSMapLookController.getLook()
WOSMapLookController.listLooks()
WOSMapLookController.setOption(optionKey, value)
WOSMapLookController.getOptions()
WOSMapLookController.reset()
WOSMapLookController.debugSnapshot()
```

Responsibilities:

```txt
own Studio map look state
apply Mapbox style preset
apply preview-only layer visibility/paint overrides
emit look change events
survive map style reloads
resync actor/building overlays after style changes
never write to actor manifests
never publish to Wall
```

---

## Look Presets

Minimum presets:

```txt
authoring
broadcast-dark
night
tron
illustration
```

### `authoring`

Purpose:

```txt
clear working map
best for placement, search, selection, debugging
```

Suggested base style:

```txt
mapbox://styles/mapbox/light-v11
```

Default options:

```js
{
  labels: true,
  roads: true,
  water: true,
  parks: true,
  buildings: true,
  buildingOpacity: 0.65,
  actorOverlay: true,
  selectedEmphasis: true
}
```

### `broadcast-dark`

Purpose:

```txt
preview current Wall-like cinematic look
```

Suggested base style:

```txt
mapbox://styles/mapbox/dark-v11
```

Default options:

```js
{
  labels: true,
  roads: true,
  water: true,
  parks: false,
  buildings: true,
  buildingOpacity: 0.85,
  actorOverlay: true,
  selectedEmphasis: true
}
```

### `night`

Purpose:

```txt
night-world visual design preview
```

Default behavior:

```txt
use dark base style
reduce label dominance
preserve roads and water
keep actor overlay visible
```

### `tron`

Purpose:

```txt
after-hours WOS grid/light treatment preview
```

Default behavior:

```txt
dark base style
stronger road/edge contrast
reduced natural land color
high actor/building selection contrast
```

### `illustration`

Purpose:

```txt
Moebius/cartoon/outlined building direction preview
```

Default behavior:

```txt
light or custom-neutral base style
clear roads/water/parks
building outlines emphasized where possible
actor overlays high contrast
```

---

## UI Requirements

Add a compact Map Look control to the 3D Canvas toolbar.

Minimum toolbar shape:

```txt
[+ Place Actor] [Asset] [Select Building] [Look: Authoring ▼] [Labels] [Buildings] [Actors]
```

Look dropdown options:

```txt
Authoring
Broadcast Dark
Night
Tron
Illustration
```

Quick toggles:

```txt
Labels
Buildings
Actors
```

Optional secondary panel:

```txt
Map Look
- Active look preset
- Labels on/off
- Roads on/off
- Water on/off
- Parks on/off
- Buildings on/off
- Building opacity
- Actor overlay on/off
- Selected emphasis on/off
- Reset Look
```

---

## State Rules

Map look state is preview/session state only.

Allowed persistence:

```txt
localStorage key: wos.studio.mapLook
localStorage key: wos.studio.mapLookOptions
```

Forbidden persistence:

```txt
actor manifests
promotion gate payloads
Wall runtime bundle
Wall runtime modules
registry files
```

Map look changes must not alter:

```txt
actor.anchor
actor.assetId
actor.actorCategory
actor.actorType
actor.materialOverride
actor.structure
actor.meta.lifecycleState
```

---

## Event Contract

Emit:

```js
document.dispatchEvent(new CustomEvent('wos:map-look-changed', {
  detail: {
    lookKey,
    options,
    source: 'studio-map-look-controller'
  }
}));
```

Consumers:

```txt
threeDCanvasView.js
studioShell.js
actorLocationResolver.js
buildingReplacementLayer.js
actorObjectRenderLayer.js
```

The event is Studio-local.

---

## Integration With 0615B Actor Location Intelligence

When the map style changes, rendered feature data may change. Therefore:

```txt
setLook()
→ map.setStyle(...)
→ wait for styledata / idle
→ remount render layers
→ reapply building replacement layer
→ resync actor location resolver
→ refresh Library actor rows
→ refresh Inspector selected actor
```

Required behavior:

```txt
Actor location summaries may update after look/style changes.
No actor manifests mutate.
No Wall bundle mutates.
```

---

## Integration With Actor Render Layer

When a map style reloads, Mapbox custom layers can be destroyed. Therefore this pass must preserve the existing remount behavior:

```txt
if (_rl && _rl.remount) _rl.remount()
if (_brl && _brl.remount) _brl.remount()
```

After remount:

```txt
actor markers remain visible
selected actor remains highlighted
actor visibility filter remains active
location resolver resyncs
```

---

## Integration With Building Replacement

Map look changes must not break building suppression.

Required behavior:

```txt
structure replacement actors remain in place
suppressed Mapbox buildings stay suppressed after style reload
selected building paint remains valid if still selected
replacement layer re-applies after styledata/idle
```

---

## Map Layer Controls

The controller may implement controls by layer-name heuristics.

Suggested layer classifiers:

```txt
labels      → layer.id includes label, place, poi, road-label
roads       → layer.id includes road, bridge, tunnel, ferry
water       → layer.id includes water, river, ocean, lake, bay
parks       → layer.id includes park, landuse, national-park, greenspace
buildings   → layer.id includes building, extrusion
```

Controls should fail soft:

```txt
if layer not found → skip
if paint property unsupported → skip
if style not loaded → queue until idle
```

---

## Authoring Defaults

The 3D Canvas should default to:

```txt
lookKey: authoring
center: NYC lower Manhattan / harbor area
zoom: 14–16
pitch: 45–60
bearing: preserved from previous session when possible
labels: true
buildings: true
actors: true
```

This is a deliberate change from cinematic-first behavior.

---

## Debug API

Add:

```js
_wos.debug.studio.mapLook()
_wos.debug.studio.setMapLook('authoring')
_wos.debug.studio.setMapLook('broadcast-dark')
_wos.debug.studio.setMapLook('night')
_wos.debug.studio.setMapLook('tron')
_wos.debug.studio.setMapLook('illustration')
```

Expected snapshot:

```js
{
  ready: true,
  activeLook: 'authoring',
  baseStyle: 'mapbox://styles/mapbox/light-v11',
  options: {
    labels: true,
    roads: true,
    water: true,
    parks: true,
    buildings: true,
    buildingOpacity: 0.65,
    actorOverlay: true,
    selectedEmphasis: true
  },
  appliedLayerCounts: {
    labels: 18,
    roads: 22,
    water: 4,
    parks: 7,
    buildings: 2
  },
  lastAppliedAt: '...'
}
```

---

## Acceptance Criteria

### AC1 — Look selector exists

3D Canvas toolbar exposes a Map Look selector with at least:

```txt
Authoring
Broadcast Dark
Night
Tron
Illustration
```

### AC2 — Authoring mode is readable

Authoring look uses a clear working style with readable labels, roads, water, parks, and buildings.

### AC3 — Broadcast preview mode exists

Broadcast Dark look switches to a darker, more cinematic preview without changing actor data or Wall runtime.

### AC4 — Style changes preserve actors

After changing looks:

```txt
all actor markers remain visible unless filtered
selected actor remains selected
actor focus still works
actor filter still works
```

### AC5 — Style changes preserve render layers

After changing looks:

```txt
ActorObjectRenderLayer remounts
BuildingReplacementLayer remounts
building suppressions reapply
```

### AC6 — Location summaries resync

After changing looks:

```txt
WOSActorLocationResolver.resync() runs after map idle
Library rows refresh
Inspector selected actor Location section refreshes
```

### AC7 — Toggles work

At minimum:

```txt
Labels toggle works
Buildings toggle works
Actors toggle works
```

### AC8 — No actor manifest mutation

Changing map look must not change any actor manifest except existing unrelated actor edits made through Inspector.

### AC9 — No publish mutation

Changing map look must not write to:

```txt
wall/data/wos-wall-runtime-bundle.json
wall/data/wos-wall-runtime-bundle.previous.json
```

### AC10 — Wall untouched

No Wall runtime module is modified by this pass.

### AC11 — Debug snapshot exists

Console command returns useful state:

```js
_wos.debug.studio.mapLook()
```

### AC12 — Default mode is authoring

On Studio load, the 3D Canvas uses the Authoring look unless a valid localStorage look was previously selected.

---

## Manual Test Plan

### Test 1 — Load Studio

```txt
Open Studio
Go to 3D Canvas
Confirm Look selector shows Authoring
Confirm map is readable
```

### Test 2 — Place actors

```txt
Place 3 actors
Confirm markers are visible
Confirm Library rows show location summaries
```

### Test 3 — Switch looks

```txt
Authoring → Broadcast Dark → Night → Tron → Illustration → Authoring
```

Expected:

```txt
map style changes
actors remain visible
selected actor remains selected
no console crash
```

### Test 4 — Toggle layers

```txt
Labels off/on
Buildings off/on
Actors off/on
```

Expected:

```txt
labels hide/show
buildings hide/show
actor markers hide/show
```

### Test 5 — Location resync

```js
_wos.debug.studio.actorLocations()
```

Expected:

```txt
ready true
cachedCount equals actor count or resolves shortly after idle
```

### Test 6 — Publish isolation

Before changing looks:

```bash
shasum wall/data/wos-wall-runtime-bundle.json
```

Change looks several times.

After:

```bash
shasum wall/data/wos-wall-runtime-bundle.json
```

Expected:

```txt
same hash
```

### Test 7 — Wall runtime isolation

```bash
git diff -- wall/systems/runtime wall/index.html wall/data/wos-wall-runtime-bundle.json
```

Expected:

```txt
no diff from map-look changes
```

---

## Implementation Notes

### Replace narrow Authoring View toggle

Current Authoring View button should either be removed or converted into the new Look selector.

Old:

```txt
Authoring View
```

New:

```txt
Look: Authoring ▼
```

### Keep look design preview separate from publish

Do not add “Publish Look” in this pass.

Later pass:

```txt
0615F_WOS_MapLookPublishAuthority_v1.0.0_BUILD
```

### CSS hook classes

Add shell/map classes:

```txt
studio-map-look--authoring
studio-map-look--broadcast-dark
studio-map-look--night
studio-map-look--tron
studio-map-look--illustration
```

These can style overlays, toolbar states, marker contrast, and selected emphasis.

---

## Risks

### Risk 1 — Mapbox style reload breaks custom layers

Mitigation:

```txt
centralize style change in MapLookController
remount render/replacement layers after styledata
resync after idle
```

### Risk 2 — Layer names vary by Mapbox style

Mitigation:

```txt
use heuristic layer classifiers
fail soft
include appliedLayerCounts in debug snapshot
```

### Risk 3 — Broadcast preview mistaken for published Wall style

Mitigation:

```txt
label controls as Preview
no publish button
no bundle mutation
no Wall mutation
```

### Risk 4 — More UI clutter

Mitigation:

```txt
small toolbar selector first
optional details panel later
```

---

## Completion Definition

This build is complete when Studio 3D Canvas can be used as both:

```txt
1. a readable working map, and
2. a first-pass WOS look preview surface
```

without changing actor truth, publish bundles, or Wall runtime.

---

## Final Lock

```txt
Studio is not just a placement form.
Studio is the WOS design surface.

Authoring Mode exists for clarity.
Broadcast Preview exists for mood.
Look changes are preview-only until an explicit future publish authority exists.
```
