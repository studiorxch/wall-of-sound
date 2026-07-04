# 🚦 SPEC STAGE

Stage: **[BUILD]**  
Freeze Decision: **GO**  
Action: Build the first visible cloud / atmosphere layer for aircraft-aware world traversal.

# 0528C_WOS_CloudAtmosphereLayer_v1.0.0_BUILD

## Purpose

Create a visible, altitude-aware cloud atmosphere layer that makes flight feel spatially embedded in the WOS world.

This pass must deliver **visible world impact**, not hidden atmospheric doctrine.

The cloud layer exists to support:

- aircraft flying through atmospheric bands
- altitude-aware visibility changes
- map/world depth during flight
- future weather presets
- future cloud shadows over water, buildings, and airports

Core rule:

```text
Clouds are spatial atmosphere, not a fullscreen filter.
```

---

# Build Target

Create:

```text
SBE.CloudAtmosphereLayer
SBE.CloudAtmosphereRenderer
_wos.debug.clouds
```

The system must render animated cloud sheets over the Mapbox world and respond to altitude world state.

---

# Authority Boundaries

## Owns

- cloud sheet visual state
- cloud layer render profile
- cloud opacity by altitude band
- cloud drift animation
- cloud shadow projection
- cloud debug controls

## Reads

- `SBE.AltitudeWorldState`
- `SBE.AircraftRuntime.getActiveAircraft()`
- `SBE.MapboxViewportRuntime.getCamera()`
- canvas size / map projection

## Writes

- cloud canvas pixels only
- optional `SBE.CloudAtmosphereState` read-only public snapshot

## Must Not Mutate

- AircraftRuntime state
- AISRuntime state
- Mapbox style URL
- Mapbox layer definitions
- AtmosphereRuntime baseline truth
- Maritime renderer state

---

# Required Files

```text
wall/systems/presentation/cloudAtmosphereLayer.js
wall/render/cloudAtmosphereRenderer.js
wall/systems/presentation/cloudAtmosphereDebug.js
```

Load order:

```html
<script src="./systems/presentation/cloudAtmosphereLayer.js"></script>
<script src="./render/cloudAtmosphereRenderer.js"></script>
```

Place before `main.js`, after `altitudeAwareWorldRenderer.js`.

Debug companion after `main.js`:

```html
<script src="./systems/presentation/cloudAtmosphereDebug.js"></script>
```

---

# Visual Requirements

## 1. Cloud Sheets

Render 2–4 large soft cloud sheets as procedural canvas layers.

Clouds should appear as:

- broad translucent masses
- soft-edged atmospheric bands
- slow drifting shapes
- uneven opacity fields
- altitude-aware coverage

Do **not** use tiny particle noise as the main cloud language.

Clouds should feel like:

```text
weather volume above geography
```

not:

```text
fog pasted on the screen
```

---

## 2. Altitude Band Response

Cloud intensity must respond to `SBE.AltitudeWorldState.band`.

Recommended baseline:

| Band | Cloud Behavior |
|---|---|
| `ground` | mostly invisible, faint haze only |
| `low_climb` | visible low cloud bands near horizon |
| `mid_climb` | strongest cloud traversal feeling |
| `high_cruise` | broad thin cloud fields / distant sheeting |

Cloud layer should make band switching visibly different with:

```js
_wos.debug.altitudeWorld.forceBand("ground")
_wos.debug.altitudeWorld.forceBand("mid")
_wos.debug.altitudeWorld.forceBand("high")
```

---

## 3. Aircraft Relationship

Cloud layer must support a lead-aircraft-relative mode.

Minimum behavior:

- cloud density increases around active aircraft influence radius
- cloud field drifts slowly relative to camera
- aircraft icons remain readable above cloud layer
- influence glow should still be visible through clouds

Z-order target:

```text
Mapbox map
Altitude world overlay
Cloud shadows / low cloud haze
Airspace influence field
Aircraft icons
HUD
```

Cloud renderer should use its own canvas at z-index **7.4–7.7**, below aircraft canvas z-index 8.

---

## 4. Cloud Shadows

Add optional cloud shadow pass over the map.

Requirements:

- very low opacity
- broad soft patches
- stronger over water than land if simple distinction is available
- no hard edges
- disabled by default if performance is poor

Acceptable first version:

```text
large semi-transparent multiply blobs drifting below cloud highlights
```

---

## 5. Presets

Implement at least four visible presets:

```js
clear
thin
harbor_fog
storm_shelf
```

Preset behavior:

| Preset | Visual Intent |
|---|---|
| `clear` | almost no clouds; subtle blue haze only |
| `thin` | light aerial streaks, good default |
| `harbor_fog` | low soft bands, reduced contrast near horizon |
| `storm_shelf` | darker cloud mass, stronger shadow, stronger atmosphere |

Debug command:

```js
_wos.debug.clouds.preset("thin")
_wos.debug.clouds.preset("harbor_fog")
_wos.debug.clouds.preset("storm_shelf")
_wos.debug.clouds.preset("clear")
```

---

# Data Model

```js
type CloudAtmosphereProfile = {
  preset: 'clear' | 'thin' | 'harbor_fog' | 'storm_shelf',
  altitudeBand: 'ground' | 'low_climb' | 'mid_climb' | 'high_cruise',
  cloudOpacity: number,
  shadowOpacity: number,
  horizonOpacity: number,
  driftSpeedPxPerSec: number,
  scale: number,
  contrast: number,
  warmth: number,
}
```

```js
type CloudSheet = {
  id: string,
  seed: number,
  x: number,
  y: number,
  width: number,
  height: number,
  driftX: number,
  driftY: number,
  opacity: number,
  softness: number,
}
```

```js
type CloudAtmosphereState = {
  enabled: boolean,
  preset: string,
  altitudeBand: string,
  activeSheetCount: number,
  cloudOpacity: number,
  shadowOpacity: number,
  lastRenderMs: number,
}
```

---

# Core API

## `SBE.CloudAtmosphereLayer`

```js
SBE.CloudAtmosphereLayer = {
  VERSION,
  setEnabled(enabled),
  isEnabled(),
  setPreset(presetId),
  getPreset(),
  getProfile(),
  getSheets(),
  setDensity(multiplier),
  setSpeed(multiplier),
  setShadows(enabled),
  getState(),
}
```

## `SBE.CloudAtmosphereRenderer`

```js
SBE.CloudAtmosphereRenderer = {
  VERSION,
  init(),
  render(ctx),
  setEnabled(enabled),
  getCanvas(),
}
```

## `_wos.debug.clouds`

```js
_wos.debug.clouds.enabled(true | false)
_wos.debug.clouds.preset("clear" | "thin" | "harbor_fog" | "storm_shelf")
_wos.debug.clouds.density(0.0 - 3.0)
_wos.debug.clouds.speed(0.0 - 4.0)
_wos.debug.clouds.shadows(true | false)
_wos.debug.clouds.profile()
_wos.debug.clouds.audit()
```

---

# Rendering Rules

## Cloud Drawing

Use canvas gradients and deterministic seeded blobs.

Preferred implementation:

- generate each sheet from 8–16 overlapping ellipses
- use radial gradients per blob
- blend with `screen` or `source-over` for bright cloud layers
- use `multiply` for shadow blobs
- animate by drift offsets

No external images required.

---

## Performance Rules

Cloud renderer must remain lightweight.

Requirements:

- reuse generated cloud sheet data
- no per-frame random regeneration
- no heavy noise textures unless cached
- no WebGL requirement for v1.0.0
- target stable 60fps at 1280×720

---

# Integration Requirements

## Altitude World Integration

Read:

```js
SBE.AltitudeWorldState.band
SBE.AltitudeWorldState.aerialHaze
SBE.AltitudeWorldState.horizonLift
SBE.AltitudeWorldState.influenceFieldOpacity
```

Use these to modify:

- cloud opacity
- horizon density
- cloud scale
- shadow opacity

Do not mutate `SBE.AltitudeWorldState`.

---

## Aircraft Integration

Read lead aircraft from:

```js
SBE.AircraftRuntime.getActiveAircraft()
```

Use lead aircraft only for passive visual bias:

- mild density around aircraft projected location
- optional cloud gap / bloom around plane
- no route mutation
- no camera control

---

# Validation Checklist

- [ ] Clouds visibly appear when preset is `thin`, `harbor_fog`, or `storm_shelf`
- [ ] `clear` preset nearly removes clouds
- [ ] Altitude band changes visibly affect cloud opacity / horizon density
- [ ] Aircraft remain visible above clouds
- [ ] Influence glow remains visible under/through clouds
- [ ] Cloud shadows can be toggled independently
- [ ] Renderer uses its own canvas and does not mutate Mapbox style
- [ ] No WaterMemory, wake, or maritime system is re-enabled
- [ ] `_wos.debug.clouds.audit()` confirms renderer, layer, preset, band, sheet count

---

# Success Gate

This spec passes only if a screenshot clearly shows at least three distinct cloud states:

```text
clear → thin → storm_shelf
```

And altitude switching creates a visible difference:

```text
ground → mid → high
```

The world should feel more aerial immediately.

---

# Non-Goals

This build does **not** implement:

- real weather API integration
- volumetric 3D clouds
- rain particles
- lightning
- storm simulation
- cloud collision with aircraft
- live METAR ingestion
- shader-based weather
- satellite cloud imagery

---

# Implementation Guide

- Add the three files under `wall/systems/presentation/` and `wall/render/`, then wire them into `index.html` at the specified load points.
- Build procedural cloud sheets first, then altitude/preset modulation, then debug controls.
- Verify with `_wos.debug.clouds.preset()` and `_wos.debug.altitudeWorld.forceBand()` screenshots.
