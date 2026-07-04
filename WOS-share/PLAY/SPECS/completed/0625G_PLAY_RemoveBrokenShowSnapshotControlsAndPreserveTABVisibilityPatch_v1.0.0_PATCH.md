# 0625G_PLAY_RemoveBrokenShowSnapshotControlsAndPreserveTABVisibilityPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Remove Broken Toolbar Controls

Current issue:

```text
Show button freezes the system
Operate / Show buttons do not match the visual language
Snapshot appears to be leftover video/capture behavior
These controls are not working reliably
```

Decision:

```text
Remove Operate / Show / Snapshot from the Broadcast HUD toolbar.
Keep TAB as the visibility toggle.
Keep all recovered controls/signals visible by default.
```

This patch removes broken interface chrome without removing the actual working controls.

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

Do not regress the recovered baseline:

```text
clock
weather
music play / NO TRACK
vehicle controls
speed / altitude controls
route launch
camera instrumentation
POV EXT / DRIVER / PASS
sky status
Studio / Canvas access
TAB hide/show controls
map pan/zoom
ATM THREE SKY when WALL is running
```

---

## Problem

The current toolbar includes:

```text
Operate
Show
Snapshot
```

Problems:

```text
Show freezes the system
Snapshot is leftover capture/video behavior
Operate/Show button styling does not fit the current micrographic direction
The controls duplicate what TAB already handles
```

The correct simplified behavior is:

```text
controls visible by default
TAB hides controls/signals
TAB restores controls/signals
no Show button required
no Snapshot button required
```

---

## Required Removal

Remove from Broadcast HUD toolbar:

```text
Operate
Show
Snapshot
```

Remove associated broken click behavior.

Remove any Show mode effect that:

```text
freezes the system
blocks map interaction
hides controls permanently
changes iframe pointer-events incorrectly
persists hidden state
```

---

## Required Toolbar After Patch

Keep only working/relevant controls.

Suggested toolbar:

```text
▶ NO TRACK | Routes: Live | Studio / Canvas ↗ | Subway Map (no route) | Website (no route) | Kinetic Fish (no route)
```

or, if access cluster is separate:

```text
▶ NO TRACK | Routes: Live | Studio / Canvas ↗
```

Do not remove the access cluster.

Do not remove route status.

Do not remove top music play.

---

## Visibility Model

TAB becomes the only clean-view toggle.

Required:

```text
Open Broadcast HUD:
  controls/signals visible

Press TAB:
  controls/signals hide

Press TAB again:
  controls/signals return

Reload:
  controls/signals visible
```

No Show button.

No Operate button.

No Snapshot button.

No persistent hidden state.

---

## Snapshot Removal

Remove Snapshot UI and behavior unless it is actively working and explicitly required elsewhere.

Current decision:

```text
Snapshot appears to be leftover video/capture behavior.
Remove from Broadcast HUD.
```

Do not remove browser/OS screenshot capability.

Do not add capture/still/freeze/16:9 modes.

---

## Freeze Bug Removal

Audit code paths for Show mode.

Search terms:

```text
show
Show
isShow
showMode
broadcastMode
operate
Operate
snapshot
Snapshot
capture
still
freeze
controlsVisible
pointer-events
```

Likely files:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/styles.css
```

Remove or neutralize any Show-mode effect that changes:

```text
iframe pointer events
map interaction
WOS nav visibility
route stage visibility
controlsVisible persistence
```

TAB should handle only visibility, not map state.

---

## Required CSS Cleanup

Remove styling for the broken button group if no longer used:

```text
operate/show segmented buttons
snapshot button
show active state
```

Keep styles for:

```text
music play button
routes live badge
access cluster
TAB hint
signal strip
camera instrumentation
micrographics
```

---

## Do Not Remove

Do not remove:

```text
music play button
Routes: Live
Studio / Canvas
Subway Map / Website / Kinetic Fish access items
camera POV controls
WOS nav
clock
weather
sky status
TAB hint
```

---

## Do Not Reintroduce

Do not bring back:

```text
capture mode
still mode
freeze mode
16:9 frame
bottom playback dock
fake route line
signal dot
dark haze
vignette
emoji controls
```

---

## Files Likely Touched

PLAY:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/styles.css
```

Possibly:

```text
src/ui/BroadcastControlsVisibility.tsx
src/ui/BroadcastSignalStrip.tsx
```

Use actual project filenames.

WALL should not need changes for this patch.

---

## Acceptance Criteria

### A. Operate button removed

Broadcast toolbar no longer shows Operate.

---

### B. Show button removed

Broadcast toolbar no longer shows Show.

---

### C. Snapshot button removed

Broadcast toolbar no longer shows Snapshot.

---

### D. Show freeze path removed

There is no Show click path capable of freezing the system.

---

### E. TAB still hides controls

Press TAB.

Expected:

```text
controls/signals hide
map remains available
```

---

### F. TAB restores controls

Press TAB again.

Expected:

```text
controls/signals return
```

---

### G. Reload starts visible

Reload Broadcast HUD.

Expected:

```text
controls/signals visible by default
```

---

### H. Music play remains visible

Top music play remains:

```text
▶ NO TRACK
```

or actual playing/paused state.

---

### I. Routes Live remains visible

Route status remains visible.

---

### J. Access cluster remains visible

Studio / Canvas and other protected access items remain visible.

---

### K. WOS controls remain visible

Vehicle/route controls remain when controls are visible.

---

### L. Camera controls remain visible

POV EXT / DRIVER / PASS remain.

---

### M. Clock/weather remain visible

TIME / ZONE / WX / TEMP / HUM / PREC / WIND / SRC remain.

---

### N. Sky status remains visible

SKY / SUN / CLOUD / ATM remain.

---

### O. Map remains interactive

Map pan/zoom works.

---

### P. tsc clean

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

1. Start WALL if testing full sky.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm toolbar does not show:

```text
Operate
Show
Snapshot
```

5. Confirm toolbar still shows:

```text
▶ NO TRACK
Routes: Live
Studio / Canvas
```

6. Confirm controls/signals visible.

7. Press TAB.

Expected:

```text
controls/signals hide
```

8. Press TAB again.

Expected:

```text
controls/signals return
```

9. Drag/zoom map.

Expected:

```text
map interactive
```

10. Confirm WOS nav remains available when controls visible.

11. Confirm POV controls remain.

12. Confirm clock/weather/sky status remain.

13. Confirm no freeze occurs.

14. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

The broken toolbar mode buttons are gone.

Broadcast HUD keeps:

```text
music play
route status
protected access
camera instrumentation
clock/weather/sky signals
WOS controls
TAB clean-view toggle
```

without the system-freezing Show button or leftover Snapshot behavior.

---

## Implementation Guide

- **Where:** Broadcast HUD toolbar and visibility-mode logic.
- **What:** Remove Operate / Show / Snapshot buttons and associated broken mode logic; preserve TAB as the only hide/show control.
- **Expect:** Cleaner toolbar, no Show freeze, no Snapshot leftovers, and all recovered controls/signals intact.
