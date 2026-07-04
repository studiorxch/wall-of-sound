---
title: "0528E_WOS_HarborGeometryBakePipeline_v1.0.0_BUILD"
date: 2026-05-28
doc_id: "0528E_WOS_HarborGeometryBakePipeline_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "geography"
component: "HarborGeometryBakePipeline"
type: "system-spec"
status: "approved"
priority: "high"
risk: "medium"
classification: "support-system"
summary: "Defines the first practical bake pipeline for NYC Harbor Sector 01 geometry: shoreline polygons, pier outlines, ferry slips, island outlines, bridge context lines, and first waterfront abstraction blocks."
doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Geography before atmosphere"
  - "Visible output over hidden authority"
depends_on:
  - "0528D_WOS_HarborSectorAuthority_v1.0.0"
  - "MapboxViewportRuntime"
  - "HarborSectorAuthority"
enables:
  - "HarborGeometryRenderer"
  - "BakedBuildingSectorRenderer"
  - "FerryRoutePresentation"
  - "MaritimeContextComposition"
tags:
  - "harbor"
  - "geometry"
  - "bake-pipeline"
  - "shoreline"
  - "brooklyn-waterfront"
  - "lower-manhattan"
  - "statue-corridor"
---

# 🚦 SPEC STAGE

Stage: **[BUILD]**  
Freeze Decision: **GO**  
Action: Build the first visible geometry bake pipeline for NYC Harbor Sector 01.

---

# 0528E_WOS_HarborGeometryBakePipeline_v1.0.0_BUILD

## Purpose

Create a practical local geometry pipeline that gives WOS owned harbor context instead of relying entirely on live Mapbox styling.

This spec builds the first bakeable geometry layer for:

- shoreline polygons
- pier outlines
- ferry slips
- island outlines
- bridge context lines
- first waterfront abstraction blocks
- sector metadata manifests

The goal is not perfect GIS completeness.

The goal is:

```text
visible harbor context that makes boats, ferries, aircraft, clouds, and skyline framing feel physically placed.
```

---

# Core Problem

Current WOS harbor rendering has improved, but too much context still depends on live Mapbox presentation.

This creates several problems:

- shoreline identity is inconsistent across styles
- piers and ferry slips are not visually owned by WOS
- landmark/island outlines are not guaranteed to read at cinematic pitch
- 3D buildings are expensive and externally controlled
- maritime composition lacks persistent hero geometry
- atmospheric effects can obscure infrastructure anchors

WOS needs a first baked sector layer so the harbor can remain readable even when Mapbox styles, clouds, altitude overlays, or atmosphere presets change.

---

# Build Scope

## Primary Sector

Use the canonical sector from `SBE.HarborSectorAuthority`:

```js
NYC_HARBOR_SECTOR_01
```

Bounds:

```js
west:  -74.085
south:  40.600
east:  -73.930
north:  40.735
```

Covered hero geography:

- Brooklyn Army Terminal
- Sunset Park Piers
- Red Hook Waterfront
- Governors Island
- Liberty Island / Statue of Liberty
- Ellis Island
- Battery Park ferry context
- Lower Manhattan skyline edge
- Verrazzano context
- Brooklyn Bridge context

---

# Deliverables

## 1. Bake Data Directory

Create:

```text
wall/data/harbor/nyc_harbor_sector_01/
```

Required files:

```text
sector_manifest.json
shoreline_polygons.geojson
pier_outlines.geojson
ferry_slips.geojson
island_outlines.geojson
bridge_context_lines.geojson
waterfront_blocks.geojson
```

Optional later:

```text
building_blocks.geojson
crane_silhouettes.geojson
container_yards.geojson
night_window_masks.json
```

---

## 2. Bake Script

Create:

```text
tools/bake_harbor_sector.py
```

Responsibilities:

- read source GeoJSON files from `tools/sources/harbor/`
- clip features to `NYC_HARBOR_SECTOR_01` bounds
- normalize geometry properties
- simplify geometry by LOD tier
- write final runtime GeoJSON into `wall/data/harbor/nyc_harbor_sector_01/`
- generate `sector_manifest.json`

No network requirement in v1.0.0.

This pipeline assumes source geometry is downloaded manually first or added later by a fetch script.

---

# Source Geometry Strategy

## Accepted Sources

This build may use any of the following, but should not hard-depend on one source:

- NYC Open Data shoreline / waterfront features
- OpenStreetMap exported GeoJSON
- manually curated GeoJSON from geojson.io
- Mapbox-exported vector-derived geometry if legally usable
- custom hand-drawn polygons for first proof pass

## Source Folder

Create:

```text
tools/sources/harbor/
```

Expected source naming:

```text
source_shoreline.geojson
source_piers.geojson
source_ferry_slips.geojson
source_islands.geojson
source_bridges.geojson
source_waterfront_blocks.geojson
```

If a source file is missing, the bake script must warn and continue.

No silent failure.

---

# Runtime Data Model

## BakedHarborFeature

```ts
type BakedHarborFeature = {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: {
    id: string;
    layer: HarborGeometryLayer;
    label?: string;
    category?: string;
    priority: number;
    cinematicWeight: number;
    minZoom: number;
    maxZoom: number;
    lod: "coarse" | "standard" | "hero";
    source?: string;
  };
};
```

## HarborGeometryLayer

```ts
type HarborGeometryLayer =
  | "shoreline"
  | "pier"
  | "ferry_slip"
  | "island"
  | "bridge_context"
  | "waterfront_block";
```

---

# Manifest Model

Create:

```text
wall/data/harbor/nyc_harbor_sector_01/sector_manifest.json
```

Shape:

```json
{
  "sectorId": "nyc_harbor_sector_01",
  "version": "1.0.0",
  "generatedAt": "2026-05-28T00:00:00Z",
  "bounds": {
    "west": -74.085,
    "south": 40.6,
    "east": -73.93,
    "north": 40.735
  },
  "layers": {
    "shoreline": {
      "file": "shoreline_polygons.geojson",
      "featureCount": 0
    },
    "pier": {
      "file": "pier_outlines.geojson",
      "featureCount": 0
    },
    "ferry_slip": {
      "file": "ferry_slips.geojson",
      "featureCount": 0
    },
    "island": {
      "file": "island_outlines.geojson",
      "featureCount": 0
    },
    "bridge_context": {
      "file": "bridge_context_lines.geojson",
      "featureCount": 0
    },
    "waterfront_block": {
      "file": "waterfront_blocks.geojson",
      "featureCount": 0
    }
  }
}
```

---

# Bake Rules

## Geometry Clipping

Every output feature must be clipped or rejected against sector bounds.

Safe v1 implementation:

- keep features with any coordinate inside bounds
- do not perform complex polygon clipping yet
- log features crossing bounds as `crossesSectorBoundary: true`

Advanced clipping is deferred.

## Geometry Simplification

Use three simplification bands:

```js
coarse:   0.00035
standard: 0.00012
hero:     0.00004
```

These are degree-based tolerances and may be tuned visually.

Rules:

- shoreline: generate coarse, standard, hero variants if possible
- piers: preserve sharper geometry; avoid aggressive simplification
- ferry slips: preserve shape orientation
- islands: preserve recognizable outline
- bridges: keep as line context, not meshes
- waterfront blocks: simple polygons only

## Priority Defaults

```js
shoreline:        priority 5
island:           priority 5
ferry_slip:       priority 5
pier:             priority 4
bridge_context:   priority 4
waterfront_block: priority 3
```

## Cinematic Weights

Special weights:

```js
brooklyn_army_terminal: 1.00
sunset_park_piers:     0.95
statue_of_liberty:     1.00
governors_island:      0.90
lower_manhattan:       1.00
battery_park:          0.90
red_hook:              0.85
ellis_island:          0.75
```

---

# Required Runtime Loader

Create:

```text
wall/systems/geography/harborGeometryRegistry.js
```

Responsibilities:

- load `sector_manifest.json`
- load referenced GeoJSON layers
- cache features by layer
- expose query helpers
- never mutate source data after load

Public API:

```js
SBE.HarborGeometryRegistry = {
  VERSION,
  loadSector,
  getSectorId,
  getManifest,
  getLayerFeatures,
  getAllFeatures,
  isLoaded,
  getLoadState,
};
```

## Load Function

```js
loadSector("nyc_harbor_sector_01")
```

Must fetch:

```text
./data/harbor/nyc_harbor_sector_01/sector_manifest.json
```

Then all referenced layer files.

Must expose load status:

```js
{
  loading: boolean,
  loaded: boolean,
  error: string | null,
  sectorId: string | null,
  layerCounts: Record<string, number>
}
```

---

# Required Debug API

Create:

```text
wall/systems/geography/harborGeometryRegistryDebug.js
```

Bind:

```js
_wos.debug.harborGeometry
```

Commands:

```js
_wos.debug.harborGeometry.load()
_wos.debug.harborGeometry.state()
_wos.debug.harborGeometry.layers()
_wos.debug.harborGeometry.features("shoreline")
_wos.debug.harborGeometry.audit()
```

---

# Required Proof Renderer

Create:

```text
wall/render/harborGeometryDebugRenderer.js
```

Purpose:

Render baked geometry as a proof overlay.

Activate via:

```js
SBE.runtimeFlags.showHarborGeometryDebug = true;
```

Visual requirements:

- shoreline polygons: thin white/blue outline
- piers: amber outline
- ferry slips: cyan outline
- islands: green outline
- bridges: yellow dashed lines
- waterfront blocks: muted orange fill

This renderer is debug-only.

It must not replace Mapbox rendering yet.

---

# Integration Order

Patch `index.html`:

Before `main.js`:

```html
<script src="./systems/geography/harborGeometryRegistry.js"></script>
```

After `main.js`:

```html
<script src="./systems/geography/harborGeometryRegistryDebug.js"></script>
<script src="./render/harborGeometryDebugRenderer.js"></script>
```

Do not auto-enable debug overlays.

Auto-load sector is allowed after DOM ready:

```js
SBE.HarborGeometryRegistry.loadSector("nyc_harbor_sector_01")
```

---

# Success Criteria

This build passes when:

1. `tools/bake_harbor_sector.py` creates the sector output folder and manifest.
2. Missing source files warn but do not crash the bake.
3. `SBE.HarborGeometryRegistry.loadSector("nyc_harbor_sector_01")` loads all available baked layers.
4. `_wos.debug.harborGeometry.audit()` reports manifest, layer counts, and load status.
5. `SBE.runtimeFlags.showHarborGeometryDebug = true` visibly draws baked harbor geometry over the map.
6. The overlay shows at least one visible layer even if only hand-curated starter GeoJSON exists.
7. No maritime, aircraft, cloud, Mapbox style, or AIS runtime state is mutated.

---

# Minimum Starter Geometry Requirement

If source data is not ready, create hand-curated starter geometry for at least:

- Liberty Island outline
- Governors Island outline
- Brooklyn Army Terminal / Sunset Park waterfront block
- Battery Park ferry slip marker
- Red Hook waterfront block
- Lower Manhattan skyline edge line

This is acceptable for v1.0.0 because the goal is a working bake pipeline and visual proof, not final GIS completeness.

---

# Non-Goals

This spec does NOT build:

- full 3D building meshes
- full bridge meshes
- real-time OSM downloading
- legal source attribution UI
- advanced polygon clipping
- terrain elevation
- textured satellite baking
- production renderer styling
- ferry simulation
- vessel spawn logic
- aircraft route logic

---

# Deferred Systems

Future specs should cover:

```text
0528F_WOS_HarborGeometryRenderer_v1.0.0_BUILD
0528G_WOS_BakedBuildingSectorRenderer_v1.0.0_BUILD
0528H_WOS_BridgeContextRenderer_v1.0.0_BUILD
0528I_WOS_FerryRoutePresentation_v1.0.0_BUILD
```

---

# Implementation Notes

## Python Dependencies

Use only standard library for v1 unless existing project tooling already includes geometry libraries.

Allowed optional dependencies:

```text
shapely
geojson
```

But the script must degrade cleanly without them.

## Starter No-Dependency Strategy

If `shapely` is unavailable:

- read GeoJSON via `json`
- filter by bounds using coordinate scans
- write normalized FeatureCollections
- skip true clipping
- log warnings

## Feature ID Strategy

Generated feature IDs must be deterministic:

```text
<layer>_<slug>_<index>
```

Examples:

```text
island_liberty_island_001
pier_sunset_park_003
ferry_slip_battery_park_001
```

---

# Claude Build Instructions

Build in this order:

1. `tools/bake_harbor_sector.py`
2. starter source GeoJSON files if missing
3. output folder + manifest generation
4. `harborGeometryRegistry.js`
5. `harborGeometryRegistryDebug.js`
6. `harborGeometryDebugRenderer.js`
7. `index.html` script tags
8. verification commands

Do not touch:

- AISRuntime
- AircraftRuntime
- MarineRenderer behavior
- Mapbox style URLs
- CloudAtmosphereLayer
- AltitudeAwareWorldRenderer

---

# Verification Commands

```js
_wos.debug.harborGeometry.load()
_wos.debug.harborGeometry.state()
_wos.debug.harborGeometry.layers()
_wos.debug.harborGeometry.audit()

SBE.runtimeFlags = SBE.runtimeFlags || {};
SBE.runtimeFlags.showHarborGeometryDebug = true;
```

Disable:

```js
SBE.runtimeFlags.showHarborGeometryDebug = false;
```

---

# Build Readiness

```text
[BUILD]
Ready for Claude implementation.
```
