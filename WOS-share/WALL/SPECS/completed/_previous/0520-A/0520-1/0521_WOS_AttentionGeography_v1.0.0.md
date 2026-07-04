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
# 0521_WOS_AttentionGeography_v1.0.0

## CONTINUITY STATE

Current architecture now includes:

- SurfaceStateManager
    
- Surface Presence
    
- WorldDriftManager
    
- PassengerMode
    
- Passenger Frame State
    
- ViewportAuthority arbitration
    
- Drift-coupled camera inertia
    
- Silence windows
    
- Atmospheric persistence
    
- Warm-state traversal continuity
    

PassengerMode is now functioning as:

- latent observational infrastructure
    
- persistent environmental consciousness
    
- cinematic traversal interpretation
    

The next architectural layer is:

```txt
Attention Geography
```

---

# 🎯 PURPOSE

Attention Geography defines how environments naturally attract, hold, and release observational focus.

This system governs:

- environmental significance
    
- cinematic attraction
    
- observational gravity
    
- scenic persistence
    
- infrastructural emotional weighting
    

Attention Geography is not:

- quest markers
    
- scripted POIs
    
- gameplay objectives
    
- mission systems
    

Attention Geography exists to determine:

```txt
what kinds of places psychologically deserve attention
```

---

# 🧠 CORE PRINCIPLES

- Observation is probabilistic
    
- Geography possesses emotional inertia
    
- Attention emerges from atmosphere
    
- Significance accumulates over time
    
- Stillness can attract focus
    
- Scale influences emotional response
    
- Environmental memory matters
    
- Infrastructure carries emotional weight
    
- Attention should feel discovered, not assigned
    

---

# 🌎 ATTENTION PHILOSOPHY

The system should behave like:

- noticing distant industrial glow
    
- staring at a bridge too long
    
- lingering on rain reflections
    
- slowing near train crossings
    
- observing skyline transitions
    
- watching weather approach
    
- becoming absorbed by repetition
    

The system should NOT behave like:

- minimap markers
    
- collectible discovery
    
- objective indicators
    
- game trigger volumes
    

Attention Geography is atmospheric psychology.

---

# 🏗️ ARCHITECTURE

```txt
World Geography
        ↓
Atmosphere Layer
        ↓
World Drift
        ↓
Attention Geography
        ↓
Passenger Attention System
        ↓
Camera Framing / Linger
```

---

# 📦 ATTENTION FIELD MODEL

```js
type AttentionField = {
  id: string

  type:
    | "bridge"
    | "coastline"
    | "industrial"
    | "weather"
    | "rail"
    | "tunnel"
    | "overlook"
    | "gas-station"
    | "district-transition"
    | "neon-density"
    | "silence-zone"
    | "infrastructure"

  position: {
    lng: number
    lat: number
  }

  radius: number

  weight: number

  emotionalBias: {
    loneliness: number
    tension: number
    warmth: number
    exhaustion: number
    mystery: number
  }

  atmosphericBias: {
    rainAffinity: number
    nightAffinity: number
    fogAffinity: number
    silenceAffinity: number
  }

  cinematicBias: {
    lingerMultiplier: number
    framingPriority: number
    stabilizationBias: number
  }

  persistence: {
    cooldownMs: number
    memoryWeight: number
    revisitResistance: number
  }
}
```

---

# 🎥 ATTENTION BEHAVIOR

Attention Geography influences:

- camera linger
    
- framing stability
    
- bearing persistence
    
- zoom softness
    
- drift amplification
    
- silence probability
    
- transition pacing
    

The system should subtly bias:

- observation
    
- pacing
    
- emotional rhythm
    

without ever feeling deterministic.

---

# 🧭 ATTENTION CATEGORIES

## 1. Infrastructure Attention

Examples:

- bridges
    
- overpasses
    
- tunnels
    
- rail yards
    
- ports
    
- transmission towers
    

Behavior:

- longer observational holds
    
- lower camera responsiveness
    
- stronger environmental scale
    
- increased atmospheric inertia
    

Core references:

- Koyaanisqatsi
    
- Blade Runner 2049
    

---

## 2. Transitional Attention

Examples:

- borough boundaries
    
- skyline reveals
    
- district transitions
    
- highway exits
    
- coastline emergence
    

Behavior:

- anticipation framing
    
- increased lead distance
    
- horizon fixation
    
- reduced interruption frequency
    

Core references:

- Paris, Texas
    
- Nomadland
    

---

## 3. Weather Attention

Examples:

- fog banks
    
- rainfall fronts
    
- snow corridors
    
- low-light cloud movement
    

Behavior:

- silence amplification
    
- softened stabilization
    
- reduced visual aggression
    
- hypnotic pacing
    

Core references:

- Stalker
    
- Blade Runner 2049
    

---

## 4. Human Residue Attention

Examples:

- gas stations
    
- rest stops
    
- diners
    
- parking lots
    
- late-night storefronts
    
- isolated signage
    

Behavior:

- emotional warmth
    
- observational pause
    
- intimacy increase
    
- fatigue reduction
    

Core references:

- Locke
    
- Paris, Texas
    

---

# 🌫️ OBSERVATIONAL GRAVITY

Attention fields exert:

- soft attraction
    
- not forced control
    

PassengerMode should:

- drift toward significance
    
- settle naturally
    
- occasionally resist leaving
    

The camera should appear:

- curious
    
- contemplative
    
- observational
    

not:

- automated
    
- robotic
    
- gameplay-directed
    

---

# 🧠 MEMORY & FAMILIARITY

Attention Geography should support future familiarity systems.

Repeated exposure may:

- reduce novelty
    
- increase comfort
    
- increase exhaustion
    
- create route attachment
    
- generate emotional association
    

Example:

```js
field.persistence.revisitResistance += 0.2
```

Meaning:

- the same bridge slowly loses novelty
    
- but gains emotional familiarity
    

Very important distinction.

---

# 🔇 SILENCE ZONES

Certain locations amplify silence probability.

Examples:

- industrial waterfronts
    
- empty highways
    
- tunnels
    
- distant rail corridors
    
- fog regions
    

Effects:

- reduced attention switching
    
- stabilized framing
    
- lower transition frequency
    
- increased drift persistence
    

Silence zones are infrastructural breathing spaces.

---

# 🌃 NIGHT ATTENTION

Night environments may:

- amplify neon density
    
- increase reflection attraction
    
- extend linger duration
    
- soften framing responsiveness
    
- reduce attention volatility
    

Night should feel:

- psychologically adhesive
    
- immersive
    
- persistent
    

not merely darker.

---

# 🚗 PASSENGER MODE INTEGRATION

PassengerMode consumes Attention Geography.

Passenger systems may:

- bias bearing toward fields
    
- extend observer pauses
    
- soften movement
    
- stabilize horizon framing
    
- increase scenic persistence
    

PassengerMode never receives:

- explicit destinations
    
- scripted cinematic sequences
    
- authored cutscenes
    

Attention remains emergent.

---

# ⚙️ ATTENTION WEIGHTING

Final attention significance should combine:

```js
finalWeight =
  field.weight *
  atmosphereAffinity *
  driftAffinity *
  memoryModifier *
  silenceModifier *
  cinematicBias
```

This allows:

- weather
    
- time
    
- drift
    
- familiarity
    
- emotional pacing
    

to alter significance dynamically.

---

# 🧪 VALIDATION CHECKLIST

-  Attention feels observational rather than scripted
    
-  Camera naturally lingers on significant spaces
    
-  Weather influences attention behavior
    
-  Silence zones feel psychologically distinct
    
-  Repeated traversal changes perception
    
-  Night environments feel adhesive
    
-  Infrastructure carries emotional scale
    
-  Attention transitions feel soft and human
    
-  No gameplay-marker behavior emerges
    

---

# 🚫 NON-GOALS

Attention Geography is not:

- objective systems
    
- navigation guidance
    
- procedural missions
    
- POI discovery mechanics
    
- achievement infrastructure
    

The system should never:

- force user attention
    
- interrupt atmospheric continuity
    
- gamify observation
    

---

# 🔜 FUTURE EXTENSIONS

- district emotional profiles
    
- scenic memory accumulation
    
- fatigue-aware traversal
    
- observational storytelling
    
- environmental nostalgia
    
- weather-memory persistence
    
- infrastructure documentary mode
    
- passenger familiarity systems
    
- transit-line emotional identities
    
- autonomous cinematic routing
    

---

# 💬 NOTES

Attention Geography is the beginning of:

```txt
cinematic cartography
```

The world no longer exists merely as:

- geometry
    
- traversal
    
- simulation
    

The world now begins carrying:

- emotional significance
    
- observational gravity
    
- infrastructural atmosphere
    

Movement through geography becomes:

- psychological
    
- cinematic
    
- persistent
    

Core references:

- Stalker
    
- Paris, Texas
    
- Blade Runner 2049
    
- Koyaanisqatsi
    
- Locke
    
- Nomadland
```

---
# Refinement 

---
# Development

```

```