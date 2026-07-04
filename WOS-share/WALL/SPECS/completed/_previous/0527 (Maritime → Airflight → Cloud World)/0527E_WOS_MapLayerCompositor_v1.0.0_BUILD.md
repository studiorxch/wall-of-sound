# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Build the visible map-layer compositor required to compare, mix, and validate vector, satellite, 3D building, overlay, and future cloud/world layers before aircraft expansion.

---

# 0527E_WOS_MapLayerCompositor_v1.0.0

```yaml
layout: spec
title: "WOS Map Layer Compositor"
date: 2026-05-27
doc_id: "0527E_WOS_MapLayerCompositor_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "rendering"
component: "map_layer_compositor"
type: "system-spec"
status: "active"
priority: "high"
risk: "medium"
classification: "presentation-layer"
summary: "Defines a visible map-layer compositor for comparing and mixing StudioRich vector map styling, satellite imagery, 3D buildings, WOS overlays, and future cloud/weather layers through synchronized single-view and grid-view modes."
doctrine:
  - "visible output over hidden infrastructure"
  - "Mapbox owns geographic baseline"
  - "WOS owns spatial composition"
  - "2D owns truth"
  - "2.5D owns presentation"
depends_on:
  - "0527B_WOS_MapboxStyleTransferAudit_v1.0.0"
  - "0527C_WOS_VesselReplacementPass_v1.0.0"
  - "0527D_WOS_Maritime2_5DContextPass_v1.0.0"
enables:
  - "0528A_WOS_AirflightRuntimeBootstrap_v1.0.0"
  - "0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0"
  - "0528C_WOS_CloudAtmosphereLayer_v1.0.0"
tags:
  - "mapbox"
  - "satellite"
  - "3d-buildings"
  - "compositor"
  - "grid-view"
  - "airflight-prep"
```

---

# 🎯 PURPOSE

Build a visible compositor tool that lets WOS inspect and mix multiple spatial surfaces:

```text
StudioRich vector map
Satellite imagery
Satellite-streets hybrid
3D buildings
WOS overlays
Cloud/weather test layers
```

This system exists because WOS is no longer only rendering a map.

It is becoming:

```text
spatial composition software
```

The compositor must make it possible to see which layer language actually supports:

- maritime context
- aircraft altitude
- city infrastructure
- cloud/weather layers
- bridge and landmark framing
- future grid-view broadcast modes

This is a tool-first visible-results pass.

---

# ✅ BUILD READINESS

Status:

```text
[BUILD]
```

Reason:

- Mapbox Studio style transfer is fixed.
- Vessel classes now visibly differentiate.
- Maritime 2.5D is usable enough to evaluate map context.
- Aircraft work needs layer-comparison tools before flight rendering begins.

---

# 🧠 CORE PRINCIPLES

## WOS Is A Spatial Compositor

WOS must treat map layers as stackable and comparable surfaces, not as a single permanent basemap.

The user must be able to switch between:

```text
single composite view
```

and:

```text
multi-pane grid comparison view
```

without destroying camera state.

---

## Visible Layer Control Is Required

Every layer must expose:

- enabled state
- opacity
- blend mode where applicable
- source type
- render order
- runtime status

No visual layer may remain hidden, implicit, or uninspectable.

---

## Mapbox Remains The Geographic Authority

Mapbox owns:

- vector basemap rendering
- satellite imagery
- terrain source availability
- building extrusion source data
- camera projection

WOS owns:

- composition policy
- overlay visibility
- grid layout
- opacity/blend behavior
- debug comparison modes

---

## This Is Not Atmosphere Expansion

This spec may prepare cloud/weather layer slots.

It must NOT build:

- complex cloud simulation
- new fog math
- hidden atmospheric pressure systems
- destructive global tint stacks

Clouds in this phase are test surfaces only.

---

# 🧱 SYSTEM SCOPE

This spec builds:

1. **Layer registry** for available map/composition layers.
2. **Single-view compositor mode** for stacked layer rendering.
3. **Grid-view compositor mode** for side-by-side comparison.
4. **Runtime controls** for toggling, opacity, and blend mode.
5. **Debug API** for layer audit and screenshot validation.
6. **3D building test toggle** where Mapbox source data supports it.
7. **Satellite / satellite-streets switching** without losing camera position.
8. **Future cloud/weather layer placeholder** as a visible test overlay slot.

---

# 🚫 NON-GOALS

Do NOT build:

- aircraft runtime
- cloud simulation
- weather forecast ingestion
- terrain gameplay
- new maritime vessel logic
- new wake behavior
- new AIS classification
- new hidden atmosphere systems

This is a presentation-tool layer only.

---

# 🗺️ REQUIRED LAYERS

## 1. StudioRich Vector

Canonical style:

```text
mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p
```

Purpose:

- primary WOS authored map look
- harbor readability
- world visual identity

---

## 2. Mapbox Satellite

Source:

```text
mapbox://styles/mapbox/satellite-v9
```

Purpose:

- ports
- airports
- container yards
- real shoreline complexity
- industrial realism

---

## 3. Satellite Streets / Hybrid

Source:

```text
mapbox://styles/mapbox/satellite-streets-v12
```

Purpose:

- readable infrastructure over imagery
- airport/taxiway validation
- bridge/road context

---

## 4. 3D Buildings

Purpose:

- Manhattan depth
- skyline framing
- aircraft altitude reference
- bridge/city canyon context

Initial implementation may use Mapbox fill-extrusion where supported.

Required behavior:

- toggle on/off
- opacity control
- height exaggeration control
- no mutation of base style source

---

## 5. WOS Overlay Stack

Includes current overlay canvas/runtime layers:

- maritime vessels
- traffic overlays
- atmosphere composites
- HUD overlays
- future aircraft overlays

Required behavior:

- isolate all overlays
- toggle each layer
- show active/muted state
- avoid flattening Mapbox style by default

---

## 6. Cloud / Weather Test Layer

Initial placeholder only.

Purpose:

- confirm layer position above map and below HUD
- test opacity/blend behavior
- prepare for aircraft/cloud altitude work

Allowed visuals:

- soft transparent noise sheet
- simple procedural cloud bands
- static test texture

Forbidden:

- complex weather simulation
- hidden global atmosphere pressure
- destructive permanent color wash

---

# 🧩 DATA MODEL

```ts
export type MapLayerKind =
  | 'mapbox-style'
  | 'mapbox-source-layer'
  | 'canvas-overlay'
  | 'procedural-overlay'
  | 'debug-layer';

export type MapLayerBlendMode =
  | 'normal'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'soft-light'
  | 'lighter';

export type MapLayerCompositorMode =
  | 'single'
  | 'grid';

export type MapLayerDescriptor = {
  id: string;
  label: string;
  kind: MapLayerKind;
  enabled: boolean;
  opacity: number;
  blendMode: MapLayerBlendMode;
  source?: string;
  styleUrl?: string;
  order: number;
  status: 'ready' | 'loading' | 'disabled' | 'error';
  error?: string;
};

export type MapLayerCompositorState = {
  enabled: boolean;
  mode: MapLayerCompositorMode;
  activeStyleId: string;
  layers: MapLayerDescriptor[];
  gridSlots: string[];
  preserveCamera: boolean;
  buildingExtrusionEnabled: boolean;
  buildingOpacity: number;
  buildingHeightScale: number;
};
```

---

# ⚙️ RUNTIME MODULES

## New File

```text
wall/systems/presentation/mapLayerCompositor.js
```

Owns:

- layer registry
- compositor state
- style switching helpers
- grid mode state
- 3D building toggle policy
- layer opacity/blend metadata

Must not own:

- AIS truth
- vessel classification
- camera truth
- aircraft runtime
- atmosphere pressure

---

## New Debug File

```text
wall/systems/presentation/mapLayerCompositorDebug.js
```

Binds:

```js
_wos.debug.layers
```

Required commands:

```js
_wos.debug.layers.list()
_wos.debug.layers.mode('single')
_wos.debug.layers.mode('grid')
_wos.debug.layers.enable('satellite', true)
_wos.debug.layers.opacity('satellite', 0.45)
_wos.debug.layers.blend('satellite', 'soft-light')
_wos.debug.layers.style('studiorich')
_wos.debug.layers.style('satellite')
_wos.debug.layers.style('satelliteStreets')
_wos.debug.layers.buildings(true)
_wos.debug.layers.buildingOpacity(0.6)
_wos.debug.layers.buildingScale(1.0)
_wos.debug.layers.audit()
_wos.debug.layers.restore()
```

---

# 🔁 EXECUTION FLOW

## Single-View Composite

```text
Initialize compositor registry
→ Read current Mapbox camera
→ Select base style
→ Apply optional satellite/overlay mode
→ Apply 3D buildings if enabled
→ Render WOS overlays above basemap
→ Preserve HUD above all layers
```

## Grid-View Composite

```text
Read current camera
→ Create synchronized layer panes
→ Assign each pane a layer/style mode
→ Sync center/zoom/pitch/bearing
→ Render pane labels
→ Disable duplicate HUD clutter per pane
→ Keep one master control camera
```

Initial grid may be CSS/DOM-based if multiple Mapbox instances are easier than canvas compositing.

---

# 🧪 INITIAL GRID SLOTS

Default 2x2 grid:

| Slot | Layer |
|---|---|
| A | StudioRich Vector |
| B | Satellite |
| C | Satellite Streets |
| D | StudioRich + WOS Overlays |

Optional alternate grid:

| Slot | Layer |
|---|---|
| A | Vector |
| B | Satellite |
| C | 3D Buildings |
| D | Cloud Test |

---

# 🏙️ 3D BUILDING REQUIREMENTS

Add a function:

```ts
function enable3DBuildings(enabled: boolean): void;
```

Behavior:

- check if map style has `composite` source
- if source exists, add `wos-3d-buildings` fill-extrusion layer
- insert below label layers where possible
- expose opacity and height scale
- avoid duplicate layer insertion
- remove or hide cleanly when disabled

Example layer ID:

```text
wos-3d-buildings
```

Style requirements:

- muted opacity by default
- not too glossy
- should support aircraft/city-depth evaluation

---

# 🛰️ SATELLITE REQUIREMENTS

Satellite mode must preserve:

- center
- zoom
- pitch
- bearing

when switching styles.

Use the same Mapbox camera after `setStyle()` completes.

Required behavior:

```text
style switch → style.load → restore camera → reapply WOS layers/buildings
```

---

# 🌫️ CLOUD TEST LAYER REQUIREMENTS

Create a placeholder layer descriptor:

```text
cloud-test
```

Initial behavior:

- enabled false by default
- opacity 0.25 default
- blend mode screen or soft-light
- renders above basemap and below HUD
- must be toggleable

Acceptable first rendering:

```text
slow static translucent cloud bands
```

No live weather logic in this phase.

---

# 🧰 UI REQUIREMENTS

Minimum UI may be debug-console only for v1.0.0.

Preferred visible UI target:

- add a small **LAYERS** panel section
- show layer rows
- toggle checkbox
- opacity slider
- mode selector: `single / grid`
- style selector: `StudioRich / Satellite / Satellite Streets`
- 3D Buildings toggle

Do not block build on polished UI.

Debug API is acceptable for first pass if screenshot gates are met.

---

# 🔍 OBSERVABILITY

`audit()` must report:

```js
{
  enabled: true,
  mode: 'single' | 'grid',
  activeStyleId: string,
  activeStyleUrl: string,
  mapReady: boolean,
  camera: { center, zoom, pitch, bearing },
  layers: [...],
  buildingExtrusionEnabled: boolean,
  cloudTestEnabled: boolean,
  issues: string[]
}
```

Must warn if:

- Mapbox map is not ready
- style switch failed
- 3D building source missing
- grid panes are out of sync
- overlay layer is active but opacity is 0
- satellite mode cannot load

---

# ✅ VALIDATION CHECKLIST

## Map Style Control

- [ ] StudioRich vector style loads.
- [ ] Satellite style loads.
- [ ] Satellite Streets style loads.
- [ ] Switching styles preserves camera.
- [ ] Switching styles does not break WOS overlays.

## Layer Control

- [ ] Layers can be listed.
- [ ] Layers can be enabled/disabled.
- [ ] Opacity can be changed.
- [ ] Blend mode can be changed for canvas/procedural overlays.
- [ ] Restore returns to known default.

## 3D Buildings

- [ ] 3D buildings can be enabled where supported.
- [ ] Buildings can be disabled.
- [ ] Building opacity works.
- [ ] Building height scale works.
- [ ] No duplicate building layers are added.

## Grid View

- [ ] Grid mode activates.
- [ ] At least 4 panes render or are stubbed with clear status.
- [ ] Panes remain camera-synchronized.
- [ ] Pane labels identify each layer.
- [ ] Grid view can return to single view.

## Screenshot Gates

- [ ] StudioRich vector vs satellite comparison is visible.
- [ ] 3D buildings create obvious depth where available.
- [ ] WOS overlays can be compared against clean basemap.
- [ ] Cloud test layer can be toggled visibly.
- [ ] No maritime regression.

---

# 🚨 FAILURE CONDITIONS

Fail the build if:

- style switching breaks the map
- camera resets unexpectedly
- Mapbox Studio style is lost
- overlays permanently contaminate basemap
- 3D building layer duplicates on repeated toggles
- grid mode cannot be exited cleanly
- WOS HUD becomes unreadable
- maritime vessels disappear unintentionally

---

# 🔗 CHAIN DISPOSITION

## 0527B — Mapbox Style Transfer Audit

Disposition:

```text
REQUIRED FOUNDATION — COMPLETE ENOUGH TO PROCEED
```

The compositor depends on the corrected StudioRich style URL and style audit commands.

---

## 0527C — Vessel Replacement Pass

Disposition:

```text
ACTIVE BASELINE
```

The compositor must preserve vessel class rendering while switching map styles.

---

## 0527D — Maritime 2.5D Context Pass

Disposition:

```text
ACTIVE BASELINE
```

The compositor must preserve tilt, horizon fade, grounded hull behavior, and high-pitch wake suppression.

---

## 0528A — Airflight Runtime Bootstrap

Disposition:

```text
ENABLED AFTER 0527E
```

Aircraft should not begin until layer comparison tools exist.

---

# 🧭 IMPLEMENTATION NOTES

## Suggested Runtime Registry

```js
const MAP_LAYER_PRESETS = {
  studiorich: {
    id: 'studiorich',
    label: 'StudioRich Vector',
    styleUrl: 'mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p'
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    styleUrl: 'mapbox://styles/mapbox/satellite-v9'
  },
  satelliteStreets: {
    id: 'satelliteStreets',
    label: 'Satellite Streets',
    styleUrl: 'mapbox://styles/mapbox/satellite-streets-v12'
  }
};
```

---

## Camera Preservation Helper

```js
function snapshotCamera(map) {
  return {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing()
  };
}

function restoreCamera(map, camera) {
  map.jumpTo({
    center: camera.center,
    zoom: camera.zoom,
    pitch: camera.pitch,
    bearing: camera.bearing
  });
}
```

---

## Safe Style Switch Pattern

```js
function setBaseStyle(styleId) {
  const map = SBE.MapboxViewportRuntime.getMap();
  const camera = snapshotCamera(map);
  const preset = MAP_LAYER_PRESETS[styleId];

  if (!map || !preset) return false;

  map.setStyle(preset.styleUrl);

  map.once('style.load', () => {
    restoreCamera(map, camera);
    reapply3DBuildingsIfEnabled();
    reapplyRegisteredMapboxLayers();
    console.log('[MapLayerCompositor] style loaded:', styleId, preset.styleUrl);
  });

  return true;
}
```

---

# 📌 SUCCESS CONDITION

The user can run:

```js
_wos.debug.layers.mode('grid')
```

and visibly compare:

```text
StudioRich vector
Satellite
Satellite Streets
StudioRich + WOS overlays
```

Then run:

```js
_wos.debug.layers.mode('single')
```

and return to the main WOS view without losing camera state or maritime rendering.

---

# IMPLEMENTATION GUIDE

- **Where code goes:** `wall/systems/presentation/mapLayerCompositor.js` and `wall/systems/presentation/mapLayerCompositorDebug.js`; load compositor before `main.js` only if it needs runtime registration, debug after `main.js`.
- **What to run:** `_wos.debug.layers.audit()`, then `_wos.debug.layers.style('satellite')`, `_wos.debug.layers.buildings(true)`, `_wos.debug.layers.mode('grid')`.
- **What to expect:** visible layer switching, camera-preserved style changes, optional 3D building depth, and a grid comparison mode ready for aircraft/cloud decisions.
