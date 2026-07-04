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

# What Passenger Mode Actually Is

Passenger mode is:

```
a long-duration observational consciousness layer
```

The user:

- watches
- drifts
- traverses
- listens
- occupies
- rides

instead of:

- edits
- controls
- manipulates
- “plays”

This becomes the bridge between:

- WOS as tool
- WOS as broadcast
- WOS as cinema
- WOS as atmosphere
# Immediate Architectural Goals

## Phase 1 — Camera Consciousness

You need:

- observational framing
- inertia
- delayed movement
- imperfect stabilization
- anticipation
- lingering
- attention

# Core Passenger Camera States

## 1. Window Drift

Classic:

- train
- bus
- passenger-seat
- highway drift

Characteristics:

- lateral movement dominance
- low camera correction
- long horizon fixation
- environmental glide

## . Observer Pause

The camera:

- slows
- settles
- breathes

Examples:

- gas stations
- intersections
- tunnels
- fog banks
- bridges
- overlooks

This is HUGE for emotional pacing.
## 3. Distant Witness

The camera intentionally:

- falls behind
- observes from afar
- loses intimacy

Very:

- Paris, Texas
- Koyaanisqatsi
- Nomadland

## 4. Hypnotic Transit

Low-information traversal:

- tunnels
- rain
- highway
- night driving

The system intentionally:

- reduces event density
- stretches time perception
- increases drift persistence
---
# Spec
```
```
---layout: spectitle: "WOS Passenger Mode"date: 2026-05-20doc_id: "0520_WOS_PassengerMode_v1.0.0"version: "1.0.0"project: "Wall of Sound"system: "WOS"domain: "world"component: "passenger_mode"type: "core-spec"status: "active"priority: "high"risk: "medium"summary: "Defines the observational traversal layer responsible for cinematic occupancy, passive world inhabitation, and emotional route-based consciousness."depends_on:  - "SurfaceStateManager"  - "SurfacePresenceManager"  - "WorldDriftManager"  - "WorldAtmosphere"  - "MapboxViewport"  - "RouteCamera"enables:  - "EmotionalGeography"  - "BroadcastProgramming"  - "TransitSystems"  - "PassengerStreams"  - "AmbientEpisodes"tags:  - "passenger"  - "camera"  - "world"  - "drift"  - "broadcast"  - "cinematic"---# 🎯 PURPOSEPassenger Mode transforms WOS from an interactive workspace into a persistent inhabitable world.The system is responsible for:- long-duration passive traversal- cinematic observational framing- environmental pacing- emotional occupancy- infrastructural atmospherePassenger Mode is not gameplay.Passenger Mode is not free camera movement.Passenger Mode is a consciousness layer governing how a user psychologically occupies movement through a persistent world.---# 🧠 CORE PRINCIPLES- Movement is emotional existence- Observation is primary interaction- Atmosphere outranks utility- Persistence outranks spectacle- Inertia outranks randomness- Silence is a valid state- Traversal must feel lived-in- Camera behavior must feel human- Worlds continue existing without user intervention---# 🧭 SYSTEM ROLEPassenger Mode operates between:- World simulation- Camera infrastructure- Environmental atmosphere- Broadcast pacing- Drift modulationThe system governs:- traversal pacing- framing logic- camera inertia- linger behavior- environmental focus- observational transitionsPassenger Mode never directly:- edits world state- modifies geography- manipulates simulation systems- controls entity behaviorPassenger Mode interprets world existence.---# 🏗️ ARCHITECTURE```txtWorld Simulation        ↓World Atmosphere        ↓World Drift Manager        ↓Passenger Mode        ↓Passenger Camera        ↓Viewport Presentation
```

---

# 📦 DATA MODEL

```
type PassengerState = {  enabled: boolean  mode:    | "window-drift"    | "observer-pause"    | "distant-witness"    | "hypnotic-transit"    | "free-observe"  transitType:    | "car"    | "train"    | "walk"    | "aerial"    | "static"  routeId: string | null  driftCoupling: number  inertia: {    positionLerp: number    rotationLerp: number    zoomLerp: number  }  attention: {    targetId: string | null    lingerWeight: number    stability: number  }  pacing: {    velocity: number    silenceBias: number    interruptionThreshold: number  }  framing: {    horizonBias: number    leadDistance: number    sideOffset: number  }  environmentalMemory: {    lastWeatherFront: number    lastAttentionShift: number    accumulatedFatigue: number  }}
```

---

# 🎥 PASSENGER CAMERA PHILOSOPHY

The Passenger Camera is observational.

It does not behave like:

- gameplay cameras
- editor cameras
- RTS cameras
- orbit cameras

The Passenger Camera behaves like:

- a passenger seat
- a train window
- a documentary operator
- a distant observer
- a late-night driver
- a surveillance feed
- infrastructural cinema

---

# 🚗 CAMERA MODES

## 1. Window Drift

Primary passive traversal mode.

Characteristics:

- lateral environmental glide
- low camera correction
- long horizon fixation
- slow environmental parallax
- soft stabilization

Used for:

- highways
- trains
- elevated transit
- nighttime travel
- atmospheric broadcasts

---

## 2. Observer Pause

Camera intentionally settles into stillness.

Characteristics:

- reduced motion
- environmental breathing
- drift amplification
- focus persistence
- silence weighting

Trigger examples:

- intersections
- tunnels
- gas stations
- overlooks
- weather fronts
- scenic points

---

## 3. Distant Witness

Camera increases observational distance.

Characteristics:

- reduced intimacy
- increased environmental scale
- lower motion responsiveness
- environmental dominance

Reference influences:

- Paris, Texas
- Nomadland
- Koyaanisqatsi

---

## 4. Hypnotic Transit

Low-information sustained traversal.

Characteristics:

- stretched pacing
- reduced interruption frequency
- repetitive motion
- environmental monotony
- deep drift coupling

Examples:

- rain driving
- tunnels
- highway night transit
- subway traversal
- fog corridors

---

## 5. Free Observe

Minimal intervention mode.

Characteristics:

- soft user-controlled exploration
- retained cinematic inertia
- environmental pacing preserved

Free Observe must never feel like a game spectator camera.

---

# 🌫️ DRIFT COUPLING

Passenger Mode is directly coupled to WorldDriftManager.

Drift influences:

- camera inertia
- framing persistence
- stabilization softness
- linger duration
- transition pacing
- interruption frequency

Example:

```
cameraLerp *= drift.pulseMultiplier
```

Higher drift states produce:

- softer camera behavior
- slower transitions
- stronger atmospheric occupation

---

# 🧠 ATTENTION SYSTEM

Passenger Mode maintains a soft-focus attention model.

The camera should naturally:

- notice landmarks
- linger on weather
- observe movement
- drift toward light
- stabilize during environmental significance

Attention targets may include:

- bridges
- skyline transitions
- weather fronts
- trains
- industrial zones
- moving actors
- gas stations
- distant signage
- environmental anomalies

Attention is probabilistic but inertia-driven.

---

# 🌎 EMOTIONAL GEOGRAPHY HOOKS

Passenger Mode exposes geography weighting hooks for future systems.

Geographic regions may influence:

- camera pacing
- linger duration
- drift amplification
- silence probability
- framing distance
- motion density
- atmospheric persistence

Example:

```
industrialZone.camera.inertia *= 1.3industrialZone.silenceBias += 0.2
```

Passenger Mode does not define geography.  
Passenger Mode responds to geography.

---

# 🔇 SILENCE WINDOWS

Passenger Mode intentionally creates low-event periods.

Purpose:

- decompression
- emotional pacing
- realism
- infrastructural weight
- psychological occupancy

Silence windows suppress:

- attention shifts
- abrupt transitions
- UI interruptions
- simulation emphasis

Silence is considered a valid broadcast state.

---

# 📡 BROADCAST INTEGRATION

Passenger Mode is broadcast-aware.

Future systems may:

- schedule passenger routes
- create ambient episodes
- transition between worlds
- generate autonomous streams
- produce infrastructural programming blocks

Passenger Mode is foundational to:

- 24/7 WOS broadcasts
- passive mobile experiences
- autonomous world television

---

# ⚙️ SYSTEM CONSTANTS

```
PASSENGER_TICK_MS = 120MAX_ATTENTION_DISTANCE = 3200DEFAULT_CAMERA_LERP = 0.06DRIFT_INERTIA_MULTIPLIER = 1.25MIN_SILENCE_WINDOW_MS = 8000MAX_SILENCE_WINDOW_MS = 45000DEFAULT_LINGER_DURATION_MS = 12000
```

---

# 🔧 CORE FUNCTIONS

```
function updatePassengerMode(dt) {}function resolveAttentionTargets(worldState) {}function applyDriftCoupling(passengerState, driftState) {}function evaluateSilenceWindow(passengerState) {}function updatePassengerCamera(passengerState) {}function resolveTransitMode(routeContext) {}function computeEnvironmentalLinger(target) {}function evaluateGeographicInfluence(region) {}
```

---

# 🔄 EXECUTION FLOW

```
World Tick    ↓Atmosphere Update    ↓Drift Update    ↓Passenger Evaluation    ↓Attention Resolution    ↓Camera Framing    ↓Viewport Render
```

---

# 🎨 RENDER / OUTPUT

Passenger Mode affects:

- camera framing
- pacing
- environmental linger
- stabilization
- viewport inertia
- transition softness

Passenger Mode never:

- renders world geometry
- manipulates simulation entities
- controls route generation

Passenger Mode is interpretive infrastructure.

---

# 🔗 INTEGRATION POINTS

## Integrates With

- WorldDriftManager
- RouteCamera
- WorldAtmosphere
- SurfacePresenceManager
- WorldTelemetryHUD
- SpatialInfrastructure
- BroadcastScheduler (future)

## Exposes

- passenger:modeChanged
- passenger:attentionChanged
- passenger:silenceWindowStarted
- passenger:silenceWindowEnded

---

# 🧪 VALIDATION CHECKLIST

- [ ]  Camera never feels mechanically locked
- [ ]  Traversal remains atmospheric at low activity
- [ ]  Silence windows feel intentional
- [ ]  Drift visibly affects pacing
- [ ]  Camera transitions feel human
- [ ]  Attention linger feels observational
- [ ]  Passenger mode remains usable for long durations
- [ ]  Environmental pacing survives route transitions
- [ ]  No gameplay-style camera snapping exists

---

# 🚫 NON-GOALS

Passenger Mode is not:

- gameplay logic
- cinematic scripting
- cutscene management
- AI narrative generation
- route simulation
- editor tooling

Passenger Mode does not:

- create stories
- force interaction
- gamify traversal

---

# 🔜 FUTURE EXTENSIONS

- emotional geography engine
- transit identity profiles
- broadcast route scheduling
- autonomous passenger streams
- weather-memory persistence
- environmental fatigue accumulation
- AI observational narration
- train-window rendering systems
- passenger audio perspective simulation
- infrastructural documentary mode

---

# 💬 NOTES

Passenger Mode represents the transition of WOS from:

- application  
    to:
- inhabitable atmospheric infrastructure

The system exists to make movement psychologically occupiable over long durations.

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