---
layout: spec
title: "Wall Studio Workspace Split"
date: 2026-06-03
doc_id: "0603_WOS_WallStudioWorkspaceSplit_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "interface"
component: "workspace_shells"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "workspace-architecture"

summary: "Separates the live Wall world viewer from the Studio authoring workspace while preserving shared runtime modules, registries, actor systems, glyph tools, palettes, and visual asset infrastructure."

doctrine:
  - "Wall is the product experience"
  - "World is the live runtime mode inside Wall"
  - "Studio is the authoring environment"
  - "Shared systems must not be duplicated"
  - "Authoring UI must not compromise runtime readability"

depends_on:
  - "0603G_WOS_ActorRenderAuthority_v1.0.0"
  - "0603I_WOS_ActorVisualIdentityAuthority_v1.0.0"
  - "0603J_WOS_Actor2_5DPresentationPass_v1.0.0"
  - "0603M_WOS_ActorProofStageCameraAndLabelPass_v1.0.0"

enables:
  - "full-page glyph lab"
  - "actor asset library"
  - "palette editor"
  - "visual identity authoring"
  - "asset proof stage"
  - "future library-backed actor replacement"

tags:
  - "wos"
  - "wall"
  - "studio"
  - "workspace"
  - "asset-library"
  - "glyph-lab"
  - "actor-authoring"
---

# 0603N_WOS_WallStudioWorkspaceSplit_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Split WOS into two workspace shells:

```text
wall/index.html
studio/index.html
```

This preserves Wall as the live product/world viewer while giving Glyph Lab, Palette tools, Actor Assets, and future editable libraries a full-page Studio workspace.

The current lower-half Glyph Lab is too cramped for the direction WOS is moving toward.

WOS is no longer only rendering map objects.

It is becoming an actor-authoring system.

---

# Naming Decision

Keep:

```text
wall/index.html
```

Add:

```text
studio/index.html
```

Do not rename `wall` to `world`.

Use this language:

```text
Wall   = product shell / live experience
World  = runtime map mode inside Wall
Studio = authoring shell / asset workspace
```

Canonical hierarchy:

```text
WOS
├─ Wall
│  └─ World View
│
└─ Studio
   ├─ Glyph Lab
   ├─ Palette Lab
   ├─ Actor Library
   └─ Proof Stage
```

---

# Core Problem

The current UI tries to support:

```text
live world runtime
debug tools
glyph authoring
palette exploration
actor proofing
future asset replacement
```

inside one page.

That creates:

- cramped panels
- mode confusion
- poor asset comparison
- poor preview space
- too much pressure on the map
- fragile UI toggles
- increasing inspector/drawer complexity

The Wall needs less UI.

The Studio needs more UI.

They should not fight for the same screen.

---

# Architectural Goal

Create two independent entry shells that share the same systems.

```text
/wall/index.html
/studio/index.html
```

Shared modules stay shared.

No duplicated actor systems.

No forked registries.

No copied renderer code.

---

# Wall Responsibilities

`wall/index.html` owns:

- live map/world viewer
- Drive mode
- camera modes
- live feed presentation
- actor rendering
- proof harness access only as debug
- minimal runtime controls
- screenshot/video/stream readability

Wall should prioritize:

```text
map space
runtime performance
visual clarity
low UI clutter
```

---

# Studio Responsibilities

`studio/index.html` owns:

- full-page Glyph Lab
- palette inspection/editing UI
- actor asset library
- visual identity inspection
- 2.5D proof stage
- actor lineup comparison
- library metadata editing
- future asset replacement workflows

Studio should prioritize:

```text
panels
asset grids
inspectors
preview stages
metadata editors
comparison tools
```

---

# Shared Systems

Both shells may load shared systems:

```text
systems/actors/
systems/render/
systems/presentation/
systems/feeds/
systems/registries/
```

But with different runtime activation.

Example:

Wall may auto-start:

```text
MapboxViewportRuntime
WorldSpaceVehicleLayer
HeroVehicleRuntime
selected public feed runtimes
```

Studio may load but not auto-start:

```text
TruthActorRuntime
ActorRenderAuthority
ActorVisualIdentityAuthority
ActorPresentationPaletteRegistry
Proof Harness
GlyphRegistry
Palette tools
```

Studio should not automatically start live feeds unless explicitly requested.

---

# Required File Structure

Create:

```text
studio/index.html
studio/styles.css
studio/studioShell.js
```

Optional:

```text
studio/README.md
```

Do not move `wall/index.html`.

Do not break existing Wall load order.

---

# Studio Shell Layout

Studio should use a three-panel layout:

```text
┌──────────────┬────────────────────────────┬──────────────────┐
│ Library      │ Preview Stage              │ Inspector        │
│              │                            │                  │
│ Categories   │ Actor / Glyph / Palette    │ Metadata         │
│ Asset List   │ Proof View                 │ Identity Fields  │
│              │                            │ Controls         │
└──────────────┴────────────────────────────┴──────────────────┘
```

Recommended CSS grid:

```css
.studio-shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 360px;
  grid-template-rows: 56px minmax(0, 1fr);
  height: 100vh;
}
```

Top bar:

```text
WOS Studio
Actor Library
Glyph Lab
Palette Lab
Proof Stage
```

---

# Studio Navigation Modes

Minimum v1 modes:

```text
actor-library
glyph-lab
palette-lab
proof-stage
```

The v1 shell may render simple panels, but they must be wired to real debug/runtime data where possible.

---

# Actor Library Panel

Left panel should list canonical actor categories:

```text
Road
Marine
Aircraft
Transit
Civic
World
Synthetic
```

Each category can list known identity profiles from:

```js
SBE.ActorVisualIdentityAuthority.listIdentityProfiles()
```

If authority unavailable:

```text
show safe empty state
```

No throw.

---

# Preview Stage

Center panel should support proof-stage rendering.

Minimum v1 behavior:

- button: `Spawn Proof Lineup`
- button: `Clear Proof Lineup`
- button: `Refresh State`
- display current proof actor table

It may call:

```js
_wos.debug.worldActors.visualProofLineup()
_wos.debug.worldActors.visualProofState()
_wos.debug.worldActors.clearVisualProofLineup()
```

If map is needed for visual preview, Studio may include a small Mapbox preview container in the center stage.

If Mapbox preview is too risky for v1, the center panel may start as a data/preview stage and defer map embedding.

But do not remove the stage concept.

---

# Inspector Panel

Right panel should display selected actor/identity data:

```text
visualIdentityKey
actorType
sourceId
silhouetteClass
paletteRef
glyphRef
accentRef
materialClass
lightClass
decalClass
scaleClass
priorityClass
```

No editing required in v1.

Read-only inspection is acceptable.

---

# Glyph Lab Migration

The existing cramped Glyph Lab should not be deleted in v1.

Instead:

- leave current Wall glyph section functional
- add Studio route/panel for full-page Glyph Lab
- mark Wall glyph section as secondary/debug

The Studio Glyph Lab should have enough space for future:

- glyph grid
- SVG preview
- glyph metadata
- category filtering
- actor assignment
- LOD preview

Do not fully rebuild Glyph Lab in this spec unless existing code is easy to reuse safely.

---

# Palette Lab

Palette Lab v1 should read from:

```js
SBE.ActorPresentationPaletteRegistry.listPalettes()
```

Display:

```text
palette key
body
roof
side
glass
accent
light
shadow
opacity
```

Visual swatches are preferred.

If registry unavailable:

```text
show safe empty state
```

---

# Proof Stage Mode

Proof Stage mode should expose the proof commands from 0603L/0603M:

```js
visualProofStage()
visualProofStageState()
clearVisualProofStage()
```

Studio should not auto-spawn proof actors on load.

User must click.

---

# URL Strategy

Use separate pages:

```text
/wall/index.html
/studio/index.html
```

Optional hash mode inside Studio:

```text
/studio/index.html#actor-library
/studio/index.html#glyph-lab
/studio/index.html#palette-lab
/studio/index.html#proof-stage
```

Do not require a router library.

---

# Wall Changes

Wall should receive only minimal changes:

- optional link/button to open Studio
- no layout restructuring
- no removal of current controls
- no runtime behavior change

Recommended:

```html
<a href="../studio/index.html" target="_blank">Studio</a>
```

or equivalent relative path depending deployment.

---

# Startup Safety

Studio must load without:

- starting Drive
- starting Hero runtime
- starting Citi Bike polling
- starting AIS polling
- starting aircraft polling
- starting ambient traffic
- mutating Mapbox style

Studio may initialize registries and debug namespaces.

---

# Debug API

Add optional namespace:

```js
_wos.debug.studio
```

Commands:

```js
state()
mode(name)
refresh()
selectActor(actorId)
```

Minimum output:

```js
{
  active: true,
  mode,
  selectedActorId,
  loadedModules,
  lastError
}
```

No frame logging.

---

# Acceptance Tests

## Test 1: Wall Still Loads

Open:

```text
wall/index.html
```

Expected:

```text
existing WOS world still loads
Drive still works
existing debug commands still exist
no Studio UI forced into Wall
```

## Test 2: Studio Loads

Open:

```text
studio/index.html
```

Expected:

```text
WOS Studio shell loads
left library panel visible
center preview stage visible
right inspector visible
no Drive auto-start
no live feed auto-start
no console errors
```

## Test 3: Palette Lab Reads Registry

In Studio:

```text
Palette Lab
```

Expected:

```text
palettes from ActorPresentationPaletteRegistry visible
swatches or hex values visible
safe empty state if registry missing
```

## Test 4: Identity Profiles Visible

In Studio:

```text
Actor Library
```

Expected:

```text
mta.bus
dot.utility
citibike.station
ais.vessel
nyc.ferry
aircraft.truth
mta.subway.train
synthetic.vehicle
```

## Test 5: Proof Stage Works

In Studio:

```text
Proof Stage → Spawn Proof Lineup
```

Expected:

```text
proof actors spawn through real actor pipeline
state table updates
clear removes only proof actors
live actors preserved
```

---

# Failure Conditions

This build fails if:

- Wall Drive breaks
- Wall map fails to load
- Studio auto-starts live feeds
- Studio clears live actors on load
- shared actor registries are duplicated/forked
- actor IDs change
- proof harness no longer works
- map style is mutated by Studio load
- Studio requires external dependencies
- current Wall debug commands disappear
- lower Glyph Lab is deleted before Studio replacement is verified

---

# Implementation Notes

## Keep v1 Simple

The goal is shell separation, not full editor completion.

Correct v1:

```text
separate Studio page
real registry reads
proof-stage access
read-only inspector
safe panels
```

Incorrect v1:

```text
large editor rewrite
new routing framework
duplicated runtime
feed polling by default
breaking Wall UI
```

---

# Future Follow-Ups

After this split:

```text
0603O_WOS_ActorAssetLibraryAuthority_v1.0.0_BUILD
0603P_WOS_EditableGlyphLibraryStudio_v1.0.0_BUILD
0603Q_WOS_EditablePaletteLibraryStudio_v1.0.0_BUILD
0603R_WOS_ActorAssetAssignmentStudio_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Add `studio/index.html`, `studio/styles.css`, and `studio/studioShell.js`; minimally add a Studio link from `wall/index.html`; reuse existing actor, visual identity, palette, and proof harness modules without duplicating their source code.
- **What**: Run local dev server, open `wall/index.html` to confirm the existing world still works, then open `studio/index.html` and test Actor Library, Palette Lab, and Proof Stage controls.
- **Expect**: Wall remains the live world viewer, Studio becomes a separate full-page authoring shell, shared registries load safely, proof-stage tools work from Studio, and no live feeds or Drive systems auto-start from Studio.
