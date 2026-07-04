# 0625P_PLAY_CleanCaptureModeStateSeparationAndChromeVisibilityFixPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Clean Capture State Separation

This patch follows `0625O`.

Current failure:

```text
Hiding the top bar appears to bring back or preserve other UI chrome.
Clean capture behavior is not using a stable visibility contract.
```

The problem is state coupling.

TAB should not behave like a partial mode that toggles random pieces independently.

TAB needs one explicit clean-capture state with a deterministic chrome policy.

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

## Current Problem

TAB-hidden should hide:

```text
top app/header bar
left app/sidebar bar
bottom WOS nav
right Mapbox buttons
Smart Grid overlay
access cluster
```

But current behavior implies:

```text
top bar hide is not synchronized with left/sidebar hide
Mapbox buttons still remain
layout fill may be applied to the wrong wrapper
controlsVisible may only hide overlay, not app shell chrome
```

This patch makes the visibility states explicit.

---

## Required State Model

Use two clearly separate concepts:

```text
controlsVisible
cleanCaptureActive
```

or derive cleanCaptureActive from controlsVisible, but treat it as a named class/state:

```ts
const cleanCaptureActive = !controlsVisible;
```

Then apply exactly one body/app class:

```text
broadcast-clean-capture
```

When active, it hides all app/WALL chrome.

When inactive, it restores all intended controls.

No separate independent toggles for top bar, left bar, WOS nav, Mapbox controls.

---

## Required Visibility Contract

### Visible / Operable State

When `cleanCaptureActive === false`:

```text
top app/header bar visible
left app/sidebar visible if normally present
Smart Grid overlay visible
access cluster visible
bottom WOS nav visible
right Mapbox buttons visible/subtle if intended
route controls usable
map pan/zoom usable
```

### Clean Capture State

When `cleanCaptureActive === true`:

```text
top app/header bar hidden
left app/sidebar hidden
Smart Grid overlay hidden
access cluster hidden
bottom WOS nav hidden
right Mapbox buttons hidden
map fills available frame
route/camera motion continues
S-key screensnap still works
typed title stays in A3 if policy says broadcast text remains
```

---

# Part 1 — Fix App Chrome Hiding Together

## Required App Chrome Selectors

Audit and hide actual selectors for:

```text
top app/header bar
left app/sidebar
tab row
navigation row
app shell padding/margins
```

Search terms:

```text
top-bar
topbar
header
app-header
shell-header
play-header
sidebar
left-sidebar
nav-rail
tabs
broadcast-tabs
project-tabs
flow-curve
scheduler
Broadcast HUD
```

---

## Required CSS Pattern

Apply rules under one class:

```css
body.broadcast-clean-capture .top-bar,
body.broadcast-clean-capture .app-header,
body.broadcast-clean-capture .play-shell-header,
body.broadcast-clean-capture .broadcast-tabs,
body.broadcast-clean-capture .project-tabs,
body.broadcast-clean-capture .left-sidebar,
body.broadcast-clean-capture .sidebar,
body.broadcast-clean-capture .nav-rail {
  display: none !important;
}
```

Use actual selectors.

If elements are outside the React root, body class still should catch them.

---

## Required Layout Fill

When clean capture is active:

```css
body.broadcast-clean-capture .app-shell,
body.broadcast-clean-capture .play-shell,
body.broadcast-clean-capture .broadcast-shell,
body.broadcast-clean-capture .hud-shell {
  margin: 0 !important;
  padding: 0 !important;
  inset: 0 !important;
}
```

Use actual selectors.

Important:

```text
hide chrome and remove its reserved layout space
```

Do not leave black strips from hidden sidebars/topbars.

---

# Part 2 — Fix WALL Chrome Hiding Together

## Required WALL Bridge

PLAY sends the same message every time clean capture changes:

```ts
{
  type: "play:controls-visibility",
  visible: !cleanCaptureActive
}
```

WALL applies:

```text
body.play-controls-hidden
```

or equivalent.

WALL must hide:

```text
#wos-nav
.mapboxgl-ctrl-top-right
.mapboxgl-ctrl-bottom-right
.mapboxgl-ctrl-top-left
.mapboxgl-ctrl-bottom-left
.mapboxgl-ctrl-group
.mapboxgl-ctrl
#viewport-controls
.wos-map-overlay-controls
```

Use actual selectors.

---

## Required Ack

WALL must return:

```ts
{
  type: "wall:controls-visibility-ack",
  payload: {
    visible,
    bodyClassApplied,
    mapboxControlsFound,
    wosNavFound
  }
}
```

If ack does not arrive, PLAY should log:

```text
[PLAY clean capture] WALL visibility ack missing
```

Do not clutter HUD permanently.

---

# Part 3 — Fix Top Bar vs Left Bar Regression

## Required Test Matrix

Test four cases:

```text
Initial visible state:
  top bar visible
  left bar visible
  WOS nav visible
  Mapbox buttons visible/subtle

After TAB:
  top bar hidden
  left bar hidden
  WOS nav hidden
  Mapbox buttons hidden

After TAB again:
  top bar visible
  left bar visible
  WOS nav visible
  Mapbox buttons visible/subtle

After reload:
  visible state restored by default
```

No element should flip opposite from the others.

---

# Part 4 — Typed Title A3 Preservation

Do not regress `0625O`:

```text
typed song/index overlay remains in A3
does not overlap Smart Grid cluster
does not overlap bottom-left signal strip
does not overlap WOS nav
```

If clean capture hides Smart Grid but keeps typed title, that is acceptable.

If clean capture should hide typed title for manual map snaps later, leave that as a separate optional toggle.

Do not change it in this patch.

---

# Part 5 — Mapbox Buttons Visible-State Opacity

Preserve `0625N` visible-state tone:

```text
Mapbox controls visible state is transparent/subtle
TAB-hidden state hides them completely
```

Do not make them dark again.

---

## Files Likely Touched

PLAY:

```text
play/flow-curve-builder/src/ui/BroadcastHudShell.tsx
play/flow-curve-builder/src/styles.css
```

Possibly:

```text
play/flow-curve-builder/src/ui/TypedTrackIndexOverlay.tsx
```

WALL:

```text
wall/index.html
wall/styles.css
```

Use actual repo filenames.

---

## Acceptance Criteria

### A. TAB hides top bar

After pressing TAB:

```text
PLAY logo / Flow-Curve / Scheduler / Broadcast HUD row is hidden.
```

---

### B. TAB hides left/sidebar

After pressing TAB:

```text
left app/sidebar chrome is hidden.
```

---

### C. TAB hides bottom WOS nav

After pressing TAB:

```text
bottom WOS route/control bar is hidden.
```

---

### D. TAB hides right Mapbox buttons

After pressing TAB:

```text
right-edge Mapbox controls are hidden.
```

---

### E. No leftover layout gutter

Clean capture state does not leave app-reserved black strips from hidden top/left chrome.

---

### F. TAB restores all chrome consistently

Press TAB again:

```text
top/left/WOS nav/Mapbox controls return together.
```

---

### G. Reload starts visible

Reload restores visible/operable state.

---

### H. WALL ack confirms hide/show

Console shows wall controls visibility ack with:

```text
bodyClassApplied: true
mapboxControlsFound: number
wosNavFound: true/false
```

---

### I. Typed title remains A3

No regression to top-left overlap.

---

### J. Screensnap clean state preserved

`TAB -> S` captures clean map frame or exact blocker.

---

### K. No runtime regressions

Heartbeat, latency, stop, sky, weather, clock, POV, drive status remain intact.

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

4. Confirm visible state:

```text
top bar visible
left/sidebar visible if normally present
WOS nav visible
Mapbox controls visible/subtle
```

5. Press TAB.

Expected hidden:

```text
top bar
left/sidebar
bottom WOS nav
right Mapbox controls
Smart Grid overlay
```

6. Confirm no black layout gutter caused by hidden chrome.

7. Press S.

Expected:

```text
clean screenshot saved or exact blocker.
```

8. Press TAB again.

Expected restored:

```text
top bar
left/sidebar
WOS nav
Mapbox controls
Smart Grid overlay
```

9. Reload page.

Expected:

```text
visible state by default.
```

10. Confirm typed title remains in A3.

11. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

TAB becomes deterministic:

```text
one clean-capture state
one class contract
all chrome hides together
all chrome restores together
no top-vs-left regression
no leftover layout gutter
```

The title block remains in A3 and no runtime behavior changes.

---

## Implementation Guide

- **Where:** PLAY Broadcast HUD visibility state/body class and CSS; WALL controls visibility bridge/CSS.
- **What:** Separate clean-capture state from individual control toggles, apply one consistent class contract to hide top/left/bottom/right chrome together, preserve A3 typed title placement.
- **Expect:** TAB no longer causes back-and-forth regressions between top bar, left bar, and UI buttons.
