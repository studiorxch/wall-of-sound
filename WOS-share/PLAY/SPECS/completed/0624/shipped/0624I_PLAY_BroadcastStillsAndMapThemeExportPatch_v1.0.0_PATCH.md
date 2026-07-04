# 0624I_PLAY_BroadcastStillsAndMapThemeExportPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Output Capture + Theme Variation

This patch makes the new 0624H show-surface work easier to capture, compare, export, and reuse.

0624H created:

```text
Broadcast Show Mode
map control masks
sky/atmosphere overlay
ColorLab Lite color theme
Map Preview card
Broadcast theme CSS variables
animated route/motion overlay
```

0624I should turn that into practical outputs:

```text
clean stills
theme variations
theme export/import
screenshot-safe frame mode
hide-HUD capture mode
```

The goal is to help produce tomorrow-ready visuals for:

```text
social media stills
short video tests
playlist identity tests
multicolor map tests
merch/pattern experiments
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
0624H = map show surface + ColorLab theme + motion overlay
```

PLAY now has a visible pipeline:

```text
playlist identity
→ background image
→ color theme
→ map preview
→ Broadcast HUD theme
→ animated map motion
```

0624I should make that pipeline easy to capture and reuse.

---

## Goal

Make Broadcast HUD / Map Theme outputs easy to create.

Primary goal:

```text
Operator can quickly produce clean stills and exportable map theme variations.
```

Required result:

```text
clean map still mode
hide-HUD option
theme naming
duplicate theme variation
export theme JSON
import theme JSON
screenshot-safe frame
motion pause/freeze option
```

---

## User-Facing Problem

The current system can create themed moving maps, but the user still needs practical output tools.

For tomorrow’s push, the operator needs to:

```text
test color variations
capture clean screenshots
record short clips
compare themes
reuse good palettes
possibly test map patterns for merch
```

Without dedicated controls, the output workflow is manual and fragile.

---

## Product Direction

Add a small capture/export layer.

Do not build a full media renderer.

This patch should support:

```text
manual screenshot capture
manual screen recording
theme export/import
still-safe show mode
theme variation testing
```

Do not attempt:

```text
programmatic screenshot capture if browser security makes it hard
video rendering
OBS automation
server-side rendering
full merch mockup generator
```

---

## Required Features

## 1. Clean Still Mode

Add a mode for static screenshot capture.

Suggested state:

```ts
broadcastStillMode: boolean
```

or reuse Show Mode with an additional toggle.

Behavior:

```text
hide non-essential HUD elements
pause or soften route motion if requested
keep sky/theme/map visible
keep optional small title/brand stamp if enabled
```

UI label:

```text
Still
```

or:

```text
Clean Still
```

Minimum visible controls:

```text
Show
Still
Hide HUD
```

---

## 2. Hide HUD Toggle

Add:

```text
Hide HUD
```

Behavior:

```text
hides bottom transport/HUD chrome
keeps map theme, sky, route/motion overlay
keeps optional tiny PLAY watermark only if desired
```

This is important for:

```text
social stills
merch pattern tests
clean map screenshots
```

Implementation should be CSS-class based:

```css
.hud-shell--hide-ui .hud-bottom
.hud-shell--hide-ui .hud-top
.hud-shell--hide-ui .playback-transport
```

Use actual class names in project.

---

## 3. Screenshot-Safe Frame Mode

Add a frame/aspect helper for common output formats.

Minimum:

```text
16:9
```

Optional if easy:

```text
1:1
4:5
9:16
```

Do not resize the whole app if too risky.

A simple overlay guide is enough:

```text
safe frame border
center crop guide
```

Suggested UI:

```text
Frame: 16:9 / Square / Vertical
```

Acceptance minimum:

```text
16:9 safe-frame guide visible in Still Mode
```

---

## 4. Motion Pause / Freeze

Add:

```text
Pause Motion
```

or:

```text
Freeze Motion
```

Behavior:

```text
route pulse animation pauses
signal dot freezes
grid shimmer pauses
```

This helps capture crisp stills.

CSS approach:

```css
.hud-shell--motion-paused * {
  animation-play-state: paused;
}
```

Narrow selector if global pause causes problems.

---

## 5. Theme Naming

Add a name field to the playlist color theme.

Suggested type:

```ts
export type PlayColorTheme = {
  name?: string;
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

Default name:

```text
Untitled Map Theme
```

Suggested UI:

```text
Theme Name [____________]
```

---

## 6. Duplicate Theme Variation

Add button:

```text
Duplicate Theme
```

or:

```text
Save Variation
```

If current model supports only one theme per playlist, implement a lightweight version:

```text
Copy current theme to clipboard/export file
or
append "Copy" to name and store as current variation
```

Preferred if manageable:

```ts
playlistMapThemePresets?: PlayColorTheme[];
activeMapThemeId?: string;
```

But this may be too large for one patch.

Minimum acceptable:

```text
Duplicate current theme values into editable fields and rename as "<name> Copy"
```

No need for full theme preset management yet.

---

## 7. Export Theme JSON

Add:

```text
Export Theme
```

Behavior:

Downloads a small JSON file:

```json
{
  "version": "PLAY_MAP_THEME_V1",
  "exportedAt": "...",
  "playlistTitle": "...",
  "theme": {
    "name": "...",
    "dominant": "...",
    "accent": "...",
    "glow": "...",
    "shadow": "...",
    "muted": "...",
    "skyTop": "...",
    "skyMid": "...",
    "haze": "..."
  }
}
```

Suggested filename:

```text
PLAY_MapTheme_<playlist-title>_<theme-name>_YYYY-MM-DD.json
```

---

## 8. Import Theme JSON

Add:

```text
Import Theme
```

Behavior:

```text
user selects exported PLAY map theme JSON
theme fields are applied to current playlist
map preview updates
Broadcast HUD updates
project save persists theme
```

Validation:

```text
must contain version PLAY_MAP_THEME_V1 or compatible theme keys
invalid JSON should show non-crashing error
```

---

## 9. Theme Export Should Not Depend On Project Export

Project JSON already persists the theme.

Theme JSON is a lightweight share/export format for reusing visual identity.

Keep both:

```text
Project JSON = full project state
Theme JSON = small reusable color style
```

---

## 10. Optional Clipboard Copy

If easy, add:

```text
Copy Theme CSS Vars
```

Output:

```css
--play-map-dominant: #071019;
--play-map-accent: #5f73ff;
--play-map-glow: #00d5ff;
--play-map-shadow: #02040a;
--play-map-muted: #263545;
--play-sky-top: #02040a;
--play-sky-mid: #071019;
--play-sky-haze: #0c2a3a;
```

This is useful for quick design tests, screenshots, merch/pattern experiments.

---

## UI Placement

Add controls in two places:

### Playlist Identity / Map Color Theme section

Add:

```text
Theme Name
Duplicate Theme / Save Variation
Export Theme
Import Theme
Copy CSS Vars optional
```

### Broadcast HUD Show controls

Add:

```text
Show
Still
Hide HUD
Freeze Motion
Frame 16:9
```

Do not clutter show surface. Controls should collapse or appear only in Edit/Show toolbar.

---

## Styling Requirements

Still Mode / Hide HUD should make the map surface clean.

Suggested CSS classes:

```text
.hud-shell--show
.hud-shell--still
.hud-shell--hide-ui
.hud-shell--motion-paused
.hud-shell--frame-16x9
```

Add safe-frame overlay:

```text
.broadcast-safe-frame
```

Frame guide should be subtle, not ugly.

---

## Data Model

Update theme type if needed:

```ts
export type PlayColorTheme = {
  id?: string;
  name?: string;
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

If theme type lives in:

```text
src/logic/colorLab.ts
```

update it there.

If playlist stores theme directly, no larger migration is required.

Repair rule:

```text
if colorTheme exists and has no name, name = "Untitled Map Theme"
```

Do not break existing 0624H projects.

---

## New Helper

Optional new file:

```text
src/logic/mapThemeExport.ts
```

Suggested API:

```ts
export type PlayMapThemeExport = {
  version: "PLAY_MAP_THEME_V1";
  exportedAt: string;
  playlistTitle: string;
  theme: PlayColorTheme;
};

export function buildMapThemeExport(params: {
  playlistTitle: string;
  theme: PlayColorTheme;
}): PlayMapThemeExport;

export function parseMapThemeExport(input: unknown): PlayColorTheme | null;

export function downloadMapThemeJson(params: {
  playlistTitle: string;
  theme: PlayColorTheme;
}): void;
```

Use existing download helpers if available.

---

## Non-Goals

Do not implement:

```text
automatic screenshot capture
video export/rendering
OBS automation
server-side rendering
full theme library manager
full merch mockup generator
full ColorLab external app integration
Mapbox internal style mutation
true audio-reactive grids
new route editor
3D objects
Node/Vite environment work
```

---

## Implementation Targets

Likely files:

```text
src/logic/colorLab.ts
src/ui/PlaylistHeader.tsx
src/ui/BroadcastHUD.tsx
src/ui/BroadcastGridLayer.tsx
src/ui/BroadcastSecondaryLayer.tsx
src/styles.css
src/App.tsx
src/data/playProjectTypes.ts
src/data/playProjectStorage.ts
```

Possible new file:

```text
src/logic/mapThemeExport.ts
```

---

## Acceptance Criteria

### A. Clean Still Mode exists

Broadcast HUD can enter Still Mode for screenshots.

---

### B. Hide HUD works

User can hide visible HUD chrome while keeping map, sky/theme, and route/motion overlay visible.

---

### C. Freeze Motion works

Route/signal/grid animations can pause for still capture.

---

### D. 16:9 safe-frame guide exists

A screenshot-safe 16:9 guide is available in Still Mode.

---

### E. Theme can be named

Playlist map theme has editable name and persists.

---

### F. Theme can be duplicated or saved as variation

At minimum, current theme can be duplicated into editable fields with a copy name.

---

### G. Theme JSON export works

User can export a lightweight map theme JSON file.

---

### H. Theme JSON import works

User can import theme JSON and apply it to current playlist.

---

### I. Project JSON round-trip still works

Theme name/settings survive:

```text
export Project JSON
clear LocalStorage
import Project JSON
```

---

### J. 0624H visuals remain

Do not regress:

```text
Map Color Theme section
8 color swatches
Map Preview card
Broadcast HUD theme vars
Sky/atmosphere overlay
Show Mode masks
BroadcastMapMotionOverlay
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

2. Open playlist identity/profile.

3. Confirm map theme has a name field.

4. Adjust colors.

5. Click Export Theme.

6. Confirm JSON downloads.

7. Reset or change colors.

8. Import exported theme JSON.

9. Confirm swatches and preview update.

10. Open Broadcast HUD.

11. Toggle Still Mode.

12. Toggle Hide HUD.

13. Toggle Freeze Motion.

14. Confirm 16:9 safe-frame appears.

15. Capture a clean screenshot manually.

16. Export Project JSON.

17. Clear LocalStorage.

18. Import Project JSON.

19. Confirm theme name/colors survive.

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

PLAY can now produce clean themed map stills and reusable map theme exports.

This makes 0624H’s color/map work practical for:

```text
social posts
short visual tests
playlist identity experiments
multicolor map comparisons
early merch/pattern exploration
```

The result should feel like an output tool, not just an internal UI setting.

---

## Implementation Guide

- **Where:** Playlist identity/map theme controls, Broadcast HUD show controls, ColorLab theme type, optional `mapThemeExport.ts`, CSS show/still classes.
- **What:** Add Still Mode, Hide HUD, Freeze Motion, 16:9 frame guide, theme naming, theme duplicate, theme JSON export/import, and optional CSS var copy.
- **Expect:** The operator can quickly make clean map stills and reuse playlist map themes across projects.
