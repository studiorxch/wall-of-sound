# 0625J_PLAY_SmartGridVisualRefinementAndTopLeftPanelGeometryPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Smart Grid Visual Refinement

This patch is visual/layout refinement only.

The runtime plumbing from `0625I` is now the stable baseline:

```text
Smart Grid audio cluster
clock/weather
WALL sky status
camera/POV controls
vehicle controls
route Launch
guarded route Stop when available
heartbeat/latency bridge
TAB hide/show
no Operate/Show/Snapshot buttons
no rounded consumer play button
```

`0625J` improves the top-left Smart Grid panel geometry and hierarchy without changing data sources or behavior.

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
big rounded play button
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

Refine the top-left Smart Grid panel so it feels like a systems-display corner treatment rather than a stack of labels.

The top-left cluster should read as:

```text
PLAY / WOS broadcast identity
audio signal state
runtime bridge state
guarded stop state
```

not:

```text
friendly app header
rounded button group
debug list
consumer player control
```

---

## Visual Direction

Use the strong HUD signal style already working in the project:

```text
thin linework
angular cut-corner geometry
small technical labels
hard-edged panels
low roundedness
compact data rows
truth-state accents
micrographic dividers
```

Avoid:

```text
large pill buttons
soft card radius
Apple-style friendly rounded UI
glow-heavy panels
fake cockpit clutter
```

---

# Part 1 — Top-Left Panel Geometry

## Required Geometry

Replace soft rounded panel treatment with angular Smart Grid framing.

Suggested CSS direction:

```text
border-radius: 0 or 2px max
clip-path polygon cut corners
thin 1px borders
small corner brackets
horizontal rule dividers
```

Example shape concept:

```css
clip-path: polygon(
  0 0,
  calc(100% - 14px) 0,
  100% 14px,
  100% 100%,
  14px 100%,
  0 calc(100% - 14px)
);
```

Use actual CSS structure.

Do not overdo it.

The panel should be sharp but still legible.

---

## Required Corner Treatment

Add a distinct top-left corner treatment.

Possible elements:

```text
small diagonal cut
small bracket marks
short tick marks
thin vertical label
micro serial line
```

Example:

```text
SYS PLAY/WOS
AUDIO BROADCAST
GRID NODE LOCAL
```

No fake node numbers unless derived/static.

If using a serial, mark it static:

```text
SYS PLAY/WOS
```

Do not invent fake `NODE-17`.

---

# Part 2 — Hierarchy Refinement

## Required Row Groups

Group the top-left cluster into three clear sections:

```text
1. Identity
2. Audio State
3. Runtime Bridge / Stop
```

Suggested structure:

```text
PLAY / WOS
AUDIO BROADCAST SYSTEM

AUDIO   NO TRACK
TX      IDLE
SOURCE  WOS LOCAL
UPTIME  PLAY 00:00:12

SYNC    LOCKED / MISSING...
LAT     12 MS / MISSING...
STOP    AVAILABLE / CONFIRM / MISSING...
```

---

## Required Audio Styling

The audio row should be the visual anchor.

When no track:

```text
AUDIO NO TRACK
TX IDLE
```

When playing:

```text
AUDIO LIVE
TX ACTIVE
```

Do not show a large:

```text
PAUSE
```

If a small click affordance remains, keep it system-like:

```text
small ▪
small triangular mark
thin audio activity strip
```

Only show audio bars/waveform if real analyzer exists.

If no analyzer:

```text
no fake waveform
```

---

## Required Truth-State Styling

Use distinct but subtle styling for truth states:

```text
LIVE      normal bright
DERIVED   normal/dim with source label
STATIC    dim/static
MISSING   dim/warning text, not decorative alarm
```

Do not make missing states dominate the screen.

Stop missing/latency missing/sync missing should be readable but visually secondary.

---

# Part 3 — Stop Control Visual Refinement

## Required Stop Behavior Preservation

Do not change stop logic.

Keep:

```text
two-step guarded stop
3 second confirm window
only active when route stop is real/available
missing/unavailable states when not connected
```

## Required Stop Visual Style

When available:

```text
STOP
ARM
CONFIRM
```

should feel guarded.

Suggested:

```text
small warning stripe
thin orange edge
not a large red panic button
not easy to hit accidentally
```

When missing:

```text
STOP MISSING — WALL NOT CONNECTED
```

should be secondary and dim.

---

# Part 4 — Access Cluster Refinement

The current access cluster stays top-right or nearby:

```text
Routes: Live
Studio / Canvas ↗
Subway Map (no route)
Website (no route)
Kinetic Fish (no route)
```

This patch may refine visual styling, but must not remove access.

Preferred:

```text
thin text links
system cells
less button-like
explicit missing route labels
```

No bare dashes.

---

# Part 5 — Smart Grid Consistency

Update related HUD elements to match the same visual language if minimal:

```text
top-left audio cluster
top-right access cluster
right camera/sky instrumentation
bottom-left signal strip
```

Do not do a full redesign.

Keep scope narrow.

---

## Files Likely Touched

PLAY:

```text
play/flow-curve-builder/src/ui/BroadcastSmartGridOverlay.tsx
play/flow-curve-builder/src/ui/BroadcastHudShell.tsx
play/flow-curve-builder/src/ui/BroadcastRouteCameraInstrumentation.tsx
play/flow-curve-builder/src/ui/BroadcastSignalStrip.tsx
play/flow-curve-builder/src/styles.css
```

Runtime files should not need changes unless class names require cleanup.

WALL should not need changes.

---

## Implementation Steps

### 1. Preserve baseline

Confirm current `0625I` indicators still render.

### 2. Refine top-left cluster markup if needed

Group:

```text
identity
audio
runtime
```

### 3. Apply angular panel CSS

Use low-radius / clipped-corner treatment.

### 4. Add micrographic dividers

Use thin rules and small labels.

### 5. Refine truth-state classes

Style:

```text
live
derived
static
missing
```

### 6. Refine stop cell

Keep logic unchanged.

### 7. Verify TAB

Ensure overlay still hides/restores.

### 8. Run TypeScript

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

---

## Acceptance Criteria

### A. Top-left cluster is angular

The top-left panel no longer reads as a rounded consumer card.

---

### B. PLAY identity is integrated

PLAY / WOS remains integrated with the audio state.

---

### C. Audio state is primary

AUDIO / TX rows are visually prominent.

---

### D. Big PAUSE does not return

No large PAUSE label appears while music is playing.

---

### E. Truth states remain intact

Every indicator still has live/derived/static/missing truth state.

---

### F. No fake data added

No fake waveform, fake node, fake latency, fake audio format, or fake stop.

---

### G. Stop logic unchanged

Guarded stop behavior remains if available.

---

### H. Missing states readable but secondary

Missing states are explicit but not visually dominant.

---

### I. Access cluster preserved

Studio / Canvas, Subway Map, Website, and Kinetic Fish access remain visible/statused.

---

### J. Existing right/bottom HUD preserved

Camera/sky and clock/weather remain.

---

### K. TAB still works

TAB hides/restores Smart Grid overlay.

---

### L. Map remains interactive

Pan/zoom works.

---

### M. Removed buttons stay removed

Operate / Show / Snapshot do not return.

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

4. Confirm top-left panel has angular/corner-cut treatment.

5. Confirm PLAY / WOS is integrated with AUDIO.

6. Confirm AUDIO / TX rows are readable.

7. Confirm SYNC / LATENCY / STOP retain truthful values.

8. Confirm no fake waveform or fake numbers.

9. Confirm Stop behavior if route active.

10. Confirm access cluster remains.

11. Confirm camera/sky panel remains.

12. Confirm clock/weather remains.

13. Press TAB.

Expected:

```text
overlay hides
```

14. Press TAB again.

Expected:

```text
overlay returns
```

15. Drag/zoom map.

Expected:

```text
map remains interactive
```

16. Confirm Operate / Show / Snapshot absent.

17. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

The Broadcast HUD top-left area becomes a sharper Smart Grid systems panel.

It should communicate:

```text
PLAY/WOS identity
audio signal state
source/runtime health
sync/latency/stop status
```

without consumer-button styling, fake data, or lost controls.

---

## Implementation Guide

- **Where:** PLAY Smart Grid overlay components and CSS.
- **What:** Refine top-left panel geometry, hierarchy, truth-state styling, and stop/access visual treatment while preserving all runtime logic.
- **Expect:** A more system-display-like HUD matching the current camera/weather micrographics, not a rounded app toolbar.
