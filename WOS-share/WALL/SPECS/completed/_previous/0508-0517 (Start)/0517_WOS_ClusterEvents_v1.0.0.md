0517_WOS_ClusterEvents_v1.0.0
Overview

Cluster Events introduce the first true layer of social convergence ecology into WOS.

Prior systems established:

district pressure
actor ecology
city rhythm
realization
traffic flow
music ecology

However, the world still lacks:

localized temporary significance

Cluster Events solve this by creating:

temporary attraction zones
behavioral convergence
density anomalies
soundtrack escalation
camera curiosity
emergent social moments

These are NOT scripted missions or gameplay objectives.

They are:

temporary ecological pressure blooms

that emerge, intensify, decay, and dissolve over time.

Core Philosophy

Cluster Events are:

ecological
probabilistic
influence-based
temporary
camera-interest generators

They are NOT:

quest systems
hard-scripted scenes
player objectives
deterministic encounters

The world should feel:

alive and reactive

rather than:

pre-authored and staged
Design Goals
Primary Goals

Cluster Events should:

Create meaningful convergence
Generate temporary social density
Influence actor routing
Affect district pressure
Drive soundtrack evolution
Attract camera attention
Create emotional pacing
Event Lifecycle

All Cluster Events follow a unified lifecycle:

seed → grow → peak → decay → dissolve

This creates:

anticipation
escalation
climax
aftermath

without requiring scripted narrative.

Event Categories (Stage 1)

Initial MVP event types:

Event Type Purpose
rooftop nightlife convergence
vendor food/social pressure
transitDelay commuter congestion
rainShelter weather clustering
streetPerformance wanderer attraction
nightlifeSpill district overflow

Stage 1 focuses on:

invisible behavioral logic only

No public UI required yet.

Core Event Schema
event = {
id: "evt_001",

type: "rooftop",

x: 0,
y: 0,

radius: 420,

state: "grow",

strength: 0.0,
maxStrength: 1.0,

growthRate: 0.002,
decayRate: 0.001,

startTime: 0,
duration: 7200,

districtId: "bushwick",

actorBias: {
nightlife: 1.5,
wanderer: 0.8,
commuter: 0.2
},

pressureBias: {
nightlife: 0.45,
traffic: 0.12,
delivery: -0.08
},

musicBias: {
energy: 0.22,
density: 0.35,
brightness: 0.18
},

cameraInterest: 0.65,

weatherAffinity: {
rain: -0.4,
clear: 0.8
}
}
Event States
seed

Low-strength dormant emergence.

Characteristics:

weak attraction
low visibility
low camera interest
minimal pressure effect

Purpose:

event anticipation phase
grow

Event gains ecological gravity.

Characteristics:

actor convergence begins
route bias increases
soundtrack begins responding
district pressure rises

Purpose:

social buildup
peak

Maximum convergence intensity.

Characteristics:

strong density
high soundtrack activity
high camera curiosity
elevated flow pressure
strongest visual atmosphere

Purpose:

temporary city climax
decay

Pressure dissipates gradually.

Characteristics:

actors disperse
soundtrack softens
district pressure normalizes
event influence weakens

Purpose:

emotional release
dissolve

Event removed completely.

Characteristics:

no remaining influence
ecology resumes baseline

Purpose:

prevent permanent saturation
Behavioral Influence Model
IMPORTANT

Cluster Events MUST:

influence actor decisions

They MUST NOT:

directly control actors

Actors remain autonomous.

Events only modify:

probability
attraction
routing preference
density tendency

This preserves:

emergence integrity
Actor Influence

Events influence:

target selection
district preference
path weighting
linger duration
movement speed

Example:

if (distance < event.radius) {
actor.interest += event.strength \* 0.25;
}
District Pressure Integration

Events temporarily amplify:

nightlife
traffic
delivery
ghost energy
wanderer density

Example:

district.pressure.nightlife +=
event.pressureBias.nightlife \* event.strength;
Music Ecology Integration

Events contribute:

density
BPM lift
harmonic tension
brightness
ambience complexity

Example:

music.energy +=
event.musicBias.energy \* event.strength;

Events become:

social soundtrack drivers
Camera Curiosity System

Events expose:

cameraInterest

This later feeds:

auto-director mode
stream routing
event discovery
cinematic transitions

Purpose:

give cameras reasons to investigate
Spawn Logic

Stage 1 events may spawn from:

district rhythm
pressure thresholds
weather
time-of-day
actor density
random ecological probability

Example:

if (
district.nightlife > 0.7 &&
rhythm.phase === "night"
) {
trySpawnRooftopEvent();
}
Event Density Limits

Prevent ecological saturation.

Stage 1 defaults:

Constraint Value
max global events 12
max district events 3
min event spacing 600wu
peak overlap reduction enabled

Purpose:

maintain readability
Rendering (Deferred)

Stage 1 intentionally avoids:

icons
labels
visible markers
event cards
UI overlays

The player should initially:

feel convergence before seeing systems

Future stages may introduce:

subtle atmosphere overlays
district glow
pressure pulses
event flyers
bulletin systems
invitations
Stage 1 Debug Rendering

Allowed debug-only visuals:

soft pressure rings
convergence heatmaps
actor attraction vectors
event radius overlays
state labels

Debug gated:

state.world.clusterEvents.debugDraw
Initial Runtime API
SBE.ClusterEvents.tick(state, dt)

SBE.ClusterEvents.spawn(type, opts)

SBE.ClusterEvents.getNearby(x, y)

SBE.ClusterEvents.getMetrics()
Suggested Runtime State
state.world.clusterEvents = {
enabled: true,

events: [],

maxEvents: 12,

debugDraw: false,

metrics: {
active: 0,
peak: 0,
avgStrength: 0
}
}
Stage 1 Success Criteria

The system succeeds when:

actors visibly converge
flow density changes naturally
soundtrack reacts meaningfully
district pressure shifts temporarily
camera movement feels motivated
events emerge and dissolve believably

without:

scripting
mission systems
manual choreography
Future Expansion Hooks

Future systems may connect:

email invitations
bulletin boards
promoter actors
Twitch event announcements
RSVP systems
district broadcasts
rooftop ownership
user-hosted gatherings
real-world environmental triggers
birdhouse atmosphere influence
Key Principle

Cluster Events are:

temporary social weather systems

They transform:

continuous city motion

into:

meaningful emotional convergence

without sacrificing:

emergence
ecological realism
scalability
atmospheric continuity
