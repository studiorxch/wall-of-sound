0510_WOS_CameraArchitectureFreeze_v1.0.0

Version: v1.0.0
Date: 2026-05-10
System: Wall of Sound (WOS)
Domain: Camera / Presentation / Route World
Status: ARCHITECTURE FREEZE

Purpose

Freeze and formalize the WOS camera architecture before additional features expand the system.

This document exists to prevent:

camera logic leaking into simulation
renderer coupling
duplicated transform systems
mode chaos
OBS/view-mode fragmentation
“god camera” growth

The WOS camera is now a foundational system.

It must remain:

modular
predictable
presentation-oriented
Core Principle
The camera is NOT gameplay.
The camera is the observer consciousness.

The camera exists to:

frame systems
reveal motion
shape atmosphere
guide observation
create emotional pacing

NOT:

simulate physics
own traversal
manage world state
Camera Ownership
Camera OWNS
Presentation State
position
zoom
drift
lookAhead
mode
transitions
trail visibility
HUD visibility
Observation Behavior
follow logic
overview fitting
cinematic interpolation
split-view layouts
future replay framing
Presentation Timing
camera transitions
zoom easing
mode interpolation
intro framing
ambient drift
Camera DOES NOT OWN
Simulation

NEVER:

actor movement
route traversal
event systems
traffic systems
physics
world progression
Route Logic

NEVER:

route ingestion
segment generation
route statistics
distance systems
Audio

NEVER:

music generation
audio timing
mixer logic

Camera may observe audio state only.

System Boundaries
RouteWorld

Owns:

world truth

Includes:

routes
actors
traversal
events
ecology
timing
RouteCamera

Owns:

world observation

Includes:

framing
smoothing
transitions
cinematic logic
presentation transforms
Renderer

Owns:

world drawing

Includes:

layers
compositing
transform application
visual ordering

Renderer MUST NOT:

compute camera behavior
compute traversal logic
Camera State Rules
Persistent State

Allowed:

mode
smoothing
lookAheadDistance
feature toggles
overviewPadding
dynamicZoom
Runtime State

NEVER persist:

x
y
targetX
targetY
zoom
velocity
trail buffers
smoothSpeed
shake

These are ephemeral runtime presentation values.

Camera Modes

Camera modes are:

observation strategies

NOT:

separate camera systems

All modes must share:

same transform pipeline
same renderer integration
same persistence structure
Approved Modes
Overview

Purpose:

systems observation

Responsibilities:

fit full route
reveal infrastructure
show ecology context
Follow

Purpose:

route intimacy

Responsibilities:

follow actor
preserve readability
maintain smooth traversal
Cinematic

Purpose:

ambient emotional framing

Responsibilities:

drift
breathing zoom
atmospheric pacing

Must remain subtle.

DualPortrait (Future)

Purpose:

macro + micro coexistence

Responsibilities:

overview + cinematic simultaneously
OBS-first presentation
route + immersion duality
Infinite (Future)

Purpose:

persistent ambient observation

Responsibilities:

autonomous wandering
long-duration framing
ecology observation
Camera Rig Philosophy

A camera rig is:

a behavior profile

NOT:

a renderer

Example future rigs:

calm
drone
traffic-watch
subway-watch
night-drive
slow-cinema
weather-watch

These modify:

smoothing
zoom behavior
drift
framing bias
transition pacing

without changing:

simulation
route systems
rendering pipeline
Transition System

All mode changes MUST interpolate.

Forbidden:

camera.x = target;
camera.zoom = zoom;

Required:

lerp
easing
timed interpolation

Transitions are part of:

presentation language
Camera Transform Rules

Camera outputs ONLY:

{
x,
y,
zoom
}

Renderer applies transforms.

Camera MUST NOT:

draw directly
mutate render layers
modify actor visuals
Split-View Rule

Future split-screen modes MUST use:

multiple observers

NOT:

multiple worlds

Meaning:

same simulation
same route world
different camera transforms

This preserves:

synchronization
determinism
OBS consistency
HUD Ownership

HUD belongs to:

presentation layer

NOT:

simulation
renderer core
camera core

Camera may expose:

speed
mode
focus target
route framing

HUD renders separately.

Future Compatibility

This architecture must support:

subway traversal
ecology observation
replay systems
cinematic intros
autonomous camera tours
desktop mode
multi-camera streaming
3D world transition
map/world hybrid rendering

WITHOUT:

rewriting camera ownership
Forbidden Patterns
❌ Camera Physics Ownership
camera.vx += ...

No spring-physics spaghetti.

Keep deterministic interpolation.

❌ Renderer Camera Logic

Renderer must not:

decide framing
compute follow behavior
mutate zoom
❌ Route Mutation From Camera

Camera cannot:

alter traversal
alter timing
alter actor movement
❌ Mode-Specific Renderer Forks

Do NOT create:

renderOverview()
renderFollow()
renderCinematic()

There must remain:

one renderer
many observation transforms
Long-Term Philosophy

WOS is becoming:

a living musical observatory

The camera is:

the consciousness drifting through the world

The viewer experiences:

pacing
atmosphere
movement
infrastructure
ecology

through the camera.

This system is now foundational infrastructure.

Protect its boundaries carefully.

Implementation Guide
Where this applies
engine/routeCamera.js
render/canvasRenderer.js
Route World renderer integration
future OBS/split-view systems
What to protect
ownership boundaries
runtime vs persistent separation
renderer independence
transform purity
What to expect
cleaner future expansion
safer multi-camera support
easier cinematic systems
fewer renderer regressions
