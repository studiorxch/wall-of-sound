# 0624V_PLAY_HideWOSNavUseCleanMapAndCanvasControlFallbackHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Clean Map Recovery + Failed WOS Nav Rollback

This patch rolls back the failed attempt to restyle the WOS `#wos-nav` inside the PLAY Broadcast HUD iframe.

The WOS nav/control deck does not belong inside the PLAY Broadcast surface. Moving it around the iframe makes the interface look broken and keeps fighting the map-first direction.

Correct model:

```text
PLAY Broadcast HUD = clean map/music broadcast surface
WOS iframe = clean interactive map only
Canvas ↗ = full WOS controls when needed
PLAY-native controls = future work only if designed properly
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
0624M = removed fake route line/dot, haze, capture clutter
0624N = restored WOS route/map launch
0624O = hid WOS chrome in embed mode
0624P = restored minimal route controller + Canvas access
0624Q = restored map pan/zoom interaction
0624R = removed bottom playback/status bar
0624S = added top-bar play, typed track index, micrographics grid
0624T = tuned typed overlay/micrographics
0624U = attempted to restore vehicle controls by repositioning WOS #wos-nav
```

Current problem:

```text
0624U does not work visually.
WOS #wos-nav still feels like transplanted cockpit chrome.
Top-centered WOS nav overlaps the PLAY interface and map typography.
The route/control bar still looks wrong even when compact.
```

---

## Product Decision

Stop trying to make WOS `#wos-nav` be the PLAY Broadcast controller.

In Broadcast embed mode:

```text
hide WOS #wos-nav completely
hide WOS telemetry
hide Mapbox right controls
keep WOS map interactive
keep PLAY top toolbar
keep PLAY typed overlay
keep PLAY micrographics
keep Canvas ↗ as full-control fallback
```

Vehicle/traversal controls will be handled later as a proper PLAY-native control, not by restyling WOS nav.

---

## Goal

Restore Broadcast HUD to a clean, usable map surface.

Required result:

```text
WOS iframe shows clean interactive map only
no WOS #wos-nav visible
no WOS telemetry visible
no Mapbox right control stack visible
map pan/zoom still works
PLAY top toolbar remains
typed overlay remains
micrographics grid remains
Canvas ↗ remains as full WOS control fallback
tsc clean
```

---

## Required Changes

## 1. Hide WOS #wos-nav in embed mode

Undo 0624U’s top-centered visible WOS nav.

In WOS embed mode, force:

```css
body.wos-embed #wos-nav,
body.wos-embed .wos-nav,
body.wos-embed .traversal-control-deck {
  display: none !important;
}
```

Use actual class names.

This is intentional.

Do not move it to top, bottom, side, compact row, floating row, or debug row.

---

## 2. Keep WOS map interactive

Do not hide or block:

```text
map container
Mapbox canvas
WOS map layers
route/map scene
```

Required:

```css
#map,
.mapboxgl-map,
.mapboxgl-canvas-container,
.mapboxgl-canvas {
  pointer-events: auto;
}
```

PLAY side must keep:

```text
iframe pointer-events: auto in Operate
decorative overlays pointer-events: none
typed overlay pointer-events: none
micrographics pointer-events: none
```

---

## 3. Keep Canvas ↗ as full-control fallback

PLAY operator bar must keep:

```text
Canvas ↗
```

Purpose:

```text
open full WOS / Canvas app with full controls
```

This is the fallback for vehicle/traversal control until PLAY has a properly designed native controller.

Do not remove Canvas access.

---

## 4. Keep PLAY top ▶ only if it works

The PLAY top triangle may remain only if it actually triggers the existing route/launch behavior.

If it does not work reliably, relabel it or disable it.

Acceptable states:

```text
▶ Launch Route
```

or:

```text
▶ opens Canvas/full controls
```

or:

```text
disabled with clear title: Route launch unavailable in clean embed
```

Do not fake functionality.

---

## 5. Hide WOS telemetry/chrome

Continue hiding:

```text
#world-telemetry-hud
#world-hud
.wt-reality
time/weather card
humidity/precip/wind row
Mapbox control groups
right-side zoom stack
debug/chrome controls
```

---

## 6. Preserve PLAY overlays

Keep:

```text
TypedTrackIndexOverlay
BroadcastMicrographicsGrid
Routes: Live status if route source is live
Operate | Show | Snapshot
Canvas ↗
```

These are the actual PLAY Broadcast surface.

---

## 7. Do not restore bottom dock

Do not restore:

```text
bottom route dock
bottom playback/status bar
WOS #wos-nav as a visible embed controller
emoji icons
full WOS cockpit UI
```

---

## Vehicle Controls Policy

For now:

```text
Broadcast HUD clean map = primary show surface
Canvas ↗ = full vehicle/traversal controls
PLAY-native compact vehicle controller = future spec only
```

Do not try to salvage WOS nav inside Broadcast.

---

## Non-Goals

Do not implement:

```text
new vehicle controller
new route engine
new route editor
new bottom dock
new WOS nav styling
capture/still/freeze/16:9 modes
fake route line
signal dot
dark haze
new smart grid
new 3D sky
new design overhaul
```

This patch is rollback and clean-map recovery only.

---

## Files Likely Touched

WOS:

```text
wall/index.html
wall/styles.css
wall/traversalControlDeck.js only if 0624U added wrappers/visible embed rules
```

PLAY:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/styles.css
```

Only touch PLAY if needed to ensure Canvas link/top ▶ behavior is correct.

---

## Acceptance Criteria

### A. WOS nav hidden

In PLAY Broadcast embed mode, the WOS `#wos-nav` / traversal control deck is not visible.

---

### B. Clean map remains

The WOS map remains visible.

---

### C. Map remains interactive

In Operate mode:

```text
drag → pan
scroll/trackpad → zoom
```

---

### D. WOS telemetry hidden

No WOS clock/weather/HUM/PRECIP/WIND telemetry is visible.

---

### E. Mapbox right controls hidden

No right-side `+ / - / compass` stack is visible.

---

### F. PLAY overlays remain

Typed track index and micrographics grid still render.

---

### G. PLAY toolbar remains simple

Toolbar remains equivalent to:

```text
Operate | Show | Snapshot | ▶ | Routes: Live | Canvas ↗
```

If ▶ does not launch routes, it must not pretend to.

---

### H. Canvas fallback works

Clicking Canvas ↗ opens full WOS/Canvas controls.

---

### I. No bottom dock returns

No bottom route dock or playback/status bar returns.

---

### J. tsc clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

If WOS has a lightweight check, run it if available.

---

## Manual Test Checklist

1. Start WOS local route server.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm WOS map loads.

5. Confirm WOS `#wos-nav` is gone.

6. Confirm right Mapbox controls are gone.

7. Confirm WOS telemetry is gone.

8. Confirm typed track overlay and micrographics still show.

9. Drag map.

Expected:

```text
map pans
```

10. Scroll/trackpad zoom.

Expected:

```text
map zooms
```

11. Click Canvas ↗.

Expected:

```text
full WOS/Canvas opens with full controls
```

12. Test top ▶.

Expected:

```text
works, opens fallback, or is disabled honestly
```

13. Confirm no bottom dock returns.

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

The Broadcast HUD stops showing broken transplanted WOS controls.

The surface becomes:

```text
clean interactive WOS map
PLAY top controls
typed music index
micrographics status
Canvas fallback for full controls
```

This restores stability before any future native PLAY vehicle-control design.

---

## Implementation Guide

- **Where:** WOS embed CSS/inline style, PLAY Broadcast toolbar only if needed.
- **What:** Hide WOS `#wos-nav` completely in embed mode, keep the map interactive, keep Canvas ↗ as the full-control fallback, and preserve PLAY overlays.
- **Expect:** Broadcast HUD returns to a clean map-first surface without the failed top-centered WOS nav.
