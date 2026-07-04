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
# 0520I_WOS_OverlayRuntime_v1.1.0

## CHANGELOG v1.1.0

### Added

- Soft Upscaling Doctrine
    
- Feedback Attenuation Doctrine
    
- Snapshot-Safe Overlay Context Doctrine
    
- Overlay Blend Validation Doctrine
    
- Temporal Overlay Cadence Doctrine
    
- linear upscale filtering requirements
    
- feedback decay stabilization
    
- deterministic overlay snapshot contracts
    
- validated blend mode constraints
    
- independent overlay cadence scheduling
    

### Refined

- overlay rendering continuity
    
- atmospheric persistence behavior
    
- low-resolution rendering semantics
    
- temporal overlay stability
    
- analog signal accumulation handling
    
- performance budgeting strategy
    

### Clarified

- overlays as environmental perception infrastructure
    
- overlays as world-state interpretation
    
- deterministic rendering boundaries
    
- cinematic atmospheric continuity goals
    

---

# PURPOSE

OverlayRuntime establishes:

```txt
cinematic environmental perception infrastructure
```

for the WOS persistent broadcast world.

OverlayRuntime is responsible for:

- atmospheric overlays
    
- infrastructural visualization
    
- environmental perception shaping
    
- cinematic signal interpretation
    
- broadcast aesthetic continuity
    
- spatial mood rendering
    

OverlayRuntime exists to ensure:

```txt
the world reveals itself visually
through environmental state
```

rather than:

```txt
graphics pasted over simulation
```

---

# DOCTRINE COMPLIANCE

This system must comply with:

- 0522_WOS_SurfaceChannelDoctrine_v1.1.0
    
- WOS_Naming_Doctrine_v1
    
- 0520F_WOS_GridRuntime_v1.1.0
    
- 0520H_WOS_AtmosphereRuntime_v1.1.0
    
- 0520D_WOS_MinimalTransitionRuntime_v1.1.1
    

Particular attention:

- overlays remain atmospheric
    
- continuity outranks spectacle
    
- visual systems remain grounded
    
- overlays consume snapshots
    
- spatial blending remains continuous
    
- environmental subtlety remains prioritized
    

---

# CORE PHILOSOPHY

OverlayRuntime is NOT:

```txt
post-processing decoration
```

OverlayRuntime IS:

```txt
environmental perception infrastructure
```

Meaning:

- overlays emerge from world state
    
- atmosphere drives visual interpretation
    
- infrastructure expresses pressure visually
    
- environmental continuity shapes rendering
    
- the city visually breathes
    

The audience should perceive:

- atmosphere
    
- pressure
    
- silence
    
- density
    
- infrastructural mood
    
- cinematic continuity
    

WITHOUT consciously noticing:

```txt
visual effects layers
```

---

# CANONICAL RESPONSIBILITY SEPARATION

```txt
BroadcastScheduler owns intent
SurfaceRegistry owns identity
TransitionRuntime owns continuity
SubwayTopologyRuntime owns infrastructural pulse
AtmosphereRuntime owns environmental state
GridRuntime owns spatial field resolution
OverlayRuntime owns environmental perception rendering
```

Maintain strict separation.

---

# CORE RESPONSIBILITIES

OverlayRuntime manages:

- atmospheric haze
    
- infrastructural visualization
    
- broadcast instability rendering
    
- cinematic environmental grading
    
- visual pressure interpretation
    
- analog signal perception
    
- atmospheric persistence rendering
    
- environmental overlay blending
    

OverlayRuntime does NOT:

- own simulation
    
- mutate fields
    
- mutate atmosphere
    
- own gameplay
    
- own UI
    
- own editor overlays
    
- directly control cameras
    
- directly control soundtrack systems
    

---

# MVP API

```js
SBE.OverlayRuntime = {
  init(),

  update(),

  render(),

  addLayer(),

  removeLayer(),

  enable(),

  disable(),

  resize(),

  getLayer(),
}
```

---

# OVERLAY STACK ARCHITECTURE

OverlayRuntime operates as:

```txt
layered environmental interpretation
```

Canonical stack:

```js
OverlayStack = [
  atmosphereLayer,
  infrastructureLayer,
  broadcastLayer,
  emotionalLayer,
];
```

Each layer:

- updates independently
    
- renders independently
    
- blends independently
    
- may throttle independently
    

---

# OVERLAY LAYER CONTRACT

Every overlay layer MUST implement:

```js
{
  id: string,

  enabled: boolean,

  update(dt, context),

  render(ctx, viewport),

  sample(x, y),

  resize(width, height),

  destroy(),
}
```

Layers MUST remain:

```txt
deterministic and side-effect free
```

---

# SNAPSHOT-SAFE OVERLAY CONTEXT DOCTRINE

Overlay layers MUST consume:

```txt
frozen runtime snapshots
```

NOT:

- mutable simulation objects
    
- write buffers
    
- mid-tick runtime state
    

Example:

```js
{
  gridSnapshot,
  atmosphereSnapshot,
  directorSnapshot,
  transitionSnapshot,
}
```

This guarantees:

- deterministic rendering
    
- frame-safe interpretation
    
- race-free overlay sampling
    
- temporal continuity stability
    

---

# SPATIAL SAMPLING DOCTRINE

OverlayRuntime MUST use:

```js
grid.sampleInterpolated(x, y)
```

NEVER:

```js
grid.cells[y][x]
```

This preserves:

- cinematic continuity
    
- atmospheric smoothness
    
- non-visible lattice blending
    
- environmental realism
    

---

# OVERLAY CATEGORIES

---

# 1. Atmospheric Overlays

Examples:

- haze
    
- humidity diffusion
    
- chromatic softness
    
- environmental glow
    
- fog shaping
    

Driven by:

```js
field.humidity
field.cinematicWeight
field.weatherExposure
field.fogIsolation
```

---

# 2. Infrastructure Overlays

Examples:

- transit pulse
    
- corridor energy
    
- station resonance
    
- network pressure
    
- infrastructural bleed
    

Driven by:

```js
field.transitPressure
field.infrastructureDensity
field.populationDensity
```

---

# 3. Broadcast Overlays

Examples:

- scanline drift
    
- analog instability
    
- signal wobble
    
- CRT softness
    
- compression residue
    

Driven by:

```js
DirectorRuntime.mode
camera.velocity
broadcastIntensity
```

---

# 4. Emotional Overlays

Examples:

- melancholy haze
    
- isolation fade
    
- nostalgic warmth
    
- dream softness
    
- nighttime loneliness
    

Driven by:

```js
TimeOfDay
WeatherState
RouteMood
SoundtrackEnergy
```

---

# SOFT UPSCALING DOCTRINE

Overlay buffers MUST upscale using:

```txt
linear filtered interpolation
```

Canvas2D:

```js
ctx.imageSmoothingEnabled = true;
```

Future WebGL:

```js
gl.LINEAR
```

for:

- magnification
    
- minification
    

This guarantees:

- atmospheric softness
    
- cinematic haze continuity
    
- analog visual blending
    

WITHOUT:

```txt
blocky upscale artifacts
```

---

# OVERLAY RESOLUTION STRATEGY

OverlayRuntime renders at:

```txt
reduced internal resolution
```

Example:

```txt
1920×1080 viewport
→ 480×270 overlay buffer
```

Benefits:

- atmospheric softness
    
- stable performance
    
- cinematic texture
    
- environmental blending
    

---

# DOUBLE BUFFER ARCHITECTURE

OverlayRuntime maintains:

- frontBuffer
    
- backBuffer
    

This enables:

- analog persistence
    
- motion residue
    
- atmospheric accumulation
    
- signal drift continuity
    

---

# FEEDBACK ATTENUATION DOCTRINE

Double-buffer feedback rendering MUST:

```txt
continuously decay historical accumulation
```

Recommended:

```js
feedbackAlpha <= 0.92
```

during:

- persistence rendering
    
- analog ghosting
    
- signal feedback
    
- motion accumulation
    

This guarantees:

- bounded persistence
    
- gradual atmospheric dissolution
    
- analog continuity
    

WITHOUT:

```txt
runaway brightness accumulation
```

---

# OVERLAY BLEND VALIDATION DOCTRINE

OverlayRuntime supports ONLY:

|WOS Blend Profile|Rendering Equivalent|Primary Use|
|---|---|---|
|normal|source-over|base atmospheric overlays|
|screen|screen|CRT bloom / haze|
|additive|lighter|transit pulse / energy|
|multiply|multiply|darkness / isolation|

OverlayRuntime MUST reject:

- hard-light
    
- difference
    
- exclusion
    
- unsupported blend modes
    

during:

```js
addLayer()
```

validation.

This preserves:

```txt
grounded cinematic realism
```

WITHOUT:

```txt
synthetic post-processing aesthetics
```

---

# TEMPORAL OVERLAY CADENCE DOCTRINE

Overlay layers may operate at:

```txt
independent temporal cadences
```

Examples:

- Signal Drift Layer → 60Hz
    
- Transit Pulse Layer → 30Hz
    
- Cinematic Haze Layer → 15Hz
    
- Isolation Fade Layer → 10Hz
    

Slow-moving atmospheric layers SHOULD:

- cache buffers
    
- reuse previous samples
    
- avoid unnecessary recomputation
    

This preserves:

- render stability
    
- low CPU overhead
    
- deterministic pacing
    
- atmospheric continuity
    

WITHOUT:

```txt
wasted full-frame atmospheric recomputation
```

---

# INITIAL OVERLAY SET

---

## Transit Pulse Layer

Visualizes:

```txt
city circulation pressure
```

Behavior:

- corridor pulses
    
- station resonance
    
- subtle infrastructural movement
    

Driven by:

```js
field.transitPressure
```

---

## Cinematic Haze Layer

Visualizes:

```txt
urban atmospheric softness
```

Behavior:

- fog diffusion
    
- density gradients
    
- glow shaping
    

Driven by:

```js
field.cinematicWeight
field.weatherExposure
```

---

## Signal Drift Layer

Visualizes:

```txt
broadcast instability
```

Behavior:

- analog wobble
    
- scanline drift
    
- transmission instability
    

Driven by:

```js
broadcastIntensity
camera.velocity
```

---

## Isolation Fade Layer

Visualizes:

```txt
urban loneliness
```

Behavior:

- desaturation
    
- soft darkness
    
- ambient quieting
    

Driven by:

```js
field.isolation
```

---

# RENDER ORDER

OverlayRuntime renders AFTER:

```txt
world geometry
actors
particles
```

But BEFORE:

```txt
UI
HUD
editor controls
```

Pipeline:

```txt
World
→ Actors
→ Particles
→ OverlayRuntime
→ UI/HUD
```

---

# DEBUG VISIBILITY DOCTRINE

OverlayRuntime MAY expose:

- field heatmaps
    
- pressure overlays
    
- sampling diagnostics
    
- overlay boundaries
    

ONLY:

```txt
in development tooling
```

Production presentation should remain:

```txt
cinematic and atmospheric
```

NOT:

```txt
visibly FX-driven
```

---

# PERFORMANCE BUDGET

Target:

```txt
< 2ms/frame
```

Hard maximum:

```txt
4ms/frame
```

Optimization strategies:

- low-resolution buffers
    
- temporal throttling
    
- cached atmospheric fields
    
- sparse resampling
    
- cadence scheduling
    

---

# FILE STRUCTURE

```txt
/render/
    overlayRuntime.js

    overlays/
        transitPulseLayer.js
        cinematicHazeLayer.js
        signalDriftLayer.js
        isolationFadeLayer.js
```

---

# FUTURE OVERLAY SYSTEMS

Future overlays may include:

- subway vibration fields
    
- emergency broadcasts
    
- nightlife density
    
- rain accumulation
    
- thermal zones
    
- surveillance cones
    
- district corruption
    
- neon humidity bloom
    
- biological overlays
    
- memory residue trails
    

---

# SUCCESS CONDITIONS

OverlayRuntime succeeds when:

- overlays feel atmospheric
    
- infrastructure visually breathes
    
- transitions remain continuous
    
- environmental state feels visible
    
- atmospheric visuals remain subtle
    
- overlays remain deterministic
    
- visual continuity persists
    
- the city expresses emotional state visually
    

Most importantly:

```txt
the audience perceives atmosphere
rather than noticing effects
```

That principle is foundational to WOS overlay architecture.

---

# RELATIONSHIP TO WOS

OverlayRuntime is the first major runtime that allows:

```txt
the city to emotionally express itself visually
```

This moves WOS from:

```txt
rendered simulation
```

toward:

```txt
cinematic environmental broadcasting
```

---

# FOLLOW-UP SPECS

Next expected runtime layers:

- 0520J_WOS_SoundtrackRuntime_v1.0.0
    
- 0520K_WOS_DirectorRuntime_v1.0.0
    
- 0520L_WOS_ActorRuntime_v1.0.0
    

OverlayRuntime establishes:

```txt
deterministic cinematic environmental perception infrastructure
```

for the WOS persistent broadcast world.
```

---
# Review/ Refinement 

---
# Development

```

```