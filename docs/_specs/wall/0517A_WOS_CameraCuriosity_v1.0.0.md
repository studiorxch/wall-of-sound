0517A_WOS_CameraCuriosity_v1.0.0
Overview

Camera Curiosity introduces the first true:

attention ecology system

inside WOS.

Previous systems successfully generate:

pressure
convergence
events
rhythm
actor movement
ecological significance

However:
the world currently lacks:

behavioral attention orchestration

The camera still behaves primarily as:

passive observer
manual viewer
free-floating viewport

Camera Curiosity transforms the camera into:

an emotionally guided documentary intelligence

This system becomes the foundation for:

Passenger Mode
cinematic drifting
automated exploration
stream direction
event investigation
future multi-camera broadcasting
Core Philosophy

The camera should NOT behave like:

security surveillance
omniscient RTS camera
twitchy AI tracking
hard target locking

Instead:
the camera should feel like:

a curious human documentarian

Characteristics:

patient
observant
anticipatory
atmospheric
emotionally responsive
rhythm-aware
Primary Goals

Camera Curiosity should:

Detect significance
Prioritize convergence
Drift toward emotional density
Maintain pacing
Avoid chaotic snapping
Create anticipation
Reveal hidden ecology
Support passive viewing
Enable believable Passenger Mode
Core Concept

The camera does NOT:

follow objects

The camera:

follows significance

This distinction is critical.

Curiosity Signals

The camera evaluates multiple weighted signals.

Each signal contributes to:

curiosityScore
Supported Signals (v1)
Signal Meaning
cluster strength convergence intensity
cameraInterest event importance
actor density social gravity
flow pressure movement compression
music energy emotional escalation
rarity unusual event weight
weather contrast atmospheric uniqueness
sudden change surprise
district activity macro pressure
event lifecycle seed/grow/peak priority
Curiosity Node

Internal normalized target representation:

node = {
id,

type,

x,
y,

score,

radius,

strength,

age,

persistence,

eventState,

districtId
}

Nodes are ephemeral.
Generated every evaluation pass.

Evaluation Loop

Curiosity evaluation runs:

every 2–4 seconds

NOT every frame.

Purpose:

stability
pacing
emotional readability
reduced twitching
Camera States
idle

Low-interest roaming.

Behavior:

slow drift
district wandering
scenic movement
low zoom variation

Purpose:

ambient observation
curious

A weak signal detected.

Behavior:

directional leaning
slower movement
increased linger

Purpose:

attention formation
investigate

Strong convergence target acquired.

Behavior:

travel toward node
framing stabilization
cinematic easing

Purpose:

meaningful exploration
observe

Camera arrived at target.

Behavior:

linger
subtle orbit
slow pans
focus persistence

Purpose:

event witnessing
release

Interest decays.

Behavior:

gradual disengagement
smooth exit
return to drift

Purpose:

emotional decompression
State Machine
idle
↓
curious
↓
investigate
↓
observe
↓
release
↓
idle

Transitions MUST remain:

smooth
cinematic
emotionally legible
Curiosity Score Calculation

Example:

score =
clusterStrength _ 0.30 +
cameraInterest _ 0.25 +
actorDensity _ 0.15 +
flowPressure _ 0.10 +
musicEnergy _ 0.10 +
rarity _ 0.10;

Weights intentionally favor:

social convergence

over raw movement.

Persistence Logic

IMPORTANT:
the camera should NOT constantly switch targets.

Each node gains:

persistence

Purpose:

maintain emotional continuity
prevent camera thrashing
preserve cinematic pacing
Minimum Observe Duration

Defaults:

Event Type Observe Duration
rooftop 45–90s
vendor 20–40s
streetPerformance 60–120s
nightlifeSpill 90–180s
transitDelay 15–30s

Purpose:

allow emotional absorption
Travel Behavior

Travel should:

glide
ease
anticipate
preserve horizon continuity

Avoid:

teleporting
snapping
instant retargeting
Framing Logic

Stage 1 framing priorities:

convergence center
route flow direction
skyline balance
district visibility
actor density

Future versions may include:

cinematic composition
parallax layers
close-up logic
subject prioritization
Music Coupling

Camera curiosity feeds:

musicEcology.\_cameraFocus

Purpose:

soundtrack intensification
emotional synchronization
pacing support

The camera itself becomes:

a musical participant
Calm-State Behavior

When no strong nodes exist:
the camera enters:

ambient drift mode

Behavior:

district cruising
slow map traversal
scenic lingering
route following

This is CRITICAL for:

desktop mode
passive viewing
long-duration sessions
Rarity Amplification

Rare events receive:

rarityMultiplier

Examples:

marathon
parade
blackout
championship
giant concert
flash mob

Purpose:

prioritize cultural significance
Event Anticipation

Future scheduled events may emit:

futurePressure

The camera may:

pre-position
travel early
anticipate buildup

Purpose:

create cinematic foresight
Debug Visualization

Optional debug-only overlays:

Overlay Purpose
curiosity rings active nodes
score labels evaluation visibility
target vectors current direction
linger timers observe state
state labels camera mode

Debug gated:

state.world.cameraCuriosity.debugDraw
Runtime State
state.world.cameraCuriosity = {
enabled: true,

state: "idle",

currentTarget: null,

currentScore: 0,

lingerUntil: 0,

reevaluateAt: 0,

debugDraw: false,

metrics: {
nodes: 0,
strongest: 0,
stateTime: 0
}
}
Suggested Runtime API
SBE.CameraCuriosity.tick(state, dt)

SBE.CameraCuriosity.collectNodes(state)

SBE.CameraCuriosity.evaluate(state)

SBE.CameraCuriosity.setTarget(node)

SBE.CameraCuriosity.clearTarget()

SBE.CameraCuriosity.getMetrics(state)
Camera Movement Constraints

Camera MUST preserve:

readability
calmness
atmospheric pacing

Avoid:

rapid cuts
hyperactivity
constant zooming
excessive rotation

Target feeling:

late-night documentary drifting through a living city
Success Criteria

The system succeeds when:

users feel intentional attention
the camera appears curious
convergence feels discovered
atmosphere feels guided
Passenger Mode becomes watchable
event escalation becomes emotionally legible

without:

scripting
hard cinematics
manual camera control
forced narratives
Future Expansion Hooks

Future systems may extend:

multi-camera broadcasting
AI news hosts
district coverage priorities
event journalism
live editing systems
social trend following
user-submitted events
Twitch audience voting
actor POV transitions
subway-rider passenger mode
cinematic route planning
Key Principle

Camera Curiosity is:

the emotional attention system of WOS

It transforms:

invisible simulation activity

into:

watchable atmospheric narrative

without sacrificing:

emergence
pacing
ecological coherence
passive usability
long-form immersion
