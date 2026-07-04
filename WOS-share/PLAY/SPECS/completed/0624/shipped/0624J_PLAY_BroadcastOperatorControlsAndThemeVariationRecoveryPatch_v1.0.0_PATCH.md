# 0624J_PLAY_BroadcastOperatorControlsAndThemeVariationRecoveryPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Broadcast Control Recovery

This patch corrects a critical UX problem introduced by the show/capture cleanup work.

0624H and 0624I successfully made the Broadcast HUD cleaner and more screenshot-ready, but the operator can now get trapped in a state where the screen is visible but difficult to control.

The core correction:

```text
Broadcast HUD = official watch/show surface
Playlist Identity / Theme Editor = official theme creation surface
Operator Controls = always recoverable
Capture Mode = temporary output state, never a dead end
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

## Current Context

Completed visible chain:

```text
0624H = map show surface + sky/atmosphere + ColorLab theme + motion overlay
0624I = still/capture mode + hide HUD + freeze motion + theme export/import
```

Current issue from screenshot/user report:

```text
Hide HUD cleans the screen but removes operator control.
Broadcast HUD feels like the only screen, but there is no usable control layer.
Theme variation cannot be managed from the watch surface.
The operator has no obvious way to recover controls.
```

---

## Product Decision

Broadcast HUD is the official viewing surface.

```text
Broadcast HUD = what the audience watches
```

But it is not the only operating surface.

Correct separation:

```text
Theme Editor / Identity Panel = build and manage themes
Broadcast HUD = watch/show output
Capture Mode = temporary still/video capture state
Operator Overlay = recover controls at all times
```

---

## Goal

Separate:

```text
watching
controlling
capturing
theme variation management
```

so the operator can always control the screen.

---

## Problems To Fix

### 1. Hide HUD is too destructive

Current `Hide HUD` acts like an operational mode, but it should be a temporary capture state.

Fix:

```text
Hide HUD → Capture Mode
```

Capture Mode must always include a way back.

---

### 2. No recovery control

When UI is hidden, operator needs:

```text
Esc to restore controls
small floating Show Controls tab
keyboard shortcut
or all of the above
```

Minimum:

```text
Esc restores controls
floating Show Controls tab appears in a corner
```

---

### 3. Broadcast HUD lacks operator mode distinction

Add clear modes:

```text
Edit
Show
Capture
```

Definitions:

```text
Edit = full operator controls visible
Show = minimal audience-ready HUD, some controls available
Capture = HUD hidden / still-video clean, recovery control available
```

---

### 4. Theme variations are not manageable

The operator cannot easily make or choose theme variations.

This should not happen inside hidden Broadcast HUD.

Theme variation management belongs in:

```text
Playlist Identity / Map Color Theme section
```

Broadcast HUD may show the active theme name only.

---

## Required Mode Model

Add/normalize a mode state.

Suggested type:

```ts
export type BroadcastViewMode = "edit" | "show" | "capture";
```

Behavior:

### Edit Mode

```text
all operator controls visible
theme controls if relevant
route/motion controls visible
Show / Capture buttons visible
map controls may be visible or masked depending on setting
```

### Show Mode

```text
audience-ready
minimal HUD
no dead controls
map masks active
playback/status visible
operator controls reduced but still recoverable
```

### Capture Mode

```text
HUD hidden for screenshots/video
map/theme/motion visible
safe-frame may be visible if enabled
floating restore tab visible
Esc returns to Show or Edit
```

---

## Capture Recovery Requirements

### Keyboard

Add global key handler while Broadcast HUD is active:

```text
Escape → exit Capture Mode
```

If previous mode is tracked:

```text
Escape returns to previous mode
```

Otherwise:

```text
Escape returns to Show Mode
```

### Floating restore control

Even in Capture Mode, show a tiny non-intrusive tab:

```text
Show Controls
```

or:

```text
Exit Capture
```

Placement:

```text
top-right or bottom-right
```

It should not dominate the still, but must be discoverable.

Optional:

```text
auto-hide after 3 seconds, reappear on mouse move
```

Do not overbuild auto-hide if risky.

---

## Broadcast HUD Controls

Add a compact control group:

```text
Mode: Edit | Show | Capture
Still
Freeze
16:9
```

But avoid duplicating old confusing buttons.

Recommended labels:

```text
Edit
Show
Capture
Freeze
16:9
```

Replace:

```text
Hide HUD
```

with:

```text
Capture
```

or keep Hide HUD only inside Capture controls, not as a primary mode.

---

## Theme Variation Management

Move theme variation work to Playlist Identity / Map Color Theme.

### Required controls in Identity panel

```text
Theme name
Duplicate Theme
Save Variation
Active Theme select
Delete Theme
Export Theme
Import Theme
Copy CSS
Reset
```

If full preset management is too much, implement minimal theme variation manager:

```ts
mapThemePresets?: PlayColorTheme[];
activeMapThemeId?: string;
```

or on playlist:

```ts
colorThemes?: PlayColorTheme[];
activeColorThemeId?: string;
```

Use existing type names if already established.

### Minimum acceptable behavior

The operator can:

```text
duplicate current theme
rename duplicate
switch active theme
delete non-active theme or delete with safe fallback
export/import active theme
```

If a full array model is too risky, at least make Duplicate create a saved preset, not only rename the current theme.

---

## Theme Preset Data Model

If adding preset storage, use:

```ts
export type PlayColorTheme = {
  id: string;
  name: string;
  dominant: string;
  accent: string;
  glow: string;
  shadow: string;
  muted: string;
  skyTop: string;
  skyMid: string;
  haze: string;
};
```

Playlist record fields:

```ts
colorTheme?: PlayColorTheme; // keep for backward compatibility
colorThemes?: PlayColorTheme[];
activeColorThemeId?: string;
```

Repair rules:

```text
if playlist.colorTheme exists and colorThemes empty:
  create one colorThemes entry from colorTheme
  set activeColorThemeId
```

Do not break existing 0624H/0624I projects.

---

## Active Theme Logic

Derive active theme:

```text
1. colorThemes.find(id === activeColorThemeId)
2. colorTheme
3. default theme
```

When editing color pickers:

```text
edit active theme
also sync legacy colorTheme if still used
```

---

## Broadcast HUD Theme Display

Broadcast HUD should show:

```text
active playlist title
active theme name
current track/status
mode state
```

in Edit/Show mode only.

Capture mode should hide most of this unless watermark/title is enabled.

---

## Operator Control Overlay

Add a lightweight overlay component if useful:

```text
src/ui/BroadcastOperatorOverlay.tsx
```

Responsibilities:

```text
mode switch
freeze toggle
safe frame toggle
capture entry/exit
restore controls
active theme label
```

Keep styling small and clean.

---

## Non-Goals

Do not implement:

```text
automatic screenshot capture
video export
OBS automation
full ColorLab app
full Mapbox style editor
true audio-reactive grids
vehicle simulation
3D object placement
deep Archive review
Node/Vite environment work
```

This patch is control recovery + theme variation management.

---

## Implementation Targets

Likely files:

```text
src/ui/BroadcastHUD.tsx
src/ui/PlaylistHeader.tsx
src/ui/MapThemePreviewCard.tsx
src/logic/colorLab.ts
src/logic/mapThemeExport.ts
src/data/playProjectTypes.ts
src/data/playProjectStorage.ts
src/App.tsx
src/styles.css
```

Possible new file:

```text
src/ui/BroadcastOperatorOverlay.tsx
```

---

## Acceptance Criteria

### A. Broadcast mode model exists

Broadcast HUD supports:

```text
Edit
Show
Capture
```

with clear behavior differences.

---

### B. Hide HUD no longer traps the operator

Capture mode has a recoverable exit.

Minimum:

```text
Esc exits Capture
floating Show Controls / Exit Capture tab exists
```

---

### C. Controls are usable in Edit Mode

Operator can control the screen without leaving Broadcast HUD.

---

### D. Show Mode remains clean

Show Mode remains audience-ready and does not reintroduce dev cockpit clutter.

---

### E. Capture Mode is clean but recoverable

Capture Mode hides HUD for stills/video but is never a dead end.

---

### F. Theme variations are manageable

User can:

```text
duplicate theme
rename theme
switch active theme
delete theme safely
```

or minimum equivalent saved variation behavior.

---

### G. Broadcast HUD uses active theme

Switching active theme updates:

```text
Map Preview
Broadcast HUD theme variables
sky/atmosphere
route/motion overlay
```

---

### H. Theme export/import uses active theme

Export Theme exports the active theme.

Import Theme can add/apply a theme variation.

---

### I. Project JSON round-trip

Mode-independent theme variations survive:

```text
export Project JSON
clear LocalStorage
import Project JSON
```

---

### J. 0624H/0624I visuals do not regress

Must still work:

```text
8 swatches
Map Preview card
sky overlay
BroadcastMapMotionOverlay
Still / Freeze / 16:9
theme JSON export/import
Copy CSS
```

---

### K. tsc clean

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

3. Switch modes:

```text
Edit → Show → Capture
```

4. In Capture mode, press:

```text
Esc
```

Expected:

```text
controls return
```

5. Enter Capture again.

6. Click floating:

```text
Show Controls / Exit Capture
```

Expected:

```text
controls return
```

7. Open playlist identity / Map Color Theme.

8. Duplicate current theme.

9. Rename duplicate.

10. Switch active theme.

11. Confirm Map Preview updates.

12. Open Broadcast HUD.

13. Confirm Broadcast HUD updates to active theme.

14. Export active theme JSON.

15. Import theme JSON as another variation.

16. Export Project JSON.

17. Clear LocalStorage.

18. Import Project JSON.

19. Confirm theme variations and active theme survive.

20. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

Broadcast HUD becomes safe to operate.

The operator can now choose between:

```text
Edit = control
Show = audience view
Capture = clean still/video
```

without getting trapped.

Theme variations become manageable from the playlist identity surface, while Broadcast HUD remains the official watch surface.

---

## Implementation Guide

- **Where:** Broadcast HUD mode state, operator overlay, playlist identity Map Color Theme section, color theme data model, storage repair, CSS mode classes.
- **What:** Replace destructive Hide HUD behavior with Edit/Show/Capture modes, add Esc/floating restore, and add real theme variation management.
- **Expect:** PLAY can be watched, controlled, and captured without losing operator control.
