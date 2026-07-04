# 0626_PLAY_OrbitalMode_EarthViewUpgrade_v1.0.0

## Purpose

Define a visual and technical direction for improving the current WOS Earth/orbital view into a dedicated **Orbital Mode** for music playback, broadcast visuals, and audio-reactive planetary displays.

## Current Problem

The current Earth view is useful as a scale transition, but it does not yet feel intentional enough for WOS/PLAY broadcast use.

Primary issues:

- Lighting is too flat and harsh.
- Earth material reads like a default map globe instead of a designed object.
- The atmosphere glow is doing most of the work.
- The HUD feels disconnected from the planet surface.
- The view does not yet express music, signal, routing, or broadcast identity.
- The transition from city/map scale to orbital scale is not yet treated as a mode change.

## Core Recommendation

Create a dedicated **Orbital Mode** rather than treating the globe as a zoomed-out map state.

Orbital Mode should be a separate visual state with its own lighting, materials, audio-reactive overlays, camera behavior, and HUD composition.

```text
Map Mode
  ↓ zoom out / altitude climb
Atmosphere Bridge
  ↓ globe lock
Orbital Mode
  ↓ audio-reactive signal layer
Planetary Broadcast View
```

## Visual Direction

### 1. Replace Default Earth Lighting

Use a more cinematic three-light model:

- **Key light:** low-angle sun/rim light from one side.
- **Fill light:** very soft blue ambient light to keep shadow detail visible.
- **Back/rim light:** glow along the planet edge.

Avoid full frontal lighting. The sphere needs a dark side, a terminator line, and atmosphere depth.

### 2. Add a Proper Atmosphere Shell

Use a second transparent sphere slightly larger than the Earth mesh.

Suggested layers:

- Earth surface mesh
- cloud/noise layer
- atmosphere shell
- outer glow shader
- starfield/background plane
- HUD/signal layer

The atmosphere should not just be a CSS glow. It should feel volumetric and move slightly.

### 3. Use Designed Three.js Textures

Orbital Mode should support interchangeable texture modes:

| Texture Mode | Use Case |
|---|---|
| `surface_map` | Standard geographic Earth view |
| `dark_terrain` | Night broadcast / WOS identity |
| `signal_grid` | Music-reactive data layer |
| `particle_earth` | Abstract audio mode |
| `stone_orb` | Archive / artifact mode |
| `wireframe_globe` | Debug / routing / transit mode |

The attached references suggest that the strongest direction is not photorealism. It is a designed planetary object: part terrain, part signal sculpture, part broadcast interface.

### 4. Add Audio-Reactive Planet Layers

Orbital Mode becomes valuable when the music affects the planet.

Suggested audio inputs:

- bass = surface pulse / continent glow
- kick = atmosphere expansion
- mids = city-light shimmer
- highs = star particles / data sparks
- energy curve = camera distance and orbital speed
- stereo width = horizontal signal spread

Suggested visual outputs:

- pulsing route arcs
- glowing cities
- particle halo
- scan rings
- waveform bands around the equator
- orbital debris/signal points
- data lines connecting regions

### 5. Add a Planet HUD, Not a Map HUD

The current HUD can remain, but Orbital Mode needs a different hierarchy.

Recommended Orbital HUD blocks:

```text
MODE: ORBITAL
SOURCE: WOS LOCAL / ROUTES LIVE
SIGNAL: MUSIC / WEATHER / NEWS / ROUTE / ARCHIVE
ALTITUDE: ORBITAL
AUDIO: TRACK / ENERGY / BPM / CURVE
TARGET: EARTH / NYC / ROUTE / PLAYLIST
```

The planet should have small labels, rings, coordinates, and measurement marks like a broadcast research display, not a normal map UI.

## Transition Model

### Phase 1 — Camera Climb

When the user enters Orbital Mode:

1. Hide bottom route controls or compress them.
2. Lock current lat/lon as the origin point.
3. Raise camera altitude smoothly.
4. Fade map labels/buildings out.
5. Fade atmosphere/starfield in.
6. Reveal planet-level HUD.

### Phase 2 — Globe Lock

Once high enough:

1. Switch from map camera to orbital camera.
2. Place Earth at center frame.
3. Keep origin point as a subtle marker.
4. Begin slow orbital rotation.
5. Enable audio-reactive overlays.

### Phase 3 — Broadcast State

Orbital Mode should be usable as a standalone music visualizer.

Controls:

- `Orbital`
- `Earth`
- `Signal`
- `Particle`
- `Route Arc`
- `Return to Map`

## Technical Architecture

### Recommended Files

```text
wall/
  js/
    orbital/
      OrbitalModeController.js
      OrbitalCameraRig.js
      OrbitalLightingRig.js
      EarthMaterialFactory.js
      AtmosphereLayer.js
      AudioReactivePlanetLayer.js
      OrbitalHudAdapter.js
      OrbitalTransitionController.js
```

### Data Layer

Create a small mode state object:

```ts
export type OrbitalModeState = {
  enabled: boolean;
  textureMode: 'surface_map' | 'dark_terrain' | 'signal_grid' | 'particle_earth' | 'stone_orb' | 'wireframe_globe';
  audioReactive: boolean;
  originLat: number;
  originLon: number;
  cameraDistance: number;
  rotationSpeed: number;
  signalIntensity: number;
};
```

### Logic Layer

Core responsibilities:

- switch between Map Mode and Orbital Mode
- manage camera transition
- create and dispose Earth/atmosphere meshes
- update lighting intensity by mode
- sample audio data
- map audio features to visual parameters
- route HUD data into orbital labels

### Interface Layer

UI should add one new top-level mode:

```text
Flight | Drive | Walk | Bike | Transit | Orbital
```

Orbital can also be triggered by altitude threshold or a dedicated button.

## MVP Build Scope

### MVP 1 — Make It Look Better

- Add Orbital Mode toggle.
- Replace lighting with cinematic directional + ambient + rim setup.
- Add atmosphere shell.
- Add dark terrain or signal-grid material.
- Add slow orbital rotation.
- Hide or compress route controls while in Orbital Mode.

### MVP 2 — Make It Musical

- Add Web Audio analyser input.
- Bass controls atmosphere pulse.
- High frequencies control star/spark particles.
- Energy controls city-light brightness.
- Add scan rings or equator waveform.

### MVP 3 — Make It WOS

- Add route arcs from NYC to destination.
- Add station/playlist labels.
- Add broadcast HUD layout.
- Add texture presets.
- Add return-to-map transition.

## Design Rules

- Do not chase photoreal Earth first.
- Treat the globe as a broadcast instrument.
- The dark side of the planet is necessary.
- Audio-reactive effects should be restrained, not screen-saver chaos.
- The camera should feel slow, heavy, and intentional.
- Orbital Mode should work even when no route is active.
- Orbital Mode should support playlists, not only navigation.

## Recommended First Implementation

Build the smallest impressive version first:

1. Add `Orbital` button.
2. Fade out current map UI clutter.
3. Switch to a Three.js Earth scene layer.
4. Use dark material + cyan contour/grid texture.
5. Add transparent atmosphere shell.
6. Add slow rotation.
7. Add bass-reactive glow pulse.
8. Add `Return to Map`.

## Acceptance Criteria

Orbital Mode is successful when:

- Earth no longer looks like a default flat-lit map globe.
- The planet has a clear light side, dark side, and atmosphere edge.
- The view can function as a music visual without active navigation.
- Audio produces subtle but visible movement.
- The user can transition from map scale to orbital scale and back.
- WOS HUD language remains intact but becomes planet-scale.

## Implementation Guide

- **Where:** Add new modules under `wall/js/orbital/`, then wire the mode button into the existing Broadcast HUD mode controls.
- **What:** Start with `OrbitalModeController.js`, `OrbitalLightingRig.js`, `AtmosphereLayer.js`, and `EarthMaterialFactory.js`; then add the audio-reactive layer after the visual state is stable.
- **Expect:** A dedicated Orbital Mode where the Earth has cinematic lighting, an atmosphere shell, slow rotation, and a restrained audio-reactive glow suitable for WOS music playback.
