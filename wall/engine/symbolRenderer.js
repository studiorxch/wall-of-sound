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

    // Render primitive objects (GlyphConstructor system)
    if (glyph.objects && glyph.objects.length) {
      renderGlyphObjects(ctx, glyph.objects, x, y, size, p);
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

  // ── Glyph Object rendering ────────────────────────────────────────────────

  // ── Line style helpers ────────────────────────────────────────────────────

  // Collect canvas-space sample points for a dotted object.
  function _sampleObjPath(obj, x, y, size, spacing) {
    var PS = WOS.PathSampler;
    if (!PS) return [];
    if (obj.type === "line") {
      return PS.sampleLine(x + obj.x1*size, y + obj.y1*size,
                           x + obj.x2*size, y + obj.y2*size, spacing);
    }
    if (obj.type === "rect") {
      return PS.sampleRect(x + obj.x*size, y + obj.y*size, obj.w*size, obj.h*size, spacing);
    }
    if (obj.type === "circle") {
      if (obj.rx !== undefined && obj.ry !== undefined) {
        var rx = obj.rx * size, ry = obj.ry * size;
        var approx = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
        var cnt = Math.max(1, Math.round(approx / spacing));
        var epts = [];
        for (var k = 0; k < cnt; k++) {
          var a = (k / cnt) * Math.PI * 2;
          epts.push({ x: x + obj.cx * size + Math.cos(a) * rx,
                      y: y + obj.cy * size + Math.sin(a) * ry });
        }
        return epts;
      }
      return PS.sampleCircle(x + obj.cx*size, y + obj.cy*size, Math.max(1, obj.r*size), spacing);
    }
    if (obj.type === "arc") {
      var sa = obj.startAngle !== undefined ? obj.startAngle : 0;
      var ea = obj.endAngle   !== undefined ? obj.endAngle   : Math.PI;
      return PS.sampleArc(x + obj.cx*size, y + obj.cy*size, Math.max(1, obj.r*size), sa, ea, spacing);
    }
    if (obj.type === "corner") {
      return PS.sampleCorner(x + obj.p0x*size, y + obj.p0y*size,
                             x + obj.p1x*size, y + obj.p1y*size,
                             x + obj.p2x*size, y + obj.p2y*size, spacing);
    }
    if (obj.type === "triangle") {
      var s1 = PS.sampleLine(x+obj.x1*size, y+obj.y1*size, x+obj.x2*size, y+obj.y2*size, spacing);
      var s2 = PS.sampleLine(x+obj.x2*size, y+obj.y2*size, x+obj.x3*size, y+obj.y3*size, spacing);
      var s3 = PS.sampleLine(x+obj.x3*size, y+obj.y3*size, x+obj.x1*size, y+obj.y1*size, spacing);
      return s1.concat(s2).concat(s3);
    }
    if (obj.type === "capsule") {
      return PS.sampleLine(x + obj.x1*size, y + obj.y1*size,
                           x + obj.x2*size, y + obj.y2*size, spacing);
    }
    return [];
  }

  // Draw procedural dots along the object's path.
  function _renderDottedObject(ctx, obj, x, y, size, sc) {
    var spacing = Math.max(1.5, (obj.patternSpacing || 0.10) * size);
    var dr      = Math.max(0.5, (obj.dotRadius    || 0.025) * size);
    var pts     = _sampleObjPath(obj, x, y, size, spacing);
    ctx.fillStyle = sc;
    for (var i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, dr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Render a single primitive glyph object (line, rect, circle, etc.)
  // All coordinates normalized 0..1, scaled by size to ctx coordinates.
  function renderGlyphObject(ctx, obj, x, y, size, palette) {
    if (!obj || !obj.type) return;
    var p  = _pal(palette);
    var sw = (typeof obj.strokeWidth === "number" ? obj.strokeWidth : 0.04) * size;
    var sc = obj.stroke || p.strokeColor;
    var fc = obj.fill   || null;
    var ls = obj.lineStyle || "solid";

    ctx.save();
    ctx.strokeStyle = sc;
    ctx.lineWidth   = Math.max(0.5, sw);
    ctx.lineCap     = obj.lineCap || "round";
    ctx.lineJoin    = "round";

    // Dashed: apply line dash pattern before path construction
    if (ls === "dashed") {
      var dl = (obj.dashLength || 0.15) * size;
      var gl = (obj.gapLength  || 0.08) * size;
      ctx.setLineDash([Math.max(1, dl), Math.max(1, gl)]);
    }

    // Dotted: procedural dots — bypass normal stroke path entirely
    if (ls === "dotted") {
      _renderDottedObject(ctx, obj, x, y, size, sc);
      ctx.restore();
      return;
    }

    if (obj.type === "line") {
      ctx.beginPath();
      ctx.moveTo(x + obj.x1 * size, y + obj.y1 * size);
      ctx.lineTo(x + obj.x2 * size, y + obj.y2 * size);
      ctx.stroke();

    } else if (obj.type === "rect") {
      var rx2 = x + obj.x * size, ry2 = y + obj.y * size;
      var rw2 = obj.w * size, rh2 = obj.h * size;
      var cr  = (obj.cornerRadius || 0) * size;
      ctx.beginPath();
      if (cr > 0 && ctx.roundRect) {
        ctx.roundRect(rx2, ry2, rw2, rh2, cr);
      } else if (cr > 0) {
        ctx.moveTo(rx2 + cr, ry2);
        ctx.lineTo(rx2 + rw2 - cr, ry2);
        ctx.arcTo(rx2 + rw2, ry2, rx2 + rw2, ry2 + cr, cr);
        ctx.lineTo(rx2 + rw2, ry2 + rh2 - cr);
        ctx.arcTo(rx2 + rw2, ry2 + rh2, rx2 + rw2 - cr, ry2 + rh2, cr);
        ctx.lineTo(rx2 + cr, ry2 + rh2);
        ctx.arcTo(rx2, ry2 + rh2, rx2, ry2 + rh2 - cr, cr);
        ctx.lineTo(rx2, ry2 + cr);
        ctx.arcTo(rx2, ry2, rx2 + cr, ry2, cr);
        ctx.closePath();
      } else {
        ctx.rect(rx2, ry2, rw2, rh2);
      }
      if (fc) { ctx.fillStyle = fc; ctx.fill(); }
      ctx.stroke();

    } else if (obj.type === "circle") {
      ctx.beginPath();
      if (obj.rx !== undefined && obj.ry !== undefined) {
        ctx.ellipse(x + obj.cx * size, y + obj.cy * size,
                    Math.max(0.5, obj.rx * size), Math.max(0.5, obj.ry * size),
                    0, 0, Math.PI * 2);
      } else {
        ctx.arc(x + obj.cx * size, y + obj.cy * size, Math.max(1, obj.r * size), 0, Math.PI * 2);
      }
      if (fc) { ctx.fillStyle = fc; ctx.fill(); }
      ctx.stroke();

    } else if (obj.type === "dot") {
      ctx.beginPath();
      ctx.arc(x + obj.cx * size, y + obj.cy * size, Math.max(1, obj.r * size), 0, Math.PI * 2);
      ctx.fillStyle = sc;
      ctx.fill();

    } else if (obj.type === "triangle") {
      ctx.beginPath();
      ctx.moveTo(x + obj.x1 * size, y + obj.y1 * size);
      ctx.lineTo(x + obj.x2 * size, y + obj.y2 * size);
      ctx.lineTo(x + obj.x3 * size, y + obj.y3 * size);
      ctx.closePath();
      if (fc) { ctx.fillStyle = fc; ctx.fill(); }
      ctx.stroke();

    } else if (obj.type === "arc") {
      ctx.beginPath();
      if (obj.mode === "corner") {
        var cax = x + obj.startX * size, cay = y + obj.startY * size;
        var cbx = x + obj.endX   * size, cby = y + obj.endY   * size;
        var cmx = (cax + cbx) / 2,       cmy = (cay + cby) / 2;
        ctx.moveTo(cax, cay);
        ctx.quadraticCurveTo(cmx, cmy, cbx, cby);
      } else {
        ctx.arc(
          x + obj.cx * size, y + obj.cy * size,
          Math.max(1, obj.r * size),
          obj.startAngle !== undefined ? obj.startAngle : 0,
          obj.endAngle   !== undefined ? obj.endAngle   : Math.PI
        );
      }
      ctx.stroke();

    } else if (obj.type === "capsule") {
      var capR = Math.max(0.5, (obj.radius || 0.05) * size);
      ctx.lineWidth = capR * 2;
      ctx.beginPath();
      ctx.moveTo(x + obj.x1 * size, y + obj.y1 * size);
      ctx.lineTo(x + obj.x2 * size, y + obj.y2 * size);
      ctx.stroke();

    } else if (obj.type === "corner") {
      var p0x = x + obj.p0x * size, p0y = y + obj.p0y * size;
      var p1x = x + obj.p1x * size, p1y = y + obj.p1y * size;
      var p2x = x + obj.p2x * size, p2y = y + obj.p2y * size;
      var cr3 = Math.max(1, (obj.radius || 0.08) * size);
      ctx.beginPath();
      ctx.moveTo(p0x, p0y);
      ctx.arcTo(p1x, p1y, p2x, p2y, cr3);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Render all primitive objects in an array.
  function renderGlyphObjects(ctx, objects, x, y, size, palette) {
    if (!objects || !objects.length) return;
    for (var i = 0; i < objects.length; i++) {
      renderGlyphObject(ctx, objects[i], x, y, size, palette);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  WOS.SymbolRenderer = {
    renderGlyph:         renderGlyph,
    renderSet:           renderSet,
    renderGlyphToCanvas: renderGlyphToCanvas,
    renderGlyphObject:   renderGlyphObject,
    renderGlyphObjects:  renderGlyphObjects,
  };

  console.log("[WOS SymbolRenderer] Loaded — v1.0.0");
})(window);
