# 0625M_PLAY_WALL_TABHideAllChromeAndSkyCloudVisibilityAuditPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Clean Manual Screensnap Hide State + Sky/Cloud Visibility Audit

This patch continues from the confirmed `0625L` baseline.

`0625L` successfully added:

```text
TAB full hide shell state
WOS nav hide/restore bridge
compressed Smart Grid signal cluster
square crosshair sizing
S-key motion screensnap
SYNC LOCKED / LAT measured from WALL
tsc clean
```

Current issue:

```text
TAB-hidden state still leaves some UI visible:
- left PLAY/app bar
- right Mapbox/manual map controls
- possibly other map chrome

Manual screenshots need a truly clean map frame.
```

Open question:

```text
Three Sky is installed, but sky/clouds may not be visually obvious or may be hidden/occluded by camera angle, phase, layer ordering, or controls state.
```

This patch fixes the hide state and audits sky/cloud visibility.

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

## Confirmed Sky/Cloud State Before This Patch

From prior completed patches:

```text
0625E:
  WALL-side Three Sky layer installed.
  wall/threeSkyLayer.js mounted as Mapbox CustomLayerInterface.
  ATM shows THREE SKY when WALL is running.
  wall:sky-status postMessage reaches PLAY.

0625F:
  Three Sky brightness/exposure tuned.
  Gamma correction added.
  Minimum luminance floor added.
  No vignette/haze fix used.

Clouds:
  cloudAtmosphereRenderer.js was preserved.
  Cloud parameters are represented in HUD:
    CLOUD coverage / density.
```

So the current answer is:

```text
Yes, the sky layer was installed in WALL.
Cloud renderer was preserved.
If sky/clouds are not visible, it is likely a visibility/layer/camera/phase issue, not that the feature was never installed.
```

---

## Protected Baseline

Do not regress:

```text
motion screensnap via S key
TAB hide/show
Smart Grid compressed signal cluster
SYNC LOCKED / LAT measured when WALL connected
STOP guarded/missing state
clock/weather
camera/POV
sky status
WOS vehicle controls in visible state
route Launch
map pan/zoom
typed track overlay
```

Do not restore:

```text
Operate
Show
Snapshot button
big rounded PLAY button
big PAUSE label
bottom playback dock
fake route line
signal dot
vignette
haze
fake data
```

---

# Part 1 — TAB Hidden Must Hide All UI Chrome

## Goal

TAB-hidden state is for manual screenshots and clean map viewing.

When TAB-hidden, hide all interface chrome that blocks the visual map frame.

Required hidden:

```text
PLAY top/header bar
PLAY left/nav/app bar
PLAY Smart Grid overlay
PLAY access cluster
WOS bottom route/nav bar
Mapbox right controls:
  zoom +
  zoom -
  compass / pitch / rotate controls
  extra Mapbox control buttons
any WALL manual map buttons visible at the right edge
```

Required still visible:

```text
map
route/camera motion
Three Sky / WALL rendering
cloud rendering
typed track overlay if it is intentionally part of broadcast image
```

If typed overlay is considered UI chrome for manual map snaps, add optional class/hotkey later. For this patch, do not remove typed overlay unless it is already tied to controlsVisible.

---

## Required Visible State

When TAB restores controls:

```text
PLAY top/header bar returns
PLAY left/nav/app bar returns
Smart Grid overlay returns
WOS nav returns
Mapbox controls may return only if they are intentionally part of Operate mode
```

If Mapbox controls are not useful in Operate either, keep them hidden in both states. But for this patch, the critical requirement is hidden mode.

---

## Likely PLAY Selectors To Audit

Search actual repo selectors for:

```text
topbar
top-bar
header
app-header
play-header
sidebar
side-bar
left-bar
nav
tabs
shell
hud-shell
controls-hidden
```

Likely classes:

```text
.play-shell-header
.app-shell-header
.play-topbar
.play-nav
.play-sidebar
.broadcast-tabs
.hud-shell--controls-hidden
```

Use actual selectors.

---

## Likely WALL/Mapbox Selectors To Hide

Mapbox controls commonly use:

```css
.mapboxgl-ctrl-top-right
.mapboxgl-ctrl-bottom-right
.mapboxgl-ctrl-group
.mapboxgl-ctrl-zoom-in
.mapboxgl-ctrl-zoom-out
.mapboxgl-ctrl-compass
.mapboxgl-ctrl
```

WALL custom/manual controls may use:

```text
#wos-nav
.traversal-control-deck
.camera-controls
.map-controls
```

Use actual selectors.

---

## Required Bridge Message

Extend existing visibility bridge.

PLAY → WALL:

```ts
{
  type: "play:controls-visibility",
  visible: false
}
```

WALL should apply a body/class state:

```text
wall-controls-hidden
```

or:

```text
controls-hidden
```

Then WALL CSS hides:

```css
body.controls-hidden #wos-nav,
body.controls-hidden .mapboxgl-ctrl-group,
body.controls-hidden .mapboxgl-ctrl-top-right,
body.controls-hidden .mapboxgl-ctrl-bottom-right {
  display: none !important;
}
```

When visible:

```text
controls-visible
```

restores only intended controls.

---

# Part 2 — Manual Screensnap Clean State

## Goal

S-key screensnap during route motion should capture the clean map frame when TAB-hidden.

Required behavior:

```text
Press TAB -> hide all UI chrome
Press S -> save clean map snap
Route keeps moving
No bars/buttons/map controls captured
```

If capture includes overlays because it captures only WALL canvas, state clearly:

```text
SNAP SAVED — WALL CANVAS ONLY
```

If capture includes PLAY overlay, ensure TAB-hidden clears overlay first.

---

## Required Snap Status

Do not show snap status in the screenshot if controls are hidden unless needed after capture.

Possible behavior:

```text
if controlsVisible:
  show SNAP SAVED for 3s in Smart Grid

if controlsHidden:
  do not overlay snap status on captured frame
  optionally show status only after controls restored
```

---

# Part 3 — Sky/Cloud Visibility Audit

## Goal

Confirm where sky and clouds are installed and why they may not be visible.

Required audit points:

```text
wall/threeSkyLayer.js is loaded
Mapbox layer id is registered
ATM status emits THREE SKY
layer order: before fill-extrusion / behind buildings
renderingMode
current phase
sun elevation / azimuth
exposure
camera pitch / horizon visibility
cloudAtmosphereRenderer.js loaded
cloud renderer draw order
cloud opacity/coverage/density
```

---

## Required Debug Output / Status

Add a compact debug/status line only if useful:

```text
SKY VIS ACTIVE
CLOUD VIS ACTIVE
```

or developer console log:

```text
[WALL SKY] layer active
[WALL CLOUD] renderer active
```

Do not clutter the Broadcast HUD with permanent extra labels unless status is already in the existing sky panel.

---

## Likely Reason Sky Is “Hiding”

Sky may be installed but not apparent because:

```text
camera is pitched down toward the map
horizon is outside view
late-night phase is dark
Three Sky layer renders behind map terrain/base style and only visible at horizon
cloud opacity/coverage is too low
cloud renderer exists but current phase coverage is subtle
WALL not running in some previews
PLAY preview shows bridge state when WALL iframe not active
```

This patch should document the actual reason found.

---

## Required Test View

Add or use a temporary dev-only way to verify sky visibility:

```text
increase pitch toward horizon
switch phase to afternoon/evening test
temporarily force cloud coverage high only in dev test
```

Do not ship forced fake cloud values.

If adding a dev query parameter, make it explicit:

```text
?skyDebug=1
```

and do not enable by default.

---

# Part 4 — Crosshair Preservation

Do not regress `0625L` crosshair fix.

Required:

```text
corner/crosshair marks remain square
ARM_PX / CORNER_PX or equivalent fixed-pixel logic preserved
```

---

# Part 5 — No Data/Behavior Regression

Do not change:

```text
heartbeat
latency
stop bridge
weather
clock
camera POV bridge
sky model values unless needed for visibility audit
audio playback
route controls
screensnap capture path
```

Unless the change is specifically required to hide chrome or report sky/cloud visibility truthfully.

---

## Files Likely Touched

PLAY:

```text
play/flow-curve-builder/src/ui/BroadcastHudShell.tsx
play/flow-curve-builder/src/ui/BroadcastSmartGridOverlay.tsx
play/flow-curve-builder/src/runtime/broadcastScreensnap.ts
play/flow-curve-builder/src/styles.css
```

WALL:

```text
wall/index.html
wall/styles.css
wall/threeSkyLayer.js
wall/cloudAtmosphereRenderer.js
wall/traversalControlDeck.js
```

Use actual repo filenames.

---

## Acceptance Criteria

### A. TAB hides top bar

Press TAB.

Expected:

```text
PLAY top/header bar is hidden.
```

---

### B. TAB hides left bar

Press TAB.

Expected:

```text
PLAY left/nav/app bar is hidden.
```

---

### C. TAB hides bottom WOS bar

Press TAB.

Expected:

```text
WOS bottom route/control bar is hidden.
```

---

### D. TAB hides right Mapbox controls

Press TAB.

Expected:

```text
zoom/compass/manual map controls are hidden.
```

---

### E. TAB restores controls

Press TAB again.

Expected:

```text
all intended controls return.
```

---

### F. Route motion continues while hidden

TAB-hidden state does not freeze route/camera motion.

---

### G. Screensnap captures clean moving map

While route is moving:

```text
TAB -> S
```

Expected:

```text
PNG saved without UI chrome where technically possible.
```

or explicit blocker.

---

### H. Snap does not pause/freeze

Capture does not interrupt route motion.

---

### I. Sky install confirmed

Audit confirms:

```text
wall/threeSkyLayer.js loaded or exact blocker.
```

---

### J. Cloud install confirmed

Audit confirms:

```text
cloudAtmosphereRenderer.js active/preserved or exact blocker.
```

---

### K. Sky/cloud visibility reason documented

If sky/clouds are not visually obvious, exact reason is documented.

---

### L. No fake cloud/sky data

No shipped fake cloud values are added just to make it visible.

---

### M. Crosshairs stay square

No regression to stretched crosshair marks.

---

### N. tsc clean

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

3. Start route motion.

4. Press TAB.

Expected hidden:

```text
top bar
left bar
bottom WOS bar
right Mapbox controls
Smart Grid overlay
```

5. Confirm route/map still moves.

6. Press S.

Expected:

```text
PNG saved or explicit snap blocker.
```

7. Confirm snap image does not include the hidden UI chrome.

8. Press TAB again.

Expected:

```text
controls return.
```

9. Confirm map pan/zoom still works.

10. Confirm sky status.

Expected:

```text
ATM THREE SKY when WALL active.
```

11. Confirm sky/cloud audit logs or status.

12. Confirm crosshairs square.

13. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

TAB becomes a true clean manual-screensnap state:

```text
no top bar
no left bar
no bottom route bar
no right Mapbox buttons
route motion continues
S captures moving map frame
```

Sky/cloud status is also clarified:

```text
Three Sky is installed in WALL
cloud renderer is preserved
visibility issue is documented if sky/clouds are not visually obvious
```

---

## Implementation Guide

- **Where:** PLAY controls-hidden shell class, WALL controls-visibility bridge/CSS, Mapbox control selectors, screensnap status handling, sky/cloud audit logs.
- **What:** Hide all UI chrome in TAB state, including top/left/bottom/right map controls; keep route motion and screensnap working; verify Three Sky/cloud renderer installation and visibility.
- **Expect:** Clean moving-map screenshots and clear sky/cloud status without changing the runtime data model.
