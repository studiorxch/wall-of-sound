# 0627_WOS_OrbitalVisibilityStackAudit_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth Recovery  
**Document Type:** Diagnostic / Runtime Audit Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Spec  
**Primary Owner:** WOS Runtime  
**Depends On:** `0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0.md`  
**Applies To:** Orbital Earth, Mapbox Globe, transition runtime, CSS/body classes, style tokens, overlay layers

---

## Purpose

Implement a visibility-stack diagnostic for Orbital Earth before any further visual tuning.

The goal is to identify the exact source of the dim, fuzzy, or low-contrast Orbital Earth view without guessing from screenshots.

This spec does not add visual features. It adds diagnostic reporting only, then permits a narrow patch only if the diagnostic identifies a clear dimming source.

---

## Active Scope Lock

The Orbital scope freeze remains active.

Do not add:

```text
new FX
new particles
new stars
new Moon features
new presentation controls
new visual presets
new UI panels
new transport buttons
new architecture systems
```

Allowed work:

```text
visibility diagnostics
computed style inspection
runtime report helpers
narrow dimming-source patch if proven by report
```

---

## Current Problem

The current Orbital Earth runtime shows a centered Earth, but the view remains visually weak:

```text
Earth is present.
Mapbox globe is active.
Linework is difficult to read.
The overall globe appears too dim or washed down.
The origin marker may read louder than the Earth.
```

Previous overlay reductions turned off major decorative layers, but the globe is still not clearly readable. That means the dimming source may be in the visibility stack rather than the optional overlays.

Likely sources include:

```text
body classes
CSS filters
map canvas brightness/opacity
map container opacity/filter
transition veil
orbital overlay elements
Mapbox style layer paint values
camera zoom/framing
audio overlay bleed
style token values
```

---

## Required API

Add this public diagnostic method:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport()
```

The method must be safe to call at any time:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

It should return a plain object and log a readable console table/report.

---

## Required Report Shape

The report should include:

```js
{
  timestamp,
  orbitalEarthActive,
  runtimeMode,
  presentationMode,
  bodyClasses,

  camera: {
    preset,
    zoom,
    pitch,
    bearing,
    center,
    projection,
    globeFitReport
  },

  map: {
    mapExists,
    containerExists,
    canvasExists,
    styleLoaded,
    containerComputedStyle,
    canvasComputedStyle,
    containerInlineStyle,
    canvasInlineStyle
  },

  transition: {
    active,
    overlayExists,
    overlayComputedStyle,
    overlayInlineStyle,
    bodyTravelState,
    bodyOrbitalState
  },

  overlays: {
    atmosphere,
    scanRing,
    stars,
    origin,
    destination,
    routeArc,
    anyOtherOrbitalOverlay
  },

  tokens: {
    orbitalSurfaceBrightness,
    orbitalLineOpacity,
    orbitalAtmosphereOpacity,
    orbitalRimOpacity,
    orbitalRimRadius,
    orbitalHazeOpacity,
    orbitalStarOpacity,
    orbitalOriginOpacity
  },

  audio: {
    controllerExists,
    mode,
    active,
    lastSignalsKnown
  },

  suspects: [],
  mostLikelyDimmingSource,
  recommendedPatch
}
```

---

## Required Style Fields

For every inspected DOM element, capture at minimum:

```js
{
  display,
  visibility,
  opacity,
  filter,
  backdropFilter,
  mixBlendMode,
  background,
  backgroundColor,
  pointerEvents,
  zIndex,
  transform
}
```

For inline styles, capture:

```js
{
  opacity,
  filter,
  display,
  visibility,
  transform
}
```

---

## DOM Elements to Inspect

Inspect these elements if present:

```text
document.body
#map
#wos-map
.mapboxgl-map
.mapboxgl-canvas-container
.mapboxgl-canvas
#orb-atmosphere
#orb-scan-ring
#orb-stars
#orb-origin
#orb-destination
#orb-route-arc
#wos-mode-transition-overlay
#wos-transition-overlay
```

Also inspect any element matching:

```js
document.querySelectorAll('[id^="orb-"], [class*="orbital"], [class*="wos-orbital"]')
```

Do not throw if an element is missing. Mark it as:

```js
exists: false
```

---

## Body Class Audit

Report all active body classes.

Flag these classes if present:

```text
wos-orbital-active
wos-orbital-earth-active
wos-travel-state
wos-map-dimmed
wos-transition-active
wos-moon-active
wos-moon-orbit-active
wos-moon-surface-active
wos-presentation-card
wos-presentation-website
wos-presentation-canvas
```

Any unexpected Moon or presentation class during Orbital Earth should be listed as a suspect.

---

## Dimming Suspect Rules

The diagnostic must create a `suspects` array.

Add a suspect when:

### Map canvas / container

```text
opacity < 0.98
filter contains brightness below 1
filter contains opacity below 1
filter contains blur
filter contains contrast below 1
visibility is hidden
display is none
```

### Transition overlay

```text
overlay exists and opacity > 0.02
overlay display is not none
overlay visibility is not hidden
```

### Orbital overlays

```text
atmosphere opacity > 0.35
haze opacity > 0
stars opacity > 0 while Clean Earth baseline expected
scan ring display is active
origin opacity > 0.7
```

### Body classes

```text
wos-travel-state still active after transition
wos-transition-active still active after transition
wos-moon-active active during Orbital Earth
presentation class active during Orbital Earth
```

### Camera

```text
zoom too low and Earth appears tiny
zoom too high and Earth appears cropped
projection is not globe
```

---

## Most Likely Dimming Source

The report should compute a single `mostLikelyDimmingSource` when possible.

Priority order:

1. Transition overlay still visible.
2. Map canvas/container filter or opacity.
3. Body class causing dimming.
4. Orbital atmosphere/haze overlay.
5. Mapbox style layer paint values too dark.
6. Camera too far out.
7. Marker/overlay dominance.

If multiple sources are found, list all in `suspects` and assign the most severe as `mostLikelyDimmingSource`.

---

## Required Console Output

When called, the method should log:

```text
[WOS Orbital] VISIBILITY STACK REPORT
```

Then output:

```js
console.table(report.suspects)
console.log(report)
```

If no suspects are found:

```text
[WOS Orbital] VISIBILITY STACK CLEAN
```

---

## Narrow Patch Permission

After implementing the report, a patch is allowed only if the report identifies a clear source.

Examples:

### Allowed

```text
remove leftover transition overlay opacity
clear stuck wos-travel-state body class
remove brightness(0.45) on map canvas
set atmosphere opacity back to clean baseline
fix inline filter not reset on return
```

### Not Allowed

```text
add new stars
add new presets
add new FX sliders
add new Moon states
add new presentation controls
create a new renderer
guess brightness values without report evidence
```

---

## QA Procedure

### Test A — Before Orbital

Run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

Expected:

```text
orbitalEarthActive: false
map exists
no transition overlay active
no Moon classes active
```

### Test B — After Orbital Entry

1. Load WOS map.
2. Select Orbital.
3. Wait until the transition completes.
4. Run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

Expected:

```text
orbitalEarthActive: true
projection: globe
transition overlay opacity <= 0.02
map canvas opacity approximately 1
no blur filters
audio mode off
stars off
haze off
```

### Test C — Return to Map

1. Return from Orbital to map.
2. Run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

Expected:

```text
orbitalEarthActive: false
map opacity restored
map filters restored
transition overlay cleared
no stuck orbital body classes
```

---

## Expected Report Examples

### Bad Report Example

```js
{
  suspects: [
    {
      source: "map.canvas.filter",
      value: "brightness(0.45) contrast(0.85)",
      severity: "high",
      reason: "Mapbox canvas is being dimmed below readable baseline."
    }
  ],
  mostLikelyDimmingSource: "map.canvas.filter",
  recommendedPatch: "Remove or reset canvas filter during Orbital Earth Clean baseline."
}
```

### Clean Report Example

```js
{
  suspects: [],
  mostLikelyDimmingSource: null,
  recommendedPatch: null
}
```

---

## Acceptance Criteria

This spec is complete when:

1. `SBE.OrbitalEarthMode.getVisibilityStackReport()` exists.
2. The method can be called before, during, and after Orbital Earth.
3. The report includes body classes, camera, map canvas/container styles, transition overlay, orbital overlays, tokens, and audio mode.
4. The report identifies suspects using explicit rules.
5. The report identifies the most likely dimming source when possible.
6. No new visual features are added.
7. No Moon expansion is added.
8. No presentation controls are added.
9. Any patch made after the report is narrow and evidence-based.
10. Developer report includes the full diagnostic result or summarized suspects.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
New API added:
Features not touched:
Console QA:
Visibility suspects found:
Most likely dimming source:
Patch made, if any:
Remaining blocker:
```

Also explicitly confirm:

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
OrbitalEarthMode cannot access the Mapbox map instance
Mapbox canvas cannot be located
transition overlay cannot be identified
computed styles cannot be read
Orbital entry path is unclear
visibility report shows Moon/presentation leakage
```

Do not continue with visual tuning until the stop condition is resolved.

---

## Final Principle

Do not tune what you cannot see.

First identify the visibility stack.

Then patch only the layer that is actually dimming Orbital Earth.

## Implementation Guide

- **Where:** Implement the report in `wall/systems/orbital/OrbitalEarthMode.js`; inspect related transition/CSS/body-class layers only as needed.
- **What:** Add `SBE.OrbitalEarthMode.getVisibilityStackReport()` to capture active dimming sources and identify the most likely culprit.
- **Expect:** Orbital readability work moves from screenshot guessing to runtime evidence.
