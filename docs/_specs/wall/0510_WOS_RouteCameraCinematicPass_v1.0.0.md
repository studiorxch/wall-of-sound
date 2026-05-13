0510_WOS_RouteCameraCinematicPass_v1.0.0

Version: v1.0.0
Date: 2026-05-10
System: Wall of Sound (WOS)
Domain: Route World / Camera / Presentation
Status: READY FOR IMPLEMENTATION

Purpose

Transform Route World from:

"car moving on a path"

into:

"cinematic traversal through a living route"

This pass focuses entirely on:

camera behavior
route readability
cinematic pacing
motion feel
presentation quality
stream/demo clarity

No traffic simulation.
No AI routing.
No map tiles.
No multiplayer.

This is a presentation + immersion layer.

Goals
Primary Goals

1. Cinematic Follow Camera

Camera should:

smoothly follow the hero car
anticipate motion
reduce jitter
create a sense of momentum 2. Route Readability

Viewer must immediately understand:

where the car is
where it is heading
what direction the route flows
speed + movement energy 3. Demo / Stream Quality

The route system should become:

visually watchable
loop-friendly
OBS-ready
emotionally calming
Architectural Principles
Camera Is a Rig

Do NOT treat camera as:

camera.x = actor.x;
camera.y = actor.y;

Instead:

cameraRig
targetPosition
smoothedPosition
lookAhead
velocityResponse
zoomState
mode

Camera becomes its own simulation object.

Presentation Layer Only

This pass MUST NOT modify:

route geometry
ingestion pipeline
event systems
world simulation architecture

Only visual + camera behavior.

New State Structure

Add to:

state.routeWorld.camera
Camera State
state.routeWorld.camera = {
mode: "follow", // follow | overview | cinematic

x: 0,
y: 0,

targetX: 0,
targetY: 0,

zoom: 1,
targetZoom: 1,

smoothing: 0.08,
zoomSmoothing: 0.06,

lookAheadDistance: 140,

velocityInfluence: 0.35,

deadZone: 40,

cinematicTilt: 0,

shakeAmount: 0,

overviewPadding: 160,

routeFitZoom: 1,

enabled: true
};
Camera Modes

1. FOLLOW MODE

Default mode.

Camera:

follows hero car
uses look-ahead
smooth interpolation
slight velocity anticipation
Follow Logic

Camera target should NOT be:

car.x
car.y

Instead:

target =
car.position +
(car.forwardVector \* lookAheadDistance)

This creates anticipation.

Velocity Influence

Higher speed slightly increases:

look-ahead
zoom-out
smoothing

Result:

fast movement = wider cinematic feel
slow movement = intimate close-up 2. OVERVIEW MODE

Static full-route framing.

Used for:

loading
attract mode
map preview
transitions
Behavior

Camera automatically fits:

entire route bounds

Uses:

fitRouteToCanvas()

but through camera zoom/pan rather than route reprojection.

3. CINEMATIC MODE

Experimental presentation mode.

Adds:

subtle drift
velocity lag
slight camera sway
eased zoom breathing

Must remain subtle.

NO:

handheld shake
fake action movie wobble
excessive rotation

Think:

late-night dashboard camera

not:

Fast & Furious
Camera Update Loop

Create:

engine/routeCamera.js
Public API
updateRouteCamera(dt)
setRouteCameraMode(mode)
fitRouteOverview()
getRouteCameraTransform()
Core Update Flow

Each frame:

1. Find hero car
2. Compute forward vector
3. Compute look-ahead target
4. Apply dead zone
5. Smooth camera movement
6. Smooth zoom
7. Apply cinematic modifiers
8. Export transform
   Dead Zone

Prevent micro jitter.

If hero car remains within:

deadZone

camera should NOT aggressively reposition.

Use:

small center rectangle

conceptually similar to platformer cameras.

Zoom System
Dynamic Zoom

Zoom reacts to speed.

Example:

Speed Zoom
stopped 1.15
slow 1.0
fast 0.82
Formula

Example:

targetZoom =
baseZoom -
(speedNormalized \* 0.25);

Smoothed with:

lerp()
Route Trail System

Add visual readability layer.

Hero Trail

Hero car leaves subtle fading trail.

Purpose:

emphasize movement
improve readability
create ambient rhythm
Trail State
actor.trail = [
{ x, y, t }
];
Limits
maxTrailPoints = 60
Rendering

Use:

additive alpha
fading opacity
soft width taper

NO:

glowing rainbow trails
arcade aesthetics

Think:

light memory
Route Direction Indicators

Optional but important.

Route Pulse

Very subtle pulse moving along route direction.

Purpose:

clarify route flow

Can be:

tiny moving dashes
traveling alpha pulse
directional gradient sweep
Constraints

Must remain:

ambient
low-noise
background-level
Headlight System

Hero car gains forward illumination cone.

Purpose

Creates:

directional clarity
night-driving atmosphere
focus framing
Visual Style

Soft:

triangular gradient cone

Very low opacity.

Render Order
route
→ trail
→ headlight glow
→ hero car
→ HUD
HUD Layer

Minimal cinematic overlay.

HUD Position

Bottom-left default.

HUD Contents
ROUTE NAME
SPEED
DISTANCE
MODE
TIME

Example:

BROADWAY LOOP
42 KPH
3.2 KM
FOLLOW
23:41
HUD Style

Inspired by:

late-night transit systems
minimalist navigation UIs
ambient cybernetic overlays

Use:

monospaced font
low-contrast white
subtle opacity

NO:

game HUD clutter
minimaps
giant UI panels
Camera Transition System

Switching modes should NEVER snap.

Required

Transitions between:

overview ↔ follow
follow ↔ cinematic

must interpolate:

position
zoom
drift
New Controls

Add to Route World panel.

Camera Mode Dropdown
Overview
Follow
Cinematic
Toggle Controls
[ ] Dynamic Zoom
[ ] Hero Trail
[ ] Headlight
[ ] Route Flow Indicators
Keyboard Shortcuts
1 → Overview
2 → Follow
3 → Cinematic
F → Fit Route
Renderer Integration

Modify:

render/canvasRenderer.js
Required Camera Transform

All route-world rendering must support:

ctx.translate(camera.x, camera.y)
ctx.scale(camera.zoom, camera.zoom)

WITHOUT breaking:

existing WOS object rendering
UI overlays
inspector systems
Layering Order

Required order:

world background
→ route lines
→ flow indicators
→ route trail
→ headlights
→ actors
→ labels
→ HUD
→ UI
Performance Constraints

Must remain:

60fps on mid-range laptop
Optimization Rules

Trail rendering:

pooled arrays
capped points
no allocations per frame

Camera:

single-pass math only
no physics engine dependency

HUD:

cache static text where possible
Future Compatibility

This pass prepares for:

subway traversal
walking mode
ambient field recording overlays
GPS playback
replay systems
multi-camera streaming
split-screen route worlds
Explicit Non-Goals

Do NOT implement:

traffic AI
minimap
street labels
GPS APIs
real map tiles
collision systems
3D camera tilt
terrain
physics rewrite
Acceptance Criteria

Implementation is complete when:

Camera
follow camera feels smooth
no jitter
look-ahead works
zoom reacts to speed
transitions interpolate cleanly
Presentation
route traversal feels cinematic
hero movement readable at all zoom levels
trail improves motion clarity
headlight adds atmosphere
Stability
save/load unaffected
route ingestion unaffected
no renderer regressions
no canvas transform corruption
Suggested File Changes
File Change
engine/routeCamera.js NEW
render/canvasRenderer.js Camera transform integration
main.js Camera update loop
ui/controls.js Route camera controls
index.html Camera UI section
state/sceneManager.js Persist camera state
engine/routeWorld.js Hook camera helpers
Implementation Notes
Camera Smoothing

Recommended:

camera.x += (targetX - camera.x) _ smoothing;
camera.y += (targetY - camera.y) _ smoothing;

NOT spring physics.

Keep deterministic.

Forward Vector

Compute from:

nextPoint - currentPoint

normalized.

Avoid velocity-only direction.

Zoom Clamp

Clamp zoom:

0.45 → 2.2
Final Vision

This system should eventually feel like:

a living ambient route documentary

where:

motion becomes music
traversal becomes atmosphere
maps become emotional spaces

The viewer should want to leave it running continuously.

Implementation Guide
Where code goes
engine/routeCamera.js
renderer integration in render/canvasRenderer.js
controls in ui/controls.js
What to run
npm run dev

then:

Import route
Add hero car
Press Start
Toggle camera modes
What to expect
smooth cinematic traversal
readable route flow
OBS-friendly presentation
stable save/load behavior
