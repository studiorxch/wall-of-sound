---
title: "Traversal Control Deck"
filename: "0528V_WOS_TraversalControlDeck_v1.0.0_BUILD.md"
version: "1.0.0"
date: "2026-05-28"
system: "WOS"
module: "Traversal / Broadcast Controls"
type: "ui-build-spec"
status: "[BUILD]"
build_readiness: "[BUILD]"
owner: "StudioRich / WOS"
depends_on:
  - "0528O_WOS_RegionalFlightPlanner_v1.0.0"
  - "0528S_WOS_PresentationModeTabToggle_v1.0.0"
  - "0528T_WOS_SurfaceGlideWatchabilityProfile_v1.0.0"
  - "0528U_WOS_MapTilePreloadAndContinuityPass_v1.0.0"
---

# 0528V_WOS_TraversalControlDeck_v1.0.0_BUILD

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Replace console-only watchability orchestration with a bottom-bar Traversal Control Deck that can launch and tune cinematic traversal sessions.

---

# Purpose

WOS has outgrown console orchestration.

Current watchability setup requires manually entering commands such as:

```js
_wos.presentationMode(true)

_wos.debug.regionalFlight.stop()
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.profile('surface_glide')
_wos.debug.regionalFlight.speed(0.7)
_wos.debug.regionalFlight.cameraRig(true)
_wos.debug.regionalFlight.cameraSmooth(0.75)

_wos.debug.atmosphere.preset('thin')
_wos.debug.atmosphere.pressure(0.10)
_wos.debug.atmosphere.silence(0.72)

_wos.debug.aircraftResidue.contrails(false)
_wos.debug.aircraftResidue.lights(true)
```

That was useful for system construction.

It is now too fragile and too technical for watchability testing.

This spec creates a bottom-bar Traversal Control Deck that provides:

- route selection
- destination selection
- traversal mode selection
- channel selection
- atmosphere controls
- speed controls
- camera controls
- aircraft residue controls
- continuity protection controls
- one-click watchability launch

The deck should feel like:

```text
a broadcast atmospheric control surface
```

NOT:

```text
a developer debug strip
```

---

# Core Doctrine

## Console Orchestration Is Over

The console remains useful for debugging.

It should no longer be required for normal watchability sessions.

If the user wants to test a route, they should be able to:

```text
choose → launch → watch
```

not:

```text
paste 12 commands into DevTools
```

---

## The Bottom Bar Becomes A Control Deck

The existing bottom dev/status bar should be repurposed or replaced.

It should become:

```text
Traversal / Broadcast Control Deck
```

It should support session setup while remaining hideable in presentation mode.

---

## Controls Should Be Human, Not Internal

Avoid exposing raw internal jargon.

Use:

| Internal | User-Facing |
|---|---|
| speedMultiplier | Speed |
| traversalProfile | Mode |
| atmosphere preset | Atmosphere |
| pressureScalar | Pressure |
| silenceScalar | Silence |
| cameraRig | Smooth Camera |
| contrails | Contrails |
| nav diffusion | Lights |
| mapContinuity | Continuity |
| preloadAhead | Preload Route |

The UI should feel cinematic and understandable.

---

# Scope

This spec includes:

- bottom-bar deck layout
- launch button
- route controls
- mode controls
- atmosphere controls
- speed/pressure/silence sliders
- camera/residue/continuity toggles
- presentation mode integration
- saved default values
- debug-safe orchestration calls

This spec does NOT include:

- full route search UI
- map click-to-route UI
- production scheduling system
- bird/fish flock implementation
- monetization controls
- public user accounts
- persistent server storage
- full channel programming scheduler

---

# Existing Bar Assessment

The current bottom dev bar was useful for:

- runtime status
- development visibility
- quick internal inspection
- early system debugging

But for watchability mode, it is now mostly visual noise.

It should either be:

1. replaced by the Traversal Control Deck, or  
2. converted into deck mode with status chips collapsed.

The old technical status items should be hidden behind an optional developer toggle.

---

# New Component

## Preferred File

```text
wall/systems/presentation/traversalControlDeck.js
```

## Optional CSS File

```text
wall/systems/presentation/traversalControlDeck.css
```

or integrate into existing WOS UI CSS if preferred.

## Classification

```text
presentation-control-ui
```

## Load Order

```text
AFTER regionalFlightTripDebug.js
AFTER aircraftResidueDebug.js
AFTER atmosphericContinuityDebug.js
AFTER mapContinuityDebug.js
```

---

# Runtime Authority

## TraversalControlDeck OWNS

- deck UI state
- selected route origin
- selected destination
- selected traversal mode
- selected channel
- selected atmosphere preset
- selected speed value
- selected pressure value
- selected silence value
- selected camera smooth value
- launch orchestration

## TraversalControlDeck READS

- RegionalFlightPlanner
- RegionalFlightTripRuntime
- RegionalFlightCameraRig
- AtmosphericContinuityRuntime
- AircraftSkyResidueRenderer
- MapContinuityRuntime
- presentation mode state

## TraversalControlDeck MUST NOT MUTATE

- route truth directly
- aircraft entity internals
- camera internals
- atmosphere internals
- map style truth
- Mapbox layers directly

It should only call public APIs / debug-safe public control methods.

---

# Required UI Layout

## Bottom Deck Regions

```text
[Route] [Mode] [Channel] [Atmosphere] [Speed] [Pressure] [Silence] [Toggles] [Launch]
```

---

# Route Controls

## Required MVP

Use dropdowns:

```text
FROM: JFK
TO: BOS
```

Initial airport list may come from:

```js
SBE.RegionalFlightPlanner.listAirports()
```

Fallback values:

```text
JFK
LGA
EWR
BOS
PHL
DCA
IAD
BDL
ALB
YUL
```

---

## Future

Not this build:

- freeform search
- map click destination
- saved route library
- user-labeled waypoints
- natural language places

---

# Mode Controls

Required modes:

```text
Regional
Surface Glide
```

Surface Glide should call:

```js
_wos.debug.regionalFlight.profile('surface_glide')
```

Regional should call:

```js
_wos.debug.regionalFlight.profile('regional')
```

---

# Channel Controls

Required initial channel list:

```text
Surface
Aquarium Network
Sounds Fishy
Wet Dreams — After Hours
Skyline Drift
```

Channel does not need to fully change runtime behavior yet.

For this build, channel may set recommended presets:

## Channel Defaults

| Channel | Atmosphere | Pressure | Silence | Speed | Mode |
|---|---:|---:|---:|---:|---|
| Surface | thin | 0.10 | 0.72 | 0.7 | surface_glide |
| Aquarium Network | harbor_fog | 0.22 | 0.78 | 0.55 | surface_glide |
| Sounds Fishy | harbor_fog | 0.28 | 0.66 | 0.65 | surface_glide |
| Wet Dreams — After Hours | storm_shelf | 0.34 | 0.82 | 0.45 | surface_glide |
| Skyline Drift | thin | 0.18 | 0.60 | 0.8 | regional |

Selecting a channel should update controls but not auto-launch unless explicitly enabled later.

---

# Atmosphere Controls

## Preset Dropdown

Required:

```text
clear
thin
harbor_fog
storm_shelf
```

## Pressure Slider

Range:

```js
0.00 → 1.00
```

Default:

```js
0.10
```

## Silence Slider

Range:

```js
0.00 → 1.00
```

Default:

```js
0.72
```

---

# Speed Controls

Speed slider range:

```js
0.1 → 2.0
```

Default:

```js
0.7
```

Use lower precision display:

```text
0.7x
```

This deck is for watchability, not stress testing.

Do not expose 60x / 120x here.

Those remain debug console values.

---

# Camera Controls

Required:

```text
Smooth Camera: ON/OFF
Camera Smooth: 0.1 → 1.5
```

Default:

```js
cameraRig = true
cameraSmooth = 0.75
```

---

# Residue Controls

Required:

```text
Lights: ON
Contrails: OFF
```

Default for Surface Glide:

```js
contrails = false
lights = true
```

Regional may allow contrails ON.

---

# Continuity Controls

Required:

```text
Continuity: ON/OFF
Veil: ON/OFF
Auto Gate: ON/OFF
Preload Route button
```

Defaults:

```js
continuity = true
veil = true
autoGate = false
```

Important:

The 3D building pop-in issue is NOT solved by this UI.

This deck must expose continuity controls, but the actual building prewarm problem remains under:

```text
0528W_WOS_3DBuildingContinuityAndPrewarm_v1.0.0_BUILD
```

---

# Launch Behavior

## Launch Button

Label:

```text
Start Watch
```

or:

```text
Launch Drift
```

Recommended label:

```text
Launch Drift
```

## Launch Sequence

The button should call:

```js
_wos.presentationMode(true)

_wos.debug.regionalFlight.stop()
_wos.debug.regionalFlight.start(routePresetOrGeneratedRoute)
_wos.debug.regionalFlight.profile(selectedMode)
_wos.debug.regionalFlight.speed(selectedSpeed)
_wos.debug.regionalFlight.cameraRig(cameraRigOn)
_wos.debug.regionalFlight.cameraSmooth(cameraSmooth)

_wos.debug.atmosphere.preset(selectedAtmosphere)
_wos.debug.atmosphere.pressure(selectedPressure)
_wos.debug.atmosphere.silence(selectedSilence)

_wos.debug.aircraftResidue.contrails(contrailsOn)
_wos.debug.aircraftResidue.lights(lightsOn)

_wos.debug.mapContinuity.enabled(continuityOn)
_wos.debug.mapContinuity.veil(veilOn)
_wos.debug.mapContinuity.preloadAhead()
```

Guard calls if a system is not loaded.

Missing optional systems should warn but not fail launch.

---

# Route Generation Behavior

If FROM/TO are airport IDs and planner exists:

Preferred:

```js
_wos.debug.regionalFlight.origin(from)
_wos.debug.regionalFlight.destination(to)
_wos.debug.regionalFlight.profile('direct' or selected route profile)
_wos.debug.regionalFlight.plan()
_wos.debug.regionalFlight.startPlan()
```

Then apply traversal profile:

```js
_wos.debug.regionalFlight.profile('surface_glide')
```

If planner is unavailable, fallback to:

```js
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
```

with clear warning.

---

# Presentation Mode Integration

When presentation mode is active:

- deck should hide
- deck may reappear on hover or Tab if existing behavior supports it
- deck should not cover weather/time/location HUD
- deck should not remain visible during recording unless intentionally pinned

Add:

```html
data-watch-hide
```

to the deck root by default.

Optional future behavior:

```text
Press D to show deck temporarily
```

Not required this build.

---

# Visual Style

The deck should be:

- low height
- dark translucent
- thin typography
- minimal borders
- soft glow only when active
- broadcast-like
- not editor-like

Avoid:

- bright UI
- large buttons
- dense forms
- debug tables
- loud colors

---

# Persistence

Use localStorage for deck defaults:

```js
wos.traversalDeck.v1
```

Persist:

- from
- to
- mode
- channel
- atmosphere
- speed
- pressure
- silence
- cameraSmooth
- toggles

---

# Debug API

Expose:

```js
SBE.TraversalControlDeck = {
  VERSION,
  mount,
  unmount,
  show,
  hide,
  getState,
  setState,
  launch,
  resetDefaults
}
```

Bind:

```js
_wos.debug.traversalDeck.audit()
_wos.debug.traversalDeck.show()
_wos.debug.traversalDeck.hide()
_wos.debug.traversalDeck.launch()
```

---

# Success Criteria

This build succeeds if:

- user no longer needs to paste watchability command sequences
- bottom bar becomes useful for traversal setup
- route FROM/TO can be selected
- surface_glide can be selected
- speed/pressure/silence/camera smooth values are controllable
- channel selection updates recommended values
- Launch Drift starts a watchability session
- presentation mode hides the deck
- weather/time/location HUD remains visible
- missing optional systems fail gracefully
- console still remains available for debugging

---

# Failure Conditions

This build fails if:

- deck feels like developer clutter
- deck remains visible during presentation mode unexpectedly
- launch sequence requires console fixes afterward
- controls mutate runtime internals directly
- route planner and traversal profile conflict
- selected values do not reflect actual runtime state
- old bottom dev bar continues competing visually
- UI breaks map layout or presentation mode

---

# Important Known Issue

This spec does NOT solve:

```text
3D building pop-in
```

That remains the next technical blocker.

The deck should expose continuity controls, but true building continuity should be handled by:

```text
0528W_WOS_3DBuildingContinuityAndPrewarm_v1.0.0_BUILD
```

---

# Future Extensions

Not this build:

- bird flock anchor mode
- fish traversal mode
- red car follow mode
- real route search
- click-to-route
- saved show presets
- broadcast schedule automation
- chat-command deck opening
- SYS portal integration

---

# Final Principle

The Traversal Control Deck should make WOS feel less like:

```text
a debug runtime
```

and more like:

```text
an atmospheric broadcast instrument
```

The user should be able to tune the world, launch the drift, hide the deck, and watch.

---

# Implementation Guide

- Replace or repurpose the bottom dev bar with a hideable Traversal Control Deck.
- Wire controls to existing public/debug-safe runtime APIs instead of direct state mutation.
- Add route/mode/channel/atmosphere controls plus one-click `Launch Drift` using the current watchability defaults.
