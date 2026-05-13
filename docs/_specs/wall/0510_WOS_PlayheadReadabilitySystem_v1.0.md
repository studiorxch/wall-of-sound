0510_WOS_PlayheadReadabilitySystem_v1.0.0
Purpose

Establish a clear visual language for:

what is moving
what is being triggered
what caused activation
where energy is traveling

This is not an “effect pass.”

This is a causality readability system.

The goal is for a first-time viewer to immediately understand:

the moving object is causing the world to react

without needing audio.

Core Problem

Current state:

world reacts
✓ looks alive

but...

source of activation
✗ not visually obvious enough

The viewer can see:

tiles pulsing
propagation
atmospheric response

…but cannot instantly identify:

the active playhead
the current collision source
traversal direction
interaction ownership

Result:
the system can still read like autonomous ambient animation instead of a navigated sound world.

Design Goal

WOS must visually communicate:

motion
→ collision
→ propagation
→ decay

as one coherent chain.

Phase 1 Scope

This pass introduces:

Playhead Halo
Motion Trail
Collision Flash
Energy Directionality
Ownership Timing
Traversal Weight

NO:

particles
bloom systems
shaders
screen FX
postprocessing

Canvas-native only.

1. PLAYHEAD HALO
   Purpose

The eye must immediately lock onto the active traversal object.

Current walkers are too visually equivalent to surrounding activity.

Add

Each active walker gains:

walker.visual = {
haloRadius: 18,
haloAlpha: 0.18,
haloPulse: true,
trailEnabled: true
};
Render Rules
Base Halo

Draw BEFORE walker node:

soft radial circle

Characteristics:

low alpha
larger than walker
stable center
color derived from note color
Pulse Behavior

Halo pulse tied to traversal velocity:

faster movement
→ stronger pulse

NOT BPM.

Formula
pulse =
0.65 +
Math.sin(time _ 0.008 + walker.idHash) _ 0.12 +
speedNorm \* 0.22;
Visual Intent

The walker should feel like:

electrical pressure

not:

character
particle
orb
game enemy 2. MOTION TRAIL
Purpose

Reveal:

movement direction
recent history
traversal continuity

Without trails:
movement readability collapses during dense activation.

Add

Per walker:

walker.trail = [];

Store:

x
y
timestamp
Trail Rules

Keep:

last 12–20 positions
time-based decay
evenly spaced sampling
Render Style

NOT:

neon streaks
additive blur
long ribbons

Instead:

architectural residue

Use:

thin rectangles
square dots
segmented marks

Inspired by:

subway signal systems
oscilloscope persistence
plotted infrastructure maps
Trail Opacity

Newest:

~0.22 alpha

Oldest:

~0.02 alpha
Important

Trail must NEVER overpower:

grid
propagation
atmosphere

Trail is:

guidance

not spectacle.

3. COLLISION FLASH
   Purpose

Viewer must immediately understand:

THIS interaction caused the activation
Add

On collision:

block.\_collisionFlash = {
energy,
startTime,
sourceWalkerId
};
Render Behavior

Collision flash occurs BEFORE propagation.

Very short:

80–140ms
Visual

Draw:

crisp white inset
tiny scale punch
optional directional edge emphasis

NOT:

bloom
explosion
particle burst
Timing Hierarchy
collision flash
→ origin activation
→ neighbor propagation
→ atmospheric decay

This sequencing is critical.

4. ENERGY DIRECTIONALITY
   Purpose

Current propagation is omnidirectional.

Needs subtle directional bias.

Add

Propagation stores:

directionX
directionY

derived from:

walker velocity
collision vector
emitter direction
Visual Result

Neighbor activation should bias:

brighter
larger
slightly longer

in the direction energy traveled.

Example

Instead of:

uniform ripple

you get:

electrical drift 5. OWNERSHIP TIMING
Purpose

Multiple walkers must remain readable simultaneously.

Add

Each signal carries:

sourceWalkerId
sourceColor
generation
Rules

Origin:

strongest ownership

Neighbors:

ownership fades rapidly
Result

Viewer can follow:

which walker caused what
overlapping traversal systems
interaction zones

without confusion.

6. TRAVERSAL WEIGHT
   Purpose

Movement currently feels visually massless.

Need slight environmental pressure.

Add

Walker velocity affects:

halo size
collision strength
trail spacing
propagation intensity
Important

DO NOT:

add inertia wobble
make walkers bouncy
cartoonize movement

This is:

system pressure

not physics comedy.

Rendering Order

Critical.

Correct Order
macro atmosphere
→ dormant grid
→ trail residue
→ propagation glow
→ collision flash
→ active blocks
→ playhead halo
→ walker core
→ signal noise
Performance Constraints

Must remain:

Canvas 2D
mobile-safe
OBS-safe
export-safe

Avoid:

excessive gradients
large blur radii
save/restore spam
additive compositing loops
Architectural Rule

Playhead readability must remain:

systemic

NOT:

game UI
character FX
VJ particles
synthwave visuals

The world itself should reveal causality.

Expected Result

Before:

beautiful reactive grid

After:

navigable audiovisual infrastructure

Viewer should subconsciously understand:

movement creates sound

within seconds.

Success Criteria

Viewer can instantly identify:

active traversal source
movement direction
interaction timing
propagation ownership
recent traversal history

without explanation or audio.

File Targets
main.js
gridSystem.js
walkerSystem.js
collision.js
render/canvasRenderer.js
