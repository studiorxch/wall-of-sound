0517B_WOS_CameraCuriosityValidationAndPassengerMode_v1.0.0

Generated: 05/17/2026
System: WOS
Domain: Camera / Ecology / Passenger Mode
Status: Active
Depends On:

0517A_WOS_CameraCuriosity_v1.0.0
ClusterEvents
MusicEcology
DirectorMode
CorridorRenderer
Purpose

Stabilize and validate the first true autonomous documentary camera behavior in WOS.

This phase is NOT about adding more intelligence.

This phase is about:

trust
smoothness
emotional readability
cinematic pacing
non-chaotic autonomous viewing

The camera must begin feeling like:

a quiet observer
a documentary operator
a passenger
an urban wildlife cinematographer

NOT:

a debug camera
a random AI drone
a security system
a twitchy RTS camera
Core Principle

The camera follows:

significance
not motion

The system should feel:

patient
selective
emotionally weighted
observational
Goals
Goal 1 — Stable Passenger Mode

When:

state.world.cameraCuriosity.drivingCamera = true

the camera should:

remain visually calm
avoid abrupt target swaps
maintain cinematic continuity
never “panic cut”
Goal 2 — Emotional Readability

The viewer should understand:

WHAT the camera cares about
WHY it moved
HOW LONG it intends to stay

without needing debug overlays.

Goal 3 — Long-Form Viability

The system must support:

30 minutes
2 hours
eventually 24/7

without:

fatigue
hyperactivity
constant zooming
repetitive bouncing
Validation Layer

1. Curiosity Cooldown System
   Problem

Current node selection can repeatedly revisit:

same district
same hotspot
same event cluster

creating:

obsessive loops
visual fatigue
Required

Add per-node cooldown memory.

cfg.recentTargets = [
{
id,
releasedAt,
cooldownUntil,
}
];
Selection Penalty

Nodes inside cooldown receive score reduction:

finalScore \*= 0.15;

unless:

score exceeds emergency threshold
event escalated significantly
Emergency Override

Allow breaking cooldown if:

node.score >= 0.92

Examples:

massive crowd spike
train collision
rooftop explosion
weather anomaly
high-density nightlife 2. Target Stickiness
Problem

Camera should not abandon a target every evaluation cycle.

Required

Add target persistence multiplier:

if (sameTarget) {
score \*= persistenceMultiplier;
}
Default
cfg.targetPersistenceMultiplier = 1.35;
Result

Camera becomes:

loyal
observational
deliberate

instead of:

opportunistic
jittery 3. Camera Velocity Clamp
Problem

Long-distance jumps feel synthetic.

Required

Clamp camera movement speed.

Add
cfg.maxCameraVelocity = 14;

world units/frame

Rule

Even when:

target changes
curiosity spikes

camera still travels physically through space.

No teleport feeling.

4. Zoom Discipline
   Problem

Frequent zoom changes create nausea/fatigue.

Required

Introduce zoom deadzone.

Add
cfg.zoomDeadzone = 0.08;

If target zoom difference:

Math.abs(targetZoom - cam.targetZoom) < deadzone

DO NOT update zoom.

Result

Zoom becomes:

rare
meaningful
cinematic

instead of:

reactive
noisy 5. Observe Drift
Problem

Observe mode currently risks feeling frozen.

Required

While observing:

add ultra-subtle drift
micro parallax
handheld documentary motion

WITHOUT visible shaking.

Add
cfg.observeDriftRadius = 24;
cfg.observeDriftSpeed = 0.03;
Behavior

Camera slowly orbits:

around subject
around crowd
around hotspot

like:

human curiosity
slight operator repositioning 6. Release Smoothing
Problem

Exiting observe state can feel abrupt.

Required

Add transitional release easing.

Add
cfg.releaseBlendTime = 6.0;

seconds

Behavior

During release:

reduce emotional attachment gradually
widen framing slowly
ease toward idle drift

NOT:

hard exit
immediate abandon 7. Passenger Camera Modes

Add camera behavior presets.

Required Modes
Wander
mode: "wander"

Behavior:

broad exploration
scenic movement
low curiosity threshold
relaxed pacing

Use:

ambient streams
sleep mode
lo-fi city exploration
Documentary
mode: "documentary"

Behavior:

balanced observation
moderate linger
event-driven
emotionally weighted

DEFAULT MODE.

Hunter
mode: "hunter"

Behavior:

aggressively seeks spikes
high responsiveness
tighter zooms
shorter cooldowns

Use:

action-heavy episodes
nightlife
traffic chaos
event reels
Zen
mode: "zen"

Behavior:

avoids chaos
prefers parks/water
wide framing
minimal movement

Use:

passive streams
meditation
ambient worlds
Config
cfg.passengerMode = "documentary"; 8. Curiosity Metrics API

Expose readable telemetry.

Required
SBE.CameraCuriosity.getMetrics(state)

Returns:

{
state,
passengerMode,
currentTargetId,
currentTargetType,
curiosityScore,
observeRemaining,
nodeCount,
recentTargets,
cameraVelocity,
zoom,
} 9. Passenger Debug Overlay Improvements

Current overlay is strong.

Now improve readability.

Add
Heat Falloff Rings

Around target:

fading influence radius
emotional influence visualization
Cooldown Visualization

Recent targets:

faded grey rings
dashed decay outlines
Camera Trail

Optional:

cfg.debugCameraTrail = true;

Shows:

last 20 camera positions
reveals pacing quality 10. Idle Drift Intelligence
Problem

Idle drift currently risks randomness.

Required

Idle wandering should prefer:

roads
districts
scenic corridors
active ecology

Avoid:

empty void space
off-map dead zones
Add

Weighted drift scoring:

wanderScore =
scenicValue +
districtDensity +
flowPressure; 11. Audio Awareness Hook (Preparation)

NOT full implementation yet.

Only establish hook.

Add
cfg.audioAwareness = {
enabled: false,
rhythmWeight: 0.0,
densityWeight: 0.0,
harmonyWeight: 0.0,
};

Future:

camera responds to soundtrack evolution
musical tension
rhythm escalation
silence 12. Hard Constraints
MUST NOT
snap camera
constantly zoom
rapidly retarget
shake violently
revisit same hotspot endlessly
center perfectly every frame
feel robotic
MUST
feel observational
preserve inertia
preserve emotional continuity
preserve geographic continuity
allow boredom sometimes

Boredom is important.

Real documentaries breathe.

Integration
main.js

Validate ordering remains:

ClusterEvents
→ CameraCuriosity.tick()
→ MusicEcology
→ renderers

Camera curiosity must remain:

AFTER ecology generation
BEFORE music response/render logic
Rendering

Maintain world-space rendering:

ctx already transformed

DO NOT:

reapply camera transforms
render in screen space
Suggested Test Scenarios
Test 1 — Single Event

Spawn:

one rooftop event

Expected:

investigate
observe
release

No jitter.

Test 2 — Competing Events

Spawn:

rooftop
nightlife
transit delay

Expected:

meaningful prioritization
no rapid swapping
Test 3 — Long Idle

No events for:

3+ minutes

Expected:

scenic drifting
calm pacing
no dead camera
Test 4 — Event Escalation

Increase score during observe.

Expected:

longer linger
stronger focus
possible zoom tightening
Test 5 — Dense Chaos

Spawn:

20+ hotspots

Expected:

stable selection
no seizure camera
meaningful hierarchy
Success Criteria

Passenger Mode is successful when:

camera can run unattended
movement feels authored
users enjoy WATCHING
pacing feels cinematic
calm moments exist
system feels emotionally intelligent
Future Direction (NOT THIS SPEC)

Later:

actor following
conversation framing
multi-camera editing
cinematic cuts
replay memory
predictive curiosity
soundtrack-driven cinematography
episode generation
AI narration

NOT NOW.

This phase is:

pacing
trust
watchability
emotional continuity
Final Principle

The camera is no longer:

a viewport

It is becoming:

a character
a witness
a passenger consciousness

WOS stops being:

a tool

and starts becoming:

a place to watch.
