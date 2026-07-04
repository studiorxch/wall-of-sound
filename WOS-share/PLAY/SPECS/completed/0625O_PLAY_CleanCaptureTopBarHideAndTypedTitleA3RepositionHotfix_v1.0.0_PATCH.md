# 0625O_PLAY_CleanCaptureTopBarHideAndTypedTitleA3RepositionHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Clean Capture Chrome + Typed Title Collision Fix

This patch follows `0625N`.

Current remaining issues:

```text
1. The top app/header bar still remains visible in TAB-hidden clean-capture mode.
2. The typed song title/index block overlaps the top-left Smart Grid signal cluster.
3. The typed song title block should move to A3.
```

This patch fixes those issues without changing runtime data, route behavior, sky behavior, or controls.

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
TAB clean-capture behavior
S-key screensnap
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
Drive audit/status
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

# Part 1 — TAB Must Hide Top Bar

## Problem

TAB-hidden clean-capture mode still leaves the top app/header bar visible.

The screenshot shows the app header row remains:

```text
PLAY logo / Flow-Curve / Scheduler / Broadcast HUD row
```

This must disappear when TAB-hidden.

Browser chrome cannot be hidden by the app, but app chrome must hide.

---

## Required Behavior

When TAB is pressed and `controlsVisible === false`:

```text
hide PLAY top/header bar
hide tab row
hide app nav row
hide top route/access cluster if classified as UI overlay
hide Smart Grid overlay
hide WOS bottom nav
hide Mapbox right controls
keep map visible
keep route/camera motion running
```

When TAB is pressed again:

```text
restore intended controls and app chrome
```

---

## Required Selector Audit

Search the PLAY DOM/CSS for actual top bar selectors.

Search terms:

```text
top-bar
topbar
header
app-header
play-header
shell-header
tabs
broadcast-tabs
nav
nav-row
project-tabs
main-tabs
```

Likely current selector based on reports:

```text
.top-bar
```

But if `.top-bar` is not enough, inspect DOM and add actual selectors.

---

## Required CSS Fix

Apply clean-capture class high enough in the app tree.

Current class from `0625N`:

```text
body.broadcast-clean-capture
```

Add/verify rules such as:

```css
body.broadcast-clean-capture .top-bar,
body.broadcast-clean-capture .app-header,
body.broadcast-clean-capture .play-shell-header,
body.broadcast-clean-capture .broadcast-tabs,
body.broadcast-clean-capture .project-tabs,
body.broadcast-clean-capture .main-tabs {
  display: none !important;
}
```

Use actual selectors.

If hiding top bar leaves vertical layout offset, remove the offset:

```css
body.broadcast-clean-capture .app-shell,
body.broadcast-clean-capture .broadcast-shell,
body.broadcast-clean-capture .hud-shell {
  padding-top: 0 !important;
  margin-top: 0 !important;
}
```

Use actual selectors.

---

## Required Acceptance

After TAB:

```text
No PLAY app top/header bar remains.
No Flow-Curve / Scheduler / Broadcast HUD tab row remains.
Only browser chrome remains outside app control.
```

---

# Part 2 — Move Typed Song Title Block To A3

## Problem

The typed song title/index block currently overlaps the top-left Smart Grid cluster.

The current overlap occurs around:

```text
large index number
track title
SRC/ART metadata
top-left Smart Grid panel
```

The user requested:

```text
move title song block to A3
```

---

## A3 Placement Definition

Define the broadcast grid as:

```text
Columns: A / B / C
Rows: 1 / 2 / 3
```

A3 means:

```text
left column
lower third / lower-left region
above bottom signal strip and WOS nav
not colliding with top-left Smart Grid
not colliding with bottom-left clock/weather strip
not blocking route controls
```

Suggested placement:

```css
.typed-track-index-overlay {
  left: var(--obs-safe-x);
  top: auto;
  bottom: clamp(130px, 15vh, 220px);
  max-width: clamp(260px, 32vw, 560px);
}
```

Adjust to avoid bottom-left signal strip.

If bottom-left signal strip occupies A3, place typed title slightly above it:

```text
A3-upper
```

but still in the A3 zone, not A1.

---

## Required Behavior

The typed track overlay should:

```text
appear in A3
not overlap top-left Smart Grid cluster
not overlap bottom-left signal strip
not overlap WOS nav
remain readable during track changes
collapse to index-only as before
```

Do not remove the typed overlay.

Do not enlarge it.

Do not move it into the top-left A1 region again.

---

## Required CSS Tokens

Use or add layout tokens:

```css
--hud-title-a3-left: var(--obs-safe-x);
--hud-title-a3-bottom: clamp(132px, 15vh, 220px);
--hud-title-a3-max-w: clamp(260px, 32vw, 560px);
```

Then apply to the typed overlay.

---

## Required Z-Index

Keep typed overlay above map but below critical controls if needed.

Suggested:

```text
typed overlay z-index above map/crosshair grid
below visible WOS nav/access controls if they overlap
```

Do not block map interaction:

```css
pointer-events: none;
```

---

# Part 3 — Collision Rules

## Required Non-Collision Map

Visible state:

```text
A1: Smart Grid audio/status cluster
A3: typed track title/index block
bottom-left: clock/weather signal strip
right: camera/sky instrumentation
top-right: access cluster
bottom: WOS nav
```

TAB-hidden state:

```text
map clean
typed overlay behavior follows current policy
top/header hidden
left/sidebar hidden
bottom WOS nav hidden
Mapbox controls hidden
```

If typed overlay is hidden by TAB because it is part of overlay state, that is acceptable only if current intended policy says TAB hides all overlays.

If typed overlay is intended as broadcast content, keep it visible.

Do not change policy unless necessary; just move it to A3.

---

# Part 4 — Screensnap

Clean capture path remains:

```text
TAB -> S
```

Required:

```text
top app/header bar not captured
left sidebar not captured
WOS nav not captured
Mapbox controls not captured
route motion continues
```

If typed overlay remains visible and should not be in manual map snaps, add a future optional toggle; do not overbuild here.

---

## Files Likely Touched

PLAY:

```text
play/flow-curve-builder/src/ui/BroadcastHudShell.tsx
play/flow-curve-builder/src/ui/TypedTrackIndexOverlay.tsx
play/flow-curve-builder/src/styles.css
```

Possibly:

```text
play/flow-curve-builder/src/ui/BroadcastSmartGridOverlay.tsx
```

WALL should not need changes for this patch unless the top bar issue is somehow iframe-related.

---

## Acceptance Criteria

### A. TAB hides top app bar

Press TAB.

Expected:

```text
PLAY top/header/app bar disappears.
```

---

### B. TAB hides app tab row

Press TAB.

Expected:

```text
Flow-Curve / Scheduler / Broadcast HUD tabs disappear.
```

---

### C. Hidden layout fills upward

No leftover app-shell vertical offset from the hidden top bar.

---

### D. TAB restores top app bar

Press TAB again.

Expected:

```text
top/header/app bar returns.
```

---

### E. Typed title block moves to A3

Track index/title overlay appears in A3/lower-left region.

---

### F. No overlap with Smart Grid cluster

Typed overlay no longer overlaps the top-left Smart Grid audio/status panel.

---

### G. No overlap with bottom signal strip

Typed overlay does not cover TIME / ZONE / WX strip.

---

### H. No overlap with WOS nav

Typed overlay does not cover bottom route controls.

---

### I. Typed overlay still works

Track change animation, large index, title, metadata, and collapse behavior remain.

---

### J. Screensnap clean state preserved

`TAB -> S` captures clean map frame without app chrome where technically possible.

---

### K. No runtime regressions

Heartbeat, latency, stop, sky, weather, clock, POV, route controls remain intact.

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

4. Confirm typed song title appears in A3.

5. Confirm no overlap with top-left Smart Grid.

6. Press TAB.

Expected:

```text
top app/header bar disappears
tab row disappears
left/sidebar remains hidden if already fixed
bottom WOS nav hides
Mapbox controls hide
```

7. Press S.

Expected:

```text
clean screenshot saved or exact blocker.
```

8. Press TAB again.

Expected:

```text
controls/app chrome return.
```

9. Trigger a track change if possible.

Expected:

```text
typed title animates in A3.
```

10. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

TAB-hidden mode becomes cleaner:

```text
top app bar hidden
tab row hidden
left/sidebar hidden
bottom/right controls hidden
map frame clean
```

The typed track overlay moves from the crowded top-left region into A3, giving the Smart Grid cluster room and avoiding overlap.

---

## Implementation Guide

- **Where:** PLAY clean-capture CSS/body class, TypedTrackIndexOverlay placement CSS.
- **What:** Hide actual top/header/tab selectors during TAB-hidden mode and reposition typed track/index overlay to A3.
- **Expect:** Clean capture state plus no overlap between the song title block and the Smart Grid top-left panel.
