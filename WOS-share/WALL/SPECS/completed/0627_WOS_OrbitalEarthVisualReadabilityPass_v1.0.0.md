# 0627_WOS_OrbitalEarthVisualReadabilityPass_v1.0.0

## Project

**Project:** WOS  
**Feature Layer:** Orbital Earth Mode  
**Document Type:** Visual QA / Tuning Spec  
**Version:** v1.0.0  
**Status:** Proposed  
**Primary Runtime Owner:** WOS  
**Connected Systems:** Mapbox Earth/Globe, Orbital Earth Mode, Broadcast HUD, Style Tokens, Audio Overlay Controller

---

## Purpose

Tune the current Mapbox-first Orbital Earth view for readability.

The architecture is now correct:

```text
WOS Map
→ Mapbox Orbital Earth
→ style-preserving overlays
→ Moon Mode gate
```

The remaining issue is visual legibility. Orbital Earth is now believable and continuous, but some scenes are too dark and may lose the cartographic trust that makes the mode valuable.

This pass should improve readability without changing the architecture.

---

## Current Status

### Working

- WOS boots to readable map.
- Orbital entry stays Mapbox-first.
- Three.js fake Earth sphere is not default.
- Style tokens drive overlays.
- Moon Mode is gated from Orbital Earth.
- Runtime cleanup is stable.

### Needs tuning

- Orbital Earth can become too dark.
- Map linework can disappear at distance.
- Earth rim is sometimes too subtle.
- Starfield / atmosphere may overpower the surface.
- Origin marker may be too hard to read or too ambiguous depending on scale.
- HUD remains readable, but the map surface can fall below useful legibility.

---

## Core Principle

Orbital Earth should feel cinematic but still clearly geographic.

The user must be able to read:

```text
This is Earth.
This is the same WOS map style.
This is still connected to real geography.
This is not an abstract background.
```

Darkness is acceptable. Losing geographic trust is not.

---

## Non-Negotiable Locks

Do not change these during this pass:

1. Orbital Earth remains Mapbox-first.
2. Three.js sphere modes remain manual-only.
3. Orbital overlays must inherit style tokens.
4. Cyan must not be hard-coded as universal identity.
5. Moon Mode remains gated from Orbital Earth.
6. No unlabeled celestial or signal objects.
7. No return to fake-sphere default behavior.

---

## Visual Readability Targets

### 1. Earth Surface Legibility

The Mapbox surface should remain visible enough to read as cartography.

Target:
- streets / coastlines / boundaries should be faint but readable
- map should not collapse into a black disk
- globe curvature should remain clear
- style identity should remain visible

Suggested tuning:
- increase map line opacity slightly
- reduce central dark haze
- preserve contrast between land/water/linework
- keep atmospheric effects behind readable geometry where possible

### 2. Atmosphere / Rim Glow

The rim should help identify the globe shape without becoming a portal glow.

Target:
- visible Earth edge
- restrained glow
- no reactor-like bloom
- color inherited from style tokens

Suggested tuning:
- increase rim opacity slightly
- lower glow radius if it creates a flat wash
- clamp bloom intensity
- keep edge glow narrower than previous portal orb

### 3. Starfield

The starfield should create space depth, not visual noise.

Target:
- sparse
- quiet
- background-only
- never confused with route dots, origin markers, or signal data

Suggested tuning:
- reduce star density
- lower star opacity
- avoid large bright star particles near Earth markers
- ensure particles have role: `star_particle`

### 4. Atmosphere Veil / Haze

The veil should sell orbital environment without dimming the map too far.

Target:
- atmospheric
- subtle
- does not obscure map linework
- lower opacity at center

Suggested tuning:
- reduce center haze opacity
- use radial fade that keeps surface readable
- do not apply full-screen dim filters after entry completes

### 5. Origin Marker

The origin marker should show the map anchor without reading as a moon.

Target:
- visible when needed
- clearly attached to the Earth/map
- not a floating sphere
- not a celestial object

Suggested tuning:
- use small flat dot/ring, not sphere
- reduce glow halo
- place in screen/map overlay layer if 3D placement causes confusion
- label only in debug mode or on hover later

### 6. Route Context

If a destination exists, route context should eventually remain readable but not dominate.

Current pass:
- ensure route arc/dots do not look like stars or moon objects
- keep route off unless route state is active
- preserve route role: `route_arc` or `destination_marker`

---

## Style Token Tuning

Visual readability should be token-driven.

Recommended token fields:

```js
{
  lineOpacity: 0.72,
  orbitalLineOpacity: 0.58,
  orbitalSurfaceBrightness: 0.42,
  orbitalAtmosphereOpacity: 0.28,
  orbitalRimOpacity: 0.36,
  orbitalRimRadius: 0.18,
  orbitalStarOpacity: 0.35,
  orbitalStarDensity: 0.45,
  orbitalHazeOpacity: 0.18,
  orbitalOriginOpacity: 0.80
}
```

These values are guidance, not final constants.

Important:
- Orbital values should derive from the active theme.
- A pink theme should create pink/rose orbital overlays.
- A gold theme should create gold orbital overlays.
- A monochrome theme should remain monochrome.

---

## Recommended Default Visual Range

Use restrained ranges for the first stable pass.

| Setting | Recommended Range | Notes |
|---|---:|---|
| Map line opacity | 0.45–0.70 | Must remain readable |
| Surface brightness | 0.35–0.55 | Avoid black disk |
| Atmosphere opacity | 0.15–0.35 | Should not wash map |
| Rim opacity | 0.25–0.45 | Clear edge, not portal |
| Star opacity | 0.15–0.40 | Quiet background |
| Star density | 0.20–0.55 | Avoid noise |
| Haze center opacity | 0.05–0.20 | Keep center readable |
| Origin marker opacity | 0.55–0.85 | Visible, not moon-like |

---

## FX Panel Additions

Add or expose these controls in the Orbital FX panel.

### Visual section

```text
Surface Brightness
Line Opacity
Atmosphere
Rim Glow
Haze
Stars
Origin Marker
Route Context
```

### Presets

Add visual tuning presets:

```text
Readable Orbit
Deep Orbit
Broadcast Orbit
Minimal Orbit
```

#### Readable Orbit

Purpose:
- default QA baseline
- stronger map line visibility
- restrained atmosphere

#### Deep Orbit

Purpose:
- darker cinematic view
- still readable
- lower line opacity and stronger stars

#### Broadcast Orbit

Purpose:
- HUD-friendly stream view
- slightly higher surface readability
- controlled rim and lower star noise

#### Minimal Orbit

Purpose:
- quiet background / static mode
- low overlays
- strong map continuity but minimal activity

---

## Required QA Tests

### Test 1 — Readable Earth

Steps:
```text
1. Enter Orbital from Flight.
2. Wait for transition complete.
3. Observe surface readability.
```

Expected:
```text
Earth is visible.
Map linework is readable.
The globe shape is clear.
It does not look like a black disk.
```

### Test 2 — Style Preservation

Steps:
```text
1. Use current cyan style.
2. Simulate pink/gold style tokens.
3. Enter Orbital for each token state.
```

Expected:
```text
Overlay colors follow token values.
No universal cyan override.
Readability remains acceptable in each style.
```

### Test 3 — Rim Without Portal

Steps:
```text
1. Enter Orbital.
2. Increase/decrease rim glow.
3. Compare against portal-orb look.
```

Expected:
```text
Rim clarifies Earth edge.
It does not become a reactor/portal wash.
```

### Test 4 — Starfield Discipline

Steps:
```text
1. Enter Orbital.
2. Observe stars near markers and route points.
3. Increase/decrease star density.
```

Expected:
```text
Stars remain background texture.
They do not read as signals, moons, or markers.
```

### Test 5 — Origin Marker

Steps:
```text
1. Pan to a known map location.
2. Enter Orbital.
3. Observe origin marker.
```

Expected:
```text
Marker is visible and attached to Earth.
Marker does not read as Moon.
Marker has `origin_marker` role.
```

### Test 6 — Return Cleanup

Steps:
```text
1. Enter Orbital.
2. Adjust readability controls.
3. Return to map.
4. Re-enter Orbital.
```

Expected:
```text
No stuck opacity or dim state.
Preset/state restore behavior is intentional.
Map returns readable.
Orbital remains Mapbox-first.
```

---

## Implementation Notes

### Preferred approach

Do not create new large systems unless necessary.

Patch existing files:

```text
wall/systems/orbital/OrbitalEarthMode.js
wall/systems/orbital/WosMapStyleTokens.js
wall/systems/orbital/OrbitalAudioOverlayController.js
wall/systems/orbital/OrbitalFxPanel.js
```

### Avoid

- changing runtime mode architecture
- reintroducing Three.js sphere as default
- hard-coding cyan
- increasing bloom globally
- masking map with a heavy overlay
- relying only on monitor-specific brightness

---

## Acceptance Criteria

This pass is complete when:

1. Orbital Earth remains Mapbox-first.
2. Earth surface remains visibly cartographic.
3. Map linework is readable at default Orbital distance.
4. Rim glow clarifies the Earth edge without becoming a portal.
5. Starfield is quiet and background-only.
6. Atmosphere/haze does not obscure the center of the globe.
7. Origin marker is readable but does not look like a Moon.
8. Visual settings are token-driven.
9. FX panel exposes key readability controls or presets.
10. Return to map clears visual dimming and overlay state.
11. No architecture regression occurs.

---

## Final Principle

Orbital Earth should be beautiful because it remains believable.

The visual system should support music, mood, and broadcast atmosphere while preserving geographic trust.

## Implementation Guide

- **Where:** Patch `OrbitalEarthMode.js`, `WosMapStyleTokens.js`, `OrbitalAudioOverlayController.js`, and `OrbitalFxPanel.js`.
- **What:** Tune surface brightness, line opacity, atmosphere, rim glow, haze, stars, and origin marker visibility using style-token-driven settings.
- **Expect:** Orbital Earth remains dark and cinematic while still clearly reading as the same WOS map-based Earth.
