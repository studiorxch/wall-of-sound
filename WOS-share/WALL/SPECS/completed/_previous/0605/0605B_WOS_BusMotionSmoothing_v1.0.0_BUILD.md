# 0605B_WOS_BusMotionSmoothing_v1.0.0_BUILD

Stage: [BUILD]

---

# Purpose

Introduce presentation-only motion continuity for live MTA buses.

This system exists to solve the visual discontinuity created by GTFS-RT update cadence where buses appear to:

```text
jump
pause
jump
pause
jump
```

rather than behaving as continuous moving world entities.

The objective is to improve perceived world quality without modifying truth.

---

# Problem Statement

Current architecture:

```text
GTFS Feed
    ↓
Realtime Adapter
    ↓
TruthActorRuntime
    ↓
BusPresentationSelector
    ↓
BusVisualFallbackRenderer
    ↓
TransitPresencePass
```

Truth updates approximately every 15 seconds.

During the interval between updates:

```text
bus position remains static
```

then teleports to the next reported location.

This creates:

- visible popping
    
- route discontinuity
    
- artificial movement
    
- loss of world credibility
    

especially at:

```text
city
low
```

altitude profiles.

---

# Architectural Principle

Motion continuity is presentation.

Motion continuity is NOT truth.

The system must never:

- modify actor coordinates
    
- mutate TruthActorRuntime
    
- alter source telemetry
    
- rewrite timestamps
    
- rewrite headings
    
- rewrite speed values
    
- upsert new truth
    

Truth remains authoritative.

The smoothing layer only creates a visual interpretation between truth updates.

---

# Constitutional Boundary

Reads:

```text
TruthActorRuntime
BusPresentationSelector
```

Writes:

```text
BusMotionSmoothing state
```

Never writes:

```text
TruthActorRuntime
WSL
Mapbox
ActorRuntime
ActorRenderAuthority
BusAssetResolver
TransitPresencePass
```

---

# New Runtime

File:

```text
wall/systems/transit/busMotionSmoothing.js
```

Exports:

```javascript
SBE.BusMotionSmoothing
```

---

# Public API

```javascript
start()
stop()

isActive()

observe(actor)

getPresentationPosition(actorId)

clear()

setEnabled(on)
setDebug(on)

getState()
getStats()
```

---

# Internal Model

Each observed bus maintains:

```javascript
{
  actorId,

  lastTruthLng,
  lastTruthLat,

  targetTruthLng,
  targetTruthLat,

  lastTruthTimestamp,

  presentationLng,
  presentationLat,

  velocityLng,
  velocityLat,

  lastSeenAt
}
```

No actor mutation.

No WSL mutation.

Local cache only.

---

# Observation Pass

Executed whenever:

```javascript
BusPresentationSelector.select()
```

returns selected actors.

For each actor:

```javascript
observe(actor)
```

If actor first seen:

```javascript
presentation = truth
```

If actor updated:

```javascript
lastTruth = previousTruth
targetTruth = newTruth
```

---

# Smoothing Model

Use critically damped interpolation.

Never use:

```text
spring bounce
elastic motion
overshoot
```

because buses are infrastructure.

Required behavior:

```text
stable
predictable
subtle
```

---

# Presentation Update

Every render:

```javascript
presentation +=
(target - presentation)
* smoothingFactor
```

Default:

```javascript
SMOOTHING_FACTOR = 0.12
```

---

# Velocity Estimation

When two truth updates exist:

```javascript
velocity =
(targetTruth - previousTruth)
/
deltaTime
```

Store for future use.

Velocity exists only inside smoothing runtime.

Truth never receives velocity modifications.

---

# Dead-Reckoning Window

Between updates:

```javascript
predicted =
targetTruth
+
velocity * predictionTime
```

Maximum prediction:

```javascript
3 seconds
```

After limit:

```javascript
freeze
```

No infinite extrapolation.

---

# Stale Handling

If actor age exceeds:

```javascript
45 seconds
```

matching current bus stale doctrine:

```javascript
smoothing disabled
presentation snaps to truth
```

No ghost motion.

---

# Altitude Behavior

|Profile|Behavior|
|---|---|
|low|full smoothing|
|city|full smoothing|
|regional|reduced smoothing|
|cruise|disabled|

---

# Selector Integration

BusPresentationSelector remains authority.

Selector still chooses actors.

After selection:

```javascript
selectedActors
    ↓
BusMotionSmoothing
    ↓
presentationActors
```

Selection never changes.

Only coordinates become presentation coordinates.

---

# Renderer Integration

BusVisualFallbackRenderer gains:

```javascript
BusMotionSmoothing.getPresentationPosition(actorId)
```

If available:

```javascript
render smoothed position
```

Else:

```javascript
render truth position
```

Fallback remains safe.

---

# Presence Integration

TransitPresencePass must use:

```javascript
presentation position
```

when available.

This ensures:

```text
lights
glows
streaks
```

remain attached to smoothed movement.

Presence never performs smoothing itself.

---

# Performance Constraints

Support:

```text
500+ buses
```

without allocation churn.

Requirements:

```text
single map lookup
cached state
no per-frame object creation
```

Scan cap:

```text
6000 actors
```

consistent with selector doctrine.

---

# Debug Commands

```javascript
busMotionStart()
busMotionStop()

busMotionState()
busMotionStats()

busMotionInspect(actorId)

busMotionEnable(on)
busMotionDebug(on)

busMotionClear()
```

---

# Acceptance Tests

## T1 Runtime loads

```text
BusMotionSmoothing exists
```

PASS

---

## T2 Lifecycle

```text
start()
stop()
```

toggle active state.

PASS

---

## T3 First observation

New actor:

```text
presentation == truth
```

PASS

---

## T4 Update observation

New truth update:

```text
target updated
```

PASS

---

## T5 Interpolation

Presentation moves toward target.

PASS

---

## T6 No overshoot

Presentation never exceeds target.

PASS

---

## T7 Velocity estimation

Velocity calculated from updates.

PASS

---

## T8 Prediction limit

Prediction capped at 3s.

PASS

---

## T9 Stale handling

45s stale disables smoothing.

PASS

---

## T10 Low profile

Full smoothing active.

PASS

---

## T11 City profile

Full smoothing active.

PASS

---

## T12 Regional profile

Reduced smoothing active.

PASS

---

## T13 Cruise profile

Disabled.

PASS

---

## T14 Selector unchanged

Selection results identical.

PASS

---

## T15 Truth unchanged

No actor mutation.

PASS

---

## T16 WSL unchanged

No WSL mutation.

PASS

---

## T17 Presence compatibility

Presence uses smoothed coordinates.

PASS

---

## T18 Renderer fallback

Missing smoothing runtime falls back to truth.

PASS

---

# Success Criteria

Viewers should perceive:

```text
continuous movement
```

instead of:

```text
teleportation
```

while preserving:

```text
truth authority
selector authority
renderer authority
presentation isolation
```

The system must improve perceived motion quality without introducing synthetic world truth.