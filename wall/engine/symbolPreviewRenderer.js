// 0513_WOS_SymbolPreviewRenderer_v1.0.0
// Pure rendering module for symbol preview modes.
// Attaches to WOS.SymbolPreviewRenderer.
// Depends on: engine/symbolRenderer.js, ui/symbolSystem.js
//
// Four render functions:
//   renderWordPreview(ctx, text, options)
//   renderParagraphPreview(ctx, text, options)
//   renderPatternPreview(ctx, options)
//   renderWorldPreview(ctx, options)
//
// All resolve glyphs through SBE.SymbolSystem.
// All render through WOS.SymbolRenderer.
// No DOM ownership. No state. Pure rendering.

(function initSymbolPreviewRenderer(global) {
  "use strict";

  var WOS = (global.WOS = global.WOS || {});
  var SBE = (global.SBE = global.SBE || {});

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _SR()  { return WOS.SymbolRenderer; }
  function _SS()  { return SBE.SymbolSystem;   }

  function _resolveSet(setId) {
    var SS = _SS();
    if (!SS) return null;
    return setId ? SS.getSet(setId) : SS.getActiveSet();
  }

  function _drawGlyph(ctx, glyph, x, y, size, palette) {
    var SR = _SR();
    if (!SR || !glyph || !((glyph.strokes && glyph.strokes.length) || (glyph.objects && glyph.objects.length))) return;
    SR.renderGlyph(ctx, glyph, x, y, size, palette, {});
  }

  // Stable position-based pseudo-random in [-1, 1].
  // Two different calls with different s values give independent streams.
  function _rand(i, j, s) {
    var n = Math.abs((i * 1000 + j * 37 + s * 13) % 999983);
    return (Math.sin(n) * 43758.5453) % 1;
  }

  // Filled-slot pool for a set.
  function _filledSlots(set) {
    return Object.keys(set.glyphs).filter(function (k) {
      var g = set.glyphs[k];
      return g && g.strokes && g.strokes.length;
    });
  }

  // ── 1. Word Preview ───────────────────────────────────────────────────────
  //
  // Renders a horizontal sequence of glyphs for every character in `text`.
  // Options:
  //   setId    — SymbolSet id (falls back to active set)
  //   scale    — glyph cell size in px (default 56)
  //   tracking — extra spacing between glyphs in px (default 8)
  //   palette  — explicit palette override

  function renderWordPreview(ctx, text, options) {
    options = options || {};
    var SR  = _SR();
    var set = _resolveSet(options.setId);
    if (!SR || !set) return;

    var pal      = options.palette  || set.palette;
    var size     = options.scale    || 56;
    var tracking = options.tracking !== undefined ? options.tracking : 8;
    var chars    = text ? text.split("") : [];
    if (!chars.length) return;

    var step   = size + tracking;
    var totalW = chars.length * size + Math.max(0, chars.length - 1) * tracking;
    var cw     = ctx.canvas.width;
    var ch     = ctx.canvas.height;
    var startX = Math.max(8, (cw - totalW) / 2);
    var startY = (ch - size) / 2;

    chars.forEach(function (c, i) {
      var glyph = set.glyphs[c] || null;
      _drawGlyph(ctx, glyph, startX + i * step, startY, size, pal);
    });
  }

  // ── 2. Paragraph Preview ──────────────────────────────────────────────────
  //
  // Word-wraps `text` and renders it as a block of symbolic glyphs.
  // Options:
  //   setId      — SymbolSet id (falls back to active set)
  //   fontSize   — glyph cell size in px (default 28)
  //   lineHeight — multiplier (default 1.6)
  //   tracking   — extra px between glyphs (default 3)
  //   wrapWidth  — wrap width in px (default canvas width * 0.9)
  //   align      — "left" | "center" (default "left")
  //   palette    — explicit palette override
  //   offsetX/Y  — top-left of the text block (default: centered)

  function renderParagraphPreview(ctx, text, options) {
    options = options || {};
    var SR  = _SR();
    var set = _resolveSet(options.setId);
    if (!SR || !set) return;

    var pal        = options.palette    || set.palette;
    var fontSize   = options.fontSize   || 28;
    var lineHeight = options.lineHeight !== undefined ? options.lineHeight : 1.6;
    var tracking   = options.tracking   !== undefined ? options.tracking   : 3;
    var cw         = ctx.canvas.width;
    var ch         = ctx.canvas.height;
    var wrapWidth  = options.wrapWidth  || Math.floor(cw * 0.9);
    var align      = options.align      || "left";
    var lineH      = Math.round(fontSize * lineHeight);

    // Split text into paragraphs (by newline), then word-wrap each
    var rawLines   = (text || "").split("\n");
    var lines      = [];   // each element is an array of words

    function _wordWidth(word) {
      return word.length * fontSize + Math.max(0, word.length - 1) * tracking;
    }

    function _lineWidth(arr) {
      if (!arr.length) return 0;
      // Words separated by one full cell of space
      var spaceW = fontSize + tracking;
      return arr.reduce(function (acc, w, i) {
        return acc + _wordWidth(w) + (i > 0 ? spaceW : 0);
      }, 0);
    }

    rawLines.forEach(function (raw) {
      var words = raw.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push([]); return; } // preserve blank lines

      var cur = [];
      words.forEach(function (word) {
        var test = cur.concat([word]);
        if (_lineWidth(test) <= wrapWidth || cur.length === 0) {
          cur = test;
        } else {
          lines.push(cur);
          cur = [word];
        }
      });
      if (cur.length) lines.push(cur);
    });

    var blockH  = lines.length * lineH;
    var offsetX = options.offsetX !== undefined ? options.offsetX : Math.max(8, (cw - wrapWidth) / 2);
    var offsetY = options.offsetY !== undefined ? options.offsetY : Math.max(8, (ch - blockH) / 2);

    lines.forEach(function (words, li) {
      if (!words.length) return; // blank line — skip
      var y       = offsetY + li * lineH;
      var lineW   = _lineWidth(words);
      var baseX   = align === "center" ? offsetX + (wrapWidth - lineW) / 2 : offsetX;
      var cursorX = baseX;
      var spaceW  = fontSize + tracking;

      words.forEach(function (word, wi) {
        if (wi > 0) cursorX += spaceW; // inter-word space
        word.split("").forEach(function (c) {
          var glyph = set.glyphs[c] || null;
          _drawGlyph(ctx, glyph, cursorX, y, fontSize, pal);
          cursorX += fontSize + tracking;
        });
      });
    });
  }

  // ── 3. Pattern Preview ────────────────────────────────────────────────────
  //
  // Renders a grid of glyphs — wallpaper, tile, or textile.
  // Options:
  //   setId          — SymbolSet id (falls back to active set)
  //   slots          — explicit slot key array (default: all filled slots)
  //   columns/rows   — grid dimensions (default 6×6)
  //   spacing        — gap between cells in px (default 8)
  //   jitter         — max position offset in px (default 0)
  //   randomRotation — max rotation in degrees (default 0)
  //   randomScale    — max fractional scale variance 0..1 (default 0)
  //   palette        — explicit palette override
  //   seed           — layout seed for repeatable randomness

  function renderPatternPreview(ctx, options) {
    options = options || {};
    var SR  = _SR();
    var set = _resolveSet(options.setId);
    if (!SR || !set) return;

    var pal     = options.palette || set.palette;
    var cols    = Math.max(1, options.columns || 6);
    var rows    = Math.max(1, options.rows    || 6);
    var spacing = options.spacing !== undefined ? options.spacing : 8;
    var jitter  = options.jitter  !== undefined ? options.jitter  : 0;
    var rndRot  = options.randomRotation !== undefined ? options.randomRotation : 0;
    var rndScl  = options.randomScale    !== undefined ? options.randomScale    : 0;
    var seed    = options.seed    || 42;

    var slots   = options.slots;
    if (!slots || !slots.length) {
      slots = _filledSlots(set);
    }
    if (!slots.length) return;

    var cw       = ctx.canvas.width;
    var ch       = ctx.canvas.height;
    var cellW    = (cw - spacing * (cols + 1)) / cols;
    var cellH    = (ch - spacing * (rows + 1)) / rows;
    var cellSize = Math.max(6, Math.min(cellW, cellH));

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        // Slot selection (position-stable)
        var ri    = Math.abs(_rand(col, row, seed)) % 1;
        var idx   = Math.floor(ri * slots.length) % slots.length;
        var glyph = set.glyphs[slots[idx]];
        if (!glyph || !((glyph.strokes && glyph.strokes.length) || (glyph.objects && glyph.objects.length))) continue;

        // Center of this cell
        var cx = spacing + col * (cellSize + spacing) + cellSize / 2;
        var cy = spacing + row * (cellSize + spacing) + cellSize / 2;

        // Jitter offset
        if (jitter > 0) {
          cx += _rand(col, row, seed + 1) * jitter * 2 - jitter;
          cy += _rand(col, row, seed + 2) * jitter * 2 - jitter;
        }

        // Scale variance
        var sv = 1;
        if (rndScl > 0) {
          sv = 1 + (_rand(col, row, seed + 3) * 2 - 1) * rndScl;
          sv = Math.max(0.15, sv);
        }
        var drawSize = cellSize * sv;
        var half     = drawSize / 2;

        // Rotation
        var rot = 0;
        if (rndRot > 0) {
          rot = _rand(col, row, seed + 4) * rndRot * Math.PI / 180;
        }

        ctx.save();
        ctx.translate(cx, cy);
        if (rot) ctx.rotate(rot);
        _drawGlyph(ctx, glyph, -half, -half, drawSize, pal);
        ctx.restore();
      }
    }
  }

  // ── 4. World Preview ──────────────────────────────────────────────────────
  //
  // Lightweight non-persistent sandbox. Renders a layered cloud of symbols.
  // Pass increasing `t` values for drift animation.
  // Options:
  //   setId       — SymbolSet id (falls back to active set)
  //   density     — symbol count (default 40)
  //   drift       — positional drift speed, 0 = static (default 0.2)
  //   scaleMin/Max — scale range (default 0.35–1.3)
  //   opacityMin/Max — opacity range (default 0.25–0.85)
  //   cellSize    — base glyph size in px (default 36)
  //   t           — time in seconds (default 0, yields static render)
  //   seed        — layout seed
  //   palette     — explicit palette override

  function renderWorldPreview(ctx, options) {
    options = options || {};
    var SR  = _SR();
    var set = _resolveSet(options.setId);
    if (!SR || !set) return;

    var pal      = options.palette    || set.palette;
    var density  = Math.max(1, Math.min(options.density  || 40, 200));
    var drift    = options.drift      !== undefined ? options.drift      : 0.2;
    var scaleMin = options.scaleMin   !== undefined ? options.scaleMin   : 0.35;
    var scaleMax = options.scaleMax   !== undefined ? options.scaleMax   : 1.3;
    var opacMin  = options.opacityMin !== undefined ? options.opacityMin : 0.25;
    var opacMax  = options.opacityMax !== undefined ? options.opacityMax : 0.85;
    var cellSize = options.cellSize   || 36;
    var t        = options.t          || 0;
    var seed     = options.seed       || 7;

    var slots = _filledSlots(set);
    if (!slots.length) return;

    var cw = ctx.canvas.width;
    var ch = ctx.canvas.height;

    for (var i = 0; i < density; i++) {
      var baseX   = Math.abs(_rand(i, 0, seed))     % 1 * cw;
      var baseY   = Math.abs(_rand(i, 0, seed + 1)) % 1 * ch;
      var speed   = 0.3 + Math.abs(_rand(i, 0, seed + 5)) % 1 * 0.7;
      var angle   = Math.abs(_rand(i, 0, seed + 6)) % 1 * Math.PI * 2;

      var dx      = Math.cos(angle) * drift * speed * t * cw * 0.05;
      var dy      = Math.sin(angle) * drift * speed * t * ch * 0.05;
      var x       = ((baseX + dx) % cw + cw) % cw;
      var y       = ((baseY + dy) % ch + ch) % ch;

      var sc      = scaleMin + Math.abs(_rand(i, 0, seed + 2)) % 1 * (scaleMax - scaleMin);
      var op      = opacMin  + Math.abs(_rand(i, 0, seed + 3)) % 1 * (opacMax  - opacMin);
      var rot     = Math.abs(_rand(i, 0, seed + 4)) % 1 * Math.PI * 2;
      var si      = Math.floor(Math.abs(_rand(i, 0, seed + 7)) % 1 * slots.length);
      var glyph   = set.glyphs[slots[si % slots.length]];

      if (!glyph || !glyph.strokes || !glyph.strokes.length) continue;

      var sz   = cellSize * sc;
      var half = sz / 2;

      ctx.save();
      ctx.globalAlpha = op;
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      _drawGlyph(ctx, glyph, -half, -half, sz, pal);
      ctx.restore();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  WOS.SymbolPreviewRenderer = {
    renderWordPreview:      renderWordPreview,
    renderParagraphPreview: renderParagraphPreview,
    renderPatternPreview:   renderPatternPreview,
    renderWorldPreview:     renderWorldPreview,
  };

  console.log("[WOS SymbolPreviewRenderer] Loaded — v1.0.0");
})(window);
