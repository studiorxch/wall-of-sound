# 0624R_PLAY_BroadcastBottomBarAndRouteControllerVisualCleanupHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Interface Cleanup After Interaction Restore

0624Q restored core map interaction. The map now moves again.

Current remaining problem:

```text
The interface is usable but visually wrong.
The bottom route controller is falling off the screen.
The bottom bar is still visible.
The route controller looks like a dock / debug nav.
Emoji vehicle icons make the broadcast surface look unserious.
Map controls are still too exposed.
```

This patch cleans the Broadcast HUD interface without changing route logic.

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

Completed:

```text
0624M = removed fake route line/dot, dark haze, capture clutter
0624N = restored WOS route/map launch
0624O = hid WOS chrome in embed mode
0624P = restored minimal Routes Controller and Canvas access
0624Q = restored map pan/zoom interaction
```

Current verified behavior:

```text
WOS map visible
map pan/zoom works
Routes Controller visible
PLAY toolbar visible
Routes: Live visible
tsc -b clean
```

Current visual issue:

```text
bottom controller is too large and falls off screen
bottom playback/status bar remains visible
right Mapbox control stack remains visible
vehicle mode buttons use emoji icons
controller feels like a dock, not a broadcast interface
```

---

## Goal

Clean the Broadcast HUD interface after restoring map control.

Required result:

```text
map remains interactive
routes controller remains usable
no bottom bars falling off screen
no emoji vehicle icons
no dock-like route bar
no unnecessary map chrome
PLAY toolbar remains simple
```

---

## Non-Negotiable Scope

This is a cleanup patch only.

Do not change:

```text
route launch logic
map iframe source
Mapbox interaction handlers
playlist logic
theme logic
snapshot logic
```

Do not reintroduce:

```text
Capture Mode
Still Mode
Freeze
16:9 frame
fake route line
signal dot
dark haze
teal atmosphere blanket
```

---

## Required Cleanup

## 1. Remove the PLAY bottom playback/status bar from Broadcast HUD

The bottom bar currently shows content such as:

```text
Not playing / Robot Blips and Quips
0:00
```

In Broadcast HUD, remove or hide this bar by default.

This bar does not belong on the map show surface.

If track status is needed later, it should be redesigned as a small clean now-playing card, not a full-width dock.

Required:

```text
no full-width bottom playback/status bar in Broadcast HUD
```

---

## 2. Fix the Routes Controller layout

The WOS `#wos-nav` controller is currently too wide and low. Parts fall off the screen.

Fix:

```text
controller must stay fully inside viewport
controller must not cover the whole bottom edge
controller must not look like a system dock
controller must not block map drag outside its compact bounds
```

Preferred placement:

```text
bottom-center floating compact card
max-width: min(720px, calc(100vw - 48px))
bottom: 24px
border-radius: 14px
overflow: hidden or responsive wrap
```

If the controller needs fewer controls in embed mode, reduce it.

---

## 3. Remove emoji vehicle icons

Remove emoji icons from route mode buttons.

Current issue:

```text
🚁 / 🚗 / other emoji-style icons make the interface look cheap
```

Replace with text-only or simple monochrome labels:

```text
Flight
Drive
Walk
Bike
Transit
```

Optional simple glyphs only if already part of the icon system and non-emoji.

No emoji.

---

## 4. Reduce route controller to essential controls

In Broadcast embed mode, controller should show only essentials:

```text
Flight / Drive / Walk / Bike / Transit
Speed: − 1x +
Launch
```

Optional only if already present and not visually cluttered:

```text
Cruise
Stop
```

Remove or hide from embed mode if not essential:

```text
camera selector
lens selector
hide actor
extra toggles
altitude controls if not needed
debug labels
```

Do not remove functionality from full WOS/Canvas view. Only clean embed mode.

---

## 5. Hide Mapbox right control stack in Broadcast embed mode

The visible right-side controls:

```text
+
-
compass / rotate
extra small controls
```

should be hidden in the Broadcast embed surface if map drag/zoom works without them.

Required:

```text
right Mapbox control stack hidden in PLAY Broadcast embed
map still pan/zoom interactive
```

If needed for debugging, hide only in Show mode and keep in Operate for one more patch. Preferred: hide in Broadcast embed entirely.

---

## 6. Keep PLAY toolbar simple

PLAY toolbar remains:

```text
Operate | Show | Snapshot | Routes: Live | Canvas ↗
```

If Canvas link is too visually crowded, keep it smaller but do not remove it.

Do not add new buttons.

---

## 7. Preserve map interaction

Do not break 0624Q.

Required:

```text
drag map outside controller → map pans
scroll/trackpad → map zooms
route controller buttons click
```

---

## CSS / Layout Targets

Use actual class names in the repo.

Likely CSS targets:

```text
#wos-nav
.wos-nav
.wos-route-controller
.wos-mode-button
.wos-bottom-bar
.playback-status-bar
.broadcast-bottom-bar
.mapboxgl-ctrl-group
```

Suggested embed-mode rules:

```css
body.wos-embed #wos-nav {
  position: absolute;
  left: 50%;
  right: auto;
  bottom: 24px;
  transform: translateX(-50%);
  width: auto;
  max-width: min(720px, calc(100vw - 48px));
  pointer-events: auto;
}

body.wos-embed .mapboxgl-ctrl-group {
  display: none !important;
}

body.wos-embed .wos-bottom-status,
body.wos-embed .wos-telemetry,
body.wos-embed .wos-debug,
body.wos-embed .wos-extra-camera-controls {
  display: none !important;
}
```

Do not blanket-hide the map canvas.

---

## Files Likely Touched

PLAY:

```text
src/ui/BroadcastHUD.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/styles.css
```

WOS embed / wall:

```text
wall/index.html
wall/styles.css
wall route/controller CSS
wall route/controller component files
```

Use actual file names in the repo.

---

## Acceptance Criteria

### A. Map still works

In Broadcast HUD Operate mode:

```text
drag map → map pans
scroll/trackpad → map zooms
```

---

### B. Bottom playback/status bar removed

No full-width bottom bar showing:

```text
Not playing / playlist name / 0:00
```

inside Broadcast HUD.

---

### C. Routes Controller stays inside screen

The controller is fully visible and does not fall off the bottom or side.

---

### D. No emoji route icons

Route mode buttons do not use emoji icons.

They are text-only or clean non-emoji symbols.

---

### E. Route controller is visually reduced

Controller is compact and essential only.

No dock-like overflow.

---

### F. Right Mapbox controls hidden

Right-side `+ / - / compass / extra` stack is hidden in Broadcast embed mode.

---

### G. PLAY toolbar unchanged

Toolbar remains:

```text
Operate | Show | Snapshot | Routes: Live | Canvas ↗
```

or equivalent compact version.

---

### H. No removed clutter returns

Do not restore:

```text
fake line
fake dot
haze
capture modes
old side rails
telemetry flood
```

---

### I. tsc clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

If WOS has a lightweight check, run it too.

---

## Manual Test Checklist

1. Start WOS local route server.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm map loads.

5. Confirm toolbar:

```text
Operate | Show | Snapshot | Routes: Live
```

6. Confirm bottom playback/status bar is gone.

7. Confirm route controller is fully visible.

8. Confirm no emoji icons are visible in route mode buttons.

9. Confirm right Mapbox control stack is hidden.

10. Drag the map outside the route controller.

Expected:

```text
map pans
```

11. Scroll/trackpad zoom.

Expected:

```text
map zooms
```

12. Click route mode buttons and Launch.

Expected:

```text
controller still works
```

13. Switch Show.

Expected:

```text
cleaner map surface remains
```

14. Return Operate.

15. Confirm map still pans.

16. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

Broadcast HUD becomes usable and visually less broken:

```text
map interactive
controller compact
bottom bar gone
right controls gone
emoji icons gone
no overflow
no fake overlays
```

This is still not a full design overhaul. It is a cleanup pass to stop the current interface from looking and behaving broken.

---

## Implementation Guide

- **Where:** WOS embed-mode route controller CSS, PLAY Broadcast HUD bottom/status region, Mapbox control visibility, route mode labels/icons.
- **What:** Remove the bottom bar, compact the route controller, remove emoji icons, hide right map controls, preserve pan/zoom.
- **Expect:** The Broadcast HUD is usable without bars falling off the screen or controller chrome dominating the map.
