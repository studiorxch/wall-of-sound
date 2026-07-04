# 0624M_PLAY_RemoveMapMotionOverlayRestoreDirectMapControlHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Remove Bad Overlay + Restore Map Control

This patch removes the unwanted line/dot overlay from the Broadcast HUD and restores direct map interaction.

The user did not ask for a route line, signal dot, fake vehicle path, capture mode, freeze mode, haze wash, or extra show-surface gimmicks.

The requested target is simple:

```text
working map
clean controls
snapshot button
no fake route line
no fake dot
no dark haze
no blocked map movement
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

## Product Correction

Broadcast HUD must return to a map-first model:

```text
Operate = control the map
Show = clean OBS-facing view
Snapshot = one-shot snapshot helper
```

Nothing else.

---

## Remove Immediately

Remove the fake map decoration layer:

```text
BroadcastMapMotionOverlay
route line
signal dot
pulse ring
fake movement layer
decorative SVG route
any "motion overlay" that sits above the map
```

The line/dot is not useful right now. It makes the map look worse and appears to block or confuse map interaction.

If the component is imported but no longer used, remove the import.

If CSS remains, remove or disable:

```text
.broadcast-map-motion-overlay
.broadcast-route-line
.broadcast-signal-dot
.broadcast-signal-pulse
.motion-route
.motion-dot
```

Use actual project class names.

---

## Restore Map Movement

The map must be draggable/pannable/zoomable in Operate mode.

Required behavior:

```text
Operate mode = iframe/map receives pointer events
decorative overlays = pointer-events: none
operator buttons = pointer-events: auto
no full-screen invisible layer blocks the map
```

Audit all parent containers and overlays:

```text
hud-shell
hud-map-stage
hud-map-frame
hud-map-iframe
hud-sky-overlay
hud-atmosphere-overlay
hud-mask
operator toolbar
snapshot-clean state
```

Fix any layer that blocks dragging.

---

## CSS Pointer Rules

Required:

```css
.hud-shell--operate .hud-map-iframe,
.hud-shell--edit .hud-map-iframe {
  pointer-events: auto;
}

.hud-sky-overlay,
.hud-atmosphere-overlay,
.hud-mask,
.hud-vignette,
.hud-haze-overlay {
  pointer-events: none;
}

.broadcast-operator-toolbar,
.broadcast-operator-toolbar * {
  pointer-events: auto;
}
```

Use actual class names in code.

No decorative layer should ever capture pointer events.

---

## Remove Dark Haze

Remove or heavily reduce any full-screen darkening overlay.

Remove:

```text
dark teal haze blanket
heavy vignette
multiply blend overlay
low-opacity black wash
brightness reduction filter
```

Preferred default:

```css
.hud-atmosphere-overlay {
  opacity: 0.04;
  mix-blend-mode: screen;
}

.hud-haze-overlay,
.hud-vignette {
  display: none;
}
```

If the map is too dark, brighten the map stage lightly:

```css
.hud-map-stage {
  filter: brightness(1.06) contrast(1.06) saturate(1.08);
}
```

Do not wash out the map.

---

## Toolbar

Toolbar should be only:

```text
Operate | Show | Snapshot
```

Remove from Broadcast HUD:

```text
Capture
Still
Hide HUD
Freeze
16:9
Exit Capture
Theme gallery
fake route/motion controls
```

---

## Snapshot Button

Keep only one Snapshot button.

Snapshot should not create a mode.

Behavior:

```text
click Snapshot
briefly clean nonessential UI if needed
trigger best available snapshot helper or show quick manual snapshot prompt
restore automatically
```

No persistent capture state.

No video system.

OBS remains responsible for recording and streaming.

---

## Show Mode

Show mode should be clean but not destructive.

Required:

```text
map remains visible
no fake route line/dot
no dark haze blanket
Return to Operate is available
no overlay blocks controls
```

Show mode is for OBS viewing, not internal capture logic.

---

## Operate Mode

Operate mode is the default recovery/control state.

Required:

```text
map can move
toolbar visible
operator can pan/zoom/click map
controls are responsive
no fake route/dot overlay
```

---

## Atmosphere / Sky Rule

Until real sky is implemented, do not overstate the feature.

Current layer is:

```text
light atmosphere overlay
```

Not:

```text
Three.js sky
Mapbox sky layer
procedural sky
3D skybox
```

Default atmosphere should be subtle or off.

A dark haze is not acceptable as the default.

---

## Non-Goals

Do not implement:

```text
video capture
capture mode
still mode
freeze mode
16:9 frame mode
fake route animation
fake signal dot
theme gallery
new smart grid
new 3D sky
new route editor
new metadata-reactive layer
new playlist logic
Node/Vite environment work
```

This patch is removal and repair only.

---

## Implementation Targets

Likely files:

```text
src/ui/BroadcastHUD.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/BroadcastMapMotionOverlay.tsx
src/ui/BroadcastShowModeOverlay.tsx
src/styles.css
```

Delete or stop using:

```text
src/ui/BroadcastMapMotionOverlay.tsx
```

if it only exists for the unwanted line/dot.

If the file is retained for future use, it must not render by default and must not be imported into Broadcast HUD.

---

## Acceptance Criteria

### A. Line and dot removed

Broadcast HUD no longer displays:

```text
route line
signal dot
pulse ring
fake motion path
```

---

### B. Map can move

In Operate mode, user can pan/zoom/move the map.

---

### C. No overlay blocks map interaction

Decorative overlays use:

```text
pointer-events: none
```

and do not intercept map drag/click events.

---

### D. Toolbar is simplified

Toolbar shows only:

```text
Operate
Show
Snapshot
```

---

### E. Dark haze removed

The map is brighter and more readable.

No full-screen haze/vignette darkens the map by default.

---

### F. Show mode remains usable

Show mode is clean and OBS-friendly, with a clear way back to Operate.

---

### G. Snapshot remains one-shot

Snapshot does not create a persistent mode.

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

---

## Manual Test Checklist

1. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

2. Open Broadcast HUD.

3. Confirm no route line is visible.

4. Confirm no signal dot is visible.

5. Switch to Operate.

6. Drag the map.

Expected:

```text
map moves
```

7. Zoom the map.

Expected:

```text
map zooms
```

8. Confirm toolbar is only:

```text
Operate | Show | Snapshot
```

9. Switch to Show.

10. Confirm Show view is cleaner but not blocked.

11. Return to Operate.

12. Click Snapshot.

13. Confirm Snapshot does not create a new mode.

14. Confirm no dark haze blanket is visible.

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

The Broadcast HUD stops fighting the operator.

The map becomes the focus again:

```text
no fake line
no fake dot
no dark haze
no blocked panning
no extra capture system
```

The screen returns to a simple operating model:

```text
Operate = use the map
Show = OBS-facing view
Snapshot = one quick helper
```

---

## Implementation Guide

- **Where:** Broadcast HUD render tree, map overlay components, pointer-events CSS, toolbar controls.
- **What:** Remove the fake route/dot overlay, restore map pointer interaction, remove dark haze, keep only Operate/Show/Snapshot.
- **Expect:** The Broadcast HUD becomes usable again, with the map as the main surface.
