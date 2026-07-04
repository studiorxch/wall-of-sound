# 0604A_WOS_HarborAtmospherePass_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

## Purpose

Add the first dedicated harbor atmosphere layer.

The harbor now has:

```text
AIS source
→ audit source adapter
→ metadata normalizer
→ taxonomy resolver
→ taxonomy asset bridge
→ marine geometry
→ marine palettes
→ harbor visual tuning
```

The next missing layer is mood.

0604A adds a presentation-only atmosphere pass that makes the harbor feel like a world:

```text
dark water
soft cyan glow
distant shimmer
subtle haze
low-cost ambient overlays
```

without touching actor truth or map data.

---

## Core Goal

Make the harbor screenshot feel more alive and cinematic while preserving runtime safety.

This spec should improve:

```text
water readability
vessel separation
night/cyan mood
distance depth
harbor ambience
```

It must not add wakes, physics, route logic, or feed behavior.

---

## Scope

Create:

```text
wall/systems/presentation/harborAtmosphereRuntime.js
```

Modify:

```text
wall/index.html
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional:

```text
wall/styles.css
```

Only if a DOM overlay needs CSS.

Avoid modifying:

```text
worldSpaceVehicleLayer.js
```

unless there is a small read-only accessor needed.

Do not modify:

```text
AISRuntime
AISMetadataNormalizer
AISVesselMetadataAudit
MarineVesselTaxonomyResolver
MarineTaxonomyAssetBridge
ActorAssetLibraryAuthority
ActorRenderAuthority
TruthActorRuntime
Mapbox style sources
Drive runtime
feed runtimes
hero runtime
Studio persistence
```

---

## Authority Boundary

`HarborAtmosphereRuntime` owns:

- presentation-only visual atmosphere
- optional DOM/canvas overlay
- water glow settings
- haze settings
- shimmer settings
- debug state
- manual start/stop/toggle

It does not own:

- actor truth
- AIS metadata
- taxonomy
- asset assignments
- vessel geometry
- Mapbox data sources
- map style source definitions
- live feed cadence
- Drive runtime

---

## Runtime Shape

Create:

```js
SBE.HarborAtmosphereRuntime
```

API:

```js
Object.freeze({
  VERSION,
  start,
  stop,
  setEnabled,
  isEnabled,
  setDebug,
  getState,
  setPreset,
  getPreset,
  setIntensity,
  setWaterGlow,
  setHaze,
  setShimmer,
  resize,
  renderOnce
});
```

Default state:

```js
{
  version: "1.0.0",
  active: false,
  enabled: true,
  debug: false,
  preset: "night_harbor",
  intensity: 1.0,
  waterGlow: true,
  haze: true,
  shimmer: true,
  overlayMode: "canvas",
  frameCount: 0,
  lastFrameAt: null,
  lastError: null
}
```

---

## Implementation Strategy

Preferred implementation:

```text
single transparent canvas overlay
```

inside the Mapbox container.

The overlay should:

- sit above Mapbox base style
- sit below hard UI panels
- not block pointer events
- resize with the map container
- render low-cost atmosphere only
- use `requestAnimationFrame` only when active and enabled
- pause when disabled/stopped

Recommended DOM:

```html
<canvas id="wos-harbor-atmosphere"></canvas>
```

Inline style or CSS:

```css
#wos-harbor-atmosphere {
  position: absolute;
  inset: 0;
  pointer-events: none;
  mix-blend-mode: screen;
  opacity: 0.55;
}
```

---

## Visual Components

### 1. Water Glow

Add soft cyan/blue glow fields.

Visual language:

```text
large radial gradients
low opacity
slow pulsing
screen/additive blend
```

Suggested:

```text
center glow near lower harbor / map center
secondary glow near visible water bodies
edge vignette darkening
```

Do not query or mutate Mapbox water layers in v1 unless very safe.

This can be screen-space only.

### 2. Soft Harbor Haze

Add subtle horizontal/diagonal haze bands.

Visual language:

```text
thin translucent bands
very low opacity
slow drift
not cloudy
not foggy enough to obscure actors
```

Haze should make the scene feel atmospheric without hiding vessels.

### 3. Micro-Shimmer

Add tiny slow-moving specks or short dashes.

Visual language:

```text
few, subtle, low opacity
mostly on water-like screen zones
slow drift
not particle spam
```

Budget:

```text
max 80 shimmer points
default 40 shimmer points
```

No heavy particle system.

### 4. Distant Vessel Readability Support

Do not change vessel geometry directly.

Atmosphere may support vessels by:

```text
slight water glow behind them
subtle contrast halo in screen-space
```

Preferred v1:

```text
no actor-following halo
```

Leave actor-specific lights for:

```text
0604B_WOS_MarineLightCuePass_v1.0.0_BUILD
```

---

## Presets

Implement at least these presets:

```js
night_harbor
cyan_infra
low_fog
clean_dark
off
```

### night_harbor

Default.

```js
intensity: 1.0
waterGlow: true
haze: true
shimmer: true
palette: cyan/blue
```

### cyan_infra

More stylized WOS identity.

```js
intensity: 1.2
waterGlow: true
haze: true
shimmer: true
palette: cyan/teal
```

### low_fog

Softer / less cyber.

```js
intensity: 0.8
waterGlow: true
haze: true
shimmer: false
palette: blue-gray
```

### clean_dark

Minimal.

```js
intensity: 0.45
waterGlow: true
haze: false
shimmer: false
```

### off

No overlay.

```js
enabled: false
```

---

## Runtime Safety

The runtime must:

- never throw during boot
- safely no-op if Mapbox map/container is unavailable
- not block Drive
- not start feeds
- not call AISRuntime
- not call taxonomy modules
- not mutate Mapbox style
- not add Mapbox sources
- not add Mapbox layers
- not spam console
- stop RAF loop when stopped or disabled

---

## Mapbox Integration

Use:

```js
SBE.MapboxViewportRuntime.getMap()
```

if available.

Then:

```js
map.getContainer()
```

Attach overlay inside the container.

If unavailable:

```js
state.lastError = "map_unavailable"
return false
```

Do not force map initialization.

---

## Resize Behavior

Canvas should use device pixel ratio safely:

```js
dpr = Math.min(window.devicePixelRatio || 1, 2)
```

Avoid over-rendering at high DPI.

---

## Performance Budget

Target:

```text
< 1ms average draw cost on normal desktop
```

Practical constraints:

- max 80 shimmer points
- no per-pixel image processing
- no WebGL shader
- no repeated DOM creation
- no Mapbox feature queries per frame
- no actor scans per frame in v1

---

## Debug API

Add under:

```js
_wos.debug.worldActors
```

Required:

```js
harborAtmosphereState()
harborAtmosphereStart()
harborAtmosphereStop()
harborAtmosphereEnable(on)
harborAtmospherePreset(name)
harborAtmosphereIntensity(n)
harborAtmosphereDebug(on)
harborAtmosphereRenderOnce()
```

Optional:

```js
harborAtmosphereWaterGlow(on)
harborAtmosphereHaze(on)
harborAtmosphereShimmer(on)
```

Debug state should report:

```js
{
  active,
  enabled,
  preset,
  intensity,
  canvasAttached,
  canvasSize,
  dpr,
  frameCount,
  shimmerCount,
  lastFrameAt,
  lastError
}
```

---

## Acceptance Tests

### Test 1: Start Safe

Run:

```js
_wos.debug.worldActors.harborAtmosphereStart()
_wos.debug.worldActors.harborAtmosphereState()
```

Expected:

```text
active: true
canvasAttached: true
no crash
```

### Test 2: Stop Safe

Run:

```js
_wos.debug.worldActors.harborAtmosphereStop()
```

Expected:

```text
active: false
RAF stopped
canvas removed or hidden
no crash
```

### Test 3: Toggle

Run:

```js
_wos.debug.worldActors.harborAtmosphereEnable(false)
_wos.debug.worldActors.harborAtmosphereEnable(true)
```

Expected:

```text
enabled toggles
no feeds start
no actor truth mutation
```

### Test 4: Presets

Run:

```js
_wos.debug.worldActors.harborAtmospherePreset("night_harbor")
_wos.debug.worldActors.harborAtmospherePreset("cyan_infra")
_wos.debug.worldActors.harborAtmospherePreset("low_fog")
_wos.debug.worldActors.harborAtmospherePreset("clean_dark")
_wos.debug.worldActors.harborAtmospherePreset("off")
```

Expected:

```text
preset changes safely
invalid preset returns false or unchanged
```

### Test 5: No Mapbox Mutation

Before and after start:

```js
map.getStyle().sources
map.getStyle().layers.length
```

Expected:

```text
no new Mapbox sources
no new Mapbox layers
```

### Test 6: No Runtime Mutation

Before and after:

```js
SBE.ActorAssetLibraryAuthority.getAssignment("ais.vessel").assetId
SBE.MarineTaxonomyAssetBridge.getState()
```

Expected:

```text
unchanged
```

### Test 7: Visual Difference

With live harbor visible:

```js
_wos.debug.worldActors.harborAtmospherePreset("night_harbor")
```

Expected:

```text
water/harbor has subtle cyan glow, haze, and shimmer
vessels remain readable
UI remains usable
```

---

## Failure Conditions

This build fails if:

- overlay blocks map interaction
- RAF continues after stop
- console frame-spams
- Mapbox sources/layers are added
- AIS/feed/Drive starts
- actor truth changes
- taxonomy changes
- assignments change
- WSL vessel geometry changes
- non-marine actors regress
- performance tanks due to particle count
- haze hides vessels
- shimmer looks like visual noise
- overlay appears above UI panels

---

## Implementation Notes

### Keep It Subtle

This should feel like atmosphere, not a screensaver.

Default opacity should be restrained.

### Do Not Build Wakes

No wakes in 0604A.

Wake/trail attempts previously caused visual debt.

This spec focuses on global harbor mood.

### Keep It Independent

The atmosphere should work even if AIS is off.

It should enhance the scene, not depend on vessels.

---

## Future Follow-Ups

After this:

```text
0604B_WOS_MarineLightCuePass_v1.0.0_BUILD
0604D_WOS_HarborTaxonomyConfidenceTuning_v1.0.0_BUILD
0604G_WOS_AISSourceUpgradeReview_v1.0.0
0604H_WOS_MapWaterLayerMoodPatch_v1.0.0_BUILD
```

---

## Implementation Guide

- **Where**: Create `wall/systems/presentation/harborAtmosphereRuntime.js`; register it in `wall/index.html` after Mapbox viewport/runtime systems and before debug tooling; add `_wos.debug.worldActors.harborAtmosphere*` commands in `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/presentation/harborAtmosphereRuntime.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; open Wall; run `harborAtmosphereStart()`, switch presets, confirm no Mapbox sources/layers are added, then run `harborAtmosphereStop()`.
- **Expect**: WOS gains a subtle presentation-only harbor atmosphere layer with water glow, haze, and shimmer while AIS truth, taxonomy, assignments, vessel geometry, feeds, Drive, Mapbox style sources/layers, and non-marine actors remain unchanged.
