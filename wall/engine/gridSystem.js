// 0510_WOS_FieldCompositionPass_v1.0.0
// MIDI Bank → World Layer → Grid Environment
// Vanilla IIFE — attaches to global SBE.GridSystem

(function initGridSystem(global) {
  var SBE = (global.SBE = global.SBE || {});

  // ── Bauhaus Palettes ─────────────────────────────────────────────────────────
  // Colors are read left-to-right from the palette screenshot.
  // note class → colors[noteClass % colors.length]  (wraps safely)
  var BAUHAUS_PALETTES = {
    exhibition1923: {
      id: "exhibition1923", name: "Exhibition 1923",
      background: "#f3eee1",
      colors: ["#2c2c2c", "#e64f99", "#f6c000", "#3b7b9e", "#e65f3e", "#3c8b67"],
    },
    modernNoir: {
      id: "modernNoir", name: "Modern Noir",
      background: "#1a1a1a",
      colors: ["#e8682a", "#1a7a6e", "#f0c420", "#f07daa", "#4060cc"],
    },
    primary: {
      id: "primary", name: "Primary",
      background: "#f5f5f0",
      colors: ["#cc2222", "#f0c020", "#2266cc", "#1a1a1a"],
    },
    kandinsky: {
      id: "kandinsky", name: "Kandinsky",
      background: "#f0ece4",
      colors: ["#6699dd", "#f08020", "#cc2222", "#44ddaa", "#1a1a1a"],
    },
    albers: {
      id: "albers", name: "Albers",
      background: "#f5f0e8",
      colors: ["#cc1818", "#5040aa", "#f0c000", "#1a1a1a", "#d4800a"],
    },
    moholyNagy: {
      id: "moholyNagy", name: "Moholy-Nagy",
      background: "#f2f0eb",
      colors: ["#cc1830", "#208850", "#e87030", "#40c8c0", "#1a2888"],
    },
    sunset: {
      id: "sunset", name: "Sunset",
      background: "#f8ede0",
      colors: ["#e86060", "#e88840", "#e8b070", "#d8c898", "#a0bb88"],
    },
    ocean: {
      id: "ocean", name: "Ocean",
      background: "#e8f0f2",
      colors: ["#0a1e26", "#1a6e7a", "#40c8c0", "#e8e0c0", "#d4a020"],
    },
  };

  // ── Bauhaus Finishes ─────────────────────────────────────────────────────────
  var BAUHAUS_FINISHES = {
    clean:     { id: "clean",     name: "Clean" },
    paperSoft: { id: "paperSoft", name: "Paper Soft" },
    inkWash:   { id: "inkWash",   name: "Ink Wash" },
  };

  var DEFAULT_PALETTE_ID = "exhibition1923";
  var DEFAULT_FINISH_ID  = "paperSoft";

  // ── Note color (12 note classes, same hue map as midiImporter) ──────────────
  var NOTE_COLORS = [
    "#ff4d4d", // C
    "#ff7f50", // C#
    "#ffb347", // D
    "#ffd700", // D#
    "#c8e63c", // E
    "#6ddc6d", // F
    "#3de8b0", // F#
    "#4dcfff", // G
    "#4d9eff", // G#
    "#9b6dff", // A
    "#dd6dff", // A#
    "#ff6db6", // B
  ];

  // ── Block Library ────────────────────────────────────────────────────────────
  var BLOCK_LIBRARY = {
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

  // ── Placement mode enum ──────────────────────────────────────────────────────
  var GRID_PLACEMENT_MODES = {
    TIME_X_PITCH_Y: "timeX_pitchY",
    TIME_X_NOTECLASS_Y: "timeX_noteClassY",
    PACKED_TIME_GRID: "packedTimeGrid",
    SPIRAL: "spiral",
    MAZE: "maze",
    DENSITY_FIELD: "densityField",
    RANDOM_WALK: "randomWalk",
  };

  // ── Canonical Bauhaus grid — one path, no user-facing options ───────────────
  var CANONICAL_BAUHAUS_GRID = {
    rendererId:    "bauhausMinimal",
    layerType:     "grid",
    role:          "environment",
    placementMode: "packedTimeGrid",
    fitMode:       "fitFrame",
    tileStyle:     "square",
    colorMode:     "noteClass",
    blockStyleId:  "solid_note_tile",
    audioChannelId:"gridNotes",
    padding:       24,
    gap:           1,
    minCellSize:   4,
    maxCellSize:   120,
  };

  // ── computePackedGridDimensions ──────────────────────────────────────────────
  function computePackedGridDimensions(noteCount, width, height) {
    var safeCount = Math.max(1, noteCount || 1);
    var aspect = (width || 1080) / (height || 1920);
    var columns = Math.ceil(Math.sqrt(safeCount * aspect));
    var rows = Math.ceil(safeCount / columns);
    while (columns * rows < safeCount) {
      columns += 1;
      rows = Math.ceil(safeCount / columns);
    }
    return { columns: columns, rows: rows };
  }

  // ── Default grid settings ────────────────────────────────────────────────────
  var DEFAULT_GRID_SETTINGS = {
    columns: 32,
    rows: 18,
    cellSize: 32,
    gap: 2,
    quantizeBeats: 0,
    placementMode: "timeX_pitchY",
    wrapMode: "wrapRows",
    pitchRange: { min: 36, max: 84 },
    colorMode: "noteClass",
    sizeMode: "none",
    opacityMode: "none",
    blockStyleId: "solid_note_tile",
    // fitFrame settings
    fitMode: "fixedCell",    // "fitFrame" | "fixedCell"
    framePadding: 24,
    minCellSize: 2,
    maxCellSize: 32,
  };

  // ── ID helpers ───────────────────────────────────────────────────────────────
  var _idCounter = 0;
  function genId(prefix) {
    return prefix + "_" + Date.now() + "_" + (++_idCounter);
  }

  // ── Color helpers ─────────────────────────────────────────────────────────────
  function hexToRgb(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }

  function rgbaFromHex(hex, alpha) {
    var c = hexToRgb(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + (alpha != null ? alpha : 1) + ")";
  }

  function lightenHex(hex, amount) {
    var c = hexToRgb(hex);
    var a = amount != null ? amount : 0.4;
    var r = Math.round(Math.min(255, c.r + (255 - c.r) * a));
    var g = Math.round(Math.min(255, c.g + (255 - c.g) * a));
    var b = Math.round(Math.min(255, c.b + (255 - c.b) * a));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function muteHex(hex, amount) {
    var c = hexToRgb(hex);
    var a = amount != null ? amount : 0.35;
    var mid = 128;
    var r = Math.round(c.r + (mid - c.r) * a);
    var g = Math.round(c.g + (mid - c.g) * a);
    var b = Math.round(c.b + (mid - c.b) * a);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  // ── getPaletteColor ──────────────────────────────────────────────────────────
  function getPaletteColor(noteClass, palette) {
    var colors = palette && palette.colors && palette.colors.length
      ? palette.colors
      : NOTE_COLORS;
    var nc = ((noteClass % 12) + 12) % 12;
    return colors[nc % colors.length];
  }

  // ── applyBauhausFinish ───────────────────────────────────────────────────────
  function applyBauhausFinish(ctx, finishId, x, y, w, h, palette) {
    if (!finishId || finishId === "clean") return;

    if (finishId === "paperSoft") {
      // Warm paper veil
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = palette.background;
      ctx.fillRect(x, y, w, h);

      // Film-grain speckles (max 180 dots — safe for dense grids)
      var speckCount = Math.min(180, Math.floor((w * h) / 2200));
      ctx.fillStyle = "#2c2c2c";
      for (var i = 0; i < speckCount; i++) {
        ctx.globalAlpha = Math.random() * 0.055;
        ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 1, 1);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    if (finishId === "inkWash") {
      // Vertical column atmosphere inspired by infra-01 — static sine phase, no audio
      var colCount = 20;
      var colW = w / colCount;
      ctx.save();
      for (var c = 0; c < colCount; c++) {
        var phase = (c / colCount) * Math.PI * 2.7;
        var pressure = Math.sin(phase) * 0.5 + 0.5;
        var cx = x + c * colW;
        var colors = palette.colors;

        var grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0.0,  rgbaFromHex(colors[0 % colors.length], 0.04));
        grad.addColorStop(0.42, rgbaFromHex(colors[1 % colors.length], 0.04 + pressure * 0.07));
        grad.addColorStop(0.75, rgbaFromHex(colors[2 % colors.length], 0.02 + pressure * 0.04));
        grad.addColorStop(1.0,  rgbaFromHex(palette.background, 0.06));

        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.fillRect(cx, y, colW + 1, h);
      }
      ctx.restore();
      return;
    }
  }

  // ── getNoteColor ─────────────────────────────────────────────────────────────
  function getNoteColor(note, noteClass, colorMode) {
    var nc = typeof noteClass === "number" ? noteClass : (note % 12);
    return NOTE_COLORS[nc % 12] || "#ffffff";
  }

  // ── computeFitCellSize ───────────────────────────────────────────────────────
  // Derives cellSize so the grid exactly fills the available canvas area.
  function computeFitCellSize(g, canvasW, canvasH) {
    var padding = (g.framePadding != null ? g.framePadding : 24) * 2;
    var availW = (canvasW || 1080) - padding;
    var availH = (canvasH || 1920) - padding;
    var gap = g.gap || 0;
    // cellSize such that cols*(cellSize+gap)-gap <= availW and rows*(cellSize+gap)-gap <= availH
    var fitW = Math.floor((availW + gap) / Math.max(1, g.columns)) - gap;
    var fitH = Math.floor((availH + gap) / Math.max(1, g.rows)) - gap;
    var cell = Math.min(fitW, fitH);
    var minCell = g.minCellSize != null ? g.minCellSize : 2;
    var maxCell = g.maxCellSize != null ? g.maxCellSize : 32;
    return Math.max(minCell, Math.min(maxCell, cell));
  }

  // ── createGridLayerFromMidiBank ──────────────────────────────────────────────
  function createGridLayerFromMidiBank(bankId, options) {
    if (!bankId) {
      console.warn("[WOS GRID] createGridLayerFromMidiBank: no bankId");
      return null;
    }
    var opts = options || {};
    var grid = Object.assign({}, DEFAULT_GRID_SETTINGS, opts.grid || {});
    var layer = {
      id: genId("layer_grid"),
      name: opts.name || "Environment Grid 01",
      type: "grid",
      role: "environment",
      visible: true,
      locked: false,
      zIndex: 0,
      zDepth: 0,
      parallax: { enabled: false, factorX: 1, factorY: 1 },
      source: { type: "midiBank", bankId: bankId },
      grid: grid,
      blocks: [],
    };
    return layer;
  }

  // ── mapMidiEventToGridCell ───────────────────────────────────────────────────
  // Returns { col, row } or null for unsupported mode.
  function mapMidiEventToGridCell(event, bank, gridSettings) {
    var g = gridSettings;
    var mode = g.placementMode || "timeX_pitchY";

    if (mode === "timeX_pitchY") {
      var totalBeats = bank.length || 1;
      var col = Math.floor((event.startBeat / totalBeats) * g.columns);
      col = Math.max(0, Math.min(g.columns - 1, col));
      var pitchMin = g.pitchRange.min;
      var pitchMax = g.pitchRange.max;
      var pitchClamped = Math.max(pitchMin, Math.min(pitchMax, event.note));
      var pitchNorm = (pitchClamped - pitchMin) / Math.max(1, pitchMax - pitchMin);
      var row = Math.floor((1 - pitchNorm) * (g.rows - 1));
      row = Math.max(0, Math.min(g.rows - 1, row));
      return { col: col, row: row };
    }

    if (mode === "timeX_noteClassY") {
      var totalBeats2 = bank.length || 1;
      var col2 = Math.floor((event.startBeat / totalBeats2) * g.columns);
      col2 = Math.max(0, Math.min(g.columns - 1, col2));
      var nc = (event.note != null ? event.note : 60) % 12;
      var row2 = Math.floor((nc / 12) * g.rows);
      row2 = Math.max(0, Math.min(g.rows - 1, row2));
      return { col: col2, row: row2 };
    }

    // packedTimeGrid handled separately in generateGridBlocksFromMidiBank
    return null;
  }

  // ── generateGridBlocksFromMidiBank ───────────────────────────────────────────
  function generateGridBlocksFromMidiBank(bank, gridSettings, layerId, canvasW, canvasH) {
    if (!bank) {
      console.warn("[WOS GRID] generateGridBlocksFromMidiBank: no bank");
      return [];
    }
    var events = bank.events;
    if (!events || !events.length) {
      console.warn("[WOS GRID] Bank has no events:", bank.id);
      return [];
    }
    if (!gridSettings || gridSettings.columns < 1 || gridSettings.rows < 1) {
      console.warn("[WOS GRID] Invalid grid dimensions");
      return [];
    }

    var g = gridSettings;

    // Resolve cellSize for fitFrame mode
    var cellSize = g.cellSize;
    if (g.fitMode === "fitFrame") {
      cellSize = computeFitCellSize(g, canvasW, canvasH);
    }

    var styleId = g.blockStyleId || "solid_note_tile";
    if (!BLOCK_LIBRARY[styleId]) {
      console.warn("[WOS GRID] Unknown block style:", styleId, "— falling back to solid_note_tile");
      styleId = "solid_note_tile";
    }

    var gap = g.gap;
    var blocks = [];
    var q = g.quantizeBeats || 0;
    var mode = g.placementMode || "timeX_pitchY";

    if (mode === "packedTimeGrid") {
      // Sort by startBeat asc, then pitch asc, then index
      var sorted = events.slice().sort(function (a, b) {
        if (a.startBeat !== b.startBeat) return a.startBeat - b.startBeat;
        return (a.note || 0) - (b.note || 0);
      });
      var cap = g.columns * g.rows;
      sorted.forEach(function (evt, idx) {
        var startBeat = evt.startBeat;
        if (q > 0) startBeat = Math.round(startBeat / q) * q;

        var sequenceIndex = idx;
        var stackIndex = Math.floor(idx / cap);
        var cellIndex = idx % cap;
        var col = cellIndex % g.columns;
        var row = Math.floor(cellIndex / g.columns) % g.rows;
        var cellKey = col + "," + row;

        var noteClass = evt.noteClass != null ? evt.noteClass : (evt.note % 12);
        var velNorm = Math.max(0, Math.min(1, (evt.velocity || 64) / 127));
        var durNorm = Math.max(0, Math.min(1, (evt.durationBeats || 0.25) / 2));
        var x = col * (cellSize + gap);
        var y = row * (cellSize + gap);
        var baseAlpha = g.opacityMode === "velocity" ? (0.35 + velNorm * 0.65) : 1;
        var w = g.sizeMode === "velocity" ? Math.round(cellSize * (0.5 + velNorm * 0.5)) : cellSize;
        var h = g.sizeMode === "velocity" ? Math.round(cellSize * (0.5 + velNorm * 0.5)) : cellSize;
        if (g.sizeMode === "velocity") {
          x += Math.round((cellSize - w) / 2);
          y += Math.round((cellSize - h) / 2);
        }

        blocks.push({
          id: genId("block"),
          layerId: layerId,
          sourceEventId: evt.id,
          sourceIndex: evt.index != null ? evt.index : idx,
          bankId: bank.id,
          note: evt.note,
          noteClass: noteClass,
          velocity: evt.velocity || 64,
          velocityNorm: velNorm,
          startBeat: startBeat,
          durationBeats: evt.durationBeats || 0.5,
          durationNorm: durNorm,
          accentKind: noteClass % 4,
          col: col,
          row: row,
          x: x,
          y: y,
          width: w,
          height: h,
          color: getNoteColor(evt.note, noteClass, g.colorMode),
          baseAlpha: baseAlpha,
          active: false,
          styleId: styleId,
          sequenceIndex: sequenceIndex,
          stackIndex: stackIndex,
          cellKey: cellKey,
        });
      });
    } else {
      events.forEach(function (evt) {
        var startBeat = evt.startBeat;
        if (q > 0) startBeat = Math.round(startBeat / q) * q;

        var noteClass = evt.noteClass != null ? evt.noteClass : (evt.note % 12);
        var cell = mapMidiEventToGridCell(
          { startBeat: startBeat, note: evt.note },
          bank,
          g
        );
        if (!cell) return;

        var velNorm = Math.max(0, Math.min(1, (evt.velocity || 64) / 127));
        var x = cell.col * (cellSize + gap);
        var y = cell.row * (cellSize + gap);
        var w = g.sizeMode === "velocity" ? Math.round(cellSize * (0.5 + velNorm * 0.5)) : cellSize;
        var h = g.sizeMode === "velocity" ? Math.round(cellSize * (0.5 + velNorm * 0.5)) : cellSize;
        if (g.sizeMode === "velocity") {
          x += Math.round((cellSize - w) / 2);
          y += Math.round((cellSize - h) / 2);
        }
        var baseAlpha = g.opacityMode === "velocity" ? (0.35 + velNorm * 0.65) : 1;

        blocks.push({
          id: genId("block"),
          layerId: layerId,
          sourceEventId: evt.id,
          bankId: bank.id,
          note: evt.note,
          noteClass: noteClass,
          velocity: evt.velocity || 64,
          startBeat: startBeat,
          durationBeats: evt.durationBeats || 0.5,
          col: cell.col,
          row: cell.row,
          x: x,
          y: y,
          width: w,
          height: h,
          color: getNoteColor(evt.note, noteClass, g.colorMode),
          baseAlpha: baseAlpha,
          active: false,
          styleId: styleId,
        });
      });
    }

    console.log("[WOS GRID] Generated", blocks.length, "blocks for layer", layerId,
      "(cellSize=" + cellSize + ", mode=" + mode + ")");
    return blocks;
  }

  // ── isGridBlockActive ────────────────────────────────────────────────────────
  function isGridBlockActive(block, currentBeat) {
    return (
      currentBeat >= block.startBeat &&
      currentBeat < block.startBeat + block.durationBeats
    );
  }

  // ── updateGridLayerPlaybackState ─────────────────────────────────────────────
  function updateGridLayerPlaybackState(layer, currentBeat) {
    if (!layer || !layer.blocks) return;
    layer.blocks.forEach(function (b) {
      b.active = isGridBlockActive(b, currentBeat);
    });
  }

  // ── renderGridBlock ──────────────────────────────────────────────────────────
  function renderGridBlock(ctx, block, style, renderState) {
    var isActive = block.active;
    var alpha = block.baseAlpha != null ? block.baseAlpha : 1;
    var scale = 1;

    if (isActive) {
      var effect = style ? style.activeEffect : "pulse";
      if (effect === "pulse" || effect === "scaleGlow") {
        scale = 1.12;
        alpha = Math.min(1, alpha * 1.3);
      } else if (effect === "brightness") {
        alpha = Math.min(1, alpha * 1.5);
      }
    }

    var w = block.width * scale;
    var h = block.height * scale;
    var x = block.x + (block.width - w) / 2;
    var y = block.y + (block.height - h) / 2;
    var r = style ? style.radius : 4;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = block.color;

    if (r > 0) {
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
      } else {
        var minR = Math.min(r, w / 2, h / 2);
        ctx.moveTo(x + minR, y);
        ctx.lineTo(x + w - minR, y);
        ctx.arcTo(x + w, y, x + w, y + minR, minR);
        ctx.lineTo(x + w, y + h - minR);
        ctx.arcTo(x + w, y + h, x + w - minR, y + h, minR);
        ctx.lineTo(x + minR, y + h);
        ctx.arcTo(x, y + h, x, y + h - minR, minR);
        ctx.lineTo(x, y + minR);
        ctx.arcTo(x, y, x + minR, y, minR);
        ctx.closePath();
      }
      ctx.fill();
      if (style && style.stroke) {
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else {
      ctx.fillRect(x, y, w, h);
    }

    if (isActive && style && (style.activeEffect === "scaleGlow" || style.activeEffect === "pulse")) {
      ctx.strokeStyle = block.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }

    ctx.restore();
  }

  // ── Pattern vocabulary ───────────────────────────────────────────────────────
  var BAUHAUS_PATTERN_IDS = [
    "circle", "square", "triangle", "lines", "arch", "diamond",
    "hourglass", "triangleGrid", "halfCircle", "arc", "cornerTriangle",
    "cross", "quarterCircle", "fullArc", "pill", "ring",
  ];

  var BAUHAUS_PATTERN_VOCABULARY_VERSION = "1.3.1";

  var NOTE_CLASS_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

  var BAUHAUS_PATTERN_META = {
    circle:         { family: "circle",   complexity: 1 },
    ring:           { family: "circle",   complexity: 2 },
    halfCircle:     { family: "circleCut",complexity: 2 },
    quarterCircle:  { family: "circleCut",complexity: 3 },
    square:         { family: "rect",     complexity: 1 },
    lines:          { family: "stripe",   complexity: 2 },
    triangle:       { family: "triangle", complexity: 1 },
    cornerTriangle: { family: "triangle", complexity: 2 },
    triangleGrid:   { family: "triangle", complexity: 3 },
    diamond:        { family: "diamond",  complexity: 2 },
    hourglass:      { family: "compound", complexity: 3 },
    cross:          { family: "cross",    complexity: 2 },
    pill:           { family: "rounded",  complexity: 2 },
    arch:           { family: "arch",     complexity: 2 },
    arc:            { family: "arc",      complexity: 2 },
    fullArc:        { family: "arc",      complexity: 3 },
  };

  // Derived: family → [patternIds], built from META
  var BAUHAUS_FAMILY_PATTERNS = (function () {
    var out = {};
    BAUHAUS_PATTERN_IDS.forEach(function (id) {
      var fam = BAUHAUS_PATTERN_META[id] && BAUHAUS_PATTERN_META[id].family;
      if (!fam) return;
      if (!out[fam]) out[fam] = [];
      out[fam].push(id);
    });
    return out;
  }());

  // noteClass 0-11 → pattern family
  var DEFAULT_NOTE_FAMILY_MAP = {
    0: "circle",   // C
    1: "arc",      // C#
    2: "triangle", // D
    3: "circleCut",// D#
    4: "rect",     // E
    5: "stripe",   // F
    6: "diamond",  // F#
    7: "circle",   // G
    8: "arch",     // G#
    9: "triangle", // A
    10: "cross",   // A#
    11: "compound",// B
  };

  var _activeNotePatternOverrides = {};

  function getPatternsForFamily(family) {
    return BAUHAUS_FAMILY_PATTERNS[family] || BAUHAUS_PATTERN_IDS;
  }

  function setActiveNotePatternOverrides(overrides) {
    _activeNotePatternOverrides = overrides || {};
  }

  function resolveBauhausPatternId(block) {
    var nc = block.noteClass || 0;
    var family = _activeNotePatternOverrides[nc] || DEFAULT_NOTE_FAMILY_MAP[nc] || "circle";
    var candidates = getPatternsForFamily(family);
    var seed =
      (block.sourceIndex != null ? block.sourceIndex : (block.sequenceIndex || block.index || 0)) +
      nc * 17 +
      Math.round((block.velocityNorm || 0) * 100) * 3 +
      Math.round((block.durationNorm || 0) * 100) * 5;
    return candidates[Math.abs(seed) % candidates.length];
  }

  // ── Tile styles ──────────────────────────────────────────────────────────────
  var BAUHAUS_TILE_STYLES = {
    strictBauhaus: { id: "strictBauhaus", name: "Strict Bauhaus",
      shapeScale: 0.92, backgroundTileAlpha: 1.0, patternAlpha: 1.0, strokeWeight: 1.0, useOutline: false },
    softPrint:     { id: "softPrint",     name: "Soft Print",
      shapeScale: 0.62, backgroundTileAlpha: 0.7, patternAlpha: 0.85, strokeWeight: 0.8, useOutline: false },
    posterBlocks:  { id: "posterBlocks",  name: "Poster Blocks",
      shapeScale: 1.0,  backgroundTileAlpha: 1.0, patternAlpha: 1.0, strokeWeight: 1.2, useOutline: true },
    technicalMap:  { id: "technicalMap",  name: "Technical Map",
      shapeScale: 0.42, backgroundTileAlpha: 0.5, patternAlpha: 0.7, strokeWeight: 0.6, useOutline: true },
  };

  var DEFAULT_TILE_STYLE_ID = "strictBauhaus";

  // drawBauhausPattern — canvas-native, no save/restore (caller owns ctx state)
  function drawBauhausPattern(ctx, patternId, x, y, w, h, color, velNorm, durNorm, tileStyle) {
    var ts = tileStyle || BAUHAUS_TILE_STYLES.strictBauhaus;
    var baseSize = Math.min(w, h);
    var patScale = ts.shapeScale * (0.85 + (velNorm || 0.5) * 0.18);
    var ps = Math.max(2, baseSize * patScale);
    var r  = ps / 2;
    var cx = x + w / 2;
    var cy = y + h / 2;
    var sw = Math.max(1, baseSize * 0.065 * ts.strokeWeight);

    ctx.fillStyle   = color;
    ctx.strokeStyle = color;
    ctx.lineWidth   = sw;

    switch (patternId) {

      case "circle":
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        break;

      case "square":
        ctx.fillRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
        break;

      case "triangle":
        ctx.beginPath();
        ctx.moveTo(cx,             cy - r);
        ctx.lineTo(cx + r * 0.866, cy + r * 0.5);
        ctx.lineTo(cx - r * 0.866, cy + r * 0.5);
        ctx.closePath(); ctx.fill();
        break;

      case "lines": {
        var lw  = ps * 0.82;
        var lth = Math.max(1, baseSize * 0.055);
        var lg  = ps * 0.32;
        [-lg, 0, lg].forEach(function (dy) {
          ctx.fillRect(cx - lw / 2, cy + dy - lth / 2, lw, lth);
        });
        break;
      }

      case "arch":
        // Filled top semicircle (arch pointing up, flat base at center)
        ctx.beginPath();
        ctx.arc(cx, cy + r * 0.12, r, -Math.PI, 0);
        ctx.closePath(); ctx.fill();
        break;

      case "diamond":
        ctx.beginPath();
        ctx.moveTo(cx,     cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx,     cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath(); ctx.fill();
        break;

      case "hourglass":
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.88, cy - r);
        ctx.lineTo(cx + r * 0.88, cy - r);
        ctx.lineTo(cx,            cy);
        ctx.lineTo(cx + r * 0.88, cy + r);
        ctx.lineTo(cx - r * 0.88, cy + r);
        ctx.lineTo(cx,            cy);
        ctx.closePath(); ctx.fill();
        break;

      case "triangleGrid": {
        var sm = r * 0.52;
        [[cx, cy - sm * 1.05], [cx - sm, cy + sm * 0.6], [cx + sm, cy + sm * 0.6]].forEach(function (p) {
          ctx.beginPath();
          ctx.moveTo(p[0],             p[1] - sm * 0.78);
          ctx.lineTo(p[0] + sm * 0.68, p[1] + sm * 0.38);
          ctx.lineTo(p[0] - sm * 0.68, p[1] + sm * 0.38);
          ctx.closePath(); ctx.fill();
        });
        break;
      }

      case "halfCircle":
        // Filled bottom semicircle (flat on top)
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.12, r, 0, Math.PI);
        ctx.closePath(); ctx.fill();
        break;

      case "arc":
        // Open rainbow arc — stroke only
        ctx.beginPath();
        ctx.arc(cx, cy + r * 0.25, r * 0.88, -Math.PI * 0.92, -Math.PI * 0.08, false);
        ctx.stroke();
        break;

      case "cornerTriangle": {
        var triSize = ps * 0.92;
        var tx = x + w * 0.09;
        var ty = y + h * 0.09;
        ctx.beginPath();
        ctx.moveTo(tx,           ty);
        ctx.lineTo(tx + triSize, ty);
        ctx.lineTo(tx,           ty + triSize);
        ctx.closePath(); ctx.fill();
        break;
      }

      case "cross": {
        var arm   = ps * 0.82;
        var thick = Math.max(1, ps * 0.27);
        ctx.fillRect(cx - arm / 2,   cy - thick / 2, arm,   thick);
        ctx.fillRect(cx - thick / 2, cy - arm / 2,   thick, arm);
        break;
      }

      case "quarterCircle":
        // Filled quarter circle from top-left corner
        ctx.beginPath();
        ctx.moveTo(x + w * 0.09, y + h * 0.09);
        ctx.arc(   x + w * 0.09, y + h * 0.09, ps * 0.88, 0, Math.PI / 2);
        ctx.closePath(); ctx.fill();
        break;

      case "fullArc":
        // Nearly-complete stroke circle, small gap at top-right
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.88, 0.2, Math.PI * 2 - 0.2);
        ctx.stroke();
        break;

      case "pill": {
        var ph = ps * 0.9;
        var pw = ps * 0.44;
        var pr = pw / 2;
        var px0 = cx - pw / 2;
        var py0 = cy - ph / 2;
        ctx.beginPath();
        ctx.moveTo(px0 + pr, py0);
        ctx.lineTo(px0 + pw - pr, py0);
        ctx.arcTo(px0 + pw, py0,      px0 + pw, py0 + pr,      pr);
        ctx.lineTo(px0 + pw, py0 + ph - pr);
        ctx.arcTo(px0 + pw, py0 + ph, px0 + pw - pr, py0 + ph, pr);
        ctx.lineTo(px0 + pr, py0 + ph);
        ctx.arcTo(px0,       py0 + ph, px0,           py0 + ph - pr, pr);
        ctx.lineTo(px0,      py0 + pr);
        ctx.arcTo(px0,       py0,      px0 + pr,      py0,           pr);
        ctx.closePath(); ctx.fill();
        break;
      }

      case "ring":
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
        ctx.stroke();
        break;

      default:
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── renderBauhausGridBlock ───────────────────────────────────────────────────
  function renderBauhausGridBlock(ctx, block, style, renderState) {
    // Field composition: resolve scale class once and cache on block
    if (!block._fieldScaleClass) {
      block._fieldScaleClass = _resolveScaleClass(block);
    }

    var size = block.width;
    var baseAlpha = block.baseAlpha != null ? block.baseAlpha : 1;
    var color = block._resolvedColor || block.color;

    // Scale class alpha modulation
    var scaleClass = block._fieldScaleClass;
    if (scaleClass === "small")  baseAlpha *= 0.55;
    if (scaleClass === "large")  baseAlpha *= 0.72;

    // Reactivity gate: resolve effective pulse from mode
    var reactivityMode = block._reactivityMode || "off";
    var rawPulse = block._pulse != null ? block._pulse : (block.active ? 1 : 0);
    var pulse = 0;
    if      (reactivityMode === "noteClass") { pulse = rawPulse; }
    else if (reactivityMode === "playhead")  { pulse = block.playhead ? rawPulse : 0; }
    // "off": pulse stays 0

    // Signal activation — structured record: energy, type, velocity, phase, release
    var sig = block._signal || null;
    var signalEnergy  = sig ? sig.energy  : 0;
    var signalType    = sig ? (sig.type || "origin") : null;
    var signalVel     = sig ? (sig.velocity || 0.5) : 0;   // 0-1 normalized
    var signalRelease = sig ? (sig.release || 0)    : 0;   // 0-1 release tail
    var isOrigin      = signalType === "origin";

    // Attack-phase sine impulse — peaks at mid-attack, then falls off
    var pulseCurve = 0;
    if (sig && sig.active && sig.attackProgress != null) {
      pulseCurve = Math.sin(sig.attackProgress * Math.PI);
    }

    if (signalEnergy > 0) {
      pulse = Math.max(pulse, signalEnergy);
    }

    // Per-type visual parameters — velocity-coupled, resolved once for all paths
    var sigScaleMult = 0;
    var sigColorLift = 0;
    var sigGlowR     = 0;
    var sigGlowAlpha = 0;
    var hasSignal    = signalEnergy > 0 || signalRelease > 0;
    if (hasSignal) {
      // Release contributes to glow at reduced weight
      var eff = Math.max(signalEnergy, signalRelease * 0.35);
      if (isOrigin) {
        // Scale: sustained from energy + velocity-weighted impulse peak
        sigScaleMult = signalEnergy * 0.24 + signalVel * 0.18 * pulseCurve;
        sigColorLift = eff * (0.35 + signalVel * 0.20);         // 0.35–0.55
        sigGlowR     = size * (2.0 + signalVel * 1.5);          // 2.0×–3.5×
        sigGlowAlpha = eff * (0.20 + signalVel * 0.18);         // 0.20–0.38
      } else {
        // Neighbor: weaker, velocity-modulated impulse only
        sigScaleMult = signalEnergy * 0.08 + signalVel * 0.08 * pulseCurve;
        sigColorLift = eff * 0.18;
        sigGlowR     = size * 1.8;
        sigGlowAlpha = eff * 0.16;
      }
    }

    // ── sub-5px ──────────────────────────────────────────────────────────────
    if (size < 5) {
      ctx.save();
      if (pulse > 0) {
        ctx.globalAlpha = Math.min(1, baseAlpha + pulse * 0.5);
        ctx.fillStyle = sigColorLift > 0 ? lightenHex(color, sigColorLift) : color;
        ctx.fillRect(block.x, block.y, size, size);
        var dot = Math.max(1, Math.floor(size * 0.4));
        ctx.globalAlpha = pulse * 0.9;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(block.x + Math.floor((size - dot) / 2), block.y + Math.floor((size - dot) / 2), dot, dot);
      } else {
        ctx.globalAlpha = baseAlpha * 0.72;
        ctx.fillStyle = muteHex(color, 0.3);
        ctx.fillRect(block.x, block.y, size, size);
      }
      ctx.restore();
      return;
    }

    // ── sub-8px: solid fill + brightness only ────────────────────────────────
    if (size < 8) {
      ctx.save();
      ctx.globalAlpha = pulse > 0
        ? Math.min(1, baseAlpha * (1 + pulse * 0.55))
        : baseAlpha * 0.72;
      ctx.fillStyle = pulse > 0
        ? lightenHex(color, pulse * 0.3 + sigColorLift)
        : muteHex(color, 0.3);
      ctx.fillRect(block.x, block.y, size, size);
      ctx.restore();
      return;
    }

    // ── normal tiles ─────────────────────────────────────────────────────────
    var velNorm = block.velocityNorm != null ? block.velocityNorm : 0.5;
    var durNorm = block.durationNorm != null ? block.durationNorm : 0.25;
    var tileStyleObj = block._tileStyle || BAUHAUS_TILE_STYLES[DEFAULT_TILE_STYLE_ID];

    var maxScale = size >= 16 ? 1.08 : 1.04;
    var scale = Math.max(1 + (maxScale - 1) * pulse, 1 + sigScaleMult);
    var w = size * scale;
    var h = size * scale;
    var x = block.x + (size - w) / 2;
    var y = block.y + (size - h) / 2;

    // Activation glow — soft radial bloom, radius and alpha differ by signal type
    if (sigGlowAlpha > 0.01 && sigGlowR > 0) {
      try {
        var gcx = block.x + size / 2, gcy = block.y + size / 2;
        var grd = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, sigGlowR);
        var rgb = hexToRgb(color);
        grd.addColorStop(0, "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + sigGlowAlpha + ")");
        grd.addColorStop(1, "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0)");
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(gcx, gcy, sigGlowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } catch (e) {}
    }

    var mutedColor = muteHex(color, 0.3);
    var accentColor = lightenHex(color, 0.32 + pulse * 0.22 + sigColorLift);
    var tileAlpha = (pulse > 0
      ? Math.min(1, baseAlpha * (0.82 + pulse * 0.28))
      : baseAlpha * 0.72) * tileStyleObj.backgroundTileAlpha;
    var accentAlpha = Math.min(1, (0.48 + velNorm * 0.32 + pulse * 0.2) * tileStyleObj.patternAlpha);

    // Release shell — color residue lingering after active pulse, origin only
    if (signalRelease > 0.04 && signalEnergy < 0.25 && isOrigin) {
      var _relInset = Math.max(1, size * 0.08);
      ctx.save();
      ctx.globalAlpha = signalRelease * 0.20;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, size * 0.055);
      ctx.strokeRect(block.x + _relInset, block.y + _relInset,
                     size - _relInset * 2, size - _relInset * 2);
      ctx.restore();
    }

    // Collision flash — crisp white inset, very brief, precedes propagation in timing
    if (block._collisionFlash) {
      var _flashNow = typeof performance !== "undefined" ? performance.now() : Date.now();
      var _flashAge = _flashNow - block._collisionFlash.startTime;
      var _flashDur = 110;
      if (_flashAge < _flashDur) {
        var _flashT = 1 - _flashAge / _flashDur;
        var _fi = Math.max(1, size * 0.06);
        ctx.save();
        ctx.globalAlpha = _flashT * 0.75;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1, size * 0.045);
        ctx.strokeRect(block.x + _fi, block.y + _fi, size - _fi * 2, size - _fi * 2);
        ctx.restore();
      } else {
        block._collisionFlash = null;
      }
    }

    ctx.save();

    // Base tile (muted palette color)
    ctx.globalAlpha = tileAlpha;
    ctx.fillStyle = pulse > 0 ? lightenHex(mutedColor, pulse * 0.18) : mutedColor;
    ctx.fillRect(x, y, w, h);

    // Outline (posterBlocks / technicalMap)
    if (tileStyleObj.useOutline) {
      ctx.globalAlpha = tileAlpha * 0.6;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, size * 0.04 * tileStyleObj.strokeWeight);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    // Resolve pattern (cached on block after first frame — stable)
    if (!block.patternId) block.patternId = resolveBauhausPatternId(block);

    // Draw pattern
    ctx.globalAlpha = accentAlpha;
    drawBauhausPattern(ctx, block.patternId, x, y, w, h, accentColor, velNorm, durNorm, tileStyleObj);

    // Active pulse: inset stroke — white for origin (direct), color for neighbor (propagated)
    if (pulse > 0.05) {
      var inset = Math.max(1, size * 0.07);
      ctx.globalAlpha = 0.45 + pulse * 0.45;
      // Direct triggers use white; propagated use hue-matched color — visual causality
      ctx.strokeStyle = isOrigin ? "rgba(255,255,255,0.9)" : color;
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);

      ctx.globalAlpha = pulse * 0.2;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, size * 0.14);
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }

    ctx.restore();
  }

  // ── Field Composition System ─────────────────────────────────────────────────
  // Deterministic hash for a block — avoids Math.random() per frame.
  function _blockHash(block) {
    var s = (block.sourceIndex != null ? block.sourceIndex : 0);
    var nc = block.noteClass || 0;
    return ((s * 2654435761 + nc * 40503) >>> 0);
  }

  // Resolve scale class for a block: "small" | "medium" | "large"
  // Distribution: 10% large, 25% small, 65% medium
  function _resolveScaleClass(block) {
    var h = _blockHash(block) % 100;
    if (h < 10) return "large";
    if (h < 35) return "small";
    return "medium";
  }

  // Scale multiplier per class
  var _SCALE_CLASS_RANGE = {
    small:  [0.35, 0.65],
    medium: [0.88, 1.02],
    large:  [1.4,  2.4],
  };

  function _scaleMultiplier(block) {
    var cls = block._fieldScaleClass || "medium";
    var r = _SCALE_CLASS_RANGE[cls];
    var t = ((_blockHash(block) * 1664525 + 1013904223) >>> 0) / 4294967296;
    return r[0] + (r[1] - r[0]) * t;
  }

  // Overflow offset — 30% of blocks get a push beyond their cell boundary
  function _overflowOffset(block, cellSize) {
    var h = _blockHash(block);
    if ((h % 100) >= 30) return { dx: 0, dy: 0 };
    var gap = cellSize * 0.38;
    var angle = (h % 628) / 100;
    return { dx: Math.cos(angle) * gap, dy: Math.sin(angle) * gap };
  }

  // Rotation — family-specific subtle tilt for non-symmetric forms
  function _fieldRotation(block) {
    var family = (BAUHAUS_PATTERN_META[block.patternId] || {}).family || "";
    if (family === "circle" || family === "rect" || family === "cross") return 0;
    var h = _blockHash(block);
    var maxAngle = (family === "triangle" || family === "diamond") ? 0.52 : 0.26;
    var t = ((h * 6364136223846793005 + 1442695040888963407) >>> 0) / 4294967296;
    return (t - 0.5) * 2 * maxAngle;
  }

  // Adjacency formation check — returns a merge descriptor or null
  // Only fires probabilistically (~18% of eligible pairs)
  var _formationCache = null;
  function _buildFormationCache(blocks, cols) {
    var cache = {};
    blocks.forEach(function (b, i) {
      var key = b.col + "," + b.row;
      cache[key] = i;
    });
    return cache;
  }

  function _resolveFormation(block, blockIndexMap, blocks) {
    if (!blockIndexMap) return null;
    var h = _blockHash(block);
    if ((h % 100) >= 18) return null;
    var pid = block.patternId || "";
    // Only merge compatible families
    var mergeable = {
      quarterCircle: "tunnel", halfCircle: "tunnel",
      triangle: "arrow", cornerTriangle: "arrow",
      lines: "corridor", square: "cluster", ring: "hub",
    };
    var kind = mergeable[pid];
    if (!kind) return null;
    // Check right neighbor
    var neighborKey = (block.col + 1) + "," + block.row;
    var nIdx = blockIndexMap[neighborKey];
    if (nIdx == null) return null;
    var neighbor = blocks[nIdx];
    var nMeta = (BAUHAUS_PATTERN_META[neighbor.patternId] || {}).family;
    var bMeta = (BAUHAUS_PATTERN_META[pid] || {}).family;
    if (nMeta !== bMeta) return null;
    return { kind: kind, neighbor: neighbor };
  }

  // Draw macro atmosphere — Layer A: giant ghost forms (drawn before grid content)
  // activityLevel (0-1): optional, brightens arcs proportionally to signal activity
  function _drawMacroAtmosphere(ctx, palette, canvasW, canvasH, gridW, gridH, activityLevel) {
    if (!palette) return;
    var colors = palette.colors;
    var activity = activityLevel || 0;
    ctx.save();
    // 4-6 huge ghost forms
    var count = 5;
    var seeds = [0.17, 0.73, 0.42, 0.91, 0.28];
    for (var i = 0; i < count; i++) {
      var t = seeds[i];
      var cx = gridW * (0.1 + t * 0.8);
      var cy = gridH * (0.05 + seeds[(i + 2) % count] * 0.9);
      var r = gridH * (0.22 + seeds[(i + 1) % count] * 0.35);
      var color = colors[(i * 3) % colors.length];
      var rgb = hexToRgb(color);
      var alpha = 0.03 + seeds[(i + 3) % count] * 0.05 + activity * 0.035;
      // Arcs and pressure circles
      if (i % 2 === 0) {
        ctx.beginPath();
        var startAngle = seeds[(i + 1) % count] * Math.PI;
        ctx.arc(cx, cy, r, startAngle, startAngle + Math.PI * 1.6, false);
        ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + alpha + ")";
        ctx.lineWidth = Math.max(4, gridH * 0.018);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + (alpha * 0.7) + ")";
        ctx.lineWidth = Math.max(3, gridH * 0.012);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Draw signal noise — Layer C: micro atmospheric debris (drawn after grid)
  function _drawSignalNoise(ctx, palette, gridW, gridH, blocks, cellSize) {
    if (!palette || !blocks || !blocks.length) return;
    var colors = palette.colors;
    ctx.save();
    var noiseCount = Math.min(60, Math.floor(blocks.length * 0.08));
    for (var i = 0; i < noiseCount; i++) {
      var b = blocks[(i * 7 + 3) % blocks.length];
      var color = colors[b.noteClass % colors.length];
      var rgb = hexToRgb(color);
      var nx = b.col * (cellSize + 1) + (((_blockHash(b) * 1103515245) >>> 0) % Math.max(1, cellSize)) - cellSize * 0.5;
      var ny = b.row * (cellSize + 1) + (((_blockHash(b) * 22695477)  >>> 0) % Math.max(1, cellSize)) - cellSize * 0.5;
      var sz = 1 + ((_blockHash(b) % 3));
      ctx.globalAlpha = 0.06 + ((_blockHash(b) % 20) / 200);
      if (i % 3 === 0) {
        ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",1)";
        ctx.fillRect(nx, ny, sz, sz);
      } else {
        ctx.beginPath();
        ctx.arc(nx, ny, sz * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",1)";
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Intentional void test — blocks in void zones are skipped (rendered as empty space)
  // Produces irregular corridors, cluster islands, silent regions
  function _isIntentionalVoid(block, cols, rows) {
    var h = _blockHash(block);
    var nx = block.col / Math.max(1, cols - 1);
    var ny = block.row / Math.max(1, rows - 1);
    // 3 void seeds
    var voids = [[0.22, 0.38, 0.12], [0.75, 0.6, 0.10], [0.5, 0.82, 0.09]];
    for (var i = 0; i < voids.length; i++) {
      var vx = voids[i][0], vy = voids[i][1], vr = voids[i][2];
      var dx = nx - vx, dy = ny - vy;
      if (dx * dx + dy * dy < vr * vr) return true;
    }
    // Corridor void: thin horizontal band ~35% down
    if (ny > 0.33 && ny < 0.37 && (h % 100) < 55) return true;
    return false;
  }

  // ── renderGridLayer ──────────────────────────────────────────────────────────
  function renderGridLayer(ctx, layer, renderState) {
    if (!layer || !layer.visible || !layer.blocks || !layer.blocks.length) return;

    var g = layer.grid;
    var canvasW = renderState.canvas ? renderState.canvas.width : 1080;
    var canvasH = renderState.canvas ? renderState.canvas.height : 1920;
    var isBauhaus = layer.renderer && layer.renderer.id === "bauhausMinimal";

    // Resolve reactivity mode
    var reactivityMode = "off";
    if (isBauhaus && layer.renderer.reactivity) {
      var rx = layer.renderer.reactivity;
      reactivityMode = (rx.enabled && rx.mode) ? rx.mode : "off";
    }

    // Resolve palette + finish + tileStyle (shared by both rendering paths)
    var palette = null;
    var finishId = "clean";
    var activeTileStyle = null;
    if (isBauhaus) {
      var paletteId = layer.renderer.paletteId || DEFAULT_PALETTE_ID;
      finishId = layer.renderer.finishId || DEFAULT_FINISH_ID;
      palette = BAUHAUS_PALETTES[paletteId] || BAUHAUS_PALETTES[DEFAULT_PALETTE_ID];
      var tileStyleId = (layer.renderer.tileStyle && layer.renderer.tileStyle.id) || DEFAULT_TILE_STYLE_ID;
      activeTileStyle = BAUHAUS_TILE_STYLES[tileStyleId] ||
        (layer.renderer.tileStyle && typeof layer.renderer.tileStyle === "object" ? layer.renderer.tileStyle : null) ||
        BAUHAUS_TILE_STYLES[DEFAULT_TILE_STYLE_ID];
      ctx.save();
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.restore();
    }

    // ── Viewport path (Bauhaus only) ─────────────────────────────────────────
    var vpConf = isBauhaus && layer.renderer.viewport;
    if (vpConf && vpConf.enabled && vpConf.mode !== "full") {
      var gap = g.gap != null ? g.gap : 1;
      var vCols = Math.max(1, Math.min(vpConf.cols || 7,  g.columns));
      var vRows = Math.max(1, Math.min(vpConf.rows || 11, g.rows));
      var vSC = Math.max(0, Math.min(vpConf.startCol || 0, Math.max(0, g.columns - vCols)));
      var vSR = Math.max(0, Math.min(vpConf.startRow || 0, Math.max(0, g.rows   - vRows)));

      // Follow playback: timeline (default) or event mode
      if (vpConf.followPlayback) {
        var maxSC = Math.max(0, g.columns - vCols);
        var maxSR = Math.max(0, g.rows    - vRows);
        var targetSC = null, targetSR = null;
        var followTarget = vpConf.followTarget || "timeline";

        if (followTarget === "event") {
          // Exact playhead block (may jump on dense MIDI)
          var phBlock = null;
          for (var _bi = 0; _bi < layer.blocks.length; _bi++) {
            if (layer.blocks[_bi].playhead) { phBlock = layer.blocks[_bi]; break; }
          }
          if (phBlock) {
            targetSC = Math.max(0, Math.min(maxSC, phBlock.col - Math.floor(vCols / 2)));
            targetSR = Math.max(0, Math.min(maxSR, phBlock.row - Math.floor(vRows / 2)));
          }
        } else {
          // Timeline: linear progress through the full block sequence
          // _timelineIndex is written each frame by main.js (throttled)
          var tIdx = vpConf._timelineIndex;
          if (tIdx != null) {
            var tCol = tIdx % g.columns;
            var tRow = Math.floor(tIdx / g.columns);
            targetSC = Math.max(0, Math.min(maxSC, tCol - Math.floor(vCols / 2)));
            targetSR = Math.max(0, Math.min(maxSR, tRow - Math.floor(vRows / 2)));
          }
        }

        if (targetSC != null && targetSR != null) {
          vpConf.targetStartCol = targetSC;
          vpConf.targetStartRow = targetSR;

          var k = vpConf.followSmoothing != null ? vpConf.followSmoothing : 0.08;
          if (vpConf._smoothCol == null) vpConf._smoothCol = vSC;
          if (vpConf._smoothRow == null) vpConf._smoothRow = vSR;
          vpConf._smoothCol += (targetSC - vpConf._smoothCol) * k;
          vpConf._smoothRow += (targetSR - vpConf._smoothRow) * k;

          vSC = Math.max(0, Math.min(maxSC, Math.round(vpConf._smoothCol)));
          vSR = Math.max(0, Math.min(maxSR, Math.round(vpConf._smoothRow)));
          vpConf.startCol = vSC;
          vpConf.startRow = vSR;
        }
      }

      var vpPad = vpConf.padding != null ? vpConf.padding : 24;
      var vpCell = computeFitCellSize(
        { columns: vCols, rows: vRows, framePadding: vpPad, gap: gap, minCellSize: 4, maxCellSize: 240 },
        canvasW, canvasH
      );
      var vpW = vCols * (vpCell + gap) - gap;
      var vpH = vRows * (vpCell + gap) - gap;

      ctx.save();
      ctx.translate(Math.round((canvasW - vpW) / 2), Math.round((canvasH - vpH) / 2));

      layer.blocks.forEach(function (block) {
        var bc = block.col, br = block.row;
        if (bc < vSC || bc >= vSC + vCols || br < vSR || br >= vSR + vRows) return;
        var style = BLOCK_LIBRARY[block.styleId] || BLOCK_LIBRARY.solid_note_tile;
        var saved = { x: block.x, y: block.y, width: block.width, height: block.height };
        block.x = (bc - vSC) * (vpCell + gap);
        block.y = (br - vSR) * (vpCell + gap);
        block.width = vpCell;
        block.height = vpCell;
        block._resolvedColor  = palette ? getPaletteColor(block.noteClass, palette) : block.color;
        block._reactivityMode = reactivityMode;
        block._tileStyle      = activeTileStyle;
        renderBauhausGridBlock(ctx, block, style, renderState);
        block._resolvedColor  = null;
        block._reactivityMode = null;
        block._tileStyle      = null;
        block.x = saved.x; block.y = saved.y; block.width = saved.width; block.height = saved.height;
      });

      if (palette && finishId !== "clean") {
        applyBauhausFinish(ctx, finishId, 0, 0, vpW, vpH, palette);
      }
      ctx.restore();
      return;
    }

    // ── Full-grid path ───────────────────────────────────────────────────────
    var cellSize = g.cellSize;
    if (g.fitMode === "fitFrame") {
      cellSize = computeFitCellSize(g, canvasW, canvasH);
    }
    var gridW = g.columns * (cellSize + g.gap) - g.gap;
    var gridH = g.rows    * (cellSize + g.gap) - g.gap;
    var offsetX = Math.round((canvasW - gridW) / 2);
    var offsetY = Math.round((canvasH - gridH) / 2);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Layer A — Macro Atmosphere (behind all glyphs)
    var _lc = renderState && renderState.layerControls;
    var _lcAtmo = _lc && _lc.atmosphere;
    var _showAtmo = !_lc || !_lcAtmo || _lcAtmo.visible !== false;
    var _hasSoloGs = _lc && Object.keys(_lc).some(function(k){return _lc[k]&&_lc[k].solo;});
    if (_hasSoloGs) _showAtmo = !!(_lcAtmo && _lcAtmo.solo);
    if (isBauhaus && palette && cellSize >= 8 && _showAtmo) {
      var atmosphereActivity = renderState && renderState.signalActivityLevel || 0;
      ctx.save();
      ctx.globalAlpha = (_lcAtmo && _lcAtmo.opacity != null) ? _lcAtmo.opacity : 1;
      _drawMacroAtmosphere(ctx, palette, canvasW, canvasH, gridW, gridH, atmosphereActivity);
      ctx.restore();
    }

    // Helper: render one bauhaus block with field composition applied
    function _renderBauhausField(block, cellSz) {
      // Resolve pattern early so we can use it for rotation/formation checks
      if (!block.patternId) block.patternId = resolveBauhausPatternId(block);

      // Void test — intentionally empty space
      if (_isIntentionalVoid(block, g.columns, g.rows)) return;

      var style = BLOCK_LIBRARY[block.styleId] || BLOCK_LIBRARY.solid_note_tile;
      var saved = { x: block.x, y: block.y, width: block.width, height: block.height };

      // Normalize position to cell grid
      block.x = block.col * (cellSz + g.gap);
      block.y = block.row * (cellSz + g.gap);
      block.width  = cellSz;
      block.height = cellSz;

      // Scale hierarchy
      var scaleMult = _scaleMultiplier(block);
      var scaledSize = cellSz * scaleMult;
      var overflow   = _overflowOffset(block, cellSz);
      var rot        = _fieldRotation(block);

      block._resolvedColor  = palette ? getPaletteColor(block.noteClass, palette) : block.color;
      block._reactivityMode = reactivityMode;
      block._tileStyle      = activeTileStyle;

      // Apply transform for scale + overflow + rotation
      if (scaleMult !== 1 || overflow.dx !== 0 || overflow.dy !== 0 || rot !== 0) {
        ctx.save();
        var cx = block.x + cellSz * 0.5 + overflow.dx;
        var cy = block.y + cellSz * 0.5 + overflow.dy;
        ctx.translate(cx, cy);
        if (rot !== 0) ctx.rotate(rot);
        ctx.translate(-cx, -cy);
        // Override width/height to scaled size
        var diff = (scaledSize - cellSz) * 0.5;
        block.x -= diff + overflow.dx;
        block.y -= diff + overflow.dy;
        block.width  = scaledSize;
        block.height = scaledSize;
        renderBauhausGridBlock(ctx, block, style, renderState);
        ctx.restore();
      } else {
        renderBauhausGridBlock(ctx, block, style, renderState);
      }

      block._resolvedColor  = null;
      block._reactivityMode = null;
      block._tileStyle      = null;
      block.x = saved.x; block.y = saved.y; block.width = saved.width; block.height = saved.height;
    }

    // Layer B — Structural Terrain: render all blocks with field composition
    var _lcTerrain = _lc && _lc.terrain;
    var _showTerrain = !_lc || !_lcTerrain || _lcTerrain.visible !== false;
    if (_hasSoloGs) _showTerrain = !!(_lcTerrain && _lcTerrain.solo);
    var _terrainAlpha = (_lcTerrain && _lcTerrain.opacity != null) ? _lcTerrain.opacity : 1;
    if (_showTerrain) {
      ctx.save();
      ctx.globalAlpha = _terrainAlpha;
    }
    if (isBauhaus && cellSize >= 8 && _showTerrain) {
      layer.blocks.forEach(function (block) { _renderBauhausField(block, cellSize); });
    } else if (_showTerrain && g.fitMode === "fitFrame" && cellSize !== g.cellSize) {
      layer.blocks.forEach(function (block) {
        var style = BLOCK_LIBRARY[block.styleId] || BLOCK_LIBRARY.solid_note_tile;
        var saved = { x: block.x, y: block.y, width: block.width, height: block.height };
        block.x = block.col * (cellSize + g.gap);
        block.y = block.row * (cellSize + g.gap);
        block.width = cellSize; block.height = cellSize;
        if (isBauhaus) {
          block._resolvedColor  = palette ? getPaletteColor(block.noteClass, palette) : block.color;
          block._reactivityMode = reactivityMode;
          block._tileStyle      = activeTileStyle;
          renderBauhausGridBlock(ctx, block, style, renderState);
          block._resolvedColor  = null;
          block._reactivityMode = null;
          block._tileStyle      = null;
        } else {
          renderGridBlock(ctx, block, style, renderState);
        }
        block.x = saved.x; block.y = saved.y; block.width = saved.width; block.height = saved.height;
      });
    } else if (_showTerrain) {
      layer.blocks.forEach(function (block) {
        var style = BLOCK_LIBRARY[block.styleId] || BLOCK_LIBRARY.solid_note_tile;
        if (isBauhaus) {
          block._resolvedColor  = palette ? getPaletteColor(block.noteClass, palette) : block.color;
          block._reactivityMode = reactivityMode;
          block._tileStyle      = activeTileStyle;
          renderBauhausGridBlock(ctx, block, style, renderState);
          block._resolvedColor  = null;
          block._reactivityMode = null;
          block._tileStyle      = null;
        } else {
          renderGridBlock(ctx, block, style, renderState);
        }
      });
    }
    if (_showTerrain) ctx.restore();

    // Layer C — Signal Noise (micro debris, above structural terrain)
    var _lcSig = _lc && _lc.signals;
    var _showSig = !_lc || !_lcSig || _lcSig.visible !== false;
    if (_hasSoloGs) _showSig = !!(_lcSig && _lcSig.solo);
    if (isBauhaus && palette && cellSize >= 8 && _showSig) {
      ctx.save();
      ctx.globalAlpha = (_lcSig && _lcSig.opacity != null) ? _lcSig.opacity : 1;
      _drawSignalNoise(ctx, palette, gridW, gridH, layer.blocks, cellSize);
      ctx.restore();
    }

    if (isBauhaus && palette && finishId !== "clean") {
      applyBauhausFinish(ctx, finishId, 0, 0, gridW, gridH, palette);
    }
    ctx.restore();
  }

  // ── getBauhausNotePatternMap ─────────────────────────────────────────────────
  function getBauhausNotePatternMap(layer) {
    var paletteId = (layer && layer.renderer && layer.renderer.paletteId) || DEFAULT_PALETTE_ID;
    var palette = BAUHAUS_PALETTES[paletteId] || BAUHAUS_PALETTES[DEFAULT_PALETTE_ID];
    var out = [];
    for (var nc = 0; nc < 12; nc++) {
      var family = _activeNotePatternOverrides[nc] || DEFAULT_NOTE_FAMILY_MAP[nc] || "circle";
      var patterns = getPatternsForFamily(family);
      var preferred = patterns[0];
      out.push({
        noteClass: nc,
        noteName: NOTE_CLASS_NAMES[nc],
        color: getPaletteColor(nc, palette),
        patternFamily: family,
        allowedPatterns: patterns.slice(),
        preferredPattern: preferred,
      });
    }
    return out;
  }

  // ── createMidiBankFromCartridge ──────────────────────────────────────────────
  function createMidiBankFromCartridge(cartridge) {
    if (!cartridge) return null;
    var events = (cartridge.notes || []).map(function (n, i) {
      return {
        id: "evt_" + cartridge.id + "_" + i,
        trackIndex: 0,
        channel: 1,
        note: n.note,
        noteClass: n.note % 12,
        velocity: n.velocity,
        startBeat: n.time,
        durationBeats: n.duration || 0.5,
        endBeat: n.time + (n.duration || 0.5),
      };
    });

    return {
      id: cartridge.id,
      name: cartridge.name || "Imported MIDI",
      sourceCartridgeId: cartridge.id,
      createdAt: Date.now(),
      bpm: cartridge.bpm || 120,
      length: cartridge.length || 0,
      events: events,
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  SBE.GridSystem = {
    BLOCK_LIBRARY: BLOCK_LIBRARY,
    GRID_PLACEMENT_MODES: GRID_PLACEMENT_MODES,
    DEFAULT_GRID_SETTINGS: DEFAULT_GRID_SETTINGS,
    CANONICAL_BAUHAUS_GRID: CANONICAL_BAUHAUS_GRID,
    computePackedGridDimensions: computePackedGridDimensions,
    NOTE_COLORS: NOTE_COLORS,
    getNoteColor: getNoteColor,
    computeFitCellSize: computeFitCellSize,
    createGridLayerFromMidiBank: createGridLayerFromMidiBank,
    generateGridBlocksFromMidiBank: generateGridBlocksFromMidiBank,
    mapMidiEventToGridCell: mapMidiEventToGridCell,
    isGridBlockActive: isGridBlockActive,
    updateGridLayerPlaybackState: updateGridLayerPlaybackState,
    renderGridLayer: renderGridLayer,
    renderGridBlock: renderGridBlock,
    renderBauhausGridBlock: renderBauhausGridBlock,
    hexToRgb: hexToRgb,
    rgbaFromHex: rgbaFromHex,
    lightenHex: lightenHex,
    muteHex: muteHex,
    getPaletteColor: getPaletteColor,
    applyBauhausFinish: applyBauhausFinish,
    BAUHAUS_PALETTES: BAUHAUS_PALETTES,
    BAUHAUS_FINISHES: BAUHAUS_FINISHES,
    DEFAULT_PALETTE_ID: DEFAULT_PALETTE_ID,
    DEFAULT_FINISH_ID: DEFAULT_FINISH_ID,
    BAUHAUS_PATTERN_IDS: BAUHAUS_PATTERN_IDS,
    BAUHAUS_PATTERN_VOCABULARY_VERSION: BAUHAUS_PATTERN_VOCABULARY_VERSION,
    BAUHAUS_PATTERN_META: BAUHAUS_PATTERN_META,
    BAUHAUS_FAMILY_PATTERNS: BAUHAUS_FAMILY_PATTERNS,
    DEFAULT_NOTE_FAMILY_MAP: DEFAULT_NOTE_FAMILY_MAP,
    NOTE_CLASS_NAMES: NOTE_CLASS_NAMES,
    getPatternsForFamily: getPatternsForFamily,
    setActiveNotePatternOverrides: setActiveNotePatternOverrides,
    resolveBauhausPatternId: resolveBauhausPatternId,
    drawBauhausPattern: drawBauhausPattern,
    BAUHAUS_TILE_STYLES: BAUHAUS_TILE_STYLES,
    DEFAULT_TILE_STYLE_ID: DEFAULT_TILE_STYLE_ID,
    getBauhausNotePatternMap: getBauhausNotePatternMap,
    DEFAULT_VIEWPORT: {
      enabled: false, mode: "full",
      cols: 7, rows: 11, startCol: 0, startRow: 0,
      followPlayback: false, followTarget: "timeline",
      followSmoothing: 0.08, followTargetUpdateMs: 120,
      padding: 24,
    },
    createMidiBankFromCartridge: createMidiBankFromCartridge,
  };
})(window);
