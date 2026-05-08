// 0507_WOS_GridBlockLibrarySystem_v1.1.0
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

  // ── renderBauhausGridBlock ───────────────────────────────────────────────────
  function renderBauhausGridBlock(ctx, block, style, renderState) {
    var size = block.width; // square tile
    var isActive = block.active;
    var pulse = block._pulse != null ? block._pulse : (isActive ? 1 : 0);
    var baseAlpha = block.baseAlpha != null ? block.baseAlpha : 1;
    var color = block._resolvedColor || block.color; // palette-resolved or raw

    // ── sub-5px: base square + optional center dot ───────────────────────────
    if (size < 5) {
      ctx.save();
      if (isActive && pulse > 0) {
        ctx.globalAlpha = Math.min(1, baseAlpha + pulse * 0.5);
        ctx.fillStyle = color;
        ctx.fillRect(block.x, block.y, size, size);
        ctx.globalAlpha = pulse * 0.9;
        ctx.fillStyle = "#ffffff";
        var dot = Math.max(1, Math.floor(size * 0.4));
        ctx.fillRect(
          block.x + Math.floor((size - dot) / 2),
          block.y + Math.floor((size - dot) / 2),
          dot, dot
        );
      } else {
        ctx.globalAlpha = baseAlpha * 0.72;
        ctx.fillStyle = muteHex(color, 0.3);
        ctx.fillRect(block.x, block.y, size, size);
      }
      ctx.restore();
      return;
    }

    // ── sub-8px: brightness/opacity only, no scaling or stroke ───────────────
    if (size < 8) {
      ctx.save();
      ctx.globalAlpha = isActive
        ? Math.min(1, baseAlpha * (1 + pulse * 0.55))
        : baseAlpha * 0.72;
      ctx.fillStyle = isActive ? lightenHex(color, pulse * 0.3) : muteHex(color, 0.3);
      ctx.fillRect(block.x, block.y, size, size);
      ctx.restore();
      return;
    }

    // ── normal tiles ─────────────────────────────────────────────────────────
    var velNorm = block.velocityNorm != null ? block.velocityNorm : 0.5;
    var durNorm = block.durationNorm != null ? block.durationNorm : 0.25;
    var accentKind = block.accentKind != null ? block.accentKind : 0;

    var maxScale = size >= 16 ? 1.08 : 1.04;
    var scale = 1 + (maxScale - 1) * pulse;
    var w = size * scale;
    var h = size * scale;
    var x = block.x + (size - w) / 2;
    var y = block.y + (size - h) / 2;

    var mutedColor = muteHex(color, 0.3);
    var accentColor = lightenHex(color, 0.35 + pulse * 0.25);
    var tileAlpha = isActive
      ? Math.min(1, baseAlpha * (0.82 + pulse * 0.28))
      : baseAlpha * 0.72;
    var accentAlpha = (0.45 + velNorm * 0.35) + (isActive ? pulse * 0.35 : 0);

    ctx.save();

    // Base tile
    ctx.globalAlpha = tileAlpha;
    ctx.fillStyle = isActive ? lightenHex(mutedColor, pulse * 0.18) : mutedColor;
    ctx.fillRect(x, y, w, h);

    // Accent mark
    var accentScale = 0.35 + velNorm * 0.45;
    var accentSize = Math.max(1, size * accentScale);
    accentSize *= 0.85 + durNorm * 0.3;
    if (isActive) accentSize *= 1 + pulse * 0.15;

    var cx = x + w / 2;
    var cy = y + h / 2;

    ctx.globalAlpha = Math.min(1, accentAlpha);
    ctx.fillStyle = accentColor;

    if (accentKind === 0) {
      var r = accentSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (accentKind === 1) {
      var bh = Math.max(1, accentSize * 0.28);
      ctx.fillRect(cx - accentSize / 2, cy - bh / 2, accentSize, bh);
    } else if (accentKind === 2) {
      var bw = Math.max(1, accentSize * 0.28);
      ctx.fillRect(cx - bw / 2, cy - accentSize / 2, bw, accentSize);
    } else {
      var hs = accentSize / 2;
      ctx.fillRect(cx - hs, cy - hs, accentSize, accentSize);
    }

    // Active pulse: white inset stroke + note-color glow
    if (isActive && pulse > 0.05) {
      var inset = Math.max(1, size * 0.07);
      ctx.globalAlpha = 0.45 + pulse * 0.45;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);

      ctx.globalAlpha = pulse * 0.22;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, size * 0.14);
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }

    ctx.restore();
  }

  // ── renderGridLayer ──────────────────────────────────────────────────────────
  function renderGridLayer(ctx, layer, renderState) {
    if (!layer || !layer.visible || !layer.blocks || !layer.blocks.length) return;

    var g = layer.grid;
    var canvasW = renderState.canvas ? renderState.canvas.width : 1080;
    var canvasH = renderState.canvas ? renderState.canvas.height : 1920;

    var cellSize = g.cellSize;
    if (g.fitMode === "fitFrame") {
      cellSize = computeFitCellSize(g, canvasW, canvasH);
    }

    var gridW = g.columns * (cellSize + g.gap) - g.gap;
    var gridH = g.rows * (cellSize + g.gap) - g.gap;
    var offsetX = Math.round((canvasW - gridW) / 2);
    var offsetY = Math.round((canvasH - gridH) / 2);

    var isBauhaus = layer.renderer && layer.renderer.id === "bauhausMinimal";

    // Resolve palette + finish for Bauhaus layers
    var palette = null;
    var finishId = "clean";
    if (isBauhaus) {
      var paletteId = (layer.renderer && layer.renderer.paletteId) || DEFAULT_PALETTE_ID;
      finishId = (layer.renderer && layer.renderer.finishId) || DEFAULT_FINISH_ID;
      palette = BAUHAUS_PALETTES[paletteId] || BAUHAUS_PALETTES[DEFAULT_PALETTE_ID];

      // Fill full canvas with palette background (this layer IS the background)
      ctx.save();
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Tile rendering — inject _resolvedColor for Bauhaus
    if (g.fitMode === "fitFrame" && cellSize !== g.cellSize) {
      layer.blocks.forEach(function (block) {
        var style = BLOCK_LIBRARY[block.styleId] || BLOCK_LIBRARY.solid_note_tile;
        var bx = block.col * (cellSize + g.gap);
        var by = block.row * (cellSize + g.gap);
        var saved = { x: block.x, y: block.y, width: block.width, height: block.height };
        block.x = bx; block.y = by; block.width = cellSize; block.height = cellSize;
        if (isBauhaus) {
          block._resolvedColor = palette ? getPaletteColor(block.noteClass, palette) : block.color;
          renderBauhausGridBlock(ctx, block, style, renderState);
          block._resolvedColor = null;
        } else {
          renderGridBlock(ctx, block, style, renderState);
        }
        block.x = saved.x; block.y = saved.y; block.width = saved.width; block.height = saved.height;
      });
    } else {
      layer.blocks.forEach(function (block) {
        var style = BLOCK_LIBRARY[block.styleId] || BLOCK_LIBRARY.solid_note_tile;
        if (isBauhaus) {
          block._resolvedColor = palette ? getPaletteColor(block.noteClass, palette) : block.color;
          renderBauhausGridBlock(ctx, block, style, renderState);
          block._resolvedColor = null;
        } else {
          renderGridBlock(ctx, block, style, renderState);
        }
      });
    }

    // Apply finish overlay in grid coordinate space
    if (isBauhaus && palette && finishId !== "clean") {
      applyBauhausFinish(ctx, finishId, 0, 0, gridW, gridH, palette);
    }

    ctx.restore();
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
    createMidiBankFromCartridge: createMidiBankFromCartridge,
  };
})(window);
