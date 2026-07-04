# 0605E_WOS_TransitAssignmentAuthority_v1.0.0_BUILD

Stage: [BUILD]

## Purpose

Create the first intentional assignment system for live transit actors.

This specification introduces the missing capability:

```text
WOS knows buses
↓
WOS can identify buses
↓
WOS can classify buses
↓
WOS can select buses
↓
WOS can ASSIGN buses
```

This is the transition from:

```text
simulation
```

to:

```text
world direction
```

---

## Problem

Current system:

```text
Live MTA Feed
→ Truth Actor
→ Bus Classification
→ Motion
→ Presence
→ Livery
```

All buses remain interchangeable.

We can see them.

We cannot meaningfully own them.

There is currently no way to say:

```text
This bus matters.
```

---

## Core Goal

Introduce a stable assignment layer.

Example:

```text
Vehicle 7564
↓
Assigned
↓
Night Owl
↓
Hero Bus
```

without modifying:

```text
truth
telemetry
route
movement
identity
```

---

## Constitutional Principle

Assignment is presentation authority.

Assignment is not truth.

Assignment is not telemetry.

Assignment is not simulation.

---

## New Runtime

```text
wall/systems/transit/transitAssignmentAuthority.js
```

Exports:

```javascript
SBE.TransitAssignmentAuthority
```

---

## Ownership

Owns:

```text
hero assignments
event assignments
studio assignments
director selections
presentation aliases
```

Reads:

```text
TruthActorRuntime
BusPresentationSelector
BusAssetResolver
TransitLiveryHooks
```

Writes:

```text
assignment cache only
```

Never writes:

```text
TruthActorRuntime
Mapbox
WSL
Feed rows
Motion Smoothing
Selector state
```

---

## Public API

```javascript
start()
stop()

isActive()

assignVehicle(vehicleId, assignment)

assignRoute(routeId, assignment)

assignActor(actorId, assignment)

unassignVehicle(vehicleId)
unassignRoute(routeId)
unassignActor(actorId)

clearAll()

resolve(actor)

listAssignments()

getAssignment(id)

getState()
getStats()

setEnabled(on)
setDebug(on)
```

---

## Assignment Types

Supported:

```javascript
hero
event
studio
sponsored
graffiti
holiday
debug
custom
```

---

## Assignment Model

```javascript
type TransitAssignment = {

  assignmentId: string

  assignmentType:
    | "hero"
    | "event"
    | "studio"
    | "sponsored"
    | "graffiti"
    | "holiday"
    | "debug"
    | "custom"

  label: string

  description: string | null

  priority: number

  enabled: boolean

  metadata: object
}
```

---

## Resolution Order

Highest wins.

```text
Actor Assignment
↓
Vehicle Assignment
↓
Route Assignment
↓
None
```

---

## Hero Assignment

Hero buses become:

```text
director targets
camera targets
story targets
future AI targets
```

Helpers:

```javascript
assignHeroBus(vehicleId, label)
assignRandomHeroBus()
assignNearestHeroBus()
clearHeroBus()
getHeroBus()
```

Only one active hero bus at a time.

---

## Livery Integration

Assignment may suggest:

```javascript
{
  assignmentType: "hero",
  metadata: {
    liveryKey: "studiorich_cyan"
  }
}
```

Assignment suggests.

Livery authority decides.

---

## Persistence

Optional:

```javascript
localStorage['wos.transit.assignments']
```

Development only.

---

## Debug Commands

```javascript
_wos.debug.transit.assignHeroBus()
_wos.debug.transit.assignRandomHeroBus()
_wos.debug.transit.assignNearestHeroBus()
_wos.debug.transit.clearHeroBus()
_wos.debug.transit.getHeroBus()

_wos.debug.transit.assignTransitVehicle()
_wos.debug.transit.assignTransitRoute()

_wos.debug.transit.listTransitAssignments()
_wos.debug.transit.inspectTransitAssignment()

_wos.debug.transit.transitAssignmentState()
_wos.debug.transit.transitAssignmentStats()
```

---

## Renderer Integration

Renderer may read:

```javascript
assignment =
TransitAssignmentAuthority.resolve(actor)
```

and include:

```javascript
metadata: {
  assignmentType,
  assignmentLabel,
  assignmentId
}
```

Presentation only.

---

## Presence Integration

Presence may slightly boost hero visibility.

Maximum:

```text
15%
```

No particles.

No beams.

---

## Cruise Field Integration

Hero buses may contribute:

```text
hero pulse bias
```

Maximum:

```text
5%
```

Aggregate field remains truthful.

---

## State Model

```javascript
type TransitAssignmentState = {

  version: "1.0.0"

  active: boolean

  enabled: boolean

  debug: boolean

  assignmentCount: number

  actorAssignments: number

  vehicleAssignments: number

  routeAssignments: number

  heroVehicleId: string | null

  lastAssignmentAt: number | null

  lastError: string | null
}
```

---

## Acceptance Tests

T1 Loads safely

T2 Vehicle assignment

T3 Route assignment

T4 Actor assignment overrides vehicle

T5 Hero assignment

T6 Assign new hero replaces previous hero

T7 Clear hero

T8 Assignment persistence

T9 Renderer metadata

T10 Presence reads assignment

T11 Cruise field reads assignment

T12 No truth mutation

T13 No selector mutation

T14 No smoothing mutation

T15 No Mapbox mutation

T16 Debug commands work

---

## Success Criteria

```text
Thousands of buses.

One becomes:

Night Owl
Hero Bus
StudioRich Bus
Graffiti Bus
Event Bus
```

while remaining:

```text
real
live
telemetry-driven
truthful
```
