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
# 0520D_WOS_MinimalTransitionRuntime_v1.1.0

## CHANGELOG v1.1.0

### Added

- Interrupted continuity bridging
- dual push/pull continuity access doctrine
- Continuity Clock Doctrine
- interruption-safe runtime bridging
- canonical timing initialization rule
- render-loop autonomy clarification

### Refined

- continuity bias semantics
- transition weight mathematics
- RAF timing guarantees
- transition interruption handling
- transition progress event architecture

### Fixed

- first-frame timestamp resolution bug
- continuity bias convergence bug
- transition interruption visual popping
- throttled event/render desynchronization risk

---

# PURPOSE

TransitionRuntime formalizes:

```
deterministic continuity interpolation across persistent world interpretation changes
```

This system is responsible for:

- atmosphere blending
- drift inheritance
- soundtrack continuity weighting
- overlay interpolation timing
- transition lifecycle progression
- continuity state migration

TransitionRuntime exists to ensure:

```
the world never stopsonly the interpretation changes
```

This is NOT:

- rendering infrastructure
- camera ownership
- Surface orchestration
- scheduling authority
- world simulation
- animation systems

TransitionRuntime is:

```
canonical continuity progression infrastructure
```

---

# DOCTRINE COMPLIANCE

This system must comply with:

- 0522_WOS_SurfaceChannelDoctrine_v1.1.0
- WOS_Naming_Doctrine_v1
- 0520A_WOS_SurfaceRegistry_v1.0.0
- 0520C_WOS_BroadcastScheduler_v1.1.0

Particular attention:

- continuity outranks hard switching
- atmosphere persists across interpretation changes
- Surfaces interpret the world rather than create it
- transitions are ceremonial continuity systems
- geographic truth remains uninterrupted

---

# CANONICAL RESPONSIBILITY SEPARATION

```
SurfaceRegistry owns identityTransitionRuntime owns continuityBroadcastScheduler owns intent
```

TransitionRuntime must NEVER:

- absorb scheduling logic
- own render systems
- mutate atmosphere directly
- manipulate camera transforms

Maintain strict runtime separation.

---

# CONTINUITY CLOCK DOCTRINE

```
TransitionRuntime defines canonical continuity progression timing.
```

All downstream systems:

- interpolate independently
- consume normalized transition state
- remain render-loop autonomous

TransitionRuntime NEVER:

- renders visuals
- composites overlays
- mixes audio
- interpolates cameras directly

It ONLY:

```
publishes canonical continuity progression
```

This doctrine is foundational.

---

# CORE RESPONSIBILITIES

TransitionRuntime manages:

- continuity interpolation
- atmosphere blending weights
- drift blending weights
- soundtrack continuity weighting
- overlay interpolation weighting
- transition lifecycle state
- interruption-safe continuity migration

TransitionRuntime does NOT:

- own Surfaces
- activate Surfaces
- mutate world state
- own cameras
- render overlays
- simulate atmosphere directly

---

# MVP API

```
SBE.TransitionRuntime = {  init(),  transition(),  interrupt(),  cancelTransition(),  getState(),  tick(),}
```

---

# CORE STATE MODEL

```
_state = {  active: false,  transitionId: null,  fromSurfaceId: null,  toSurfaceId: null,  startedAt: 0,  durationMs: 0,  progress: 0,  fromState: null,  toState: null,  interruptedBridgeState: null,  curve: "cinematic",  continuityBias: {    atmosphere: 0.7,    soundtrack: 0.5,    overlay: 0.3,  },  weights: {    atmosphere: 0,    soundtrack: 0,    overlay: 0,  },  interrupted: false,}
```

---

# TRANSITION MODEL

Transitions are NOT:

```
scene loads
```

Transitions ARE:

```
continuity migrations
```

Meaning:

- the world persists
- atmosphere persists
- pacing persists
- drift persists

Only:

- interpretation
- emphasis
- framing
- orchestration

change.

---

# INPUT CONTRACT

TransitionRuntime receives transition requests from:

```
SBE.SurfaceRegistry
```

Expected payload:

```
{  fromId,  toId,  durationMs,  curve,  continuityBias,}
```

---

# CANONICAL TIMING RULE

Transitions MUST immediately bind timing origin during:

```
transition()
```

Example:

```
_state.startedAt = performance.now();_state.active = true;
```

NEVER defer timing origin creation to:

```
tick(ts)
```

This prevents:

- first-frame resolution collapse
- immediate transition completion
- RAF timing instability

---

# INTERRUPED CONTINUITY BRIDGING

When interruptions occur:  
the next transition MUST inherit:

```
the currently resolved runtime blend state
```

NOT:

```
the original baseline source state
```

Meaning:  
TransitionRuntime captures:

```
interruptedBridgeState
```

from:

```
current runtime weights
```

before:

- resetting elapsed time
- initializing next transition

This preserves:

- atmospheric continuity
- soundtrack continuity
- overlay continuity
- perceptual smoothness

---

# CONTINUITY BIAS DOCTRINE

Bias values define:

```
channel convergence speed
```

NOT:

```
maximum output weight
```

---

# CONTINUITY BIAS SEMANTICS

|Value|Meaning|
|---|---|
|1.0|Full-duration convergence|
|0.75|Faster convergence|
|0.5|Aggressive convergence|
|0.25|Near-immediate convergence|
|0.0|Immediate snap permitted|

---

# CORRECTED WEIGHT MODEL

Weights are:

```
normalized continuity influence multipliers
```

NOT:

- literal opacity
- literal volume
- literal fog density

Consumer systems interpret weights independently.

---

# WEIGHT FORMULA

```
weight = clamp(  easedProgress / continuityBias,  0,  1);
```

This guarantees:

```
all channels fully resolve to synchronization
```

when:

```
rawT >= 1
```

while still allowing:

- aggressive convergence
- slow cinematic preservation
- delayed migration behavior

---

# CURVE SUPPORT

## linear

```
t
```

---

## smooth

```
t * t * (3 - 2 * t)
```

---

## cinematic

```
1 - Math.pow(1 - t, 3)
```

Slow start.  
Slow end.  
Observational pacing.

---

# DUAL ACCESS DOCTRINE

TransitionRuntime supports:

- low-frequency push events
- high-frequency synchronous pull access

---

# PUSH MODEL

```
broadcast:transitionProgress
```

is throttled:

```
~15hz max
```

for:

- diagnostics
- scheduler observation
- debug overlays
- telemetry systems

---

# PULL MODEL

```
TransitionRuntime.getState()
```

must remain:

```
high-frequency synchronous
```

for:

- render systems
- atmosphere systems
- audio systems
- overlay interpolation
- future camera continuity

This prevents:

```
event buses from becoming accidental render loops
```

---

# EVENT MODEL

## transitionStarted

```
emit("broadcast:transitionStarted", {  transitionId,  fromId,  toId,  durationMs,  curve,});
```

---

## transitionProgress

```
emit("broadcast:transitionProgress", {  progress,  easedProgress,  weights,});
```

Throttle:

```
~15hz max
```

---

## transitionResolved

```
emit("broadcast:transitionResolved", {  transitionId,  fromId,  toId,  interrupted: false,});
```

---

## transitionInterrupted

```
emit("broadcast:transitionInterrupted", {  transitionId,});
```

---

# INTERRUPTION RULES

Only ONE transition may remain active.

If a new transition begins:

```
current transition resolves immediately as interrupted
```

Then:

- interruptedBridgeState captures current blend state
- new transition becomes authoritative
- continuity progression restarts safely

Transitions NEVER stack.

---

# MINIMAL RAF TICK

```
function tick(ts) {  if (!_state.active) return;  const elapsed = ts - _state.startedAt;  const rawT =    clamp(elapsed / _state.durationMs, 0, 1);  const eased =    applyCurve(rawT, _state.curve);  updateWeights(eased);  if (shouldEmitProgress(ts)) {    emit("broadcast:transitionProgress", {      progress: rawT,      easedProgress: eased,      weights: _state.weights,    });  }  if (rawT >= 1) {    resolveTransition();  }}
```

---

# DETERMINISM RULES

TransitionRuntime MUST:

- remain fully time-based
- remain frame-rate independent
- remain interruption-safe
- remain deterministic
- remain stateless outside active transition

TransitionRuntime MUST NOT:

- accumulate interpolation drift
- depend on delta integration
- mutate downstream systems directly

---

# LOGGING

## Start

```
[TransitionRuntime]transition started:street_night → rain_corridor1800ms cinematic
```

---

## Resolve

```
[TransitionRuntime]transition resolved:street_night → rain_corridor
```

---

## Interrupt

```
[TransitionRuntime]transition interrupted:street_night → rain_corridor
```

---

# SUCCESS CONDITIONS

System succeeds when:

- transitions interpolate smoothly
- interruptions remain visually stable
- scheduler remains independent
- SurfaceRegistry remains thin
- render systems remain autonomous
- blend weights remain deterministic
- continuity survives interruption safely

Most importantly:

```
the viewer experiences persistent continuityrather than scene replacement
```

That principle is foundational to WOS.

---

# FUTURE EXPANSION (NOT YET)

Later:

- camera continuity
- soundtrack stem interpolation
- district continuity
- overlay compositing
- route blending
- cinematic cuts
- continuity memory
- predictive transitions
- transition budgeting

NONE belong in v1.1.0.

---

# FOLLOW-UP SPECS

Next expected runtime layers:

- 0520E_WOS_SubwayTopologyRuntime_v1.0.0
- 0520F_WOS_GridRuntime_v1.0.0
- 0520G_WOS_CalendarRuntime_v1.0.0

TransitionRuntime establishes:

```
canonical continuity progression infrastructure
```

for the persistent WOS broadcast runtime.
```

---
# Review/ Refinement

---
# Development

```

```