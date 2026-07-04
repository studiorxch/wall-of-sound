# 0624Y_PLAY_RestorePersistentControlsAndRecoverMissingSurfaceRoutesHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Regression Recovery

0624X still fails the real requirement.

The current state is not acceptable:

```text
controls appear briefly, then disappear
Subway / Website / Kinetic Fish are shown as missing even though they should not be silently downgraded
VEH / CAM are still missing instead of recovered
TAB behavior is treating the system like hidden is the safe/default state
```

This patch fixes the regression directly.

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

## Required Behavior

Controls must stay visible until the user explicitly hides them.

```text
Open Broadcast HUD → controls visible
Reload Broadcast HUD → controls visible
Switch to Operate → controls visible
Press TAB once → controls hidden
Press TAB again → controls visible
Switch to Show → controls may hide
Switch back to Operate → controls visible
```

Do not persist a hidden control state across reloads unless explicitly requested later.

Do not auto-hide controls after a timer.

Do not inherit previous hidden state from localStorage/sessionStorage.

---

## Root Cause To Check

The observed behavior:

```text
controls briefly available for one second before disappearing
```

likely means one of these is happening:

```text
controlsVisible is initialized true, then an effect changes it to false
Show mode effect forces hidden
localStorage/sessionStorage restores hidden state
route/live effect hides controls after mount
CSS class defaults to hidden after hydration
WOS embed CSS hides nav globally after iframe reload
```

This patch must remove that behavior.

---

## Hard Rule

```text
Only TAB or explicit Show mode can hide controls.
Nothing else.
```

---

## Required State Model

Use a simple state model:

```ts
const [controlsVisible, setControlsVisible] = useState(true);
```

Do not initialize from storage.

Do not write controlsVisible to storage.

Do not auto-collapse.

Do not infer hidden state from route status.

---

## Mode Behavior

### Operate

Operate always restores controls.

```ts
setMode("operate");
setControlsVisible(true);
```

### Show

Show may hide controls.

```ts
setMode("show");
setControlsVisible(false);
```

### Snapshot

Snapshot must not permanently hide controls.

If Snapshot temporarily hides controls for image capture, it must restore previous state immediately after the snapshot.

---

## TAB Behavior

TAB toggles controls.

Required:

```text
controlsVisible true + TAB → false
controlsVisible false + TAB → true
```

TAB must not be blocked by focused map/iframe behavior.

If the iframe captures TAB, add the handler at the parent document level and also ensure the Broadcast HUD container can receive focus.

Implementation hint:

```ts
window.addEventListener("keydown", onKeyDown, { capture: true });
```

Do not hijack TAB inside input/textarea/contenteditable.

---

## Restore Real Surface Routes

Do not leave protected surfaces as passive missing labels if the route can be recovered.

Search the app/router/nav config for existing routes or known local URLs.

Required access items:

```text
Studio / Canvas ↗
Subway Map ↗
Website ↗
Kinetic Fish ↗
```

If exact internal routes are unknown, wire to best-known safe local/project paths instead of leaving passive text.

Suggested fallback behavior:

```text
Studio / Canvas ↗ → http://localhost:5500
Subway Map ↗ → existing subway/map route if present, otherwise disabled with TODO
Website ↗ → existing website/local preview route if present, otherwise disabled with TODO
Kinetic Fish ↗ → existing kinetic fish route if present, otherwise disabled with TODO
```

But first search for actual route names/files.

Do not mark as missing without searching the repo.

---

## Restore VEH / CAM Controls

`VEH —` and `CAM —` are not sufficient as a final recovery.

Search existing WOS controls and PLAY state for currently working vehicle/camera functions.

Restore whatever works.

Minimum requirement:

```text
If WOS #wos-nav has working vehicle controls, show it when controlsVisible = true.
If WOS camera controls exist and work, show them when controlsVisible = true.
If only two controls work, keep those two visible as working controls.
```

Do not show dead active controls.

But do not leave VEH/CAM as missing if the old WOS controls can be restored.

---

## WOS Nav Visibility

Undo any global `#wos-nav { display: none !important; }` that prevents controls from returning.

Use controls-aware classes.

Required:

```css
body.wos-embed.controls-visible #wos-nav {
  display: flex !important;
}

body.wos-embed.controls-hidden #wos-nav {
  display: none !important;
}
```

If PLAY cannot toggle classes inside iframe yet, use a reliable alternate mechanism:

```text
Option A: postMessage from PLAY to WOS to set controls-visible / controls-hidden
Option B: iframe query param controls=1 or controls=0 with reload only on explicit toggle
Option C: keep WOS controls visible in Operate until a native bridge exists
```

Do not keep global hidden CSS.

---

## PLAY Toolbar Visibility

When `controlsVisible = true`, show the full operator/access layer:

```text
▶
Operate
Show
Snapshot
Routes: Live
Studio / Canvas ↗
Subway Map ↗ or real disabled route status
Website ↗ or real disabled route status
Kinetic Fish ↗ or real disabled route status
VEH controls if wired
CAM controls if wired
```

When `controlsVisible = false`, hide the operator/access layer and show only a tiny hint:

```text
TAB = controls
```

The hint must not block the map.

---

## Remove False Positive “Done” State

Do not declare recovery done if protected surfaces are only shown as text labels with dashes.

A protected surface counts as recovered only if:

```text
it opens
or it is explicitly marked missing after route search
or a TODO identifies the exact missing route/file
```

VEH/CAM count as recovered only if:

```text
working controls are visible
or exact blocking reason is listed after search
```

---

## Protected Surface Registry

Keep the registry, but make it useful.

Suggested object:

```ts
const PROTECTED_SURFACES = [
  { id: "studio-canvas", label: "Studio / Canvas", status: "live", href: "..." },
  { id: "subway-map", label: "Subway Map", status: "live" | "missing-route", href: "..." },
  { id: "website", label: "Website", status: "live" | "missing-route", href: "..." },
  { id: "kinetic-fish", label: "Kinetic Fish", status: "live" | "missing-route", href: "..." },
];
```

A dash is not enough.

---

## Do Not Reintroduce

Do not bring back:

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
dead active buttons
```

---

## Files Likely Touched

PLAY:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/styles.css
```

Possible new files:

```text
src/ui/ProtectedSurfaceAccessCluster.tsx
src/ui/BroadcastControlsVisibility.tsx
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

### A. Controls persist by default

Open Broadcast HUD.

Expected:

```text
controls remain visible
they do not disappear after one second
```

---

### B. No hidden-state persistence

Reload the page.

Expected:

```text
controls visible again
```

---

### C. Operate restores controls

Click Operate.

Expected:

```text
controls visible
```

---

### D. TAB hides controls

Press TAB.

Expected:

```text
controls hide
TAB hint appears
```

---

### E. TAB restores controls

Press TAB again.

Expected:

```text
controls visible again
```

---

### F. Show can hide controls but not trap user

Click Show.

Expected:

```text
controls may hide
TAB restores them
Operate restores them
```

---

### G. Studio / Canvas opens

Click Studio / Canvas.

Expected:

```text
full Studio / Canvas / WOS control surface opens
```

---

### H. Subway Map route searched and resolved

Subway Map is either:

```text
live and opens
```

or:

```text
disabled with explicit missing route reason after repo search
```

A bare dash is not acceptable.

---

### I. Website route searched and resolved

Website is either live or disabled with explicit missing route reason after repo search.

A bare dash is not acceptable.

---

### J. Kinetic Fish route searched and resolved

Kinetic Fish is either live or disabled with explicit missing route reason after repo search.

A bare dash is not acceptable.

---

### K. VEH controls searched and restored

Vehicle controls are either working/visible or disabled with explicit blocking reason after repo search.

A bare `VEH —` is not acceptable.

---

### L. CAM controls searched and restored

Camera controls are either working/visible or disabled with explicit blocking reason after repo search.

A bare `CAM —` is not acceptable.

---

### M. Map remains interactive

Map pan/zoom works with controls visible and hidden.

---

### N. Clean Show remains available

Show/TAB hidden state gives clean map surface without deleting controls.

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

4. Wait 5 seconds.

Expected:

```text
controls remain visible
```

5. Reload page.

Expected:

```text
controls visible after reload
```

6. Press TAB.

Expected:

```text
controls hide
```

7. Press TAB again.

Expected:

```text
controls return
```

8. Click Show.

Expected:

```text
clean surface
```

9. Press TAB.

Expected:

```text
controls return
```

10. Click Operate.

Expected:

```text
controls visible
```

11. Click Studio / Canvas.

Expected:

```text
opens full control surface
```

12. Check Subway / Website / Kinetic Fish.

Expected:

```text
each opens or gives explicit missing route reason
```

13. Check VEH / CAM.

Expected:

```text
working controls are visible or exact blocker is shown
```

14. Drag map.

Expected:

```text
map pans
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

The Broadcast HUD stops losing controls after mount.

Controls are present and stay present unless the user hides them with TAB or enters Show.

Protected surfaces are not reduced to vague dashes.

The system becomes operable again before any further visual cleanup.

---

## Implementation Guide

- **Where:** Broadcast HUD state, access cluster, WOS embed CSS/nav visibility.
- **What:** Remove auto-hide and hidden-state persistence, restore controls by default, make TAB the only hide/show toggle, recover real routes for protected surfaces, and restore vehicle/camera controls or report exact blockers.
- **Expect:** Controls stop disappearing, Studio/Canvas remains accessible, and protected surfaces are no longer silently downgraded.
