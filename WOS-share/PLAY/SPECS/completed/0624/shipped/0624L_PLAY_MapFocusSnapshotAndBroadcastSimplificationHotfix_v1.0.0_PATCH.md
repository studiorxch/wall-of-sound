# 0624L_PLAY_MapFocusSnapshotAndBroadcastSimplificationHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Rollback + Map Focus Recovery

This patch removes the unnecessary Broadcast HUD capture-mode complexity and restores the intended map-focused control model.

The user asked for:

```text
map focus
sky / atmosphere cleanup
clean controls
snapshot button
working screen operation
```

The current system drifted into:

```text
Capture Mode
Still Mode
Hide HUD mode
Freeze
16:9 frame guide
Exit Capture
extra capture/video language
theme variation complexity
```

This patch removes that drift.

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

## Product Decision

Broadcast HUD should be simple:

```text
Operate = controls visible / screen can be operated
Show = clean map/music view for OBS
Snapshot = one quick still helper
```

OBS remains responsible for recording and streaming.

PLAY should not contain a video-capture system.

---

## Goal

Restore Broadcast HUD to a clean, controllable, map-focused surface.

Required result:

```text
no Capture Mode
no Still Mode
no Freeze button
no 16:9 frame guide
no Exit Capture
no hidden-trap HUD state
no extra capture/video workflow
one Snapshot button only
Operate and Show remain usable
map/sky/theme/motion remain visible
```

---

## Remove

Remove UI, state, CSS, and handlers for:

```text
Capture Mode
Still Mode
Hide HUD as a persistent mode
Freeze Motion
16:9 safe-frame guide
Exit Capture floating button
capture mode keyboard logic
video/still/capture workflow language
extra capture toolbar buttons
```

Remove or disable related CSS classes if no longer needed:

```text
hud-shell--capture
hud-shell--still
hud-shell--hide-ui
hud-shell--motion-paused
hud-shell--frame-16x9
broadcast-safe-frame
capture restore tab
exit capture tab
```

If removing all CSS at once is risky, leave unused CSS only if it is inert and not referenced. Prefer removal.

---

## Keep

Keep only the map-focused visual work that is actually useful:

```text
Broadcast HUD opens
Operate mode
Show mode
map theme / color variables
sky / atmosphere overlay
map masks in Show mode if not blocking controls
route / signal / motion overlay if lightweight and working
ColorLab Lite palette extraction if working and not slowing operation
Map Preview card if useful
theme JSON export/import only if already working and not cluttering the main HUD
```

Theme management should not dominate the Broadcast HUD.

---

## Add: Snapshot Button

Add one button:

```text
Snapshot
```

Placement:

```text
Broadcast HUD operator toolbar
```

Do not add a new mode.

### Snapshot behavior

Preferred if technically safe:

```text
Snapshot temporarily hides nonessential controls
waits a short tick
triggers a browser/download screenshot if supported
restores controls automatically
```

But because iframe/cross-origin map capture may fail, safe fallback is acceptable:

```text
Snapshot briefly enters a clean visual state for 2 seconds
shows a small note: “Snapshot ready — use OBS/browser screenshot”
automatically restores controls
```

Do not create persistent Capture Mode.

### Snapshot state

If needed, use a short-lived state:

```ts
snapshotFlash: boolean
```

or:

```ts
snapshotCleanUntil: number
```

This must auto-expire.

Do not use:

```ts
captureMode
stillMode
hideHud
```

---

## Correct Toolbar

Broadcast toolbar should be:

```text
Operate | Show | Snapshot
```

Optional only if already lightweight:

```text
Theme name
```

Do not show:

```text
Capture
Still
Hide HUD
Freeze
16:9
Exit Capture
```

---

## Operate Mode

Operate mode must allow the operator to control the screen.

Required:

```text
controls visible
operator toolbar visible
map/iframe pointer events not globally blocked
decorative overlays pointer-events: none
buttons clickable
```

---

## Show Mode

Show mode is the OBS-facing clean view.

Required:

```text
less HUD clutter
map masks may hide WOS/debug controls
Return to Operate visible or toolbar still minimally accessible
no dead controls
no hidden trap
```

Show mode must not prevent returning to Operate.

---

## Sky / Atmosphere Clarification

The current sky work is an atmosphere overlay, not Three.js sky.

Keep it if lightweight:

```text
sky wash
haze
vignette
glow
```

Label internally as:

```text
Atmosphere Overlay
```

Do not claim it is:

```text
Three.js sky
Mapbox sky layer
3D sky dome
procedural sun system
```

Future real sky work can be a separate patch only if it is visually useful.

---

## Map Focus

This patch is about the map.

Do not add anything unrelated to the visible map/music screen.

Map focus means:

```text
map stage visible
sky/atmosphere improved or preserved
route/motion overlay visible if working
controls simplified
snapshot available
OBS-friendly Show view
```

---

## Non-Goals

Do not implement:

```text
video capture system
automatic video recording
OBS automation
new capture mode
new still mode
new frame guide
new theme gallery
new route editor
new metadata-reactive grid
new audio-reactive grid
new 3D object system
new archive/catalog workflow
Node/Vite environment work
```

---

## Implementation Targets

Likely files:

```text
src/ui/BroadcastHUD.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/BroadcastMapMotionOverlay.tsx
src/ui/BroadcastShowModeOverlay.tsx
src/ui/PlaylistHeader.tsx
src/styles.css
src/App.tsx
```

Optional cleanup:

```text
src/logic/mapThemeExport.ts
src/logic/colorLab.ts
```

Only touch theme export files if they are directly tied to the removed capture UI.

---

## Acceptance Criteria

### A. Toolbar is simplified

Broadcast HUD toolbar shows:

```text
Operate
Show
Snapshot
```

No Capture / Still / Freeze / 16:9 controls remain.

---

### B. No hidden capture state remains

There is no persistent Capture Mode or Hide HUD mode.

---

### C. Snapshot is one-shot only

Snapshot either:

```text
creates a screenshot if supported
```

or:

```text
temporarily cleans the view and restores automatically
```

It does not create a persistent mode.

---

### D. Operate mode works

Operator can control the screen.

No overlays block controls in Operate.

---

### E. Show mode is clean and recoverable

Show mode is OBS-friendly and can return to Operate easily.

---

### F. Map visuals remain

Do not regress:

```text
sky/atmosphere overlay
map theme color variables
route/signal/motion overlay if working
```

---

### G. No capture/video language remains

Remove misleading UI labels and comments that imply PLAY is a video capture system.

OBS is the capture tool.

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

3. Confirm toolbar is:

```text
Operate | Show | Snapshot
```

4. Confirm no buttons for:

```text
Capture
Still
Hide HUD
Freeze
16:9
Exit Capture
```

5. Switch to Operate.

6. Confirm controls are clickable.

7. Confirm map/iframe interaction is not globally blocked in Operate.

8. Switch to Show.

9. Confirm view is cleaner.

10. Confirm Return to Operate is available.

11. Click Snapshot.

12. Confirm Snapshot is one-shot and restores automatically.

13. Confirm sky/atmosphere still renders.

14. Confirm route/motion overlay still renders if previously working.

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

Broadcast HUD returns to the intended model:

```text
Operate = control the screen
Show = OBS-friendly map/music view
Snapshot = quick still helper
```

No unnecessary video/capture system remains.

The work is refocused on the visible map surface.

---

## Implementation Guide

- **Where:** Broadcast HUD toolbar/mode state, operator overlay, CSS mode classes, snapshot handler.
- **What:** Remove Capture/Still/Freeze/16:9/Hide HUD complexity, restore Operate/Show simplicity, add one-shot Snapshot button, keep map/sky/theme/motion visuals.
- **Expect:** A controllable, map-focused Broadcast HUD without extra capture-system clutter.
