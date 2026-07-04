# 0625E_WALL_ThreeSkyLayerMapboxCustomLayerPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / WALL-Side Three.js Sky Integration

This patch moves real sky integration to the correct runtime location:

```text
WALL, not PLAY
```

`0625D` established the blocker:

```text
Three.js exists in WOS/WALL as global.THREE.
PLAY is the wrong layer to mount a sky canvas.
A PLAY-side canvas would overlay or fight WOS cloudAtmosphereRenderer.js.
Correct path: WALL-side Mapbox CustomLayerInterface.
```

This patch implements the next step:

```text
Add a WALL-side Three.js Sky layer as a Mapbox custom layer.
```

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

## Naming / Location Clarification

Use:

```text
WALL
```

not:

```text
WOS
PLAY
Studio
Canvas
```

for this patch.

Patch name:

```text
0625E_WALL_ThreeSkyLayerMapboxCustomLayerPatch
```

This is a WALL runtime patch.

---

## Protected Baseline

Do not regress the recovered PLAY/Broadcast baseline from `0625D`.

Must remain intact:

```text
clock
weather
music play button
vehicle controls
route launch
camera instrumentation
POV EXT / DRIVER / PASS controls
sky status
Studio / Canvas access
TAB hide/show
Operate restores controls
Show clean view
map pan/zoom
```

Do not remove or hide:

```text
TIME
ZONE
WX
TEMP
HUM
PREC
WIND
SRC
CAM
POV
SPD
ALT
ROUTE
SKY
SUN
CLOUD
ATM
```

---

## Goal

Integrate real Three.js Sky at the WALL map rendering layer.

Target status after successful integration:

```text
ATM THREE SKY
```

or, if partially blocked:

```text
ATM SKY BRIDGE — [exact blocker]
```

No vague blockers.

---

## Non-Negotiable Visual Rule

Do not add or increase:

```text
vignette
dark haze
screen-edge wash
blanket overlay
fake fog layer
```

The sky must be rendered as atmosphere, not a CSS effect.

No new PLAY-side overlay canvas.

No fake sky wash.

No opaque gradient blanket.

---

# Part 1 — WALL Three Sky Layer

## Required New File

Add a WALL runtime sky layer file:

```text
wall/threeSkyLayer.js
```

or equivalent existing naming convention.

Purpose:

```text
Create a Mapbox CustomLayerInterface that renders a Three.js Sky/sun shader using WALL's Three.js runtime.
```

---

## Required Custom Layer Shape

Implement a Mapbox custom layer object similar to:

```js
const threeSkyLayer = {
  id: "wall-three-sky",
  type: "custom",
  renderingMode: "3d",

  onAdd(map, gl) {
    // initialize Three.js scene/camera/renderer using Mapbox GL context
  },

  render(gl, matrix) {
    // update camera projection from Mapbox matrix
    // render sky
    // map.triggerRepaint()
  }
};
```

Use actual Mapbox version conventions in WALL.

---

## Required Three.js Source

Use existing WALL Three.js availability if present:

```text
global.THREE
window.THREE
existing imported THREE
```

Do not add a second incompatible Three.js bundle unless absolutely necessary.

If `Sky` helper is not present globally, either:

```text
A. add/load the Three.js Sky helper in WALL
```

or:

```text
B. implement a minimal shader material equivalent
```

or:

```text
C. keep bridge with exact blocker:
   ATM SKY BRIDGE — THREE SKY HELPER MISSING
```

Do not silently fail.

---

## Required Parameters

The layer must map from the centralized sky/atmosphere model.

Minimum parameter set:

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

If cloud rendering is not implemented in this layer yet, keep cloud values in model/status and preserve `cloudAtmosphereRenderer.js`.

---

# Part 2 — Parameter Authority / Bridge

## Current Authority

`0625D` created/confirmed:

```text
skyAtmosphereModel.ts
```

as the PLAY-side display authority.

For WALL integration, the WALL renderer should source equivalent values from:

```text
wall/atmosphereRuntime.js
```

or another existing WALL atmosphere state.

Required:

```text
Do not scatter sky constants across multiple files.
```

Add a bridge/helper if needed:

```text
wall/skyAtmosphereRuntime.js
```

or:

```text
wall/atmosphereRuntime.js exports/getSkyAtmosphereState()
```

The bridge should provide:

```js
{
  phase,
  sunElevation,
  sunAzimuth,
  turbidity,
  rayleigh,
  mieCoefficient,
  mieDirectionalG,
  exposure,
  cloudCoverage,
  cloudDensity,
  cloudElevation,
  renderer
}
```

---

## Required Status Bridge Back To PLAY

The PLAY Broadcast status panel currently shows:

```text
ATM SKY BRIDGE — THREE CANVAS BLOCKED
```

After WALL sky layer attempts integration, update status source to one of:

```text
ATM THREE SKY
ATM SKY BRIDGE — THREE SKY HELPER MISSING
ATM SKY BRIDGE — MAPBOX CUSTOM LAYER BLOCKED
ATM SKY BRIDGE — WALL THREE UNAVAILABLE
ATM SKY BRIDGE — [exact blocker]
```

If real WALL sky layer is active:

```text
renderer = "three-sky"
```

If not:

```text
renderer = "sky-bridge"
blocker = "...exact reason..."
```

---

# Part 3 — Preserve cloudAtmosphereRenderer.js

`0625D` noted that a PLAY canvas would overlay/fight:

```text
cloudAtmosphereRenderer.js
```

This patch must not remove it.

Required behavior:

```text
preserve existing cloudAtmosphereRenderer.js
do not cover it with a PLAY canvas
do not duplicate clouds destructively
```

If the Three Sky layer renders only sky/sun and cloud renderer handles clouds, that is acceptable.

Status should remain truthful:

```text
CLOUD 30% / D 0.35
ATM THREE SKY
```

or:

```text
ATM THREE SKY + CLOUD BRIDGE
```

if needed.

---

# Part 4 — Layer Ordering

The sky layer must render in an appropriate order.

Preferred:

```text
behind 3D buildings/vehicles/world geometry
behind route and actor overlays
visible at horizon/sky area
not over text/HUD
not over controls
```

If Mapbox custom layer cannot render behind certain base layers, document exact limitation.

Do not solve ordering with a dark overlay.

---

# Part 5 — Camera / POV Baseline Preservation

Do not touch or regress `0625D` camera POV controls.

Must remain:

```text
POV EXT
POV DRIVER
POV PASS
```

Bridge must remain:

```text
wall/index.html listener
SBE.CameraShotSelectorUI.setShot(mode)
```

Do not rename modes unless existing code requires it.

---

# Part 6 — Visibility Rules

PLAY visibility behavior remains unchanged:

```text
controls visible by default
TAB hides
TAB restores
Operate restores
Show may hide
reload starts visible
```

The WALL sky renderer should continue running regardless of PLAY controls visibility unless performance requires a toggle.

Do not tie sky rendering to TAB hidden state.

---

## Files Likely Touched

WALL:

```text
wall/index.html
wall/threeSkyLayer.js
wall/atmosphereRuntime.js
wall/cloudAtmosphereRenderer.js
wall/styles.css
wall/map*.js
wall/*runtime*.js
```

PLAY, only if status wiring needs update:

```text
play/flow-curve-builder/src/runtime/skyAtmosphereModel.ts
play/flow-curve-builder/src/ui/BroadcastRouteCameraInstrumentation.tsx
play/flow-curve-builder/src/ui/BroadcastSkyAtmosphereStatus.tsx
```

Use actual repo filenames and existing conventions.

---

## Implementation Steps

### 1. Preserve baseline first

Before changes, verify:

```text
0625D baseline visible
POV controls work
weather/clock visible
WOS/WALL nav visible
tsc clean
```

### 2. Audit WALL Three.js support

Search WALL for:

```text
THREE
three
Sky
cloudAtmosphereRenderer
CustomLayerInterface
map.addLayer
renderingMode
onAdd
triggerRepaint
```

Document result in comments or build note.

### 3. Add WALL sky atmosphere runtime helper

Expose sky parameters from one WALL source.

### 4. Add `wall/threeSkyLayer.js`

Implement the custom layer.

### 5. Register layer in WALL map setup

Add it through existing map initialization.

Example:

```js
map.on("style.load", () => {
  map.addLayer(createThreeSkyLayer(getSkyAtmosphereState()));
});
```

Use actual setup event.

### 6. Connect renderer status

Update renderer status:

```text
three-sky
```

or exact blocker.

### 7. Keep PLAY status accurate

PLAY panel should show `ATM THREE SKY` only if WALL reports active Three Sky.

### 8. Test map interaction

Map pan/zoom must remain working.

### 9. Typecheck PLAY if touched

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

---

## Acceptance Criteria

### A. WALL-side implementation

Three Sky integration attempt is implemented in WALL, not PLAY.

---

### B. No PLAY sky overlay canvas

No new PLAY overlay canvas is used for sky.

---

### C. Mapbox custom layer used or exact blocker shown

Either:

```text
wall-three-sky custom layer active
```

or:

```text
ATM SKY BRIDGE — [exact custom layer / helper blocker]
```

---

### D. Three.js source uses WALL runtime

Uses existing WALL/global Three.js if available.

No duplicate incompatible Three.js bundle unless documented.

---

### E. Parameters mapped

Sky layer maps:

```text
sunElevation
sunAzimuth
turbidity
rayleigh
mieCoefficient
mieDirectionalG
exposure
```

---

### F. Cloud renderer preserved

`cloudAtmosphereRenderer.js` remains active/not broken.

---

### G. No vignette/haze increase

No added/increased vignette, dark haze, screen wash, or blanket overlay.

---

### H. Status truthful

PLAY/Broadcast displays one of:

```text
ATM THREE SKY
ATM SKY BRIDGE — [exact blocker]
```

---

### I. Existing controls preserved

All `0625D` controls remain:

```text
music play
vehicle controls
route launch
POV EXT/DRIVER/PASS
TAB
Operate/Show
Studio/Canvas
```

---

### J. Existing signals preserved

All signal rows remain:

```text
TIME
ZONE
WX
TEMP
HUM
PREC
WIND
SRC
CAM
POV
SPD
ALT
ROUTE
SKY
SUN
CLOUD
ATM
```

---

### K. Map remains interactive

Pan/zoom still works.

---

### L. Performance acceptable

No visible severe frame drop or map lock.

---

### M. tsc clean if PLAY touched

`tsc -b` exits 0 if PLAY files are touched.

---

## Manual Test Checklist

1. Start WALL/WOS local server.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm baseline:

```text
clock/weather visible
music play visible
vehicle controls visible
POV controls visible
sky status visible
```

5. Confirm ATM status.

Expected if successful:

```text
ATM THREE SKY
```

Otherwise:

```text
ATM SKY BRIDGE — [exact reason]
```

6. Confirm sky has atmospheric gradient/sun relationship if integrated.

7. Confirm no vignette/haze increase.

8. Confirm clouds/cloud status preserved.

9. Test POV buttons:

```text
EXT
DRIVER
PASS
```

10. Test map pan/zoom.

11. Test TAB hide/show.

12. Test Show/Operate.

13. If PLAY touched, run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

Real sky integration moves to the WALL runtime where it belongs.

The final outcome is either:

```text
ATM THREE SKY
```

or a precise blocker that identifies why the WALL custom layer could not be completed.

The recovered Broadcast controls/signals remain intact.

---

## Implementation Guide

- **Where:** WALL runtime, especially map initialization, atmosphere runtime, and new `wall/threeSkyLayer.js`.
- **What:** Add a Three.js Sky Mapbox custom layer using WALL Three.js/context; preserve cloud renderer; report truthful renderer status to PLAY.
- **Expect:** Sky work moves out of PLAY overlay hacks and into the correct WALL render layer.
