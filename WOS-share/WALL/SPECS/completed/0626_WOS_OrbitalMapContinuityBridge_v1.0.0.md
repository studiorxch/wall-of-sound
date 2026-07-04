---
date: 2026-06-26
project: WOS
title: Orbital Map Continuity Bridge
version: v1.0.0
status: implementation spec
runtime_owner: WOS
connected_system: PLAY
feature_layer: Map / Orbital transition
---

# 0626_WOS_OrbitalMapContinuityBridge_v1.0.0

## Purpose

Fix the conceptual and visual disconnect between the WOS map view and Orbital Mode.

Orbital Mode must not introduce a separate unrelated planet object. It must read as the same WOS map/world continuing upward into planetary scale.

The current issue is that Flight/Drive/Walk/Bike/Transit all begin from a real map location, while Orbital immediately swaps into a separate cyan sphere/preset with no location continuity, no map texture continuity, and no visible relationship to the active map.

## Core Rule

Orbital is not a new planet.

Orbital is the WOS map viewed from higher altitude.

```text
Map view
→ high-altitude map
→ curved horizon
→ orbital globe
```

The user should feel they are leaving the current location and rising into orbit, not entering a separate visualizer.

---

## Current Problem

### Working

- WOS now boots into a readable map.
- Flight is selected on startup.
- Map tiles and cyan street network are visible.
- Diagonal artifact issue is resolved.
- Orbital has a fallback chain and no longer owns startup.

### Not Working

- Orbital still enters as an unrelated sphere object.
- The blue reactor / portal orb still appears too dominant.
- Map geography and orbital geography are visually disconnected.
- Orbital does not inherit starting location, bearing, pitch, or active route context.
- The transition feels like a mode swap rather than a travel sequence.

---

## Required Product Model

### Flight / Drive / Walk / Bike / Transit

These are ground or near-ground traversal modes.

They begin from:

- current location
- selected route
- map camera
- destination input
- transport state

### Orbital

Orbital is a high-altitude continuation of the same world.

It must begin from:

- current map center
- current destination if available
- current route if available
- current map bearing
- current transport context
- active WOS map style

Orbital may later add stylized overlays, but its first readable state must still be recognizably connected to the map.

---

## Correct Transition Grammar

### Bad Current Grammar

```text
Map
→ black fade
→ unrelated blue sphere
```

### Required Grammar

```text
Map
→ lift from current location
→ zoom out
→ street grid compresses
→ regional map appears
→ Earth curvature appears
→ same map becomes orbital globe
→ orbital HUD activates
```

The transition can be stylized, but it must preserve continuity.

---

## Architecture Correction

### WOS Runtime Ownership

WOS owns:

- map
- camera
- world coordinates
- transport modes
- orbital renderer
- transition bridge
- broadcast HUD

PLAY may provide:

- track state
- playlist state
- energy curve
- visual control signals
- playback timing

PLAY must not own or define the world/planet identity.

---

## Required Implementation

## 1. Add Orbital Context Capture

Create:

```text
wall/systems/orbital/OrbitalMapContext.js
```

Purpose:

Capture the current map state before entering Orbital.

Expected API:

```js
window.SBE.OrbitalMapContext = {
  capture(map, transportState) {},
  getLastContext() {},
  clear() {}
};
```

Captured fields:

```js
{
  centerLngLat: { lng, lat },
  zoom,
  bearing,
  pitch,
  altitudeEstimate,
  selectedTransport,
  fromLabel,
  toLabel,
  routeActive,
  routeGeometry,
  mapStyleId,
  capturedAt
}
```

Rules:

- Capture immediately before Orbital transition begins.
- If map center is unavailable, fallback to WOS default city center.
- Do not block Orbital on missing route.
- Do block Orbital if map object is unavailable.

---

## 2. Add Map-Derived Orbital Anchor

Orbital must create an anchor point from the captured map center.

Expected behavior:

- Convert `centerLngLat` to a globe marker location.
- Orient the initial globe camera so the captured region faces the viewer.
- Preserve rough bearing where possible.
- Show a subtle origin marker on the globe.
- If destination exists, show a destination marker.
- If route geometry exists, create a route arc or route trace later.

Required API in `OrbitalModeController.js`:

```js
enterFromMapContext(context)
```

This should replace generic `enter()` for transport-triggered entry.

---

## 3. Replace Default Orbital Object

The default Orbital preset must use map-derived Earth styling.

### New default preset

```text
map_continuity_orbit
```

Visual traits:

- dark Earth surface
- cyan map linework / coastlines / street-network abstraction
- restrained atmosphere
- low glow
- no blue portal bloom
- no reactor texture
- no aggressive pixel halo
- camera starts with active map region facing viewer

`deep_space_listen` can remain a music-listening preset, but the entry preset should be `map_continuity_orbit`.

### Preset hierarchy

```text
map_continuity_orbit      default entry from map
deep_space_listen         ambient orbital music mode
signal_earth              data/signal mode
particle_planet           audio-reactive experimental
archive_orb               artifact mode
portal_orb                experimental-only, manual
minimal_dark_sphere       emergency fallback only
```

---

## 4. Build a Real Travel Bridge

Update:

```text
wall/systems/runtime/WosModeTransitionController.js
```

Replace black fade with staged camera/visual continuity.

### Map → Orbital sequence

```text
0ms    capture map context
0ms    lock transport controls
100ms  begin map lift: pitch/zoom/bearing animation if Mapbox camera available
300ms  dim labels and HUD secondary elements
500ms  street grid compress / atmosphere veil appears
750ms  orbital canvas fades in behind map
900ms  globe receives captured map context
1100ms map fades out only after orbital globe is positioned
1300ms orbital HUD + FX become active
```

### Return sequence

```text
0ms    capture orbital anchor
150ms  dim orbital atmosphere
350ms  reveal map behind orbital
650ms  restore map camera to previous context
900ms  hide orbital canvas
1000ms restore Flight transport state
```

---

## 5. Add Visual Continuity Constraints

Orbital entry must satisfy these:

- The first Orbital frame must not be `portal_orb`.
- The first Orbital frame must show a recognizable Earth/map-derived surface.
- The initial region should correspond to the current map center.
- The globe should not begin as a generic centered abstract object.
- The FX panel may allow manual preset changes after entry.
- Manual preset changes must not rewrite the default entry preset.

---

## 6. Add Debug Readout

Add a small diagnostic line in the FX panel or console:

```text
ENTRY: map_continuity_orbit
ANCHOR: -73.9857, 40.7484
FROM: Current location
TO: Los Angeles
SOURCE: WOS map context
FALLBACK: none
```

This makes it obvious whether Orbital is map-derived or generic fallback.

---

## Acceptance Criteria

1. WOS boots into a readable map with Flight selected.
2. Clicking Orbital captures the current map center before transition.
3. Orbital entry uses `enterFromMapContext(context)`.
4. The default Orbital view is `map_continuity_orbit`, not `portal_orb`.
5. The globe is oriented around the captured map center.
6. The transition feels like rising from the active map, not swapping scenes.
7. Returning to map restores the previous map state.
8. The FX panel can manually select `portal_orb`, but Orbital auto-entry never uses it.
9. The fallback chain still works if `map_continuity_orbit` fails.
10. PLAY remains scoped to playback/playlist control, not world ownership.

---

## Non-Goals

Do not implement these yet:

- full 3D geospatial globe tiling
- accurate Mapbox raster projection onto sphere
- interactive wall drawing
- subway wall mode
- advanced audio analysis
- route arc rendering beyond a simple origin/destination marker
- new PLAY identity work

---

## Implementation Guide

- **Where:** Add `wall/systems/orbital/OrbitalMapContext.js`; update `wall/systems/orbital/OrbitalModeController.js`, `wall/systems/orbital/OrbitalPresetRegistry.js`, and `wall/systems/runtime/WosModeTransitionController.js`.
- **What:** Capture map camera/location state before Orbital entry, pass it into `enterFromMapContext(context)`, make `map_continuity_orbit` the default entry preset, orient the globe around the captured map center, and keep `portal_orb` manual-only.
- **Expect:** Orbital feels like the same WOS map/world viewed from space, with a continuous lift from the active map instead of a hard swap into an unrelated blue sphere.
