👉 0508_WOS_ActiveSignalRevealSystem_v1.0.0

Generated: 05/08/2026
Target: main.js, render/canvasRenderer.js, gridSystem.js, particleSystem.js

Purpose

Restore musical legibility and reactive clarity to the environmental grid renderer.

Current state:

world composition = strong
atmosphere = strong
formation logic = emerging
musical visibility = weak

This system introduces:

Dormant World → Trigger → Local Activation → Fade

The world should feel:

quiet while idle
alive during playback
readable through activation
atmospheric without permanent noise
Core Principle

DO NOT make all notes permanently visible.

Instead:

events temporarily illuminate structure

This preserves:

mystery
atmosphere
depth
hierarchy
calmness

while restoring:

rhythm visibility
note relationships
timing readability
interaction feedback
Architecture
New Runtime Layer

Add transient activation runtime state.

state.signalActivity = {
active: new Map(),
};

Map key:

gridCellId

Value:

{
energy: 0–1,
activatedAt: performance.now(),
decayMs: 900,
velocity: 0–127,
sourceId: string,
}
Activation Sources
MUST trigger activation
MIDI Playback
note-on
walker-triggered note
imported MIDI playback
Collisions
ball ↔ line
walker ↔ note
particle ↔ note (future)
Emitters
periodic pulse emitters
sequencer emitters
Grid Cell Activation API

Add:

activateGridCell(cellId, energy, meta)
Implementation
function activateGridCell(cellId, energy, meta) {
if (!cellId) return;

state.signalActivity.active.set(cellId, {
energy: Math.max(0, Math.min(1, energy || 1)),
activatedAt: performance.now(),
decayMs: meta && meta.decayMs || 900,
velocity: meta && meta.velocity || 100,
sourceId: meta && meta.sourceId || null,
});
}
Activation Decay

Add update pass each frame.

function updateSignalActivity(now) {
state.signalActivity.active.forEach(function(v, key) {
var age = now - v.activatedAt;

    if (age >= v.decayMs) {
      state.signalActivity.active.delete(key);
    }

});
}

Call inside main update loop.

Grid Cell Runtime State

Each rendered note block must expose:

cell.id

Stable ID format:

bankId + "\_" + noteIndex

Example:

bank_01_note_00421
Renderer Changes
Goal

World remains subtle.

Activated notes become:

brighter
larger
clearer
briefly alive
Visual Activation Rules
Dormant State

Current appearance retained:

low opacity
quiet
atmospheric
Active State

When activated:

Brightness
+45–65%
Scale
1.15–1.35x
Glow

Soft radial bloom behind note.

NOT:

neon
EDM glow
heavy blur

Think:

signal pulse
Fade Curve

Use exponential easing.

activity = 1 - (age / decayMs)
activity = activity \* activity

Result:

fast attack
smooth decay
cinematic fade
Neighbor Propagation
Purpose

Reveal local relationships.

When a note activates:

nearby notes subtly respond
clusters feel connected
formations become readable
Rules

Radius:

1–3 neighboring cells

Strength:

0.15–0.35

Delay:

0–120ms randomized
Implementation

Add lightweight propagation.

activateNeighborCells(originCell, radius, energy)

DO NOT recursively chain infinitely.

Single local pulse only.

Macro Atmosphere Interaction

Current:

\_drawMacroAtmosphere()

must now react subtly to activity.

New Behavior

Nearby arcs:

brighten slightly
shift opacity
softly pulse

VERY subtle.

This creates:

music affects infrastructure

which is critical to WOS identity.

Particle Integration

On activation:

Spawn tiny local response particles.

Profile:

"signal"
New Particle Profile

Add:

signal: {
size: [2, 5],
speed: [8, 28],
life: [0.2, 0.6],
count: 3,
spread: 360,
gravity: 0,
drag: 0.12,
type: "glow",
}

Particles should:

drift minimally
feel electrical
remain sparse
Formation Activation

Entire formations should react cohesively.

If:

formationId exists

then:

neighboring members pulse together
synchronized fade
slight timing offsets

Result:

districts
neighborhoods
signal systems

instead of isolated blocks.

Audio Coupling

Activation energy should derive from:

velocity / 127

NOT constant values.

This restores expressive dynamics visually.

Quiet notes:

soft pulse

Loud notes:

strong reveal
Camera Synergy

This system is REQUIRED before:

cinematic camera
zoom-follow
social exports

because activation becomes the actual focal point.

Without this:
camera motion lacks purpose.

Performance Constraints

MUST remain lightweight.

Avoid:

per-cell blur filters
large shadow blurs
canvas composite spam
expensive neighbor searches

Preferred:

cached adjacency map
tiny radial gradients
simple opacity modulation
Design Constraints
DO
preserve darkness
preserve voids
preserve silence
preserve sparse composition
preserve calmness
DO NOT
turn into rhythm game
constant blinking
rainbow flashing
EDM visualizer
overpower atmosphere
permanently visible notes
Success Criteria

System succeeds when:

users can visually follow rhythm
notes feel alive
world feels dormant between events
clusters reveal relationships
timing becomes readable
atmosphere remains intact
Expected Result

Before:

beautiful static environmental composition

After:

living signal ecology
Implementation Order
Step 1

Add:

state.signalActivity
activateGridCell()
updateSignalActivity()
Step 2

Attach activation to:

MIDI playback
collision events
walker triggers
Step 3

Render active states:

brightness
scale
glow
fade
Step 4

Add neighbor propagation.

Step 5

Add atmosphere coupling + particles.

Final Principle

WOS should not constantly explain itself.

It should reveal itself through interaction.

silence → activation → disappearance

That rhythm is the interface.
