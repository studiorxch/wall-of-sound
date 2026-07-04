# 0624P_PLAY_RestoreMinimalRoutesControllerWithoutWOSChromeHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Restore Required Route Control + Recover Canvas App Access

This patch restores the minimum route controller that was incorrectly removed while hiding WOS chrome.

It also explicitly checks and restores the Canvas app / canvas route access that was lost during the Broadcast HUD cleanup chain.

The mistake to correct:

```text
WOS chrome controls should be hidden.
The Routes Controller should not have been removed.
The Canvas app should not have been lost.
```

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

## Current State

Completed before this patch:

```text
0624M = removed fake route line/dot, dark haze, and capture clutter
0624N = restored Launch Routes / live WOS route iframe from localhost:5500
0624O = hid WOS iframe chrome and restored clean map surface
```

Current issue:

```text
WOS route surface is visible
WOS chrome is hidden
PLAY toolbar shows Operate | Show | Snapshot | Routes: Live
but the actual Routes Controller is gone
Canvas app access has also been lost/regressed
```

---

## Product Correction

Correct split:

```text
Remove:
- WOS side rails
- right zoom stack
- telemetry
- random cockpit clutter
- duplicated map controls

Restore:
- Minimal Routes Controller
- Launch / active route control
- route selection if already available
- route play/stop if already available
- Canvas app access
```

The route controller is not disposable chrome.

It is required operating functionality.

---

## Goal

Restore route operation without bringing back WOS clutter.

Required result:

```text
clean map visible
minimal Routes Controller available
map remains draggable
WOS chrome remains hidden
PLAY toolbar remains simple
Canvas app is accessible again
tsc -b clean
```

---

## Required Behavior

## 1. Restore Minimal Routes Controller

Add a small route controller to the PLAY Broadcast HUD or restore only the minimal WOS route controller in embed mode.

Preferred:

```text
PLAY-side Routes Controller overlay
```

Reason:

```text
PLAY controls placement
PLAY can avoid blocking map drag
PLAY can keep WOS iframe clean
```

Minimum controller:

```text
Routes
Launch Route
Stop Route / Pause Route if already wired
active route label
route status
```

Optional only if already existing:

```text
route selector
speed
altitude
camera mode
```

Do not invent new route logic.

Only expose controls already supported by WOS / current route surface.

---

## 2. Keep WOS Chrome Hidden

Do not restore:

```text
left vertical route mode rail
right map control stack
full bottom WOS nav
telemetry block
speed/altitude cockpit bar unless required by controller
debug controls
```

The embedded WOS iframe should remain visually clean.

---

## 3. Route Controller Placement

Controller should not block map movement.

Preferred placement:

```text
top-left or lower-left compact card
small width
collapsible if needed
pointer-events: auto only on the controller itself
surrounding map remains draggable
```

CSS rule:

```css
.routes-controller {
  pointer-events: auto;
}

.routes-controller-layer {
  pointer-events: none;
}
```

Only the actual buttons should intercept clicks.

---

## 4. Map Drag Must Still Work

Operate mode must allow:

```text
drag/pan
zoom if supported
click map if supported
```

Confirm:

```text
iframe pointer-events: auto
decorative overlays pointer-events: none
route controller wrapper pointer-events: none
route controller buttons pointer-events: auto
```

---

## 5. Canvas App Recovery

Restore or verify the Canvas app route/tab.

The cleanup work must not remove Canvas access.

Find and restore whichever route/tab was lost:

```text
Canvas
3D Canvas
Map Canvas
Broadcast Canvas
```

Use actual existing labels and files.

Likely places to inspect:

```text
src/App.tsx
src/ui/AppShell.tsx
src/ui/StudioShell.tsx
src/ui/CanvasView.tsx
src/ui/ThreeDCanvasView.tsx
src/ui/BroadcastHUD.tsx
src/styles.css
```

Required:

```text
Canvas app/tab is reachable again
Canvas view mounts
Canvas view does not get replaced by Broadcast HUD
Canvas state is not deleted
```

If the Canvas app is intentionally separate from PLAY routes, add a visible nav link back.

---

## 6. Toolbar Remains Simple

PLAY Broadcast HUD toolbar stays:

```text
Operate | Show | Snapshot | Routes: Live
```

Do not add:

```text
Capture
Still
Freeze
16:9
Hide HUD
Exit Capture
fake route motion
fake signal dot
```

---

## 7. Snapshot Remains One-Shot

Snapshot stays as one button only.

No persistent mode.

---

## Implementation Options

### Option A — PLAY-side controller

Add a small controller component:

```text
src/ui/BroadcastRoutesController.tsx
```

Props example:

```ts
type BroadcastRoutesControllerProps = {
  routeStatus: "idle" | "launching" | "live" | "error";
  activeRouteLabel?: string;
  onLaunchRoute: () => void;
  onStopRoute?: () => void;
};
```

This is preferred if PLAY already owns route launch state.

### Option B — WOS embed mode allows only route controller

Modify WOS embed params:

```text
embed=1
chrome=0
controls=route
```

or:

```text
embed=1
hud=0
controls=0
routeController=1
```

Then WOS hides everything except the route controller.

Use this only if WOS controller wiring is hard to replicate in PLAY.

---

## Source URL Params

If using WOS embed query params, target:

```text
http://localhost:5500?embed=1&hud=0&chrome=0&controls=0&routeController=1
```

Actual params may differ. Keep the contract clear:

```text
chrome hidden
route controller visible
map interactive
```

---

## Do Not Reintroduce

Do not bring back:

```text
fake route line
signal dot
pulse ring
dark haze
teal atmosphere blanket
capture mode
still mode
freeze mode
16:9 frame
WOS full cockpit chrome
right zoom stack
left mode rail
telemetry block
```

---

## Files Likely Touched

PLAY:

```text
src/ui/BroadcastHUD.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/BroadcastRoutesController.tsx
src/logic/broadcastRouteSource.ts
src/App.tsx
src/styles.css
```

Canvas recovery likely:

```text
src/App.tsx
src/ui/AppShell.tsx
src/ui/StudioShell.tsx
src/ui/CanvasView.tsx
src/ui/ThreeDCanvasView.tsx
```

WOS if embed controller is chosen:

```text
wall/index.html
wall/styles.css
wall route/controller files
```

Use actual file names in repo.

---

## Acceptance Criteria

### A. Minimal Routes Controller is visible

Broadcast HUD shows a compact route controller.

It must include at minimum:

```text
Routes
Launch Route
active route/status
```

---

### B. WOS chrome remains hidden

The following do not return:

```text
left rail
right control stack
bottom cockpit nav
telemetry panel
debug controls
```

---

### C. Map remains movable

In Operate mode:

```text
drag/pan works
zoom works if supported
```

---

### D. Controller does not block the map

Only controller buttons intercept clicks.

The surrounding controller layer does not block map movement.

---

### E. PLAY toolbar remains simple

Toolbar remains:

```text
Operate | Show | Snapshot | Routes: Live
```

---

### F. Canvas app is restored

Canvas app/tab/view is reachable again.

It must not be hidden by Broadcast cleanup.

---

### G. No removed features return

Do not restore:

```text
Capture Mode
Still Mode
Freeze
16:9
fake line/dot
dark haze
```

---

### H. tsc clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

If WOS has a separate lightweight check, run it too.

---

## Manual Test Checklist

1. Start WOS route server.

```bash
cd /Users/studio/Projects/wall-of-sound
# run existing WOS local server command
```

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm WOS map loads.

5. Confirm WOS full chrome is still hidden.

6. Confirm minimal Routes Controller is visible.

7. Click Launch Route.

Expected:

```text
route launches or status updates using existing route system
```

8. Drag map outside the controller.

Expected:

```text
map moves
```

9. Zoom map if supported.

Expected:

```text
map zooms
```

10. Switch Show.

Expected:

```text
clean map view remains
Routes Controller either hides or becomes minimal, depending design
Return to Operate remains possible
```

11. Return Operate.

12. Confirm toolbar:

```text
Operate | Show | Snapshot | Routes: Live
```

13. Confirm Canvas app/tab/view is reachable.

14. Open Canvas.

Expected:

```text
Canvas mounts
```

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

Broadcast HUD has the correct operating model:

```text
clean WOS map iframe
minimal Routes Controller restored
map still draggable
PLAY toolbar simple
Canvas app restored
```

No fake overlays. No capture-system clutter. No WOS cockpit flood.

---

## Implementation Guide

- **Where:** Broadcast HUD route controller layer, WOS embed params or PLAY-side route controller, Canvas route/nav restoration.
- **What:** Restore a minimal required Routes Controller without restoring WOS chrome, preserve map drag, and recover Canvas app access.
- **Expect:** Operator can launch/control routes and access Canvas without bringing back the clutter that was removed.
