---
Generated: 
System: WOS  
Domain:  
Component: 
Version: 1.0.0
Summary:
Description:
Tags:
Status:
---
# Discovery

---
# Spec
```
# 0520B_WOS_AtmosphericResponseLayer_v1.0.0

## Goal

Extend the new atmospheric substrate so the world begins reacting like a living geographic organism rather than a flat visual overlay.

This spec introduces:

1. Road Reflectance / Wetness
2. Atmospheric Drift
3. Localized Lighting Pockets

The implementation must remain:

- lightweight
- subtle
- cinematic
- map-readable
- performance-safe

No particles.  
No volumetric simulation.  
No “weather game FX.”

WOS atmosphere should feel:

```
observednot rendered
```

---

# Core Philosophy

The map is no longer a background.

The geographic substrate itself is becoming:

- emotional
- musical
- environmental
- reactive

Roads are now treated as:

```
conductive pathways
```

not merely navigation graphics.

Atmosphere should:

- interact with geometry
- drift slowly
- breathe
- imply life

without becoming visually noisy.

---

# Architectural Direction

## Existing Stack

```
Mapbox Base→ AtmosphereComposite→ WOS Engine Canvas→ HUD/UI
```

This remains correct.

New systems extend:

```
render/atmosphereComposite.js
```

No additional canvas layers.

All effects remain composited inside the existing atmosphere renderer.

---

# 1. Road Reflectance / Wetness

## Purpose

Roads should visually react to:

- rain
- humidity
- fog
- night
- storms

This is NOT literal puddles.

This is:

```
cinematic surface response
```

---

# Visual Behavior

## Wet Conditions

When:

```
rainIntensity > 0.15ORfogDensity > 0.35
```

roads receive:

- soft luminance increase
- cool-toned reflective bloom
- slightly sharper contrast

---

# Important

Roads ONLY.

Never apply globally.

Buildings and land remain muted.

This creates:

```
urban conductive veins
```

---

# Rendering Strategy

## Mapbox Road Layer Extraction

Use Mapbox style querying:

- identify road vector layers
- render lightweight overlay response

OR

Fallback:

- sample high-luminance linear structures
- apply soft-screen reflective pass

---

# Visual Rules

## Day

Very subtle.  
Mostly invisible.

Max:

```
3–4% luminance boost
```

---

## Night

More visible.

Roads:

- softly glow
- carry atmospheric color
- react to wetness

Max:

```
8–12% luminance boost
```

---

# Color Rules

## Clear Night

Cool cyan-grey.

```
rgba(120,160,220)
```

---

## Rain

Blue-grey.

```
rgba(90,120,180)
```

---

## Fog

Desaturated silver-blue.

```
rgba(140,150,165)
```

---

# DO NOT

- neon roads
- synthwave glow
- Tron visuals
- bloom explosions
- emissive highways

Keep grounded realism.

---

# 2. Atmospheric Drift

## Purpose

The world must subtly:

```
breathe
```

not:

```
animate
```

The user should FEEL movement before consciously noticing it.

---

# Behavior

Very slow atmospheric motion across the viewport:

- fog density drift
- cloud shadow migration
- ambient tint oscillation
- haze movement

---

# Motion Rules

## Speed

Extremely slow.

Target:

```
40–120 second cycles
```

Nothing faster.

---

# Drift Directions

Never fully linear.

Use:

- layered sine offsets
- phase-separated movement
- soft turbulence

---

# Movement Scale

Tiny.

Maximum displacement:

```
3–8% viewport drift
```

---

# Important

The map itself never moves.

Only atmosphere layers drift.

The effect should resemble:

- distant weather
- moving air pressure
- slow environmental breathing

---

# DO NOT

- visible scrolling textures
- looping obvious patterns
- clouds moving like videogames
- weather wallpaper motion

---

# 3. Localized Lighting Pockets

## Purpose

Cities are emotionally uneven.

Different districts should subtly imply:

- warmth
- density
- nightlife
- emptiness
- industrial coldness

without explicit simulation.

---

# Concept

Introduce:

```
ambient emotional geography
```

Localized lighting pockets softly influence regions.

Examples:

- downtown warmth
- nightlife glow
- industrial cold zones
- park darkness
- suburban dimness

---

# Rendering Strategy

Generate:

- large radial gradients
- extremely low opacity
- additive ambient modulation

---

# Initial Placement Rules

Use geographic heuristics:

## Dense Urban Areas

- warmer
- brighter
- amber/cyan mixed

## Parks / Water

- darker
- cooler
- softer contrast

## Industrial

- sodium vapor warmth
- slight haze density increase

---

# Initial Data Source

Use:

- Mapbox density
- road intersection density
- POI concentration

No external GIS ingestion yet.

---

# Opacity Rules

Very restrained.

Maximum:

```
0.04–0.08 opacity
```

These should be:

```
feltnot seen
```

---

# Dynamic Time Interaction

Lighting pockets react to:

- local time
- weather
- moon brightness

---

# Example

## Midnight + Rain

Downtown:

- warmer roads
- slightly glowing intersections
- cooler surrounding darkness

---

## Fog + Dawn

Parks:

- low contrast
- cold desaturation
- reduced ambient pockets

---

# Atmosphere State Expansion

Extend:

```
WorldAtmosphere.getState()
```

Add:

```
{  roadWetness: Number,  driftPhase: Number,  driftIntensity: Number,  ambientZones: [],  urbanDensity: Number,  atmosphereBrightness: Number}
```

---

# New Runtime

Create:

```
systems/world/worldLightingModel.js
```

Responsibilities:

- compute emotional lighting state
- derive ambient pockets
- compute road reflectance strength
- expose stable environmental values

---

# Performance Requirements

Must maintain:

```
60fps target
```

---

# Hard Limits

## No:

- particle systems
- blur spam
- heavy post-processing
- multiple canvas composites
- framebuffer chains
- WebGL dependency

Canvas2D only.

---

# UX Goal

The user should eventually feel:

```
Every place on Earth has its own musical atmosphere.
```

without needing explicit explanation.

---

# Visual Reference Direction

Closest references:

- late-night traffic reflections
- surveillance photography
- Blade Runner subtlety (NOT spectacle)
- Tokyo rain asphalt
- NYC sodium vapor glow
- Nordic fog highways
- ambient train window reflections

---

# Future Hooks (NOT IMPLEMENTED)

Future systems may consume atmosphere:

## Audio

- BPM probability
- harmonic brightness
- percussion density
- reverb width

## Ecology

- pedestrian density
- traffic aggression
- nightlife emergence

## Behavioral Systems

- event likelihood
- crowd clustering
- mood transitions

Do not implement yet.

Only prepare clean architecture hooks.

---

# Acceptance Criteria

## Required

- Roads subtly react to wetness/night
- Atmosphere slowly drifts
- Cities contain localized emotional lighting
- No visual clutter
- No gameplay-style weather FX
- Maintains map readability
- Maintains performance
- Works globally across all destinations

---

# Implementation Guide

- Create `systems/world/worldLightingModel.js`
- Extend `render/atmosphereComposite.js`
- Wire atmosphere updates through `WorldAtmosphere.getState()` and VLA location updates
```

---
# Refinement 

---
# Development

```

```