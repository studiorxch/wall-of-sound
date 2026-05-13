# 0507_WOS_GridBlockLibrarySystem_v1.0.0

**Project:** Wall of Sound / WOS  
**System:** MIDI → Grid Environment Map  
**Version:** v1.0.0  
**Date:** 05/07/2026  
**Status:** Phase 1 Implementation Spec

---

## 1. Purpose

Build a **Grid Block Library System** that converts imported MIDI data into a visual, playable, grid-based environment layer.

This replaces the current “MIDI notes placed along a stroke path” workflow with a new workflow:

> MIDI bank → world layer → grid environment → color-note map → playback highlighting

The goal is to generate a **music-derived visual world map** that can later support characters, roaming objects, collision triggers, parallax layers, and environmental behaviors.

Phase 1 is intentionally limited to the environment map. Do not build character behavior yet.

---

## 2. Core Decision: Layers vs Channels

Use **Layers** for world/visual structure.

Use **Channels** for audio/MIDI routing.

### Definitions

| Term          | Meaning                                               |
| ------------- | ----------------------------------------------------- |
| MIDI Bank     | Imported MIDI data stored as reusable source material |
| World Layer   | Visual/spatial layer inside the scene                 |
| Grid Layer    | A world layer whose contents are arranged on a grid   |
| Channel       | MIDI/audio routing concept only                       |
| Block         | A visual grid cell generated from a note/event        |
| Block Library | Style presets used to render note blocks              |

### Rule

Do **not** call visual map groups “channels.”

Channels remain for MIDI/audio. Layers are for scene composition, z-index, z-depth, parallax, background, foreground, and future object groups.

---

## 3. Phase 1 User Flow

### Step 1 — Import MIDI

User imports a MIDI file.

The MIDI is parsed into a **MIDI Bank**.

The bank stores note events, timing, pitch, velocity, duration, track/channel metadata, and any computed normalized values.

### Step 2 — Add Bank to World Layer

User chooses:

> Add MIDI Bank to Grid Layer

If no grid layer exists, create one automatically:

```js
state.world.layers.push(createGridLayerFromMidiBank(bankId));
```

Default layer name:

```txt
Environment Grid 01
```

Default role:

```txt
environment
```

### Step 3 — Generate Notes onto Grid

The system converts MIDI note events into grid blocks using current grid settings:

- grid columns
- grid rows
- note placement mode
- pitch-to-color mapping
- velocity-to-size or opacity mapping
- duration-to-block-length mapping, optional
- quantization resolution
- current block style preset

The resulting grid should fill the scene with a colored pattern that can function as an early maze/map.

### Step 4 — Playback Highlighting

During playback, the currently active MIDI notes should visually pulse/highlight their corresponding grid blocks.

Minimum Phase 1 feedback:

- active note block brightens
- active note block scales slightly
- active note block returns to normal after note-off or duration end

---

## 4. Explicit Non-Goals for Phase 1

Do not implement these yet:

- roaming characters
- character AI
- character collision behavior
- environmental physics
- parallax scrolling engine
- procedural sprite replacement beyond simple block style presets
- advanced interaction triggers
- maze-solving logic
- enemies/NPCs
- camera-follow behavior

Phase 1 only needs to prove:

> Imported MIDI can generate a playable grid environment layer.

---

## 5. Data Model

### 5.1 MIDI Bank

Add or formalize this structure:

```js
const midiBank = {
  id: "bank_001",
  name: "Imported MIDI 01",
  sourceFileName: "example.mid",
  createdAt: Date.now(),
  tracks: [],
  events: [
    {
      id: "evt_001",
      trackIndex: 0,
      channel: 1,
      note: 60,
      noteClass: 0,
      velocity: 96,
      startBeat: 0,
      durationBeats: 1,
      endBeat: 1,
    },
  ],
};
```

### 5.2 World Layer

Add a world layer model that can support more than grid layers later.

```js
const worldLayer = {
  id: "layer_grid_001",
  name: "Environment Grid 01",
  type: "grid",
  role: "environment",
  visible: true,
  locked: false,
  zIndex: 0,
  zDepth: 0,
  parallax: {
    enabled: false,
    factorX: 1,
    factorY: 1,
  },
  source: {
    type: "midiBank",
    bankId: "bank_001",
  },
  grid: {},
  blocks: [],
};
```

### 5.3 Grid Settings

```js
const gridSettings = {
  columns: 32,
  rows: 18,
  cellSize: 32,
  gap: 2,
  quantizeBeats: 0.25,
  placementMode: "timeX_pitchY",
  wrapMode: "wrapRows",
  pitchRange: {
    min: 36,
    max: 84,
  },
  colorMode: "noteClass",
  sizeMode: "velocity",
  opacityMode: "velocity",
  blockStyleId: "solid_note_tile",
};
```

### 5.4 Grid Block

```js
const gridBlock = {
  id: "block_001",
  layerId: "layer_grid_001",
  sourceEventId: "evt_001",
  bankId: "bank_001",
  note: 60,
  noteClass: 0,
  velocity: 96,
  startBeat: 0,
  durationBeats: 1,
  col: 0,
  row: 7,
  x: 0,
  y: 224,
  width: 32,
  height: 32,
  color: "#ff4d4d",
  active: false,
  styleId: "solid_note_tile",
};
```

---

## 6. Placement Modes

Implement at least one placement mode now. Stub the rest safely.

### Required Mode: `timeX_pitchY`

Maps time horizontally and pitch vertically.

```txt
X = startBeat mapped across grid columns
Y = pitch mapped across grid rows
```

This should create a readable piano-roll-inspired environment map.

### Future Placement Modes

Safe enum values for later:

```js
const GRID_PLACEMENT_MODES = {
  TIME_X_PITCH_Y: "timeX_pitchY",
  TIME_X_NOTECLASS_Y: "timeX_noteClassY",
  SPIRAL: "spiral",
  MAZE: "maze",
  DENSITY_FIELD: "densityField",
  RANDOM_WALK: "randomWalk",
};
```

Do not implement future modes yet unless the existing app already has matching helpers.

---

## 7. Block Library System

The grid should not permanently render notes as plain circles/dots.

Create a small style preset system so notes can later become tiles, walls, gates, lights, bricks, windows, signs, or terrain.

### Phase 1 Block Styles

```js
const blockLibrary = {
  solid_note_tile: {
    id: "solid_note_tile",
    name: "Solid Note Tile",
    shape: "rect",
    radius: 4,
    stroke: false,
    fillMode: "noteColor",
    activeEffect: "pulse",
  },
  rounded_note_block: {
    id: "rounded_note_block",
    name: "Rounded Note Block",
    shape: "rect",
    radius: 10,
    stroke: true,
    fillMode: "noteColor",
    activeEffect: "scaleGlow",
  },
  pixel_note_cell: {
    id: "pixel_note_cell",
    name: "Pixel Note Cell",
    shape: "rect",
    radius: 0,
    stroke: false,
    fillMode: "noteColor",
    activeEffect: "brightness",
  },
};
```

### Important Rule

The block library controls **appearance**, not musical data.

A block style can change how a note looks, but it must not destroy note, timing, velocity, channel, or source event metadata.

---

## 8. Playback Behavior

During transport playback:

1. Current beat is calculated.
2. Grid layer checks which blocks are active at current beat.
3. Active blocks are highlighted.
4. Optional: active blocks trigger the same note playback route used by MIDI strokes.

A block is active when:

```js
currentBeat >= block.startBeat &&
  currentBeat < block.startBeat + block.durationBeats;
```

### Minimum Visual Active State

```js
block.active = isBlockActive(block, currentBeat);
```

Render active blocks with:

- scale: `1.12`
- brightness/alpha increase
- optional thin outline

Do not add heavy glow by default.

---

## 9. Rendering Requirements

Grid environment rendering should happen as part of the normal canvas render loop.

Recommended order:

1. background layers
2. environment grid layers
3. foreground layers
4. characters / walkers / moving objects later
5. selection overlays
6. HUD/UI overlays

For Phase 1, render all grid blocks inside the world/canvas area. Avoid DOM-heavy rendering.

Canvas rendering is preferred.

---

## 10. UI Requirements

Add a simple Grid Layer workflow without overbuilding.

### Required UI Controls

Add these controls wherever the current MIDI/import or world tools live:

```txt
[Import MIDI]
[Add Bank to Grid Layer]
[Regenerate Grid]
```

### Required Grid Settings

Expose only these for Phase 1:

```txt
Columns
Rows
Placement Mode
Block Style
Color Mode
```

### Layer Panel Language

Use:

```txt
World Layers
- Environment Grid 01
```

Avoid:

```txt
MIDI Channels
```

unless referring to actual MIDI channels.

---

## 11. Implementation Functions

Add small, single-purpose functions.

```js
function createMidiBankFromParsedMidi(parsedMidi, sourceFileName) {}
function createGridLayerFromMidiBank(bankId, options = {}) {}
function generateGridBlocksFromMidiBank(bank, gridSettings, layerId) {}
function mapMidiEventToGridCell(event, bank, gridSettings) {}
function getNoteColor(note, noteClass, colorMode) {}
function isGridBlockActive(block, currentBeat) {}
function updateGridLayerPlaybackState(layer, currentBeat) {}
function renderGridLayer(ctx, layer, renderState) {}
function renderGridBlock(ctx, block, style, renderState) {}
```

No God functions.

Do not bury MIDI parsing, block generation, rendering, and playback highlighting inside one large handler.

---

## 12. Error Handling

Add guards for:

- no MIDI bank selected
- missing parsed MIDI events
- empty MIDI file
- invalid grid dimensions
- missing block style
- missing layer ID
- unsupported placement mode

Use non-fatal warnings:

```js
console.warn("[WOS GRID] Cannot generate grid: no MIDI bank selected");
```

Do not crash the app if a bank or style is missing.

---

## 13. Debug Helpers

Expose minimal debug helpers under `_wos` if that pattern already exists.

```js
_wos.debugGridLayers = function () {
  return state.world.layers.filter((layer) => layer.type === "grid");
};

_wos.debugGridBlocks = function (layerId) {
  const layer = state.world.layers.find((item) => item.id === layerId);
  return layer ? layer.blocks : [];
};

_wos.regenerateFirstGridLayer = function () {
  const layer = state.world.layers.find((item) => item.type === "grid");
  if (!layer || !layer.source?.bankId) return null;
  const bank = state.midiBanks?.[layer.source.bankId];
  if (!bank) return null;
  layer.blocks = generateGridBlocksFromMidiBank(bank, layer.grid, layer.id);
  return layer;
};
```

---

## 14. Acceptance Tests

### Test 1 — MIDI Bank Creation

1. Import a MIDI file.
2. Confirm a MIDI bank exists.
3. Confirm bank has events.

Expected:

```js
state.midiBanks;
```

contains at least one bank with note events.

---

### Test 2 — Add Bank to Grid Layer

1. Select imported MIDI bank.
2. Click `Add Bank to Grid Layer`.

Expected:

```js
state.world.layers;
```

contains a layer with:

```js
type: 'grid'
role: 'environment'
source.type: 'midiBank'
blocks.length > 0
```

---

### Test 3 — Visual Grid Appears

After grid generation, canvas shows colored blocks arranged across the scene.

Expected:

- not a stroke path
- not loose note dots only
- blocks occupy grid cells
- color varies by note class

---

### Test 4 — Playback Highlighting

Start playback.

Expected:

- active notes visually pulse/highlight
- inactive notes remain stable
- highlight follows MIDI timing

---

### Test 5 — Regenerate Grid

Change columns, rows, placement mode, or block style.

Click `Regenerate Grid`.

Expected:

- same MIDI bank generates a new visual grid layout
- no duplicate layers are created unless user explicitly adds a new layer
- source MIDI metadata remains intact

---

## 15. Implementation Boundaries

Keep the implementation focused on this path:

```txt
MIDI Import → MIDI Bank → Grid Layer → Blocks → Playback Highlight
```

Do not refactor the full WOS architecture unless required.

Do not break existing MIDI-to-stroke behavior. Preserve it as a separate mode.

The new workflow should be additive:

```txt
MIDI to Stroke = path visualization
MIDI to Grid = environment map visualization
```

---

## 16. Naming Summary

Use these names consistently:

```txt
MIDI Bank
World Layer
Grid Layer
Environment Grid
Grid Block
Block Library
Block Style
```

Avoid these for visual structure:

```txt
Channel
Track Lane
MIDI Channel Layer
```

Channels are reserved for MIDI/audio routing.

---

## 17. Phase 1 Success Definition

Phase 1 is complete when:

1. A MIDI file can be imported into a bank.
2. The bank can generate a world grid layer.
3. The grid layer fills the scene with colored note blocks.
4. Playback highlights the currently playing note blocks.
5. Existing MIDI-to-stroke behavior still works.
6. The system is ready for future visual block styles and character roaming.

---

## Implementation Guide

- Put world-layer/grid data helpers near the existing state/world or MIDI placement code, keeping MIDI bank parsing separate from grid block generation.
- Add rendering through the existing canvas render loop, before walkers/foreground objects and before HUD overlays.
- Run: import MIDI → add bank to grid layer → play transport → confirm active blocks highlight in time.
