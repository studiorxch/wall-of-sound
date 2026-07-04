# 0625C_PLAY_RouteCameraInstrumentationAndThreeSkyRecoveryPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Restore Camera System Visibility + Recover Sky/Atmosphere Direction

This patch moves the Broadcast/Route camera system forward without removing existing controls or surfaces.

The current recovered state after 0625B:

```text
clock visible
weather visible via atmosphere model
music play button visible as NO TRACK when empty
WOS vehicle controls restored
route launch visible
TAB hide/show works
Operate restores controls
Show can clean the surface
tsc clean
```

The next neglected area is the route-based camera system.

This patch adds system-level display for:

```text
route camera mode
POV target
speed scale
altitude scale
camera altitude
route motion state
```

It also restores the 3D sky/atmosphere direction using a Three.js-style sky model instead of vignette/haze overlays.

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

## Hard Protection Rules

Do not remove or hide working access to:

```text
Studio / Canvas
Subway Map
Website
Kinetic Fish
vehicle controls
camera controls
route controls
clock
weather
music play button
```

Do not add:

```text
vignette
dark haze blanket
fake route line
signal dot
capture mode
still mode
freeze mode
16:9 frame
bottom playback dock
emoji controls
```

Clean view remains controlled by:

```text
Show
TAB
```

---

# Part 1 — Route Camera System-Level Display

## Goal

Give the route camera system its own readable operational display.

The user needs to see the scale of:

```text
speed being achieved
altitude being achieved
camera mode / POV
route launch state
```

This area has been neglected and must become visible infrastructure.

---

## Required Camera Signal Display

Add a compact camera instrumentation layer visible when controls are visible.

Suggested labels:

```text
CAM     DRONE
POV     ROUTE / VEHICLE / FREE / FOLLOW
SPD     1.0X
ALT     LOW / 42M
SCALE   CITY / DISTRICT / STREET
ROUTE   LIVE
```

Use whatever actual state exists. Do not fake unknown values.

If exact meters are not available, show the current known altitude label:

```text
ALT LOW
ALT CRUISE
ALT HIGH
```

If speed is only known as multiplier:

```text
SPD 1X
```

If both multiplier and approximate velocity are available:

```text
SPD 1X / 32 KMH
```

---

## Required POV Target Recovery

Restore POV target visibility.

Previously expected POV/camera targets are missing.

Search for existing camera/POV controls and state before adding new ones.

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

Required outcome:

```text
POV target is visible if state exists
POV target is marked "unwired" only after search
```

A bare missing dash is not acceptable.

---

## Required Camera Controls

Restore or expose working camera controls when `controlsVisible = true`.

Possible controls, only if wired:

```text
CAM DRONE
CAM FOLLOW
CAM FREE
CAM REAR
CAM RESET
POV ROUTE
POV VEHICLE
```

Do not show broken active buttons.

If WOS already has camera buttons in `#wos-nav`, preserve them or relocate them into compact PLAY-native controls if reliable.

---

## Speed / Altitude Scale Indicators

Add visual indicators that read as instrumentation, not decoration.

Possible compact implementation:

```text
SPD |---|---|---| 1X
ALT |---|---|---| LOW
```

or:

```text
SPD  1X   [▮▯▯▯▯]
ALT  LOW  [▮▯▯▯▯]
```

No emoji.

No large cockpit panel.

This should fit the current micrographics language.

---

## Required Route Camera Panel Placement

Preferred placement:

```text
bottom-left signal strip area above WOS nav
or top-right micrographics-adjacent column
```

Avoid covering:

```text
typed track index
map center
route controls
WOS nav
```

The display should be visible in Operate and hide/compress in Show or TAB-hidden state.

---

# Part 2 — Three.js Sky / Atmosphere Recovery

## Goal

Recover the sky and cloud/atmosphere direction.

The current sky appears empty/devoid of atmosphere. The project discussion expected a real sky direction inspired by Three.js sky/sun shader and cloud controls.

This must not be replaced with a CSS vignette or dark haze.

---

## Reference Direction

Use the uploaded Three.js sky/sun shader reference as the memory anchor:

```text
three.js webgl shaders sky
turbidity
rayleigh
mieCoefficient
mieDirectionalG
elevation
azimuth
exposure
cloud coverage
cloud density
cloud elevation
```

The target is:

```text
real atmospheric gradient
sun/elevation relationship
subtle cloud atmosphere
no vignette blanket
no dark wash
```

---

## Required Sky Controls / Parameters

Add or restore a sky model with explicit parameters.

Minimum parameter set:

```text
skyEnabled: boolean
timeOfDayPhase: dawn | morning | afternoon | sunset | night
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

If Three.js Sky cannot be directly added inside Mapbox immediately, implement a parameterized atmosphere layer that can later map to Three.js Sky.

But do not call it final Three.js Sky unless it uses the actual Three.js sky/sun shader or equivalent WebGL sky layer.

---

## Preferred Implementation

### Option A — Real Three.js Sky Layer

Preferred if current runtime can support it.

Use Three.js Sky/sun shader approach:

```text
Sky object or shader material
sun position from elevation/azimuth
atmosphere uniforms
cloud layer if available
```

Integrate behind/above the map scene without blocking Mapbox interaction.

### Option B — Mapbox-compatible sky/atmosphere bridge

If Three.js cannot be mounted cleanly yet, implement a bridge object:

```text
routeAtmosphereModel
```

with the same parameter set and a clear TODO:

```text
TODO: Replace gradient renderer with Three.js Sky shader layer.
```

This is acceptable only as an interim if it does not reintroduce vignette/haze.

---

## Explicit Anti-Vignette Rule

Do not increase:

```text
vignette opacity
dark haze
screen-edge wash
blanket overlays
```

Do not add CSS overlays that make the sky/map look fogged or smudged.

The user already reduced this and it must not be increased again.

Acceptance requirement:

```text
No new vignette/dark haze rules added.
Existing vignette/haze opacity not increased.
```

---

## Required Atmosphere Display

Expose sky/atmosphere state in the signal strip or camera instrumentation:

```text
SKY    AFTERNOON
SUN    EL 12 / AZ 180
CLOUD  0.40 / DENS 0.40
ATM    THREE SKY MODEL / BRIDGE
```

If using interim bridge:

```text
ATM    SKY BRIDGE
```

If actual Three.js Sky is mounted:

```text
ATM    THREE SKY
```

---

# Part 3 — Music/Route Control Separation

Maintain the separation recovered in 0625B:

```text
top PLAY = music playback
WOS Launch = route launch
```

Do not merge them again.

If no track loaded:

```text
▶ NO TRACK
```

must remain visible.

---

# Part 4 — Visibility Rules

Controls/signals visible by default.

```text
Open Broadcast HUD -> controls visible
wait 5 seconds -> controls still visible
TAB -> hide controls/signals
TAB again -> restore controls/signals
Show -> clean surface
Operate -> restore controls/signals
```

Camera instrumentation and sky signal follow the same rules.

---

## Files Likely Touched

PLAY:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastSignalStrip.tsx
src/ui/BroadcastMicrographicsGrid.tsx
src/styles.css
```

Possible new PLAY files:

```text
src/ui/BroadcastRouteCameraInstrumentation.tsx
src/ui/BroadcastSkyAtmosphereStatus.tsx
src/runtime/routeCameraDisplayModel.ts
src/runtime/skyAtmosphereModel.ts
```

WOS:

```text
wall/index.html
wall/styles.css
wall/traversalControlDeck.js
wall/atmosphereRuntime.js
wall/**/*camera*
wall/**/*traversal*
wall/**/*route*
```

Use actual repo filenames.

---

## Implementation Steps

### 1. Audit existing camera/POV state

Search for camera mode, POV, target, speed, altitude, route camera state.

Document in code comments or build note:

```text
found camera state:
found speed state:
found altitude state:
found POV state:
missing:
```

### 2. Add camera instrumentation model

Create or derive:

```ts
type RouteCameraInstrumentation = {
  cameraMode?: string;
  povTarget?: string;
  speedLabel?: string;
  speedScale?: number;
  altitudeLabel?: string;
  altitudeMeters?: number;
  altitudeScale?: number;
  routeState?: string;
};
```

### 3. Render compact route camera instrumentation

Visible when controlsVisible.

Use micrographic styling.

### 4. Restore camera controls if wired

Expose only working controls.

Do not show dead buttons.

### 5. Add sky/atmosphere model

Use Three.js Sky if feasible.

Otherwise add parameter-compatible bridge.

### 6. Remove/inhibit vignette escalation

Audit CSS for:

```text
vignette
haze
overlay
atmosphere
wash
```

Do not increase opacity.

If user-lowered values exist, preserve them.

### 7. Expose sky status

Show compact status:

```text
SKY / SUN / CLOUD / ATM
```

### 8. Preserve existing recovered controls

Do not regress:

```text
clock
weather
music play button
vehicle controls
route launch
Studio / Canvas
TAB behavior
```

---

## Acceptance Criteria

### A. Camera instrumentation visible

Operate / controlsVisible shows camera status:

```text
CAM
POV
SPD
ALT
ROUTE
```

or explicit exact missing reasons after search.

---

### B. Speed scale visible

Speed indicator shows current route/camera speed scale.

---

### C. Altitude scale visible

Altitude indicator shows current altitude state/scale.

---

### D. POV target restored

POV target is visible or exact blocker is documented after search.

---

### E. Camera controls restored if available

Working camera controls are visible.

Dead camera controls are not shown as active.

---

### F. Three.js sky direction restored

Sky model exists with explicit parameters.

Actual Three.js Sky preferred; bridge acceptable only if clearly labeled.

---

### G. No vignette/haze increase

No new or increased vignette/dark haze overlay.

---

### H. Clouds/atmosphere parameters represented

Cloud coverage/density/elevation are present in model or status if implemented.

---

### I. Existing weather remains

Weather line still displays:

```text
WX
TEMP
HUM
PREC
WIND or N/A
SRC
```

---

### J. Existing clock remains

Time and zone remain visible.

---

### K. Music play remains visible

Top music play button remains visible as:

```text
▶ NO TRACK
```

or playing/paused state.

---

### L. Route launch remains separate

WOS Launch remains route launch.

---

### M. Vehicle controls remain

Flight / Drive / Walk / Bike / Transit remain visible if wired.

---

### N. TAB behavior works

TAB hides/restores controls, signals, camera instrumentation, sky status.

---

### O. Operate restores everything

Operate sets controls visible.

---

### P. Map remains interactive

Map pan/zoom works.

---

### Q. tsc clean

Run:

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

1. Start WOS.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm time/zone visible.

5. Confirm weather visible.

6. Confirm music play button visible.

7. Confirm WOS vehicle controls visible.

8. Confirm route launch visible.

9. Confirm camera instrumentation visible.

10. Confirm speed scale visible.

11. Confirm altitude scale visible.

12. Confirm POV target visible or exact missing reason.

13. Confirm sky status visible.

14. Confirm no vignette/dark haze increase.

15. Press TAB.

Expected:

```text
controls/signals hide
```

16. Press TAB again.

Expected:

```text
controls/signals return
```

17. Click Show.

Expected:

```text
clean surface
```

18. Click Operate.

Expected:

```text
controls/signals return
```

19. Drag/zoom map.

Expected:

```text
map remains interactive
```

20. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

Broadcast HUD gains a real route-camera instrumentation layer and begins recovering the sky/atmosphere system without destroying current controls.

The screen should communicate:

```text
where the route camera is
what POV it is using
how fast it is moving
how high it is flying
what atmosphere/sky model is active
```

while preserving:

```text
clock
weather
music play
vehicle controls
route launch
TAB hide/show
map interaction
```

---

## Implementation Guide

- **Where:** Route camera state/display, Broadcast signal strip, atmosphere runtime, sky model/bridge, WOS camera/traversal controls.
- **What:** Add system-level route camera instrumentation, restore POV target visibility, add speed/altitude scale indicators, and recover the Three.js sky/atmosphere direction without vignette or haze escalation.
- **Expect:** The neglected route camera area becomes visible infrastructure and the sky moves toward real atmospheric rendering instead of flat/vignette overlays.
