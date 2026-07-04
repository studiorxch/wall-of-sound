# 0625K_PLAY_SmartGridDensityAndResponsiveOBSFramePatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / OBS Frame Layout Hardening

This patch continues from the confirmed `0625J` Smart Grid visual baseline.

`0625J` established the correct direction:

```text
angular top-left Smart Grid panel
PLAY / WOS identity integrated with audio state
AUDIO SIG / BRIDGE dividers
dim italic missing states
guarded STOP styling
no rounded consumer play/pause UI
tsc clean
```

`0625K` does not add new data systems.

It hardens layout density and OBS framing so the Smart Grid remains usable across broadcast capture sizes.

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
angular top-left Smart Grid panel
PLAY / WOS identity
AUDIO SIG / BRIDGE dividers
AUDIO NO TRACK / AUDIO LIVE
TX IDLE / TX ACTIVE
SOURCE WOS LOCAL
UPTIME PLAY
SYNC LOCKED / DEGRADED / LOST / MISSING
LATENCY measured / MISSING
STOP guarded / unavailable / missing
Routes: Live
Studio / Canvas access
Subway Map / Website / Kinetic Fish explicit route status
CAM ROUTE
POV EXT / DRIVER / PASS
SPD 1X
ALT CITY
ROUTE LIVE
SKY / SUN / CLOUD / ATM
TIME / ZONE / WX / TEMP / HUM / PREC / WIND / SRC
WOS nav Flight / Drive / Walk / Bike / Transit / Speed / Alt / Launch
TAB hide/show
map pan/zoom
```

Do not restore:

```text
Operate
Show
Snapshot
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

## Goal

Tune Smart Grid density and responsive layout for OBS capture.

The Broadcast HUD should remain readable and balanced at:

```text
1920x1080
2560x1440
3840x2160
browser preview widths
cropped OBS frame
```

The layout should not crowd or collide with:

```text
top-left Smart Grid panel
top-right access cluster
right camera/sky instrumentation
bottom-left clock/weather signal strip
WOS nav
typed track index overlay
map center
```

---

## Core Rule

This is layout hardening only.

Do not change:

```text
runtime bridge logic
truth-state model
heartbeat
latency
stop bridge
weather model
sky model
camera POV bridge
route controls
audio playback logic
```

---

# Part 1 — Responsive Density Tokens

## Goal

Create reusable sizing tokens for HUD density.

Suggested CSS variables:

```css
:root {
  --hud-scale: 1;
  --hud-gap-xs: 4px;
  --hud-gap-sm: 6px;
  --hud-gap-md: 10px;
  --hud-font-xs: 9px;
  --hud-font-sm: 10px;
  --hud-font-md: 12px;
  --hud-panel-pad-x: 12px;
  --hud-panel-pad-y: 9px;
  --hud-panel-max-w: 360px;
}
```

Then use media/container queries to adapt.

---

## Required Breakpoints

Implement layout adjustments for at least:

```text
<= 1366px wide
<= 1080px high
>= 1920px wide
>= 2560px wide
>= 3840px wide
```

Suggested behavior:

```text
small preview:
  reduce gaps and font size slightly
  compress missing text lines
  prevent panel overlap

1080p:
  default broadcast density

1440p:
  slightly more breathing room
  no oversized UI

4K:
  scale up modestly
  do not let panels become huge
```

Use clamp() where appropriate.

---

# Part 2 — Top-Left Panel Density

## Goal

Make the top-left Smart Grid panel compact but readable.

Required:

```text
top-left panel stays inside OBS safe frame
does not cover typed track index when it appears
does not overlap top-right instrumentation at narrower widths
missing states wrap gracefully or truncate with title
```

Suggested CSS:

```css
.smart-grid-audio-panel {
  width: clamp(280px, 24vw, 420px);
  max-width: calc(100vw - 32px);
}
```

Missing state rows may use:

```css
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
```

But titles/tooltips should preserve the full missing reason if useful.

---

## Required Row Hierarchy

Preserve the three-section structure:

```text
identity
AUDIO SIG
BRIDGE
```

Do not collapse the panel into an unreadable single block.

---

# Part 3 — Top-Right Access Cluster Density

## Goal

Keep the access cluster visible but secondary.

Current access cluster:

```text
Routes: Live
Studio / Canvas ↗
Subway Map (no route)
Website (no route)
Kinetic Fish (no route)
```

Required:

```text
does not collide with camera/sky panel
can wrap to second line if needed
uses system-cell styling
remains readable
missing route status explicit
```

No bare dashes.

No removal.

---

# Part 4 — Right Camera/Sky Instrumentation Fit

## Goal

Ensure right instrumentation remains readable without taking over the screen.

Required rows:

```text
CAM ROUTE
POV EXT / DRIVER / PASS
SPD 1X
ALT CITY
ROUTE LIVE
SKY phase
SUN EL / AZ
CLOUD coverage / density
ATM status
```

Required behavior:

```text
at 1080p, fits below top access cluster
at smaller preview widths, stays readable or stacks
does not overlap WOS nav
does not overlap typed track index
```

If necessary, allow the right panel to shift downward:

```text
top: clamp(72px, 8vh, 120px)
```

---

# Part 5 — Bottom-Left Signal Strip Fit

## Goal

Preserve bottom-left signal strip without colliding with WOS nav.

Rows:

```text
TIME
ZONE
WX
TEMP
HUM
PREC
WIND
SRC
```

Required:

```text
stays above/beside WOS nav
does not cover route controls
can compress to two-row layout if needed
remains readable in OBS frame
```

Suggested behavior:

```text
wide: horizontal strip
narrow: compact stacked rows
```

---

# Part 6 — OBS Safe Frame

## Goal

Keep UI inside capture-safe margins.

Add optional safe-frame variables:

```css
--obs-safe-x: clamp(12px, 1vw, 28px);
--obs-safe-y: clamp(10px, 1vh, 24px);
```

Use for major HUD anchors:

```text
top-left panel
top-right access cluster
right instrumentation
bottom-left signal strip
TAB hint
```

Do not create visible frame graphics unless already part of design.

---

# Part 7 — TAB Hidden State

TAB hide/show must continue.

Required:

```text
controls visible by default
TAB hides Smart Grid overlay and controls
TAB again restores
reload starts visible
```

Do not persist hidden state.

Do not reintroduce Show/Operate/Snapshot.

---

# Part 8 — Typed Track Index Interaction

If the typed track index overlay appears, ensure it does not collide badly.

Required:

```text
typed overlay remains above/below in z-index as currently intended
top-left panel does not hide essential typed track information
if collision exists, typed overlay may offset below the top-left panel
```

Do not remove typed overlay.

---

## Files Likely Touched

PLAY:

```text
play/flow-curve-builder/src/ui/BroadcastSmartGridOverlay.tsx
play/flow-curve-builder/src/ui/BroadcastRouteCameraInstrumentation.tsx
play/flow-curve-builder/src/ui/BroadcastSignalStrip.tsx
play/flow-curve-builder/src/ui/TypedTrackIndexOverlay.tsx
play/flow-curve-builder/src/styles.css
```

WALL should not need changes.

---

## Implementation Steps

### 1. Preserve current 0625J baseline

Confirm current HUD renders before changes.

### 2. Add density tokens

Add CSS variables and clamp values.

### 3. Tune top-left panel width/padding

Keep angular cut-corner treatment.

### 4. Tune top-right access cluster wrapping

Avoid collision with camera/sky panel.

### 5. Tune right instrumentation placement

Keep rows readable.

### 6. Tune bottom-left signal strip

Avoid WOS nav collision.

### 7. Test TAB

Hide/show must still work.

### 8. Test responsive sizes

At minimum inspect:

```text
1366x768
1920x1080
2560x1440
3840x2160
```

### 9. Run TypeScript

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

---

## Acceptance Criteria

### A. Top-left panel fits 1080p

Panel remains inside frame and readable.

---

### B. Top-left panel preserves angular geometry

No rounded consumer card regression.

---

### C. Top-right access cluster preserved

Routes / Studio / Subway / Website / Kinetic Fish remain visible or wrap cleanly.

---

### D. Right instrumentation preserved

Camera/sky panel remains readable and does not collide with access cluster.

---

### E. Bottom-left signal strip preserved

Clock/weather strip remains readable and avoids WOS nav collision.

---

### F. TAB still works

TAB hides/restores overlay and controls.

---

### G. Typed overlay remains

Typed track index still appears and is not removed.

---

### H. No fake data

No new fake indicators are introduced.

---

### I. Removed buttons stay removed

Operate / Show / Snapshot do not return.

---

### J. WOS controls preserved

Vehicle/speed/alt/launch controls remain.

---

### K. Map remains interactive

Pan/zoom works.

---

### L. tsc clean

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

4. Confirm top-left Smart Grid panel fits.

5. Confirm top-right access cluster fits/wraps.

6. Confirm right camera/sky panel fits.

7. Confirm bottom-left clock/weather strip fits.

8. Trigger typed track index overlay if possible.

9. Confirm no destructive overlap.

10. Press TAB.

Expected:

```text
overlay hides
```

11. Press TAB again.

Expected:

```text
overlay restores
```

12. Resize browser or test OBS dimensions:

```text
1366x768
1920x1080
2560x1440
3840x2160
```

13. Confirm map pan/zoom works.

14. Confirm WOS nav remains.

15. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

The Smart Grid HUD keeps its new angular systems-display identity while fitting reliably inside OBS-friendly frames.

The result should feel:

```text
cleaner
denser
more intentional
less rounded
less collision-prone
broadcast-ready
```

without changing runtime behavior or losing any recovered controls.

---

## Implementation Guide

- **Where:** PLAY Smart Grid overlay and HUD CSS/layout.
- **What:** Add responsive density tokens, safe-frame margins, panel width clamps, wrapping rules, and collision-resistant placement for top-left, top-right, right, and bottom-left HUD systems.
- **Expect:** Same indicators and controls, improved OBS-safe layout across common capture sizes.
