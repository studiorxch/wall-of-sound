0517E_WOS_SpatialEcologyDensity_v1.0.0

Generated: 05/17/2026
System: WOS
Domain: Spatial Atmosphere / Environmental Density / City Presence
Status: Active
Depends On:

0517D_WOS_WorldReadabilityAndStageLighting_v1.0.0
CorridorRenderer
StageLightingRenderer
ClusterEvents
ActorEcology
TrafficEcology
CameraCuriosity
PassengerDemo
Purpose

The corridor is now readable.

However:

the city surrounding the corridor still lacks mass

Current visual state:

isolated illuminated route floating in darkness

Desired visual state:

living nighttime urban organism

This spec introduces:

spatial ecology density

NOT:

realism
literal buildings
map rendering
detailed simulation visuals

The goal is:

ambient environmental presence
Core Principle

WOS should feel like:

a city sensed through atmosphere

NOT:

a GIS application
Main Goal

Create the feeling that:

life exists beyond the corridor
activity extends into surrounding space
the route belongs to a larger organism
the city breathes continuously

WITHOUT:

explicit detail
literal representation
clutter
Visual Philosophy

The city should behave visually like:

weather systems
biological colonies
neural activity
nighttime aerial photography
urban heat maps
ambient radar
DO NOT BUILD
detailed buildings
literal streets
realistic traffic rendering
photoreal maps
icons everywhere
excessive labels
BUILD
environmental mass
atmospheric density
movement implication
urban breathing
spatial rhythm
Priority 1 — District Mass Fields
Problem

Districts currently exist as:

points
fog blooms
isolated glows

They still do not feel:

inhabited
Required

Introduce:

large-scale district atmospheric bodies
Add
Multi-layer district clouds

Each district should render:

outer low-frequency atmospheric mass
mid-density activity field
inner brighter activity core
Layer Structure
Outer Layer
enormous radius
extremely low alpha
very soft edge
slow movement drift

Purpose:

city-scale atmospheric continuity
Mid Layer
energy reactive
nightlife reactive
pressure reactive

Purpose:

regional activity perception
Inner Layer
localized density
event-sensitive
brighter concentration

Purpose:

attention gravity
Motion

District fields should:

drift subtly
pulse independently
never synchronize globally
Constraints

Avoid:

obvious circles
perfect symmetry
hard radial gradients

Goal:

organic urban weather
Priority 2 — Traffic Ecology Traces
Problem

Traffic ecology currently exists:

numerically
behaviorally

but visually:

motionless
Required

Render:

traffic memory traces

NOT:

cars
literal roads
detailed vehicles
Add
Directional flow streaks

Very subtle:

drifting line segments
fading motion streaks
corridor shimmer movement
route pressure drift
Behavior

Traffic traces should:

move along corridor direction
accelerate with pressure
widen during nightlife
soften during calm
Density

Density derived from:

traffic pressure
active events
district energy
time-of-day
Goal

The viewer should subconsciously feel:

constant urban circulation
Priority 3 — Secondary Corridor Branches
Problem

Current route feels:

isolated

There are no:

supporting paths
peripheral movement structures
surrounding urban connective tissue
Required

Add:

secondary faint corridor structures
These Are NOT Roads

They are:

movement tendencies
ecological vectors
implied circulation paths
Rendering

Very faint:

low opacity
thin width
soft blur
intermittent visibility
Behavior

Secondary corridors should:

react to pressure
brighten during nearby activity
fade during calm
occasionally pulse
Goal

Create:

city-wide connectedness

instead of:

single-route isolation
Priority 4 — Spatial Drift Particles
Problem

The world currently lacks:

micro-motion
Required

Introduce:

ambient ecological drift
Add
Slow atmospheric particles

Examples:

drifting glow specks
distant motion traces
atmospheric movement fragments
urban dust
Behavior

Particles should:

drift slowly
react to district energy
cluster near events
remain sparse
Constraints

Avoid:

snow effect
starfield effect
screensaver behavior
overpopulation

Goal:

barely noticeable life movement
Priority 5 — Urban Depth Haze
Problem

The world still lacks:

depth layering
Required

Introduce:

distance atmosphere
Add
Layered haze planes

Different depth bands:

foreground
mid-distance
far-distance
Behavior

Haze should:

shift with camera
react to time-of-day
darken toward edges
softly reveal geography
Goal

Create:

city depth perception

WITHOUT:

perspective rendering
3D buildings
geometry complexity
Priority 6 — Event Presence Expansion
Problem

Events currently influence:

local rings
local glow

but not:

regional atmosphere
Required

Events should influence:

surrounding city mood
Add
Regional event pressure wash

Large-area:

low-alpha tint
density modulation
traffic amplification
brightness ripple
Example

A major:

nightlifeSpill

should subtly:

brighten neighboring corridors
increase nearby drift density
amplify route shimmer
tint nearby district haze
Goal

Events should feel:

socially contagious
Priority 7 — Passenger Camera Composition Support
Problem

The camera now sees:

corridor
atmosphere

BUT:

frames still lack compositional richness
Required

Spatial density systems should:

support framing
create silhouettes
create movement balance
provide peripheral interest
Add
Composition weighting

Passenger camera should favor:

overlapping atmospheric fields
density intersections
branch convergence
event adjacency
layered haze regions
Goal

Frames should feel:

cinematically inhabited

rather than:

empty route diagrams
Rendering Order

Maintain:

background
→ depth haze
→ district mass fields
→ secondary corridors
→ corridor glow
→ traffic traces
→ ecology drift
→ events
→ camera overlays
→ HUD
Performance Constraints

This system MUST:

remain lightweight
remain GPU-friendly
avoid particle spam
avoid geometry explosion
Allowed Techniques

Preferred:

gradients
additive blending
low-frequency noise
procedural pulses
sparse particles
layered alpha rendering

Avoid:

thousands of entities
complex simulations
heavy shaders
texture dependency
Validation Criteria

The pass succeeds when:

the corridor feels embedded inside a larger city organism
empty space feels intentional
movement exists beyond the route
districts feel inhabited
events influence surrounding geography
the city feels alive even during calm phases
Final Principle

The corridor is no longer enough.

WOS must now become:

a breathing urban atmosphere

The viewer should feel:

movement beyond visibility
life beyond the frame
pressure beyond the route

as if:

the city continues infinitely outside the camera
