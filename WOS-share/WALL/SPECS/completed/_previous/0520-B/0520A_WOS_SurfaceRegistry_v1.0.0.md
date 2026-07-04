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
# 0520A_WOS_SurfaceRegistry_v1.0.0

## PURPOSE

SurfaceRegistry formalizes Surfaces as first-class runtime entities inside WOS.

This system transforms:

- Surfaces from conceptual identities  
    into:
    
- operational broadcast infrastructure
    

SurfaceRegistry becomes the foundational orchestration spine for:

- Surface activation
    
- Channel runtime state
    
- continuity negotiation
    
- scheduling hooks
    
- transition orchestration
    
- broadcast identity management
    

This is NOT:

- rendering infrastructure
    
- overlay rendering
    
- atmosphere simulation
    
- camera implementation
    

SurfaceRegistry is:

```txt
runtime identity orchestration infrastructure
```

---

# DOCTRINE COMPLIANCE

This system must comply with:

- 0522_WOS_SurfaceChannelDoctrine_v1.1.0
    
- WOS_Naming_Doctrine_v1
    

Particular attention:

- Surfaces are broadcast personas
    
- Channels are runtime behavioral profiles
    
- geography remains canonical
    
- continuity outranks hard switching
    
- atmosphere persists across transitions
    
- Surfaces interpret the world rather than create it
    

---

# CORE RESPONSIBILITIES

SurfaceRegistry manages:

- Surface registration
    
- Surface discovery
    
- Surface activation
    
- active Channel tracking
    
- transition state
    
- continuity inheritance
    
- orchestration hooks
    
- authority coordination
    

SurfaceRegistry does NOT:

- render visuals
    
- control cameras directly
    
- simulate atmosphere
    
- mutate world state
    

---

# MVP API

```js
SBE.SurfaceRegistry = {
  register(),
  unregister(),

  activate(),
  deactivate(),

  transition(),

  getCurrent(),
  getSurface(),
  getAll(),

  setChannel(),

  tick(),
}
```

---

# CORE STATE MODEL

```js
_state = {
  registered: new Map(),

  activeSurfaceId: null,
  activeChannelId: null,

  pendingTransition: null,

  transitionState: {
    active: false,
    startedAt: 0,
    progress: 0,
  },

  continuity: {
    inheritedAtmosphere: null,
    inheritedDrift: null,
  },
}
```

---

# SURFACE REGISTRATION

Each Surface registers declarative runtime identity data.

Example:

```js
SurfaceRegistry.register({
  id: "deep-night-drives",

  identity: {
    title: "Deep Night Drives",
    callSign: "WOS-DRV-NIGHT",
    broadcastTone: "OBSERVATIONAL_MELANCHOLY",
  },

  geography: {
    spatialResolutionStrategy: "CANONICAL_MAP",
    defaultOriginPoint: null,
    environmentalContextBounds: [
      "NIGHT_TRAVERSAL",
      "RAIN_AMBIENT",
    ],
  },

  runtimeProfile: {
    cameraAuthority: "PASSENGER_MODE",
    driftProfile: "LAID_BACK_CHILL",
    pacingModel: "SLOW_INERTIA",
    soundtrackBehavior: "DYNAMIC_SILENCE_WINDOWS",
    overlayGrammar: "TACTICAL_TELEMETRY_MINIMAL",
  },

  ceremonials: {
    introPackage: "BRIEFING_SLATE_SCANNER_SWEEP",
    outroPackage: "SIGNAL_FADE_OUT",
    interruptionModel: "LOW_PRIORITY_COHERENT",
  },

  orchestration: {
    schedulingRules: null,
    interactionModel: "AUDIENCE_SPECTATOR",
  },

  continuity: {
    atmosphericBridge: true,
    persistenceScope: "WORLD_SHARED",
    transitionLatencyBudgetMs: 1200,
  },
})
```

---

# CHANNEL RELATIONSHIP

A Surface contains:

```txt
possible runtime channel states
```

Example:

```txt
Surface
  └── Channels
        ├── DeepNight
        ├── RainMode
        ├── RushHour
        └── SilentTransit
```

SurfaceRegistry tracks:

- active Surface
    
- active Channel
    

BUT:  
Channel runtime logic remains external.

Maintain strict separation of concerns.

---

# ACTIVATION MODEL

Surface activation MUST NOT:

- hard switch atmosphere
    
- reset drift
    
- snap camera
    
- clear overlays
    
- reset continuity state
    

Instead:

```txt
activation begins continuity negotiation
```

This becomes the bridge into:

- TransitionRuntime
    
- BroadcastScheduler
    
- AtmosphereRuntime
    

---

# CONTINUITY NEGOTIATION

SurfaceRegistry exposes orchestration hooks:

```js
onBeforeActivate()
onAfterActivate()

onTransitionStart()
onTransitionEnd()
```

These hooks exist for:

- atmosphere blending
    
- soundtrack bleed
    
- overlay interpolation
    
- drift continuity
    
- pacing inheritance
    

DO NOT implement full transition logic inside SurfaceRegistry.

---

# VIEWPORT AUTHORITY

SurfaceRegistry integrates with:

```js
SBE.ViewportAuthority
```

Surface activation may eventually influence:

- PassengerMode
    
- DirectorMode
    
- SurveillanceMode
    
- TransitMode
    

BUT:  
SurfaceRegistry itself never directly mutates camera transforms.

---

# GEOGRAPHIC REQUIREMENTS

Every Surface must eventually resolve spatially.

Comply with:

```txt
Everything eventually lives on the map.
```

All Surfaces require:

- geographic context
    
- infrastructural origin
    
- spatial anchoring
    

Even abstract systems.

---

# FUTURE INTEGRATIONS

SurfaceRegistry becomes the execution target for:

- BroadcastScheduler
    
- TransitionRuntime
    
- CalendarRuntime
    
- GridRuntime
    
- SubwayTopologyRuntime
    

Example:

```js
BroadcastScheduler.activateSurface(...)
```

NOT:

```js
BroadcastScheduler.modifyCamera(...)
```

Maintain orchestration separation.

---

# IMPORTANT NON-GOALS

DO NOT BUILD YET:

- visual editors
    
- giant plugin systems
    
- networking layers
    
- realtime civic ingestion
    
- advanced serialization
    
- GUI tooling
    

Focus ONLY on:

```txt
stable runtime orchestration
```

---

# SUCCESS CONDITIONS

System succeeds when:

- Surfaces become operational runtime entities
    
- activation/deactivation behaves predictably
    
- continuity survives Surface transitions
    
- Channels remain isolated behavioral profiles
    
- orchestration hooks remain clean
    
- future scheduling integration becomes straightforward
    

Most importantly:

```txt
the world persists while interpretation layers change
```

That principle is foundational to WOS.

---

# FOLLOW-UP SPECS

Next expected specs:

- 0520B_WOS_TransitionRuntime_v1.0.0
    
- 0520C_WOS_BroadcastScheduler_v1.0.0
    

SurfaceRegistry is the foundational runtime spine enabling both systems.
```

---
# Refinement 

---
# Development

```

```