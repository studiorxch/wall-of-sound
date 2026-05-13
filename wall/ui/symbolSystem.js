// 0513_WOS_SymbolSystem_v1.0.0
// SymbolSet registry, import pipeline, persistence, and event emission.
// Attaches to SBE.SymbolSystem.
// Load order: symbolRenderer.js → symbolSystem.js → symbolDrawer.js
//
// SymbolSets are the atom of WOS's visual symbolic language:
//   SymbolSet → GlyphMap → Glyph → Stroke[] → Point[]
// All coordinates are normalized to 0..1 (unit square) on import.
// The renderer scales to any target size at draw time.

(function initSymbolSystem(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Slot key space ────────────────────────────────────────────────────────
  // Stable character slots inherited from GlyphLab's CHARACTER_SET.
  // Extended slots use @family:N namespace.

  var CHARACTER_SET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
    ".!?,;:'\"-_ ";

  // All standard typographic slot keys as an ordered array.
  var TYPOGRAPHIC_SLOTS = CHARACTER_SET.split("");

  // Extended slot ranges (ordered arrays for display)
  var EXTENDED_SLOTS = {
    iconic:      _range("@icon:",      0, 63),
    musical:     _range("@music:",     0, 63),
    transport:   _range("@transport:", 0, 63),
    territorial: _range("@mark:",      0, 63),
    procedural:  _range("@proc:",      0, 11),
  };

  function _range(prefix, lo, hi) {
    var arr = [];
    for (var i = lo; i <= hi; i++) arr.push(prefix + i);
    return arr;
  }

  // ── Palette presets ───────────────────────────────────────────────────────

  var PALETTE_PRESETS = {
    braun: {
      mode: "stroke", strokeColor: "#000000", strokeWeight: 1.5,
      fillColor: "#000000", bgColor: "#ffffff", opacity: 1.0, snap: 8,
    },
    panel: {
      mode: "stroke", strokeColor: "#e0e0e0", strokeWeight: 1.0,
      fillColor: "#e0e0e0", bgColor: "#1a1a2e", opacity: 1.0, snap: null,
    },
    "bold-geo": {
      mode: "fill", strokeColor: "#000000", strokeWeight: 0,
      fillColor: "#000000", bgColor: "#ffffff", opacity: 1.0, snap: 4,
    },
    chalk: {
      mode: "stroke", strokeColor: "#f0ede0", strokeWeight: 2.0,
      fillColor: "#f0ede0", bgColor: null, opacity: 1.0, snap: null,
    },
    tag: {
      mode: "stroke", strokeColor: "#ff4b4b", strokeWeight: 1.5,
      fillColor: "#ff4b4b", bgColor: null, opacity: 1.0, snap: null,
    },
    bauhaus: {
      mode: "fill", strokeColor: "#000000", strokeWeight: 1.0,
      fillColor: "#26d3a6", bgColor: "#ffffff", opacity: 1.0, snap: null,
    },
  };

  // ── Registry ──────────────────────────────────────────────────────────────

  var _registry = {};     // id → SymbolSet
  var _activeId = null;
  var STORAGE_KEY = "wos_symbol_sets_v1";
  var MAX_SETS    = 50;

  // ── Utilities ─────────────────────────────────────────────────────────────

  function _uuid() {
    return "ss-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function _now() {
    return new Date().toISOString();
  }

  function _emit(event, payload) {
    if (SBE.Events && typeof SBE.Events.emit === "function") {
      SBE.Events.emit(event, payload);
    }
  }

  // ── Coordinate normalization ──────────────────────────────────────────────
  // GlyphLab stores raw pixel coordinates. We normalize to 0..1 on import
  // using the bounding box of all points in the glyph.

  function _normalizeBounds(strokes) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach(function (s) {
      if (!s || !s.points) return;
      s.points.forEach(function (p) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
    if (!isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 };
    var w = maxX - minX || 1;
    var h = maxY - minY || 1;
    // Keep aspect ratio; center in unit square.
    var span = Math.max(w, h);
    return {
      rawMinX: minX, rawMinY: minY,
      rawSpan: span,
      x: 0, y: 0, w: w / span, h: h / span,
    };
  }

  function _normalizeGlyph(rawGlyph) {
    var strokes = (rawGlyph.strokes || []).map(function (s) {
      return Object.assign({}, s, { points: (s.points || []).slice() });
    });
    if (!strokes.length) return { strokes: [], bounds: { x: 0, y: 0, w: 1, h: 1 } };

    var b = _normalizeBounds(strokes);
    var span = b.rawSpan;
    var minX = b.rawMinX;
    var minY = b.rawMinY;

    // Normalize all points to 0..1 in place (mutating the cloned strokes).
    strokes.forEach(function (s) {
      s.points = s.points.map(function (p) {
        return { x: (p.x - minX) / span, y: (p.y - minY) / span };
      });
    });

    return {
      strokes: strokes,
      bounds:  { x: 0, y: 0, w: b.w, h: b.h },
      tags:    rawGlyph.tags || [],
    };
  }

  // Check if points are already normalized (all 0..1) — avoids double-normalization.
  function _alreadyNormalized(strokes) {
    if (!strokes || !strokes.length) return true;
    for (var si = 0; si < strokes.length; si++) {
      var pts = strokes[si].points || [];
      for (var pi = 0; pi < pts.length; pi++) {
        var p = pts[pi];
        if (p.x > 2 || p.y > 2 || p.x < -1 || p.y < -1) return false;
      }
    }
    return true;
  }

  // ── SymbolSet factory ─────────────────────────────────────────────────────

  function _makeSet(overrides) {
    var now = _now();
    return Object.assign({
      id:       _uuid(),
      name:     "Untitled",
      version:  1,
      created:  now,
      modified: now,
      family:   "typographic",
      palette:  Object.assign({}, PALETTE_PRESETS.braun),
      glyphs:   {},
      meta:     { authoringApp: "wos", tags: [] },
    }, overrides);
  }

  // ── Registry operations ───────────────────────────────────────────────────

  function registerSet(symbolSet) {
    if (!symbolSet || !symbolSet.id) {
      console.warn("[SymbolSystem] registerSet: missing id");
      return null;
    }
    symbolSet.modified = _now();
    _registry[symbolSet.id] = symbolSet;
    _persist();
    _emit("symbols:set-registered", { id: symbolSet.id, set: symbolSet });
    console.log("[SymbolSystem] registered:", symbolSet.id, "—", symbolSet.name);
    return symbolSet;
  }

  function getSet(id) {
    return _registry[id] || null;
  }

  function getAllSets() {
    return Object.values(_registry);
  }

  function deleteSet(id) {
    if (!_registry[id]) return;
    if (_registry[id].meta && _registry[id].meta.pinned) {
      console.warn("[SymbolSystem] deleteSet: set is pinned:", id);
      return;
    }
    delete _registry[id];
    if (_activeId === id) _activeId = null;
    _persist();
    _emit("symbols:set-deleted", { id: id });
    console.log("[SymbolSystem] deleted:", id);
  }

  // ── Active set ────────────────────────────────────────────────────────────

  function getActiveSet() {
    return _activeId ? (_registry[_activeId] || null) : null;
  }

  function setActiveSet(id) {
    if (id !== null && !_registry[id]) {
      console.warn("[SymbolSystem] setActiveSet: no set with id:", id);
      return;
    }
    _activeId = id;
    // Sync into global state if available
    var state = global._wos && global._wos.state;
    if (state && state.symbols) state.symbols.activeSetId = id;
    _emit("symbols:set-activated", { id: id, set: id ? _registry[id] : null });
  }

  // ── Glyph access ─────────────────────────────────────────────────────────

  function getGlyph(setId, slotKey) {
    var set = _registry[setId];
    return (set && set.glyphs && set.glyphs[slotKey]) || null;
  }

  function setGlyph(setId, slotKey, glyph) {
    var set = _registry[setId];
    if (!set) return;
    set.glyphs[slotKey] = glyph;
    set.version++;
    set.modified = _now();
    _persist();
    _emit("symbols:glyph-changed", { setId: setId, slotKey: slotKey, glyph: glyph });
  }

  // ── Import from GlyphLab ──────────────────────────────────────────────────
  // GlyphLab exports: { [slotKey]: { strokes: Stroke[] } }
  // Or it may include metadata at the top level — we extract GlyphMap safely.

  function importFromGlyphLab(jsonString, meta) {
    meta = meta || {};
    var raw;
    try {
      raw = JSON.parse(jsonString);
    } catch (e) {
      console.error("[SymbolSystem] importFromGlyphLab: JSON parse failed", e);
      return null;
    }

    // GlyphLab may wrap the GlyphMap in a project envelope or export raw.
    // Support both: { glyphs: GlyphMap } and raw GlyphMap.
    var glyphMap = raw;
    if (raw && raw.glyphs && typeof raw.glyphs === "object") {
      glyphMap = raw.glyphs;
    }

    // Find existing set by sourceFile or create new one
    var sourceFile = meta.sourceFile || null;
    var existingId = null;
    if (sourceFile) {
      Object.values(_registry).forEach(function (s) {
        if (s.meta && s.meta.sourceFile === sourceFile) existingId = s.id;
      });
    }

    var set = existingId
      ? Object.assign({}, _registry[existingId])
      : _makeSet({
          name:   meta.name || "GlyphLab Import",
          family: meta.family || "typographic",
          meta:   { authoringApp: "glyphlab", sourceFile: sourceFile, tags: [] },
        });

    set.glyphs = {};

    var importedCount = 0;
    Object.keys(glyphMap).forEach(function (key) {
      var rawGlyph = glyphMap[key];
      if (!rawGlyph || !Array.isArray(rawGlyph.strokes)) return;
      // Normalize if needed
      var glyph = _alreadyNormalized(rawGlyph.strokes)
        ? { strokes: rawGlyph.strokes, bounds: rawGlyph.bounds || { x: 0, y: 0, w: 1, h: 1 }, tags: rawGlyph.tags || [] }
        : _normalizeGlyph(rawGlyph);
      set.glyphs[key] = glyph;
      importedCount++;
    });

    set.version = (set.version || 0) + 1;
    registerSet(set);

    console.log("[SymbolSystem] importFromGlyphLab: imported", importedCount, "glyphs into set", set.id);
    _emit("symbols:import-complete", { id: set.id, set: set, source: "glyphlab" });

    return set;
  }

  function importFromFile(file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var set = importFromGlyphLab(e.target.result, { sourceFile: file.name, name: file.name.replace(/\.[^.]+$/, "") });
      if (typeof callback === "function") callback(set);
    };
    reader.onerror = function () {
      console.error("[SymbolSystem] importFromFile: read error");
      if (typeof callback === "function") callback(null);
    };
    reader.readAsText(file);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  // Export a SymbolSet as a GlyphLab-compatible JSON string.
  // Glyphs are denormalized back to a 512×512 coordinate space for GlyphLab.
  function exportSet(id) {
    var set = _registry[id];
    if (!set) return null;
    var EXPORT_SIZE = 512;
    var out = {};
    Object.keys(set.glyphs).forEach(function (key) {
      var glyph = set.glyphs[key];
      if (!glyph || !glyph.strokes) return;
      out[key] = {
        strokes: glyph.strokes.map(function (s) {
          return Object.assign({}, s, {
            points: (s.points || []).map(function (p) {
              return { x: p.x * EXPORT_SIZE, y: p.y * EXPORT_SIZE };
            }),
          });
        }),
        tags: glyph.tags || [],
      };
    });
    return JSON.stringify(out, null, 2);
  }

  // Export full glyph sheet as PNG blob.
  function exportSetPNG(id, cellSize, callback) {
    var set = _registry[id];
    if (!set || typeof callback !== "function") return;
    cellSize = cellSize || 64;
    var keys  = Object.keys(set.glyphs);
    var cols  = Math.min(keys.length, 8);
    var rows  = Math.ceil(keys.length / cols);
    var w     = cols * cellSize;
    var h     = rows * cellSize;
    var canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    var SR  = global.WOS && global.WOS.SymbolRenderer;
    if (!SR) { callback(null); return; }
    SR.renderSet(ctx, set, 0, 0, cellSize, cols, set.palette);
    canvas.toBlob(callback, "image/png");
  }

  // ── Procedural bridge ─────────────────────────────────────────────────────
  // Builds a SymbolSet from the legacy Bauhaus tile renderer (glyphRenderer.js).
  // Maps 12 chromatic notes → @proc:0–11.
  // This is called once at boot if GlyphRenderer is available.

  function buildProceduralSet() {
    var GR = global.WOS && global.WOS.GlyphRenderer;
    if (!GR) {
      console.warn("[SymbolSystem] buildProceduralSet: WOS.GlyphRenderer not found");
      return null;
    }

    var NOTE_ORDER = GR.getNoteOrder ? GR.getNoteOrder() :
      ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

    // The Bauhaus renderer is self-contained (it draws directly to ctx).
    // We can't extract strokes from it, so we wrap each note as a special
    // procedural glyph with a single "renderer" stroke that stores the note.
    // The symbolRenderer skips this glyph type gracefully;
    // the legacy renderBauhausGlyph function handles the actual draw pass.
    var glyphs = {};
    NOTE_ORDER.forEach(function (note, i) {
      glyphs["@proc:" + i] = {
        strokes: [],   // no stroke data — rendered by legacy path
        _bauhaus: { note: note },
        bounds: { x: 0, y: 0, w: 1, h: 1 },
        tags: ["procedural", "bauhaus", note],
      };
    });

    var set = _makeSet({
      id:      "wos-builtin-bauhaus",
      name:    "Bauhaus Tiles (Built-in)",
      family:  "procedural",
      palette: Object.assign({}, PALETTE_PRESETS.bauhaus),
      glyphs:  glyphs,
      meta:    { authoringApp: "wos", pinned: true, tags: ["builtin", "procedural"] },
    });

    registerSet(set);
    console.log("[SymbolSystem] built procedural set: wos-builtin-bauhaus");
    return set;
  }

  // ── Slot helpers ──────────────────────────────────────────────────────────

  function getTypographicSlots() { return TYPOGRAPHIC_SLOTS.slice(); }
  function getExtendedSlots(family) { return (EXTENDED_SLOTS[family] || []).slice(); }
  function getSlotsForFamily(family) {
    if (family === "typographic") return TYPOGRAPHIC_SLOTS.slice();
    return EXTENDED_SLOTS[family] || [];
  }

  function getPalettePreset(name) {
    return PALETTE_PRESETS[name] ? Object.assign({}, PALETTE_PRESETS[name]) : null;
  }
  function getPalettePresetNames() { return Object.keys(PALETTE_PRESETS); }

  // ── New set factory ───────────────────────────────────────────────────────

  function createSet(options) {
    options = options || {};
    var set = _makeSet({
      name:   options.name   || "Untitled Set",
      family: options.family || "typographic",
      palette: Object.assign({}, PALETTE_PRESETS[options.palette || "braun"]),
      meta:   { authoringApp: "wos", tags: [] },
    });
    registerSet(set);
    return set;
  }

  function duplicateSet(id) {
    var src = _registry[id];
    if (!src) return null;
    var copy = JSON.parse(JSON.stringify(src));
    copy.id   = _uuid();
    copy.name = src.name + " (copy)";
    copy.meta = Object.assign({}, src.meta, { pinned: false });
    return registerSet(copy);
  }

  function renameSet(id, name) {
    var set = _registry[id];
    if (!set || !name) return;
    set.name = name;
    registerSet(set);
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  function _persist() {
    var sets = Object.values(_registry);
    // LRU eviction: if over MAX_SETS, remove oldest non-pinned set.
    while (sets.length > MAX_SETS) {
      sets.sort(function (a, b) {
        if (a.meta && a.meta.pinned) return 1;
        if (b.meta && b.meta.pinned) return -1;
        return a.modified < b.modified ? -1 : 1;
      });
      var victim = sets.shift();
      if (victim.meta && victim.meta.pinned) break;
      delete _registry[victim.id];
      sets = Object.values(_registry);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.values(_registry)));
    } catch (e) {
      console.warn("[SymbolSystem] persist failed:", e.message);
    }
  }

  function _loadPersisted() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var sets = JSON.parse(raw);
      sets.forEach(function (set) {
        if (set && set.id) {
          _registry[set.id] = set;
        }
      });
      console.log("[SymbolSystem] loaded", sets.length, "set(s) from storage");
    } catch (e) {
      console.warn("[SymbolSystem] failed to load persisted sets:", e.message);
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function _boot() {
    _loadPersisted();
    // Always ensure the built-in procedural set exists
    if (!_registry["wos-builtin-bauhaus"]) {
      buildProceduralSet();
    }
    // Auto-activate first non-procedural set if any; else procedural
    var sets = Object.values(_registry);
    var first = sets.find(function (s) { return s.family !== "procedural"; }) || sets[0];
    if (first && !_activeId) {
      _activeId = first.id;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  SBE.SymbolSystem = {
    // Registry
    registerSet:          registerSet,
    getSet:               getSet,
    getAllSets:            getAllSets,
    deleteSet:            deleteSet,

    // Set management
    createSet:            createSet,
    duplicateSet:         duplicateSet,
    renameSet:            renameSet,

    // Active set
    getActiveSet:         getActiveSet,
    setActiveSet:         setActiveSet,

    // Glyph access
    getGlyph:             getGlyph,
    setGlyph:             setGlyph,

    // Import / export
    importFromGlyphLab:   importFromGlyphLab,
    importFromFile:       importFromFile,
    exportSet:            exportSet,
    exportSetPNG:         exportSetPNG,

    // Procedural bridge
    buildProceduralSet:   buildProceduralSet,

    // Slots + palette
    getTypographicSlots:  getTypographicSlots,
    getExtendedSlots:     getExtendedSlots,
    getSlotsForFamily:    getSlotsForFamily,
    getPalettePreset:     getPalettePreset,
    getPalettePresetNames: getPalettePresetNames,

    // Constants (read-only reference)
    CHARACTER_SET:        CHARACTER_SET,
    PALETTE_PRESETS:      PALETTE_PRESETS,
  };

  _boot();

  console.log("[WOS SymbolSystem] Loaded — v1.0.0");
})(window);
