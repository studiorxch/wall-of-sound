# 0624O_PLAY_BroadcastRouteSurfaceControlsRemovalAndMapDragHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Remove WOS In-Iframe Controls + Restore Map Drag

0624N correctly loads the WOS route surface, but the loaded iframe still contains WOS route UI controls that block or interfere with map operation.

The user wants those controls gone.

Current visible problem:

```text
left vertical route mode strip is visible
right map control stack is visible
map is loaded but still cannot be controlled cleanly
```

Required result:

```text
Broadcast HUD shows the map/route surface
no WOS side control stacks
map drag/pan/zoom works in Operate
PLAY toolbar remains Operate | Show | Snapshot
Routes: Live remains visible
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

## Problem

The Broadcast HUD now launches:

```text
http://localhost:5500
```

and shows the WOS route/map surface.

But the WOS surface includes embedded controls:

```text
left route/mode rail
right zoom/control stack
Flight/Drive/Walk/Bike/Transit UI
speed/altitude controls
Launch button
other route cockpit controls
```

These are not wanted inside PLAY Broadcast HUD right now.

They make the screen look cluttered and may be intercepting clicks that should move the map.

---

## Product Decision

PLAY Broadcast HUD should use WOS as a clean map surface.

It should not expose WOS cockpit controls inside the iframe by default.

Correct model:

```text
PLAY controls = Operate | Show | Snapshot
WOS iframe = clean movable map/route surface
OBS = record/stream
```

---

## Required Behavior

### 1. Remove WOS iframe controls from Broadcast view

When WOS is loaded inside PLAY Broadcast HUD, it should use a clean embed mode.

Preferred URL pattern:

```text
http://localhost:5500?embed=1&hud=0&controls=0
```

or whatever the WOS app can support.

If WOS already has query params for hiding UI, use them.

If WOS does not support this yet, add support in WOS route surface.

---

### 2. Add WOS embed/clean mode if missing

On the WOS side, detect query params such as:

```text
embed=1
controls=0
hud=0
chrome=0
```

When active, hide:

```text
left mode rail
right map control stack
speed/altitude controls
Launch button
bottom route controls
debug/dev controls
extra cockpit UI
```

Do not hide the actual map canvas.

---

### 3. Preserve map interaction

Clean embed mode must still allow:

```text
drag / pan
scroll zoom or trackpad zoom if Mapbox supports it
map click if needed
```

Do not solve this by putting a transparent overlay over the map.

Required:

```text
map canvas receives pointer events
PLAY decorative overlays pointer-events: none
iframe pointer-events: auto
```

---

### 4. Keep PLAY Broadcast controls simple

PLAY Broadcast HUD toolbar remains:

```text
Operate | Show | Snapshot
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

### 5. Routes: Live remains

Keep the green route status pill:

```text
Routes: Live
```

This is useful.

---

## Implementation Strategy

### A. Update PLAY route URL resolver

Where PLAY resolves the WOS route URL, append embed-clean params.

Example:

```ts
const cleanRouteUrl = appendQueryParams(baseRouteUrl, {
  embed: "1",
  hud: "0",
  controls: "0",
  chrome: "0",
});
```

Avoid duplicating query params.

---

### B. Add WOS clean embed CSS hook

In WOS app:

```ts
const params = new URLSearchParams(window.location.search);
const isEmbed = params.get("embed") === "1";
const hideControls =
  params.get("controls") === "0" ||
  params.get("hud") === "0" ||
  params.get("chrome") === "0";
```

Apply body/root class:

```text
wos-embed
wos-controls-hidden
```

---

### C. Hide WOS control chrome in embed mode

Use actual class names, but target these categories:

```css
.wos-controls-hidden .route-mode-rail,
.wos-controls-hidden .map-control-stack,
.wos-controls-hidden .speed-controls,
.wos-controls-hidden .altitude-controls,
.wos-controls-hidden .launch-controls,
.wos-controls-hidden .bottom-route-controls,
.wos-controls-hidden .debug-controls {
  display: none !important;
}
```

Do not hide:

```text
map container
Mapbox canvas
route/map layer
```

---

### D. If right-side controls are Mapbox native controls

If the right-side stack is Mapbox controls, remove or hide them for embed mode:

```ts
if (!isEmbed) {
  map.addControl(...)
}
```

or CSS-hide only in embed mode.

---

### E. Confirm pointer-events

In PLAY CSS:

```css
.broadcast-route-iframe,
.hud-map-iframe {
  pointer-events: auto;
}

.hud-atmosphere-wash,
.hud-mask,
.hud-show-mask {
  pointer-events: none;
}
```

In WOS CSS, make sure the map canvas is not blocked:

```css
.mapboxgl-canvas,
.mapboxgl-canvas-container,
#map {
  pointer-events: auto;
}
```

---

## Files Likely Touched

PLAY:

```text
src/ui/BroadcastHUD.tsx
src/logic/broadcastRouteSource.ts
src/styles.css
```

WOS route/map app:

```text
wall/index.html or wall route entry
wall/src route surface files if applicable
wall/styles.css or route CSS
```

Use actual WOS file names in the repo.

---

## Non-Goals

Do not implement:

```text
new visual overlays
fake route line
fake dot
new capture mode
new show modes
new sky system
new route editor
new motion system
theme gallery
OBS integration
video capture
```

This is only:

```text
hide WOS iframe controls
restore map drag
keep PLAY toolbar simple
```

---

## Acceptance Criteria

### A. WOS side controls are gone in Broadcast

The embedded WOS iframe no longer shows:

```text
left route/mode rail
right map control stack
speed/altitude controls
Launch button
bottom cockpit controls
```

---

### B. Map remains visible

The map still loads from WOS route surface.

---

### C. Map can move

In PLAY Broadcast Operate mode:

```text
drag/pan works
zoom works if enabled by WOS/Mapbox
```

---

### D. PLAY toolbar stays simple

Only:

```text
Operate | Show | Snapshot
```

---

### E. Routes status remains

```text
Routes: Live
```

still appears when WOS route surface is loaded.

---

### F. No fake overlay returns

Do not reintroduce:

```text
fake route line
signal dot
haze blanket
motion overlay
```

---

### G. tsc clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

If WOS has a separate build/test command, run the relevant lightweight check if available.

---

## Manual Test Checklist

1. Start WOS local route server.

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

4. Confirm route URL includes clean embed params or WOS embed mode is active.

5. Confirm WOS iframe controls are gone.

6. Confirm map is visible.

7. In Operate mode, drag the map.

Expected:

```text
map pans
```

8. Zoom the map.

Expected:

```text
map zooms
```

9. Switch Show.

Expected:

```text
clean view remains
```

10. Click Snapshot.

Expected:

```text
one-shot only
```

11. Confirm no line/dot/haze returns.

12. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

PLAY Broadcast HUD becomes usable:

```text
WOS map loaded
WOS cockpit controls hidden
map can move
PLAY toolbar stays simple
no fake overlays
```

---

## Implementation Guide

- **Where:** PLAY route URL resolver/Broadcast HUD iframe, WOS route surface query-param handling, WOS control CSS, PLAY pointer-events CSS.
- **What:** Load WOS in clean embed mode, hide WOS control rails/stacks inside the iframe, preserve map pointer interaction.
- **Expect:** The Broadcast HUD shows a clean movable map instead of an embedded WOS cockpit.
