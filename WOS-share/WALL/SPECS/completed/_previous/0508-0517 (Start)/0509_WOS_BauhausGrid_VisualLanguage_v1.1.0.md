---
layout: spec
title: "WOS Bauhaus Grid Visual Language"
date: 2026-05-09
doc_id: "0509_WOS_BauhausGrid_VisualLanguage_v1.1.0"
version: "1.1.0"

project: "Wall of Sound"
system: "WOS"
domain: "visual_music"
component: "bauhaus_grid"

type: "implementation-spec"
status: "active"
priority: "high"
risk: "medium"

summary: "Improves the canonical Bauhaus MIDI grid renderer visually while preserving the one-button MIDI Bank → Grid Environment Layer → Fit Frame path."

depends_on:
  - "0508_WOS_BauhausGrid_CanonicalCleanup_v1.0.0"
  - "0508_WOS_MIDIPlaybackTruthPatch_v1.0.0"
  - "0508_WOS_MIDIPlayback_SourceLengthPatch_v1.0.1"
  - "0508_WOS_MIDIPlayback_SingleAuthorityPatch_v1.0.2"

enables:
  - "bauhaus-pattern-library"
  - "midi-generated-environment-map"
  - "future-character-layer-interactions"
  - "visual-language-lock"

tags:
  - "bauhaus"
  - "grid"
  - "visual-language"
  - "midi"
  - "renderer"
  - "environment-layer"
---

# 0509_WOS_BauhausGrid_VisualLanguage_v1.1.0

## 1. Goal

Improve the visual language of the canonical Bauhaus MIDI grid without adding new user-facing controls.

Current path remains:

```txt
MIDI Bank
→ Generate Bauhaus Grid
→ Grid Environment Layer
→ Bauhaus Renderer
→ Fit Frame
→ MIDI Playback Truth
```

The goal is to make the grid feel intentionally designed, not like raw colored MIDI pixels.

## 2. Current Baseline

Treat this as working:

```txt
MIDI import works
MIDI playback bridge works
Legacy walker/stroke audio is muted by default
Bauhaus grid generates from active MIDI bank
Grid blocks match playback event count
Grid renders in frame-space, not camera/world-space
World tab has one simple Generate Bauhaus Grid path
System HUD shows runtime truth
```

Do not disturb this baseline.

## 3. Design Intent

The Bauhaus grid should read as:

```txt
music-generated architecture
environment map
tile-based score
visual rhythm field
```

Not:

```txt
random rainbow pixels
debug MIDI grid
old note meter
skittles panel
```

The visual language should be simple, repeatable, and computational.

## 4. Canonical Visual Rules

For v1.1.0, keep one renderer:

```txt
bauhausMinimal
```

Renderer characteristics:

```txt
square grid foundation
note-class color family
Bauhaus-inspired accent geometry
quiet background structure
clear active-note pulse
no UI variations yet
```

No new dropdowns.

## 5. Files To Touch

Allowed:

```txt
wall/engine/gridSystem.js
wall/main.js
```

Optional only if needed:

```txt
wall/styles.css
```

Do not touch:

```txt
wall/index.html
wall/ui/controls.js
wall/engine/registry.js
wall/engine/schemas.js
wall/render/canvasRenderer.js
wall_v20260508/
```

unless there is a one-line safety fix.

## 6. Forbidden Changes

Do not:

- add visual option controls
- add new block style dropdowns
- add new placement dropdowns
- add new color mode dropdowns
- change MIDI import
- change MIDI playback timing
- change legacy walker audio flags
- change grid count logic
- change fit-frame math
- change World tab layout
- add parallax
- add character objects
- add persistence
- rewrite the renderer architecture

## 7. Visual Language Principles

### 7.1 Use note class as color identity

Keep the 12-note color map.

But reduce raw saturation dominance by layering structure:

```txt
base tile = note color, slightly muted
accent mark = brighter or lighter version
active mark = high contrast
```

### 7.2 Use velocity as visual weight

Velocity should influence subtle visual weight, not placement.

Use velocity to determine:

```txt
accent opacity
accent size
stroke intensity
```

Do not use velocity to change grid position.

### 7.3 Use duration as accent shape scale

Longer notes can receive larger internal marks.

Short notes stay minimal.

Duration should not alter tile count.

### 7.4 Use time/order as rhythm

The packed grid order already encodes time.

Do not scramble it.

## 8. Required Block Data Enrichment

When generating blocks in `generateGridBlocksFromMidiBank()`, ensure each block has:

```js
sourceIndex
sequenceIndex
note
noteClass
velocity
velocityNorm
startBeat
durationBeats
durationNorm
accentKind
```

If some already exist, do not duplicate.

Suggested:

```js
var velocityNorm = Math.max(0, Math.min(1, (evt.velocity || 64) / 127));
var durationNorm = Math.max(0, Math.min(1, (evt.durationBeats || 0.25) / 2));
var accentKind = noteClass % 4;
```

Add these to each block:

```js
sourceIndex: evt.index != null ? evt.index : idx,
velocityNorm: velocityNorm,
durationNorm: durationNorm,
accentKind: accentKind,
```

Important:

- `sourceIndex` must align with normalized MIDI playback event `index` when possible.
- Do not change `blocks.length`.
- Do not change event sorting.

## 9. Bauhaus Accent Marks

Add one internal accent mark per tile.

The tile itself stays square.

The accent mark varies by `accentKind`.

Required four accent kinds:

```txt
0 = small circle
1 = horizontal bar
2 = vertical bar
3 = inset square
```

Each mark is drawn inside the tile.

Suggested sizing:

```js
var pad = Math.max(1, Math.floor(size * 0.18));
var accentScale = 0.35 + block.velocityNorm * 0.45;
var accentSize = Math.max(1, size * accentScale);
```

Duration may increase the accent slightly:

```js
accentSize *= 0.85 + block.durationNorm * 0.3;
```

## 10. Color Handling

Add helper in `gridSystem.js`:

```js
function hexToRgb(hex) {}
function rgbaFromHex(hex, alpha) {}
function lightenHex(hex, amount) {}
function muteHex(hex, amount) {}
```

Keep these small and safe.

Suggested behavior:

```txt
tile fill = muted note color
accent fill = lighter note color
active stroke/glow = near-white + note color
```

Do not add external color libraries.

## 11. Renderer Behavior

Update `renderGridBlock()` or add `renderBauhausGridBlock()`.

Preferred:

```js
function renderBauhausGridBlock(ctx, block, style, renderState) {}
```

Then inside `renderGridLayer()`:

```js
if (layer.renderer && layer.renderer.id === "bauhausMinimal") {
  renderBauhausGridBlock(ctx, block, style, renderState);
} else {
  renderGridBlock(ctx, block, style, renderState);
}
```

If `layer.renderer` is not reliably present, also accept:

```js
layer.grid && layer.grid.tileStyle === "square"
```

but avoid creating a second visible renderer path.

## 12. Bauhaus Tile Rendering

Each tile should render:

```txt
base square
thin internal structure line or accent
optional active pulse
```

Suggested drawing order:

```js
ctx.save();

draw muted base square
draw accent mark
if active:
  draw inset white stroke
  draw subtle outer glow/pulse

ctx.restore();
```

Use `globalAlpha` carefully. Do not overbrighten the whole field.

## 13. Active Note Pulse

Active pulse should be visible but not obnoxious.

Active block behavior:

```txt
scale 1.06
opacity boost
thin white inset stroke
small note-color glow
```

Do not scale so much that dense grids overlap badly.

Suggested:

```js
var scale = block.active ? 1.06 : 1;
var activeAlpha = block.active ? 1 : baseAlpha;
```

## 14. Dense Grid Safety

For very dense grids such as 11,606 notes:

```txt
cell size may be 10–12px
accent marks must not become noisy blobs
```

When `cellSize < 8`:

```txt
skip complex accent geometry
draw base square + tiny center mark only
```

When `cellSize < 5`:

```txt
draw base square only
```

This avoids visual mud.

## 15. Sparse Grid Safety

For small tracks:

```txt
cell size may become 45–90px
```

Large cells should look intentional, not empty.

For `cellSize >= 24`, accent marks should be clearly visible.

For `cellSize >= 48`, allow slightly stronger internal geometry:

```txt
accent bar/circle/square larger
thin inset line
```

## 16. Layer Metadata

Generated Bauhaus grid layer should include:

```js
renderer: {
  id: "bauhausMinimal",
  version: "1.1.0"
}
```

and grid metadata:

```js
grid: {
  visualLanguage: "bauhausMinimal",
  visualVersion: "1.1.0"
}
```

Do not break existing debug stats.

## 17. Debug Stats Update

Update `_wos.debugGridStats()` to include:

```js
visualLanguage
visualVersion
rendererId
activeBlocks
```

Active block count:

```js
activeBlocks: blocks.filter(function (b) { return b.active; }).length
```

Do not remove existing fields.

## 18. No UI Change

World tab should still show only:

```txt
MIDI Bank
Generate Bauhaus Grid
Clear Grid
Environment layer list
```

Do not add visual style controls.

## 19. Test Flow

### 19.1 Reload

```js
_wos.validateRegistry()
_wos.validateSchemas()
_wos.sound.test(60, 100)
```

Expected:

```txt
No validation errors.
Sound test works.
```

### 19.2 Drop MIDI

Drop a `.mid`.

```js
_wos.midiPlayback.events().length
```

Expected:

```txt
> 0
```

### 19.3 Generate Grid

```js
_wos.generateBauhausGrid()
_wos.debugGridStats()
```

Expected:

```txt
gridBlocks === playbackEvents
visualLanguage: "bauhausMinimal"
visualVersion: "1.1.0"
```

### 19.4 Visual Inspection

Test at least three MIDI densities:

```txt
small file: under 1,000 notes
medium file: 1,000–6,000 notes
dense file: 10,000+ notes
```

Expected:

```txt
small = large designed tiles with visible accent marks
medium = readable pattern field
dense = clean texture, not muddy
```

### 19.5 Playback

```js
_wos.midiPlayback.enable()
_wos.midiPlayback.legacyWalkerAudio(false)
```

Press Play.

Expected:

```txt
One canonical MIDI playback path.
Grid active pulse visible.
No legacy doubled audio by default.
```

## 20. Acceptance Criteria

Pass is complete when:

1. Existing canonical grid generation still works.
2. Grid block count still matches MIDI playback events.
3. Visuals look more intentional than raw note pixels.
4. Small/medium/dense MIDI files all remain readable.
5. Active note pulse is visible.
6. No new user-facing controls were added.
7. MIDI playback behavior was not changed.
8. World tab stayed simple.

## 21. Stop Condition

Stop after the visual renderer improves.

Do not continue into:

```txt
advanced Bauhaus shape language
pattern presets
user style controls
character objects
parallax
persistence
ping-pong/reverse MIDI playback
```

Those are future specs.
