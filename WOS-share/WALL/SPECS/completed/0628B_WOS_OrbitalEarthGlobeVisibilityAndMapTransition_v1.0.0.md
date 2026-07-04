# 0628B_WOS_OrbitalEarthGlobeVisibilityAndMapTransition_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth / Mapbox Globe Transition  
**Document Type:** Runtime Visibility + Transition Correction Spec  
**Version:** v1.0.0  
**Status:** Active Implementation Spec  
**Sequence:** 0628B  
**Depends On:**  
- `0627_WOS_OrbitalVisibilityStackAudit_v1.0.0.md`
- `0627C_WOS_OrbitalCleanEarthBaseline_v1.0.0.md`
- `0627D_WOS_OrbitalCameraFramingCorrection_v1.0.0.md`
- `0627E_WOS_OrbitalRuntimeOwnershipCleanup_v1.0.0.md`
- `0627F_WOS_OrbitalLegacyPathQuarantine_v1.0.0.md`
- `0627G_WOS_OrbitalMapTransitionCleanup_v1.0.0.md`
- `0627H_WOS_OrbitalFxReintroductionPass_v1.0.0.md`
- `0627I_WOS_MoonGateRevalidationAfterOrbitalCleanup_v1.0.0.md`
- `0627J_WOS_OrbitalBroadcastCompositionPass_v1.0.0.md`
- `0628A_PLAY_BroadcastNowPlayingA3Placement_v1.0.0.md`

---

## Purpose

Make Orbital mode show an unmistakable **Planet Earth** and transition smoothly back and forth to the normal Mapbox map.

The recovery chain proved that the runtime can enter Orbital, clean its state, quarantine legacy paths, control FX, pass transition cleanup, and support broadcast composition.

The remaining problem is visual certainty:

```text
Orbital is technically active,
but the viewer still feels lost without a readable planet.
```

This spec focuses only on:

```text
1. Globe visibility
2. Planet Earth readability
3. Smooth Map ↔ Orbital transition
4. Runtime report verification
```

Do not create new visual concepts. Do not continue mockup variations. The visual target is already settled:

```text
large readable Planet Earth
clear limb glow
visible land/ocean shape
visible city lights or map linework
dark orbital background
HUD secondary
smooth transition back to map
```

---

## Scope

Allowed work:

```text
Mapbox globe visibility correction
globe projection / zoom / center / pitch correction
Earth scale and framing adjustment
transition timing between map and globe
camera restore validation
visual brightness/readability correction
diagnostic report additions
narrow CSS cleanup if hiding the globe
```

Not allowed:

```text
new FX
new Moon features
new presentation controls
new transport buttons
new mockup cycle
new fake sphere
new Three.js Earth default
new UI panels
new camera mode system
new architecture system
```

---

## Core Finding

The generated image tests did not reveal a new art direction. They only confirmed the current runtime target:

```text
We need a visible Planet Earth.
```

The useful difference between the variations was only:

```text
size
position
readability
```

Therefore, the runtime should not chase new designs. It should make the Mapbox globe itself large, readable, and visually obvious.

---

## Required Visual Target

The Orbital Earth view must show:

```text
a clear Earth globe
large enough to read immediately
not buried in darkness
not hidden under HUD
not cropped accidentally
not replaced by fake sphere
not reduced to a vague dark circle
```

Minimum visual requirements:

```text
Earth limb visible
Earth curvature obvious
North America / global landmass shape visible when centered on route context
ocean/land contrast visible
city lights or cyan linework readable
rim glow subtle but visible
black/space background remains secondary
HUD does not overpower the globe
```

---

## Current Failure Mode

The screenshot indicates:

```text
Orbital mode is active.
HUD is visible.
Now-playing is visible.
The planet is too dim / too small / too unclear.
The viewer cannot immediately read “Planet Earth.”
```

This is not a PLAY problem.

This is a WALL runtime visibility and transition problem.

---

## Ownership Lock

WALL owns:

```text
Mapbox globe
Orbital Earth camera
Earth visibility
Map ↔ Orbital transition
Clean Earth baseline
transition cleanup
broadcast composition report
```

PLAY owns:

```text
now-playing title block
A3 parent-frame placement
top-bar parent frame
broadcast overlay identity layer
```

Do not move now-playing back into WALL.

Do not change PLAY A3 placement in this spec.

---

## Required Transition Model

The transition should feel like:

```text
normal map
→ zooming / lifting out
→ globe projection becomes obvious
→ Orbital Earth settles
```

Return should feel like:

```text
Orbital Earth
→ controlled descent / restore
→ normal map camera restored
```

Forbidden transition behavior:

```text
hard cut to nearly black
fade hides the planet
fake sphere appears
map disappears before globe is readable
return snaps back without camera restore
transition overlay remains visible
```

---

## Mapbox-First Requirement

The default Orbital Earth must remain Mapbox-first.

Required:

```text
projection: globe
Mapbox canvas remains the Earth source
no Three.js fake Earth fallback
legacy visualizer remains quarantined
OrbitalEarthMode remains owner of Earth entry/camera
```

Forbidden:

```text
using generated image as runtime asset
using fake sphere as default
routing default Orbital through _buildScene()
routing default Orbital through _applyPreset()
```

---

## Required Diagnostic Checks

Use existing diagnostics first:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.OrbitalEarthMode.getCleanEarthReport?.()
SBE.OrbitalEarthMode.getGlobeFitReport?.()
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
SBE.OrbitalEarthMode.getBroadcastCompositionReport?.()
SBE.OrbitalModeController.getLegacyPathReport?.()
```

If existing reports do not answer globe visibility clearly enough, add:

```js
SBE.OrbitalEarthMode.getGlobeVisibilityReport?.()
```

Minimum shape:

```js
{
  timestamp,
  orbitalEarthActive,
  projection,
  camera: {
    zoom,
    pitch,
    bearing,
    center,
    padding,
    preset
  },
  viewport: {
    width,
    height,
    aspectRatio
  },
  globe: {
    estimatedScreenDiameterPx,
    estimatedScreenCoveragePercent,
    limbVisible,
    globeTooSmall,
    globePossiblyCropped,
    globeTooDim,
    landmassReadable,
    lineworkReadable
  },
  visualStack: {
    mapOpacity,
    canvasOpacity,
    mapFilter,
    canvasFilter,
    atmosphereOpacity,
    starOpacity,
    hazeOpacity,
    transitionOverlayOpacity
  },
  transition: {
    transitioning,
    lastTransition,
    transitionOverlayClear
  },
  passed,
  blockers: []
}
```

Do not add this if `getGlobeFitReport()` can be extended narrowly.

---

## Required Globe Visibility Thresholds

Set practical runtime thresholds.

Recommended:

```text
estimated globe diameter should occupy 45–75% of viewport height
globe should not be below 35% of viewport height
globe should not crop more than 20% unless using an explicit broadcast crop
map/canvas opacity should be 1
destructive filters should be absent
transition overlay opacity should be <= 0.02 after settle
```

If measuring diameter is unreliable, use a best-effort report and visual QA.

---

## Camera / Framing Rules

Allowed:

```text
adjust Orbital Earth entry camera call
select existing broadcast_orbit if it improves visibility
tune transition-to-Orbital timing
tune fit retry logic if current fit under-scales globe
adjust padding if UI-safe zone is over-protecting the frame
```

Forbidden:

```text
changing all camera presets broadly
adding a new camera mode system
changing Moon camera
changing Drive/Walk/Bike/Transit camera
cropping Earth purely to imitate mockups
```

If a value changes, report it exactly.

---

## Brightness / Readability Rules

Allowed:

```text
raise globe readability through Mapbox paint/style tokens if already owned by WOS
remove dimming filters
ensure Clean Earth tokens do not over-darken globe
confirm stars/haze are not hiding Earth
confirm audio overlay off does not mutate visuals
```

Forbidden:

```text
turning on dense FX to make Earth visible
adding haze as a visibility workaround
adding fake city lights as non-Mapbox overlay unless already existing
using vignette to hide bad framing
```

The Earth itself must become readable.

---

## Transition Rules

### Map to Orbital

Required sequence:

```text
capture current map camera
begin transition
switch/confirm globe projection
ease to Orbital camera
clear transition overlay
apply Clean Earth baseline
verify planet visibility
```

### Orbital to Map

Required sequence:

```text
capture Orbital exit intent
restore saved map camera
restore map projection if needed
clear Orbital classes
clear transition classes
clear map/canvas filters
verify transition cleanup report
```

### Smoothness Target

Transition should avoid:

```text
instant black screen
planet disappearing during fade
double easing conflict
camera snap caused by two owners
overlay hiding Mapbox canvas
```

---

## Search / Audit Requirements

Search:

```text
setProjection
projection
globe
easeTo
flyTo
jumpTo
fitBounds
fitGlobe
readable_orbit
broadcast_orbit
deep_orbit
restoreMapCameraState
saveMapCameraState
transitionToOrbital
transitionToMap
transition overlay
wos-transition-active
wos-map-dimmed
style.opacity
style.filter
canvasOpacity
globeTooSmall
globePossiblyCropped
```

Report every place that affects:

```text
projection
zoom
pitch
bearing
padding
opacity
filter
transition overlay
map canvas visibility
```

---

## QA Procedure

### Test A — Enter Orbital From Map

1. Start from normal map.
2. Select Orbital.
3. Wait for transition completion.
4. Run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.OrbitalEarthMode.getCleanEarthReport?.()
SBE.OrbitalEarthMode.getGlobeFitReport?.()
SBE.OrbitalEarthMode.getGlobeVisibilityReport?.()
```

Expected:

```text
Orbital Earth active
projection globe
Clean Earth passed
globe not too small
globe not too dim
Earth readable as a planet
transition overlay clear
```

---

### Test B — Visual Screenshot Check

Capture screenshot at:

```text
1920x1080
1280x720
```

Expected:

```text
viewer immediately sees Planet Earth
HUD secondary
now-playing A3/right side remains readable
Earth not hidden under UI
Earth not vague/dark
```

---

### Test C — Return to Map

Return from Orbital to map.

Run:

```js
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

Expected:

```text
passed: true
blockers: []
map visible
camera restored
no stuck classes
no stuck filters
```

---

### Test D — Repeat Round Trip

Run:

```text
Map → Orbital → Map → Orbital → Map
```

Expected:

```text
no compounding dimming
no shrinking globe
no stuck transition overlay
no camera drift
no legacy visualizer
```

---

### Test E — Legacy Quarantine Regression

Run:

```js
SBE.OrbitalModeController.getLegacyPathReport?.()
```

Expected:

```text
default route does not call _buildScene()
default route does not apply legacy presets
fake sphere not used as fallback
```

---

### Test F — Broadcast Composition Regression

Run:

```js
SBE.OrbitalEarthMode.getBroadcastCompositionReport?.()
```

Expected:

```text
passed: true
title/song block stays PLAY-owned
left rail hidden
Mapbox chrome hidden only during Orbital Earth
transport does not overlap Earth center
```

---

## Acceptance Criteria

This spec is complete when:

1. Orbital mode clearly shows Planet Earth.
2. Earth is large enough to identify immediately.
3. Earth land/ocean or linework is readable.
4. The globe is not too dim.
5. The globe is not accidentally hidden by transition overlay.
6. Map → Orbital transition is smooth enough for broadcast use.
7. Orbital → Map transition restores the map cleanly.
8. Repeated round trips do not compound visual issues.
9. Clean Earth still passes.
10. Transition cleanup still passes.
11. Broadcast composition still passes.
12. Legacy visualizer remains quarantined.
13. No fake sphere fallback is used.
14. No new FX are added.
15. No Moon code is changed.
16. No PLAY A3 placement is changed.
17. No transport buttons are changed.
18. No presentation controls are added.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Current failure cause:
Projection/camera audit:
Opacity/filter audit:
Transition owner audit:
Globe visibility before:
Globe visibility after:
Map → Orbital QA:
Orbital → Map QA:
Repeated round-trip QA:
Legacy quarantine check:
Broadcast composition check:
Values changed, if any:
Features not touched:
Remaining blocker:
```

Explicitly confirm:

```text
No fake sphere fallback used.
No new FX added.
No Moon changes.
No PLAY A3 changes.
No transport buttons changed.
No presentation controls added.
```

---

## Stop Conditions

Stop and report if:

```text
Mapbox globe cannot be made visible
projection is not actually globe
Earth visibility requires fake sphere fallback
camera changes break return-to-map
two owners fight over camera easing
transition overlay hides the planet
Clean Earth fails after patch
transition cleanup fails after patch
broadcast composition fails after patch
```

Do not solve by generating another mockup.

Do not solve by adding another visual mode.

---

## Final Principle

The user should not have to ask:

```text
Can we see a globe here?
```

Orbital means Planet Earth is visible.

The transition can be cinematic, but it must first be clear.

## Implementation Guide

- **Where:** Audit `OrbitalEarthMode.js`, `WosModeTransitionController.js`, `WosMapStyleTokens.js`, and any Mapbox projection/camera transition helpers.
- **What:** Make the Mapbox globe visually obvious and ensure Map ↔ Orbital round trips feel smooth and restore cleanly.
- **Expect:** A runtime Orbital view where the viewer immediately sees Planet Earth, then can transition back to the normal map without visual residue.
