# 0627G_WOS_OrbitalMapTransitionCleanup_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth Recovery  
**Document Type:** Runtime Transition Cleanup Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Spec  
**Sequence:** G  
**Depends On:**  
- `0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0.md`
- `0627_WOS_OrbitalVisibilityStackAudit_v1.0.0.md`
- `0627C_WOS_OrbitalCleanEarthBaseline_v1.0.0.md`
- `0627D_WOS_OrbitalCameraFramingCorrection_v1.0.0.md`
- `0627E_WOS_OrbitalRuntimeOwnershipCleanup_v1.0.0.md`
- `0627F_WOS_OrbitalLegacyPathQuarantine_v1.0.0.md`

---

## Purpose

Clean up the map → Orbital → map transition so it leaves no visual or state residue.

This spec does not add features. It verifies and fixes transition cleanup only:

```text
body classes
transition overlays
map opacity
map filters
canvas filters
camera restoration
transport selected state
Orbital active state
Moon/presentation leakage
```

The goal is a clean round trip:

```text
Map
→ Orbital Earth
→ Map
```

with no stuck dimming, no stuck body classes, no broken camera, and no hidden legacy state.

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
transition cleanup
body class cleanup
map filter/opacity restoration
camera restore validation
transition overlay cleanup
diagnostic helpers
narrow bug fixes
```

---

## Current Problem

Orbital has passed the major route and legacy quarantine work, but transition cleanup still needs to be verified as its own recovery step.

Known risks:

```text
transition overlay remains visible
wos-travel-state remains active
wos-orbital-active remains active after return
wos-orbital-earth-active remains active after return
map canvas filter remains dimmed
map container opacity remains altered
camera restore fails silently
transport UI remains on Orbital after return
Moon or presentation classes leak into the route
```

Even if Orbital Earth looks correct, return-to-map residue can make the next mode or next screenshot fail.

---

## Canonical Entry Route

Confirm the entry route remains:

```text
traversalControlDeck orbital button
→ WosStartupCoordinator.requestOrbitalEntry()
→ WosModeTransitionController.transitionToOrbital()
→ OrbitalMapContext.capture()
→ OrbitalModeController.enterFromMapContext(ctx, "earth")
→ OrbitalEarthMode.enter()
→ OrbitalEarthMode.applyCleanEarthBaseline()
→ OrbitalEarthMode.setCameraPreset("readable_orbit")
```

Do not alter this route unless a transition cleanup defect requires a narrow fix.

---

## Canonical Return Route

Confirm the return route remains:

```text
transport button deselects orbital / map return action
→ WosModeTransitionController.transitionToMap()
→ OrbitalEarthMode.restoreMapCameraState()
→ OrbitalModeController.exit()
→ OrbitalEarthMode.exit()
→ WosModeTransitionController.restoreMapVisualState()
→ traversalControlDeck.selectTransport("flight")
```

If a different return path exists, report it.

---

## Required Cleanup Targets

### Body Classes

After return to map, these must be absent:

```text
wos-orbital-active
wos-orbital-earth-active
wos-travel-state
wos-transition-active
wos-map-dimmed
wos-moon-active
wos-moon-orbit-active
wos-moon-surface-active
```

Presentation classes should not be introduced during this recovery path.

Flag if present:

```text
wos-presentation-card
wos-presentation-website
wos-presentation-canvas
wos-presentation-kinetic_fish
wos-presentation-extracted_theme
```

---

### Map / Canvas Filters

After return to map, Mapbox map/container/canvas must be restored.

Bad residue:

```css
filter: brightness(...)
filter: contrast(...)
filter: blur(...)
opacity: 0.XX
visibility: hidden
display: none
```

Target:

```text
map container opacity ≈ 1
map canvas opacity ≈ 1
map container filter none or normal
map canvas filter none or normal
```

---

### Transition Overlay

After transition completion:

```text
transition overlay opacity <= 0.02
transition overlay display none or inert
transition overlay visibility hidden or non-blocking
transition overlay pointer-events none
```

If the overlay remains visible, it is a failure.

---

### Camera Restore

Return to map must restore:

```text
center
zoom
pitch
bearing
projection
padding if saved
```

If restore fails:

```text
log CAMERA RESTORE FAILED
do not silently fall back unless fallback is documented
```

---

### Transport Selected State

After returning from Orbital:

```text
Orbital tab should no longer appear selected
Flight/map default should be selected if that is the intended return state
Drive/Walk/Bike/Transit should not be accidentally selected
```

Transport state cleanup belongs to:

```text
traversalControlDeck.js
```

Transition controller may call the transport owner, but should not duplicate transport UI logic.

---

## Required Diagnostic Method

If existing reports already cover this, use them. If not, add a small report method to the most appropriate owner.

Preferred:

```js
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

Acceptable alternative:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

Minimum report shape:

```js
{
  timestamp,
  phase: "before_orbital" | "after_orbital_entry" | "after_return_to_map",
  bodyClasses,
  map: {
    containerOpacity,
    containerFilter,
    canvasOpacity,
    canvasFilter,
    projection,
    zoom,
    pitch,
    bearing,
    center
  },
  transitionOverlay: {
    exists,
    display,
    visibility,
    opacity,
    pointerEvents
  },
  orbital: {
    orbitalActive,
    earthActive,
    cameraPreset,
    savedCameraStateExists
  },
  transport: {
    selectedTransport,
    orbitalSelected,
    flightSelected
  },
  leaks: {
    moonClassesActive,
    presentationClassesActive,
    legacyVisualizerActive
  },
  passed,
  blockers: []
}
```

Do not add this if equivalent data is already available from existing reports.

---

## QA Procedure

### Test A — Before Orbital

1. Load WOS.
2. Run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

Expected:

```text
no orbital classes
no travel state
no transition overlay active
map visible
map filters normal
```

---

### Test B — Enter Orbital

1. Select Orbital.
2. Wait for transition completion.
3. Run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.OrbitalEarthMode.getCleanEarthReport?.()
SBE.OrbitalEarthMode.getGlobeFitReport?.()
```

Expected:

```text
wos-orbital-active present
wos-orbital-earth-active present
projection globe
transition overlay clear
map canvas readable
clean earth passed
readable_orbit active
```

---

### Test C — Return to Map

1. Return from Orbital to map.
2. Wait for transition completion.
3. Run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

Expected:

```text
wos-orbital-active absent
wos-orbital-earth-active absent
wos-travel-state absent
transition overlay clear
map filter restored
map opacity restored
map camera restored
transport state restored
```

---

### Test D — Repeat Round Trip

Repeat the full route twice:

```text
Map → Orbital → Map → Orbital → Map
```

Expected:

```text
no compounding filters
no compounding body classes
no worsening brightness
no stuck camera
no stuck overlay
no legacy visualizer
```

---

## Search / Audit Requirements

Search these terms:

```text
restoreMapVisualState
restoreMapStartupVisualState
transitionToMap
transitionToOrbital
wos-travel-state
wos-orbital-active
wos-orbital-earth-active
wos-transition-active
wos-map-dimmed
style.filter
style.opacity
transitionOverlay
mode-transition
restoreMapCameraState
selectTransport('flight')
selectTransport("flight")
```

Report every relevant setter/remover.

---

## Cleanup Rules

### Allowed

```text
clear stuck body classes
clear transition overlay opacity/display
reset map filter/opacity
call canonical camera restore method
document fallback restore paths
add diagnostics
add comments around cleanup ownership
```

### Not Allowed

```text
add new transition visuals
add new UI controls
change camera preset values
change Clean Earth token values
expand Moon
wire presentation controls
alter transport layout
introduce new renderers
```

---

## Acceptance Criteria

This spec is complete when:

1. Map → Orbital → Map leaves no stuck body classes.
2. Transition overlay clears after entry and return.
3. Map/canvas filters and opacity restore after return.
4. Camera restores after return.
5. Transport selected state restores cleanly.
6. Repeated round trips do not compound visual residue.
7. Moon classes do not leak into Orbital or Map.
8. Presentation classes do not appear in the route.
9. Legacy visualizer does not appear.
10. No new visuals are added.
11. No presentation controls are added.
12. No Moon expansion is added.
13. No transport buttons are added.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Cleanup setters/removers found:
Entry route confirmed:
Return route confirmed:
Before-Orbital cleanup report:
After-Orbital cleanup report:
After-return cleanup report:
Repeated round-trip QA:
Patch made, if any:
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
two files fight over body class cleanup
transition overlay cannot be located
camera restore conflicts with transition timing
transport state cannot be determined
return route cannot be identified
Moon or presentation classes are unexpectedly active
map filters return after being cleared
```

Do not add a new system to hide the issue.

---

## Final Principle

The Orbital transition is not complete when Earth appears.

It is complete when WOS can return to the map cleanly.

Default round trip must be:

```text
readable map
→ readable Orbital Earth
→ readable map
```

## Implementation Guide

- **Where:** Audit `WosModeTransitionController.js`, `WosStartupCoordinator.js`, `OrbitalEarthMode.js`, `OrbitalModeController.js`, and `traversalControlDeck.js`.
- **What:** Verify and patch transition cleanup for body classes, overlays, filters, opacity, camera restore, and transport selected state.
- **Expect:** Map → Orbital → Map works repeatedly without stuck dimming, stuck classes, broken camera, or legacy visualizer residue.
