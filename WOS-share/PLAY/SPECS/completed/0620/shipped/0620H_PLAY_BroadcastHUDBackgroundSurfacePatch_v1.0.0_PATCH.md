# 0620H_PLAY_BroadcastHUDBackgroundSurfacePatch_v1.0.0_PATCH

## Patch Name

**PLAY Broadcast HUD Background Surface Patch**

## Version

`v1.0.0`

## Date

2026-06-21

## Status

Draft for implementation

---

# 1. Purpose

0620G simplified the Broadcast HUD transport into a minimal playback signal.

The current HUD is cleaner, but the visual structure still uses too many purple divider/frame lines. The duration/progress line is useful because it communicates playback state. The other similar purple structural lines mostly act as container borders and make the surface feel more like a wireframe/dashboard than a finished broadcast scene.

0620H shifts Broadcast HUD from:

```text
boxed interface panels
```

toward:

```text
full-bleed broadcast surface with functional overlays
```

Core principle:

```text
Purple should indicate state, not structure.
```

---

# 2. Product Context

Current PLAY build chain:

```text
0619A — multi-playlist workspace ✅
0619B — drag-to-playlist ✅
0619C — fill / regenerate controls ✅
0620A — integrity + playback safety ✅
0620B — playlist identity ✅
0620C — Broadcast HUD mode ✅
0620D — Broadcast Card / Bumper Preview ✅
0620E — Now / Next Queue Panel ✅
0620F — HUD polish + card separation ✅
0620G — Minimal Broadcast Transport ✅
```

PLAY now has a working Broadcast HUD, queue rail, and minimal transport.

0620H is a visual surface refinement patch.

---

# 3. Patch Goal

Make Broadcast HUD feel more like a cinematic music broadcast scene by:

- filling the available HUD surface with playlist background imagery
- removing unnecessary purple container outlines/divider lines
- preserving functional state accents
- improving separation through dark overlays, glass, opacity, gradients, spacing, and shadows
- keeping the bottom playback progress line as a useful duration/state indicator

The result should feel less like:

```text
spreadsheet
dashboard
wireframe
engineering panel
```

and more like:

```text
broadcast scene
music channel HUD
cinematic control surface
playlist world
```

---

# 4. Scope

## Included

### A. Full-Bleed Broadcast Background

Use the active playlist background image as the primary Broadcast HUD surface where available.

Fallback order:

```text
1. playlist.backgroundImage
2. blurred/expanded playlist cover image if feasible
3. dark fallback surface
```

### B. Reduce Purple Structural Lines

Remove or soften non-functional purple lines, especially:

- large container border lines
- full-width dividers that only frame sections
- panel outlines that do not communicate state
- repeated horizontal rules that make the layout feel boxed

### C. Preserve Functional Accent Lines

Keep state-bearing accents:

- bottom playback duration/progress line
- active mode indicator
- current/now-playing accent if useful
- small current track progress in queue rail if useful
- warning/critical/weak markers where they communicate real state

### D. Add Readability Layer

Add a dark veil / vignette / gradient overlay so text and graph remain readable over imagery.

### E. Panel Separation Without Hard Borders

Use non-border separation:

- translucent surfaces
- backdrop blur if performant
- soft shadow
- spacing
- subtle opacity shifts
- local gradient behind text

### F. OBS-Safe Composition

Ensure background imagery does not introduce layout jumps, scrollbars, or readability problems in OBS/browser capture.

---

# 5. Non-Goals

Do not implement in this patch:

- audio-reactive visualizer
- waveform display
- scheduler
- transition editor
- new queue features
- new playback controls
- new card templates
- AI image generation
- image cropping/editor tools
- WOS map integration changes
- OBS API integration
- video export
- shader/particle system

This is a Broadcast HUD surface/polish patch.

---

# 6. Visual Rule

Lock in this rule:

```text
Purple = state
Not purple = structure
```

Allowed purple/state uses:

```text
playback progress
active mode
current playing accent
selected/current queue item
critical/weak/locked semantic markers if already defined
```

Avoid purple for:

```text
generic panel borders
large frame outlines
non-functional section dividers
decorative grid lines
box outlines around every region
```

---

# 7. Background Layer

## Required Behavior

Broadcast HUD should render a full-bleed background layer beneath the HUD.

Recommended stack:

```text
[background image / cover blur / dark fallback]
[dark veil]
[optional vignette]
[HUD content]
```

## Background Source Priority

```text
1. playlist.backgroundImage.src
2. playlist.coverImage.src as blurred/expanded fallback
3. dark fallback
```

## Dark Veil

The veil should be strong enough to preserve readability.

Suggested CSS concept:

```css
.broadcast-hud-bg::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at center, rgba(0,0,0,0.18), rgba(0,0,0,0.72)),
    linear-gradient(to bottom, rgba(5,6,14,0.50), rgba(5,6,14,0.82));
}
```

Use project styling conventions.

---

# 8. Graph Surface

The graph can remain in Broadcast HUD because it acts as navigation.

But it should feel embedded in the scene, not framed like a spreadsheet.

## Required Changes

- reduce heavy box boundaries around the graph
- avoid purple borders around the graph container
- keep the graph readable through local dark panel/veil
- keep axes/grid subtle
- keep flow curve visible
- keep warning zones visible only if meaningful

## Acceptable Treatment

```text
soft dark glass panel
low-opacity chart grid
no hard neon frame
subtle inner shadow
```

## Do Not Remove

Do not remove:

- flow curve
- track nodes
- playing node
- warning markers
- readOnly safety
- SVG clipping fix from 0620F

---

# 9. Queue Rail Surface

The Now / Next queue rail should remain readable but should not feel boxed.

## Required Changes

- reduce hard border between graph and rail
- use soft background panel or gradient
- keep NOW / NEXT / UP NEXT readable
- preserve current/next accent line only if useful
- avoid repeating the same purple frame language

## Keep

- current track status
- next/up-next details
- skipped summary
- duration/slot information

---

# 10. Transport Surface

The minimal transport from 0620G should remain.

## Keep

- state glyph
- track title/artist
- elapsed/duration
- bottom progress line

## Remove/Reduce

- extra top border/divider if not necessary
- extra purple structural line above transport
- any non-state framing around the transport

## Progress Line

The progress line is functional and should remain.

It can be the strongest purple/accent line in the Broadcast HUD.

---

# 11. Header Surface

The playlist identity header should float over the background rather than feel boxed in.

## Required Changes

- reduce structural border under header
- keep cover/monogram, title, stats, tags
- preserve active mode indicator
- use background veil/gradient for readability

## Optional

- header may use a soft gradient fade into body
- accent dot/state indicator may remain

---

# 12. CSS Strategy

Prefer class-level styling changes over component rewrites.

Likely changes:

```text
.broadcast-hud-shell
.broadcast-hud-background
.broadcast-hud-veil
.broadcast-hud-header
.broadcast-hud-body
.broadcast-hud-curve-panel
.broadcast-hud-queue-rail
.minimal-broadcast-transport
```

If adding new classes, keep naming explicit.

---

# 13. Background Image Failure

If background image fails:

- fall back to cover blur if available
- otherwise dark fallback
- do not crash
- do not show broken image icon
- do not collapse layout

If cover blur also fails:

```text
dark fallback
```

---

# 14. Performance

Avoid heavy effects.

Acceptable:

- background image
- CSS gradient overlay
- mild blur if already performant
- opacity/translucency
- box-shadow

Avoid:

- heavy animated blur
- particle fields
- video shaders
- repeated expensive filters
- canvas visualizer

---

# 15. OBS / Browser Capture Requirements

Broadcast HUD should remain:

- stable at full browser size
- readable at 1920x1080
- no accidental scrollbars
- no layout jumps when image loads
- no broken image artifacts
- no large empty boxed areas
- no excessive purple framing

---

# 16. Expected Files To Touch

Likely files:

```text
src/ui/BroadcastHudShell.tsx
src/ui/NowNextQueuePanel.tsx
src/ui/MinimalBroadcastTransport.tsx
src/ui/FlowCurveCanvas.tsx
src/styles.css
```

Possible helpers:

```text
src/playlistIdentity.ts
src/ui/BroadcastHudBackground.tsx
```

Use actual project paths.

---

# 17. Acceptance Criteria

## Background Surface

- Broadcast HUD uses playlist background image when available.
- Broadcast HUD falls back to cover blur or dark fallback.
- Background fills the HUD surface.
- Background does not create scrollbars.
- Broken background image fails safely.

## Purple Line Reduction

- Non-functional purple container lines are removed or softened.
- Bottom playback progress line remains.
- Active/playing accents remain where useful.
- Purple is no longer used as generic structure around every panel.

## Readability

- Playlist title remains readable.
- Graph remains readable.
- Queue rail remains readable.
- Minimal transport remains readable.
- Text remains readable over imagery.

## Surface Separation

- Graph panel feels embedded, not boxed.
- Queue rail feels integrated, not boxed.
- Transport feels like a playback signal, not a control cluster.
- Header feels like identity layer, not a boxed form.

## No Regressions

- Broadcast HUD still works.
- Minimal transport still works.
- Queue panel still works.
- Flow curve still renders and remains readOnly in HUD.
- Editor mode still works.
- Broadcast Card Preview still works.
- Playback still works.

---

# 18. Manual Test Plan

## Test 1 — Background Image

1. Add playlist background image.
2. Enter Broadcast HUD.
3. Confirm image fills the HUD surface.
4. Confirm dark veil preserves readability.

Expected:

```text
HUD feels like a broadcast scene, not a boxed dashboard.
```

## Test 2 — No Background Image

1. Clear playlist background image.
2. Keep cover image.
3. Enter Broadcast HUD.

Expected:

```text
Cover blur or dark fallback renders safely.
```

## Test 3 — Broken Background

1. Enter invalid background URL.
2. Enter Broadcast HUD.

Expected:

```text
No broken image icon. Fallback appears.
```

## Test 4 — Purple Line Reduction

1. Compare HUD before/after patch.
2. Confirm unnecessary purple divider/frame lines are reduced.
3. Confirm progress line remains.

Expected:

```text
Purple is used for state, not generic structure.
```

## Test 5 — Queue Rail Readability

1. Start playback.
2. Confirm NOW / NEXT / UP NEXT remains readable over background.
3. Confirm rail does not require a heavy border.

Expected:

```text
Queue remains readable and integrated.
```

## Test 6 — Graph Readability

1. Enter Broadcast HUD with background image.
2. Confirm graph is legible.
3. Confirm flow line and nodes remain visible.
4. Confirm no node overflow regression.

Expected:

```text
Graph functions as navigation layer without feeling like a boxed spreadsheet.
```

## Test 7 — OBS Capture

1. Fullscreen Broadcast HUD.
2. Capture in OBS/browser.
3. Confirm stable composition, no scrollbars, no layout jumps.

Expected:

```text
HUD is capture-safe and more cinematic.
```

---

# 19. Implementation Order

Recommended:

```text
1. Add/confirm Broadcast HUD background layer.
2. Wire playlist background image fallback stack.
3. Add dark veil/vignette.
4. Remove/soften non-functional purple borders.
5. Preserve bottom progress line and active accents.
6. Adjust graph panel surface.
7. Adjust queue rail surface.
8. Adjust header/transport separators.
9. Test broken image fallback.
10. Test fullscreen/OBS capture.
```

---

# 20. Claude / Codex Notes

Keep this patch visual and restrained.

Do not introduce a new feature system.

Do not remove the graph from Broadcast HUD.

Do not remove the progress line.

Do not change Editor mode unless styles are globally leaking.

The key judgment:

```text
If a line communicates state, it can stay.
If a line only outlines a box, remove or soften it.
```

---

# 21. Product Principle

```text
Broadcast HUD should feel like a music channel surface,
not a developer dashboard.
```

The HUD should be built from:

```text
image
veil
state accents
floating panels
playback signal
```

not:

```text
boxed panels
purple outlines
grid-heavy framing
control clutter
```
