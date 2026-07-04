0514_WOS_FieldVisualizer_v1.0.0
Purpose

Introduce a dedicated visual debugging + atmospheric rendering layer for world flow fields so users can immediately perceive environmental influence on walkers, particles, trails, and future physics objects.

This system solves the current issue where:

flow physics technically work
but remain visually imperceptible
causing walkers to appear random instead of environmentally influenced

The visualizer is BOTH:

a debugging system
and the foundation for future environmental aesthetics
Goals
Immediate Goals
Make field influence visually obvious
Reveal flow direction
Reveal drift strength
Reveal orbital/tangential motion
Allow tuning of physics perceptually
Long-Term Goals
Atmospheric worlds
Living environments
Weather-like motion systems
Magnetic/electric visualization
Fluid simulation aesthetics
Audio-reactive environmental behavior
Core Architecture
New State Object
state.fieldVisualizer = {
enabled: true,

mode: "vectors", // vectors | particles | trails | heatmap

opacity: 0.18,

density: 24,

scale: 32,

animate: true,

showWalkerInfluence: true,

showDriftVectors: true,

driftVectorScale: 18,

particleCount: 120,

particleSpeed: 1.0,

particleLife: 120,

heatmap: false,

debugColors: false
};
Rendering Pipeline
New Renderer Function
renderFieldVisualizer(ctx)

Inject AFTER:

renderBackground()

Inject BEFORE:

renderObjects()

Reason:

field belongs to environment layer
objects should exist ABOVE atmosphere
trails should blend THROUGH field
Field Sampling
Core Helper
sampleFieldVector(x, y)

Returns:

{
x: vx,
y: vy,
magnitude,
angle
}

Centralizes:

world vector direction
orbital fields
curl noise
turbulence
future modifiers

ALL systems should use this helper.

This becomes the unified environmental query API.

MODE 1 — VECTOR FIELD
Purpose

Debug readability.

Most important first implementation.

Visual

Tiny directional strokes across canvas:

→ → ↗ ↗ ↑
→ → ↗ ↑ ↑
→ ↗ ↑ ↑ ↖

Low opacity.

Subtle movement.

Render Logic

Grid sample:

for (y += density)
for (x += density)

At each point:

const flow = sampleFieldVector(x, y);

Draw:

line from:
(x, y)

to:
(x + flow.x _ scale,
y + flow.y _ scale)
Style
ctx.lineWidth = 1;
ctx.globalAlpha = opacity;
ctx.strokeStyle = "rgba(120,255,220,0.4)";

Rounded caps.

Soft additive blending optional later.

MODE 2 — DRIFT VECTORS
Purpose

Reveal walker influence directly.

Walker Overlay

For each walker:

tailX = walker.x - walker.\_driftVx _ scale;
tailY = walker.y - walker.\_driftVy _ scale;

Render:

directional tail
glow streak
motion vector
Optional Color Mapping

Map drift magnitude:

Drift Color
Low White
Medium Orange
High Cyan
MODE 3 — FLOW PARTICLES
Purpose

Atmospheric environmental motion.

Most aesthetically important mode.

Behavior

Independent particles:

spawned globally
drift WITH field
reveal motion continuity
Particle Object
{
x,
y,
vx,
vy,
life,
maxLife
}
Update

Each frame:

flow = sampleFieldVector(x, y)

vx += flow.x _ strength
vy += flow.y _ strength

x += vx
y += vy

Apply:

damping
wrapping
fade over lifetime
Visual Style

Tiny:

dust
embers
stars
fog
ash

Extremely subtle.

MODE 4 — FLOW TRAILS
Purpose

Reveal environmental currents over time.

Inspired by:

fluid sims
weather maps
magnetic fields
Method

Particles leave:

persistent alpha trails
or additive line accumulation

Result:

elegant environmental streamlines
MODE 5 — HEATMAP
Purpose

Debug field strength distribution.

Not aesthetic.

Pure diagnostic.

Mapping

Magnitude → color:

blue = weak
red = strong

Useful for:

orbital tuning
turbulence testing
collision fields
Orbital Field Upgrade
Problem

Current orbital fields visually imply:

circular force
gravitational structure

But internally act mostly as:

directional drift

Mismatch.

Solution
Add Tangential Mode

New state:

state.world.physics.flow.orbitalMode = "radial";
// radial | tangential | hybrid
Tangential Math

Given center vector:

dx = x - centerX
dy = y - centerY

Tangential:

tx = -dy
ty = dx

Normalize.

This creates:

orbiting motion
circulation
galaxy-like behavior

Instead of:

direct inward pull
Performance
Safe Limits
Feature Cost
Vector grid Low
Walker vectors Very low
Flow particles Medium
Trails Medium/high
Heatmap Medium
Recommended Defaults
density: 32
particleCount: 80
opacity: 0.15
UI Integration
World → Field Panel

Add:

FIELD VISUALIZER
[✓] Enabled

Mode:
[VECTOR ▼]

Density
[-----|----]

Opacity
[----|-----]

Scale
[------|--]

Particles
[-----|----]

[✓] Walker Drift Vectors
[✓] Animate
Future Extensions
Curl Noise

Swirling fields:

smoke
vortexes
liquid motion
Audio-Reactive Fields

Bass:

increases turbulence

Treble:

increases particle sparkle

Kick:

radial pulses
Object-Affecting Fields

Objects emit local field distortion:

gravity wells
repulsion zones
magnetic attractors
Architectural Importance

This system establishes:

WORLD = ACTIVE MEDIUM

Instead of:

OBJECTS MOVING THROUGH EMPTY SPACE

This is a foundational shift in WOS identity.

The environment itself becomes:

visible
musical
reactive
alive
Recommended Build Order
Phase 1
vector field renderer
walker drift vectors
sampleFieldVector()
Phase 2
tangential orbital mode
particle flow system
Phase 3
trails
curl noise
audio reactivity
Implementation Guide
Add state.fieldVisualizer near world physics state
Create sampleFieldVector(x, y) as centralized field query helper
Inject renderFieldVisualizer(ctx) before object rendering in main render loop
