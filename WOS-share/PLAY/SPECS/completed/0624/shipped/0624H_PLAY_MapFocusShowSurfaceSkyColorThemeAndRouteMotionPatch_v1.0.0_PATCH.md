# 0624H_PLAY_MapFocusShowSurfaceSkyColorThemeAndRouteMotionPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Visible Map + Music Show Push

This patch focuses on what the audience actually sees:

```text
maps + music
```

The goal is to make PLAY’s Broadcast HUD feel like a clear animated audio-visual map environment, suitable for tomorrow’s show/demo, social stills, short video tests, and early merch/pattern exploration.

This patch supersedes the narrower Broadcast HUD cleanup idea by expanding the visible map refresh to include:

```text
sky
atmosphere
playlist color theme
map overlay tint
route pulse
simple motion
show-mode cleanup
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

## Product Context

Current stable chain:

```text
0624C = catalog metadata + moods
0624D = library filters + playlist source rules
0624E = analyzer to mood suggestions bridge
0624F = import destinations + Archive + group governance
0624G = TypeScript baseline clean
```

The product now has a large amount of useful internal infrastructure, but the visible show surface still needs to feel alive.

Current user-facing issue:

```text
The audience does not see the infrastructure.
The audience sees the map and hears the music.
```

---

## Goal

Create a clean animated map environment for audio-visual playback.

Primary goal:

```text
Broadcast HUD should look show-ready even before true vehicles, 3D objects, or audio-reactive grids exist.
```

Show-ready means:

```text
clean map stage
better sky / atmosphere
playlist-driven color direction
simple visible motion
less exposed dev UI
no dead-looking controls
good screenshot potential
good short-video potential
good palette/pattern testing potential
```

---

## Current Blockers / Concerns

### 1. No visible movement

The map is atmospheric but mostly static.

The user expected to see some kind of vehicle or motion.

For this patch, do not wait for real vehicles. Add simple visible movement:

```text
route pulse
moving signal dot
grid shimmer
scanline drift
ambient pulse
```

### 2. No 3D objects yet

Reported:

```text
Still missing 3D objects on the map.
Studio cannot provide anything.
```

Do not block this patch on Studio or 3D assets.

### 3. Map controls do not support the platform view

The current map controls are visible but not part of the show.

Show Mode should hide or mask them.

### 4. Sky is missing from the cleanup

Sky and atmosphere should be treated as part of the visible map identity.

### 5. ColorLab is outside current preview

The color idea should be brought into PLAY only as a small local utility:

```text
background image → palette → swatches → map preview → broadcast theme
```

Do not import or depend on a full external ColorLab project.

---

## Product Direction

Adopt this working concept:

```text
Map Focus = PLAY’s visible audio-visual surface.
```

This patch should support:

```text
social still generation
short playback videos
multicolor map tests
early merch pattern tests
playlist identity experiments
```

---

## Show Mode Requirements

Add or update Broadcast HUD Show Mode.

```text
Show Mode = clean, presentation-ready map surface
Edit/Debug Mode = development controls visible
```

Default for Broadcast HUD should either be Show Mode ON or have a very obvious Show Mode toggle.

### Show Mode should hide/mask:

```text
left WOS sidebar
map-native controls
unused WOS mode controls
debug buttons
dead buttons
bottom WOS cockpit controls if not useful
```

### Show Mode should show:

```text
playlist identity
current track / playback state
progress/time
route/motion status
palette/theme status if useful
minimal PLAY branding
```

---

## Map Clean Sweep

Target likely files:

```text
src/ui/BroadcastHUD.tsx
src/ui/BroadcastGridLayer.tsx
src/ui/BroadcastSecondaryLayer.tsx
src/ui/PlaybackTransport.tsx
src/styles.css
src/App.tsx
```

If WOS iframe controls cannot be controlled directly, mask them visually from PLAY.

### Required visual cleanup

Add masking overlays:

```text
left sidebar mask
right/native control mask if needed
bottom cockpit mask if needed
top map-control mask if needed
```

Use Show Mode class names:

```css
.broadcast-stage--show
.broadcast-stage-mask-left
.broadcast-stage-mask-right
.broadcast-stage-mask-bottom
.broadcast-stage-mask-top
```

Do not globally disable map interaction unless needed. Prefer visual masks.

---

## Sky / Atmosphere Layer

Add a sky/atmosphere overlay controlled by playlist theme.

The map should gain:

```text
sky gradient
haze
vignette
subtle horizon glow
atmospheric color wash
```

This can be an overlay above the map iframe, not a Mapbox sky layer, unless WOS/Mapbox exposes easy control.

Suggested CSS variables:

```css
--play-sky-top
--play-sky-mid
--play-sky-haze
--play-map-vignette
--play-map-glow
```

Suggested overlay layers:

```text
sky wash
horizon glow
fog/haze
vignette
```

Acceptance minimum:

```text
Broadcast HUD visibly changes atmosphere from flat/dark map into styled show surface.
```

---

## ColorLab Lite

Bring ColorLab into PLAY as a lightweight local utility, not a separate product.

### Operator flow

```text
1. Operator opens playlist profile / identity.
2. Uploads background image.
3. Background loads.
4. Palette swatches are extracted.
5. Operator sees color identifiers and swatches.
6. Operator sees a map preview using the palette.
7. Operator adjusts colors if needed.
8. Broadcast HUD uses the wallpaper theme colors.
```

### New helper

Create:

```text
src/logic/colorLab.ts
```

Suggested types:

```ts
export type PlayColorTheme = {
  dominant: string;
  accent: string;
  glow: string;
  shadow: string;
  muted: string;
  skyTop: string;
  skyMid: string;
  haze: string;
};

export async function extractColorThemeFromImageUrl(url: string): Promise<PlayColorTheme | null>;
```

If canvas/CORS fails, return fallback.

### Fallback theme

```ts
export const DEFAULT_PLAY_COLOR_THEME: PlayColorTheme = {
  dominant: "#071019",
  accent: "#5f73ff",
  glow: "#00d5ff",
  shadow: "#02040a",
  muted: "#263545",
  skyTop: "#02040a",
  skyMid: "#071019",
  haze: "#0c2a3a"
};
```

---

## Playlist Identity Theme Storage

Add playlist identity fields if not already present.

Suggested data shape:

```ts
playlistIdentity?: {
  description?: string;
  coverImageDataUrl?: string;
  backgroundImageDataUrl?: string;
  colorTheme?: PlayColorTheme;
};
```

If current identity model already exists, extend it rather than creating a duplicate.

The theme must persist through Project JSON export/import.

---

## Color Swatches + Adjustments

In playlist Identity/Profile panel:

Show:

```text
background image preview
dominant swatch
accent swatch
glow swatch
shadow swatch
muted swatch
skyTop swatch
skyMid swatch
haze swatch
```

Allow manual adjustment via:

```text
color input fields
```

Minimum:

```text
show swatches
allow overriding accent/glow/dominant
save theme to playlist
```

---

## Map Preview Card

Inside playlist Identity/Profile, add a small preview card:

```text
mini dark map-like panel
grid/road lines using accent
glow pulse using glow
sky/haze wash using sky variables
```

This does not need real Mapbox. It is a quick preview of the palette direction.

Purpose:

```text
test stills
test color directions
test merch/pattern possibilities
before pushing theme into Broadcast HUD
```

---

## Broadcast Theme Application

Apply playlist theme to Broadcast HUD stage using CSS variables:

```css
--play-map-dominant
--play-map-accent
--play-map-glow
--play-map-shadow
--play-map-muted
--play-sky-top
--play-sky-mid
--play-sky-haze
```

Use variables for:

```text
stage tint
sky overlay
horizon glow
route pulse
signal dot
grid shimmer
HUD border/accent
progress accent
```

Do not attempt full Mapbox style mutation yet.

---

## Route Motion Foundation

Add a minimal route/motion layer.

Goal:

```text
something visible moves on the map
```

Do not wait for real vehicles.

### Minimum implementation

Add a CSS/SVG overlay above map:

```text
animated route line
moving signal dot
route pulse loop
```

### Possible route modes

```text
Demo Loop
Harbor Loop
Manhattan Drift
Bridge Pulse
```

Hard-coded starter route is acceptable.

### Required behavior

```text
route line is visible
route pulse animates
signal dot moves or pulses
motion continues during Not Playing or only during Playing, as chosen
```

For tomorrow, continuous subtle motion is acceptable.

---

## Metadata-Reactive Option

If easy, use current track or playlist metadata:

```text
energy / energyScore → pulse intensity
brightness → glow opacity
density → grid density
moodTags → mood label or accent family
```

If unavailable, use defaults.

Do not build true audio reactivity yet.

---

## Stills / Social / Merch Support

Add a display state that is good for screenshots:

```text
Clean Still Mode
```

or use Show Mode for this.

Need:

```text
no debug controls
clean map stage
palette visible in map style
route/pulse can be paused at attractive frame if easy
```

Optional if easy:

```text
Hide HUD
```

button/toggle for pure map stills.

---

## Non-Goals

Do not implement:

```text
true audio-reactive Web Audio visualizer
full Mapbox layer style editor
full external ColorLab integration
real vehicle simulation
3D object authoring
Studio recovery
full route editor
full WOS postMessage bridge
old Mood Map UI
new scheduler behavior
Node/Vite environment work
```

---

## Implementation Targets

Likely files:

```text
src/ui/BroadcastHUD.tsx
src/ui/BroadcastGridLayer.tsx
src/ui/BroadcastSecondaryLayer.tsx
src/ui/PlaybackTransport.tsx
src/ui/PlaylistHeader.tsx
src/styles.css
src/App.tsx
src/data/playProjectTypes.ts
src/data/playProjectStorage.ts
```

Possible new files:

```text
src/logic/colorLab.ts
src/ui/MapThemePreviewCard.tsx
src/ui/BroadcastMapMotionOverlay.tsx
src/ui/BroadcastShowModeOverlay.tsx
```

---

## Acceptance Criteria

### A. Broadcast Show Mode exists

Broadcast HUD has a show-ready view with non-essential controls hidden or masked.

---

### B. Map controls are cleaned up

The left WOS sidebar and obvious map-native/debug buttons are no longer visually dominant in Show Mode.

---

### C. Sky/atmosphere overlay exists

Broadcast map has a visible sky/haze/vignette/glow treatment.

---

### D. Playlist background can create a color theme

Operator can upload or use playlist background image and generate color swatches.

---

### E. Color theme can be adjusted

At least dominant/accent/glow can be manually adjusted.

---

### F. Map preview uses the theme

Playlist identity/profile shows a small map-style preview using the selected colors.

---

### G. Broadcast HUD uses the theme

The map surface changes tint/glow/sky/route color based on playlist theme.

---

### H. Visible route/motion layer exists

At least one animated route pulse, signal dot, scanline, or grid shimmer is visible.

---

### I. Good still mode is possible

User can get a clean screenshot without dev controls dominating.

---

### J. Project JSON round-trip

Playlist background/theme survives:

```text
export Project JSON
clear LocalStorage
import Project JSON
```

---

### K. 0624C–G behavior does not regress

Must still work:

```text
tsc -b exits 0
catalog import works
Library/Archive/Playlist/Group destinations work
moodSuggestions remain separate
Library Groups panel works
Smart Fill language remains
Flow Graph add/remove/drag works
Broadcast HUD opens
```

---

## Manual Test Checklist

1. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

2. Open a playlist identity/profile panel.

3. Upload or select a background image.

4. Confirm swatches appear.

5. Adjust accent/glow/dominant manually.

6. Confirm mini map preview updates.

7. Open Broadcast HUD.

8. Confirm Show Mode hides/masks WOS/sidebar/debug controls.

9. Confirm sky/haze/vignette/glow is visible.

10. Confirm Broadcast HUD map uses selected playlist theme.

11. Confirm route/signal/grid motion is visible.

12. Take a screenshot/still.

13. Export Project JSON.

14. Clear LocalStorage.

15. Import Project JSON.

16. Confirm background/theme survives.

17. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

PLAY gains a visible show-ready map surface.

The map is no longer just an exposed Mapbox/WOS control screen. It becomes a styled PLAY playback canvas:

```text
playlist image → palette → sky/map theme → animated route/pulse → social/video/still surface
```

This gives the project a visible tomorrow-ready push while deeper systems like true audio-reactive grids, 3D objects, and Studio object placement remain future work.

---

## Implementation Guide

- **Where:** Broadcast HUD, playlist identity/profile, CSS overlays, optional `colorLab.ts`, map preview card, route/motion overlay.
- **What:** Add Show Mode cleanup, sky/atmosphere overlay, playlist background palette extraction, editable swatches, themed map preview, Broadcast theme variables, and simple animated route/signal motion.
- **Expect:** A cleaner, more colorful, visibly moving map playback surface suitable for show/demo stills and short video tests.
