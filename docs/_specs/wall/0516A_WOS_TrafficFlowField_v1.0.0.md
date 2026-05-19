0516A_WOS_TrafficFlowField_v1.0.0

Date: 2026-05-16
System: WOS
Domain: Ecology / Motion / Emergence
Component: Traffic Flow Field
Status: PROPOSED

Purpose

Introduce lightweight collective traffic behavior to the ecology layer so realized vehicles begin behaving like a living flow system instead of isolated moving entities.

This system is intentionally:

non-physical
low-cost
camera-centric
emergence-focused
compatible with future pedestrians + personalities
compatible with music ecology

The goal is NOT realism through traffic law simulation.

The goal is:

urban biological motion

A city that:

pulses
clusters
slows
breathes
jams
clears
swarms
drifts
Core Philosophy

WOS traffic should resemble:

schools of fish
bloodstream flow
ant colonies
subway crowd movement
microbiology under a microscope

NOT:

rigid lane simulators
deterministic traffic AI
GTA traffic
driving games

Vehicles should feel:

statistically aware
pressure-sensitive
environmentally reactive
Architectural Goals

The system must:

operate only on REALIZED entities
never mutate abstract route definitions
avoid O(n²) full-world costs
remain deterministic enough for continuity
integrate cleanly with LocalRealization lifecycle
expose ecology metrics for audio + rendering
System Overview
Abstract Vehicles
↓
LocalRealization
↓
TrafficFlowField
↓
Steering Influence
↓
Walker / Vehicle Motion
↓
Renderer + Music Ecology
Core Concepts

1. Flow Field

Each realized entity contributes localized directional pressure into world-space.

Vehicles nearby sample that pressure.

This creates:

drift
lane-like alignment
slow clustering
flow coherence

without requiring explicit lanes.

2. Influence Radius

Each realized entity emits influence within a radius.

Example:

flowRadius: 120

Nearby entities:

align direction
inherit velocity tendencies
experience congestion slowdown 3. Pressure

Density creates pressure.

High pressure:

slows movement
increases glow intensity
increases music energy
thickens route rendering

Pressure becomes:

a shared ecology signal

used by:

rendering
music
future events
personalities 4. Cohesion

Vehicles moving similarly:

softly attract
stabilize motion
reduce jitter

Opposing vectors:

create turbulence
instability
congestion
File Structure
engine/
trafficFlowField.js

render/
trafficFlowRenderer.js
State Additions
state.world.flow = {
enabled: true,

    influenceRadius: 120,
    congestionRadius: 80,

    alignmentStrength: 0.015,
    cohesionStrength: 0.010,
    separationStrength: 0.025,

    congestionSlowdown: 0.65,

    maxNeighbors: 8,

    debugDraw: false,

    metrics: {
        activeClusters: 0,
        avgPressure: 0,
        maxPressure: 0
    }

};
Entity Runtime Additions

REALIZED entities only:

entity.flow = {
pressure: 0,
localDensity: 0,

    alignmentX: 0,
    alignmentY: 0,

    clusterId: -1

};

NEVER added to abstract vehicles.

Main Runtime
tick(state, dt)

Primary flow orchestration.

Responsibilities:

Step 1 — Collect realized entities
const entities = state.world.realizedEntities;
Step 2 — Neighbor sampling

For each entity:

find nearby realized neighbors
clamp to maxNeighbors
ignore far entities
Step 3 — Calculate influences

Compute:

Alignment

Softly align heading vectors.

"move with nearby flow"
Cohesion

Pull toward local centroid.

"remain inside traffic stream"
Separation

Prevent over-collapse.

"avoid occupying same space"
Congestion

Density reduces speed.

High local pressure:

compresses velocity
thickens clustering
creates emergent jams
Step 4 — Apply steering

DO NOT hard override route motion.

Instead:

entity.vx += flowX _ alignmentStrength;
entity.vy += flowY _ alignmentStrength;

Flow gently biases motion.

Routes still dominate.

Spatial Partitioning (IMPORTANT)

DO NOT perform naive all-to-all checks long term.

Initial MVP:

brute force acceptable under ~300 realized entities

Future:

Spatial Hash Grid

Planned later.

Pressure Calculation

Pressure should normalize:

pressure = neighbors / maxNeighbors

Clamped:

0 → 1

Pressure drives:

System Result
Rendering glow intensity
Audio energy
Ecology district activity
Camera future event triggers
Personalities stress behavior
Music Ecology Integration

Flow pressure should contribute to:

state.music.ecology.energy

Examples:

Traffic State Musical Result
Sparse ambient
Smooth flow rhythmic
Congestion dense percussion
Turbulence glitch/tension
High-speed corridors pulse/driving bass
Rendering
trafficFlowRenderer.js

OPTIONAL DEBUG ONLY.

Visualizations:

Flow Vectors

Tiny directional strokes.

Pressure Clouds

Soft radial glow.

Cluster Regions

Colored density zones.

Future Systems Enabled

This architecture unlocks:

Future System Enabled By
Pedestrian swarms shared flow logic
Subway crowds density fields
Personality routing pressure avoidance
Police / emergency vehicles pressure piercing
Weather effects global steering
Audio ecology density rhythm
Director Mode hotspot detection
Story events cluster emergence
Important Constraints
DO NOT:
add physics engines
add lane simulation
add pathfinding rewrites
add collision solvers
add steering trees
mutate abstract vehicles
overcomplicate realism
Desired Feel

The city should feel like:

liquid intelligence

not:

traffic AI
Success Criteria

The feature succeeds when:

vehicles visually drift into coherent streams
congestion emerges naturally
clusters appear without scripting
traffic feels alive from high camera altitude
music ecology reacts meaningfully
performance remains stable
realized/despawn lifecycle remains untouched
MVP Priority Order
Phase 1
Neighbor sampling
Alignment
Pressure
Congestion slowdown
Phase 2
Cohesion
Separation
Cluster metrics
Phase 3
Music ecology coupling
Renderer overlays
Director triggers
Implementation Notes
File Ownership
engine/trafficFlowField.js

owns:

flow computation
neighbor sampling
pressure metrics
render/trafficFlowRenderer.js

owns:

debug visualization only
Integration Points
main.js

Insert AFTER:

SBE.LocalRealization.tick()

BEFORE:

rendering
ecology audio extraction
LocalRealization

Must remain authoritative lifecycle owner.

TrafficFlowField:

NEVER spawns
NEVER despawns
NEVER serializes
Final Philosophy

This system is NOT:

cars driving

It is:

urban organisms circulating through an emotional geography

That distinction matters heavily for WOS.

Implementation Guide
Create engine/trafficFlowField.js first with neighbor sampling + pressure only
Integrate after LocalRealization.tick() in ecology update loop
Verify success from HIGH ALTITUDE camera view before tuning low-level behavior
