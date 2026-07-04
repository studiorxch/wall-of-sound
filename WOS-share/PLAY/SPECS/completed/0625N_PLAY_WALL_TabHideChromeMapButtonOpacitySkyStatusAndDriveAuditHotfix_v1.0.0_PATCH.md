# 0625N_PLAY_WALL_TabHideChromeMapButtonOpacitySkyStatusAndDriveAuditHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Chrome Hide Fix + Map Button Opacity + Sky Status + Drive Audit

This patch follows `0625M`.

`0625M` was incomplete.

Current reported failures:

```text
1. TAB still does not hide Mapbox map buttons.
2. TAB still does not hide the left sidebar.
3. Map buttons are too dark and need to be more transparent.
4. Sky status/expectation is unclear.
5. Drive mode is not working.
```

This patch fixes the first two directly, tones the map controls, adds explicit sky visibility status, and starts the drive-mode audit without damaging the recovered baseline.

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

Do not regress:

```text
S-key screensnap
TAB hide/show
Smart Grid compressed signal cluster
SYNC / LAT bridge
STOP guarded/missing state
clock/weather
camera/POV
sky status
WOS vehicle controls in visible state
route Launch
map pan/zoom
typed track overlay
ATM THREE SKY when WALL is running
crosshairs square
```

Do not restore:

```text
Operate
Show
Snapshot button
big rounded PLAY button
big PAUSE label
fake route line
signal dot
vignette
haze
fake data
```

---

# Part 1 — TAB Must Actually Hide Mapbox Buttons

## Problem

The right-edge Mapbox controls remain visible after TAB-hidden.

This means one of these is true:

```text
PLAY is not successfully sending play:controls-visibility to the active WALL iframe
WALL listener is not attached in the iframe currently displayed
body.play-controls-hidden is not added to the correct document/body
Mapbox control selectors do not match actual DOM
CSS specificity loses to Mapbox styles
preview is not using embed mode
```

## Required Fix

Make TAB-hidden hide Mapbox controls reliably in the active displayed WALL iframe.

Required hidden selectors in WALL:

```css
body.play-controls-hidden .mapboxgl-ctrl-top-right,
body.play-controls-hidden .mapboxgl-ctrl-bottom-right,
body.play-controls-hidden .mapboxgl-ctrl-top-left,
body.play-controls-hidden .mapboxgl-ctrl-bottom-left,
body.play-controls-hidden .mapboxgl-ctrl-group,
body.play-controls-hidden .mapboxgl-ctrl,
body.play-controls-hidden button.mapboxgl-ctrl-zoom-in,
body.play-controls-hidden button.mapboxgl-ctrl-zoom-out,
body.play-controls-hidden button.mapboxgl-ctrl-compass {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
```

Use actual selectors after DOM inspection.

---

## Required Bridge Verification

Add temporary debug instrumentation or state readback:

PLAY sends:

```ts
{ type: "play:controls-visibility", visible: false }
```

WALL replies:

```ts
{
  type: "wall:controls-visibility-ack",
  payload: {
    visible: false,
    bodyClassApplied: true,
    mapboxControlsFound: number
  }
}
```

PLAY may display/debug-log:

```text
HIDE ACK controls=false mapboxControlsFound=5
```

Do not leave noisy HUD labels permanently unless useful.

Acceptance requires proof that the active iframe received the hide message.

---

# Part 2 — TAB Must Hide Left Sidebar / App Chrome

## Problem

The left PLAY/app sidebar remains visible in TAB-hidden state.

## Required Fix

When `controlsVisible === false`, hide all PLAY app chrome outside the broadcast frame:

```text
left sidebar
top app bar/header
tab row
browser-like app shell chrome inside the app
```

Likely selectors to inspect:

```text
.app-shell
.app-header
.play-shell
.play-shell-header
.play-sidebar
.sidebar
.left-sidebar
.nav-rail
.topbar
.broadcast-tabs
.project-tabs
```

Use actual repo selectors.

---

## Required CSS Model

Apply hidden state high enough in the PLAY app tree:

```text
html/body/app root or broadcast route container
```

Example:

```css
body.broadcast-clean-capture .play-sidebar,
body.broadcast-clean-capture .play-shell-header,
body.broadcast-clean-capture .topbar,
body.broadcast-clean-capture .broadcast-tabs {
  display: none !important;
}
```

If CSS class cannot be applied to body, apply to highest visible app shell wrapper.

---

## Required Layout Fill

When left/top chrome hides, the Broadcast frame should expand/fill correctly.

Required:

```text
no black leftover left gutter from hidden sidebar
no layout offset preserved by padding/margin
map frame uses available viewport
```

If there is still a black strip, remove the layout margin/padding in hidden state:

```css
.broadcast-clean-capture .broadcast-shell {
  margin-left: 0 !important;
  padding-top: 0 !important;
}
```

Use actual selectors.

---

# Part 3 — Map Buttons Too Dark / Visible-State Styling

## Problem

When controls are visible, the Mapbox buttons are too dark.

## Required Fix

Make visible Mapbox controls more transparent/subtle.

Suggested WALL CSS:

```css
.mapboxgl-ctrl-group {
  background: rgba(5, 9, 14, 0.28) !important;
  border: 1px solid rgba(160, 210, 230, 0.18) !important;
  box-shadow: none !important;
  backdrop-filter: blur(3px);
}

.mapboxgl-ctrl button {
  background: rgba(5, 9, 14, 0.18) !important;
  color: rgba(220, 245, 255, 0.62) !important;
}

.mapboxgl-ctrl button:hover {
  background: rgba(50, 180, 220, 0.12) !important;
}
```

Use actual style compatibility.

Keep controls usable when visible.

Do not make them invisible in visible state.

---

# Part 4 — Sky Status / Expected Sky

## Current Finding

The sky was installed in WALL:

```text
wall/threeSkyLayer.js
ATM THREE SKY when WALL is active
cloudAtmosphereRenderer.js preserved
```

But visual expectation needs status.

## Required Status Improvement

Add a compact explicit sky visibility status:

```text
ATM THREE SKY
SKY VIS HORIZON ONLY
```

or:

```text
SKY VIS LOW — CAMERA PITCH DOWN
```

or:

```text
SKY VIS ACTIVE
```

Use actual computed/readable state.

---

## Required Sky Visibility Rule

If camera pitch is mostly looking down and horizon is the only visible sky region, status should explain:

```text
SKY VIS HORIZON
```

If current phase is late night/dark:

```text
SKY VIS LOW — NIGHT PHASE
```

If WALL not connected:

```text
SKY VIS MISSING — WALL NOT CONNECTED
```

No fake sky/cloud values.

---

## Required Sky Audit Display

Do not clutter the HUD. Add a small status line only in the existing sky instrumentation panel:

```text
VIS HORIZON
```

or:

```text
VIS ACTIVE
```

---

# Part 5 — Drive Mode Audit

## Problem

Drive mode is not working.

Do not guess.

Audit first, then repair if clear.

## Required Search Terms

Search WALL for:

```text
Drive
drive
vehicle
HeroVehicleRuntime
RegionalFlightTripRuntime
routeMode
setMode
mode
launch
startDrive
driveRoute
ground
road
snapToRoad
```

Likely files:

```text
wall/systems/presentation/traversalControlDeck.js
wall/**/*vehicle*
wall/**/*route*
wall/**/*runtime*
```

---

## Required Audit Questions

Answer in code comments/build note:

```text
Does clicking Drive change mode state?
Does Drive have a runtime implementation?
Does Launch respect selected mode?
Does Drive require a road route/destination?
Does Drive fail because no road routing source exists?
Does it fall back to Flight?
Does it disable itself silently?
```

---

## Required Drive Status

If Drive is not ready, make it explicit in visible controls/status:

```text
DRIVE UNAVAILABLE — [exact reason]
```

or if experimental:

```text
DRIVE EXP — [condition]
```

Do not show Drive as working if it is not.

---

## Repair If Clear

If the bug is simple, fix it:

```text
Drive button updates selected mode
Launch reads selected mode
Drive runtime starts
routeState updates
heartbeat reports mode=drive
```

If road routing is missing, do not fake driving.

Keep status honest.

---

# Part 6 — Screensnap Interaction

TAB-hidden clean state is required for screenshots.

Test path:

```text
TAB -> S
```

Expected:

```text
no app chrome
no Mapbox buttons
no WOS nav
route motion continues
PNG saved
```

If browser top chrome remains, that is outside app control. But app chrome must hide.

---

## Files Likely Touched

PLAY:

```text
play/flow-curve-builder/src/ui/BroadcastHudShell.tsx
play/flow-curve-builder/src/ui/BroadcastSmartGridOverlay.tsx
play/flow-curve-builder/src/styles.css
```

WALL:

```text
wall/index.html
wall/styles.css
wall/systems/presentation/traversalControlDeck.js
wall/threeSkyLayer.js
wall/cloudAtmosphereRenderer.js
wall/*runtime*.js
```

Use actual repo filenames.

---

## Acceptance Criteria

### A. TAB hides Mapbox controls

After pressing TAB, right-edge Mapbox controls are gone.

---

### B. TAB hide ack confirms active iframe received message

WALL returns or logs hide ack with controls found/applied.

---

### C. TAB hides left sidebar

The left PLAY/app sidebar is gone.

---

### D. TAB hides top app bar

PLAY top/header/app chrome is gone.

---

### E. Hidden layout fills frame

No leftover app-layout gutter caused by hidden sidebar/header.

---

### F. TAB restores controls

Press TAB again and intended controls return.

---

### G. Visible Mapbox buttons are less dark

When controls are visible, map buttons are more transparent/subtle.

---

### H. Sky status explains expectation

Sky panel includes truthful visibility state:

```text
VIS ACTIVE
VIS HORIZON
VIS LOW — CAMERA PITCH DOWN
VIS LOW — NIGHT PHASE
```

or equivalent.

---

### I. Drive mode audited

Drive failure reason is documented.

---

### J. Drive does not lie

If not working, UI/status says unavailable/experimental with exact reason.

---

### K. Screensnap clean state works

`TAB -> S` captures clean map frame or reports exact blocker.

---

### L. No runtime regressions

Heartbeat, latency, stop, POV, sky, weather, clock remain intact.

---

### M. tsc clean

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

1. Start WALL.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Press TAB.

Confirm hidden:

```text
left sidebar
top app bar
bottom WOS nav
right Mapbox controls
Smart Grid overlay
```

5. Confirm map still moves.

6. Press S.

Expected:

```text
clean PNG saved or exact blocker.
```

7. Press TAB again.

Confirm controls return.

8. Check visible Mapbox controls.

Expected:

```text
subtle transparent style.
```

9. Check sky panel.

Expected:

```text
VIS status explains expected sky visibility.
```

10. Click Drive.

11. Launch route.

Expected:

```text
Drive works or exact unavailable reason appears.
```

12. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

TAB becomes a reliable clean manual-screenshot mode:

```text
no left sidebar
no top app chrome
no bottom WOS nav
no right Mapbox buttons
route continues moving
screensnap captures clean frame
```

The sky system gets truthful visual status, and Drive mode is audited/repaired or clearly labeled unavailable.

---

## Implementation Guide

- **Where:** PLAY clean-capture shell state, WALL controls-visibility bridge/CSS, Mapbox control styling, sky status line, traversal/drive mode code.
- **What:** Make TAB actually hide all visible chrome, soften Mapbox controls in visible state, add truthful sky visibility status, and audit/fix Drive mode.
- **Expect:** Clean map screenshots, clearer sky expectations, and no misleading Drive control.
