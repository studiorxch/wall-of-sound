# 0627D_WOS_OrbitalCameraFramingCorrection_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth Recovery  
**Document Type:** Runtime Recovery Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Spec  
**Sequence:** D  
**Depends On:**  
- `0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0.md`
- `0627_WOS_OrbitalVisibilityStackAudit_v1.0.0.md`
- `0627C_WOS_OrbitalCleanEarthBaseline_v1.0.0.md`

---

## Purpose

Correct Orbital Earth camera framing after the Clean Earth baseline is established.

The goal is not to add new camera features. The goal is to make the default Orbital Earth view readable, centered, prominent, and restorable.

Orbital Earth should feel like a deliberate WOS broadcast scene, not a tiny globe lost in the HUD or a cropped planet hidden behind controls.

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
new camera experiments
```

Allowed work:

```text
camera preset correction
globe-fit logic correction
safe viewport measurement
map camera save/restore verification
diagnostic reporting
```

---

## Current Problem

After the camera-fit patch, Orbital Earth can overcorrect.

Known failure modes:

```text
Earth is too small.
Earth is too far from the viewer.
Earth is technically visible but compositionally weak.
Fit retry reduces zoom too aggressively.
HUD-safe padding may shrink the globe more than needed.
Cinematic crop can accidentally become default.
Return-to-map camera restoration must remain reliable.
```

The correct default is:

```text
full Earth visible
large enough to matter
not cropped
not tiny
HUD-safe
camera restorable
```

---

## Correct Default Target

`readable_orbit` is the default Orbital Earth camera preset.

Target composition:

```text
Earth occupies roughly 55%–65% of viewport height.
Earth center sits slightly above visual center when bottom controls are present.
Earth is fully visible inside the HUD-safe area.
Map linework remains readable.
Origin marker remains secondary.
```

Do not prioritize mathematical safety over visual usefulness.

A tiny Earth is a failed frame even if it is technically not cropped.

---

## Required Camera Presets

Keep the existing preset model, but verify behavior.

| Preset | Role | Default? | Notes |
|---|---:|---:|---|
| `readable_orbit` | Main readable Orbital Earth | Yes | Full but prominent Earth |
| `broadcast_orbit` | Wider OBS-safe view | No | More room for title cards/HUD |
| `deep_orbit` | Dramatic wide view | No | Small Earth allowed |
| `cinematic_crop` | Manual close/crop | No | Never default |

---

## Recommended Starting Values

These are starting targets, not hard laws. Adjust only after QA.

```js
const _CAMERA_PRESETS = {
  readable_orbit: {
    zoom: 1.0,
    pitch: 0,
    bearing: 0,
    padding: { top: 80, right: 80, bottom: 150, left: 80 }
  },

  broadcast_orbit: {
    zoom: 0.8,
    pitch: 0,
    bearing: 0,
    padding: { top: 100, right: 120, bottom: 180, left: 120 }
  },

  deep_orbit: {
    zoom: 0.45,
    pitch: 0,
    bearing: 0,
    padding: { top: 80, right: 80, bottom: 150, left: 80 }
  },

  cinematic_crop: {
    zoom: 1.35,
    pitch: 0,
    bearing: 0,
    manualOnly: true,
    padding: { top: 80, right: 80, bottom: 150, left: 80 }
  }
};
```

If the current implementation already has different values, do not blindly replace them. Use the diagnostic report and visual result.

---

## Fit Logic Requirements

### Fit should prevent clipping

`fitGlobeToViewport()` must protect against:

```text
Earth clipped by viewport edge
Earth hidden behind bottom controls
Earth cropped by HUD-safe padding
Earth outside visible center
```

### Fit should not make Earth tiny

`fitGlobeToViewport()` must also protect against:

```text
Earth diameter below useful visual size
over-aggressive zoom reduction
repeated retries that shrink Earth too much
```

### Correct fit definition

A valid fit means:

```text
not clipped
not tiny
centered in useful broadcast area
safe from HUD controls
```

Not merely:

```text
zoom <= 1.4
```

---

## Retry Logic Correction

If retry is needed, it should be small and conditional.

Bad behavior:

```js
zoom -= 0.25
zoom -= 0.25
```

Better behavior:

```js
zoom -= 0.10
```

Only retry when the report proves clipping or unsafe framing.

Retry limit:

```text
maximum 2 retries
```

If fit still fails, report failure without hiding the issue.

---

## Required Globe Fit Report

`getGlobeFitReport()` should include:

```js
{
  preset,
  zoom,
  pitch,
  bearing,
  center,
  projection,
  safeViewport,
  viewportSize,
  estimatedGlobeSize,
  globeFitPassed,
  globeTooSmall,
  globePossiblyCropped,
  retryCount,
  savedCameraStateExists,
  recommendedAdjustment
}
```

If actual globe pixel measurement is not available, use a documented estimate and mark:

```js
estimated: true
```

Do not pretend the estimate is exact.

---

## Required Camera Save / Restore

Orbital must preserve the map camera before entry.

### Save before Orbital visual changes

Required state:

```js
{
  center,
  zoom,
  bearing,
  pitch,
  projection,
  padding,
  timestamp
}
```

### Restore on return

On return to map, restore:

```text
center
zoom
bearing
pitch
projection
padding if applicable
```

If restore fails, log:

```text
[WOS Orbital] CAMERA RESTORE FAILED
```

Do not silently fall back unless the fallback is logged.

---

## Manual-Only Rule for Cinematic Crop

`cinematic_crop` must never be selected automatically.

Forbidden:

```text
default Orbital entry uses cinematic_crop
fit retry selects cinematic_crop
return from Moon selects cinematic_crop
FX panel state persists cinematic_crop as next default
```

Allowed:

```text
user manually selects cinematic_crop
```

If the user leaves Orbital and re-enters, default should return to:

```text
readable_orbit
```

unless a future explicit preference system is designed.

---

## Files Likely in Scope

Likely file:

```text
wall/systems/orbital/OrbitalEarthMode.js
```

Possible supporting files only if needed:

```text
wall/systems/runtime/WosModeTransitionController.js
wall/systems/orbital/OrbitalMapContext.js
wall/styles.css
```

Do not edit:

```text
Moon files
presentation router files
transport tabs
FX panel
TopBar
PLAY
Studio
```

unless the camera report proves a dependency.

---

## Required QA

### Test A — Default Entry

1. Start WOS on the normal map.
2. Select Orbital.
3. Wait for transition completion.
4. Run:

```js
SBE.OrbitalEarthMode.getGlobeFitReport?.()
SBE.OrbitalEarthMode.getCleanEarthReport?.()
```

Expected:

```text
preset: readable_orbit
projection: globe
globeFitPassed: true
globeTooSmall: false
globePossiblyCropped: false
savedCameraStateExists: true
```

---

### Test B — Manual Presets

Run:

```js
SBE.OrbitalEarthMode.setCameraPreset?.("broadcast_orbit")
SBE.OrbitalEarthMode.getGlobeFitReport?.()
```

Expected:

```text
Earth wider / safer for HUD.
No crop.
```

Run:

```js
SBE.OrbitalEarthMode.setCameraPreset?.("deep_orbit")
SBE.OrbitalEarthMode.getGlobeFitReport?.()
```

Expected:

```text
Earth smaller by design.
No false failure just because Deep Orbit is intentionally wide.
```

Run:

```js
SBE.OrbitalEarthMode.setCameraPreset?.("cinematic_crop")
SBE.OrbitalEarthMode.getGlobeFitReport?.()
```

Expected:

```text
Manual-only close view.
May be cropped by design.
Should not become default.
```

---

### Test C — Return to Map

1. Change map camera before entering Orbital.
2. Enter Orbital.
3. Return to Map.
4. Confirm map camera restores.

Expected:

```text
original center restored
original zoom restored
original pitch restored
original bearing restored
no stuck Orbital preset
```

---

### Test D — Re-Entry

1. Enter Orbital.
2. Manually select `cinematic_crop`.
3. Return to Map.
4. Enter Orbital again.

Expected:

```text
preset: readable_orbit
not cinematic_crop
```

---

## Acceptance Criteria

This spec is complete when:

1. Orbital entry defaults to `readable_orbit`.
2. Earth is full and prominent, not tiny.
3. Earth is not cropped in default view.
4. Earth occupies roughly 55%–65% of viewport height, or closest practical equivalent.
5. Fit retry does not over-shrink the globe.
6. `cinematic_crop` is manual-only.
7. `getGlobeFitReport()` reports useful framing diagnostics.
8. Map camera is saved before Orbital entry.
9. Map camera restores on return.
10. No new visual features are added.
11. No Moon expansion is added.
12. No presentation controls are added.
13. No transport buttons are added.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Camera values before:
Camera values after:
Globe fit report:
Clean Earth report:
Visual QA result:
Return-to-map QA:
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
Mapbox camera APIs are unavailable
map instance cannot be accessed
projection cannot be verified
globe fit cannot be estimated
camera restore conflicts with transition controller
cinematic_crop is being selected by another module
saved camera state is missing or overwritten
```

Do not continue by guessing.

---

## Final Principle

The camera should not merely avoid failure.

It should compose the Earth.

Default Orbital Earth must feel intentional:

```text
full enough to read
large enough to matter
safe enough for HUD
stable enough to return from
```

## Implementation Guide

- **Where:** Patch `OrbitalEarthMode.js` camera presets, fit retry logic, `getGlobeFitReport()`, and save/restore behavior only if needed.
- **What:** Make `readable_orbit` the stable default, prevent over-shrinking, keep `cinematic_crop` manual-only, and verify return-to-map camera restoration.
- **Expect:** Clean Earth becomes correctly framed: prominent, full, readable, HUD-safe, and restorable.
