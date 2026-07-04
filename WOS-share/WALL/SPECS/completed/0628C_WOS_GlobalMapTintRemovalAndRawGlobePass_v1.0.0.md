# 0628C_WOS_GlobalMapTintRemovalAndRawGlobePass_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** WALL / Orbital Earth / Map Visibility  
**Document Type:** Runtime Visual Cleanup Spec  
**Version:** v1.0.0  
**Status:** Active Implementation Spec  
**Sequence:** 0628C  
**Depends On:**  
- `0628B_WOS_OrbitalEarthGlobeVisibilityAndMapTransition_v1.0.0.md`
- `2026-06-28_WALL_0628B-HOTFIX-03_OrbitalBowlRingRemoval_COMPLETION_REPORT.md`

---

## Purpose

Remove the global purple/brown tint/filter that is dulling the map and Orbital globe.

The current screenshot shows that the globe is now visible, but the whole WALL viewport is still covered by a dull paper-like purple/brown wash. This tint affects the map, the satellite globe, and the broadcast HUD frame. It prevents fair evaluation of the raw Mapbox globe.

This spec is a hard reset of unauthorized global visual treatments.

The goal is:

```text
raw map colors first
raw globe visibility first
no global tint
no paper wash
no decorative matte layer
```

---

## Problem Statement

The current Orbital view is not clean because a global visual layer still appears to sit above or affect the map canvas.

Observed symptoms:

```text
purple/brown cast over the entire viewport
paper-like texture / dull matte wash
satellite globe colors muted
HUD and Earth flattened together
background looks like stained glass or paper
```

This is not acceptable for WOS.

The user did not request a global paper texture, purple filter, or matte wash.

---

## Scope

Allowed work:

```text
remove global tint/filter
remove paper/noise/matte overlays
remove destructive map canvas filters
remove unauthorized full-screen pseudo-elements
remove global radial/brown/purple washes
audit map overlay stack
add or update visual stack report fields
```

Not allowed:

```text
new globe renderer
new Earth texture
new FX
new atmosphere
new rim
new haze
new vignette
new paper texture replacement
new Moon work
new PLAY work
new transport controls
new presentation controls
new camera system
```

Do not solve this by replacing the globe. First remove the tint and evaluate the raw result.

---

## Critical Rule

No global overlay, tint, paper texture, haze, fog, rim, or atmospheric wash is allowed unless explicitly approved.

Default WOS map/orbital visual state must be clean.

```text
Clean first.
Style later.
FX only after approval.
```

---

## Current Visual Target

After this spec, the frame should show:

```text
clean raw Mapbox canvas
clean satellite globe colors
no purple/brown wash
no paper pattern
no full-screen tint
no circular bowl/ring
no dull matte layer
HUD secondary
Earth visible without contamination
```

---

## Primary Suspects

Audit and disable or remove the source of the tint.

Search for:

```text
rgba
linear-gradient
radial-gradient
background-blend-mode
mix-blend-mode
backdrop-filter
filter:
sepia
hue-rotate
saturate
brightness
contrast
opacity
paper
noise
grain
film
scanline
texture
matte
wash
tint
purple
brown
violet
overlay
::before
::after
```

Likely targets:

```text
wall/systems/orbital/OrbitalModeController.js
wall/systems/orbital/OrbitalEarthMode.js
wall/systems/runtime/WosModeTransitionController.js
wall/index.html
wall/global CSS
Broadcast HUD CSS
inline orbital-mode-css
body::before / body::after
#wos-wall::before / #wos-wall::after
.mapboxgl-map overlays
.mapboxgl-canvas overlays
.orbital-atm-bridge
.wos-transition-active
.wos-map-dimmed
```

---

## Required Audit

Identify every visible layer above the Mapbox canvas during Orbital Earth.

Report:

| Layer / selector | File | Purpose | Above canvas? | Tint/filter? | Action |
|---|---|---|---:|---:|---|

Minimum layer categories:

```text
Mapbox canvas
Mapbox control chrome
Orbital atmosphere / rim overlays
transition overlay
broadcast HUD panels
left rail
right HUD
bottom transport deck
global body/background overlays
pseudo-elements
PLAY parent overlay if visible
```

---

## Required Fixes

### 1. Remove full-screen tint

Any full-screen overlay that changes the color of the map/globe must be removed or disabled.

Forbidden examples:

```css
background: rgba(... purple/brown ...);
background: radial-gradient(... brown/purple ...);
mix-blend-mode: multiply;
backdrop-filter: blur(...) brightness(...);
filter: sepia(...) hue-rotate(...);
opacity overlay above map canvas;
```

### 2. Remove paper/noise pattern

Disable any decorative texture that creates a paper, dust, film, grain, scanline, halftone, or dot-matrix appearance.

Forbidden unless explicitly approved:

```text
noise texture
grain texture
paper texture
scanline overlay
grid/noise pseudo-element over the whole frame
```

### 3. Preserve functional HUD

Do not delete HUD panels.

Allowed:

```text
keep left telemetry
keep right telemetry
keep transport deck
keep now-playing A3 parent layer
```

But HUD must not globally tint the map/globe.

### 4. Keep bowl-ring removal intact

Do not re-enable:

```text
Mapbox fog
orbitalAtmosphereOpacity
orbitalRimOpacity
deferred overlay fallback timer
brown atmospheric limb wash
```

### 5. Do not change globe renderer yet

Do not add a dedicated Earth renderer in this spec.

Do not evaluate Mapbox satellite quality until the tint is removed.

---

## Required Diagnostics

Use existing reports:

```js
SBE.OrbitalEarthMode.getGlobeVisibilityReport?.()
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.OrbitalEarthMode.getCleanEarthReport?.()
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
SBE.OrbitalEarthMode.getBroadcastCompositionReport?.()
```

If needed, extend `getGlobeVisibilityReport()` or `getVisibilityStackReport()` with:

```js
globalTint: {
  suspected: boolean,
  sourceSelectors: [],
  bodyFilter,
  mapFilter,
  canvasFilter,
  overlayCountAboveCanvas,
  destructiveOverlayCount,
  paperTextureDetected,
  purpleBrownWashDetected
}
```

Do not add a new architecture layer.

---

## QA Procedure

### Test A — Raw Orbital Entry

1. Enter Orbital.
2. Wait for satellite style load and transition settle.
3. Run:

```js
SBE.OrbitalEarthMode.getGlobeVisibilityReport?.()
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

Expected:

```text
no destructive map/canvas filter
no transition overlay active
no atmosphere/rim overlay
no global purple/brown wash
no paper texture overlay
satellite style still active
globe visible
```

---

### Test B — Screenshot Review

Capture screenshot.

Expected:

```text
no purple/brown wash over the viewport
no paper-like pattern
globe colors look cleaner
Earth can be evaluated without contamination
HUD remains visible but secondary
```

Fail if:

```text
the entire viewport still has a dull violet/brown film
the map canvas still looks like paper
the globe is visibly filtered by an overlay
```

---

### Test C — Return to Map

Return to normal map.

Run:

```js
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

Expected:

```text
passed: true
blockers: []
normal WOS map restored
no stuck filter
no stuck style
no stuck overlay
```

---

### Test D — Repeat Round Trip

Run:

```text
Map → Orbital → Map → Orbital → Map
```

Expected:

```text
no compounding tint
no returning paper texture
no stuck wash
no transition residue
```

---

## Acceptance Criteria

This spec is complete when:

1. The global purple/brown tint is removed.
2. Paper/noise/matte pattern is removed or proven not from WOS.
3. Mapbox canvas is not globally filtered.
4. Satellite globe colors are no longer dulled by a WOS overlay.
5. Bowl/ring removal remains intact.
6. Globe remains visible.
7. Clean Earth report passes.
8. Globe visibility report passes or identifies only remaining non-tint blockers.
9. Transition cleanup passes.
10. Broadcast composition still passes.
11. Normal map restores cleanly.
12. No new renderer is added.
13. No new FX are added.
14. No Moon code is touched.
15. No PLAY code is touched.
16. No transport controls are changed.
17. No presentation controls are added.

---

## Required Developer Report

After implementation, report:

```text
Files searched:
Files edited:
Exact source of global purple/brown tint:
Exact source of paper/noise/matte pattern:
Layer audit table:
Properties removed/changed:
Before visual stack values:
After visual stack values:
Before screenshot summary:
After screenshot summary:
Map → Orbital QA:
Orbital → Map QA:
Repeated round-trip QA:
Features not touched:
Remaining blocker:
```

Explicitly confirm:

```text
No new renderer added.
No new FX added.
No Moon changes.
No PLAY changes.
No transport changes.
No presentation controls added.
```

---

## Stop Conditions

Stop and report if:

```text
tint source cannot be identified
paper pattern is coming from browser/GPU/screenshot compression, not WOS
removing tint breaks HUD readability
removing overlay breaks map interactivity
transition cleanup fails after patch
normal map cannot restore cleanly
```

Do not replace the tint with another overlay.

---

## Final Principle

The user should not have to look through a dirty pane of glass to see WOS.

The map and globe must be clean before any style, atmosphere, or FX is allowed back.

## Implementation Guide

- **Where:** Audit `OrbitalModeController.js`, `OrbitalEarthMode.js`, `WosModeTransitionController.js`, WALL global CSS, and inline Broadcast HUD CSS.
- **What:** Remove the global purple/brown tint and paper-like dulling pattern from the map/orbital viewport.
- **Expect:** A cleaner raw globe/map frame that can be judged without WOS-added visual contamination.
