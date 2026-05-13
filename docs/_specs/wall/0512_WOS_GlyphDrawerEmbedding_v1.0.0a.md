---
layout: spec
title: "GlyphLab Drawer Embedding"
date: 2026-05-12
doc_id: "0512_WOS_GlyphDrawerEmbedding_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "ui"
component: "GlyphDrawer"

type: "system-spec"
status: "planned"
priority: "high"
risk: "medium"

summary: >
  Embeds GlyphLab directly into the WOS drawer runtime as the first
  fully integrated modular workspace. Transitions GlyphLab from an
  external standalone tool into a native world-authoring subsystem
  capable of generating reusable symbolic geometry for WOS scenes,
  maps, signage, and future asset systems.

depends_on:
  - "0512_WOS_UniversalDrawerSystem_v1.0.0"
  - "0512_WOS_DrawerContentSystem_v1.0.0"
  - "0509_WOS_BauhausGlyphLab_v0.1.0.html"

enables:
  - "World glyph insertion"
  - "Persistent glyph library"
  - "Subway symbol system"
  - "Map icon layer"
  - "Signage system"
  - "SVG asset browser"

tags:
  - "glyph"
  - "glyphlab"
  - "drawer"
  - "workspace"
  - "bauhaus"
  - "symbols"
  - "world-authoring"
---

# PURPOSE

GlyphLab v0.1.0 exists as an external standalone tool
(`docs/tools/0509_WOS_BauhausGlyphLab_v0.1.0.html`). It has a working
12-note Bauhaus cut-map renderer, three shape families, wallpaper generation,
and JSON export. It is proven and complete as an isolated tool.

This spec embeds that system — its renderer, its data model, its interaction
logic — into the WOS drawer runtime as a first-class modular workspace.

The transition is not a rebuild. It is:

1. Extract `drawGlyph()` and `CUT_MAP` as shared WOS primitives
2. Mount a compact inline editor inside the drawer shell
3. Define the event path from glyph selection → world insertion
4. Establish persistent storage for user symbol libraries
5. Declare focus ownership so keyboard/tool conflicts are impossible

The strategic outcome: WOS gains a **symbolic geometry authoring system**.
Every future system that needs icons, markers, symbols, or visual notation
(subway maps, route signage, score notation, AI-generated patterns) draws
from this shared infrastructure.

---

# CORE PRINCIPLES

1. **One renderer, all consumers.** `renderGlyph()` is the single canonical
   rendering function used by the drawer preview, the world renderer, the
   export pipeline, and any future asset system. No parallel implementations.

2. **Drawer is the editor. World is the canvas.** The GlyphLab drawer authors
   glyphs. The WOS world displays and interacts with them. These are separate
   concerns with a defined event boundary.

3. **The cut map is the data model.** Glyphs are defined by `CUT_MAP` entries
   (note → cell pattern). Geometry is derived at render time, never stored as
   raw SVG paths in world state.

4. **Keyboard belongs to the drawer.** When GlyphLab is open, all keyboard
   input routes to the drawer. WOS shortcuts are suspended.

5. **Insert, don't mutate.** Glyph world insertion fires `SBE.Events.emit("glyph:insert", payload)`.
   The drawer never directly modifies `state.balls`, `state.strokes`, or
   any other world collection.

6. **Persistence is opt-in.** The glyph library persists to localStorage.
   Active tool state (selected note, renderer, color mode) survives close/reopen.
   In-progress work is never silently discarded.

---

# EXISTING SYSTEM INVENTORY

The following is already implemented in `0509_WOS_BauhausGlyphLab_v0.1.0.html`
and must be carried forward without rewrite:

**Data**

```js
const CUT_MAP = {
  C: { id: "full", cells: ["tl", "tr", "bl", "br"] },
  "C#": { id: "l_missing_br", cells: ["tl", "tr", "bl"] },
  D: { id: "diag_tl_br", cells: ["tl", "br"] },
  "D#": { id: "top_row", cells: ["tl", "tr"] },
  E: { id: "l_missing_bl", cells: ["tl", "tr", "br"] },
  F: { id: "right_col", cells: ["tr", "br"] },
  "F#": { id: "empty", cells: [] },
  G: { id: "bottom_row", cells: ["bl", "br"] },
  "G#": { id: "diag_tr_bl", cells: ["tr", "bl"] },
  A: { id: "l_missing_tr", cells: ["tl", "bl", "br"] },
  "A#": { id: "l_missing_tl", cells: ["tr", "bl", "br"] },
  B: { id: "left_col", cells: ["tl", "bl"] },
};

const NOTE_COLORS = {
  C: "#ff2a22",
  "C#": "#ff6d39",
  D: "#ff9b1f",
  "D#": "#ffbf2f",
  E: "#e5d645",
  F: "#b9d957",
  "F#": "#35b96d",
  G: "#28bea0",
  "G#": "#2bb8d2",
  A: "#498cff",
  "A#": "#7a62ff",
  B: "#f05abf",
};

const RENDERER_FAMILIES = ["square", "triangle", "circle", "mixed"];
const COLOR_MODES = ["monotone", "duotone", "neutral"];
```

**Rendering functions**

- `drawGlyph(ctx, note, x, y, size, renderer, colorMode, options)`
  — fully working, three renderer families, options `{ grid: bool }`
- `drawSquareCell()`, `trianglePathForCell()`, `circlePathForCell()`
  — internal cell renderers, carry forward unchanged

These become `WOS.GlyphRenderer.renderGlyph()` (see Shared Renderer section).

---

# DRAWER REGISTRATION

```js
SBE.DrawerSystem.registerDrawer({
  id: "glyph",
  title: "GlyphLab",
  icon: "✒",

  type: "workspace",
  side: "right",
  width: "wide", // 560px — editor needs room

  persistent: true, // tool state survives close
  closeOnOutsideClick: false, // accidental close destroys work
  closeOnEscape: true,

  takesFocus: true, // suspend WOS shortcuts while editor active
  capturesWheel: true, // wheel zooms glyph preview, not WOS canvas
  capturesMidi: false,

  initialize: async function () {
    /* load saved library from localStorage */
  },
  mount: function (container) {
    /* render editor UI into container */
  },
  unmount: function (container) {
    /* preserve state, clear container */
  },
  destroy: function () {
    /* flush library save, release canvas */
  },
});
```

---

# GLYPH STATE MODEL

Add to `main.js` alongside existing `state.*` objects:

```js
state.glyphs = {
  // Editor tool state — survives drawer close/reopen
  activeNote: "C", // "C" | "C#" | ... | "B"
  renderer: "square", // "square" | "triangle" | "circle" | "mixed"
  colorMode: "duotone", // "monotone" | "duotone" | "neutral"
  size: 64, // preview glyph size in px

  // Active glyph for world insertion
  insertReady: false, // true when user has confirmed a glyph for insertion
  insertNote: null, // note to insert (may differ from activeNote)
  insertScale: 1.0, // world-space scale factor

  // Tool mode
  tool: "select", // "select" | "insert" | "paint" | "erase"
};

state.glyphLibrary = {
  // User-saved named glyphs (persisted to localStorage)
  saved: [], // GlyphEntry[]
  recent: [], // GlyphEntry[] — last 12 used, not persisted
};
```

**GlyphEntry schema:**

```js
type GlyphEntry = {
  id:         string,        // uuid
  note:       string,        // "C" | "C#" | ... | "B"
  renderer:   string,        // renderer family at save time
  colorMode:  string,        // color mode at save time
  label:      string,        // user-supplied name (optional)
  tags:       string[],      // user tags (optional)
  createdAt:  number,        // timestamp
};
```

---

# SHARED RENDERER

## Contract

```js
// engine/glyphRenderer.js
WOS.GlyphRenderer = {
  // Render a single glyph onto ctx at (x, y) with given size.
  // This is the ONLY rendering path. All consumers call this.
  renderGlyph: function (ctx, note, x, y, size, options) {
    // options = {
    //   renderer:   "square" | "triangle" | "circle" | "mixed"
    //   colorMode:  "monotone" | "duotone" | "neutral"
    //   grid:       bool    — show subdivision lines
    //   opacity:    0–1     — overall alpha
    //   scale:      number  — additional transform scale
    //   selected:   bool    — draw selection ring
    // }
  },

  // Returns the CUT_MAP for external consumers.
  getCutMap: function () {
    return CUT_MAP;
  },

  // Returns NOTE_COLORS for external consumers.
  getNoteColors: function () {
    return NOTE_COLORS;
  },

  // Returns a GlyphEntry's rendered data as an ImageBitmap (for caching).
  // Used by the asset browser and export pipeline.
  renderToBitmap: function (entry, size) {
    /* returns Promise<ImageBitmap> */
  },
};
```

## Consumers

| Consumer            | Call site                      | Notes                            |
| ------------------- | ------------------------------ | -------------------------------- |
| Drawer preview      | `glyphDrawer.js` → mount()     | Interactive, re-renders on input |
| World renderer      | `render/glyphLayer.js`         | Renders placed world glyphs      |
| Export pipeline     | `engine/exportGlyphs.js`       | PNG, SVG, JSON export            |
| Asset browser       | Future `ui/assetBrowser.js`    | Thumbnail grid                   |
| Glyph library panel | Inside drawer `#glyph-library` | Uses renderToBitmap cache        |

**Non-consumers.** The standalone HTML tool
(`0509_WOS_BauhausGlyphLab_v0.1.0.html`) is NOT a consumer of this shared
renderer — it remains a self-contained reference tool. When the embedded
system is feature-complete, the standalone tool is deprecated as a
development tool, not deleted.

---

# DRAWER LAYOUT

## Wireframe

```
┌─────────────────────────────────────────────────┐
│  GLYPHLAB                              [close]  │  ← drawer-view__header
├─────────────────────────────────────────────────┤
│  ┌─────────��┐  renderer  [▼square]              │
│  │          │  color     [▼duotone]             │  ← tool row
│  │  PREVIEW │  size      ────●──── 64px         │
│  │          │                                   │
│  └──────────┘  [ INSERT INTO WORLD ]            │
├─────────────────────────────────────────────────┤
│  C   C#  D   D#  E   F   F#  G   G#  A   A#  B │  ← note strip (12 buttons)
├─────────────────────────────────────────────────┤
│  LIBRARY                              [+ save]  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │  ← saved glyphs grid
│  │    │ │    │ │    │ │    │ │    │ │    │    │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘    │
│  recent ·····                                   │
└─────────────────────────────────────────────────┘
```

## DOM structure

```html
<div class="drawer-view" id="glyph-drawer-view">
  <div class="drawer-view__header">
    <span class="drawer-view__title">GlyphLab</span>
  </div>

  <div class="drawer-view__body">
    <!-- Preview + controls -->
    <div class="glyph-editor-row">
      <canvas id="glyph-preview" width="128" height="128"></canvas>
      <div class="glyph-controls">
        <label>Renderer</label>
        <select id="glyph-renderer">
          ...
        </select>
        <label>Color</label>
        <select id="glyph-color-mode">
          ...
        </select>
        <label>Size</label>
        <input type="range" id="glyph-size" min="16" max="128" value="64" />
        <button id="glyph-insert-btn" class="drawer-action-btn">
          Insert into World
        </button>
      </div>
    </div>

    <!-- 12-note selector strip -->
    <div class="glyph-note-strip" id="glyph-note-strip">
      <!-- 12 buttons: C C# D D# E F F# G G# A A# B -->
    </div>

    <!-- Persistent library -->
    <div class="glyph-library-header">
      <span>Library</span>
      <button id="glyph-save-btn">+ Save</button>
    </div>
    <div class="glyph-library-grid" id="glyph-library-grid">
      <!-- GlyphEntry thumbnails -->
    </div>

    <div class="glyph-library-header" style="margin-top:8px;">
      <span>Recent</span>
    </div>
    <div class="glyph-recent-row" id="glyph-recent-row">
      <!-- last 12 used, not persisted -->
    </div>
  </div>
</div>
```

---

# GLYPH → WORLD PIPELINE

## Event contract

```js
// Fired by the drawer when the user clicks "Insert into World".
// main.js subscribes and performs the actual world mutation.
SBE.Events.emit("glyph:insert", {
  note: "C", // which note / cut pattern
  renderer: "square", // shape family
  colorMode: "duotone", // color mode
  scale: 1.0, // world-space scale (1.0 = default size)
  position: null, // {x, y} in world coords — null = place at cursor
  // null position triggers "placement mode": user clicks canvas to place
});
```

## Placement modes

**Cursor placement** (`position: null`)
The drawer emits `"glyph:insert"` with `position: null`.
`main.js` enters placement mode: next canvas click fires
`"glyph:place"` with the canvas coordinates.

```js
SBE.Events.emit("glyph:place", {
  glyphId: "<pending-insert-id>",
  x: 540,
  y: 960, // canvas coords
});
```

**Direct placement** (`position: { x, y }`)
Used by future programmatic systems (AI, route markers, asset browsers).

## World object schema (GlyphObject)

```js
type GlyphObject = {
  id:         string,
  type:       "glyph",
  note:       string,
  renderer:   string,
  colorMode:  string,
  x:          number,    // canvas coords
  y:          number,
  scale:      number,
  rotation:   number,    // radians, default 0
  opacity:    number,    // 0–1, default 1
  locked:     bool,
};
```

GlyphObjects are stored in `state.glyphObjects: GlyphObject[]`
(separate from `state.balls` and `state.strokes` — glyphs are not physics objects).

They are rendered by `render/glyphLayer.js` which calls
`WOS.GlyphRenderer.renderGlyph()` for each object in the array.

Placed GlyphObjects are selectable, moveable, scaleable, and deleteable
via the existing WOS selection and transform system.

---

# ASSET PERSISTENCE

## localStorage schema

```js
const GLYPH_LIBRARY_KEY = "wos_glyph_library_v1";

// Shape stored in localStorage:
{
  version: 1,
  saved: GlyphEntry[],     // user-named glyphs, unlimited
}
```

## Rules

- `saved` array persists across sessions via localStorage
- `recent` array (max 12) is in-memory only, lost on page reload
- Save triggered by: "+" button in library panel, or keyboard shortcut `Cmd+S` while drawer is focused
- Library entries show: thumbnail, note label, renderer/colorMode badge
- Library entries support: click-to-select, drag-to-reorder (v3), delete button
- Library survives drawer close (`persistent: true`)

## Future asset storage

Phase 3 introduces SVG-format glyph storage for vector fidelity.
The `GlyphEntry` schema must be extended:

```js
// v2 extension (phase 3):
type GlyphEntry_v2 = GlyphEntry & {
  svgPath: string | null,  // raw SVG path data if imported from file
  source:  "cut-map" | "svg-import" | "ai-generated",
};
```

---

# INPUT OWNERSHIP

Per `DrawerContentSystem_v1.0.0` focus ownership rules:

```js
takesFocus:    true,   // WOS keyboard shortcuts suspended
capturesWheel: true,   // wheel events zoom glyph preview, not WOS canvas
```

**Keyboard routing while GlyphLab is active:**

| Key                 | Action                                       | Owner        |
| ------------------- | -------------------------------------------- | ------------ |
| `1`–`9`, `0`        | Select note C through A#                     | Drawer       |
| `B`                 | Select note B                                | Drawer       |
| `S` / `T` / `C`     | Switch renderer: Square/Triangle/Circle      | Drawer       |
| `Cmd+S`             | Save current glyph to library                | Drawer       |
| `Enter`             | Confirm insert → enter placement mode        | Drawer       |
| `Escape`            | Close drawer (via DrawerSystem)              | DrawerSystem |
| `Delete`            | (suppressed — does NOT delete world objects) | Drawer       |
| `Cmd+Z`             | Undo last world insertion                    | main.js      |
| All other shortcuts | Suppressed while drawer active               | DrawerSystem |

**Implementation:** `main.js` must expose:

```js
window._wos.shortcuts = {
  suspend: function () {
    /* set _shortcutsSuspended = true */
  },
  resume: function () {
    /* set _shortcutsSuspended = false */
  },
};
```

All WOS keydown handlers must check `_shortcutsSuspended` before acting.

---

# EXPORT SUPPORT

All exports use `WOS.GlyphRenderer.renderGlyph()` as the rendering source.

## v2 exports

**PNG** — single glyph rendered at `size × size` pixels on transparent background.

```js
function exportGlyphPng(entry, size) {
  var canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  WOS.GlyphRenderer.renderGlyph(
    canvas.getContext("2d"),
    entry.note,
    0,
    0,
    size,
    {
      renderer: entry.renderer,
      colorMode: entry.colorMode,
    },
  );
  return canvas.toDataURL("image/png");
}
```

**JSON** — `GlyphEntry` or full `state.glyphLibrary.saved` array.

```js
{
  id:   "bauhausCutGlyphMap.v1.0.0",
  note: "C",
  renderer: "square",
  colorMode: "duotone",
  cutMap: { id: "full", cells: ["tl","tr","bl","br"] },
}
```

## v3 exports

**SVG** — glyph geometry reconstructed as SVG `<rect>`, `<polygon>`, or `<path>`
elements. Cell geometry extracted from renderer math, not canvas rasterization.

**WOS Symbol Pack** — bundle of GlyphEntry[] as a `.wossymbols` JSON archive,
importable by any WOS instance.

**Animated glyph** — sequence of frames as GlyphEntry[], exportable as
APNG or CSS animation keyframes. Requires `GlyphEntry.frameIndex` extension.

---

# IMPLEMENTATION PHASES

## Phase 1 — Embedded Editor (v2 of current impl)

Deliverables:

- `engine/glyphRenderer.js` — extract `drawGlyph()` and `CUT_MAP` from
  standalone tool into shared WOS module
- `ui/glyphDrawer.js` — replace stub render with real drawer mount/unmount
- Drawer layout: preview canvas, note strip, renderer/color controls
- `state.glyphs` added to `main.js` state
- `state.glyphLibrary` with localStorage persistence
- `SBE.Events` bus (`ui/events.js`) — minimal emit/on/off
- `DrawerSystem`: `takesFocus`, `capturesWheel`, `persistent` enforcement
- `_wos.shortcuts.suspend()` / `.resume()` stubs in `main.js`
- PNG export from drawer

Files created or modified:

```
engine/glyphRenderer.js     NEW — shared renderer module
ui/glyphDrawer.js           MODIFIED — real mount() replaces stub
ui/events.js                NEW — SBE.Events bus
main.js                     MODIFIED — state.glyphs, shortcuts API
```

## Phase 2 — World Insertion

Deliverables:

- `render/glyphLayer.js` — renders `state.glyphObjects[]` using shared renderer
- `"glyph:insert"` event subscription in `main.js`
- Placement mode: cursor-click to place after insert intent
- `"glyph:place"` event → appends to `state.glyphObjects`
- GlyphObjects selectable via existing selection system
- GlyphObjects moveable and scaleable via existing transform system
- GlyphObjects deleteable via existing delete handler
- JSON export of `state.glyphObjects`

Files created or modified:

```
render/glyphLayer.js        NEW — world glyph rendering
main.js                     MODIFIED — event handlers, state.glyphObjects
```

## Phase 3 — Asset System Integration

Deliverables:

- SVG export (geometry reconstruction, not rasterization)
- SVG import (path parsing → GlyphEntry with `source: "svg-import"`)
- WOS Symbol Pack export/import (`.wossymbols` bundle)
- Asset browser drawer integration (thumbnail grid from library)
- GlyphLab drawer width upgrade to `"wide"` for browser mode
- Animated glyph sequence (frame-based GlyphEntry[])

Files created or modified:

```
engine/exportGlyphs.js      NEW — SVG/PNG/pack export
engine/importGlyphs.js      NEW — SVG/pack import
ui/assetBrowser.js          MODIFIED — GlyphEntry thumbnails
```

---

# FUTURE EXTENSIONS

**Subway symbol system** — Line markers, station icons, and access symbols
drawn as glyphs. The 12-note cut map maps naturally to a 12-line subway system.
Each line gets a note assignment; glyphs become visual identifiers on route maps.

**Map icon layer** — Points of interest, landmarks, and navigation waypoints
rendered as scaled GlyphObjects on the WOS geography layer. The glyph system
provides a scalable, stylistically consistent icon vocabulary without external
image assets.

**Sticker system** — GlyphObjects treated as decorative elements that can be
stamped across WOS scenes. Multiple placed instances share the same
`GlyphEntry` source, reducing memory footprint.

**SVG asset browser** — Full SVG file import, path parsing, and integration
with the glyph library. Opens the system to arbitrary vector artwork, not
just the 12-note cut map.

**AI-generated glyphs** — A future AI system generates `CUT_MAP`-compatible
glyph patterns based on semantic descriptions ("station entrance", "caution",
"rhythm marker"). The DrawerContentSystem event bus provides the insertion path.

**Signage system** — Multi-glyph compositions rendered as typographic strings
using the glyph alphabet. The 12-note cut map functions as a phonemic or
semantic alphabet for WOS world signage.

**Emoji bridge** — Map standard Unicode emoji to GlyphEntry equivalents,
allowing emoji-triggered glyph insertion via keyboard shortcut or text input.

**WOS symbol packs** — Community-shared `.wossymbols` bundles with named
libraries, preview sheets, and version metadata. Import/export via drawer UI.

---

# NON-GOALS

- GlyphLab does not replace the WOS note/pitch system (notes are addresses in
  the cut map, not music theory objects in this context)
- GlyphLab does not render physics-reactive glyphs (those are a separate
  system using `state.balls` emitters)
- GlyphLab does not own canvas interaction for placed objects (selection and
  transform are the existing WOS object system's responsibility)
- The standalone HTML tool is not deleted — it remains a development reference

---

# VALIDATION CHECKLIST

**Phase 1**

- [ ] `WOS.GlyphRenderer.renderGlyph()` renders identically to standalone tool for all 12 notes × 3 renderers
- [ ] Drawer preview canvas updates in real time on note/renderer/color change
- [ ] Note strip: clicking any note updates preview immediately
- [ ] Library: save button creates persisted `GlyphEntry` in localStorage
- [ ] Library: entries survive page reload
- [ ] Recent list: last 12 used appear in recent row
- [ ] `takesFocus: true`: Delete key does not remove selected WOS objects while drawer is open
- [ ] `capturesWheel: true`: wheel events in drawer do not zoom WOS camera
- [ ] `persistent: true`: selected note, renderer, and color survive close/reopen

**Phase 2**

- [ ] "Insert into World" enters placement mode (cursor changes)
- [ ] Clicking canvas in placement mode places a GlyphObject
- [ ] Placed GlyphObject renders via `WOS.GlyphRenderer.renderGlyph()`
- [ ] Placed GlyphObject is selectable via existing selection system
- [ ] Placed GlyphObject is moveable via existing drag system
- [ ] Placed GlyphObject is deleteable without affecting other world objects
- [ ] Opening GlyphLab while a GlyphObject is selected shows its note in the strip

**Phase 3**

- [ ] SVG export: rendered glyph matches canvas preview visually
- [ ] SVG import: imported path stored as `GlyphEntry` with `source: "svg-import"`
- [ ] Symbol pack export: valid JSON, importable on fresh WOS instance

---

# NOTES

The 12-note cut map (`CUT_MAP`) is the canonical glyph data structure.
It was designed with musical harmony in mind: C (full) and F# (empty) are
tritone opposites, mirroring the complementary relationship in both music
theory and visual density. This mapping should not be modified — it is an
intentional design constraint, not a technical limitation.

The note colors (`NOTE_COLORS`) follow a chromatic spectrum and are shared
with the WOS note pitch system. When a GlyphObject is inserted with
`colorMode: "duotone"`, the rendered color is visually consistent with
the note-color coding used throughout the WOS UI.

The `persistent: true` and `closeOnOutsideClick: false` flags are
non-negotiable for a workspace drawer. A user authoring a glyph sequence
must never lose work due to an accidental click on the canvas.
These flags exist precisely to prevent that.
