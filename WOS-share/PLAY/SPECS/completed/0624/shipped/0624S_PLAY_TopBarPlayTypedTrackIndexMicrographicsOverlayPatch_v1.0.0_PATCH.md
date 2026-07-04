# 0624S_PLAY_TopBarPlayTypedTrackIndexMicrographicsOverlayPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Broadcast Interface Direction + No-Dock Playback Recovery

This patch shifts the Broadcast HUD away from dock bars and cockpit UI toward an unconventional map-first broadcast interface.

The current repair chain restored map interaction, route launch, and WOS embed behavior. Now the goal is to remove the bottom-route-dock feeling while preserving the feature that matters:

```text
the route/play action must remain available
```

The new direction:

```text
Top bar = route/play action
Map = primary surface
Typed track index = music identity reveal
Micrographics grid = compact status information
Bottom dock = removed
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

Recent completed fixes:

```text
0624M = removed fake route line/dot, dark haze, capture clutter
0624N = restored WOS route/map launch
0624O = hid WOS chrome in embed mode
0624P = restored minimal Routes Controller and Canvas access
0624Q = restored map pan/zoom interaction
0624R = removed bottom playback/status bar, reduced route controller, removed emoji labels
```

Current verified state:

```text
map is visible
map pan/zoom works
PLAY toolbar visible
Routes: Live visible
route controller still works
tsc -b clean
```

Current design problem:

```text
bottom route controller still feels like a dock
information display is conventional and app-like
music identity is not presented well
route/play action should not require a bottom bar
```

---

## Goal

Move the essential route/play action into the top PLAY toolbar and replace bottom-dock information with a typed micrographics overlay.

Required result:

```text
no bottom route dock as primary UI
small top-bar play triangle controls route launch/play
typed track index appears on song change
double-digit playlist order becomes graphic anchor
compact micrographics grid displays route/music/map status
map remains draggable and readable
no emoji icons
no fake route overlays
no haze/capture modes
```

---

## Visual Reference Direction

Use the uploaded Pinterest micrographics reference as visual direction.

Extract the principle, not the clutter:

```text
technical micrographics
archive labels
transit document logic
thin diagram captions
serial/index numbers
anti-design typography
small all-caps metadata grids
```

Do not copy density directly. Use only 5–10% of that density so the map stays readable.

---

## Product Model

Correct Broadcast HUD model:

```text
Top bar:
PLAY | Flow-Curve | Scheduler | Broadcast HUD | ▶ | Routes: Live | Canvas ↗

Map:
interactive WOS map/route surface

Overlay:
typed track index reveal
compact status grid
tiny coordinate/status marks

Bottom:
empty
```

---

## Required Changes

## 1. Move route/play to top bar

Add a compact play triangle to the top PLAY Broadcast toolbar.

Button states:

```text
▶ = Launch / Play Route
■ = Stop / End Route if available
```

If stop/end route is not currently wired, use only:

```text
▶ = Launch Route
```

This button must call the same existing route launch behavior used by the WOS route controller.

Do not invent a new route system.

---

## 2. Remove bottom route controller as primary UI

In Broadcast HUD embed mode, remove/hide the bottom dock-style `#wos-nav` controller.

Do not remove route functionality.

The bottom dock should not be the main control surface.

Required:

```text
no bottom route dock visible by default
no full-width bottom route control bar
no mode-button dock
```

If a fallback route controller is needed for debugging, hide it behind an advanced/dev toggle, not visible by default.

---

## 3. Add typed track index overlay

On current track change, show a typed reveal overlay.

Use the playlist order number as the graphic anchor.

Format example:

```text
01
RAINCURVE SIDE01
UNKNOWN ARTIST
SOFT DISCONNECTS & OTHER MEMORY ERRORS
```

Alternative technical format:

```text
[01] / RAINCURVE_SIDE01
     UNKNOWN_ARTIST
     SOFT DISCONNECTS + OTHER MEMORY ERRORS
```

Behavior:

```text
number appears first
title types in
artist/playlist metadata appears after
overlay holds for 3–5 seconds
then collapses to a small persistent label
```

The overlay must be presentation-only:

```css
pointer-events: none;
```

It must not block map pan/zoom.

---

## 4. Use double-digit playlist index

Track index must render as two digits:

```text
01
02
03
...
10
11
```

If index is unknown:

```text
-- 
```

Do not render unpadded single digits.

---

## 5. Add anti-design / micrographics typography

Use a technical font stack.

Suggested CSS:

```css
font-family:
  "Share Tech Mono",
  "IBM Plex Mono",
  "OCR A Std",
  "Arial Narrow",
  monospace;

text-transform: uppercase;
font-variant-numeric: tabular-nums;
letter-spacing: -0.02em;
```

Do not depend on external font loading unless already available.

Use system fallback if needed.

---

## 6. Add compact micrographics info grid

Replace bottom status with a small grid.

Example:

```text
MODE      DRIVE
SPEED     2X
STATUS    ROUTES LIVE
TRACK     01/18
SOURCE    WOS LOCAL
```

Optional fields if already available:

```text
CAMERA    REAR FOLLOW
MAP       NYC
PLAYLIST  ROBOT BLIPS
```

Placement:

```text
top-left
top-right
or left-center
```

Do not place as a bottom dock.

The grid must be compact and pointer-transparent unless interactive.

---

## 7. Keep PLAY toolbar simple

Toolbar should become:

```text
Operate | Show | Snapshot | ▶ | Routes: Live | Canvas ↗
```

or a cleaner equivalent:

```text
Operate | Show | Snapshot | ▶ | Routes: Live
```

Do not add:

```text
Capture
Still
Freeze
16:9
Hide HUD
Exit Capture
```

---

## 8. Preserve map interaction

Do not break 0624Q.

Required:

```text
drag map → pans
scroll/trackpad → zooms
top bar buttons clickable
typed overlay does not block map
micrographics grid does not block map
```

---

## 9. Preserve full Canvas access

Canvas link remains available:

```text
Canvas ↗
```

It may open the full WOS surface in a new tab.

Do not remove it.

---

## Non-Goals

Do not implement:

```text
new route engine
new playback engine
video capture system
capture mode
still mode
freeze mode
16:9 frame
fake route animation
signal dot
dark haze
heavy micrographic wallpaper overlay
full design overhaul beyond this overlay pass
audio-reactive grid
metadata-reactive grid
3D sky
```

This patch is a focused interface shift.

---

## Implementation Targets

Likely PLAY files:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastHUD.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/TypedTrackIndexOverlay.tsx
src/ui/BroadcastMicrographicsGrid.tsx
src/styles.css
```

Possible WOS files if hiding bottom nav:

```text
wall/index.html
wall/styles.css
wall/traversalControlDeck.js
```

Use actual repo names.

---

## Suggested New Components

### `TypedTrackIndexOverlay.tsx`

Props:

```ts
type TypedTrackIndexOverlayProps = {
  trackIndex?: number;
  totalTracks?: number;
  title?: string;
  artist?: string;
  playlistTitle?: string;
  changedAt?: number;
};
```

Behavior:

```text
detect changedAt/current track change
animate type-on reveal
collapse after timeout
pointer-events none
```

### `BroadcastMicrographicsGrid.tsx`

Props:

```ts
type BroadcastMicrographicsGridProps = {
  mode?: string;
  speed?: string;
  routeStatus?: string;
  trackIndex?: number;
  totalTracks?: number;
  source?: string;
  playlistTitle?: string;
};
```

---

## CSS Direction

Typed overlay:

```css
.broadcast-track-index-overlay {
  position: absolute;
  left: 28px;
  top: 72px;
  z-index: 20;
  pointer-events: none;
  font-family: "Share Tech Mono", "IBM Plex Mono", "OCR A Std", "Arial Narrow", monospace;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

.broadcast-track-index-number {
  font-size: clamp(48px, 8vw, 132px);
  line-height: 0.85;
  letter-spacing: -0.08em;
}

.broadcast-track-title {
  font-size: clamp(16px, 2vw, 32px);
  letter-spacing: -0.03em;
}
```

Micrographics grid:

```css
.broadcast-microgrid {
  position: absolute;
  right: 28px;
  top: 72px;
  z-index: 20;
  pointer-events: none;
  display: grid;
  grid-template-columns: auto auto;
  gap: 4px 14px;
  font-family: "Share Tech Mono", "IBM Plex Mono", monospace;
  font-size: 10px;
  text-transform: uppercase;
}
```

Do not add heavy backgrounds. Use thin borders, tiny labels, low-density graphics.

---

## Acceptance Criteria

### A. Top-bar play triangle exists

A compact `▶` route/play button appears in the PLAY top/Broadcast toolbar.

---

### B. Top-bar play launches route

Clicking `▶` uses existing route launch behavior.

---

### C. Bottom route dock is gone by default

No dock-style bottom route controller appears as the primary Broadcast UI.

---

### D. Typed track overlay appears on song change

When current track changes, a typed title/index reveal appears.

---

### E. Double-digit track index is used

Track order renders as:

```text
01
02
03
```

not `1`, `2`, `3`.

---

### F. Micrographics grid appears

Compact grid displays route/music status without acting like a dock.

---

### G. No emoji icons

No emoji vehicle icons return.

---

### H. Map interaction remains working

In Operate:

```text
drag → pan
scroll/trackpad → zoom
```

---

### I. Overlays do not block map

Typed overlay and grid use:

```text
pointer-events: none
```

unless a specific button is intentionally interactive.

---

### J. Canvas link remains

Canvas access is still visible/reachable.

---

### K. No removed clutter returns

Do not restore:

```text
fake line
signal dot
haze
capture/still/freeze/16:9 modes
bottom playback bar
WOS cockpit chrome
```

---

### L. tsc clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

If WOS files are touched, run any available lightweight WOS check.

---

## Manual Test Checklist

1. Start WOS local route server.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm toolbar includes:

```text
▶
Routes: Live
Canvas ↗
```

5. Confirm bottom route dock is not visible by default.

6. Click `▶`.

Expected:

```text
route launches using existing route behavior
```

7. Confirm map still pans.

8. Confirm map still zooms.

9. Change current track or simulate track change.

Expected:

```text
typed overlay appears
double-digit index appears
title types/reveals
```

10. Wait 3–5 seconds.

Expected:

```text
overlay collapses or fades to small persistent label
```

11. Confirm micrographics grid is visible.

12. Confirm no emoji icons.

13. Confirm Canvas link works.

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

Broadcast HUD stops feeling like a dock/cockpit.

The interface becomes:

```text
top-bar route play
interactive map
typed music identity
compact micrographics status
no bottom bar
```

This is unconventional while staying focused on the map and music surface.

---

## Implementation Guide

- **Where:** Broadcast toolbar, WOS embed nav visibility, typed track overlay, micrographics grid, Broadcast HUD CSS.
- **What:** Move route/play to a top-bar triangle, remove the bottom dock as primary UI, add a typed double-digit track-index overlay, and display route/music status as compact micrographics.
- **Expect:** PLAY feels more like a broadcast/music map interface and less like an embedded control cockpit.
