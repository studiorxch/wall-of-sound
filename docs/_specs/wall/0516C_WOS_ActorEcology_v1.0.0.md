0516C_WOS_ActorEcology_v1.0.0.md

# WOS — Actor Ecology System

Version: v1.0.0
Date: 2026-05-16
Status: OFFICIAL

---

# Purpose

Introduce lightweight behavioral actor populations into WOS.

This system creates:

- visible urban life
- temporal population shifts
- district personality
- movement identity
- emotional atmosphere

WITHOUT:

- deep AI
- dialogue systems
- life simulation
- NPC complexity
- behavior trees

The goal is:

```txt
behavioral atmosphere

NOT:

full human simulation
Core Philosophy

Actors are:

emotional ecological particles

NOT:

traditional videogame NPCs

They:

drift
commute
cluster
wander
converge
dissolve

according to:

district pressure
city rhythm
flow ecology
weather
local events
Architectural Goal

Create:

a city that visibly inhabits itself

while preserving:

scalability
emergence
ambient continuity
low simulation cost
Important Constraint

Actors MUST remain:

lightweight

Most actors:

are anonymous
are archetypal
have no deep memory
do not require continuous realization

Only a tiny minority may eventually evolve into:

named entities
recurring personas
event participants
File Structure
New
engine/actorEcology.js
render/actorRenderer.js
Existing Integrations
engine/cityRhythm.js
engine/localRealization.js
engine/trafficFlowField.js
engine/musicEcology.js
Main State
state.world.actors = {
    enabled: true,

    maxAbstractActors: 4000,
    maxRealizedActors: 140,

    realizationRadius: 1200,

    spawnRate: 1.0,

    debugDraw: false,

    archetypes: {},

    metrics: {
        abstractCount: 0,
        realizedCount: 0,

        commuters: 0,
        nightlife: 0,
        delivery: 0,
        wanderers: 0
    }
};
Actor Philosophy

Actors exist in TWO layers:

Layer	Purpose
Abstract Actor	symbolic city life
Realized Actor	visible cinematic life

Same architecture as vehicle realization.

Abstract Actor Schema
{
    id,

    archetype,

    district,

    mood,

    energy,

    routeId,

    progress,

    velocity,

    state,

    targetDistrict,

    realized: false
}
Important

Abstract actors:

do NOT render
do NOT collide
do NOT animate

They ONLY:

participate in ecology
affect pressure
bias realization
generate movement continuity
Realized Actor Schema
{
    actorId,

    walkerId,

    archetype,

    realizedAt,

    district
}

Stored in:

state.world.realizedActors
Archetype System
Purpose

Create readable population identity.

Archetypes v1
commuter

Mood:

functional

Behavior:

predictable routes
morning/day bias
medium speed
corridor-heavy

District Preference:

downtown
transit corridors

Music Influence:

rhythm stabilization
daytime pulse
nightlife

Mood:

social

Behavior:

clustering
convergence
nighttime spawning
dense local flow

District Preference:

Bushwick
Williamsburg
Lower Manhattan

Music Influence:

BPM lift
harmonic density
crowd energy
delivery

Mood:

working

Behavior:

rapid short routes
constant movement
delivery pressure response

District Preference:

commercial
industrial
restaurant zones

Music Influence:

percussive density
wanderer

Mood:

drifting

Behavior:

low-purpose movement
parks
waterfronts
irregular pacing

Music Influence:

ambient drift
harmonic openness
ghost

Mood:

isolated

Behavior:

sparse
late-night
slow
detached from clusters

Music Influence:

emptiness
loneliness
atmosphere
Archetype Config Schema
{
    name,

    spawnWeight,

    preferredDistricts,

    preferredPhases,

    speed,

    cohesion,

    clusterBias,

    pressureSensitivity,

    musicWeight
}
Spawn Logic
actorEcology.tick()

Responsibilities:

Step 1 — Maintain Population Targets

Based on:

cityEnergy
district pressure
rhythm phase

Examples:

Phase	Population
dawn	sparse
day	commuter-heavy
dusk	convergence
night	nightlife-heavy
lateNight	ghosts/wanderers
Step 2 — Spawn Abstract Actors

Weighted by:

district
rhythm phase
local pressure
archetype preference
Step 3 — Advance Abstract Actors

Cheap symbolic progression only.

Example:

actor.progress += speed * dt;

No rendering.

No collisions.

No pathfinding.

Step 4 — Realization

If near camera:

realizeActor(actor)

Creates:

projectile walker
subject
optional trail
field interaction
Step 5 — Despawn

Beyond realization radius:

serialize progress
remove runtime walker
preserve abstract state
Subject Presets
commuter
subjectStyle: "arrow"
pathStyle: "dashed"
color: "#7dcfff"
nightlife
subjectStyle: "glyph"
glyph: "person"
pathStyle: "double"
color: "#ff66cc"
delivery
subjectStyle: "dot"
pathStyle: "dotted"
color: "#f0c674"
wanderer
subjectStyle: "none"
pathStyle: "solid"
color: "#7ee7d8"
ghost
subjectStyle: "none"
pathStyle: "none"
color: "#ccccff"
opacity: 0.35
Flow Integration

Actors participate in:

TrafficFlowField

BUT with reduced influence.

Actors:

follow flow
contribute local pressure
create movement turbulence

without dominating vehicle ecology.

Pressure Integration

Actors contribute to district pressure.

Example:

Archetype	Pressure
commuter	traffic
nightlife	nightlife
delivery	delivery
wanderer	energy
ghost	atmosphere only
Music Ecology Integration

This is critical.

Actors become:

emotional density carriers

Examples:

Archetype	Audio Effect
commuter	stable rhythm
nightlife	crowd energy
delivery	percussion
wanderer	ambient
ghost	sparse atmosphere
Camera Curiosity Hooks

Future-facing:

Actors may emit:

interestWeight

High-interest clusters:

nightlife convergences
ghost isolation
unusual density
weather gatherings

become:

camera attraction points
Renderer
actorRenderer.js

Responsibilities:

actor visuals
trails
archetype readability
optional debug overlays
Important

Rendering should prioritize:

silhouette readability

NOT:

detailed character art
Debug Visualization

When:

state.world.actors.debugDraw

Display:

actor clusters
archetype colors
density heat
realization count
Performance Constraints
Hard Limits
System	Limit
abstract actors	4000
realized actors	140
active collisions	local only
Important

DO NOT:

pathfind every actor
create deep AI
store giant memories
simulate conversations
simulate inventories
Desired Feeling

The city should feel:

inhabited

NOT:

scripted
Success Criteria

The feature succeeds when:

districts visibly feel populated
time-of-day changes feel inhabited
movement feels socially motivated
actor density affects atmosphere
music gains emotional context
passive viewing becomes compelling
Explicit Non-Goals

DO NOT implement:

dialogue
social media
relationships
economy systems
inventories
combat
quests
RPG systems
Future Expansion
Phase 2
named recurring personas
archetype mutation
district residency
Phase 3
social convergence
event attendance
relationship residue
Phase 4
correspondence systems
memory systems
music-from-social-state
Architecture Principle
Rhythm creates time
Pressure creates movement
Actors create emotional occupancy
Final Philosophy

This system is NOT:

NPC simulation

It is:

urban emotional ecology

That distinction is critical for WOS.

Implementation Guide
Build abstract actor spawning + lifecycle first
Add realization/despawn pipeline second
Couple actors into pressure + music ecology last
```
