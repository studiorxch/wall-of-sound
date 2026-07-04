# 0624X_PLAY_ProtectedSurfacesRecoveryAndTABControlsHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Recovery Patch

This is not a polish patch.

This patch restores access to working surfaces and controls that were lost during Broadcast HUD cleanup.

The current problem:

```text
cleaning the Broadcast surface removed or hid working project infrastructure
```

That must be reversed.

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

## Recovery Rule

Do not remove working surfaces.

Do not hide working controls globally.

Do not downgrade protected 3D / Canvas / map work into flat cleanup.

Clean view must be reversible.

```text
Operate = controls and protected access visible
Show = clean broadcast view
TAB = hide/show controls
Studio / Canvas / Subway / Website / Kinetic Fish = protected access paths
```

---

## Protected Surfaces

The following surfaces are protected infrastructure:

```text
Studio / Canvas
3D Canvas
Subway Map
Website
Kinetic Fish
Broadcast HUD
Vehicle controls
Camera controls
Route controls
Studio / Canvas access button
```

Any patch that hides, removes, renames, or demotes one of these must explicitly say so and require approval.

---

## Current Damage To Recover

Restore access to:

```text
Studio / Canvas button
Subway Map access
Website access
Kinetic Fish access
Vehicle controls
Camera controls
Route controls
```

Restore visibility behavior:

```text
TAB hides controls
TAB restores controls
Show can hide controls
Operate restores controls
```

---

## Product Model

### Operate

Operate is the working control state.

Required:

```text
controls visible
vehicle controls visible
camera controls visible
route/play controls visible
Studio / Canvas access visible
Subway Map access visible if available
Website access visible if available
Kinetic Fish access visible if available
map pan/zoom works
```

### Show

Show is the clean broadcast state.

Required:

```text
controls may hide
typed overlay remains
micrographics remain
map remains visible and interactive if needed
TAB restores controls
```

### TAB

TAB is the explicit visibility toggle.

Required:

```text
controls visible -> TAB hides controls
controls hidden -> TAB restores controls
```

TAB must not break typing in input fields.

---

## Required UI Access Cluster

Add or restore a protected access cluster in Broadcast toolbar.

Suggested compact labels:

```text
Studio ↗
Canvas ↗
Subway ↗
Website ↗
Kinetic Fish ↗
```

If both Studio and Canvas point to the same destination, use:

```text
Studio / Canvas ↗
```

If a destination is not wired yet, show it as a disabled/protected item with a clear status:

```text
Subway Map — missing route
Website — missing route
Kinetic Fish — missing route
```

Do not silently omit it.

---

## Required Controls Cluster

Restore controls when `controlsVisible = true`.

Minimum visible controls:

```text
Vehicle / route controls that currently work
Camera controls that currently work
Launch / Play if currently wired
Speed if currently wired
```

Do not display broken buttons as active.

If only two buttons currently work, keep those two visible and label the missing controls as protected recovery targets.

---

## TAB Visibility Implementation

Add state in Broadcast HUD:

```ts
const [controlsVisible, setControlsVisible] = useState(true);
```

Add key handler:

```ts
useEffect(() => {
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const isTyping =
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.isContentEditable;

    if (isTyping) return;

    if (event.key === "Tab") {
      event.preventDefault();
      setControlsVisible((value) => !value);
    }
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);
```

Use project style if different.

---

## WOS Embed Rule

Do not hide `#wos-nav` globally.

Replace global hiding with controls-aware behavior.

Required model:

```text
controlsVisible = true:
  show usable WOS controls or PLAY-native controls

controlsVisible = false:
  hide controls
```

If direct iframe class toggling is not available yet, use the simplest reliable recovery:

```text
restore WOS nav/control visibility in Operate
hide it only in Show or TAB-hidden state
```

Do not hide it permanently.

---

## Studio / Canvas Recovery

Restore the lost Studio/Canvas button.

Required:

```text
visible when controlsVisible = true
opens full WOS/Studio/Canvas surface
does not replace Broadcast HUD
```

Preferred label:

```text
Studio / Canvas ↗
```

This is protected.

Do not remove again.

---

## Subway Map Recovery

Add a visible access path.

If route exists:

```text
Subway Map ↗
```

Open the existing Subway Map surface.

If route is not currently known:

```text
Subway Map — route missing
```

and add a TODO marker in code, but do not omit the item.

---

## Website Recovery

Add a visible access path.

If route exists:

```text
Website ↗
```

Open existing website surface.

If route is not currently known:

```text
Website — route missing
```

Do not omit silently.

---

## Kinetic Fish Recovery

Add a visible access path.

If route exists:

```text
Kinetic Fish ↗
```

Open existing Kinetic Fish surface.

If route is not currently known:

```text
Kinetic Fish — route missing
```

Do not omit silently.

Kinetic Fish is protected legacy/active creative surface.

---

## Camera Controls Recovery

Restore camera controls that work.

Do not restore broken camera UI.

Possible labels, only if wired:

```text
CAM FOLLOW
CAM FREE
CAM REAR
CAM DRONE
CAM RESET
```

If current working camera controls are fewer, expose only those.

Acceptance requires at least:

```text
camera control access is visible or missing status is explicit
```

---

## Vehicle Controls Recovery

Restore vehicle/traversal controls that work.

Possible labels, only if wired:

```text
FLIGHT
DRIVE
WALK
BIKE
TRANSIT
SPEED -
SPEED +
LAUNCH
```

If only two controls work, expose those two and mark the rest as protected recovery targets.

---

## Preserve Clean Broadcast Surface

Do not reintroduce:

```text
bottom dock
bottom playback/status bar
capture mode
still mode
freeze mode
16:9 frame
fake route line
signal dot
dark haze
emoji controls
weather/time telemetry flood
right Mapbox controls
broken dead buttons
```

Clean surface remains available through:

```text
Show
TAB hidden controls
```

---

## Files Likely Touched

PLAY:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/BroadcastMicrographicsGrid.tsx
src/ui/TypedTrackIndexOverlay.tsx
src/styles.css
```

Possible new file:

```text
src/ui/ProtectedSurfaceAccessCluster.tsx
```

WOS/embed:

```text
wall/index.html
wall/styles.css
wall/traversalControlDeck.js
```

Use actual project file names.

---

## Acceptance Criteria

### A. Controls visible by default

Opening Broadcast HUD shows working controls.

---

### B. TAB hides controls

Pressing TAB hides controls.

---

### C. TAB restores controls

Pressing TAB again restores controls.

---

### D. Studio / Canvas access restored

A visible Studio/Canvas button exists when controls are visible.

---

### E. Subway Map access represented

Subway Map has a visible access button or explicit missing-route status.

---

### F. Website access represented

Website has a visible access button or explicit missing-route status.

---

### G. Kinetic Fish access represented

Kinetic Fish has a visible access button or explicit missing-route status.

---

### H. Vehicle controls restored or status explicit

Working vehicle controls are visible. Missing/non-wired vehicle controls are not silently omitted.

---

### I. Camera controls restored or status explicit

Working camera controls are visible. Missing/non-wired camera controls are not silently omitted.

---

### J. Map remains interactive

Map pan/zoom works with controls visible and hidden.

---

### K. Show mode clean but reversible

Show hides controls if needed, but TAB restores them.

---

### L. No bottom dock returns

No bottom dock or playback/status bar returns.

---

### M. No dead active controls

Broken buttons are hidden or marked disabled/missing. They are not shown as if working.

---

### N. Protected surface rule exists in code comments or registry

Add a small protected surface registry/comment so future cleanup work can see:

```text
Studio / Canvas
Subway Map
Website
Kinetic Fish
Vehicle controls
Camera controls
Route controls
```

are protected access paths.

---

### O. tsc clean

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

1. Start WOS local server.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm controls are visible.

5. Confirm Studio/Canvas access is visible.

6. Confirm Subway Map access is visible or explicitly marked missing.

7. Confirm Website access is visible or explicitly marked missing.

8. Confirm Kinetic Fish access is visible or explicitly marked missing.

9. Confirm vehicle controls are visible or explicitly marked missing.

10. Confirm camera controls are visible or explicitly marked missing.

11. Press TAB.

Expected:

```text
controls hide
map and overlays remain
```

12. Press TAB again.

Expected:

```text
controls return
```

13. Drag map.

Expected:

```text
map pans
```

14. Scroll/trackpad zoom.

Expected:

```text
map zooms
```

15. Switch Show.

16. Press TAB.

Expected:

```text
controls return
```

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

The project stops losing major surfaces during cleanup.

The Broadcast HUD becomes usable again:

```text
working controls visible by default
TAB hide/show
Studio / Canvas restored
Subway / Website / Kinetic Fish represented
vehicle controls restored
camera controls restored
clean Show mode remains reversible
```

---

## Implementation Guide

- **Where:** Broadcast HUD shell/operator toolbar, WOS embed nav visibility CSS, protected access cluster.
- **What:** Restore access to protected surfaces and controls; add TAB hide/show; remove global hiding of working controls.
- **Expect:** No more lost Canvas/Studio/Subway/Website/Kinetic Fish access during Broadcast cleanup.
