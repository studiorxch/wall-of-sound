// 0512_WOS_GlyphDrawerEmbedding_v1.0.0
// GlyphRenderer — shared canonical Bauhaus glyph renderer for WOS.
// Vanilla IIFE. Attaches to window.WOS.GlyphRenderer.
//
// Extracted pixel-identically from:
//   docs/tools/0509_WOS_BauhausGlyphLab_v0.1.0.html
//
// ALL rendering must go through renderGlyph().
// No consumer may reimplement cell drawing logic.
//
// Consumers:
//   drawer preview  — glyphDrawer.js
//   world renderer  — render/glyphLayer.js (Phase 2)
//   export pipeline — engine/exportGlyphs.js (Phase 3)

(function initGlyphRenderer(global) {
  "use strict";

  global.WOS = global.WOS || {};

  // ── Data ──────────────────────────────────────────────────────────────────

  var NOTE_ORDER = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

  var NOTE_COLORS = {
    "C":  "#ff2a22",
    "C#": "#ff6d39",
    "D":  "#ff9b1f",
    "D#": "#ffbf2f",
    "E":  "#e5d645",
    "F":  "#b9d957",
    "F#": "#35b96d",
    "G":  "#28bea0",
    "G#": "#2bb8d2",
    "A":  "#498cff",
    "A#": "#7a62ff",
    "B":  "#f05abf",
  };

  // Bauhaus cut map — 12-note symbolic alphabet.
  // C (full) and F# (empty) are tritone complements.
  // Each entry maps a note to the active cells of its 2×2 glyph grid.
  var CUT_MAP = {
    "C":  { id: "full",          cells: ["tl","tr","bl","br"] },
    "C#": { id: "l_missing_br",  cells: ["tl","tr","bl"]      },
    "D":  { id: "diag_tl_br",    cells: ["tl","br"]           },
    "D#": { id: "top_row",       cells: ["tl","tr"]           },
    "E":  { id: "l_missing_bl",  cells: ["tl","tr","br"]      },
    "F":  { id: "right_col",     cells: ["tr","br"]           },
    "F#": { id: "empty",         cells: []                    },
    "G":  { id: "bottom_row",    cells: ["bl","br"]           },
    "G#": { id: "diag_tr_bl",    cells: ["tr","bl"]           },
    "A":  { id: "l_missing_tr",  cells: ["tl","bl","br"]      },
    "A#": { id: "l_missing_tl",  cells: ["tr","bl","br"]      },
    "B":  { id: "left_col",      cells: ["tl","bl"]           },
  };

  // ── Internal cell renderers ───────────────────────────────────────────────
  // Extracted verbatim from v0.1.0 standalone tool.

  function _drawSquareCell(ctx, x, y, size, cell, color) {
    var h = size / 2;
    var cx = x, cy = y;
    if (cell.indexOf("r") !== -1) cx += h;
    if (cell.indexOf("b") !== -1) cy += h;
    ctx.fillStyle = color;
    ctx.fillRect(cx, cy, h, h);
  }

  function _trianglePathForCell(ctx, x, y, size, cell) {
    var h = size / 2;
    var cx = x + h, cy = y + h;
    if (cell === "tl") { ctx.moveTo(x, y);         ctx.lineTo(x + h, y);      ctx.lineTo(cx, cy); }
    if (cell === "tr") { ctx.moveTo(x + size, y);  ctx.lineTo(x + h, y);      ctx.lineTo(cx, cy); }
    if (cell === "br") { ctx.moveTo(x + size, y + size); ctx.lineTo(x + h, y + size); ctx.lineTo(cx, cy); }
    if (cell === "bl") { ctx.moveTo(x, y + size);  ctx.lineTo(x + h, y + size); ctx.lineTo(cx, cy); }
    ctx.closePath();
  }

  function _circlePathForCell(ctx, x, y, size, cell) {
    var r = size / 2;
    if (cell === "tl") {
      ctx.moveTo(x, y + r);
      ctx.arc(x, y, r, Math.PI / 2, 0, true);
      ctx.lineTo(x, y);
    }
    if (cell === "tr") {
      ctx.moveTo(x + r, y);
      ctx.arc(x + size, y, r, Math.PI, Math.PI / 2, true);
      ctx.lineTo(x + size, y);
    }
    if (cell === "br") {
      ctx.moveTo(x + size, y + r);
      ctx.arc(x + size, y + size, r, -Math.PI / 2, Math.PI, true);
      ctx.lineTo(x + size, y + size);
    }
    if (cell === "bl") {
      ctx.moveTo(x + r, y + size);
      ctx.arc(x, y + size, r, 0, -Math.PI / 2, true);
      ctx.lineTo(x, y + size);
    }
    ctx.closePath();
  }

  function _getActiveColor(note, mode) {
    if (mode === "monotone") return "#ff211a";
    if (mode === "neutral")  return "#d2d0ca";
    return NOTE_COLORS[note] || "#ff211a";
  }

  // ── Public: renderGlyph ───────────────────────────────────────────────────
  //
  // THE single canonical rendering path. All consumers call this.
  //
  // options = {
  //   renderer:   "square" | "triangle" | "circle" | "mixed"  (default: "square")
  //   colorMode:  "monotone" | "duotone" | "neutral"           (default: "duotone")
  //   grid:       bool    — draw subdivision lines             (default: false)
  //   opacity:    0–1     — ctx globalAlpha override           (default: 1)
  // }

  function renderGlyph(ctx, note, x, y, size, options) {
    options = options || {};

    var renderer  = options.renderer  || "square";
    var colorMode = options.colorMode || "duotone";

    var map     = CUT_MAP[note] || CUT_MAP["C"];
    var active  = _getActiveColor(note, colorMode);
    var neutral = colorMode === "neutral" ? "#eeeeea" : "#e8e5db";

    ctx.save();

    if (options.opacity !== undefined) {
      ctx.globalAlpha = options.opacity;
    }

    // "mixed" resolves per-note to a deterministic renderer family
    if (renderer === "mixed") {
      var idx = NOTE_ORDER.indexOf(note);
      renderer = ["square", "triangle", "circle"][Math.abs(idx) % 3];
    }

    // Background fill
    ctx.fillStyle = neutral;
    ctx.fillRect(x, y, size, size);

    // Active cells
    if (renderer === "square") {
      map.cells.forEach(function (cell) {
        _drawSquareCell(ctx, x, y, size, cell, active);
      });
    }
    if (renderer === "triangle") {
      ctx.fillStyle = active;
      map.cells.forEach(function (cell) {
        ctx.beginPath();
        _trianglePathForCell(ctx, x, y, size, cell);
        ctx.fill();
      });
    }
    if (renderer === "circle") {
      ctx.fillStyle = active;
      map.cells.forEach(function (cell) {
        ctx.beginPath();
        _circlePathForCell(ctx, x, y, size, cell);
        ctx.fill();
      });
    }

    // Optional grid overlay
    if (options.grid && size >= 12) {
      ctx.strokeStyle = "rgba(255,255,255,.18)";
      ctx.lineWidth   = Math.max(0.5, size * 0.012);
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y);
      ctx.lineTo(x + size / 2, y + size);
      ctx.moveTo(x, y + size / 2);
      ctx.lineTo(x + size, y + size / 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  global.WOS.GlyphRenderer = {
    renderGlyph:   renderGlyph,
    getCutMap:     function () { return CUT_MAP; },
    getNoteColors: function () { return NOTE_COLORS; },
    getNoteOrder:  function () { return NOTE_ORDER.slice(); },
  };

  console.log("[WOS GlyphRenderer] Loaded — Bauhaus cut-map renderer v1.0.0");

})(window);
