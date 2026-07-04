# 0624T_PLAY_TypedOverlayMicrographicsVisualTuningPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P1 / Visual Tuning After 0624S

This patch tunes the typed track index overlay and micrographics grid introduced in 0624S.

0624S established the correct direction:

```text
map is primary
bottom dock is no longer the main UI
track identity appears as typed broadcast typography
micrographics carry status information
route/play moved toward the top bar
```

0624T should refine the visual language only.

Do not add new systems.

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

Completed:

```text
0624M = removed fake route line/dot, dark haze, capture clutter
0624N = restored WOS route/map launch
0624O = hid WOS chrome in embed mode
0624P = restored minimal route controller + Canvas access
0624Q = restored map pan/zoom interaction
0624R = removed bottom playback/status bar, reduced route controller
0624S = added top-bar play, typed track index, micrographics grid
```

Current verified direction:

```text
map is interactive
typed track index overlay renders
micrographics grid renders
bottom dock is no longer the main idea
overlays are pointer-events: none
tsc -b clean
```

Current visual issue:

```text
typed overlay is a good first pass but too polite
micrographics grid is useful but still app-like
top overlay needs stronger anti-design / archive / technical identity
```

---

## Goal

Make the typed track overlay and micrographics grid look more intentional, unconventional, and map-native.

Required result:

```text
stronger double-digit track index
more anti-design title treatment
tighter metadata hierarchy
micrographics grid feels like a technical map legend, not a normal app card
map interaction remains untouched
bottom dock stays gone
```

---

## Non-Negotiable Scope

This is visual tuning only.

Do not change:

```text
route launch behavior
iframe source resolution
map pointer-event fixes
WOS embed params
playlist assignment logic
snapshot behavior
Canvas link behavior
```

Do not add:

```text
new modes
capture/still/freeze
16:9 frame
fake route line
signal dot
dark haze
new route controller
audio-reactive grid
metadata-reactive grid
new 3D sky
```

---

## Visual Direction

Use the Pinterest micrographics reference as direction, but keep density low.

Desired feel:

```text
technical legend
archive label
transit document
pirate broadcast
machine terminal
anti-design caption system
map instrument index
```

Avoid:

```text
Spotify card
standard media player
rounded app widget
bottom dock
pretty glassmorphism
emoji UI
heavy HUD clutter
```

---

## Typed Track Index Overlay Tuning

Current format should become more graphic.

### Required structure

Use the double-digit playlist index as the anchor:

```text
01
```

Then render title as a technical identifier:

```text
EGGO_REVERIE_S01
```

Then smaller metadata:

```text
STUDIORICH / ROBOT BLIPS AND QUIPS
```

or:

```text
SRC ROBOT BLIPS AND QUIPS
ARTIST STUDIORICH
```

### Suggested layout

```text
01
EGGO_REVERIE_S01
SRC / ROBOT BLIPS AND QUIPS
ARTIST / STUDIORICH
```

Alternative:

```text
[01] / EGGO_REVERIE_S01
      ROBOT_BLIPS_AND_QUIPS
      STUDIORICH
```

### Required behavior

Keep existing behavior:

```text
appears on track change
large reveal for ~4 seconds
collapses to compact index-only or index/title
pointer-events: none
```

Do not change the timing unless visually necessary.

---

## Typography Tuning

Use a more anti-design stack.

Current stack may remain, but tune hierarchy.

Suggested CSS:

```css
.broadcast-track-index-overlay {
  font-family:
    "Share Tech Mono",
    "IBM Plex Mono",
    "OCR A Std",
    "Arial Narrow",
    monospace;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.035em;
}

.broadcast-track-index-number {
  font-size: clamp(68px, 10vw, 168px);
  line-height: 0.78;
  letter-spacing: -0.12em;
  font-weight: 400;
}

.broadcast-track-title {
  font-size: clamp(15px, 1.65vw, 28px);
  line-height: 1.05;
  letter-spacing: 0.015em;
}

.broadcast-track-meta {
  font-size: 9px;
  line-height: 1.25;
  letter-spacing: 0.12em;
  opacity: 0.68;
}
```

Adjust values to fit current screen.

The number should feel more like an index stamp than a conventional title.

---

## Text Transformation

Add display-only formatting helper.

Suggested behavior:

```text
EGGO REVERIE S01 → EGGO_REVERIE_S01
Soft Disconnects & Other Memory Errors → SOFT_DISCONNECTS_PLUS_OTHER_MEMORY_ERRORS
Unknown Artist → UNKNOWN_ARTIST
```

Rules:

```text
uppercase
trim
replace spaces with underscores in title line
replace ampersand with PLUS or AND
collapse duplicate separators
do not mutate stored metadata
display only
```

Suggested helper:

```ts
formatMicroText(value: string | undefined): string
```

---

## Type-On Animation

Current typed reveal should feel sharper.

Preferred:

```text
hard cursor
small flicker
no cute smooth fade
brief scanline blink optional
```

Keep it light.

CSS idea:

```css
.broadcast-type-cursor::after {
  content: "_";
  animation: playCursorBlink 0.75s steps(1) infinite;
}
```

No heavy glitch effect.

---

## Micrographics Grid Tuning

The grid should feel like a technical map legend.

### Required fields

Keep compact:

```text
STATUS    ROUTES LIVE
TRACK     01/--
SOURCE    WOS LOCAL
CHANNEL   BROADCAST HUD
```

Add only if available without new logic:

```text
MODE      DRIVE
SPEED     1X
MAP       NYC
```

### Styling

Use thin lines / labels, not a card.

Suggested:

```css
.broadcast-microgrid {
  background: transparent;
  border-left: 1px solid rgba(180, 220, 255, 0.28);
  padding-left: 10px;
  font-size: 9px;
  line-height: 1.25;
  opacity: 0.78;
  pointer-events: none;
}

.broadcast-microgrid-row {
  display: grid;
  grid-template-columns: 54px auto;
  column-gap: 10px;
}

.broadcast-microgrid-label {
  opacity: 0.45;
  letter-spacing: 0.14em;
}

.broadcast-microgrid-value {
  opacity: 0.82;
}
```

Avoid boxed widget styling.

---

## Positioning

Current overlay placement is acceptable if it does not block map reading.

Recommended:

```text
typed overlay: upper-left / left-third
microgrid: upper-right under PLAY toolbar
```

Maintain safe spacing below browser/top app chrome.

Avoid bottom placement.

---

## PLAY Toolbar Tuning

Do not overhaul the toolbar in this patch.

Allowed:

```text
make ▶ slightly more integrated
make Routes: Live less badge-like if easy
```

Not allowed:

```text
new toolbar layout
new route system
new buttons
```

---

## Acceptance Criteria

### A. Typed overlay still appears

On track change, typed overlay appears and collapses as before.

---

### B. Double-digit index is stronger

Track index displays as:

```text
01
02
03
```

with stronger graphic presence.

---

### C. Title treatment is anti-design

Title line uses uppercase technical formatting, such as underscores or compact archive styling.

---

### D. Metadata hierarchy is clearer

Artist / playlist / source metadata is smaller and less conventional.

---

### E. Micrographics grid is less app-like

Grid looks like a technical map legend, not a rounded app card.

---

### F. Pointer transparency remains

Typed overlay and microgrid remain:

```text
pointer-events: none
```

---

### G. Map interaction remains working

In Operate:

```text
drag → pan
scroll/trackpad → zoom
```

---

### H. Bottom dock does not return

No bottom route dock or bottom playback/status bar returns.

---

### I. No removed clutter returns

Do not restore:

```text
fake line
signal dot
haze
capture/still/freeze/16:9 modes
emoji icons
WOS cockpit chrome
```

---

### J. tsc clean

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

1. Start WOS local route server.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm map loads.

5. Confirm map still pans/zooms.

6. Trigger or simulate track change.

7. Confirm large double-digit index appears.

8. Confirm title uses technical uppercase formatting.

9. Wait for collapse.

10. Confirm collapsed state still reads cleanly.

11. Confirm micrographics grid is visible and sparse.

12. Confirm overlays do not block map drag.

13. Confirm bottom dock remains gone.

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

The Broadcast HUD keeps the functional 0624S direction but looks more intentional:

```text
large archive-like track index
technical typed title reveal
small micrographics map legend
interactive map stays primary
no bottom dock
```

This is the first real visual step toward the unconventional PLAY broadcast interface.

---

## Implementation Guide

- **Where:** `TypedTrackIndexOverlay.tsx`, `BroadcastMicrographicsGrid.tsx`, Broadcast HUD CSS.
- **What:** Tune typography, title formatting, index hierarchy, animation/cursor feel, and micrographics grid styling.
- **Expect:** The overlay looks less like a normal app label and more like a technical broadcast/map micrographic layer.
