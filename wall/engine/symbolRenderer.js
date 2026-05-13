// 0513_WOS_SymbolRenderer_v1.0.0
// Stroke-based symbol renderer for WOS SymbolSets.
// Attaches to WOS.SymbolRenderer.
// Load order: symbolRenderer.js → symbolSystem.js → symbolDrawer.js
//
// Renders Glyph objects (arrays of Strokes with normalized 0..1 coordinates)
// onto any Canvas 2D context. The renderer is a pure function — it never
// reads or writes any global state. The SymbolSystem defines what exists;
// this module only draws it.
//
// API:
//   WOS.SymbolRenderer.renderGlyph(ctx, glyph, x, y, size, palette, opts)
//   WOS.SymbolRenderer.renderSet(ctx, symbolSet, gx, gy, cellSize, cols, palette)
//   WOS.SymbolRenderer.renderGlyphToCanvas(glyph, size, palette) → OffscreenCanvas | null

(function initSymbolRenderer(global) {
  "use strict";

  var WOS = (global.WOS = global.WOS || {});

  // ── Palette defaults ──────────────────────────────────────────────────────

  var DEFAULT_PALETTE = {
    mode:          "stroke",     // "stroke" | "fill" | "fill+stroke" | "inverse"
    strokeColor:   "#000000",
    strokeWeight:  1.5,
    fillColor:     "#000000",
    bgColor:       null,         // null = transparent
    opacity:       1.0,
  };

  function _pal(palette) {
    return Object.assign({}, DEFAULT_PALETTE, palette || {});
  }

  // ── Path construction ─────────────────────────────────────────────────────

  // Catmull-Rom spline through normalized points, scaled to [x, y, size].
  function _catmullRomPath(ctx, pts, x, y, size) {
    if (!pts || pts.length < 2) return false;
    ctx.moveTo(x + pts[0].x * size, y + pts[0].y * size);
    var n = pts.length;
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[Math.min(n - 1, i + 2)];
      var cp1x = x + (p1.x + (p2.x - p0.x) / 6) * size;
      var cp1y = y + (p1.y + (p2.y - p0.y) / 6) * size;
      var cp2x = x + (p2.x - (p3.x - p1.x) / 6) * size;
      var cp2y = y + (p2.y - (p3.y - p1.y) / 6) * size;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y,
        x + p2.x * size, y + p2.y * size);
    }
    return true;
  }

  // Cubic bezier chain for pen strokes.
  // Points layout: [anchor0, cp1, cp2, anchor1, cp1, cp2, anchor2, ...]
  // i.e. first point is anchor, then alternating (cp1, cp2, anchor) triples.
  function _penPath(ctx, pts, x, y, size) {
    if (!pts || pts.length < 2) return false;
    ctx.moveTo(x + pts[0].x * size, y + pts[0].y * size);
    var i = 1;
    while (i + 2 < pts.length) {
      ctx.bezierCurveTo(
        x + pts[i].x * size,     y + pts[i].y * size,
        x + pts[i+1].x * size,   y + pts[i+1].y * size,
        x + pts[i+2].x * size,   y + pts[i+2].y * size
      );
      i += 3;
    }
    // If leftover points (malformed), draw line to each
    while (i < pts.length) {
      ctx.lineTo(x + pts[i].x * size, y + pts[i].y * size);
      i++;
    }
    return true;
  }

  // Arc strokes — treat as freehand (arc arc points are pre-sampled on export)
  function _arcPath(ctx, pts, x, y, size) {
    return _catmullRomPath(ctx, pts, x, y, size);
  }

  // ── Core render ──────────────────────────────────────────────────────────

  // Render a single Glyph onto ctx at (x, y) within a size×size cell.
  // glyph  — { strokes: Stroke[] }
  // x, y   — top-left of cell in ctx coordinates
  // size   — px (glyph's normalized 0..1 space maps to this)
  // palette — SymbolPalette (merged with defaults)
  // opts   — { grid: Boolean, debug: Boolean }
  function renderGlyph(ctx, glyph, x, y, size, palette, opts) {
    if (!glyph || !glyph.strokes) return;
    opts = opts || {};
    var p = _pal(palette);

    ctx.save();
    ctx.globalAlpha = p.opacity;

    // Background fill
    if (p.bgColor) {
      ctx.fillStyle = p.bgColor;
      ctx.fillRect(x, y, size, size);
    }

    // Inverse mode: swap stroke/fill colors and use bg as stroke
    var strokeCol = p.mode === "inverse" ? (p.bgColor || "#ffffff") : p.strokeColor;
    var fillCol   = p.mode === "inverse" ? p.strokeColor : p.fillColor;

    // Construction grid (for editor preview)
    if (opts.grid) {
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 0.5;
      var step = size / 8;
      for (var gi = 1; gi < 8; gi++) {
        ctx.beginPath();
        ctx.moveTo(x + gi * step, y);
        ctx.lineTo(x + gi * step, y + size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + gi * step);
        ctx.lineTo(x + size, y + gi * step);
        ctx.stroke();
      }
    }

    var strokes = glyph.strokes;
    for (var si = 0; si < strokes.length; si++) {
      var stroke = strokes[si];
      if (!stroke || !stroke.points || stroke.points.length < 2) continue;

      var sw    = typeof stroke.weight === "number" ? stroke.weight : p.strokeWeight;
      var scol  = stroke.color  || strokeCol;
      var fcol  = stroke.fill   ? (stroke.fillColor || fillCol) : fillCol;
      var mode  = stroke.mode   || "freehand";

      ctx.beginPath();
      var drewPath = false;
      if (mode === "pen") {
        drewPath = _penPath(ctx, stroke.points, x, y, size);
      } else if (mode === "arc") {
        drewPath = _arcPath(ctx, stroke.points, x, y, size);
      } else {
        drewPath = _catmullRomPath(ctx, stroke.points, x, y, size);
      }

      if (!drewPath) continue;

      if (stroke.closed) ctx.closePath();

      // Fill if requested
      if (stroke.fill || p.mode === "fill" || p.mode === "fill+stroke" || p.mode === "inverse") {
        ctx.fillStyle = fcol;
        ctx.fill();
      }

      // Stroke unless fill-only mode with no per-stroke override
      var doStroke = (p.mode !== "fill") || stroke.forceStroke;
      if (doStroke && sw > 0) {
        ctx.strokeStyle = scol;
        ctx.lineWidth   = sw;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.stroke();
      }
    }

    // Debug bounding box
    if (opts.debug && glyph.bounds) {
      var b = glyph.bounds;
      ctx.strokeStyle = "rgba(255,80,80,0.5)";
      ctx.lineWidth   = 0.5;
      ctx.strokeRect(
        x + b.x * size, y + b.y * size,
        b.w * size, b.h * size
      );
    }

    ctx.restore();
  }

  // ── Sheet render ─────────────────────────────────────────────────────────

  // Render all glyphs of a SymbolSet as a grid sheet.
  // symbolSet — SymbolSet object
  // gx, gy    — top-left of sheet in ctx coordinates
  // cellSize  — px per cell
  // cols      — number of columns
  // palette   — optional palette override (uses set's palette if omitted)
  function renderSet(ctx, symbolSet, gx, gy, cellSize, cols, palette) {
    if (!symbolSet || !symbolSet.glyphs) return;
    var pal  = palette || symbolSet.palette;
    var keys = Object.keys(symbolSet.glyphs);
    cols = cols || 8;

    for (var i = 0; i < keys.length; i++) {
      var key   = keys[i];
      var glyph = symbolSet.glyphs[key];
      if (!glyph) continue;
      var col   = i % cols;
      var row   = Math.floor(i / cols);
      var cx    = gx + col * cellSize;
      var cy    = gy + row * cellSize;
      renderGlyph(ctx, glyph, cx, cy, cellSize, pal, {});
    }
  }

  // ── Off-screen utility ────────────────────────────────────────────────────

  // Render a glyph to an off-screen canvas and return it (for thumbnails/export).
  // Returns OffscreenCanvas if supported, else a regular canvas element.
  function renderGlyphToCanvas(glyph, size, palette) {
    if (!glyph) return null;
    var canvas;
    try {
      canvas = new OffscreenCanvas(size, size);
    } catch (e) {
      canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
    }
    var ctx = canvas.getContext("2d");
    renderGlyph(ctx, glyph, 0, 0, size, palette, {});
    return canvas;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  WOS.SymbolRenderer = {
    renderGlyph:         renderGlyph,
    renderSet:           renderSet,
    renderGlyphToCanvas: renderGlyphToCanvas,
  };

  console.log("[WOS SymbolRenderer] Loaded — v1.0.0");
})(window);
