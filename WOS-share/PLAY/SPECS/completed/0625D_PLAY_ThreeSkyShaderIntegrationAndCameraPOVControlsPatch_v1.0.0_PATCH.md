# 0625D_PLAY_ThreeSkyShaderIntegrationAndCameraPOVControlsPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Sky Shader Integration + Camera POV Control Recovery

This patch continues from the recovered `0625C` baseline.

`0625C` established:

```text
CAM ROUTE
POV VEHICLE
SPD 1X
ALT CITY
ROUTE LIVE

SKY AFTERNOON
SUN EL 40° / AZ 220°
CLOUD 30% / D 0.35
ATM SKY BRIDGE
```

That was the correct bridge state.

`0625D` upgrades the bridge toward the real implementation:

```text
1. Integrate actual Three.js Sky shader if feasible.
2. Keep skyAtmosphereModel.ts as the parameter authority.
3. Add real camera POV controls if WOS exposes them.
4. Preserve all recovered controls and signals.
```

---

## Active Project Paths

```text
WOS root:
  /Users/studio/Projects/wall-of-sound

PLAY root:
  /Users/studio/Projects/wall-of-sound/play

PLAY app:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder

PLAY source:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder/src
```

Do not use:

```text
/Users/studio/Projects/play
```

That path is legacy/inactive.

---

## Protected Baseline

Do not regress any of the recovered `0625C` state.

Protected and must remain visible/available:

```text
clock
weather
music play button
vehicle controls
route launch
camera instrumentation
sky/atmosphere status
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

## Non-Negotiable Visual Rule

Do not add or increase:

```text
vignette
dark haze
screen-edge wash
blanket overlay
fake fog layer
```

The sky must be atmospheric, not a CSS smudge.

The target direction is the Three.js sky/sun shader reference:

```text
real sky gradient
sun position
elevation/azimuth
turbidity/rayleigh/mie controls
cloud coverage/density/elevation
```

---

# Part 1 — Three.js Sky Shader Integration

## Goal

Replace or augment `ATM SKY BRIDGE` with actual Three.js Sky shader integration if technically feasible.

Current bridge is acceptable as a parameter authority, but it should not remain the final rendering strategy.

---

## Required Parameter Authority

Keep or formalize:

```text
src/runtime/skyAtmosphereModel.ts
```

This remains the source of truth for sky parameters.

Minimum model:

```ts
export type SkyAtmospherePhase =
  | "dawn"
  | "morning"
  | "afternoon"
  | "sunset"
  | "night";

export type SkyAtmosphereModel = {
  skyEnabled: boolean;
  phase: SkyAtmospherePhase;
  sunElevation: number;
  sunAzimuth: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  exposure: number;
  cloudCoverage: number;
  cloudDensity: number;
  cloudElevation: number;
  renderer: "sky-bridge" | "three-sky" | "unavailable";
};
```

Do not scatter these values across components.

---

## Required Three.js Search / Feasibility Check

Before implementing a fallback, search the repo for existing Three.js usage.

Search terms:

```text
three
THREE
Sky
webgl
shader
scene
camera
renderer
MapboxLayer
CustomLayerInterface
mapbox custom layer
threebox
atmosphere
```

Search paths:

```text
/Users/studio/Projects/wall-of-sound
/Users/studio/Projects/wall-of-sound/play/flow-curve-builder
```

Document discovered state in code comments or build report:

```text
Three.js present: yes/no
Existing renderer: ...
Existing custom layer support: ...
Sky shader feasible now: yes/no
```

---

## Preferred Implementation: Actual Three.js Sky

If Three.js is already available or can be imported safely, add a sky shader layer.

Target behavior:

```text
ATM THREE SKY
```

Required uniforms/parameters mapped from `skyAtmosphereModel.ts`:

```text
turbidity
rayleigh
mieCoefficient
mieDirectionalG
sun position from elevation/azimuth
exposure
```

Cloud parameters may remain visual-status only if no cloud shader exists yet:

```text
cloudCoverage
cloudDensity
cloudElevation
```

but should remain in the model for future cloud layer work.

---

## Mapbox Integration Strategy

If the map is Mapbox-based, evaluate a custom layer approach.

Potential approaches:

```text
Mapbox CustomLayerInterface
Three.js renderer sharing Mapbox canvas/context
separate transparent WebGL canvas behind HUD but above map only if interaction-safe
```

Requirements:

```text
must not block map pan/zoom
must not cover controls
must not add haze/vignette
must not create heavy performance regression
```

If true integration is unsafe, keep the bridge but produce a clear blocker.

---

## Fallback: Keep Sky Bridge With Honest Blocker

If actual Three.js Sky cannot be integrated in this patch, keep:

```text
ATM SKY BRIDGE
```

but update status with exact reason:

```text
ATM SKY BRIDGE — THREE CUSTOM LAYER BLOCKED
```

or:

```text
ATM SKY BRIDGE — THREE NOT PRESENT
```

Do not pretend it is done.

---

## Sky Status Display

Update camera/sky status panel.

If integrated:

```text
SKY AFTERNOON
SUN EL 40° / AZ 220°
CLOUD 30% / D 0.35
ATM THREE SKY
```

If bridge remains:

```text
SKY AFTERNOON
SUN EL 40° / AZ 220°
CLOUD 30% / D 0.35
ATM SKY BRIDGE — [REASON]
```

---

# Part 2 — Camera POV Controls

## Goal

Restore actual POV controls instead of only displaying POV status.

The screen currently shows:

```text
CAM ROUTE
POV VEHICLE
```

Now add actual control access if WOS exposes it.

---

## Required Camera/POV Audit

Search existing WOS and PLAY code for camera controls/state.

Search terms:

```text
camera
Camera
cam
POV
pov
target
follow
drone
rear
free
chase
orbit
view
viewMode
cameraMode
routeCamera
traversal
altitude
speed
bearing
pitch
zoom
```

Likely files:

```text
wall/traversalControlDeck.js
wall/**/*camera*
wall/**/*traversal*
wall/**/*route*
src/ui/BroadcastHudShell.tsx
src/**/*.tsx
```

Document discovered state:

```text
available camera modes:
available POV targets:
available control functions:
missing:
```

---

## Required POV Control UI

Add compact camera/POV controls only if wired.

Suggested micro-control row:

```text
CAM  ROUTE / FREE / DRONE
POV  VEHICLE / ROAD / CITY
```

or:

```text
CAM [ROUTE] [FREE] [DRONE]
POV [VEHICLE] [ROUTE]
```

Only show active buttons for working controls.

If controls cannot be wired yet, show explicit state:

```text
POV CTRL UNWIRED — WOS camera function not exposed
```

No bare dash.

---

## Required Speed / Altitude Control Visibility

Do not remove WOS speed/altitude controls.

WOS nav currently includes:

```text
Flight / Drive / Walk / Bike / Transit
Speed
Alt
Launch
```

Those must remain.

The route-camera instrumentation should read from them where possible.

---

## Optional Camera Control Bridge

If WOS camera functions live inside iframe and cannot be called directly, implement a postMessage bridge only if safe.

Possible message shape:

```ts
window.postMessage({
  type: "play:set-camera-mode",
  mode: "route" | "free" | "drone"
}, "*");
```

WOS listener:

```ts
window.addEventListener("message", (event) => {
  if (event.data?.type === "play:set-camera-mode") {
    setCameraMode(event.data.mode);
  }
});
```

Security:

```text
limit accepted origins if practical
validate message type and mode
ignore unknown values
```

Do not add a bridge if it risks breaking existing controls.

---

# Part 3 — Maintain Recovered Playback Separation

Do not regress:

```text
top PLAY = music playback
WOS Launch = route launch
```

Current empty playlist state:

```text
▶ NO TRACK
```

must remain visible.

---

# Part 4 — Visibility Rules

Preserve:

```text
controls visible by default
TAB hides
TAB restores
Operate restores
Show may hide
reload starts visible
```

Camera controls and sky controls follow the same visibility model.

---

## Files Likely Touched

PLAY:

```text
src/runtime/skyAtmosphereModel.ts
src/runtime/routeCameraDisplayModel.ts
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastSignalStrip.tsx
src/ui/BroadcastRouteCameraInstrumentation.tsx
src/ui/BroadcastSkyAtmosphereStatus.tsx
src/styles.css
```

WOS:

```text
wall/index.html
wall/styles.css
wall/atmosphereRuntime.js
wall/traversalControlDeck.js
wall/**/*camera*
wall/**/*traversal*
wall/**/*route*
```

Possible new WOS files:

```text
wall/threeSkyLayer.js
wall/skyShaderLayer.js
wall/cameraControlBridge.js
```

Use actual repo filenames and existing conventions.

---

## Implementation Steps

### 1. Preserve baseline

Before touching sky/camera files, verify the current recovered baseline still works:

```text
clock
weather
music play button
vehicle controls
route launch
camera instrumentation
sky status
TAB
tsc clean
```

### 2. Audit Three.js availability

Search repo for Three.js and custom layer support.

### 3. Keep skyAtmosphereModel as authority

Ensure all sky display values come from one model.

### 4. Attempt actual Three.js Sky integration

If feasible, integrate actual shader and update status:

```text
ATM THREE SKY
```

### 5. If blocked, keep bridge with blocker reason

Do not fake completion.

### 6. Audit POV/camera controls

Search WOS/PLAY state and controls.

### 7. Add POV controls only if wired

Expose compact controls or exact unwired blocker.

### 8. Preserve WOS nav controls

Do not remove Flight/Drive/Walk/Bike/Transit/Speed/Alt/Launch.

### 9. Run TypeScript

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

---

## Acceptance Criteria

### A. Existing baseline preserved

All recovered `0625C` controls/signals remain visible and working.

---

### B. Sky model remains centralized

Sky parameters are centralized in `skyAtmosphereModel.ts` or equivalent.

---

### C. Three.js feasibility documented

Code/build note documents whether actual Three.js Sky was integrated or why it was blocked.

---

### D. ATM status truthful

Status is one of:

```text
ATM THREE SKY
ATM SKY BRIDGE — [EXACT REASON]
ATM UNAVAILABLE — [EXACT REASON]
```

---

### E. No vignette/haze increase

No added/increased vignette, dark haze, screen wash, or blanket overlay.

---

### F. Sky parameters represented

Status/model includes:

```text
phase
sun elevation
sun azimuth
cloud coverage
cloud density
atmosphere renderer
```

---

### G. POV controls audited

Available camera/POV functions are documented.

---

### H. POV controls visible if wired

Working POV controls are visible.

---

### I. No dead camera buttons

Unwired camera controls are not shown as active buttons.

---

### J. WOS speed/alt/route controls remain

Vehicle and route controls remain visible in Operate.

---

### K. Camera instrumentation remains

CAM / POV / SPD / ALT / ROUTE display remains visible.

---

### L. Music play remains visible

Top music play remains visible and does not become route launch.

---

### M. Weather and clock remain

TIME / ZONE / WX / TEMP / HUM / PREC / WIND / SRC remain.

---

### N. TAB/Show/Operate still work

Visibility model unchanged.

---

### O. Map remains interactive

Map pan/zoom still works.

---

### P. tsc clean

`tsc -b` exits 0.

---

## Manual Test Checklist

1. Start WOS.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm time/weather visible.

5. Confirm music play visible.

6. Confirm WOS nav visible.

7. Confirm camera instrumentation visible.

8. Confirm sky status visible.

9. Check ATM status.

Expected:

```text
ATM THREE SKY
```

or exact blocker:

```text
ATM SKY BRIDGE — [reason]
```

10. Check POV controls.

Expected:

```text
working controls visible
```

or exact unwired reason.

11. Press TAB.

Expected:

```text
controls/signals hide
```

12. Press TAB again.

Expected:

```text
controls/signals return
```

13. Click Show.

Expected:

```text
clean surface
```

14. Click Operate.

Expected:

```text
controls/signals return
```

15. Drag/zoom map.

Expected:

```text
map interactive
```

16. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

`0625D` either integrates actual Three.js Sky or leaves an honest, documented blocker while preserving the sky bridge.

It also recovers camera POV control access if WOS exposes the functions.

The route camera system becomes more operable without losing the restored controls/signals.

---

## Implementation Guide

- **Where:** `skyAtmosphereModel.ts`, route camera instrumentation, WOS atmosphere/camera control files.
- **What:** Attempt actual Three.js Sky shader integration, keep centralized sky parameters, add real POV controls if wired, and preserve all recovered controls/signals.
- **Expect:** Truthful sky renderer status and a more operable route camera system without vignette/haze regression.
