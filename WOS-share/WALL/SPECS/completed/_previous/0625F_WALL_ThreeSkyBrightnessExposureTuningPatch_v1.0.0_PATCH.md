# 0625F_WALL_ThreeSkyBrightnessExposureTuningPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Three Sky Visual Tuning

`0625E` successfully mounted the WALL-side Three Sky renderer.

Current confirmed state:

```text
ATM THREE SKY
WALL sky layer mounted
postMessage bridge works
cloudAtmosphereRenderer.js preserved
camera POV controls preserved
tsc clean
```

Current visual issue:

```text
The sky looks overly dark.
```

This patch tunes the Three Sky shader brightness/exposure/phase values without removing the working renderer.

---

## Active Project Paths

```text
WOS root:
  /Users/studio/Projects/wall-of-sound

WALL runtime:
  /Users/studio/Projects/wall-of-sound/wall

PLAY root:
  /Users/studio/Projects/wall-of-sound/play

PLAY app:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
```

Do not use:

```text
/Users/studio/Projects/play
```

That path is legacy/inactive.

---

## Protected Baseline

Do not regress:

```text
ATM THREE SKY
Three Sky layer mounted
WALL → PLAY sky status bridge
cloudAtmosphereRenderer.js
camera POV EXT / DRIVER / PASS
vehicle controls
route launch
music play button
clock
weather
TAB / Show / Operate visibility model
map pan/zoom
```

---

## Goal

Make the sky visibly atmospheric without becoming a dark wash.

Target:

```text
brighter sky
clearer horizon gradient
less black/gray overhead tone
more afternoon/evening atmosphere
no vignette
no haze blanket
no CSS overlay fix
```

---

## Non-Negotiable Rule

Do not fix darkness by adding:

```text
vignette
screen wash
CSS haze
dark overlay
light overlay blanket
fake fog
```

The fix must happen in the WALL sky shader parameters and/or shader color math.

---

## Likely Cause

The sky can look too dark because of one or more of:

```text
exposure too low
base sky gradient too dark
sun elevation mapped too low for EVENING
phase table values too aggressive
fragment shader color output not gamma-corrected
Mapbox layer blending/draw order causing dark composition
turbidity/rayleigh/mie values too dense
night/evening phase chosen too early
```

This patch should tune the model, not remove it.

---

## Required Parameter Audit

Audit `wall/threeSkyLayer.js` and `SBE.AtmosphereRuntime.getState()` / `SKY_PARAMS`.

Check values for:

```text
phase
sunElevation
sunAzimuth
turbidity
rayleigh
mieCoefficient
mieDirectionalG
exposure
cloudCoverage
cloudDensity
cloudElevation
```

Document the values used for:

```text
afternoon
evening
sunset
night
```

---

## Required Brightness Tuning

Create a safer brightness curve.

Suggested starting adjustments:

```text
AFTERNOON:
  exposure: increase 15–35%
  rayleigh: reduce slightly if sky is too heavy
  turbidity: reduce slightly if gray/muddy

EVENING:
  exposure: increase 25–50%
  sunElevation: keep positive longer
  avoid dropping into sunset/night darkness too early
  keep horizon readable

SUNSET:
  allow warmth but not black overhead
  keep exposure above minimum threshold

NIGHT:
  can be darker, but not relevant to evening unless phase is actually night
```

Use actual values from the repo.

---

## Required Minimum Luminance

Add a minimum sky brightness floor in the shader/model.

Suggested concept:

```text
minSkyLuminance
```

or shader-side clamp:

```glsl
color = max(color, vec3(minLuminance));
```

Use subtle values only.

Do not flatten the sky.

Target:

```text
preserve gradient
prevent crushed dark sky
```

---

## Required Phase Timing Check

The current screenshot reports:

```text
SKY EVENING
```

If the phase changes to EVENING too early or uses too-dark values, adjust the phase table.

Evening should still have visible sky.

Do not make EVENING look like NIGHT.

---

## Required Status Display

Keep status truthful:

```text
ATM THREE SKY
SKY EVENING
SUN EL ...
CLOUD ...
```

If tuning adds parameters, optionally display:

```text
EXP 1.15
```

or keep it internal.

Do not clutter the HUD unless useful.

---

## Acceptance Criteria

### A. Three Sky remains active

Status remains:

```text
ATM THREE SKY
```

---

### B. Sky visibly brighter

The sky no longer reads as overly dark in EVENING/AFTERNOON.

---

### C. No vignette/haze added

No new vignette, CSS haze, or overlay wash is added.

---

### D. Evening is not night

EVENING phase remains atmospheric/readable, not black or crushed gray.

---

### E. Horizon remains readable

The sky has a visible atmospheric gradient and does not collapse into a flat dark band.

---

### F. Clouds preserved

Existing cloud renderer/status remains intact.

---

### G. Existing controls preserved

No controls/signals disappear.

---

### H. Map remains interactive

Pan/zoom still works.

---

### I. tsc clean if PLAY touched

Run if PLAY files are touched:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

---

## Manual Test Checklist

1. Start WALL.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm:

```text
ATM THREE SKY
```

5. Check sky at current EVENING phase.

Expected:

```text
brighter, readable, atmospheric
```

6. Confirm no new vignette/haze/overlay.

7. Confirm camera POV controls remain.

8. Confirm vehicle controls remain.

9. Confirm clock/weather remain.

10. Confirm TAB / Show / Operate still work.

11. Confirm map pan/zoom works.

12. Run typecheck if PLAY touched.

---

## Expected Result

The WALL Three Sky layer remains active, but the sky is tuned brighter and more atmospheric.

The screen should feel like:

```text
real sky layer
readable evening atmosphere
no dark overlay
no vignette
no lost controls
```

---

## Implementation Guide

- **Where:** `wall/threeSkyLayer.js`, `wall/atmosphereRuntime.js`, `SKY_PARAMS`.
- **What:** Tune exposure/luminance/phase parameters and shader color floor so `EVENING` and `AFTERNOON` read as atmospheric rather than overly dark.
- **Expect:** `ATM THREE SKY` remains active with a brighter, clearer sky and no UI/control regressions.
