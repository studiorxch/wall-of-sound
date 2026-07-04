# 0624K_PLAY_BroadcastControlFreedomAndSkyClarificationHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Operator Control Hotfix

This patch fixes the immediate Broadcast HUD control problem.

The operator must be able to operate the map/show surface without being trapped by masks, overlays, iframe pointer-blocking, or capture/show-mode UI states.

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

0624H–J cleaned the Broadcast HUD visually, but the operator still needs freedom to control the screen.

Current issue:

```text
Broadcast HUD looks better
but controls still feel blocked, hidden, or hard to operate
```

The show surface must support two needs:

```text
operator can control it
audience can view it cleanly
```

These should not conflict.

---

## Sky Clarification

The current 0624H sky/atmosphere implementation is **not** the same as the Three.js sky system previously discussed.

Current sky is likely:

```text
CSS overlay / atmosphere wash / haze / vignette
```

It is useful and lightweight for show styling, but it is not:

```text
Three.js sky dome
procedural sun position
physically based atmosphere
Mapbox sky layer
3D world skybox
```

This patch should label it accurately as:

```text
Atmosphere Overlay
```

not as a real 3D sky.

A future patch may add:

```text
Three.js Sky / Mapbox sky / procedural dome
```

but not in this control hotfix.

---

## Goal

Free the Broadcast HUD controls.

Required result:

```text
Edit Mode = fully operable
Show Mode = clean but still recoverable
Capture Mode = clean output but never traps operator
```

---

## Critical Rules

### 1. Edit Mode must not block controls

In Edit Mode:

```text
iframe/map pointer events should work
operator toolbar should work
mode buttons should work
theme controls should work
playback controls should work
route/motion controls should work
```

No mask/overlay should intercept clicks unless it is a real control.

### 2. Show Mode can mask visuals but not trap controls

Show Mode can hide visual clutter, but operator controls must remain usable.

### 3. Capture Mode can hide controls but must recover

Capture Mode must always have:

```text
Esc to exit
floating Exit Capture / Show Controls tab
```

---

## Required Fixes

## A. Audit pointer-events

Review CSS around Broadcast HUD masks and overlays.

Likely files:

```text
src/styles.css
src/ui/BroadcastHUD.tsx
src/ui/BroadcastShowModeOverlay.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/BroadcastMapMotionOverlay.tsx
```

Find anything like:

```css
pointer-events: none;
pointer-events: auto;
```

Ensure:

```text
decorative overlays = pointer-events: none
actual buttons = pointer-events: auto
iframe = pointer-events: auto in Edit Mode
iframe = optional pointer-events none only in Capture Mode if needed
```

Do not globally disable the iframe in Edit Mode.

---

## B. Add explicit interaction classes

Use mode-specific classes:

```css
.hud-shell--edit
.hud-shell--show
.hud-shell--capture
```

Expected behavior:

```css
.hud-shell--edit .hud-map-iframe {
  pointer-events: auto;
}

.hud-shell--edit .hud-mask,
.hud-shell--edit .hud-sky-overlay,
.hud-shell--edit .broadcast-motion-overlay {
  pointer-events: none;
}

.hud-shell--show .hud-mask,
.hud-shell--show .hud-sky-overlay,
.hud-shell--show .broadcast-motion-overlay {
  pointer-events: none;
}

.hud-shell--capture .hud-mask,
.hud-shell--capture .hud-sky-overlay,
.hud-shell--capture .broadcast-motion-overlay {
  pointer-events: none;
}
```

Use actual class names in the codebase.

---

## C. Separate decorative overlays from controls

Decorative overlays:

```text
sky/atmosphere
vignette
haze
map tint
route line
signal pulse
safe-frame border
masks
```

must not block clicks.

Controls:

```text
Edit / Show / Capture
Freeze
16:9
Exit Capture
play/pause if wired
route/motion controls if present
```

must remain clickable.

---

## D. Make Edit Mode obvious

Add or preserve a clear top-right mode toolbar:

```text
Edit | Show | Capture
```

When Edit is active:

```text
Edit should be visibly highlighted
controls should be usable
```

The operator should know they are in the control mode.

---

## E. Add “Unlock Controls” / “Operate” if needed

If mode language is still unclear, add one obvious button:

```text
Operate
```

or:

```text
Unlock Controls
```

This should switch to Edit Mode and restore controls.

This is optional if Edit Mode is already obvious.

---

## F. Escape behavior

Ensure:

```text
Esc from Capture → previous mode or Edit
Esc from Show → Edit optional
Esc never disables controls
```

Preferred:

```text
Esc always returns operator to Edit Mode
```

This is simplest and safest.

---

## G. Control recovery tab

Floating tab should appear in Capture Mode:

```text
Exit Capture
```

If controls appear hidden or user moves mouse, this tab must remain accessible.

Style:

```text
small
high contrast
not covered by masks
z-index above overlays
pointer-events auto
```

---

## H. Mapbox / WOS controls policy

For now:

```text
Edit Mode = map controls may remain usable
Show Mode = map controls visually masked
Capture Mode = map controls hidden/masked
```

Do not let show masks block operator toolbar.

---

## I. Sky naming / UI copy

Rename any UI copy that says or implies “Sky” if it is not actual Three.js/Mapbox sky.

Preferred labels:

```text
Atmosphere
Sky Wash
Haze
Map Atmosphere
```

In color theme fields, keep:

```text
Sky Top
Sky Mid
Haze
```

but internal notes should clarify:

```text
this controls the overlay atmosphere, not a real 3D sky
```

---

## Non-Goals

Do not implement:

```text
Three.js Sky
Mapbox sky layer mutation
real 3D sky dome
vehicle simulation
new route editor
audio-reactive grid
new theme system
new capture/export tools
Node/Vite environment work
```

This is a control/pointer-event hotfix.

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

Possible files:

```text
src/ui/MapThemePreviewCard.tsx
src/logic/colorLab.ts
```

---

## Acceptance Criteria

### A. Edit Mode controls work

In Edit Mode, operator can click:

```text
mode toolbar
playback controls
route/motion controls if present
map/iframe controls if visible
```

---

### B. Decorative overlays do not block clicks

Sky/atmosphere/masks/route overlays use pointer-events correctly and do not intercept control clicks.

---

### C. Capture Mode is recoverable

In Capture Mode:

```text
Esc exits
floating Exit Capture control works
```

---

### D. Show Mode is clean but not a trap

Show Mode remains visually clean but can return to Edit easily.

---

### E. Iframe interaction is restored in Edit Mode

The map iframe is not globally disabled.

---

### F. Sky is clarified as overlay

No claim that the current implementation is Three.js sky unless a real Three.js sky is added.

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

---

## Manual Test Checklist

1. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

2. Open Broadcast HUD.

3. Switch to:

```text
Edit
```

4. Confirm all operator controls click.

5. Confirm map iframe responds if visible controls are allowed.

6. Switch to:

```text
Show
```

7. Confirm visual cleanup remains.

8. Return to:

```text
Edit
```

9. Switch to:

```text
Capture
```

10. Press:

```text
Esc
```

Expected:

```text
returns to Edit
```

11. Enter Capture again.

12. Click:

```text
Exit Capture
```

Expected:

```text
returns to Edit
```

13. Confirm sky/atmosphere overlay remains visible.

14. Confirm overlays do not block clicks.

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

Broadcast HUD remains show-ready, but the operator can control it again.

The system is clear:

```text
Edit = operate
Show = watch
Capture = clean output
```

The current atmosphere system is correctly understood as a lightweight overlay, not the Three.js sky system.

---

## Implementation Guide

- **Where:** Broadcast HUD mode classes, operator overlay, CSS pointer-events, capture recovery controls, sky/atmosphere labels.
- **What:** Restore pointer/control freedom in Edit Mode, ensure overlays do not block clicks, make Capture recoverable, and clarify that current sky is an atmosphere overlay.
- **Expect:** The Broadcast HUD can be operated safely while preserving the clean show/capture surface.
