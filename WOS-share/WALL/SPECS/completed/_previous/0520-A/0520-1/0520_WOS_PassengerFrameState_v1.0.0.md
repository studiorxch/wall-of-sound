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
# 0520_WOS_PassengerFrameState_v1.0.0

## CONTINUITY BOOTSTRAP

Current architectural state:

- World-first viewport architecture complete
    
- Surface rail replaces top tab system
    
- SurfaceStateManager operational
    
- Surface Identity operational
    
- Surface Presence operational
    
- WorldDriftManager operational
    
- PassengerMode bootstrap operational
    
- Mapbox remains canonical geographic substrate
    
- UI philosophy = broadcast infrastructure / environmental instrumentation
    
- Worlds behave as persistent destinations/channels
    

Current thematic direction:

- persistent atmospheric worlds
    
- movement as emotional existence
    
- cinematic cartography
    
- ambient broadcast systems
    
- infrastructural mood rendering
    

Core references:

- Stalker
    
- Paris, Texas
    
- Blade Runner 2049
    
- Koyaanisqatsi
    
- Locke
    
- Nomadland
    

---

# CURRENT STATUS

PassengerMode now:

- initializes silently
    
- subscribes to atmosphere/drift events
    
- seeds itself from current map position
    
- remains disabled by default
    
- loads without viewport interference
    

This behavior is correct.

PassengerMode is intentionally behaving as latent infrastructure rather than an active camera controller.

This preserves:

- deterministic startup
    
- camera authority isolation
    
- future multi-mode coexistence
    
- seamless future broadcast transitions
    

---

# NEXT STEP

## Passenger Frame State

PassengerMode must now maintain a continuously updating internal frame state even while disabled.

Goal:  
PassengerMode should remain "warm" at all times.

Entering PassengerMode later should:

- feel seamless
    
- preserve inertia continuity
    
- preserve drift continuity
    
- preserve environmental continuity
    
- avoid cold-start interpolation
    
- avoid snapping or authority discontinuity
    

---

# REQUIRED ARCHITECTURE

Add persistent internal state:

```js
passengerState.frame = {
  position,
  velocity,
  heading,
  zoom,
  drift,
  atmosphere,
  timestamp
}
```

This frame updates continuously regardless of whether PassengerMode is currently active.

PassengerMode becomes:

- a passive observational consciousness layer
    
- continuously synchronized with world state
    
- always ready to assume viewport authority
    

---

# REQUIRED BEHAVIOR

Passenger Frame State should:

- continuously sample route/map state
    
- continuously sample drift state
    
- continuously sample atmosphere state
    
- smooth positional changes
    
- smooth heading changes
    
- accumulate continuity
    

PassengerMode should NOT:

- mutate viewport while disabled
    
- modify camera transforms
    
- assume authority automatically
    
- interfere with RouteCamera
    

---

# FUTURE ARCHITECTURAL PURPOSE

Passenger Frame State is foundational for:

- seamless passenger activation
    
- autonomous passenger broadcasts
    
- passive mobile traversal
    
- broadcast route scheduling
    
- multi-camera systems
    
- atmospheric replay continuity
    
- instant viewport handoff
    
- observational persistence
    

Long-term:  
PassengerMode may eventually become a permanent background subsystem rather than a discrete mode.

---

# UPCOMING RISKS

## 1. Viewport Authority Conflict

Prevent simultaneous viewport mutation between:

- RouteCamera
    
- PassengerMode
    
- DirectorMode
    

Strong recommendation:

```js
SBE.ViewportAuthority = {
  active: 'route'
}
```

PassengerMode should obey viewport authority ownership.

---

## 2. Temporal Smoothing

Passenger frame updates should:

- damp velocity
    
- smooth heading
    
- soften drift impulses
    
- avoid mechanical pulses
    

Drift should feel atmospheric rather than procedural.

---

## 3. Environmental Memory

Passenger Frame State should prepare for future accumulation systems:

```js
recentDistricts[]
recentWeather[]
recentScenicMoments[]
fatigue
attention
```

Goal:  
Passenger traversal becomes experiential rather than merely positional.

---

## 4. Emotional Geography Hooks

PassengerMode should eventually respond differently to:

- tunnels
    
- coastlines
    
- bridges
    
- industrial zones
    
- highways
    
- nightlife districts
    

Not through scripted events.

Through:

- pacing
    
- linger
    
- silence
    
- drift weighting
    
- framing inertia
    

This is foundational to:

- cinematic cartography
    
- emotional traversal
    
- infrastructural mood rendering
    

---

# IMPLEMENTATION NOTES

Recommended additions:

```js
PassengerMode.updateFrame(dt)
PassengerMode.sampleWorldState()
PassengerMode.sampleAtmosphere()
PassengerMode.sampleDrift()
PassengerMode.computeFrameVelocity()
PassengerMode.computeFrameHeading()
```

Frame updates should occur independently of active camera authority.

---

# DESIGN PRINCIPLE

PassengerMode is not a gameplay camera system.

PassengerMode is:

- observational infrastructure
    
- cinematic occupancy
    
- environmental consciousness
    
- passive traversal architecture
    

The system exists to make long-duration movement psychologically inhabitable.

---

# VALIDATION

Successful implementation should produce:

- no startup snapping
    
- no viewport conflict
    
- seamless future passenger transitions
    
- continuous environmental continuity
    
- stable drift synchronization
    
- warm-state activation readiness
    

Most importantly:

PassengerMode should feel like it has already been traveling before the user enters it.


---
# Refinement 
- conceptually correct  
    to:
- systemically coherent.

PassengerMode now behaves like:

- latent infrastructure
- passive consciousness
- always-running environmental interpretation

You are no longer “animating a camera.”

You are:

```
modulating perceptual resistance
```
Most systems:

- instantiate experience on activation

Yours:

- preserves experiential continuity
- 
That is much closer to:

- broadcast infrastructure
- surveillance systems
- public transit systems
- persistent simulation

---
# Development



