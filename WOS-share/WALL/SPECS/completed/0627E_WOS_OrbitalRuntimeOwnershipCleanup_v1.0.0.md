# 0627E_WOS_OrbitalRuntimeOwnershipCleanup_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth Recovery  
**Document Type:** Runtime Ownership / Cleanup Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Spec  
**Sequence:** E  
**Depends On:**  
- `0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0.md`
- `0627_WOS_OrbitalVisibilityStackAudit_v1.0.0.md`
- `0627C_WOS_OrbitalCleanEarthBaseline_v1.0.0.md`
- `0627D_WOS_OrbitalCameraFramingCorrection_v1.0.0.md`

---

## Purpose

Clean up Orbital runtime ownership so future fixes stop spreading across too many files.

This spec does not add features. It defines and enforces which file owns each Orbital concern:

```text
state
camera
transition timing
map context
style tokens
overlay visibility
audio overlay
transport buttons
presentation router
Moon gate
cleanup / restore
```

The goal is to reduce hidden overlap and prevent another cycle where a small change requires 8–10 attempts.

---

## Active Scope Lock

The Orbital recovery lock remains active.

Do not add:

```text
new FX
new stars
new particles
new Moon features
new presentation controls
new transport buttons
new UI panels
new visual modes
new architecture systems
```

Allowed work:

```text
ownership comments
dead-path notes
public API clarity
duplicate-control cleanup
read-only diagnostics
narrow routing cleanup
single-owner enforcement
```

---

## Current Problem

Orbital has accumulated corrective layers from earlier direction changes.

These layers can now overlap:

```text
OrbitalModeController
OrbitalEarthMode
WosModeTransitionController
WosRuntimeModeState
OrbitalMapContext
WosMapStyleTokens
OrbitalAudioOverlayController
OrbitalFxPanel
WosPresentationRouter
MoonModeController
body classes
inline styles
CSS rules
```

The system is moving in the right direction, but ownership is not clear enough.

When ownership is unclear:

```text
camera changes happen in more than one file
transition cleanup happens in more than one file
overlay visibility can be changed by tokens, CSS, FX, audio, and runtime state
presentation assumptions leak into transport conversations
legacy Three.js paths remain semi-active
```

This spec establishes one owner per concern.

---

## Required Ownership Map

### Runtime Mode State

**Owner:**

```text
wall/systems/runtime/WosRuntimeModeState.js
```

Owns:

```text
current runtime mode
runtime mode constants
allowed runtime transitions
map/orbital/static mode labels
```

Does not own:

```text
camera
overlay visibility
CSS filters
presentation mode
Moon camera
transport buttons
```

---

### Transition Timing

**Owner:**

```text
wall/systems/runtime/WosModeTransitionController.js
```

Owns:

```text
map → orbital sequencing
orbital → map sequencing
transition overlay timing
calling canonical enter/exit methods
return-to-map flow
```

Does not own:

```text
camera preset truth
style token values
overlay DOM creation
audio overlay state
Moon internals
presentation state
```

Transition controller may request:

```js
SBE.OrbitalEarthMode.enter(...)
SBE.OrbitalEarthMode.exit(...)
SBE.OrbitalEarthMode.restoreMapCameraState(...)
```

It should not duplicate Orbital camera logic.

---

### Orbital Earth Rendering

**Owner:**

```text
wall/systems/orbital/OrbitalEarthMode.js
```

Owns:

```text
Mapbox globe activation
Orbital Earth active state
Orbital overlay DOM
Clean Earth baseline
camera presets
fitGlobeToViewport()
getGlobeFitReport()
saveMapCameraState()
restoreMapCameraState()
getVisibilityStackReport()
getCleanEarthReport()
```

Does not own:

```text
transport tab selected state
Moon state machine
presentation routing
global runtime mode enum
legacy Three.js visualizer defaults
```

---

### Orbital Camera

**Owner:**

```text
wall/systems/orbital/OrbitalEarthMode.js
```

Owns:

```text
readable_orbit
broadcast_orbit
deep_orbit
cinematic_crop
camera save/restore
camera fit/retry
camera report
```

No other file should define the meaning of these presets.

Allowed external calls:

```js
SBE.OrbitalEarthMode.setCameraPreset("readable_orbit")
SBE.OrbitalEarthMode.getGlobeFitReport()
SBE.OrbitalEarthMode.restoreMapCameraState()
```

Forbidden outside owner:

```js
map.easeTo({ zoom: orbitalZoomValue })
map.setProjection("globe") // unless delegated through OrbitalEarthMode
```

Exception: startup/map boot code may initialize the normal map, but not Orbital camera presets.

---

### Map Context Capture

**Owner:**

```text
wall/systems/orbital/OrbitalMapContext.js
```

Owns:

```text
pre-Orbital map context snapshot
origin map location
transport context
route context
last known map center/zoom/bearing/pitch
```

Does not own:

```text
camera restore behavior
camera preset values
visual overlays
style tokens
```

OrbitalEarthMode may read from it, but context capture remains its job.

---

### Style Tokens

**Owner:**

```text
wall/systems/orbital/WosMapStyleTokens.js
```

Owns:

```text
style token extraction
fallback token defaults
CSS variable mapping
Orbital readable visual token values
surface brightness token
line opacity token
rim/haze/star/origin token defaults
```

Does not own:

```text
DOM overlay creation
camera presets
runtime state
transition timing
```

No hard-coded Orbital visual colors should be scattered elsewhere unless they are documented emergency fallbacks.

---

### Audio Overlay

**Owner:**

```text
wall/systems/orbital/OrbitalAudioOverlayController.js
```

Owns:

```text
audio overlay mode
reactive signal mapping
off/manual/reactive state
whether audio can mutate overlays
```

Default must remain:

```text
off
```

Audio must not alter visuals when mode is off.

---

### FX Panel

**Owner:**

```text
wall/systems/orbital/OrbitalFxPanel.js
```

Owns:

```text
manual user controls for allowed Orbital settings
calling public APIs
button UI only
```

Does not own:

```text
default state
camera truth
style token truth
runtime mode truth
Clean Earth baseline
```

The FX panel is a caller, not the authority.

---

### Transport Buttons

**Owner:**

```text
wall/systems/presentation/traversalControlDeck.js
```

Owns:

```text
flight
drive
walk
bike
transit
orbital
selected transport UI
transport launch/pause/stop UI
```

Does not own:

```text
presentation routing
card/website/canvas modes
Orbital camera internals
Moon internals
```

Transport buttons may call the transition controller or Orbital controller, but should not directly mutate Orbital internals.

---

### Presentation Router

**Owner:**

```text
wall/systems/presentation/WosPresentationRouter.js
```

Status:

```text
dormant infrastructure
```

Owns future presentation routing only:

```text
map
card
website
canvas
kinetic_fish
extracted_theme
```

Current WALL UI has no presentation tabs.

During Orbital recovery:

```text
do not add presentation controls
do not wire presentation buttons
do not route transport through presentation
```

---

### Moon Gate

**Owner:**

```text
wall/systems/moon/MoonModeController.js
```

Owns:

```text
Moon state machine
Moon gate
Moon transition sequence
Moon return state
```

Required gate:

```js
SBE.OrbitalEarthMode.isActive() === true
```

Moon must remain downstream of stable Orbital Earth.

Do not expand Moon during Orbital recovery.

---

### Legacy Three.js / Visualizer Path

**Owner:**

```text
wall/systems/orbital/OrbitalModeController.js
```

Status:

```text
legacy / manual-only / quarantine candidate
```

Owns old experimental visualizer paths only if still needed.

Must not own:

```text
default Orbital Earth
Mapbox globe entry
Clean Earth baseline
default camera framing
```

Default Orbital must not enter a fake sphere or portal path.

---

## Required Audit

Audit the following files and mark each as:

```text
current owner
caller only
legacy/manual-only
dormant infrastructure
delete candidate
unknown
```

Files to audit:

```text
wall/systems/runtime/WosRuntimeModeState.js
wall/systems/runtime/WosModeTransitionController.js
wall/systems/orbital/OrbitalEarthMode.js
wall/systems/orbital/OrbitalMapContext.js
wall/systems/orbital/WosMapStyleTokens.js
wall/systems/orbital/OrbitalAudioOverlayController.js
wall/systems/orbital/OrbitalFxPanel.js
wall/systems/orbital/OrbitalModeController.js
wall/systems/presentation/traversalControlDeck.js
wall/systems/presentation/WosPresentationRouter.js
wall/systems/presentation/WosPresentationModeState.js
wall/systems/moon/MoonModeController.js
wall/index.html
wall/styles.css
```

---

## Duplicate-Control Search

Search for duplicated ownership patterns.

Search terms:

```text
setProjection
easeTo
flyTo
setCameraPreset
readable_orbit
broadcast_orbit
deep_orbit
cinematic_crop
wos-orbital-active
wos-orbital-earth-active
wos-travel-state
style.filter
style.opacity
orbitalStarOpacity
orbitalHazeOpacity
selectTransport
selectPresentationMode
MoonMode
portal_orb
minimal_dark_sphere
deep_space_listen
```

Report every duplicate or conflict.

---

## Cleanup Rules

### Allowed cleanup

```text
add ownership comments
rename internal comments
remove duplicate fallback calls
remove dead auto-entry code
mark legacy paths manual-only
guard accidental default paths
centralize a duplicated constant
add diagnostics around ownership conflicts
```

### Not allowed cleanup

```text
delete large modules without report
rewrite architecture
add new systems
add new UI
add new FX
expand Moon
wire presentation controls
change transport layout
```

---

## Required Canonical Default Route

After cleanup, there must be one default route:

```text
traversalControlDeck orbital tab
→ WosModeTransitionController.transitionToOrbitalEarth()
→ OrbitalMapContext captures current map context
→ OrbitalEarthMode.enter()
→ OrbitalEarthMode.applyCleanEarthBaseline()
→ OrbitalEarthMode.setCameraPreset("readable_orbit")
```

Return route:

```text
return / map / flight action
→ WosModeTransitionController.transitionToMap()
→ OrbitalEarthMode.restoreMapCameraState()
→ OrbitalEarthMode.exit()
→ map restored
```

Any other default route should be removed, blocked, or marked manual-only.

---

## Required Ownership Report API

If practical, add a diagnostic helper:

```js
SBE.OrbitalEarthMode.getOwnershipReport?.()
```

Minimum report:

```js
{
  runtimeModeOwner: "WosRuntimeModeState.js",
  transitionOwner: "WosModeTransitionController.js",
  orbitalEarthOwner: "OrbitalEarthMode.js",
  cameraOwner: "OrbitalEarthMode.js",
  mapContextOwner: "OrbitalMapContext.js",
  styleTokenOwner: "WosMapStyleTokens.js",
  audioOverlayOwner: "OrbitalAudioOverlayController.js",
  transportOwner: "traversalControlDeck.js",
  presentationOwner: "WosPresentationRouter.js dormant",
  moonOwner: "MoonModeController.js",
  legacyVisualizerOwner: "OrbitalModeController.js manual-only"
}
```

Do not add this if it requires new architecture. A comment/report is enough.

---

## QA Procedure

### Test A — Default Orbital Route

1. Start WOS.
2. Select Orbital.
3. Confirm console path.

Expected route:

```text
transitionToOrbitalEarth
OrbitalMapContext capture
OrbitalEarthMode enter
Clean Earth baseline
readable_orbit
```

Fail if:

```text
portal_orb auto entry
Three.js fake sphere default
deep_space_listen default path
unknown map fallback
```

---

### Test B — Return Route

1. Enter Orbital.
2. Return to map.

Expected route:

```text
transitionToMap
restoreMapCameraState
OrbitalEarthMode exit
map restored
```

Fail if:

```text
duplicate restore path fights camera
body classes remain stuck
map filter/opacity remains modified
```

---

### Test C — Transport Still Independent

1. Select Drive.
2. Select Orbital.
3. Return to Flight or Map.

Expected:

```text
transport state changes only by transport controls
presentation router stays dormant
```

---

### Test D — Moon Still Gated

Run or inspect gate.

Expected:

```text
Moon can only start if OrbitalEarthMode.isActive() is true
```

Do not expand Moon.

---

## Acceptance Criteria

This spec is complete when:

1. Every Orbital-related concern has one declared owner.
2. Duplicate camera control paths are removed, blocked, or documented.
3. Duplicate transition cleanup paths are removed, blocked, or documented.
4. Duplicate overlay default paths are removed, blocked, or documented.
5. Default Orbital route is Mapbox-first.
6. Legacy Three.js visualizer paths are manual-only.
7. Presentation router remains dormant.
8. Moon remains gated downstream from Orbital Earth.
9. No new visuals are added.
10. No presentation controls are added.
11. No Moon expansion is added.
12. No transport buttons are added.
13. Developer report includes the ownership audit table.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Ownership table:
Duplicate-control findings:
Default route confirmed:
Return route confirmed:
Legacy paths marked/manual-only:
Presentation router status:
Moon gate status:
Features not touched:
Remaining blocker:
```

Explicitly confirm:

```text
No new visuals added.
No presentation controls added.
No Moon expansion added.
No transport buttons added.
```

---

## Stop Conditions

Stop and report if:

```text
two files both appear to own camera presets
two files both appear to own transition cleanup
default Orbital route cannot be identified
legacy fake-sphere path still auto-enters
presentation router is unexpectedly called by current UI
Moon can start without OrbitalEarthMode active
cleanup would require deleting large modules
```

Do not make broad rewrites.

---

## Final Principle

Each Orbital concern gets one owner.

If a file is not the owner, it may call the owner through a public API, but it should not mutate the owner's internal state.

The purpose of this cleanup is not to make Orbital more complex.

The purpose is to make Orbital changeable again.

## Implementation Guide

- **Where:** Audit Orbital/runtime/presentation/Moon files listed above; edit only where ownership conflicts are found.
- **What:** Declare owners, remove or document duplicate paths, keep legacy visualizer paths manual-only, and confirm the canonical Mapbox-first Orbital route.
- **Expect:** Future Orbital changes have clear file targets instead of spreading through multiple competing systems.
