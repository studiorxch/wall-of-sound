# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Build the first high-value hero geometry set for NYC Harbor Sector 01.

# 0528F_WOS_HarborHeroGeometrySet_v1.0.0_BUILD

## Purpose

Create a visible hero geometry upgrade for NYC Harbor Sector 01 so the maritime layer gains stronger environmental context before more aircraft/cloud expansion.

This spec extends `0528E_WOS_HarborGeometryBakePipeline_v1.0.0_BUILD` by replacing sparse starter geometry with a focused, cinematic set of hand-authored harbor features.

Target result:

```text
boats + ferries + planes no longer float over a generic map

They exist inside a recognizable Brooklyn / Lower Manhattan harbor world.
```

## Scope

Build hero geometry for:

- Brooklyn Army Terminal / Sunset Park waterfront
- Red Hook waterfront
- Governors Island
- Liberty Island / Statue corridor
- Ellis Island
- Battery Park ferry edge
- Lower Manhattan shoreline edge
- Brooklyn Bridge / Manhattan Bridge context lines
- Verrazzano context line
- ferry slips and ferry lane geometry

Do not build a full NYC geometry system yet.

---

# Build Requirements

## 1. Hero Geometry Sources

Create or improve source GeoJSON files under:

```text
tools/sources/harbor/
```

Required source files:

```text
source_shoreline.geojson
source_piers.geojson
source_ferry_slips.geojson
source_islands.geojson
source_bridges.geojson
source_waterfront_blocks.geojson
source_hero_landmarks.geojson
source_harbor_channels.geojson
```

`source_hero_landmarks.geojson` and `source_harbor_channels.geojson` are new for this pass.

---

## 2. Feature Targets

Minimum feature counts after bake:

| Layer | Minimum Features | Notes |
|---|---:|---|
| shoreline | 10 | BAT, Sunset Park, Red Hook, Lower Manhattan, Battery, Governors, Liberty, Ellis |
| pier | 12 | BAT piers, Sunset marine terminal, Red Hook, Whitehall, Governors ferry edges |
| ferry_slip | 8 | Battery, Governors, Liberty, Sunset, Red Hook |
| island | 4 | Governors, Liberty, Ellis, small nearby harbor island/marker if available |
| bridge_context | 4 | Verrazzano, Brooklyn, Manhattan, Williamsburg optional/context |
| waterfront_block | 10 | industrial blocks, terminal blocks, skyline base blocks |
| hero_landmark | 4 | Statue marker, BAT marker, Lower Manhattan skyline marker, Governors marker |
| harbor_channel | 5 | ferry lanes, ship channel lanes, harbor crossing lanes |

Expected total after bake:

```text
57+ features
```

The exact count may exceed this if geometry is clean and lightweight.

---

# Layer Semantics

## shoreline

Purpose: water/land edge truth.

Must improve:

- shore edge confidence
- harbor silhouette
- 2.5D horizon readability
- vessel grounding

Use polygon or line geometry depending on source quality.

## pier

Purpose: visible maritime infrastructure.

Must include:

- long pier fingers
- terminal outlines
- ferry dock geometry
- industrial dock slabs

Pier geometry should be more important than generic building footprints.

## ferry_slip

Purpose: ferry logic and visual docking context.

Each ferry slip should include:

```json
{
  "terminalId": "battery_park",
  "expectedVesselClasses": ["ferry", "passenger"],
  "priority": 5,
  "cinematicWeight": 0.9
}
```

## island

Purpose: recognizable harbor orientation.

Required:

- Governors Island
- Liberty Island
- Ellis Island

These should be cleaner than the starter approximations.

## bridge_context

Purpose: altitude and skyline context.

Bridge geometry does not need full mesh detail yet. It needs location, direction, and silhouette authority.

## waterfront_block

Purpose: abstract landmass/building/terminal context.

Include:

- BAT massing blocks
- Sunset Park industrial blocks
- Red Hook container/terminal blocks
- Battery edge blocks
- Lower Manhattan skyline base blocks

## hero_landmark

Purpose: important camera composition anchors.

Minimum landmarks:

```text
statue_of_liberty_marker
brooklyn_army_terminal_marker
lower_manhattan_skyline_marker
governors_island_marker
```

## harbor_channel

Purpose: route-aware harbor motion lanes.

Include:

- ferry paths
- industrial crossing lanes
- cargo/barge channel hints
- Statue corridor lanes

---

# Runtime Integration

## Registry

Extend `HarborGeometryRegistry` only if needed.

Required API should remain stable:

```js
SBE.HarborGeometryRegistry.getLayerFeatures(layerName)
SBE.HarborGeometryRegistry.getAllFeatures()
SBE.HarborGeometryRegistry.getFeaturesNear(lat, lng, radiusM)
```

Add support for new layers:

```text
hero_landmark
harbor_channel
```

## Debug Renderer

Update `harborGeometryDebugRenderer.js` to draw new layers.

Draw order:

```text
waterfront_block
island
harbor_channel
ferry_slip
pier
shoreline
bridge_context
hero_landmark
```

Style intent:

| Layer | Visual Treatment |
|---|---|
| harbor_channel | thin blue route bands, low opacity |
| hero_landmark | bright marker + label |
| waterfront_block | muted amber/brown fills |
| pier | stronger amber lines/fills |
| ferry_slip | cyan terminal marks |
| bridge_context | yellow dashed lines |
| shoreline | pale blue-white edge lines |
| island | muted green/brown fills |

---

# Bake Tool Updates

Patch `tools/bake_harbor_sector.py` to include the two new layers.

Layer map must include:

```python
LAYER_SOURCES = {
    "shoreline": "source_shoreline.geojson",
    "pier": "source_piers.geojson",
    "ferry_slip": "source_ferry_slips.geojson",
    "island": "source_islands.geojson",
    "bridge_context": "source_bridges.geojson",
    "waterfront_block": "source_waterfront_blocks.geojson",
    "hero_landmark": "source_hero_landmarks.geojson",
    "harbor_channel": "source_harbor_channels.geojson",
}
```

Output must include:

```text
wall/data/harbor/nyc_harbor_sector_01/hero_landmarks.geojson
wall/data/harbor/nyc_harbor_sector_01/harbor_channels.geojson
```

`sector_manifest.json` must report accurate layer counts.

---

# Validation Commands

After patching and rebaking:

```bash
python3 tools/bake_harbor_sector.py --verbose
```

Then reload WOS and run:

```js
_wos.debug.harborGeometry.state()
_wos.debug.harborGeometry.layers()
_wos.debug.harborGeometry.features("hero_landmark")
_wos.debug.harborGeometry.features("harbor_channel")
_wos.debug.harborGeometry.audit()
```

Enable proof overlay:

```js
SBE.runtimeFlags = SBE.runtimeFlags || {};
SBE.runtimeFlags.showHarborGeometryDebug = true;
```

Near-query checks:

```js
_wos.debug.harborGeometry.near(40.6456, -74.0247, 2500) // BAT
_wos.debug.harborGeometry.near(40.6892, -74.0445, 2500) // Statue
_wos.debug.harborGeometry.near(40.7015, -74.0156, 2500) // Battery
_wos.debug.harborGeometry.near(40.6895, -74.0168, 2500) // Governors
```

---

# Success Criteria

This build passes when:

1. `sector_manifest.json` reports at least 57 total features.
2. New layers `hero_landmark` and `harbor_channel` load successfully.
3. Debug overlay shows visible geometry around BAT, Sunset Park, Red Hook, Lower Manhattan, Governors, Liberty, Ellis, and Battery Park.
4. Ferry slips and harbor channels visually align with the maritime layer.
5. At pitched camera views, shoreline/pier/island geometry improves spatial readability.
6. Runtime still loads baked files only; no live geometry processing is added to RAF.

---

# Non-Goals

Do not add:

- full 3D building meshes
- bridge meshes
- live OSM fetching in browser
- runtime clipping/simplification
- shoreline physics
- wake systems
- vessel identity changes

This is a geometry quality pass only.

---

# Claude Implementation Notes

Prioritize visible output over perfect GIS fidelity.

Use hand-authored approximation if precise data is unavailable.

Keep feature IDs deterministic:

```text
<layer>_<slug>_<index>
```

Every feature should include at minimum:

```json
{
  "id": "...",
  "label": "...",
  "layer": "...",
  "priority": 1,
  "cinematicWeight": 0.5,
  "lod": "hero"
}
```

Favor fewer readable shapes over many noisy shapes.

---

# Implementation Guide

- Put source geometry in `tools/sources/harbor/`, bake outputs to `wall/data/harbor/nyc_harbor_sector_01/`.
- Run `python3 tools/bake_harbor_sector.py --verbose`, then reload WOS.
- Expect the harbor sector to show denser, more recognizable waterfront geometry with no runtime performance regression.
