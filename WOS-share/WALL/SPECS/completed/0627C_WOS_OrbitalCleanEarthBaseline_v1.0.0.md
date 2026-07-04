# 0627C_WOS_OrbitalCleanEarthBaseline_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth Recovery  
**Document Type:** Runtime Recovery Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Spec  
**Sequence:** C  
**Depends On:**  
- `0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0.md`
- `0627_WOS_OrbitalVisibilityStackAudit_v1.0.0.md`

---

## Purpose

Establish a clean, readable Orbital Earth baseline before any FX, Moon work, presentation controls, or additional visual features are resumed.

This spec exists to make Orbital Earth trustworthy:

```text
WOS map
→ Orbital selected
→ Mapbox globe appears
→ Earth is readable immediately
→ return to map restores cleanly
```

No decorative layer should be louder than the Earth.

---

## Active Scope Lock

The Orbital scope freeze remains active.

Do not add:

```text
new FX
new particles
new stars
new scan rings
new Moon features
new presentation controls
new UI panels
new transport buttons
new visual modes
new architecture systems
```

This spec allows only baseline cleanup and readability correction.

---

## Current Problem

Orbital Earth now uses the correct Mapbox-first direction, but the visual baseline is not yet stable.

Observed issue:

```text
Earth is present.
Mapbox globe is active.
But Earth can appear too dim, fuzzy, small, or visually buried.
```

The supporting atmosphere, markers, overlays, body classes, filters, transition layers, and audio systems must not interfere with the default read.

Before any dramatic Orbital FX returns, the baseline must work with almost everything off.

---

## Clean Earth Definition

Clean Earth is the default Orbital Earth state.

It should include only:

```text
Mapbox globe
current WOS map style
readable linework/geography
soft outer rim
minimal origin marker
existing HUD
```

It should not include:

```text
stars
scan rings
audio sparkle
route particles
haze
vignette
fake Three.js sphere
portal orb
particle planet
Moon visuals
extra dark veil
presentation overlay
```

---

## Required Default Visual Stack

The default Orbital stack must read in this order:

```text
1. Earth / Mapbox globe
2. Map linework and geography
3. Soft rim / atmosphere edge
4. Small origin marker
5. HUD
```

Everything else must be disabled, hidden, or reduced to zero.

---

## Default On

These may remain active by default:

### Mapbox Globe

Required.

```text
projection: globe
map style: current WOS style
map canvas: visible
```

### Map Linework

Required.

Linework must remain readable. If the style is too dark at globe zoom, patch the actual style/canvas source identified by the visibility-stack report.

### Soft Rim

Allowed.

Constraints:

```text
rim only
no center haze
no dark vignette
no edge blackout
opacity low
```

### Origin Marker

Allowed.

Constraints:

```text
small
ring-style preferred
lower visual priority than Earth
no large glowing dot
no heavy pulse by default
```

### HUD

Allowed.

Existing HUD remains visible, but must not obscure the Earth center.

---

## Default Off

Disable by default:

```text
starfield
scan ring
audio sparkle
route particles
signal particles
heavy atmosphere haze
center haze
dark vignette
portal orb
fake sphere
Three.js visualizer
Moon mode visuals
presentation placeholders
```

These can return only in later specs after the Clean Earth baseline passes.

---

## Required Diagnostic Dependency

Before patching readability values, run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

Use the report to confirm whether the dimming source is:

```text
transition overlay
body class
map canvas filter
map container opacity
orbital overlay opacity
style token
camera zoom
audio bleed
Moon/presentation leakage
```

Do not guess.

---

## Implementation Requirements

### 1. Add or enforce a Clean Earth preset/state

Use a clearly named internal state such as:

```js
clean_earth
```

or a method such as:

```js
applyCleanEarthBaseline()
```

This method must not add new UI.

It should only ensure the default Orbital entry is visually clean.

---

### 2. Ensure overlays are off or minimal

Default values should behave like:

```js
{
  starsEnabled: false,
  scanRingEnabled: false,
  audioOverlayEnabled: false,
  routeParticlesEnabled: false,
  signalParticlesEnabled: false,
  hazeOpacity: 0,
  vignetteOpacity: 0,
  starOpacity: 0,
  scanRingOpacity: 0,
  atmosphereOpacity: 0.12-0.22,
  originOpacity: 0.35-0.60
}
```

Exact values may be adjusted only after checking the visibility stack report.

---

### 3. Ensure audio overlay cannot bleed through

If audio mode is off, audio signals must not modify visible overlays.

Required behavior:

```js
if (audioMode === "off") return;
```

or equivalent.

---

### 4. Ensure transition veil is cleared

After Orbital entry completes:

```text
transition overlay opacity <= 0.02
transition overlay display none or inert
no stuck transition body class
```

Do not allow a transition layer to remain above the map.

---

### 5. Ensure map canvas is not darkened

Mapbox canvas/container should not have destructive filters.

Bad examples:

```css
filter: brightness(0.45)
filter: contrast(0.75)
opacity: 0.6
backdrop-filter: blur(...)
```

Clean Earth target:

```text
map canvas opacity ≈ 1
map canvas filter: none or non-destructive
map container opacity ≈ 1
map container filter: none or non-destructive
```

---

### 6. Ensure marker is secondary

The origin marker should not be the most visible element.

If the marker reads louder than Earth:

```text
reduce opacity
reduce glow
reduce radius
remove pulse
use ring instead of filled dot
```

---

## Files Likely in Scope

Likely files:

```text
wall/systems/orbital/OrbitalEarthMode.js
wall/systems/orbital/WosMapStyleTokens.js
wall/systems/orbital/OrbitalAudioOverlayController.js
wall/systems/runtime/WosModeTransitionController.js
wall/styles.css
```

Only edit files that are directly responsible for the report-identified issue.

Do not edit:

```text
Moon files
presentation router files
transport button files
TopBar
Studio
PLAY
```

unless the visibility-stack report proves leakage from those systems.

---

## Required API / Helper Behavior

If not already present, expose:

```js
SBE.OrbitalEarthMode.applyCleanEarthBaseline?.()
```

Optional but useful:

```js
SBE.OrbitalEarthMode.getCleanEarthReport?.()
```

Report should include:

```js
{
  cleanEarthActive: true,
  overlaysOff: true,
  audioOff: true,
  starsOff: true,
  hazeOff: true,
  transitionOverlayClear: true,
  mapCanvasReadable: true,
  originMarkerSecondary: true
}
```

Do not create UI for these.

---

## QA Procedure

### Test A — Enter Orbital

1. Start WOS on the normal map.
2. Select Orbital.
3. Wait for transition completion.
4. Run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

Expected:

```text
projection is globe
map canvas opacity is near 1
map canvas filter is none or non-destructive
transition overlay is clear
stars are off
scan ring is off
haze is off
audio mode is off
origin marker is not dominant
```

---

### Test B — Visual Read

Screenshot should pass:

```text
Can I tell this is Earth in under 1 second?
Can I see map linework/geography?
Is the planet more important than the marker?
Is the view clean before FX?
```

---

### Test C — Return to Map

1. Return to map.
2. Run:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

Expected:

```text
orbitalEarthActive: false
map filter restored
map opacity restored
no stuck transition overlay
no stuck orbital body classes
```

---

## Acceptance Criteria

This spec is complete when:

1. Orbital entry defaults to Clean Earth.
2. Earth is readable before FX.
3. Starfield is off by default.
4. Scan rings are off by default.
5. Audio sparkle is off by default.
6. Haze and vignette are off by default.
7. Transition veil is cleared after entry.
8. Map canvas/container are not destructively dimmed.
9. Origin marker is secondary to the Earth.
10. No new visual features are added.
11. No Moon expansion is added.
12. No presentation controls are added.
13. No transport buttons are added.
14. Visibility-stack report confirms no major dimming suspects remain.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Visibility report before patch:
Visibility suspects:
Patch made:
Visibility report after patch:
Visual QA result:
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

Stop and report instead of patching if:

```text
visibility-stack report cannot run
Mapbox canvas cannot be found
transition overlay cannot be inspected
dimming source cannot be identified
Moon or presentation leakage is detected
Orbital entry path is unclear
```

Do not continue with visual tuning until the stop condition is resolved.

---

## Final Principle

Clean Earth comes before cinematic Earth.

First make Orbital readable.

Then, later, make it dramatic.

## Implementation Guide

- **Where:** Patch only the files responsible for the report-identified visual obstruction, most likely `OrbitalEarthMode.js`, `WosMapStyleTokens.js`, transition cleanup, or CSS.
- **What:** Enforce a Clean Earth default with Mapbox globe readable, overlays off, no haze/vignette, no audio sparkle, and no transition veil.
- **Expect:** Orbital opens to a clean, readable Earth before any optional FX are reintroduced.
