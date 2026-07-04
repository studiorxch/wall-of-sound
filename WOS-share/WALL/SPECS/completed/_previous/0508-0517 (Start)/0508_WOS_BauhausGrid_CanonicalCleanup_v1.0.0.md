---
layout: spec
title: "WOS Bauhaus Grid Canonical Cleanup"
date: 2026-05-08
doc_id: "0508_WOS_BauhausGrid_CanonicalCleanup_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "visual_music"
component: "bauhaus_grid"

type: "implementation-spec"
status: "active"
priority: "high"
risk: "medium"

summary: "Simplifies the MIDI-to-grid environment path into one canonical Bauhaus grid generator: MIDI Bank → Grid Environment Layer → Bauhaus Renderer → Fit Frame, removing confusing UI variations without changing the MIDI importer or playback bridge."

depends_on:
  - "0508_WOS_RegistryStatusSpine_v1.0.0"
  - "0508_WOS_SchemaStateSpine_v1.0.0"
  - "0508_WOS_MinimalSystemHUD_v1.0.0"
  - "0508_WOS_SystemHUD_RuntimeTruthPatch_v1.0.1"
  - "0508_WOS_MIDIPlaybackTruthPatch_v1.0.0"

enables:
  - "midi-generated-environment-map"
  - "bauhaus-pattern-generation"
  - "grid-note-active-visuals"
  - "future-character-layer-interactions"

tags:
  - "bauhaus"
  - "grid"
  - "midi"
  - "environment-layer"
  - "canonical-cleanup"
  - "ui-reduction"
---

# 0508_WOS_BauhausGrid_CanonicalCleanup_v1.0.0

## 1. Goal

Create one clean canonical path for the Bauhaus MIDI grid environment.

The path is:

```txt
MIDI Bank
→ Grid Environment Layer
→ Bauhaus Renderer
→ Fit Frame
→ MIDI Playback Truth
```

This pass should remove the confusing variation controls and make the default output obvious.

The immediate goal is not a full pattern design system. The immediate goal is:

```txt
Drop MIDI
→ Generate Bauhaus Grid
→ frame fills with readable music-generated visual map
→ transport playback can pulse/highlight active notes
```

## 2. Current Problem

The grid system has drifted into too many options too early:

```txt
columns
rows
placement mode
block style
color mode
fit mode
regenerate variations
solid vs pixel vs rounded
```

This creates confusion before the default is correct.

For this pass, simplify aggressively.

## 3. Canonical Decision

For v1.0.0, there is only one user-facing grid generator:

```txt
Generate Bauhaus Grid
```

It should use these defaults internally:

```txt
Layer Type: grid
Layer Role: environment
Renderer: bauhausMinimal
Fit Mode: fitFrame
Placement: packedTimeGrid
Tile Style: square
Color Mode: noteClass
Audio Channel: gridNotes
```

Do not expose these as dropdowns yet.

## 4. Assumptions

- Work only inside `wall/`.
- Do not touch `wall_v20260508/`.
- MIDI import already creates `state.midiCartridges`, `state.midiBanks`, and `state.activeMidiBankId`.
- MIDI playback bridge already exists through `_wos.midiPlayback`.
- `wall/engine/gridSystem.js` exists.
- System HUD exists and reports runtime truth.
- The current app should remain working.

## 5. Files To Touch

Allowed:

```txt
wall/engine/gridSystem.js
wall/main.js
wall/index.html
wall/ui/controls.js
wall/styles.css
```

Touch only what is necessary.

Do not touch:

```txt
wall/engine/registry.js
wall/engine/schemas.js
wall/render/canvasRenderer.js
wall_v20260508/
```

unless there is a one-line status alignment absolutely required.

## 6. Forbidden Changes

Do not:

- rewrite MIDI importer
- rewrite MIDI playback bridge
- change Delete / Duplicate / Group
- change keyboard shortcuts
- change object selection
- add new grid variation dropdowns
- add new block style selectors
- add new color mode selectors
- add new placement selectors
- add new fit mode selectors
- add persistence yet
- add character behavior yet
- implement parallax yet
- implement 3D/2.5D yet

## 7. UI Reduction Requirements

In the World tab, replace the current grid control cluster with a minimal section:

```txt
WORLD LAYERS

MIDI Bank: [Imported MIDI]
[Generate Bauhaus Grid]

Environment
- Bauhaus Grid
  77 notes / 77 tiles
```

Optional tiny secondary button:

```txt
[Clear Grid]
```

Do not expose:

```txt
Columns
Rows
Placement
Block Style
Color Mode
Fit Mode
Regenerate Grid
```

Those can remain internal settings but should not be visible in the user-facing World tab.

## 8. World Tab HTML Target

The visible World Layers section should be approximately:

```html
<div class="insp-section" id="world-layers-section">
  <button class="insp-section-header open" type="button">
    <span class="insp-chevron">▼</span> World Layers
  </button>

  <div class="insp-section-body">
    <div class="insp-row">
      <div class="insp-label">MIDI Bank</div>
      <div class="insp-control">
        <select id="grid-bank-select"></select>
      </div>
    </div>

    <div class="insp-row">
      <button id="generate-bauhaus-grid" class="small-btn" type="button">
        Generate Bauhaus Grid
      </button>
    </div>

    <div class="insp-row">
      <button id="clear-grid-layers" class="small-btn" type="button">
        Clear Grid
      </button>
    </div>

    <div id="grid-layer-list" class="dim"></div>
  </div>
</div>
```

If a `Clear Grid` button feels risky, skip it.

## 9. Internal Canonical Grid Settings

In `gridSystem.js`, define one canonical default settings object:

```js
const CANONICAL_BAUHAUS_GRID = {
  rendererId: "bauhausMinimal",
  layerType: "grid",
  role: "environment",
  placementMode: "packedTimeGrid",
  fitMode: "fitFrame",
  tileStyle: "square",
  colorMode: "noteClass",
  audioChannelId: "gridNotes",
  padding: 24,
  minCellSize: 4,
  maxCellSize: 28,
  gap: 1,
};
```

If `DEFAULT_GRID_SETTINGS` already exists, do not create a competing settings system. Replace or wrap it so the canonical path uses this exact set.

## 10. Source of Truth

The grid layer should own the generated visual elements.

A generated grid layer should look like:

```js
{
  id: "grid_bauhaus_...",
  type: "grid",
  role: "environment",
  label: "Bauhaus Grid",
  status: "active",
  visible: true,
  locked: false,
  opacity: 1,
  zIndex: 0,
  depth: 0,

  source: {
    type: "midiBank",
    bankId: "bank_..."
  },

  renderer: {
    id: "bauhausMinimal"
  },

  audio: {
    channelId: "gridNotes"
  },

  grid: {
    placementMode: "packedTimeGrid",
    fitMode: "fitFrame",
    tileStyle: "square",
    colorMode: "noteClass",
    columns: number,
    rows: number,
    cellSize: number,
    gap: 1,
    padding: 24
  },

  blocks: []
}
```

## 11. MIDI Bank Resolution

The generator should use the selected bank from `#grid-bank-select`.

If no selected bank exists, fall back to:

```js
state.activeMidiBankId;
```

If no MIDI bank exists, show a quiet warning:

```txt
Drop a MIDI file first.
```

Do not throw.

## 12. Note Count Truth

A key requirement:

```txt
Generated tile count should equal playable MIDI event count whenever possible.
```

For a bank with 77 notes:

```txt
77 MIDI events → 77 grid blocks
```

For a bank with 11,606 notes:

```txt
11,606 MIDI events → 11,606 grid blocks
```

The HUD and grid layer list should show:

```txt
source notes
playback events
grid blocks
```

If counts differ, log a warning:

```js
console.warn("[BAUHAUS GRID] Count mismatch", {
  sourceNotes,
  playbackEvents,
  gridBlocks,
});
```

Do not fail.

## 13. Canonical Grid Size Calculation

Do not ask user for columns/rows.

Calculate them from note count and frame aspect.

Use:

```js
function computePackedGridDimensions(noteCount, width, height) {
  var safeCount = Math.max(1, noteCount || 1);
  var aspect = width / height;

  var columns = Math.ceil(Math.sqrt(safeCount * aspect));
  var rows = Math.ceil(safeCount / columns);

  while (columns * rows < safeCount) {
    columns += 1;
    rows = Math.ceil(safeCount / columns);
  }

  return { columns: columns, rows: rows };
}
```

Do not hardcode 81×144. Let the formula derive it.

## 14. Fit Frame Cell Size

Cell size must be derived from frame dimensions.

Use:

```js
function computeFitCellSize(
  columns,
  rows,
  width,
  height,
  padding,
  gap,
  minCellSize,
  maxCellSize,
) {
  var availableW = Math.max(1, width - padding * 2);
  var availableH = Math.max(1, height - padding * 2);

  var cellW = (availableW - Math.max(0, columns - 1) * gap) / columns;
  var cellH = (availableH - Math.max(0, rows - 1) * gap) / rows;

  var size = Math.floor(Math.min(cellW, cellH));
  return Math.max(minCellSize, Math.min(maxCellSize, size));
}
```

If note count is too high and calculated size drops below `minCellSize`, still render with `minCellSize`, but center the grid as best as possible. Do not crash.

## 15. Packed Placement

Use strict packed order:

```txt
sort events by startBeat → pitch → index
cellIndex = index
col = cellIndex % columns
row = Math.floor(cellIndex / columns)
```

Do not stack by default.

If `index >= columns * rows`, grow rows until capacity fits.

## 16. Bauhaus Renderer v1

For this pass, the Bauhaus renderer should be simple and consistent.

Each block is a square tile.

Requirements:

```txt
square tile
noteClass color
subtle alpha
active note pulse when playback crosses note
no rounded/pixel/solid selector
```

Do not implement circles, triangles, rings, line motifs yet.

Those are future Bauhaus Pattern Library v1.1+.

## 17. Active Note Highlight

Use the MIDI playback truth state.

A block is active if:

```txt
block source event id appears in state.midiPlayback.activeNotes
or block noteClass recently triggered through noteActivity
```

Preferred:

```js
function isBauhausBlockActive(block) {
  var active =
    state.midiPlayback && state.midiPlayback.activeNotes
      ? state.midiPlayback.activeNotes
      : [];

  return active.some(function (note) {
    return (
      note &&
      (note.id === block.sourceEventId || note.index === block.sourceIndex)
    );
  });
}
```

Fallback:

```js
noteActivity[block.noteClass] recent within 120ms
```

Active visual:

```txt
scale up slightly
opacity boost
small glow or white inset
```

Keep it subtle.

## 18. Debug API Requirements

Add or update:

```js
_wos.generateBauhausGrid();
_wos.clearGridLayers();
_wos.debugGridStats();
```

### `_wos.generateBauhausGrid()`

Should:

```txt
resolve active/selected MIDI bank
create or replace one canonical Bauhaus Grid layer
render frame
return layer
```

### `_wos.clearGridLayers()`

Should:

```txt
remove only grid layers from state.world.layers
render frame
return count removed
```

### `_wos.debugGridStats()`

Should include:

```js
{
  (layerId,
    label,
    rendererId,
    sourceBankId,
    sourceNotes,
    playbackEvents,
    gridBlocks,
    columns,
    rows,
    cellSize,
    gap,
    fitMode,
    placementMode,
    countMatch);
}
```

## 19. One Canonical Layer Rule

When user clicks `Generate Bauhaus Grid`, avoid piling up duplicate grid layers.

For v1.0.0, use:

```js
state.world.layers = state.world.layers.filter(function (layer) {
  return layer.type !== "grid";
});
state.world.layers.push(newLayer);
```

This keeps the scene clean.

## 20. System HUD Runtime Alignment

The existing System HUD should automatically reflect:

```txt
worldLayers
gridLayers
gridBlocks
sourceNotes
midiPlaybackEvents
```

If it does not, patch `getSystemHudData()` only enough to keep counts truthful.

Do not redesign the HUD.

## 21. Controls Binding

In `controls.js`, bind:

```js
#generate-bauhaus-grid
#clear-grid-layers
#grid-bank-select
```

Use existing `syncGridUI(state)` if present, but simplify its visible output.

Bank dropdown should list:

```txt
Imported MIDI — 77 notes
```

Layer list should show:

```txt
Environment
Bauhaus Grid — 77 tiles / 77 notes
```

No technical option dump.

## 22. Required Console Logs

Use quiet logs only:

```js
console.log("[BAUHAUS GRID] Generated", {
  bankId,
  sourceNotes,
  playbackEvents,
  gridBlocks,
  columns,
  rows,
  cellSize,
});
```

Warnings only for mismatches or missing MIDI:

```js
console.warn("[BAUHAUS GRID] Drop a MIDI file first");
console.warn("[BAUHAUS GRID] Count mismatch", {...});
```

## 23. DevTools Test Flow

### 23.1 Empty State

After reload before MIDI drop:

```js
_wos.generateBauhausGrid();
```

Expected:

```txt
No throw.
Console warning: Drop a MIDI file first.
Returns null.
```

### 23.2 Drop MIDI

Drop a `.mid`.

Run:

```js
_wos.midi.banks();
_wos.midiPlayback.events().length;
```

Expected:

```txt
bank count >= 1
events > 0
```

### 23.3 Generate Grid

Run:

```js
_wos.generateBauhausGrid();
_wos.debugGridStats();
_wos.getSystemHudData().runtime;
```

Expected:

```txt
one grid layer
gridBlocks === midiPlayback.events().length when possible
runtime.gridLayers === 1
runtime.gridBlocks > 0
```

### 23.4 Visual

Expected:

```txt
frame fills with square note-color tiles
grid is centered/fitted to current portrait or landscape frame
no tiny pile in corner
no visible option clutter
```

### 23.5 Playback

Click Play.

Expected:

```txt
MIDI notes audible from MIDI playback bridge
some grid blocks pulse/highlight during playback
System HUD currentBeat increases
midiLastTriggered changes
```

## 24. UI Smoke Test

Confirm:

```txt
Draw still works
Select still works
Delete still works
Cmd+D duplicate still works
MIDI drop still works
Sound test still works
System HUD still opens
World tab no longer shows confusing grid variation controls
Generate Bauhaus Grid works from World tab
```

## 25. Stop Condition

Stop when:

1. World tab has one simple Generate Bauhaus Grid path.
2. Old grid variation controls are hidden or removed from visible UI.
3. MIDI bank generates one canonical grid environment layer.
4. Grid fills current frame using fitFrame.
5. Grid blocks match MIDI playback events whenever possible.
6. Playback audio still comes from MIDI Playback Truth.
7. Grid blocks visibly pulse/highlight during playback.
8. No unrelated systems were changed.

Do not proceed into Bauhaus shapes, characters, parallax, layer persistence, or advanced pattern libraries in this pass.
