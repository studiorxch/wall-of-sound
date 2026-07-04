---
layout: spec
title: "Harbor Sector Authority"
date: 2026-05-28
doc_id: "0528D_WOS_HarborSectorAuthority_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "geography"
component: "harbor_sector_authority"
type: "system-spec"
status: "active"
stage: "BUILD"
priority: "high"
risk: "medium"
classification: "geography-authority"
summary: "Defines the first WOS hero harbor sector spanning Brooklyn waterfront, Lower Manhattan, Statue corridor, nearby islands, ferry-bound areas, and Brooklyn Army Terminal context."
doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Visible output over hidden authority"
depends_on:
  - "0527B_WOS_MapboxStyleTransferAudit_v1.0.0"
  - "0527C_WOS_VesselReplacementPass_v1.0.0"
  - "0527D_WOS_Maritime2_5DContextPass_v1.0.0"
  - "0528A_WOS_AirflightRuntimeBootstrap_v1.0.0"
  - "0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0"
  - "0528C_WOS_CloudAtmosphereLayer_v1.0.0"
enables:
  - "WOS hero harbor sectors"
  - "baked waterfront geometry"
  - "ferry route authority"
  - "maritime/airspace/city composition"
tags:
  - "harbor"
  - "brooklyn-waterfront"
  - "lower-manhattan"
  - "statue-corridor"
  - "ferry"
  - "sector-loader"
---

# 🚦 SPEC STAGE

Stage: **[BUILD]**  
Freeze Decision: **GO**  
Action: Build the first visible WOS harbor sector authority for Brooklyn waterfront, Lower Manhattan, Statue corridor, nearby islands, and ferry-bound infrastructure.

---

# 0528D_WOS_HarborSectorAuthority_v1.0.0_BUILD

## Purpose

Create the first canonical WOS harbor sector that gives the maritime layer real geographic and cinematic context.

This spec exists because vessels alone do not carry the harbor view. The visible impact comes from boats embedded inside New York waterfront infrastructure:

- Brooklyn Army Terminal
- Sunset Park waterfront
- Red Hook
- Governors Island
- Statue of Liberty / Liberty Island
- Ellis Island
- Lower Manhattan
- ferry terminals and ferry corridors
- industrial piers
- bridges and skyline context

The goal is not to model all of NYC. The goal is to define one high-value, bounded, reusable hero sector where maritime, aircraft, skyline, clouds, and map geometry visibly cooperate.

---

# Core Principle

```text
The harbor is not a boat layer.
The harbor is a geographic composition layer.
```

Maritime visibility depends on:

- shoreline accuracy
- piers and ferry slips
- nearby landmarks
- skyline silhouettes
- industrial waterfront blocks
- bridge context
- air corridors above the harbor
- atmospheric depth

This system gives those features a bounded authority so the renderer has something meaningful to interpret.

---

# Build Target

Create:

```js
SBE.HarborSectorAuthority
```

Placement:

```text
wall/systems/geography/harborSectorAuthority.js
wall/systems/geography/harborSectorAuthorityDebug.js
```

Load order:

```html
<!-- before renderers that consume sector context -->
<script src="./systems/geography/harborSectorAuthority.js"></script>

<!-- after main.js -->
<script src="./systems/geography/harborSectorAuthorityDebug.js"></script>
```

---

# Sector Definition

## Canonical Sector ID

```js
const HARBOR_SECTOR_ID = 'nyc_harbor_sector_01';
```

User-facing label:

```text
NYC Harbor Sector 01
```

Internal description:

```text
Brooklyn waterfront + Lower Manhattan + Statue corridor + ferry-bound harbor infrastructure.
```

---

# Required Geographic Bounds

The sector must include a bounding box large enough to cover:

## West / East

- west: Newark Bay / Jersey City waterfront edge
- east: Brooklyn waterfront / Governors Island / Red Hook / Sunset Park

## South / North

- south: Verrazzano / Upper Bay approach context
- north: Lower Manhattan / East River bridge threshold

Approximate bounding box:

```js
const NYC_HARBOR_BOUNDS = {
  west:  -74.085,
  south: 40.600,
  east:  -73.930,
  north: 40.735,
};
```

This is an initial operational bound. It may be tuned after screenshot validation.

---

# Required Anchor Zones

Define all anchor zones as data, not renderer hardcode.

```js
type HarborAnchorZone = {
  id: string;
  label: string;
  category:
    | 'industrial_waterfront'
    | 'ferry_terminal'
    | 'landmark'
    | 'island'
    | 'bridge_context'
    | 'skyline_context'
    | 'airport_overlap'
    | 'shipping_channel';
  lat: number;
  lng: number;
  radiusM: number;
  priority: 1 | 2 | 3 | 4 | 5;
  visibleAtZoomMin: number;
  visibleAtZoomMax: number;
  cinematicWeight: number;
};
```

## Mandatory Anchors

```js
const HARBOR_ANCHOR_ZONES = [
  {
    id: 'brooklyn_army_terminal',
    label: 'Brooklyn Army Terminal',
    category: 'industrial_waterfront',
    lat: 40.6456,
    lng: -74.0247,
    radiusM: 900,
    priority: 5,
    visibleAtZoomMin: 9.5,
    visibleAtZoomMax: 17,
    cinematicWeight: 1.0,
  },
  {
    id: 'sunset_park_piers',
    label: 'Sunset Park Piers',
    category: 'industrial_waterfront',
    lat: 40.6545,
    lng: -74.0182,
    radiusM: 1100,
    priority: 5,
    visibleAtZoomMin: 9.5,
    visibleAtZoomMax: 17,
    cinematicWeight: 0.95,
  },
  {
    id: 'red_hook_waterfront',
    label: 'Red Hook Waterfront',
    category: 'industrial_waterfront',
    lat: 40.6760,
    lng: -74.0123,
    radiusM: 1200,
    priority: 4,
    visibleAtZoomMin: 9.5,
    visibleAtZoomMax: 17,
    cinematicWeight: 0.85,
  },
  {
    id: 'governors_island',
    label: 'Governors Island',
    category: 'island',
    lat: 40.6895,
    lng: -74.0168,
    radiusM: 900,
    priority: 5,
    visibleAtZoomMin: 8.5,
    visibleAtZoomMax: 17,
    cinematicWeight: 0.9,
  },
  {
    id: 'statue_of_liberty',
    label: 'Statue of Liberty',
    category: 'landmark',
    lat: 40.6892,
    lng: -74.0445,
    radiusM: 600,
    priority: 5,
    visibleAtZoomMin: 8.5,
    visibleAtZoomMax: 17,
    cinematicWeight: 1.0,
  },
  {
    id: 'ellis_island',
    label: 'Ellis Island',
    category: 'island',
    lat: 40.6995,
    lng: -74.0396,
    radiusM: 650,
    priority: 4,
    visibleAtZoomMin: 8.5,
    visibleAtZoomMax: 17,
    cinematicWeight: 0.75,
  },
  {
    id: 'lower_manhattan_skyline',
    label: 'Lower Manhattan Skyline',
    category: 'skyline_context',
    lat: 40.7060,
    lng: -74.0115,
    radiusM: 1400,
    priority: 5,
    visibleAtZoomMin: 8.5,
    visibleAtZoomMax: 17,
    cinematicWeight: 1.0,
  },
  {
    id: 'battery_park_ferry_context',
    label: 'Battery Park Ferry Context',
    category: 'ferry_terminal',
    lat: 40.7015,
    lng: -74.0156,
    radiusM: 700,
    priority: 5,
    visibleAtZoomMin: 10,
    visibleAtZoomMax: 17,
    cinematicWeight: 0.9,
  },
  {
    id: 'verrazzano_context',
    label: 'Verrazzano Bridge Context',
    category: 'bridge_context',
    lat: 40.6066,
    lng: -74.0447,
    radiusM: 2200,
    priority: 4,
    visibleAtZoomMin: 7.5,
    visibleAtZoomMax: 14.5,
    cinematicWeight: 0.85,
  },
  {
    id: 'brooklyn_bridge_context',
    label: 'Brooklyn Bridge Context',
    category: 'bridge_context',
    lat: 40.7061,
    lng: -73.9969,
    radiusM: 1100,
    priority: 4,
    visibleAtZoomMin: 8.5,
    visibleAtZoomMax: 16,
    cinematicWeight: 0.8,
  },
];
```

Coordinates are operational seeds. They must be easy to adjust from screenshots.

---

# Ferry Corridor Authority

Ferry-bound geography must be elevated above generic maritime traffic.

Define:

```js
type FerryCorridor = {
  id: string;
  label: string;
  points: Array<{ lat: number; lng: number }>;
  priority: 1 | 2 | 3 | 4 | 5;
  renderHint: 'primary' | 'secondary' | 'tourist' | 'industrial';
  expectedVesselClasses: string[];
};
```

Minimum corridors:

```js
const FERRY_CORRIDORS = [
  {
    id: 'battery_to_statue_liberty',
    label: 'Battery Park → Liberty Island',
    points: [
      { lat: 40.7015, lng: -74.0156 },
      { lat: 40.6950, lng: -74.0300 },
      { lat: 40.6892, lng: -74.0445 },
    ],
    priority: 5,
    renderHint: 'tourist',
    expectedVesselClasses: ['ferry', 'passenger'],
  },
  {
    id: 'battery_to_governors',
    label: 'Battery Park → Governors Island',
    points: [
      { lat: 40.7015, lng: -74.0156 },
      { lat: 40.6956, lng: -74.0155 },
      { lat: 40.6895, lng: -74.0168 },
    ],
    priority: 5,
    renderHint: 'primary',
    expectedVesselClasses: ['ferry'],
  },
  {
    id: 'red_hook_to_governors',
    label: 'Red Hook → Governors Island',
    points: [
      { lat: 40.6760, lng: -74.0123 },
      { lat: 40.6830, lng: -74.0150 },
      { lat: 40.6895, lng: -74.0168 },
    ],
    priority: 4,
    renderHint: 'secondary',
    expectedVesselClasses: ['ferry', 'passenger'],
  },
  {
    id: 'sunset_park_to_lower_manhattan',
    label: 'Sunset Park → Lower Manhattan',
    points: [
      { lat: 40.6456, lng: -74.0247 },
      { lat: 40.6650, lng: -74.0220 },
      { lat: 40.7015, lng: -74.0156 },
    ],
    priority: 5,
    renderHint: 'primary',
    expectedVesselClasses: ['ferry'],
  },
];
```

---

# Hero Geometry Targets

This spec does not require full downloaded geometry yet. It must prepare the sector system for baked geometry by declaring what should be preserved first.

## Tier 1: Required Hero Geometry

```js
const HERO_GEOMETRY_TARGETS = [
  'shoreline_polygons',
  'pier_outlines',
  'ferry_terminal_footprints',
  'industrial_waterfront_blocks',
  'lower_manhattan_skyline_blocks',
  'governors_island_outline',
  'ellis_island_outline',
  'liberty_island_outline',
  'statue_marker',
  'bridge_context_lines',
];
```

## Tier 2: Future Baked Geometry

```js
const DEFERRED_BAKED_GEOMETRY = [
  'building_meshes',
  'bridge_meshes',
  'crane_silhouettes',
  'airport_terminal_meshes',
  'container_yard_blocks',
  'night_window_emissive_masks',
];
```

---

# Sector LOD Rules

The sector must expose level-of-detail hints for renderers.

```js
type HarborSectorLOD = {
  zoomMin: number;
  zoomMax: number;
  cameraBand: 'ground' | 'low_climb' | 'mid_climb' | 'high_cruise';
  shorelineDetail: 'none' | 'coarse' | 'standard' | 'hero';
  landmarkDetail: 'none' | 'marker' | 'silhouette' | 'hero';
  ferryCorridorDetail: 'none' | 'line' | 'animated_hint' | 'route_band';
  buildingDetail: 'none' | 'mapbox' | 'baked_silhouette' | 'baked_hero';
};
```

Initial rule table:

```js
const HARBOR_SECTOR_LOD = [
  {
    zoomMin: 7,
    zoomMax: 10,
    cameraBand: 'high_cruise',
    shorelineDetail: 'coarse',
    landmarkDetail: 'marker',
    ferryCorridorDetail: 'line',
    buildingDetail: 'none',
  },
  {
    zoomMin: 10,
    zoomMax: 12.5,
    cameraBand: 'mid_climb',
    shorelineDetail: 'standard',
    landmarkDetail: 'silhouette',
    ferryCorridorDetail: 'animated_hint',
    buildingDetail: 'mapbox',
  },
  {
    zoomMin: 12.5,
    zoomMax: 15,
    cameraBand: 'low_climb',
    shorelineDetail: 'hero',
    landmarkDetail: 'silhouette',
    ferryCorridorDetail: 'route_band',
    buildingDetail: 'mapbox',
  },
  {
    zoomMin: 15,
    zoomMax: 18,
    cameraBand: 'ground',
    shorelineDetail: 'hero',
    landmarkDetail: 'hero',
    ferryCorridorDetail: 'route_band',
    buildingDetail: 'baked_hero',
  },
];
```

---

# Core Functions

Implement these functions exactly.

```js
SBE.HarborSectorAuthority = {
  VERSION: '1.0.0',

  getActiveSector,
  getSectorBounds,
  getAnchorZones,
  getAnchorZoneById,
  getFerryCorridors,
  getHeroGeometryTargets,
  resolveSectorLOD,
  resolveNearbyAnchorZones,
  resolveSectorFocusScore,
  isPointInsideSector,
};
```

## `getActiveSector()`

Returns full sector object.

```js
function getActiveSector() {
  return NYC_HARBOR_SECTOR_01;
}
```

## `resolveSectorLOD(camera, altitudeWorldState)`

Returns the closest `HarborSectorLOD` based on zoom and altitude band.

Rules:

- use `camera.zoom` first
- use `AltitudeWorldState.band` as secondary modifier
- never return null
- default to mid-climb LOD if camera data is missing

## `resolveNearbyAnchorZones(lat, lng, radiusM)`

Returns anchors within radius, sorted by:

1. distance ascending
2. priority descending
3. cinematicWeight descending

## `resolveSectorFocusScore(camera)`

Returns `0–1` score describing how much the current camera should care about this sector.

Inputs:

- camera center inside sector bounds
- zoom inside sector operational range
- proximity to priority anchors
- active aircraft/harbor overlap if available

---

# Debug API

Create:

```js
_wos.debug.harborSector
```

Commands:

```js
_wos.debug.harborSector.sector()
_wos.debug.harborSector.bounds()
_wos.debug.harborSector.anchors()
_wos.debug.harborSector.ferries()
_wos.debug.harborSector.lod()
_wos.debug.harborSector.near(lat, lng, radiusM)
_wos.debug.harborSector.focus()
_wos.debug.harborSector.audit()
```

## Expected Debug Output

`anchors()` prints a table:

```text
ID                          CATEGORY                PRIORITY  WEIGHT  LAT/LNG
brooklyn_army_terminal      industrial_waterfront   5         1.00    40.6456 / -74.0247
statue_of_liberty           landmark                5         1.00    40.6892 / -74.0445
...
```

`ferries()` prints corridor points and render hints.

`lod()` prints current camera zoom, altitude band, and resolved sector detail settings.

---

# First Visible Renderer Hook

This spec requires one minimal visual proof hook.

Create optional renderer:

```text
wall/render/harborSectorDebugRenderer.js
```

Only active when:

```js
SBE.runtimeFlags.showHarborSectorDebug === true
```

Draw:

- sector bounding box
- anchor circles
- ferry corridor polylines
- labels for top-priority anchors

Do not create polished artwork yet.

Purpose:

```text
prove that the sector exists in the correct geographic place
```

---

# Screenshot Success Criteria

This build passes only if screenshot validation shows:

- Brooklyn Army Terminal anchor appears near the correct waterfront location.
- Lower Manhattan skyline anchor appears north/east of harbor center.
- Statue / Ellis / Governors islands appear in correct spatial relation.
- Ferry corridors connect visibly plausible endpoints.
- Sector bounds cover the user’s window-facing harbor area and ferry-bound zones.
- Debug renderer can be turned off cleanly.

---

# Non-Goals

This spec does NOT build:

- downloaded building meshes
- final skyline renderer
- detailed Statue of Liberty mesh
- production ferry simulation
- live ferry schedules
- ADS-B / AIS correction logic
- Mapbox replacement renderer
- final cloud/lighting presets

Those follow after sector authority proves the geography.

---

# Deferred Follow-Up Specs

Recommended next specs:

```text
0528E_WOS_HarborSectorDebugRenderer_v1.0.0_BUILD
0528F_WOS_BakedWaterfrontGeometryPipeline_v1.0.0_BUILD
0528G_WOS_FerryCorridorRuntime_v1.0.0_BUILD
0528H_WOS_BridgeAndSkylineContextPass_v1.0.0_BUILD
```

---

# Implementation Guide

- Put authority data in `wall/systems/geography/harborSectorAuthority.js`; put debug binding after `main.js`.
- Run `_wos.debug.harborSector.audit()` and `_wos.debug.harborSector.anchors()` after reload.
- Expect no polished visuals yet except optional debug bounds/corridors; the pass is correct geography first.
