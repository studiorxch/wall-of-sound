# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Promote baked harbor geometry from debug proof overlay into a production runtime renderer.

# 0528G_WOS_HarborGeometryRuntimeRenderer_v1.0.0_BUILD

## Purpose

Build a production renderer for the baked NYC harbor geometry introduced in `0528E` and expanded in `0528F`.

This renderer must make the harbor sector visibly richer during normal runtime without relying on debug overlays.

The goal is to turn baked geometry into a controlled cinematic layer:

```text
baked GeoJSON → HarborGeometryRegistry → HarborGeometryRuntimeRenderer → visible harbor context
```

This is not a new geography authority and not a new bake pipeline.

It is the runtime visual layer for already-baked harbor geometry.

---

## Build Status

```text
[BUILD]
```

Ready to send to Claude/Codex.

---

## Core Problem

`0528F` successfully expanded harbor geometry to 57 features, including:

- shoreline
- piers
- ferry slips
- islands
- bridge context
- waterfront blocks
- hero landmarks
- harbor channels

But current rendering is still debug-only.

The production world needs a renderer that can show this geometry cleanly during normal operation, with:

- opacity control
- LOD filtering
- altitude response
- style presets
- sector focus gating
- no debug labels unless explicitly enabled

---

## Non-Negotiable Constraints

1. **Must read baked geometry only**  
   Source is `SBE.HarborGeometryRegistry`.

2. **Must not parse raw source GeoJSON**  
   Runtime never reads `tools/sources/harbor/*`.

3. **Must not mutate geometry**  
   Renderer is interpretation-only.

4. **Must not replace Mapbox**  
   This layer supplements Mapbox presentation.

5. **Must not depend on debug flags**  
   Runtime renderer uses its own production enabled flag.

6. **Must not create new hidden atmosphere math**  
   All styling must be visibly controllable.

7. **Must remain cheap**  
   Canvas overlay only. No per-frame geometry simplification.

---

## Required Files

Create:

```text
wall/render/harborGeometryRuntimeRenderer.js
wall/systems/presentation/harborGeometryRuntimeStyle.js
wall/systems/presentation/harborGeometryRuntimeDebug.js
```

Update:

```text
wall/index.html
```

---

# 1. HarborGeometryRuntimeStyle

## File

```text
wall/systems/presentation/harborGeometryRuntimeStyle.js
```

## Responsibility

Own production style profiles for baked harbor geometry.

This module owns style data only.
It renders no pixels.

## API

Expose:

```js
SBE.HarborGeometryRuntimeStyle = Object.freeze({
  VERSION,
  getPreset,
  setPreset,
  getLayerStyle,
  getLayerOpacity,
  getStyleState,
  PRESETS,
});
```

## Presets

Required presets:

```text
minimal
cinematic
survey
night_signal
```

### minimal

Use for clean map baseline.

- shoreline: low opacity
- piers: low opacity
- ferry slips: subtle
- landmarks: visible but quiet
- channels: mostly hidden
- waterfront blocks: off or very low

### cinematic

Default preset.

- shoreline: visible
- piers: visible
- ferry slips: visible
- islands: visible
- harbor channels: visible but subtle
- hero landmarks: visible
- waterfront blocks: subtle fill

### survey

Analytical/map-comparison preset.

- higher contrast
- clearer channels
- stronger ferry slips
- bridge lines visible
- labels optional through debug only

### night_signal

Stylized night/infrastructure preset.

- channels glow-like but not blurred
- ferry slips cyan
- landmarks pale
- piers amber
- shoreline cool blue

No actual canvas glow blur by default.

---

# 2. Runtime Renderer

## File

```text
wall/render/harborGeometryRuntimeRenderer.js
```

## Responsibility

Render baked harbor geometry as a normal production layer.

## Z-Order

Canvas should mount inside `.mapboxgl-canvas-container`.

Recommended z-index:

```text
6.4
```

Layer order context:

```text
Mapbox base                 z base
Altitude world overlay       z 7.0
Cloud atmosphere             z 7.5
Aircraft canvas              z 8.0
Debug geometry               z 9.5
```

Runtime harbor geometry should sit:

```text
above Mapbox
below altitude/cloud/aircraft
```

## Required Draw Order

Back to front:

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

Same order as debug renderer, but production styling should be softer and more integrated.

## Required Runtime Gates

Renderer should render only when:

```js
SBE.HarborGeometryRegistry.isLoaded() === true
```

and:

```js
runtime enabled === true
```

and:

```js
HarborSectorAuthority.resolveSectorFocusScore(camera) > threshold
```

Default threshold:

```js
0.12
```

This prevents harbor geometry from appearing when camera is outside sector influence.

---

# 3. LOD Behavior

Renderer must read:

```js
SBE.HarborSectorAuthority.resolveSectorLOD(camera, SBE.AltitudeWorldState)
```

Use LOD to control which layers draw.

## high_cruise / zoom 7–10

Draw:

- island outlines
- harbor channels
- hero landmarks
- bridge context

Do not draw:

- small ferry slips
- small piers
- detailed waterfront blocks

## mid_climb / zoom 10–12.5

Draw:

- shoreline standard
- islands
- harbor channels
- ferry slips
- major piers
- landmarks
- bridge context

## low_climb / zoom 12.5–15

Draw:

- all shoreline
- all piers
- ferry slips
- islands
- waterfront blocks
- harbor channels
- landmarks

## ground / zoom 15–18

Draw:

- all layers
- strongest piers/ferry slips
- strongest waterfront blocks
- hero landmark points

Labels remain off unless debug mode explicitly asks for them.

---

# 4. Altitude Response

Renderer must read:

```js
SBE.AltitudeWorldState
```

Use these values when available:

```js
band
maritimeOpacity
aerialHaze
horizonLift
```

## Required behavior

### Ground

- geometry opacity strongest
- ferry slips and piers visible
- channels subdued

### Low climb

- shoreline and piers still strong
- channels become more visible
- waterfront blocks slightly fade

### Mid climb

- channels and islands emphasized
- small piers/ferry slips fade slightly
- bridge context visible

### High cruise

- channels, islands, landmarks, and bridge corridors remain
- local pier detail fades

---

# 5. Style Multipliers

Final opacity should be computed from:

```text
layer preset opacity
× LOD opacity
× altitude multiplier
× sector focus multiplier
× global opacity
```

Expose global opacity:

```js
SBE.HarborGeometryRuntimeRenderer.setOpacity(value)
```

Default:

```js
0.85
```

---

# 6. Debug API

## File

```text
wall/systems/presentation/harborGeometryRuntimeDebug.js
```

Bind:

```js
_wos.debug.harborGeometryRuntime
```

Required commands:

```js
enabled(bool)
opacity(value)
preset(id)
state()
layers()
audit()
```

Optional but useful:

```js
focus()
lod()
```

## Expected usage

```js
_wos.debug.harborGeometryRuntime.enabled(true)
_wos.debug.harborGeometryRuntime.preset('cinematic')
_wos.debug.harborGeometryRuntime.opacity(0.9)
_wos.debug.harborGeometryRuntime.audit()
```

---

# 7. Renderer API

Expose:

```js
SBE.HarborGeometryRuntimeRenderer = Object.freeze({
  VERSION,
  init,
  setEnabled,
  isEnabled,
  setOpacity,
  getOpacity,
  getState,
  getCanvas,
});
```

State should include:

```js
{
  enabled,
  opacity,
  preset,
  sectorFocus,
  activeLOD,
  drawnFeatureCount,
  skippedFeatureCount,
  visibleLayers,
  lastRenderMs
}
```

---

# 8. Feature Rendering Rules

## LineString

Used by:

- shoreline
- bridge_context
- harbor_channel

Draw as projected polyline.

## Polygon / MultiPolygon

Used by:

- island
- ferry_slip
- waterfront_block
- some pier shapes if upgraded later

Draw fill first, then stroke.

## Point

Used by:

- hero_landmark

Draw as small screen-space marker.

Marker should scale gently with zoom:

```text
zoom 7–10: 3px
zoom 10–13: 4px
zoom 13+: 5px
```

No labels by default.

---

# 9. Performance Requirements

Renderer must:

- cache projected feature paths per camera frame when possible
- avoid allocating huge arrays inside every feature draw
- skip offscreen features if projected bounds are outside canvas
- skip layer entirely if opacity resolves below `0.01`
- use one RAF loop
- clear canvas when disabled or sector focus below threshold

No geometry simplification in renderer.

---

# 10. Success Criteria

Build is successful when:

1. Harbor geometry appears without debug flags.
2. The harbor is visually richer at normal runtime.
3. Channels, piers, islands, landmarks, and shoreline are readable but not noisy.
4. Toggling presets visibly changes the harbor layer.
5. Altitude band changes alter geometry emphasis.
6. Renderer disappears when outside harbor sector focus.
7. Debug overlay remains separate and optional.
8. No WaterMemory/wake regression.
9. Mapbox style remains visible underneath.
10. Runtime stays smooth during pitch/zoom.

---

# 11. Validation Commands

After implementation:

```js
_wos.debug.harborGeometry.state()
_wos.debug.harborGeometryRuntime.enabled(true)
_wos.debug.harborGeometryRuntime.preset('cinematic')
_wos.debug.harborGeometryRuntime.opacity(0.85)
_wos.debug.harborGeometryRuntime.audit()
```

Compare presets:

```js
_wos.debug.harborGeometryRuntime.preset('minimal')
_wos.debug.harborGeometryRuntime.preset('cinematic')
_wos.debug.harborGeometryRuntime.preset('survey')
_wos.debug.harborGeometryRuntime.preset('night_signal')
```

Altitude response:

```js
_wos.debug.altitudeWorld.forceBand('ground')
_wos.debug.altitudeWorld.forceBand('mid')
_wos.debug.altitudeWorld.forceBand('high')
```

Return to live:

```js
_wos.debug.altitudeWorld.forceBand('auto')
```

---

# 12. Implementation Notes

Reuse projection helpers from `harborGeometryDebugRenderer.js`, but do not reuse its debug styles directly.

Runtime style must be softer and compositional.

Debug renderer proves geometry.
Runtime renderer sells the world.

---

# 13. Load Order

Update `index.html`:

Before `main.js`:

```html
<script src="./systems/presentation/harborGeometryRuntimeStyle.js"></script>
<script src="./render/harborGeometryRuntimeRenderer.js"></script>
```

After `main.js`:

```html
<script src="./systems/presentation/harborGeometryRuntimeDebug.js"></script>
```

Place runtime style/renderer after:

```html
<script src="./systems/geography/harborGeometryRegistry.js"></script>
```

and before:

```html
<script src="./main.js"></script>
```

---

# 14. Do Not Build Yet

Do not add:

- real-time OSM fetching
- new bake logic
- new geometry layers
- true mesh buildings
- satellite compositor
- ferry AI rewrite
- new maritime wake work

Those are separate future specs.

---

# Implementation Guide

- Put runtime style in `wall/systems/presentation/`, renderer in `wall/render/`, and debug binding in `wall/systems/presentation/`.
- Run the app, then verify with `_wos.debug.harborGeometryRuntime.audit()` and preset toggles.
- Expect baked harbor geometry to appear as a normal cinematic layer, not a debug overlay.
