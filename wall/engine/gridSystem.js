// 0507_WOS_GridBlockLibrarySystem_v1.1.0
// MIDI Bank → World Layer → Grid Environment
// Vanilla IIFE — attaches to global SBE.GridSystem

(function initGridSystem(global) {
  var SBE = (global.SBE = global.SBE || {});

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
          bankId: bank.id,
          note: evt.note,
          noteClass: noteClass,
          velocity: evt.velocity || 64,
          startBeat: startBeat,
          durationBeats: evt.durationBeats || 0.5,
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

  // ── renderGridLayer ──────────────────────────────────────────────────────────
  function renderGridLayer(ctx, layer, renderState) {
    if (!layer || !layer.visible || !layer.blocks || !layer.blocks.length) return;

    var g = layer.grid;
    var canvasW = renderState.canvas ? renderState.canvas.width : 1080;
    var canvasH = renderState.canvas ? renderState.canvas.height : 1920;

    // Use fitFrame cellSize if applicable
    var cellSize = g.cellSize;
    if (g.fitMode === "fitFrame") {
      cellSize = computeFitCellSize(g, canvasW, canvasH);
    }

    var gridW = g.columns * (cellSize + g.gap) - g.gap;
    var gridH = g.rows * (cellSize + g.gap) - g.gap;
    var offsetX = Math.round((canvasW - gridW) / 2);
    var offsetY = Math.round((canvasH - gridH) / 2);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // If fitFrame, rescale block positions on the fly
    if (g.fitMode === "fitFrame" && cellSize !== g.cellSize) {
      var scale = (cellSize + g.gap) / Math.max(1, g.cellSize + g.gap);
      layer.blocks.forEach(function (block) {
        var style = BLOCK_LIBRARY[block.styleId] || BLOCK_LIBRARY.solid_note_tile;
        // Compute screen x/y from col/row using current cellSize
        var bx = block.col * (cellSize + g.gap);
        var by = block.row * (cellSize + g.gap);
        var bw = cellSize;
        var bh = cellSize;
        // Temporarily override for render only
        var saved = { x: block.x, y: block.y, width: block.width, height: block.height };
        block.x = bx; block.y = by; block.width = bw; block.height = bh;
        renderGridBlock(ctx, block, style, renderState);
        block.x = saved.x; block.y = saved.y; block.width = saved.width; block.height = saved.height;
      });
    } else {
      layer.blocks.forEach(function (block) {
        var style = BLOCK_LIBRARY[block.styleId] || BLOCK_LIBRARY.solid_note_tile;
        renderGridBlock(ctx, block, style, renderState);
      });
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
    createMidiBankFromCartridge: createMidiBankFromCartridge,
  };
})(window);
