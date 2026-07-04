0516_WOS_CorridorEcologyPrototype_v1.0.0.md

# WOS — Corridor Ecology Prototype

Version: v1.0.0
Date: 2026-05-16
Status: PROPOSED

---

# Purpose

Establish the first scalable “living city” prototype for WOS using:

- abstract world simulation
- camera-local realization
- lightweight systemic traffic ecology
- music-reactive district pressure
- continuous ambient motion

This prototype is NOT:

- a full NYC simulation
- a social AI system
- a narrative engine
- a fully persistent multiplayer world

This prototype IS:

- a proof of continuous believable urban motion
- a proof of scalable ambient world architecture
- a proof of camera-centric realization
- a proof of district pressure systems

---

# Core Philosophy

The city exists in TWO states simultaneously:

## 1. Abstract State (Always Running)

Cheap symbolic simulation.

Tracks:

- traffic pressure
- route progress
- delivery demand
- nightlife density
- event probability
- district energy

No rendering.
No collisions.
No expensive AI.

---

## 2. Realized State (Camera Local)

Expensive visible simulation.

Activates ONLY near:

- camera
- stream focus
- event zones
- narrative corridors

Includes:

- vehicles
- avatars
- collisions
- particles
- field FX
- audio layers
- detailed movement

---

# Goal

Create:

```txt
a city that never emotionally stops moving

without:

full microscopic simulation
Prototype Scope
Geographic Scope

Single corridor only.

Recommended:

Downtown Manhattan → Williamsburg → Bushwick

Reasons:

nightlife density
bridges
visual variety
music culture overlap
believable traffic flow
Supported Vehicle Types

Phase 1 ONLY:

Type	Purpose
rideshare	narrative/social traversal
delivery	ambient logistical density

No buses.
No trains.
No pedestrians yet.

Simulation Layers
Layer 0 — District Pressure System
Purpose

Provide continuous invisible city motion.

File
engine/districtPressure.js
State
state.world.pressure = {
  districts: {
    bushwick: {
      nightlife: 0.8,
      traffic: 0.7,
      delivery: 0.6,
      weather: 0.2,
      energy: 0.9
    }
  }
}
Pressure Inputs
Time of Day

Influences:

nightlife
traffic
delivery
Weather

Influences:

movement speed
event density
route clustering
Events

Temporary modifiers:

nightlife += 0.25
traffic += 0.15
Layer 1 — Abstract Vehicle Ecology
Purpose

Maintain symbolic world continuity.

File
engine/trafficEcology.js
Vehicle Schema
{
  id,
  type,
  district,
  routeId,
  routeProgress,
  state,
  destination,
  eta,
  active
}
Important

These vehicles:

DO NOT render
DO NOT collide
DO NOT simulate physics

They ONLY:

advance route progress
complete jobs
affect district pressure
generate symbolic events
Tick Logic

Every few seconds:

vehicle.routeProgress += speed * dt

When complete:

generate symbolic completion event
select new task
update district pressure
Symbolic Event Example
{
  type: "delivery_complete",
  district: "williamsburg",
  timestamp: world.time
}
Layer 2 — Camera Realization
Purpose

Materialize local world detail.

File
engine/worldRealizer.js
Realization Radius
state.world.realizationRadius = 1800
Activation Rule

If:

distance(vehicle, camera) < radius

Then:

instantiate projectile walker vehicle
enable collisions
attach subject/avatar
enable sound
enable field response
Deactivation Rule

Outside radius:

serialize current local state
write progress back to abstract vehicle
destroy expensive runtime object
Important

ONLY:

50–150 active realized entities max

should exist simultaneously.

Layer 3 — Vehicle Subjects
Purpose

Provide visible readable city motion.

Subject Types
rideshare
arrow
glyph/car
delivery
box van
courier glyph
Default Path Styles
Type	Path
rideshare	dashed
delivery	dotted
Layer 4 — Music Ecology
Purpose

Tie city pressure into soundtrack behavior.

File
engine/musicEcology.js
Inputs
Pressure	Audio Effect
nightlife	BPM increase
traffic	rhythmic density
weather	texture filtering
delivery	percussive activity
energy	harmonic brightness
Example

Bushwick:

nightlife: 0.9

could:

raise BPM
increase crowd textures
introduce brighter percussion
intensify field visuals
Layer 5 — Event Punctuation
Purpose

Create occasional meaningful convergence.

Event Examples
Event	Effect
warehouse party	nightlife spike
rainstorm	movement slowdown
traffic jam	congestion field
late-night rush	rideshare surge
Important

Events are:

temporary pressure modifiers

NOT:

fully scripted narrative scenes
Rendering Priorities
background grid
→
field renderer
→
district overlays
→
paths
→
vehicles
→
subjects
→
particles
→
UI
Debug HUD
Add:
state.debug.ecology = true
Ecology Overlay

Display:

active abstract vehicles
realized entities
district pressure
route density
event pressure
Success Criteria

Prototype succeeds if:

Visual
city feels continuously alive
traffic appears persistent
routes feel believable
Audio
soundtrack evolves with district pressure
transitions feel motivated
Technical
only nearby entities fully realize
off-camera simulation remains lightweight
stable FPS with large symbolic populations
Emotional
world feels active even during quiet moments
ambient continuity sustained for 2+ hours
Explicit Non-Goals

DO NOT implement yet:

deep personas
email systems
social networking
AI dialogue
pedestrians
interior simulation
global persistence
multiplayer
full NYC scale
Future Expansion

Once corridor ecology works:

Phase 2
pedestrian ecology
subway systems
nightlife clusters
Phase 3
named persistent entities
social memory
event attendance
Phase 4
correspondence layer
ambient social systems
music-from-world-memory
Architecture Principle
Continuous abstract ecology
+
Localized cinematic realization
=
Scalable living world
Implementation Guide
Build district pressure + abstract vehicle simulation first
Add camera realization/despawn pipeline second
Connect pressure values into music + field behavior last
```
