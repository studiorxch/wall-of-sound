# 0625L_PLAY_HideBarsCompressSmartGridAndMotionScreensnapPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Hide Mode + Smart Grid Compression + Motion Screensnap

This patch follows the confirmed `0625K` responsive OBS layout baseline.

The current issue is not layout collision anymore.

The current issue is visibility and hierarchy:

```text
TAB hide should remove visual blockers
top browser/app bar is still visible
bottom WOS route bar is still visible
left PLAY/app bar is still visible
top-left Smart Grid block became too large
crosshair/grid marks stretch instead of staying square
screensnap is needed during motion/route travel
```

This patch corrects those issues without changing runtime data sources.

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
Smart Grid truth-state model
AUDIO NO TRACK / AUDIO LIVE
TX IDLE / TX ACTIVE
SOURCE WOS LOCAL
UPTIME PLAY
SYNC / LATENCY / STOP real/missing states
clock/weather strip
camera/POV controls
sky status
WOS route controls when controls are visible
vehicle controls
speed / altitude controls
route Launch
TAB hide/show
map pan/zoom
ATM THREE SKY when WALL is running
```

Do not restore:

```text
Operate button
Show button
Snapshot button in old toolbar form
big rounded PLAY button
big PAUSE label
fake route line
signal dot
vignette
haze
fake data
```

---

# Part 1 — TAB Hide Mode Must Hide All Blocking Bars

## Goal

TAB should create a clean visual capture state.

When `controlsVisible === false`, hide the unnecessary interface blockers:

```text
bottom WOS route/control bar
left PLAY/app/nav bar
top PLAY/app/header bar
```

The map and route motion must remain visible.

---

## Required Hidden State

When TAB-hidden:

```text
hide bottom bar
hide left bar
hide top bar
hide Smart Grid overlay if currently tied to controlsVisible
keep map visible
keep route motion running
keep Three Sky / WALL rendering
keep typed track overlay if active unless it is classified as controls overlay
```

Do not freeze the system.

Do not pause route motion.

Do not stop audio.

Do not persist hidden state across reload.

---

## Required Visible State

When TAB restores controls:

```text
bottom WOS route/control bar returns
left PLAY/app/nav bar returns
top PLAY/app/header bar returns
Smart Grid overlay returns
all controls work
```

---

## Likely Selectors To Audit

PLAY:

```text
.play-shell-header
.app-shell-header
.play-nav
.top-nav
.broadcast-tabs
.broadcast-topbar
.hud-access-cluster
.broadcast-smart-grid-overlay
```

WALL/WOS iframe or embedded chrome:

```text
#wos-nav
.wos-nav
.traversal-control-deck
.bottom-route-bar
```

Use actual repo selectors.

---

## Required CSS/State Model

Use one parent state class when controls are hidden:

```text
.broadcast-controls-hidden
```

or existing equivalent.

Then apply:

```css
.broadcast-controls-hidden .play-top-bar,
.broadcast-controls-hidden .play-left-bar,
.broadcast-controls-hidden .hud-access-cluster,
.broadcast-controls-hidden .broadcast-smart-grid-overlay {
  display: none;
}
```

For WOS iframe controls, use existing postMessage/class bridge if available.

If WOS controls are inside iframe and cannot be controlled by parent CSS, send a message:

```ts
{ type: "play:controls-visibility", visible: false }
```

WALL applies:

```text
body.controls-hidden #wos-nav { display: none !important; }
```

And restores on visible.

---

# Part 2 — Smart Grid Compression

## Problem

The new top-left Smart Grid block became too prominent.

It multiplied the PLAY presence instead of compressing it.

The goal is still:

```text
merge PLAY identity and audio state
match the hierarchy of other HUD signals
avoid creating a large new widget
```

## Required Change

Compress the top-left panel to match the scale of the other HUD signal blocks.

Target behavior:

```text
same visual hierarchy as camera/sky and clock/weather HUD signals
not a dominant widget
not a large panel
not a second app header
```

Suggested compact hierarchy:

```text
PLAY / WOS
AUDIO  LIVE / NO TRACK
TX     ACTIVE / IDLE
SRC    WOS LOCAL
SYNC   LOCKED / MISSING...
LAT    79 MS / MISSING...
STOP   AVAILABLE / MISSING...
```

Remove or reduce extra section headers if they make the block too large:

```text
AUDIO SIG
BRIDGE
```

can remain only if they are micro labels, not panel-expanding headers.

---

## Required Size Target

Top-left Smart Grid should feel closer to:

```text
right camera/sky instrumentation scale
bottom-left signal strip scale
```

Suggested max width:

```css
width: clamp(160px, 14vw, 260px);
```

or project-equivalent.

Do not exceed the visual weight of the typed track title.

---

# Part 3 — Crosshair / Smart Grid Marks Must Stay Square

## Problem

Grid corner crosshairs are stretched.

## Required Fix

Crosshair/corner marks must maintain absolute square proportions.

Use fixed square dimensions:

```css
.smart-grid-crosshair,
.hud-corner-crosshair {
  width: 18px;
  height: 18px;
  aspect-ratio: 1 / 1;
  flex: 0 0 auto;
}
```

If using pseudo-elements:

```css
width: var(--crosshair-size);
height: var(--crosshair-size);
```

Do not use `%` width/height that stretches with parent aspect ratio.

---

## Required Crosshair Behavior

Crosshairs should:

```text
stay square at all viewport sizes
not stretch horizontally
not stretch vertically
scale only through a single --crosshair-size variable
```

Suggested token:

```css
--hud-crosshair-size: clamp(12px, 1.1vw, 22px);
```

---

# Part 4 — Motion Screensnap

## Goal

Add a screensnap feature for route motion.

Use case:

```text
capture maps while route/camera is moving
```

This is not a video capture mode.

This is not the old Snapshot/Still/Freeze system.

It is a one-action screen capture helper.

---

## Required Screensnap Behavior

Add a compact Smart Grid-aligned control or hotkey:

```text
SNAP
```

or:

```text
CAPTURE FRAME
```

Preferred hotkey:

```text
S
```

or:

```text
Shift+S
```

if `S` conflicts.

Behavior:

```text
while route is moving, capture current visual frame/map state
save/download PNG if possible
do not pause route
do not freeze system
do not enter capture mode
do not show old Snapshot button
```

---

## Required Screensnap Scope

Capture should prefer the Broadcast HUD frame/map viewport.

Implementation options:

```text
A. Use browser canvas capture if available and allowed.
B. Use Mapbox/WALL canvas toDataURL if same-origin and preserveDrawingBuffer permits.
C. Use existing snapshot function in WOS if already available.
D. If browser security blocks capture, show explicit reason.
```

No fake success.

---

## Required Screensnap Naming

Suggested filename:

```text
play-map-snap-YYYYMMDD-HHMMSS.png
```

If current track exists:

```text
play-map-snap-TRACKINDEX-YYYYMMDD-HHMMSS.png
```

Sanitize filenames.

---

## Required Screensnap Status

Show temporary status in Smart Grid or signal strip:

```text
SNAP SAVED
SNAP FAILED — CANVAS BLOCKED
SNAP FAILED — WALL NOT CONNECTED
```

Do not add a large UI.

---

# Part 5 — Preserve Controls and Data

Do not remove any recovered control in visible state:

```text
WOS nav
vehicle controls
speed/altitude
route Launch
POV EXT / DRIVER / PASS
Studio / Canvas access
Routes: Live
```

TAB-hidden may hide them visually, but TAB must restore them.

---

## Files Likely Touched

PLAY:

```text
play/flow-curve-builder/src/ui/BroadcastHudShell.tsx
play/flow-curve-builder/src/ui/BroadcastSmartGridOverlay.tsx
play/flow-curve-builder/src/ui/BroadcastRouteCameraInstrumentation.tsx
play/flow-curve-builder/src/ui/BroadcastSignalStrip.tsx
play/flow-curve-builder/src/styles.css
```

Possible new file:

```text
play/flow-curve-builder/src/runtime/broadcastScreensnap.ts
```

WALL if iframe controls or snap bridge is needed:

```text
wall/index.html
wall/traversalControlDeck.js
wall/*snapshot*
wall/*runtime*
```

Use actual repo filenames.

---

## Acceptance Criteria

### A. TAB hides bottom bar

Press TAB.

Expected:

```text
bottom WOS route/control bar hides
```

---

### B. TAB hides left bar

Press TAB.

Expected:

```text
left PLAY/app/nav bar hides
```

---

### C. TAB hides top bar

Press TAB.

Expected:

```text
top PLAY/app/header bar hides
```

---

### D. TAB restores all bars

Press TAB again.

Expected:

```text
bottom bar, left bar, top bar, Smart Grid overlay return
```

---

### E. Route motion continues

TAB-hidden state does not freeze route/camera motion.

---

### F. Smart Grid top-left is compressed

Top-left panel matches the hierarchy of other HUD signal blocks and is no longer a dominant large widget.

---

### G. PLAY identity remains merged with audio state

PLAY/WOS remains in the audio signal cluster, but not as a large title widget.

---

### H. Crosshairs remain square

Corner/crosshair grid marks maintain 1:1 aspect ratio at all tested sizes.

---

### I. Screensnap works in motion or fails honestly

During route motion, screensnap saves a PNG or shows exact blocker reason.

---

### J. Screensnap does not pause/freeze

Capture does not stop route motion.

---

### K. Old Snapshot button does not return

No old Snapshot/Still/Freeze UI returns.

---

### L. Existing controls preserved in visible state

All route/camera/vehicle/access controls remain when TAB-visible.

---

### M. No fake data

No new fake indicators.

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

3. Open Broadcast HUD.

4. Confirm visible-state controls remain.

5. Press TAB.

Expected hidden:

```text
top bar
left bar
bottom WOS bar
Smart Grid overlay
```

6. Confirm route/map still moves.

7. Press TAB again.

Expected:

```text
all controls return
```

8. Inspect top-left Smart Grid.

Expected:

```text
compressed, same hierarchy as other signals
```

9. Resize viewport.

Expected:

```text
crosshairs remain square
```

10. Start route motion.

11. Trigger screensnap.

Expected:

```text
PNG saved
```

or explicit error:

```text
SNAP FAILED — [reason]
```

12. Confirm route motion continues.

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

TAB becomes the real clean-view control:

```text
hides bottom bar
hides left bar
hides top bar
hides Smart Grid overlay
keeps route motion running
```

The Smart Grid top-left block becomes compressed and proportional to the other HUD signal blocks.

Crosshairs stay square.

Screensnap captures moving route/map frames without entering a video/capture mode.

---

## Implementation Guide

- **Where:** PLAY Broadcast HUD visibility state, Smart Grid overlay CSS, WOS control visibility bridge, screensnap helper.
- **What:** Expand TAB-hidden mode to hide top/left/bottom bars, compress the top-left Smart Grid block, fix crosshair aspect ratios, and add a one-shot motion screensnap action.
- **Expect:** Cleaner OBS visual space on TAB, proportional HUD density, unstretched grid marks, and route-motion frame capture.
