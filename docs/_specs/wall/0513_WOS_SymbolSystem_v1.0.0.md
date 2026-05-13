# 0513_WOS_SymbolSystem_v1.0.0
**Wall of Sound — SymbolSystem**
Date: 2026-05-13 | Status: SPEC

---

## 0. Vision

**SymbolLab** is a symbolic authoring workstation embedded in WOS.

It produces and manages *symbol sets* — reusable collections of authored glyphs that can be placed in the world as visual objects, triggered by audio collisions, painted as typographic runs, or composed into scene layers. A symbol set is the atom of WOS's creative visual language.

The system replaces two narrower prototypes:
- The **Bauhaus tile renderer** (`engine/glyphRenderer.js`) — procedural 12-note geometry, no authored strokes
- The **WOS GlyphDrawer** (`ui/glyphDrawer.js`) — embedded stub that never connected to real authoring

It connects directly to the **real GlyphLab authoring app** (React/TypeScript at `/Users/studio/Projects/glyphlab/`) via a shared JSON contract, so symbols authored there can be imported and used at runtime inside WOS without any format translation.

---

## 1. Scope and Non-Scope

### IN SCOPE — this spec defines:
- The **SymbolSet data model** (supersedes both Bauhaus tile CUT_MAP and GlyphLab's raw `GlyphMap`)
- The **slot system** — CHARACTER_SET-compatible stable key space for addressable slots
- The **symbol family taxonomy** — typographic, iconic, musical, transport, territorial, procedural
- The **SymbolSet registry** in WOS runtime (`SBE.SymbolSystem`)
- The **SymbolLab drawer** — the authoring/management surface embedded via DrawerSystem
- The **runtime renderer** — how symbols are drawn on canvas objects and world surfaces
- The **import pipeline** — GlyphLab JSON → WOS SymbolSet (lossless round-trip)
- The **event hooks** — what SymbolSystem emits via `SBE.Events`

### NOT IN SCOPE — this spec does NOT rewrite:
- DrawerSystem, mount/unmount lifecycle, focus ownership (already live)
- SampleEngine, emitter physics, collision event routing (unchanged)
- The GlyphLab React app itself — it is an external authoring tool, not modified here
- World object placement UI (handled by existing canvas tools)

---

## 2. Visual Language References

These references define the aesthetic register the system must be capable of producing. They are **capability targets**, not stylistic constraints — the system must be able to author all of them.

| Reference | System Implication |
|---|---|
| **Braun / Dieter Rams icon sheet** | Spare, grid-locked, monochrome symbolic icons. One symbol per concept, extreme economy. The system must support tight bounding-box layout and single-weight strokes. |
| **Bold geometric cut-corner alphabet** | Grid-constrained letterforms with chamfered corners and flat color fills. The system must support fill modes, closed paths, and a geometric snap grid. |
| **Signal Conditioning / modular synth panel** | Dense technical UI: dark fields, labeled blocks, patch grids. Symbols function as panel legends and route markers. Requires small-size legibility and reverse-field rendering. |
| **Isometric parking lot illustration** | Symbol sets operating as scene vocabulary — vehicles, markings, infrastructure icons — placed in isometric space. Requires symbol-as-world-object compositing. |
| **NYC Subway Map 1979 + graffiti overlay** | Two parallel symbolic layers: the transit system (typographic, institutional, diagrammatic) and the street layer (territorial, gestural, autographic). Requires layer mixing, dialect grouping, and contrast between precision and gesture. |

---

## 3. Data Model

### 3.1 Slot Key Space

Symbols are stored in **named slots**. The primary key space inherits from GlyphLab's `CHARACTER_SET`:

```
A–Z  (26)   — uppercase Latin
a–z  (26)   — lowercase Latin
0–9  (10)   — digits
.!?,;:'"-_  (10)  — punctuation
[space]     (1)
```

73 stable typographic slots.

**Extended slots** (WOS additions, not in GlyphLab CHARACTER_SET):

```
@icon:N     — iconic symbols (N = 0–99)
@music:N    — musical/notation symbols
@transport:N — transit, map, route markers
@mark:N     — territorial marks, tags, neighborhood dialect
@proc:N     — procedurally generated (Bauhaus tiles, etc.)
```

Extended slots use the `@family:index` namespace to avoid collision with typographic slots. A SymbolSet may populate any combination of standard and extended slots.

### 3.2 Stroke Model

Inherits directly from GlyphLab — zero translation cost on import:

```js
// Point
{ x: Number, y: Number }

// Stroke
{
  points: Point[],
  mode: "freehand" | "pen",   // pen = cubic bezier control points
  weight?: Number,            // stroke width override (default: inherited from SymbolSet)
  color?: String,             // override (default: inherited)
  closed?: Boolean,           // close path
  fill?: Boolean,             // fill closed path
}

// Glyph
{
  strokes: Stroke[],
  bounds?: { x, y, w, h },   // cached at import/save time; unit square = 0..1
  tags?: String[],            // e.g. ["geometric", "fill", "icon"]
}

// GlyphMap (GlyphLab native)
Record<String, Glyph>         // key = slot key from CHARACTER_SET or extended slots
```

This is the **canonical internal representation** in WOS SymbolSystem. No other glyph format is used at runtime.

### 3.3 SymbolSet

```js
{
  id:       String,           // uuid or slug
  name:     String,           // display name
  version:  Number,           // integer, increments on save
  created:  ISO8601,
  modified: ISO8601,

  family:   SymbolFamily,     // see §4
  palette:  SymbolPalette,    // see §5

  glyphs:   GlyphMap,         // the actual symbol data

  meta: {
    description?: String,
    tags?: String[],
    authoringApp?: "glyphlab" | "wos" | "import",
    sourceFile?: String,      // original import filename
  },
}
```

### 3.4 SymbolSet Storage

**In-memory:** `SBE.SymbolSystem._registry` — `Map<id, SymbolSet>`

**Persisted:** `localStorage["wos_symbol_sets_v1"]` — array of serialized SymbolSets.
Max 50 sets. LRU eviction on overflow. Individual sets may be pinned (`meta.pinned = true`).

**Active set:** `state.symbols.activeSetId` — the set currently used for placement and preview.

---

## 4. Symbol Family Taxonomy

Each SymbolSet declares one primary family. Family affects default rendering behavior, slot conventions, and UI grouping in SymbolLab.

| Family | Description | Default Slots |
|---|---|---|
| `"typographic"` | Letterforms, numerals, full character sets. Layout engine treats as text. | A–Z, a–z, 0–9, punctuation |
| `"iconic"` | Discrete concept icons. One symbol = one concept. No text layout. | `@icon:0`–`@icon:99` |
| `"musical"` | Notation symbols: noteheads, rests, clefs, accidentals. | `@music:0`–`@music:63` |
| `"transport"` | Transit markers, route indicators, map glyphs. | `@transport:0`–`@transport:63` |
| `"territorial"` | Tags, marks, neighborhood visual dialect. Gestural, autographic. | `@mark:0`–`@mark:63` |
| `"procedural"` | Algorithmically generated (Bauhaus tiles, generative patterns). Read-only slots populated by `engine/glyphRenderer.js`. | `@proc:0`–`@proc:11` (12 notes) |

Mixed sets are allowed (`family: ["typographic", "iconic"]`) but SymbolLab UI defaults to primary-family view.

---

## 5. Palette

A SymbolSet carries a **palette** — the default rendering parameters applied when no per-object override exists.

```js
{
  mode: "stroke" | "fill" | "fill+stroke" | "inverse",
  strokeColor: CSSColor,      // default "#000000"
  strokeWeight: Number,       // px in normalized 64px grid
  fillColor: CSSColor,        // used when fill=true or mode includes fill
  bgColor: CSSColor | null,   // null = transparent
  opacity: Number,            // 0..1
  grid: Boolean,              // show construction grid in editor
  snap: Number | null,        // snap grid divisions (null = free)
}
```

**Palette presets** (defined in SymbolSystem, selectable in SymbolLab):

| Preset | Character |
|---|---|
| `braun` | Black stroke on white, weight 1.5, no fill, 8-division snap |
| `panel` | White stroke on dark (#1a1a2e), weight 1.0, no fill, no snap |
| `bold-geo` | Black fill, no stroke, 4-division snap |
| `chalk` | Off-white (#f0ede0) stroke on transparent, weight 2.0, no fill |
| `tag` | Variable color strokes on transparent, no snap |
| `bauhaus` | Duotone fill by note-family (legacy, for `procedural` family) |

---

## 6. Runtime Renderer

`engine/symbolRenderer.js` — replaces `engine/glyphRenderer.js`.

Backward compatible: `glyphRenderer.js` remains available for legacy Bauhaus tile rendering. `symbolRenderer.js` handles all SymbolSet glyphs.

### 6.1 API

```js
WOS.SymbolRenderer.renderGlyph(ctx, glyph, x, y, size, palette, options)
// glyph   — Glyph object (strokes array)
// x, y    — canvas position (top-left of bounding box)
// size    — px — glyph is scaled to fit size×size
// palette — SymbolPalette (or partial override)
// options — { grid: Boolean, snap: Number, debug: Boolean }

WOS.SymbolRenderer.renderString(ctx, symbolSet, text, x, y, size, palette, options)
// Renders a string of slot keys as a typographic run.
// text   — String (each character maps to a slot key)
// Advances x by (size * advance) per character.
// options — { advance: Number (0..2, default 0.6), leading: Number }

WOS.SymbolRenderer.renderSet(ctx, symbolSet, gridX, gridY, cellSize, cols, palette)
// Renders full set as a glyph sheet (used in SymbolLab preview panel)
```

### 6.2 Path Construction

For each stroke:
1. Scale `points` from unit space (0..1) to `size` px.
2. If `mode === "freehand"`: draw polyline through points with Catmull-Rom smoothing.
3. If `mode === "pen"`: interpret points as cubic bezier sequence (P0, CP1, CP2, P1, CP1, CP2, P2 …).
4. If `stroke.closed`: `ctx.closePath()`.
5. If `stroke.fill`: `ctx.fill()`.
6. Apply `ctx.stroke()` unless mode is fill-only.

All stroke/fill colors resolve from `palette`, overridden by per-stroke `color` if present.

### 6.3 Size Normalization

Glyphs are authored in a **64px grid** (the native GlyphLab canvas size). `renderGlyph` scales uniformly to the requested `size`. Bounds are pre-cached as `glyph.bounds` (unit square coordinates) so scaling requires only one multiply pass.

---

## 7. SymbolSystem Runtime (`SBE.SymbolSystem`)

```js
SBE.SymbolSystem = {
  // Registry
  registerSet(symbolSet),           // add/update set in registry + persist
  getSet(id),                       // → SymbolSet | null
  getAllSets(),                      // → SymbolSet[]
  deleteSet(id),                    // removes from registry + storage

  // Active set
  getActiveSet(),                   // → SymbolSet | null
  setActiveSet(id),                 // updates state.symbols.activeSetId + emits event

  // Slot access
  getGlyph(setId, slotKey),         // → Glyph | null
  setGlyph(setId, slotKey, glyph),  // mutates set, bumps version, persists, emits

  // Import
  importFromGlyphLab(json),         // parses GlyphLab export JSON → SymbolSet, registers
  importFromFile(file),             // reads File object, delegates to importFromGlyphLab

  // Export
  exportSet(id),                    // → GlyphLab-compatible JSON string
  exportSetPNG(id, cellSize),       // → Promise<Blob> — renders full glyph sheet

  // Procedural bridge
  buildProceduralSet(),             // creates SymbolSet from engine/glyphRenderer.js CUT_MAP
};
```

### 7.1 State additions (`main.js`)

```js
state.symbols = {
  activeSetId: null,        // String | null
  placementSlot: null,      // slot key currently armed for world placement
  placementSize: 48,        // px
  placementPalette: null,   // palette override | null = use set default
};
```

### 7.2 Events emitted via `SBE.Events`

| Event | Payload | When |
|---|---|---|
| `symbols:set-activated` | `{ id, set }` | Active set changed |
| `symbols:set-registered` | `{ id, set }` | Set added or updated |
| `symbols:set-deleted` | `{ id }` | Set removed |
| `symbols:glyph-changed` | `{ setId, slotKey, glyph }` | Single glyph updated |
| `symbols:import-complete` | `{ id, set, source }` | Import finished |

---

## 8. SymbolLab Drawer

**Drawer registration:**
```js
{
  id:                 "symbols",
  title:              "SymbolLab",
  side:               "right",
  width:              "wide",         // 560px
  persistent:         true,
  closeOnOutsideClick: false,
  takesFocus:         true,
  capturesWheel:      true,
  mount:   fn(container),
  unmount: fn(container),
}
```

Launcher button: toolbar icon (to be defined). Keyboard shortcut: **G** (replaces current glyph drawer shortcut).

### 8.1 Layout

```
┌──────────────────────────────────────────────┐
│ SymbolLab                          [≡ menu]  │ ← drawer header
├──────────────────────────────────────────────┤
│ [Set selector dropdown]  [+ New] [↑ Import]  │ ← set toolbar
├──────────────┬───────────────────────────────┤
│              │  SLOT GRID                    │
│   PREVIEW    │  (character set, 8 cols)      │
│   (current   │  active slot highlighted      │
│    glyph)    │  family tabs: ABC / ✦ / ♩ / … │
│              │                               │
├──────────────┴───────────────────────────────┤
│ EDITOR  [Open in GlyphLab ↗]                 │ ← edit controls
│ (read-only stroke list, or launch GlyphLab)  │
├──────────────────────────────────────────────┤
│ PALETTE  [preset selector] [stroke] [fill]   │
├──────────────────────────────────────────────┤
│ PLACE  [arm slot] [size: 48px] [↓ export]    │ ← placement toolbar
└──────────────────────────────────────────────┘
```

### 8.2 Panel Sections

**Set Toolbar**
- Dropdown lists all registered SymbolSets by name.
- **+ New** → creates empty SymbolSet, prompts for name and family.
- **↑ Import** → opens file picker (`application/json`), calls `SBE.SymbolSystem.importFromFile()`.
- Menu (≡) → Rename, Duplicate, Delete, Export JSON, Export PNG sheet.

**Slot Grid**
- Renders all slots for the active family as small canvas thumbnails (40×40px).
- Family tabs switch between `ABC` (typographic), icon (`✦`), music (`♩`), transport, territorial, procedural.
- Click slot → selects it for preview + edit.
- Empty slots shown as dashed placeholder squares.
- Selected slot shown with highlight border + key label.

**Preview Panel**
- 128×128px canvas showing the selected slot's glyph at full quality.
- Palette applied live.
- Shows slot key label below.

**Editor Section**
- Stroke count, total points, bounding box info (read-only).
- **Open in GlyphLab ↗** button:
  - Exports current set to `localStorage["glyphlab-project"]` as GlyphLab-native JSON.
  - Opens `http://localhost:5173` in a new browser tab.
  - When user returns, **Sync from GlyphLab** button appears → re-imports from `localStorage["glyphlab-project"]`.
- Future: inline micro-editor for single-stroke edits (Phase 2).

**Palette Section**
- Preset picker (braun / panel / bold-geo / chalk / tag / bauhaus).
- Color pickers for stroke and fill (custom override).
- Mode toggle: stroke / fill / fill+stroke / inverse.
- Changes update active set's palette, persist immediately.

**Placement Toolbar**
- **Arm slot** button → sets `state.symbols.placementSlot`, activates placement mode on canvas.
- Size slider: 24–256px for world placement.
- **↓ Export PNG** → triggers `exportSetPNG()`, downloads file.

### 8.3 GlyphLab Bridge

The bridge uses `localStorage` as the shared data channel — GlyphLab already writes to `localStorage["glyphlab-project"]`.

**Export to GlyphLab:**
```js
// Called when "Open in GlyphLab" is clicked
var json = SBE.SymbolSystem.exportSet(activeSetId);   // GlyphLab-native format
localStorage.setItem("glyphlab-project", json);
window.open("http://localhost:5173", "_blank");
```

**Import from GlyphLab:**
```js
// Called when "Sync from GlyphLab" is clicked
var raw = localStorage.getItem("glyphlab-project");
SBE.SymbolSystem.importFromGlyphLab(raw);             // updates registered set
```

The bridge is **manual** (button-triggered) — no polling, no `storage` event listener. The user controls the sync moment. This keeps the data contract simple and avoids race conditions.

---

## 9. Import Pipeline

`importFromGlyphLab(jsonString)`:

1. Parse JSON → `GlyphMap` (validates keys and stroke structure).
2. Detect if a SymbolSet with `meta.sourceFile === filename` already exists → update in place (bump version).
3. Otherwise → create new SymbolSet with:
   - `family: "typographic"` (default; user can change in SymbolLab)
   - `palette: palettes.braun` (default)
   - `meta.authoringApp: "glyphlab"`
4. For each entry in GlyphMap:
   - Validate `strokes` array exists.
   - Compute and cache `bounds` from point extremes (normalized to 0..1).
   - Store in `symbolSet.glyphs[key]`.
5. Register set → persist → emit `symbols:import-complete`.

**Extended slot import:** If the GlyphLab export contains keys matching `@family:N` pattern, they are imported as extended slots. GlyphLab does not natively produce these — they would only appear if a previously-exported WOS set was round-tripped.

---

## 10. World Placement

When `state.symbols.placementSlot` is non-null, the canvas enters **symbol placement mode**.

On `pointerdown` (canvas, not in any other tool mode):
1. Resolve `glyph = SBE.SymbolSystem.getGlyph(activeSetId, placementSlot)`.
2. Create a world object of type `"symbol"`:
   ```js
   {
     type: "symbol",
     x, y,                           // canvas coords
     setId: state.symbols.activeSetId,
     slot: state.symbols.placementSlot,
     size: state.symbols.placementSize,
     palette: state.symbols.placementPalette,  // null = inherit from set
     rotation: 0,
     opacity: 1,
   }
   ```
3. Add to world object list, trigger redraw.
4. Symbol objects are selectable, movable, resizable, and rotatable with existing transform tools.
5. `Escape` or switching tools → clears `placementSlot`, exits placement mode.

**Canvas render dispatch:** In the main draw loop, world objects of `type === "symbol"` are dispatched to `WOS.SymbolRenderer.renderGlyph()`.

---

## 11. Procedural Bridge (Legacy Compatibility)

`SBE.SymbolSystem.buildProceduralSet()` creates a SymbolSet from `WOS.GlyphRenderer`:

```js
{
  id: "wos-builtin-bauhaus",
  name: "Bauhaus Tiles (Built-in)",
  family: "procedural",
  palette: palettes.bauhaus,
  glyphs: {
    "@proc:0":  { strokes: [...] },  // C  = full quad
    "@proc:1":  { strokes: [...] },  // C# = ...
    // ... 12 notes
  },
  meta: { authoringApp: "wos", pinned: true }
}
```

This set is auto-registered at boot. It cannot be deleted (pinned). It bridges the old note-to-glyph system — existing collision-triggered glyph rendering continues to work by addressing `@proc:N` slots.

---

## 12. File Map

```
engine/
  glyphRenderer.js       — KEEP (legacy, used by buildProceduralSet + old Bauhaus tiles)
  symbolRenderer.js      — NEW — path-based stroke renderer for SymbolSets

ui/
  events.js              — KEEP (no changes)
  drawerSystem.js        — KEEP (no changes)
  glyphDrawer.js         — DEPRECATE — replaced by symbolDrawer.js
  symbolDrawer.js        — NEW — SymbolLab drawer (mount/unmount, all UI)

  symbolSystem.js        — NEW — SBE.SymbolSystem runtime (registry, import, export)

index.html               — add script tags for symbolSystem.js, symbolRenderer.js, symbolDrawer.js
                           add launcher button for "symbols" drawer
main.js                  — add state.symbols block
                           register symbolDrawer with DrawerSystem
styles.css               — SymbolLab drawer UI styles
```

---

## 13. Implementation Phases

### Phase 1 — Data Model + Registry
- `engine/symbolRenderer.js` (path construction from Stroke[])
- `ui/symbolSystem.js` (SBE.SymbolSystem registry, importFromGlyphLab, persistence)
- `state.symbols` in main.js
- `buildProceduralSet()` auto-runs at boot → Bauhaus tiles still work

### Phase 2 — SymbolLab Drawer
- `ui/symbolDrawer.js` — full UI (set selector, slot grid, preview, palette, placement toolbar)
- GlyphLab bridge (localStorage export/import + "Open in GlyphLab" button)
- Styles in `styles.css`
- Launcher button + drawer registration

### Phase 3 — World Placement
- Canvas placement mode (pointerdown handler in main.js)
- World object type `"symbol"` in draw loop dispatch
- Selection, move, resize, rotate via existing transform tools

### Phase 4 — String Layout (optional)
- `renderString()` — typographic run rendering for `"typographic"` family sets
- Text tool integration: type characters → paint symbol runs on canvas

---

## 14. Out-of-Scope (Explicit Deferrals)

- **Inline stroke editor** — editing strokes inside WOS without launching GlyphLab. Deferred to a future spec.
- **Multi-set layering** — compositing two SymbolSets on a single world object.
- **MIDI/audio-triggered slot selection** — selecting which slot to render based on note hit (beyond the existing Bauhaus proc bridge).
- **Web font export** — generating `.woff2` or `.otf` from a typographic SymbolSet.
- **Collaborative sync** — sharing SymbolSets across sessions or users.

---

*End of spec — 0513_WOS_SymbolSystem_v1.0.0*
