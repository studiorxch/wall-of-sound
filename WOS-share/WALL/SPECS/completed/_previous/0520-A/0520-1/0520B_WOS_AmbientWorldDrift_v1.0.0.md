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
Questions it answers:

- Is this world active?
- Calm?
- Dense?
- Broadcasting?
- Occupied?
- Sleeping?
- Storming?

## Ambient World Drift

Represents:

```
passage of time
```

Questions it answers:

- Is dawn approaching?
- Is weather changing?
- Is traffic thickening?
- Is music evolving?
- Is tension increasing?
- Is the district cooling down?


---
# Spec
```
# 0520B_WOS_AmbientWorldDrift_v1.0.0

## Goal

Introduce the first canonical long-duration environmental drift system for WOS.

This system does **not** create spectacle.

It creates:

- passage of time
- persistent atmosphere
- emotional continuity
- autonomous environmental evolution

The world should feel alive even when untouched.

This is the first layer of:

```
persistent broadcast reality
```

---

# Core Philosophy

Ambient World Drift should feel:

```
noticed after 20 minutes
```

NOT:

```
noticed after 2 seconds
```

Avoid:

- hard transitions
- obvious loops
- reactive chaos
- visible state switching
- excessive animation

Prefer:

- migration
- easing
- atmospheric accumulation
- imperceptibly slow change
- continuous interpolation

---

# SYSTEM

## Create

```
systems/world/worldDriftManager.js
```

Canonical namespace:

```
SBE.WorldDriftManager
```

---

# RESPONSIBILITIES

WorldDriftManager controls:

```
{  hourDrift,  ambientIntensity,  soundtrackEnergy,  pulseMultiplier,  colorTemperature}
```

These values evolve continuously over time.

The manager does NOT:

- render UI directly
- touch DOM directly
- create particles
- mutate map styles directly

It only emits:

```
world:driftChanged
```

---

# DRIFT MODEL

## Canonical Drift State

```
const driftState = {  hour: 18.25,  ambientIntensity: 0.42,  soundtrackEnergy: 0.35,  pulseMultiplier: 1.0,  colorTemperature: 0.58,  lastUpdate: performance.now()};
```

Expose:

```
SBE.WorldDriftManager.getState()
```

---

# TIME MODEL

## Autonomous Clock

Create slow-running world clock:

```
hour += deltaSeconds * speed
```

Default:

```
speed = 0.0035
```

Meaning:

- roughly 1 full day every ~80–90 minutes
- enough for observable drift
- slow enough to feel environmental

---

# DRIFT CURVES

CRITICAL:  
Use curves.  
Never hard-switch.

---

## Helper

```
function smoothstep(min, max, v)
```

and:

```
function lerp(a, b, t)
```

---

# AMBIENT INTENSITY

Controls:

- world glow
- atmosphere visibility
- reflectance strength
- fog presence

Curve:

```
day     = 0.25golden  = 0.55night   = 0.85deepNight = 1.0
```

Smooth interpolation only.

---

# SOUNDTRACK ENERGY

Very subtle.

Controls future:

- music density
- traffic density
- environmental activity

Range:

```
0.18 → 0.72
```

Behavior:

- lowest around 3–5am
- rises through morning
- peaks during evening
- gently tapers at night

No sudden jumps.

---

# PULSE MULTIPLIER

Feeds directly into:

```
SurfacePresenceManager
```

Example:

```
pulseMultiplier = lerp(0.82, 1.18, ambientIntensity)
```

Meaning:

- sleepy worlds breathe slower
- energetic worlds breathe slightly stronger

Subtle only.

---

# COLOR TEMPERATURE

Controls global emotional tone.

Range:

```
0.0 = cold blue0.5 = neutral1.0 = warm amber
```

Curve:

- sunrise → warm
- daylight → neutral
- golden hour → rich warm
- night → cool blue

This becomes future input for:

- atmosphere compositor
- map tint
- OBS overlays
- shaders
- UI accents

---

# UPDATE LOOP

## RAF Loop

Target:

```
~4fps equivalent
```

Do NOT run expensive logic every frame.

Recommended:

```
if (now - lastTick < 250) return;
```

Drift should evolve slowly.

---

# EVENT EMISSION

Emit ONLY when values materially change.

Threshold:

```
Math.abs(a - b) > 0.002
```

Event:

```
eventBus.emit("world:driftChanged", {  state: driftState});
```

---

# SURFACE PRESENCE COUPLING

Integrate with:

```
SBE.SurfacePresenceManager
```

Add:

```
pulseStrength *= driftState.pulseMultiplier
```

Result:

- night surfaces breathe differently
- golden hour feels warmer
- storms feel heavier

WITHOUT new animation systems.

---

# TELEMETRY HUD INTEGRATION

Append subtle drift indicators:

Examples:

```
Golden HourDeep NightCold MorningRain DriftStill Dawn
```

Do NOT expose raw numbers.

This is environmental language.

---

# MAP COUPLING (VERY LIGHT)

Only allow:

## Existing systems to read drift values

DO NOT:

- directly recolor Mapbox styles
- hard-switch themes
- reload styles dynamically

Future systems may consume:

```
ambientIntensitycolorTemperature
```

---

# FUTURE HOOKS (NOT IMPLEMENTED)

Reserved:

```
districtDriftseasonalDrifttrafficDriftbroadcastDriftrouteMoodDriftsubwayFrequencyDriftecologyDrift
```

Architecture must remain extensible.

---

# CSS VARIABLES

Expose globally:

```
--ws-drift-ambient--ws-drift-energy--ws-drift-pulse--ws-drift-temperature
```

These are future-facing.

Do NOT aggressively use them yet.

---

# PERFORMANCE RULES

STRICT:

- no shaders
- no blur spam
- no particle fields
- no expensive per-frame map queries
- no DOM churn
- no interval storms

Everything should:

- lerp
- cache
- drift slowly
- remain compositor-safe

---

# VISUAL TARGET

The correct outcome is:

```
"I think the world changed..."
```

NOT:

```
"Oh, an animation started."
```

---

# SUCCESS CONDITION

The app should feel alive while:

- idle
- paused
- sitting on a second monitor
- streaming for hours
- unattended

Without needing:

- interaction
- gameplay
- spectacle

---

# FILES

## New

```
systems/world/worldDriftManager.js
```

---

## Update

```
systems/world/surfacePresenceManager.js
```

Add drift multiplier support.

---

## Update

```
render/worldTelemetryHUD.js
```

Add environmental drift labels.

---

## Update

```
wall/main.js
```

Initialize:

```
SBE.WorldDriftManager.init();
```

AFTER:

```
SurfacePresenceManager.init()
```

---

# IMPLEMENTATION GUIDE

- Create `systems/world/worldDriftManager.js`
- Wire drift outputs into SurfacePresence + Telemetry HUD
- Expect ultra-slow environmental evolution over long runtime sessions
```

---
# Refinement 

### The Current Stack (Very Strong)

Mapbox
    ↓
Geographic substrate

WorldAtmosphere
    ↓
Environmental interpretation

WorldDriftManager
    ↓
Temporal emotional modulation

SurfacePresenceManager
    ↓
Broadcast-state synthesis

WorldTelemetryHUD
    ↓
Environmental instrumentation

Viewport / Camera
    ↓
Passenger consciousness

This is an actual cinematic architecture now.

---
# Development

```

```