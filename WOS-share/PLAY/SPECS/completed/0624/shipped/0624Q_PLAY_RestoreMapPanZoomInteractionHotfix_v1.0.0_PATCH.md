# 0624Q_PLAY_RestoreMapPanZoomInteractionHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Restore Actual Map Interaction

This patch fixes the current active blocker:

```text
The WOS map is visible inside PLAY Broadcast HUD.
The Routes Controller is visible.
The PLAY toolbar is visible.
But the map still cannot be dragged/panned/zoomed.
```

Do not move to design overhaul until this works.

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

Recently completed:

```text
0624M = removed fake route line/dot, dark haze, capture clutter
0624N = restored WOS route/map launch into Broadcast HUD
0624O = hid WOS chrome in embed mode
0624P = restored minimal Routes Controller and Canvas access
```

Current visible state:

```text
WOS map visible
PLAY toolbar: Operate | Show | Snapshot | Routes: Live
Routes Controller visible bottom-center
WOS chrome mostly hidden
tsc -b clean
```

Current failure:

```text
map cannot be controlled / dragged / panned / zoomed
```

---

## Goal

Restore direct map interaction.

Required result:

```text
click-drag map → map pans
scroll/trackpad zoom → map zooms if enabled
Routes Controller remains usable
WOS chrome remains hidden
PLAY toolbar remains simple
no fake overlays return
```

---

## Non-Negotiable Scope

This patch is only for interaction repair.

Do not add:

```text
design overhaul
new overlay
new theme system
capture mode
still mode
freeze mode
16:9 frame
fake route line
signal dot
dark haze
new smart grid
new route editor
new 3D sky
```

---

## Likely Causes To Audit

Check all of these in order.

### 1. PLAY iframe pointer-events

The iframe may not be receiving pointer events.

Required in Operate mode:

```css
.broadcast-route-iframe,
.hud-map-iframe,
.hud-shell--operate iframe {
  pointer-events: auto;
}
```

Use actual class names.

### 2. PLAY overlay blocking iframe

Decorative overlay may still sit above iframe.

Audit:

```text
hud-atmosphere-wash
hud-mask
hud-show-mask
hud-sky-overlay
hud-map-stage overlay layers
snapshot-clean layer
operator overlay wrapper
Routes status pill wrapper
```

Required:

```css
decorative overlay wrappers {
  pointer-events: none;
}
```

Only actual buttons should be pointer-active.

### 3. Routes Controller layer blocking the map

The controller layer may span the whole iframe and intercept drag.

Required structure:

```css
.routes-controller-layer {
  pointer-events: none;
}

.routes-controller-card,
.routes-controller-card * {
  pointer-events: auto;
}
```

If `#wos-nav` sits inside the iframe and spans full width/height, update WOS CSS similarly.

### 4. WOS embed CSS disabled Mapbox interaction

0624O/0624P embed CSS may have hidden controls but accidentally affected map canvas.

Check WOS CSS for:

```css
pointer-events: none;
touch-action: none;
user-select: none;
```

on any parent of:

```text
#map
.mapboxgl-map
.mapboxgl-canvas-container
.mapboxgl-canvas
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

Do not blanket-disable interaction on the map root.

### 5. Mapbox handlers disabled

Check WOS map initialization.

Ensure these are enabled in embed mode:

```ts
map.dragPan.enable();
map.scrollZoom.enable();
map.dragRotate.enable(); // optional
map.touchZoomRotate.enable();
map.keyboard.enable(); // optional
```

At minimum:

```ts
map.dragPan.enable();
map.scrollZoom.enable();
```

If scroll zoom is intentionally off in WOS normally, enable it only in PLAY embed/Operate if desired.

### 6. iframe sandbox restrictions

If the iframe uses a `sandbox` attribute, verify it does not block pointer/mouse interaction.

Likely not the issue, but inspect:

```tsx
<iframe sandbox="...">
```

If sandbox exists, make sure it supports scripts and same-origin as needed.

### 7. z-index conflict

Confirm that no full-stage absolute element sits above iframe.

Audit with devtools:

```text
elementFromPoint at map center
```

Expected:

```text
iframe or map canvas receives pointer path
```

If not, remove/fix the top element.

---

## Required Fix Strategy

### A. Add a temporary interaction debug aid

In development only or behind a small console log, add a quick pointer target check.

Example:

```ts
console.log("Broadcast map stage pointer target", document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2));
```

Do not leave noisy logs in production if avoidable.

Better:

```text
manual devtools check is acceptable
```

### B. Fix PLAY wrapper first

Ensure PLAY does not block iframe.

### C. Fix WOS embed CSS second

Ensure WOS map root/canvas remains interactive.

### D. Fix Mapbox handler enabling third

Ensure Mapbox handlers are enabled after map load.

### E. Fix controller layer last

Make controller only catch clicks on its actual buttons.

---

## Correct Interaction Contract

### PLAY shell

```text
toolbar buttons = clickable
route status pill = clickable only if interactive
decorative overlays = not clickable
iframe = clickable/draggable in Operate
```

### WOS iframe

```text
map canvas = draggable
route controller buttons = clickable
hidden chrome = hidden and noninteractive
```

---

## Toolbar Must Remain

PLAY toolbar remains:

```text
Operate | Show | Snapshot | Routes: Live
```

No added buttons.

---

## Routes Controller Must Remain

Keep minimal route controller visible and usable:

```text
Flight / Drive / Walk / Bike / Transit if already restored
Speed if already part of controller
Launch if already part of controller
```

But the controller must not block the rest of the map.

---

## Show Mode

Show mode should not be the target for interaction if the design says Show is clean/audience-facing.

But it must still allow returning to Operate.

Required:

```text
Operate = interaction must work
Show = clean view, not the primary map-editing mode
```

If map interaction is allowed in Show too, fine, but not required.

---

## Acceptance Criteria

### A. Map drag works

In Operate mode:

```text
click and drag map
```

Expected:

```text
map pans
```

### B. Map zoom works

In Operate mode:

```text
trackpad/scroll over map
```

Expected:

```text
map zooms
```

if WOS/Mapbox supports scroll zoom.

### C. Routes Controller still works

Clicking controller buttons works.

### D. Controller does not block map

Dragging outside the controller moves map.

### E. WOS chrome remains hidden

Do not restore:

```text
left rail
right zoom stack
telemetry panel
full cockpit chrome
```

### F. PLAY toolbar remains simple

Keep:

```text
Operate | Show | Snapshot | Routes: Live
```

### G. No removed clutter returns

Do not restore:

```text
fake line
fake dot
dark haze
capture/still/freeze/16:9 modes
```

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

If WOS has a lightweight test/build check, run that too.

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

4. Confirm toolbar:

```text
Operate | Show | Snapshot | Routes: Live
```

5. Confirm map visible.

6. Click Operate.

7. Drag the center of the map, away from the Routes Controller.

Expected:

```text
map pans
```

8. Trackpad/scroll over map.

Expected:

```text
map zooms
```

9. Click route controller buttons.

Expected:

```text
buttons respond
```

10. Drag map near but outside controller.

Expected:

```text
map pans
```

11. Switch Show.

Expected:

```text
clean view remains
Return to Operate available
```

12. Return Operate.

13. Confirm map still pans.

14. Confirm no fake line/dot/haze/capture controls returned.

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

Broadcast HUD finally becomes operable:

```text
map visible
map drag/pan works
map zoom works
routes controller works
PLAY toolbar stays simple
no clutter returns
```

No design overhaul until this is verified.

---

## Implementation Guide

- **Where:** PLAY iframe wrapper/CSS, WOS embed CSS, Mapbox interaction handlers, Routes Controller layer.
- **What:** Ensure the real WOS map canvas receives pointer and scroll events in Operate mode while only actual controller buttons intercept clicks.
- **Expect:** The operator can move the map directly inside Broadcast HUD.
