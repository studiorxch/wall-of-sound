# [BUILD] 0531J_WOS_WorldSpaceVehicleLayer_v1.0.0

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex now.  
**Purpose:** Replace screen-space vehicle DOM markers with world-space vehicle rendering so hero and traffic actors conform to pitched 3D Mapbox views.

---

## Environmental Assumptions

- App root: `wall/index.html`
- Existing runtime stack remains active:
  - `systems/world/heroVehicleRuntime.js`
  - `systems/world/trafficOccupancyRuntime.js`
  - `systems/render/heroVehicleRenderer.js`
  - `systems/render/trafficOccupancyRenderer.js`
- Existing DOM marker renderers must remain as fallback.
- Mapbox GL JS is already active.
- Three.js may or may not already be loaded; this spec must add safe detection and fallback behavior.
- No route logic rewrite in this pass.
- No traffic AI, lane simulation, or bridge-depth system in this pass.

---

## Problem

Current hero and traffic vehicles use `mapboxgl.Marker`, which renders as DOM billboard overlays.

That means vehicles:

- float above the map
- do not sit naturally in pitched 3D view
- do not conform to world depth
- do not interact with buildings, bridges, or terrain visually
- feel like UI icons rather than actors inside WOS

The route/runtime logic is usable. The rendering layer is the wrong technology for cinematic 3D traversal.

---

## Goal

Create a new **World-Space Vehicle Layer** using Mapbox custom layer + Three.js.

This layer should render vehicles as actual world-space objects positioned from actor lat/lng + heading data.

```text
HeroVehicleRuntime / TrafficOccupancyRuntime
        ↓ actor state
WorldSpaceVehicleLayer
        ↓ Three.js mesh instances
Mapbox Custom Layer
```

---

## Required Files

### New

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

### Update

```text
wall/index.html
wall/systems/render/heroVehicleRenderer.js
wall/systems/render/trafficOccupancyRenderer.js
wall/systems/world/trafficOccupancyRuntime.js
wall/systems/presentation/heroVehicleDebug.js
wall/systems/presentation/trafficOccupancyDebug.js
```

---

## Part 1 — Load Order

Add scripts in `index.html` after Mapbox is ready and before traffic debug tools.

```html
<script src="systems/render/worldSpaceVehicleLayer.js"></script>
<script src="systems/presentation/worldSpaceVehicleDebug.js"></script>
```

If Three.js is not already loaded, add CDN fallback before `worldSpaceVehicleLayer.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
```

Guard all Three.js usage:

```js
if (!global.THREE) {
  console.warn('[WorldSpaceVehicleLayer] THREE unavailable — DOM vehicle fallback remains active');
  return false;
}
```

---

## Part 2 — WorldSpaceVehicleLayer API

Create `SBE.WorldSpaceVehicleLayer`.

Required API:

```js
SBE.WorldSpaceVehicleLayer = Object.freeze({
  VERSION,
  start,
  stop,
  isActive,
  setEnabled,
  getEnabled,
  upsertVehicle,
  removeVehicle,
  clear,
  getState,
  getVisualState,
  setDebugMode,
});
```

### Vehicle Input Contract

```js
upsertVehicle({
  id: 'hero' | 'traffic_001',
  actorType: 'hero_car' | 'traffic_car' | 'box_truck',
  variant: 'sedan_red' | 'taxi_yellow' | 'clean_white' | 'sticker_graffiti_test',
  lat: 40.7128,
  lng: -74.0060,
  headingDeg: 90,
  scale: 1,
  visible: true,
  source: 'hero' | 'traffic',
});
```

Guard clauses:

- reject missing `id`
- reject invalid lat/lng
- reject missing map
- fallback cleanly if Three.js unavailable
- never throw during RAF/render loop

---

## Part 3 — Mapbox Custom Layer

Implement a Mapbox custom layer:

```js
var customLayer = {
  id: 'wos-world-space-vehicles',
  type: 'custom',
  renderingMode: '3d',
  onAdd: function(map, gl) {},
  render: function(gl, matrix) {},
};
```

Requirements:

- Use the Mapbox-provided WebGL context.
- Use `THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl })`.
- Set `renderer.autoClear = false`.
- Call `renderer.resetState()` before rendering.
- Use `map.triggerRepaint()` when active.
- Add layer above road layers but below HUD/DOM overlays.
- Do not mutate camera route logic.

---

## Part 4 — Coordinate Conversion

Use Mapbox Mercator coordinates.

```js
var coord = mapboxgl.MercatorCoordinate.fromLngLat(
  [vehicle.lng, vehicle.lat],
  altitudeMeters
);
```

Initial altitude:

```js
altitudeMeters = 0.35;
```

This small lift prevents z-fighting while still visually sitting on the road.

Each mesh transform must update every frame:

```js
mesh.position.set(coord.x, coord.y, coord.z);
mesh.rotation.z = -headingRad;
mesh.scale.set(scaleMeters, scaleMeters, scaleMeters);
```

Use a conservative scale constant first:

```js
WORLD_VEHICLE_SCALE = 0.0000008;
```

Then expose debug scaling.

---

## Part 5 — Procedural Low-Poly Vehicles

Do **not** require external GLB models for this pass.

Build simple procedural meshes directly in Three.js.

### Hero Car Mesh

Target visual:

- low-poly sedan/hatchback
- flattened top-down 2.5D body
- windshield plane
- roof plane
- hood/trunk planes
- four wheel blocks/discs
- tiny front color cue

Target geometry:

```text
200–800 triangles preferred
< 1,500 triangles hard cap
```

### Box Truck Mesh

Target visual:

- cab block
- cargo box block
- side-panel material slot
- wheels
- small windshield

Truck side panel must support future artwork texture.

For now, implement material variants:

```js
clean_white
weathered
sticker_graffiti_test
```

`sticker_graffiti_test` should use simple colored planes attached to the side panel. No texture pipeline required yet.

---

## Part 6 — Renderer Integration

### heroVehicleRenderer.js

Keep DOM SVG renderer as fallback.

When `SBE.WorldSpaceVehicleLayer.getEnabled() === true`:

- send hero actor state to `WorldSpaceVehicleLayer.upsertVehicle()`
- hide DOM marker
- do not stop hero runtime

Pseudo:

```js
if (worldLayer && worldLayer.getEnabled()) {
  worldLayer.upsertVehicle({
    id: 'hero',
    actorType: 'hero_car',
    variant: 'sedan_red',
    lat: actor.lat,
    lng: actor.lng,
    headingDeg: actor.headingDeg,
    scale: 1,
    visible: !_hidden,
    source: 'hero',
  });
  _setDomMarkerHidden(true);
  return;
}
```

If world layer fails:

```js
_setDomMarkerHidden(false);
```

### trafficOccupancyRenderer.js

Same pattern:

- traffic actors upsert into world layer when enabled
- DOM markers hidden when world layer succeeds
- DOM fallback remains available

---

## Part 7 — Debug API

Create `_wos.debug.worldVehicles`.

Required commands:

```js
_wos.debug.worldVehicles.state()
_wos.debug.worldVehicles.enable()
_wos.debug.worldVehicles.disable()
_wos.debug.worldVehicles.clear()
_wos.debug.worldVehicles.scale(1.5)
_wos.debug.worldVehicles.debug(true)
_wos.debug.worldVehicles.testHero()
_wos.debug.worldVehicles.testTraffic()
```

Expected state output:

```js
{
  active: true,
  enabled: true,
  threeAvailable: true,
  layerAdded: true,
  vehicleCount: 5,
  vehicles: [
    { id: 'hero', source: 'hero', actorType: 'hero_car', variant: 'sedan_red', lat, lng, headingDeg, visible: true },
  ],
  fallbackMode: false,
  scale: 1
}
```

### testHero()

Places one world-space sedan at current camera center.

### testTraffic()

Places:

```text
1 sedan
1 taxi
1 white truck
1 graffiti truck
```

around the current camera center with fixed offsets.

This must prove world-space rendering independently from route logic.

---

## Part 8 — Acceptance Tests

### Test 1 — Layer Boot

Console:

```js
_wos.debug.worldVehicles.state()
```

Expected:

```text
threeAvailable: true
layerAdded: true
vehicleCount: 0
```

If Three.js unavailable:

```text
fallbackMode: true
DOM markers still work
```

---

### Test 2 — Static World Vehicle

Console:

```js
_wos.debug.worldVehicles.testHero()
```

Expected:

```text
one 3D/2.5D vehicle appears at map center
vehicle rotates correctly with map bearing/pitch
vehicle sits on ground plane
```

---

### Test 3 — Static Traffic Set

Console:

```js
_wos.debug.worldVehicles.testTraffic()
```

Expected:

```text
sedan, taxi, white truck, graffiti truck visible near camera center
all conform better to pitched map than DOM markers
```

---

### Test 4 — Hero Runtime Integration

Launch Drive.

Expected:

```text
hero vehicle appears as world-space object
DOM marker hidden
car follows route
camera still follows hero
no route reset
```

---

### Test 5 — Traffic Runtime Integration

Console:

```js
_wos.debug.traffic.spawnOnHeroRoute(4)
```

Expected:

```text
traffic appears on hero route corridor
vehicles render in world-space
DOM traffic markers hidden
```

---

### Test 6 — Fallback

Console:

```js
_wos.debug.worldVehicles.disable()
```

Expected:

```text
DOM hero/traffic markers return
route continues
no crash
```

---

## Out of Scope

Do not implement:

- full GLB import pipeline
- Ford Focus model activation
- true bridge/tunnel occlusion
- traffic AI
- lane changing
- collision avoidance
- real artwork texture mapping
- vehicle editor
- minimap/PIP
- clouds

---

## Notes for Future Passes

This pass creates the rendering substrate for:

```text
2.5D procedural cars
white graffiti trucks
traffic variants
hero vehicle GLB import
world-space actor occlusion
road-depth authority
```

Once this layer works, DOM markers should become debug-only fallback.

---

## Implementation Guide

- **Where:** Add `worldSpaceVehicleLayer.js` and `worldSpaceVehicleDebug.js`; wire them in `index.html`; update hero and traffic renderers to upsert actor state into the world-space layer before falling back to DOM markers.
- **What:** Run the app, then test with `_wos.debug.worldVehicles.state()`, `_wos.debug.worldVehicles.testHero()`, `_wos.debug.worldVehicles.testTraffic()`, launch Drive, then run `_wos.debug.traffic.spawnOnHeroRoute(4)`.
- **Expect:** Vehicles render as pitched world-space 2.5D objects instead of pasted DOM markers; DOM fallback still works when world layer is disabled or unavailable.
